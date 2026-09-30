import type { Page, Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect, qaRoot } from '../fixtures.js';
import { BlockedError, requireAuthorization } from '../../harness/security.js';
import { assertSelectedCase, currentExecutionPlan } from '../../harness/execution-plan.js';
import { loadObservation } from '../../harness/fixture-artifacts.js';
import type { QaEnvironment } from '../../harness/environment.js';

const observationTest = test.extend<{
  observationAdapter: Awaited<ReturnType<typeof loadObservation>>;
}>({
  observationAdapter: [
    async ({ target }, use, info) => {
      await requireAuthorization(target);
      assertSelectedCase(await currentExecutionPlan(qaRoot), info.title, info.project.name);
      if (!target.ui.adapterConfirmed) throw new BlockedError('基础浏览器定位尚未确认');
      await use(await loadObservation(qaRoot, target));
    },
    { auto: true },
  ],
});

function element(page: Page, qa: QaEnvironment, key: string): Locator {
  const selector = qa.config.ui.selectors[key];
  if (!selector) throw new BlockedError(`缺少已确认可见定位${key}`);
  return page.locator(selector);
}
async function remains(check: () => Promise<void>, milliseconds = 1200) {
  const end = performance.now() + milliseconds;
  do {
    await check();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  } while (performance.now() < end);
  await check();
}
async function icon(page: Page): Promise<string> {
  return page.evaluate(async () =>
    JSON.stringify(
      await Promise.all(
        Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map(
          async (item) => {
            const response = await fetch(item.href);
            return Array.from(new Uint8Array(await response.arrayBuffer()));
          },
        ),
      ),
    ),
  );
}

observationTest(
  '[ARC-UI-BLK-001] 通用账号资源读取失败不能提前确认未呈现的新状态',
  async ({ qa, page, observationAdapter: adapter }, info) => {
    await qa.evidence('resource-observation-adapter', adapter);
    await qa.api.login();
    const account = (await qa.api.accounts()).find((item) => item.status === 'idle');
    if (!account || !/^[A-Za-z0-9_-]+$/.test(account.id))
      throw new BlockedError('没有可用于online→disconnected且可安全定位的独立账号');
    await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`));
    await qa.api.waitFor<{ id: string; status: string }[]>('/api/accounts', (items) =>
      items.some((item) => item.id === account.id && item.status === 'online'),
    );
    const requests: { at: string; status: number }[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const path = qa.config.ui.routes.login;
    if (!path) throw new BlockedError('缺少登录路由');
    await page.goto(`${qa.webUrl}${path}`, { waitUntil: 'domcontentloaded' });
    await element(page, qa, 'username').fill('admin');
    await element(page, qa, 'password').fill('admin');
    const loginResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
    );
    await element(page, qa, 'login').click();
    expect((await loginResponse).status()).toBe(200);
    await element(page, qa, 'navAccounts').click();
    const row = page.locator(adapter.rowSelector.replaceAll('{id}', account.id));
    const state = row.locator(adapter.stateSelector);
    await expect(row).toBeVisible();
    await expect(state).toHaveText(adapter.stateText.online);
    await page.bringToFront();
    if (!(await page.evaluate(() => document.hasFocus())))
      throw new BlockedError('未能建立真实前台焦点，不伪造focus或visibility事件');
    const originalTitle = await page.title(),
      originalIcon = await icon(page);
    let failing = true,
      failures = 0;
    let background: Page | undefined;
    await page.route('**/api/accounts', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      if (failing) {
        failures++;
        requests.push({ at: new Date().toISOString(), status: 503 });
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'QA unread resource failure',
              requestId: 'qa-observation-boundary',
            },
          }),
        });
      } else {
        const response = await route.fetch();
        requests.push({ at: new Date().toISOString(), status: response.status() });
        await route.fulfill({ response });
      }
    });
    try {
      background = await page.context().newPage();
      await background.goto('about:blank');
      await background.bringToFront();
      if (await page.evaluate(() => document.hasFocus()))
        throw new BlockedError('浏览器未建立真实失焦；该执行环境不能验证后台提醒');
      await qa.api.require(
        qa.api.post(`/api/accounts/${account.id}/transition`, {
          expectedFrom: 'online',
          to: 'disconnected',
        }),
      );
      await qa.api.waitFor<{ id: string; status: string }[]>('/api/accounts', (items) =>
        items.some((item) => item.id === account.id && item.status === 'disconnected'),
      );
      await expect.poll(() => failures).toBeGreaterThan(0);
      await expect(page).not.toHaveTitle(originalTitle);
      await expect.poll(() => icon(page)).not.toBe(originalIcon);
      await page.bringToFront();
      const error = page.locator(adapter.errorSelector);
      await expect(error).toBeVisible();
      await expect(state).toHaveText(adapter.stateText.online);
      await remains(async () => {
        expect(await page.title()).not.toBe(originalTitle);
        expect(await icon(page)).not.toBe(originalIcon);
      });
      await error.click();
      await remains(async () => {
        await expect(state).toHaveText(adapter.stateText.online);
        expect(await page.title()).not.toBe(originalTitle);
        expect(await icon(page)).not.toBe(originalIcon);
      });
      await state.click();
      await remains(async () => {
        await expect(state).toHaveText(adapter.stateText.online);
        expect(await page.title()).not.toBe(originalTitle);
        expect(await icon(page)).not.toBe(originalIcon);
      });
      const refresh = page.locator(adapter.refreshSelector);
      if (!(await refresh.isVisible()))
        throw new BlockedError(
          '尚未接入真实可见的账号资源恢复操作；不直接调用内部reload或用整页重载清空提醒',
        );
      failing = false;
      const documentEpoch = await page.evaluate(() => performance.timeOrigin);
      const recovered = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/accounts' &&
          r.request().method() === 'GET' &&
          r.status() === 200,
      );
      await refresh.click();
      await recovered;
      if ((await page.evaluate(() => performance.timeOrigin)) !== documentEpoch)
        throw new BlockedError('资源刷新重建了document；不能以页面范围重置代替失败快照的确认验证');
      await expect(state).toHaveText(adapter.stateText.disconnected);
      // The refresh click happened before the new value was presented, so it cannot acknowledge it.
      await remains(async () => {
        expect(await page.title()).not.toBe(originalTitle);
        expect(await icon(page)).not.toBe(originalIcon);
      }, 500);
      await row.locator(adapter.acknowledgeSelector).click();
      await expect(page).toHaveTitle(originalTitle);
      await expect.poll(() => icon(page)).toBe(originalIcon);
      expect(errors).toEqual([]);
      await qa.evidence('resource-observation-assertions', {
        accountId: account.id,
        failures,
        requests,
        oldState: 'online',
        newState: 'disconnected',
        adapter,
        assertions: [
          '失败时只显示旧值',
          '仅聚焦/错误/旧值操作不确认',
          '真实新值成功呈现后明确操作才确认',
        ],
      });
    } finally {
      failing = false;
      await background?.close();
      await page.unrouteAll({ behavior: 'wait' });
      await qa.evidence('resource-observation-final', {
        requests,
        errors,
        url: page.url(),
        title: await page.title(),
        visibleText: (await page.locator('body').innerText()).slice(0, 8000),
      });
      const file = info.outputPath('evidence', 'resource-observation-final.png');
      await mkdir(dirname(file), { recursive: true });
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      await info.attach('resource-observation-final', { path: file, contentType: 'image/png' });
    }
  },
);
