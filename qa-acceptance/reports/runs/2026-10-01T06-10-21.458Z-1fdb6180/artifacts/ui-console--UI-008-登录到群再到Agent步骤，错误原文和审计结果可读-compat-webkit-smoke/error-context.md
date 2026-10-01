# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-008] 登录到群再到Agent步骤，错误原文和审计结果可读 @compat
- Location: tests/ui/console.spec.ts:301:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('body')
Timeout: 8000ms
- Expected substring  - 1
+ Received string     + 6

- send_message
+
+     Kkapibala.工作空间群组工作台服务账号Agent 运行定时序列消息运营平台本地工作空间Aadmin管理员工作空间 / Agent 运行实时同步中← 返回群组AGENT EXECUTION运行详情9578218c-542e-445e-9a37-225ccab22539失败当前运行状态失败结束原因protocol_errors执行步数3 / 12运行摘要尚未生成摘要执行轨迹每一步保留输入、结果和错误证据01协议错误无工具调用 ID协议错误第 1 步 · 协议错误 · 执行结果BAD_JSONBAD_JSON查看协议错误原始响应 最多 2 KB{"code":"TOOLS_INVALID"}02协议错误无工具调用 ID协议错误第 2 步 · 协议错误 · 执行结果BAD_JSONBAD_JSON查看协议错误原始响应 最多 2 KB{"code":"TOOLS_INVALID"}03协议错误无工具调用 ID协议错误第 3 步 · 协议错误 · 执行结果BAD_JSONBAD_JSON查看协议错误原始响应 最多 2 KB{"code":"TOOLS_INVALID"}Kapibala Console状态有记录，执行可追踪。
+     
+   
+
+

Call log:
  - Expect "toContainText" locator('body') with timeout 8000ms
  - waiting for locator('body')
    - locator resolved to <body>…</body>
    - unexpected value "
    Kkapibala.工作空间群组工作台服务账号Agent 运行定时序列消息运营平台本地工作空间Aadmin管理员工作空间 / Agent 运行实时同步中正在读取数据…Kapibala Console状态有记录，执行可追踪。
    
  

"
    19 × locator resolved to <body>…</body>
       - unexpected value "
    Kkapibala.工作空间群组工作台服务账号Agent 运行定时序列消息运营平台本地工作空间Aadmin管理员工作空间 / Agent 运行实时同步中← 返回群组AGENT EXECUTION运行详情9578218c-542e-445e-9a37-225ccab22539失败当前运行状态失败结束原因protocol_errors执行步数3 / 12运行摘要尚未生成摘要执行轨迹每一步保留输入、结果和错误证据01协议错误无工具调用 ID协议错误第 1 步 · 协议错误 · 执行结果BAD_JSONBAD_JSON查看协议错误原始响应 最多 2 KB{"code":"TOOLS_INVALID"}02协议错误无工具调用 ID协议错误第 2 步 · 协议错误 · 执行结果BAD_JSONBAD_JSON查看协议错误原始响应 最多 2 KB{"code":"TOOLS_INVALID"}03协议错误无工具调用 ID协议错误第 3 步 · 协议错误 · 执行结果BAD_JSONBAD_JSON查看协议错误原始响应 最多 2 KB{"code":"TOOLS_INVALID"}Kapibala Console状态有记录，执行可追踪。
    
  

"

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
- strong: Agent 运行
- status: 实时同步中
- main:
  - link "← 返回群组":
    - /url: "#/groups/0f996667-ef69-4588-894f-3f16d1b20c3e"
  - text: AGENT EXECUTION
  - heading "运行详情" [level=1]
  - paragraph: 9578218c-542e-445e-9a37-225ccab22539
  - text: 失败
  - strong: 当前运行状态
  - text: 失败 结束原因
  - strong: protocol_errors
  - text: 执行步数
  - strong: 3 / 12
  - text: 运行摘要
  - paragraph: 尚未生成摘要
  - heading "执行轨迹" [level=2]
  - text: 每一步保留输入、结果和错误证据
  - article:
    - text: "01"
    - heading "协议错误" [level=3]
    - text: 无工具调用 ID 协议错误
    - heading "第 1 步 · 协议错误 · 执行结果" [level=4]
    - paragraph: BAD_JSON
    - code: BAD_JSON
    - group: 查看协议错误原始响应 最多 2 KB
  - article:
    - text: "02"
    - heading "协议错误" [level=3]
    - text: 无工具调用 ID 协议错误
    - heading "第 2 步 · 协议错误 · 执行结果" [level=4]
    - paragraph: BAD_JSON
    - code: BAD_JSON
    - group: 查看协议错误原始响应 最多 2 KB
  - article:
    - text: "03"
    - heading "协议错误" [level=3]
    - text: 无工具调用 ID 协议错误
    - heading "第 3 步 · 协议错误 · 执行结果" [level=4]
    - paragraph: BAD_JSON
    - code: BAD_JSON
    - group: 查看协议错误原始响应 最多 2 KB
  - text: Kapibala Console 状态有记录，执行可追踪。
```

# Test source

```ts
  228 |   const group = await prepare(qa);
  229 |   qa.gateway.configure({ sendDelayMs: 1800 });
  230 |   await login(page, qa);
  231 |   await go(page, qa, 'group', group.id);
  232 |   await qa.api.send(group.id, group.creatorAccountId, 'UI待确认状态');
  233 |   const row = element(page, qa, 'messageRow').filter({ hasText: 'UI待确认状态' });
  234 |   await expect(row).toHaveCount(1);
  235 |   await expect(row).toContainText(/accepted|已受理/);
  236 |   await expect(row).toContainText(/sent|已发送/);
  237 |   await expect(row).toHaveCount(1);
  238 | });
  239 | test('[UI-005] 加载更早与实时新增按消息身份合并', async ({ qa, page }) => {
  240 |   const group = await prepare(qa);
  241 |   for (let i = 0; i < 65; i++)
  242 |     qa.gateway.emitMessage({
  243 |       groupId: group.gatewayGroupId,
  244 |       senderPlatformUserId: 'external-ui',
  245 |       text: `history-${i}`,
  246 |       sentAt: new Date(Date.now() - 100000 + i).toISOString(),
  247 |     });
  248 |   await qa.api.waitFor<{ items: unknown[] }>(
  249 |     `/api/groups/${group.id}/messages?limit=50`,
  250 |     (r) => r.items.length === 50,
  251 |   );
  252 |   await login(page, qa);
  253 |   await go(page, qa, 'group', group.id);
  254 |   await element(page, qa, 'loadEarlier').click();
  255 |   incoming(qa, group, 'live-after-pagination');
  256 |   for (let i = 0; i < 65; i++)
  257 |     await expect(page.getByText(`history-${i}`, { exact: true })).toHaveCount(1);
  258 |   await expect(page.getByText('live-after-pagination', { exact: true })).toHaveCount(1);
  259 | });
  260 | test('[UI-006] 浏览器断线恢复后3秒内补齐 @compat', async ({ qa, page, context }) => {
  261 |   const group = await prepare(qa);
  262 |   await login(page, qa);
  263 |   await go(page, qa, 'group', group.id);
  264 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  265 |   await context.setOffline(true);
  266 |   incoming(qa, group, 'offline-first');
  267 |   incoming(qa, group, 'offline-second');
  268 |   await context.setOffline(false);
  269 |   const start = performance.now();
  270 |   await expect(page.getByText('offline-first', { exact: true })).toHaveCount(1, { timeout: 3000 });
  271 |   await expect(page.getByText('offline-second', { exact: true })).toHaveCount(1, {
  272 |     timeout: Math.max(1, 3000 - (performance.now() - start)),
  273 |   });
  274 |   expect(performance.now() - start).toBeLessThanOrEqual(3000);
  275 | });
  276 | test('[UI-007] 审计阻断在群运行列表醒目可见', async ({ qa, page }) => {
  277 |   const group = await prepare(qa);
  278 |   qa.agent.enqueueTurns({
  279 |     body: {
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
> 328 |     await expect(page.locator('body')).toContainText(text);
      |                                        ^ Error: expect(locator).toContainText(expected) failed
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
```