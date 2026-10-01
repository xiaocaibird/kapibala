import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { test, expect } from '../fixtures.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { eventually, type AgentRun, type ApiError } from '../../harness/platform-client.js';
import { BlockedError, redact } from '../../harness/security.js';
import { observe } from '../../harness/observation.js';
import { assertContract } from '../../contracts/public-api.js';
import {
  runtimeObservationFor,
  RuntimeObservation,
  atPointer,
  diagnosticModule,
  assertActivityBudget,
  assertRecoveredActivity,
  assertNoRecoveryPause,
  type RuntimeEvent,
  type RuntimeLease,
} from '../../harness/runtime-observation.js';
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function recordCleanupFailure(qa: QaEnvironment, name: string, error: unknown) {
  try {
    await qa.evidence(name, { error: String(error) });
  } catch (evidenceError) {
    // Evidence failure must not replace the original product or cleanup failure.
    console.error(
      redact({ secondary: name, error: String(error), evidenceError: String(evidenceError) }),
    );
  }
}
async function withControl(
  qa: QaEnvironment,
  capabilities: string[],
  body: (control: RuntimeObservation) => Promise<void>,
) {
  const control = runtimeObservationFor(qa);
  await control.verify(capabilities);
  let failed = false;
  try {
    await body(control);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await control.close();
    } catch (error) {
      await recordCleanupFailure(qa, 'runtime-cleanup-failure', error);
      if (!failed) throw error;
    }
  }
}
async function stream(qa: QaEnvironment) {
  const frames: { type?: string; success?: boolean; payload?: Record<string, unknown> }[] = [];
  const ws = new WebSocket(new URL('/ws', qa.api.baseUrl).href.replace(/^http/, 'ws'));
  let parseError: unknown;
  ws.on('message', (raw) => {
    try {
      frames.push(JSON.parse(raw.toString()));
    } catch (error) {
      parseError = error;
    }
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new BlockedError('隔离WS连接未建立'));
    }, 5000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  ws.send(JSON.stringify({ type: 'auth', accessToken: qa.api.token }));
  try {
    await eventually(
      async () => frames,
      (values) => values.some((frame) => frame.type === 'auth' && frame.success),
    );
  } catch (error) {
    ws.terminate();
    throw error;
  }
  return {
    frames,
    check: () => {
      if (parseError) throw parseError;
      expect(ws.readyState).toBe(WebSocket.OPEN);
    },
    close: () => ws.terminate(),
  };
}
const accountEvents = (
  frames: { type?: string; payload?: Record<string, unknown> }[],
  id: string,
) =>
  frames.filter(
    (frame) =>
      ['account_status_changed', 'account_terminal'].includes(frame.type ?? '') &&
      frame.payload?.accountId === id,
  );
function transactionEvents(lease: RuntimeLease): RuntimeEvent[] {
  const events = lease.latest!.events;
  const ids = new Set(events.map((event) => event.transactionId));
  expect(ids.size, '同一原事务局部重试不得切新事务重放旧意图').toBe(1);
  expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
  expect(events.filter((event) => event.kind === 'remote-success')).toHaveLength(1);
  const remoteIndex = events.findIndex((event) => event.kind === 'remote-success');
  const failureIndex = events.findIndex((event) => event.kind === 'local-save-failed');
  expect(failureIndex).toBeGreaterThan(remoteIndex);
  for (const kind of ['local-save-committed', 'transaction-rolled-back']) {
    const index = events.findIndex((event) => event.kind === kind);
    if (index !== -1) expect(index).toBeGreaterThan(failureIndex);
  }
  const waitingIndex = events.findIndex((event) => event.kind === 'newer-account-intent-waiting');
  if (waitingIndex !== -1) {
    expect(waitingIndex).toBeGreaterThan(
      events.findIndex((event) => event.kind === 'local-retry-held'),
    );
    const commitIndex = events.findIndex((event) => event.kind === 'local-save-committed');
    if (commitIndex !== -1) expect(commitIndex).toBeGreaterThan(waitingIndex);
  }
  return events;
}

test('[INT-ACT-001] activity budget accumulates across restart and excludes proven downtime without tail tolerance', async ({
  qa,
}) => {
  test.setTimeout(150_000);
  await withControl(qa, ['activity-witness', 'activity-safe-boundary'], async (first) => {
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    qa.agent.enqueueTurns(
      ...Array.from({ length: 16 }, (_, index) => ({
        responseDelayMs: 7000,
        body: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: `activity-${index}`,
              name: 'get_recent_messages',
              input: { limit: index + 1 },
            },
          ],
        },
      })),
    );
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    const createBefore = performance.now();
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      senderPlatformUserId: 'activity-external',
      text: 'runtime-budget-trigger',
    });
    const runs = await eventually(
      () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      (value) => value.length === 1,
    );
    const runId = runs[0]!.id,
      createAfter = performance.now();
    const correlation = {
      kind: 'activity' as const,
      groupId: group.id,
      runId,
      toolUseId: 'all-run-steps',
    };
    const old = await first.arm('observe-activity', correlation);
    await delay(17_000);
    expect((await qa.api.agentRun(runId)).status).toBe('running');
    const checkpoint = await old.waitFor('activity-checkpoint');
    // Seventeen seconds only selects when to request the boundary. It does not
    // prove that a seven-second remote turn has completed and been persisted.
    const safeLease = await first.arm('hold-safe-activity-boundary', correlation);
    const safeBoundary = await safeLease.waitFor('activity-safe-held');
    const agentBeforeCrash = qa.agent.snapshot();
    const runRequestIds = new Set(
      agentBeforeCrash.sessions.find((entry) => entry.runId === runId)?.requestIds,
    );
    const runRequests = agentBeforeCrash.turns.filter((entry) => runRequestIds.has(entry.id));
    if (!runRequests.length || runRequests.some((entry) => !entry.completedAt))
      throw new BlockedError('独立Agent账本未证明安全屏障时所有已发turn均已响应，不执行崩溃');
    expect((await qa.api.agentRun(runId)).status).toBe('running');
    await qa.evidence('activity-before-crash', { checkpoint, safeBoundary, agentBeforeCrash });
    // The lease remains held while this actual process is killed. No next
    // remote dispatch is permitted between this witness and the kill.
    const safetyBeforeKill = await safeLease.snapshot();
    const killBeforeUtc = Date.now();
    if (
      safetyBeforeKill.state !== 'held' ||
      Date.parse(safetyBeforeKill.expiresAt) <= killBeforeUtc
    )
      throw new BlockedError('即将崩溃时安全屏障已释放或到期，不执行未经证明的安全阶段崩溃');
    const stopBefore = performance.now();
    await qa.kill();
    const stopAfter = performance.now();
    const killAfterUtc = Date.now();
    await qa.evidence('activity-kill-window', { safetyBeforeKill, killBeforeUtc, killAfterUtc });
    if (killAfterUtc >= Date.parse(safetyBeforeKill.expiresAt))
      throw new BlockedError('kill完成已跨过安全屏障TTL，不能声称此次发生于安全阶段');
    await delay(5000);
    const startBefore = performance.now();
    await qa.start();
    const startAfter = performance.now();
    await qa.api.login();
    const next = runtimeObservationFor(qa);
    let primary = false;
    try {
      await next.verify(['activity-witness']);
      expect(next.target.pid).not.toBe(first.target.pid);
      const lease = await next.arm('observe-activity', correlation);
      const resumed = await lease.waitFor('activity-checkpoint');
      assertNoRecoveryPause(resumed.events);
      const offline: [number, number] = [startBefore - stopAfter, startAfter - stopBefore];
      let lastRunning: number | undefined, firstTerminal: number | undefined;
      const samples: { before: number; after: number; status: string }[] = [];
      const result = await observe({
        read: async () => {
          const before = performance.now();
          const run = await qa.api.agentRun(runId);
          const after = performance.now();
          samples.push({ before, after, status: run.status });
          if (run.status === 'running') lastRunning = before;
          else firstTerminal ??= after;
          const witness = await lease.snapshot();
          return { run, witness };
        },
        invariant: ({ run, witness }) => {
          expect(run.id).toBe(runId);
          assertNoRecoveryPause(witness.events);
          // An incomplete tail/unknown state blocks a budget conclusion, not
          // the remaining bounded observation of independent recovery/public
          // invariants. Never turn persisted/current-epoch time into run truth.
          for (const event of witness.events) {
            if (event.includesUnsavedTail && event.activeElapsedMs)
              expect(
                event.activeElapsedMs[0],
                '实际活动下界已证明超过原始60秒预算',
              ).toBeLessThanOrEqual(60_000);
          }
          expect(
            qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
          ).toHaveLength(0);
          if (run.status !== 'running')
            expect(run).toMatchObject({ status: 'failed', endReason: 'wall_clock' });
        },
        complete: ({ run }) => run.status !== 'running',
        durationMs: 85_000,
        intervalMs: 100,
      });
      if (!result.complete) {
        await qa.evidence('activity-incomplete-observation', {
          run: result.last.run,
          witness: result.last.witness,
          samples,
          elapsedMs: result.elapsedMs,
          claim:
            '未观察到独立恢复违约；终态或完整活动证据不足，不能判预算通过，也不增设85秒业务SLA',
        });
        throw new BlockedError('预算终态或完整活动证据未在诊断观察期间获得；不增设85秒业务SLA');
      }
      // Public terminal cleanup is independent of activity interval availability.
      expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
      const witness = await lease.waitFor('activity-terminal');
      assertNoRecoveryPause(witness.events);
      const event = witness.events.find((entry) => entry.kind === 'activity-terminal')!;
      const originalEpochs = safeBoundary.events.find(
        (entry) => entry.kind === 'activity-safe-held',
      )!.epochIds!;
      const recoveredEpochs = new Set(event.epochIds);
      if (
        !originalEpochs.every((epoch) => recoveredEpochs.has(epoch)) ||
        ![...recoveredEpochs].some((epoch) => !originalEpochs.includes(epoch))
      )
        throw new BlockedError('活动终态缺少原有及接管epoch完整关联，不能证明重启累计');
      if (lastRunning === undefined || firstTerminal === undefined)
        throw new BlockedError('缺少重启后的running→terminal独立区间');
      const processOnline: [number, number] = [
        Math.max(0, lastRunning - createAfter - offline[1]),
        firstTerminal - createBefore - offline[0],
      ];
      await qa.evidence('activity-restart-budget', {
        checkpoint,
        safeBoundary,
        safetyBeforeKill,
        killBeforeUtc,
        killAfterUtc,
        resumed,
        witness,
        create: [createBefore, createAfter],
        stop: [stopBefore, stopAfter],
        start: [startBefore, startAfter],
        offline,
        processOnline,
        samples,
        claim:
          '进程在线仅给出实际活动上界；真实恢复状态和完整epoch/崩溃尾段另由独立见证证明，不接受固定误差容忍',
      });
      for (const entry of witness.events) assertRecoveredActivity(entry);
      assertActivityBudget(event, processOnline);
    } catch (error) {
      primary = true;
      throw error;
    } finally {
      try {
        await next.close();
      } catch (error) {
        await recordCleanupFailure(qa, 'activity-rebound-cleanup', error);
        if (!primary) throw error;
      }
    }
  });
});

test('[INT-ACCOUNT-001] remote success local transient save retries in the original transaction before a newer disconnect', async ({
  qa,
}) => {
  await withControl(qa, ['account-local-save', 'account-intent-wait'], async (control) => {
    await qa.api.login();
    const account = (await qa.api.accounts()).find((value) => value.status === 'idle');
    if (!account) throw new BlockedError('此例要求独立idle服务账号');
    const lease = await control.arm('account-save-once', {
      kind: 'account',
      accountId: account.id,
      operation: 'connect',
      intentId: randomUUID(),
    });
    const ws = await stream(qa);
    let failed = false;
    let connect: ReturnType<typeof qa.api.post> | undefined;
    let disconnect: ReturnType<typeof qa.api.post> | undefined;
    try {
      connect = qa.api.post(`/api/accounts/${account.id}/connect`);
      void connect.catch(() => {});
      const held = await lease.waitFor('local-retry-held');
      const events = transactionEvents(lease);
      expect(events.findIndex((event) => event.kind === 'remote-success')).toBeLessThan(
        events.findIndex((event) => event.kind === 'local-save-failed'),
      );
      expect(
        qa.gateway
          .snapshot()
          .requests.filter((request) => request.path === `/accounts/${account.id}/connect`),
      ).toHaveLength(1);
      expect((await qa.api.accounts()).find((value) => value.id === account.id)?.status).toBe(
        'idle',
      );
      ws.check();
      expect(accountEvents(ws.frames, account.id)).toHaveLength(0);
      disconnect = qa.api.post(`/api/accounts/${account.id}/transition`, {
        expectedFrom: 'online',
        to: 'disconnected',
      });
      void disconnect.catch(() => {});
      // A local Promise only proves dispatch was requested. The controller must
      // see the later HTTP request waiting behind this real original transaction.
      const competing = await lease.waitFor('newer-account-intent-waiting');
      transactionEvents(lease);
      const waitEvent = competing.events.find(
        (event) => event.kind === 'newer-account-intent-waiting',
      )!;
      expect(waitEvent.waitingIntent!.requestId).not.toBe(waitEvent.requestId);
      expect((await qa.api.accounts()).find((value) => value.id === account.id)?.status).toBe(
        'idle',
      );
      ws.check();
      expect(accountEvents(ws.frames, account.id)).toHaveLength(0);
      expect(
        qa.gateway
          .snapshot()
          .requests.filter((request) => request.path === `/accounts/${account.id}/disconnect`),
      ).toHaveLength(0);
      await lease.advance();
      expect((await connect).status).toBe(200);
      expect((await disconnect).status).toBe(200);
      await lease.waitFor('local-save-committed');
      transactionEvents(lease);
      expect(lease.latest!.events.some((event) => event.kind === 'transaction-rolled-back')).toBe(
        false,
      );
      const quiet = await observe({
        read: () => qa.api.accounts(),
        invariant: (values) => {
          expect(values.find((value) => value.id === account.id)?.status).toBe('disconnected');
          expect(
            qa.gateway
              .snapshot()
              .requests.filter((request) => request.path === `/accounts/${account.id}/connect`),
          ).toHaveLength(1);
          expect(
            qa.gateway
              .snapshot()
              .requests.filter((request) => request.path === `/accounts/${account.id}/disconnect`),
          ).toHaveLength(1);
          ws.check();
        },
        complete: () => false,
        durationMs: 1500,
      });
      await qa.evidence('account-original-transaction-and-newer-intent', {
        held,
        competing,
        final: lease.latest,
        quiet,
        frames: ws.frames,
        gateway: qa.gateway.snapshot(),
      });
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      ws.close();
      try {
        await lease.release();
      } catch (error) {
        await recordCleanupFailure(qa, 'account-lease-cleanup', error);
        if (!failed) throw error;
      } finally {
        await Promise.allSettled([connect, disconnect].filter((value) => value !== undefined));
      }
    }
  });
});

test('[INT-ACCOUNT-002] persistent local save failure rolls back without false status events or automatic remote replay', async ({
  qa,
}) => {
  await withControl(qa, ['account-local-save'], async (control) => {
    await qa.api.login();
    const account = (await qa.api.accounts()).find((value) => value.status === 'idle');
    if (!account) throw new BlockedError('此例要求独立idle服务账号');
    const lease = await control.arm('account-save-persistent', {
      kind: 'account',
      accountId: account.id,
      operation: 'connect',
      intentId: randomUUID(),
    });
    const ws = await stream(qa);
    try {
      const response = await qa.api.post<ApiError>(`/api/accounts/${account.id}/connect`);
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.status).toBeLessThan(600);
      assertContract('error', response.body);
      const snapshot = await lease.waitFor('transaction-rolled-back');
      transactionEvents(lease);
      expect(snapshot.events.some((event) => event.kind === 'local-save-failed')).toBe(true);
      expect(snapshot.events.some((event) => event.kind === 'local-save-committed')).toBe(false);
      const quiet = await observe({
        read: () => qa.api.accounts(),
        invariant: (values) => {
          expect(values.find((value) => value.id === account.id)?.status).toBe('idle');
          ws.check();
          expect(accountEvents(ws.frames, account.id)).toHaveLength(0);
          expect(
            qa.gateway
              .snapshot()
              .requests.filter((request) => request.path === `/accounts/${account.id}/connect`),
          ).toHaveLength(1);
        },
        complete: () => false,
        durationMs: 1500,
      });
      await lease.release();
      await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`), 200);
      await qa.api.require(
        qa.api.post(`/api/accounts/${account.id}/transition`, {
          expectedFrom: 'online',
          to: 'disconnected',
        }),
        200,
      );
      const stable = await observe({
        read: () => qa.api.accounts(),
        invariant: (values) => {
          expect(values.find((value) => value.id === account.id)?.status).toBe('disconnected');
          expect(
            qa.gateway
              .snapshot()
              .requests.filter((request) => request.path === `/accounts/${account.id}/connect`),
          ).toHaveLength(2);
        },
        complete: () => false,
        durationMs: 1500,
      });
      await qa.evidence('account-local-rollback', {
        snapshot,
        quiet,
        stable,
        frames: ws.frames,
        gateway: qa.gateway.snapshot(),
        scope: '持久保存失败不等于跨系统原子提交；远端已连接、本地回滚这一差异如实记录',
      });
    } finally {
      ws.close();
    }
  });
});

test('[INT-DIAG-002] actual tick failure running hold and recovery have truthful restricted diagnostics', async ({
  qa,
}) => {
  await withControl(qa, ['module-tick'], async (control) => {
    const profile = control.config.diagnostics;
    if (!profile) throw new BlockedError('公开诊断字段profile未确认，不能猜字段映射');
    await qa.api.login();
    const marker = `qa-runtime-${randomUUID()}`;
    const lease = await control.arm(
      'module-fail-then-hold',
      { kind: 'module', module: profile.module, attemptLabel: randomUUID() },
      { faultMarker: marker },
    );
    const read = async () => {
      const raw = await qa.api.require(qa.api.get('/api/diagnostics/background'));
      const serialized = JSON.stringify(raw);
      for (const secret of [marker, qa.api.token, qa.api.cookie])
        if (secret)
          expect(serialized.includes(secret), '诊断不得泄漏本次实际错误正文或凭据').toBe(false);
      expect(/postgres(?:ql)?:\/\/|\n\s+at\s+.+:\d+:\d+/i.test(serialized)).toBe(false);
      return { raw, module: diagnosticModule(raw, profile) };
    };
    const failed = await lease.waitFor('module-before-next-held');
    expect(
      failed.events.some((event) => event.kind === 'module-failed' && event.faultMarker === marker),
    ).toBe(true);
    const first = await read();
    expect(atPointer(first.module, profile.statePointer)).toBe(profile.states.failed);
    const failedAt = atPointer(first.module, profile.lastFailureAtPointer);
    expect(typeof failedAt).toBe('string');
    expect(Number.isFinite(Date.parse(String(failedAt)))).toBe(true);
    expect(atPointer(first.module, profile.consecutiveFailuresPointer)).toBeGreaterThanOrEqual(1);
    await lease.advance();
    await lease.waitFor('module-running-held');
    const running1 = await read();
    expect(atPointer(running1.module, profile.statePointer)).toBe(profile.states.running);
    const duration1 = atPointer(running1.module, profile.currentDurationMsPointer);
    expect(typeof duration1).toBe('number');
    expect(duration1).toBeGreaterThanOrEqual(0);
    await delay(150);
    const running2 = await read();
    expect(atPointer(running2.module, profile.currentDurationMsPointer)).toBeGreaterThanOrEqual(
      Number(duration1),
    );
    expect(atPointer(running2.module, profile.lastSuccessAtPointer)).toEqual(
      atPointer(running1.module, profile.lastSuccessAtPointer),
    );
    await lease.advance();
    await lease.waitFor('module-succeeded');
    const done = await read();
    expect(atPointer(done.module, profile.statePointer)).toBe(profile.states.healthy);
    expect(atPointer(done.module, profile.consecutiveFailuresPointer)).toBe(0);
    expect(atPointer(done.module, profile.lastFailureAtPointer)).toBe(failedAt);
    const succeededAt = atPointer(done.module, profile.lastSuccessAtPointer);
    expect(typeof succeededAt).toBe('string');
    expect(Date.parse(String(succeededAt))).toBeGreaterThanOrEqual(Date.parse(String(failedAt)));
    expect(atPointer(done.module, profile.tickCountPointer)).toBeGreaterThan(
      Number(atPointer(first.module, profile.tickCountPointer)),
    );
    await qa.evidence('diagnostic-controlled-lifecycle', {
      failed,
      snapshot: lease.latest,
      first,
      running1,
      running2,
      done,
      scope: '单进程真实tick生命周期与本次秘密样本；不等于业务完成、外部可用或全局健康',
    });
  });
});
