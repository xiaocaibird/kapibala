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
  /** Bytes of the complete WS application message, excluding TCP/WS headers. */
  payloadBytes?: number;
  receivedAt?: string;
  receivedMonotonicMs?: number;
  readerPaused?: boolean;
  readyStateAtReceipt?: 'connecting' | 'open' | 'closing' | 'closed';
}

export interface ReceiptLimits {
  maxFrames: number;
  maxPayloadBytes: number;
  maxFramePayloadBytes: number;
}
export const defaultReceiptLimits: Readonly<ReceiptLimits> = Object.freeze({
  maxFrames: 8192,
  maxPayloadBytes: 64 * 1024 * 1024,
  maxFramePayloadBytes: 16 * 1024 * 1024,
});
export interface ReceiptTransportEvent {
  kind: 'open' | 'auth-sent' | 'pause' | 'resume' | 'local-terminate' | 'close' | 'error';
  at: string;
  monotonicMs: number;
  lastReceivedSeq: number;
  receivedFrames: number;
  payloadBytes: number;
  detail?: unknown;
}
export interface PeerClosePolicy {
  /** Published engineering evidence identifying this exact close signature. */
  contractReference: string;
  code: number;
  reason: string;
}

export function matchesPeerClosePolicy(
  client: ReceiptSocket,
  policy: PeerClosePolicy | null,
): boolean {
  return !!(
    policy?.contractReference.trim() &&
    policy.reason.trim() &&
    client.closed?.source === 'peer-close-frame' &&
    client.closed.code === policy.code &&
    client.closed.reason === policy.reason &&
    client.errors.length === 0 &&
    client.protocolErrors.length === 0 &&
    client.resourceErrors.length === 0
  );
}

/** Injection completion and consumer completion are separate observations.
 * Expiring this QA budget stops injection; it never discards an emitted identity
 * or bypasses an invariant, including the final sample at the boundary. */
export async function injectBoundedReceiptWorkload(options: {
  maxMessages: number;
  batchSize: number;
  batchIntervalMs: number;
  durationMs: number;
  inject: (index: number) => void;
  invariant: () => void;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}): Promise<{ injected: number; elapsedMs: number; stop: 'message-limit' | 'time-limit' }> {
  for (const value of [
    options.maxMessages,
    options.batchSize,
    options.batchIntervalMs,
    options.durationMs,
  ])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('Invalid bounded injection profile');
  const now = options.now ?? (() => performance.now());
  const wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const start = now();
  let injected = 0;
  while (injected < options.maxMessages && now() - start < options.durationMs) {
    options.invariant();
    const batchEnd = Math.min(injected + options.batchSize, options.maxMessages);
    while (injected < batchEnd && now() - start < options.durationMs) options.inject(injected++);
    options.invariant();
    if (injected < options.maxMessages && now() - start < options.durationMs)
      await wait(Math.min(options.batchIntervalMs, options.durationMs - (now() - start)));
  }
  options.invariant();
  return {
    injected,
    elapsedMs: now() - start,
    stop: injected === options.maxMessages ? 'message-limit' : 'time-limit',
  };
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
  afterCleanup?: () => Promise<void>,
): Promise<unknown[]> {
  const errors: unknown[] = [];
  try {
    await evidence();
  } catch (error) {
    errors.push(error);
  }
  const closed = await Promise.allSettled(clients.map((client) => client.close()));
  for (const result of closed) if (result.status === 'rejected') errors.push(result.reason);
  try {
    await afterCleanup?.();
  } catch (error) {
    errors.push(error);
  }
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
  readonly transport: ReceiptTransportEvent[] = [];
  readonly resourceErrors: string[] = [];
  readonly limits: Readonly<ReceiptLimits>;
  readonly totals = { messages: 0, payloadBytes: 0, largestPayloadBytes: 0 };
  closed?: {
    code: number;
    reason: string;
    at: string;
    monotonicMs: number;
    source: 'local-termination' | 'peer-close-frame' | 'transport-ended';
    localTermination?: string;
  };
  private opening: Promise<void>;
  private receivedSeq = 0;
  private localTermination?: string;
  /** At most one parsed over-budget message, retained for violation-first checks. */
  private overBudgetFrame?: ReceivedFrame;
  constructor(baseUrl: string, limits: ReceiptLimits = defaultReceiptLimits) {
    const base = new URL(baseUrl);
    if (
      base.protocol !== 'http:' ||
      base.hostname !== '127.0.0.1' ||
      !base.port ||
      base.username ||
      base.password
    )
      throw new Error('ReceiptSocket requires an explicit QA loopback origin');
    for (const value of [limits.maxFrames, limits.maxPayloadBytes, limits.maxFramePayloadBytes])
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid QA receipt limits');
    if (limits.maxFramePayloadBytes > limits.maxPayloadBytes)
      throw new Error('QA frame payload limit exceeds total payload limit');
    this.limits = Object.freeze({ ...limits });
    const url = new URL('/ws', base);
    url.protocol = 'ws:';
    this.ws = new WebSocket(url, {
      handshakeTimeout: 5000,
      maxPayload: this.limits.maxFramePayloadBytes,
    });
    this.opening = new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => {
        this.record('open');
        resolve();
      });
      this.ws.once('error', reject);
    });
    this.ws.on('error', (e: Error & { code?: string }) => {
      this.record('error', { message: e.message, code: e.code });
      if (e.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
        this.resourceErrors.push('QA receipt frame payload limit exceeded');
        this.terminate('qa-resource-limit');
      } else {
        this.errors.push(e.message);
        if (e.code?.startsWith('WS_ERR_')) {
          this.protocolErrors.push(`${e.code}: ${e.message}`);
          this.terminate('protocol-rejection');
        }
      }
    });
    this.ws.on('close', (code, reason) => {
      this.closed = {
        code,
        reason: reason.toString(),
        at: new Date().toISOString(),
        monotonicMs: performance.now(),
        source: this.localTermination
          ? 'local-termination'
          : code === 1006
            ? 'transport-ended'
            : 'peer-close-frame',
        ...(this.localTermination ? { localTermination: this.localTermination } : {}),
      };
      this.record('close', this.closed);
    });
    this.ws.on('message', (raw) => {
      const bytes = Array.isArray(raw)
        ? Buffer.concat(raw)
        : raw instanceof ArrayBuffer
          ? Buffer.from(raw)
          : raw;
      const receivedAt = new Date().toISOString();
      const receivedMonotonicMs = performance.now();
      this.totals.messages++;
      this.totals.payloadBytes += bytes.length;
      this.totals.largestPayloadBytes = Math.max(this.totals.largestPayloadBytes, bytes.length);
      try {
        const value = JSON.parse(bytes.toString()) as Record<string, unknown>;
        if (!value || typeof value !== 'object' || typeof value.type !== 'string')
          throw new Error('Malformed WS frame');
        if (value.seq !== undefined && (!Number.isSafeInteger(value.seq) || Number(value.seq) < 1))
          throw new Error('Malformed WS sequence');
        if (value.type === 'message' && value.seq === undefined)
          throw new Error('Message event lacks required seq');
        if (typeof value.seq === 'number' && value.seq <= this.receivedSeq)
          throw new Error('Received event seq is not strictly increasing');
        const payload = value.payload as Record<string, unknown> | undefined;
        const frame: ReceivedFrame = {
          type: value.type,
          payloadBytes: bytes.length,
          receivedAt,
          receivedMonotonicMs,
          readerPaused: this.ws.isPaused,
          readyStateAtReceipt: (['connecting', 'open', 'closing', 'closed'] as const)[
            this.ws.readyState
          ],
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
        };
        if (
          this.frames.length >= this.limits.maxFrames ||
          this.totals.payloadBytes > this.limits.maxPayloadBytes
        ) {
          this.overBudgetFrame ??= frame;
          throw new BlockedError('QA receipt ledger limit exceeded');
        }
        this.frames.push(frame);
        if (typeof value.seq === 'number') this.receivedSeq = value.seq;
      } catch (e) {
        if (e instanceof BlockedError) {
          this.resourceErrors.push(String(e));
          this.terminate('qa-resource-limit');
        } else {
          this.errors.push(String(e));
          this.protocolErrors.push(String(e));
          this.terminate('protocol-rejection');
        }
      }
    });
  }
  private record(kind: ReceiptTransportEvent['kind'], detail?: unknown): void {
    this.transport.push({
      kind,
      at: new Date().toISOString(),
      monotonicMs: performance.now(),
      lastReceivedSeq: this.receivedSeq,
      receivedFrames: this.frames.length,
      payloadBytes: this.totals.payloadBytes,
      ...(detail === undefined ? {} : { detail }),
    });
  }
  private terminate(reason: string): void {
    if (!this.localTermination) {
      this.localTermination = reason;
      this.record('local-terminate', { reason });
    }
    this.ws.terminate();
  }
  snapshot() {
    return {
      frames: this.frames,
      closed: this.closed,
      errors: this.errors,
      overBudgetFrame: this.overBudgetFrame,
      protocolErrors: this.protocolErrors,
      resourceErrors: this.resourceErrors,
      transport: this.transport,
      totals: this.totals,
      limits: this.limits,
      lastReceivedSeq: this.lastReceivedSeq,
      paused: this.paused,
      closureCause:
        'No server policy cause inferred from the close code or paused-reader experiment',
    };
  }
  async authenticate(accessToken: string, sinceSeq?: number): Promise<void> {
    await this.opening;
    this.record('auth-sent', { sinceSeq }); // Never record credentials.
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
  get observedFrames(): readonly ReceivedFrame[] {
    return this.overBudgetFrame ? [...this.frames, this.overBudgetFrame] : this.frames;
  }
  assertPausedWindow(checkpoint: number, initialFrameCount: number): void {
    const pauseIndex = this.transport.findLastIndex((entry) => entry.kind === 'pause');
    const pause = this.transport[pauseIndex];
    if (
      !pause ||
      pause.lastReceivedSeq !== checkpoint ||
      pause.receivedFrames !== initialFrameCount ||
      this.transport.slice(pauseIndex + 1).some((entry) => entry.kind === 'resume')
    )
      throw new BlockedError('QA pause checkpoint/unchanged read control was not established');
    if (this.ws.readyState === WebSocket.OPEN && !this.ws.isPaused)
      throw new BlockedError('QA reader no longer paused in the intended observation window');
    // ws 8.22 drains readable buffered bytes from socketOnClose while CLOSING.
    // Those complete frames are actual receipts and must advance the replay cursor.
    // Receipt while still OPEN is an unproven pause premise, never a product FAIL.
    if (
      this.observedFrames
        .slice(initialFrameCount)
        .some(
          (frame) =>
            frame.readyStateAtReceipt !== 'closing' && frame.readyStateAtReceipt !== 'closed',
        )
    )
      throw new BlockedError(
        'Additional frames arrived outside closing-time drain during the QA paused-reader window',
      );
  }
  pause(): number {
    this.ws.pause();
    if (!this.ws.isPaused) throw new Error('Real WS reader was not paused');
    this.record('pause');
    return this.lastReceivedSeq;
  }
  get paused(): boolean {
    return this.ws.isPaused;
  }
  resume(): void {
    this.ws.resume();
    this.record('resume');
  }
  assertProtocolViolations(): void {
    if (this.protocolErrors.length)
      throw new Error(`Invalid received WS frames: ${this.protocolErrors.join('; ')}`);
  }
  assertNoErrors(): void {
    this.assertProtocolViolations();
    if (this.errors.length) throw new Error(`QA WS receipt errors: ${this.errors.join('; ')}`);
    if (this.resourceErrors.length)
      throw new BlockedError('QA receipt ledger budget exhausted; cannot infer peer closure');
  }
  /** Transport loss is allowed during an injected outage; malformed received frames are not. */
  assertValidFrames(): void {
    this.assertProtocolViolations();
    if (this.resourceErrors.length) throw new BlockedError('QA receipt ledger budget exhausted');
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
    this.terminate('cleanup');
    await closed;
  }
}
