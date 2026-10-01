import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import {
  assertAgeSide, assertOwnedBytes, assertActivityLowerBounds, assertTurnResponse, assertAuditResponse,
  assertServiceUuid, assertUsageOutcome, assertUsageTokens, observeOperation, IndependentProtocolDouble, requiredTools,
  providerReal, validateRealPermission, withOwnedDriver,
} from '../media-provider.js';
import { PreparationBlocked, type DriverBase, type ActivityProof, type RealProviderPermission } from '../../contracts/media-provider.js';

const ev = { reference: 'selftest://actual-local-tool-input', raw: {} };
const owner = { sessionId: 'self', sutRevision: 'a'.repeat(40), contractReference: 'self-only',
  reviewedSourceContracts: ['c1-media-files', 'c2-gemini-agent'] as const,
  resourceRoot: '/qa-self-owned', applicationPids: [process.pid], endpoints: [], evidence: ev };
function fakeDriver(): DriverBase & { opens: number; cleanups: number } {
  return { opens: 0, cleanups: 0, contractReference: 'self-only', capabilities: ['cap'],
    async open() { this.opens++; return owner; }, async evidence() {},
    async cleanup() { this.cleanups++; return { failures: [], evidence: ev }; } };
}
const activity = (extra: Partial<ActivityProof> = {}): ActivityProof => ({ runId: 'run', complete: false, continuous: false,
  epochIds: [], activeElapsedMs: null, actualDecisionElapsedMs: null, decisionAttemptId: null, committedAttemptId: null, evidence: ev, ...extra });

test('四工具声明完整且每个公开参数必填', () => {
  const tools = requiredTools(); assert.equal(new Set(tools.map((t) => t.name)).size, 4);
  for (const tool of tools) assert.deepEqual(tool.input_schema.required.sort(), Object.keys(tool.input_schema.properties).sort());
  assert.deepEqual(tools.find((t) => t.name === 'send_message')!.input_schema.required, ['idempotency_key', 'text']);
});
test('原协议单块合法，空块/多块/错误stop组合被拒绝', () => {
  assertTurnResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] });
  assertTurnResponse({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'finish', input: { summary: 'done' } }] });
  for (const value of [null, { content: [] }, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    { stop_reason: 'end_turn', content: [{ type: 'tool_use', id: 'x', input: {} }] }]) assert.throws(() => assertTurnResponse(value));
});
test('审计只认明确合法pass/fail，不把true/unknown当许可', () => {
  assertAuditResponse({ verdict: 'fail', reason: 'denied' }); assertAuditResponse({ verdict: 'pass', reason: '' });
  for (const verdict of [true, 'unknown', null, 'PASS']) assert.throws(() => assertAuditResponse({ verdict, reason: 'x' }));
  assert.throws(() => assertAuditResponse({ verdict: 'pass' }));
});
test('独立协议替身保留原输入、无脚本时不生成成功', () => {
  const double = new IndependentProtocolDouble(); const input = { messages: [{ text: 'original' }] };
  double.enqueue({ verdict: 'fail', reason: 'scripted' }); const got = double.exchange('/agent/audit', input) as { verdict: string };
  input.messages[0]!.text = 'modified'; got.verdict = 'pass';
  assert.deepEqual(double.received[0]!.body, { messages: [{ text: 'original' }] });
  assert.throws(() => double.exchange('/agent/turn', {}), PreparationBlocked);
});
test('并发操作立即收取拒绝，另一操作仍完整结算', async () => {
  const error = new Error('early operation rejection'); let laterSettled = false;
  const first = observeOperation(Promise.reject(error));
  const second = observeOperation(new Promise<number>((done) => setImmediate(() => { laterSettled = true; done(3); })));
  const result = await Promise.all([first, second]);
  assert.equal(laterSettled, true); assert.deepEqual(result, [{ ok: false, error }, { ok: true, value: 3 }]);
});
test('缺driver/能力时在open之前阻塞，不能默选目标', async () => {
  await assert.rejects(withOwnedDriver(undefined, [], 'provider-test', async () => assert.fail()), PreparationBlocked);
  const d = fakeDriver(); await assert.rejects(withOwnedDriver(d, ['missing'], 'provider-test', async () => assert.fail()), PreparationBlocked);
  assert.equal(d.opens, 0); assert.equal(d.cleanups, 0);
});
test('版本或公开契约归属不全时不执行body', async () => {
  const d = fakeDriver(); d.open = async () => ({ ...owner, sutRevision: 'unfrozen', reviewedSourceContracts: [] });
  await assert.rejects(withOwnedDriver(d, ['cap'], 'media-test', async () => assert.fail()), PreparationBlocked);
  assert.equal(d.cleanups, 1);
});
test('产品主失败不能被清理或二次取证失败覆盖', async () => {
  const d = fakeDriver(), primary = new Error('real primary violation');
  d.cleanup = async () => { throw new Error('cleanup'); };
  let writes = 0; d.evidence = async () => { if (++writes > 1) throw new Error('evidence'); };
  await assert.rejects(withOwnedDriver(d, ['cap'], 'provider-test', async () => { throw primary; }), (e) => e === primary);
});
test('仅清理失败时不会得到成功', async () => {
  const d = fakeDriver(); d.cleanup = async () => ({ failures: ['owned resource remains'], evidence: ev });
  await assert.rejects(withOwnedDriver(d, ['cap'], 'provider-test', async () => {}), PreparationBlocked);
});
test('真实字节断言读实际文件并拒绝错hash/路径逃逸/软链/公开权限', async () => {
  const base = resolve(fileURLToPath(new URL('../..', import.meta.url)), '.runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'media-tool-self-'));
  try {
    const media = join(root, 'media'); await mkdir(media, { mode: 0o700 });
    const valid = join(media, 'a.bin'), outside = join(root, 'outside.bin'), content = Uint8Array.of(0, 255, 17, 80);
    await writeFile(valid, content, { mode: 0o600 }); await writeFile(outside, content, { mode: 0o600 });
    const result = await assertOwnedBytes(valid, media, content); assert.equal(result.bytes, 4); assert.equal(result.sha256.length, 64);
    await assert.rejects(assertOwnedBytes(valid, media, Uint8Array.of(0, 255, 17, 81)));
    await assert.rejects(assertOwnedBytes(outside, media, content));
    const link = join(media, 'link.bin'); await symlink(valid, link); await assert.rejects(assertOwnedBytes(link, media, content));
    await chmod(valid, 0o644); await assert.rejects(assertOwnedBytes(valid, media, content));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('年龄跨界即使包含请求值也不能判保留/删除', () => {
  assertAgeSide([29, 29.99], 30, 'younger'); assertAgeSide([30.01, 31], 30, 'expired');
  for (const b of [[29, 31], [30, 30], [NaN, 31], [32, 31], [-1, 2]] as [number, number][]) {
    assert.throws(() => assertAgeSide(b, 30, 'younger'), PreparationBlocked);
    assert.throws(() => assertAgeSide(b, 30, 'expired'), PreparationBlocked);
  }
});
test('已证实际决定超限不被缺COMMIT/不完整整体见证遮蔽', () => {
  assert.throws(() => assertActivityLowerBounds(activity({ actualDecisionElapsedMs: [60_000.001, 60_001] }), 'run'), assert.AssertionError);
  assert.throws(() => assertActivityLowerBounds(activity({ activeElapsedMs: [60_001, 60_002], actualDecisionElapsedMs: [NaN, NaN] }), 'run'), assert.AssertionError);
  assertActivityLowerBounds(activity({ activeElapsedMs: [10, 20] }), 'run');
});
test('不属本run或非法活动区间是见证阻塞，不能判产品超时', () => {
  assert.throws(() => assertActivityLowerBounds(activity({ runId: 'other', activeElapsedMs: [70_000, 71_000] }), 'run'), PreparationBlocked);
  for (const b of [[NaN, 1], [1, Infinity], [-1, 1], [70_000, 60_000]] as [number, number][])
    assert.throws(() => assertActivityLowerBounds(activity({ activeElapsedMs: b }), 'run'), PreparationBlocked);
});
test('用量业务许可与模型成功区分，429不能记录success', () => {
  assertUsageOutcome('success', null, true); assertUsageOutcome('error', 'HTTP_ERROR', false);
  assert.throws(() => assertUsageOutcome('success', null, false));
  assert.throws(() => assertUsageOutcome('', 'HTTP_ERROR', false));
  assert.throws(() => assertUsageOutcome('error', null, false));
});
test('服务UUID须实际分组，不接受任意36字符', () => {
  assertServiceUuid('e6b728f5-793b-424c-8b6c-5cce703861f8');
  assert.throws(() => assertServiceUuid('-'.repeat(36))); assert.throws(() => assertServiceUuid('0'.repeat(36)));
});
test('失败输出保留已知用量；未知与真实零分别比较', () => {
  assertUsageOutcome('failed', 'INVALID_RESPONSE', false);
  assertUsageTokens({ inputTokens: 23, outputTokens: 5 }, { inputTokens: 23, outputTokens: 5 });
  assertUsageTokens(null, null); assertUsageTokens({ inputTokens: 0 }, { inputTokens: 0 });
  assert.throws(() => assertUsageTokens(null, { inputTokens: 23, outputTokens: 5 }));
  assert.throws(() => assertUsageTokens({ inputTokens: 0 }, null));
  assert.throws(() => assertUsageTokens({ inputTokens: 99 }, null));
});
const permission = (): RealProviderPermission => ({ explicitlyAuthorized: true, authorizationReference: 'self://authorization-not-real',
  credentialReference: 'self://not-a-key', model: 'synthetic', maximumPaidCalls: 2, maximumOutputTokens: 32,
  maximumSpend: { currency: 'USD', amount: 0.01 }, expiresAt: new Date(Date.now() + 60_000).toISOString() });
test('真实提供方门禁拒绝无限/非整数/过期预算', () => {
  validateRealPermission(permission());
  for (const bad of [ { maximumPaidCalls: Infinity }, { maximumPaidCalls: 2.5 }, { maximumOutputTokens: NaN },
    { maximumSpend: { currency: 'USD', amount: Infinity } }, { expiresAt: '2020-01-01' } ])
    assert.throws(() => validateRealPermission({ ...permission(), ...bad }), PreparationBlocked);
});
test('没有本轮收费许可不会加载driver或发实际请求', async () => {
  await assert.rejects(providerReal(undefined), PreparationBlocked);
});
