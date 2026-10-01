# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-021] 离开群详情销毁提醒范围，旧群变化不污染新页
- Location: tests/ui/console.spec.ts:724:1

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
      - link "服务账号" [ref=e14] [cursor=pointer]:
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
        - strong [ref=e54]: 服务账号
      - status [ref=e56]: 连接恢复中
    - main [ref=e58]:
      - generic [ref=e59]: 实时连接已断开，正在自动重连并补齐期间的变化。
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: SERVICE ACCOUNTS
          - heading "服务账号" [level=1] [ref=e63]
          - paragraph [ref=e64]: 查看账号状态与连接情况，统一管理发送身份。
        - button "刷新" [ref=e66] [cursor=pointer]
      - generic [ref=e69]:
        - generic [ref=e70]:
          - text: 全部账号
          - strong [ref=e71]: "6"
        - generic [ref=e72]:
          - text: 在线可用
          - strong [ref=e73]: "6"
        - generic [ref=e74]:
          - text: 等待限流恢复
          - strong [ref=e75]: "0"
        - generic [ref=e76]:
          - text: 已进入终态
          - strong [ref=e77]: "0"
      - generic [ref=e78]:
        - generic [ref=e79]:
          - heading "账号列表" [level=2] [ref=e80]
          - generic [ref=e81]: 状态与平台实时同步
        - table [ref=e82]:
          - rowgroup [ref=e83]:
            - row [ref=e84]:
              - columnheader "账号" [ref=e85]
              - columnheader "平台身份" [ref=e86]
              - columnheader "当前状态" [ref=e87]
              - columnheader "限流结束时间" [ref=e88]
              - columnheader "操作" [ref=e89]
          - rowgroup [ref=e90]:
            - row [ref=e91]:
              - cell "-1 account-1" [ref=e92]:
                - generic [ref=e93]:
                  - generic [ref=e94]: "-1"
                  - strong [ref=e95]: account-1
              - cell "platform-account-1" [ref=e96]
              - cell "在线" [ref=e97]
              - cell "—" [ref=e100]
              - cell [ref=e101]:
                - generic [ref=e102]:
                  - button "断开连接" [ref=e103] [cursor=pointer]
                  - button "释放账号" [ref=e104] [cursor=pointer]
            - row [ref=e105]:
              - cell "-2 account-2" [ref=e106]:
                - generic [ref=e107]:
                  - generic [ref=e108]: "-2"
                  - strong [ref=e109]: account-2
              - cell "platform-account-2" [ref=e110]
              - cell "在线" [ref=e111]
              - cell "—" [ref=e114]
              - cell [ref=e115]:
                - generic [ref=e116]:
                  - button "断开连接" [ref=e117] [cursor=pointer]
                  - button "释放账号" [ref=e118] [cursor=pointer]
            - row [ref=e119]:
              - cell "-3 account-3" [ref=e120]:
                - generic [ref=e121]:
                  - generic [ref=e122]: "-3"
                  - strong [ref=e123]: account-3
              - cell "platform-account-3" [ref=e124]
              - cell "在线" [ref=e125]
              - cell "—" [ref=e128]
              - cell [ref=e129]:
                - generic [ref=e130]:
                  - button "断开连接" [ref=e131] [cursor=pointer]
                  - button "释放账号" [ref=e132] [cursor=pointer]
            - row [ref=e133]:
              - cell "-4 account-4" [ref=e134]:
                - generic [ref=e135]:
                  - generic [ref=e136]: "-4"
                  - strong [ref=e137]: account-4
              - cell "platform-account-4" [ref=e138]
              - cell "在线" [ref=e139]
              - cell "—" [ref=e142]
              - cell [ref=e143]:
                - generic [ref=e144]:
                  - button "断开连接" [ref=e145] [cursor=pointer]
                  - button "释放账号" [ref=e146] [cursor=pointer]
            - row [ref=e147]:
              - cell "-5 account-5" [ref=e148]:
                - generic [ref=e149]:
                  - generic [ref=e150]: "-5"
                  - strong [ref=e151]: account-5
              - cell "platform-account-5" [ref=e152]
              - cell "在线" [ref=e153]
              - cell "—" [ref=e156]
              - cell [ref=e157]:
                - generic [ref=e158]:
                  - button "断开连接" [ref=e159] [cursor=pointer]
                  - button "释放账号" [ref=e160] [cursor=pointer]
            - row [ref=e161]:
              - cell "-6 account-6" [ref=e162]:
                - generic [ref=e163]:
                  - generic [ref=e164]: "-6"
                  - strong [ref=e165]: account-6
              - cell "platform-account-6" [ref=e166]
              - cell "在线" [ref=e167]
              - cell "—" [ref=e170]
              - cell [ref=e171]:
                - generic [ref=e172]:
                  - button "断开连接" [ref=e173] [cursor=pointer]
                  - button "释放账号" [ref=e174] [cursor=pointer]
      - paragraph [ref=e175]: 断开连接会断开账号的网关连接；释放账号会断开连接并回到待连接，保留账号与历史记录。限流结束后自动恢复；已停用与会话失效为终态。状态变更采用并发校验，冲突时刷新后重试。
      - generic [ref=e176]:
        - generic [ref=e177]: Kapibala Console
        - generic [ref=e178]: 状态有记录，执行可追踪。
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