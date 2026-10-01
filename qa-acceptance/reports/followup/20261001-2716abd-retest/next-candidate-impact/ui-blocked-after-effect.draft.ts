/** NOT REGISTERED / NOT RUN. Body to wrap in a catalogued Playwright case after handoff.
 * Uses public API + independent actual gateway effects. Does not import the SUT.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type { QaEnvironment } from '../../../../harness/environment.js';
import type { AgentRun } from '../../../../harness/platform-client.js';
import { observe } from '../../../../harness/observation.js';
import { BlockedError } from '../../../../harness/security.js';
import { assertScopedBlockedCopy, groupPage, login, runLink } from './draft-support.js';

export async function blockedAfterActualEffect(qa: QaEnvironment, page: Page): Promise<void> {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const suffix = randomUUID(), first = `already-sent-${suffix}`, second = `must-not-send-${suffix}`;
  const firstText = `先前已真实发送 ${suffix}`, secondText = `本次审计阻塞 ${suffix}`;
  const barrier = `second-tool-response-${suffix}`;
  const before = qa.gateway.snapshot();
  const plan = (id: string, text: string) => ({ body: { stop_reason: 'tool_use', content: [
    { type: 'tool_use', id, name: 'send_message', input: { text, idempotency_key: id } },
  ] } });
  qa.agent.enqueueTurns(plan(first, firstText), {
    ...plan(second, secondText), barrier: { phase: 'before-response', name: barrier },
  });
  qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'independent QA pass' } },
    { status: 500 }, { rawBody: 'invalid' }, { body: { verdict: 'unknown' } });
  let runId: string | undefined;
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'copy-probe',
      text: `真实两工具场景 ${suffix}` });
    const created = await observe({
      read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      invariant: items => assert.ok(items.length <= 1, '独立群不应创建多个run'),
      complete: items => items.length === 1, durationMs: 15_000,
    });
    if (!created.complete) throw new BlockedError('有限观察未取得真实run；不是新增15秒SLA');
    runId = created.last[0]!.id;
    try { await qa.agent.barriers.waitFor(barrier, 15_000); }
    catch (error) {
      const actual = await qa.api.agentRun(runId);
      await qa.evidence('draft-copy-first-window-missed', { actual, error: String(error) });
      assert.equal(actual.status, 'running', '合法两工具计划不应在第二轮前提前终态');
      throw new BlockedError('未取得第二工具响应屏障；不得假称已建立前序副作用');
    }
    const prior = await observe({
      read: () => qa.api.messages(group.id),
      invariant: list => assert.ok(list.items.filter(m => m.isOwn && m.text === firstText).length <= 1),
      complete: list => list.items.some(m => m.isOwn && m.text === firstText && m.deliveryStatus === 'sent'),
      durationMs: 5_000,
    });
    if (!prior.complete) throw new BlockedError('未取得前序实际sent；不拿accepted冒充落地');
    const firstState = await qa.api.agentRun(runId);
    assert.equal(firstState.steps.length, 1);
    assert.equal(firstState.steps[0]!.toolUseId, first);
    assert.equal(firstState.steps[0]!.isError, false);
    const landed = qa.gateway.snapshot().messages.filter(m => m.groupId === group.gatewayGroupId && m.text === firstText);
    assert.equal(landed.length, 1, '公开sent必须同时有独立远端落地');
    await qa.evidence('draft-copy-prior-effect', { run: firstState, publicMessages: prior.last, landed });
    qa.agent.barriers.release(barrier);
    const terminal = await observe({ read: () => qa.api.agentRun(runId!),
      invariant: actual => {
        assert.equal(actual.id, runId);
        assert.ok(actual.steps.length <= 2);
        assert.equal(qa.gateway.snapshot().messages.filter(m => m.groupId === group.gatewayGroupId && m.text === secondText).length, 0,
          '本次工具三次审计无明确pass，禁止真实发送');
      }, complete: actual => actual.status !== 'running', durationMs: 25_000 });
    if (!terminal.complete) throw new BlockedError('有限诊断未见审计终态；保留全部副作用观测');
    const actual = terminal.last;
    assert.equal(actual.status, 'blocked');
    assert.equal(actual.endReason, 'audit_blocked');
    assert.equal(actual.steps.length, 2);
    assert.equal(actual.steps[0]!.toolUseId, first);
    assert.equal(actual.steps[0]!.isError, false);
    assert.equal(actual.steps[1]!.toolUseId, second);
    assert.equal((await qa.api.group(group.id)).activeAgentRunId, null);
    const facts = qa.gateway.snapshot();
    assert.equal(facts.messages.filter(m => m.groupId === group.gatewayGroupId && m.text === firstText).length, 1);
    assert.equal(facts.requests.slice(before.requests.length).filter(r => r.method === 'POST' && r.path.endsWith('/send')).length, 1);
    const audits = qa.agent.snapshot().audits.filter(r => (r.body as { groupId?: string }).groupId === group.id);
    assert.equal(audits.length, 4, '第一工具审计pass一次，第二工具真实三次无结论');
    assert.equal(audits.filter(r => (r.body as { text?: string }).text === firstText).length, 1);
    assert.equal(audits.filter(r => (r.body as { text?: string }).text === secondText).length, 3);
    await login(page, qa);
    await groupPage(page, qa, group.id);
    const link = runLink(page, qa, runId);
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    const listText = await link.innerText();
    assertScopedBlockedCopy(listText);
    await link.click();
    await expect(page).toHaveURL(url => decodeURIComponent(url.href).endsWith(`/${runId}`));
    await expect(page.locator('main')).toContainText(firstText);
    await expect(page.locator('main')).toContainText(secondText);
    const detailText = await page.locator('main').innerText();
    assertScopedBlockedCopy(detailText);
    const afterBrowser = await qa.api.agentRun(runId);
    assert.deepEqual(afterBrowser, actual, '纯查看不改变已落地/阻塞轨迹');
    await qa.evidence('draft-copy-blocked-after-effect', { actual, audits,
      publicMessages: await qa.api.messages(group.id), gateway: facts, listText, detailText });
  } finally {
    qa.agent.barriers.release(barrier);
    await qa.evidence('draft-copy-final-facts', { runId, agent: qa.agent.snapshot(), gateway: qa.gateway.snapshot() });
  }
}
