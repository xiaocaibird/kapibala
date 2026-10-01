import { test, expect } from '../fixtures.js';
import type { QaEnvironment } from '../../harness/environment.js';
import type { GatewayMessage, GatewayRequest } from '../../harness/gateway.js';
import type { SequenceRun } from '../../harness/platform-client.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';
import {
  messageObservationFor, assertDeadline, assertReceiptSchedule, verifyReceiptClock,
  type MessageObservation, type MessageMode, type Interval,
} from '../../harness/message-observation.js';

async function scoped(qa: QaEnvironment, mode: MessageMode,
  body: (control: MessageObservation) => Promise<void>): Promise<void> {
  let control: MessageObservation | undefined;
  let failed = false;
  try {
    control = await messageObservationFor(qa);
    await control.verify(mode);
    await body(control);
  } catch (error) { failed = true; throw error; }
  finally {
    qa.gateway.barriers.releaseAll();
    qa.gateway.configure({ unavailable: false, sseUnavailable: false });
    try {
      await control?.close();
    } catch (cleanup) {
      await qa.evidence('message-window-cleanup-failure', { error: String(cleanup) });
      if (!failed) throw cleanup;
    } finally {
      try { await qa.evidence('message-window-final-ledger', { gateway: qa.gateway.snapshot() }); }
      catch (error) { if (!failed) throw error; }
    }
  }
}
async function messageSample(qa: QaEnvironment, groupId: string, clientMsgId: string) {
  const lower = Date.now();
  const rows = (await qa.api.messages(groupId)).items.filter((item) => item.clientMsgId === clientMsgId);
  const upper = Date.now() + 1;
  expect(rows).toHaveLength(1);
  return { message: rows[0]!, time: [lower, upper] as Interval };
}
function oneSend(qa: QaEnvironment, path: string, clientMsgId: string): GatewayMessage | undefined {
  const state = qa.gateway.snapshot();
  expect(state.requests.filter((request) => request.path === path)).toHaveLength(1);
  const messages = state.messages.filter((item) => item.clientMsgId === clientMsgId);
  expect(messages.length).toBeLessThanOrEqual(1);
  return messages[0];
}

test('[INT-MSG-006] the five-second timeout decision retains the actual 504 receipt origin across local delay', async ({ qa }) => {
  test.setTimeout(45_000);
  await scoped(qa, 'timeout-observed-before-local-save', async (control) => {
    await qa.api.login();
    const { group, accounts } = await qa.api.createGroup();
    const path = `/groups/${group.gatewayGroupId}/send`;
    const barrier = 'message-window-504-response';
    qa.gateway.configure({ sseUnavailable: true });
    qa.gateway.disconnectStreams();
    qa.gateway.enqueue(path, {
      status: 504, code: 'NETWORK_TIMEOUT', effect: 'apply', effectDelayMs: 1_000,
      barrier: { phase: 'before-response', name: barrier },
    });
    const pending = qa.api.post<{ clientMsgId: string }>(`/api/groups/${group.id}/send`, {
      accountId: accounts[0]!.id, text: 'message-window-504',
    }).then((response) => ({ response }), (error: unknown) => ({ error }));
    let lease: Awaited<ReturnType<MessageObservation['arm']>> | undefined;
    let failed: unknown;
    try {
      let request: GatewayRequest;
      try { request = (await qa.gateway.barriers.waitFor(barrier)).context as GatewayRequest; }
      catch { throw new BlockedError('未触达外部504响应屏障，不能声称命中本地处理延迟'); }
      const clientMsgId = (request.body as { clientMsgId: string }).clientMsgId;
      lease = await control.arm('timeout-observed-before-local-save', { clientMsgId });
      qa.gateway.barriers.release(barrier);
      const held = await lease.waitHeld();
      const receiptUpper = Date.now() + 1;
      const response = qa.gateway.snapshot().requests.find((entry) => entry.id === request.id)!;
      if (response.responseStatus !== 504 || !response.completedAt || !response.responseFinishedAt || response.responseClosedBeforeFinish)
        throw new BlockedError('缺少明确504的完整HTTP递送证据');
      const receipt: Interval = [Date.parse(response.completedAt), receiptUpper];
      verifyReceiptClock(held, receipt);
      const heldStart = performance.now();
      const heldObservations: unknown[] = [];
      // Stay below the original 5s budget. This injects a local delay, not a new deadline.
      while (performance.now() - heldStart < 2_500) {
        const current = await lease.snapshot();
        if (current.state !== 'held' || Date.parse(current.expiresAt) <= Date.now())
          throw new BlockedError('504处理门提前释放，未建立保持前提');
        const value = await messageSample(qa, group.id, clientMsgId);
        heldObservations.push(value);
        expect(['failed', 'cancelled']).not.toContain(value.message.deliveryStatus);
        oneSend(qa, path, clientMsgId);
        await new Promise((ok) => setTimeout(ok, 25));
      }
      const landing = oneSend(qa, path, clientMsgId);
      const confirmation = qa.gateway.snapshot().events.find((event) => event.type === 'message_sent' && event.data.clientMsgId === clientMsgId);
      if (!landing || !confirmation?.recordedAt || Date.parse(landing.sentAt) + 1 > receipt[0] + 2_000 ||
          Date.parse(confirmation.recordedAt) + 1 > receipt[0] + 2_000)
        throw new BlockedError('独立网关未证明504后2秒内落地及生成确认，夹具不能裁判产品');
      if (Date.now() + 1 - receipt[0] >= 4_500)
        throw new BlockedError('准备/注入已耗尽原5秒取证窗口；不以夹具过长暂停判产品违约');
      await qa.evidence('message-timeout-window-held', { held, receipt, heldObservations, gateway: qa.gateway.snapshot() });
      await lease.advance();
      const samples: Awaited<ReturnType<typeof messageSample>>[] = [];
      const determined = await observe({
        read: () => messageSample(qa, group.id, clientMsgId),
        invariant: (value) => {
          samples.push(value);
          oneSend(qa, path, clientMsgId);
          expect(['failed', 'cancelled']).not.toContain(value.message.deliveryStatus);
        },
        complete: (value) => ['accepted', 'sent'].includes(value.message.deliveryStatus),
        durationMs: 8_000, intervalMs: 20,
      });
      const resolved = samples.find((value) => ['accepted', 'sent'].includes(value.message.deliveryStatus));
      const lastPending = samples.filter((value) => !['accepted', 'sent'].includes(value.message.deliveryStatus)).at(-1);
      await qa.evidence('message-timeout-original-deadline', { receipt, samples, determined, gateway: qa.gateway.snapshot() });
      assertDeadline(receipt, lastPending?.time, resolved?.time, 5_000);
      const sent = await observe({
        read: () => messageSample(qa, group.id, clientMsgId),
        invariant: (value) => { oneSend(qa, path, clientMsgId); expect(['failed', 'cancelled']).not.toContain(value.message.deliveryStatus); },
        complete: (value) => value.message.deliveryStatus === 'sent', durationMs: 10_000,
      });
      await qa.evidence('message-timeout-final-confirmation', sent);
      if (!sent.complete) throw new BlockedError('有限观察缺少已落地消息的最终合并，不新增确认后的完成SLA');
      expect(sent.last.message.msgId).toBe(landing.msgId);
    } catch (error) { failed = error; throw error; }
    finally {
      qa.gateway.barriers.release(barrier);
      try { await lease?.release(); }
      catch (error) { await qa.evidence('message-timeout-release-error', { error: String(error) }); if (!failed) throw error; }
      const outcome = await pending;
      if ('response' in outcome) {
        // An actual invalid public response is still a failure when setup was only blocked.
        if (!failed || failed instanceof BlockedError) expect(outcome.response.status).toBe(202);
      } else if (!failed) throw new BlockedError(`公开发送HTTP结果不可用：${String(outcome.error)}`);
    }
  });
});

async function receiptCrash(qa: QaEnvironment, mode: Exclude<MessageMode, 'timeout-observed-before-local-save'>): Promise<void> {
  await scoped(qa, mode, async (control) => {
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    const path = `/groups/${group.gatewayGroupId}/send`;
    const delayMs = 20_000;
    qa.gateway.configure({ sseUnavailable: true });
    qa.gateway.disconnectStreams();
    qa.gateway.enqueue(path, { omitEvent: true });
    const sequence = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', {
      name: mode,
      steps: [
        { index: 1, accountRole: 'admin', text: `${mode}-first`, delaySeconds: 0 },
        { index: 2, accountRole: 'admin', text: `${mode}-next`, delaySeconds: delayMs / 1000 },
      ],
    }));
    const { runId } = await qa.api.require(qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: sequence.id, vars: {}, stepVars: {},
    }), 201);
    const read = () => qa.api.sequenceRun(runId);
    const landed = await observe({
      read: async () => qa.gateway.snapshot(),
      invariant: (state) => expect(state.requests.filter((entry) => entry.path === path).length).toBeLessThanOrEqual(1),
      complete: (state) => state.messages.filter((item) => item.groupId === group.gatewayGroupId).length === 1,
      durationMs: 10_000,
    });
    if (!landed.complete) throw new BlockedError('首步未真实落地，无法构造确认接收窗口');
    const first = landed.last.messages.find((item) => item.groupId === group.gatewayGroupId)!;
    expect(first.clientMsgId).toEqual(expect.any(String));
    const payload = { clientMsgId: first.clientMsgId!, msgId: first.msgId, sentAt: first.sentAt };
    const event = qa.gateway.emit('message_sent', payload, { storeOnly: true });
    const lease = await control.arm(mode, { clientMsgId: first.clientMsgId!, msgId: first.msgId, eventId: String(event.eventId) });
    const receiptLower = Date.now();
    qa.gateway.configure({ sseUnavailable: false });
    const held = await lease.waitHeld();
    const receipt: Interval = [receiptLower, Date.now() + 1];
    verifyReceiptClock(held, receipt);
    if (mode === 'receipt-committed-before-business' && held.receiptObservedAt !== held.observedAt)
      throw new BlockedError('新身份已有不同的receipt赢家时间，未命中本用例首次接收前提');
    const heldRun = await read();
    expect(heldRun.status).toBe('running');
    expect(heldRun.steps[0]!.status).not.toBe('sent');
    oneSend(qa, path, first.clientMsgId!);
    await qa.evidence('receipt-window-before-kill', { mode, held, event, receipt, runId, heldRun,
      scope: 'single-bound-instance; no all-database-writer or global-first-receipt claim', gateway: qa.gateway.snapshot() });
    qa.gateway.configure({ sseUnavailable: true });
    qa.gateway.disconnectStreams();
    // Separate the original receipt from replay by an independently recorded real interval.
    const gapStart = performance.now();
    while (performance.now() - gapStart < 1_500) {
      if ((await lease.snapshot()).state !== 'held') throw new BlockedError('崩溃前窗口已释放');
      oneSend(qa, path, first.clientMsgId!);
      await new Promise((ok) => setTimeout(ok, 25));
    }
    const crashLower = Date.now();
    await qa.kill();
    await lease.release();
    await qa.start();
    await qa.api.login();
    const restartUpper = Date.now() + 1;
    if (restartUpper >= receipt[0] + delayMs)
      throw new BlockedError('重启已跨可能的原后步到期时刻；不能混入原文允许的过期重排');
    const rebound = await messageObservationFor(qa);
    await rebound.verify(mode);
    const replayLower = Date.now();
    qa.gateway.configure({ sseUnavailable: false });
    const connected = await observe({
      read: async () => qa.gateway.snapshot().connectedStreams,
      invariant: () => expect(qa.gateway.snapshot().requests.filter((entry) => entry.path === path &&
        (entry.body as { clientMsgId: string }).clientMsgId === first.clientMsgId)).toHaveLength(1),
      complete: (count) => count > 0, durationMs: 5_000,
    });
    if (!connected.complete) throw new BlockedError('重启后未建立事件流，无法证明重新递送');
    // A persisted cursor may skip automatic history replay; send the fact explicitly as well.
    qa.gateway.deliver(event.eventId);
    const restartDuplicate = qa.gateway.emit('message_sent', payload);
    const replayDeliveryUpper = Date.now() + 1;
    if (replayDeliveryUpper >= receipt[0] + delayMs)
      throw new BlockedError('重新建立事件流已跨原后步最早到期；原期内重放前提未成立');
    const samples: SequenceRun[] = [];
    const resumed = await observe({
      read,
      invariant: (run) => {
        samples.push(run);
        expect(['running', 'finished']).toContain(run.status);
        const sends = qa.gateway.snapshot().requests.filter((entry) => entry.path === path);
        expect(sends.length).toBeLessThanOrEqual(2);
        expect(sends.filter((entry) => (entry.body as { clientMsgId: string }).clientMsgId === first.clientMsgId)).toHaveLength(1);
      },
      complete: (run) => run.steps[0]!.status === 'sent' && run.steps[1]!.scheduledAt !== null,
      durationMs: 10_000, intervalMs: 25,
    });
    await qa.evidence('receipt-window-after-restart', { mode, held, receipt, crashLower, restartUpper, replayLower, replayDeliveryUpper, restartDuplicate, resumed, samples, gateway: qa.gateway.snapshot() });
    if (!resumed.complete) throw new BlockedError('有限观察未取得恢复后的首步与排期；不把等待预算变成新SLA');
    assertReceiptSchedule(receipt, resumed.last.steps[1]!.scheduledAt, delayMs);
    const scheduledAt = resumed.last.steps[1]!.scheduledAt;
    const firstSentAt = resumed.last.steps[0]!.sentAt;
    qa.gateway.deliver(event.eventId);
    const duplicate = qa.gateway.emit('message_sent', payload);
    expect(duplicate.eventId).toBeGreaterThan(event.eventId);
    const final = await observe({
      read,
      invariant: (run) => {
        expect(['running', 'finished']).toContain(run.status);
        expect(run.steps[0]!.status).toBe('sent');
        expect(run.steps[0]!.sentAt).toBe(firstSentAt);
        expect(run.steps[1]!.scheduledAt).toBe(scheduledAt);
        const sends = qa.gateway.snapshot().requests.filter((entry) => entry.path === path);
        expect(sends.length).toBeLessThanOrEqual(2);
        expect(sends.filter((entry) => (entry.body as { clientMsgId: string }).clientMsgId === first.clientMsgId)).toHaveLength(1);
        if (sends[1]) expect(Date.parse(sends[1].at) + 1).toBeGreaterThanOrEqual(receipt[0] + delayMs);
      },
      complete: (run) => run.status === 'finished', durationMs: 30_000, intervalMs: 25,
    });
    await qa.evidence('receipt-window-replay-final', { mode, receipt, held, duplicate, final, gateway: qa.gateway.snapshot() });
    if (!final.complete) throw new BlockedError('有限观察没有后步完成证据，保留未完成而非宣称永久停滞');
    const sends = qa.gateway.snapshot().requests.filter((entry) => entry.path === path);
    expect(sends).toHaveLength(2);
    expect(final.last.steps.every((step) => step.status === 'sent')).toBe(true);
    expect(qa.gateway.snapshot().messages.filter((item) => item.groupId === group.gatewayGroupId).map((item) => item.text))
      .toEqual([`${mode}-first`, `${mode}-next`]);
    const rows = (await qa.api.messages(group.id)).items.filter((row) => row.clientMsgId === first.clientMsgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.msgId).toBe(first.msgId);
    if (Date.parse(sends[1]!.at) < receipt[1] + delayMs)
      throw new BlockedError('实际后步发送与首次接收区间边界重叠；不添加提前容差');
  });
}
test('[INT-MSG-007] a single-instance crash before receipt INSERT exposes loss of the original scheduling origin', async ({ qa }) => {
  test.setTimeout(90_000);
  await receiptCrash(qa, 'receipt-before-commit');
});
test('[INT-MSG-008] a committed receipt survives pre-business crash and duplicate event identities without rescheduling', async ({ qa }) => {
  test.setTimeout(90_000);
  await receiptCrash(qa, 'receipt-committed-before-business');
});
