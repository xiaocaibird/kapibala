import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  assertDiagnostics, assertNoDisclosure, assertUsageRecord, expectedTokens,
  parseUsageJsonl, assertKnownLocalPolicyRefusal, type PolicyBudgetWitness,
} from '../../harness/backend-oracles.js';
const failureTick = randomUUID();
const diagnostic = () => ({ modules: [{ name: 'gateway', tickId: randomUUID(), ticks: 4, status: 'idle',
  lastFailedAt: '2026-10-02T00:00:00.000Z', lastSucceededAt: '2026-10-02T00:00:02.000Z', nextStep: 'Check existing business facts',
  lastFailure: { reason: 'DATABASE_UNAVAILABLE', occurredAt: '2026-10-02T00:00:00.000Z',
    correlation: { module: 'gateway', tickId: failureTick }, recoveredAt: '2026-10-02T00:00:01.000Z', nextStep: 'Check database connection' },
}] });
test('diagnostic history may refer to an older tick, but cannot invent an entity correlation', () => {
  assert.equal(assertDiagnostics(diagnostic())[0]!.lastFailure!.correlation.tickId, failureTick);
  const v = diagnostic(); Object.assign(v.modules[0]!.lastFailure.correlation, { groupId: 'fictional' });
  assert.throws(() => assertDiagnostics(v), assert.AssertionError);
});
test('wrong reason, source module, chronology and public leaks are rejected', () => {
  for (const mutate of [
    (v: ReturnType<typeof diagnostic>) => { v.modules[0]!.lastFailure.reason = 'guessed'; },
    (v: ReturnType<typeof diagnostic>) => { v.modules[0]!.lastFailure.correlation.module = 'other'; },
    (v: ReturnType<typeof diagnostic>) => { v.modules[0]!.lastFailure.recoveredAt = '2026-10-01T00:00:00Z'; },
    (v: ReturnType<typeof diagnostic>) => { v.modules[0]!.nextStep = 'postgres://secret@host'; },
  ]) { const value = diagnostic(); mutate(value); assert.throws(() => assertDiagnostics(value), assert.AssertionError); }
  assert.throws(() => assertNoDisclosure({ nextStep: 'our-private-marker' }, ['our-private-marker']));
});
test('usage fields keep zero, reject unsafe or nonnumeric tokens and never infer a total', () => {
  assert.deepEqual(expectedTokens(200, { promptTokenCount: 0, candidatesTokenCount: 4 }), { inputTokens: 0, outputTokens: 4, totalTokens: null });
  for (const invalid of [null, -1, 1.2, '0', true, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(expectedTokens(200, { promptTokenCount: invalid, candidatesTokenCount: 4, totalTokenCount: 99 }), { inputTokens: null, outputTokens: 4, totalTokens: 99 });
  }
  assert.deepEqual(expectedTokens(200, { promptTokenCount: Number.MAX_SAFE_INTEGER, candidatesTokenCount: 0, totalTokenCount: 99 }), { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, totalTokens: 99 });
  assert.deepEqual(expectedTokens(500, { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 }), { inputTokens: null, outputTokens: null, totalTokens: null });
});
function usage() { return { requestId: randomUUID(), attemptId: randomUUID(), runId: 'run-actual', observedAt: '2026-10-02T00:00:01Z', stage: 'validated-generation', purpose: 'turn', model: 'qa-model', elapsedMs: 24.2, outcome: 'failure', errorCode: 'INVALID_RESPONSE', inputTokens: 11, outputTokens: 7, totalTokens: 18 }; }
test('successful HTTP usage survives a later output failure and a missing error/extra body is rejected', () => {
  const expected = { purpose: 'turn' as const, runId: 'run-actual', outcome: 'failure' as const, tokens: expectedTokens(200, { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 }) };
  assertUsageRecord(usage(), expected);
  assert.throws(() => assertUsageRecord({ ...usage(), inputTokens: null }, expected));
  assert.throws(() => assertUsageRecord({ ...usage(), errorCode: null }, expected));
  assert.throws(() => assertUsageRecord({ ...usage(), response: 'private model text' }, expected));
});
test('audit records cannot invent a turn runId and JSONL requires complete UTF8 lines', () => {
  const record = { ...usage(), purpose: 'audit', runId: null, outcome: 'success', errorCode: null };
  const expected = { purpose: 'audit' as const, runId: null, outcome: 'success' as const, tokens: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } };
  assertUsageRecord(record, expected);
  assert.throws(() => assertUsageRecord({ ...record, runId: 'invented' }, expected));
  assert.equal(parseUsageJsonl(Buffer.from(JSON.stringify(record) + '\n')).length, 1);
  assert.throws(() => parseUsageJsonl(Buffer.from(JSON.stringify(record))));
  assert.throws(() => parseUsageJsonl(new Uint8Array([0xff, 10])));
});
const policy = (): PolicyBudgetWitness => ({ runId: 'actual-run', toolUseId: 'actual-step', targetId: 'actual-target',
  publicManagedBeforeRelease: true, auditPassCount: 1, requestCount: 0, effectCount: 0, sameRunAndStep: true,
  lockAcquiredBeforeDeadline: true, lockReleasedAfterDeadline: true, actualLockEvidence: 'raw-pg-lock.json', actualDeadlineEvidence: 'runtime-observation.json',
  finalErrorCode: 'POLICY_DENIED', recoveryPaused: false, dispatched: false });
test('no HTTP alone never proves the managed-policy/work-cutoff window', () => {
  assertKnownLocalPolicyRefusal(policy());
  assert.throws(() => assertKnownLocalPolicyRefusal({ ...policy(), actualLockEvidence: null }));
  assert.throws(() => assertKnownLocalPolicyRefusal({ ...policy(), lockReleasedAfterDeadline: false }));
  assert.throws(() => assertKnownLocalPolicyRefusal({ ...policy(), finalErrorCode: 'BUDGET_EXHAUSTED', recoveryPaused: true }));
  assert.throws(() => assertKnownLocalPolicyRefusal({ ...policy(), requestCount: 1 }));
});
