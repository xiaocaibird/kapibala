/** NOT REGISTERED / NOT RUN. Genuine zero-step prerequisite only; no SQL write,
 * response interception, invented observer endpoint, or fake terminal record.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type { QaEnvironment } from '../../../../harness/environment.js';
import type { AgentRun, Group } from '../../../../harness/platform-client.js';
import { observe } from '../../../../harness/observation.js';
import { BlockedError } from '../../../../harness/security.js';
import { assertTerminalEmptyCopy, groupPage, login, runLink } from './draft-support.js';

export type ZeroStepFixture = { group: Group; runId: string; preparationEvidence: unknown; release: () => Promise<void> };
/** Future owned pre-first-dispatch control is a dependency, NOT an implemented protocol.
 * A valid preparer must expose actual run creation + held window + expiry + same target,
 * accumulate genuine active time, and release/clean its own hold. No active_ms editing.
 */
export type RealZeroStepPreparer = (qa: QaEnvironment,
  status: 'failed' | 'cancelled') => Promise<ZeroStepFixture>;

/** Existing public cancellation probe; it may legitimately miss the zero-step window.
 * A /agent/turn request barrier is AFTER dispatch, not proof of before-first-step hold.
 * If the current model round completes into a step, this scene is BLOCKED, not product FAIL.
 */
export async function tryPublicZeroStepCancellation(qa: QaEnvironment): Promise<ZeroStepFixture> {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const barrier = `cancel-first-response-${randomUUID()}`;
  qa.agent.enqueueTurns({ barrier: { phase: 'before-response', name: barrier },
    body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '当前模型轮真实返回' }] } });
  let released = false;
  const release = async () => { if (!released) { released = true; qa.agent.barriers.release(barrier); } };
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'zero-copy-probe', text: barrier });
    const created = await observe({
      read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      invariant: items => assert.ok(items.length <= 1), complete: items => items.length === 1,
      durationMs: 10_000,
    });
    if (!created.complete) throw new BlockedError('有限观察未取得真实零步骤准备run');
    const runId = created.last[0]!.id;
    let hit;
    try { hit = await qa.agent.barriers.waitFor(barrier, 5_000); }
    catch (error) { throw new BlockedError(`真实模型响应屏障未命中：${String(error)}`); }
    const heldState = await qa.api.agentRun(runId);
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
    // No invented cancellation-before-release deadline. Release the original current round.
    await release();
    return { group, runId, preparationEvidence: { source: 'actual-model-response-barrier', hit, heldState }, release };
  } catch (error) { await release(); throw error; }
}

export async function zeroStepTerminalCopy(qa: QaEnvironment, page: Page,
  status: 'failed' | 'cancelled', prepare?: RealZeroStepPreparer): Promise<void> {
  if (!prepare && status === 'failed')
    throw new BlockedError('未交付真实创建后/首次派发前可持有活动的窗口；不能用SQL写failed或预存active_ms制造零步骤');
  const fixture = prepare ? await prepare(qa, status) : await tryPublicZeroStepCancellation(qa);
  try {
    const observed = await observe({ read: () => qa.api.agentRun(fixture.runId),
      invariant: actual => {
        assert.equal(actual.id, fixture.runId);
        assert.equal(actual.groupId, fixture.group.id);
        // These are independent known truths even when the zero-step premise is missed.
        if (actual.status === 'failed') assert.ok(['wall_clock', 'budget_exhausted', 'protocol_errors'].includes(actual.endReason ?? ''));
        if (actual.status === 'cancelled') assert.equal(actual.endReason, 'cancelled');
      }, complete: actual => actual.status !== 'running', durationMs: status === 'failed' ? 65_000 : 20_000 });
    await qa.evidence(`draft-zero-step-${status}-premise`, { preparation: fixture.preparationEvidence, observed,
      gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot() });
    // A missed UI premise never hides an independently proved unexpected effect.
    assert.equal(qa.gateway.snapshot().messages.filter(m => m.groupId === fixture.group.gatewayGroupId && m.accountId !== null).length, 0);
    assert.equal(qa.gateway.snapshot().requests.filter(r => r.method === 'POST' && /\/(send|kick)$/.test(r.path)).length, 0);
    assert.equal(qa.agent.snapshot().audits.filter(r => (r.body as { groupId?: string }).groupId === fixture.group.id).length, 0);
    if (!observed.complete || observed.last.status !== status || observed.last.steps.length !== 0)
      throw new BlockedError(`未形成真实 ${status}/steps=[] 场景；现有步骤/状态原样保留，不能当文案通过`);
    const actual = observed.last;
    if (status === 'failed') assert.equal(actual.endReason, 'wall_clock', '指定真实预算早终止场景');
    assert.equal((await qa.api.group(fixture.group.id)).activeAgentRunId, null);
    await login(page, qa);
    await groupPage(page, qa, fixture.group.id);
    const link = runLink(page, qa, actual.id);
    await expect(link).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(url => decodeURIComponent(url.href).endsWith(`/${actual.id}`));
    await expect(page.locator('main')).toContainText(status === 'failed' ? /失败|failed/ : /已取消|cancelled/);
    await expect(page.locator('main')).toContainText(/暂无步骤|没有步骤|无步骤|no steps|no step records/i);
    const visibleText = await page.locator('main').innerText();
    assertTerminalEmptyCopy(visibleText);
    assert.deepEqual(await qa.api.agentRun(actual.id), actual);
    await qa.evidence(`draft-zero-step-${status}-copy`, { actual, visibleText });
  } finally { await fixture.release(); }
}
