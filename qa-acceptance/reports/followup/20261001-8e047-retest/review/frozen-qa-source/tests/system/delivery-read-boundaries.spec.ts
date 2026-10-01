import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { test } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import { exec, isolatedEnv } from '../../harness/process.js';
import { observe } from '../../harness/observation.js';
import { runtimeObservationFor, type RuntimeLease } from '../../harness/runtime-observation.js';
import {
  assertToolWaitBudget,
  assertToolWaitCompletion,
  toolWaitWindow,
} from '../../harness/lifecycle-observation.js';
import type { AgentRun } from '../../harness/platform-client.js';
import {
  ownedPgContainer,
  blockedMessageReaders,
  readerAfterReturn,
  type PgActivity,
  type PgLockSample,
} from '../support/delivery-read-observation.js';

const toolId = 'read-lock-send';
const reuseId = 'read-lock-reuse';
const key = 'read-lock-same-key';
const text = 'independent QA delivery read under real PG lock';
const send = (id: string) => ({
  body: {
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', id, name: 'send_message', input: { text, idempotency_key: key } },
    ],
  },
});
// Diagnostic SQL is deliberately confined to this owned database. Table names
// locate the injected fault; no business rows are written or used as an oracle.
const activitySql = `SELECT a.pid, a.datname, a.usename, a.application_name,
 a.backend_start::text, a.xact_start::text, a.query_start::text,
 a.state, a.wait_event_type, a.wait_event, a.query, pg_blocking_pids(a.pid) AS blockers,
 COALESCE((SELECT json_agg(json_build_object('relation',l.relation,'mode',l.mode,'granted',l.granted))
 FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='relation'), '[]'::json) AS relation_locks
 FROM pg_stat_activity a WHERE a.datname=current_database() AND a.backend_type='client backend'
 ORDER BY a.pid`;

test('[INT-READ-001] actual database lock cannot be hidden by abandoned delivery reads or same-key resend', async ({
  qa,
}) => {
  test.setTimeout(60_000);
  const missing: string[] = [];
  const assertions: { stage: string; error: string }[] = [];
  let violation: unknown;
  const check = (stage: string, body: () => void) => {
    try {
      body();
    } catch (error) {
      if (error instanceof BlockedError) missing.push(`${stage}: ${error.message}`);
      else {
        violation ??= error;
        assertions.push({ stage, error: String(error) });
      }
    }
  };
  const control = runtimeObservationFor(qa);
  const { cluster, database } = qa.ownedStorage();
  const pgEvidence: Record<string, unknown> = {
    database,
    clusterOwner: cluster.owner,
    observations: [],
  };
  const samples: PgLockSample[] = [];
  const candidates = new Map<string, PgActivity>();
  const pgErrors: string[] = [];
  let locker: Client | undefined, observer: Client | undefined;
  let lease: RuntimeLease | undefined;
  let locked = false;
  let primary: unknown;
  const record = async (name: string, value: unknown) =>
    qa.evidence(`delivery-read-${name}`, value);
  const release = async () => {
    if (!locked) return;
    const beforeMs = performance.now();
    // Serial completion is observed on the QA locker only. This is NOT a
    // fabricated SUT ROLLBACK witness.
    await locker!.query('ROLLBACK');
    locked = false;
    pgEvidence.qaLockerRollback = {
      beforeMs,
      afterMs: performance.now(),
      at: new Date().toISOString(),
    };
  };
  try {
    await control.verify(['tool-wait-witness']);
    const inspect = JSON.parse(
      (
        await exec('docker', ['--host', 'unix:///var/run/docker.sock', 'inspect', cluster.name], {
          timeout: 5000,
          env: isolatedEnv({}),
        })
      ).stdout,
    ) as unknown[];
    if (inspect.length !== 1) throw new BlockedError('本例容器inspect结果不唯一');
    const containerId = ownedPgContainer(inspect[0], {
      name: cluster.name,
      owner: cluster.owner,
      port: cluster.port,
      database,
      registered: cluster.ownsDatabase(database),
    });
    const inspected = inspect[0] as Record<string, unknown>;
    pgEvidence.container = {
      id: containerId,
      name: cluster.name,
      port: cluster.port,
      labels: (inspected.Config as { Labels: unknown }).Labels,
      state: inspected.State,
      network: inspected.NetworkSettings,
      mounts: inspected.Mounts,
    };
    const connect = async (role: string) => {
      const client = new Client({
        connectionString: cluster.url(database),
        application_name: `qa-int-read-${role}-${randomUUID()}`,
        connectionTimeoutMillis: 2000,
        query_timeout: 5000,
      });
      client.on('error', (error) => pgErrors.push(`${role}: ${String(error)}`));
      try {
        await client.connect();
        return client;
      } catch (error) {
        await client.end().catch(() => {});
        throw new BlockedError(`自有PG ${role}连接失败: ${String(error)}`);
      }
    };
    locker = await connect('locker');
    observer = await connect('observer');
    await observer.query("SET statement_timeout='1000ms'");
    const identity = await observer.query<{
      database: string;
      role: string;
      relation: number | null;
    }>(
      "SELECT current_database() AS database,current_user AS role,to_regclass('public.messages')::oid AS relation",
    );
    if (
      identity.rows.length !== 1 ||
      identity.rows[0]!.database !== database ||
      identity.rows[0]!.role !== 'qa' ||
      !identity.rows[0]!.relation
    )
      throw new BlockedError('实际数据库/角色/故障表定位不匹配，禁止加锁');
    const relationOid = identity.rows[0]!.relation!;
    const own = await locker.query<{ pid: number; started: string }>(
      'SELECT pg_backend_pid() AS pid,backend_start::text AS started FROM pg_stat_activity WHERE pid=pg_backend_pid()',
    );
    const lockOwner = {
      database,
      lockerPid: own.rows[0]!.pid,
      lockerStart: own.rows[0]!.started,
      relationOid,
    };
    pgEvidence.lockOwner = lockOwner;
    const snapshotPg = async (): Promise<PgLockSample> => {
      const beforeMs = performance.now();
      const rows = await observer!.query<PgActivity>(activitySql);
      const sample = {
        beforeMs,
        afterMs: performance.now(),
        at: new Date().toISOString(),
        database,
        activities: rows.rows,
      };
      samples.push(sample);
      return sample;
    };
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
      status: 504,
      code: 'NETWORK_TIMEOUT',
      effect: 'apply',
      effectDelayMs: 1500,
      omitEvent: true,
      barrier: { phase: 'before-response', name: 'read-lock-send-response' },
    });
    qa.agent.enqueueTurns(
      send(toolId),
      { ...send(reuseId), barrier: { phase: 'before-response', name: 'read-lock-reuse' } },
      { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } },
    );
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      senderPlatformUserId: 'read-lock-external',
      text: 'start delivery read check',
    });
    const runs = await observe({
      read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      invariant: () => {},
      complete: (value) => value.length > 0,
      durationMs: 5000,
    });
    if (!runs.complete) throw new BlockedError('本例未取得实际run；5000ms是QA准备预算');
    const runId = runs.last[0]!.id;
    lease = await control.arm('observe-tool-wait', {
      kind: 'tool-wait',
      groupId: group.id,
      runId,
      toolUseId: 'all-run-steps',
    });
    try {
      await qa.gateway.barriers.waitFor('read-lock-send-response');
    } catch (error) {
      throw new BlockedError(`目标发送故障屏障未命中: ${String(error)}`);
    }
    qa.gateway.configure({ unavailable: true });
    const started = await lease.waitFor('send-wait-started', 5000);
    const start = started.events.find(
      (event) => event.kind === 'send-wait-started' && event.toolUseId === toolId,
    );
    if (!start || typeof start.clientMsgId !== 'string')
      throw new BlockedError('缺原工具实际等待开始与消息身份');
    const clientMsgId = start.clientMsgId;
    const outgoing = qa.gateway
      .snapshot()
      .requests.filter((request) => request.path === `/groups/${group.gatewayGroupId}/send`);
    check('witness matches actual original send', () => {
      assert.equal(outgoing.length, 1);
      assert.equal((outgoing[0]!.body as { clientMsgId: string }).clientMsgId, clientMsgId);
    });
    pgEvidence.correlation = {
      runId,
      groupId: group.id,
      clientMsgId,
      toolUseId: toolId,
      attemptId: start.attemptId,
    };
    await record('before-lock', started);
    if (
      started.events.some(
        (event) => event.kind === 'send-tool-result-returned' && event.toolUseId === toolId,
      )
    ) {
      check('tool returned before fault preparation', () =>
        assertToolWaitBudget(toolWaitWindow(started.events, toolId, key), 'SEND_TIMEOUT'),
      );
      throw new BlockedError('工具在表锁准备前已经交还，未命中目标等待读取窗口');
    }
    const inspectedAgain = JSON.parse(
      (
        await exec('docker', ['--host', 'unix:///var/run/docker.sock', 'inspect', cluster.name], {
          timeout: 5000,
          env: isolatedEnv({}),
        })
      ).stdout,
    ) as unknown[];
    if (
      inspectedAgain.length !== 1 ||
      ownedPgContainer(inspectedAgain[0], {
        name: cluster.name,
        owner: cluster.owner,
        port: cluster.port,
        database,
        registered: cluster.ownsDatabase(database),
      }) !== containerId
    )
      throw new BlockedError('加锁前自有数据库容器身份变化');
    // Bound only our fixture acquisition and maximum retained lock lifetime.
    // No global database setting or product deadline is changed.
    await locker.query("SET idle_in_transaction_session_timeout='12000ms'");
    await locker.query('BEGIN');
    locked = true;
    await locker.query("SET LOCAL lock_timeout='1500ms'");
    await locker.query("SET LOCAL statement_timeout='2000ms'");
    try {
      await locker.query('LOCK TABLE public.messages IN ACCESS EXCLUSIVE MODE');
    } catch (error) {
      throw new BlockedError(`QA真实表锁未取得（不算产品时限失败）: ${String(error)}`);
    }
    pgEvidence.lockHeld = { at: new Date().toISOString(), parentMs: performance.now() };
    blockedMessageReaders(await snapshotPg(), lockOwner);
    qa.gateway.barriers.release('read-lock-send-response');
    const invariant = () => {
      const gateway = qa.gateway.snapshot();
      assert.ok(
        gateway.requests.filter((r) => r.path === `/groups/${group.gatewayGroupId}/send`).length <=
          1,
        '同一原消息出现额外send请求',
      );
      assert.ok(
        gateway.messages.filter((m) => m.clientMsgId === clientMsgId).length <= 1,
        '原消息真实落地重复',
      );
      assert.ok(qa.agent.snapshot().audits.length <= 1, '同key出现额外审计');
    };
    // All timing decisions use the original process witness, never this loop,
    // the locker acquisition, a next turn, or a fabricated ROLLBACK event.
    const waiting = await observe({
      read: async () => {
        check('side effects while locked', invariant);
        try {
          const sample = await snapshotPg();
          for (const candidate of blockedMessageReaders(sample, lockOwner))
            candidates.set(
              `${candidate.pid}:${candidate.backend_start}:${candidate.query_start}`,
              candidate,
            );
        } catch (error) {
          missing.push(`PG采样/持锁确认: ${String(error)}`);
        }
        try {
          return await lease!.snapshot();
        } catch (error) {
          missing.push(`tool witness读取: ${String(error)}`);
          return lease!.latest!;
        }
      },
      invariant: (snapshot) => {
        if (
          snapshot.events.some(
            (event) => event.kind === 'send-tool-result-returned' && event.toolUseId === toolId,
          )
        )
          check('strict original tool window', () =>
            assertToolWaitBudget(toolWaitWindow(snapshot.events, toolId, key), 'SEND_TIMEOUT'),
          );
      },
      complete: (snapshot) =>
        snapshot.events.some(
          (event) => event.kind === 'send-tool-result-returned' && event.toolUseId === toolId,
        ),
      durationMs: 8000,
      intervalMs: 20,
    });
    await record('while-locked', waiting);
    if (!waiting.complete)
      missing.push('锁保持期间8000ms QA观察窗口内未取得工具实际交还；不以该预算代替严格5秒');
    if (!candidates.size)
      missing.push('未实际捕获受本locker阻塞的messages SELECT，不能声称命中受控读取');
    try {
      const afterReturn = await snapshotPg();
      check('holder still exists at tool-return observation', () => {
        blockedMessageReaders(afterReturn, lockOwner);
      });
      pgEvidence.afterToolReturn = {
        actuallyReturned: waiting.complete,
        candidates: [...candidates.values()].map((candidate) => ({
          candidate,
          diagnostic: readerAfterReturn(candidate, afterReturn.activities),
        })),
      };
    } catch (error) {
      missing.push(`工具交还后PG诊断不可用: ${String(error)}`);
    }
    // Current public witness lacks PG backend/query/transaction identity. Never
    // certify server cancellation or SUT ROLLBACK from an unrelated reader or a
    // later idle pool connection. Continue public recovery assertions first.
    missing.push(
      'PG真实锁链已取证但公开tool-wait未关联backend PID/backend_start/query attempt；不能唯一归属waitForDelivery，也不能确认其服务端取消与串行ROLLBACK。缺口须以真实只读观测契约补齐，不能伪造事件',
    );
    await release();
    qa.gateway.configure({ unavailable: false });
    const sent = await observe({
      read: () => qa.api.messages(group.id),
      invariant: (page) => {
        check('post-release side effects', invariant);
        check('original public message', () => {
          const found = page.items.filter((message) => message.clientMsgId === clientMsgId);
          assert.ok(found.length <= 1, '公开原消息重复');
          for (const message of found) {
            assert.equal(message.text, text);
            assert.ok(
              !['failed', 'cancelled'].includes(message.deliveryStatus ?? ''),
              '本地读取超时不应把已实际发送消息改为失败',
            );
          }
        });
      },
      complete: (page) =>
        page.items.some(
          (message) => message.clientMsgId === clientMsgId && message.deliveryStatus === 'sent',
        ),
      durationMs: 10_000,
    });
    await record('after-unlock-messages', sent);
    if (!sent.complete) missing.push('独立10秒恢复观察预算内未取得原消息sent；无新增业务恢复SLA');
    try {
      const originalAfterRelease = await lease.snapshot();
      check('original tool after release timing', () =>
        assertToolWaitBudget(
          toolWaitWindow(originalAfterRelease.events, toolId, key),
          'SEND_TIMEOUT',
        ),
      );
      check('original tool after release history', () =>
        assertToolWaitCompletion(toolWaitWindow(originalAfterRelease.events, toolId, key)),
      );
      await record('original-tool-after-release', originalAfterRelease);
    } catch (error) {
      if (!(error instanceof BlockedError)) throw error;
      missing.push(`原工具解锁后观测: ${error.message}`);
    }
    // Release only after the original sent fact is visible. Otherwise the
    // same-key call's expected result is not established.
    if (sent.complete) {
      qa.agent.barriers.release('read-lock-reuse');
      const end = await observe({
        read: () => qa.api.agentRun(runId),
        invariant: (run) => {
          check('final side effects', invariant);
          check('public run outcome', () => {
            assert.ok(
              !['failed', 'cancelled', 'blocked'].includes(run.status),
              '发送状态读取故障后原run异常终止',
            );
          });
        },
        complete: (run) => run.status === 'finished',
        durationMs: 10_000,
      });
      await record('final-public-run', end);
      if (!end.complete) missing.push('10秒QA恢复观察未见原run完成；不伪造完成或任意截止期');
      const final = await lease.snapshot();
      await record('final-tool-witness', final);
      for (const [id, reused, code] of [
        [toolId, false, 'SEND_TIMEOUT'],
        [reuseId, true, null],
      ] as const) {
        check(`${id} timing`, () =>
          assertToolWaitBudget(toolWaitWindow(final.events, id, key), code),
        );
        check(`${id} real history`, () => {
          const window = toolWaitWindow(final.events, id, key);
          assert.equal(window.clientMsgId, clientMsgId);
          assert.equal(window.keyReused, reused);
          if (reused) {
            const result = window.result as { clientMsgId?: string; deliveryStatus?: string };
            assert.equal(result.clientMsgId, clientMsgId);
            assert.equal(result.deliveryStatus, 'sent', '同key须返回原消息当前真实sent事实');
          }
          assertToolWaitCompletion(window);
        });
      }
      if (end.complete)
        check('public persisted history and independent effects', () => {
          const first = end.last.steps.filter((step) => step.toolUseId === toolId);
          const reuse = end.last.steps.filter((step) => step.toolUseId === reuseId);
          assert.equal(first.length, 1);
          assert.equal(first[0]!.errorCode, 'SEND_TIMEOUT');
          assert.equal(first[0]!.isError, true);
          assert.equal(reuse.length, 1);
          assert.equal(reuse[0]!.isError, false);
          assert.equal(qa.agent.snapshot().audits.length, 1);
          const gateway = qa.gateway.snapshot();
          assert.equal(
            gateway.requests.filter((r) => r.path === `/groups/${group.gatewayGroupId}/send`)
              .length,
            1,
          );
          assert.equal(gateway.messages.filter((m) => m.clientMsgId === clientMsgId).length, 1);
        });
    }
  } catch (error) {
    primary = error;
  } finally {
    try {
      await release();
    } catch (error) {
      pgErrors.push(`QA locker ROLLBACK: ${String(error)}`);
      primary ??= new BlockedError('QA自有表锁清理失败，详见真实PG证据');
    }
    qa.gateway.configure({ unavailable: false });
    qa.gateway.barriers.release('read-lock-send-response');
    qa.agent.barriers.release('read-lock-reuse');
    const qaClientCleanup: { role: string; endCompleted: boolean; at: string }[] = [];
    for (const [role, client] of [
      ['locker', locker],
      ['observer', observer],
    ] as const)
      try {
        await client?.end();
        qaClientCleanup.push({ role, endCompleted: !!client, at: new Date().toISOString() });
      } catch (error) {
        pgErrors.push(`QA client end: ${String(error)}`);
        qaClientCleanup.push({ role, endCompleted: false, at: new Date().toISOString() });
      }
    pgEvidence.qaClientCleanup = qaClientCleanup;
    try {
      await control.close();
    } catch (error) {
      primary ??= error;
    }
    try {
      await record('raw-database-observation', {
        ...pgEvidence,
        samples,
        pgErrors,
        assertions,
        missing: [...new Set(missing)],
        productEvidence: { gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot() },
      });
    } catch (error) {
      primary ??= error;
    }
  }
  // Explicit product violations collected before a later evidence gap win.
  if (violation) throw violation;
  if (primary) throw primary;
  if (pgErrors.length) missing.push(...pgErrors);
  if (missing.length) throw new BlockedError([...new Set(missing)].join('; '));
});
