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
import {
  assertReadCausalEvidence,
  assertAgentSaveBoundary,
  assertRecoveredSendProof,
  assertPendingSendCounts,
  type ReadIdentity,
  type CausalPgSample,
} from '../support/delivery-read-causal-followup.js';
import type { AgentRun } from '../../harness/platform-client.js';
import {
  ownedPgContainer,
  blockedMessageReaders,
  readerAfterReturn,
  type PgActivity,
  type PgLockSample,
} from '../support/delivery-read-observation.js';

const toolId = 'read-causal-send';
const reuseId = 'read-causal-reuse';
const key = 'read-causal-same-key';
const text = 'independent QA delivery read under real PG lock';
const send = (id: string) => ({
  body: {
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', id, name: 'send_message', input: { text, idempotency_key: key } },
    ],
  },
});

test('[INT-READ-SAVE-ROLLBACK-001] publicly initiated send survives a real original-history save rollback and same-key process recovery', async ({
  qa,
}) => {
  test.setTimeout(90_000);
  const { cluster, database } = qa.ownedStorage();
  const tool = 'read-causal-save-fault';
  const modelBarrier = 'read-causal-save-model';
  const sendBarrier = 'read-causal-save-send';
  const finalBarrier = 'read-causal-save-final';
  const suffix = randomUUID().replaceAll('-', '');
  const functionName = `qa_history_failure_${suffix}`;
  const triggerName = `qa_history_failure_${suffix}`;
  const controls = [runtimeObservationFor(qa)];
  let observer: Client | undefined;
  let createdFunction = false,
    createdTrigger = false;
  let containerId: string | undefined;
  let primary: unknown, violation: unknown;
  const missing: string[] = [];
  const claims: { stage: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; error?: string }[] = [];
  const evidence: Record<string, unknown> = {
    database,
    owner: cluster.owner,
    fault: {
      functionName,
      triggerName,
      sqlState: 'P0001',
      target: 'original tool_result history only',
    },
  };
  const check = (stage: string, body: () => void) => {
    try {
      body();
      claims.push({ stage, status: 'PASS' });
    } catch (error) {
      if (error instanceof BlockedError) {
        missing.push(`${stage}: ${error.message}`);
        claims.push({ stage, status: 'BLOCKED', error: error.message });
      } else {
        violation ??= error;
        claims.push({ stage, status: 'FAIL', error: String(error) });
      }
    }
  };
  const verifyOwnership = async () => {
    const inspected = JSON.parse(
      (
        await exec('docker', ['--host', 'unix:///var/run/docker.sock', 'inspect', cluster.name], {
          timeout: 5000,
          env: isolatedEnv({}),
        })
      ).stdout,
    ) as unknown[];
    if (inspected.length !== 1) throw new BlockedError('保存故障前自有容器inspect不唯一');
    const id = ownedPgContainer(inspected[0], {
      name: cluster.name,
      owner: cluster.owner,
      port: cluster.port,
      database,
      registered: cluster.ownsDatabase(database),
    });
    if (containerId && id !== containerId) throw new BlockedError('保存故障fixture容器身份改变');
    containerId = id;
    return id;
  };
  const removeFault = async () => {
    if (!createdTrigger && !createdFunction) return;
    await verifyOwnership();
    if (!observer) throw new BlockedError('专属trigger缺清理连接');
    if (createdTrigger) {
      await observer.query(`DROP TRIGGER "${triggerName}" ON public.agent_runs`);
      createdTrigger = false;
    }
    if (createdFunction) {
      await observer.query(`DROP FUNCTION public."${functionName}"()`);
      createdFunction = false;
    }
    evidence.faultRemoved = { at: new Date().toISOString(), qaParentMs: performance.now() };
  };
  try {
    const control = controls[0]!;
    await control.verify(['tool-wait-witness']);
    await verifyOwnership();
    observer = new Client({
      connectionString: cluster.url(database),
      application_name: `qa-int-read-save-${suffix}`,
      connectionTimeoutMillis: 2000,
      query_timeout: 5000,
    });
    observer.on('error', (error) => missing.push(`QA专属PG连接: ${String(error)}`));
    await observer.connect();
    await observer.query("SET lock_timeout='1500ms'");
    await observer.query("SET statement_timeout='2000ms'");
    const schema = await observer.query<{
      database: string;
      role: string;
      table: string;
      column: string;
      data_type: string;
    }>(`
      SELECT current_database() AS database,current_user AS role,
        table_name AS "table",column_name AS "column",data_type
      FROM information_schema.columns WHERE table_schema='public'
        AND ((table_name='agent_runs' AND column_name IN ('id','history'))
          OR (table_name='agent_steps' AND column_name IN ('run_id','tool_use_id','ordinal','state','result')))`);
    const required = [
      'agent_runs.id',
      'agent_runs.history',
      'agent_steps.run_id',
      'agent_steps.tool_use_id',
      'agent_steps.ordinal',
      'agent_steps.state',
      'agent_steps.result',
    ];
    if (
      schema.rows.some((row) => row.database !== database || row.role !== 'qa') ||
      required.some(
        (column) => !schema.rows.some((row) => `${row.table}.${row.column}` === column),
      ) ||
      !schema.rows.some(
        (row) =>
          row.table === 'agent_runs' &&
          row.column === 'id' &&
          ['text', 'uuid'].includes(row.data_type),
      )
    )
      throw new BlockedError('自有保存故障库/角色/只读投影结构不匹配，禁止DDL');
    evidence.containerId = containerId;
    evidence.schema = schema.rows;
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
      status: 200,
      effect: 'apply',
      omitEvent: true,
      barrier: { phase: 'before-response', name: sendBarrier },
    });
    qa.agent.enqueueTurns(
      { ...send(tool), barrier: { phase: 'before-response', name: modelBarrier } },
      {
        body: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'done after original save recovery' }],
        },
        barrier: { phase: 'before-response', name: finalBarrier },
      },
    );
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      senderPlatformUserId: 'qa-read-save-external',
      text: 'original public flow; actual local history failure',
    });
    await qa.agent.barriers.waitFor(modelBarrier);
    const runs = await observe({
      read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      invariant: () => {},
      complete: (value) => value.length === 1,
      durationMs: 5000,
    });
    if (!runs.complete) throw new BlockedError('保存专项未取得原公开run');
    const runId = runs.last[0]!.id;
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(runId))
      throw new BlockedError('原run identity不是可安全定位的UUID');
    let lease = await control.arm('observe-tool-wait', {
      kind: 'tool-wait',
      groupId: group.id,
      runId,
      toolUseId: 'all-run-steps',
    });
    // Only this fresh run and this actual tool_result are rejected. The model
    // response history and unrelated rows remain readable/writable. No business
    // rows, active budgets, completed steps or idempotency records are seeded.
    await verifyOwnership();
    await observer.query(`CREATE FUNCTION public."${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $qa$
      BEGIN
        IF NEW.id::text='${runId}' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.history::jsonb,'[]'::jsonb)) AS m,
          LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m->'content')='array'
            THEN m->'content' ELSE '[]'::jsonb END) AS t
          WHERE t->>'type'='tool_result' AND t->>'tool_use_id'='${tool}') THEN
          RAISE EXCEPTION 'independent QA owned history fault' USING ERRCODE='P0001';
        END IF;
        RETURN NEW;
      END $qa$`);
    createdFunction = true;
    await observer.query(`CREATE TRIGGER "${triggerName}" BEFORE UPDATE OF history ON public.agent_runs
      FOR EACH ROW EXECUTE FUNCTION public."${functionName}"()`);
    createdTrigger = true;
    evidence.faultInstalled = {
      runId,
      groupId: group.id,
      toolUseId: tool,
      at: new Date().toISOString(),
    };
    qa.agent.barriers.release(modelBarrier);
    await qa.gateway.barriers.waitFor(sendBarrier);
    const before = await lease.snapshot();
    const entered = before.events.filter(
      (event) => event.kind === 'send-tool-entered' && event.toolUseId === tool,
    );
    const started = before.events.filter(
      (event) => event.kind === 'send-wait-started' && event.toolUseId === tool,
    );
    if (
      entered.length !== 1 ||
      started.length !== 1 ||
      typeof started[0]!.clientMsgId !== 'string' ||
      typeof entered[0]!.stepId !== 'string' ||
      typeof entered[0]!.clockDomain !== 'string' ||
      before.events.some(
        (event) => event.kind === 'send-tool-result-returned' && event.toolUseId === tool,
      )
    )
      throw new BlockedError('trigger已安装但未命中原真实send/保存前窗口');
    const clientMsgId = started[0]!.clientMsgId as string;
    const origin: ReadIdentity = {
      groupId: group.id,
      runId,
      toolUseId: tool,
      stepId: entered[0]!.stepId,
      attemptId: entered[0]!.attemptId,
      clientMsgId,
      clockDomain: entered[0]!.clockDomain,
    };
    const projection = async () => ({
      run: (
        await observer!.query(
          'SELECT id,history::jsonb AS history FROM public.agent_runs WHERE id=$1',
          [runId],
        )
      ).rows,
      step: (
        await observer!.query(
          'SELECT run_id,tool_use_id,ordinal,state,result FROM public.agent_steps WHERE run_id=$1 AND tool_use_id=$2',
          [runId, tool],
        )
      ).rows,
    });
    const baseline = await projection();
    if (
      baseline.run.length !== 1 ||
      baseline.step.length !== 1 ||
      baseline.step[0]!.result !== null
    )
      throw new BlockedError('原公开流程未形成唯一真实未完成step基线');
    evidence.original = origin;
    const publicBefore = await qa.api.agentRun(runId);
    evidence.before = { witness: before, baseline, publicRun: publicBefore };
    const effects = () => {
      const gateway = qa.gateway.snapshot();
      assert.equal(
        gateway.requests.filter(
          (request) => request.path === `/groups/${group.gatewayGroupId}/send`,
        ).length,
        1,
        '同一原发送出现重复实际send',
      );
      assert.equal(
        gateway.messages.filter((message) => message.clientMsgId === clientMsgId).length,
        1,
        '原消息实际副作用未唯一落地',
      );
      assert.equal(qa.agent.snapshot().audits.length, 1, '同key重复审计');
    };
    // before-response controls HTTP only. This gateway protocol permits an
    // asynchronously applied message; zero while it is pending is not a
    // product violation. Establish actual remote application before releasing
    // the original HTTP response to the local save fault.
    const remoteApply = await observe({
      read: async () => qa.gateway.snapshot(),
      invariant: (gateway) =>
        check('pending remote apply has no duplicates', () =>
          assertPendingSendCounts({
            sends: gateway.requests.filter(
              (request) => request.path === `/groups/${group.gatewayGroupId}/send`,
            ).length,
            landed: gateway.messages.filter((message) => message.clientMsgId === clientMsgId)
              .length,
            audits: qa.agent.snapshot().audits.length,
          }),
        ),
      complete: (gateway) =>
        gateway.messages.filter((message) => message.clientMsgId === clientMsgId).length === 1,
      durationMs: 2000,
      intervalMs: 10,
    });
    evidence.remoteApplyGate = {
      ...remoteApply,
      observationBudgetMs: 2000,
      note: '独立网关实际账本确认；before-response不是after-effect，不给产品增加即时落地要求',
    };
    if (!remoteApply.complete)
      throw new BlockedError(
        '独立网关桩未在协议2秒观察预算内实际落地；保存故障前提缺失，不记产品FAIL',
      );
    check('original send and audit really happened once before local failure', effects);
    qa.gateway.barriers.release(sendBarrier);
    const failed = await observe({
      read: () => lease.snapshot(),
      invariant: () => check('finite failure observation side effects', effects),
      complete: (snapshot) =>
        snapshot.events.some(
          (event) =>
            String(event.kind) === 'send-tool-history-save-failed' &&
            event.attemptId === origin.attemptId,
        ),
      durationMs: 8000,
      intervalMs: 20,
    });
    if (!failed.complete) missing.push('未取得原真实history保存拒绝；QA8000ms观察不是业务SLA');
    check('original five-second success remains a separate strict check', () =>
      assertToolWaitBudget(toolWaitWindow(failed.last.events, tool, key), null),
    );
    check('actual original Agent UPDATE/P0001/outer ROLLBACK', () => {
      evidence.rollback = assertAgentSaveBoundary(failed.last.events, origin, 'rollback');
    });
    const rolledBack = await projection();
    check('real original step and history remain unchanged by failed transaction', () => {
      assert.deepEqual(rolledBack, baseline, '实际ROLLBACK后step/result/history出现部分保存');
    });
    const failedPublic = await qa.api.agentRun(runId);
    check('public history never advertises the failed step as saved', () => {
      const step = failedPublic.steps.filter((item) => item.toolUseId === tool);
      assert.equal(step.length, 1);
      const previous = publicBefore.steps.filter((item) => item.toolUseId === tool);
      if (previous.length !== 1) throw new BlockedError('原未保存step公开基线缺失');
      assert.equal(
        step[0]!.resultSummary,
        previous[0]!.resultSummary,
        '实际未提交step已对外显示保存结果',
      );
      assert.equal(step[0]!.isError, previous[0]!.isError);
      assert.equal(step[0]!.errorCode, previous[0]!.errorCode);
    });
    check('no later model turn precedes actual original history commit', () =>
      assert.equal(qa.agent.snapshot().turns.length, 1, '实际保存失败后仍请求下一模型turn'),
    );
    evidence.failed = {
      observation: failed,
      rolledBack,
      publicRun: failedPublic,
      gateway: qa.gateway.snapshot(),
      agent: qa.agent.snapshot(),
    };
    // End the failure capture before removing our fault. Restart retains all
    // existing remote/DB state, and the next execution is reported separately.
    await control.close();
    controls.shift();
    await qa.kill();
    await removeFault();
    await qa.start();
    const nextControl = runtimeObservationFor(qa);
    controls.push(nextControl);
    await nextControl.verify(['tool-wait-witness']);
    lease = await nextControl.arm('observe-tool-wait', {
      kind: 'tool-wait',
      groupId: group.id,
      runId,
      toolUseId: 'all-run-steps',
    });
    const resumed = await observe({
      read: () => lease.snapshot(),
      invariant: () => check('finite restart recovery side effects', effects),
      complete: (snapshot) =>
        snapshot.events.some(
          (event) => event.kind === 'send-tool-history-committed' && event.toolUseId === tool,
        ),
      durationMs: 12_000,
      intervalMs: 25,
    });
    if (!resumed.complete)
      missing.push('12秒QA恢复观察未取得原step真实COMMIT；不以新固定期限替代需求');
    check('same original key is reused in a distinct actual process attempt', () => {
      const recovery = assertRecoveredSendProof({
        originalEvents: failed.last.events,
        originalIdentity: origin,
        baseline,
        rolledBack,
        publicBefore,
        recoveredEvents: resumed.last.events,
        key,
      });
      evidence.restoredSourceProof = recovery;
      evidence.recoveryCommit = recovery.recovery.commit;
    });
    const recoveredRows = await projection();
    check('real recovered original step and tool_result are durable', () => {
      assert.equal(recoveredRows.step.length, 1);
      assert.equal(recoveredRows.step[0]!.state, 'complete');
      assert.equal(recoveredRows.step[0]!.result?.clientMsgId, clientMsgId);
      assert.equal(recoveredRows.step[0]!.result?.deliveryStatus, 'sent');
      const resultBlocks = (recoveredRows.run[0]!.history as { content?: unknown }[])
        .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
        .filter(
          (item: { type?: string; tool_use_id?: string }) =>
            item.type === 'tool_result' && item.tool_use_id === tool,
        );
      assert.equal(resultBlocks.length, 1, '原tool_result持久化重复或缺失');
    });
    evidence.recovered = {
      observation: resumed,
      rows: recoveredRows,
      gateway: qa.gateway.snapshot(),
      agent: qa.agent.snapshot(),
    };
    qa.agent.barriers.release(finalBarrier);
    const final = await observe({
      read: () => qa.api.agentRun(runId),
      invariant: () => check('final finite original side effects', effects),
      complete: (run) => run.status === 'finished',
      durationMs: 10_000,
    });
    if (!final.complete) missing.push('原run恢复后10秒QA观察未完成；不拼作全面强恢复保证');
    evidence.final = final;
  } catch (error) {
    primary = error;
  } finally {
    try {
      await removeFault();
    } catch (error) {
      missing.push(`专属trigger清理失败: ${String(error)}`);
    }
    qa.agent.barriers.release(modelBarrier);
    qa.agent.barriers.release(finalBarrier);
    qa.gateway.barriers.release(sendBarrier);
    for (const control of controls)
      try {
        await control.close();
      } catch (error) {
        missing.push(`观察lease清理: ${String(error)}`);
      }
    try {
      await observer?.end();
    } catch (error) {
      missing.push(`专属PG连接清理: ${String(error)}`);
    }
    evidence.cleanup = { createdFunction, createdTrigger, at: new Date().toISOString() };
    try {
      await qa.evidence('delivery-read-causal-save-rollback', {
        ...evidence,
        claims,
        missing: [...new Set(missing)],
        primary: primary ? String(primary) : null,
      });
    } catch (error) {
      primary ??= error;
    }
  }
  if (violation) throw violation;
  if (primary) throw primary;
  if (missing.length) throw new BlockedError([...new Set(missing)].join('; '));
});
// Diagnostic SQL is deliberately confined to this owned database. Table names
// locate the injected fault; no business rows are written or used as an oracle.
const activitySql = `SELECT a.pid, a.datname, a.usename, a.application_name,
 a.backend_start::text, a.xact_start::text, a.query_start::text,
 a.state, a.wait_event_type, a.wait_event, a.query, pg_blocking_pids(a.pid) AS blockers,
 COALESCE((SELECT json_agg(json_build_object('relation',l.relation::bigint,'mode',l.mode,'granted',l.granted))
 FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='relation'), '[]'::json) AS relation_locks
 FROM pg_stat_activity a WHERE a.datname=current_database() AND a.backend_type='client backend'
 ORDER BY a.pid`;

test('[INT-READ-CAUSAL-001] original locked read, real SQL rollback and actual Agent history commit remain independent of strict five seconds', async ({
  qa,
}) => {
  test.setTimeout(60_000);
  const missing: string[] = [];
  const assertions: { stage: string; error: string }[] = [];
  const claims: { stage: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; error?: string }[] = [];
  let violation: unknown;
  const check = (stage: string, body: () => void) => {
    try {
      body();
      claims.push({ stage, status: 'PASS' });
    } catch (error) {
      if (error instanceof BlockedError) {
        missing.push(`${stage}: ${error.message}`);
        claims.push({ stage, status: 'BLOCKED', error: error.message });
      } else {
        violation ??= error;
        assertions.push({ stage, error: String(error) });
        claims.push({ stage, status: 'FAIL', error: String(error) });
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
  const causalSamples: CausalPgSample[] = [];
  const candidates = new Map<string, PgActivity>();
  const pgErrors: string[] = [];
  let locker: Client | undefined, observer: Client | undefined;
  let lease: RuntimeLease | undefined;
  let locked = false;
  let primary: unknown;
  const record = async (name: string, value: unknown) =>
    qa.evidence(`delivery-read-causal-${name}`, value);
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
    if (typeof start.stepId !== 'string' || typeof start.clockDomain !== 'string')
      throw new BlockedError('原工具缺真实step/clock身份');
    const readIdentity: ReadIdentity = {
      groupId: group.id,
      runId,
      toolUseId: toolId,
      stepId: start.stepId,
      attemptId: start.attemptId,
      clientMsgId,
      clockDomain: start.clockDomain,
    };
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
          const before = await lease!.snapshot();
          const sample = await snapshotPg();
          const after = await lease!.snapshot();
          causalSamples.push({ pg: sample, before: before.events, after: after.events });
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
    // The original strict timing assertion has already run. Continue collecting
    // causal evidence even if that physical bound failed; a cleanup PASS cannot
    // turn it into a timing PASS, and later gaps cannot mask its first failure.
    check('actual original lock-query-cancel-rollback-release chain', () => {
      pgEvidence.readCausal = assertReadCausalEvidence({
        events: waiting.last.events,
        identity: readIdentity,
        samples: causalSamples,
        lockOwner,
      });
    });
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
      check('actual original Agent outer save COMMIT', () => {
        pgEvidence.originalSave = assertAgentSaveBoundary(
          originalAfterRelease.events,
          readIdentity,
          'commit',
        );
      });
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
          assertAgentSaveBoundary(
            final.events,
            {
              ...readIdentity,
              toolUseId: id,
              stepId: String(window.stepId),
              attemptId: window.attemptId,
            },
            'commit',
          );
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
        causalSamples,
        pgErrors,
        assertions,
        claims,
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
