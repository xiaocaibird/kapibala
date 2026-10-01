import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BlockedError } from '../../harness/security.js';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import { blockedMessageReaders, type PgLockSample } from './delivery-read-observation.js';

export interface ReadIdentity {
  groupId: string;
  runId: string;
  stepId: string;
  toolUseId: string;
  attemptId: string;
  clientMsgId: string;
  clockDomain: string;
}
export interface CausalPgSample {
  pg: PgLockSample;
  /** Sequential live snapshots bracket the actual QA PG observation. Their
   * monotonic clocks are never subtracted from the QA parent's clock. */
  before: readonly RuntimeEvent[];
  after: readonly RuntimeEvent[];
}
type Event = RuntimeEvent;
const kind = (event: Event) => String(event.kind);
function need(value: unknown, message: string): asserts value {
  if (!value) throw new BlockedError(message);
}
function bound(value: unknown, label: string): [number, number] {
  need(
    Array.isArray(value) && value.length === 2 && value.every(Number.isFinite),
    `${label} 缺实际包络`,
  );
  const [low, high] = value as [number, number];
  need(low >= 0 && high >= low, `${label} 包络非法`);
  return [low, high];
}
function ordered(a: Event, b: Event, label: string) {
  need(
    typeof a.sourceSeq === 'number' && typeof b.sourceSeq === 'number' && a.sourceSeq < b.sourceSeq,
    `${label} 缺原source顺序`,
  );
  need(
    a.clockDomain === b.clockDomain && a.applicationPid === b.applicationPid,
    `${label} 跨实际进程/时钟`,
  );
  need(bound(a.monotonicMs, label)[0] <= bound(b.monotonicMs, label)[1], `${label} 时钟逆序`);
}
function exactly(events: readonly Event[], name: string, label: string) {
  const matches = events.filter((event) => kind(event) === name);
  need(matches.length === 1, `${label} ${name} 不唯一或缺失`);
  return matches[0]!;
}
export function sameExecution(events: readonly Event[], identity: ReadIdentity) {
  const matches = events.filter((event) => event.attemptId === identity.attemptId);
  for (const event of matches) {
    need(
      event.groupId === identity.groupId &&
        event.runId === identity.runId &&
        event.stepId === identity.stepId &&
        event.toolUseId === identity.toolUseId &&
        event.clockDomain === identity.clockDomain,
      '原执行关联发生跨run/step/tool/clock',
    );
    if (kind(event).startsWith('delivery-read-'))
      need(event.clientMsgId === identity.clientMsgId, '实际读取缺原消息身份');
  }
  return matches;
}

/** Own QA oracle: join actual lock chain, the independently observed SQL text
 * hash, and the unique in-flight query of the original execution. No PID-only,
 * subsequent idle, source-code or developer fixture inference is accepted. */
export function assertReadCausalEvidence(input: {
  events: readonly Event[];
  identity: ReadIdentity;
  samples: readonly CausalPgSample[];
  lockOwner: { database: string; lockerPid: number; lockerStart: string; relationOid: number };
}) {
  const execution = sameExecution(input.events, input.identity);
  const returned = exactly(execution, 'send-tool-result-returned', '原工具');
  const reads = execution.filter((event) => kind(event).startsWith('delivery-read-'));
  need(reads.length, '未取得原执行真实读取事件');
  const attributed: {
    sample: number;
    pid: number;
    backendStarted: string;
    readAttemptId: string;
    queryAttemptId: string;
  }[] = [];
  for (const [index, sample] of input.samples.entries()) {
    const readers = blockedMessageReaders(sample.pg, input.lockOwner);
    const before = sameExecution(sample.before, input.identity);
    const after = sameExecution(sample.after, input.identity);
    for (const row of readers) {
      const sha = createHash('sha256').update(row.query).digest('hex');
      const started = before.filter((event) => {
        const backend = event.backend as { pid?: unknown; backendStarted?: unknown } | undefined;
        return (
          kind(event) === 'delivery-read-query-started' &&
          event.queryRole === 'delivery-select' &&
          event.querySha256 === sha &&
          backend?.pid === row.pid &&
          backend.backendStarted === row.backend_start &&
          !before.some(
            (end) =>
              end.queryAttemptId === event.queryAttemptId &&
              ['delivery-read-query-returned', 'delivery-read-query-failed'].includes(kind(end)),
          )
        );
      });
      // Require this exact query to remain pending at both live boundaries.
      // If it finished between them, the PG row could belong to a later query
      // on the same backend with identical SQL. Do not guess which it was.
      if (started.length !== 1) continue;
      const start = started[0]!;
      need(
        after.some(
          (event) =>
            event.sourceSeq === start.sourceSeq && event.queryAttemptId === start.queryAttemptId,
        ),
        'PG后snapshot不含同一真实query，可能截断',
      );
      if (
        after.some(
          (event) =>
            event.queryAttemptId === start.queryAttemptId &&
            ['delivery-read-query-returned', 'delivery-read-query-failed'].includes(kind(event)),
        )
      )
        continue;
      need(
        typeof start.readAttemptId === 'string' && typeof start.queryAttemptId === 'string',
        '原读/query缺唯一身份',
      );
      attributed.push({
        sample: index,
        pid: row.pid,
        backendStarted: row.backend_start,
        readAttemptId: start.readAttemptId,
        queryAttemptId: start.queryAttemptId,
      });
    }
  }
  need(attributed.length, '未在实际PG采样前已in-flight的原工具query上闭合唯一锁链');
  const checked = new Map<string, Record<string, unknown>>();
  for (const match of attributed) {
    if (checked.has(match.queryAttemptId)) continue;
    const oneRead = reads.filter((event) => event.readAttemptId === match.readAttemptId);
    const identified = exactly(oneRead, 'delivery-read-backend-identified', match.readAttemptId);
    const backend = identified.backend as { pid?: unknown; backendStarted?: unknown } | undefined;
    need(
      backend?.pid === match.pid && backend.backendStarted === match.backendStarted,
      '真实读取backend身份不匹配',
    );
    const oneQuery = oneRead.filter((event) => event.queryAttemptId === match.queryAttemptId);
    const start = exactly(oneQuery, 'delivery-read-query-started', match.queryAttemptId);
    const failed = exactly(oneQuery, 'delivery-read-query-failed', match.queryAttemptId);
    need(
      failed.queryRole === 'delivery-select' && failed.querySha256 === start.querySha256,
      '读取失败缺同SQL角色/哈希',
    );
    assert.equal(failed.sqlState, '55P03', '锁窗口未取得实际PG lock_timeout 55P03');
    assert.equal(failed.ownReadTimeout, true, '真实表锁超时被错误归类');
    bound(failed.queryWindowMs, '实际失败query');
    ordered(identified, start, '实际identity→SELECT');
    ordered(start, failed, '实际SELECT→55P03');
    const rollbackQueries = oneRead.filter((event) => event.queryRole === 'rollback');
    const rollbackCall = exactly(rollbackQueries, 'delivery-read-query-started', '原读ROLLBACK');
    const rollbackReturn = exactly(rollbackQueries, 'delivery-read-query-returned', '原读ROLLBACK');
    need(
      rollbackCall.queryAttemptId === rollbackReturn.queryAttemptId,
      'ROLLBACK不同query attempt',
    );
    need(
      !rollbackQueries.some((event) => kind(event) === 'delivery-read-query-failed'),
      '原读ROLLBACK实际失败',
    );
    bound(rollbackReturn.queryWindowMs, '真实ROLLBACK确认');
    const released = exactly(oneRead, 'delivery-read-client-released', '原读release');
    assert.equal(released.disposition, 'returned-to-pool', '已确认回滚的原读取连接未按协议释放');
    ordered(failed, rollbackCall, '真实55P03→ROLLBACK');
    ordered(rollbackCall, rollbackReturn, '真实ROLLBACK调用→确认');
    ordered(rollbackReturn, released, '真实ROLLBACK确认→release');
    ordered(released, returned, '真实release→工具交还');
    checked.set(match.queryAttemptId, {
      ...match,
      failedSourceSeq: failed.sourceSeq,
      rollbackQueryAttemptId: rollbackReturn.queryAttemptId,
      rollbackSourceSeq: rollbackReturn.sourceSeq,
      releaseSourceSeq: released.sourceSeq,
      disposition: released.disposition,
    });
  }
  return { attributedLockSamples: attributed, confirmedOriginalReadCleanup: [...checked.values()] };
}

/** The actual Agent save is a distinct transaction. A wrapper returned/failed
 * never substitutes for the outer SQL COMMIT/ROLLBACK acknowledgement. */
export function assertAgentSaveBoundary(
  events: readonly Event[],
  identity: ReadIdentity,
  outcome: 'commit' | 'rollback',
) {
  const execution = sameExecution(events, identity);
  const returned = exactly(execution, 'send-tool-result-returned', '原工具');
  const saving = exactly(execution, 'send-tool-history-save-started', '原保存调用');
  ordered(returned, saving, '工具交还→保存调用');
  const facts = execution.filter((event) => kind(event) === 'agent-step-save-transaction');
  const ids = [...new Set(facts.map((event) => event.transactionAttemptId))];
  need(
    ids.length === 1 && typeof ids[0] === 'string' && ids[0],
    '实际Agent保存事务identity缺失或混合',
  );
  const transactionAttemptId = ids[0] as string;
  const backend = [...new Set(facts.map((event) => event.backendPid))];
  need(
    backend.length === 1 && Number.isSafeInteger(backend[0]) && Number(backend[0]) > 0,
    '实际保存缺唯一PG握手PID',
  );
  const phase = (name: string, edge: string) => {
    const entries = facts.filter((event) => event.phase === name && event.edge === edge);
    need(entries.length === 1, `实际保存${name}/${edge}缺失或不唯一`);
    const acknowledgement = entries[0]!;
    const actualWindow = bound(acknowledgement.windowMs, `${name}/${edge}`);
    const called = facts.filter((event) => event.phase === name && event.edge === 'called');
    need(called.length === 1, `实际保存${name}/called缺失或不唯一`);
    need(
      bound(called[0]!.windowMs, `${name}/called`)[0] === actualWindow[0],
      `实际保存${name}调用与确认包络不属于同SQL调用`,
    );
    ordered(called[0]!, acknowledgement, `实际${name}调用→${edge}`);
    return acknowledgement;
  };
  const begin = phase('begin', 'returned');
  const step = phase('step-result-update', 'returned');
  ordered(saving, begin, '实际保存调用→BEGIN返回');
  ordered(begin, step, '实际BEGIN→域step UPDATE');
  const history = phase('run-history-update', outcome === 'commit' ? 'returned' : 'rejected');
  ordered(step, history, '实际step UPDATE→history UPDATE');
  const end = phase(outcome, 'returned');
  ordered(history, end, `实际history UPDATE→${outcome}确认`);
  if (outcome === 'commit') {
    need(!facts.some((event) => event.phase === 'rollback'), '保存成功混入同事务ROLLBACK');
    const committed = exactly(execution, 'send-tool-history-committed', '原工具历史');
    const wrapper = exactly(execution, 'send-tool-history-save-returned', '原保存返回');
    need(committed.commitBoundary === 'outer-commit-confirmed', '原history未声明已确认外层COMMIT');
    ordered(end, committed, '实际COMMIT确认→history committed');
    ordered(committed, wrapper, '原history committed→保存返回');
    assert.deepEqual(committed.result, returned.result, '真实COMMIT结果与工具结果不同');
  } else {
    assert.equal(history.sqlState, 'P0001', '实际history故障不属于本例trigger');
    need(!facts.some((event) => event.phase === 'commit'), '已失败history事务出现COMMIT调用/返回');
    assert.equal(
      execution.filter((event) => kind(event) === 'send-tool-history-committed').length,
      0,
      '回滚保存发布虚假的history COMMIT',
    );
    const wrapper = exactly(execution, 'send-tool-history-save-failed', '原保存拒绝');
    ordered(end, wrapper, '实际ROLLBACK确认→保存拒绝');
  }
  return {
    transactionAttemptId,
    backendPid: backend[0],
    outcome,
    beginSourceSeq: begin.sourceSeq,
    stepSourceSeq: step.sourceSeq,
    historySourceSeq: history.sourceSeq,
    acknowledgementSourceSeq: end.sourceSeq,
  };
}
