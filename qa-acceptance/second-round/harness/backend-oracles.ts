import assert from 'node:assert/strict';

/** Independent public-contract assertions. No product module or developer fixture imports. */
export const DIAGNOSTIC_REASONS = [
  'DATABASE_UNAVAILABLE', 'DATABASE_CONTENTION', 'DATABASE_QUERY_CANCELLED',
  'REMOTE_UNAVAILABLE', 'REMOTE_REJECTED', 'INVALID_RESPONSE', 'UNEXPECTED_FAILURE',
] as const;
export const USAGE_FIELDS = [
  'requestId', 'attemptId', 'runId', 'observedAt', 'stage', 'purpose', 'model',
  'elapsedMs', 'outcome', 'errorCode', 'inputTokens', 'outputTokens', 'totalTokens',
] as const;
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'expected JSON object');
  return value as Record<string, unknown>;
}
function iso(value: unknown): asserts value is string {
  assert.equal(typeof value, 'string');
  assert.ok(Number.isFinite(Date.parse(value as string)), 'expected an ISO time');
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(value as string));
}
export function assertNoDisclosure(value: unknown, sentinels: readonly string[] = []): void {
  const raw = JSON.stringify(value);
  for (const sentinel of sentinels.filter(Boolean)) assert.ok(!raw.includes(sentinel), 'secret/body sentinel disclosed');
  const forbidden = new Set(['password', 'passwd', 'accesstoken', 'refreshtoken', 'cookie', 'authorization',
    'connectionstring', 'databaseurl', 'stack', 'stacktrace', 'errormessage', 'rawresponse']);
  const visit = (v: unknown): void => {
    if (typeof v === 'string') assert.ok(!/postgres(?:ql)?:\/\/|Bearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\n\s+at\s+.+:\d+:\d+/i.test(v), 'credential/connection/stack disclosed');
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      if (child !== null && child !== undefined && child !== '') assert.ok(!forbidden.has(key.replaceAll(/[_-]/g, '').toLowerCase()), 'populated sensitive field');
      visit(child);
    }
  };
  visit(value);
}
export interface DiagnosticFailure {
  reason: string; occurredAt: string; correlation: { module: string; tickId: string };
  recoveredAt: string | null; nextStep: string;
}
export interface DiagnosticModule extends Record<string, unknown> {
  name: string; tickId: string | null; ticks: number; status: string;
  lastFailedAt: string | null; lastSucceededAt: string | null;
  lastFailure: DiagnosticFailure | null; nextStep: string;
}
export function assertDiagnostics(value: unknown, sentinels: readonly string[] = []): DiagnosticModule[] {
  const body = record(value);
  assert.ok(Array.isArray(body.modules) && body.modules.length > 0, 'modules[] must be present');
  const seen = new Set<string>();
  for (const candidate of body.modules) {
    const m = record(candidate);
    assert.ok(typeof m.name === 'string' && m.name.length > 0 && !seen.has(m.name));
    seen.add(m.name as string);
    assert.ok(m.tickId === null || (typeof m.tickId === 'string' && uuid.test(m.tickId)));
    assert.ok(Number.isSafeInteger(m.ticks) && Number(m.ticks) >= 0);
    assert.ok(typeof m.nextStep === 'string' && m.nextStep.length > 0);
    if (m.lastFailure !== null) {
      const f = record(m.lastFailure), c = record(f.correlation);
      assert.ok(DIAGNOSTIC_REASONS.includes(f.reason as typeof DIAGNOSTIC_REASONS[number]), 'reason outside public whitelist');
      iso(f.occurredAt);
      assert.equal(f.occurredAt, m.lastFailedAt);
      assert.deepEqual(Object.keys(c).sort(), ['module', 'tickId']);
      assert.equal(c.module, m.name);
      assert.ok(typeof c.tickId === 'string' && uuid.test(c.tickId));
      assert.ok(typeof f.nextStep === 'string' && f.nextStep.length > 0);
      if (f.recoveredAt !== null) { iso(f.recoveredAt); assert.ok(Date.parse(f.recoveredAt as string) >= Date.parse(f.occurredAt as string)); }
      // A newer current tick is legal. Never equate current tickId with historical failure tickId.
    }
  }
  assertNoDisclosure(value, sentinels);
  return body.modules as DiagnosticModule[];
}
export type TokenTriple = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
export const tokenOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
/** Provider HTTP status and successful receipt are independent from subsequent output validation. */
export function expectedTokens(httpStatus: number | null, usage: Record<string, unknown> | null): TokenTriple {
  const accepted = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  return { inputTokens: accepted ? tokenOrNull(usage?.promptTokenCount) : null,
    outputTokens: accepted ? tokenOrNull(usage?.candidatesTokenCount) : null,
    totalTokens: accepted ? tokenOrNull(usage?.totalTokenCount) : null };
}
export interface UsageExpectation {
  purpose: 'turn' | 'audit'; runId: string | null; model?: string;
  outcome: 'success' | 'failure'; tokens: TokenTriple; sentinels?: readonly string[];
  /** Only populate from a reviewed public enum. An absent complete enum is not invented here. */
  allowedErrorCodes?: readonly string[];
}
export function assertUsageRecord(value: unknown, expected: UsageExpectation): void {
  const r = record(value);
  assert.deepEqual(Object.keys(r).sort(), [...USAGE_FIELDS].sort(), 'usage permits exactly the documented fields');
  assert.ok(typeof r.requestId === 'string' && uuid.test(r.requestId));
  assert.ok(typeof r.attemptId === 'string' && uuid.test(r.attemptId));
  iso(r.observedAt);
  assert.equal(r.stage, 'validated-generation');
  assert.equal(r.purpose, expected.purpose);
  assert.equal(r.runId, expected.purpose === 'audit' ? null : expected.runId);
  assert.equal(r.outcome, expected.outcome);
  assert.ok(typeof r.model === 'string' && r.model.length > 0);
  if (expected.model !== undefined) assert.equal(r.model, expected.model);
  assert.ok(typeof r.elapsedMs === 'number' && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0);
  for (const name of ['inputTokens', 'outputTokens', 'totalTokens'] as const) assert.equal(r[name], expected.tokens[name], name);
  if (expected.outcome === 'success') assert.equal(r.errorCode, null);
  else {
    assert.ok(typeof r.errorCode === 'string' && /^[A-Z][A-Z0-9_]*$/.test(r.errorCode), 'failure needs a fixed safe error code');
    if (expected.allowedErrorCodes) assert.ok(expected.allowedErrorCodes.includes(r.errorCode as string));
  }
  assertNoDisclosure(value, expected.sentinels);
}
export function parseUsageJsonl(bytes: Uint8Array): Record<string, unknown>[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(text === '' || text.endsWith('\n'), 'usage must contain complete JSONL lines');
  return text === '' ? [] : text.slice(0, -1).split('\n').map((line) => {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 4096, 'record exceeds the public byte bound');
    return record(JSON.parse(line));
  });
}
export interface PolicyBudgetWitness {
  runId: string; toolUseId: string; targetId: string;
  publicManagedBeforeRelease: boolean; auditPassCount: number; requestCount: number; effectCount: number;
  sameRunAndStep: boolean; lockAcquiredBeforeDeadline: boolean; lockReleasedAfterDeadline: boolean;
  actualLockEvidence: string | null; actualDeadlineEvidence: string | null;
  finalErrorCode: string | null; recoveryPaused: boolean; dispatched: boolean;
}
/** Missing actual windows are BLOCKED by the caller; the absence of HTTP alone is insufficient. */
export function assertKnownLocalPolicyRefusal(w: PolicyBudgetWitness): void {
  assert.ok(w.actualLockEvidence && w.actualDeadlineEvidence && w.lockAcquiredBeforeDeadline && w.lockReleasedAfterDeadline,
    'the actual intent lock must straddle the actual work deadline');
  assert.ok(w.sameRunAndStep && w.publicManagedBeforeRelease);
  assert.equal(w.auditPassCount, 1);
  assert.equal(w.dispatched, false);
  assert.equal(w.requestCount, 0);
  assert.equal(w.effectCount, 0);
  assert.equal(w.finalErrorCode, 'POLICY_DENIED', 'known local refusal must remain a definite refusal');
  assert.equal(w.recoveryPaused, false, 'known no-dispatch refusal cannot be relabeled unknown remote outcome');
}
