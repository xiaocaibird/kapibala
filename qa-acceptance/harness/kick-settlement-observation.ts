import assert from 'node:assert/strict';
import type { RuntimeEvent } from './runtime-observation.js';
import type { ProcessObservationBinding } from './first-round-observation-oracle.js';
import { assertNoDispatchAfterStop, observationInterval } from './lifecycle-observation.js';
import { BlockedError } from './security.js';

function need(value: unknown, reason: string): asserts value {
  if (!value) throw new BlockedError(`kick收尾观察：${reason}`);
}
function one(events: readonly RuntimeEvent[], kind: string) {
  const selected = events.filter((e) => e.kind === kind);
  need(selected.length === 1, `缺唯一真实${kind}`);
  return selected[0]!;
}
interface Boundary {
  transactionAttemptId: string;
  backendPid: number;
  phase: string;
  edge: string;
  windowMs: [number, number];
}

/** A sufficient conservative upper bound, including pause and persistence tail.
 * An upper bound crossing 60000 is inconclusive, not proof of activity violation.
 * The caller must keep every independently proved activity/order FAIL first.
 * Events came from an independently validated original append-only runtime lease.
 */
export function assertKickSettlementUpperBound(
  events: readonly RuntimeEvent[],
  binding: ProcessObservationBinding,
) {
  const attached = one(events, 'lifecycle-observation-attached');
  need(
    attached.droppedThroughSourceSeq === 0 &&
      attached.historyScope === 'this-process-only' &&
      attached.includesPriorProcessHistory === false &&
      attached.resourceId === binding.runId &&
      binding.validatedProvenance.source === 'live-bridge' &&
      binding.validatedProvenance.applicationPid === binding.applicationPid &&
      binding.validatedProvenance.applicationStarted === binding.applicationStarted,
    '原完整历史与真实live进程未绑定',
  );
  let previousSequence = 0;
  let previousTime = 0;
  for (const event of events) {
    const time = observationInterval(event.monotonicMs);
    need(
      event.applicationPid === binding.applicationPid &&
        event.clockDomain === binding.clockDomain &&
        event.clockUnit === 'ms',
      '不能拼接不同PID/单调时钟域',
    );
    if (event === attached) continue;
    need(
      event.runId === binding.runId &&
        event.groupId === binding.groupId &&
        Number.isSafeInteger(event.sourceSeq) &&
        Number(event.sourceSeq) > previousSequence &&
        time[0] >= previousTime,
      '原run/事件顺序或时钟关联缺失',
    );
    previousSequence = Number(event.sourceSeq);
    previousTime = time[1];
  }
  assertNoDispatchAfterStop(events);
  const created = one(events, 'agent-run-created');
  const terminal = one(events, 'agent-terminal-committed');
  const decision = one(
    events.filter((e) => e.attemptId === terminal.attemptId),
    'agent-termination-decided',
  );
  need(
    created.commitBoundary === 'outer-commit-confirmed' &&
      terminal.commitBoundary === 'outer-commit-confirmed' &&
      decision.sourceSeq! < terminal.sourceSeq! &&
      decision.status === terminal.status &&
      decision.reason === terminal.reason,
    '创建/实际终态COMMIT或决定配对缺失',
  );
  assert.equal(terminal.status, 'failed');
  assert.equal(terminal.reason, 'wall_clock');
  const start = observationInterval(created.creationWindowMs);
  need(start[1] <= observationInterval(created.monotonicMs)[0], '创建包络晚于实际创建');
  need(Array.isArray(terminal.transactionBoundaries), '缺真实终态事务边界');
  const rows = terminal.transactionBoundaries as Boundary[];
  const take = (phase: string, edge: string) => {
    const matches = rows.filter((row) => row.phase === phase && row.edge === edge);
    need(matches.length === 1, `缺唯一${phase}/${edge}`);
    const row = matches[0]!;
    need(
      typeof row.transactionAttemptId === 'string' &&
        row.transactionAttemptId.length > 0 &&
        Number.isSafeInteger(row.backendPid) &&
        row.backendPid > 0,
      '缺实际PG事务身份',
    );
    observationInterval(row.windowMs);
    return row;
  };
  const ordered = [
    take('begin', 'returned'),
    take('run-terminal-update', 'called'),
    take('run-terminal-update', 'returned'),
    take('commit', 'called'),
    take('commit', 'returned'),
  ];
  ordered.forEach((row, i) =>
    need(
      row.transactionAttemptId === ordered[0]!.transactionAttemptId &&
        row.backendPid === ordered[0]!.backendPid &&
        (!i || row.windowMs[0] >= ordered[i - 1]!.windowMs[0]) &&
        (!i || row.windowMs[1] >= ordered[i - 1]!.windowMs[1]),
      'BEGIN/UPDATE/COMMIT属于不同事务、backend或实际顺序矛盾',
    ),
  );
  need(
    ordered[1]!.windowMs[0] >= ordered[0]!.windowMs[1] &&
      ordered[3]!.windowMs[0] >= ordered[2]!.windowMs[1] &&
      ordered[2]!.windowMs[0] <= ordered[1]!.windowMs[1] &&
      ordered[4]!.windowMs[0] <= ordered[3]!.windowMs[1],
    '真实UPDATE/COMMIT调用早于前一阶段返回，或返回包络不含调用边界',
  );
  const commit = ordered.at(-1)!;
  need(
    observationInterval(decision.decisionWindowMs)[1] <= ordered[0]!.windowMs[0] &&
      commit.windowMs[1] <= observationInterval(terminal.monotonicMs)[0],
    '实际决定、真实COMMIT返回与事件投递包络未闭合',
  );
  const elapsed: [number, number] = [commit.windowMs[0] - start[1], commit.windowMs[1] - start[0]];
  need(elapsed[0] >= 0 && elapsed[0] <= elapsed[1], '创建到真实COMMIT包络无效');
  if (elapsed[1] > 60_000)
    throw new BlockedError('保守创建到COMMIT上界超过60000；仅该在线上界不能证明实际活动超限');
  return {
    proof: 'same-original-run-real-terminal-commit-conservative-upper-bound',
    elapsed,
    created,
    decision,
    terminal,
    actualCommitReturned: commit,
    boundary: 'Sufficient finite upper bound only; not a new COMMIT SLA or arbitrary-restart proof',
  };
}
