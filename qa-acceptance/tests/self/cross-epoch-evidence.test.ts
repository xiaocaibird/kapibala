import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCrossEpochEvidence,
  assertCrossEpochBudget,
  assertCrossEpochLiveLower,
  type CrossEpochInput,
} from '../../harness/cross-epoch-evidence.js';
import { BlockedError } from '../../harness/security.js';
import {
  RuntimeLease,
  validateRuntimeSnapshot,
  type MeasuredRuntimeSnapshot,
  type RuntimeEvent,
} from '../../harness/runtime-observation.js';
const correlation = {
  kind: 'activity' as const,
  groupId: 'group',
  runId: 'run',
  toolUseId: 'all-run-steps',
};
function measured(
  pid: number,
  c: number,
  parent: number,
  events: RuntimeEvent[],
): MeasuredRuntimeSnapshot {
  return {
    parentClockDomain: 'qa-parent-unique',
    parentWindowMs: [parent, parent + 2],
    snapshot: {
      protocol: 'qa-runtime-observation/1',
      leaseId: `lease-${pid}`,
      state: pid === 11 ? 'held' : 'armed',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      binding: {
        apiUrl: 'http://127.0.0.1:10001',
        revision: 'a'.repeat(40),
        pid: pid + 100,
        observedOwnerToken: 'owner',
      },
      correlation,
      events,
      clockObservation: {
        clockDomain: `app-${pid}`,
        applicationPid: pid,
        clockUnit: 'ms',
        monotonicMs: c,
      },
      snapshotProvenance: {
        source: 'live-bridge',
        applicationPid: pid,
        applicationStarted: `Thu Oct 1 14:00:${pid} 2026`,
      },
    },
  };
}
function activity(pid: number): RuntimeEvent {
  return {
    seq: 1,
    at: new Date().toISOString(),
    kind: pid === 11 ? 'activity-safe-held' : 'activity-terminal',
    correlation,
    attemptId: `attempt-${pid}`,
    instancePid: pid + 100,
    groupId: 'group',
    runId: 'run',
    applicationPid: pid,
    clockDomain: `app-${pid}`,
    clockUnit: 'ms',
    epochIds: [`epoch-${pid}`],
    includesUnsavedTail: pid === 11,
    activeElapsedMs: pid === 11 ? [29000, 30000] : null,
    activityState: pid === 11 ? 'active' : 'terminal',
    epochObservation: {
      continuous: true,
      startSource: pid === 11 ? 'run-creation' : 'clock-acquisition',
    },
    creationOrEpochStartWindowMs: [100, 102],
    ...(pid === 11
      ? {
          continuationDurable: true,
          remoteInFlightCount: 0,
          stepId: 'actual-step',
          lastSuccessfulSample: {
            epochId: 'epoch-11',
            windowMs: [29950, 29951],
            persistedActiveMs: 29850,
          },
        }
      : { activityEndWindowMs: [20100, 20102] }),
  };
}
function input(): CrossEpochInput & { recoveredLifecycle: RuntimeEvent[] } {
  const old = activity(11),
    next = activity(22);
  const decision = {
    ...next,
    kind: 'agent-termination-decided' as const,
    seq: 2,
    decisionWindowMs: [20100, 20102],
    status: 'failed',
    reason: 'wall_clock',
    attemptId: 'stop',
  };
  return {
    beforeKill: [
      measured(11, 30000, 31000, [old]),
      measured(11, 30010, 31010, [structuredClone(old)]),
    ],
    afterRecovery: measured(22, 21000, 61000, [next]),
    exited: {
      parentClockDomain: 'qa-parent-unique',
      applicationPid: 11,
      applicationStarted: 'Thu Oct 1 14:00:11 2026',
      guardianPid: 111,
      signal: 'SIGKILL',
      signalRequestedBeforeMs: 32000,
      processExitObservedAfterMs: 32002,
      exitObservation: 'owned-process-confirmed-absent',
    },
    startupWindowMs: [38000, 39500],
    recoveredLifecycle: [
      { ...next, seq: 1, kind: 'lifecycle-observation-attached', droppedThroughSourceSeq: 0 },
      decision,
      { ...decision, seq: 3, kind: 'agent-terminal-committed', monotonicMs: [50000, 50001] },
    ],
  };
}
const terminal = (v: CrossEpochInput) => v.afterRecovery.snapshot.events.at(-1)!;
const fails = (v: CrossEpochInput, match: RegExp) =>
  assert.throws(
    () => assertCrossEpochBudget(collectCrossEpochEvidence(v)),
    (error: unknown) => !(error instanceof BlockedError) && match.test(String(error)),
  );
const blocked = (v: CrossEpochInput) =>
  assert.throws(() => assertCrossEpochBudget(collectCrossEpochEvidence(v)), BlockedError);

test('independent cross-origin arithmetic includes uncertain startup, preserves unsaved false and late COMMIT separately', () => {
  const v = input(),
    original = structuredClone(v),
    got = collectCrossEpochEvidence(v);
  assert.deepEqual(got.oldOffsetMs, [1000, 1002]);
  assert.deepEqual(got.oldActiveMs, [30896, 30902]);
  assert.deepEqual(got.newActiveMs, [19998, 20002]);
  assert.deepEqual(got.observedActiveMs, [50894, 50904]);
  assert.deepEqual(got.startupGapMs, [0, 2104]);
  assert.deepEqual(got.fullActiveMs, [50894, 53008]);
  assert.deepEqual(got.provenDowntimeMs, [5998, 6000]);
  assert.deepEqual(got.unsavedTailMs, [0, 1052]);
  assertCrossEpochBudget(got); // Maximum can hold before 60s; no invented lower bound.
  assert.deepEqual(v, original);
  assert.equal(terminal(v).includesUnsavedTail, false);
});
test('observed safe lower over 60000 fails before missing startup/last sample/COMMIT completeness', () => {
  const v = input();
  terminal(v).activityEndWindowMs = [30100, 30102];
  v.afterRecovery.snapshot.clockObservation!.monotonicMs = 31000;
  v.afterRecovery.parentWindowMs = [71000, 71002];
  v.startupWindowMs = [NaN, NaN];
  delete v.beforeKill[1].snapshot.events[0]!.lastSuccessfulSample;
  delete v.beforeKill[0].snapshot.events[0]!.lastSuccessfulSample;
  v.recoveredLifecycle[1]!.decisionWindowMs = [30100, 30102];
  v.recoveredLifecycle.pop();
  fails(v, /两个真实活动段安全下界/);
});
test('observed portion below limit cannot pass after quietly excluding initialization', () => {
  const v = input();
  terminal(v).activityEndWindowMs = [29100, 29102];
  v.afterRecovery.snapshot.clockObservation!.monotonicMs = 30000;
  v.afterRecovery.parentWindowMs = [70000, 70002];
  v.recoveredLifecycle[1]!.decisionWindowMs = [29100, 29102];
  const got = collectCrossEpochEvidence(v);
  assert(got.observedActiveMs[1] < 60000 && got.fullActiveMs![1] > 60000);
  blocked(v);
});
test('boundary crossing, missing tail receipt and absent real stop do not pass', () => {
  for (const patch of [
    (v: CrossEpochInput) => {
      v.exited.processExitObservedAfterMs += 10000;
    },
    (v: CrossEpochInput) => {
      for (const m of v.beforeKill) delete m.snapshot.events[0]!.lastSuccessfulSample;
    },
    (v: CrossEpochInput) => {
      v.recoveredLifecycle = v.recoveredLifecycle.slice(0, -1);
    },
    (v: CrossEpochInput) => {
      v.recoveredLifecycle[2]!.attemptId = 'other';
    },
    (v: CrossEpochInput) => {
      v.recoveredLifecycle[0]!.droppedThroughSourceSeq = 2;
    },
  ]) {
    const v = input();
    patch(v);
    blocked(v);
  }
});
test('cache/identity/parent-origin/clock drift/reused epoch/reconstructed start and gaps fail closed', () => {
  for (const patch of [
    (v: CrossEpochInput) => {
      v.beforeKill[1].snapshot.snapshotProvenance!.source = 'retained-after-process-exit';
    },
    (v: CrossEpochInput) => {
      v.afterRecovery.parentClockDomain = 'other';
    },
    (v: CrossEpochInput) => {
      v.exited.applicationStarted = 'other';
    },
    (v: CrossEpochInput) => {
      v.beforeKill[1].parentWindowMs = [40000, 40002];
    },
    (v: CrossEpochInput) => {
      terminal(v).epochIds = ['epoch-11'];
    },
    (v: CrossEpochInput) => {
      terminal(v).epochObservation!.startSource = 'unwitnessed';
    },
    (v: CrossEpochInput) => {
      terminal(v).epochObservation!.continuous = false;
    },
    (v: CrossEpochInput) => {
      terminal(v).includesUnsavedTail = true;
    },
    (v: CrossEpochInput) => {
      terminal(v).runId = 'other';
    },
    (v: CrossEpochInput) => {
      terminal(v).clockDomain = 'other';
    },
    (v: CrossEpochInput) => {
      terminal(v).activityEndWindowMs = [50, 51];
    },
  ]) {
    const v = input();
    patch(v);
    blocked(v);
  }
});
test('initial pre-acquisition lookup allowed, later lost ownership cannot be erased', () => {
  const v = input();
  const last = terminal(v);
  const unknown = {
    ...last,
    kind: 'activity-checkpoint' as const,
    seq: 1,
    activityState: 'unknown' as const,
    epochIds: [],
    epochObservation: { continuous: false, startSource: 'unwitnessed' as const },
  };
  last.seq = 2;
  v.afterRecovery.snapshot.events.unshift(unknown);
  assertCrossEpochBudget(collectCrossEpochEvidence(v));
  v.afterRecovery.snapshot.events.push({ ...unknown, seq: 3 }, { ...last, seq: 4 });
  blocked(v);
});
test('known recovery pause or stop followed by dispatch survives missing unrelated evidence', () => {
  const v = input();
  terminal(v).activityState = 'recovery-paused';
  delete v.beforeKill[0].snapshot.clockObservation;
  fails(v, /强恢复未满足/);
  const w = input();
  w.recoveredLifecycle.pop();
  w.afterRecovery.snapshot.events = [];
  w.recoveredLifecycle.push({ ...w.recoveredLifecycle[1]!, seq: 3, kind: 'agent-turn-dispatched' });
  fails(w, /终止决定之后不得/);
});
test('runtime optional fields validate without inventing defaults or rejecting old snapshots', async () => {
  const v = input(),
    s = v.beforeKill[0].snapshot;
  const target = {
    apiUrl: s.binding.apiUrl,
    revision: s.binding.revision,
    pid: s.binding.pid,
    ownerToken: s.binding.observedOwnerToken,
  };
  validateRuntimeSnapshot(s, target, s.leaseId, correlation);
  for (const patch of [
    (x: typeof s) => {
      x.clockObservation!.monotonicMs = NaN;
    },
    (x: typeof s) => {
      x.snapshotProvenance!.applicationStarted = '';
    },
    (x: typeof s) => {
      x.events[0]!.lastSuccessfulSample!.windowMs = [2, 1];
    },
    (x: typeof s) => {
      x.events[0]!.epochObservation!.continuous = 'true' as unknown as boolean;
    },
  ]) {
    const x = structuredClone(s);
    patch(x);
    assert.throws(() => validateRuntimeSnapshot(x, target, x.leaseId, correlation), BlockedError);
  }
  const old = structuredClone(s);
  delete old.clockObservation;
  delete old.snapshotProvenance;
  delete old.events[0]!.epochObservation;
  delete old.events[0]!.lastSuccessfulSample;
  validateRuntimeSnapshot(old, target, old.leaseId, correlation);
  let requestInside = 0;
  const lease = new RuntimeLease(s.leaseId, target, correlation, async () => {
    requestInside = performance.now();
    return s;
  });
  const got = await lease.snapshotMeasured('qa-parent');
  assert(got.parentWindowMs[0] <= requestInside && got.parentWindowMs[1] >= requestInside);
  assert.equal(got.snapshot, s);
  assert.equal(got.parentClockDomain, 'qa-parent');
  await assert.rejects(lease.snapshotMeasured(''), BlockedError);
});

test('late finish/COMMIT does not masquerade as execution after a timely stop', () => {
  const v = input();
  terminal(v).activityEndWindowMs = [40100, 40102];
  v.afterRecovery.snapshot.clockObservation!.monotonicMs = 41000;
  v.afterRecovery.parentWindowMs = [81000, 81002];
  const got = collectCrossEpochEvidence(v);
  assert(got.terminalStageActiveMs[0] + got.oldActiveMs[0] > 60000);
  assertCrossEpochBudget(got);
  v.recoveredLifecycle = [];
  blocked(v); // Terminal lower is not a substituted stop timestamp.
});
test('historical active checkpoint cannot replace missing actual stop history', () => {
  const v = input();
  terminal(v).activityEndWindowMs = [40100, 40102];
  v.afterRecovery.snapshot.clockObservation!.monotonicMs = 41000;
  v.afterRecovery.parentWindowMs = [81000, 81002];
  v.afterRecovery.snapshot.events.unshift({
    ...terminal(v),
    kind: 'activity-checkpoint',
    seq: 1,
    activityState: 'active',
    observedEpochActiveMs: [30000, 30001],
  });
  terminal(v).seq = 2;
  v.recoveredLifecycle = [];
  blocked(v);
  assert.equal(collectCrossEpochEvidence(v).newActiveMs[0], 0);
});

test('live overrun cannot disappear behind later missing terminal, but post-stop bookkeeping is not execution', () => {
  const v = input();
  const live = structuredClone(v.afterRecovery.snapshot);
  live.events = v.recoveredLifecycle;
  const current = terminal(v);
  current.kind = 'activity-checkpoint';
  current.activityState = 'active';
  current.observedEpochActiveMs = [31000, 31002];
  const args = {
    beforeKill: v.beforeKill,
    exited: v.exited,
    current: v.afterRecovery,
    lifecycle: live,
  };
  assert.doesNotThrow(() => assertCrossEpochLiveLower(args)); // Timely actual stop already exists.
  live.events = live.events.slice(0, 1); // Still-live history proves no stop yet.
  assert.throws(
    () => assertCrossEpochLiveLower(args),
    (e: unknown) => !(e instanceof BlockedError) && /安全下界/.test(String(e)),
  );
  live.snapshotProvenance!.source = 'retained-after-process-exit';
  assert.throws(() => assertCrossEpochLiveLower(args), BlockedError);
});

test('real stop overrun survives unrelated active sample field absence and missing COMMIT', () => {
  const v = input();
  terminal(v).activityEndWindowMs = [40100, 40102];
  v.afterRecovery.snapshot.clockObservation!.monotonicMs = 41000;
  v.afterRecovery.parentWindowMs = [81000, 81002];
  v.recoveredLifecycle[1]!.decisionWindowMs = [30100, 30102];
  v.recoveredLifecycle.pop();
  const checkpoint: RuntimeEvent = {
    ...terminal(v),
    seq: 1,
    kind: 'activity-checkpoint' as const,
    activityState: 'active' as const,
  };
  delete checkpoint.observedEpochActiveMs;
  v.afterRecovery.snapshot.events.unshift(checkpoint);
  terminal(v).seq = 2;
  fails(v, /两个真实活动段安全下界/);
});
