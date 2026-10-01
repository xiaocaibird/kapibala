# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-012] 群名称简介按纯文本显示且日期不随编辑变化
- Location: tests/ui/console.spec.ts:446:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('a[data-directory-group-id]').filter({ hasText: '资料显示群' }).locator('.group-profile > div:has(> dt:text-is("创建时间")) > dd')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('a[data-directory-group-id]').filter({ hasText: '资料显示群' }).locator('.group-profile > div:has(> dt:text-is("创建时间")) > dd') with timeout 8000ms
  - waiting for locator('a[data-directory-group-id]').filter({ hasText: '资料显示群' }).locator('.group-profile > div:has(> dt:text-is("创建时间")) > dd')

```

```yaml
- complementary:
  - link "K kapibala .":
    - /url: "#/groups"
  - text: 工作空间
  - navigation:
    - link "群组工作台":
      - /url: "#/groups"
    - link "服务账号":
      - /url: "#/accounts"
    - link "Agent 运行":
      - /url: "#/agent-runs"
    - link "定时序列":
      - /url: "#/sequences"
  - strong: 消息运营平台
  - text: 本地工作空间 A
  - strong: admin
  - text: 管理员
  - button "退出登录"
- text: 工作空间 /
- strong: 群组工作台
- status: 实时同步中
- main:
  - text: GROUP WORKSPACE
  - heading "群组工作台" [level=1]
  - paragraph: 按创建时间浏览群组，或搜索名称、简介和群 ID。
  - button "创建群组"
  - region "群列表查找、筛选与排序":
    - text: 搜索群组
    - searchbox "搜索群组"
    - button "清除搜索" [disabled]
    - text: 群状态
    - combobox "群状态":
      - option "全部" [selected]
      - option "可用"
      - option "不可写"
      - option "已退出"
    - text: Agent 自动应答
    - combobox "Agent 自动应答":
      - option "全部" [selected]
      - option "开启"
      - option "关闭"
    - text: 创建时间
    - combobox "创建时间":
      - option "新到旧" [selected]
      - option "旧到新"
    - button "重置条件" [disabled]
    - button "刷新列表"
    - paragraph: 搜索与筛选完整群目录；关键词忽略首尾空白与英文大小写，按整段匹配。
  - heading "所有群组" [level=2]
  - text: 已加载 1 个群 · 已全部加载
  - link "可用 资料显示群 网关 ID · gateway-group-1 <img src=x onerror=alert(1)> 描述 创建于 2026/10/01 14:45:50 3 位成员 Agent 未开启 查看群组详情":
    - /url: "#/groups/b4d5fcf7-c090-4568-af74-24d79269cf97"
    - text: 可用
    - heading "资料显示群" [level=3]
    - text: 网关 ID · gateway-group-1
    - paragraph: <img src=x onerror=alert(1)> 描述
    - text: 创建于
    - time: 2026/10/01 14:45:50
    - text: 3 位成员 Agent 未开启 查看群组详情
  - text: Kapibala Console 状态有记录，执行可追踪。
```

# Test source

```ts
  362 |   await element(page, qa, 'startSequence').click();
  363 |   await expect.poll(() => starts).toBe(1);
  364 |   await expect(page.locator('body')).toContainText(/运行|running|进度/);
  365 |   await expect.poll(() => qa.gateway.snapshot().messages.length, { timeout: 10000 }).toBe(2);
  366 | });
  367 | test('[UI-010] 序列预检缺值显示步骤与key且零发送', async ({ qa, page }) => {
  368 |   const group = await prepare(qa);
  369 |   const sequence = await createSequence(qa);
  370 |   await login(page, qa);
  371 |   await go(page, qa, 'group', group.id);
  372 |   let starts = 0;
  373 |   page.on('request', (request) => {
  374 |     if (
  375 |       request.method() === 'POST' &&
  376 |       new URL(request.url()).pathname === `/api/groups/${group.id}/sequence-runs`
  377 |     )
  378 |       starts++;
  379 |   });
  380 |   await element(page, qa, 'sequence').selectOption(sequence.id);
  381 |   await fillVars(page, qa, 'sequenceVars', { event: '缺位置' });
  382 |   await element(page, qa, 'previewSequence').click();
  383 |   const error = element(page, qa, 'sequencePreviewError');
  384 |   await expect(error).toBeVisible();
  385 |   await expect(child(error, qa, 'sequenceErrorStepIndex')).toContainText(/(^|\D)1(\D|$)/);
  386 |   await expect(child(error, qa, 'sequenceErrorKey')).toContainText(/\bplace\b/);
  387 |   await remains(async () => {
  388 |     expect(starts).toBe(0);
  389 |     expect(qa.gateway.snapshot().messages).toHaveLength(0);
  390 |   }, 1500);
  391 | });
  392 | test('[UI-011] 多个页面请求同时401只续期一次并恢复加载', async ({ qa, page }) => {
  393 |   const group = await prepare(qa);
  394 |   await login(page, qa);
  395 |   let refresh = 0;
  396 |   let injecting = true;
  397 |   const waiting: (() => Promise<void>)[] = [];
  398 |   page.on('request', (r) => {
  399 |     if (new URL(r.url()).pathname === '/api/auth/refresh') refresh++;
  400 |   });
  401 |   await page.route(`**/api/groups/${group.id}**`, async (route) => {
  402 |     if (!injecting || route.request().method() !== 'GET') {
  403 |       await route.continue();
  404 |       return;
  405 |     }
  406 |     await new Promise<void>((resolve) => {
  407 |       waiting.push(async () => {
  408 |         try {
  409 |           await route.fulfill({
  410 |             status: 401,
  411 |             contentType: 'application/json',
  412 |             body: JSON.stringify({
  413 |               error: {
  414 |                 code: 'UNAUTHORIZED',
  415 |                 message: 'QA controlled expiry response',
  416 |                 requestId: 'qa-expiry',
  417 |               },
  418 |             }),
  419 |           });
  420 |         } finally {
  421 |           resolve();
  422 |         }
  423 |       });
  424 |     });
  425 |   });
  426 |   try {
  427 |     await go(page, qa, 'group', group.id);
  428 |     try {
  429 |       await expect.poll(() => waiting.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  430 |     } catch {
  431 |       throw new BlockedError(
  432 |         '该公开页面未产生至少两个并发GET；需另行适配真实并发用户操作，不注入绕过应用客户端的fetch',
  433 |       );
  434 |     }
  435 |     injecting = false;
  436 |     await Promise.all(waiting.splice(0).map((release) => release()));
  437 |     await expect.poll(() => refresh).toBe(1);
  438 |     await expect(page.locator('body')).toContainText(/群管理员|creator/);
  439 |     await remains(async () => expect(refresh).toBe(1));
  440 |   } finally {
  441 |     injecting = false;
  442 |     await Promise.all(waiting.splice(0).map((release) => release()));
  443 |     await page.unrouteAll({ behavior: 'wait' });
  444 |   }
  445 | });
  446 | test('[UI-012] 群名称简介按纯文本显示且日期不随编辑变化', async ({ qa, page }) => {
  447 |   const group = await prepare(qa);
  448 |   const text = '<img src=x onerror=alert(1)> 描述';
  449 |   await qa.api.require(
  450 |     qa.api.patch(`/api/groups/${group.id}`, { name: '资料显示群', description: text }),
  451 |   );
  452 |   let dialogs = 0;
  453 |   page.on('dialog', async (d) => {
  454 |     dialogs++;
  455 |     await d.dismiss();
  456 |   });
  457 |   await login(page, qa);
  458 |   await go(page, qa, 'groups');
  459 |   await expect(page.locator('body')).toContainText('资料显示群');
  460 |   await expect(page.locator('body')).toContainText(text);
  461 |   const listDate = child(card(page, qa, '资料显示群'), qa, 'groupCreatedAt');
> 462 |   await expect(listDate).toBeVisible();
      |                          ^ Error: expect(locator).toBeVisible() failed
  463 |   expect((await listDate.innerText()).trim().length).toBeGreaterThan(0);
  464 |   await go(page, qa, 'group', group.id);
  465 |   await expect(page.locator('body')).toContainText(text);
  466 |   const createdAt = element(page, qa, 'groupCreatedAt');
  467 |   await expect(createdAt).toBeVisible();
  468 |   const beforeDate = await createdAt.innerText();
  469 |   const original = await qa.api.require(
  470 |     qa.api.get<Group & { createdAt: string }>(`/api/groups/${group.id}`),
  471 |   );
  472 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '编辑后的资料显示群' }));
  473 |   await expect(page.locator('body')).toContainText('编辑后的资料显示群');
  474 |   await expect(createdAt).toHaveText(beforeDate);
  475 |   await page.reload({ waitUntil: 'domcontentloaded' });
  476 |   await expect(element(page, qa, 'groupCreatedAt')).toHaveText(beforeDate);
  477 |   expect(
  478 |     (await qa.api.require(qa.api.get<Group & { createdAt: string }>(`/api/groups/${group.id}`)))
  479 |       .createdAt,
  480 |   ).toBe(original.createdAt);
  481 |   await remains(async () => {
  482 |     expect(dialogs).toBe(0);
  483 |     expect(await page.locator('img[onerror]').count()).toBe(0);
  484 |   });
  485 | });
  486 | test('[UI-013] 编辑表单未改直接关闭，dirty可继续或放弃', async ({ qa, page }) => {
  487 |   const group = await prepare(qa);
  488 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '原始名' }));
  489 |   await login(page, qa);
  490 |   await go(page, qa, 'group', group.id);
  491 |   await element(page, qa, 'editProfile').click();
  492 |   await element(page, qa, 'closeProfile').click();
  493 |   await expect(element(page, qa, 'profileDialog')).toBeHidden();
  494 |   await element(page, qa, 'editProfile').click();
  495 |   await element(page, qa, 'groupName').fill('未保存');
  496 |   await element(page, qa, 'closeProfile').click();
  497 |   await element(page, qa, 'continueEditing').click();
  498 |   await expect(element(page, qa, 'groupName')).toHaveValue('未保存');
  499 |   await element(page, qa, 'closeProfile').click();
  500 |   await element(page, qa, 'discardChanges').click();
  501 |   await expect(element(page, qa, 'profileDialog')).toBeHidden();
  502 |   expect(
  503 |     (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
  504 |   ).toBe('原始名');
  505 | });
  506 | test('[UI-014] 提交中关闭受限，失败保留输入且不重放写入', async ({ qa, page }) => {
  507 |   const group = await prepare(qa);
  508 |   await login(page, qa);
  509 |   await go(page, qa, 'group', group.id);
  510 |   await element(page, qa, 'editProfile').click();
  511 |   await element(page, qa, 'groupName').fill('保留草稿');
  512 |   let requests = 0;
  513 |   let release!: () => void;
  514 |   const held = new Promise<void>((r) => (release = r));
  515 |   await page.route(`**/api/groups/${group.id}`, async (route) => {
  516 |     if (route.request().method() !== 'PATCH') {
  517 |       await route.continue();
  518 |       return;
  519 |     }
  520 |     requests++;
  521 |     await held;
  522 |     await route.fulfill({
  523 |       status: 503,
  524 |       contentType: 'application/json',
  525 |       body: JSON.stringify({
  526 |         error: { code: 'SERVICE_UNAVAILABLE', message: 'QA fault', requestId: 'qa-ui-save' },
  527 |       }),
  528 |     });
  529 |   });
  530 |   try {
  531 |     await element(page, qa, 'saveProfile').click();
  532 |     await expect.poll(() => requests).toBe(1);
  533 |     await element(page, qa, 'saveProfile').click({ force: true });
  534 |     await page.keyboard.press('Escape');
  535 |     await expect(element(page, qa, 'profileDialog')).toBeVisible();
  536 |     release();
  537 |     await expect(element(page, qa, 'saveProfile')).toBeEnabled();
  538 |     await expect(element(page, qa, 'groupName')).toHaveValue('保留草稿');
  539 |     await remains(async () => expect(requests).toBe(1));
  540 |   } finally {
  541 |     release();
  542 |     await page.unrouteAll({ behavior: 'wait' });
  543 |   }
  544 | });
  545 | test('[UI-015] 同字段冲突保留草稿，明确再确认才提交', async ({ qa, page }) => {
  546 |   const group = await prepare(qa);
  547 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '最初' }));
  548 |   await login(page, qa);
  549 |   await go(page, qa, 'group', group.id);
  550 |   await element(page, qa, 'editProfile').click();
  551 |   await element(page, qa, 'groupName').fill('我的草稿');
  552 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '服务器新版' }));
  553 |   const response = page.waitForResponse((r) => r.request().method() === 'PATCH');
  554 |   await element(page, qa, 'saveProfile').click();
  555 |   expect((await response).status()).toBe(409);
  556 |   await expect(element(page, qa, 'groupName')).toHaveValue('我的草稿');
  557 |   await expect(page.locator('body')).toContainText('服务器新版');
  558 |   expect(
  559 |     (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
  560 |   ).toBe('服务器新版');
  561 |   await element(page, qa, 'confirmConflict').click();
  562 |   await expect
```