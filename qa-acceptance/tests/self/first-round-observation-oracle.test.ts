import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import { BlockedError } from '../../harness/security.js';
import {
  assertKickBudgetCancellation,
  assertKickBudgetPending,
  assertUnrefinedActivityBudget,
  inspectOriginalKickCancellationEvidence,
  type KickObservationBinding,
} from '../../harness/first-round-observation-oracle.js';

// Pure QA oracle fixtures. No application, DB, HTTP, controller or provider is started.
const binding: KickObservationBinding = {
  groupId: 'group',
  runId: 'run',
  toolUseId: 'kick-tool',
  stepId: 'run:3',
  attemptId: 'original-execution-attempt',
  postRequestId: 'post-client-request',
  confirmationRequestId: 'confirmation-client-request',
  applicationPid: 101,
  applicationStarted: '2026-10-02T00:00:00.000Z',
  clockDomain: 'process-performance:101:actual-clock-domain',
  validatedProvenance: {
    source: 'live-bridge',
    applicationPid: 101,
    applicationStarted: '2026-10-02T00:00:00.000Z',
  },
};
const configured = ['request-deadline', 'operation', 'caller', 'kick-lock', 'activity-budget'];
function fact(
  kind: string,
  seq: number,
  time: number,
  patch: Record<string, unknown> = {},
): RuntimeEvent {
  return {
    seq,
    at: '2026-10-02T00:00:00.000Z',
    kind,
    correlation: {
      kind: 'tool-wait',
      groupId: binding.groupId,
      runId: binding.runId,
      toolUseId: 'all-run-steps',
    },
    instancePid: 100,
    ...binding,
    validatedProvenance: undefined,
    sourceSeq: seq,
    clockUnit: 'ms',
    monotonicMs: [time + 0.2, time + 0.2],
    ...patch,
  } as unknown as RuntimeEvent;
}
function remote(
  stage: string,
  purpose: 'post' | 'confirmation',
  seq: number,
  time: number,
  patch: Record<string, unknown> = {},
) {
  return fact(`kick-${purpose}-${stage}`, seq, time, {
    requestPurpose: purpose,
    method: purpose === 'post' ? 'POST' : 'GET',
    requestId: purpose === 'post' ? binding.postRequestId : binding.confirmationRequestId,
    timeoutMs: 15_000,
    observedAtMonoNs: String(1_000_000_000 + seq),
    observedWindowMs: [time, time + 0.1],
    fetchPending: false,
    bodyPending: false,
    configuredSources: [...configured],
    abortedSources: [],
    reasonMatchedSources: [],
    ...patch,
  });
}
function input(): RuntimeEvent[] {
  const aborted = ['caller', 'activity-budget'];
  return [
    fact('lifecycle-observation-attached', 1, 90_000, {
      sourceSeq: undefined,
      resourceId: binding.runId,
      historyScope: 'this-process-only',
      includesPriorProcessHistory: false,
      droppedThroughSourceSeq: 0,
    }),
    remote('dispatch', 'post', 2, 40_000, { fetchPending: true }),
    remote('response-body', 'post', 3, 43_000, { responseStatus: 504 }),
    remote('request-settled', 'post', 4, 43_001, { responseStatus: 504, outcome: 'rejected' }),
    remote('dispatch', 'confirmation', 5, 45_101, { fetchPending: true }),
    fact('kick-budget-signal-aborted', 6, 60_001, {
      source: 'activity-budget',
      budgetMs: 20_000,
      signalObservedAtMonoNs: '2000000006',
      signalObservedWindowMs: [60_001, 60_001.1],
    }),
    remote('source-aborted', 'confirmation', 7, 60_001.3, {
      source: 'activity-budget',
      fetchPending: true,
      abortedSources: aborted,
      reasonMatchedSources: aborted,
    }),
    remote('combined-aborted', 'confirmation', 8, 60_001.6, {
      fetchPending: true,
      abortedSources: aborted,
      reasonMatchedSources: aborted,
    }),
    remote('fetch-settled', 'confirmation', 9, 60_003, {
      outcome: 'rejected',
      errorName: 'TimeoutError',
      abortedSources: aborted,
      reasonMatchedSources: aborted,
    }),
    remote('request-settled', 'confirmation', 10, 60_004, {
      outcome: 'rejected',
      errorName: 'TimeoutError',
      abortedSources: aborted,
      reasonMatchedSources: aborted,
    }),
  ];
}
const observe = (events: RuntimeEvent[]) =>
  inspectOriginalKickCancellationEvidence(events, binding);
const byKind = (events: RuntimeEvent[], kind: string) =>
  events.find((event) => String(event.kind) === kind)!;

test('direct budget source pending and actual combined reason prove distinct CROSS/CANCEL facts', () => {
  const events = input(),
    before = JSON.stringify(events);
  const evidence = observe(events);
  const cross = assertKickBudgetPending(evidence),
    cancel = assertKickBudgetCancellation(evidence);
  assert.equal(cross.requestId, binding.confirmationRequestId);
  assert.deepEqual(cross.requestBudgetSourceWindowMs, [60_001.3, 60_001.4]);
  assert.equal(cancel.requestDeadlineTriggered, false);
  assert.equal(cancel.operationScopeTriggered, false);
  assert.equal(cancel.kickLockScopeTriggered, false);
  assert.equal(cancel.exclusiveFetchFailureCause, 'NOT_ASSERTED');
  assert.deepEqual(cancel.reasonMatchedSources, ['caller', 'activity-budget']);
  assert.equal(JSON.stringify(events), before, 'oracle must retain original event bytes/fields');
});

test('TimeoutError, gateway closure or later terminal cannot fabricate actual signal provenance', () => {
  const events = input();
  for (const event of events)
    if (String(event.kind).startsWith('kick-confirmation-')) {
      event.abortedSources = [];
      event.reasonMatchedSources = [];
    }
  events.push(
    fact('agent-termination-decided', 11, 60_020, {
      endReason: 'wall_clock',
      decisionWindowMs: [60_019, 60_020],
      gatewayClosedBeforeFinish: true,
    }),
  );
  assert.throws(() => assertKickBudgetPending(observe(events)), BlockedError);
  const noMatchingReason = input();
  byKind(noMatchingReason, 'kick-confirmation-combined-aborted').reasonMatchedSources = ['caller'];
  assert.doesNotThrow(() => assertKickBudgetPending(observe(noMatchingReason)));
  assert.throws(() => assertKickBudgetCancellation(observe(noMatchingReason)), BlockedError);
});

test('actual process start/PID/domain and original tool/request identity must all match', () => {
  for (const patch of [
    { applicationPid: 102 },
    { clockDomain: 'process-performance:101:another-clock-domain' },
    { toolUseId: 'other-tool' },
    { stepId: 'run:4' },
    { requestId: 'other-request' },
  ]) {
    const events = input();
    Object.assign(byKind(events, 'kick-confirmation-fetch-settled'), patch);
    assert.throws(() => observe(events), BlockedError);
  }
  assert.throws(
    () =>
      inspectOriginalKickCancellationEvidence(input(), {
        ...binding,
        applicationStarted: '2026-10-02T01:00:00.000Z',
      }),
    BlockedError,
  );
  assert.throws(
    () =>
      inspectOriginalKickCancellationEvidence(input(), {
        ...binding,
        validatedProvenance: {
          ...binding.validatedProvenance,
          source: 'retained-after-process-exit',
        },
      }),
    BlockedError,
  );
  const truncated = input();
  truncated[0]!.droppedThroughSourceSeq = 1;
  assert.throws(() => observe(truncated), BlockedError);
});

test('two confirmation requests or missing true POST 504 completion cannot pass a combined scenario', () => {
  const duplicate = input();
  duplicate.push(
    remote('dispatch', 'confirmation', 11, 60_010, {
      requestId: 'second-confirmation',
      fetchPending: true,
    }),
  );
  assert.throws(() => observe(duplicate), BlockedError);
  const no504 = input();
  byKind(no504, 'kick-post-request-settled').responseStatus = 502;
  assert.throws(() => observe(no504), BlockedError);
  const incomplete = input().filter((event) => String(event.kind) !== 'kick-post-response-body');
  assert.throws(() => observe(incomplete), BlockedError);
});

test('multiple actual aborts are preserved; composite aliases do not become independent root causes', () => {
  const events = input();
  const actual = ['request-deadline', 'operation', 'caller', 'kick-lock', 'activity-budget'];
  for (const event of events)
    if (Number(event.sourceSeq) >= 7) {
      event.abortedSources = [...actual];
      event.reasonMatchedSources = [...actual];
    }
  const result = assertKickBudgetCancellation(observe(events));
  assert.equal(result.requestDeadlineTriggered, true);
  assert.equal(result.operationScopeTriggered, true);
  assert.equal(result.kickLockScopeTriggered, true);
  assert.deepEqual(result.reasonMatchedSources, actual);
  assert.equal(result.exclusiveFetchFailureCause, 'NOT_ASSERTED');
  assert.equal('uniqueRootCause' in result, false);
});

test('already settled fetch, received headers, and clock-envelope contradiction remain blocked', () => {
  const notPending = input();
  byKind(notPending, 'kick-confirmation-source-aborted').fetchPending = false;
  assert.throws(() => assertKickBudgetPending(observe(notPending)), BlockedError);
  const received = input();
  received.push(remote('response-headers', 'confirmation', 11, 60_005, { responseStatus: 200 }));
  assert.throws(() => assertKickBudgetCancellation(observe(received)), BlockedError);
  const wrongWindow = input();
  byKind(wrongWindow, 'kick-confirmation-fetch-settled').observedWindowMs = [60_009, 60_010];
  assert.throws(() => observe(wrongWindow), BlockedError);
});

function activity(patch: Record<string, unknown> = {}): RuntimeEvent {
  const event = fact('activity-terminal', 1, 70_000, {
    creationOrEpochStartWindowMs: [1, 2],
    activityEndWindowMs: [60_001, 60_001],
    activeElapsedMs: [59_999, 60_000],
    includesUnsavedTail: true,
    epochIds: ['actual-epoch'],
    activityState: 'terminal',
    epochObservation: { continuous: true, startSource: 'run-creation' },
    ...patch,
  });
  delete event.monotonicMs;
  return event;
}
test('SQL BEGIN/COMMIT, projection, persisted values and online bounds do not narrow paused truth', () => {
  const events = [
    activity({
      activeElapsedMs: [59_999, 60_008],
      epochObservation: { continuous: false, startSource: 'run-creation' },
      persistedActiveMs: 59_990,
      onlineElapsedMs: [60_001, 60_007],
      transitionEvidence: [
        {
          phase: 'creation',
          transactionBoundaries: [
            { phase: 'BEGIN', edge: 'returned', windowMs: [1, 2] },
            { phase: 'COMMIT', edge: 'returned', windowMs: [3, 4] },
          ],
        },
        {
          phase: 'pause',
          pauseCause: 'kick-outcome-unknown',
          transactionBoundaries: [
            { phase: 'COMMIT', edge: 'returned', windowMs: [59_999, 59_999.1] },
          ],
        },
      ],
    }),
  ];
  const before = JSON.stringify(events);
  assert.throws(() => assertUnrefinedActivityBudget(events, binding), BlockedError);
  assert.equal(JSON.stringify(events), before);
});
test('proved lower overrun fails before missing continuity; complete upper bound uses exact 60000', () => {
  const overrun = activity({
    kind: 'activity-checkpoint',
    activityState: 'active',
    activeElapsedMs: [60_000.001, 60_002],
    epochObservation: { continuous: false, startSource: 'run-creation' },
  });
  assert.throws(
    () => assertUnrefinedActivityBudget([overrun], binding),
    (error) => error instanceof assert.AssertionError && /60000/.test(error.message),
  );
  assert.deepEqual(
    assertUnrefinedActivityBudget([activity()], binding).activeElapsedMs,
    [59_999, 60_000],
  );
  assert.throws(
    () =>
      assertUnrefinedActivityBudget([activity({ activeElapsedMs: [59_999, 60_000.001] })], binding),
    BlockedError,
  );
  assert.throws(
    () =>
      assertUnrefinedActivityBudget(
        [
          activity({
            includesUnsavedTail: false,
            activeElapsedMs: null,
            persistedActiveMs: 60_000,
          }),
        ],
        binding,
      ),
    BlockedError,
  );
});

test('real activity windows have no lifecycle monotonicMs; wrong process or missing own boundary blocks', () => {
  const actual = activity();
  assert.equal('monotonicMs' in actual, false);
  assert.doesNotThrow(() => assertUnrefinedActivityBudget([actual], binding));
  assert.throws(
    () => assertUnrefinedActivityBudget([activity({ applicationPid: 102 })], binding),
    BlockedError,
  );
  const missing = activity();
  delete missing.activityEndWindowMs;
  assert.throws(() => assertUnrefinedActivityBudget([missing], binding), BlockedError);
});

test('unmeasured early activity checkpoints cannot hide a later trusted lower-bound violation', () => {
  const earlier = activity({
    kind: 'activity-checkpoint',
    includesUnsavedTail: false,
    activeElapsedMs: null,
    activityEndWindowMs: null,
  });
  const later = activity({
    kind: 'activity-checkpoint',
    activityState: 'active',
    activityEndWindowMs: null,
    activeElapsedMs: [60007, 60016],
  });
  assert.throws(
    () => assertUnrefinedActivityBudget([earlier, later], binding),
    (e) => e instanceof assert.AssertionError && /60000/.test(e.message),
  );
});
