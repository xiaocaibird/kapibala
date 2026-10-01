import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page, Request, Route, APIResponse, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { BlockedError, redact } from '../../harness/security.js';
import type { ResponseGate, ResponseKind, UiDriver, UiLocation } from '../contracts/ui-driver.js';

/** Same public origin rule as the independent QA fixture, including WS. */
export function allowedBrowserOrigin(raw: string, allowedOrigins: readonly string[]): boolean {
  try {
    const url = new URL(raw);
    url.protocol = url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : url.protocol;
    return allowedOrigins.includes(url.origin);
  } catch { return false; }
}

export function publicOperation(method: string, url: string): ResponseKind | null {
  const path = new URL(url).pathname;
  if (method === 'GET' && /^\/api\/agent-runs\/[^/]+$/.test(path)) return 'run-read';
  if (method === 'GET' && path === '/api/auth/me') return 'identity-read';
  if (method === 'PATCH' && /^\/api\/groups\/[^/]+$/.test(path)) return 'group-save';
  if (method !== 'POST') return null;
  if (/^\/api\/groups\/[^/]+\/send$/.test(path)) return 'send';
  if (path === '/api/groups') return 'group-create';
  if (path === '/api/sequences') return 'sequence-save';
  if (path === '/api/sequences/preview') return 'precheck';
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, bad) => { resolve = ok; reject = bad; });
  // An upstream failure may occur before the caller has reached the barrier.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
async function bounded<T>(promise: Promise<T>, ms: number, description: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BlockedError(`UI observation deadline: ${description}`)), ms);
  })]); } finally { clearTimeout(timer); }
}
interface Held {
  id: string; kind: ResponseKind; request?: Request; response?: APIResponse;
  received: ReturnType<typeof deferred<void>>; done: ReturnType<typeof deferred<void>>;
  choice: ReturnType<typeof deferred<'success' | 'failure' | 'unknown'>>;
  released: boolean;
}
export interface PublicUiOptions {
  page: Page;
  baseUrl: string;
  outputDir: string;
  timeoutMs?: number;
  allowedOrigins?: readonly string[];
  credentials?: Record<'admin' | 'viewer', { username: string; password: string }>;
  /** Actual owned fault, never a canned API result. Called only for a selected
   * request, before its unchanged bytes reach the real upstream service. */
  beforeFetch?: (kind: ResponseKind, request: Request) => Promise<void>;
  afterFetch?: (kind: ResponseKind, request: Request) => Promise<void>;
}

/** Operates only DOM controls and browser transport. It never inspects React
 * state, copies a developer test, or supplies successful business responses. */
export class PublicUiDriver implements UiDriver {
  readonly page: Page;
  readonly timeoutMs: number;
  private pending?: Held;
  private readonly held = new Map<string, Held>();
  private readonly operationRequests: Request[] = [];
  private readonly routeErrors: unknown[] = [];
  private readonly pageErrors: string[] = [];
  private writes = Promise.resolve();
  private sequence = 0;
  private constructor(readonly options: PublicUiOptions) {
    this.page = options.page;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    const origin = new URL(options.baseUrl);
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port)
      throw new Error('UI driver requires an explicit owned loopback origin');
  }
  static async attach(options: PublicUiOptions): Promise<PublicUiDriver> {
    const driver = new PublicUiDriver(options);
    await mkdir(options.outputDir, { recursive: true });
    options.page.setDefaultTimeout(driver.timeoutMs);
    options.page.on('request', (request) => {
      if (publicOperation(request.method(), request.url())) driver.operationRequests.push(request);
    });
    options.page.on('pageerror', (error) => driver.pageErrors.push(error.message));
    await options.page.route('**/api/**', driver.route);
    return driver;
  }
  private readonly route = async (route: Route): Promise<void> => {
    const request = route.request();
    // Page routes take precedence over context routes. Enforce the same gate
    // before route.fetch; unmatched calls fall through to the context guard.
    if (!allowedBrowserOrigin(request.url(), this.options.allowedOrigins ?? [new URL(this.options.baseUrl).origin])) {
      try { await this.evidence('browser-egress-blocked', { url: request.url(), kind: 'page-api-route' }); }
      finally { await route.abort('blockedbyclient'); }
      return;
    }
    const kind = publicOperation(request.method(), request.url());
    const held = this.pending;
    if (!held || kind !== held.kind) { await route.fallback(); return; }
    this.pending = undefined;
    held.request = request;
    try {
      await this.options.beforeFetch?.(held.kind, request);
      // maxRetries 0 preserves the first observation, including transport errors.
      held.response = await route.fetch({ timeout: this.timeoutMs, maxRetries: 0, maxRedirects: 0 });
      await this.evidence('response-held', {
        requestId: held.id, kind, url: request.url(), method: request.method(),
        requestBody: request.postData(), status: held.response.status(),
        responseBody: await held.response.text(), bodyUnchanged: true,
      });
      await this.options.afterFetch?.(held.kind, request);
      held.received.resolve();
      const outcome = await bounded(held.choice.promise, this.timeoutMs * 3, 'owned response gate release');
      if (outcome === 'unknown') {
        // The actual backend may already have accepted the request. Retain that
        // fact and lose only its browser response; never retry it.
        await route.abort('connectionreset');
      } else {
        const successful = held.response.status() >= 200 && held.response.status() < 300;
        if (successful !== (outcome === 'success')) throw new BlockedError(
          `Planned ${outcome} premise did not occur: real upstream HTTP ${held.response.status()}`);
        await route.fulfill({ response: held.response });
      }
      held.done.resolve();
    } catch (error) {
      this.routeErrors.push(error); held.received.reject(error); held.done.reject(error);
      await route.abort('failed').catch(() => {});
    }
  };
  async holdNextResponse(kind: ResponseKind): Promise<ResponseGate> {
    if (this.pending) throw new Error('An unmatched response gate is already armed');
    const held: Held = { id: randomUUID(), kind, received: deferred(), done: deferred(), choice: deferred(), released: false };
    this.pending = held; this.held.set(held.id, held);
    const received = bounded(held.received.promise, this.timeoutMs + 1_000, `${kind} real response`);
    void received.catch(() => {});
    return {
      requestId: held.id,
      received,
      release: async (outcome) => {
        if (!held.released) { held.released = true; held.choice.resolve(outcome); }
        if (held.request) await bounded(held.done.promise, this.timeoutMs, 'response transport release');
      },
    };
  }
  async settleResponse(id: string): Promise<void> {
    const held = this.held.get(id);
    assert.ok(held?.request, 'response gate must belong to an observed actual request');
    await bounded(held.done.promise, this.timeoutMs, 'response gate completion');
    // Completion of route.fulfill precedes rendering. Use a DOM-visible pending
    // indicator and two paints, not a forged result or repeated submission.
    const pending = held.kind === 'send' ? '提交中…' : held.kind === 'sequence-save' ? '保存中…' : held.kind === 'precheck' ? '正在预检…' : '正在保存…';
    await expect(this.page.getByRole('button', { name: pending, exact: true })).toBeHidden();
    await this.paint();
  }
  async paint(): Promise<void> {
    await bounded(this.page.evaluate(() => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())))), this.timeoutMs, 'actual browser paint');
  }
  async navigate(hash: string): Promise<void> {
    assert.ok(hash.startsWith('#/'), 'only relative SPA navigation is allowed');
    if (this.page.url() === 'about:blank') await this.page.goto(`${this.options.baseUrl}/${hash}`, { waitUntil: 'domcontentloaded' });
    else {
      assert.equal(new URL(this.page.url()).origin, new URL(this.options.baseUrl).origin);
      await this.page.evaluate((value) => { window.location.hash = value; }, hash);
    }
    await this.paint();
  }
  async login(role: 'admin' | 'viewer', sessionLabel: string): Promise<void> {
    if (this.page.url() === 'about:blank') await this.navigate('#/groups');
    const logout = this.page.getByRole('button', { name: '退出登录', exact: true });
    if (await logout.isVisible()) await logout.click();
    await expect(this.page.getByPlaceholder('输入用户名')).toBeVisible();
    const credentials = this.options.credentials?.[role] ?? { username: role, password: role };
    await this.page.getByPlaceholder('输入用户名').fill(credentials.username);
    await this.page.getByPlaceholder('输入密码').fill(credentials.password);
    const response = this.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST');
    await this.page.getByRole('button', { name: '进入工作台', exact: true }).click();
    assert.equal((await response).status(), 200);
    await expect(logout).toBeVisible();
    await this.evidence('login', { role, sessionLabel });
  }
  async openGroup(id: string): Promise<void> {
    await this.navigate(`#/groups/${encodeURIComponent(id)}`);
    await expect(this.page.locator('.page-header')).toContainText(/网关群 ID|群/);
  }
  async editDraft(value: string): Promise<void> { await this.page.getByPlaceholder('输入要发送到群的消息…').fill(value); }
  async draft(): Promise<string> { return this.page.getByPlaceholder('输入要发送到群的消息…').inputValue(); }
  async clickSend(): Promise<void> { await this.page.getByRole('button', { name: '发送消息', exact: true }).click(); }
  async actualSendRequestCount(): Promise<number> { return this.operationRequests.filter((r) => publicOperation(r.method(), r.url()) === 'send').length; }
  dialog(title: string): Locator {
    // A discard dialog can be nested inside its dirty form. Bind the candidate's
    // own direct heading so the ancestor form is never a second accidental hit.
    return this.page.locator(`dialog[open]:has(> .modal-heading > h2:text-is(${JSON.stringify(title)}))`);
  }
  async newSequence(): Promise<void> {
    if (!this.page.url().includes('#/sequences')) await this.navigate('#/sequences');
    await this.page.getByRole('button', { name: /新建序列|新建消息序列/, exact: true }).click();
    await expect(this.dialog('新建消息序列')).toBeVisible();
  }
  async editSequence(value: Record<string, string>): Promise<void> {
    if (typeof value.json !== 'string') throw new BlockedError('UI sequence profile requires literal public JSON editor text');
    await this.dialog('新建消息序列').getByLabel('序列 JSON').fill(value.json);
  }
  async sequenceFields(): Promise<Record<string, string>> { return { json: await this.dialog('新建消息序列').getByLabel('序列 JSON').inputValue() }; }
  async requestFormClose(action: string): Promise<void> {
    const dialog = this.dialog('新建消息序列');
    if (action === 'escape') await this.page.keyboard.press('Escape');
    else if (action === 'close') await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    else if (action === 'cancel') {
      const button = dialog.getByRole('button', { name: '取消', exact: true });
      // Native disabled is itself the browser preventing this actual entry.
      if (await button.isEnabled()) await button.click();
      else await this.evidence('disabled-close-entry', { action, disabled: true });
    } else throw new BlockedError(`Unknown observed closing action ${action}`);
    await this.paint();
  }
  async cancelDiscard(): Promise<void> { await this.dialog('放弃未保存的修改？').getByRole('button', { name: '继续编辑', exact: true }).click(); }
  async confirmDiscard(): Promise<void> { await this.dialog('放弃未保存的修改？').getByRole('button', { name: '放弃修改', exact: true }).click(); }
  async formState(): Promise<{ open: boolean; discardPromptVisible: boolean; saving: boolean }> {
    return { open: await this.dialog('新建消息序列').isVisible(), discardPromptVisible: await this.dialog('放弃未保存的修改？').isVisible(), saving: await this.page.getByRole('button', { name: '保存中…', exact: true }).isVisible() };
  }
  async saveSequence(): Promise<void> { await this.dialog('新建消息序列').getByRole('button', { name: '保存序列', exact: true }).click(); }
  async setPrecheckContext(value: Record<string, string>): Promise<void> {
    if (!this.page.url().includes('#/sequences')) await this.navigate('#/sequences');
    for (const [field, label] of [['group', '目标群组'], ['sequence', '消息序列']] as const) {
      const control = this.page.getByLabel(label, { exact: true });
      if (value[field] !== undefined && await control.inputValue() !== value[field]) await control.selectOption(value[field]);
    }
    for (const [field, label] of [['vars', '默认变量 vars'], ['stepVars', '分步变量 stepVars']] as const) {
      const control = this.page.getByLabel(label, { exact: true });
      if (value[field] !== undefined && await control.inputValue() !== value[field]) await control.fill(value[field]);
    }
    await this.paint();
  }
  async startPrecheck(): Promise<void> { await this.page.getByRole('button', { name: '预检所有步骤', exact: true }).click(); }
  async canConfirmPrecheck(): Promise<boolean> { const button = this.page.getByRole('button', { name: '确认启动序列', exact: true }); return await button.isVisible() && await button.isEnabled(); }
  async openRunFromGroup(groupId: string, runId: string): Promise<void> {
    await this.openGroup(groupId);
    await this.page.locator('a.run-list-item').filter({ hasText: runId }).click();
    await expect(this.page.getByRole('heading', { name: '运行详情', exact: true })).toBeVisible();
  }
  async openRunFromList(groupId: string, runId: string): Promise<void> {
    await this.navigate('#/agent-runs');
    await this.page.getByLabel('查看群组', { exact: true }).selectOption(groupId);
    await this.page.locator('a.run-list-item').filter({ hasText: runId }).click();
    await expect(this.page.getByRole('heading', { name: '运行详情', exact: true })).toBeVisible();
  }
  async returnToSource(): Promise<void> { await this.page.locator('a.back-link').click(); await this.paint(); }
  async location(): Promise<UiLocation> {
    const url = this.page.url(), path = new URL(url).hash.split('?')[0]!;
    const title = await this.page.title(), activeNavigation = (await this.page.locator('nav a.active').innerText()).trim();
    if (/^#\/groups\//.test(path)) return { kind: 'group', groupId: decodeURIComponent(path.slice('#/groups/'.length)), url, title, activeNavigation };
    if (/^#\/agent-runs\//.test(path)) return { kind: 'run', url, title, activeNavigation };
    if (path === '#/agent-runs') {
      const select = this.page.getByLabel('查看群组', { exact: true });
      await expect(select).toBeVisible();
      await expect(select.locator('option').nth(1)).toBeAttached();
      return { kind: 'run-list', selectedGroupId: await select.inputValue(), url, title, activeNavigation };
    }
    return { kind: 'fallback', url, title, activeNavigation };
  }
  async evidence(label: string, facts: unknown): Promise<void> {
    const record = { ordinal: ++this.sequence, at: new Date().toISOString(), label, facts };
    this.writes = this.writes.then(() => appendFile(resolve(this.options.outputDir, 'ui.ndjson'), redact(record) + '\n'));
    await this.writes;
  }
  assertHealthy(): void {
    assert.deepEqual(this.pageErrors, [], 'Uncaught actual browser exception');
    if (this.routeErrors.length) throw new AggregateError(this.routeErrors, 'Actual transport-gate error');
  }
  async close(): Promise<void> {
    for (const held of this.held.values()) {
      if (!held.released) { held.released = true; held.choice.resolve('unknown'); }
      if (!held.request) { held.received.reject(new BlockedError('Owned gate closed before its actual request')); held.done.resolve(); }
    }
    await Promise.allSettled([...this.held.values()].filter((h) => h.request).map((h) => bounded(h.done.promise, this.timeoutMs, 'cleanup response')));
    if (!this.page.isClosed()) {
      await this.evidence('final-browser', { url: this.page.url(), title: await this.page.title(), text: (await this.page.locator('body').innerText()).slice(0, 30_000), pageErrors: this.pageErrors, routeErrors: this.routeErrors.map(String) });
      await this.page.screenshot({ path: resolve(this.options.outputDir, 'final.png'), fullPage: true });
      await this.page.unroute('**/api/**', this.route);
    }
    await this.writes;
  }
}
