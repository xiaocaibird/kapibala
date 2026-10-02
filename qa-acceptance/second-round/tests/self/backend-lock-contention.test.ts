import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUnknownLockContention } from '../../harness/backend-boundaries.js';
import { validateRuntimeSnapshot, type RuntimeEvent, type RuntimeSnapshot } from '../../../harness/runtime-observation.js';
import { BlockedError } from '../../../harness/security.js';

function streams() {
  const correlation = { kind: 'tool-wait', groupId: 'group', runId: 'run', toolUseId: 'all-run-steps' };
  const common = { purpose: 'run', lockKey: 'agent:run', groupId: 'group', runId: 'run' };
  const holder = { correlation, binding: { pid: 10 }, events: [
    { ...common, kind: 'agent-run-lock-attempted', seq: 2, attemptId: 'a', instanceId: 'primary', applicationPid: 11, callbackEntered: false },
    { ...common, kind: 'agent-run-lock-acquired', seq: 3, attemptId: 'a', instanceId: 'primary', applicationPid: 11, callbackEntered: true },
  ] } as unknown as RuntimeSnapshot;
  const competitor = { correlation, binding: { pid: 20 }, events: [
    { ...common, kind: 'agent-run-lock-attempted', seq: 2, attemptId: 'b', instanceId: 'secondary', applicationPid: 21, callbackEntered: false },
    { ...common, kind: 'agent-run-lock-result', seq: 3, attemptId: 'b', instanceId: 'secondary', applicationPid: 21, lockStatus: 'lock_busy', callbackEntered: false },
  ] } as unknown as RuntimeSnapshot;
  return { holder, competitor };
}
test('actual same-run holder and independent paired refusal establish contention', () => {
  const { holder, competitor } = streams();
  assert.equal(assertUnknownLockContention(holder, competitor).sameLockKey, 'agent:run');
});
test('ticks or refusal without a held original callback cannot prove contention', () => {
  let { holder, competitor } = streams(); competitor.events = [];
  assert.throws(() => assertUnknownLockContention(holder, competitor), BlockedError);
  ({ holder, competitor } = streams()); holder.events.push({ ...holder.events[1]!, kind: 'agent-run-lock-result', seq: 4, lockStatus: 'executed', callbackEntered: true });
  assert.throws(() => assertUnknownLockContention(holder, competitor), BlockedError);
  ({ holder, competitor } = streams()); competitor.events.shift();
  assert.throws(() => assertUnknownLockContention(holder, competitor), BlockedError);
});
test('callback entry, same actual process or inconsistent lock key cannot masquerade as refusal', () => {
  for (const mutate of [
    (v: ReturnType<typeof streams>) => { v.competitor.events[1]!.callbackEntered = true; },
    (v: ReturnType<typeof streams>) => { v.competitor.events[1]!.applicationPid = 11; },
    (v: ReturnType<typeof streams>) => { v.competitor.events[1]!.instanceId = 'primary'; },
  ]) {
    const value = streams(); mutate(value);
    assert.throws(() => assertUnknownLockContention(value.holder, value.competitor), assert.AssertionError);
  }
  const value = streams(); value.competitor.events[1]!.lockKey = 'agent:other-run';
  assert.throws(() => assertUnknownLockContention(value.holder, value.competitor), BlockedError);
});

test('runtime boundary accepts actual lock kinds and rejects incomplete lock identity or result facts', () => {
  const target = { apiUrl: 'http://127.0.0.1:31099', revision: 'a'.repeat(40), pid: 501, ownerToken: '66666666-6666-4666-8666-666666666666' };
  const correlation = { kind: 'tool-wait' as const, groupId: 'group', runId: 'run', toolUseId: 'all-run-steps' as const };
  const event = (kind: RuntimeEvent['kind'], seq: number, extra: Record<string, unknown>): RuntimeEvent => ({
    kind, seq, at: '2026-10-01T00:00:00.000Z', correlation,
    attemptId: 'actual-attempt', instancePid: target.pid, applicationPid: 502,
    clockDomain: 'process-performance:502:11111111-1111-4111-8111-111111111111', clockUnit: 'ms', monotonicMs: [seq, seq],
    groupId: correlation.groupId, runId: correlation.runId, ...extra,
  });
  const common = { lockKey: 'agent:run', purpose: 'run', instanceId: 'actual-instance' };
  const snapshot = (): RuntimeSnapshot => ({
    protocol: 'qa-runtime-observation/1', leaseId: 'lease', state: 'armed', expiresAt: new Date(Date.now() + 60000).toISOString(),
    binding: { apiUrl: target.apiUrl, revision: target.revision, pid: target.pid, observedOwnerToken: target.ownerToken }, correlation,
    events: [
      event('lifecycle-observation-attached', 1, { attemptId: 'attach', resourceId: 'run', databaseIdentity: 'b'.repeat(64), historyScope: 'this-process-only', includesPriorProcessHistory: false, droppedThroughSourceSeq: 0 }),
      event('agent-run-lock-attempted', 2, { ...common, sourceSeq: 1, callbackEntered: false }),
      event('agent-run-lock-acquired', 3, { ...common, sourceSeq: 2, callbackEntered: true }),
      event('agent-run-lock-result', 4, { ...common, sourceSeq: 3, lockStatus: 'executed', callbackEntered: true }),
    ],
  });
  assert.doesNotThrow(() => validateRuntimeSnapshot(snapshot(), target, 'lease', correlation));
  for (const callbackEntered of [false, true]) {
    const thrown = snapshot(); thrown.events[3]!.lockStatus = 'error'; thrown.events[3]!.callbackEntered = callbackEntered;
    assert.doesNotThrow(() => validateRuntimeSnapshot(thrown, target, 'lease', correlation));
  }
  for (const mutation of [
    (s: RuntimeSnapshot) => { s.events[1]!.lockKey = 'agent:another-run'; },
    (s: RuntimeSnapshot) => { delete s.events[2]!.instanceId; },
    (s: RuntimeSnapshot) => { s.events[1]!.purpose = 'invented'; },
    (s: RuntimeSnapshot) => { delete s.events[3]!.callbackEntered; },
    (s: RuntimeSnapshot) => { s.events[3]!.lockStatus = 'skipped'; },
  ]) {
    const value = snapshot(); mutation(value);
    assert.throws(() => validateRuntimeSnapshot(value, target, 'lease', correlation), BlockedError);
  }
});
