import WebSocket from 'ws';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { BlockedError } from './security.js';
import { observe } from './observation.js';

export interface ReceivedFrame {
  type: string;
  seq?: number;
  success?: boolean;
  msgId?: string;
  clientMsgId?: string;
  textSha256?: string;
  groupId?: string;
  isOwn?: boolean;
  inconsistency?: { kind: unknown; ref: unknown; message: unknown };
}

/** Partial observations may be incomplete, but already received violations fail immediately. */
export function assertReceiptSubset(
  frames: readonly ReceivedFrame[],
  expected: ReadonlySet<string>,
  ancillary: ReadonlySet<string> = new Set(),
): ReceivedFrame[] {
  let prior = 0;
  const ids = new Set<string>();
  const selected: ReceivedFrame[] = [];
  for (const frame of frames) {
    if (frame.type === 'message')
      assert.ok(Number.isSafeInteger(frame.seq), 'Message event lacks its required seq');
    if (frame.seq !== undefined) {
      assert.ok(
        Number.isSafeInteger(frame.seq) && frame.seq > prior,
        'Received event seq is not strictly increasing',
      );
      prior = frame.seq;
    }
    if (frame.type !== 'message') continue;
    assert.ok(
      typeof frame.msgId === 'string' && (expected.has(frame.msgId) || ancillary.has(frame.msgId)),
      'Received an unexpected message identity',
    );
    assert.ok(!ids.has(frame.msgId), 'Received duplicate message identity');
    ids.add(frame.msgId);
    if (expected.has(frame.msgId)) selected.push(frame);
  }
  return selected;
}

export function assertCompleteReceipts(
  frames: readonly ReceivedFrame[],
  expected: ReadonlySet<string>,
): void {
  const received = assertReceiptSubset(frames, expected);
  assert.deepEqual(
    new Set(received.map((frame) => frame.msgId!)),
    expected,
    'Received history has missing message identities',
  );
}

/** Evidence I/O must never prevent closing every owned reader or hide the primary failure. */
export async function finalizeReceipts(
  evidence: () => Promise<void>,
  clients: readonly { close(): Promise<void> }[],
  primaryFailed: boolean,
): Promise<unknown[]> {
  const errors: unknown[] = [];
  try {
    await evidence();
  } catch (error) {
    errors.push(error);
  }
  const closed = await Promise.allSettled(clients.map((client) => client.close()));
  for (const result of closed) if (result.status === 'rejected') errors.push(result.reason);
  if (errors.length && !primaryFailed)
    throw new AggregateError(errors, 'Receipt evidence/owned cleanup did not complete');
  return errors;
}

/** Only complete frames received by this QA client can advance its cursor.
 * pause()/resume() operate on the real ws/TCP reader, never the SUT sender. */
export class ReceiptSocket {
  private readonly ws: WebSocket;
  readonly frames: ReceivedFrame[] = [];
  readonly errors: string[] = [];
  readonly protocolErrors: string[] = [];
  closed?: { code: number; at: string };
  private opening: Promise<void>;
  private receivedSeq = 0;
  constructor(baseUrl: string) {
    const base = new URL(baseUrl);
    if (
      base.protocol !== 'http:' ||
      base.hostname !== '127.0.0.1' ||
      !base.port ||
      base.username ||
      base.password
    )
      throw new Error('ReceiptSocket requires an explicit QA loopback origin');
    const url = new URL('/ws', base);
    url.protocol = 'ws:';
    this.ws = new WebSocket(url, { handshakeTimeout: 5000 });
    this.opening = new Promise<void>((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('error', (e) => this.errors.push(e.message));
    this.ws.on('close', (code) => {
      this.closed = { code, at: new Date().toISOString() };
    });
    this.ws.on('message', (raw) => {
      try {
        const value = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (!value || typeof value !== 'object' || typeof value.type !== 'string')
          throw new Error('Malformed WS frame');
        if (value.seq !== undefined && (!Number.isSafeInteger(value.seq) || Number(value.seq) < 1))
          throw new Error('Malformed WS sequence');
        if (value.type === 'message' && value.seq === undefined)
          throw new Error('Message event lacks required seq');
        if (typeof value.seq === 'number' && value.seq <= this.receivedSeq)
          throw new Error('Received event seq is not strictly increasing');
        if (this.frames.length >= 8192) throw new BlockedError('QA receipt ledger limit exceeded');
        const payload = value.payload as Record<string, unknown> | undefined;
        this.frames.push({
          type: value.type,
          ...(typeof value.seq === 'number' ? { seq: value.seq } : {}),
          ...(typeof value.success === 'boolean' ? { success: value.success } : {}),
          ...(typeof payload?.msgId === 'string' ? { msgId: payload.msgId } : {}),
          ...(typeof payload?.clientMsgId === 'string' ? { clientMsgId: payload.clientMsgId } : {}),
          ...(typeof payload?.groupId === 'string' ? { groupId: payload.groupId } : {}),
          ...(typeof payload?.isOwn === 'boolean' ? { isOwn: payload.isOwn } : {}),
          ...(value.type === 'inconsistency'
            ? {
                inconsistency: {
                  kind: payload?.kind,
                  ref: payload?.ref,
                  message: payload?.message,
                },
              }
            : {}),
          ...(typeof payload?.text === 'string'
            ? { textSha256: createHash('sha256').update(payload.text).digest('hex') }
            : {}),
        });
        if (typeof value.seq === 'number') this.receivedSeq = value.seq;
      } catch (e) {
        this.errors.push(String(e));
        this.protocolErrors.push(String(e));
        this.ws.terminate();
      }
    });
  }
  async authenticate(accessToken: string, sinceSeq?: number): Promise<void> {
    await this.opening;
    this.ws.send(
      JSON.stringify({
        type: 'auth',
        accessToken,
        ...(sinceSeq === undefined ? {} : { sinceSeq }),
      }),
    );
    const auth = await observe({
      read: async () => this.frames,
      invariant: () => this.assertHealthy(),
      complete: (frames) => frames.some((f) => f.type === 'auth' && f.success === true),
      durationMs: 5000,
    });
    if (!auth.complete) throw new BlockedError('WS auth not observed within QA observation budget');
  }
  get lastReceivedSeq(): number {
    return this.receivedSeq;
  }
  pause(): number {
    this.ws.pause();
    if (!this.ws.isPaused) throw new Error('Real WS reader was not paused');
    return this.lastReceivedSeq;
  }
  get paused(): boolean {
    return this.ws.isPaused;
  }
  resume(): void {
    this.ws.resume();
  }
  assertNoErrors(): void {
    const failures = this.errors.filter(
      (error) => !error.includes('QA receipt ledger limit exceeded'),
    );
    if (failures.length) throw new Error(`QA WS receipt errors: ${failures.join('; ')}`);
    if (this.errors.length)
      throw new BlockedError('QA receipt ledger budget exhausted; cannot infer peer closure');
  }
  /** Transport loss is allowed during an injected outage; malformed received frames are not. */
  assertValidFrames(): void {
    if (this.protocolErrors.some((error) => !error.includes('QA receipt ledger limit exceeded')))
      throw new Error(`Invalid received WS frames: ${this.protocolErrors.join('; ')}`);
    if (this.protocolErrors.length) throw new BlockedError('QA receipt ledger budget exhausted');
  }
  assertHealthy(): void {
    this.assertNoErrors();
    if (this.closed)
      throw new Error(`Healthy consumer unexpectedly closed with code ${this.closed.code}`);
  }
  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new BlockedError('Owned WS cleanup was not confirmed within its bounded wait')),
        5000,
      );
      this.ws.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.ws.terminate();
    await closed;
  }
}
