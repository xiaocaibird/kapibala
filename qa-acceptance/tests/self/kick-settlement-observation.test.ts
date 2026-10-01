import test from 'node:test';
import assert from 'node:assert/strict';
import { assertKickSettlementUpperBound } from '../../harness/kick-settlement-observation.js';
import type { ProcessObservationBinding } from '../../harness/first-round-observation-oracle.js';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import { BlockedError } from '../../harness/security.js';

// Pure synthetic QA negatives; no SUT/DB/network/clock manipulation is executed.
const binding: ProcessObservationBinding = {
  groupId: 'g',
  runId: 'r',
  applicationPid: 101,
  applicationStarted: 'actual-start',
  clockDomain: 'process-performance:101:one-domain',
  validatedProvenance: {
    source: 'live-bridge',
    applicationPid: 101,
    applicationStarted: 'actual-start',
  },
};
function input(): RuntimeEvent[] {
  const event = (kind: string, seq: number, time: number, fields: Record<string, unknown>) =>
    ({
      ...binding,
      kind,
      seq,
      sourceSeq: seq,
      at: '2026-10-02T00:00:00.000Z',
      clockUnit: 'ms',
      monotonicMs: [time, time],
      ...fields,
    }) as unknown as RuntimeEvent;
  const boundary = (phase: string, edge: string, start: number, end: number) => ({
    phase,
    edge,
    windowMs: [start, end],
    backendPid: 77,
    transactionAttemptId: 'real-terminal-tx',
  });
  return [
    event('lifecycle-observation-attached', 1, 59000, {
      historyScope: 'this-process-only',
      includesPriorProcessHistory: false,
      droppedThroughSourceSeq: 0,
      resourceId: 'r',
    }),
    event('agent-run-created', 2, 100, {
      creationWindowMs: [0, 90],
      commitBoundary: 'outer-commit-confirmed',
    }),
    event('agent-termination-decided', 3, 57920, {
      attemptId: 'finish-attempt',
      decisionWindowMs: [57900, 57910],
      status: 'failed',
      reason: 'wall_clock',
    }),
    event('agent-terminal-committed', 4, 58030, {
      attemptId: 'finish-attempt',
      status: 'failed',
      reason: 'wall_clock',
      commitBoundary: 'outer-commit-confirmed',
      transactionBoundaries: [
        boundary('begin', 'returned', 57930, 57935),
        boundary('run-terminal-update', 'called', 57940, 57940),
        boundary('run-terminal-update', 'returned', 57940, 57950),
        boundary('commit', 'called', 58000, 58000),
        boundary('commit', 'returned', 58000, 58020),
      ],
    }),
  ];
}
test('actual original creation-to-COMMIT upper bound is sufficient despite pause semantics', () => {
  assert.deepEqual(assertKickSettlementUpperBound(input(), binding).elapsed, [57910, 58020]);
});
test('a COMMIT tail beyond60s is inconclusive, not an invented activity FAIL', () => {
  const es = input();
  es[3]!.monotonicMs = [60031, 60031];
  (es[3]!.transactionBoundaries as { windowMs: number[] }[]).at(-1)!.windowMs = [58000, 60020];
  assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
});
test('COMMIT only called never substitutes for returned', () => {
  const es = input();
  (es[3]!.transactionBoundaries as unknown[]).pop();
  assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
});
test('another PG transaction cannot supply terminal acknowledgement', () => {
  const es = input();
  (es[3]!.transactionBoundaries as { transactionAttemptId: string }[]).at(
    -1,
  )!.transactionAttemptId = 'other';
  assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
});
test('another backend cannot supply terminal acknowledgement', () => {
  const es = input();
  (es[3]!.transactionBoundaries as { backendPid: number }[]).at(-1)!.backendPid = 88;
  assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
});
test('a retained stopped process cannot be presented as live provenance', () => {
  const b = structuredClone(binding);
  b.validatedProvenance.source = 'retained-after-process-exit';
  assert.throws(() => assertKickSettlementUpperBound(input(), b), BlockedError);
});
test('mixed epochs or another run cannot be subtracted as one clock', () => {
  for (const patch of [
    { applicationPid: 202 },
    { runId: 'other' },
    { clockDomain: 'process-performance:101:another' },
  ]) {
    const es = input();
    Object.assign(es[3]!, patch);
    assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
  }
});
test('truncated actual history cannot create an upper-bound PASS', () => {
  const es = input();
  es[0]!.droppedThroughSourceSeq = 4;
  assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
});
test('COMMIT before terminal update completes is not a durable terminal proof', () => {
  const es = input();
  (es[3]!.transactionBoundaries as { windowMs: number[] }[])[3]!.windowMs = [57945, 57945];
  assert.throws(() => assertKickSettlementUpperBound(es, binding), BlockedError);
});
test('a later dispatch is a true order FAIL before incomplete COMMIT evidence', () => {
  const es = input();
  const turn = {
    ...es[3]!,
    kind: 'agent-turn-dispatched',
    seq: 5,
    sourceSeq: 5,
    monotonicMs: [58035, 58035],
  } as RuntimeEvent;
  es.push(turn);
  (es[3]!.transactionBoundaries as unknown[]).pop();
  assert.throws(() => assertKickSettlementUpperBound(es, binding), assert.AssertionError);
});
