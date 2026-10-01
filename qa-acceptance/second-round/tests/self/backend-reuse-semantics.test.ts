import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReusedMessageResult, reviewUnknownNextSteps, assertUnknownKickCompletion, type dispatchedUnknownKick } from '../../harness/backend-boundaries.js';
import type { DiagnosticModule } from '../../harness/backend-oracles.js';
import { BlockedError } from '../../../harness/security.js';

test('same-key oracle retains the specific current-state contract for failed and pending messages', () => {
  for (const deliveryStatus of ['queued', 'accepted', 'sent', 'failed', 'unknown']) {
    assertReusedMessageResult({ clientMsgId: 'original', deliveryStatus }, 'original', deliveryStatus);
  }
  assert.throws(() => assertReusedMessageResult({ code: 'SEND_TIMEOUT', message: 'no result' }, 'original', 'queued'), assert.AssertionError);
  assert.throws(() => assertReusedMessageResult({ clientMsgId: 'replacement', deliveryStatus: 'sent' }, 'original', 'sent'), assert.AssertionError);
  assert.throws(() => assertReusedMessageResult({ clientMsgId: 'original', deliveryStatus: 'sent' }, 'original', 'failed'), assert.AssertionError);
});

const module = (text: string, failure?: string) => ({ name: 'automation', nextStep: text,
  lastFailure: failure ? { nextStep: failure } : null }) as DiagnosticModule;

test('independent semantic review checks current and historical advice with an explicit rationale', () => {
  const reviews = reviewUnknownNextSteps([module(
    '后续调度轮次已成功，保留最近失败供核对；这不代表此前业务或未知远端操作已完成。',
    '用模块和 tickId 核对受限日志及已有业务状态；尚不能据此判断业务是否完成。')]);
  assert.equal(reviews.length, 2);
  assert.deepEqual(reviews.map(item => item.field), ['nextStep', 'lastFailure.nextStep']);
  assert.ok(reviews.every(item => item.rationale && item.criterion.includes('SR-P1-03-05')));
});

test('semantic review does not accept a safe phrase followed by blind retry or completion claims', () => {
  for (const text of [
    '当前没有本进程记录的失败；调度状态不代表业务完成或全部依赖健康。请立即重新执行踢人。',
    '核对日志，然后直接重发。',
    '请求失败意味着远端未执行。',
    '所有操作都已恢复。',
  ]) assert.throws(() => reviewUnknownNextSteps([module(text)]), assert.AssertionError);
  assert.throws(() => reviewUnknownNextSteps([module('a new wording that QA has not reviewed')]), BlockedError);
});

test('unsafe historical advice cannot hide behind a reviewed current message', () => {
  assert.throws(() => reviewUnknownNextSteps([module(
    '当前没有本进程记录的失败；调度状态不代表业务完成或全部依赖健康。', '失败可直接重试。')]), assert.AssertionError);
});

test('actual recovery pause remains a strong-recovery failure even with zero replay and a later terminal', () => {
  const facts = { paused: true, after: { status: 'finished', recoveryNote: null }, kicks: [{}] } as unknown as Awaited<ReturnType<typeof dispatchedUnknownKick>>;
  assert.throws(() => assertUnknownKickCompletion(facts), /强恢复差异/);
});
