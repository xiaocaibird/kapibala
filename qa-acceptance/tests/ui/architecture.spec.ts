import type { Page, Locator, Route, Request, Response } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import type { QaEnvironment } from '../../harness/environment.js';
import {
  requireAvailablePublicAction,
  type PublicActionPremise,
} from './public-action-premise.js';
import {
  observePageContinuity,
  withContinuityEvidence,
  type ContinuityOutcome,
  type ResponseScopeSync,
} from './page-continuity.js';

/** Versioned regression profile, not original product requirements.
 * Source: docs/architecture-quality-closeout.md:19–20, approved scope D036 / AR-08–09.
 * Observe bounded recovery; do not require exact scheduler timing in a real browser.
 */
const profile = { maximumReadAttempts: 4, observationMs: 3000, recoveryTimeoutMs: 8000 };
const observations = new WeakMap<
  Page,
  {
    http: { at: number; method: string; path: string; body?: unknown; status?: number }[];
    events: { at: number; seq: unknown; type: unknown; payload: unknown }[];
    authentications: number;
    socketChanges: number;
    pageErrors: string[];
  }
>();
function observed(page: Page) {
  const result = observations.get(page);
  if (!result) throw new Error('Missing QA browser observation');
  return result;
}
function element(page: Page, qa: QaEnvironment, key: string): Locator {
  const selector = qa.config.ui.selectors[key];
  if (!selector) throw new BlockedError(`UI适配缺少${key}，必须通过可见界面确认`);
  return page.locator(selector);
}
async function go(page: Page, qa: QaEnvironment, key: string): Promise<void> {
  const path = qa.config.ui.routes[key];
  if (!path) throw new BlockedError(`UI路由适配缺少${key}`);
  await page.goto(`${qa.webUrl}${path}`, { waitUntil: 'domcontentloaded' });
}
async function navigateWithinDocument(page: Page, qa: QaEnvironment, key: string) {
  const originalDocument = await page.evaluateHandle(() => document);
  try {
    await element(page, qa, key).click();
    let sameDocument = false;
    try {
      sameDocument = await page.evaluate(
        (oldDocument) => oldDocument === document,
        originalDocument,
      );
    } catch {
      /* A destroyed execution context is not a same-document navigation. */
    }
    if (!sameDocument)
      throw new BlockedError(`${key}触发整页导航，无法证明同文档且无WS重放的资源恢复`);
  } finally {
    await originalDocument.dispose();
  }
}
async function login(page: Page, qa: QaEnvironment, role = 'admin', navigate = true) {
  if (!qa.config.ui.adapterConfirmed)
    throw new BlockedError('UI模板尚未通过可见界面确认，不能将源码推测当作定位事实');
  await qa.startWeb();
  if (navigate) await go(page, qa, 'login');
  await element(page, qa, 'username').fill(role);
  await element(page, qa, 'password').fill(role);
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
  );
  await element(page, qa, 'login').click();
  expect((await response).status()).toBe(200);
  await expect(element(page, qa, 'username')).toBeHidden();
  await expect.poll(() => observed(page).authentications).toBeGreaterThan(0);
}
async function remains(check: () => Promise<void>, durationMs = profile.observationMs) {
  const deadline = performance.now() + durationMs;
  do {
    await check();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  } while (performance.now() < deadline);
  await check();
}
function writes(page: Page, path?: string) {
  return observed(page).http.filter(
    (r) =>
      r.method === 'POST' &&
      (path
        ? r.path === path
        : r.path === '/api/sequences/preview' || r.path.endsWith('/sequence-runs')),
  );
}
function definition(name = 'QA架构序列') {
  return { name, steps: [{ index: 1, accountRole: 'admin', text: '{event_1}', delaySeconds: 0 }] };
}
async function seed(qa: QaEnvironment, name = 'QA恢复目标') {
  await qa.api.login();
  return qa.api.require(qa.api.post<{ id: string }>('/api/sequences', definition(name)));
}
async function openDefinition(page: Page, qa: QaEnvironment) {
  await login(page, qa);
  await go(page, qa, 'sequences');
  await element(page, qa, 'createSequence').click();
  await expect(element(page, qa, 'sequenceDefinitionInput')).toBeVisible();
}
async function rejectDefinition(page: Page, qa: QaEnvironment, value: unknown) {
  const before = writes(page, '/api/sequences').length;
  await element(page, qa, 'sequenceDefinitionInput').fill(JSON.stringify(value));
  await element(page, qa, 'saveSequenceDefinition').click();
  await expect(element(page, qa, 'sequenceDefinitionError')).toBeVisible();
  await expect(element(page, qa, 'sequenceDefinitionError')).toContainText(/\S/);
  await remains(async () => {
    expect(writes(page, '/api/sequences')).toHaveLength(before);
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
  }, 500);
}
async function errorResponse(route: Route, status = 503, code = 'SERVICE_UNAVAILABLE') {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code, message: 'QA controlled resource failure', requestId: 'qa-architecture' },
    }),
  });
}
function quietBaseline(page: Page) {
  const state = observed(page);
  return {
    events: state.events.length,
    authentications: state.authentications,
    socketChanges: state.socketChanges,
  };
}
function noNewEvents(page: Page, baseline: ReturnType<typeof quietBaseline>) {
  const now = quietBaseline(page);
  if (
    now.events !== baseline.events ||
    now.authentications !== baseline.authentications ||
    now.socketChanges !== baseline.socketChanges
  )
    throw new BlockedError(
      '观察窗收到真实WS业务事件或连接/认证变化，不能据此证明无外部触发的读取恢复；保留帧证据后重跑',
    );
}
async function startQuietRead(page: Page, qa: QaEnvironment) {
  await login(page, qa);
  await waitForQuietSocket(page);
  const baseline = quietBaseline(page);
  await navigateWithinDocument(page, qa, 'navSequences');
  noNewEvents(page, baseline);
  return baseline;
}
async function waitForQuietSocket(page: Page) {
  let previous = JSON.stringify(quietBaseline(page));
  let lastChange = performance.now();
  const deadline = lastChange + 5000;
  while (performance.now() - lastChange < 500) {
    if (performance.now() >= deadline)
      throw new BlockedError('登录后的WS重放未能稳定，无法建立无后续事件的读取前提');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const current = JSON.stringify(quietBaseline(page));
    if (current !== previous) {
      previous = current;
      lastChange = performance.now();
    }
  }
}

test.beforeEach(async ({ page }) => {
  const state = {
    http: [] as ReturnType<typeof observed>['http'],
    events: [] as ReturnType<typeof observed>['events'],
    authentications: 0,
    socketChanges: 0,
    pageErrors: [] as string[],
  };
  observations.set(page, state);
  page.on('pageerror', (error) => state.pageErrors.push(error.message));
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (!path.startsWith('/api/sequences') && !path.endsWith('/sequence-runs')) return;
    let body: unknown;
    try {
      body = r.postDataJSON();
    } catch {
      body = r.postData();
    }
    state.http.push({ at: performance.now(), method: r.method(), path, body });
  });
  page.on('response', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/sequences'))
      state.http.push({
        at: performance.now(),
        method: `RESPONSE ${r.request().method()}`,
        path,
        status: r.status(),
      });
  });
  page.on('websocket', (socket) => {
    state.socketChanges++;
    socket.on('close', () => {
      state.socketChanges++;
    });
    socket.on('framereceived', ({ payload }) => {
      try {
        const value = JSON.parse(String(payload)) as {
          seq?: unknown;
          type?: unknown;
          success?: unknown;
          payload?: unknown;
        };
        if (value.type === 'auth' && value.success === true) state.authentications++;
        if (value.seq !== undefined)
          state.events.push({
            at: performance.now(),
            seq: value.seq,
            type: value.type,
            payload: value.payload,
          });
      } catch {
        /* Non-JSON transport frames are not declared business events. */
      }
    });
  });
});
test.afterEach(async ({ page, qa }, info) => {
  await qa.evidence('architecture-browser', {
    profile,
    profileSource: 'docs/architecture-quality-closeout.md:19–20',
    ...observed(page),
  });
  if (page.isClosed()) return;
  await qa.evidence('architecture-final', {
    url: page.url(),
    title: await page.title(),
    visibleText: (await page.locator('body').innerText()).slice(0, 8000),
    visibleErrors: await page
      .locator('[role="alert"]:visible,[aria-live="assertive"]:visible')
      .allTextContents(),
  });
  const path = info.outputPath('evidence', 'architecture-final.png');
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach('architecture-final', { path, contentType: 'image/png' });
  for (const name of ['architecture-browser', 'architecture-final'])
    await info.attach(name, {
      path: info.outputPath('evidence', `${name}.json`),
      contentType: 'application/json',
    });
});

test('[ARC-UI-001] 序列定义额外字段明确拒绝而非静默剥离', async ({ qa, page }) => {
  await openDefinition(page, qa);
  await rejectDefinition(page, qa, { ...definition(), unexpected: true });
  const value = definition();
  await rejectDefinition(page, qa, { ...value, steps: [{ ...value.steps[0], unexpected: true }] });
});
test('[ARC-UI-002] 非连续或重复步号在浏览器阻止提交', async ({ qa, page }) => {
  await openDefinition(page, qa);
  for (const indexes of [[0], [2], [1, 3], [1, 1]]) {
    const value = definition();
    await rejectDefinition(page, qa, {
      ...value,
      steps: indexes.map((index) => ({ ...value.steps[0], index })),
    });
  }
});
test('[ARC-UI-003] 已登记序列尺寸边界在浏览器明确拒绝', async ({ qa, page }) => {
  await openDefinition(page, qa);
  const value = definition();
  for (const invalid of [
    { ...value, name: 'x'.repeat(201) },
    {
      ...value,
      steps: Array.from({ length: 201 }, (_, i) => ({ ...value.steps[0], index: i + 1 })),
    },
    { ...value, steps: [{ ...value.steps[0], text: 'x'.repeat(20001) }] },
    { ...value, steps: [{ ...value.steps[0], delaySeconds: 604801 }] },
  ])
    await rejectDefinition(page, qa, invalid);
});
test('[ARC-UI-004] vars和stepVars非法键值不发预检或启动请求', async ({ qa, page }) => {
  await qa.api.login();
  const group = (await qa.api.createGroup()).group;
  const sequence = await seed(qa);
  await login(page, qa);
  await go(page, qa, 'sequences');
  await element(page, qa, 'sequenceGroup').selectOption(group.id);
  await element(page, qa, 'sequence').selectOption(sequence.id);
  for (const [vars, stepVars] of [
    [{ 'bad-key': 'x' }, {}],
    [{ event_1: 1 }, {}],
    [{ event_1: 'x'.repeat(20001) }, {}],
    [{ event_1: 'valid' }, { '0': { event_1: 'x' } }],
    [{ event_1: 'valid' }, { '01': { event_1: 'x' } }],
    [{ event_1: 'valid' }, { '1': { 'bad-key': 'x' } }],
    [{ event_1: 'valid' }, { '1': { event_1: false } }],
  ]) {
    await element(page, qa, 'sequenceVars').fill(JSON.stringify(vars));
    await element(page, qa, 'sequenceStepVars').fill(JSON.stringify(stepVars));
    await element(page, qa, 'previewSequence').click();
    await expect(element(page, qa, 'sequenceInputError')).toBeVisible();
    await expect(element(page, qa, 'sequenceInputError')).toContainText(/\S/);
    await remains(async () => {
      expect(writes(page)).toHaveLength(0);
      expect(qa.gateway.snapshot().messages).toHaveLength(0);
    }, 500);
  }
  await element(page, qa, 'sequenceVars').fill(JSON.stringify({ event_1: '合法默认值' }));
  await element(page, qa, 'sequenceStepVars').fill(JSON.stringify({ '1': { event_1: '' } }));
  await element(page, qa, 'previewSequence').click();
  await expect(element(page, qa, 'sequencePreview')).toBeVisible();
  await expect(element(page, qa, 'sequencePreview')).toContainText('合法默认值');
  await remains(async () => {
    expect(writes(page, '/api/sequences/preview')).toHaveLength(1);
    expect(writes(page).filter((r) => r.path.endsWith('/sequence-runs'))).toHaveLength(0);
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
  });
});
test('[ARC-UI-005] 合法序列一次保存并保留公开输入行为', async ({ qa, page }) => {
  await qa.api.login();
  await openDefinition(page, qa);
  const value = definition('  QA合法共享契约  ');
  await element(page, qa, 'sequenceDefinitionInput').fill(JSON.stringify(value));
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/sequences' && r.request().method() === 'POST',
  );
  await element(page, qa, 'saveSequenceDefinition').click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const body = (await saved.json()) as { id: string };
  expect(typeof body.id).toBe('string');
  const list = await qa.api.require(
    qa.api.get<{ id: string; name: string; steps: unknown[] }[]>('/api/sequences'),
  );
  expect(list.find((s) => s.id === body.id)).toMatchObject({
    name: value.name.trim(),
    steps: value.steps,
  });
  await expect(element(page, qa, 'sequenceDefinitionInput')).toBeHidden();
  await remains(async () => {
    expect(writes(page, '/api/sequences')).toHaveLength(1);
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
  });
});
test('[ARC-UI-006] 序列写请求503失败不自动重放', async ({ qa, page }) => {
  await qa.api.login();
  await openDefinition(page, qa);
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() === 'POST') await errorResponse(route);
    else await route.continue();
  });
  try {
    const value = definition('QA禁止写重放');
    await element(page, qa, 'sequenceDefinitionInput').fill(JSON.stringify(value));
    await element(page, qa, 'saveSequenceDefinition').click();
    await expect(element(page, qa, 'sequenceDefinitionError')).toBeVisible();
    await expect(element(page, qa, 'sequenceDefinitionInput')).toHaveValue(JSON.stringify(value));
    await remains(async () => expect(writes(page, '/api/sequences')).toHaveLength(1));
    const list = await qa.api.require(qa.api.get<{ name: string }[]>('/api/sequences'));
    expect(list.some((s) => s.name === value.name)).toBe(false);
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[ARC-UI-007] 无后续事件或轮询时两次503后自动呈现', async ({ qa, page }) => {
  const item = await seed(qa);
  let attempts = 0;
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    if (attempts <= 2) await errorResponse(route);
    else await route.continue();
  });
  try {
    const baseline = await startQuietRead(page, qa);
    await expect(element(page, qa, 'sequence')).toHaveValue(item.id, {
      timeout: profile.recoveryTimeoutMs,
    });
    expect(attempts).toBe(3);
    await expect(element(page, qa, 'sequenceResourceError')).toBeHidden();
    await remains(async () => {
      expect(attempts).toBe(3);
      noNewEvents(page, baseline);
    });
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
const permanentCases = [
  { id: 'ARC-UI-008', title: '权限403不形成资源请求风暴', status: 403, code: 'FORBIDDEN' },
  { id: 'ARC-UI-009', title: '429不无视限流进行通用重试', status: 429, code: 'RATE_LIMITED' },
  { id: 'ARC-UI-010', title: '请求校验400不自动重试', status: 400, code: 'VALIDATION_ERROR' },
  {
    id: 'ARC-UI-011',
    title: '成功HTTP的非法响应格式不按502临时错误重试',
    status: 200,
    code: 'INVALID_RESPONSE',
  },
];
for (const scenario of permanentCases)
  test(`[${scenario.id}] ${scenario.title}`, async ({ qa, page }) => {
    const item = await seed(qa);
    let attempts = 0;
    await page.route('**/api/sequences', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      attempts++;
      if (scenario.status === 200)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"notASequenceArray":true}',
        });
      else await errorResponse(route, scenario.status, scenario.code);
    });
    try {
      const baseline = await startQuietRead(page, qa);
      await expect(element(page, qa, 'sequenceResourceError')).toBeVisible();
      await remains(async () => {
        expect(attempts).toBe(1);
        expect(
          await element(page, qa, 'sequence').locator(`option[value="${item.id}"]`).count(),
        ).toBe(0);
        noNewEvents(page, baseline);
      });
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
test('[ARC-UI-012] 持续暂时失败耗尽后停止自动读取', async ({ qa, page }) => {
  await seed(qa);
  let attempts = 0;
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    await errorResponse(route);
  });
  try {
    const baseline = await startQuietRead(page, qa);
    await expect
      .poll(() => attempts, { timeout: profile.recoveryTimeoutMs })
      .toBe(profile.maximumReadAttempts);
    await expect(element(page, qa, 'sequenceResourceError')).toBeVisible();
    await remains(async () => {
      expect(attempts).toBe(profile.maximumReadAttempts);
      noNewEvents(page, baseline);
    });
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[ARC-UI-013] 切页取消旧读取及后续退避', async ({ qa, page }) => {
  await seed(qa);
  let attempts = 0;
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    await hold;
    try {
      await errorResponse(route);
    } catch {
      /* Browser may cancel the old request on departure. */
    }
  });
  try {
    await startQuietRead(page, qa);
    await expect.poll(() => attempts).toBe(1);
    await element(page, qa, 'navAccounts').click();
    await expect(element(page, qa, 'accountRow')).not.toHaveCount(0);
    release!();
    await remains(async () => {
      expect(attempts).toBe(1);
      await expect(element(page, qa, 'sequenceResourceError')).toBeHidden();
    });
  } finally {
    release!();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[ARC-UI-014] 换身份期间旧读取迟到不能覆盖新会话', async ({ qa, page }) => {
  const old = await seed(qa, 'QA旧快照');
  let attempts = 0;
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let receivedOld = false;
  let originalDocument: Awaited<ReturnType<Page['evaluateHandle']>> | undefined;
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    if (attempts !== 1) return route.continue();
    const response = await route.fetch();
    receivedOld = true;
    await hold;
    try {
      await route.fulfill({ response });
    } catch {
      /* Cancelled old session request is acceptable. */
    }
  });
  try {
    await startQuietRead(page, qa);
    await expect.poll(() => receivedOld).toBe(true);
    originalDocument = await page.evaluateHandle(() => document);
    const logout = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/auth/logout' && r.request().method() === 'POST',
    );
    await element(page, qa, 'logout').click();
    expect((await logout).ok()).toBe(true);
    await expect(element(page, qa, 'username')).toBeVisible();
    const fresh = await seed(qa, 'QA新会话快照');
    // Stay in the existing document: a full reload would discard the JS state under test.
    await login(page, qa, 'viewer', false);
    let sameDocument = false;
    try {
      sameDocument = await page.evaluate(
        (oldDocument) => oldDocument === document,
        originalDocument,
      );
    } catch {
      /* An old execution context proves the same-document precondition was not met. */
    }
    if (!sameDocument)
      throw new BlockedError(
        '注销/登录改变了浏览器document，不能将整页重载当作同文档会话代次隔离证据',
      );
    await element(page, qa, 'navSequences').click();
    await expect(element(page, qa, 'sequence').locator(`option[value="${fresh.id}"]`)).toHaveCount(
      1,
    );
    release!();
    await remains(async () => {
      await expect(
        element(page, qa, 'sequence').locator(`option[value="${fresh.id}"]`),
      ).toHaveCount(1);
      await expect(element(page, qa, 'sequence').locator(`option[value="${old.id}"]`)).toHaveCount(
        1,
      );
      await expect(element(page, qa, 'createSequence')).toBeHidden();
    });
  } finally {
    release!();
    await originalDocument?.dispose();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[ARC-UI-015] 耗尽后显式同页刷新可开始新一轮', async ({ qa, page }) => {
  const item = await seed(qa);
  let attempts = 0;
  let recovered = false;
  const continuity = observePageContinuity(page);
  const reads: { at: number; url: string; attempt: number; phase: string }[] = [];
  let actionEvidence: unknown;
  let refreshPremise: PublicActionPremise | undefined;
  let continuityOutcome: ContinuityOutcome | undefined;
  let primary: unknown;
  let explicitRequest: Request | undefined;
  let explicitRequestAt: number | undefined;
  let responseScopeSync: ResponseScopeSync | undefined;
  // Observe the exact routed request's real response before clicking. The
  // click/Promise completion time is too late to order a marker against HTTP.
  const successfulResponse = (response: Response) => {
    if (
      response.request() === explicitRequest &&
      response.status() === 200 &&
      explicitRequestAt !== undefined
    )
      responseScopeSync = { requestAt: explicitRequestAt, responseAt: performance.now() };
  };
  page.on('response', successfulResponse);
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    const at = performance.now();
    reads.push({
      at,
      url: route.request().url(),
      attempt: attempts,
      phase: recovered ? 'explicit-refresh' : 'exhaustion',
    });
    if (recovered && !explicitRequest) {
      explicitRequest = route.request();
      explicitRequestAt = at;
    }
    if (!recovered) await errorResponse(route);
    else await route.continue();
  });
  try {
    const baseline = await startQuietRead(page, qa);
    await expect
      .poll(() => attempts, { timeout: profile.recoveryTimeoutMs })
      .toBe(profile.maximumReadAttempts);
    await remains(async () => {
      expect(attempts).toBe(profile.maximumReadAttempts);
      noNewEvents(page, baseline);
    });
    // Only sequences GET was faulted. Its public error requestId binds the
    // configured control to that error region, even if another resource fails.
    const errorRegion = page.getByRole('alert').filter({ hasText: 'qa-architecture' });
    const refresh = element(page, qa, 'sequenceResourceRefresh').and(
      errorRegion.getByRole('button', { name: '重试', exact: true }),
    );
    await requireAvailablePublicAction(
      refresh,
      '未找到唯一可见且可用的序列错误区域同页重试入口；禁止内部reload或整页重载替代',
      (sample) => {
        refreshPremise = sample;
      },
    );
    const document = await continuity.capture();
    const beforeAttempts = attempts;
    recovered = true;
    await withContinuityEvidence(
      async () => {
        await continuity.unchanged(document, responseScopeSync);
        noNewEvents(page, baseline);
      },
      async (check) => {
        const [response] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request() === explicitRequest && response.request().method() === 'GET',
          ),
          refresh.click(),
        ]);
        await check('refresh-response', async () => {
          const body: unknown = await response.json();
          actionEvidence = {
            before: document.point,
            beforeAttempts,
            afterAttempts: attempts,
            response: { url: response.url(), status: response.status(), body },
            expectedSequenceId: item.id,
          };
          expect(response.status()).toBe(200);
          expect(body).toEqual(expect.arrayContaining([expect.objectContaining({ id: item.id })]));
        });
        await check('sequence-presented', () =>
          expect(element(page, qa, 'sequence')).toHaveValue(item.id),
        );
        await remains(async () => {
          await check('stable-request-count', () =>
            expect(attempts).toBe(profile.maximumReadAttempts + 1),
          );
        });
        if (responseScopeSync) responseScopeSync = { ...responseScopeSync, requireReady: true };
        await check('post-response-scope-settled', () =>
          continuity.unchanged(document, responseScopeSync),
        );
      },
      (outcome) => {
        continuityOutcome = outcome;
      },
    );
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    page.off('response', successfulResponse);
    const outcomes = await Promise.allSettled([
      page.unrouteAll({ behavior: 'wait' }),
      continuity.dispose(),
      qa.evidence('architecture-explicit-refresh-continuity', {
        reads,
        refreshPremise,
        actionEvidence,
        continuityOutcome,
        continuity: continuity.ledger.events,
        continuityChecks: continuity.ledger.checks,
        scopeMarkers: continuity.ledger.scopeMarkers,
        scopeReplies: continuity.ledger.scopeReplies,
        responseScopeSync,
        limitation:
          '仅本次真实200响应之后、同连接且同水位的匹配marker/ready可作为呈现后的同步；保留document/URL/导航/WS/认证与无业务事件要求，不读取产品内部控制器身份',
      }),
    ]);
    const errors = outcomes.filter((result) => result.status === 'rejected');
    if (errors.length) {
      if (!primary)
        throw new Error(
          `ARC-UI-015取证/清理失败：${errors.map((result) => String(result.reason)).join('; ')}`,
        );
      console.error('ARC-UI-015 secondary evidence/cleanup errors', errors);
    }
  }
});
test('[ARC-UI-016] 错误后离页取消退避期间的后续读取', async ({ qa, page }) => {
  await seed(qa);
  let attempts = 0;
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    await errorResponse(route);
  });
  try {
    await startQuietRead(page, qa);
    await expect(element(page, qa, 'sequenceResourceError')).toBeVisible();
    // The first error is presented during retry. Navigation must happen before exhaustion.
    if (attempts >= profile.maximumReadAttempts)
      throw new BlockedError('首次可见错误前预算已经耗尽，未建立退避期间离页前提');
    await element(page, qa, 'navAccounts').click();
    await expect(element(page, qa, 'accountRow')).not.toHaveCount(0);
    const atDeparture = attempts;
    if (atDeparture >= profile.maximumReadAttempts)
      throw new BlockedError(
        '浏览器操作慢于本轮退避预算，未建立退避期间离页的前提；需重跑，不能冒充取消验证',
      );
    await remains(async () => expect(attempts).toBe(atDeparture));
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[ARC-UI-017] 在途读取期间多个实时失效合并且不能延长失败预算', async ({ qa, page }) => {
  await seed(qa);
  let attempts = 0,
    active = 0,
    maximumActive = 0;
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/sequences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    attempts++;
    active++;
    maximumActive = Math.max(maximumActive, active);
    try {
      if (attempts === 1) await hold;
      await errorResponse(route);
    } finally {
      active--;
    }
  });
  try {
    const baseline = await startQuietRead(page, qa);
    await expect.poll(() => attempts).toBe(1);
    const createdIds: string[] = [];
    for (let i = 0; i < 3; i++) createdIds.push((await seed(qa, `QA在途失效${i}`)).id);
    const matchingEvents = () =>
      observed(page)
        .events.slice(baseline.events)
        .filter((event) => {
          if (typeof event.payload !== 'object' || event.payload === null) return false;
          const sequenceId = (event.payload as Record<string, unknown>).sequenceId;
          return typeof sequenceId === 'string' && createdIds.includes(sequenceId);
        });
    try {
      await expect
        .poll(
          () =>
            new Set(
              matchingEvents().map(
                (event) => (event.payload as Record<string, unknown>).sequenceId,
              ),
            ).size,
        )
        .toBe(3);
    } catch {
      throw new BlockedError(
        '未观察到分别关联本轮3个新序列ID的公开事件，无法建立相关并发失效前提；任意其他事件或重复帧不计数',
      );
    }
    await remains(async () => {
      expect(attempts).toBe(1);
      expect(maximumActive).toBe(1);
    }, 500);
    release!();
    await expect
      .poll(() => attempts, { timeout: profile.recoveryTimeoutMs })
      .toBe(profile.maximumReadAttempts);
    await remains(async () => {
      expect(attempts).toBe(profile.maximumReadAttempts);
      expect(maximumActive).toBe(1);
    });
    await qa.evidence('architecture-single-flight', {
      attempts,
      maximumActive,
      createdIds,
      matchingEvents: matchingEvents(),
    });
  } finally {
    release!();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('[ARC-UI-018] 网络失败及其他已登记暂时HTTP错误均可自动恢复', async ({ qa, page }) => {
  const item = await seed(qa);
  await login(page, qa);
  await waitForQuietSocket(page);
  for (const status of [0, 408, 500, 502, 504]) {
    await navigateWithinDocument(page, qa, 'navAccounts');
    await expect(element(page, qa, 'accountRow')).not.toHaveCount(0);
    let attempts = 0;
    await page.route('**/api/sequences', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      attempts++;
      if (attempts > 1) return route.continue();
      if (status === 0) await route.abort('failed');
      else await errorResponse(route, status, 'QA_TEMPORARY_FAILURE');
    });
    try {
      const baseline = quietBaseline(page);
      await navigateWithinDocument(page, qa, 'navSequences');
      noNewEvents(page, baseline);
      await expect(element(page, qa, 'sequence')).toHaveValue(item.id, {
        timeout: profile.recoveryTimeoutMs,
      });
      await remains(async () => {
        expect(attempts).toBe(2);
        noNewEvents(page, baseline);
      });
      await qa.evidence(`architecture-recovery-${status}`, { status, attempts });
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
    }
  }
});
