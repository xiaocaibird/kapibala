# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/architecture.spec.ts >> [ARC-UI-012] 持续暂时失败耗尽后停止自动读取
- Location: tests/ui/architecture.spec.ts:428:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 4
Received: 5
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
      - link "服务账号" [ref=e14] [cursor=pointer]:
        - /url: "#/accounts"
      - link "Agent 运行" [ref=e19] [cursor=pointer]:
        - /url: "#/agent-runs"
      - link "定时序列" [active] [ref=e23] [cursor=pointer]:
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
        - strong [ref=e54]: 定时序列
      - status [ref=e56]: 连接恢复中
    - main [ref=e58]:
      - generic [ref=e59]: 实时连接已断开，正在自动重连并补齐期间的变化。
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: SCHEDULED MESSAGING
          - heading "定时序列" [level=1] [ref=e63]
          - paragraph [ref=e64]: 预检每一步的消息与变量来源，再有序发送到群组。
        - button "新建序列" [ref=e66] [cursor=pointer]
      - alert [ref=e69]:
        - generic [ref=e72]:
          - strong [ref=e73]: QA controlled resource failure
          - generic [ref=e74]: SERVICE_UNAVAILABLE · 请求 qa-architecture
      - generic [ref=e76]:
        - paragraph [ref=e77]: 当前群组：未选择 · 状态：—
        - paragraph [ref=e78]: 当前展示运行：尚无运行
      - generic [ref=e79]:
        - generic [ref=e80]:
          - generic [ref=e81]:
            - heading "运行配置" [level=2] [ref=e82]
            - generic [ref=e83]: 先预检 · 后执行
          - generic [ref=e84]:
            - generic [ref=e85]:
              - text: 目标群组
              - combobox "目标群组" [ref=e86]:
                - option "请选择群组" [disabled] [selected]
            - generic [ref=e87]:
              - text: 消息序列
              - combobox "消息序列" [ref=e88]:
                - option "请选择序列" [disabled] [selected]
            - generic [ref=e89]:
              - text: 默认变量
              - code [ref=e90]: vars
              - textbox "默认变量 vars" [ref=e91]: "{}"
            - paragraph [ref=e92]: JSON 键值对象。此序列没有占位符。空字符串视为未提供。
            - generic [ref=e93]:
              - text: 分步变量
              - code [ref=e94]: stepVars
              - textbox "分步变量 stepVars" [ref=e95]: "{}"
            - paragraph [ref=e96]:
              - text: 例如
              - code [ref=e97]: "{\"2\":{\"location\":\"共享盘\"}}"
              - text: 。从该步起沿用新值；空字符串保留原值。
            - button "预检所有步骤" [disabled] [ref=e98]
        - generic [ref=e101]:
          - generic [ref=e103]:
            - strong [ref=e110]: 尚无序列运行
            - paragraph [ref=e111]: 选择序列并完成变量预检后，执行进度会在这里实时展示。
          - generic [ref=e112]:
            - heading "发送后，再开始下一步计时" [level=3] [ref=e113]
            - paragraph [ref=e114]: 限流时步骤等待恢复。没有匹配角色的可用账号时跳过；群不可写时停止运行。
      - generic [ref=e115]:
        - generic [ref=e116]: Kapibala Console
        - generic [ref=e117]: 状态有记录，执行可追踪。
```

# Test source

```ts
  343 | test('[ARC-UI-006] 序列写请求503失败不自动重放', async ({ qa, page }) => {
  344 |   await qa.api.login();
  345 |   await openDefinition(page, qa);
  346 |   await page.route('**/api/sequences', async (route) => {
  347 |     if (route.request().method() === 'POST') await errorResponse(route);
  348 |     else await route.continue();
  349 |   });
  350 |   try {
  351 |     const value = definition('QA禁止写重放');
  352 |     await element(page, qa, 'sequenceDefinitionInput').fill(JSON.stringify(value));
  353 |     await element(page, qa, 'saveSequenceDefinition').click();
  354 |     await expect(element(page, qa, 'sequenceDefinitionError')).toBeVisible();
  355 |     await expect(element(page, qa, 'sequenceDefinitionInput')).toHaveValue(JSON.stringify(value));
  356 |     await remains(async () => expect(writes(page, '/api/sequences')).toHaveLength(1));
  357 |     const list = await qa.api.require(qa.api.get<{ name: string }[]>('/api/sequences'));
  358 |     expect(list.some((s) => s.name === value.name)).toBe(false);
  359 |     expect(qa.gateway.snapshot().messages).toHaveLength(0);
  360 |   } finally {
  361 |     await page.unrouteAll({ behavior: 'wait' });
  362 |   }
  363 | });
  364 | test('[ARC-UI-007] 无后续事件或轮询时两次503后自动呈现', async ({ qa, page }) => {
  365 |   const item = await seed(qa);
  366 |   let attempts = 0;
  367 |   await page.route('**/api/sequences', async (route) => {
  368 |     if (route.request().method() !== 'GET') return route.continue();
  369 |     attempts++;
  370 |     if (attempts <= 2) await errorResponse(route);
  371 |     else await route.continue();
  372 |   });
  373 |   try {
  374 |     const baseline = await startQuietRead(page, qa);
  375 |     await expect(element(page, qa, 'sequence')).toHaveValue(item.id, {
  376 |       timeout: profile.recoveryTimeoutMs,
  377 |     });
  378 |     expect(attempts).toBe(3);
  379 |     await expect(element(page, qa, 'sequenceResourceError')).toBeHidden();
  380 |     await remains(async () => {
  381 |       expect(attempts).toBe(3);
  382 |       noNewEvents(page, baseline);
  383 |     });
  384 |   } finally {
  385 |     await page.unrouteAll({ behavior: 'wait' });
  386 |   }
  387 | });
  388 | const permanentCases = [
  389 |   { id: 'ARC-UI-008', title: '权限403不形成资源请求风暴', status: 403, code: 'FORBIDDEN' },
  390 |   { id: 'ARC-UI-009', title: '429不无视限流进行通用重试', status: 429, code: 'RATE_LIMITED' },
  391 |   { id: 'ARC-UI-010', title: '请求校验400不自动重试', status: 400, code: 'VALIDATION_ERROR' },
  392 |   {
  393 |     id: 'ARC-UI-011',
  394 |     title: '成功HTTP的非法响应格式不按502临时错误重试',
  395 |     status: 200,
  396 |     code: 'INVALID_RESPONSE',
  397 |   },
  398 | ];
  399 | for (const scenario of permanentCases)
  400 |   test(`[${scenario.id}] ${scenario.title}`, async ({ qa, page }) => {
  401 |     const item = await seed(qa);
  402 |     let attempts = 0;
  403 |     await page.route('**/api/sequences', async (route) => {
  404 |       if (route.request().method() !== 'GET') return route.continue();
  405 |       attempts++;
  406 |       if (scenario.status === 200)
  407 |         await route.fulfill({
  408 |           status: 200,
  409 |           contentType: 'application/json',
  410 |           body: '{"notASequenceArray":true}',
  411 |         });
  412 |       else await errorResponse(route, scenario.status, scenario.code);
  413 |     });
  414 |     try {
  415 |       const baseline = await startQuietRead(page, qa);
  416 |       await expect(element(page, qa, 'sequenceResourceError')).toBeVisible();
  417 |       await remains(async () => {
  418 |         expect(attempts).toBe(1);
  419 |         expect(
  420 |           await element(page, qa, 'sequence').locator(`option[value="${item.id}"]`).count(),
  421 |         ).toBe(0);
  422 |         noNewEvents(page, baseline);
  423 |       });
  424 |     } finally {
  425 |       await page.unrouteAll({ behavior: 'wait' });
  426 |     }
  427 |   });
  428 | test('[ARC-UI-012] 持续暂时失败耗尽后停止自动读取', async ({ qa, page }) => {
  429 |   await seed(qa);
  430 |   let attempts = 0;
  431 |   await page.route('**/api/sequences', async (route) => {
  432 |     if (route.request().method() !== 'GET') return route.continue();
  433 |     attempts++;
  434 |     await errorResponse(route);
  435 |   });
  436 |   try {
  437 |     const baseline = await startQuietRead(page, qa);
  438 |     await expect
  439 |       .poll(() => attempts, { timeout: profile.recoveryTimeoutMs })
  440 |       .toBe(profile.maximumReadAttempts);
  441 |     await expect(element(page, qa, 'sequenceResourceError')).toBeVisible();
  442 |     await remains(async () => {
> 443 |       expect(attempts).toBe(profile.maximumReadAttempts);
      |                        ^ Error: expect(received).toBe(expected) // Object.is equality
  444 |       noNewEvents(page, baseline);
  445 |     });
  446 |   } finally {
  447 |     await page.unrouteAll({ behavior: 'wait' });
  448 |   }
  449 | });
  450 | test('[ARC-UI-013] 切页取消旧读取及后续退避', async ({ qa, page }) => {
  451 |   await seed(qa);
  452 |   let attempts = 0;
  453 |   let release: (() => void) | undefined;
  454 |   const hold = new Promise<void>((resolve) => {
  455 |     release = resolve;
  456 |   });
  457 |   await page.route('**/api/sequences', async (route) => {
  458 |     if (route.request().method() !== 'GET') return route.continue();
  459 |     attempts++;
  460 |     await hold;
  461 |     try {
  462 |       await errorResponse(route);
  463 |     } catch {
  464 |       /* Browser may cancel the old request on departure. */
  465 |     }
  466 |   });
  467 |   try {
  468 |     await startQuietRead(page, qa);
  469 |     await expect.poll(() => attempts).toBe(1);
  470 |     await element(page, qa, 'navAccounts').click();
  471 |     await expect(element(page, qa, 'accountRow')).not.toHaveCount(0);
  472 |     release!();
  473 |     await remains(async () => {
  474 |       expect(attempts).toBe(1);
  475 |       await expect(element(page, qa, 'sequenceResourceError')).toBeHidden();
  476 |     });
  477 |   } finally {
  478 |     release!();
  479 |     await page.unrouteAll({ behavior: 'wait' });
  480 |   }
  481 | });
  482 | test('[ARC-UI-014] 换身份期间旧读取迟到不能覆盖新会话', async ({ qa, page }) => {
  483 |   const old = await seed(qa, 'QA旧快照');
  484 |   let attempts = 0;
  485 |   let release: (() => void) | undefined;
  486 |   const hold = new Promise<void>((resolve) => {
  487 |     release = resolve;
  488 |   });
  489 |   let receivedOld = false;
  490 |   let originalDocument: Awaited<ReturnType<Page['evaluateHandle']>> | undefined;
  491 |   await page.route('**/api/sequences', async (route) => {
  492 |     if (route.request().method() !== 'GET') return route.continue();
  493 |     attempts++;
  494 |     if (attempts !== 1) return route.continue();
  495 |     const response = await route.fetch();
  496 |     receivedOld = true;
  497 |     await hold;
  498 |     try {
  499 |       await route.fulfill({ response });
  500 |     } catch {
  501 |       /* Cancelled old session request is acceptable. */
  502 |     }
  503 |   });
  504 |   try {
  505 |     await startQuietRead(page, qa);
  506 |     await expect.poll(() => receivedOld).toBe(true);
  507 |     originalDocument = await page.evaluateHandle(() => document);
  508 |     const logout = page.waitForResponse(
  509 |       (r) => new URL(r.url()).pathname === '/api/auth/logout' && r.request().method() === 'POST',
  510 |     );
  511 |     await element(page, qa, 'logout').click();
  512 |     expect((await logout).ok()).toBe(true);
  513 |     await expect(element(page, qa, 'username')).toBeVisible();
  514 |     const fresh = await seed(qa, 'QA新会话快照');
  515 |     // Stay in the existing document: a full reload would discard the JS state under test.
  516 |     await login(page, qa, 'viewer', false);
  517 |     let sameDocument = false;
  518 |     try {
  519 |       sameDocument = await page.evaluate(
  520 |         (oldDocument) => oldDocument === document,
  521 |         originalDocument,
  522 |       );
  523 |     } catch {
  524 |       /* An old execution context proves the same-document precondition was not met. */
  525 |     }
  526 |     if (!sameDocument)
  527 |       throw new BlockedError(
  528 |         '注销/登录改变了浏览器document，不能将整页重载当作同文档会话代次隔离证据',
  529 |       );
  530 |     await element(page, qa, 'navSequences').click();
  531 |     await expect(element(page, qa, 'sequence').locator(`option[value="${fresh.id}"]`)).toHaveCount(
  532 |       1,
  533 |     );
  534 |     release!();
  535 |     await remains(async () => {
  536 |       await expect(
  537 |         element(page, qa, 'sequence').locator(`option[value="${fresh.id}"]`),
  538 |       ).toHaveCount(1);
  539 |       await expect(element(page, qa, 'sequence').locator(`option[value="${old.id}"]`)).toHaveCount(
  540 |         1,
  541 |       );
  542 |       await expect(element(page, qa, 'createSequence')).toBeHidden();
  543 |     });
```