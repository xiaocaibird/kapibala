import assert from 'node:assert/strict';
import { test } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import { capacityControlFor, type CapacityLease } from '../../harness/capacity-control.js';
import {
  runtimeObservationFor,
  type MeasuredRuntimeSnapshot,
  type RuntimeEvent,
  type RuntimeLease,
} from '../../harness/runtime-observation.js';
import {
  assertNoDispatchAfterStop,
  observationInterval,
} from '../../harness/lifecycle-observation.js';
import {
  assertSingleEpochActivityBudget,
  assertSingleEpochLifecycleBudget,
} from '../support/agent-activity-budget.js';
import {
  auditRequests,
  kickRequests,
  prepareKickAtAudit,
  targetIsPresent,
  type PreparedKick,
} from '../../harness/capacity-probe.js';
import type { AgentRun } from '../../harness/platform-client.js';
import type { GatewayRequest } from '../../harness/gateway.js';
import {
  inspectOriginalKickCancellationEvidence,
  assertKickBudgetPending,
  assertKickBudgetCancellation,
  assertUnrefinedActivityBudget,
  type OriginalKickCancellationEvidence,
  type ProcessObservationBinding,
} from '../../harness/first-round-observation-oracle.js';

/** One new run, one process, actual time only. The windows below construct a
 * fault; they are neither product minima nor extensions of its 60000ms maximum. */
test('[INT-KICK-OBSERVATION-001] original active budget bounds an already dispatched kick with unresolved 504 confirmation', async ({
  qa,
}) => {
  test.setTimeout(120_000);
  const diagnosticBudgetMs = 90_000;
  const postBarrier = 'kick-observation-post-response';
  const confirmationBarrier = 'kick-observation-confirmation-response';
  const failures: string[] = [],
    missing: string[] = [],
    secondary: string[] = [];
  const stages: Record<string, unknown>[] = [];
  const publicSamples: Record<string, unknown>[] = [];
  const activitySamples: Record<string, unknown>[] = [];
  const parentClockDomain = `qa-process-performance:${process.pid}`;
  const calibrations: MeasuredRuntimeSnapshot[] = [];
  let primary: unknown;
  let kick: PreparedKick | undefined;
  let capacity: ReturnType<typeof capacityControlFor> | undefined;
  let runtime: ReturnType<typeof runtimeObservationFor> | undefined;
  let capacityLease: CapacityLease | undefined;
  let activity: RuntimeLease | undefined, lifecycle: RuntimeLease | undefined;
  let run: AgentRun | undefined;
  let createdBefore = 0,
    diagnosticEnd = 0;
  let postId: number | undefined, confirmationId: number | undefined;
  let postReleased = false,
    confirmationWindowEstablished = false;
  let auditPassEstablished = false;
  let windowClosedBeforeTerminal = false,
    decisionObservedWithPendingConfirmation = false;
  let lifecycleVerdict: unknown;
  let knownStrongRecoveryObservation: Record<string, unknown> | undefined;
  let mappedConfirmationBoundary: Record<string, unknown> | undefined;
  const observationClaims: Record<string, unknown> = {};
  let originalCancellationEvidence: OriginalKickCancellationEvidence | undefined;
  let processBinding: ProcessObservationBinding | undefined;
  let actualBudgetPendingProof = false;
  let laterTerminalCrossDiagnostic: string | undefined;
  const add = (list: string[], value: string) => {
    if (!list.includes(value)) list.push(value);
  };
  const check = (label: string, body: () => unknown): void => {
    try {
      body();
    } catch (error) {
      if (error instanceof BlockedError) add(missing, `${label}: ${error.message}`);
      else if (error instanceof assert.AssertionError) add(failures, `${label}: ${error.message}`);
      else throw error;
    }
  };
  const need = (condition: unknown, reason: string): void => {
    if (!condition) throw new BlockedError(reason);
  };
  const evidence = async (name: string, value: unknown): Promise<void> => {
    try {
      await qa.evidence(name, value);
    } catch (error) {
      add(secondary, `evidence ${name}: ${String(error)}`);
      process.stderr.write(`QA kick budget evidence failure: ${String(error)}\n`);
    }
  };
  const requests = () => qa.gateway.snapshot().requests;
  const request = (id: number | undefined): GatewayRequest | undefined =>
    requests().find((entry) => entry.id === id);
  const membersAfterPost = () =>
    requests().filter(
      (entry) =>
        postId !== undefined &&
        entry.id > postId &&
        entry.method === 'GET' &&
        entry.path === `/groups/${kick!.group.gatewayGroupId}/members`,
    );
  const actualEffects = () =>
    qa.gateway
      .snapshot()
      .effects.filter(
        (effect) =>
          effect.kind === 'kick' &&
          effect.groupId === kick!.group.gatewayGroupId &&
          effect.platformUserId === kick!.target,
      );
  const ledgerChecks = (): void => {
    if (!kick) return;
    check('external requests/effects', () => {
      assert.ok(kickRequests(qa, kick!.group).length <= 1, '同一未知kick出现重复真实POST');
      assert.ok(actualEffects().length <= 1, '同一kick出现重复真实效果');
      // Before a pass has actually reached the admission boundary, an audit
      // timeout/retry can be legitimate. A slow QA setup is not that violation.
      if (!auditPassEstablished) return;
      assert.equal(auditRequests(qa, kick!.group).length, 1, '原已通过审计不得重新审计');
      assert.deepEqual(auditRequests(qa, kick!.group)[0]!.body, {
        groupId: kick!.group.id,
        text: JSON.stringify({
          action: 'kick',
          platform_user_id: kick!.target,
          reason: kick!.reason,
        }),
      });
      // An unrelated unheld members read may legitimately reveal success and
      // invalidate this QA window. Do not label its next turn a product failure.
      // Independently witnessed dispatch AFTER a real stop is always checked.
      if (
        confirmationWindowEstablished &&
        membersAfterPost().length === 1 &&
        !request(confirmationId)?.responseFinishedAt
      ) {
        assert.equal(
          qa.agent
            .snapshot()
            .turns.filter((entry) => (entry.body as { runId?: string }).runId === kick!.runId)
            .length,
          1,
          '原工具确认仍不可得，不得伪造结果派发下一turn',
        );
      }
    });
  };
  const budgetChecks = (complete: boolean): void => {
    const actual = activity?.latest?.events ?? [];
    const life = lifecycle?.latest?.events ?? [];
    const paused = actual.filter((event) => event.activityState === 'recovery-paused');
    if (paused.length) {
      knownStrongRecoveryObservation = {
        requirement: 'R-A5-11 / original A5.8',
        observation: 'recovery-paused',
        events: paused,
        historicalDisposition: 'UNCHANGED',
        thisScenarioRecoveryExecution: 'NOT_RUN',
        scope:
          '本例无重启；原强恢复FAIL不豁免、不重新签通过。已观察的暂停单独保留，不能借共享强恢复断言冒称本专项预算超限。',
      };
    }
    check('dispatch after actual stop', () => assertNoDispatchAfterStop(life));
    for (const event of actual) {
      if (!event.includesUnsavedTail || !event.activeElapsedMs) continue;
      check('complete activity lower bound', () => {
        assert.ok(event.activeElapsedMs![0] <= 60_000, '完整实际活动下界已超过60000ms');
        assert.ok(
          event.activeElapsedMs![0] <= performance.now() - createdBefore,
          '活动下界超过QA独立进程在线上界，证据矛盾',
        );
      });
    }
    if (complete) {
      // Check any proved actual-activity lower-bound violation above FIRST.
      // The shared helpers also enforce A5.8 and assume uninterrupted activity
      // before translating creation-to-decision elapsed time into this budget.
      // Do not suppress their assertions or edit away the pause. Gate that
      // assumption locally and retain the original recovery evidence separately.
      const measured = actual.filter((event) =>
        ['activity-checkpoint', 'activity-terminal'].includes(event.kind),
      );
      const epochs = new Set(measured.flatMap((event) => event.epochIds ?? []));
      if (
        !measured.length ||
        paused.length ||
        epochs.size !== 1 ||
        !measured.some((event) => event.kind === 'activity-terminal') ||
        !measured.every(
          (event) =>
            event.includesUnsavedTail === true &&
            event.epochObservation?.continuous === true &&
            event.epochObservation.startSource === 'run-creation' &&
            event.epochIds?.length === 1 &&
            ['active', 'terminal'].includes(String(event.activityState)),
        )
      ) {
        add(
          missing,
          '预算完整性：缺从真实创建至终止的完整连续active/terminal单epoch，或包含recovery-paused/continuous=false；不得把创建至决定的在线段当活动时间，已证实际活动下界超限仍优先FAIL',
        );
        return;
      }
      check('whole original activity', () =>
        assertSingleEpochActivityBudget(
          actual,
          [0, performance.now() - createdBefore],
          run?.endReason ?? '',
        ),
      );
      check('actual decision and paired outer COMMIT', () => {
        lifecycleVerdict = assertSingleEpochLifecycleBudget(actual, life);
      });
    }
  };
  const sample = async (label: string): Promise<void> => {
    ledgerChecks();
    if (capacityLease?.latest?.state === 'held') {
      try {
        const value = await capacityLease.snapshot();
        need(
          value.state === 'held' && Date.parse(value.expiresAt) > Date.now(),
          '累积真实活动期间容量租约已释放/过期',
        );
      } catch (error) {
        if (!(error instanceof BlockedError)) throw error;
        add(missing, `${label}/capacity: ${error.message}`);
      }
    }
    // Each channel is independent: loss of one witness must not hide a proven
    // violation in the other. Controller recording retains full raw snapshots.
    for (const [name, lease] of [
      ['activity', activity],
      ['lifecycle', lifecycle],
    ] as const) {
      if (!lease) continue;
      try {
        const before = performance.now();
        const value = await lease.snapshot();
        if (name === 'activity')
          activitySamples.push({
            before,
            after: performance.now(),
            leaseId: value.leaseId,
            latest: value.events.at(-1),
          });
        stages.push({
          label,
          stream: name,
          before,
          after: performance.now(),
          seq: value.events.at(-1)?.seq,
        });
        if (
          name === 'lifecycle' &&
          confirmationId !== undefined &&
          value.events.some((entry) => entry.kind === 'agent-termination-decided')
        ) {
          const confirmation = request(confirmationId);
          if (confirmation && !confirmation.responseFinishedAt && !confirmation.responseClosedAt) {
            decisionObservedWithPendingConfirmation = true;
            stages.push({
              label: 'actual-decision-observed-while-confirmation-pending',
              at: new Date().toISOString(),
              before,
              after: performance.now(),
              confirmation,
              decision: value.events.filter((entry) => entry.kind === 'agent-termination-decided'),
            });
          }
        }
      } catch (error) {
        if (!(error instanceof BlockedError)) throw error;
        add(missing, `${label}/${name}: ${error.message}`);
      }
    }
    const before = performance.now();
    run = await qa.api.agentRun(kick!.runId);
    publicSamples.push({ label, before, after: performance.now(), run });
    check('public original run', () => {
      assert.equal(run!.id, kick!.runId);
      assert.equal(run!.groupId, kick!.group.id);
      assert.ok(
        run!.steps.filter((step) => step.toolUseId === kick!.toolUseId).length <= 1,
        '同一工具产生重复公开步骤',
      );
    });
    ledgerChecks();
    budgetChecks(false);
  };
  const currentActivity = (): RuntimeEvent => {
    const snapshot = activity?.latest;
    need(
      snapshot && snapshot.state !== 'released' && Date.parse(snapshot.expiresAt) > Date.now(),
      '活动观测租约不再有效，不能用旧样本构造窗口',
    );
    const event = snapshot!.events.findLast((entry) => entry.kind === 'activity-checkpoint');
    need(
      event?.includesUnsavedTail === true &&
        event.activeElapsedMs &&
        event.activityState === 'active' &&
        event.epochIds?.length === 1 &&
        event.epochObservation?.continuous === true &&
        event.epochObservation.startSource === 'run-creation',
      '缺从真实run创建开始的完整连续单epoch活动见证',
    );
    return event!;
  };
  const wait = async (label: string, done: () => boolean, maxMs: number): Promise<void> => {
    const end = Math.min(diagnosticEnd, performance.now() + maxMs);
    for (;;) {
      await sample(label);
      if (done()) return;
      if (performance.now() >= end)
        throw new BlockedError(`${label}: 有限QA诊断预算内未建立完整场景，不能自造产品时限`);
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
    }
  };
  const mapConfirmationBoundary = (): void => {
    need(calibrations.length === 2, '缺两份真实live应用/父单调时钟校准包络');
    const [a, b] = calibrations as [MeasuredRuntimeSnapshot, MeasuredRuntimeSnapshot];
    const ca = a.snapshot.clockObservation,
      cb = b.snapshot.clockObservation;
    const pa = a.snapshot.snapshotProvenance,
      pb = b.snapshot.snapshotProvenance;
    need(
      a.parentClockDomain === parentClockDomain &&
        b.parentClockDomain === parentClockDomain &&
        a.parentWindowMs[1] <= b.parentWindowMs[0] &&
        ca &&
        cb &&
        pa &&
        pb &&
        pa.source === 'live-bridge' &&
        pb.source === 'live-bridge' &&
        ca.applicationPid === pa.applicationPid &&
        cb.applicationPid === pb.applicationPid &&
        ca.applicationPid === cb.applicationPid &&
        pa.applicationStarted === pb.applicationStarted &&
        Number.isSafeInteger(ca.applicationPid) &&
        ca.applicationPid > 0 &&
        typeof pa.applicationStarted === 'string' &&
        pa.applicationStarted.length > 0 &&
        typeof ca.clockDomain === 'string' &&
        ca.clockDomain.length > 0 &&
        ca.clockDomain === cb.clockDomain &&
        ca.clockUnit === 'ms' &&
        cb.clockUnit === 'ms' &&
        Number.isFinite(ca.monotonicMs) &&
        ca.monotonicMs >= 0 &&
        Number.isFinite(cb.monotonicMs) &&
        cb.monotonicMs > ca.monotonicMs,
      '校准必须同一实际app/start/时钟域且真实前进，退出缓存或身份漂移无效',
    );
    const first = observationInterval(a.parentWindowMs),
      last = observationInterval(b.parentWindowMs);
    const offset: [number, number] = [
      Math.max(first[0] - ca!.monotonicMs, last[0] - cb!.monotonicMs),
      Math.min(first[1] - ca!.monotonicMs, last[1] - cb!.monotonicMs),
    ];
    need(offset[0] <= offset[1], '两次真实单调时钟校准包络不相容');
    const commits = lifecycle!.latest!.events.filter(
      (event) => event.kind === 'agent-terminal-committed',
    );
    need(commits.length === 1, '无唯一实际终态COMMIT以定位原决定');
    const decisions = lifecycle!.latest!.events.filter(
      (event) =>
        event.kind === 'agent-termination-decided' && event.attemptId === commits[0]!.attemptId,
    );
    need(decisions.length === 1, '无同attempt唯一实际budget决定');
    const decision = decisions[0]!;
    need(
      decision.applicationPid === ca!.applicationPid &&
        decision.clockDomain === ca!.clockDomain &&
        decision.runId === kick!.runId &&
        decision.groupId === kick!.group.id,
      'budget决定与实测应用时钟/原run不一致',
    );
    const window = observationInterval(decision.decisionWindowMs);
    need(
      ca!.monotonicMs <= window[0] && cb!.monotonicMs >= window[1],
      '真实决定不在两次live校准之间，不能外推',
    );
    const parentWindow: [number, number] = [window[0] + offset[0], window[1] + offset[1]];
    const confirmation = request(confirmationId)!;
    need(
      confirmation.clockDomain === parentClockDomain &&
        Number.isFinite(confirmation.receivedMonoMs) &&
        Number.isFinite(confirmation.responseClosedMonoMs),
      '精确确认GET缺同QA父时钟真实接收/关闭时间',
    );
    mappedConfirmationBoundary = {
      parentClockDomain,
      offsetMs: offset,
      actualDecisionWindowMs: window,
      parentDecisionWindowMs: parentWindow,
      confirmation,
      proof:
        confirmation.receivedMonoMs! < parentWindow[0] &&
        confirmation.responseClosedMonoMs! > parentWindow[1] &&
        !confirmation.responseFinishedAt &&
        confirmation.responseFinishedMonoMs === undefined,
    };
    need(
      mappedConfirmationBoundary.proof,
      '实际GET与budget决定区间未严格跨越或边界重叠；不靠墙钟/采样点猜先后',
    );
  };
  try {
    // Verify controller/process ownership before the real run exists, keeping
    // the subsequent audit barrier short. No outcome/time is supplied to SUT.
    capacity = capacityControlFor(qa);
    runtime = runtimeObservationFor(qa);
    await capacity.verify(['admission-hold']);
    await runtime.verify(['activity-witness', 'agent-lifecycle-witness']);
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    createdBefore = performance.now();
    diagnosticEnd = createdBefore + diagnosticBudgetMs;
    kick = await prepareKickAtAudit(qa, group, 'dispatched-original-budget');
    activity = await runtime.arm(
      'observe-activity',
      {
        kind: 'activity',
        groupId: group.id,
        runId: kick.runId,
        toolUseId: 'all-run-steps',
      },
      { ttlMs: 120_000 },
    );
    lifecycle = await runtime.arm(
      'observe-agent-lifecycle',
      {
        kind: 'tool-wait',
        groupId: group.id,
        runId: kick.runId,
        toolUseId: 'all-run-steps',
      },
      { ttlMs: 120_000 },
    );
    capacityLease = await capacity.hold(
      { groupId: group.id, runId: kick.runId, toolUseId: kick.toolUseId },
      { ttlMs: 120_000 },
    );
    need(
      auditRequests(qa, group).length === 1,
      '短audit接线期间已有重试；本例唯一pass前提未建立，不算产品重复审计',
    );
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
      method: 'POST',
      status: 504,
      code: 'NETWORK_TIMEOUT',
      effect: 'apply',
      omitEvent: true,
      barrier: { phase: 'before-response', name: postBarrier },
    });
    qa.agent.barriers.release(kick.auditBarrier);
    await wait(
      'real-capacity-refusal',
      () =>
        capacityLease!.latest?.events.some((event) => event.kind === 'admission-refused') ?? false,
      5_000,
    );
    need(
      auditRequests(qa, group).length === 1 &&
        auditRequests(qa, group)[0]!.responseStatus === 200 &&
        !!auditRequests(qa, group)[0]!.completedAt,
      '未证明唯一实际pass响应之后进入真实容量拒绝',
    );
    auditPassEstablished = true;
  } catch (error) {
    primary = error;
  }

  // Continued below only if the audit/controller preparation was actually hit.
  try {
    if (primary) throw primary;
    await wait(
      'accumulate-original-activity',
      () => {
        const elapsed = currentActivity().activeElapsedMs!;
        need(run?.status === 'running', '容量释放前原run已终止；已派发交叉窗口未命中');
        need(elapsed[1] < 40_000, '错过38–40秒实际活动释放窗口；不重置run或回填时间');
        return elapsed[0] >= 38_000;
      },
      42_000,
    );
    const held = await capacityLease!.snapshot();
    need(held.state === 'held' && Date.parse(held.expiresAt) > Date.now(), '容量屏障已过期或释放');
    need(
      held.events.some(
        (event) =>
          event.kind === 'admission-refused' &&
          event.callbackEntered === false &&
          event.remoteRequestCount === 0,
      ),
      '未证实真实零派发容量拒绝',
    );
    check('pre-release zero effects', () => {
      assert.equal(kickRequests(qa, kick!.group).length, 0);
      assert.equal(actualEffects().length, 0);
    });
    stages.push({
      label: 'release-capacity',
      at: new Date().toISOString(),
      activity: currentActivity(),
      capacity: held,
    });
    await capacityLease!.release();
    await wait(
      'actual-post-response-barrier',
      () => {
        const hit = qa.gateway.barriers.snapshot().find((entry) => entry.name === postBarrier);
        if (!hit) return false;
        const context = hit.context as GatewayRequest;
        need(
          context.method === 'POST' &&
            context.path === `/groups/${kick!.group.gatewayGroupId}/kick`,
          'POST屏障没有绑定原群真实请求',
        );
        postId = context.id;
        const post = request(postId);
        need(
          post?.preparedResponseStatus === 504 &&
            !post.responseFinishedAt &&
            !post.responseClosedAt,
          '首次504响应已离开受控窗口',
        );
        const applied = actualEffects().length === 1 && !targetIsPresent(qa, kick!);
        if (applied) {
          const observedAfter = performance.now();
          need(
            post!.clockDomain === parentClockDomain && Number.isFinite(post!.receivedMonoMs),
            'QA网关缺同父单调时钟真实POST接收时间',
          );
          need(
            observedAfter - post!.receivedMonoMs! <= 2_000,
            'QA未在原远端2秒收敛界内观察到实际成员效果；本轮夹具窗口不足，不归因产品',
          );
          stages.push({
            label: 'real-effect-observed-within-gateway-contract',
            parentClockDomain,
            receivedMonoMs: post!.receivedMonoMs,
            observedAfter,
            effectUpperMs: observedAfter - post!.receivedMonoMs!,
            effects: actualEffects(),
          });
        }
        return applied;
      },
      4_000,
    );
    // Install only after the POST was received. Earlier permission/member reads
    // cannot consume this confirmation plan. No other group's route is changed.
    const preConfirmationIds = membersAfterPost().map((entry) => entry.id);
    need(preConfirmationIds.length === 0, 'POST仍未回复却已有后续成员读取，确认请求归属不唯一');
    qa.gateway.enqueue(`/groups/${kick!.group.gatewayGroupId}/members`, {
      method: 'GET',
      barrier: { phase: 'before-response', name: confirmationBarrier },
    });
    await wait(
      'hold-received-504-until-window',
      () => {
        const elapsed = currentActivity().activeElapsedMs!;
        need(
          run?.status === 'running' && !request(postId)?.responseClosedAt,
          '原POST已关闭或run已终止，不能冒称504后确认窗口',
        );
        need(elapsed[1] < 44_000, '错过43–44秒真实活动的504释放窗口');
        return elapsed[0] >= 43_000;
      },
      7_000,
    );
    stages.push({
      label: 'release-real-504',
      at: new Date().toISOString(),
      activity: currentActivity(),
      post: request(postId),
    });
    calibrations.push(await activity!.snapshotMeasured(parentClockDomain));
    need(
      currentActivity().activeElapsedMs![1] < 44_000 && !request(postId)?.responseClosedAt,
      '真实校准结束后已错过504释放窗口',
    );
    qa.gateway.barriers.release(postBarrier);
    postReleased = true;
    await wait(
      'actual-confirmation-in-flight',
      () => {
        const hit = qa.gateway.barriers
          .snapshot()
          .find((entry) => entry.name === confirmationBarrier);
        if (!hit) return false;
        const context = hit.context as GatewayRequest;
        const after = membersAfterPost();
        need(
          after.length === 1 && after[0]!.id === context.id && context.method === 'GET',
          '后续members请求不唯一，不能把其他读取冒充原kick确认',
        );
        confirmationId = context.id;
        need(
          request(postId)?.responseStatus === 504 && request(postId)?.responseFinishedAt,
          '仅准备504不足以证明真实HTTP已发送',
        );
        const confirmation = request(confirmationId);
        need(
          confirmation &&
            !confirmation.responseFinishedAt &&
            !confirmation.responseClosedAt &&
            run?.status === 'running',
          '确认GET未建立真实未返回窗口',
        );
        const elapsed = currentActivity().activeElapsedMs!;
        need(
          elapsed[0] >= 45_000 && elapsed[1] < 60_000,
          '确认进入不在剩余不足15秒的原预算窗口；不把普通HTTP超时当预算取消',
        );
        confirmationWindowEstablished = true;
        stages.push({
          label: 'confirmation-window-established',
          at: new Date().toISOString(),
          activity: currentActivity(),
          post: request(postId),
          confirmation,
        });
        return true;
      },
      6_000,
    );
    await wait(
      'original-budget-stop-with-unresolved-confirmation',
      () => {
        need(membersAfterPost().length === 1, '出现其他成员读取，无法证明目标确认一直不可得');
        const confirmation = request(confirmationId)!;
        need(!confirmation.responseFinishedAt, 'QA确认屏障意外放行，原未知窗口不成立');
        const decision = lifecycle!.latest?.events.some(
          (event) => event.kind === 'agent-termination-decided',
        );
        if (confirmation.responseClosedAt && run?.status === 'running' && !decision)
          windowClosedBeforeTerminal = true;
        return (
          run?.status !== 'running' &&
          !!confirmation.responseClosedAt &&
          !!lifecycle!.latest?.events.some((event) => event.kind === 'agent-terminal-committed') &&
          !!activity!.latest?.events.some((event) => event.kind === 'activity-terminal')
        );
      },
      25_000,
    );
    check('public terminal', () => {
      assert.equal(run!.status, 'failed');
      assert.equal(run!.endReason, 'wall_clock');
    });
    check('actual effect and unresolved public step', () => {
      assert.equal(kickRequests(qa, kick!.group).length, 1);
      assert.equal(actualEffects().length, 1);
      assert.equal(targetIsPresent(qa, kick!), false);
      const step = run!.steps.find((entry) => entry.toolUseId === kick!.toolUseId);
      assert.ok(step, '实际派发的工具须有公开步骤');
      assert.equal(step.auditVerdict, 'pass');
      assert.equal(step.isError, false, '确认结果未知不能伪造工具执行失败');
      assert.equal(step.errorCode, null);
      const raw = run as AgentRun & { recoveryNote?: unknown };
      assert.ok(
        typeof raw.recoveryNote === 'string' && /unknown|未知/i.test(raw.recoveryNote),
        '未知外部效果必须如实保留说明，不得伪装为已确认结果',
      );
      assert.equal(request(confirmationId)!.responseClosedBeforeFinish, true);
    });
    budgetChecks(true);
    calibrations.push(await activity!.snapshotMeasured(parentClockDomain));
    const claim = (label: string, body: () => unknown): void => {
      check(label, () => {
        try {
          const value = body();
          observationClaims[label] = { status: 'PASS', value };
          return value;
        } catch (error) {
          observationClaims[label] = {
            status: error instanceof assert.AssertionError ? 'FAIL' : 'BLOCKED',
            reason: String(error),
          };
          throw error;
        }
      });
    };
    claim('raw original kick observation', () => {
      const snapshot = lifecycle!.latest!;
      const measured = calibrations.at(-1)?.snapshot;
      const clock = measured?.clockObservation,
        provenance = snapshot.snapshotProvenance;
      need(
        measured?.snapshotProvenance?.source === 'live-bridge' &&
          measured.snapshotProvenance.applicationPid === provenance?.applicationPid &&
          measured.snapshotProvenance.applicationStarted === provenance?.applicationStarted,
        '生命周期与真实活动校准未属于同一实际live进程',
      );
      if (!clock || !provenance) throw new BlockedError('缺实际live PID/start/clock来源');
      processBinding = {
        groupId: kick!.group.id,
        runId: kick!.runId,
        applicationPid: clock.applicationPid,
        applicationStarted: provenance.applicationStarted,
        clockDomain: clock.clockDomain,
        validatedProvenance: provenance,
      };
      const post = snapshot.events.filter((e) => e.kind === 'kick-post-dispatch');
      const confirmation = snapshot.events.filter((e) => e.kind === 'kick-confirmation-dispatch');
      const budget = snapshot.events.filter((e) => e.kind === 'kick-budget-signal-aborted');
      need(
        post.length === 1 && confirmation.length === 1 && budget.length === 1,
        '原POST/确认GET/预算signal身份非唯一',
      );
      originalCancellationEvidence = inspectOriginalKickCancellationEvidence(snapshot.events, {
        ...processBinding,
        toolUseId: kick!.toolUseId,
        stepId: String(budget[0]!.stepId),
        attemptId: budget[0]!.attemptId,
        postRequestId: String(post[0]!.requestId),
        confirmationRequestId: String(confirmation[0]!.requestId),
      });
      need(
        kickRequests(qa, kick!.group).length === 1 &&
          membersAfterPost().length === 1 &&
          confirmationId === membersAfterPost()[0]!.id,
        'client request用途未绑定本例唯一网关POST/确认GET',
      );
      return originalCancellationEvidence;
    });
    claim('KB-CROSS actual source pending', () => {
      if (!originalCancellationEvidence) throw new BlockedError('原请求绑定未形成');
      const proof = assertKickBudgetPending(originalCancellationEvidence);
      actualBudgetPendingProof = true;
      return proof;
    });
    claim('KB-CANCEL actual source identity', () => {
      if (!originalCancellationEvidence) throw new BlockedError('原请求绑定未形成');
      return assertKickBudgetCancellation(originalCancellationEvidence);
    });
    claim('KB-ACTIVITY original strict interval', () => {
      if (!processBinding) throw new BlockedError('真实应用时钟未绑定');
      return assertUnrefinedActivityBudget(activity!.latest!.events, processBinding);
    });
    // Retain the later terminal mapping as a separate diagnostic. The observed
    // original budget signal can precede this marker; neither time is rewritten.
    try {
      mapConfirmationBoundary();
    } catch (error) {
      if (!(error instanceof BlockedError)) throw error;
      laterTerminalCrossDiagnostic = String(error);
    }
    if (
      !actualBudgetPendingProof &&
      !decisionObservedWithPendingConfirmation &&
      !mappedConfirmationBoundary?.proof
    )
      add(missing, '未证明原GET在真实预算signal仍pending，且较晚终态跨界也无正证');
    const followupEnd = performance.now() + 1_500;
    do {
      await sample('finite-post-terminal-no-replay');
      check('stable terminal', () => {
        assert.equal(run!.status, 'failed');
        assert.equal(run!.endReason, 'wall_clock');
      });
      if (performance.now() >= followupEnd) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    } while (true);
    const group = await qa.api.group(kick!.group.id);
    check('active reference cleared', () => assert.equal(group.activeAgentRunId, null));
  } catch (error) {
    primary = error;
  } finally {
    // A last independent read is attempted before any release. It must not
    // replace the first FAIL with a missing-window or cleanup exception.
    if (kick && activity && lifecycle) {
      try {
        await sample('final-before-cleanup');
        budgetChecks(true);
      } catch (error) {
        add(secondary, `final observation: ${String(error)}`);
      }
    }
    ledgerChecks();
    if (primary instanceof assert.AssertionError) add(failures, primary.message);
    else if (primary instanceof BlockedError) add(missing, primary.message);
    await evidence('dispatched-kick-observation-final', {
      caseId: 'INT-KICK-OBSERVATION-001',
      kick,
      requiredMaximumMs: 60_000,
      diagnosticBudgetMs,
      stages,
      publicSamples,
      activitySamples,
      activity: activity?.latest,
      lifecycle: lifecycle?.latest,
      lifecycleVerdict,
      capacity: capacityLease?.latest,
      gateway: qa.gateway.snapshot(),
      agent: qa.agent.snapshot(),
      postId,
      confirmationId,
      postReleased,
      confirmationWindowEstablished,
      auditPassEstablished,
      windowClosedBeforeTerminal,
      decisionObservedWithPendingConfirmation,
      calibrations,
      mappedConfirmationBoundary,
      observationClaims,
      actualBudgetPendingProof,
      laterTerminalCrossDiagnostic,
      knownStrongRecoveryObservation,
      failures,
      missing,
      primary: primary ? String(primary) : null,
      coverage: {
        secondInstance: 'NOT_RUN',
        restartRecovery: 'NOT_RUN',
        arbitraryUnknownRecovery: 'NOT_RUN',
        cancellationCause: {
          result: observationClaims['KB-CANCEL actual source identity'] ?? {
            status: 'BLOCKED',
            reason: '真实原请求取消身份尚未建立',
          },
        },
        limit:
          '单实例实际活动/已派发kick/有限不重放组合；unknown仅如实记录。peer-close不自动证明abort原因，不替代A5.8强恢复，也不证明所有未来不重复。',
      },
    });
    // Stop only this QA-owned process if a response remains held. The final
    // product snapshot above is immutable; cleanup must not manufacture a
    // success by sending the previously unavailable members response.
    const pending =
      !!kick &&
      requests().some(
        (entry) =>
          entry.path.startsWith(`/groups/${kick!.group.gatewayGroupId}/`) &&
          !entry.responseFinishedAt &&
          !entry.responseClosedAt,
      );
    // Read-only observers can be released against the still-live owner. A held
    // admission gate is released only after stopping an unfinished owned run.
    try {
      await runtime?.close();
    } catch (error) {
      add(secondary, `runtime cleanup: ${String(error)}`);
    }
    if (capacityLease?.latest?.state === 'released') {
      try {
        await capacity?.close();
      } catch (error) {
        add(secondary, `capacity cleanup: ${String(error)}`);
      }
    }
    if (createdBefore && (pending || !run || run.status === 'running')) {
      try {
        await qa.kill();
      } catch (error) {
        add(secondary, `owned process stop: ${String(error)}`);
      }
    }
    qa.agent.barriers.release(kick?.auditBarrier ?? 'qa-audit-dispatched-original-budget');
    qa.gateway.barriers.release(postBarrier);
    qa.gateway.barriers.release(confirmationBarrier);
    if (capacityLease?.latest?.state !== 'released') {
      try {
        await capacity?.close();
      } catch (error) {
        add(secondary, `capacity cleanup: ${String(error)}`);
      }
    }
    await evidence('dispatched-kick-observation-cleanup', {
      at: new Date().toISOString(),
      pendingResponseBeforeCleanup: pending,
      secondary,
      failures,
      missing,
      gatewayAfterCleanup: qa.gateway.snapshot(),
      boundary: '清理后记录不回填测试期业务结果；仅释放本例屏障/租约及必要时停止自有SUT',
    });
  }
  if (failures.length) assert.fail(failures.join('\n'));
  if (primary && !(primary instanceof BlockedError)) throw primary;
  if (missing.length || secondary.length)
    throw new BlockedError([...missing, ...secondary].join('; '));
});
