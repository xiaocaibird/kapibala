import type { Page, Locator, Request } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun, Group } from '../../harness/platform-client.js';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page, qa }, info) => {
  if (page.isClosed()) {
    await qa.evidence('ui-final', {
      closed: true,
      pageErrors: pageErrors.get(page) ?? [],
      captureLimitation: '页面已关闭，无法补拍最终画面',
    });
    return;
  }
  const alerts = await page.locator('[role="alert"],[aria-live="assertive"]').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          box.width > 0 &&
          box.height > 0
        );
      })
      .map((node) => node.textContent?.slice(0, 1000) ?? ''),
  );
  await qa.evidence('ui-final', {
    url: page.url(),
    title: await page.title(),
    visibleAlerts: alerts,
    visibleTextExcerpt: (await page.locator('body').innerText()).slice(0, 8000),
    pageErrors: pageErrors.get(page) ?? [],
  });
  const path = info.outputPath('evidence', 'ui-final.png');
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true, animations: 'disabled', timeout: 10000 });
  await info.attach('ui-final-screenshot', { path, contentType: 'image/png' });
  await info.attach('ui-final-state', {
    path: info.outputPath('evidence', 'ui-final.json'),
    contentType: 'application/json',
  });
});

function element(page: Page, qa: QaEnvironment, key: string): Locator {
  const selector = qa.config.ui.selectors[key];
  if (!selector) throw new BlockedError(`UI适配缺少${key}；通过可见页面确认定位后重跑`);
  return page.locator(selector);
}
async function go(page: Page, qa: QaEnvironment, route: string, id?: string): Promise<void> {
  const path = qa.config.ui.routes[route];
  if (!path) throw new BlockedError(`UI路由适配缺少${route}`);
  await page.goto(`${qa.webUrl}${path.replace('{id}', encodeURIComponent(id ?? ''))}`, {
    waitUntil: 'domcontentloaded',
  });
}
async function login(
  page: Page,
  qa: QaEnvironment,
  role: 'admin' | 'viewer' = 'admin',
): Promise<void> {
  if (!qa.config.ui.adapterConfirmed)
    throw new BlockedError('尚未根据被测页面确认UI定位适配；模板不是实现事实');
  await qa.startWeb();
  await go(page, qa, 'login');
  await element(page, qa, 'username').fill(role);
  await element(page, qa, 'password').fill(role);
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
  );
  await element(page, qa, 'login').click();
  expect((await response).status()).toBe(200);
  await expect(element(page, qa, 'username')).toBeHidden();
}
/** A negative assertion must survive a declared observation window, not pass before delivery. */
async function remains(check: () => Promise<void>, durationMs = 1_000): Promise<void> {
  const until = performance.now() + durationMs;
  do {
    await check();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  } while (performance.now() < until);
  await check();
}
function card(page: Page, qa: QaEnvironment, text: string): Locator {
  return element(page, qa, 'directoryItem').filter({ hasText: text });
}
function child(locator: Locator, qa: QaEnvironment, key: string): Locator {
  const selector = qa.config.ui.selectors[key];
  if (!selector) throw new BlockedError(`UI适配缺少卡片内${key}`);
  return locator.locator(selector);
}
function directoryRequest(request: Request): boolean {
  return new URL(request.url()).pathname === '/api/group-directory' && request.method() === 'GET';
}
async function backgroundTab(page: Page): Promise<Page> {
  const other = await page.context().newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  if (await page.evaluate(() => document.hasFocus())) {
    await other.close();
    throw new BlockedError('浏览器未建立真实标签失焦；需要有头环境复验，禁止伪造visibility/focus');
  }
  return other;
}
async function favicon(page: Page): Promise<string> {
  return page.evaluate(async () =>
    JSON.stringify(
      await Promise.all(
        Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map(
          async (link) => {
            const response = await fetch(link.href);
            return Array.from(new Uint8Array(await response.arrayBuffer()));
          },
        ),
      ),
    ),
  );
}
async function prepare(qa: QaEnvironment): Promise<Group> {
  await qa.api.login();
  return (await qa.api.createGroup()).group;
}
function incoming(qa: QaEnvironment, group: Group, text: string) {
  return qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'external-ui',
    text,
  });
}
async function run(qa: QaEnvironment, group: Group): Promise<AgentRun> {
  const runs = await qa.api.waitFor<AgentRun[]>(
    `/api/groups/${group.id}/agent-runs`,
    (items) => items.length > 0 && items[0]!.status !== 'running',
  );
  return qa.api.agentRun(runs[0]!.id);
}
async function createSequence(qa: QaEnvironment) {
  return qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'QA变量序列',
      steps: [
        { index: 1, accountRole: 'admin', text: '{event} 在 {place}', delaySeconds: 1 },
        { index: 2, accountRole: 'member', text: '{event} 在 {place}', delaySeconds: 1 },
      ],
    }),
  );
}
async function fillVars(
  page: Page,
  qa: QaEnvironment,
  key: string,
  value: Record<string, unknown>,
) {
  const selector = qa.config.ui.selectors[key];
  if (!selector) throw new BlockedError(`UI缺少${key}`);
  if (selector.includes('{key}')) {
    for (const [name, v] of Object.entries(value)) {
      if (typeof v === 'object' && v !== null)
        for (const [nested, nv] of Object.entries(v))
          await page
            .locator(selector.replace('{step}', name).replace('{key}', nested))
            .fill(String(nv));
      else await page.locator(selector.replace('{key}', name)).fill(String(v));
    }
  } else await page.locator(selector).fill(JSON.stringify(value));
}

test('[UI-001] viewer通过浏览器登录且各页无写入口 @compat', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa, 'viewer');
  for (const route of ['accounts', 'groups', 'group']) {
    await go(page, qa, route, group.id);
    await expect(page.locator('body')).not.toContainText('UNAUTHORIZED');
    if (route === 'accounts')
      await expect(element(page, qa, 'accountRow')).toHaveCount((await qa.api.accounts()).length);
    else if (route === 'groups') await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
    else await expect(page.locator('body')).toContainText(/群主|creator/);
    await remains(async () => {
      for (const name of [/^断开连接$/, /^释放账号$/, /^重连$/, /^创建群$/, /^编辑资料$/, /^启动$/])
        expect(await page.getByRole('button', { name }).count()).toBe(0);
    }, 500);
  }
});
test('[UI-002] 账号状态实时显示且操作符合当前状态', async ({ qa, page }) => {
  await qa.api.login();
  const accounts = await qa.api.accounts();
  await login(page, qa);
  await go(page, qa, 'accounts');
  await expect(element(page, qa, 'accountRow')).toHaveCount(accounts.length);
  await expect(page.getByRole('button', { name: '断开连接', exact: true })).toHaveCount(0);
  await qa.api.require(qa.api.post(`/api/accounts/${accounts[0]!.id}/connect`));
  await expect(page.getByRole('button', { name: '断开连接', exact: true })).toHaveCount(1);
  qa.gateway.emitStatus(accounts[0]!.id, 'suspended');
  await expect(page.locator('body')).toContainText(/停用|suspended/);
  await expect(page.getByRole('button', { name: '断开连接', exact: true })).toHaveCount(0);
});
test('[UI-003] 群详情显示角色和实时消息，回流不重复 @compat', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/群主|creator/);
  await expect(page.locator('body')).toContainText('群管理员');
  const event = incoming(qa, group, 'UI唯一外部消息');
  qa.gateway.deliver(event.eventId, { repeat: 2 });
  await expect(page.getByText('UI唯一外部消息', { exact: true })).toHaveCount(1);
  await qa.api.send(group.id, group.creatorAccountId, 'UI自己发送消息');
  await qa.api.waitFor<{ items: { text: string; deliveryStatus: string }[] }>(
    `/api/groups/${group.id}/messages`,
    (r) => r.items.some((m) => m.text === 'UI自己发送消息' && m.deliveryStatus === 'sent'),
  );
  await expect(page.getByText('UI自己发送消息', { exact: true })).toHaveCount(1);
  await remains(async () => {
    expect(await page.getByText('UI唯一外部消息', { exact: true }).count()).toBe(1);
    expect(await page.getByText('UI自己发送消息', { exact: true }).count()).toBe(1);
  });
});
test('[UI-004] 自发消息展示accepted到sent且保持一行', async ({ qa, page }) => {
  const group = await prepare(qa);
  qa.gateway.configure({ sendDelayMs: 1800 });
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await qa.api.send(group.id, group.creatorAccountId, 'UI待确认状态');
  const row = element(page, qa, 'messageRow').filter({ hasText: 'UI待确认状态' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/accepted|已受理/);
  await expect(row).toContainText(/sent|已发送/);
  await expect(row).toHaveCount(1);
});
test('[UI-005] 加载更早与实时新增按消息身份合并', async ({ qa, page }) => {
  const group = await prepare(qa);
  for (let i = 0; i < 65; i++)
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      senderPlatformUserId: 'external-ui',
      text: `history-${i}`,
      sentAt: new Date(Date.now() - 100000 + i).toISOString(),
    });
  await qa.api.waitFor<{ items: unknown[] }>(
    `/api/groups/${group.id}/messages?limit=50`,
    (r) => r.items.length === 50,
  );
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await element(page, qa, 'loadEarlier').click();
  incoming(qa, group, 'live-after-pagination');
  for (let i = 0; i < 65; i++)
    await expect(page.getByText(`history-${i}`, { exact: true })).toHaveCount(1);
  await expect(page.getByText('live-after-pagination', { exact: true })).toHaveCount(1);
});
test('[UI-006] 浏览器断线恢复后3秒内补齐 @compat', async ({ qa, page, context }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/群主|creator/);
  await context.setOffline(true);
  incoming(qa, group, 'offline-first');
  incoming(qa, group, 'offline-second');
  await context.setOffline(false);
  const start = performance.now();
  await expect(page.getByText('offline-first', { exact: true })).toHaveCount(1, { timeout: 3000 });
  await expect(page.getByText('offline-second', { exact: true })).toHaveCount(1, {
    timeout: Math.max(1, 3000 - (performance.now() - start)),
  });
  expect(performance.now() - start).toBeLessThanOrEqual(3000);
});
test('[UI-007] 审计阻断在群运行列表醒目可见', async ({ qa, page }) => {
  const group = await prepare(qa);
  qa.agent.enqueueTurns({
    body: {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'ui-block',
          name: 'send_message',
          input: { text: '不可发送', idempotency_key: 'ui-block' },
        },
      ],
    },
  });
  qa.agent.enqueueAudits({ status: 500 }, { rawBody: 'invalid' }, { body: { verdict: 'unknown' } });
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  incoming(qa, group, '触发审计阻断');
  const result = await run(qa, group);
  expect(result.status).toBe('blocked');
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/blocked|已阻断|审计阻断/);
  await expect(page.locator('body')).toContainText(/audit_blocked|审计/);
});
test('[UI-008] 登录到群再到Agent步骤，错误原文和审计结果可读 @compat', async ({ qa, page }) => {
  const group = await prepare(qa);
  qa.agent.enqueueTurns(
    { rawBody: 'QA_BAD_RAW_RESPONSE' },
    {
      body: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'ui-send',
            name: 'send_message',
            input: { text: 'UI审核文本', idempotency_key: 'ui-send' },
          },
        ],
      },
    },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'UI完成摘要' }] } },
  );
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  incoming(qa, group, '触发详情');
  const result = await run(qa, group);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await element(page, qa, 'runLink').first().click();
  await expect(page).toHaveURL((url) => decodeURIComponent(url.href).includes(result.id));
  for (const text of ['send_message', 'UI审核文本', 'BAD_JSON', 'UI完成摘要'])
    await expect(page.locator('body')).toContainText(text);
  await expect(page.locator('body')).toContainText(/protocol_error|协议错误/);
  await expect(page.locator('body')).toContainText(/tool_use|工具调用/);
  await expect(page.locator('body')).toContainText(/pass|通过/);
  const toggle = element(page, qa, 'rawResponseToggle');
  if (await toggle.count()) await toggle.first().click();
  await expect(page.locator('body')).toContainText('QA_BAD_RAW_RESPONSE');
});
test('[UI-009] 序列预检展示继承与来源，确认后才启动', async ({ qa, page }) => {
  const group = await prepare(qa);
  const sequence = await createSequence(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  // The public console exposes sequence configuration on its own page.
  await element(page, qa, 'navSequences').click();
  await element(page, qa, 'sequenceGroup').selectOption(group.id);
  let starts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/groups/${group.id}/sequence-runs`
    )
      starts++;
  });
  await element(page, qa, 'sequence').selectOption(sequence.id);
  await fillVars(page, qa, 'sequenceVars', { event: '验收活动', place: 'A室' });
  await fillVars(page, qa, 'sequenceStepVars', { '2': { place: 'B室' } });
  await element(page, qa, 'previewSequence').click();
  const dialog = element(page, qa, 'sequencePreview');
  await expect(dialog).toBeVisible();
  for (const text of ['验收活动', 'A室', 'B室']) await expect(dialog).toContainText(text);
  await expect(dialog).toContainText(/default|默认/);
  await expect(dialog).toContainText(/step:2|第\s*2\s*步/);
  await remains(async () => {
    expect(starts).toBe(0);
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
  }, 1500);
  await element(page, qa, 'startSequence').click();
  await expect.poll(() => starts).toBe(1);
  await expect(page.locator('body')).toContainText(/运行|running|进度/);
  await expect.poll(() => qa.gateway.snapshot().messages.length, { timeout: 10000 }).toBe(2);
});
test('[UI-010] 序列预检缺值显示步骤与key且零发送', async ({ qa, page }) => {
  const group = await prepare(qa);
  const sequence = await createSequence(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  // The public console exposes sequence configuration on its own page.
  await element(page, qa, 'navSequences').click();
  await element(page, qa, 'sequenceGroup').selectOption(group.id);
  let starts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/groups/${group.id}/sequence-runs`
    )
      starts++;
  });
  await element(page, qa, 'sequence').selectOption(sequence.id);
  await fillVars(page, qa, 'sequenceVars', { event: '缺位置' });
  await element(page, qa, 'previewSequence').click();
  const error = element(page, qa, 'sequencePreviewError');
  await expect(error).toBeVisible();
  await expect(child(error, qa, 'sequenceErrorStepIndex')).toContainText(/(^|\D)1(\D|$)/);
  await expect(child(error, qa, 'sequenceErrorKey')).toContainText(/\bplace\b/);
  await remains(async () => {
    expect(starts).toBe(0);
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
  }, 1500);
});
test('[UI-011] 多个页面请求同时401只续期一次并恢复加载', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  let refresh = 0;
  let injecting = true;
  const waiting: (() => Promise<void>)[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/auth/refresh') refresh++;
  });
  await page.route(`**/api/groups/${group.id}**`, async (route) => {
    if (!injecting || route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(async () => {
        try {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'UNAUTHORIZED',
                message: 'QA controlled expiry response',
                requestId: 'qa-expiry',
              },
            }),
          });
        } finally {
          resolve();
        }
      });
    });
  });
  try {
    await go(page, qa, 'group', group.id);
    try {
      await expect.poll(() => waiting.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    } catch {
      throw new BlockedError(
        '该公开页面未产生至少两个并发GET；需另行适配真实并发用户操作，不注入绕过应用客户端的fetch',
      );
    }
    injecting = false;
    await Promise.all(waiting.splice(0).map((release) => release()));
    await expect.poll(() => refresh).toBe(1);
    await expect(page.locator('body')).toContainText(/群管理员|creator/);
    await remains(async () => expect(refresh).toBe(1));
  } finally {
    injecting = false;
    await Promise.all(waiting.splice(0).map((release) => release()));
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[UI-012] 群名称简介按纯文本显示且日期不随编辑变化', async ({ qa, page }) => {
  const group = await prepare(qa);
  const text = '<img src=x onerror=alert(1)> 描述';
  await qa.api.require(
    qa.api.patch(`/api/groups/${group.id}`, { name: '资料显示群', description: text }),
  );
  let dialogs = 0;
  page.on('dialog', async (d) => {
    dialogs++;
    await d.dismiss();
  });
  await login(page, qa);
  await go(page, qa, 'groups');
  await expect(page.locator('body')).toContainText('资料显示群');
  await expect(page.locator('body')).toContainText(text);
  const listDate = child(card(page, qa, '资料显示群'), qa, 'groupCreatedAt');
  await expect(listDate).toBeVisible();
  expect((await listDate.innerText()).trim().length).toBeGreaterThan(0);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(text);
  const createdAt = element(page, qa, 'groupCreatedAt');
  await expect(createdAt).toBeVisible();
  const beforeDate = await createdAt.innerText();
  const original = await qa.api.require(
    qa.api.get<Group & { createdAt: string }>(`/api/groups/${group.id}`),
  );
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '编辑后的资料显示群' }));
  await expect(page.locator('body')).toContainText('编辑后的资料显示群');
  await expect(createdAt).toHaveText(beforeDate);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(element(page, qa, 'groupCreatedAt')).toHaveText(beforeDate);
  expect(
    (await qa.api.require(qa.api.get<Group & { createdAt: string }>(`/api/groups/${group.id}`)))
      .createdAt,
  ).toBe(original.createdAt);
  await remains(async () => {
    expect(dialogs).toBe(0);
    expect(await page.locator('img[onerror]').count()).toBe(0);
  });
});
test('[UI-013] 编辑表单未改直接关闭，dirty可继续或放弃', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '原始名' }));
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await element(page, qa, 'editProfile').click();
  await element(page, qa, 'closeProfile').click();
  await expect(element(page, qa, 'profileDialog')).toBeHidden();
  await element(page, qa, 'editProfile').click();
  await element(page, qa, 'groupName').fill('未保存');
  await element(page, qa, 'closeProfile').click();
  await element(page, qa, 'continueEditing').click();
  await expect(element(page, qa, 'groupName')).toHaveValue('未保存');
  await element(page, qa, 'closeProfile').click();
  await element(page, qa, 'discardChanges').click();
  await expect(element(page, qa, 'profileDialog')).toBeHidden();
  expect(
    (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
  ).toBe('原始名');
});
test('[UI-014] 提交中关闭受限，失败保留输入且不重放写入', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await element(page, qa, 'editProfile').click();
  await element(page, qa, 'groupName').fill('保留草稿');
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(`**/api/groups/${group.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    requests++;
    await held;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'QA fault', requestId: 'qa-ui-save' },
      }),
    });
  });
  try {
    await element(page, qa, 'saveProfile').click();
    await expect.poll(() => requests).toBe(1);
    await element(page, qa, 'saveProfile').click({ force: true });
    await page.keyboard.press('Escape');
    await expect(element(page, qa, 'profileDialog')).toBeVisible();
    release();
    await expect(element(page, qa, 'saveProfile')).toBeEnabled();
    await expect(element(page, qa, 'groupName')).toHaveValue('保留草稿');
    await remains(async () => expect(requests).toBe(1));
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[UI-015] 同字段冲突保留草稿，明确再确认才提交', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '最初' }));
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await element(page, qa, 'editProfile').click();
  await element(page, qa, 'groupName').fill('我的草稿');
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '服务器新版' }));
  const response = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await element(page, qa, 'saveProfile').click();
  expect((await response).status()).toBe(409);
  await expect(element(page, qa, 'groupName')).toHaveValue('我的草稿');
  await expect(page.locator('body')).toContainText('服务器新版');
  expect(
    (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
  ).toBe('服务器新版');
  await element(page, qa, 'confirmConflict').click();
  await expect
    .poll(
      async () =>
        (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`)))
          .name,
    )
    .toBe('我的草稿');
});
test('[UI-016] 搜索旧响应不能覆盖新条件且不抢焦点', async ({ qa, page }) => {
  const old = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${old.id}`, { name: 'old-query' }));
  const { group: newGroup } = await qa.api.createGroup();
  await qa.api.require(qa.api.patch(`/api/groups/${newGroup.id}`, { name: 'new-query' }));
  await login(page, qa);
  await go(page, qa, 'groups');
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let seen = false;
  await page.route('**/api/group-directory?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'old-query') {
      seen = true;
      const response = await route.fetch();
      await hold;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    const search = element(page, qa, 'search');
    await search.fill('old-query');
    await expect.poll(() => seen).toBe(true);
    await search.fill('new-query');
    await expect(element(page, qa, 'directoryItem')).toContainText('new-query');
    release();
    await remains(async () => {
      expect(await search.inputValue()).toBe('new-query');
      expect(await search.evaluate((e) => e === document.activeElement)).toBe(true);
      expect(await element(page, qa, 'directoryItem').allTextContents()).toEqual([
        expect.stringContaining('new-query'),
      ]);
    });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[UI-017] 多页过期禁止旧游标，失败保留列表，成功整体换首页', async ({ qa, page }) => {
  await qa.api.login();
  let first: Group | undefined;
  for (let i = 0; i < 23; i++) {
    const { group } = await qa.api.createGroup();
    first ??= group;
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: `目录-${i}` }));
  }
  await login(page, qa);
  await go(page, qa, 'groups');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  await element(page, qa, 'loadMoreGroups').click();
  await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  await qa.api.require(qa.api.patch(`/api/groups/${first!.id}`, { name: '变化名称' }));
  await expect(element(page, qa, 'directoryStale')).toBeVisible();
  const more = element(page, qa, 'loadMoreGroups');
  await expect.poll(async () => (await more.count()) === 0 || (await more.isDisabled())).toBe(true);
  let fail = true;
  await page.route('**/api/group-directory**', async (r) => {
    if (fail)
      await r.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'QA refresh failure',
            requestId: 'refresh',
          },
        }),
      });
    else await r.continue();
  });
  await element(page, qa, 'refreshDirectory').click();
  await expect(element(page, qa, 'directoryError')).toBeVisible();
  await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  fail = false;
  await element(page, qa, 'refreshDirectory').click();
  await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  await expect(element(page, qa, 'directoryStale')).toBeHidden();
});
test('[UI-018] 目录组合筛选、清关键词与重置含义不同', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(
    qa.api.patch(`/api/groups/${group.id}`, { name: '查找我', agentEnabled: true }),
  );
  await login(page, qa);
  await go(page, qa, 'groups');
  await element(page, qa, 'search').fill('查找');
  await element(page, qa, 'order').selectOption('asc');
  await element(page, qa, 'statusFilter').selectOption('active');
  await element(page, qa, 'agentFilter').selectOption('true');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  await element(page, qa, 'clearSearch').click();
  await expect(element(page, qa, 'search')).toHaveValue('');
  await expect(element(page, qa, 'order')).toHaveValue('asc');
  await expect(element(page, qa, 'agentFilter')).toHaveValue('true');
  await element(page, qa, 'resetFilters').click();
  await expect(element(page, qa, 'order')).toHaveValue('desc');
  await expect(element(page, qa, 'statusFilter')).toHaveValue('');
  await expect(element(page, qa, 'agentFilter')).toHaveValue('');
});
test('[UI-019] 初次失败可重试，成功空搜索不冒充加载错误', async ({ qa, page }) => {
  await prepare(qa);
  await login(page, qa);
  let fail = true;
  await page.route('**/api/group-directory**', async (r) => {
    if (fail)
      await r.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'QA first load failure',
            requestId: 'first',
          },
        }),
      });
    else await r.continue();
  });
  await go(page, qa, 'groups');
  await expect(element(page, qa, 'directoryError')).toBeVisible();
  fail = false;
  await element(page, qa, 'retryDirectory').click();
  await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  await element(page, qa, 'search').fill('不存在的唯一关键词');
  await expect(element(page, qa, 'directoryEmpty')).toBeVisible();
  await expect(element(page, qa, 'directoryError')).toBeHidden();
});
test('[UI-020] 当前群失焦只提示相关更新，聚焦本身不确认', async ({ qa, page, context }) => {
  const group = await prepare(qa);
  const { group: other } = await qa.api.createGroup();
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  const quietTitle = await page.title();
  const background = await backgroundTab(page);
  try {
    incoming(qa, other, '无关群变化');
    await remains(async () => expect(await page.title()).toBe(quietTitle), 3000);
    incoming(qa, group, '相关未确认变化');
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    await expect(page.getByText('相关未确认变化', { exact: true })).toBeVisible();
    await remains(async () => expect(await page.title()).not.toBe(quietTitle));
    await page.getByText('相关未确认变化', { exact: true }).click();
    await expect(page).toHaveTitle(quietTitle);
  } finally {
    await background.close();
  }
});
test('[UI-021] 离开群详情销毁提醒范围，旧群变化不污染新页', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await go(page, qa, 'accounts');
  await expect(element(page, qa, 'accountRow')).toHaveCount((await qa.api.accounts()).length);
  const title = await page.title();
  const background = await backgroundTab(page);
  try {
    incoming(qa, group, '旧页面到达消息');
    await remains(async () => {
      expect(await page.title()).toBe(title);
      expect(await page.getByText('旧页面到达消息', { exact: true }).count()).toBe(0);
    }, 3000);
  } finally {
    await background.close();
  }
});
test('[UI-022] 创建群表单同样执行未保存关闭保护', async ({ qa, page }) => {
  await qa.api.login();
  await qa.api.connectAll();
  await login(page, qa);
  await go(page, qa, 'groups');
  await element(page, qa, 'createGroup').click();
  await element(page, qa, 'groupName').fill('创建草稿');
  await element(page, qa, 'closeCreateGroup').click();
  await element(page, qa, 'continueEditing').click();
  await expect(element(page, qa, 'groupName')).toHaveValue('创建草稿');
  await element(page, qa, 'closeCreateGroup').click();
  await element(page, qa, 'discardChanges').click();
  expect(await qa.api.require(qa.api.get<Group[]>('/api/groups'))).toEqual([]);
});

test('[UI-023] 简介摘要最多两行纯文本、详情完整且空简介无占位', async ({ qa, page }) => {
  const group = await prepare(qa);
  const { group: empty } = await qa.api.createGroup();
  const description = '纯文本摘要 '.repeat(35) + '<b>不得解释HTML</b> 最后一句';
  await qa.api.require(
    qa.api.patch(`/api/groups/${group.id}`, { name: '两行摘要专用群', description }),
  );
  await qa.api.require(qa.api.patch(`/api/groups/${empty.id}`, { name: '没有简介的群' }));
  await login(page, qa);
  await go(page, qa, 'groups');
  const summary = child(card(page, qa, '两行摘要专用群'), qa, 'directorySummary');
  await expect(summary).toBeVisible();
  const layout = await summary.evaluate((node) => {
    let clip = node.getBoundingClientRect();
    for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) {
        const r = ancestor.getBoundingClientRect();
        clip = {
          ...clip,
          top: Math.max(clip.top, r.top),
          bottom: Math.min(clip.bottom, r.bottom),
          left: Math.max(clip.left, r.left),
          right: Math.min(clip.right, r.right),
        } as DOMRect;
      }
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const tops: number[] = [];
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const r of range.getClientRects()) {
        if (
          r.height > 0 &&
          r.width > 0 &&
          r.top < clip.bottom - 1 &&
          r.bottom > clip.top + 1 &&
          r.left < clip.right &&
          r.right > clip.left
        )
          tops.push(Math.round(r.top));
      }
    }
    return {
      visibleLines: new Set(tops).size,
      text: node.textContent,
      markup: node.querySelectorAll('b,img,script,svg').length,
    };
  });
  expect(layout.visibleLines).toBeGreaterThan(0);
  expect(layout.visibleLines).toBeLessThanOrEqual(2);
  expect(layout.markup).toBe(0);
  await expect(child(card(page, qa, '没有简介的群'), qa, 'directorySummary')).toBeHidden();
  await child(card(page, qa, '两行摘要专用群'), qa, 'directoryLink').click();
  await expect(element(page, qa, 'groupDescriptionView')).toHaveText(description);
  await expect(element(page, qa, 'groupDescriptionView').locator('b,img,script,svg')).toHaveCount(
    0,
  );
  await qa.evidence('ui-summary-layout', layout);
});

test('[UI-024] 单页五秒刷新、并发失效合并且无关消息不遍历目录', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '轮询起点' }));
  await login(page, qa);
  const requests: { at: number; url: string }[] = [];
  page.on('request', (request) => {
    if (directoryRequest(request)) requests.push({ at: performance.now(), url: request.url() });
  });
  await go(page, qa, 'groups');
  await expect(card(page, qa, '轮询起点')).toHaveCount(1);
  const search = element(page, qa, 'search');
  await search.focus();
  const baseline = requests.length;
  const start = performance.now();
  await expect.poll(() => requests.length, { timeout: 6000 }).toBeGreaterThan(baseline);
  expect(requests[baseline]!.at - start).toBeLessThanOrEqual(5000);
  await expect(search).toBeFocused();
  const unrelated = requests.length;
  incoming(qa, group, '消息不改变目录摘要');
  await remains(async () => expect(requests.length).toBe(unrelated), 1000);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  let active = 0;
  let maxActive = 0;
  let intercepted = 0;
  await page.route('**/api/group-directory**', async (route) => {
    active++;
    maxActive = Math.max(maxActive, active);
    intercepted++;
    try {
      const response = await route.fetch();
      await hold;
      await route.fulfill({ response });
    } finally {
      active--;
    }
  });
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '轮询变更一' }));
    await expect.poll(() => intercepted).toBe(1);
    await Promise.all(
      ['轮询变更二', '轮询最终值'].map((name) =>
        qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name })),
      ),
    );
    await remains(async () => expect(intercepted).toBe(1), 500);
    release();
    const actual = await qa.api.require(
      qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`),
    );
    await expect(card(page, qa, actual.name)).toHaveCount(1);
    expect(maxActive).toBe(1);
    expect(intercepted).toBeLessThanOrEqual(2);
    for (const request of requests) {
      const query = new URL(request.url).searchParams;
      expect(query.get('cursor')).toBeNull();
      expect(Number(query.get('pageSize') ?? 20)).toBeLessThanOrEqual(50);
    }
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await qa.evidence('ui-directory-bounded-requests', requests);
  }
});

test('[UI-025] 同标签返回保留条件与已加载页，整页刷新清空目录内存', async ({ qa, page }) => {
  await qa.api.login();
  for (let i = 0; i < 23; i++) {
    const { group } = await qa.api.createGroup();
    await qa.api.require(
      qa.api.patch(`/api/groups/${group.id}`, { name: `cache-item-${String(i).padStart(3, '0')}` }),
    );
  }
  await login(page, qa);
  await go(page, qa, 'groups');
  await element(page, qa, 'search').fill('cache-item');
  await element(page, qa, 'order').selectOption('asc');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  await element(page, qa, 'loadMoreGroups').click();
  await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  const selected = card(page, qa, 'cache-item-022');
  await selected.scrollIntoViewIfNeeded();
  await child(selected, qa, 'directoryLink').click();
  await expect(page.locator('body')).toContainText(/群主|creator/);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(element(page, qa, 'search')).toHaveValue('cache-item');
  await expect(element(page, qa, 'order')).toHaveValue('asc');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  await expect(card(page, qa, 'cache-item-022')).toBeInViewport();
  await expect(element(page, qa, 'directoryLoadedCount')).toContainText('23');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(element(page, qa, 'search')).toHaveValue('');
  await expect(element(page, qa, 'order')).toHaveValue('desc');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
});

test('[UI-026] 注销后更换身份不复用上一会话目录条件', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '仅上一会话条件' }));
  await login(page, qa);
  await go(page, qa, 'groups');
  await element(page, qa, 'search').fill('仅上一会话');
  await element(page, qa, 'order').selectOption('asc');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  const loggedOut = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/logout' &&
      response.request().method() === 'POST',
  );
  await element(page, qa, 'logout').click();
  expect((await loggedOut).ok()).toBe(true);
  await login(page, qa, 'viewer');
  await go(page, qa, 'groups');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  await expect(element(page, qa, 'search')).toHaveValue('');
  await expect(element(page, qa, 'order')).toHaveValue('desc');
  await remains(async () => {
    expect(await element(page, qa, 'search').inputValue()).toBe('');
    expect(await page.getByRole('button', { name: '创建群', exact: true }).count()).toBe(0);
  });
});

test('[UI-027] composition期间不查询中间文本，确认后只查完成词且不抢焦点', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '卡比验收群' }));
  await login(page, qa);
  await go(page, qa, 'groups');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  const requests: { q: string; at: number }[] = [];
  page.on('request', (request) => {
    if (directoryRequest(request))
      requests.push({
        q: new URL(request.url()).searchParams.get('q') ?? '',
        at: performance.now(),
      });
  });
  const search = element(page, qa, 'search');
  await search.focus();
  await search.evaluate((node) => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  });
  for (const value of ['k', 'ka', '卡'])
    await search.evaluate((node, text) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setter) throw new Error('Input adapter is not an HTML input');
      setter.call(node, text);
      node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: text }));
      node.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: text,
          isComposing: true,
        }),
      );
    }, value);
  await remains(
    async () =>
      expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0),
    1000,
  );
  const committedAt = performance.now();
  await search.evaluate((node) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '卡比');
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '卡比' }));
    node.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: '卡比',
        isComposing: false,
      }),
    );
  });
  await expect.poll(() => requests.filter((request) => request.q === '卡比').length).toBe(1);
  await expect(card(page, qa, '卡比验收群')).toHaveCount(1);
  await expect(search).toBeFocused();
  expect(requests.find((request) => request.q === '卡比')!.at).toBeGreaterThan(committedAt);
  expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0);
  await qa.evidence('ui-synthetic-composition', {
    requests,
    committedAt,
    limitation: '浏览器标准composition/input事件；不代表操作系统输入法已经实测',
  });
});

test('[UI-028] 前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/群主|creator/);
  await page.bringToFront();
  const quietTitle = await page.title();
  const quietIcon = await favicon(page);
  // An absent custom quiet icon is a valid browser default. The requirement
  // is that a pending update changes the icon and confirmation restores it.
  incoming(qa, group, '前台安静内容');
  await expect(page.getByText('前台安静内容', { exact: true })).toBeVisible();
  await remains(async () => {
    expect(await page.title()).toBe(quietTitle);
    expect(await favicon(page)).toBe(quietIcon);
  });
  const background = await backgroundTab(page);
  try {
    incoming(qa, group, '失焦静态内容');
    await expect(page).not.toHaveTitle(quietTitle);
    await expect.poll(() => favicon(page)).not.toBe(quietIcon);
    const markedTitle = await page.title();
    const markedIcon = await favicon(page);
    await remains(async () => {
      expect(await page.title()).toBe(markedTitle);
      expect(await favicon(page)).toBe(markedIcon);
    }, 1500);
    await page.bringToFront();
    await expect(page.getByText('失焦静态内容', { exact: true })).toBeVisible();
    await remains(async () => expect(await page.title()).toBe(markedTitle));
    await page.getByText('失焦静态内容', { exact: true }).click();
    await expect(page).toHaveTitle(quietTitle);
    await expect.poll(() => favicon(page)).toBe(quietIcon);
  } finally {
    await background.close();
  }
});

test('[UI-029] 内容加载失败不能确认，成功呈现后相关操作才清提醒', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/群主|creator/);
  const quietTitle = await page.title();
  let failures = 0;
  let fail = true;
  await page.route(`**/api/groups/${group.id}/messages**`, async (route) => {
    if (fail && route.request().method() === 'GET') {
      failures++;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'QA content load unavailable',
            requestId: 'qa-render-failure',
          },
        }),
      });
    } else await route.continue();
  });
  const background = await backgroundTab(page);
  try {
    incoming(qa, group, '只有成功读取后才能确认');
    try {
      await expect.poll(() => failures, { timeout: 8000 }).toBeGreaterThan(0);
    } catch {
      throw new BlockedError(
        '此界面没有通过可观察messages GET读取新内容；需要适配真实内容加载失败入口，不能宣称已覆盖',
      );
    }
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    await expect(element(page, qa, 'messageError')).toBeVisible();
    await element(page, qa, 'messageError').click();
    await remains(async () => expect(await page.title()).not.toBe(quietTitle));
    fail = false;
    await element(page, qa, 'retryMessages').click();
    await expect(page.getByText('只有成功读取后才能确认', { exact: true })).toBeVisible();
    await page.getByText('只有成功读取后才能确认', { exact: true }).click();
    await expect(page).toHaveTitle(quietTitle);
  } finally {
    fail = false;
    await background.close();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('[UI-030] 搜索范围记录消失先展示成功结果，再明确确认范围变化', async ({ qa, page }) => {
  const group = await prepare(qa);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围甲唯一记录' }));
  await login(page, qa);
  await go(page, qa, 'groups');
  await element(page, qa, 'search').fill('范围甲');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  const quietTitle = await page.title();
  const background = await backgroundTab(page);
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围乙唯一记录' }));
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    await remains(async () => expect(await page.title()).not.toBe(quietTitle));
    const refresh = element(page, qa, 'attentionRefresh');
    if (await refresh.isVisible()) await refresh.click();
    await expect(element(page, qa, 'directoryEmpty')).toBeVisible();
    await expect(element(page, qa, 'attentionScopeSummary')).toBeVisible();
    await expect(element(page, qa, 'search')).toHaveValue('范围甲');
    await expect(page).not.toHaveTitle(quietTitle);
    await element(page, qa, 'attentionScopeConfirm').click();
    await expect(page).toHaveTitle(quietTitle);
  } finally {
    await background.close();
  }
});

test('[UI-031] 状态先改变后还原仍保留期间变化候选', async ({ qa, page }) => {
  await qa.api.login();
  const accounts = await qa.api.connectAll();
  const account = accounts[0]!;
  await login(page, qa);
  await go(page, qa, 'accounts');
  await expect(element(page, qa, 'accountRow')).toHaveCount(accounts.length);
  const quietTitle = await page.title();
  const background = await backgroundTab(page);
  try {
    await qa.api.require(
      qa.api.post(`/api/accounts/${account.id}/transition`, {
        expectedFrom: 'online',
        to: 'disconnected',
      }),
    );
    await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`));
    await expect
      .poll(async () => (await qa.api.accounts()).find((item) => item.id === account.id)?.status)
      .toBe('online');
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  } finally {
    await background.close();
  }
});

test('[UI-032] 提醒确认不能恢复多页过期旧游标', async ({ qa, page }) => {
  await qa.api.login();
  let changed: Group | undefined;
  for (let i = 0; i < 23; i++) {
    const { group } = await qa.api.createGroup();
    changed ??= group;
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: `游标提醒-${i}` }));
  }
  await login(page, qa);
  await go(page, qa, 'groups');
  await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  await element(page, qa, 'loadMoreGroups').click();
  await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  const quietTitle = await page.title();
  const background = await backgroundTab(page);
  const cursorRequests: string[] = [];
  page.on('request', (request) => {
    if (directoryRequest(request) && new URL(request.url()).searchParams.has('cursor'))
      cursorRequests.push(request.url());
  });
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${changed!.id}`, { name: '游标提醒已变化' }));
    await expect(element(page, qa, 'directoryStale')).toBeVisible();
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    const confirm = element(page, qa, 'attentionConfirm');
    if (!(await confirm.isVisible()))
      throw new BlockedError(
        '需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期',
      );
    await confirm.click();
    await expect(page).toHaveTitle(quietTitle);
    await expect(element(page, qa, 'directoryStale')).toBeVisible();
    await remains(async () => {
      const more = element(page, qa, 'loadMoreGroups');
      expect((await more.count()) === 0 || (await more.isDisabled())).toBe(true);
      expect(cursorRequests).toEqual([]);
    });
  } finally {
    await background.close();
  }
});

test('[UI-033] 本地手动发送先带clientMsgId，回流早于响应不误标远端未读', async ({ qa, page }) => {
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/群主|creator/);
  const quietTitle = await page.title();
  await element(page, qa, 'senderAccount').selectOption(group.creatorAccountId);
  await element(page, qa, 'messageInput').fill('本标签手动发送');
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    effectDelayMs: 1500,
    barrier: { phase: 'before-response', name: 'manual-send-response' },
  });
  let releaseApi!: () => void;
  const apiHeld = new Promise<void>((resolve) => (releaseApi = resolve));
  let apiDelivered = false;
  await page.route(`**/api/groups/${group.id}/send`, async (route) => {
    const response = await route.fetch();
    await apiHeld;
    await route.fulfill({ response });
    apiDelivered = true;
  });
  let background: Page | undefined;
  try {
    const outgoing = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === `/api/groups/${group.id}/send` &&
        request.method() === 'POST',
    );
    await element(page, qa, 'sendMessage').click();
    const payload = (await outgoing).postDataJSON() as { clientMsgId?: unknown };
    expect(typeof payload.clientMsgId).toBe('string');
    expect(String(payload.clientMsgId).length).toBeGreaterThan(0);
    background = await backgroundTab(page);
    await qa.gateway.barriers.waitFor('manual-send-response');
    await expect
      .poll(
        () => qa.gateway.snapshot().messages.some((message) => message.text === '本标签手动发送'),
        { timeout: 4000 },
      )
      .toBe(true);
    await qa.api.waitFor<{ items: { text: string }[] }>(
      `/api/groups/${group.id}/messages`,
      (value) => value.items.some((message) => message.text === '本标签手动发送'),
    );
    await remains(async () => {
      expect(await page.title()).toBe(quietTitle);
      expect(apiDelivered).toBe(false);
    }, 2000);
  } finally {
    releaseApi();
    qa.gateway.barriers.release('manual-send-response');
    await background?.close();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('[UI-034] Agent自己的自动消息仍参与失焦提醒', async ({ qa, page }) => {
  const group = await prepare(qa);
  qa.agent.enqueueTurns({
    barrier: { phase: 'request', name: 'automatic-send' },
    body: {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'attention-agent',
          name: 'send_message',
          input: { text: 'Agent自动提醒消息', idempotency_key: 'attention-agent' },
        },
      ],
    },
  });
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  incoming(qa, group, '前台读取的触发消息');
  await expect(page.getByText('前台读取的触发消息', { exact: true })).toBeVisible();
  await page.getByText('前台读取的触发消息', { exact: true }).click();
  await qa.agent.barriers.waitFor('automatic-send');
  const quietTitle = await page.title();
  const background = await backgroundTab(page);
  try {
    qa.agent.barriers.release('automatic-send');
    await expect
      .poll(() =>
        qa.gateway.snapshot().messages.some((message) => message.text === 'Agent自动提醒消息'),
      )
      .toBe(true);
    await qa.api.waitFor<{ items: { text: string; isOwn: boolean }[] }>(
      `/api/groups/${group.id}/messages`,
      (value) =>
        value.items.some((message) => message.text === 'Agent自动提醒消息' && message.isOwn),
    );
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    await expect(page.getByText('Agent自动提醒消息', { exact: true })).toBeVisible();
  } finally {
    qa.agent.barriers.release('automatic-send');
    await background.close();
  }
});

test('[UI-035] 序列自动发送不因isOwn被排除提醒', async ({ qa, page }) => {
  const group = await prepare(qa);
  const sequence = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: '提醒序列',
      steps: [{ index: 1, accountRole: 'admin', text: '序列自动提醒消息', delaySeconds: 2 }],
    }),
  );
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await expect(page.locator('body')).toContainText(/群主|creator/);
  const quietTitle = await page.title();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    barrier: { phase: 'request', name: 'sequence-message' },
  });
  await qa.api.require(
    qa.api.post(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: sequence.id,
      vars: {},
      stepVars: {},
    }),
    201,
  );
  await qa.gateway.barriers.waitFor('sequence-message');
  const background = await backgroundTab(page);
  try {
    qa.gateway.barriers.release('sequence-message');
    await expect
      .poll(() =>
        qa.gateway.snapshot().messages.some((message) => message.text === '序列自动提醒消息'),
      )
      .toBe(true);
    await qa.api.waitFor<{ items: { text: string; isOwn: boolean }[] }>(
      `/api/groups/${group.id}/messages`,
      (value) =>
        value.items.some((message) => message.text === '序列自动提醒消息' && message.isOwn),
    );
    await expect(page).not.toHaveTitle(quietTitle);
    await page.bringToFront();
    await expect(page.getByText('序列自动提醒消息', { exact: true })).toBeVisible();
  } finally {
    qa.gateway.barriers.release('sequence-message');
    await background.close();
  }
});

test('[UI-036] 编辑卸载后迟到成功不能污染新页面或重放提交', async ({ qa, page }) => {
  // Observe actual SUT WS epochs to prove URL navigation did not restart the
  // document/session and accidentally discard the delayed response under test.
  let socketOpens = 0,
    successfulAuths = 0;
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socketOpens++;
    socket.on('framereceived', ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        if (frame.type === 'auth' && frame.success === true) successfulAuths++;
      } catch {
        /* Non-JSON frames are not authentication evidence. */
      }
    });
  });
  const group = await prepare(qa);
  await login(page, qa);
  await go(page, qa, 'group', group.id);
  await element(page, qa, 'editProfile').click();
  await element(page, qa, 'groupName').fill('晚到成功草稿');
  await expect.poll(() => successfulAuths).toBeGreaterThan(0);
  let originalDocument: Awaited<ReturnType<Page['evaluateHandle']>> | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  let stored = false;
  await page.route(`**/api/groups/${group.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    requests++;
    const response = await route.fetch();
    stored = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await element(page, qa, 'saveProfile').click();
    await expect.poll(() => stored).toBe(true);
    const accountsRoute = qa.config.ui.routes.accounts;
    if (!accountsRoute) throw new BlockedError('没有已确认公开账号页路由');
    const beforeUrl = new URL(page.url()),
      afterUrl = new URL(accountsRoute, qa.webUrl);
    if (
      !afterUrl.hash ||
      beforeUrl.origin !== afterUrl.origin ||
      beforeUrl.pathname !== afterUrl.pathname ||
      beforeUrl.search !== afterUrl.search
    )
      throw new BlockedError('无法经纯公开URL片段离页，禁止整页重载替代编辑卸载');
    originalDocument = await page.evaluateHandle(() => document);
    const connectionBaseline = { socketOpens, successfulAuths };
    // Native modal makes the underlying sidebar inert. Navigating to the public
    // hash URL models an address-bar route change; it does not click through the
    // modal, call an internal router, or reload the application document.
    await page.goto(afterUrl.href, { waitUntil: 'domcontentloaded' });
    let sameDocument = false;
    try {
      sameDocument = await page.evaluate((old) => old === document, originalDocument);
    } catch {
      /* A destroyed execution context disproves this required precondition. */
    }
    if (
      !sameDocument ||
      socketOpens !== connectionBaseline.socketOpens ||
      successfulAuths !== connectionBaseline.successfulAuths
    )
      throw new BlockedError('离页改变document或WS认证代次，不能作为迟到结果隔离证据');
    await qa.evidence('ui-unmount-navigation', {
      mechanism: 'public same-document hash URL navigation',
      from: beforeUrl.href,
      to: afterUrl.href,
      sameDocument,
      connectionBaseline,
      afterNavigation: { socketOpens, successfulAuths },
      boundary: '用户公开地址导航触发表单卸载；不主张可在原生模态内点击底层侧栏',
    });
    await expect(element(page, qa, 'accountRow')).toHaveCount((await qa.api.accounts()).length);
    release();
    await remains(async () => {
      expect(requests).toBe(1);
      expect(await element(page, qa, 'profileDialog').isVisible()).toBe(false);
      expect(await page.locator('body').innerText()).not.toContain('晚到成功草稿');
    }, 1500);
    expect(
      (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
    ).toBe('晚到成功草稿');
  } finally {
    release();
    await originalDocument?.dispose();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
