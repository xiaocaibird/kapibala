import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import { BlockedError } from '../../harness/security.js';
import {
  assertSingleEpochActivityBudget,
  assertSingleEpochLifecycleBudget,
  optionalActivityObservation,
} from '../support/agent-activity-budget.js';

const terminal = (patch: Partial<RuntimeEvent> = {}): RuntimeEvent => ({
  seq: 1,
  at: '2026-10-01T00:00:00.000Z',
  kind: 'activity-terminal',
  correlation: { kind: 'activity', groupId: 'group', runId: 'run', toolUseId: 'all-run-steps' },
  attemptId: 'actual-attempt',
  instancePid: 123,
  activeElapsedMs: [59_999, 60_000],
  includesUnsavedTail: true,
  epochIds: ['actual-epoch'],
  activityState: 'terminal',
  ...patch,
});

test('single-epoch budget accepts one-sided complete evidence despite broad REST polling', () => {
  assert.doesNotThrow(() =>
    assertSingleEpochActivityBudget([terminal()], [59_900, 60_138], 'wall_clock'),
  );
  assert.doesNotThrow(() =>
    assertSingleEpochActivityBudget([terminal()], [61_000, 62_000], 'wall_clock'),
  );
  assert.throws(
    () =>
      assertSingleEpochActivityBudget(
        [terminal({ activeElapsedMs: [59_999, 60_001] })],
        [59_900, 60_138],
        'wall_clock',
      ),
    BlockedError,
  );
});

test('proven overrun and contradictory independent upper bound fail', () => {
  for (const [event, online, pattern] of [
    [terminal({ activeElapsedMs: [60_001, 60_002] }), [59_900, 60_138], /超过原始60秒/],
    [terminal(), [59_000, 59_200], /证据矛盾/],
  ] as [RuntimeEvent, [number, number], RegExp][]) {
    assert.throws(
      () => assertSingleEpochActivityBudget([event], online, 'wall_clock'),
      (error: unknown) => !(error instanceof BlockedError) && pattern.test(String(error)),
    );
  }
});

test('an upper bound below sixty seconds proves the maximum without inventing a minimum', () => {
  assert.doesNotThrow(() =>
    assertSingleEpochActivityBudget(
      [terminal({ activeElapsedMs: [59_000, 59_100] })],
      [59_000, 59_200],
      'wall_clock',
    ),
  );
  // A long persistence/public visibility delay is not activity time.
  assert.doesNotThrow(() =>
    assertSingleEpochActivityBudget(
      [terminal({ activeElapsedMs: [59_000, 59_100] })],
      [90_000, 91_000],
      'wall_clock',
    ),
  );
});

test('missing terminal or complete creation/epoch truth cannot pass from local persisted samples', () => {
  for (const events of [
    [],
    [terminal({ kind: 'activity-checkpoint', activityState: 'active' })],
    [terminal({ includesUnsavedTail: false, activeElapsedMs: null, persistedActiveMs: 60_000 })],
    [terminal({ epochIds: [] })],
    [terminal({ epochIds: ['epoch-a', 'epoch-b'] })],
    [terminal({ kind: 'activity-checkpoint', epochIds: ['earlier-epoch'] }), terminal()],
  ])
    assert.throws(
      () => assertSingleEpochActivityBudget(events, [59_900, 60_200], 'wall_clock'),
      BlockedError,
    );
});

test('proved violation survives missing terminal or incomplete later evidence', () => {
  assert.throws(
    () => assertSingleEpochActivityBudget([], [59_000, 59_200], 'wall_clock'),
    BlockedError,
  );
  assert.throws(
    () =>
      assertSingleEpochActivityBudget(
        [
          terminal({
            kind: 'activity-checkpoint',
            activityState: 'active',
            activeElapsedMs: [60_001, 60_003],
          }),
          terminal({ seq: 2, includesUnsavedTail: false, activeElapsedMs: null }),
        ],
        [60_000, 60_200],
        'wall_clock',
      ),
    /超过原始60秒/,
  );
  assert.throws(
    () =>
      assertSingleEpochActivityBudget(
        [
          terminal({
            kind: 'activity-checkpoint',
            includesUnsavedTail: false,
            activeElapsedMs: null,
            epochIds: [],
            activityState: 'unknown',
          }),
          terminal({
            seq: 2,
            kind: 'activity-checkpoint',
            includesUnsavedTail: false,
            activeElapsedMs: null,
            activityState: 'recovery-paused',
          }),
        ],
        [60_000, 60_200],
        'wall_clock',
      ),
    /强恢复未满足/,
  );
});

test('optional observation defers only BLOCKED so independent public checks can continue', async () => {
  const missing: string[] = [];
  const unavailable = await optionalActivityObservation(
    'verify',
    async () => {
      throw new BlockedError('not configured');
    },
    missing,
  );
  assert.equal(unavailable, undefined);
  assert.match(missing[0]!, /verify.*not configured/);
  assert.throws(
    () => assertSingleEpochActivityBudget([], [59_900, 60_200], 'wall_clock'),
    BlockedError,
    'missing observation never becomes an acceptance PASS',
  );
  const failure = new assert.AssertionError({ message: 'real side effect violation' });
  await assert.rejects(
    optionalActivityObservation(
      'read',
      async () => {
        throw failure;
      },
      missing,
    ),
    (error: unknown) => error === failure,
  );
  assert.equal(missing.length, 1);
  assert.equal(
    await optionalActivityObservation('read', async () => 'actual evidence', missing),
    'actual evidence',
  );
});

const actualClock = {
  clockDomain: 'process-performance:123:11111111-1111-4111-8111-111111111111',
  applicationPid: 123,
  runId: 'run',
  groupId: 'group',
};
const decisionFacts = (): RuntimeEvent[] => [
  {
    ...terminal(),
    ...actualClock,
    seq: 1,
    kind: 'lifecycle-observation-attached',
    droppedThroughSourceSeq: 0,
  },
  { ...terminal(), ...actualClock, seq: 2, kind: 'agent-run-created', creationWindowMs: [0, 10] },
  {
    ...terminal(),
    ...actualClock,
    seq: 3,
    kind: 'agent-termination-decided',
    decisionWindowMs: [59_000, 59_010],
    attemptId: 'stop',
    status: 'failed',
    reason: 'wall_clock',
  },
  {
    ...terminal(),
    ...actualClock,
    seq: 4,
    kind: 'agent-terminal-committed',
    monotonicMs: [90_000, 90_000],
    attemptId: 'stop',
    status: 'failed',
    reason: 'wall_clock',
  },
];
test('capacity-style decision requires matching complete activity, not persisted sample or late public visibility', () => {
  const actual = terminal({ ...actualClock, activeElapsedMs: [58_999, 59_020] });
  assert.doesNotThrow(() => assertSingleEpochActivityBudget([actual], [0, 91_000], 'wall_clock'));
  const value = assertSingleEpochLifecycleBudget([actual], decisionFacts());
  assert.deepEqual(value.elapsed, [58_990, 59_010]);
  for (const patch of [
    { includesUnsavedTail: false, activeElapsedMs: null, persistedActiveMs: 59_000 },
    { epochIds: ['a', 'b'] },
    { applicationPid: 124 },
    { runId: 'other' },
    { clockDomain: 'other-clock' },
    { activityState: 'unknown' as const },
  ])
    assert.throws(
      () => assertSingleEpochLifecycleBudget([{ ...actual, ...patch }], decisionFacts()),
      BlockedError,
    );
  assert.throws(() => assertSingleEpochLifecycleBudget([], decisionFacts()), BlockedError);
  assert.throws(() => assertSingleEpochLifecycleBudget([actual], []), BlockedError);
  const late = decisionFacts();
  late[2]!.decisionWindowMs = [60_020, 60_030];
  assert.throws(() => assertSingleEpochLifecycleBudget([actual], late), /超过原始60000/);
});

test('missing or crossing activity evidence does not swallow independent decision violations', async () => {
  const missing: string[] = [];
  const actual = terminal({ ...actualClock, activeElapsedMs: [59_990, 60_030] });
  await optionalActivityObservation(
    'activity',
    async () => {
      assertSingleEpochActivityBudget([actual], [0, 61_000], 'wall_clock');
    },
    missing,
  );
  assert.equal(missing.length, 1);
  const late = decisionFacts();
  late[2]!.decisionWindowMs = [60_020, 60_030];
  await assert.rejects(
    optionalActivityObservation(
      'decision',
      async () => {
        assertSingleEpochLifecycleBudget([actual], late);
      },
      missing,
    ),
    /超过原始60000/,
  );
});

test('a real post-stop dispatch fails even without activity or terminal COMMIT', () => {
  const events = decisionFacts().slice(0, 3);
  events.push({
    ...terminal(),
    ...actualClock,
    seq: 4,
    kind: 'agent-turn-dispatched',
    monotonicMs: [59_011, 59_011],
    attemptId: 'late-turn',
  });
  assert.throws(
    () => assertSingleEpochLifecycleBudget([], events),
    (error: unknown) => !(error instanceof BlockedError) && /终止决定之后不得/.test(String(error)),
  );
});

test('a coarse activity-to-COMMIT bracket remains uncertain, not a proven late decision', () => {
  const coarse = terminal({ ...actualClock, activeElapsedMs: [58_990, 90_000] });
  assert.throws(
    () => assertSingleEpochActivityBudget([coarse], [0, 91_000], 'wall_clock'),
    BlockedError,
  );
  // The separately bound stop decision is before the maximum; its later paired
  // COMMIT is retained, never substituted as the decision's endpoint.
  assert.deepEqual(
    assertSingleEpochLifecycleBudget([coarse], decisionFacts()).elapsed,
    [58_990, 59_010],
  );
});
