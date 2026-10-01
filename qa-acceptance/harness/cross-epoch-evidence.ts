import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { BlockedError } from './security.js';
import {
  assertNoRecoveryPause,
  type MeasuredRuntimeSnapshot,
  type RuntimeEvent,
} from './runtime-observation.js';
import { assertNoDispatchAfterStop, observationInterval } from './lifecycle-observation.js';

type Bounds = [number, number];
export interface ApplicationExitEvidence {
  parentClockDomain: string;
  applicationPid: number;
  applicationStarted: string;
  guardianPid: number;
  signal: 'SIGKILL';
  signalRequestedBeforeMs: number;
  processExitObservedAfterMs: number;
  exitObservation: 'owned-process-confirmed-absent' | 'owned-process-identity-replaced';
}
export interface CrossEpochInput {
  beforeKill: [MeasuredRuntimeSnapshot, MeasuredRuntimeSnapshot];
  afterRecovery: MeasuredRuntimeSnapshot;
  exited: ApplicationExitEvidence;
  startupWindowMs: Bounds;
  /** Separate actual stop/COMMIT stream. Public GET timing is never substituted. */
  recoveredLifecycle: readonly RuntimeEvent[];
}
function need(value: unknown, reason: string): asserts value {
  if (!value) throw new BlockedError(`跨epoch证据：${reason}`);
}
const span = (start: Bounds, end: Bounds): Bounds => {
  need(end[0] >= start[0] && end[1] >= start[1], '起止逆序');
  return [Math.max(0, end[0] - start[1]), end[1] - start[0]];
};
const add = (a: Bounds, b: Bounds): Bounds => [a[0] + b[0], a[1] + b[1]];
function calibration(value: MeasuredRuntimeSnapshot) {
  const parent = observationInterval(value.parentWindowMs);
  const { clockObservation: clock, snapshotProvenance: provenance } = value.snapshot;
  need(value.parentClockDomain && clock && provenance, '缺少真实父时钟/应用读数/来源');
  need(provenance.source === 'live-bridge', '退出后缓存不得用于实时校准');
  need(
    clock.applicationPid === provenance.applicationPid &&
      clock.clockUnit === 'ms' &&
      Number.isSafeInteger(clock.applicationPid) &&
      clock.applicationPid > 0 &&
      typeof provenance.applicationStarted === 'string' &&
      provenance.applicationStarted.trim() &&
      typeof clock.clockDomain === 'string' &&
      clock.clockDomain.trim() &&
      Number.isFinite(clock.monotonicMs) &&
      clock.monotonicMs >= 0,
    '时钟和实际身份不匹配',
  );
  return {
    clock,
    provenance,
    offset: [parent[0] - clock.monotonicMs, parent[1] - clock.monotonicMs] as Bounds,
  };
}
function mapped(window: Bounds, offset: Bounds): Bounds {
  return observationInterval([window[0] + offset[0], window[1] + offset[1]]);
}
/** Only the known initial zero-epoch lookup can precede actual acquisition.
 * Once acquired, every event must preserve the same complete continuous epoch. */
function epoch(value: MeasuredRuntimeSnapshot, startSource: 'run-creation' | 'clock-acquisition') {
  const { snapshot } = value;
  const c = calibration(value);
  assertNoRecoveryPause(snapshot.events);
  need(snapshot.correlation.kind === 'activity', '选择器不是实际活动run');
  const events = snapshot.events;
  let acquired = false;
  let first: RuntimeEvent | undefined;
  for (const event of events) {
    need(
      event.correlation.kind === 'activity' &&
        isDeepStrictEqual(event.correlation, snapshot.correlation) &&
        event.groupId === snapshot.correlation.groupId &&
        event.runId === snapshot.correlation.runId &&
        event.applicationPid === c.clock.applicationPid &&
        event.clockDomain === c.clock.clockDomain &&
        event.clockUnit === 'ms' &&
        event.instancePid === snapshot.binding.pid,
      '活动流混入其他run/group/应用时钟/guardian',
    );
    if (
      !acquired &&
      startSource === 'clock-acquisition' &&
      event.epochIds?.length === 0 &&
      event.activityState === 'unknown' &&
      event.epochObservation?.startSource === 'unwitnessed'
    )
      continue;
    need(
      event.epochIds?.length === 1 &&
        event.epochObservation?.continuous === true &&
        event.epochObservation.startSource === startSource &&
        ['active', 'terminal'].includes(String(event.activityState)),
      'epoch缺真实起点或连续性/包含缺段',
    );
    if (first)
      need(
        event.epochIds[0] === first.epochIds![0] &&
          isDeepStrictEqual(event.creationOrEpochStartWindowMs, first.creationOrEpochStartWindowMs),
        '所有权切换或起点被重建',
      );
    first ??= event;
    acquired = true;
    need(
      event.includesUnsavedTail === (startSource === 'run-creation'),
      '旧段须完整，新段不得伪称全run尾段已继承',
    );
  }
  need(first, '没有实际观察到epoch');
  const last = events.at(-1)!;
  const start = observationInterval(first.creationOrEpochStartWindowMs);
  need(start[1] <= c.clock.monotonicMs, '起点晚于本次真实时钟读数');
  return { ...c, first, last, start, id: first.epochIds![0]!, events };
}
/** Verify live calibration and the safe hold before any destructive fault. */
export function prepareCrossEpochKill(
  measurements: [MeasuredRuntimeSnapshot, MeasuredRuntimeSnapshot],
) {
  const [before, finalBefore] = measurements;
  const old = epoch(finalBefore, 'run-creation'),
    previous = epoch(before, 'run-creation');
  need(
    before.parentClockDomain === finalBefore.parentClockDomain &&
      before.parentWindowMs[1] <= finalBefore.parentWindowMs[0] &&
      previous.id === old.id &&
      isDeepStrictEqual(previous.provenance, old.provenance) &&
      previous.clock.clockDomain === old.clock.clockDomain &&
      old.clock.monotonicMs > previous.clock.monotonicMs &&
      before.snapshot.events.every((event, i) =>
        isDeepStrictEqual(event, finalBefore.snapshot.events[i]),
      ),
    '两次live校准没有前进、身份漂移或历史改变',
  );
  const offset: Bounds = [
    Math.max(previous.offset[0], old.offset[0]),
    Math.min(previous.offset[1], old.offset[1]),
  ];
  need(offset[0] <= offset[1], '同一应用时钟两次映射不相容，不可假设稳定速率');
  need(
    finalBefore.snapshot.state === 'held' &&
      old.last.activityState === 'active' &&
      old.events.some(
        (e) =>
          e.kind === 'activity-safe-held' &&
          e.continuationDurable === true &&
          e.remoteInFlightCount === 0,
      ),
    '原epoch未在真实可恢复且无在途副作用的屏障保持',
  );
  return { old, offset };
}
/** Observe the same hard lower bound before terminal/COMMIT availability.
 * A current live lifecycle read must follow the measured activity read. When a
 * real stop already exists, its endpoint replaces later active bookkeeping. */
export function assertCrossEpochLiveLower(input: {
  beforeKill: [MeasuredRuntimeSnapshot, MeasuredRuntimeSnapshot];
  exited: ApplicationExitEvidence;
  current: MeasuredRuntimeSnapshot;
  lifecycle: MeasuredRuntimeSnapshot['snapshot'];
}): void {
  assertNoDispatchAfterStop(input.lifecycle.events);
  assertNoRecoveryPause(input.current.snapshot.events);
  const { old, offset } = prepareCrossEpochKill(input.beforeKill);
  const next = epoch(input.current, 'clock-acquisition');
  const prior = input.beforeKill[1];
  need(
    input.current.parentClockDomain === prior.parentClockDomain &&
      input.exited.parentClockDomain === prior.parentClockDomain &&
      input.exited.guardianPid === prior.snapshot.binding.pid &&
      input.exited.applicationPid === old.clock.applicationPid &&
      input.exited.applicationStarted === old.provenance.applicationStarted &&
      input.exited.signal === 'SIGKILL' &&
      ['owned-process-confirmed-absent', 'owned-process-identity-replaced'].includes(
        input.exited.exitObservation,
      ),
    '实时下界缺真实同域退出',
  );
  need(
    isDeepStrictEqual(prior.snapshot.correlation, input.current.snapshot.correlation) &&
      prior.snapshot.binding.revision === input.current.snapshot.binding.revision &&
      prior.snapshot.binding.observedOwnerToken ===
        input.current.snapshot.binding.observedOwnerToken &&
      old.id !== next.id &&
      old.clock.applicationPid !== next.clock.applicationPid &&
      old.clock.clockDomain !== next.clock.clockDomain,
    '实时下界跨run/候选/owner或未形成新epoch',
  );
  const exited = observationInterval([
    input.exited.signalRequestedBeforeMs,
    input.exited.processExitObservedAfterMs,
  ]);
  need(
    prior.parentWindowMs[1] <= exited[0] && mapped(next.start, next.offset)[0] >= exited[1],
    '实时活动段顺序不成立',
  );
  const oldLower = span(mapped(old.start, offset), exited)[0];
  const source = input.lifecycle.snapshotProvenance;
  need(
    source?.source === 'live-bridge' &&
      source.applicationPid === next.clock.applicationPid &&
      source.applicationStarted === next.provenance.applicationStarted &&
      input.lifecycle.events[0]?.kind === 'lifecycle-observation-attached' &&
      input.lifecycle.events[0].droppedThroughSourceSeq === 0,
    '实时活动下界缺完整实时停止历史',
  );
  const decisions = input.lifecycle.events.filter((e) => e.kind === 'agent-termination-decided');
  let currentLower: number;
  if (decisions.length) {
    need(decisions.length === 1, '实时停止决定不唯一');
    const decision = decisions[0]!;
    need(
      decision.runId === next.last.runId &&
        decision.groupId === next.last.groupId &&
        decision.applicationPid === next.clock.applicationPid &&
        decision.clockDomain === next.clock.clockDomain,
      '实时停止决定身份不匹配',
    );
    currentLower = span(next.start, observationInterval(decision.decisionWindowMs))[0];
  } else {
    need(next.last.activityState === 'active', '缺停止决定且无真实进行中阶段');
    currentLower = Math.max(
      0,
      ...next.events
        .filter((e) => e.activityState === 'active')
        .map((e) => observationInterval(e.observedEpochActiveMs)[0]),
    );
  }
  assert.ok(oldLower + currentLower <= 60_000, '两个真实活动段安全下界已超过原始60000ms上限');
}
/** Independent QA interval arithmetic, not the engineering aggregator.
 * No latency symmetry, shared process clock origin, or fixed tail tolerance. */
export function collectCrossEpochEvidence(input: CrossEpochInput) {
  assertNoDispatchAfterStop(input.recoveredLifecycle);
  for (const measured of [...input.beforeKill, input.afterRecovery])
    assertNoRecoveryPause(measured.snapshot.events);
  const [before, finalBefore] = input.beforeKill;
  const { old, offset } = prepareCrossEpochKill(input.beforeKill);
  const next = epoch(input.afterRecovery, 'clock-acquisition');
  const parentClockDomain = finalBefore.parentClockDomain;
  need(
    input.afterRecovery.parentClockDomain === parentClockDomain &&
      input.exited.parentClockDomain === parentClockDomain,
    '跨父时钟域不得聚合',
  );
  need(
    isDeepStrictEqual(finalBefore.snapshot.correlation, input.afterRecovery.snapshot.correlation) &&
      finalBefore.snapshot.binding.revision === input.afterRecovery.snapshot.binding.revision &&
      finalBefore.snapshot.binding.observedOwnerToken ===
        input.afterRecovery.snapshot.binding.observedOwnerToken &&
      old.id !== next.id &&
      old.clock.applicationPid !== next.clock.applicationPid &&
      old.clock.clockDomain !== next.clock.clockDomain &&
      finalBefore.snapshot.binding.pid !== input.afterRecovery.snapshot.binding.pid,
    '恢复身份/候选不一致，或未形成两个实际epoch',
  );
  const exited = input.exited;
  need(
    exited.guardianPid === finalBefore.snapshot.binding.pid &&
      exited.applicationPid === old.clock.applicationPid &&
      exited.applicationStarted === old.provenance.applicationStarted &&
      exited.signal === 'SIGKILL' &&
      ['owned-process-confirmed-absent', 'owned-process-identity-replaced'].includes(
        exited.exitObservation,
      ),
    '退出没有核实实际应用身份，guardian退出不足',
  );
  const exitWindow = observationInterval([
    exited.signalRequestedBeforeMs,
    exited.processExitObservedAfterMs,
  ]);
  need(finalBefore.parentWindowMs[1] <= exitWindow[0], '实时校准必须在发出kill之前完成');
  const creation = mapped(old.start, offset);
  const oldActive = span(creation, exitWindow);
  need(
    next.last.kind === 'activity-terminal' && next.last.activityState === 'terminal',
    '新段缺真实终态边界',
  );
  const end = observationInterval(next.last.activityEndWindowMs);
  need(end[1] <= next.clock.monotonicMs, '终态边界晚于当前真实时钟读数');
  const newStart = mapped(next.start, next.offset),
    newEnd = mapped(end, next.offset);
  need(newStart[0] >= exitWindow[1], '两个实际进程活动段重叠或逆序');
  const missing: string[] = [];
  // These diagnostic/completeness obligations cannot hide the already proved
  // lower bound above the requirement. assertCrossEpochBudget orders verdicts.
  let startupGapMs: Bounds | null = null;
  let provenDowntimeMs: Bounds | null = null;
  try {
    const startup = observationInterval(input.startupWindowMs);
    need(
      startup[0] >= exitWindow[1] &&
        startup[1] <= input.afterRecovery.parentWindowMs[0] &&
        newStart[1] >= startup[0],
      '缺少有序真实启动窗',
    );
    provenDowntimeMs = span(exitWindow, [startup[0], startup[0]]);
    startupGapMs = [0, Math.max(0, newStart[1] - startup[0])];
  } catch (error) {
    if (!(error instanceof BlockedError)) throw error;
    missing.push(String(error));
  }
  let lastAcknowledgedSampleToExitMs: Bounds | null = null;
  const sample = old.last.lastSuccessfulSample;
  try {
    need(sample?.epochId === old.id, '未保留最后已确认采样');
    const point = observationInterval(sample.windowMs);
    need(point[0] >= old.start[0] && point[1] <= old.clock.monotonicMs, '最后确认采样不在原epoch');
    lastAcknowledgedSampleToExitMs = span(mapped(point, offset), exitWindow);
  } catch (error) {
    if (!(error instanceof BlockedError)) throw error;
    missing.push(String(error));
  }
  // A terminal witness may bracket finish/COMMIT, not the prior stop decision.
  // Never use that late lower endpoint as proof execution continued until then.
  const decisions = input.recoveredLifecycle.filter((e) => e.kind === 'agent-termination-decided');
  const commits = input.recoveredLifecycle.filter((e) => e.kind === 'agent-terminal-committed');
  let stopDecision: RuntimeEvent | null = null;
  let stopWindow: Bounds | null = null;
  try {
    need(decisions.length === 1, '缺唯一真实停止决定');
    const decision = decisions[0]!;
    need(
      decision.runId === next.last.runId &&
        decision.groupId === next.last.groupId &&
        decision.applicationPid === next.clock.applicationPid &&
        decision.clockDomain === next.clock.clockDomain,
      '停止决定没有关联本run实际应用时钟',
    );
    assert.equal(decision.status, 'failed', '真实停止决定须failed');
    assert.equal(decision.reason, 'wall_clock', '真实停止原因须wall_clock');
    const stop = observationInterval(decision.decisionWindowMs);
    need(stop[0] >= next.start[0] && stop[1] <= end[1], '停止决定不在实际接管到terminal包围范围');
    stopDecision = decision;
    stopWindow = stop;
  } catch (error) {
    if (!(error instanceof BlockedError)) throw error;
    missing.push(String(error));
  }
  try {
    need(
      input.recoveredLifecycle[0]?.kind === 'lifecycle-observation-attached' &&
        input.recoveredLifecycle[0].droppedThroughSourceSeq === 0 &&
        stopDecision &&
        commits.length === 1,
      '缺真实停止决定或同attempt终态COMMIT完整历史',
    );
    const commit = commits[0]!;
    need(
      commit.runId === next.last.runId &&
        commit.groupId === next.last.groupId &&
        commit.applicationPid === next.clock.applicationPid &&
        commit.clockDomain === next.clock.clockDomain &&
        commit.attemptId === stopDecision.attemptId &&
        commit.seq > stopDecision.seq,
      '停止决定与COMMIT身份不匹配',
    );
    assert.equal(commit.status, stopDecision.status);
    assert.equal(commit.reason, stopDecision.reason);
    need(stopWindow![1] <= observationInterval(commit.monotonicMs)[1], 'COMMIT早于真实停止决定');
  } catch (error) {
    if (!(error instanceof BlockedError)) throw error;
    missing.push(String(error));
  }
  // Historical active samples can include post-decision bookkeeping when the
  // decision history is missing. Only the live checker has contemporaneous
  // complete no-stop evidence; do not recreate that premise at final collection.
  const newActive: Bounds = stopWindow ? span(next.start, stopWindow) : [0, end[1] - next.start[0]];
  need(newActive[0] <= newActive[1], '真实active采样与terminal上界矛盾');
  const observedActiveMs = add(oldActive, newActive);
  return {
    parentClockDomain,
    oldEpochId: old.id,
    newEpochId: next.id,
    oldOffsetMs: offset,
    newOffsetMs: next.offset,
    creationParentMs: creation,
    exitWindowMs: exitWindow,
    newStartParentMs: newStart,
    newEndParentMs: newEnd,
    oldActiveMs: oldActive,
    newActiveMs: newActive,
    observedActiveMs,
    budgetEndpoint: stopWindow
      ? 'actual-termination-decision'
      : 'zero-new-lower-terminal-upper-incomplete',
    terminalStageActiveMs: span(next.start, end),
    provenDowntimeMs,
    startupGapMs,
    // Unknown initialization is counted at full upper bound, not waived.
    fullActiveMs: startupGapMs
      ? ([observedActiveMs[0], observedActiveMs[1] + startupGapMs[1]] as Bounds)
      : null,
    lastAcknowledgedSampleToExitMs,
    unsavedTailMs: lastAcknowledgedSampleToExitMs
      ? ([0, lastAcknowledgedSampleToExitMs[1]] as Bounds)
      : null,
    stopDecision,
    terminalCommit: commits[0] ?? null,
    missing,
    claim:
      '两段活动下界及保守全程上界；初始化空档未证非活动，已计入上界。采样尾段下界0不表示零丢失。',
  };
}
export function assertCrossEpochBudget(
  value: ReturnType<typeof collectCrossEpochEvidence>,
  budget = 60_000,
): void {
  assert.ok(value.observedActiveMs[0] <= budget, '两个真实活动段安全下界已超过原始60000ms上限');
  if (value.missing.length || !value.fullActiveMs)
    throw new BlockedError(`跨epoch完整性不足：${value.missing.join('；')}`);
  if (value.fullActiveMs[1] > budget)
    throw new BlockedError('完整活动保守区间跨60秒；启动空档不能默扣，不接受固定尾差容忍');
}
