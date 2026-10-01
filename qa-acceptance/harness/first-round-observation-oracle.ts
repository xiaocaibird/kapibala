import assert from 'node:assert/strict';
import type { RuntimeEvent, RuntimeSnapshot } from './runtime-observation.js';
import { BlockedError } from './security.js';

type Window = [number, number];
export interface ProcessObservationBinding {
  groupId: string;
  runId: string;
  applicationPid: number;
  applicationStarted: string;
  clockDomain: string;
  /** Actual live bridge provenance; never supplied by target configuration. */
  validatedProvenance: NonNullable<RuntimeSnapshot['snapshotProvenance']>;
}
export interface KickObservationBinding extends ProcessObservationBinding {
  toolUseId: string;
  stepId: string;
  attemptId: string;
  postRequestId: string;
  confirmationRequestId: string;
}
export interface OriginalKickCancellationEvidence {
  binding: KickObservationBinding;
  post: RuntimeEvent[];
  confirmation: RuntimeEvent[];
  budgetSignal: RuntimeEvent;
  budgetSignalWindowMs: Window;
  postSettled504: RuntimeEvent;
  confirmationDispatch: RuntimeEvent;
}
export interface KickPendingEvidence {
  proof: 'original-confirmation-fetch-pending-at-actual-budget-source-abort';
  budgetSignalWindowMs: Window;
  requestBudgetSourceWindowMs: Window;
  requestId: string;
  sourceSequence: number;
}
export interface KickCancellationEvidence {
  proof: 'actual-request-combined-signal-reason-matches-original-budget-source';
  requestId: string;
  budgetSourceWindowMs: Window;
  combinedAbortWindowMs: Window;
  fetchSettledWindowMs: Window;
  requestSettledWindowMs: Window;
  configuredSources: string[];
  abortedSources: string[];
  reasonMatchedSources: string[];
  requestDeadlineTriggered: boolean;
  operationScopeTriggered: boolean;
  kickLockScopeTriggered: boolean;
  /** caller, operation and kick-lock can be composite aliases. These arrays
   * retain facts and expressly do not enumerate independent root causes. */
  sourceAbortFacts: RuntimeEvent[];
  exclusiveFetchFailureCause: 'NOT_ASSERTED';
  transportCode?: string;
}
const name = (event: RuntimeEvent) => String(event.kind);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
function need(value: unknown, message: string): asserts value {
  if (!value) throw new BlockedError(`首轮观测：${message}`);
}
function window(value: unknown, label: string): Window {
  need(
    Array.isArray(value) &&
      value.length === 2 &&
      value.every((part) => typeof part === 'number' && Number.isFinite(part) && part >= 0) &&
      value[0] <= value[1],
    `${label}缺少真实有限有序毫秒包络`,
  );
  return [value[0], value[1]];
}
function strings(value: unknown, label: string): string[] {
  need(
    Array.isArray(value) && value.every(text) && new Set(value).size === value.length,
    `${label}必须保留不重复的实际来源集合`,
  );
  return [...value];
}
function one(events: readonly RuntimeEvent[], kind: string): RuntimeEvent {
  const found = events.filter((event) => name(event) === kind);
  need(found.length === 1, `${kind}必须恰有一次，当前${found.length}`);
  return found[0]!;
}
function processBound(
  event: RuntimeEvent,
  binding: ProcessObservationBinding,
  channel: 'lifecycle' | 'activity' = 'lifecycle',
): void {
  need(
    binding.validatedProvenance.source === 'live-bridge' &&
      Number.isSafeInteger(binding.applicationPid) &&
      binding.applicationPid > 0 &&
      binding.validatedProvenance.applicationPid === binding.applicationPid &&
      text(binding.applicationStarted) &&
      binding.validatedProvenance.applicationStarted === binding.applicationStarted &&
      text(binding.clockDomain) &&
      binding.clockDomain.startsWith(`process-performance:${binding.applicationPid}:`) &&
      event.applicationPid === binding.applicationPid &&
      event.clockDomain === binding.clockDomain &&
      event.clockUnit === 'ms',
    '事件与实际live进程PID/start/唯一时钟域未绑定',
  );
  // Start is bridge provenance, not an invented field on the original event.
  if (channel === 'lifecycle') window(event.monotonicMs, 'witness投递采样');
  else if (event.includesUnsavedTail === true && event.activeElapsedMs != null) {
    // The real activity channel has its own windows; never manufacture the
    // lifecycle channel's monotonicMs field on an original activity event.
    window(event.creationOrEpochStartWindowMs, '实际活动起点');
    // An active checkpoint has no stopped end yet. Its measured original
    // activeElapsedMs remains admissible lower-bound evidence. A stopped
    // checkpoint or terminal must carry its real end window.
    if (
      name(event) !== 'activity-checkpoint' ||
      event.activityState !== 'active' ||
      event.activityEndWindowMs != null
    )
      window(event.activityEndWindowMs, '实际活动终点');
  }
  if (name(event) !== 'lifecycle-observation-attached')
    need(
      event.groupId === binding.groupId && event.runId === binding.runId,
      '事件不属于原group/run',
    );
}
function sampledWindow(event: RuntimeEvent, budget = false): Window {
  const ns = budget ? event.signalObservedAtMonoNs : event.observedAtMonoNs;
  need(typeof ns === 'string' && /^\d+$/.test(ns), '缺少真实hrtime原始纳秒采样');
  const observed = window(
    budget ? event.signalObservedWindowMs : event.observedWindowMs,
    budget ? '原budget listener' : '原remote观察',
  );
  const delivered = window(event.monotonicMs, 'witness投递采样');
  need(observed[1] <= delivered[0], '观察包络晚于同域witness投递采样');
  // Nanoseconds are retained, never divided/subtracted as performance milliseconds.
  return observed;
}
function sourceSets(event: RuntimeEvent) {
  const configured = strings(event.configuredSources, 'configuredSources');
  const aborted = strings(event.abortedSources, 'abortedSources');
  const matched = strings(event.reasonMatchedSources, 'reasonMatchedSources');
  need(
    configured.includes('request-deadline') && configured.includes('activity-budget'),
    '原请求缺少实际deadline或activity-budget来源',
  );
  need(
    aborted.every((source) => configured.includes(source)) &&
      matched.every((source) => aborted.includes(source)),
    'signal来源集合相互矛盾',
  );
  return { configured, aborted, matched };
}

/** Consumes raw events from an independently validated append-only runtime lease.
 * No application modules, DB rows, developer test results or gateway guesses are used.
 * The caller separately binds these client IDs to the actual gateway ledger. */
export function inspectOriginalKickCancellationEvidence(
  events: readonly RuntimeEvent[],
  binding: KickObservationBinding,
): OriginalKickCancellationEvidence {
  const attached = one(events, 'lifecycle-observation-attached');
  processBound(attached, binding);
  need(
    attached.historyScope === 'this-process-only' &&
      attached.includesPriorProcessHistory === false &&
      attached.droppedThroughSourceSeq === 0 &&
      attached.resourceId === binding.runId,
    '原run历史缺失/截断或租约身份不一致',
  );
  need(
    text(binding.toolUseId) &&
      text(binding.stepId) &&
      text(binding.attemptId) &&
      text(binding.postRequestId) &&
      text(binding.confirmationRequestId) &&
      binding.postRequestId !== binding.confirmationRequestId,
    '原工具/执行/request身份不完整',
  );
  const relevant = events.filter(
    (event) => name(event).startsWith('kick-') && event.attemptId === binding.attemptId,
  );
  need(relevant.length > 0, '缺少原kick执行事实');
  for (const event of relevant) {
    processBound(event, binding);
    need(
      event.toolUseId === binding.toolUseId && event.stepId === binding.stepId,
      '同attempt混入其他tool/step',
    );
    need(Number.isSafeInteger(event.sourceSeq) && Number(event.sourceSeq) > 0, '缺少真实sourceSeq');
  }
  const budgetSignal = one(relevant, 'kick-budget-signal-aborted');
  need(
    budgetSignal.source === 'activity-budget' &&
      typeof budgetSignal.budgetMs === 'number' &&
      Number.isFinite(budgetSignal.budgetMs) &&
      budgetSignal.budgetMs > 0 &&
      budgetSignal.budgetMs <= 60_000,
    '原budget signal来源或原始余额无效',
  );
  const budgetSignalWindowMs = sampledWindow(budgetSignal, true);
  const remote = relevant.filter((event) => name(event) !== 'kick-budget-signal-aborted');
  for (const event of remote) {
    need(
      ['post', 'confirmation', 'projection'].includes(String(event.requestPurpose)),
      'remote事件缺少原请求用途',
    );
    const purpose = String(event.requestPurpose);
    need(
      name(event).startsWith(`kick-${purpose}-`) &&
        event.method === (purpose === 'post' ? 'POST' : 'GET') &&
        event.timeoutMs === 15_000 &&
        text(event.requestId) &&
        typeof event.fetchPending === 'boolean' &&
        typeof event.bodyPending === 'boolean',
      'remote方法/用途/原15秒deadline/pending/request身份不一致',
    );
    sampledWindow(event);
    sourceSets(event);
  }
  const post = remote.filter((event) => event.requestPurpose === 'post');
  const confirmation = remote.filter((event) => event.requestPurpose === 'confirmation');
  need(
    post.every((event) => event.requestId === binding.postRequestId) && post.length > 0,
    '原POST归属不唯一',
  );
  need(
    confirmation.every((event) => event.requestId === binding.confirmationRequestId) &&
      confirmation.length > 0,
    '原确认GET归属不唯一',
  );
  one(post, 'kick-post-dispatch');
  const postBody = one(post, 'kick-post-response-body');
  const postSettled504 = one(post, 'kick-post-request-settled');
  need(
    postBody.responseStatus === 504 &&
      postSettled504.responseStatus === 504 &&
      postSettled504.outcome === 'rejected' &&
      postSettled504.fetchPending === false &&
      postSettled504.bodyPending === false,
    '缺少原POST真实504完成并返回调用方的事实',
  );
  const confirmationDispatch = one(confirmation, 'kick-confirmation-dispatch');
  need(
    confirmationDispatch.fetchPending === true && confirmationDispatch.bodyPending === false,
    '原确认GET没有实际进入fetch等待',
  );
  need(
    Number(postSettled504.sourceSeq) < Number(confirmationDispatch.sourceSeq) &&
      sampledWindow(postSettled504)[1] <= sampledWindow(confirmationDispatch)[0] &&
      Number(confirmationDispatch.sourceSeq) < Number(budgetSignal.sourceSeq) &&
      sampledWindow(confirmationDispatch)[1] <= budgetSignalWindowMs[0],
    '原504→原确认GET→实际budget listener顺序未成立',
  );
  return {
    binding,
    post,
    confirmation,
    budgetSignal,
    budgetSignalWindowMs,
    postSettled504,
    confirmationDispatch,
  };
}

/** Direct pending positive proof. A later terminal marker or gateway close is
 * never substituted for the original budget signal. */
export function assertKickBudgetPending(
  evidence: OriginalKickCancellationEvidence,
): KickPendingEvidence {
  const source = one(
    evidence.confirmation.filter((event) => event.source === 'activity-budget'),
    'kick-confirmation-source-aborted',
  );
  const sets = sourceSets(source);
  need(
    sets.aborted.includes('activity-budget') &&
      source.fetchPending === true &&
      source.bodyPending === false,
    '原GET在实际budget来源abort时没有直接fetch pending正证',
  );
  need(
    Number(source.sourceSeq) > Number(evidence.budgetSignal.sourceSeq) &&
      sampledWindow(source)[0] >= evidence.budgetSignalWindowMs[0],
    '原budget listener与同一GET budget来源listener关联顺序缺失',
  );
  const sourceWindow = sampledWindow(source);
  const earlierSettle = evidence.confirmation.find(
    (event) =>
      ['kick-confirmation-fetch-settled', 'kick-confirmation-request-settled'].includes(
        name(event),
      ) && Number(event.sourceSeq) < Number(source.sourceSeq),
  );
  need(!earlierSettle, '原GET在budget来源listener前已经settled，pending事实矛盾');
  return {
    proof: 'original-confirmation-fetch-pending-at-actual-budget-source-abort',
    budgetSignalWindowMs: [...evidence.budgetSignalWindowMs],
    requestBudgetSourceWindowMs: sourceWindow,
    requestId: evidence.binding.confirmationRequestId,
    sourceSequence: Number(source.sourceSeq),
  };
}

/** Proves cancellation of the actual request signal by the original budget
 * identity and subsequent rejection. It does not guess a unique fetch error
 * cause when other scope signals or transport facts are also present. */
export function assertKickBudgetCancellation(
  evidence: OriginalKickCancellationEvidence,
): KickCancellationEvidence {
  const pending = assertKickBudgetPending(evidence);
  const combined = one(evidence.confirmation, 'kick-confirmation-combined-aborted');
  const fetch = one(evidence.confirmation, 'kick-confirmation-fetch-settled');
  const settled = one(evidence.confirmation, 'kick-confirmation-request-settled');
  for (const event of [combined, fetch, settled])
    need(
      sourceSets(event).matched.includes('activity-budget'),
      `${name(event)}没有实际组合reason与原budget signal对象身份匹配`,
    );
  need(
    combined.fetchPending === true &&
      combined.bodyPending === false &&
      fetch.outcome === 'rejected' &&
      fetch.fetchPending === false &&
      fetch.bodyPending === false &&
      settled.outcome === 'rejected' &&
      settled.fetchPending === false &&
      settled.bodyPending === false,
    '缺少原组合signal取消时pending与原fetch/request拒绝完成事实',
  );
  need(
    !evidence.confirmation.some((event) =>
      [
        'kick-confirmation-response-headers',
        'kick-confirmation-response-body',
        'kick-confirmation-body-settled',
      ].includes(name(event)),
    ),
    '该原确认GET已收到headers/body，本例无headers等待前提不成立',
  );
  const combinedWindow = sampledWindow(combined),
    fetchWindow = sampledWindow(fetch),
    settledWindow = sampledWindow(settled);
  need(
    Number(combined.sourceSeq) > Number(evidence.budgetSignal.sourceSeq) &&
      Number(fetch.sourceSeq) > Number(combined.sourceSeq) &&
      Number(settled.sourceSeq) > Number(fetch.sourceSeq) &&
      combinedWindow[1] <= fetchWindow[0] &&
      fetchWindow[1] <= settledWindow[0],
    '实际budget/combined abort→原fetch拒绝→原请求返回顺序缺失',
  );
  const atEnd = sourceSets(settled);
  const sourceAbortFacts = evidence.confirmation.filter(
    (event) => name(event) === 'kick-confirmation-source-aborted',
  );
  for (const event of sourceAbortFacts)
    need(
      text(event.source) && sourceSets(event).aborted.includes(event.source),
      'source-aborted回调与其真实来源集合不一致',
    );
  const triggered = new Set([
    ...atEnd.aborted,
    ...sourceAbortFacts.map((event) => String(event.source)),
  ]);
  return {
    proof: 'actual-request-combined-signal-reason-matches-original-budget-source',
    requestId: evidence.binding.confirmationRequestId,
    budgetSourceWindowMs: pending.requestBudgetSourceWindowMs,
    combinedAbortWindowMs: combinedWindow,
    fetchSettledWindowMs: fetchWindow,
    requestSettledWindowMs: settledWindow,
    configuredSources: atEnd.configured,
    abortedSources: [...triggered],
    reasonMatchedSources: atEnd.matched,
    requestDeadlineTriggered: triggered.has('request-deadline'),
    operationScopeTriggered: triggered.has('operation'),
    kickLockScopeTriggered: triggered.has('kick-lock'),
    sourceAbortFacts,
    exclusiveFetchFailureCause: 'NOT_ASSERTED',
    ...(typeof fetch.transportCode === 'string' ? { transportCode: fetch.transportCode } : {}),
  };
}

/** The new SQL transition envelopes are diagnostics. PostgreSQL now() start,
 * pauses and lost tails are not resolved merely by observing BEGIN/COMMIT.
 * This function keeps the original interval and continuity intact. */
export function assertUnrefinedActivityBudget(
  events: readonly RuntimeEvent[],
  binding: ProcessObservationBinding,
): { activeElapsedMs: Window; epochId: string; source: 'original-monotonic-activity-interval' } {
  const activity = events.filter((event) =>
    ['activity-checkpoint', 'activity-terminal'].includes(name(event)),
  );
  for (const event of activity) {
    processBound(event, binding, 'activity');
    if (event.includesUnsavedTail !== true || event.activeElapsedMs == null) continue;
    const actual = window(event.activeElapsedMs, '原活动区间');
    assert.ok(actual[0] <= 60_000, '活动预算已证明超过原始60000ms上限');
  }
  const terminal = activity.findLast((event) => name(event) === 'activity-terminal');
  need(terminal, '缺少真实活动终止边界');
  need(
    terminal.includesUnsavedTail === true &&
      terminal.activeElapsedMs != null &&
      terminal.activityState === 'terminal' &&
      terminal.epochObservation?.continuous === true &&
      terminal.epochObservation.startSource === 'run-creation',
    '活动创建/连续性/未保存尾段缺证，事务包络不能补造连续活动真值',
  );
  const epochs = new Set(activity.flatMap((event) => event.epochIds ?? []));
  need(
    epochs.size === 1 &&
      terminal.epochIds?.length === 1 &&
      activity.every(
        (event) =>
          event.includesUnsavedTail === true &&
          event.epochObservation?.continuous === true &&
          event.epochObservation.startSource === 'run-creation' &&
          ['active', 'terminal'].includes(String(event.activityState)),
      ),
    '存在缺失、暂停、所有权变化或不完整epoch，不能缩小原区间',
  );
  const actual = window(terminal.activeElapsedMs, '原活动区间');
  need(actual[1] <= 60_000, '真实活动区间跨60000ms边界，保持BLOCKED');
  return {
    activeElapsedMs: actual,
    epochId: terminal.epochIds[0]!,
    source: 'original-monotonic-activity-interval',
  };
}
