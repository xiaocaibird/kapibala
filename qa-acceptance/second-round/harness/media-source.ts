import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { PreparationBlocked } from '../contracts/media-provider.js';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { Barrier, Evidence, Json, MediaFault, SourceRequest } from '../contracts/media-provider.js';

interface Source { bytes: Buffer; fault: MediaFault; seen: number }
interface RequestLedger extends SourceRequest { openedAt: string; finishedAt: string | null; closedAt: string | null; bytesWritten: number }
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
/** Owned gateway front proxy. Only /media/:id is supplied by QA; all remaining
 * gateway bytes/events stream unchanged to the original independent gateway.
 * Its ledger proves source requests, not absence of arbitrary process egress. */
export class MediaSourceProxy {
  private server = createServer((req, res) => { const task = this.handle(req, res).catch((error: unknown) => {
    this.errors.push(String(error)); if (!res.headersSent) res.writeHead(500); res.end();
  }); this.pending.add(task); void task.finally(() => this.pending.delete(task)); });
  private pending = new Set<Promise<void>>();
  private sources = new Map<string, Source>();
  private records: RequestLedger[] = [];
  private holds = new Map<string, { id: string; reached?: RequestLedger; released: boolean; wait: Promise<void>; release(): void }>();
  private downstreams = new Set<ReturnType<typeof httpRequest>>();
  readonly errors: string[] = [];
  url = '';
  constructor(readonly gatewayUrl: string, readonly maximumFileBytes = 20 * 1024 * 1024) {
    const target = new URL(gatewayUrl);
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password || target.pathname !== '/') throw new Error('Media gateway proxy requires exact owned HTTP loopback origin');
  }
  async start() {
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve(); }); });
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`; return this.url;
  }
  source(input: { id: string; bytes: Uint8Array; fault?: MediaFault }) {
    if (!this.url || !/^[A-Za-z0-9_-]+$/.test(input.id) || this.sources.has(input.id)) throw new Error('Source needs started proxy and unique safe ID');
    this.sources.set(input.id, { bytes: Buffer.from(input.bytes), fault: input.fault ?? 'none', seen: 0 });
    const url = `${this.url}/media/${input.id}`;
    return { url, evidence: proof(`media-source:${input.id}`, { url, bytes: input.bytes.length, fault: input.fault ?? 'none' }) };
  }
  setFault(url: string, fault: MediaFault) {
    const u = new URL(url); if (u.origin !== this.url || !/^\/media\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new Error('Foreign media source');
    const source = this.sources.get(u.pathname.slice('/media/'.length)); if (!source) throw new Error('Unknown media source');
    source.fault = fault; source.seen = 0;
  }
  holdPartial(sourceId: string, diagnosticMs = 20_000): Barrier {
    if (!this.sources.has(sourceId) || this.holds.has(sourceId)) throw new Error('Media partial hold requires unique existing source');
    let done!: () => void;
    const lease = { id: randomUUID(), reached: undefined as RequestLedger | undefined, released: false, wait: new Promise<void>((resolve) => { done = resolve; }), release() { lease.released = true; done(); } };
    this.holds.set(sourceId, lease);
    const timer = setTimeout(() => lease.release(), diagnosticMs); timer.unref();
    return { id: lease.id, reached: async () => {
      const deadline = performance.now() + diagnosticMs;
      while (!lease.reached && !lease.released && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      if (!lease.reached) throw new PreparationBlocked('No actual partial source response');
      return proof(`media-source:partial:${lease.id}`, lease.reached);
    }, release: async () => { clearTimeout(timer); lease.release(); this.holds.delete(sourceId); } };
  }
  requests(): SourceRequest[] { return structuredClone(this.records); }
  snapshot() { return structuredClone({ records: this.records, errors: this.errors }); }
  async close() {
    for (const hold of this.holds.values()) hold.release();
    for (const req of this.downstreams) req.destroy(); this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    await Promise.allSettled([...this.pending]);
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    if (!req.url?.startsWith('/media/')) { this.forward(req, res); return; }
    const match = /^\/media\/([A-Za-z0-9_-]+)$/.exec(req.url); const source = match ? this.sources.get(match[1]!) : undefined;
    const id = randomUUID(); const record: RequestLedger = { id, url: `${this.url}${req.url}`, method: req.method ?? '', openedAt: new Date().toISOString(), finishedAt: null, closedAt: null,
      bytesWritten: 0, evidence: proof(`media-source:request:${id}`, { method: req.method, path: req.url }) };
    this.records.push(record);
    res.once('finish', () => { record.finishedAt = new Date().toISOString(); });
    res.once('close', () => { record.closedAt = new Date().toISOString(); });
    const send = (status: number, body: Buffer | string = '') => {
      record.responseStatus = status; record.responseBytes = Buffer.byteLength(body); record.bytesWritten = Buffer.byteLength(body);
      res.writeHead(status, { 'content-length': Buffer.byteLength(body) }); res.end(body);
    };
    if (!source) { send(404); return; }
    if (req.method !== 'GET') { send(405); return; }
    const first = source.seen++ === 0;
    if (source.fault === '404') { send(404); return; }
    if (first && ['503-once', '408-once', '429-once'].includes(source.fault)) { send(Number(source.fault.slice(0, 3))); return; }
    if (first && source.fault === 'disconnect-once') { res.destroy(); return; }
    if (source.fault === 'redirect-foreign') { record.responseStatus = 302; res.writeHead(302, { location: 'https://qa-foreign.invalid/media/redirected' }); res.end(); return; }
    if (source.fault === 'declared-oversize') { record.responseStatus = 200; res.writeHead(200, { 'content-length': this.maximumFileBytes + 1 }); res.end(Buffer.alloc(1)); record.bytesWritten = 1; return; }
    if (source.fault === 'stream-oversize') {
      record.responseStatus = 200; res.writeHead(200, { 'content-type': 'application/octet-stream' });
      const chunk = Buffer.alloc(64 * 1024, 0x51); let remaining = this.maximumFileBytes + 1;
      while (remaining && !res.destroyed) {
        const take = Math.min(remaining, chunk.length); const writable = res.write(chunk.subarray(0, take)); record.bytesWritten += take; remaining -= take;
        if (!writable) await new Promise<void>((resolve) => { const done = () => { res.off('drain', done); res.off('close', done); resolve(); }; res.once('drain', done); res.once('close', done); });
      }
      record.responseBytes = record.bytesWritten; res.end(); return;
    }
    const hold = match ? this.holds.get(match[1]!) : undefined;
    if (hold && !hold.released && !hold.reached) {
      const count = Math.max(1, Math.floor(source.bytes.length / 2));
      record.responseStatus = 200; res.writeHead(200, { 'content-length': source.bytes.length });
      res.write(source.bytes.subarray(0, count)); record.bytesWritten = count; hold.reached = record;
      let onClose!: () => void; const closed = new Promise<void>((resolve) => { onClose = resolve; res.once('close', onClose); });
      await Promise.race([hold.wait, closed]); res.off('close', onClose);
      if (res.destroyed) return;
      res.end(source.bytes.subarray(count)); record.bytesWritten = source.bytes.length; record.responseBytes = source.bytes.length; return;
    }
    send(200, source.bytes);
  }
  private forward(req: IncomingMessage, res: ServerResponse) {
    const target = new URL(req.url ?? '/', this.gatewayUrl);
    if (target.origin !== new URL(this.gatewayUrl).origin) { res.writeHead(400); res.end(); return; }
    const upstream = httpRequest(target, { method: req.method, headers: { ...req.headers, host: new URL(this.gatewayUrl).host } }, (incoming) => {
      res.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(res);
      res.once('close', () => incoming.destroy());
    });
    this.downstreams.add(upstream); upstream.once('close', () => this.downstreams.delete(upstream));
    upstream.once('error', (error) => { if (!res.destroyed) { if (!res.headersSent) res.writeHead(502); res.end(); } if (!req.destroyed) this.errors.push(`Gateway proxy: ${(error as NodeJS.ErrnoException).code ?? error.name}`); });
    res.once('close', () => upstream.destroy()); req.pipe(upstream);
  }
}
