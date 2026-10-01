import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Barrier, Evidence, Json, Message, Proposal, ProviderCall, ProviderDriver } from '../contracts/media-provider.js';
import { PreparationBlocked } from '../contracts/media-provider.js';

type Plan = Parameters<ProviderDriver['enqueue']>[0] & { rawUsage?: Record<string, Json> };

type Wire = Record<string, unknown>;
const object = (value: unknown): value is Wire => !!value && typeof value === 'object' && !Array.isArray(value);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function evidence(reference: string, raw: unknown): Evidence { return { reference, raw: JSON.parse(JSON.stringify(raw)) as Json }; }

/** Actual independently received Gemini REST bytes. This decoder does not use
 * expected test input or business imports. A changed envelope must be reviewed. */
export function decodeProviderWire(path: string, raw: unknown) {
  const matched = /^\/v1beta\/models\/(gemini-[A-Za-z0-9.-]+):generateContent$/.exec(path);
  if (!matched || !object(raw) || !Array.isArray(raw.contents) || raw.contents.length !== 1)
    throw new PreparationBlocked('Unreviewed Gemini endpoint/envelope');
  const content = raw.contents[0];
  if (!object(content) || content.role !== 'user' || !Array.isArray(content.parts) || content.parts.length !== 1 ||
      !object(content.parts[0]) || typeof content.parts[0].text !== 'string') throw new PreparationBlocked('Unreviewed Gemini content envelope');
  const payload: unknown = JSON.parse(content.parts[0].text);
  if (!object(payload)) throw new PreparationBlocked('Gemini payload is not an object');
  if (typeof payload.runId === 'string' && Array.isArray(payload.messages) && Array.isArray(payload.tools))
    return { purpose: 'turn' as const, model: matched[1]!, messages: payload.messages as Message[], payload };
  if (typeof payload.text === 'string' && typeof payload.groupId === 'string')
    return { purpose: 'audit' as const, model: matched[1]!, auditText: payload.text, payload };
  throw new PreparationBlocked('Unable to independently identify upstream purpose');
}
export function proposalWire(proposal: Proposal): unknown {
  if (proposal.kind === 'audit') return { verdict: proposal.verdict, reason: proposal.reason };
  return { decision: proposal.kind === 'text' ? { name: 'end_turn', text: proposal.text } : { name: proposal.name, input: proposal.input } };
}
function responseWire(plan: Plan): unknown {
  const usageMetadata = plan.rawUsage !== undefined ? plan.rawUsage : plan.actualUsage == null ? undefined : {
    ...(plan.actualUsage.inputTokens === undefined ? {} : { promptTokenCount: plan.actualUsage.inputTokens }),
    ...(plan.actualUsage.outputTokens === undefined ? {} : { candidatesTokenCount: plan.actualUsage.outputTokens }),
    ...(plan.actualUsage.totalTokens === undefined ? {} : { totalTokenCount: plan.actualUsage.totalTokens }),
  };
  const content = { parts: [{ text: JSON.stringify(proposalWire(plan.proposal ??
    (plan.purpose === 'audit' ? { kind: 'audit', verdict: 'pass', reason: 'QA synthetic neutral' } : { kind: 'text', text: 'QA synthetic response' }))) }] };
  const candidate = { finishReason: 'STOP', content };
  if (plan.fault === 'multiple-candidates') return { candidates: [candidate, candidate], usageMetadata };
  if (plan.fault === 'native-function-call') return { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'finish', args: {} } }] } }], usageMetadata };
  if (plan.fault === 'truncated') return { candidates: [{ ...candidate, finishReason: 'MAX_TOKENS' }], usageMetadata };
  if (plan.fault === 'safety-blocked') return { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata };
  return { candidates: [candidate], usageMetadata };
}
interface Ledger {
  call: ProviderCall; receivedAt: string; receivedMonoMs: number; method: string;
  requestBytes: number; responseStatus: number | null; responseBody: unknown;
  responseFinishedAt: string | null; connectionClosedAt: string | null; aborted: boolean;
}
interface Held { id: string; purpose: Plan['purpose']; expiresAt: number; callId?: string; released: boolean; release(): void; wait: Promise<void> }

/** No business/system process is started. HTTP listens on a random loopback
 * port. This source can only answer plans explicitly enqueued by a QA caller. */
export class ProviderWireStub {
  private server = createServer((req, res) => { const task = this.handle(req, res).catch((error: unknown) => {
    this.errors.push(error instanceof Error ? error.message : String(error)); if (!res.headersSent) res.writeHead(500); res.end();
  }); this.pending.add(task); void task.finally(() => this.pending.delete(task)); });
  private pending = new Set<Promise<void>>();
  private plans: Plan[] = [];
  private holds: Held[] = [];
  private records: Ledger[] = [];
  readonly errors: string[] = [];
  url = '';
  constructor(readonly diagnosticBudgetMs = 15_000) {}
  async start() {
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve(); }); });
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`; return this.url;
  }
  enqueue(plan: Plan) { if(plan.fault==='redirect'){const u=new URL(plan.redirectLocation??'');if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password)throw new Error('Redirect test target must be explicitly owned loopback');} this.plans.push(structuredClone(plan)); }
  calls(): ProviderCall[] { return structuredClone(this.records.map((r) => r.call)); }
  snapshot() { return structuredClone({ records: this.records, errors: this.errors, unconsumedPlans: this.plans.length, activeHolds: this.holds.filter((h) => !h.released).map(({ id, callId }) => ({ id, callId })) }); }
  holdNext(purpose: Plan['purpose']): Barrier {
    let resolve!: () => void;
    const item: Held = { id: randomUUID(), purpose, expiresAt: Date.now() + this.diagnosticBudgetMs, released: false,
      wait: new Promise<void>((r) => { resolve = r; }), release() { item.released = true; resolve(); } };
    this.holds.push(item);
    return { id: item.id, reached: async () => {
      while (!item.callId && Date.now() < item.expiresAt && !item.released) await sleep(5);
      if (!item.callId) throw new PreparationBlocked('No actual matching upstream HTTP request reached barrier');
      return evidence(`provider-wire:barrier:${item.id}`, { id: item.id, actualCallId: item.callId, record: this.records.find((r) => r.call.id === item.callId) });
    }, release: async () => { item.release(); } };
  }
  async close() {
    for (const hold of this.holds) hold.release();
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    await Promise.allSettled([...this.pending]);
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(Buffer.from(chunk)); }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    let raw: unknown; try { raw = JSON.parse(rawBody); } catch { res.writeHead(400); res.end(); return; }
    const decoded = decodeProviderWire(req.url ?? '', raw);
    const planIndex = this.plans.findIndex((p) => p.purpose === decoded.purpose);
    const planned = planIndex >= 0;
    const plan: Plan = planned ? this.plans.splice(planIndex, 1)[0]! : { purpose: decoded.purpose };
    const id = randomUUID();
    const entry: Ledger = { call: { id, purpose: decoded.purpose, model: decoded.model,
      ...('messages' in decoded ? { messages: decoded.messages } : { auditText: decoded.auditText }),
      actualUsage: plan.actualUsage ?? null, rawWire: raw as Json,
      evidence: evidence(`provider-wire:request:${id}`, { method: req.method, path: req.url, rawBody, requestBytes: size, receivedAt: new Date().toISOString(), offlineAuthHeaderPresent: typeof req.headers['x-goog-api-key'] === 'string', offlineAuthMatched: req.headers['x-goog-api-key'] === 'qa-offline-synthetic-key', authValueRetained: false }) },
      receivedAt: new Date().toISOString(), receivedMonoMs: performance.now(), method: req.method, requestBytes: size,
      responseStatus: null, responseBody: null, responseFinishedAt: null, connectionClosedAt: null, aborted: false };
    this.records.push(entry);
    let closed!: () => void; const closedPromise = new Promise<void>((resolve) => { closed = resolve; });
    res.once('finish', () => { entry.responseFinishedAt = new Date().toISOString(); });
    res.once('close', () => { entry.connectionClosedAt = new Date().toISOString(); entry.aborted = !entry.responseFinishedAt; closed(); });
    if (!planned) { this.errors.push(`Unplanned ${decoded.purpose} HTTP call`); entry.responseStatus = 503; entry.responseBody = 'QA_UNPLANNED_UPSTREAM'; res.writeHead(503); res.end('QA_UNPLANNED_UPSTREAM'); return; }
    const hold = this.holds.find((h) => h.purpose === decoded.purpose && !h.callId && !h.released);
    if (hold) {
      hold.callId = id;
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([hold.wait, closedPromise, new Promise<void>((resolve) => { timer = setTimeout(() => { this.errors.push(`Barrier ${hold.id} expired`); hold.release(); resolve(); }, Math.max(1, hold.expiresAt - Date.now())); })]);
      if (timer) clearTimeout(timer);
    }
    if (res.destroyed) return;
    if (plan.fault === 'timeout') {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([closedPromise, new Promise<void>((resolve) => { timer = setTimeout(() => { res.destroy(); resolve(); }, this.diagnosticBudgetMs); })]);
      if (timer) clearTimeout(timer); return;
    }
    if (plan.delayResponseMs) { let timer: NodeJS.Timeout | undefined; await Promise.race([closedPromise, new Promise<void>((resolve) => { timer = setTimeout(resolve, plan.delayResponseMs); })]); if (timer) clearTimeout(timer); }
    if (res.destroyed) return;
    if (plan.fault === 'network-error') { res.destroy(); return; }
    if (plan.fault === 'redirect'){entry.responseStatus=302;entry.responseBody='QA_REDIRECT';res.writeHead(302,{location:plan.redirectLocation!});res.end('QA_REDIRECT');return;}
    const status = plan.fault === 'http-401' ? 401 : plan.fault === 'http-429' ? 429 : String(plan.fault) === 'http-500' ? 500 : 200;
    const body = plan.fault === 'bad-json' ? '{bad-json' : JSON.stringify(responseWire(plan));
    entry.responseStatus = status; entry.responseBody = body;
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }); res.end(body);
  }
}
