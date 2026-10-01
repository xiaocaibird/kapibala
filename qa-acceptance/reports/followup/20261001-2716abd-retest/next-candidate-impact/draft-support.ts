/** Preparation-only QA code: importing this file does not start any resource. */
import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { QaEnvironment } from '../../../../harness/environment.js';
import { BlockedError } from '../../../../harness/security.js';

export function assertScopedBlockedCopy(text: string): void {
  assert.match(text, /本次工具|当前工具|this tool|current tool/i, '阻塞说明须限定本次工具');
  assert.match(text, /未执行|没有执行|blocked before its side effect|not executed/i,
    '说明须明确本次工具未执行副作用');
  assert.match(text, /此前步骤|先前步骤|前序步骤|earlier.*steps|previous.*steps/i,
    '说明须保留前序步骤可能已执行的事实');
  assert.doesNotMatch(text,
    /The run is blocked; no side effect was executed|整个运行.{0,15}(未执行|没有|无)副作用|所有步骤.{0,10}未执行|全部.{0,8}(已撤销|已回滚)|审计阻塞\s*[·—-]\s*副作用未执行|审计未得到明确结论，副作用已阻止/i,
    '不得将本次阻止扩写为整个运行没有副作用或已回滚');
}

export function assertTerminalEmptyCopy(text: string): void {
  assert.doesNotMatch(text, /正在等待第一步结果|waiting for (?:the )?first (?:step|result)/i,
    '真实零步骤终态不得继续提示等待第一步');
  assert.match(text, /暂无步骤|没有步骤|无步骤|no steps|no step records/i,
    '须有真实无步骤说明，而不是尚未加载/空白页面');
}

export function element(page: Page, qa: QaEnvironment, key: string) {
  const selector = qa.config.ui.selectors[key];
  if (!selector) throw new BlockedError(`公开UI定位缺少 ${key}；不能猜内部状态或创建控件`);
  return page.locator(selector);
}
export async function login(page: Page, qa: QaEnvironment): Promise<void> {
  if (!qa.config.ui.adapterConfirmed) throw new BlockedError('公开UI适配尚未确认');
  await qa.startWeb();
  const route = qa.config.ui.routes.login;
  if (!route) throw new BlockedError('缺少公开登录路由');
  await page.goto(`${qa.webUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await element(page, qa, 'username').fill('admin');
  await element(page, qa, 'password').fill('admin');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login'
    && r.request().method() === 'POST');
  await element(page, qa, 'login').click();
  expect((await response).status()).toBe(200);
  await expect(element(page, qa, 'username')).toBeHidden();
}
export async function groupPage(page: Page, qa: QaEnvironment, groupId: string): Promise<void> {
  const route = qa.config.ui.routes.group;
  if (!route) throw new BlockedError('缺少公开群详情路由');
  await page.goto(`${qa.webUrl}${route.replace('{id}', encodeURIComponent(groupId))}`,
    { waitUntil: 'domcontentloaded' });
}
export function runLink(page: Page, qa: QaEnvironment, runId: string) {
  // Scope to the real run from the public API, never whichever list item is first.
  return element(page, qa, 'runLink').and(page.locator(`a[href$="/${encodeURIComponent(runId)}"]`));
}
