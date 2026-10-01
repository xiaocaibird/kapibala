import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import { BlockedError } from '../../harness/security.js';
import {
  inspectOriginalKickCancellationEvidence,
  assertKickBudgetPending,
  assertKickBudgetCancellation,
  inspectKickWorkCancellationEvidence,
  assertKickWorkBudgetPending,
  assertKickWorkBudgetCancellation,
  type KickObservationBinding,
  type OriginalKickWorkCancellationEvidence,
} from '../../harness/first-round-observation-oracle.js';

// Pure independent QA facts only: this module starts no process, HTTP, DB or provider.
const binding: KickObservationBinding = {
  groupId: 'actual-group',
  runId: 'actual-run',
  stepId: 'actual-run:3',
  toolUseId: 'actual-kick-tool',
  attemptId: 'actual-execution-attempt',
  postRequestId: 'actual-post-request',
  confirmationRequestId: 'actual-confirmation-request',
  applicationPid: 123,
  applicationStarted: 'Fri Oct  2 04:00:00 2026',
  clockDomain: 'process-performance:123:unique-actual-domain',
  validatedProvenance: {
    source: 'live-bridge',
    applicationPid: 123,
    applicationStarted: 'Fri Oct  2 04:00:00 2026',
  },
};
function fact(
  kind: string,
  sourceSeq: number,
  time: number,
  patch: Record<string, unknown> = {},
): RuntimeEvent {
  return {
    seq: sourceSeq,
    at: '2026-10-01T20:00:00.000Z',
    kind,
    correlation: {
      kind: 'tool-wait',
      groupId: binding.groupId,
      runId: binding.runId,
      toolUseId: 'all-run-steps',
    },
    instancePid: 122,
    groupId: binding.groupId,
    runId: binding.runId,
    stepId: binding.stepId,
    toolUseId: binding.toolUseId,
    attemptId: binding.attemptId,
    applicationPid: binding.applicationPid,
    clockDomain: binding.clockDomain,
    clockUnit: 'ms',
    sourceSeq,
    monotonicMs: [time + 0.2, time + 0.2],
    ...patch,
  } as unknown as RuntimeEvent;
}
function input(actualSource: 'kick-work-budget' | 'activity-budget' = 'kick-work-budget') {
  const configured = ['request-deadline', 'operation', 'caller', 'kick-lock', actualSource];
  const matched = ['caller', actualSource];
  const remote = (
    stage: string,
    purpose: 'post' | 'confirmation',
    seq: number,
    time: number,
    patch: Record<string, unknown> = {},
  ) =>
    fact(`kick-${purpose}-${stage}`, seq, time, {
      method: purpose === 'post' ? 'POST' : 'GET',
      requestPurpose: purpose,
      requestId: purpose === 'post' ? binding.postRequestId : binding.confirmationRequestId,
      timeoutMs: 15_000,
      configuredSources: [...configured],
      abortedSources: [],
      reasonMatchedSources: [],
      fetchPending: false,
      bodyPending: false,
      observedAtMonoNs: String(1_000_000_000 + seq),
      observedWindowMs: [time, time + 0.1],
      ...patch,
    });
  return [
    fact('lifecycle-observation-attached', 1, 70_000, {
      historyScope: 'this-process-only',
      includesPriorProcessHistory: false,
      droppedThroughSourceSeq: 0,
      resourceId: binding.runId,
    }),
    remote('dispatch', 'post', 2, 40_000, { fetchPending: true }),
    remote('response-body', 'post', 3, 43_000, { responseStatus: 504 }),
    remote('request-settled', 'post', 4, 43_001, { responseStatus: 504, outcome: 'rejected' }),
    remote('dispatch', 'confirmation', 5, 45_101, { fetchPending: true }),
    fact(
      actualSource === 'kick-work-budget'
        ? 'kick-work-budget-signal-aborted'
        : 'kick-budget-signal-aborted',
      6,
      58_000,
      {
        source: actualSource,
        signalSource: actualSource,
        budgetMs: 20_000,
        workBudgetMs: 18_000,
        settlementBudgetMs: 2_000,
        signalObservedAtMonoNs: '1000000006',
        signalObservedWindowMs: [58_000, 58_000.1],
      },
    ),
    remote('source-aborted', 'confirmation', 7, 58_001, {
      source: actualSource,
      fetchPending: true,
      abortedSources: [...matched],
      reasonMatchedSources: [...matched],
    }),
    remote('combined-aborted', 'confirmation', 8, 58_002, {
      fetchPending: true,
      abortedSources: [...matched],
      reasonMatchedSources: [...matched],
    }),
    remote('fetch-settled', 'confirmation', 9, 58_003, {
      outcome: 'rejected',
      abortedSources: [...matched],
      reasonMatchedSources: [...matched],
      errorName: 'TimeoutError',
    }),
    remote('request-settled', 'confirmation', 10, 58_004, {
      outcome: 'rejected',
      abortedSources: [...matched],
      reasonMatchedSources: [...matched],
      errorName: 'TimeoutError',
    }),
  ];
}
const signal = (events: RuntimeEvent[]) =>
  events.find((event) => String(event.kind) === 'kick-work-budget-signal-aborted')!;
const byKind = (events: RuntimeEvent[], kind: string) =>
  events.find((event) => String(event.kind) === kind)!;
const inspectWork = (events: RuntimeEvent[]) =>
  inspectKickWorkCancellationEvidence(events, binding);

test('work has an independent truthful source/proof, no hard listener is required or manufactured', () => {
  const events = input(),
    before = JSON.stringify(events);
  const evidence = inspectWork(events);
  assert.equal(evidence.actualSource, 'kick-work-budget');
  assert.equal(evidence.budgetSignal, signal(events), 'retain the original raw event reference');
  assert.equal(evidence.confirmation[0], events[4], 'retain original remote references');
  assert.equal(String(evidence.budgetSignal.kind), 'kick-work-budget-signal-aborted');
  assert.equal(evidence.workBudgetMs, 18_000);
  assert.equal(evidence.settlementBudgetMs, 2_000);
  const pending = assertKickWorkBudgetPending(evidence);
  const cancellation = assertKickWorkBudgetCancellation(evidence);
  assert.equal(pending.actualSource, 'kick-work-budget');
  assert.match(pending.proof, /actual-kick-work-budget/);
  assert.match(cancellation.proof, /original-kick-work-budget/);
  assert.equal(cancellation.exclusiveFetchFailureCause, 'NOT_ASSERTED');
  assert.equal(JSON.stringify(events), before);
  assert.equal(
    events.some((event) => String(event.kind) === 'kick-budget-signal-aborted'),
    false,
  );
});

test('hard/work interchange is blocked at both inspection and assertion entrances; old hard still works', () => {
  const hardEvents = input('activity-budget');
  const hard = inspectOriginalKickCancellationEvidence(hardEvents, binding);
  assert.doesNotThrow(() => assertKickBudgetPending(hard));
  assert.doesNotThrow(() => assertKickBudgetCancellation(hard));
  assert.throws(() => inspectWork(hardEvents), BlockedError);
  assert.throws(() => inspectOriginalKickCancellationEvidence(input(), binding), BlockedError);
  const work = inspectWork(input());
  assert.throws(() => assertKickBudgetPending(work), BlockedError);
  assert.throws(() => assertKickBudgetCancellation(work), BlockedError);
  const wrongWork = {
    ...hard,
    actualSource: 'kick-work-budget',
    budgetMs: 20_000,
    workBudgetMs: 18_000,
    settlementBudgetMs: 2_000,
  } as OriginalKickWorkCancellationEvidence;
  assert.throws(() => assertKickWorkBudgetPending(wrongWork), BlockedError);
  assert.throws(() => assertKickWorkBudgetCancellation(wrongWork), BlockedError);
});

test('both real listeners remain separate and neither is misclassified as an HTTP request', () => {
  const events = input();
  const hard = fact('kick-budget-signal-aborted', 11, 60_000, {
    source: 'activity-budget',
    signalSource: 'activity-budget',
    budgetMs: 20_000,
    workBudgetMs: 18_000,
    settlementBudgetMs: 2_000,
    signalObservedAtMonoNs: '1000000011',
    signalObservedWindowMs: [60_000, 60_000.1],
  });
  events.push(hard);
  const evidence = inspectWork(events);
  assert.equal(evidence.budgetSignal, signal(events));
  assert.ok(!evidence.post.includes(hard) && !evidence.confirmation.includes(hard));
  assert.doesNotThrow(() => assertKickWorkBudgetCancellation(evidence));
  assert.throws(
    () => inspectOriginalKickCancellationEvidence(events, binding),
    BlockedError,
    'the work-only HTTP source cannot be relabeled as the distinct hard signal',
  );
});

test('work source/signalSource contradictions and incomplete or inconsistent allocations stay blocked', () => {
  const patches: Record<string, unknown>[] = [
    { source: 'activity-budget' },
    { signalSource: 'activity-budget' },
    { signalSource: undefined },
    { budgetMs: undefined },
    { workBudgetMs: undefined },
    { settlementBudgetMs: undefined },
    { workBudgetMs: -1 },
    { settlementBudgetMs: 0 },
    { budgetMs: Infinity },
    { workBudgetMs: 19_000 },
    { budgetMs: 60_001 },
  ];
  for (const patch of patches) {
    const events = input();
    Object.assign(signal(events), patch);
    assert.throws(() => inspectWork(events), BlockedError, JSON.stringify(patch));
  }
});

test('same request/attempt/step/process provenance is required, duplicate GET identities cannot pass', () => {
  for (const patch of [
    { requestId: 'foreign-request' },
    { attemptId: 'foreign-attempt' },
    { stepId: 'actual-run:4' },
    { toolUseId: 'another-tool' },
    { applicationPid: 124 },
    { clockDomain: 'process-performance:123:foreign-domain' },
  ]) {
    const events = input();
    Object.assign(byKind(events, 'kick-confirmation-dispatch'), patch);
    assert.throws(() => inspectWork(events), BlockedError);
  }
  assert.throws(
    () =>
      inspectKickWorkCancellationEvidence(input(), {
        ...binding,
        applicationStarted: 'Fri Oct  2 05:00:00 2026',
      }),
    BlockedError,
  );
  const duplicate = input();
  duplicate.push(
    fact('kick-confirmation-dispatch', 11, 58_010, {
      requestPurpose: 'confirmation',
      method: 'GET',
      requestId: 'another-GET',
      timeoutMs: 15_000,
      observedAtMonoNs: '1000000011',
      observedWindowMs: [58_010, 58_010.1],
      fetchPending: true,
      bodyPending: false,
      configuredSources: ['request-deadline', 'kick-work-budget'],
      abortedSources: [],
      reasonMatchedSources: [],
    }),
  );
  assert.throws(() => inspectWork(duplicate), BlockedError);
});

test('source sequence, original 504 to GET to work, and real observation brackets cannot be spliced', () => {
  const seq = input();
  byKind(seq, 'kick-confirmation-source-aborted').sourceSeq = 5;
  assert.throws(() => inspectWork(seq), BlockedError);
  const reordered = input();
  [reordered[6], reordered[7]] = [reordered[7]!, reordered[6]!];
  assert.throws(() => inspectWork(reordered), BlockedError);
  const overlap = input();
  byKind(overlap, 'kick-confirmation-source-aborted').observedWindowMs = [58_000, 58_001.1];
  assert.throws(() => inspectWork(overlap), BlockedError);
  const preGet = input();
  signal(preGet).signalObservedWindowMs = [44_000, 44_000.1];
  assert.throws(() => inspectWork(preGet), BlockedError);
  const false504 = input();
  byKind(false504, 'kick-post-response-body').responseStatus = 200;
  assert.throws(() => inspectWork(false504), BlockedError);
});

test('no direct pending or no actual combined work identity is blocked, even with TimeoutError and close', () => {
  const notPending = input();
  byKind(notPending, 'kick-confirmation-source-aborted').fetchPending = false;
  assert.throws(() => assertKickWorkBudgetPending(inspectWork(notPending)), BlockedError);
  const deadlineOnly = input();
  for (const event of deadlineOnly)
    if (Number(event.sourceSeq) >= 7) {
      event.abortedSources = ['request-deadline', 'caller', 'kick-work-budget'];
      event.reasonMatchedSources = ['request-deadline'];
      event.gatewayClosedBeforeFinish = true;
    }
  const evidence = inspectWork(deadlineOnly);
  assert.doesNotThrow(() => assertKickWorkBudgetPending(evidence));
  assert.throws(() => assertKickWorkBudgetCancellation(evidence), BlockedError);
});

test('mixed deadline/operation/lock aborts and aliases are retained without work-exclusive root cause', () => {
  const events = input();
  const all = ['request-deadline', 'operation', 'caller', 'kick-lock', 'kick-work-budget'];
  for (const event of events)
    if (Number(event.sourceSeq) >= 7) {
      event.abortedSources = [...all];
      event.reasonMatchedSources = [...all];
    }
  const result = assertKickWorkBudgetCancellation(inspectWork(events));
  assert.equal(result.requestDeadlineTriggered, true);
  assert.equal(result.operationScopeTriggered, true);
  assert.equal(result.kickLockScopeTriggered, true);
  assert.deepEqual(result.reasonMatchedSources, all);
  assert.equal(result.actualSource, 'kick-work-budget');
  assert.equal(result.exclusiveFetchFailureCause, 'NOT_ASSERTED');
  assert.equal('uniqueRootCause' in result, false);
});
