import { test, expect } from '../fixtures.js';
import type { QaEnvironment } from '../../harness/environment.js';
import type { GatewayRequest, GatewayResponsePlan } from '../../harness/gateway.js';
import type { Message, SequenceRun } from '../../harness/platform-client.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';

type Interval = readonly [number, number];
type MessageSample = { lower: number; upper: number; message: Message; requests: GatewayRequest[] };

async function sample(
  qa: QaEnvironment,
  groupId: string,
  clientMsgId: string,
): Promise<MessageSample> {
  const lower = Date.now();
  const page = await qa.api.messages(groupId);
  const upper = Date.now() + 1;
  const rows = page.items.filter((row) => row.clientMsgId === clientMsgId);
  expect(rows, 'one public identity per outbound intent').toHaveLength(1);
  return { lower, upper, message: rows[0]!, requests: qa.gateway.snapshot().requests };
}

async function scoped(qa: QaEnvironment, name: string, action: () => Promise<void>) {
  let failed = false;
  try {
    await action();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    qa.gateway.configure({ unavailable: false, sseUnavailable: false });
    qa.gateway.barriers.releaseAll();
    try {
      await qa.evidence(`${name}-final`, { gateway: qa.gateway.snapshot() });
    } catch (error) {
      if (!failed) throw error;
    }
  }
}

function noFalseFailure(qa: QaEnvironment, path: string, value: MessageSample) {
  const snapshot = qa.gateway.snapshot();
  const send = snapshot.requests.find((request) => request.path === path);
  if (send?.completedAt && value.lower > Date.parse(send.completedAt) + 2_000) {
    const landing = snapshot.messages.find((row) => row.clientMsgId === value.message.clientMsgId);
    const confirmation = snapshot.events.find(
      (event) =>
        event.type === 'message_sent' && event.data.clientMsgId === value.message.clientMsgId,
    );
    if (
      !landing ||
      Date.parse(landing.sentAt) + 1 > Date.parse(send.completedAt) + 2_000 ||
      !confirmation?.recordedAt ||
      Date.parse(confirmation.recordedAt) + 1 > Date.parse(send.completedAt) + 2_000
    )
      throw new BlockedError(
        '网关落地/确认未证明在2秒保证内；先判夹具无效，不能将此后产品反应误判FAIL',
      );
  }
  expect(['queued', 'unknown', 'sent']).toContain(value.message.deliveryStatus);
  expect(value.requests.filter((request) => request.path === path)).toHaveLength(1);
  expect(
    qa.gateway.snapshot().messages.filter((row) => row.clientMsgId === value.message.clientMsgId)
      .length,
  ).toBeLessThanOrEqual(1);
}

async function begin504(qa: QaEnvironment, label: string, prepare: (queryPath: string) => void) {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const sendPath = `/groups/${group.gatewayGroupId}/send`;
  // Disconnect only event transport. The gateway still creates/pushes and
  // retains its promised confirmation within two seconds; no event is erased.
  qa.gateway.configure({ sseUnavailable: true });
  qa.gateway.disconnectStreams();
  qa.gateway.enqueue(sendPath, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 1_500,
    barrier: { phase: 'before-response', name: `${label}-504` },
  });
  // Attach both handlers immediately: waiting for an external barrier must not
  // leave an early API/network rejection unhandled. Preserve actual HTTP errors
  // separately from a probe whose barrier was never reached.
  const pending = qa.api
    .post<{ clientMsgId: string }>(`/api/groups/${group.id}/send`, {
      accountId: accounts[0]!.id,
      text: label,
    })
    .then(
      (response) => ({ kind: 'response' as const, response }),
      (error: unknown) => ({ kind: 'transport-error' as const, error }),
    );
  let setupError: unknown;
  let send: GatewayRequest | undefined;
  let clientMsgId = '';
  let queryPath = '';
  try {
    try {
      await qa.gateway.barriers.waitFor(`${label}-504`);
    } catch (error) {
      throw new BlockedError(
        `未在探测预算内命中明确504响应屏障；不是产品派发deadline：${String(error)}`,
      );
    }
    send = qa.gateway.snapshot().requests.find((request) => request.path === sendPath)!;
    clientMsgId = (send.body as { clientMsgId: string }).clientMsgId;
    expect(clientMsgId).toEqual(expect.any(String));
    queryPath = `/groups/${group.gatewayGroupId}/messages/by-client-id/${clientMsgId}`;
    prepare(queryPath);
  } catch (error) {
    setupError = error;
  } finally {
    qa.gateway.barriers.release(`${label}-504`);
  }
  const outcome = await pending;
  if (outcome.kind === 'transport-error') {
    if (setupError && !(setupError instanceof BlockedError)) throw setupError;
    throw new BlockedError(`准备发送缺少公开HTTP响应，未建立504测试前提：${String(outcome.error)}`);
  }
  expect(outcome.response.status, '合法手动发送应明确受理；API错误不能被未命中屏障掩盖').toBe(202);
  expect(outcome.response.body.clientMsgId).toEqual(expect.any(String));
  if (setupError) throw setupError;
  expect(outcome.response.body.clientMsgId).toBe(clientMsgId);
  const samples: MessageSample[] = [];
  const unknown = await observe({
    read: () => sample(qa, group.id, clientMsgId),
    invariant: (value) => {
      samples.push(value);
      noFalseFailure(qa, sendPath, value);
    },
    complete: (value) => value.message.deliveryStatus === 'unknown',
    durationMs: 1_400,
    intervalMs: 20,
  });
  await qa.evidence(`${label}-504-start`, { samples, gateway: qa.gateway.snapshot() });
  if (!unknown.complete)
    throw new BlockedError(
      '未取得本地unknown，无法夹定SUT收到504的时刻；不把网关发送时间当精确接收时间',
    );
  const responded = qa.gateway.snapshot().requests.find((request) => request.id === send!.id)!;
  expect(responded.responseStatus).toBe(504);
  if (
    !responded.completedAt ||
    !responded.responseFinishedAt ||
    responded.responseClosedBeforeFinish
  )
    throw new BlockedError('504缺少完整HTTP发送证据，不能建立明确504故障场景');
  const start: Interval = [Date.parse(responded.completedAt), unknown.last.upper];
  return { group, sendPath, queryPath, clientMsgId, start, initial: unknown.last };
}

type TimeoutContext = Awaited<ReturnType<typeof begin504>>;
function validateLanding(qa: QaEnvironment, context: TimeoutContext) {
  const messages = qa.gateway
    .snapshot()
    .messages.filter((row) => row.clientMsgId === context.clientMsgId);
  expect(messages).toHaveLength(1);
  const landedUpper = Date.parse(messages[0]!.sentAt) + 1;
  const confirmation = qa.gateway
    .snapshot()
    .events.find(
      (event) => event.type === 'message_sent' && event.data.clientMsgId === context.clientMsgId,
    );
  if (
    landedUpper > context.start[0] + 2_000 ||
    !confirmation?.recordedAt ||
    Date.parse(confirmation.recordedAt) + 1 > context.start[0] + 2_000
  )
    throw new BlockedError(
      '独立网关真实落地及确认推送未证明满足504后2秒保证；不能按不合规夹具裁判产品',
    );
  return messages[0]!;
}

async function waitSent(qa: QaEnvironment, context: TimeoutContext, label: string) {
  const samples: MessageSample[] = [];
  const observed = await observe({
    read: () => sample(qa, context.group.id, context.clientMsgId),
    invariant: (value) => {
      samples.push(value);
      noFalseFailure(qa, context.sendPath, value);
    },
    complete: (value) => value.message.deliveryStatus === 'sent',
    durationMs: 10_000,
    intervalMs: 20,
  });
  await qa.evidence(label, { samples, observed, gateway: qa.gateway.snapshot() });
  return { samples, observed };
}

async function deadline(
  qa: QaEnvironment,
  label: string,
  start: Interval,
  samples: MessageSample[],
  initial: MessageSample,
  limit: number,
) {
  const terminal = samples.find((value) => value.message.deliveryStatus === 'sent');
  const pending = [...[initial, ...samples]]
    .reverse()
    .find((value) => value.message.deliveryStatus !== 'sent')!;
  const lower = Math.max(0, pending.lower - start[1]);
  const upper = terminal ? terminal.upper - start[0] : null;
  await qa.evidence(label, {
    start,
    lowerMs: lower,
    upperMs: upper,
    limitMs: limit,
    pending,
    terminal,
  });
  expect(lower, '已观测仍未确定状态的下界超过原文时限').toBeLessThanOrEqual(limit);
  if (upper === null || upper > limit)
    throw new BlockedError(
      `时间区间${lower}..${upper ?? '未观测完成'}ms跨${limit}ms；不增加容差或完成期限`,
    );
}

function usablePositiveQueries(qa: QaEnvironment, path: string, since = -Infinity) {
  return qa.gateway
    .snapshot()
    .requests.filter(
      (request) =>
        request.path === path &&
        Date.parse(request.at) >= since &&
        request.responseStatus === 200 &&
        request.responseFinishedAt &&
        !request.responseClosedBeforeFinish,
    );
}

test('[INT-MSG-001] an old 404 crossing the two-second window cannot negate a landed send', async ({
  qa,
}) => {
  test.setTimeout(45_000);
  await scoped(qa, 'old-404', async () => {
    const context = await begin504(qa, 'old-404', (path) => {
      qa.gateway.enqueue(path, {
        method: 'GET',
        barrier: { phase: 'before-response', name: 'old-404-query' },
      });
    });
    const reached = await observe({
      read: () => sample(qa, context.group.id, context.clientMsgId),
      invariant: (value) => noFalseFailure(qa, context.sendPath, value),
      complete: () => qa.gateway.barriers.snapshot().some((hit) => hit.name === 'old-404-query'),
      durationMs: 3_000,
    });
    if (!reached.complete) throw new BlockedError('未命中查询响应屏障，不能宣称旧404场景已覆盖');
    const old = qa.gateway
      .snapshot()
      .requests.find((request) => request.path === context.queryPath)!;
    await qa.evidence('old-404-prepared', { old, context });
    if (
      old.preparedResponseStatus !== 404 ||
      !old.responsePreparedAt ||
      Date.parse(old.responsePreparedAt) + 1 >= context.start[0] + 2_000
    )
      throw new BlockedError('候选未在2秒内采集404，故未形成旧404前提；不强制实现必须提前查询');
    const crossed = await observe({
      read: () => sample(qa, context.group.id, context.clientMsgId),
      invariant: (value) => noFalseFailure(qa, context.sendPath, value),
      complete: () => Date.now() > context.start[1] + 2_000,
      durationMs: 3_000,
    });
    if (!crossed.complete) throw new BlockedError('未证明旧404实际跨过最晚504接收的2秒窗口');
    const landed = validateLanding(qa, context);
    qa.gateway.barriers.release('old-404-query');
    const result = await waitSent(qa, context, 'old-404-after-release');
    const completed = qa.gateway.snapshot().requests.find((request) => request.id === old.id)!;
    if (!completed.responseFinishedAt || completed.responseClosedBeforeFinish)
      throw new BlockedError('旧404在发送前已被客户端丢弃，不能把超时连接当成收到旧404的证据');
    expect(completed.responseStatus).toBe(404);
    expect(Date.parse(completed.completedAt!) - context.start[1]).toBeGreaterThan(2_000);
    if (!result.observed.complete)
      throw new BlockedError('有限观察未取得后续正向确认；不能宣称无限期停滞');
    expect(result.observed.last.message.msgId).toBe(landed.msgId);
    await deadline(
      qa,
      'old-404-five-second-bound',
      context.start,
      result.samples,
      reached.last,
      5_000,
    );
  });
});

test('[INT-MSG-002] queries withheld past five seconds retain unknown and recover on real responses', async ({
  qa,
}) => {
  test.setTimeout(45_000);
  await scoped(qa, 'held-query', async () => {
    const context = await begin504(qa, 'held-query', (path) => {
      // One released barrier also releases future one-shot plans: restoration
      // does not leave a hidden backlog of unreleased artificial failures.
      qa.gateway.enqueue(
        path,
        ...Array.from({ length: 128 }, (): GatewayResponsePlan => ({
          method: 'GET',
          barrier: { phase: 'before-response', name: 'held-query-all' },
        })),
      );
    });
    const held = await observe({
      read: () => sample(qa, context.group.id, context.clientMsgId),
      invariant: (value) => {
        noFalseFailure(qa, context.sendPath, value);
        expect(value.message.deliveryStatus).toBe('unknown');
        if (value.requests.filter((request) => request.path === context.queryPath).length >= 128)
          throw new BlockedError('故障计划容量已耗尽；没有把无故障请求误当持续查询不可用');
      },
      complete: (value) => value.lower > context.start[1] + 5_000,
      durationMs: 7_000,
    });
    await qa.evidence('held-query-beyond-five-seconds', {
      context,
      held,
      gateway: qa.gateway.snapshot(),
    });
    if (
      !held.complete ||
      !qa.gateway.barriers.snapshot().some((hit) => hit.name === 'held-query-all')
    )
      throw new BlockedError('未证明真实查询被延迟超过原5秒窗口');
    const landed = validateLanding(qa, context);
    const restoredLower = Date.now();
    qa.gateway.barriers.release('held-query-all');
    const restored: Interval = [restoredLower, Date.now() + 1];
    const result = await waitSent(qa, context, 'held-query-restored');
    if (usablePositiveQueries(qa, context.queryPath).length === 0)
      throw new BlockedError('恢复后没有完整200发送证据，不能证明查询恢复或判断恢复时限');
    if (result.observed.complete) expect(result.observed.last.message.msgId).toBe(landed.msgId);
    await deadline(qa, 'held-query-two-second-bound', restored, result.samples, held.last, 2_000);
  });
});

test('[INT-MSG-003] a slow successful confirmation is timed from the original 504', async ({
  qa,
}) => {
  test.setTimeout(45_000);
  await scoped(qa, 'slow-query-original', async () => {
    const context = await begin504(qa, 'slow-query-original', (path) => {
      qa.gateway.enqueue(
        path,
        ...Array.from({ length: 128 }, (): GatewayResponsePlan => ({
          method: 'GET',
          responseDelayMs: 1_800,
        })),
      );
    });
    const result = await waitSent(qa, context, 'slow-query-original-observations');
    const queries = qa.gateway
      .snapshot()
      .requests.filter((request) => request.path === context.queryPath);
    if (
      queries.length >= 128 ||
      queries.some(
        (request) =>
          request.responseClosedBeforeFinish ||
          (request.responseStatus && ![200, 404].includes(request.responseStatus)),
      ) ||
      usablePositiveQueries(qa, context.queryPath).length === 0
    )
      throw new BlockedError(
        '慢查询未形成全程可用响应路径；超时/不可用例外不能按无例外5秒场景裁判',
      );
    const landed = validateLanding(qa, context);
    if (result.observed.complete) expect(result.observed.last.message.msgId).toBe(landed.msgId);
    await deadline(
      qa,
      'slow-query-original-five-second-bound',
      context.start,
      result.samples,
      context.initial,
      5_000,
    );
  });
});

test('[INT-MSG-004] recovery to slow successful queries retains the original two-second bound', async ({
  qa,
}) => {
  test.setTimeout(45_000);
  await scoped(qa, 'slow-query-recovery', async () => {
    const context = await begin504(qa, 'slow-query-recovery', () =>
      qa.gateway.configure({ unavailable: true }),
    );
    const held = await observe({
      read: () => sample(qa, context.group.id, context.clientMsgId),
      invariant: (value) => {
        noFalseFailure(qa, context.sendPath, value);
        expect(value.message.deliveryStatus).toBe('unknown');
      },
      complete: (value) => value.lower > context.start[1] + 5_000,
      durationMs: 7_000,
    });
    await qa.evidence('slow-query-recovery-outage', {
      context,
      held,
      gateway: qa.gateway.snapshot(),
    });
    if (
      !held.complete ||
      !held.last.requests.some(
        (request) => request.path === context.queryPath && request.responseStatus === 503,
      )
    )
      throw new BlockedError('没有确认查询实际503且未知跨5秒的前提');
    const landed = validateLanding(qa, context);
    qa.gateway.enqueue(
      context.queryPath,
      ...Array.from({ length: 128 }, (): GatewayResponsePlan => ({
        method: 'GET',
        responseDelayMs: 1_800,
      })),
    );
    const restoredLower = Date.now();
    qa.gateway.configure({ unavailable: false });
    const restored: Interval = [restoredLower, Date.now() + 1];
    const result = await waitSent(qa, context, 'slow-query-recovery-observations');
    const queries = qa.gateway
      .snapshot()
      .requests.filter(
        (request) => request.path === context.queryPath && Date.parse(request.at) >= restored[1],
      );
    if (
      queries.length >= 128 ||
      queries.some((request) => request.responseClosedBeforeFinish) ||
      usablePositiveQueries(qa, context.queryPath, restored[1]).length === 0
    )
      throw new BlockedError('恢复后的1800ms查询仍被取消或未完成；缺少恢复为可用200的证据');
    if (result.observed.complete) expect(result.observed.last.message.msgId).toBe(landed.msgId);
    await deadline(
      qa,
      'slow-query-recovery-two-second-bound',
      restored,
      result.samples,
      held.last,
      2_000,
    );
  });
});

test('[INT-MSG-005] repeated confirmation identities preserve committed sequence timing across restart', async ({
  qa,
}) => {
  test.setTimeout(75_000);
  await scoped(qa, 'receipt-identity', async () => {
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    const sendPath = `/groups/${group.gatewayGroupId}/send`;
    qa.gateway.enqueue(sendPath, { omitEvent: true });
    const { id } = await qa.api.require(
      qa.api.post<{ id: string }>('/api/sequences', {
        name: 'same confirmation identity',
        steps: [
          { index: 1, accountRole: 'admin', text: 'receipt-first', delaySeconds: 0 },
          { index: 2, accountRole: 'admin', text: 'receipt-next', delaySeconds: 10 },
        ],
      }),
    );
    const { runId } = await qa.api.require(
      qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
        sequenceId: id,
        vars: {},
        stepVars: {},
      }),
      201,
    );
    const read = () => qa.api.require(qa.api.get<SequenceRun>(`/api/sequence-runs/${runId}`));
    const landed = await observe({
      read: async () => qa.gateway.snapshot(),
      invariant: (value) =>
        expect(
          value.requests.filter((request) => request.path === sendPath).length,
        ).toBeLessThanOrEqual(1),
      complete: (value) => value.messages.length === 1,
      durationMs: 10_000,
    });
    if (!landed.complete) throw new BlockedError('未获得首步真实落地，无法构造合法确认身份');
    const first = landed.last.messages[0]!;
    const payload = { clientMsgId: first.clientMsgId, msgId: first.msgId, sentAt: first.sentAt };
    const receiptLower = Date.now();
    const original = qa.gateway.emit('message_sent', payload);
    const committed = await observe({
      read,
      invariant: async (run) => {
        expect(['running', 'finished']).toContain(run.status);
        const snapshot = qa.gateway.snapshot();
        const sends = snapshot.requests.filter((request) => request.path === sendPath);
        expect(sends.length).toBeLessThanOrEqual(2);
        if (sends[1])
          expect(
            Date.parse(sends[1].at) + 1 - receiptLower,
            '已证明的提前发送仍须FAIL',
          ).toBeGreaterThanOrEqual(10_000);
        if (run.status === 'finished') {
          expect(run.steps.every((step) => step.status === 'sent')).toBe(true);
          expect(sends).toHaveLength(2);
          expect(snapshot.messages.map((message) => message.text)).toEqual([
            'receipt-first',
            'receipt-next',
          ]);
          await qa.evidence('receipt-identity-initial-window-missed', {
            original,
            receiptLower,
            run,
            gateway: snapshot,
          });
          throw new BlockedError(
            '首次公开读回时已正常完成，未命中后步尚未执行的重放/重启窗口；不将慢读回当产品失败',
          );
        }
      },
      complete: (run) => run.steps[0]!.status === 'sent' && run.steps[1]!.scheduledAt !== null,
      durationMs: 10_000,
    });
    if (!committed.complete)
      throw new BlockedError('未观察到公开已提交首步与后续排期，不能声称可靠保存前后窗口已命中');
    const receiptUpper = Date.now() + 1;
    const firstSentAt = committed.last.steps[0]!.sentAt;
    const scheduledAt = committed.last.steps[1]!.scheduledAt!;
    expect(firstSentAt).toEqual(expect.any(String));
    const stable = (run: SequenceRun) => {
      expect(['running', 'finished']).toContain(run.status);
      expect(run.steps[0]!.status).toBe('sent');
      expect(run.steps[0]!.sentAt).toBe(firstSentAt);
      expect(run.steps[1]!.scheduledAt).toBe(scheduledAt);
      const sends = qa.gateway.snapshot().requests.filter((request) => request.path === sendPath);
      expect(sends.length).toBeLessThanOrEqual(2);
      if (sends[1])
        expect(Date.parse(sends[1].at) + 1 - receiptLower).toBeGreaterThanOrEqual(10_000);
    };
    await observe({ read, invariant: stable, complete: () => false, durationMs: 1_000 });
    const duplicateBefore = qa.gateway.emit('message_sent', payload);
    expect(duplicateBefore.eventId).toBeGreaterThan(original.eventId);
    await observe({ read, invariant: stable, complete: () => false, durationMs: 500 });
    await qa.evidence('receipt-identity-before-restart', {
      original,
      duplicateBefore,
      committed,
      receipt: [receiptLower, receiptUpper],
      gateway: qa.gateway.snapshot(),
    });
    await qa.kill();
    await qa.start();
    const restartUpper = Date.now() + 1;
    await qa.api.login();
    if (restartUpper >= Date.parse(scheduledAt))
      throw new BlockedError('重启已跨原后步排期，原文允许过期重排；不能用本正常恢复场景否定它');
    const duplicateAfter = qa.gateway.emit('message_sent', payload);
    expect(duplicateAfter.eventId).toBeGreaterThan(duplicateBefore.eventId);
    const final = await observe({
      read,
      invariant: stable,
      complete: (run) => run.status === 'finished',
      durationMs: 15_000,
      intervalMs: 25,
    });
    await qa.evidence('receipt-identity-after-restart', {
      duplicateAfter,
      restartUpper,
      final,
      receipt: [receiptLower, receiptUpper],
      gateway: qa.gateway.snapshot(),
      scope: '公开业务提交后重启；不代表接收记录已保存但业务未提交或保存前崩溃窗口',
    });
    if (!final.complete)
      throw new BlockedError('有限观察内未完成第二步，不把观察预算当额外完成时限');
    const messages = qa.gateway.snapshot().messages;
    expect(messages.map((message) => message.text)).toEqual(['receipt-first', 'receipt-next']);
    const sends = qa.gateway.snapshot().requests.filter((request) => request.path === sendPath);
    expect(sends).toHaveLength(2);
    if (Date.parse(sends[1]!.at) - receiptUpper < 10_000)
      throw new BlockedError('发送与首次接收区间跨10秒配置delay，不能给重叠区间判通过');
    const rows = (await qa.api.messages(group.id)).items.filter(
      (message) => message.clientMsgId === first.clientMsgId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.msgId).toBe(first.msgId);
  });
});
