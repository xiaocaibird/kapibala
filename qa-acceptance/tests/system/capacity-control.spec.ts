import { test, expect } from '../fixtures.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { eventually, type AgentRun } from '../../harness/platform-client.js';
import { BlockedError } from '../../harness/security.js';
import {
  CapacityControl,
  type CapacityLease,
  capacityControlFor,
  type CapacitySnapshot,
} from '../../harness/capacity-control.js';
import {
  auditRequests,
  captureKickEvidence,
  disconnectAccount,
  kickRequests,
  prepareKickAtAudit,
  targetIsPresent,
  type PreparedKick,
} from '../../harness/capacity-probe.js';

const kickEffects = (qa: QaEnvironment, kick: PreparedKick) =>
  qa.gateway
    .snapshot()
    .effects.filter(
      (effect) =>
        effect.kind === 'kick' &&
        effect.groupId === kick.group.gatewayGroupId &&
        effect.platformUserId === kick.target,
    );
function onceAudited(qa: QaEnvironment, kick: PreparedKick): void {
  const audits = auditRequests(qa, kick.group);
  expect(audits).toHaveLength(1);
  expect(audits[0]!.body).toEqual({
    groupId: kick.group.id,
    text: JSON.stringify({ action: 'kick', platform_user_id: kick.target, reason: kick.reason }),
  });
}
function noKick(qa: QaEnvironment, kick: PreparedKick): void {
  expect(kickRequests(qa, kick.group)).toHaveLength(0);
  expect(kickEffects(qa, kick)).toHaveLength(0);
}
async function terminal(
  qa: QaEnvironment,
  kick: PreparedKick,
  timeoutMs = 30_000,
): Promise<AgentRun> {
  return qa.api.waitFor<AgentRun>(
    `/api/agent-runs/${kick.runId}`,
    (run) => run.status !== 'running',
    { timeoutMs },
  );
}
async function held(lease: CapacityLease, boundary: string): Promise<CapacitySnapshot> {
  const snapshot = await lease.snapshot();
  if (snapshot.state !== 'held' || Date.parse(snapshot.expiresAt) <= Date.now())
    throw new BlockedError(`${boundary}时容量租约已释放或到期；故障窗口不成立，不能判PASS`);
  return snapshot;
}
async function observeNoLateKick(
  qa: QaEnvironment,
  kick: PreparedKick,
  expected: Pick<AgentRun, 'status' | 'endReason'>,
): Promise<void> {
  // A finite QA observation window, not a product scheduling SLA or proof about all future time.
  const observationMs = 1_500;
  const started = performance.now();
  const samples: { at: string; status: string; endReason: string | null }[] = [];
  try {
    do {
      const run = await qa.api.agentRun(kick.runId);
      samples.push({ at: new Date().toISOString(), status: run.status, endReason: run.endReason });
      expect(run).toMatchObject({ id: kick.runId, ...expected });
      noKick(qa, kick);
      onceAudited(qa, kick);
      expect((await qa.api.group(kick.group.id)).activeAgentRunId).toBeNull();
      noKick(qa, kick);
      if (performance.now() - started >= observationMs) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    } while (true);
  } finally {
    await qa.evidence(`capacity-post-release-${kick.toolUseId}`, {
      observationMs,
      elapsedMs: performance.now() - started,
      scope: '只证明本次释放后的有限持续观察期；不宣称排除无限期迟发',
      samples,
    });
  }
}
function finalStep(
  qa: QaEnvironment,
  kick: PreparedKick,
  run: AgentRun,
  code: string | null,
): void {
  expect(run.id).toBe(kick.runId);
  expect(run.status).toBe('finished');
  expect(run.endReason).toBe('final');
  expect(run.steps.filter((step) => step.toolUseId === kick.toolUseId)).toHaveLength(1);
  expect(run.steps.find((step) => step.toolUseId === kick.toolUseId)).toMatchObject({
    name: 'kick_user',
    isError: code !== null,
    errorCode: code,
    auditVerdict: 'pass',
  });
  onceAudited(qa, kick);
}
async function assertStillWaiting(qa: QaEnvironment, kick: PreparedKick): Promise<void> {
  noKick(qa, kick);
  onceAudited(qa, kick);
  const run = await qa.api.agentRun(kick.runId);
  expect(run.status, '合法 kick 不能因纯容量不足被错误终结').toBe('running');
  expect(run.steps.filter((step) => step.toolUseId === kick.toolUseId).length).toBeLessThanOrEqual(
    1,
  );
  expect(run.steps.some((step) => step.isError)).toBe(false);
}
async function refused(
  qa: QaEnvironment,
  kick: PreparedKick,
  lease: CapacityLease,
  count = 1,
): Promise<CapacitySnapshot> {
  const result = await lease.waitFor(
    (snapshot) => {
      const attempts = new Set(
        snapshot.events
          .filter((event) => event.kind === 'admission-refused')
          .map((event) => event.attemptId),
      );
      return attempts.size >= count;
    },
    { inspect: () => assertStillWaiting(qa, kick) },
  );
  await qa.evidence('capacity-refusal', result);
  return result;
}
async function deferred(
  qa: QaEnvironment,
  label: string,
  body: (
    kick: PreparedKick,
    lease: CapacityLease,
    control: CapacityControl,
    creationBounds: [number, number],
  ) => Promise<void>,
  options: { beforeReady?: boolean; clock?: boolean } = {},
): Promise<void> {
  const control = capacityControlFor(qa);
  await control.verify([
    'admission-hold',
    ...(options.beforeReady ? ['before-ready-window' as const] : []),
    ...(options.clock ? ['active-clock' as const] : []),
  ]);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  let kick: PreparedKick | undefined;
  let primaryFailure: unknown;
  try {
    // The trigger is emitted inside prepareKickAtAudit; return means its audit barrier and runId
    // have been observed. This deliberately broad interval comes from QA's independent clock.
    const beforeTriggerPreparation = performance.now();
    kick = await prepareKickAtAudit(qa, group, label);
    const afterActiveAuditObservation = performance.now();
    const lease = await control.hold(
      { groupId: kick.group.id, runId: kick.runId, toolUseId: kick.toolUseId },
      { beforeReady: options.beforeReady },
    );
    noKick(qa, kick);
    qa.agent.barriers.release(kick.auditBarrier);
    if (options.beforeReady) {
      await lease.waitFor(
        (snapshot) => snapshot.events.some((event) => event.kind === 'before-ready-held'),
        {
          inspect: () => assertStillWaiting(qa, kick!),
        },
      );
    } else await refused(qa, kick, lease);
    await body(kick, lease, control, [beforeTriggerPreparation, afterActiveAuditObservation]);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    if (kick) qa.agent.barriers.release(kick.auditBarrier);
    try {
      await control.close();
    } catch (cleanup) {
      await qa.evidence('capacity-cleanup-failure', {
        error: String(cleanup),
        primaryFailure: String(primaryFailure),
      });
      if (!primaryFailure) throw cleanup;
    }
  }
}
async function assertSingleSuccess(
  qa: QaEnvironment,
  kick: PreparedKick,
  observed?: AgentRun,
): Promise<void> {
  finalStep(qa, kick, observed ?? (await terminal(qa, kick)), null);
  expect(kickRequests(qa, kick.group)).toHaveLength(1);
  expect(kickEffects(qa, kick)).toHaveLength(1);
  expect(targetIsPresent(qa, kick)).toBe(false);
  expect((await qa.api.group(kick.group.id)).activeAgentRunId).toBeNull();
}

test('[CAP-001] confirmed capacity refusal makes no request and release resumes the original audited step once', async ({
  qa,
}) => {
  await deferred(qa, 'capacity-release', async (kick, lease) => {
    await assertStillWaiting(qa, kick);
    await lease.release();
    await assertSingleSuccess(qa, kick);
    await captureKickEvidence(qa, 'capacity-release-final', [kick]);
  });
});

test('[CAP-002] cancellation while admission is unavailable cannot dispatch the deferred kick after release', async ({
  qa,
}) => {
  await deferred(qa, 'capacity-cancel', async (kick, lease) => {
    await qa.api.require(qa.api.patch(`/api/groups/${kick.group.id}`, { agentEnabled: false }));
    const run = await terminal(qa, kick);
    expect(run).toMatchObject({ id: kick.runId, status: 'cancelled', endReason: 'cancelled' });
    noKick(qa, kick);
    onceAudited(qa, kick);
    expect(
      qa.agent
        .snapshot()
        .turns.filter((turn) => (turn.body as { runId?: string }).runId === kick.runId),
    ).toHaveLength(1);
    await lease.release();
    await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
    await captureKickEvidence(qa, 'capacity-cancel-final', [kick]);
  });
});

test('[CAP-003] persistent admission refusal consumes the original active budget without resetting the clock', async ({
  qa,
}) => {
  test.setTimeout(120_000);
  await deferred(
    qa,
    'capacity-budget',
    async (kick, lease, _control, creationBounds) => {
      let lastRunningRequestBefore: number | undefined;
      let firstTerminalResponseAfter: number | undefined;
      const publicSamples: {
        requestBefore: number;
        responseAfter: number;
        status: string;
        endReason: string | null;
      }[] = [];
      const samplePublicRun = async (): Promise<AgentRun> => {
        const requestBefore = performance.now();
        const current = await qa.api.agentRun(kick.runId);
        const responseAfter = performance.now();
        publicSamples.push({
          requestBefore,
          responseAfter,
          status: current.status,
          endReason: current.endReason,
        });
        if (current.status === 'running') {
          expect(firstTerminalResponseAfter, '已公开的终态不能重新变为running').toBeUndefined();
          lastRunningRequestBefore = requestBefore;
        } else firstTerminalResponseAfter ??= responseAfter;
        return current;
      };
      await samplePublicRun();
      const snapshot = await lease.waitFor(
        (value) => value.events.some((event) => event.kind === 'run-terminal'),
        {
          timeoutMs: 65_000,
          inspect: async () => {
            noKick(qa, kick);
            onceAudited(qa, kick);
            await samplePublicRun();
          },
        },
      );
      const end = snapshot.events.find((event) => event.kind === 'run-terminal')!;
      expect(end.status).toBe('failed');
      expect(end.endReason).toBe('wall_clock');
      const run = await eventually(samplePublicRun, (current) => current.status !== 'running', {
        timeoutMs: 30_000,
      });
      expect(run).toMatchObject({ status: 'failed', endReason: 'wall_clock' });
      const bounds = end.activeElapsedMs;
      const independentElapsedBounds =
        lastRunningRequestBefore === undefined || firstTerminalResponseAfter === undefined
          ? undefined
          : ([
              Math.max(0, lastRunningRequestBefore - creationBounds[1]),
              firstTerminalResponseAfter - creationBounds[0],
            ] as const);
      await qa.evidence('capacity-active-budget', {
        bounds,
        requiredMs: 60_000,
        diagnostic: end,
        creationBounds,
        publicSamples,
        independentElapsedBounds,
        independentClock:
          'QA performance.now；终态下界取最后running请求开始，上界取首次terminal响应完成，均减去保守创建区间',
        limit: '相交仅说明独立观察未证伪控制器；不将轮询或预设deadline宣称为精确60秒实测',
      });
      if (!bounds) throw new BlockedError('控制器未提供原 run 活动预算决定的权威时间区间');
      if (
        !independentElapsedBounds ||
        !independentElapsedBounds.every(Number.isFinite) ||
        independentElapsedBounds[0] > independentElapsedBounds[1]
      )
        throw new BlockedError(
          '缺少有效独立running→terminal时间上下界，不能采信控制器自报精确60000',
        );
      expect(
        independentElapsedBounds[0],
        '独立单调时钟已确认晚于60秒，控制器精确值不能掩盖',
      ).toBeLessThanOrEqual(60_000);
      expect(
        independentElapsedBounds[1],
        '独立单调时钟已确认早于60秒，控制器精确值不能掩盖',
      ).toBeGreaterThanOrEqual(60_000);
      expect(
        Math.max(independentElapsedBounds[0], bounds[0]),
        '控制器实际活动区间与独立公开观察区间不相交',
      ).toBeLessThanOrEqual(Math.min(independentElapsedBounds[1], bounds[1]));
      expect(bounds[0], '已确定超过活动预算才停止').toBeLessThanOrEqual(60_000);
      expect(bounds[1], '已确定提前冒充预算耗尽').toBeGreaterThanOrEqual(60_000);
      if (bounds[0] !== 60_000 || bounds[1] !== 60_000)
        throw new BlockedError('预算决定测量区间跨60秒边界；保留证据，不擅加计时容差');
      expect(
        run.steps.filter((step) => step.toolUseId === kick.toolUseId).length,
      ).toBeLessThanOrEqual(1);
      await lease.release();
      await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
      await captureKickEvidence(qa, 'capacity-budget-final', [kick]);
    },
    { clock: true },
  );
});

test('[CAP-004] policy is rechecked after confirmed zero-effect admission deferral', async ({
  qa,
}) => {
  await deferred(qa, 'capacity-policy', async (kick, lease) => {
    await qa.api.require(qa.api.patch(`/api/groups/${kick.group.id}`, { autoKickEnabled: false }));
    expect((await qa.api.group(kick.group.id)).autoKickEnabled).toBe(false);
    await lease.release();
    finalStep(qa, kick, await terminal(qa, kick), 'POLICY_DENIED');
    noKick(qa, kick);
    expect(targetIsPresent(qa, kick)).toBe(true);
    await captureKickEvidence(qa, 'capacity-policy-final', [kick]);
  });
});

test('[CAP-005] group unreachability during admission wait cancels without a late kick', async ({
  qa,
}) => {
  await deferred(qa, 'capacity-unreachable', async (kick, lease) => {
    qa.gateway.emitStatus(kick.group.creatorAccountId, 'suspended');
    await eventually(
      () => qa.api.group(kick.group.id),
      (group) => group.status === 'unreachable',
    );
    const run = await terminal(qa, kick);
    expect(run).toMatchObject({ status: 'cancelled', endReason: 'cancelled' });
    noKick(qa, kick);
    onceAudited(qa, kick);
    await lease.release();
    await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
    await captureKickEvidence(qa, 'capacity-unreachable-final', [kick]);
  });
});

test('[CAP-006] deferred execution rechecks online membership and administrator qualification', async ({
  qa,
}) => {
  for (const variant of ['creator-remains', 'no-qualified-actor'] as const) {
    await deferred(qa, `capacity-actor-${variant}`, async (kick, lease) => {
      const admin = kick.group.members.find((member) => member.role === 'admin')!;
      await disconnectAccount(qa, admin.accountId);
      if (variant === 'no-qualified-actor') {
        await disconnectAccount(qa, kick.group.creatorAccountId);
        qa.gateway.setMembership(kick.group.gatewayGroupId, admin.platformUserId, false);
        await eventually(
          () => qa.api.group(kick.group.id),
          (group) => !group.members.some((member) => member.accountId === admin.accountId),
        );
      }
      await lease.release();
      if (variant === 'creator-remains') {
        await assertSingleSuccess(qa, kick);
        expect((kickRequests(qa, kick.group)[0]!.body as { byAccountId: string }).byAccountId).toBe(
          kick.group.creatorAccountId,
        );
      } else {
        finalStep(qa, kick, await terminal(qa, kick), 'NO_AVAILABLE_ACCOUNT');
        noKick(qa, kick);
      }
      await captureKickEvidence(qa, `capacity-actor-${variant}-final`, [kick]);
    });
  }
});

test('[CAP-007] departure or rejoin before deferred dispatch preserves one tool identity and the specified removed-member result', async ({
  qa,
}) => {
  for (const rejoin of [false, true]) {
    await deferred(qa, `capacity-target-${rejoin ? 'rejoin' : 'leave'}`, async (kick, lease) => {
      qa.gateway.setMembership(kick.group.gatewayGroupId, kick.target, false, { repeat: 2 });
      if (rejoin)
        qa.gateway.setMembership(kick.group.gatewayGroupId, kick.target, true, { repeat: 2 });
      // GET is an observation only; the external user need not appear in the service-account member DTO.
      await qa.api.group(kick.group.id);
      await lease.release();
      const run = await terminal(qa, kick);
      finalStep(qa, kick, run, null);
      const turns = qa.agent
        .snapshot()
        .turns.filter((turn) => (turn.body as { runId?: string }).runId === kick!.runId);
      const content = turns.flatMap((turn) =>
        (
          turn.body as {
            messages: { content: { type: string; tool_use_id?: string; content?: string }[] }[];
          }
        ).messages.flatMap((message) => message.content),
      );
      const result = content.find(
        (block) => block.type === 'tool_result' && block.tool_use_id === kick.toolUseId,
      );
      expect(result).toBeDefined();
      expect(JSON.parse(result!.content!)).toMatchObject({ kicked: true });
      expect(targetIsPresent(qa, kick)).toBe(false);
      expect(kickRequests(qa, kick.group).length).toBeLessThanOrEqual(1);
      expect(kickEffects(qa, kick).length).toBeLessThanOrEqual(1);
      await captureKickEvidence(qa, `capacity-target-${rejoin ? 'rejoin' : 'leave'}-partial`, [
        kick,
      ]);
    });
  }
});

test('[CAP-008] capacity deferral does not replace a later explicit gateway ownership or permission error', async ({
  qa,
}) => {
  for (const [code, status] of [
    ['OWNER_LEFT', 409],
    ['NO_PERMISSION', 403],
  ] as const) {
    await deferred(qa, `capacity-error-${code}`, async (kick, lease) => {
      const beforeGroup = await qa.api.group(kick.group.id);
      const beforeAccounts = await qa.api.accounts();
      qa.gateway.enqueue(`/groups/${kick.group.gatewayGroupId}/kick`, {
        status,
        code,
        effect: 'none',
      });
      await lease.release();
      finalStep(qa, kick, await terminal(qa, kick), code);
      expect(kickRequests(qa, kick.group)).toHaveLength(1);
      expect(kickEffects(qa, kick)).toHaveLength(0);
      expect(targetIsPresent(qa, kick)).toBe(true);
      const after = await qa.api.group(kick.group.id);
      expect(after.status).toBe(beforeGroup.status);
      expect(after.members).toEqual(beforeGroup.members);
      expect(await qa.api.accounts()).toEqual(beforeAccounts);
      await captureKickEvidence(qa, `capacity-error-${code}-final`, [kick]);
    });
  }
});

test('[CAP-009] crash after proven zero-effect refusal before durable readiness resumes the original run without replaying audit', async ({
  qa,
}) => {
  await deferred(
    qa,
    'capacity-before-ready-crash',
    async (kick, lease) => {
      const snapshot = await held(lease, '崩溃窗口检查');
      const boundary = snapshot.events.find((event) => event.kind === 'before-ready-held')!;
      expect(
        snapshot.events.some(
          (event) =>
            event.kind === 'ready-persisted' &&
            event.attemptId === boundary.attemptId &&
            event.seq > boundary.seq,
        ),
      ).toBe(false);
      noKick(qa, kick);
      const immediatelyBeforeKill = await held(lease, 'SIGKILL之前');
      expect(
        immediatelyBeforeKill.events.some(
          (event) =>
            event.kind === 'ready-persisted' &&
            event.attemptId === boundary.attemptId &&
            event.seq > boundary.seq,
        ),
      ).toBe(false);
      await qa.kill();
      const killCompletedAt = Date.now();
      await qa.evidence('capacity-before-ready-crash-window', {
        snapshot,
        immediatelyBeforeKill,
        killCompletedAt,
      });
      if (Date.parse(immediatelyBeforeKill.expiresAt) <= killCompletedAt)
        throw new BlockedError('SIGKILL完成前租约已到期，无法证明崩溃命中受控窗口');
      await lease.release();
      await qa.start();
      await qa.api.login();
      await assertSingleSuccess(qa, kick);
      expect(
        await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${kick.group.id}/agent-runs`)),
      ).toHaveLength(1);
      await captureKickEvidence(qa, 'capacity-crash-recovery-final', [kick]);
    },
    { beforeReady: true },
  );
});

test('[CAP-010] admission pressure after a dispatched convergent 504 does not reset and replay the unknown kick', async ({
  qa,
}) => {
  const control = capacityControlFor(qa);
  await control.verify();
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  let kick: PreparedKick | undefined;
  const gatewayBarrier = 'capacity-already-dispatched';
  let primaryFailure: unknown;
  try {
    kick = await prepareKickAtAudit(qa, group, 'capacity-already-dispatched');
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
      status: 504,
      code: 'NETWORK_TIMEOUT',
      effect: 'apply',
      effectDelayMs: 1_500,
      omitEvent: true,
      barrier: { phase: 'request', name: gatewayBarrier },
    });
    qa.agent.barriers.release(kick.auditBarrier);
    await qa.gateway.barriers.waitFor(gatewayBarrier);
    expect(kickRequests(qa, group)).toHaveLength(1);
    const lease = await control.hold({
      groupId: kick.group.id,
      runId: kick.runId,
      toolUseId: kick.toolUseId,
    });
    await qa.evidence('capacity-after-dispatch-held', await held(lease, '释放网关屏障之前'));
    qa.gateway.barriers.release(gatewayBarrier);
    const run = await eventually(
      async () => {
        await held(lease, '504收敛观察之前');
        const current = await qa.api.agentRun(kick!.runId);
        await held(lease, '504收敛观察之后');
        expect(kickRequests(qa, group)).toHaveLength(1);
        expect(kickEffects(qa, kick!).length).toBeLessThanOrEqual(1);
        onceAudited(qa, kick!);
        return current;
      },
      (current) => current.status !== 'running',
      {
        timeoutMs: 30_000,
        intervalMs: 100,
        description: '真实容量持续占用时原504工具收敛到终态',
      },
    );
    await qa.evidence('capacity-after-dispatch-terminal-held', await held(lease, '504终态确认'));
    await assertSingleSuccess(qa, kick, run);
    await lease.release();
    expect(kickRequests(qa, group)).toHaveLength(1);
    await captureKickEvidence(qa, 'capacity-after-dispatch-final', [kick]);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    if (kick) qa.agent.barriers.release(kick.auditBarrier);
    qa.gateway.barriers.release(gatewayBarrier);
    try {
      await control.close();
    } catch (cleanup) {
      await qa.evidence('capacity-cleanup-failure', {
        error: String(cleanup),
        primaryFailure: String(primaryFailure),
      });
      if (!primaryFailure) throw cleanup;
    }
  }
});
