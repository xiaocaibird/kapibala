import type { Page, Locator, Request } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { observe } from '../../harness/observation.js';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun, Group } from '../../harness/platform-client.js';
import type { AgentRequest, AgentResponsePlan } from '../../harness/agent.js';
import {
  observeDirectory,
  directoryPremise,
  directoryPeriodMs,
  directoryGroupIds,
} from './directory-observer.js';
import { nativeBackgroundTab } from './native-focus.js';
import { observePageContinuity, withContinuityEvidence } from './page-continuity.js';
import { assertDirectoryRefreshBoundary } from './directory-refresh-boundary.js';
import { requireAvailablePublicAction } from './public-action-premise.js';

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
  return nativeBackgroundTab(page, {
    record: async (evidence) => {
      await test.info().attach('native-tab-focus', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    },
  });
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
  const sequence = await createSequence(qa);
  await login(page, qa);
  let refresh = 0;
  let injecting = true;
  const waiting: (() => Promise<void>)[] = [];
  const paths = new Set(['/api/groups', '/api/sequences']);
  const heldPaths = new Set<string>();
  const received401 = new Set<string>();
  const recovered = new Set<string>();
  const network: { at: number; method: string; path: string; status?: number }[] = [];
  let releaseRefresh!: () => void;
  const holdRefresh = new Promise<void>((resolve) => (releaseRefresh = resolve));
  const onRequest = (r: Request) => {
    const path = new URL(r.url()).pathname;
    if (paths.has(path) || path === '/api/auth/refresh')
      network.push({ at: performance.now(), method: r.method(), path });
    if (new URL(r.url()).pathname === '/api/auth/refresh') refresh++;
  };
  const onResponse = (response: import('@playwright/test').Response) => {
    const path = new URL(response.url()).pathname;
    if (!paths.has(path) && path !== '/api/auth/refresh') return;
    network.push({
      at: performance.now(),
      method: `RESPONSE ${response.request().method()}`,
      path,
      status: response.status(),
    });
    if (paths.has(path) && response.request().method() === 'GET') {
      if (response.status() === 401) received401.add(path);
      if (!injecting && response.status() === 200) recovered.add(path);
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  await page.route(
    (url) =>
      url.origin === new URL(qa.webUrl).origin &&
      (paths.has(url.pathname) || url.pathname === '/api/auth/refresh'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/refresh' && route.request().method() === 'POST') {
        await holdRefresh;
        await route.continue();
        return;
      }
      if (!injecting || route.request().method() !== 'GET' || !paths.has(path)) {
        await route.continue();
        return;
      }
      heldPaths.add(path);
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
    },
  );
  try {
    const originalDocument = await page.evaluateHandle(() => document);
    try {
      await element(page, qa, 'navSequences').click();
      const sameDocument = await page
        .evaluate((oldDocument) => oldDocument === document, originalDocument)
        .catch(() => false);
      if (!sameDocument)
        throw new BlockedError('序列导航触发整页重载，可能混入启动续期，不能作为本次并发401窗口');
    } finally {
      await originalDocument.dispose();
    }
    await directoryPremise(
      () => heldPaths.size === 2 && waiting.length >= 2,
      '序列页真实 /api/groups 与 /api/sequences 两个独立GET同时在途；不注入直接fetch',
      5000,
    );
    injecting = false;
    await Promise.all(waiting.splice(0).map((release) => release()));
    await directoryPremise(
      () => received401.size === 2,
      '两个实际页面GET均已收到受控401',
      5000,
    );
    try {
      await expect.poll(() => refresh).toBe(1);
      // Keep refresh pending while both 401 handlers join the same renewal.
      await remains(async () => expect(refresh).toBe(1));
    } finally {
      releaseRefresh();
    }
    await expect.poll(() => recovered.size).toBe(2);
    await element(page, qa, 'sequenceGroup').selectOption(group.id);
    await element(page, qa, 'sequence').selectOption(sequence.id);
    await expect(element(page, qa, 'sequenceGroup')).toHaveValue(group.id);
    await expect(element(page, qa, 'sequence')).toHaveValue(sequence.id);
    await remains(async () => expect(refresh).toBe(1));
  } finally {
    injecting = false;
    releaseRefresh();
    await Promise.all(waiting.splice(0).map((release) => release()));
    await page.unrouteAll({ behavior: 'wait' });
    page.off('request', onRequest);
    page.off('response', onResponse);
    await qa.evidence('ui-concurrent-auth-refresh', {
      heldPaths: [...heldPaths],
      received401: [...received401],
      recovered: [...recovered],
      refresh,
      network,
    });
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
  const observer = observeDirectory(page);
  try {
    await login(page, qa);
    await go(page, qa, 'groups');
    await observer.settle();
    const boundary = observer.ledger.boundaryVersion;
    const firstPage = observer.ledger.reads.findLast(
      (read) => !new URL(read.url).searchParams.has('cursor'),
    );
    if (!firstPage || firstPage.status !== 200 || !firstPage.body)
      throw new BlockedError('UI017实际完整首页和历史回放前提未建立');
    const firstBody = firstPage.body as { items: { id: string }[]; nextCursor: string | null };
    if (!firstBody.nextCursor || firstBody.items.length !== 20)
      throw new BlockedError('UI017首页未形成真实可继续分页链');
    await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
    await element(page, qa, 'loadMoreGroups').click();
    await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
    observer.unchanged(boundary);
    await directoryPremise(
      () =>
        observer.ledger.reads.some(
          (read) =>
            new URL(read.url).searchParams.get('cursor') === firstBody.nextCursor &&
            read.endedAt !== undefined,
        ),
      'UI017原首页cursor实际续页',
    );
    const continuation = observer.ledger.reads.findLast(
      (read) => new URL(read.url).searchParams.get('cursor') === firstBody.nextCursor,
    )!;
    expect(continuation.status).toBe(200);
    const secondBody = continuation.body as { items: { id: string }[] };
    expect(secondBody.items).toHaveLength(3);
    const expectedIds = [...firstBody.items, ...secondBody.items].map((row) => row.id);
    expect(new Set(expectedIds).size).toBe(23);
    expect(
      await element(page, qa, 'directoryItem').evaluateAll((cards) =>
        cards.map((card) => card.getAttribute('data-directory-group-id')),
      ),
    ).toEqual(expectedIds);
    await qa.evidence('ui017-stable-pagination-premise', {
      boundary,
      firstPage,
      continuation,
      expectedIds,
    });
    await qa.api.require(qa.api.patch(`/api/groups/${first!.id}`, { name: '变化名称' }));
    await expect(element(page, qa, 'directoryStale')).toBeVisible();
    const more = element(page, qa, 'loadMoreGroups');
    await expect
      .poll(async () => (await more.count()) === 0 || (await more.isDisabled()))
      .toBe(true);
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
  } finally {
    await qa.evidence('ui017-directory-ledger', observer.ledger);
    observer.dispose();
  }
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
  const observer = observeDirectory(page);
  const { reads: requests } = observer.ledger;
  try {
    await login(page, qa);
    // Login already enters groups. Do not reload and create another replay epoch.
    await expect(card(page, qa, '轮询起点')).toHaveCount(1);
    await observer.settle();
    const search = element(page, qa, 'search');
    await search.focus();
    const version = observer.ledger.boundaryVersion;
    const baseline = requests.length;
    const start = performance.now();
    try {
      await expect.poll(() => requests.length, { timeout: 6000 }).toBeGreaterThan(baseline);
    } finally {
      // Check outside expect.poll so a premise interruption stays BLOCKED.
      observer.unchanged(version);
    }
    const periodic = requests[baseline]!;
    expect(periodic.at - start).toBeLessThanOrEqual(directoryPeriodMs);
    await directoryPremise(() => periodic.endedAt !== undefined, '真实周期响应已完成');
    expect(periodic.status).toBe(200);
    expect(periodic.error).toBeUndefined();
    await expect(search).toBeFocused();
    const unrelated = requests.length;
    const message = incoming(qa, group, '消息不改变目录摘要');
    await directoryPremise(
      () =>
        observer.ledger.frames.some(
          (frame) => frame.type === 'message' && frame.msgId === message.data.msgId,
        ),
      '注入的无关消息真实到达本浏览器',
    );
    observer.unchanged(version);
    const nextPeriodAt = periodic.at + directoryPeriodMs;
    if (performance.now() + 1000 >= nextPeriodAt)
      throw new BlockedError('无关消息到达过晚，完整1秒负向窗口会与下个合法周期重叠');
    await remains(async () => {
      observer.unchanged(version);
      if (performance.now() >= nextPeriodAt)
        throw new BlockedError('负向观察跨越下一个合法目录轮询周期');
      expect(requests.length).toBe(unrelated);
    }, 1000);
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
    }
  } finally {
    observer.dispose();
    await qa.evidence('ui-directory-bounded-requests', observer.ledger);
    observer.assertProtocol();
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
  const observer = observeDirectory(page);
  try {
    await login(page, qa);
    await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
    await observer.settle();
    const beforeQuery = observer.ledger.reads.length;
    await element(page, qa, 'search').fill('cache-item');
    await element(page, qa, 'order').selectOption('asc');
    const matchesQuery = (url: string, cursor: string | null) => {
      const query = new URL(url).searchParams;
      return (
        query.get('q') === 'cache-item' &&
        query.get('order') === 'asc' &&
        Number(query.get('pageSize') ?? 20) === 20 &&
        query.get('cursor') === cursor
      );
    };
    await directoryPremise(
      () =>
        observer.ledger.reads
          .slice(beforeQuery)
          .some((read) => matchesQuery(read.url, null) && read.endedAt !== undefined),
      '新查询条件的完整首页响应',
    );
    await observer.settle();
    const first = observer.ledger.reads
      .slice(beforeQuery)
      .findLast((read) => matchesQuery(read.url, null))!;
    expect(first.status).toBe(200);
    expect(first.error).toBeUndefined();
    const firstBody = first.body as {
      items: { id: string; name: string }[];
      nextCursor: string | null;
    };
    expect(firstBody.items.map((item) => item.name)).toEqual(
      Array.from({ length: 20 }, (_, index) => `cache-item-${String(index).padStart(3, '0')}`),
    );
    expect(new Set(firstBody.items.map((item) => item.id)).size).toBe(20);
    expect(typeof firstBody.nextCursor).toBe('string');
    expect(firstBody.nextCursor).not.toBe('');
    await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
    const beforeMore = observer.ledger.reads.length;
    const version = observer.ledger.boundaryVersion;
    await element(page, qa, 'loadMoreGroups').click();
    try {
      // Stable preparation is already established. Failure to produce 23 visible
      // items remains a product assertion failure, not a new BLOCKED escape.
      await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
    } finally {
      observer.unchanged(version);
    }
    const second = observer.ledger.reads
      .slice(beforeMore)
      .find((read) => matchesQuery(read.url, firstBody.nextCursor))!;
    expect(second, '加载更多必须使用当前首页返回的cursor').toBeDefined();
    await directoryPremise(
      () => second.endedAt !== undefined,
      '可见23项对应的真实cursor响应已完成',
    );
    expect(second.status).toBe(200);
    if (second.error || second.body === undefined)
      throw new BlockedError(
        `第二页响应正文未取得，不能确认23项缓存前提：${second.error ?? 'missing body'}`,
      );
    const secondBody = second.body as typeof firstBody;
    expect(secondBody.items.map((item) => item.name)).toEqual([
      'cache-item-020',
      'cache-item-021',
      'cache-item-022',
    ]);
    expect(secondBody.nextCursor).toBeNull();
    const expectedIds = [...firstBody.items, ...secondBody.items].map((item) => item.id);
    expect(new Set(expectedIds).size).toBe(23);
    await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
    const captureVisibleIds = async (phase: string) => {
      const items = await element(page, qa, 'directoryItem').all();
      const hrefs = await Promise.all(
        items.map((item) => child(item, qa, 'directoryLink').getAttribute('href')),
      );
      const ids = directoryGroupIds(hrefs, page.url());
      await qa.evidence(`ui-directory-cache-identities-${phase}`, { expectedIds, hrefs, ids });
      expect(new Set(ids).size).toBe(23);
      expect(ids).toEqual(expectedIds);
    };
    await captureVisibleIds('before-detail');
    observer.unchanged(version);
    const selected = card(page, qa, 'cache-item-022');
    await selected.scrollIntoViewIfNeeded();
    await child(selected, qa, 'directoryLink').click();
    await expect(page.locator('body')).toContainText(/群主|creator/);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(element(page, qa, 'search')).toHaveValue('cache-item');
    await expect(element(page, qa, 'order')).toHaveValue('asc');
    await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
    await captureVisibleIds('after-return');
    await expect(card(page, qa, 'cache-item-022')).toBeInViewport();
    await expect(element(page, qa, 'directoryLoadedCount')).toContainText('23');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(element(page, qa, 'search')).toHaveValue('');
    await expect(element(page, qa, 'order')).toHaveValue('desc');
    await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  } finally {
    observer.dispose();
    await qa.evidence('ui-directory-return-premises', observer.ledger);
    observer.assertProtocol();
  }
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
  // Foreground presentation alone leaves this first message pending. Confirm
  // that distinct target before isolating the later background-message case.
  await page.getByText('前台安静内容', { exact: true }).click();
  await expect(element(page, qa, 'attentionRefresh')).toBeHidden();
  await expect(page).toHaveTitle(quietTitle);
  await expect.poll(() => favicon(page)).toBe(quietIcon);
  await qa.evidence('ui028-foreground-message-confirmed', {
    text: '前台安静内容',
    mechanism: 'real click on the presented foreground message',
    pendingEntryVisible: await element(page, qa, 'attentionRefresh').isVisible(),
    title: await page.title(),
    icon: await favicon(page),
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
  const observer = observeDirectory(page);
  let background: Page | undefined;
  try {
    await login(page, qa);
    // Login already enters the directory. A count of one also matches the old
    // unfiltered result, so it cannot establish the debounced search scope.
    await observer.settle();
    const searchStartedAt = performance.now();
    await element(page, qa, 'search').fill('范围甲');
    const filteredRead = () =>
      observer.ledger.reads.findLast(
        (read) =>
          read.at >= searchStartedAt &&
          new URL(read.url).searchParams.get('q') === '范围甲' &&
          !new URL(read.url).searchParams.has('cursor') &&
          read.endedAt !== undefined,
      );
    await directoryPremise(() => !!filteredRead(), '新搜索范围的精确q首屏响应已经完整返回');
    const searched = filteredRead()!;
    expect(searched.status).toBe(200);
    expect(searched.error).toBeUndefined();
    expect((searched.body as { items: { id: string }[] }).items.map((item) => item.id)).toEqual([
      group.id,
    ]);
    await directoryPremise(
      () =>
        observer.ledger.frames.some(
          (frame) => frame.type === 'scope_ready' && frame.at >= searchStartedAt,
        ),
      '新搜索条件后实际收到scope_ready，不能借用旧空搜索水位',
    );
    await observer.settle();
    await expect(element(page, qa, 'search')).toHaveValue('范围甲');
    await expect(card(page, qa, '范围甲唯一记录')).toHaveCount(1);
    await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
    await qa.evidence('ui030-search-scope-premise', {
      searchStartedAt,
      filteredRead: searched,
      frames: observer.ledger.frames.filter((frame) => frame.at >= searchStartedAt),
      replayObserved: observer.ledger.replayObserved(),
      boundaryVersion: observer.ledger.boundaryVersion,
      visibleGroupIds: directoryGroupIds(
        await element(page, qa, 'directoryItem').evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('href')),
        ),
        page.url(),
      ),
    });
    const quietTitle = await page.title();
    background = await backgroundTab(page);
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
    await background?.close();
    observer.dispose();
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

test('[UI-032] 提醒确认不改变刷新后的分页资格或恢复旧分页链', async ({ qa, page }) => {
  await qa.api.login();
  const pageSize = 20;
  type Row = { id: string; name: string; createdAt: string };
  type DirectoryPage = { items: Row[]; nextCursor: string | null };
  const seeded: Row[] = [];
  for (let i = 0; i < 2 * pageSize + 1; i++) {
    const { group } = await qa.api.createGroup();
    const name = `游标提醒-${i}`;
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name }));
    const detail = await qa.api.require(qa.api.get<Row>(`/api/groups/${group.id}`));
    if (typeof detail.createdAt !== 'string' || !Number.isFinite(Date.parse(detail.createdAt)))
      throw new BlockedError('公开群创建时间未取得，不能建立独立排序预期');
    seeded.push({ id: group.id, name, createdAt: detail.createdAt });
  }
  // Public timestamps may lose database microseconds. Do not invent a tie order
  // from rounded values; this fixture deliberately requires distinct public ms.
  if (new Set(seeded.map((row) => Date.parse(row.createdAt))).size !== seeded.length)
    throw new BlockedError('公开创建时间存在毫秒重合；本例不能凭显示精度推断数据库微秒顺序');
  const ordered = [...seeded].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const firstIds = ordered.slice(0, pageSize).map((row) => row.id);
  const secondIds = ordered.slice(pageSize, 2 * pageSize).map((row) => row.id);
  const loadedIds = [...firstIds, ...secondIds];
  const observer = observeDirectory(page);
  const continuity = observePageContinuity(page);
  type Read = (typeof observer.ledger.reads)[number];
  const evidence: Record<string, unknown> = {
    seeded,
    independentlyOrderedIds: ordered.map((r) => r.id),
  };
  type DirectoryRequest = {
    at: number;
    url: string;
    phase: string;
    responseAt?: number;
    status?: number;
  };
  const requests: DirectoryRequest[] = [];
  const requestIdentities = new Map<Request, DirectoryRequest>();
  const faults: { at: number; url: string; requestId: string }[] = [];
  let phase = 'initial-two-pages';
  let failDirectory = false;
  let background: Page | undefined;
  let primary: unknown;
  const onRequest = (request: Request) => {
    if (!directoryRequest(request)) return;
    const entry = { at: performance.now(), url: request.url(), phase };
    requests.push(entry);
    requestIdentities.set(request, entry);
  };
  const onResponse = (response: import('@playwright/test').Response) => {
    const entry = requestIdentities.get(response.request());
    if (entry) {
      entry.responseAt = performance.now();
      entry.status = response.status();
    }
  };
  const injectFailure = async (route: import('@playwright/test').Route) => {
    if (!failDirectory || !directoryRequest(route.request())) return route.continue();
    const requestId = `qa-ui032-refresh-${faults.length + 1}`;
    faults.push({ at: performance.now(), url: route.request().url(), requestId });
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'QA directory refresh unavailable',
          requestId,
        },
      }),
    });
  };
  const query = (url: string) => {
    const params = new URL(url).searchParams;
    return {
      q: (params.get('q') ?? '').trim(),
      order: params.get('order') ?? 'desc',
      status: params.get('status') ?? '',
      agentEnabled: params.get('agentEnabled') ?? '',
      pageSize: Number(params.get('pageSize') ?? 20),
    };
  };
  const conditions = async () =>
    Object.fromEntries(
      await Promise.all(
        ['search', 'order', 'statusFilter', 'agentFilter'].map(async (key) => [
          key,
          await element(page, qa, key).inputValue(),
        ]),
      ),
    );
  const renderedIds = async () =>
    directoryGroupIds(
      await Promise.all(
        (await element(page, qa, 'directoryItem').all()).map((item) =>
          child(item, qa, 'directoryLink').getAttribute('href'),
        ),
      ),
      page.url(),
    );
  const cursor = (read: { url: string }) => new URL(read.url).searchParams.get('cursor');
  const body = (read: Read): DirectoryPage => {
    expect(read.status, '实际目录响应必须成功').toBe(200);
    if (read.error || read.body === undefined)
      throw new BlockedError(`目录真实响应正文未取得：${read.error ?? 'missing body'}`);
    const value = read.body as DirectoryPage;
    expect(Array.isArray(value.items)).toBe(true);
    expect(
      value.nextCursor === null ||
        (typeof value.nextCursor === 'string' && value.nextCursor.length > 0),
    ).toBe(true);
    return value;
  };
  const publicAction = async (key: string, label: string) => {
    const action = element(page, qa, key);
    await requireAvailablePublicAction(action, label, (sample) => {
      evidence[`${phase}:${key}`] = sample;
    });
    return action;
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  try {
    await page.route('**/api/group-directory**', injectFailure);
    await login(page, qa);
    await expect(element(page, qa, 'directoryItem')).toHaveCount(pageSize);
    await observer.settle();
    const first = observer.ledger.reads.findLast((read) => cursor(read) === null)!;
    const firstPage = body(first);
    expect(firstPage.items.map((row) => row.id)).toEqual(firstIds);
    expect(await renderedIds()).toEqual(firstIds);
    const originalQuery = query(first.url);
    expect(originalQuery).toEqual({ q: '', order: 'desc', status: '', agentEnabled: '', pageSize });
    if (!firstPage.nextCursor) throw new BlockedError('41条匹配数据未形成可继续加载的首页前提');
    const beforeMore = observer.ledger.reads.length;
    const initialVersion = observer.ledger.boundaryVersion;
    await (await publicAction('loadMoreGroups', '需要真实首页加载更多入口')).click();
    await expect(element(page, qa, 'directoryItem')).toHaveCount(2 * pageSize);
    observer.unchanged(initialVersion);
    await directoryPremise(
      () =>
        observer.ledger.reads
          .slice(beforeMore)
          .some((read) => cursor(read) === firstPage.nextCursor && read.endedAt !== undefined),
      '首页公开cursor的第二页完整响应',
    );
    const second = observer.ledger.reads
      .slice(beforeMore)
      .find((read) => cursor(read) === firstPage.nextCursor && read.endedAt !== undefined)!;
    const secondPage = body(second);
    expect(query(second.url)).toEqual(originalQuery);
    expect(secondPage.items.map((row) => row.id)).toEqual(secondIds);
    if (!secondPage.nextCursor)
      throw new BlockedError('已加载40条，但第二页无剩余游标；不能证明原可续页资格被禁止');
    expect(await renderedIds()).toEqual(loadedIds);
    expect(new Set(loadedIds).size).toBe(2 * pageSize);
    await expect(
      await publicAction('loadMoreGroups', '变更前第二页必须仍有真实可用续页入口'),
    ).toBeEnabled();
    await observer.settle();
    const originalDocument = await continuity.capture();
    const originalConditions = await conditions();
    const quietTitle = await page.title();
    const changed = secondPage.items[0]!;
    const oldName = seeded.find((row) => row.id === changed.id)!.name;
    const newName = `${oldName}-已变化`;
    evidence.original = {
      first,
      second,
      conditions: originalConditions,
      query: originalQuery,
      loadedIds,
      remainingCursor: secondPage.nextCursor,
      changedId: changed.id,
      originalDocument: originalDocument.point,
    };
    background = await backgroundTab(page);
    phase = 'stale-old-chain-forbidden';
    const forbiddenFrom = requests.length;
    // This client session is independent of the browser session. The target is
    // chosen from the actual second page, not from creation-order assumptions.
    await qa.api.require(qa.api.patch(`/api/groups/${changed.id}`, { name: newName }));
    await expect(element(page, qa, 'directoryStale')).toBeVisible();
    await expect(page).not.toHaveTitle(quietTitle);
    await observer.settle();
    await page.bringToFront();
    let stableVersion = observer.ledger.boundaryVersion;
    let activeDocument = originalDocument;
    let refreshWindow: { startedAt: number; requestIndex: number; frameIndex: number } | undefined;
    const refreshChecks: unknown[] = [];
    const checkRefreshBoundary = async (requireReady: boolean) => {
      const window = refreshWindow!;
      let sameDocument = false;
      try {
        sameDocument = await page.evaluate((old) => old === document, originalDocument.document);
      } catch {
        /* evidence below blocks */
      }
      const baseline = continuity.ledger.scopeReplies[originalDocument.point.scopeReady - 1];
      if (!baseline || baseline.startSeq === undefined)
        throw new BlockedError('原目录scope缺少真实连接/水位身份');
      const activeSockets = observer.ledger.sockets.filter((socket) => !socket.closed);
      if (activeSockets.length !== 1) throw new BlockedError('整体刷新未保留唯一真实WS连接');
      const sample = {
        before: originalDocument.point,
        after: continuity.ledger.snapshot(page.url()),
        sameDocument,
        baselineSocketId: baseline.socketId,
        baselineStartSeq: baseline.startSeq,
        refreshStartedAt: window.startedAt,
        reads: requests.slice(window.requestIndex).map((read) => ({ ...read })),
        markers: continuity.ledger.scopeMarkers.slice(originalDocument.point.scopeMarkers),
        replies: continuity.ledger.scopeReplies.slice(originalDocument.point.scopeReady),
        previousMarkerIds: continuity.ledger.scopeMarkers
          .slice(0, originalDocument.point.scopeMarkers)
          .flatMap((marker) => (marker.requestId ? [marker.requestId] : [])),
        receivedSequences: [...activeSockets[0]!.sequences],
        frames: observer.ledger.frames.slice(window.frameIndex),
        requireReady,
      };
      refreshChecks.push({ at: performance.now(), ...sample });
      observer.assertProtocol();
      assertDirectoryRefreshBoundary(sample);
    };
    evidence.refreshBoundaryChecks = refreshChecks;
    const unchanged = async () => {
      if (refreshWindow) await checkRefreshBoundary(false);
      else {
        await continuity.unchanged(activeDocument);
        observer.unchanged(stableVersion);
      }
    };
    const oldState = async () => {
      await expect(element(page, qa, 'directoryStale')).toBeVisible();
      expect(await renderedIds()).toEqual(loadedIds);
      expect(await conditions()).toEqual(originalConditions);
      await expect(page).not.toHaveTitle(quietTitle);
      const more = element(page, qa, 'loadMoreGroups');
      expect(
        (await more.count()) === 0 || (await more.isDisabled()),
        'stale时旧续页必须不可操作',
      ).toBe(true);
      expect(
        requests.slice(forbiddenFrom).filter((read) => cursor(read) !== null),
        'stale/失败刷新期间不得续接任何旧分页链',
      ).toEqual([]);
      await expect(card(page, qa, oldName)).toHaveCount(1);
      await expect(card(page, qa, newName)).toHaveCount(0);
    };
    await withContinuityEvidence(
      unchanged,
      async (check) => {
        await remains(() => check('focus-does-not-confirm-unpresented-version', oldState));
        // The public cards are navigation anchors. Use an approved real wheel
        // interaction over the old card instead of cancelling a link's default action.
        const oldCard = card(page, qa, oldName);
        await oldCard.scrollIntoViewIfNeeded();
        await oldCard.hover();
        await page.mouse.wheel(0, 120);
        await remains(() => check('old-card-wheel-does-not-confirm-new-version', oldState));
        phase = 'failed-full-refresh';
        failDirectory = true;
        const failedReadIndex = observer.ledger.reads.length;
        await (
          await publicAction('refreshDirectory', '需要现有公开整体刷新入口，不能调用内部控制器')
        ).click();
        await directoryPremise(
          () =>
            observer.ledger.reads
              .slice(failedReadIndex)
              .some((read) => read.endedAt !== undefined && read.status === 503),
          '实际点击后真实目录503响应',
        );
        await check('failed-refresh-keeps-old-list-attention-and-stale', async () => {
          await expect(element(page, qa, 'directoryError')).toBeVisible();
          await oldState();
        });
        await remains(() => check('failed-refresh-remains-unconfirmed', oldState), 2000);
        evidence.failedRefresh = {
          at: performance.now(),
          readIndex: failedReadIndex,
          reads: observer.ledger.reads.slice(failedReadIndex),
          faults: [...faults],
          renderedIds: await renderedIds(),
          conditions: await conditions(),
          title: await page.title(),
        };
        // Keep the fault active until the existing action is really available.
        // No retry count or diagnostic wait becomes a new product SLA.
        await directoryPremise(
          () => observer.ledger.reads.every((read) => read.endedAt !== undefined),
          '故障阶段已发出的真实读取都已结束',
        );
        await check('old-chain-disabled-immediately-before-recovery', oldState);
        const refresh = await publicAction(
          'attentionRefresh',
          '失败读取结束且旧状态已核对后，需重新取得已有“刷新并查看更新”入口以呈现当前范围摘要',
        );
        phase = 'successful-fresh-first-page';
        failDirectory = false;
        const freshIndex = observer.ledger.reads.length;
        const refreshClickedAt = performance.now();
        refreshWindow = {
          startedAt: refreshClickedAt,
          requestIndex: requests.length,
          frameIndex: observer.ledger.frames.length,
        };
        await refresh.click();
        await check('successful-full-refresh-replaces-old-two-pages', async () => {
          await expect(element(page, qa, 'directoryItem')).toHaveCount(pageSize);
          await expect(element(page, qa, 'directoryStale')).not.toBeVisible();
          await expect(element(page, qa, 'directoryError')).not.toBeVisible();
          expect(await renderedIds()).toEqual(firstIds);
          expect(await conditions()).toEqual(originalConditions);
        });
        await directoryPremise(
          () =>
            observer.ledger.reads
              .slice(freshIndex)
              .some(
                (read) =>
                  cursor(read) === null && read.status === 200 && read.endedAt !== undefined,
              ),
          '恢复操作之后真实成功的新首页正文',
        );
        const freshCandidates = observer.ledger.reads
          .slice(freshIndex)
          .filter(
            (read) => cursor(read) === null && read.status === 200 && read.endedAt !== undefined,
          );
        const fresh = freshCandidates.at(-1)!;
        const freshPage = body(fresh);
        await check('fresh-response-has-independent-first-page-and-cursor', async () => {
          for (const read of freshCandidates) {
            expect(query(read.url)).toEqual(originalQuery);
            expect(body(read).items.map((row) => row.id)).toEqual(firstIds);
          }
          expect(firstIds).not.toContain(changed.id);
          expect(typeof freshPage.nextCursor).toBe('string');
          expect(freshPage.nextCursor).not.toBe('');
        });
        if (freshCandidates.some((read) => body(read).nextCursor !== freshPage.nextCursor))
          throw new BlockedError(
            '刷新与合法首屏探测返回不同cursor，公开证据不足以确定已应用响应来源',
          );
        // An old second-page target need not be injected into the new first-page
        // DOM. Its existing current-result/range summary is the legitimate evidence.
        const summary = element(page, qa, 'attentionScopeSummary');
        const confirm = await publicAction(
          'attentionScopeConfirm',
          '刷新成功且范围摘要真实呈现后，需已有公开范围确认入口；不可用则BLOCKED',
        );
        if (!(await summary.isVisible()))
          throw new BlockedError('尚未真实呈现当前查询范围摘要，不能确认新版本');
        await check('fresh-result-summary-presents-current-range', async () => {
          await expect(summary).toContainText(`当前显示 ${pageSize} 个群`);
          await expect(summary).toContainText('后续结果可继续加载');
          await expect(page).not.toHaveTitle(quietTitle);
        });
        // Capture a later baseline only after the old stale/failure assertions
        // are preserved and a real successful refresh has a complete matched ack.
        await directoryPremise(
          () =>
            continuity.ledger.scopeMarkers.length - originalDocument.point.scopeMarkers ===
            continuity.ledger.scopeReplies.length - originalDocument.point.scopeReady,
          '真实成功刷新后的scope marker均有实际ack',
        );
        await checkRefreshBoundary(true);
        const refreshedDocument = await continuity.capture();
        // capture awaits the browser: recheck the original document and full
        // prior ledger before accepting anything observed during that await.
        await checkRefreshBoundary(true);
        activeDocument = refreshedDocument;
        stableVersion = observer.ledger.boundaryVersion;
        evidence.confirmationBaseline = {
          original: originalDocument.point,
          refreshed: activeDocument.point,
          afterResponseChecks: refreshChecks.length,
        };
        refreshWindow = undefined;
        const more = await publicAction(
          'loadMoreGroups',
          '新首页响应存在nextCursor时，需真实加载更多入口',
        );
        const beforeConfirm = {
          at: performance.now(),
          ids: await renderedIds(),
          conditions: await conditions(),
          moreEnabled: await more.isEnabled(),
          stale: await element(page, qa, 'directoryStale').isVisible(),
          readIndex: observer.ledger.reads.length,
          requestIndex: requests.length,
        };
        evidence.newGeneration = {
          refreshClickedAt,
          freshIndex,
          fresh,
          freshCandidates,
          firstPageIds: firstIds,
          nextCursorSource: {
            readIndex: observer.ledger.reads.indexOf(fresh),
            nextCursor: freshPage.nextCursor,
          },
          summary: await summary.innerText(),
          beforeConfirm,
        };
        phase = 'confirm-presented-fresh-range';
        await confirm.click();
        await check('confirmation-clears-only-presented-batch', () =>
          expect(page).toHaveTitle(quietTitle),
        );
        await remains(() =>
          check('confirmation-does-not-change-fresh-pagination', async () => {
            expect(await renderedIds()).toEqual(beforeConfirm.ids);
            expect(await conditions()).toEqual(beforeConfirm.conditions);
            await expect(element(page, qa, 'directoryStale')).not.toBeVisible();
            await expect(element(page, qa, 'loadMoreGroups')).toBeEnabled();
            expect(
              requests.slice(beforeConfirm.requestIndex).filter((read) => cursor(read) !== null),
            ).toEqual([]);
          }),
        );
        evidence.afterConfirm = {
          at: performance.now(),
          ids: await renderedIds(),
          conditions: await conditions(),
          moreEnabled: await element(page, qa, 'loadMoreGroups').isEnabled(),
          title: await page.title(),
          reads: observer.ledger.reads.slice(beforeConfirm.readIndex),
        };
        phase = 'load-more-from-fresh-response';
        const newMoreIndex = observer.ledger.reads.length;
        await check(
          'no-unsolicited-continuation-across-stale-refresh-and-confirmation',
          async () => {
            expect(requests.slice(forbiddenFrom).filter((read) => cursor(read) !== null)).toEqual(
              [],
            );
          },
        );
        await element(page, qa, 'loadMoreGroups').click();
        await check('new-pagination-chain-renders-independent-second-page', async () => {
          await expect(element(page, qa, 'directoryItem')).toHaveCount(2 * pageSize);
          expect(await renderedIds()).toEqual(loadedIds);
          expect(await conditions()).toEqual(originalConditions);
          await expect(card(page, qa, newName)).toHaveCount(1);
        });
        await directoryPremise(
          () =>
            observer.ledger.reads.slice(newMoreIndex).filter((read) => cursor(read) !== null)
              .length > 0 &&
            observer.ledger.reads
              .slice(newMoreIndex)
              .filter((read) => cursor(read) !== null)
              .every((read) => read.endedAt !== undefined),
          '确认后实际续页的完整响应',
        );
        const followups = observer.ledger.reads
          .slice(newMoreIndex)
          .filter((read) => cursor(read) !== null);
        await check('actual-continuation-uses-new-response-source', async () => {
          expect(followups.length).toBeGreaterThan(0);
          for (const read of followups) {
            expect(
              cursor(read),
              '续页来源必须是恢复成功的新首页响应；不要求新旧cursor字符串不同',
            ).toBe(freshPage.nextCursor);
            expect(query(read.url)).toEqual(originalQuery);
            const response = body(read);
            expect(response.items.map((row) => row.id)).toEqual(secondIds);
            expect(response.items.find((row) => row.id === changed.id)?.name).toBe(newName);
          }
        });
        evidence.newContinuation = {
          freshResponseIndex: observer.ledger.reads.indexOf(fresh),
          freshCursor: freshPage.nextCursor,
          followups,
          renderedIds: await renderedIds(),
          limitation:
            '按请求阶段与实际响应来源证明新分页资格；不要求游标字节变化或服务端撤销旧字符串。',
        };
      },
      (outcome) => {
        evidence.continuityOutcome = outcome;
      },
    );
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    failDirectory = false;
    page.off('request', onRequest);
    page.off('response', onResponse);
    const outcomes = await Promise.allSettled([
      page.unroute('**/api/group-directory**', injectFailure),
      background?.close(),
      qa.evidence('ui-directory-confirmation-flow', {
        ...evidence,
        phase,
        requests,
        faults,
        directory: observer.ledger,
        continuity: continuity.ledger.events,
        continuityChecks: continuity.ledger.checks,
      }),
    ]);
    observer.dispose();
    outcomes.push(...(await Promise.allSettled([continuity.dispose()])));
    const errors = outcomes.filter((result) => result.status === 'rejected');
    try {
      observer.assertProtocol();
    } catch (error) {
      errors.push({ status: 'rejected', reason: error });
    }
    if (errors.length) {
      if (!primary)
        throw new Error(
          `UI-032取证/清理或协议检查失败：${errors.map((result) => String(result.reason)).join('; ')}`,
        );
      console.error('UI-032 secondary evidence/cleanup errors; primary retained', errors);
    }
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


test('[UI-038] 审计阻塞说明不否认前序真实成功副作用', async ({ qa, page }) => {
  function assertScopedBlockedCopy(text: string): void {
    assert.match(text, /本次工具|当前工具|this tool|current tool/i, '阻塞说明须限定本次工具');
    assert.match(
      text,
      /未执行|没有执行|blocked before its side effect|not executed/i,
      '说明须明确本次工具未执行副作用',
    );
    assert.match(
      text,
      /此前步骤|先前步骤|前序步骤|earlier.*steps|previous.*steps/i,
      '说明须保留前序步骤可能已执行的事实',
    );
    assert.doesNotMatch(
      text,
      /The run is blocked; no side effect was executed|整个运行.{0,15}(未执行|没有|无)副作用|所有步骤.{0,10}未执行|全部.{0,8}(已撤销|已回滚)|审计阻塞\s*[·—-]\s*副作用未执行|审计未得到明确结论，副作用已阻止/i,
      '不得将本次阻止扩写为整个运行没有副作用或已回滚',
    );
  }
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const suffix = randomUUID(),
    first = `already-sent-${suffix}`,
    second = `must-not-send-${suffix}`;
  const firstText = `先前已真实发送 ${suffix}`,
    secondText = `本次审计阻塞 ${suffix}`;
  const barrier = `second-tool-response-${suffix}`;
  const before = qa.gateway.snapshot();
  const plan = (id: string, text: string) => ({
    body: {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id, name: 'send_message', input: { text, idempotency_key: id } },
      ],
    },
  });
  qa.agent.enqueueTurns(plan(first, firstText), {
    ...plan(second, secondText),
    barrier: { phase: 'before-response', name: barrier },
  });
  qa.agent.enqueueAudits(
    { body: { verdict: 'pass', reason: 'independent QA pass' } },
    { status: 500 },
    { rawBody: 'invalid' },
    { body: { verdict: 'unknown' } },
  );
  let runId: string | undefined;
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      senderPlatformUserId: 'copy-probe',
      text: `真实两工具场景 ${suffix}`,
    });
    const created = await observe({
      read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      invariant: (items) => assert.ok(items.length <= 1, '独立群不应创建多个run'),
      complete: (items) => items.length === 1,
      durationMs: 15_000,
    });
    if (!created.complete) throw new BlockedError('有限观察未取得真实run；不是新增15秒SLA');
    runId = created.last[0]!.id;
    try {
      await qa.agent.barriers.waitFor(barrier, 15_000);
    } catch (error) {
      const actual = await qa.api.agentRun(runId);
      await qa.evidence('ui038-copy-first-window-missed', { actual, error: String(error) });
      assert.equal(actual.status, 'running', '合法两工具计划不应在第二轮前提前终态');
      throw new BlockedError('未取得第二工具响应屏障；不得假称已建立前序副作用');
    }
    const prior = await observe({
      read: () => qa.api.messages(group.id),
      invariant: (list) =>
        assert.ok(list.items.filter((m) => m.isOwn && m.text === firstText).length <= 1),
      complete: (list) =>
        list.items.some((m) => m.isOwn && m.text === firstText && m.deliveryStatus === 'sent'),
      durationMs: 5_000,
    });
    if (!prior.complete) throw new BlockedError('未取得前序实际sent；不拿accepted冒充落地');
    const firstState = await qa.api.agentRun(runId);
    assert.equal(firstState.steps.length, 1);
    assert.equal(firstState.steps[0]!.toolUseId, first);
    assert.equal(firstState.steps[0]!.isError, false);
    const landed = qa.gateway
      .snapshot()
      .messages.filter((m) => m.groupId === group.gatewayGroupId && m.text === firstText);
    assert.equal(landed.length, 1, '公开sent必须同时有独立远端落地');
    await qa.evidence('ui038-copy-prior-effect', {
      run: firstState,
      publicMessages: prior.last,
      landed,
    });
    qa.agent.barriers.release(barrier);
    const terminal = await observe({
      read: () => qa.api.agentRun(runId!),
      invariant: (actual) => {
        assert.equal(actual.id, runId);
        assert.ok(actual.steps.length <= 2);
        assert.equal(
          qa.gateway
            .snapshot()
            .messages.filter((m) => m.groupId === group.gatewayGroupId && m.text === secondText)
            .length,
          0,
          '本次工具三次审计无明确pass，禁止真实发送',
        );
      },
      complete: (actual) => actual.status !== 'running',
      durationMs: 25_000,
    });
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
    assert.equal(
      facts.messages.filter((m) => m.groupId === group.gatewayGroupId && m.text === firstText)
        .length,
      1,
    );
    assert.equal(
      facts.requests
        .slice(before.requests.length)
        .filter((r) => r.method === 'POST' && r.path.endsWith('/send')).length,
      1,
    );
    // The public audit protocol binds groupId/text, not runId.
    const audits = qa.agent
      .snapshot()
      .audits.filter((r) => (r.body as { groupId?: string }).groupId === group.id);
    assert.equal(audits.length, 4, '第一工具审计pass一次，第二工具真实三次无结论');
    assert.equal(audits.filter((r) => (r.body as { text?: string }).text === firstText).length, 1);
    assert.equal(audits.filter((r) => (r.body as { text?: string }).text === secondText).length, 3);
    await login(page, qa);
    await go(page, qa, 'group', group.id);
    const link = element(page, qa, 'runLink').and(
      page.locator(`a[href$="/${encodeURIComponent(runId)}"]`),
    );
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    const listText = await link.innerText();
    assertScopedBlockedCopy(listText);
    await link.click();
    await expect(page).toHaveURL((url) => decodeURIComponent(url.href).endsWith(`/${runId}`));
    for (const input of [firstText, secondText]) {
      if (!(await page.locator('main').innerText()).includes(input)) {
        const collapsed = page.locator('main details:not([open])').filter({ hasText: input });
        // Only operate a unique actual public disclosure. Never turn hidden DOM
        // text into evidence that an operator can read the input.
        if ((await collapsed.count()) === 1) {
          const disclosure = collapsed.locator(':scope > summary');
          await expect(disclosure).toBeVisible();
          await disclosure.click();
        }
      }
    }
    const detailText = await page.locator('main').innerText();
    expect(detailText).toContain(firstText);
    expect(detailText).toContain(secondText);
    assertScopedBlockedCopy(detailText);
    const afterBrowser = await qa.api.agentRun(runId);
    assert.deepEqual(afterBrowser, actual, '纯查看不改变已落地/阻塞轨迹');
    await qa.evidence('ui038-copy-blocked-after-effect', {
      actual,
      audits,
      publicMessages: await qa.api.messages(group.id),
      gateway: facts,
      listText,
      detailText,
    });
  } finally {
    qa.agent.barriers.release(barrier);
    await qa.evidence('ui038-copy-final-facts', {
      runId,
      agent: qa.agent.snapshot(),
      gateway: qa.gateway.snapshot(),
    });
  }
});

test('[UI-039] 真实零步骤failed与cancelled详情不再提示等待第一步', async ({ qa, page }) => {
  test.setTimeout(120_000);
  type Role = 'failed' | 'cancelled';
  type BoundRun = { group: Group; runId: string };
  type Read = { beforeMono: number; afterMono: number; value: AgentRun };
  type Targets<T> = { failed: T; cancelled: T };
  const timing = {
    modelMs: 14_000,
    auditMs: 4_000,
    effectMs: 10_000,
    responseMs: 10_000,
    requiredModelTimeoutMs: '15000',
    diagnosticMs: 70_000,
  } as const;
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const requestRunId = (request: AgentRequest) => String(object(request.body).runId ?? '');
  function requestGroupId(request: AgentRequest): string | undefined {
    const messages = object(request.body).messages;
    if (!Array.isArray(messages)) return undefined;
    const content = object(messages[0]).content;
    if (!Array.isArray(content)) return undefined;
    try {
      return String(object(JSON.parse(String(object(content[0]).text))).groupId ?? '');
    } catch {
      return undefined;
    }
  }

  function firstHolderPlans(): AgentResponsePlan[] {
    return Array.from({ length: 4 }, () => ({
      responseDelayMs: timing.modelMs,
      body: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'holder-read',
            name: 'get_recent_messages',
            input: { limit: 10 },
          },
        ],
      },
    }));
  }
  function boundHolderPlans(runIds: string[], nonce: string): AgentResponsePlan[] {
    assert.equal(new Set(runIds).size, 4, 'Four distinct observed holder runs are required');
    assert.equal(runIds.length, 4);
    // TakePlan searches by actual runId. Different second/third arrival order cannot
    // accidentally consume another holder's plan or a target's scripted response.
    return runIds.flatMap((runId, index) => [
      {
        runId,
        responseDelayMs: timing.modelMs,
        body: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'holder-send',
              name: 'send_message',
              input: {
                text: `holder-effect:${nonce}:${runId}`,
                idempotency_key: `h${index + 1}`,
              },
            },
          ],
        },
      },
      {
        runId,
        responseDelayMs: timing.modelMs,
        body: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'holder-finish',
              name: 'finish',
              input: { summary: `holder-finished:${nonce}:${runId}` },
            },
          ],
        },
      },
    ]);
  }
  function fourInitialHolderRequests(holderRuns: BoundRun[], requests: AgentRequest[]): boolean {
    if (holderRuns.length !== 4 || new Set(holderRuns.map((r) => r.runId)).size !== 4) return false;
    return holderRuns.every((holder) => {
      const matching = requests.filter((r) => requestRunId(r) === holder.runId);
      return (
        matching.length === 1 &&
        requestGroupId(matching[0]!) === holder.group.id &&
        matching[0]!.completedAt === undefined &&
        matching[0]!.responseStatus === undefined
      );
    });
  }

  function classifyZeroStepTarget(
    role: Role,
    run: AgentRun,
    actualModelCalls: number,
    actualAuditCalls: number,
    actualSendOrKickCalls: number,
    actualOwnMessages: number,
  ) {
    // Known protocol/effect violations must survive a neighbouring missed premise.
    if (run.status === 'cancelled') assert.equal(run.endReason, 'cancelled');
    if (run.status === 'failed')
      assert.ok(
        ['wall_clock', 'budget_exhausted', 'protocol_errors'].includes(run.endReason ?? ''),
      );
    if (actualModelCalls === 0) {
      assert.equal(actualAuditCalls, 0, 'No actual target model dispatch can justify an audit');
      assert.equal(
        actualSendOrKickCalls,
        0,
        'No actual target model dispatch can justify a tool side effect',
      );
      assert.equal(
        actualOwnMessages,
        0,
        'No actual target model dispatch can justify an own message',
      );
    }
    const ready =
      run.status === role &&
      run.endReason === (role === 'failed' ? 'wall_clock' : 'cancelled') &&
      run.steps.length === 0 &&
      actualModelCalls === 0;
    return {
      ready,
      role,
      actualStatus: run.status,
      actualEndReason: run.endReason,
      actualSteps: run.steps.length,
      actualModelCalls,
      reason: ready
        ? 'Real public terminal, empty steps and complete external ledger has zero target model calls'
        : 'Actual workload did not establish this requested zero-step terminal; this is not a status-copy PASS',
    };
  }

  /** The returned targets are separate UI prerequisites, not a whole-case PASS.
   * Call the existing public page assertions independently for every ready target;
   * preserve a proved UI FAIL; collect missing target states as BLOCKED afterwards.
   */
  async function preparePublicQueueZeroSteps(qa: QaEnvironment) {
    if (qa.config.sut.env.AGENT_TURN_TIMEOUT_MS !== timing.requiredModelTimeoutMs)
      throw new BlockedError(
        'UI039 dedicated frozen target must explicitly set AGENT_TURN_TIMEOUT_MS=15000; do not reuse the 12000 target',
      );
    await qa.api.login();
    const groups: Group[] = [];
    const snapshots: unknown[] = [];
    const nonce = randomUUID();
    let bound: { holders: BoundRun[]; targets: Targets<BoundRun> } | undefined;
    const targetEverDispatched = { failed: false, cancelled: false };
    const blocked: string[] = [];
    const readRun = async (runId: string): Promise<Read> => {
      const beforeMono = performance.now();
      const value = await qa.api.agentRun(runId);
      return { beforeMono, afterMono: performance.now(), value };
    };
    const createObservedRun = async (group: Group): Promise<BoundRun> => {
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
      qa.gateway.emitMessage({
        groupId: group.gatewayGroupId,
        senderPlatformUserId: `queue-probe-${nonce}`,
        text: `public-queue-fixture:${nonce}:${group.id}`,
      });
      const seen = await observe({
        read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
        invariant: (items) =>
          assert.ok(items.length <= 1, 'Independent new group has at most one triggered run'),
        complete: (items) => items.length === 1,
        durationMs: 10_000,
      });
      if (!seen.complete)
        throw new BlockedError('Public run creation not observed within diagnostic budget');
      const actual = seen.last[0]!;
      assert.equal(actual.groupId, group.id);
      return { group, runId: actual.id };
    };
    try {
      // All six groups already exist, active and disabled, before any model delay
      // starts. Group construction time must not consume the 14s proof window.
      for (let i = 0; i < 6; i++) {
        const { group } = await qa.api.createGroup();
        assert.equal(group.status, 'active');
        assert.equal(group.agentEnabled, false);
        groups.push(group);
      }
      qa.agent.enqueueTurns(...firstHolderPlans());
      const holders: BoundRun[] = [];
      for (const group of groups.slice(0, 4)) holders.push(await createObservedRun(group));
      const firstProof = await observe({
        read: async () => ({
          at: new Date().toISOString(),
          observedMono: performance.now(),
          runs: await Promise.all(holders.map((r) => readRun(r.runId))),
          agent: qa.agent.snapshot(),
        }),
        invariant: (sample) => {
          assert.equal(new Set(sample.runs.map((r) => r.value.id)).size, 4);
          snapshots.push({ phase: 'four-holder-initial-requests', ...sample });
        },
        complete: (sample) =>
          sample.runs.every((r) => r.value.status === 'running' && r.value.steps.length === 0) &&
          fourInitialHolderRequests(holders, sample.agent.turns),
        durationMs: 8_000,
      });
      if (!firstProof.complete)
        throw new BlockedError(
          'Four distinct actually pending first model requests not simultaneously proved; do not infer slots from the private implementation',
        );
      await qa.evidence('ui039-public-queue-first-proof', { nonce, holders, firstProof });
      qa.agent.enqueueTurns(
        ...boundHolderPlans(
          holders.map((h) => h.runId),
          nonce,
        ),
      );
      // Audit has groupId/text, no runId. Four identical delayed passes are safe to
      // enqueue globally; their actual groupId/text are checked from raw requests.
      qa.agent.enqueueAudits(
        ...Array.from({ length: 4 }, () => ({
          responseDelayMs: timing.auditMs,
          body: { verdict: 'pass', reason: 'public queue fixture holder only' },
        })),
      );
      for (const holder of holders)
        qa.gateway.enqueue(`/groups/${holder.group.gatewayGroupId}/send`, {
          method: 'POST',
          effectDelayMs: timing.effectMs,
          responseDelayMs: timing.responseMs,
        });
      const failed = await createObservedRun(groups[4]!);
      const cancelled = await createObservedRun(groups[5]!);
      bound = { holders, targets: { failed, cancelled } };
      const sample = async () => {
        const reads = await Promise.all(
          [failed, cancelled, ...holders].map((r) => readRun(r.runId)),
        );
        const agent = qa.agent.snapshot(),
          gateway = qa.gateway.snapshot();
        const mapped = { failed: reads[0]!, cancelled: reads[1]! };
        const targets = Object.fromEntries(
          (['failed', 'cancelled'] as const).map((role) => {
            const target = bound!.targets[role];
            const modelCalls = agent.turns.filter((r) => requestRunId(r) === target.runId);
            targetEverDispatched[role] ||= modelCalls.length > 0;
            const audits = agent.audits.filter((r) => object(r.body).groupId === target.group.id);
            const mutations = gateway.requests.filter(
              (r) =>
                r.method === 'POST' &&
                r.path.startsWith(`/groups/${target.group.gatewayGroupId}/`) &&
                /\/(send|kick)$/.test(r.path),
            );
            const own = gateway.messages.filter(
              (m) => m.groupId === target.group.gatewayGroupId && m.accountId !== null,
            );
            const actual = mapped[role].value;
            assert.equal(actual.id, target.runId);
            assert.equal(actual.groupId, target.group.id);
            return [
              role,
              {
                read: mapped[role],
                modelRequestIds: modelCalls.map((r) => r.id),
                classification: classifyZeroStepTarget(
                  role,
                  actual,
                  modelCalls.length,
                  audits.length,
                  mutations.length,
                  own.length,
                ),
              },
            ];
          }),
        ) as Targets<{
          read: Read;
          modelRequestIds: number[];
          classification: ReturnType<typeof classifyZeroStepTarget>;
        }>;
        const entry = {
          at: new Date().toISOString(),
          observedMono: performance.now(),
          targets,
          holderReads: reads.slice(2),
          holderModelCalls: holders.map((h) => ({
            runId: h.runId,
            requests: agent.turns
              .filter((r) => requestRunId(r) === h.runId)
              .map((r) => ({
                id: r.id,
                at: r.at,
                completedAt: r.completedAt,
                responseStatus: r.responseStatus,
              })),
          })),
        };
        snapshots.push(entry);
        return entry;
      };
      const queueProof = await sample();
      await qa.evidence('ui039-public-queue-before-disable', queueProof);
      const waitingBeforeDisable = Object.fromEntries(
        (['failed', 'cancelled'] as const).map((role) => [
          role,
          queueProof.targets[role].read.value.status === 'running' &&
            queueProof.targets[role].read.value.steps.length === 0 &&
            queueProof.targets[role].modelRequestIds.length === 0,
        ]),
      ) as Targets<boolean>;
      const initialWaiting = waitingBeforeDisable.failed && waitingBeforeDisable.cancelled;
      // This is the actual public operation. No cancellation status is written by QA.
      await qa.api.require(
        qa.api.patch(`/api/groups/${cancelled.group.id}`, { agentEnabled: false }),
      );
      const observed = await observe({
        read: sample,
        invariant: () => {},
        complete: (s) =>
          (['failed', 'cancelled'] as const).every(
            (role) => s.targets[role].read.value.status !== 'running',
          ),
        durationMs: timing.diagnosticMs,
        intervalMs: 100,
      });
      const final = observed.last;
      const readyStates = { failed: false, cancelled: false };
      for (const role of ['failed', 'cancelled'] as const) {
        readyStates[role] =
          waitingBeforeDisable[role] &&
          !targetEverDispatched[role] &&
          final.targets[role].classification.ready;
        // The other target remaining running cannot suppress this target's real
        // ready state or its subsequent independent visible-copy assertion.
        if (!readyStates[role])
          blocked.push(
            `${role}: ${
              waitingBeforeDisable[role]
                ? final.targets[role].classification.reason
                : 'Initial public running/steps=[]/zero-dispatch premise was not established'
            }`,
          );
        if (final.targets[role].read.value.status !== 'running')
          assert.equal((await qa.api.group(bound.targets[role].group.id)).activeAgentRunId, null);
      }
      const agent = qa.agent.snapshot();
      for (const audit of agent.audits) {
        const holder = holders.find((h) => h.group.id === object(audit.body).groupId);
        if (holder) assert.equal(object(audit.body).text, `holder-effect:${nonce}:${holder.runId}`);
      }
      await qa.evidence('ui039-public-queue-final', {
        nonce,
        timing,
        bound,
        initialWaiting,
        waitingBeforeDisable,
        readyStates,
        targetEverDispatched,
        blocked,
        observed,
        agent,
        gateway: qa.gateway.snapshot(),
        boundary:
          'Public waiting state plus retained complete external request ledger; no public queue position/slot field is invented. 51s estimate is not an assertion.',
      });
      return {
        ...bound,
        final,
        readyStates,
        blocked,
        snapshots,
        initialWaiting,
        waitingBeforeDisable,
        targetEverDispatched,
      };
    } finally {
      await qa.evidence('ui039-public-queue-samples', {
        nonce,
        bound,
        snapshots,
        blocked,
        gateway: qa.gateway.snapshot(),
        agent: qa.agent.snapshot(),
      });
      // No custom locks/controllers exist. Caller still owns the ordinary QaEnvironment
      // and must let its normal fixture close pending simulator tasks/SUT/DB/browser.
      // Do not release by killing foreign holders or mutate terminal rows.
    }
  }

  const outcomes: Record<string, unknown> = {};
  const blockers: string[] = [];
  let firstFailure: unknown;
  try {
    const prepared = await preparePublicQueueZeroSteps(qa);
    blockers.push(...prepared.blocked);
    for (const role of ['failed', 'cancelled'] as const) {
      const target = prepared.targets[role];
      const actual = prepared.final.targets[role].read.value;
      if (!prepared.readyStates[role]) {
        outcomes[role] = {
          status: 'BLOCKED',
          runId: target.runId,
          actual,
          observation: prepared.final.targets[role].classification,
        };
        continue;
      }
      try {
        expect(actual.status).toBe(role);
        expect(actual.endReason).toBe(role === 'failed' ? 'wall_clock' : 'cancelled');
        expect(actual.steps).toHaveLength(0);
        await login(page, qa);
        await go(page, qa, 'group', actual.groupId);
        const link = element(page, qa, 'runLink').and(
          page.locator(`a[href$="/${encodeURIComponent(actual.id)}"]`),
        );
        await expect(link).toHaveCount(1);
        await link.click();
        await expect(page).toHaveURL((url) =>
          decodeURIComponent(url.href).endsWith(`/${actual.id}`),
        );
        await expect(page.locator('main')).toContainText(
          role === 'failed' ? /失败|failed/ : /已取消|cancelled/,
        );
        await expect(page.locator('main')).toContainText(
          /暂无步骤|没有步骤|无步骤|no steps|no step records/i,
        );
        const visibleText = await page.locator('main').innerText();
        await qa.evidence(`ui039-${role}-copy`, {
          actual,
          visibleText,
          observedPrerequisite: prepared.final.targets[role],
          beforeDisable: prepared.waitingBeforeDisable[role],
        });
        expect(visibleText).toMatch(/暂无步骤|没有步骤|无步骤|no steps|no step records/i);
        expect(visibleText).not.toMatch(
          /正在等待第一步结果|waiting for (?:the )?first (?:step|result)/i,
        );
        expect(await qa.api.agentRun(actual.id)).toEqual(actual);
        expect((await qa.api.group(actual.groupId)).activeAgentRunId).toBeNull();
        const agent = qa.agent.snapshot(),
          gateway = qa.gateway.snapshot();
        expect(agent.turns.filter((r) => requestRunId(r) === actual.id)).toHaveLength(0);
        expect(agent.audits.filter((r) => object(r.body).groupId === actual.groupId)).toHaveLength(
          0,
        );
        expect(
          gateway.requests.filter(
            (r) =>
              r.method === 'POST' &&
              r.path.startsWith(`/groups/${target.group.gatewayGroupId}/`) &&
              /\/(send|kick)$/.test(r.path),
          ),
        ).toHaveLength(0);
        expect(
          gateway.messages.filter(
            (m) => m.groupId === target.group.gatewayGroupId && m.accountId !== null,
          ),
        ).toHaveLength(0);
        outcomes[role] = { status: 'PASS', runId: actual.id, evidence: `ui039-${role}-copy` };
      } catch (error) {
        if (error instanceof BlockedError) {
          blockers.push(`${role}: ${error.message}`);
          outcomes[role] = { status: 'BLOCKED', runId: actual.id, reason: error.message };
        } else {
          firstFailure ??= error;
          outcomes[role] = { status: 'FAIL', runId: actual.id, reason: String(error) };
        }
      }
    }
    // Independent state checks both run, and a proved error outranks a missing
    // premise in the other state. Never convert the first FAIL to BLOCKED.
    if (firstFailure !== undefined) throw firstFailure;
    if (blockers.length) throw new BlockedError(blockers.join('；'));
    expect(Object.values(outcomes).length).toBe(2);
  } finally {
    await qa.evidence('ui039-per-state-results', {
      outcomes,
      blockers,
      gateway: qa.gateway.snapshot(),
      agent: qa.agent.snapshot(),
      boundary: '真实公开排队前提；两个零步骤终态各有状态与页面证据才PASS，缺前提B不掩盖明确FAIL',
    });
  }
});
