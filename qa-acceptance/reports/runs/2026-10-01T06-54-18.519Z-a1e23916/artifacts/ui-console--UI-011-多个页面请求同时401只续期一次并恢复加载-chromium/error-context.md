# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-011] 多个页面请求同时401只续期一次并恢复加载
- Location: tests/ui/console.spec.ts:398:1

# Error details

```
BlockedError: [BLOCKED] 该公开页面未产生至少两个并发GET；需另行适配真实并发用户操作，不注入绕过应用客户端的fetch
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - link "K kapibala ." [ref=e5] [cursor=pointer]:
      - /url: "#/groups"
      - generic [ref=e6]: K
      - text: kapibala
      - generic [ref=e7]: .
    - generic [ref=e8]: 工作空间
    - navigation [ref=e9]:
      - link "群组工作台" [ref=e10] [cursor=pointer]:
        - /url: "#/groups"
      - link "服务账号" [ref=e15] [cursor=pointer]:
        - /url: "#/accounts"
      - link "Agent 运行" [ref=e20] [cursor=pointer]:
        - /url: "#/agent-runs"
      - link "定时序列" [ref=e24] [cursor=pointer]:
        - /url: "#/sequences"
    - generic [ref=e31]:
      - generic [ref=e39]:
        - strong [ref=e40]: 消息运营平台
        - generic [ref=e41]: 本地工作空间
      - generic [ref=e42]:
        - generic [ref=e43]: A
        - generic [ref=e44]:
          - strong [ref=e45]: admin
          - generic [ref=e46]: 管理员
        - button "退出登录" [ref=e47] [cursor=pointer]
  - generic [ref=e50]:
    - generic [ref=e51]:
      - generic [ref=e52]:
        - text: 工作空间
        - generic [ref=e53]: /
        - strong [ref=e54]: 群组工作台
      - status [ref=e56]: 连接恢复中
    - main [ref=e58]:
      - generic [ref=e59]: 实时连接已断开，正在自动重连并补齐期间的变化。
      - link "← 群组工作台" [ref=e60] [cursor=pointer]:
        - /url: "#/groups"
      - generic [ref=e63]:
        - generic [ref=e64]:
          - generic [ref=e65]: GROUP DETAILS
          - heading "gateway-group-1" [level=1] [ref=e66]
          - paragraph [ref=e67]: 网关群 ID · gateway-group-1
        - generic [ref=e68]:
          - generic [ref=e69]: 可用
          - link "定时序列" [ref=e71] [cursor=pointer]:
            - /url: "#/sequences/2f4cfc21-33a1-42e9-aead-fdc614bca06c"
      - generic [ref=e72]:
        - generic [ref=e73]:
          - generic [ref=e74]:
            - generic [ref=e75]:
              - heading "消息时间线" [level=2] [ref=e76]
              - generic [ref=e79]: 0 条已加载
            - generic [ref=e82]:
              - strong [ref=e86]: 消息会出现在这里
              - paragraph [ref=e87]: 发送一条消息，或等待群成员的消息到达。
            - generic [ref=e88]:
              - alert [ref=e89]:
                - generic [ref=e92]:
                  - strong [ref=e93]: 暂时无法连接服务，请稍后重试。
                  - generic [ref=e94]: NETWORK_ERROR
              - textbox "消息内容" [ref=e95]:
                - /placeholder: 输入要发送到群的消息…
              - generic [ref=e96]:
                - generic [ref=e97]:
                  - text: 发送身份
                  - combobox "发送身份" [ref=e98]:
                    - option "暂无可用账号" [disabled]
                    - option "account-1" [selected]
                    - option "account-2"
                    - option "account-3"
                - button "发送消息" [disabled] [ref=e99]
          - generic [ref=e102]:
            - generic [ref=e103]:
              - heading "最近 Agent 运行" [level=2] [ref=e104]
              - generic [ref=e107]: "0"
            - generic [ref=e108]:
              - strong [ref=e112]: 暂无运行记录
              - paragraph [ref=e113]: 开启 Agent 后，外部成员消息将触发运行。
        - complementary [ref=e114]:
          - generic [ref=e117]:
            - generic [ref=e118]:
              - heading "群资料" [level=2] [ref=e119]
              - button "编辑资料" [ref=e120] [cursor=pointer]
            - generic [ref=e121]:
              - generic [ref=e122]:
                - term [ref=e123]: 群简介
                - definition [ref=e124]: 未填写
              - generic [ref=e125]:
                - term [ref=e126]: 创建时间
                - definition [ref=e127]:
                  - time [ref=e128]: 2026/10/01 15:28:12
              - generic [ref=e129]:
                - term [ref=e130]: 平台群 ID
                - definition [ref=e131]: 2f4cfc21-33a1-42e9-aead-fdc614bca06c
          - generic [ref=e134]:
            - heading "自动化设置" [level=2] [ref=e136]
            - generic [ref=e137]:
              - generic [ref=e138]:
                - generic [ref=e139]:
                  - strong [ref=e140]: Agent 自动应答
                  - paragraph [ref=e141]: 接收外部成员消息并启动执行。
                - switch "Agent 自动应答" [ref=e142] [cursor=pointer]
              - generic [ref=e144]:
                - generic [ref=e145]:
                  - strong [ref=e146]: 允许自动移除成员
                  - paragraph [ref=e147]: 需审计通过且执行账号具备权限。
                - switch "允许自动移除成员" [ref=e148] [cursor=pointer]
          - generic [ref=e152]:
            - generic [ref=e153]:
              - heading "群成员" [level=2] [ref=e154]
              - generic [ref=e155]: "3"
            - generic [ref=e156]:
              - generic [ref=e157]:
                - generic [ref=e158]: "-2"
                - generic [ref=e159]:
                  - strong [ref=e160]: account-2
                  - generic "platform-account-2" [ref=e161]
                - generic [ref=e162]: 群管理员
              - generic [ref=e163]:
                - generic [ref=e164]: "-1"
                - generic [ref=e165]:
                  - strong [ref=e166]: account-1
                  - generic "platform-account-1" [ref=e167]
                - generic [ref=e168]: 群主
              - generic [ref=e169]:
                - generic [ref=e170]: "-3"
                - generic [ref=e171]:
                  - strong [ref=e172]: account-3
                  - generic "platform-account-3" [ref=e173]
                - generic [ref=e174]: 成员
            - paragraph [ref=e175]: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
          - generic [ref=e176]:
            - heading "退出群组" [level=3] [ref=e177]
            - paragraph [ref=e178]: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
            - button "全部服务账号退群" [ref=e179] [cursor=pointer]
      - generic [ref=e180]:
        - generic [ref=e181]: Kapibala Console
        - generic [ref=e182]: 状态有记录，执行可追踪。
```

# Test source

```ts
  337 |   const group = await prepare(qa);
  338 |   const sequence = await createSequence(qa);
  339 |   await login(page, qa);
  340 |   await go(page, qa, 'group', group.id);
  341 |   // The public console exposes sequence configuration on its own page.
  342 |   await element(page, qa, 'navSequences').click();
  343 |   await element(page, qa, 'sequenceGroup').selectOption(group.id);
  344 |   let starts = 0;
  345 |   page.on('request', (request) => {
  346 |     if (
  347 |       request.method() === 'POST' &&
  348 |       new URL(request.url()).pathname === `/api/groups/${group.id}/sequence-runs`
  349 |     )
  350 |       starts++;
  351 |   });
  352 |   await element(page, qa, 'sequence').selectOption(sequence.id);
  353 |   await fillVars(page, qa, 'sequenceVars', { event: '验收活动', place: 'A室' });
  354 |   await fillVars(page, qa, 'sequenceStepVars', { '2': { place: 'B室' } });
  355 |   await element(page, qa, 'previewSequence').click();
  356 |   const dialog = element(page, qa, 'sequencePreview');
  357 |   await expect(dialog).toBeVisible();
  358 |   for (const text of ['验收活动', 'A室', 'B室']) await expect(dialog).toContainText(text);
  359 |   await expect(dialog).toContainText(/default|默认/);
  360 |   await expect(dialog).toContainText(/step:2|第\s*2\s*步/);
  361 |   await remains(async () => {
  362 |     expect(starts).toBe(0);
  363 |     expect(qa.gateway.snapshot().messages).toHaveLength(0);
  364 |   }, 1500);
  365 |   await element(page, qa, 'startSequence').click();
  366 |   await expect.poll(() => starts).toBe(1);
  367 |   await expect(page.locator('body')).toContainText(/运行|running|进度/);
  368 |   await expect.poll(() => qa.gateway.snapshot().messages.length, { timeout: 10000 }).toBe(2);
  369 | });
  370 | test('[UI-010] 序列预检缺值显示步骤与key且零发送', async ({ qa, page }) => {
  371 |   const group = await prepare(qa);
  372 |   const sequence = await createSequence(qa);
  373 |   await login(page, qa);
  374 |   await go(page, qa, 'group', group.id);
  375 |   // The public console exposes sequence configuration on its own page.
  376 |   await element(page, qa, 'navSequences').click();
  377 |   await element(page, qa, 'sequenceGroup').selectOption(group.id);
  378 |   let starts = 0;
  379 |   page.on('request', (request) => {
  380 |     if (
  381 |       request.method() === 'POST' &&
  382 |       new URL(request.url()).pathname === `/api/groups/${group.id}/sequence-runs`
  383 |     )
  384 |       starts++;
  385 |   });
  386 |   await element(page, qa, 'sequence').selectOption(sequence.id);
  387 |   await fillVars(page, qa, 'sequenceVars', { event: '缺位置' });
  388 |   await element(page, qa, 'previewSequence').click();
  389 |   const error = element(page, qa, 'sequencePreviewError');
  390 |   await expect(error).toBeVisible();
  391 |   await expect(child(error, qa, 'sequenceErrorStepIndex')).toContainText(/(^|\D)1(\D|$)/);
  392 |   await expect(child(error, qa, 'sequenceErrorKey')).toContainText(/\bplace\b/);
  393 |   await remains(async () => {
  394 |     expect(starts).toBe(0);
  395 |     expect(qa.gateway.snapshot().messages).toHaveLength(0);
  396 |   }, 1500);
  397 | });
  398 | test('[UI-011] 多个页面请求同时401只续期一次并恢复加载', async ({ qa, page }) => {
  399 |   const group = await prepare(qa);
  400 |   await login(page, qa);
  401 |   let refresh = 0;
  402 |   let injecting = true;
  403 |   const waiting: (() => Promise<void>)[] = [];
  404 |   page.on('request', (r) => {
  405 |     if (new URL(r.url()).pathname === '/api/auth/refresh') refresh++;
  406 |   });
  407 |   await page.route(`**/api/groups/${group.id}**`, async (route) => {
  408 |     if (!injecting || route.request().method() !== 'GET') {
  409 |       await route.continue();
  410 |       return;
  411 |     }
  412 |     await new Promise<void>((resolve) => {
  413 |       waiting.push(async () => {
  414 |         try {
  415 |           await route.fulfill({
  416 |             status: 401,
  417 |             contentType: 'application/json',
  418 |             body: JSON.stringify({
  419 |               error: {
  420 |                 code: 'UNAUTHORIZED',
  421 |                 message: 'QA controlled expiry response',
  422 |                 requestId: 'qa-expiry',
  423 |               },
  424 |             }),
  425 |           });
  426 |         } finally {
  427 |           resolve();
  428 |         }
  429 |       });
  430 |     });
  431 |   });
  432 |   try {
  433 |     await go(page, qa, 'group', group.id);
  434 |     try {
  435 |       await expect.poll(() => waiting.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  436 |     } catch {
> 437 |       throw new BlockedError(
      |             ^ BlockedError: [BLOCKED] 该公开页面未产生至少两个并发GET；需另行适配真实并发用户操作，不注入绕过应用客户端的fetch
  438 |         '该公开页面未产生至少两个并发GET；需另行适配真实并发用户操作，不注入绕过应用客户端的fetch',
  439 |       );
  440 |     }
  441 |     injecting = false;
  442 |     await Promise.all(waiting.splice(0).map((release) => release()));
  443 |     await expect.poll(() => refresh).toBe(1);
  444 |     await expect(page.locator('body')).toContainText(/群管理员|creator/);
  445 |     await remains(async () => expect(refresh).toBe(1));
  446 |   } finally {
  447 |     injecting = false;
  448 |     await Promise.all(waiting.splice(0).map((release) => release()));
  449 |     await page.unrouteAll({ behavior: 'wait' });
  450 |   }
  451 | });
  452 | test('[UI-012] 群名称简介按纯文本显示且日期不随编辑变化', async ({ qa, page }) => {
  453 |   const group = await prepare(qa);
  454 |   const text = '<img src=x onerror=alert(1)> 描述';
  455 |   await qa.api.require(
  456 |     qa.api.patch(`/api/groups/${group.id}`, { name: '资料显示群', description: text }),
  457 |   );
  458 |   let dialogs = 0;
  459 |   page.on('dialog', async (d) => {
  460 |     dialogs++;
  461 |     await d.dismiss();
  462 |   });
  463 |   await login(page, qa);
  464 |   await go(page, qa, 'groups');
  465 |   await expect(page.locator('body')).toContainText('资料显示群');
  466 |   await expect(page.locator('body')).toContainText(text);
  467 |   const listDate = child(card(page, qa, '资料显示群'), qa, 'groupCreatedAt');
  468 |   await expect(listDate).toBeVisible();
  469 |   expect((await listDate.innerText()).trim().length).toBeGreaterThan(0);
  470 |   await go(page, qa, 'group', group.id);
  471 |   await expect(page.locator('body')).toContainText(text);
  472 |   const createdAt = element(page, qa, 'groupCreatedAt');
  473 |   await expect(createdAt).toBeVisible();
  474 |   const beforeDate = await createdAt.innerText();
  475 |   const original = await qa.api.require(
  476 |     qa.api.get<Group & { createdAt: string }>(`/api/groups/${group.id}`),
  477 |   );
  478 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '编辑后的资料显示群' }));
  479 |   await expect(page.locator('body')).toContainText('编辑后的资料显示群');
  480 |   await expect(createdAt).toHaveText(beforeDate);
  481 |   await page.reload({ waitUntil: 'domcontentloaded' });
  482 |   await expect(element(page, qa, 'groupCreatedAt')).toHaveText(beforeDate);
  483 |   expect(
  484 |     (await qa.api.require(qa.api.get<Group & { createdAt: string }>(`/api/groups/${group.id}`)))
  485 |       .createdAt,
  486 |   ).toBe(original.createdAt);
  487 |   await remains(async () => {
  488 |     expect(dialogs).toBe(0);
  489 |     expect(await page.locator('img[onerror]').count()).toBe(0);
  490 |   });
  491 | });
  492 | test('[UI-013] 编辑表单未改直接关闭，dirty可继续或放弃', async ({ qa, page }) => {
  493 |   const group = await prepare(qa);
  494 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '原始名' }));
  495 |   await login(page, qa);
  496 |   await go(page, qa, 'group', group.id);
  497 |   await element(page, qa, 'editProfile').click();
  498 |   await element(page, qa, 'closeProfile').click();
  499 |   await expect(element(page, qa, 'profileDialog')).toBeHidden();
  500 |   await element(page, qa, 'editProfile').click();
  501 |   await element(page, qa, 'groupName').fill('未保存');
  502 |   await element(page, qa, 'closeProfile').click();
  503 |   await element(page, qa, 'continueEditing').click();
  504 |   await expect(element(page, qa, 'groupName')).toHaveValue('未保存');
  505 |   await element(page, qa, 'closeProfile').click();
  506 |   await element(page, qa, 'discardChanges').click();
  507 |   await expect(element(page, qa, 'profileDialog')).toBeHidden();
  508 |   expect(
  509 |     (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
  510 |   ).toBe('原始名');
  511 | });
  512 | test('[UI-014] 提交中关闭受限，失败保留输入且不重放写入', async ({ qa, page }) => {
  513 |   const group = await prepare(qa);
  514 |   await login(page, qa);
  515 |   await go(page, qa, 'group', group.id);
  516 |   await element(page, qa, 'editProfile').click();
  517 |   await element(page, qa, 'groupName').fill('保留草稿');
  518 |   let requests = 0;
  519 |   let release!: () => void;
  520 |   const held = new Promise<void>((r) => (release = r));
  521 |   await page.route(`**/api/groups/${group.id}`, async (route) => {
  522 |     if (route.request().method() !== 'PATCH') {
  523 |       await route.continue();
  524 |       return;
  525 |     }
  526 |     requests++;
  527 |     await held;
  528 |     await route.fulfill({
  529 |       status: 503,
  530 |       contentType: 'application/json',
  531 |       body: JSON.stringify({
  532 |         error: { code: 'SERVICE_UNAVAILABLE', message: 'QA fault', requestId: 'qa-ui-save' },
  533 |       }),
  534 |     });
  535 |   });
  536 |   try {
  537 |     await element(page, qa, 'saveProfile').click();
```