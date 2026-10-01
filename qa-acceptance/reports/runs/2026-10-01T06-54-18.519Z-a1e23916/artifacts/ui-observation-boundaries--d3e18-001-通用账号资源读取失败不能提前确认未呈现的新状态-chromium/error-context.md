# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/observation-boundaries.spec.ts >> [ARC-UI-BLK-001] 通用账号资源读取失败不能提前确认未呈现的新状态
- Location: tests/ui/observation-boundaries.spec.ts:52:1

# Error details

```
BlockedError: [BLOCKED] 浏览器未建立真实失焦；该执行环境不能验证后台提醒
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
      - link "服务账号" [active] [ref=e14] [cursor=pointer]:
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
      - status [ref=e56]: 实时同步中
    - main [ref=e58]:
      - generic [ref=e59]:
        - generic [ref=e60]:
          - generic [ref=e61]: SERVICE ACCOUNTS
          - heading "服务账号" [level=1] [ref=e62]
          - paragraph [ref=e63]: 查看账号状态与连接情况，统一管理发送身份。
        - button "刷新" [ref=e65] [cursor=pointer]
      - generic [ref=e68]:
        - generic [ref=e69]:
          - text: 全部账号
          - strong [ref=e70]: "6"
        - generic [ref=e71]:
          - text: 在线可用
          - strong [ref=e72]: "1"
        - generic [ref=e73]:
          - text: 等待限流恢复
          - strong [ref=e74]: "0"
        - generic [ref=e75]:
          - text: 已进入终态
          - strong [ref=e76]: "0"
      - generic [ref=e77]:
        - generic [ref=e78]:
          - heading "账号列表" [level=2] [ref=e79]
          - generic [ref=e80]: 状态与平台实时同步
        - table [ref=e81]:
          - rowgroup [ref=e82]:
            - row [ref=e83]:
              - columnheader "账号" [ref=e84]
              - columnheader "平台身份" [ref=e85]
              - columnheader "当前状态" [ref=e86]
              - columnheader "限流结束时间" [ref=e87]
              - columnheader "操作" [ref=e88]
          - rowgroup [ref=e89]:
            - row [ref=e90]:
              - cell "-1 account-1" [ref=e91]:
                - generic [ref=e92]:
                  - generic [ref=e93]: "-1"
                  - strong [ref=e94]: account-1
              - cell "platform-account-1" [ref=e95]
              - cell "在线" [ref=e96]
              - cell "—" [ref=e99]
              - cell [ref=e100]:
                - generic [ref=e101]:
                  - button "断开连接" [ref=e102] [cursor=pointer]
                  - button "释放账号" [ref=e103] [cursor=pointer]
            - row [ref=e104]:
              - cell "-2 account-2" [ref=e105]:
                - generic [ref=e106]:
                  - generic [ref=e107]: "-2"
                  - strong [ref=e108]: account-2
              - cell "尚未连接" [ref=e109]
              - cell "待连接" [ref=e110]
              - cell "—" [ref=e113]
              - cell [ref=e114]:
                - button "连接账号" [ref=e116] [cursor=pointer]
            - row [ref=e117]:
              - cell "-3 account-3" [ref=e118]:
                - generic [ref=e119]:
                  - generic [ref=e120]: "-3"
                  - strong [ref=e121]: account-3
              - cell "尚未连接" [ref=e122]
              - cell "待连接" [ref=e123]
              - cell "—" [ref=e126]
              - cell [ref=e127]:
                - button "连接账号" [ref=e129] [cursor=pointer]
            - row [ref=e130]:
              - cell "-4 account-4" [ref=e131]:
                - generic [ref=e132]:
                  - generic [ref=e133]: "-4"
                  - strong [ref=e134]: account-4
              - cell "尚未连接" [ref=e135]
              - cell "待连接" [ref=e136]
              - cell "—" [ref=e139]
              - cell [ref=e140]:
                - button "连接账号" [ref=e142] [cursor=pointer]
            - row [ref=e143]:
              - cell "-5 account-5" [ref=e144]:
                - generic [ref=e145]:
                  - generic [ref=e146]: "-5"
                  - strong [ref=e147]: account-5
              - cell "尚未连接" [ref=e148]
              - cell "待连接" [ref=e149]
              - cell "—" [ref=e152]
              - cell [ref=e153]:
                - button "连接账号" [ref=e155] [cursor=pointer]
            - row [ref=e156]:
              - cell "-6 account-6" [ref=e157]:
                - generic [ref=e158]:
                  - generic [ref=e159]: "-6"
                  - strong [ref=e160]: account-6
              - cell "尚未连接" [ref=e161]
              - cell "待连接" [ref=e162]
              - cell "—" [ref=e165]
              - cell [ref=e166]:
                - button "连接账号" [ref=e168] [cursor=pointer]
      - paragraph [ref=e169]: 断开连接会断开账号的网关连接；释放账号会断开连接并回到待连接，保留账号与历史记录。限流结束后自动恢复；已停用与会话失效为终态。状态变更采用并发校验，冲突时刷新后重试。
      - generic [ref=e170]:
        - generic [ref=e171]: Kapibala Console
        - generic [ref=e172]: 状态有记录，执行可追踪。
```

# Test source

```ts
  17  |       if (!target.ui.adapterConfirmed) throw new BlockedError('基础浏览器定位尚未确认');
  18  |       await use(await loadObservation(qaRoot, target));
  19  |     },
  20  |     { auto: true },
  21  |   ],
  22  | });
  23  | 
  24  | function element(page: Page, qa: QaEnvironment, key: string): Locator {
  25  |   const selector = qa.config.ui.selectors[key];
  26  |   if (!selector) throw new BlockedError(`缺少已确认可见定位${key}`);
  27  |   return page.locator(selector);
  28  | }
  29  | async function remains(check: () => Promise<void>, milliseconds = 1200) {
  30  |   const end = performance.now() + milliseconds;
  31  |   do {
  32  |     await check();
  33  |     await new Promise<void>((resolve) => setTimeout(resolve, 50));
  34  |   } while (performance.now() < end);
  35  |   await check();
  36  | }
  37  | async function icon(page: Page): Promise<string> {
  38  |   return page.evaluate(async () =>
  39  |     JSON.stringify(
  40  |       await Promise.all(
  41  |         Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map(
  42  |           async (item) => {
  43  |             const response = await fetch(item.href);
  44  |             return Array.from(new Uint8Array(await response.arrayBuffer()));
  45  |           },
  46  |         ),
  47  |       ),
  48  |     ),
  49  |   );
  50  | }
  51  | 
  52  | observationTest(
  53  |   '[ARC-UI-BLK-001] 通用账号资源读取失败不能提前确认未呈现的新状态',
  54  |   async ({ qa, page, observationAdapter: adapter }, info) => {
  55  |     await qa.evidence('resource-observation-adapter', adapter);
  56  |     await qa.api.login();
  57  |     const account = (await qa.api.accounts()).find((item) => item.status === 'idle');
  58  |     if (!account || !/^[A-Za-z0-9_-]+$/.test(account.id))
  59  |       throw new BlockedError('没有可用于online→disconnected且可安全定位的独立账号');
  60  |     await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`));
  61  |     await qa.api.waitFor<{ id: string; status: string }[]>('/api/accounts', (items) =>
  62  |       items.some((item) => item.id === account.id && item.status === 'online'),
  63  |     );
  64  |     const requests: { at: string; status: number }[] = [];
  65  |     const errors: string[] = [];
  66  |     page.on('pageerror', (error) => errors.push(error.message));
  67  |     const path = qa.config.ui.routes.login;
  68  |     if (!path) throw new BlockedError('缺少登录路由');
  69  |     await page.goto(`${qa.webUrl}${path}`, { waitUntil: 'domcontentloaded' });
  70  |     await element(page, qa, 'username').fill('admin');
  71  |     await element(page, qa, 'password').fill('admin');
  72  |     const loginResponse = page.waitForResponse(
  73  |       (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
  74  |     );
  75  |     await element(page, qa, 'login').click();
  76  |     expect((await loginResponse).status()).toBe(200);
  77  |     await element(page, qa, 'navAccounts').click();
  78  |     const row = page.locator(adapter.rowSelector.replaceAll('{id}', account.id));
  79  |     const state = row.locator(adapter.stateSelector);
  80  |     await expect(row).toBeVisible();
  81  |     await expect(state).toHaveText(adapter.stateText.online);
  82  |     await page.bringToFront();
  83  |     if (!(await page.evaluate(() => document.hasFocus())))
  84  |       throw new BlockedError('未能建立真实前台焦点，不伪造focus或visibility事件');
  85  |     const originalTitle = await page.title(),
  86  |       originalIcon = await icon(page);
  87  |     let failing = true,
  88  |       failures = 0;
  89  |     let background: Page | undefined;
  90  |     await page.route('**/api/accounts', async (route) => {
  91  |       if (route.request().method() !== 'GET') return route.continue();
  92  |       if (failing) {
  93  |         failures++;
  94  |         requests.push({ at: new Date().toISOString(), status: 503 });
  95  |         await route.fulfill({
  96  |           status: 503,
  97  |           contentType: 'application/json',
  98  |           body: JSON.stringify({
  99  |             error: {
  100 |               code: 'SERVICE_UNAVAILABLE',
  101 |               message: 'QA unread resource failure',
  102 |               requestId: 'qa-observation-boundary',
  103 |             },
  104 |           }),
  105 |         });
  106 |       } else {
  107 |         const response = await route.fetch();
  108 |         requests.push({ at: new Date().toISOString(), status: response.status() });
  109 |         await route.fulfill({ response });
  110 |       }
  111 |     });
  112 |     try {
  113 |       background = await page.context().newPage();
  114 |       await background.goto('about:blank');
  115 |       await background.bringToFront();
  116 |       if (await page.evaluate(() => document.hasFocus()))
> 117 |         throw new BlockedError('浏览器未建立真实失焦；该执行环境不能验证后台提醒');
      |               ^ BlockedError: [BLOCKED] 浏览器未建立真实失焦；该执行环境不能验证后台提醒
  118 |       await qa.api.require(
  119 |         qa.api.post(`/api/accounts/${account.id}/transition`, {
  120 |           expectedFrom: 'online',
  121 |           to: 'disconnected',
  122 |         }),
  123 |       );
  124 |       await qa.api.waitFor<{ id: string; status: string }[]>('/api/accounts', (items) =>
  125 |         items.some((item) => item.id === account.id && item.status === 'disconnected'),
  126 |       );
  127 |       await expect.poll(() => failures).toBeGreaterThan(0);
  128 |       await expect(page).not.toHaveTitle(originalTitle);
  129 |       await expect.poll(() => icon(page)).not.toBe(originalIcon);
  130 |       await page.bringToFront();
  131 |       const error = page.locator(adapter.errorSelector);
  132 |       await expect(error).toBeVisible();
  133 |       await expect(state).toHaveText(adapter.stateText.online);
  134 |       await remains(async () => {
  135 |         expect(await page.title()).not.toBe(originalTitle);
  136 |         expect(await icon(page)).not.toBe(originalIcon);
  137 |       });
  138 |       await error.click();
  139 |       await remains(async () => {
  140 |         await expect(state).toHaveText(adapter.stateText.online);
  141 |         expect(await page.title()).not.toBe(originalTitle);
  142 |         expect(await icon(page)).not.toBe(originalIcon);
  143 |       });
  144 |       await state.click();
  145 |       await remains(async () => {
  146 |         await expect(state).toHaveText(adapter.stateText.online);
  147 |         expect(await page.title()).not.toBe(originalTitle);
  148 |         expect(await icon(page)).not.toBe(originalIcon);
  149 |       });
  150 |       const refresh = page.locator(adapter.refreshSelector);
  151 |       if (!(await refresh.isVisible()))
  152 |         throw new BlockedError(
  153 |           '尚未接入真实可见的账号资源恢复操作；不直接调用内部reload或用整页重载清空提醒',
  154 |         );
  155 |       failing = false;
  156 |       const documentEpoch = await page.evaluate(() => performance.timeOrigin);
  157 |       const recovered = page.waitForResponse(
  158 |         (r) =>
  159 |           new URL(r.url()).pathname === '/api/accounts' &&
  160 |           r.request().method() === 'GET' &&
  161 |           r.status() === 200,
  162 |       );
  163 |       await refresh.click();
  164 |       await recovered;
  165 |       if ((await page.evaluate(() => performance.timeOrigin)) !== documentEpoch)
  166 |         throw new BlockedError('资源刷新重建了document；不能以页面范围重置代替失败快照的确认验证');
  167 |       await expect(state).toHaveText(adapter.stateText.disconnected);
  168 |       // The refresh click happened before the new value was presented, so it cannot acknowledge it.
  169 |       await remains(async () => {
  170 |         expect(await page.title()).not.toBe(originalTitle);
  171 |         expect(await icon(page)).not.toBe(originalIcon);
  172 |       }, 500);
  173 |       await row.locator(adapter.acknowledgeSelector).click();
  174 |       await expect(page).toHaveTitle(originalTitle);
  175 |       await expect.poll(() => icon(page)).toBe(originalIcon);
  176 |       expect(errors).toEqual([]);
  177 |       await qa.evidence('resource-observation-assertions', {
  178 |         accountId: account.id,
  179 |         failures,
  180 |         requests,
  181 |         oldState: 'online',
  182 |         newState: 'disconnected',
  183 |         adapter,
  184 |         assertions: [
  185 |           '失败时只显示旧值',
  186 |           '仅聚焦/错误/旧值操作不确认',
  187 |           '真实新值成功呈现后明确操作才确认',
  188 |         ],
  189 |       });
  190 |     } finally {
  191 |       failing = false;
  192 |       await background?.close();
  193 |       await page.unrouteAll({ behavior: 'wait' });
  194 |       await qa.evidence('resource-observation-final', {
  195 |         requests,
  196 |         errors,
  197 |         url: page.url(),
  198 |         title: await page.title(),
  199 |         visibleText: (await page.locator('body').innerText()).slice(0, 8000),
  200 |       });
  201 |       const file = info.outputPath('evidence', 'resource-observation-final.png');
  202 |       await mkdir(dirname(file), { recursive: true });
  203 |       await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  204 |       await info.attach('resource-observation-final', { path: file, contentType: 'image/png' });
  205 |     }
  206 |   },
  207 | );
  208 | 
```