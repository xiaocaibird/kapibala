import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { ReceiptSocket } from './receipt-socket.js';

/** An independently maintained mapping of the published, read-only JSON log.
 * This does not control the SUT or turn attempted writes into client receipts. */
export interface StreamLogPolicy {
  contractReference: string;
  limits: { maxBufferedBytes: number; sendTimeoutMs: number; closeGraceMs: number };
  maxLogBytes: number;
  observationMs: number;
}
export interface StreamCloseAttribution {
  verified: boolean;
  reason: string;
  source?: {
    path: string;
    scope: 'captured-prefix';
    bytes: number;
    sha256: string;
    incompleteTailBytes: number;
  };
  identity?: { connectionId: string; pid: number };
  entries: { line: number; value: Record<string, unknown> }[];
  contractReference: string;
}
type ReceiptSnapshot = ReturnType<ReceiptSocket['snapshot']>;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const integer = (x: unknown): x is number => Number.isSafeInteger(x) && Number(x) > 0;
const timestamp = (x: unknown) => (typeof x === 'string' ? Date.parse(x) : NaN);
const normalizedAddress = (x: unknown) => (typeof x === 'string' ? x.replace(/^::ffff:/, '') : x);

export function validateStreamLogPolicy(policy: StreamLogPolicy): void {
  assert.ok(policy.contractReference.trim(), 'Published stream log contract required');
  for (const value of [...Object.values(policy.limits), policy.maxLogBytes, policy.observationMs])
    assert.ok(integer(value), 'Stream log policy requires finite positive integer bounds');
}

/** Pure adjudication of complete raw JSON lines. Missing/ambiguous diagnostics
 * are an observation gap; callers check business violations before using it. */
export function attributeStreamClose(
  text: string,
  client: ReceiptSnapshot,
  policy: StreamLogPolicy,
): StreamCloseAttribution {
  validateStreamLogPolicy(policy);
  const result: StreamCloseAttribution = {
    verified: false,
    reason: '',
    entries: [],
    contractReference: policy.contractReference,
  };
  const unavailable = (reason: string) => ({ ...result, reason });
  const tuple = client.connection;
  if (!tuple) return unavailable('Actual reader TCP endpoints were not captured');
  if (
    !client.closed ||
    client.closed.source === 'local-termination' ||
    client.transport.some((e) => e.kind === 'local-terminate')
  )
    return unavailable('An independently observed non-local transport close is required');
  if (client.protocolErrors.length || client.resourceErrors.length)
    return unavailable('Protocol/QA-resource problems cannot establish slow-reader causation');
  const opened = client.transport.filter((e) => e.kind === 'open');
  const pauses = client.transport.filter((e) => e.kind === 'pause');
  const resumes = client.transport.filter((e) => e.kind === 'resume');
  if (
    opened.length !== 1 ||
    pauses.length !== 1 ||
    resumes.length > 1 ||
    [...opened, ...pauses, ...resumes, client.closed].some(
      (e) => !finite(e.monotonicMs) || !Number.isFinite(timestamp(e.at)),
    ) ||
    pauses[0]!.monotonicMs < opened[0]!.monotonicMs ||
    client.closed.monotonicMs < pauses[0]!.monotonicMs ||
    resumes.some((e) => e.monotonicMs < pauses[0]!.monotonicMs)
  )
    return unavailable('One actual pause window without an earlier QA resume is required');
  const records: StreamCloseAttribution['entries'] = [];
  const lines = text.split('\n');
  // A log can still be appending. The unfinished tail is retained in raw source,
  // but never parsed or guessed to be a completed lifecycle event.
  for (let i = 0; i < lines.length - 1; i++) {
    try {
      const value: unknown = JSON.parse(lines[i]!);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const entry = value as Record<string, unknown>;
        if (entry.component === 'realtime-transport' || entry.component === 'realtime-auth')
          records.push({ line: i + 1, value: entry });
      }
    } catch {
      /* Normal console output is not a lifecycle observation. */
    }
  }
  const matchesTuple = (v: Record<string, unknown>) =>
    normalizedAddress(v.peerAddress) === normalizedAddress(tuple.localAddress) &&
    v.peerPort === tuple.localPort &&
    normalizedAddress(v.localAddress) === normalizedAddress(tuple.remoteAddress) &&
    v.localPort === tuple.remotePort;
  const matching = records.filter((e) => matchesTuple(e.value));
  result.entries = matching;
  const configurations = matching.filter(
    (e) => e.value.component === 'realtime-transport' && e.value.kind === 'configured',
  );
  if (configurations.length !== 1)
    return unavailable(
      'TCP tuple must identify exactly one configured connection; absent/reused tuple is ambiguous',
    );
  const initial = configurations[0]!.value;
  if (typeof initial.connectionId !== 'string' || !initial.connectionId || !integer(initial.pid))
    return unavailable('Configured connection lacks an exact connectionId/process identity');
  result.identity = { connectionId: initial.connectionId, pid: initial.pid };
  const sameIdentity = records.filter(
    (e) => e.value.connectionId === initial.connectionId && e.value.pid === initial.pid,
  );
  result.entries = sameIdentity;
  if (
    matching.some(
      (e) => e.value.connectionId !== initial.connectionId || e.value.pid !== initial.pid,
    ) ||
    sameIdentity.some((e) => !matchesTuple(e.value))
  )
    return unavailable(
      'Connection identity and complete TCP tuple do not agree throughout the chain',
    );
  const kinds = sameIdentity.map((e) =>
    e.value.component === 'realtime-auth' ? 'authenticated' : e.value.kind,
  );
  const hasTerminate = kinds.includes('terminate-requested');
  const expected = [
    'configured',
    'authenticated',
    'close-requested',
    ...(hasTerminate ? ['terminate-requested'] : []),
    'closed',
  ];
  if (JSON.stringify(kinds) !== JSON.stringify(expected))
    return unavailable(
      'Required configured/auth/close-requested/(terminate)/closed chain is missing, duplicated or reordered',
    );
  const values = sameIdentity.map((e) => e.value);
  if (
    values.some(
      (v, i) =>
        !finite(v.monotonicMs) ||
        !Number.isFinite(timestamp(v.at)) ||
        (i > 0 && Number(v.monotonicMs) < Number(values[i - 1]!.monotonicMs)),
    )
  )
    return unavailable('Lifecycle clocks are absent or out of order within the same process');
  const authSent = client.transport.filter((e) => e.kind === 'auth-sent');
  const sinceSeq = (authSent[0]?.detail as { sinceSeq?: number } | undefined)?.sinceSeq ?? null;
  if (
    authSent.length !== 1 ||
    values[1]!.requestedSinceSeq !== sinceSeq ||
    !Number.isSafeInteger(values[1]!.replayAfterSeq) ||
    Number(values[1]!.replayAfterSeq) < 0 ||
    (sinceSeq !== null && values[1]!.replayAfterSeq !== sinceSeq)
  )
    return unavailable(
      'Authenticated connection does not bind the actual client auth/replay request',
    );
  if (
    values
      .filter((v) => v.component === 'realtime-transport')
      .some((v) => {
        const limits = v.limits as Record<string, unknown> | undefined;
        return (
          !limits || Object.entries(policy.limits).some(([key, value]) => limits[key] !== value)
        );
      })
  )
    return unavailable(
      'Actual per-connection configuration does not match the frozen normal-entry profile',
    );
  const requested = values[2]!;
  const closed = values.at(-1)!;
  const trigger = requested.trigger;
  if (
    (trigger !== 'send-timeout' && trigger !== 'buffer-high-water') ||
    requested.code !== 1013 ||
    requested.reason !== 'Slow consumer; reconnect to resume' ||
    closed.trigger !== trigger
  )
    return unavailable(
      'Lifecycle has no documented slow-consumer cause; application/send-error/overflow is not equivalent',
    );
  if (requested.readyState !== 1 || closed.readyState !== 3)
    return unavailable('Request/actual close states are not observable');
  if (
    timestamp(values[0]!.at) > timestamp(pauses[0]!.at) ||
    timestamp(requested.at) < timestamp(pauses[0]!.at) ||
    timestamp(requested.at) > timestamp(client.closed.at) ||
    (resumes[0] && timestamp(requested.at) > timestamp(resumes[0].at))
  )
    return unavailable(
      'Product did not observably initiate this close during the actual paused-read window',
    );
  if (
    trigger === 'send-timeout' &&
    (!finite(requested.currentSendWaitMs) ||
      requested.currentSendWaitMs <= 0 ||
      !integer(requested.currentFrameBytes) ||
      !integer(requested.pendingWaiters))
  )
    return unavailable('Send-timeout trigger lacks the real in-flight send/wait observation');
  // Do not demand exactly 5000ms or compare performance.now across processes.
  if (
    trigger === 'buffer-high-water' &&
    (!finite(requested.bufferedBytes) || requested.bufferedBytes <= policy.limits.maxBufferedBytes)
  )
    return unavailable('Buffer-high-water trigger lacks the actual exceeded watermark');
  if (hasTerminate) {
    const terminated = values[3]!;
    if (
      terminated.trigger !== trigger ||
      terminated.code !== requested.code ||
      terminated.reason !== requested.reason ||
      terminated.readyState !== 2
    )
      return unavailable(
        'Terminate fallback does not belong to the same initiated slow-reader close',
      );
  }
  if ((client.closed.code === 1006 || closed.code === 1006) && !hasTerminate)
    return unavailable(
      'An abnormal transport end needs the matching actual terminate/closed chain',
    );
  if (closed.code !== 1006 && (closed.code !== 1013 || closed.reason !== requested.reason))
    return unavailable(
      'Server actual close does not match the documented policy or its terminate fallback',
    );
  if (
    client.closed.code !== 1006 &&
    (client.closed.code !== 1013 || client.closed.reason !== requested.reason)
  )
    return unavailable(
      'Client actual close does not match the documented policy or its terminate fallback',
    );
  result.verified = true;
  result.reason = `Exact connection lifecycle attributes actual closure to ${trigger}; client close remains ${client.closed.code}`;
  return result;
}

/** Reads only this case's owned server.log. No endpoint, process control, product
 * import, log rewriting or parser-provided outcome overrides. */
export async function reviewStreamCloseLog(
  path: string,
  client: ReceiptSnapshot,
  policy: StreamLogPolicy,
): Promise<StreamCloseAttribution> {
  validateStreamLogPolicy(policy);
  const unavailable = (reason: string): StreamCloseAttribution => ({
    verified: false,
    reason,
    entries: [],
    contractReference: policy.contractReference,
  });
  let file;
  try {
    file = await open(path, 'r');
    const size = (await file.stat()).size;
    if (size > policy.maxLogBytes) return unavailable('QA server-log byte budget exceeded');
    const buffer = Buffer.alloc(size);
    let bytes = 0;
    while (bytes < size) {
      const next = await file.read(buffer, bytes, size - bytes, bytes);
      if (!next.bytesRead) break;
      bytes += next.bytesRead;
    }
    const data = buffer.subarray(0, bytes);
    const result = attributeStreamClose(data.toString('utf8'), client, policy);
    result.source = {
      path,
      scope: 'captured-prefix',
      bytes,
      sha256: createHash('sha256').update(data).digest('hex'),
      incompleteTailBytes: bytes - (data.lastIndexOf(10) + 1),
    };
    return result;
  } catch (error) {
    return unavailable(`Owned server-log observation unavailable: ${String(error)}`);
  } finally {
    await file?.close();
  }
}
