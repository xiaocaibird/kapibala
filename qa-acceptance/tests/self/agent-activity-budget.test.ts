import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import { BlockedError } from '../../harness/security.js';
import {
  assertSingleEpochActivityBudget,
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

test('proven overrun, premature wall_clock and contradictory independent upper bound fail', () => {
  for (const [event, online, pattern] of [
    [terminal({ activeElapsedMs: [60_001, 60_002] }), [59_900, 60_138], /超过原始60秒/],
    [terminal({ activeElapsedMs: [59_000, 59_100] }), [59_000, 59_200], /提前宣告/],
    [terminal(), [59_000, 59_200], /证据矛盾/],
  ] as [RuntimeEvent, [number, number], RegExp][]) {
    assert.throws(
      () => assertSingleEpochActivityBudget([event], online, 'wall_clock'),
      (error: unknown) => !(error instanceof BlockedError) && pattern.test(String(error)),
    );
  }
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
    /提前宣告/,
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
