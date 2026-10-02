import { createServer, request, type ClientRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { PreparationBlocked, type AgentResponseHold, type Evidence, type Json } from '../contracts/media-provider.js';

interface RelayRecord {
  id: string; method: string; path: string; upstream: string; at: string; receivedMonoMs: number; clockDomain: string;
  requestBody?: string; status?: number; closedAt?: string; closedMonoMs?: number;
  upstreamCompletedAt?: string; upstreamCompletedMonoMs?: number;
  heldResponse?: { status: number; headers: IncomingMessage['headers']; bodyBase64: string; bytes: number; sha256: string };
  releaseAt?: string; releaseMonoMs?: number; holdExpired?: boolean;
  releaseOutcome?: 'forwarded-original-response' | 'downstream-already-closed';
  responseFinishedAt?: string; responseFinishedMonoMs?: number; error?: string;
}
interface HeldResponse {
  id: string; path: string; expiresAt: number; record?: RelayRecord; released: boolean; expired: boolean;
  wait: Promise<void>; release(): void; timer: NodeJS.Timeout;
}
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });

/** Stable QA-owned address across a real service restart. A selected response
 * may be held only after all real upstream bytes arrive. No response rewriting,
 * status substitution, upstream retry or fabricated product time is allowed. */
export class ServiceRelay {
  private upstream = '';
  private pending = new Set<ClientRequest>();
  private tasks = new Set<Promise<void>>();
  private holds: HeldResponse[] = [];
  readonly errors: string[] = [];
  readonly ledger: RelayRecord[] = [];
  private server = createServer((req, res) => {
    const task = this.handle(req, res).catch(error => {
      this.errors.push(String(error)); res.destroy();
    });
    this.tasks.add(task); void task.finally(() => this.tasks.delete(task));
  });
  url = '';
  constructor(readonly holdBudgetMs = 30_000) {}
  pointTo(value: string) {
    const u = new URL(value);
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.pathname !== '/' || u.search || u.hash || u.username || u.password)
      throw new Error('Relay requires owned loopback origin');
    this.upstream = u.origin;
  }
  async start(value: string) {
    this.pointTo(value);
    await new Promise<void>((ok, bad) => { this.server.once('error', bad); this.server.listen(0, '127.0.0.1', ok); });
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  holdNextResponse(path: '/agent/turn' | '/agent/audit'): AgentResponseHold {
    let release!: () => void;
    const hold = { id: randomUUID(), path, expiresAt: Date.now() + this.holdBudgetMs, released: false, expired: false,
      wait: new Promise<void>(ok => { release = ok; }) } as HeldResponse;
    hold.release = () => { if (hold.released) return; hold.released = true; clearTimeout(hold.timer); release(); };
    const expire = () => { hold.expired = true; if (hold.record) hold.record.holdExpired = true; hold.release(); };
    hold.timer = setTimeout(expire, this.holdBudgetMs);
    this.holds.push(hold);
    const facts = () => proof(`agent-relay:response-hold:${hold.id}`, {
      holdId: hold.id, expiresAt: hold.expiresAt, expired: hold.expired, released: hold.released, record: hold.record ?? null, errors: this.errors,
    });
    return { id: hold.id, reached: async () => {
      while (!hold.record?.heldResponse && !hold.released && Date.now() < hold.expiresAt)
        await new Promise(ok => setTimeout(ok, 5));
      if (!hold.released && Date.now() >= hold.expiresAt) expire();
      if (!hold.record?.heldResponse || hold.expired) throw new PreparationBlocked('No complete actual Agent response reached the owned relay hold');
      return facts();
    }, facts: async () => facts(), release: async () => {
      hold.release();
      // Drain this selected forwarding task. This finite guard is not an
      // extension to the product's original timeout.
      const until = performance.now() + 2000;
      while (hold.record?.heldResponse && !hold.record.releaseOutcome && performance.now() < until)
        await new Promise(ok => setTimeout(ok, 5));
      if (hold.record?.heldResponse && !hold.record.releaseOutcome) throw new PreparationBlocked('Actual delayed response release did not settle');
    } };
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const target = new URL(req.url ?? '/', this.upstream);
    if (target.origin !== this.upstream) { res.writeHead(400); res.end(); return; }
    const entry: RelayRecord = { id: randomUUID(), method: req.method ?? '', path: req.url ?? '', upstream: this.upstream,
      at: new Date().toISOString(), receivedMonoMs: performance.now(), clockDomain: `qa-relay-performance:${process.pid}` };
    this.ledger.push(entry);
    const hold = this.holds.find(item => item.path === entry.path && !item.record && !item.released);
    if (hold) hold.record = entry;
    const requestChunks: Buffer[] = [];
    req.on('data', chunk => requestChunks.push(Buffer.from(chunk)));
    req.once('end', () => { entry.requestBody = Buffer.concat(requestChunks).toString('utf8'); });
    const outgoing = request(target, { method: req.method, headers: { ...req.headers, host: target.host } });
    this.pending.add(outgoing); outgoing.once('close', () => this.pending.delete(outgoing));
    res.once('finish', () => { entry.responseFinishedAt = new Date().toISOString(); entry.responseFinishedMonoMs = performance.now(); });
    res.once('close', () => { entry.closedAt = new Date().toISOString(); entry.closedMonoMs = performance.now(); outgoing.destroy(); });
    const response = new Promise<IncomingMessage>((ok, bad) => { outgoing.once('response', ok); outgoing.once('error', bad); });
    req.pipe(outgoing);
    let incoming: IncomingMessage;
    try { incoming = await response; }
    catch (error) { entry.error = String(error); if (!res.destroyed) { if (!res.headersSent) res.writeHead(502); res.end(); } return; }
    entry.status = incoming.statusCode;
    res.once('close', () => incoming.destroy());
    if (!hold) {
      incoming.once('error', error => { entry.error = String(error); res.destroy(); });
      res.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(res); return;
    }
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of incoming) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) throw new PreparationBlocked('Actual Agent response exceeds finite QA relay buffer');
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      entry.upstreamCompletedAt = new Date().toISOString(); entry.upstreamCompletedMonoMs = performance.now();
      entry.heldResponse = { status: incoming.statusCode ?? 502, headers: { ...incoming.headers }, bodyBase64: body.toString('base64'), bytes,
        sha256: createHash('sha256').update(body).digest('hex') };
      await hold.wait;
      entry.releaseAt = new Date().toISOString(); entry.releaseMonoMs = performance.now(); entry.holdExpired = hold.expired;
      if (res.destroyed) { entry.releaseOutcome = 'downstream-already-closed'; return; }
      res.writeHead(entry.heldResponse.status, entry.heldResponse.headers); res.end(body);
      entry.releaseOutcome = 'forwarded-original-response';
    } catch (error) { entry.error = String(error); throw error; }
  }
  async close() {
    for (const hold of this.holds) hold.release();
    for (const request of this.pending) request.destroy();
    this.server.closeAllConnections();
    await new Promise<void>((ok, bad) => this.server.close(error => error ? bad(error) : ok()));
    await Promise.allSettled([...this.tasks]);
  }
}
