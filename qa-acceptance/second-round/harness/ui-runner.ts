import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import type { QaEnvironment } from '../../harness/environment.js';
import { eventually, type AgentRun, type Group, type SequenceRun } from '../../harness/platform-client.js';
import { BlockedError } from '../../harness/security.js';
import type { UiProfile } from '../contracts/ui-driver.js';
import { PublicUiDriver, allowedBrowserOrigin } from './ui-public-driver.js';
import { nativeBackgroundTab } from '../../tests/ui/native-focus.js';
import { invalidateLatePrecheck, protectLateDraft, protectSequenceClose, returnToOrigin } from '../tests/ui-flows.js';

export interface UiCaseInput {
  qa: QaEnvironment;
  browser: Browser;
  outputDir: string;
}
export interface UiCaseResult { caseId: string; checks: string[]; productExecution: true; }

const definition = (name: string) => ({ name, steps: [
  { index: 1, accountRole: 'admin', text: 'Hello {name}', delaySeconds: 0 },
  { index: 2, accountRole: 'member', text: 'Next {name}', delaySeconds: 0 },
] });
async function fixture(qa: QaEnvironment, id: string): Promise<{ profile: UiProfile; groups: [Group, Group]; secondSequence?: string }> {
  await qa.api.login();
  const a = await qa.api.createGroup(), b = await qa.api.createGroup();
  const profile: UiProfile = {
    groupA: a.group.id, groupB: b.group.id, runId: '',
    sequenceFields: { json: JSON.stringify(definition(`QA-${id}-${randomUUID()}`), null, 2) },
    closeActions: ['close', 'escape', 'cancel'], precheckInitial: {}, precheckChanged: {},
  };
  const numeric = Number(id.slice(-3));
  let secondSequence: string | undefined;
  if (numeric >= 11 && numeric <= 18) {
    const first = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', definition(`QA-primary-${randomUUID()}`)));
    const second = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', definition(`QA-secondary-${randomUUID()}`)));
    secondSequence = second.id;
    profile.precheckInitial = { group: a.group.id, sequence: first.id, vars: '{"name":"Alice"}', stepVars: '{"2":{"name":"Bob"}}' };
    profile.precheckChanged = { ...profile.precheckInitial, group: b.group.id };
  }
  if (numeric >= 19) {
    for (const group of [a.group, b.group]) {
      qa.agent.enqueueTurns({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: `QA-navigation-${group.id}` }] } });
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
      qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: `qa-navigation-${group.id}`, text: 'QA navigation fixture' });
      const runs = await eventually(() => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)), (runs) => runs.length > 0);
      await qa.api.waitFor<AgentRun>(`/api/agent-runs/${runs[0]!.id}`, (run) => run.status !== 'running');
      if (group.id === a.group.id) profile.runId = runs[0]!.id;
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
    }
  }
  await qa.evidence('second-round-ui-fixture', { caseId: id, groupIds: [a.group.id, b.group.id], profile, secondSequence, source: 'public REST and independently recorded Gateway/Agent protocol' });
  return { profile, groups: [a.group, b.group], secondSequence };
}
async function closePreview(ui: PublicUiDriver): Promise<void> {
  const preview = ui.dialog('预检通过 · 确认发送内容');
  if (await preview.isVisible()) await preview.getByRole('button', { name: '返回编辑', exact: true }).click();
}
async function assertOrigin(ui: PublicUiDriver, origin: 'group' | 'run-list', groupId: string): Promise<void> {
  const value = await ui.location();
  assert.equal(value.kind, origin);
  if (origin === 'group') assert.equal(value.groupId, groupId);
  else assert.equal(value.selectedGroupId, groupId);
  assert.equal(value.activeNavigation, origin === 'group' ? '群组工作台' : 'Agent 运行');
}
async function openOrigin(ui: PublicUiDriver, profile: UiProfile, origin: 'group' | 'run-list'): Promise<void> {
  if (origin === 'group') await ui.openRunFromGroup(profile.groupA, profile.runId);
  else await ui.openRunFromList(profile.groupA, profile.runId);
}
async function savedSnapshot(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile): Promise<void> {
  await ui.newSequence(); await ui.editSequence(profile.sequenceFields);
  const gate = await ui.holdNextResponse('sequence-save');
  await ui.saveSequence(); await gate.received;
  await expect(ui.dialog('新建消息序列').getByLabel('序列 JSON')).toBeDisabled();
  assert.deepEqual(await ui.sequenceFields(), profile.sequenceFields);
  await gate.release('success'); await ui.settleResponse(gate.requestId);
  await expect(ui.dialog('新建消息序列')).toBeHidden();
  const expected = JSON.parse(profile.sequenceFields.json!);
  const sequences = await qa.api.require(qa.api.get<Array<{ id: string; name: string; steps: unknown[] }>>('/api/sequences'));
  const matches = sequences.filter((s) => s.name === expected.name);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0]!.steps, expected.steps);
  await ui.page.getByLabel('消息序列', { exact: true }).selectOption(matches[0]!.id);
  await expect(ui.page.locator('.sequence-definition')).toContainText('Hello {name}');
  await ui.evidence('saved-snapshot', { submitted: expected, stored: matches[0], savingEditDisabled: true });
}
async function frozenPreview(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile): Promise<void> {
  await ui.setPrecheckContext(profile.precheckInitial); await ui.startPrecheck();
  const preview = ui.dialog('预检通过 · 确认发送内容');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(profile.groupA);
  await expect(preview).toContainText(profile.precheckInitial.sequence!);
  assert.deepEqual(await preview.locator('.preview-text').allTextContents(), ['Hello Alice', 'Next Bob']);
  await expect(preview).toContainText('管理员 / 群主');
  await expect(preview).toContainText('普通成员');
  const response = ui.page.waitForResponse((r) => new URL(r.url()).pathname === `/api/groups/${profile.groupA}/sequence-runs` && r.request().method() === 'POST');
  await preview.getByRole('button', { name: '确认启动序列', exact: true }).click();
  const actual = await response;
  assert.ok(actual.status() >= 200 && actual.status() < 300);
  const sent = actual.request().postDataJSON();
  assert.deepEqual(sent, { sequenceId: profile.precheckInitial.sequence, vars: { name: 'Alice' }, stepVars: { '2': { name: 'Bob' } } });
  const body = await actual.json();
  const run = await qa.api.sequenceRun(body.runId);
  assert.deepEqual(run.steps.map((step) => step.resolvedVars), [{ name: 'Alice' }, { name: 'Bob' }]);
  await ui.evidence('frozen-preview-submission', { groupId: profile.groupA, payload: sent, response: body, run });
}
async function startShownPreview(ui: PublicUiDriver, groupId: string): Promise<string> {
  const response = ui.page.waitForResponse((r) => new URL(r.url()).pathname === `/api/groups/${groupId}/sequence-runs` && r.request().method() === 'POST');
  await ui.dialog('预检通过 · 确认发送内容').getByRole('button', { name: '确认启动序列', exact: true }).click();
  const actual = await response;
  assert.equal(actual.status(), 201);
  return (await actual.json()).runId;
}
async function precheckOrdering(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  await ui.setPrecheckContext(profile.precheckInitial);
  const old = await ui.holdNextResponse('precheck'); await ui.startPrecheck(); await old.received;
  await ui.setPrecheckContext({ ...profile.precheckInitial, vars: '{"name":"Newer"}', stepVars: '{}' });
  const button = ui.page.getByRole('button', { name: /预检所有步骤|正在预检…/, exact: true });
  if (await button.isEnabled()) {
    const current = await ui.holdNextResponse('precheck'); await button.click(); await current.received;
    await current.release('success'); await ui.settleResponse(current.requestId);
    await expect(ui.dialog('预检通过 · 确认发送内容')).toBeVisible();
    assert.deepEqual(await ui.page.locator('.preview-text').allTextContents(), ['Hello Newer', 'Next Newer']);
    await old.release('success'); await ui.settleResponse(old.requestId);
    assert.deepEqual(await ui.page.locator('.preview-text').allTextContents(), ['Hello Newer', 'Next Newer']);
    await ui.evidence('precheck-response-order', { twoActualRequests: true, releaseOrder: [current.requestId, old.requestId], visible: 'newer payload retained' });
  } else {
    await expect(button).toBeDisabled();
    await ui.evidence('precheck-response-order', { twoActualRequests: false, premise: 'actual public submit remains disabled while first request is held', oldRequest: old.requestId, noForcedReactInvocation: true });
    await old.release('success'); await ui.settleResponse(old.requestId);
    assert.equal(await ui.canConfirmPrecheck(), false);
    await ui.startPrecheck(); await expect(ui.dialog('预检通过 · 确认发送内容')).toBeVisible();
    assert.deepEqual(await ui.page.locator('.preview-text').allTextContents(), ['Hello Newer', 'Next Newer']);
  }
  await closePreview(ui);
}
async function sequenceRuntimeRegressions(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile, group: Group): Promise<void> {
  await ui.setPrecheckContext(profile.precheckInitial); await ui.startPrecheck();
  await expect(ui.dialog('预检通过 · 确认发送内容')).toBeVisible();
  const privileged = group.members.filter((m) => ['creator', 'admin'].includes(m.role) && m.accountId).map((m) => m.accountId!);
  for (const accountId of privileged) await qa.api.require(qa.api.post(`/api/accounts/${accountId}/disconnect`));
  // A current-fact change may correctly invalidate the old preview. Re-precheck
  // in that case, recording it; either path must use runtime account truth.
  if (!await ui.canConfirmPrecheck()) {
    await ui.evidence('runtime-role-preview-invalidated', { privileged });
    await ui.startPrecheck(); await expect(ui.dialog('预检通过 · 确认发送内容')).toBeVisible();
  }
  const absentRoleRun = await startShownPreview(ui, profile.groupA);
  const absentRole = await qa.api.waitFor<SequenceRun>(`/api/sequence-runs/${absentRoleRun}`, (run) => run.status !== 'running');
  assert.deepEqual(absentRole.steps.map((step) => step.status), ['skipped', 'sent']);
  assert.deepEqual(qa.gateway.snapshot().messages.filter((m) => m.groupId === group.gatewayGroupId).map((m) => m.text), ['Next Bob']);
  await qa.api.connectAll();
  const fresh = await qa.api.createGroup();
  const text1 = `QA-delayed-${randomUUID()}`, text2 = `QA-after-${randomUUID()}`;
  const sequence = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', {
    name: 'QA runtime rate and actual-send scheduling', steps: [
      { index: 1, accountRole: 'admin', text: text1, delaySeconds: 0 },
      { index: 2, accountRole: 'member', text: text2, delaySeconds: 1 },
    ],
  }));
  qa.gateway.configure({ sendDelayMs: 700 });
  const path = `/groups/${fresh.group.gatewayGroupId}/send`;
  qa.gateway.enqueue(path, { status: 429, code: 'RATE_LIMITED', body: { retryAfterSeconds: 2 }, effect: 'none' });
  await ui.navigate(`#/sequences/${fresh.group.id}`);
  await ui.setPrecheckContext({ group: fresh.group.id, sequence: sequence.id, vars: '{}', stepVars: '{}' });
  await ui.startPrecheck(); await expect(ui.dialog('预检通过 · 确认发送内容')).toBeVisible();
  const rateRunId = await startShownPreview(ui, fresh.group.id);
  const limited = await eventually(() => qa.api.accounts(), (accounts) => accounts.some((a) => a.status === 'rate_limited'));
  const limitedAccount = limited.find((a) => a.status === 'rate_limited')!;
  const duringRate = await qa.api.sequenceRun(rateRunId);
  assert.notEqual(duringRate.steps[0]!.status, 'skipped');
  const done = await qa.api.waitFor<SequenceRun>(`/api/sequence-runs/${rateRunId}`, (run) => run.status !== 'running', { timeoutMs: 20_000 });
  assert.deepEqual(done.steps.map((step) => step.status), ['sent', 'sent']);
  const snapshot = qa.gateway.snapshot();
  const messages = snapshot.messages.filter((m) => m.groupId === fresh.group.gatewayGroupId);
  assert.deepEqual(messages.map((m) => m.text), [text1, text2]);
  assert.ok(Date.parse(messages[1]!.sentAt) - Date.parse(messages[0]!.sentAt) >= 1_000, 'second step relative wait starts after actual first send');
  const requests = snapshot.requests.filter((r) => r.method === 'POST' && r.path === path);
  assert.equal(requests.filter((r) => r.responseStatus === 429).length, 1);
  const afterLimit = requests.filter((r) => r.responseStatus !== 429 && (r.body as { accountId?: string }).accountId === limitedAccount.id);
  assert.ok(afterLimit.length > 0);
  for (const request of afterLimit) assert.ok(Date.parse(request.at) >= Date.parse(limitedAccount.rateLimitedUntil!), 'no send during actual account limit');
  await ui.evidence('runtime-role-rate-scheduling', { absentRole, privileged, limitedAccount, duringRate, done, requests, messages, configuredSendDelayMs: 700 });
  qa.gateway.configure({ sendDelayMs: 50 });
}
async function groupGuards(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile): Promise<void> {
  for (const mode of ['create', 'edit'] as const) {
    const title = mode === 'create' ? '创建群组' : '编辑群资料';
    const open = async () => {
      await ui.openGroup(profile.groupA);
      if (mode === 'create') { await ui.navigate('#/groups'); await ui.page.getByRole('button', { name: '创建群组', exact: true }).click(); }
      else await ui.page.getByRole('button', { name: '编辑资料', exact: true }).click();
      await expect(ui.dialog(title)).toBeVisible();
    };
    const close = async (action: string) => {
      if (action === 'escape') await ui.page.keyboard.press('Escape');
      else await ui.dialog(title).getByRole('button', { name: action === 'close' ? '关闭弹窗' : '取消', exact: true }).click();
    };
    for (const action of profile.closeActions) {
      await open(); await close(action); await expect(ui.dialog(title)).toBeHidden();
      await open(); await ui.dialog(title).getByLabel(/^群名称/).fill(`QA-${mode}-${randomUUID()}`);
      await close(action); await expect(ui.dialog('放弃未保存的修改？')).toBeVisible();
      await ui.cancelDiscard(); await expect(ui.dialog(title)).toBeVisible();
      await close(action); await ui.confirmDiscard(); await expect(ui.dialog(title)).toBeHidden();
    }
    await open(); await ui.dialog(title).getByLabel(/^群名称/).fill(`QA-saving-${randomUUID()}`);
    if (mode === 'create') {
      const accounts = (await qa.api.accounts()).filter((account) => account.status === 'online');
      assert.ok(accounts.length >= 2);
      await ui.dialog(title).getByLabel('群主账号', { exact: true }).selectOption(accounts[0]!.id);
      await ui.dialog(title).getByLabel('管理员账号', { exact: true }).selectOption(accounts[1]!.id);
    }
    const gate = await ui.holdNextResponse(mode === 'create' ? 'group-create' : 'group-save');
    await ui.dialog(title).getByRole('button', { name: mode === 'create' ? '创建群组' : '保存资料', exact: true }).click();
    await gate.received;
    for (const action of profile.closeActions) {
      if (action === 'cancel') await expect(ui.dialog(title).getByRole('button', { name: '取消', exact: true })).toBeDisabled();
      else await close(action);
      await expect(ui.dialog(title)).toBeVisible();
      await expect(ui.dialog(title).getByLabel(/^群名称/)).toBeDisabled();
    }
    await gate.release('success'); await expect(ui.dialog(title)).toBeHidden();
    await ui.evidence('group-close-guards', { mode, actions: profile.closeActions, checked: ['clean-close', 'dirty-continue', 'dirty-discard', 'actual-saving-window-all-close-entries'] });
  }
}
async function invalidTarget(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile, defaultFirst: boolean): Promise<void> {
  if (defaultFirst) { await ui.navigate('#/sequences'); await expect(ui.page.getByLabel('目标群组', { exact: true })).toBeVisible(); await ui.evidence('first-default', { selected: await ui.page.getByLabel('目标群组', { exact: true }).inputValue() }); }
  await ui.navigate(`#/sequences/${encodeURIComponent(profile.groupA)}`);
  await ui.setPrecheckContext(profile.precheckInitial);
  const result = await qa.api.post<{ jobId: string }>(`/api/groups/${profile.groupA}/leave-all`);
  if (result.status !== 202) throw new BlockedError(`Owned target invalidation public operation unavailable: HTTP ${result.status}`);
  await qa.api.waitJob(result.body.jobId);
  await qa.api.waitFor<Group>(`/api/groups/${profile.groupA}`, (g) => g.status === 'left');
  await expect(ui.page.getByRole('button', { name: '预检所有步骤', exact: true })).toBeDisabled();
  assert.equal(await ui.page.getByLabel('目标群组', { exact: true }).inputValue(), profile.groupA);
  await ui.page.reload({ waitUntil: 'domcontentloaded' });
  await expect(ui.page.getByLabel('目标群组', { exact: true })).toHaveValue(profile.groupA);
  await expect(ui.page.getByRole('button', { name: '预检所有步骤', exact: true })).toBeDisabled();
  assert.notEqual(await ui.page.getByLabel('目标群组', { exact: true }).inputValue(), profile.groupB);
}
async function navigateUnsafe(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  const variants = ['', '?from=', '?from=unknown&group=invalid', '?from=https%3A%2F%2Fexample.invalid&returnTo=https%3A%2F%2Fexample.invalid', '?from=groups&group=%ZZ', '?from=groups&group=missing&context=forged'];
  for (const suffix of variants) {
    await ui.navigate(`#/agent-runs/${encodeURIComponent(profile.runId)}${suffix}`);
    await expect(ui.page.locator('a.back-link')).toBeVisible();
    const link = await ui.page.locator('a.back-link').getAttribute('href');
    assert.ok(link?.startsWith('#/'));
    await ui.returnToSource();
    assert.equal(new URL(ui.page.url()).origin, new URL(ui.options.baseUrl).origin);
    assert.equal((await ui.location()).kind, 'run-list');
    await ui.evidence('safe-origin-fallback', { suffix, href: link, returned: await ui.location() });
  }
}
async function navigationRefresh(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  for (const origin of ['group', 'run-list'] as const) {
    await openOrigin(ui, profile, origin);
    const detailUrl = ui.page.url();
    await ui.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(ui.page.locator('a.back-link')).toBeVisible();
    await ui.returnToSource(); await assertOrigin(ui, origin, profile.groupA);
    await ui.page.goBack(); await expect(ui.page).toHaveURL(detailUrl);
    await ui.page.goForward(); await assertOrigin(ui, origin, profile.groupA);
    await ui.evidence('refresh-history-origin', { origin, detailUrl, returned: await ui.location() });
  }
}
async function obsoleteSession(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  for (const origin of ['group', 'run-list', 'direct'] as const) for (const role of ['viewer', 'admin'] as const) {
    await ui.login('admin', 'old');
    if (origin === 'direct') await ui.navigate(`#/agent-runs/${profile.runId}`);
    else await openOrigin(ui, profile, origin);
    const oldHash = new URL(ui.page.url()).hash;
    await ui.login(role, `new-${role}`);
    // Re-enter exactly the historical public URL under a real new login. This
    // preserves stale hints rather than manufacturing a private state object.
    await ui.navigate(oldHash);
    await expect(ui.page.locator('a.back-link')).toBeVisible();
    await expect(ui.page.locator('nav a.active')).toHaveText('Agent 运行');
    await ui.returnToSource();
    assert.equal((await ui.location()).kind, 'run-list');
    await ui.evidence('old-login-origin-rejected', { origin, role, oldHash, returned: await ui.location() });
    await ui.page.goBack(); await expect(ui.page.locator('a.back-link')).toBeVisible();
    await ui.returnToSource(); assert.equal((await ui.location()).kind, 'run-list');
  }
}
async function expiryColdStart(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  for (const origin of ['group', 'run-list', 'direct'] as const) {
  if (origin === 'direct') await ui.navigate(`#/agent-runs/${profile.runId}`);
  else await openOrigin(ui, profile, origin);
  const oldUrl = ui.page.url();
  await ui.page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(ui.page.getByPlaceholder('输入用户名')).toBeVisible();
  const refresh = ui.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/refresh');
  await ui.page.goto(oldUrl, { waitUntil: 'domcontentloaded' });
  assert.equal((await refresh).status(), 401);
  await ui.login('admin', 'after-actual-refresh-401');
  await expect(ui.page.locator('a.back-link')).toBeVisible();
  await ui.returnToSource(); assert.equal((await ui.location()).kind, 'run-list');
  await ui.evidence('cold-start-revoked-refresh', { origin, oldUrl, actualRefreshStatus: 401, returned: await ui.location() });
  }
}
async function meFailure(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  for (const origin of ['group', 'run-list', 'direct'] as const) {
  if (origin === 'direct') await ui.navigate(`#/agent-runs/${profile.runId}`);
  else await openOrigin(ui, profile, origin);
  const oldUrl = ui.page.url();
  await ui.page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(ui.page.getByPlaceholder('输入用户名')).toBeVisible();
  const gate = await ui.holdNextResponse('identity-read');
  await ui.page.getByPlaceholder('输入用户名').fill('admin');
  await ui.page.getByPlaceholder('输入密码').fill('admin');
  const login = ui.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/login');
  await ui.page.getByRole('button', { name: '进入工作台', exact: true }).click();
  assert.equal((await login).status(), 200); await gate.received;
  assert.equal(await ui.page.getByRole('button', { name: '退出登录', exact: true }).isVisible(), false);
  await gate.release('unknown'); await ui.paint();
  await ui.page.goto(oldUrl, { waitUntil: 'domcontentloaded' });
  await expect(ui.page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
  await expect(ui.page.locator('a.back-link')).toBeVisible();
  await ui.returnToSource(); assert.equal((await ui.location()).kind, 'run-list');
  await ui.evidence('login-me-failure-recovered', { origin, realLoginStatus: 200, identityReadTransportAborted: true, returned: await ui.location() });
  }
}
async function storageWriteFailure(ui: PublicUiDriver, profile: UiProfile): Promise<void> {
  // Fault limited to the published navigation context key, not all storage.
  // Observe it from the browser's own namespace and refuse a guessed empty set.
  const keys = await ui.page.evaluate(() => Object.keys(sessionStorage).filter((key) => /agent.*navigation|navigation.*agent/i.test(key)));
  if (keys.length !== 1) throw new BlockedError(`Navigation storage fault key not uniquely observed (${keys.length})`);
  await ui.page.addInitScript((keys: string[]) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (this === window.sessionStorage && keys.includes(key)) throw new DOMException('QA navigation write failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  }, keys);
  await ui.page.reload({ waitUntil: 'domcontentloaded' });
  await ui.openRunFromGroup(profile.groupA, profile.runId);
  await ui.page.reload({ waitUntil: 'domcontentloaded' });
  await expect(ui.page.locator('a.back-link')).toBeVisible();
  await ui.returnToSource();
  const groupReturned = await ui.location();
  assert.ok(groupReturned.kind === 'group' || groupReturned.kind === 'run-list');
  if (groupReturned.kind === 'group') assert.equal(groupReturned.groupId, profile.groupA);
  for (const group of [profile.groupA, profile.groupB]) {
    await ui.navigate('#/agent-runs');
    await ui.page.getByLabel('查看群组', { exact: true }).selectOption(group);
    await expect(ui.page.locator('a.run-list-item')).not.toHaveCount(0);
    await ui.page.locator('a.run-list-item').first().click();
    await expect(ui.page.locator('a.back-link')).toBeVisible();
    await ui.returnToSource();
    assert.equal(new URL(ui.page.url()).origin, new URL(ui.options.baseUrl).origin);
    assert.equal((await ui.location()).kind, 'run-list');
  }
  await ui.evidence('navigation-storage-write-failure', { keys, realNativeException: 'QuotaExceededError', groups: [profile.groupA, profile.groupB] });
}
async function entityAttention(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile, groups: [Group, Group]): Promise<void> {
  const barriers = [`qa-attention-a-${randomUUID()}`, `qa-attention-b-${randomUUID()}`];
  const summaries = [`QA final A ${randomUUID()}`, `QA final B ${randomUUID()}`];
  const runIds: string[] = [];
  let peer: PublicUiDriver | undefined, background: Page | undefined;
  let primary: unknown;
  try {
    for (const [index, group] of groups.entries()) {
      qa.agent.enqueueTurns({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: summaries[index] }] }, barrier: { name: barriers[index]!, phase: 'before-response' } });
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
      qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: `qa-attention-${index}`, text: `QA entity ${index}` });
      await qa.agent.barriers.waitFor(barriers[index]!, 10_000);
      const runs = await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`));
      const running = runs.filter((run) => run.status === 'running');
      assert.equal(running.length, 1); runIds.push(running[0]!.id);
    }
    await ui.openRunFromGroup(profile.groupA, runIds[0]!);
    const second = await ui.page.context().newPage();
    peer = await PublicUiDriver.attach({ page: second, baseUrl: ui.options.baseUrl, outputDir: resolve(ui.options.outputDir, 'peer-entity'), allowedOrigins: qa.allowedBrowserOrigins });
    await peer.login('admin', 'independent-peer-page'); await peer.openRunFromGroup(profile.groupB, runIds[1]!);
    if (second.context().browser()?.browserType().name() === 'chromium') {
      const cdp = await second.context().newCDPSession(second);
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await cdp.detach();
    }
    const quietA = await ui.page.title(), quietB = await second.title();
    background = await nativeBackgroundTab(ui.page, { record: (facts) => ui.evidence('browser-native-focus', facts) });
    const focus = await Promise.all([ui.page, second].map((page) => page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState }))));
    if (focus.some((state) => state.focused)) throw new BlockedError('Both entity pages must actually lack native browser focus before emitting their updates');
    for (const barrier of barriers) qa.agent.barriers.release(barrier);
    for (const runId of runIds) await qa.api.waitFor<AgentRun>(`/api/agent-runs/${runId}`, (run) => run.status !== 'running');
    await expect(ui.page).not.toHaveTitle(quietA); await expect(second).not.toHaveTitle(quietB);
    const pendingB = await second.title();
    await ui.page.bringToFront();
    await expect(ui.page.getByText(summaries[0]!, { exact: true }).first()).toBeVisible();
    await ui.page.getByText(summaries[0]!, { exact: true }).first().click();
    // A may include a separate status region. Use its actual advertised scope
    // confirmation only after opening and observing the summary.
    const refresh = ui.page.locator('.attention-notice > button');
    if (await refresh.isVisible()) {
      await refresh.click();
      await expect(ui.page.locator('.attention-summary')).toBeVisible();
      await ui.page.getByRole('button', { name: '确认当前范围更新', exact: true }).click();
    }
    await expect(ui.page).toHaveTitle(quietA);
    await expect(second).toHaveTitle(pendingB);
    await ui.returnToSource(); await assertOrigin(ui, 'group', profile.groupA);
    await expect(second).toHaveTitle(pendingB);
    await second.bringToFront();
    await second.getByText(summaries[1]!, { exact: true }).first().click();
    const peerRefresh = second.locator('.attention-notice > button');
    if (await peerRefresh.isVisible()) {
      await peerRefresh.click(); await expect(second.locator('.attention-summary')).toBeVisible();
      await second.getByRole('button', { name: '确认当前范围更新', exact: true }).click();
    }
    await expect(second).toHaveTitle(quietB);
    await peer.returnToSource(); await assertOrigin(peer, 'group', profile.groupB);
    await ui.evidence('entity-attention-isolation', { runIds, groups: groups.map((g) => g.id), summaries, quietA, quietB, pendingB, focus, checked: ['A own acknowledgment', 'A return source', 'B pending remains', 'B own acknowledgment'], realHumanFocusSigned: false });
    peer.assertHealthy();
  } catch (error) { primary = error; throw error; }
  finally {
    for (const barrier of barriers) qa.agent.barriers.release(barrier);
    const errors: unknown[] = [];
    for (const cleanup of [() => background?.close(), () => peer?.close(), () => peer?.page.close()]) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) {
      await ui.evidence('entity-attention-cleanup-errors', { primary: primary ? String(primary) : null, errors: errors.map(String) });
      if (!primary) throw new AggregateError(errors, 'Entity attention cleanup failed');
    }
  }
}
async function deliveryC3(ui: PublicUiDriver, qa: QaEnvironment, profile: UiProfile, group: Group): Promise<void> {
  const toolId = `qa-c3-${randomUUID()}`, text = `QA C3 actual send ${randomUUID()}`, summary = `QA C3 done ${randomUUID()}`;
  const raw = 'QA_C3_BAD_RAW_RESPONSE';
  qa.agent.enqueueTurns(
    { rawBody: raw },
    { body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: toolId, name: 'send_message', input: { text, idempotency_key: toolId } }] } },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: summary }] } },
  );
  qa.agent.enqueueAudits({ body: { verdict: 'pass' } });
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'qa-c3-outsider', text: 'QA C3 trigger' });
  const list = await eventually(() => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)), (runs) => runs.length > 0);
  const run = await qa.api.waitFor<AgentRun>(`/api/agent-runs/${list[0]!.id}`, (value) => value.status !== 'running');
  assert.equal(run.status, 'finished');
  assert.ok(run.steps.some((step) => step.kind === 'protocol_error' && step.errorCode === 'BAD_JSON'));
  assert.ok(run.steps.some((step) => step.toolUseId === toolId && step.name === 'send_message' && step.auditVerdict === 'pass'));
  assert.equal(qa.gateway.snapshot().messages.filter((m) => m.groupId === group.gatewayGroupId && m.text === text).length, 1);
  for (const role of ['admin', 'viewer'] as const) {
    await ui.login(role, `c3-${role}`); await ui.openGroup(profile.groupA);
    if (role === 'viewer') {
      await expect(ui.page.getByRole('button', { name: '发送消息', exact: true })).toBeHidden();
      await expect(ui.page.getByRole('button', { name: '编辑资料', exact: true })).toBeHidden();
    }
    await ui.page.locator('a.run-list-item').filter({ hasText: run.id }).click();
    await expect(ui.page.getByRole('heading', { name: '运行详情', exact: true })).toBeVisible();
    assert.ok(decodeURIComponent(ui.page.url()).includes(run.id));
    const articles = ui.page.locator('.agent-step'); await expect(articles).toHaveCount(run.steps.length);
    for (const [index, step] of run.steps.entries()) {
      const article = articles.nth(index);
      if (step.name) await expect(article).toContainText(step.name);
      if (step.toolUseId) await expect(article).toContainText(step.toolUseId);
      if (step.errorCode) await expect(article).toContainText(step.errorCode);
      if (step.resultSummary) await expect(article).toContainText(step.resultSummary);
      if (step.auditVerdict) await expect(article.locator('.audit-result')).toContainText(step.auditVerdict === 'pass' ? '通过' : step.auditVerdict);
      if (step.input !== null) assert.deepEqual(JSON.parse(await article.locator('.agent-step-body pre').first().innerText()), step.input);
      if (step.rawResponse) {
        await article.locator('details.raw-response > summary').click();
        assert.equal(await article.locator('details.raw-response pre').innerText(), step.rawResponse);
      }
    }
    await expect(ui.page.locator('body')).toContainText(raw);
    await ui.evidence(`c3-${role}-api-ui-correspondence`, { reference: 'UI-008, first-round QA tests/ui/console.spec.ts; re-executed on current frozen SUT', run, role, actualSendText: text });
  }
}

/** Root owns environment start/stop and frozen authorization. Each call uses a
 * fresh context, real public setup and captures first failure before cleanup. */
export async function runUiCase(id: string, input: UiCaseInput): Promise<UiCaseResult> {
  if (id !== 'SR-BE-DEL-006' && !/^SR-UI-0(?:0[1-9]|1[0-9]|2[0-9])$/.test(id)) throw new Error(`Unknown UI case ${id}`);
  const { qa, browser, outputDir } = input;
  await mkdir(outputDir, { recursive: true });
  const setup = await fixture(qa, id), { profile, groups } = setup;
  await qa.startWeb();
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  const allowedOrigins = [...qa.allowedBrowserOrigins];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (allowedBrowserOrigin(url, allowedOrigins)) await route.continue();
    else {
      try { await qa.recordHttp({ kind: 'browser-egress-blocked', transport: 'http', url }); }
      finally { await route.abort('blockedbyclient'); }
    }
  });
  await context.routeWebSocket(/.*/, async (socket) => {
    const url = socket.url();
    if (allowedBrowserOrigin(url, allowedOrigins)) socket.connectToServer();
    else {
      try { await qa.recordHttp({ kind: 'browser-egress-blocked', transport: 'websocket', url }); }
      finally { await socket.close({ code: 1008, reason: 'QA isolation: foreign WebSocket origin' }); }
    }
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  const ui = await PublicUiDriver.attach({ page, baseUrl: qa.webUrl, outputDir, allowedOrigins,
    beforeFetch: id === 'SR-UI-006' ? async (kind) => { if (kind === 'send') await qa.interruptDatabase(); } : undefined,
    afterFetch: id === 'SR-UI-006' ? async (kind) => { if (kind === 'send') await qa.restoreDatabase(); } : undefined,
  });
  const checks: string[] = [];
  let primary: unknown;
  try {
    await ui.login('admin', 'case-initial');
    const numeric = Number(id.slice(-3));
    if (id === 'SR-BE-DEL-006') { await deliveryC3(ui, qa, profile, groups[0]); checks.push('C3-reexec-UI008-admin-viewer-actual-tool-audit-protocol-raw'); }
    else if (numeric <= 7) {
      const variants = ['unchanged', 'edited', 'aba', 'group', 'session', 'failure', 'unknown'] as const;
      await protectLateDraft(ui, profile, variants[numeric - 1]!);
      if (numeric !== 6) {
        const actual = await eventually(async () => qa.gateway.snapshot(), (snapshot) => snapshot.messages.some((m) => m.groupId === groups[0].gatewayGroupId && m.text === 'A'));
        const delivered = actual.messages.filter((m) => m.groupId === groups[0].gatewayGroupId && m.text === 'A');
        assert.equal(delivered.length, 1, 'exactly one physical delivery to the original group');
        assert.equal(actual.messages.filter((m) => m.groupId === groups[1].gatewayGroupId).length, 0, 'late receipt cannot move the send to another group');
        const sends = actual.requests.filter((r) => r.method === 'POST' && r.path === `/groups/${groups[0].gatewayGroupId}/send`);
        assert.equal(sends.length, 1);
        await ui.evidence('actual-send-effects', { delivered, sends });
      } else {
        assert.equal(qa.gateway.snapshot().messages.filter((m) => m.groupId === groups[0].gatewayGroupId).length, 0);
      }
      checks.push(`actual-send-draft-${variants[numeric - 1]}`);
    } else if (numeric === 8) { await protectSequenceClose(ui, profile); checks.push('dirty-saving-all-close-entries'); }
    else if (numeric === 9) { await savedSnapshot(ui, qa, profile); checks.push('saving-disabled-and-public-stored-snapshot'); }
    else if (numeric === 10) { await groupGuards(ui, qa, profile); checks.push('create-edit-clean-dirty-saving-close-entries'); }
    else if (numeric >= 11 && numeric <= 14) {
      const dimensions = numeric === 14 ? ['group', 'sequence', 'vars', 'stepVars'] : [numeric === 11 ? 'group' : numeric === 12 ? 'sequence' : 'vars'];
      for (const field of dimensions) {
        const changed = field === 'group' ? profile.groupB : field === 'sequence' ? setup.secondSequence! : field === 'vars' ? '{"name":"Changed"}' : '{"2":{"name":"Changed"}}';
        await invalidateLatePrecheck(ui, { ...profile, precheckChanged: { ...profile.precheckInitial, [field]: changed } }, numeric === 14);
        checks.push(`late-precheck-${field}${numeric === 14 ? '-aba' : ''}`);
      }
      if (numeric === 14) { await precheckOrdering(ui, profile); checks.push('actual-public-request-order-or-observed-submit-exclusion'); }
      await ui.setPrecheckContext(profile.precheckInitial); await ui.startPrecheck();
      await expect(ui.dialog('预检通过 · 确认发送内容')).toBeVisible(); await closePreview(ui);
      checks.push('new-current-precheck-remains-usable');
    } else if (numeric === 15) { await frozenPreview(ui, qa, profile); checks.push('frozen-summary-actual-payload-and-public-run'); }
    else if (numeric === 16 || numeric === 17) { await invalidTarget(ui, qa, profile, numeric === 17); checks.push('invalid-target-no-silent-default'); }
    else if (numeric === 18) { await sequenceRuntimeRegressions(ui, qa, profile, groups[0]); checks.push('runtime-role-absence-429-and-actual-send-relative-delay'); }
    else if (numeric === 25) {
      await entityAttention(ui, qa, profile, groups);
      checks.push('actual-agent-entity-attention-native-browser-tabs');
    } else if (numeric === 19 || numeric === 20) {
      const origin = numeric === 19 ? 'group' : 'run-list';
      await returnToOrigin(ui, profile, origin); await assertOrigin(ui, origin, profile.groupA); checks.push(`return-${origin}`);
    } else if (numeric === 21) {
      for (const origin of ['group', 'run-list'] as const) {
        await openOrigin(ui, profile, origin);
        const location = await ui.location();
        assert.equal(location.activeNavigation, origin === 'group' ? '群组工作台' : 'Agent 运行');
        assert.ok(location.title.includes(origin === 'group' ? '群' : 'Agent'));
        await page.getByRole('link', { name: '查看所属群', exact: true }).click();
        await assertOrigin(ui, 'group', profile.groupA);
      }
      checks.push('two-origins-title-highlight-view-group');
    } else if (numeric === 22) { await navigateUnsafe(ui, profile); checks.push('six-direct-invalid-origins'); }
    else if (numeric === 23) { await navigationRefresh(ui, profile); checks.push('both-origins-refresh-back-forward'); }
    else if (numeric === 24) {
      await ui.navigate(`#/agent-runs/qa-does-not-exist?from=groups&group=${encodeURIComponent(profile.groupA)}`);
      await expect(page.getByText('未能读取运行记录', { exact: true })).toBeVisible();
      await ui.returnToSource(); assert.equal((await ui.location()).kind, 'run-list');
      await ui.login('viewer', 'error-page-new-role');
      await ui.navigate(`#/agent-runs/${profile.runId}`);
      await expect(page.locator('a.back-link')).toBeVisible(); await ui.returnToSource();
      assert.equal((await ui.location()).kind, 'run-list'); checks.push('actual-404-and-viewer-can-leave');
      const gate = await ui.holdNextResponse('run-read');
      await ui.navigate(`#/agent-runs/${profile.runId}`); await gate.received;
      await expect(page.locator('a.back-link')).toBeVisible(); await ui.returnToSource();
      await gate.release('success'); assert.equal((await ui.location()).kind, 'run-list'); checks.push('held-real-detail-response-can-leave');
    } else if (numeric === 26) { await obsoleteSession(ui, profile); checks.push('two-origins-admin-viewer-old-history'); }
    else if (numeric === 27) { await expiryColdStart(ui, profile); checks.push('cold-start-actual-refresh-401-safe-relogin'); }
    else if (numeric === 28) { await meFailure(ui, profile); checks.push('actual-login-200-lost-me-recovery'); }
    else if (numeric === 29) { await storageWriteFailure(ui, profile); checks.push('navigation-write-failure-two-groups'); }
    ui.assertHealthy();
    await ui.evidence('case-complete', { id, checks, automatedScope: true, humanImeFocusSigned: false });
    return { caseId: id, checks, productExecution: true };
  } catch (error) {
    primary = error; await ui.evidence('first-failure', { id, checks, error: String(error) }); throw error;
  } finally {
    const errors: unknown[] = [];
    for (const cleanup of [() => qa.restoreDatabase(), () => ui.close(), () => context.tracing.stop({ path: resolve(outputDir, 'trace.zip') }), () => context.close()]) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) {
      await qa.evidence('ui-cleanup-errors', { id, primary: primary ? String(primary) : null, errors: errors.map(String) });
      if (!primary) throw new AggregateError(errors, 'UI cleanup failure');
    }
  }
}
