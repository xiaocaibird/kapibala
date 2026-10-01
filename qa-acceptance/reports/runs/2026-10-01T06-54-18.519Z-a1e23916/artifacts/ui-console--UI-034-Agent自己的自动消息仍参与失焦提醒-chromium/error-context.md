# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-034] Agent自己的自动消息仍参与失焦提醒
- Location: tests/ui/console.spec.ts:1248:1

# Error details

```
BlockedError: [BLOCKED] 浏览器未建立真实标签失焦；需要有头环境复验，禁止伪造visibility/focus
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
            - /url: "#/sequences/275182f9-1188-4be6-873d-e4894eab00d8"
      - alert [ref=e72]:
        - generic [ref=e75]:
          - strong [ref=e76]: 暂时无法连接服务，请稍后重试。
          - generic [ref=e77]: NETWORK_ERROR
      - generic [ref=e78]:
        - generic [ref=e79]:
          - generic [ref=e80]:
            - generic [ref=e81]:
              - heading "消息时间线" [level=2] [ref=e82]
              - generic [ref=e85]: 1 条已加载
            - article [ref=e88]:
              - generic [ref=e89]: ui
              - generic [ref=e90]:
                - generic [ref=e91]:
                  - strong [ref=e92]: external-ui
                  - time [ref=e93]: 10/01 15:30:56
                - generic [ref=e94]: 前台读取的触发消息
                - generic "gateway-message-1" [ref=e96]
            - generic [ref=e97]:
              - textbox "消息内容" [ref=e98]:
                - /placeholder: 输入要发送到群的消息…
              - generic [ref=e99]:
                - generic [ref=e100]:
                  - text: 发送身份
                  - combobox "发送身份" [ref=e101]:
                    - option "暂无可用账号" [disabled]
                    - option "account-1" [selected]
                    - option "account-2"
                    - option "account-3"
                - button "发送消息" [disabled] [ref=e102]
          - generic [ref=e105]:
            - generic [ref=e106]:
              - heading "最近 Agent 运行" [level=2] [ref=e107]
              - generic [ref=e110]: "1"
            - status [ref=e111]:
              - generic [ref=e112]: Agent 运行列表有更新；刷新后确认当前范围。
              - button "刷新并查看更新" [ref=e113] [cursor=pointer]
            - alert [ref=e114]:
              - generic [ref=e117]:
                - strong [ref=e118]: 暂时无法连接服务，请稍后重试。
                - generic [ref=e119]: NETWORK_ERROR
              - button "重试" [ref=e120] [cursor=pointer]
            - link "运行中 d4d30ba7-9907-40c8-8f37-1b49d836528b 正在执行工具步骤" [ref=e122] [cursor=pointer]:
              - /url: "#/agent-runs/d4d30ba7-9907-40c8-8f37-1b49d836528b"
              - generic [ref=e123]: 运行中
              - code [ref=e128]: d4d30ba7-9907-40c8-8f37-1b49d836528b
              - generic [ref=e129]: 正在执行工具步骤
        - complementary [ref=e130]:
          - generic [ref=e133]:
            - generic [ref=e134]:
              - heading "群资料" [level=2] [ref=e135]
              - button "编辑资料" [ref=e136] [cursor=pointer]
            - generic [ref=e137]:
              - generic [ref=e138]:
                - term [ref=e139]: 群简介
                - definition [ref=e140]: 未填写
              - generic [ref=e141]:
                - term [ref=e142]: 创建时间
                - definition [ref=e143]:
                  - time [ref=e144]: 2026/10/01 15:30:55
              - generic [ref=e145]:
                - term [ref=e146]: 平台群 ID
                - definition [ref=e147]: 275182f9-1188-4be6-873d-e4894eab00d8
          - generic [ref=e150]:
            - heading "自动化设置" [level=2] [ref=e152]
            - generic [ref=e153]:
              - generic [ref=e154]:
                - generic [ref=e155]:
                  - strong [ref=e156]: Agent 自动应答
                  - paragraph [ref=e157]: 接收外部成员消息并启动执行。
                - switch "Agent 自动应答" [checked] [ref=e158] [cursor=pointer]
              - generic [ref=e160]:
                - generic [ref=e161]:
                  - strong [ref=e162]: 允许自动移除成员
                  - paragraph [ref=e163]: 需审计通过且执行账号具备权限。
                - switch "允许自动移除成员" [ref=e164] [cursor=pointer]
          - generic [ref=e168]:
            - generic [ref=e169]:
              - heading "群成员" [level=2] [ref=e170]
              - generic [ref=e171]: "3"
            - generic [ref=e172]:
              - generic [ref=e173]:
                - generic [ref=e174]: "-2"
                - generic [ref=e175]:
                  - strong [ref=e176]: account-2
                  - generic "platform-account-2" [ref=e177]
                - generic [ref=e178]: 群管理员
              - generic [ref=e179]:
                - generic [ref=e180]: "-1"
                - generic [ref=e181]:
                  - strong [ref=e182]: account-1
                  - generic "platform-account-1" [ref=e183]
                - generic [ref=e184]: 群主
              - generic [ref=e185]:
                - generic [ref=e186]: "-3"
                - generic [ref=e187]:
                  - strong [ref=e188]: account-3
                  - generic "platform-account-3" [ref=e189]
                - generic [ref=e190]: 成员
            - paragraph [ref=e191]: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
          - generic [ref=e192]:
            - heading "退出群组" [level=3] [ref=e193]
            - paragraph [ref=e194]: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
            - button "全部服务账号退群" [ref=e195] [cursor=pointer]
      - generic [ref=e196]:
        - generic [ref=e197]: Kapibala Console
        - generic [ref=e198]: 状态有记录，执行可追踪。
```

# Test source

```ts
  11  |   const errors: string[] = [];
  12  |   pageErrors.set(page, errors);
  13  |   page.on('pageerror', (error) => errors.push(error.message));
  14  | });
  15  | test.afterEach(async ({ page, qa }, info) => {
  16  |   if (page.isClosed()) {
  17  |     await qa.evidence('ui-final', {
  18  |       closed: true,
  19  |       pageErrors: pageErrors.get(page) ?? [],
  20  |       captureLimitation: '页面已关闭，无法补拍最终画面',
  21  |     });
  22  |     return;
  23  |   }
  24  |   const alerts = await page.locator('[role="alert"],[aria-live="assertive"]').evaluateAll((nodes) =>
  25  |     nodes
  26  |       .filter((node) => {
  27  |         const style = getComputedStyle(node);
  28  |         const box = node.getBoundingClientRect();
  29  |         return (
  30  |           style.visibility !== 'hidden' &&
  31  |           style.display !== 'none' &&
  32  |           box.width > 0 &&
  33  |           box.height > 0
  34  |         );
  35  |       })
  36  |       .map((node) => node.textContent?.slice(0, 1000) ?? ''),
  37  |   );
  38  |   await qa.evidence('ui-final', {
  39  |     url: page.url(),
  40  |     title: await page.title(),
  41  |     visibleAlerts: alerts,
  42  |     visibleTextExcerpt: (await page.locator('body').innerText()).slice(0, 8000),
  43  |     pageErrors: pageErrors.get(page) ?? [],
  44  |   });
  45  |   const path = info.outputPath('evidence', 'ui-final.png');
  46  |   await mkdir(dirname(path), { recursive: true });
  47  |   await page.screenshot({ path, fullPage: true, animations: 'disabled', timeout: 10000 });
  48  |   await info.attach('ui-final-screenshot', { path, contentType: 'image/png' });
  49  |   await info.attach('ui-final-state', {
  50  |     path: info.outputPath('evidence', 'ui-final.json'),
  51  |     contentType: 'application/json',
  52  |   });
  53  | });
  54  | 
  55  | function element(page: Page, qa: QaEnvironment, key: string): Locator {
  56  |   const selector = qa.config.ui.selectors[key];
  57  |   if (!selector) throw new BlockedError(`UI适配缺少${key}；通过可见页面确认定位后重跑`);
  58  |   return page.locator(selector);
  59  | }
  60  | async function go(page: Page, qa: QaEnvironment, route: string, id?: string): Promise<void> {
  61  |   const path = qa.config.ui.routes[route];
  62  |   if (!path) throw new BlockedError(`UI路由适配缺少${route}`);
  63  |   await page.goto(`${qa.webUrl}${path.replace('{id}', encodeURIComponent(id ?? ''))}`, {
  64  |     waitUntil: 'domcontentloaded',
  65  |   });
  66  | }
  67  | async function login(
  68  |   page: Page,
  69  |   qa: QaEnvironment,
  70  |   role: 'admin' | 'viewer' = 'admin',
  71  | ): Promise<void> {
  72  |   if (!qa.config.ui.adapterConfirmed)
  73  |     throw new BlockedError('尚未根据被测页面确认UI定位适配；模板不是实现事实');
  74  |   await qa.startWeb();
  75  |   await go(page, qa, 'login');
  76  |   await element(page, qa, 'username').fill(role);
  77  |   await element(page, qa, 'password').fill(role);
  78  |   const response = page.waitForResponse(
  79  |     (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
  80  |   );
  81  |   await element(page, qa, 'login').click();
  82  |   expect((await response).status()).toBe(200);
  83  |   await expect(element(page, qa, 'username')).toBeHidden();
  84  | }
  85  | /** A negative assertion must survive a declared observation window, not pass before delivery. */
  86  | async function remains(check: () => Promise<void>, durationMs = 1_000): Promise<void> {
  87  |   const until = performance.now() + durationMs;
  88  |   do {
  89  |     await check();
  90  |     await new Promise<void>((resolve) => setTimeout(resolve, 50));
  91  |   } while (performance.now() < until);
  92  |   await check();
  93  | }
  94  | function card(page: Page, qa: QaEnvironment, text: string): Locator {
  95  |   return element(page, qa, 'directoryItem').filter({ hasText: text });
  96  | }
  97  | function child(locator: Locator, qa: QaEnvironment, key: string): Locator {
  98  |   const selector = qa.config.ui.selectors[key];
  99  |   if (!selector) throw new BlockedError(`UI适配缺少卡片内${key}`);
  100 |   return locator.locator(selector);
  101 | }
  102 | function directoryRequest(request: Request): boolean {
  103 |   return new URL(request.url()).pathname === '/api/group-directory' && request.method() === 'GET';
  104 | }
  105 | async function backgroundTab(page: Page): Promise<Page> {
  106 |   const other = await page.context().newPage();
  107 |   await other.goto('about:blank');
  108 |   await other.bringToFront();
  109 |   if (await page.evaluate(() => document.hasFocus())) {
  110 |     await other.close();
> 111 |     throw new BlockedError('浏览器未建立真实标签失焦；需要有头环境复验，禁止伪造visibility/focus');
      |           ^ BlockedError: [BLOCKED] 浏览器未建立真实标签失焦；需要有头环境复验，禁止伪造visibility/focus
  112 |   }
  113 |   return other;
  114 | }
  115 | async function favicon(page: Page): Promise<string> {
  116 |   return page.evaluate(async () =>
  117 |     JSON.stringify(
  118 |       await Promise.all(
  119 |         Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map(
  120 |           async (link) => {
  121 |             const response = await fetch(link.href);
  122 |             return Array.from(new Uint8Array(await response.arrayBuffer()));
  123 |           },
  124 |         ),
  125 |       ),
  126 |     ),
  127 |   );
  128 | }
  129 | async function prepare(qa: QaEnvironment): Promise<Group> {
  130 |   await qa.api.login();
  131 |   return (await qa.api.createGroup()).group;
  132 | }
  133 | function incoming(qa: QaEnvironment, group: Group, text: string) {
  134 |   return qa.gateway.emitMessage({
  135 |     groupId: group.gatewayGroupId,
  136 |     senderPlatformUserId: 'external-ui',
  137 |     text,
  138 |   });
  139 | }
  140 | async function run(qa: QaEnvironment, group: Group): Promise<AgentRun> {
  141 |   const runs = await qa.api.waitFor<AgentRun[]>(
  142 |     `/api/groups/${group.id}/agent-runs`,
  143 |     (items) => items.length > 0 && items[0]!.status !== 'running',
  144 |   );
  145 |   return qa.api.agentRun(runs[0]!.id);
  146 | }
  147 | async function createSequence(qa: QaEnvironment) {
  148 |   return qa.api.require(
  149 |     qa.api.post<{ id: string }>('/api/sequences', {
  150 |       name: 'QA变量序列',
  151 |       steps: [
  152 |         { index: 1, accountRole: 'admin', text: '{event} 在 {place}', delaySeconds: 1 },
  153 |         { index: 2, accountRole: 'member', text: '{event} 在 {place}', delaySeconds: 1 },
  154 |       ],
  155 |     }),
  156 |   );
  157 | }
  158 | async function fillVars(
  159 |   page: Page,
  160 |   qa: QaEnvironment,
  161 |   key: string,
  162 |   value: Record<string, unknown>,
  163 | ) {
  164 |   const selector = qa.config.ui.selectors[key];
  165 |   if (!selector) throw new BlockedError(`UI缺少${key}`);
  166 |   if (selector.includes('{key}')) {
  167 |     for (const [name, v] of Object.entries(value)) {
  168 |       if (typeof v === 'object' && v !== null)
  169 |         for (const [nested, nv] of Object.entries(v))
  170 |           await page
  171 |             .locator(selector.replace('{step}', name).replace('{key}', nested))
  172 |             .fill(String(nv));
  173 |       else await page.locator(selector.replace('{key}', name)).fill(String(v));
  174 |     }
  175 |   } else await page.locator(selector).fill(JSON.stringify(value));
  176 | }
  177 | 
  178 | test('[UI-001] viewer通过浏览器登录且各页无写入口 @compat', async ({ qa, page }) => {
  179 |   const group = await prepare(qa);
  180 |   await login(page, qa, 'viewer');
  181 |   for (const route of ['accounts', 'groups', 'group']) {
  182 |     await go(page, qa, route, group.id);
  183 |     await expect(page.locator('body')).not.toContainText('UNAUTHORIZED');
  184 |     if (route === 'accounts')
  185 |       await expect(element(page, qa, 'accountRow')).toHaveCount((await qa.api.accounts()).length);
  186 |     else if (route === 'groups') await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  187 |     else await expect(page.locator('body')).toContainText(/群主|creator/);
  188 |     await remains(async () => {
  189 |       for (const name of [/^断开连接$/, /^释放账号$/, /^重连$/, /^创建群$/, /^编辑资料$/, /^启动$/])
  190 |         expect(await page.getByRole('button', { name }).count()).toBe(0);
  191 |     }, 500);
  192 |   }
  193 | });
  194 | test('[UI-002] 账号状态实时显示且操作符合当前状态', async ({ qa, page }) => {
  195 |   await qa.api.login();
  196 |   const accounts = await qa.api.accounts();
  197 |   await login(page, qa);
  198 |   await go(page, qa, 'accounts');
  199 |   await expect(element(page, qa, 'accountRow')).toHaveCount(accounts.length);
  200 |   await expect(page.getByRole('button', { name: '断开连接', exact: true })).toHaveCount(0);
  201 |   await qa.api.require(qa.api.post(`/api/accounts/${accounts[0]!.id}/connect`));
  202 |   await expect(page.getByRole('button', { name: '断开连接', exact: true })).toHaveCount(1);
  203 |   qa.gateway.emitStatus(accounts[0]!.id, 'suspended');
  204 |   await expect(page.locator('body')).toContainText(/停用|suspended/);
  205 |   await expect(page.getByRole('button', { name: '断开连接', exact: true })).toHaveCount(0);
  206 | });
  207 | test('[UI-003] 群详情显示角色和实时消息，回流不重复 @compat', async ({ qa, page }) => {
  208 |   const group = await prepare(qa);
  209 |   await login(page, qa);
  210 |   await go(page, qa, 'group', group.id);
  211 |   await expect(page.locator('body')).toContainText(/群主|creator/);
```