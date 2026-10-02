import assert from 'node:assert/strict';
import { BlockedError } from './security.js';
import type { RuntimeEvent } from './runtime-observation.js';

export type LifecycleCorrelation =
  | { kind: 'tool-wait'; groupId: string; runId: string; toolUseId: 'all-run-steps' }
  | { kind: 'message-recovery'; groupId: string; clientMsgId: string };
export const lifecycleKinds = [
  'lifecycle-observation-attached',
  'agent-activity-pause-committed',
  'agent-step-save-transaction',
  'send-tool-history-save-started',
  'send-tool-history-save-returned',
  'send-tool-history-save-failed',
  'delivery-read-attempt-started',
  'delivery-read-client-acquired',
  'delivery-read-backend-identified',
  'delivery-read-query-started',
  'delivery-read-query-returned',
  'delivery-read-query-failed',
  'delivery-read-value-observed',
  'delivery-read-attempt-failed',
  'delivery-read-client-released',
  'delivery-read-connection-ended',
  'delivery-read-connection-error',
  'kick-budget-signal-aborted',
  'kick-work-budget-signal-aborted',
  'kick-post-dispatch',
  'kick-post-response-headers',
  'kick-post-response-body',
  'kick-post-source-aborted',
  'kick-post-combined-aborted',
  'kick-post-fetch-settled',
  'kick-post-body-settled',
  'kick-post-request-settled',
  'kick-confirmation-dispatch',
  'kick-confirmation-response-headers',
  'kick-confirmation-response-body',
  'kick-confirmation-source-aborted',
  'kick-confirmation-combined-aborted',
  'kick-confirmation-fetch-settled',
  'kick-confirmation-body-settled',
  'kick-confirmation-request-settled',
  'kick-projection-dispatch',
  'kick-projection-response-headers',
  'kick-projection-response-body',
  'kick-projection-source-aborted',
  'kick-projection-combined-aborted',
  'kick-projection-fetch-settled',
  'kick-projection-body-settled',
  'kick-projection-request-settled',
  'agent-run-created',
  'agent-run-lock-attempted',
  'agent-run-lock-acquired',
  'agent-run-lock-result',
  'agent-turn-dispatched',
  'agent-turn-response-received',
  'agent-termination-decided',
  'agent-terminal-committed',
  'send-tool-prepared',
  'send-tool-entered',
  'send-audit-started',
  'send-audit-completed',
  'send-key-resolved',
  'send-wait-started',
  'send-wait-result-ready',
  'send-tool-result-returned',
  'send-tool-history-committed',
  'message-send-dispatch',
  'message-send-response-headers',
  'message-send-response-body',
  'message-send-result-committed',
  'message-send-request-failed',
  'message-recovery-adopted',
  'message-recovery-query-started',
  'message-query-dispatch',
  'message-query-response-headers',
  'message-query-response-body',
  'message-recovery-query-inconclusive',
  'message-recovery-result-committed',
] as const;
export type LifecycleKind = (typeof lifecycleKinds)[number];
type Interval = [number, number];
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
function need(value: unknown, reason: string): asserts value {
  if (!value) throw new BlockedError(`生命周期观测：${reason}`);
}
export function observationInterval(value: unknown): Interval {
  need(
    Array.isArray(value) &&
      value.length === 2 &&
      value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) &&
      value[0] <= value[1],
    '必须提供有限、非负且有序的原始毫秒区间',
  );
  return value as Interval;
}
const span = (start: Interval, end: Interval): Interval => {
  need(end[0] >= start[0] && end[1] >= start[1], '起止区间顺序不成立');
  return [end[0] - start[1], end[1] - start[0]];
};

/** Validate the actual process stream separately from its lease selector.
 * Attached is metadata, not a synthetic business event or a timing origin. */
export function validateLifecycleEvents(
  events: readonly RuntimeEvent[],
  c: LifecycleCorrelation,
): void {
  need(events.length > 0, '缺少实际接入身份');
  const attached = events[0]!;
  need(
    attached.kind === 'lifecycle-observation-attached' &&
      attached.seq === 1 &&
      events.filter((e) => e.kind === attached.kind).length === 1,
    '必须恰有首条attached元信息',
  );
  need(
    attached.historyScope === 'this-process-only' &&
      attached.includesPriorProcessHistory === false &&
      Number.isSafeInteger(attached.droppedThroughSourceSeq) &&
      Number(attached.droppedThroughSourceSeq) >= 0 &&
      text(attached.resourceId) &&
      typeof attached.databaseIdentity === 'string' &&
      /^[a-f0-9]{64}$/.test(attached.databaseIdentity),
    '缺少进程历史范围、截断或真实资源/数据库身份',
  );
  if (c.kind === 'tool-wait')
    need(attached.resourceId === c.runId && c.toolUseId === 'all-run-steps', '接入run身份不匹配');
  else need(uuid(c.clientMsgId), '消息selector必须为真实clientMsgId UUID');
  let sourceSeq = Number(attached.droppedThroughSourceSeq);
  let previous: Interval | undefined;
  for (const event of events) {
    need(
      positive(event.applicationPid) &&
        event.clockUnit === 'ms' &&
        typeof event.clockDomain === 'string' &&
        event.clockDomain.startsWith(`process-performance:${event.applicationPid}:`) &&
        uuid(event.clockDomain.slice(`process-performance:${event.applicationPid}:`.length)),
      '缺少实际应用PID及同域单调时钟',
    );
    const point = observationInterval(event.monotonicMs);
    need(
      event.clockDomain === attached.clockDomain &&
        event.applicationPid === attached.applicationPid,
      '同一租约混入其他进程时钟',
    );
    if (event === attached) continue; // Replay may precede attachment UTC/monotonic time.
    need(positive(event.sourceSeq) && event.sourceSeq > sourceSeq, '真实sourceSeq重复或倒退');
    sourceSeq = event.sourceSeq;
    need(!previous || point[0] >= previous[1], '业务流单调时钟倒退或区间重叠');
    previous = point;
    need(event.groupId === c.groupId, '真实groupId与selector不符');
    if (c.kind === 'tool-wait') {
      need(
        event.runId === c.runId &&
          (event.kind.startsWith('agent-') ||
            event.kind.startsWith('send-') ||
            event.kind.startsWith('kick-') ||
            event.kind.startsWith('delivery-read-')),
        'run流混入其他业务/实际run',
      );
      if (event.kind.startsWith('send-'))
        need(text(event.stepId) && text(event.toolUseId), '工具事件缺实际step/tool身份');
      if (event.kind === 'agent-run-created') {
        const outer = observationInterval(event.creationWindowMs);
        const insert = observationInterval(event.creationInsertWindowMs);
        need(
          outer[0] <= insert[0] &&
            insert[1] <= outer[1] &&
            outer[1] <= point[0] &&
            typeof event.transactionBeginAcknowledgedByMs === 'number' &&
            Number.isFinite(event.transactionBeginAcknowledgedByMs) &&
            event.transactionBeginAcknowledgedByMs >= outer[0] &&
            event.transactionBeginAcknowledgedByMs <= insert[0],
          '创建事务/INSERT/BEGIN包围不成立',
        );
      }
      if (event.kind.startsWith('agent-run-lock-')) {
        need(event.lockKey === `agent:${c.runId}` && ['run', 'paused-cancellation'].includes(String(event.purpose)) && text(event.instanceId),
          '运行锁事件缺同run锁身份/用途/实际实例身份');
        need(typeof event.callbackEntered === 'boolean', '运行锁事件缺实际callback进入事实');
        if (event.kind === 'agent-run-lock-result') need(['executed', 'lock_busy', 'capacity_unavailable', 'error'].includes(String(event.lockStatus)),
          '运行锁结果缺实际准入状态和callback进入事实');
      }
      if (event.kind === 'agent-termination-decided') {
        const decision = observationInterval(event.decisionWindowMs);
        need(decision[1] <= point[0], '终止决定区间晚于实际记录');
      }
      if (event.kind === 'agent-turn-dispatched' || event.kind === 'agent-turn-response-received')
        need(text(event.stepId), 'turn缺实际步骤身份');
      if (event.kind === 'agent-turn-dispatched')
        need(positive(event.ordinal), 'turn缺真实ordinal');
      if (event.kind === 'send-key-resolved')
        need(
          uuid(event.clientMsgId) &&
            text(event.idempotencyKey) &&
            typeof event.keyReused === 'boolean',
          'key/message关联不完整',
        );
      if (
        ['send-wait-started', 'send-wait-result-ready', 'send-tool-result-returned'].includes(
          event.kind,
        )
      )
        need(uuid(event.clientMsgId) && text(event.idempotencyKey), '等待事件缺实际消息/key');
      if (
        [
          'send-wait-result-ready',
          'send-tool-result-returned',
          'send-tool-history-committed',
        ].includes(event.kind)
      )
        need(event.errorCode === null || text(event.errorCode), '缺少实际结果错误码');
      if (
        event.kind === 'send-tool-result-returned' ||
        event.kind === 'send-tool-history-committed'
      )
        need(!!event.result && typeof event.result === 'object', '缺少真实交还/保存结果');
      if (event.kind === 'agent-termination-decided' || event.kind === 'agent-terminal-committed')
        need(text(event.status) && text(event.reason), '缺少真实终态决定');
    } else {
      need(
        event.kind.startsWith('message-') &&
          event.clientMsgId === c.clientMsgId &&
          event.messageId === attached.resourceId &&
          text(event.messageId) &&
          Number.isSafeInteger(event.dispatchAttempt) &&
          Number(event.dispatchAttempt) >= 1 &&
          event.attemptId === `${event.messageId}:${event.dispatchAttempt}`,
        '实际消息/原dispatch尝试身份不匹配',
      );
      if (
        event.kind.startsWith('message-query-') ||
        event.kind.startsWith('message-recovery-query-') ||
        event.kind === 'message-recovery-result-committed'
      )
        need(uuid(event.queryAttemptId), '确认查询缺真实attempt身份');
      if (event.kind === 'message-recovery-adopted')
        need(
          event.originalResponseReceipt === 'not-durably-recorded' &&
            event.recordedTimeoutAvailable === false &&
            event.recoveryState === 'automatic-query-pending',
          '接管语义不匹配',
        );
      if (event.kind === 'message-recovery-query-started')
        need(
          event.recoveryState === 'automatic-querying' &&
            typeof event.recordedTimeoutAvailable === 'boolean',
          '查询进入缺实际状态',
        );
      if (event.kind === 'message-recovery-query-inconclusive')
        need(
          event.recoveryState === 'automatic-query-pending' &&
            text(event.errorCode) &&
            typeof event.recordedTimeoutAvailable === 'boolean',
          '查询未决缺实际结果',
        );
      if (event.kind === 'message-recovery-result-committed')
        need(
          event.recoveryState === 'terminal' &&
            ['sent', 'failed'].includes(String(event.deliveryStatus)) &&
            text(event.decisionEvidence),
          '缺少持久终结依据',
        );
    }
    if (
      event.kind.endsWith('response-headers') ||
      event.kind.endsWith('response-body') ||
      event.kind === 'agent-turn-response-received'
    )
      need(
        Number.isInteger(event.responseStatus) &&
          Number(event.responseStatus) >= 100 &&
          Number(event.responseStatus) <= 599,
        '实际HTTP接收缺合法状态',
      );
    if (
      event.kind.endsWith('-committed') ||
      event.kind === 'agent-run-created' ||
      event.kind === 'send-tool-prepared' ||
      event.kind === 'message-recovery-adopted'
    )
      need(event.commitBoundary === 'outer-commit-confirmed', '不能将提交尝试冒充已提交');
  }
}

const one = (events: readonly RuntimeEvent[], kind: string) => {
  const matches = events.filter((e) => e.kind === kind);
  need(matches.length === 1, `需要唯一真实${kind}，当前${matches.length}条`);
  return matches[0]!;
};
function completeHistory(events: readonly RuntimeEvent[]) {
  need(
    events[0]?.kind === 'lifecycle-observation-attached' && events[0].droppedThroughSourceSeq === 0,
    '进程历史已截断或不完整，不能证明完整生命周期',
  );
}

export function toolWaitWindow(events: readonly RuntimeEvent[], toolUseId: string, key: string) {
  const entered = one(
    events.filter((e) => e.toolUseId === toolUseId),
    'send-tool-entered',
  );
  const execution = events.filter((e) => e.attemptId === entered.attemptId);
  const startBefore = one(execution, 'send-key-resolved');
  const startAfter = one(execution, 'send-wait-started');
  const endBefore = one(execution, 'send-wait-result-ready');
  const endAfter = one(execution, 'send-tool-result-returned');
  const ordered = [entered, startBefore, startAfter, endBefore, endAfter];
  need(
    ordered.every(
      (e, i) =>
        e.stepId === entered.stepId &&
        e.toolUseId === toolUseId &&
        e.runId === entered.runId &&
        e.clockDomain === entered.clockDomain &&
        (!i || e.sourceSeq! > ordered[i - 1]!.sourceSeq!),
    ),
    '工具等待跨步骤/时钟/顺序',
  );
  need(
    [startBefore, startAfter, endBefore, endAfter].every(
      (e) => e.clientMsgId === startBefore.clientMsgId && e.idempotencyKey === key,
    ),
    '工具等待未关联同一真实消息和key',
  );
  const start: Interval = [
    observationInterval(startBefore.monotonicMs)[0],
    observationInterval(startAfter.monotonicMs)[1],
  ];
  const end: Interval = [
    observationInterval(endBefore.monotonicMs)[0],
    observationInterval(endAfter.monotonicMs)[1],
  ];
  return {
    start,
    end,
    elapsed: span(start, end),
    clientMsgId: startBefore.clientMsgId,
    attemptId: entered.attemptId,
    runId: entered.runId,
    stepId: entered.stepId,
    toolUseId,
    enteredSeq: entered.seq,
    clockDomain: entered.clockDomain,
    errorCode: endAfter.errorCode,
    readyErrorCode: endBefore.errorCode,
    keyReused: startBefore.keyReused,
    result: endAfter.result,
    returnedSeq: endAfter.seq,
    droppedThroughSourceSeq: events[0]?.droppedThroughSourceSeq,
    earlierStages: events.filter(
      (e) =>
        e.stepId === entered.stepId &&
        [
          'send-tool-prepared',
          'send-tool-entered',
          'send-audit-started',
          'send-audit-completed',
        ].includes(e.kind),
    ),
    history: execution.filter((e) => e.kind === 'send-tool-history-committed'),
    historyCandidates: events.filter(
      (e) =>
        e.stepId === entered.stepId &&
        e.toolUseId === toolUseId &&
        e.kind === 'send-tool-history-committed',
    ),
  };
}
export function assertToolWaitBudget(
  window: ReturnType<typeof toolWaitWindow>,
  expectedCode: string | null,
) {
  assert.equal(window.errorCode, expectedCode, '实际工具交还结果错误');
  assert.equal(window.readyErrorCode, expectedCode, '状态等待结果与交还结果不一致');
  assert.ok(window.elapsed[0] <= 5000, '实际工具状态等待下界超过原始5000ms上限');
  if (expectedCode === 'SEND_TIMEOUT')
    assert.ok(window.elapsed[1] >= 5000, '未满5秒且无结论却提前宣告SEND_TIMEOUT');
  if (window.elapsed[1] > 5000)
    throw new BlockedError('工具实际等待区间跨5000ms，不能用后续turn或计时容差补证');
}

/** Pair by the real execution attempt, never repair a missing host argument by
 * guessing from a matching toolUseId. Check hard timing violations first. */
export function assertToolWaitCompletion(window: ReturnType<typeof toolWaitWindow>) {
  need(window.droppedThroughSourceSeq === 0, '工具流此前历史被截断');
  const prepared = window.earlierStages.filter((e) => e.kind === 'send-tool-prepared');
  need(
    prepared.length === 1 &&
      prepared[0]!.runId === window.runId &&
      prepared[0]!.toolUseId === window.toolUseId &&
      prepared[0]!.stepId === window.stepId &&
      prepared[0]!.clockDomain === window.clockDomain &&
      prepared[0]!.seq < window.enteredSeq,
    '缺少真实合法工具持久化来源',
  );
  need(
    window.history.length === 1 &&
      window.historyCandidates.length === 1 &&
      window.history[0]!.seq === window.historyCandidates[0]!.seq &&
      window.history[0]!.sourceSeq === window.historyCandidates[0]!.sourceSeq &&
      window.history[0]!.attemptId === window.attemptId &&
      window.history[0]!.runId === window.runId &&
      window.history[0]!.stepId === window.stepId &&
      window.history[0]!.toolUseId === window.toolUseId &&
      window.history[0]!.seq > window.returnedSeq &&
      window.history[0]!.clockDomain === window.clockDomain,
    '缺少同一真实executionAttempt的history COMMIT，不能按toolUseId猜配',
  );
  assert.equal(window.history[0]!.errorCode, window.errorCode, '保存history的错误码与交还值不同');
  assert.deepEqual(window.history[0]!.result, window.result, '保存history的结果与交还值不同');
}

/** RuntimeLease has already validated real run/process/clock identities. This
 * order violation needs neither elapsed-time truth nor a later successful COMMIT. */
export function assertNoDispatchAfterStop(events: readonly RuntimeEvent[]): void {
  for (const decision of events.filter((event) => event.kind === 'agent-termination-decided'))
    assert.ok(
      !events.some(
        (event) =>
          event.kind === 'agent-turn-dispatched' &&
          event.runId === decision.runId &&
          event.groupId === decision.groupId &&
          event.applicationPid === decision.applicationPid &&
          event.clockDomain === decision.clockDomain &&
          event.seq > decision.seq,
      ),
      '实际终止决定之后不得派发新turn',
    );
}

export function assertAgentLifecycle(events: readonly RuntimeEvent[]) {
  assertNoDispatchAfterStop(events);
  const created = one(events, 'agent-run-created');
  const start = observationInterval(created.creationWindowMs);
  const decisions = events.filter((e) => e.kind === 'agent-termination-decided');
  // Evaluate every observed hard violation before missing completion/history.
  for (const event of [...decisions, ...events.filter((e) => e.kind === 'agent-turn-dispatched')]) {
    const end = observationInterval(
      event.kind === 'agent-termination-decided' ? event.decisionWindowMs : event.monotonicMs,
    );
    assert.ok(end[0] - start[1] <= 60_000, '真实决定或新turn派发已超过原始60000ms上限');
  }
  completeHistory(events);
  const terminal = one(events, 'agent-terminal-committed');
  const decision = one(
    decisions.filter((e) => e.attemptId === terminal.attemptId),
    'agent-termination-decided',
  );
  need(
    decision.seq < terminal.seq &&
      decision.status === terminal.status &&
      decision.reason === terminal.reason,
    '终止决定与实际COMMIT没有配对',
  );
  assert.equal(terminal.status, 'failed');
  assert.equal(terminal.reason, 'wall_clock');
  const elapsed = span(start, observationInterval(decision.decisionWindowMs));
  // The paired COMMIT proves durability but is not the stop-decision timestamp.
  // A5.2 imposes only the maximum; it does not require running until 60000ms.
  if (elapsed[1] > 60_000)
    throw new BlockedError('实际停止决定区间跨60000ms，不能用公开终态或提交时间补证');
  return {
    elapsed,
    created,
    decision,
    terminal,
    turns: events.filter((e) => e.kind === 'agent-turn-dispatched'),
  };
}

/** Diagnostic only: an automatic query is not a negative completion guarantee. */
export function messageRecoveryEvidence(events: readonly RuntimeEvent[]) {
  return {
    attached: events[0],
    dispatches: events.filter((e) => e.kind === 'message-send-dispatch'),
    received: events.filter((e) => /^message-(send|query)-response-/.test(e.kind)),
    adopted: events.filter((e) => e.kind === 'message-recovery-adopted'),
    queries: events.filter((e) => e.kind === 'message-recovery-query-started'),
    inconclusive: events.filter((e) => e.kind === 'message-recovery-query-inconclusive'),
    committed: events.filter((e) => e.kind === 'message-recovery-result-committed'),
    boundary:
      'same-message association only; clocks across processes are never subtracted; absence is not a negative completion guarantee',
  };
}

export function assertMessageRecoveryAssociation(
  oldEvents: readonly RuntimeEvent[],
  newEvents: readonly RuntimeEvent[],
) {
  const old = messageRecoveryEvidence(oldEvents),
    next = messageRecoveryEvidence(newEvents);
  const original = one(oldEvents, 'message-send-dispatch');
  const adopted = one(newEvents, 'message-recovery-adopted');
  need(
    old.attached?.databaseIdentity === next.attached?.databaseIdentity &&
      old.attached?.resourceId === next.attached?.resourceId &&
      original.messageId === adopted.messageId &&
      original.attemptId === adopted.attemptId &&
      original.clientMsgId === adopted.clientMsgId,
    '新旧流未绑定同库同原消息dispatch',
  );
  need(
    original.clockDomain !== adopted.clockDomain && original.instancePid !== adopted.instancePid,
    '没有实际重启后新进程身份',
  );
  assert.equal(next.dispatches.length, 0, '未获否定保证前重启盲重发');
  assert.equal(
    old.received.filter((e) => e.kind.startsWith('message-send-')).length,
    0,
    '当前场景原请求应实际未返回，不能冒用504分支',
  );
  need(next.queries.length > 0, '有限观察缺少实际自动恢复查询，不能据unknown猜测永久暂停');
  for (const event of [...next.queries, ...next.inconclusive, ...next.committed]) {
    need(event.attemptId === original.attemptId, '查询不属于原dispatch');
    if (event.kind !== 'message-recovery-query-started')
      need(
        next.queries.some(
          (query) => query.queryAttemptId === event.queryAttemptId && query.seq < event.seq,
        ),
        '查询结果缺少同尝试实际进入',
      );
  }
  // A later SSE/echo may commit sent outside this stream. Its absence here is
  // not a product failure; the public state and independent Gateway judge it.
  for (const result of next.committed)
    assert.equal(
      result.decisionEvidence,
      'positive-query-result',
      '本无504/失败事件轨迹不能用普通404构造否定终态',
    );
  return { old, next, automaticQueryObserved: true, silentNegativeCompletionProven: false };
}
