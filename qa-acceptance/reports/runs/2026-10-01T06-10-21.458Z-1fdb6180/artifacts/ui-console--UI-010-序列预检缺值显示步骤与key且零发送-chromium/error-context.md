# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-010] 序列预检缺值显示步骤与key且零发送
- Location: tests/ui/console.spec.ts:367:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('.sequence-form label:has-text("消息序列") > select')

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
            - /url: "#/sequences/ec67b93b-e279-4a82-beb2-529689c62abd"
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
              - textbox "消息内容" [ref=e89]:
                - /placeholder: 输入要发送到群的消息…
              - generic [ref=e90]:
                - generic [ref=e91]:
                  - text: 发送身份
                  - combobox "发送身份" [ref=e92]:
                    - option "暂无可用账号" [disabled]
                    - option "account-1" [selected]
                    - option "account-2"
                    - option "account-3"
                - button "发送消息" [disabled] [ref=e93]
          - generic [ref=e96]:
            - generic [ref=e97]:
              - heading "最近 Agent 运行" [level=2] [ref=e98]
              - generic [ref=e101]: "0"
            - generic [ref=e102]:
              - strong [ref=e106]: 暂无运行记录
              - paragraph [ref=e107]: 开启 Agent 后，外部成员消息将触发运行。
        - complementary [ref=e108]:
          - generic [ref=e111]:
            - generic [ref=e112]:
              - heading "群资料" [level=2] [ref=e113]
              - button "编辑资料" [ref=e114] [cursor=pointer]
            - generic [ref=e115]:
              - generic [ref=e116]:
                - term [ref=e117]: 群简介
                - definition [ref=e118]: 未填写
              - generic [ref=e119]:
                - term [ref=e120]: 创建时间
                - definition [ref=e121]:
                  - time [ref=e122]: 2026/10/01 14:43:42
              - generic [ref=e123]:
                - term [ref=e124]: 平台群 ID
                - definition [ref=e125]: ec67b93b-e279-4a82-beb2-529689c62abd
          - generic [ref=e128]:
            - heading "自动化设置" [level=2] [ref=e130]
            - generic [ref=e131]:
              - generic [ref=e132]:
                - generic [ref=e133]:
                  - strong [ref=e134]: Agent 自动应答
                  - paragraph [ref=e135]: 接收外部成员消息并启动执行。
                - switch "Agent 自动应答" [ref=e136] [cursor=pointer]
              - generic [ref=e138]:
                - generic [ref=e139]:
                  - strong [ref=e140]: 允许自动移除成员
                  - paragraph [ref=e141]: 需审计通过且执行账号具备权限。
                - switch "允许自动移除成员" [ref=e142] [cursor=pointer]
          - generic [ref=e146]:
            - generic [ref=e147]:
              - heading "群成员" [level=2] [ref=e148]
              - generic [ref=e149]: "3"
            - generic [ref=e150]:
              - generic [ref=e151]:
                - generic [ref=e152]: "-2"
                - generic [ref=e153]:
                  - strong [ref=e154]: account-2
                  - generic "platform-account-2" [ref=e155]
                - generic [ref=e156]: 群管理员
              - generic [ref=e157]:
                - generic [ref=e158]: "-1"
                - generic [ref=e159]:
                  - strong [ref=e160]: account-1
                  - generic "platform-account-1" [ref=e161]
                - generic [ref=e162]: 群主
              - generic [ref=e163]:
                - generic [ref=e164]: "-3"
                - generic [ref=e165]:
                  - strong [ref=e166]: account-3
                  - generic "platform-account-3" [ref=e167]
                - generic [ref=e168]: 成员
            - paragraph [ref=e169]: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
          - generic [ref=e170]:
            - heading "退出群组" [level=3] [ref=e171]
            - paragraph [ref=e172]: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
            - button "全部服务账号退群" [ref=e173] [cursor=pointer]
      - generic [ref=e174]:
        - generic [ref=e175]: Kapibala Console
        - generic [ref=e176]: 状态有记录，执行可追踪。
```

# Test source

```ts
  280 |       stop_reason: 'tool_use',
  281 |       content: [
  282 |         {
  283 |           type: 'tool_use',
  284 |           id: 'ui-block',
  285 |           name: 'send_message',
  286 |           input: { text: '不可发送', idempotency_key: 'ui-block' },
  287 |         },
  288 |       ],
  289 |     },
  290 |   });
  291 |   qa.agent.enqueueAudits({ status: 500 }, { rawBody: 'invalid' }, { body: { verdict: 'unknown' } });
  292 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  293 |   incoming(qa, group, '触发审计阻断');
  294 |   const result = await run(qa, group);
  295 |   expect(result.status).toBe('blocked');
  296 |   await login(page, qa);
  297 |   await go(page, qa, 'group', group.id);
  298 |   await expect(page.locator('body')).toContainText(/blocked|已阻断|审计阻断/);
  299 |   await expect(page.locator('body')).toContainText(/audit_blocked|审计/);
  300 | });
  301 | test('[UI-008] 登录到群再到Agent步骤，错误原文和审计结果可读 @compat', async ({ qa, page }) => {
  302 |   const group = await prepare(qa);
  303 |   qa.agent.enqueueTurns(
  304 |     { rawBody: 'QA_BAD_RAW_RESPONSE' },
  305 |     {
  306 |       body: {
  307 |         stop_reason: 'tool_use',
  308 |         content: [
  309 |           {
  310 |             type: 'tool_use',
  311 |             id: 'ui-send',
  312 |             name: 'send_message',
  313 |             input: { text: 'UI审核文本', idempotency_key: 'ui-send' },
  314 |           },
  315 |         ],
  316 |       },
  317 |     },
  318 |     { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'UI完成摘要' }] } },
  319 |   );
  320 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  321 |   incoming(qa, group, '触发详情');
  322 |   const result = await run(qa, group);
  323 |   await login(page, qa);
  324 |   await go(page, qa, 'group', group.id);
  325 |   await element(page, qa, 'runLink').first().click();
  326 |   await expect(page).toHaveURL((url) => decodeURIComponent(url.href).includes(result.id));
  327 |   for (const text of ['send_message', 'UI审核文本', 'BAD_JSON', 'UI完成摘要'])
  328 |     await expect(page.locator('body')).toContainText(text);
  329 |   await expect(page.locator('body')).toContainText(/protocol_error|协议错误/);
  330 |   await expect(page.locator('body')).toContainText(/tool_use|工具调用/);
  331 |   await expect(page.locator('body')).toContainText(/pass|通过/);
  332 |   const toggle = element(page, qa, 'rawResponseToggle');
  333 |   if (await toggle.count()) await toggle.first().click();
  334 |   await expect(page.locator('body')).toContainText('QA_BAD_RAW_RESPONSE');
  335 | });
  336 | test('[UI-009] 序列预检展示继承与来源，确认后才启动', async ({ qa, page }) => {
  337 |   const group = await prepare(qa);
  338 |   const sequence = await createSequence(qa);
  339 |   await login(page, qa);
  340 |   await go(page, qa, 'group', group.id);
  341 |   let starts = 0;
  342 |   page.on('request', (request) => {
  343 |     if (
  344 |       request.method() === 'POST' &&
  345 |       new URL(request.url()).pathname === `/api/groups/${group.id}/sequence-runs`
  346 |     )
  347 |       starts++;
  348 |   });
  349 |   await element(page, qa, 'sequence').selectOption(sequence.id);
  350 |   await fillVars(page, qa, 'sequenceVars', { event: '验收活动', place: 'A室' });
  351 |   await fillVars(page, qa, 'sequenceStepVars', { '2': { place: 'B室' } });
  352 |   await element(page, qa, 'previewSequence').click();
  353 |   const dialog = element(page, qa, 'sequencePreview');
  354 |   await expect(dialog).toBeVisible();
  355 |   for (const text of ['验收活动', 'A室', 'B室']) await expect(dialog).toContainText(text);
  356 |   await expect(dialog).toContainText(/default|默认/);
  357 |   await expect(dialog).toContainText(/step:2|第\s*2\s*步/);
  358 |   await remains(async () => {
  359 |     expect(starts).toBe(0);
  360 |     expect(qa.gateway.snapshot().messages).toHaveLength(0);
  361 |   }, 1500);
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
> 380 |   await element(page, qa, 'sequence').selectOption(sequence.id);
      |                                       ^ Error: locator.selectOption: Test timeout of 120000ms exceeded.
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
  462 |   await expect(listDate).toBeVisible();
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
```