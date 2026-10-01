import assert from 'node:assert/strict';
import test from 'node:test';
import { assertProviderBudgetLifecycle } from '../../harness/backend-provider-budgets.js';
import type { RuntimeEvent } from '../../../harness/runtime-observation.js';
import { BlockedError } from '../../../harness/security.js';

function fixture(reason: 'wall_clock' | 'budget_exhausted' = 'wall_clock') {
  const identity = { runId: 'same-run', groupId: 'same-group', applicationPid: 7, instancePid: 6,
    at: '2026-10-02T00:00:00.000Z', correlation: { kind: 'activity' as const, groupId: 'same-group', runId: 'same-run', toolUseId: 'all-run-steps' },
    clockDomain: 'app-clock', attemptId: 'stop-attempt' };
  const lifecycle = [
    { ...identity, seq: 1, kind: 'lifecycle-observation-attached', droppedThroughSourceSeq: 0 },
    { ...identity, seq: 2, kind: 'agent-run-created', creationWindowMs: [1000, 1001] },
    { ...identity, seq: 3, kind: 'agent-turn-dispatched', monotonicMs: [1002, 1002] },
    { ...identity, seq: 4, kind: 'agent-termination-decided', decisionWindowMs: [59000, 59001], status: 'failed', reason },
    { ...identity, seq: 5, kind: 'agent-terminal-committed', status: 'failed', reason },
  ] as RuntimeEvent[];
  const activity = [{ ...identity, seq: 1, kind: 'activity-terminal', includesUnsavedTail: true,
    activeElapsedMs: [58000, 58002], activityState: 'terminal', epochIds: ['original-epoch'] }] as RuntimeEvent[];
  return { lifecycle, activity };
}
test('both real budget reasons preserve actual decision/commit pairing without changing the event', () => {
  for (const reason of ['wall_clock', 'budget_exhausted'] as const) {
    const { lifecycle, activity } = fixture(reason);
    const proof = assertProviderBudgetLifecycle(activity, lifecycle, [0, 59000], reason);
    assert.deepEqual(proof.actualDecisionElapsedMs, [57999, 58001]);
    assert.equal(proof.decisionAttemptId, proof.committedAttemptId);
    assert.equal(proof.terminal.reason, reason);
  }
});
test('real decision overrun stays FAIL even if no later commit exists', () => {
  const { lifecycle, activity } = fixture(); lifecycle.pop(); lifecycle[3]!.decisionWindowMs = [62000, 62001];
  assert.throws(() => assertProviderBudgetLifecycle(activity, lifecycle, [0, 63000], 'wall_clock'), /已超过/);
});
test('missing decision identity or incomplete epoch is BLOCKED, not inferred from public finish', () => {
  const a = fixture(); a.lifecycle[4]!.attemptId = 'different-attempt';
  assert.throws(() => assertProviderBudgetLifecycle(a.activity, a.lifecycle, [0, 59000], 'wall_clock'), BlockedError);
  const b = fixture(); b.activity[0]!.includesUnsavedTail = false;
  assert.throws(() => assertProviderBudgetLifecycle(b.activity, b.lifecycle, [0, 59000], 'wall_clock'), BlockedError);
});
test('actual turn after stop decision is a failure and cannot be hidden by a valid commit', () => {
  const { lifecycle, activity } = fixture(); lifecycle.push({ ...lifecycle[2]!, seq: 6 });
  assert.throws(() => assertProviderBudgetLifecycle(activity, lifecycle, [0, 59000], 'wall_clock'), assert.AssertionError);
});
test('interval across 60 seconds never acquires an invented tolerance', () => {
  const { lifecycle, activity } = fixture(); lifecycle[3]!.decisionWindowMs = [60999, 61002];
  assert.throws(() => assertProviderBudgetLifecycle(activity, lifecycle, [0, 65000], 'wall_clock'), BlockedError);
});
