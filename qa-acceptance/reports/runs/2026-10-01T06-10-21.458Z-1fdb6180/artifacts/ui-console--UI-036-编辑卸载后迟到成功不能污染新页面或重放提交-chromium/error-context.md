# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-036] 编辑卸载后迟到成功不能污染新页面或重放提交
- Location: tests/ui/console.spec.ts:1333:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.unrouteAll: Target page, context or browser has been closed
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
          - heading "晚到成功草稿" [level=1] [ref=e66]
          - paragraph [ref=e67]: 网关群 ID · gateway-group-1
        - generic [ref=e68]:
          - generic [ref=e69]: 可用
          - link "定时序列" [ref=e71] [cursor=pointer]:
            - /url: "#/sequences/b5b902a7-5f30-4850-af23-166988a06e70"
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
          - generic [ref=e109]:
            - status [ref=e110]:
              - generic [ref=e111]: 群资料有更新。
              - button "刷新并查看更新" [ref=e112] [cursor=pointer]
            - generic [ref=e114]:
              - generic [ref=e115]:
                - heading "群资料" [level=2] [ref=e116]
                - button "编辑资料" [ref=e117] [cursor=pointer]
              - generic [ref=e118]:
                - generic [ref=e119]:
                  - term [ref=e120]: 群简介
                  - definition [ref=e121]: 未填写
                - generic [ref=e122]:
                  - term [ref=e123]: 创建时间
                  - definition [ref=e124]:
                    - time [ref=e125]: 2026/10/01 14:48:56
                - generic [ref=e126]:
                  - term [ref=e127]: 平台群 ID
                  - definition [ref=e128]: b5b902a7-5f30-4850-af23-166988a06e70
          - generic [ref=e131]:
            - heading "自动化设置" [level=2] [ref=e133]
            - generic [ref=e134]:
              - generic [ref=e135]:
                - generic [ref=e136]:
                  - strong [ref=e137]: Agent 自动应答
                  - paragraph [ref=e138]: 接收外部成员消息并启动执行。
                - switch "Agent 自动应答" [ref=e139] [cursor=pointer]
              - generic [ref=e141]:
                - generic [ref=e142]:
                  - strong [ref=e143]: 允许自动移除成员
                  - paragraph [ref=e144]: 需审计通过且执行账号具备权限。
                - switch "允许自动移除成员" [ref=e145] [cursor=pointer]
          - generic [ref=e149]:
            - generic [ref=e150]:
              - heading "群成员" [level=2] [ref=e151]
              - generic [ref=e152]: "3"
            - generic [ref=e153]:
              - generic [ref=e154]:
                - generic [ref=e155]: "-2"
                - generic [ref=e156]:
                  - strong [ref=e157]: account-2
                  - generic "platform-account-2" [ref=e158]
                - generic [ref=e159]: 群管理员
              - generic [ref=e160]:
                - generic [ref=e161]: "-1"
                - generic [ref=e162]:
                  - strong [ref=e163]: account-1
                  - generic "platform-account-1" [ref=e164]
                - generic [ref=e165]: 群主
              - generic [ref=e166]:
                - generic [ref=e167]: "-3"
                - generic [ref=e168]:
                  - strong [ref=e169]: account-3
                  - generic "platform-account-3" [ref=e170]
                - generic [ref=e171]: 成员
            - paragraph [ref=e172]: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
          - generic [ref=e173]:
            - heading "退出群组" [level=3] [ref=e174]
            - paragraph [ref=e175]: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
            - button "全部服务账号退群" [ref=e176] [cursor=pointer]
      - dialog [ref=e177]:
        - generic [ref=e178]:
          - heading "编辑群资料" [level=2] [ref=e179]
          - button "关闭弹窗" [ref=e180] [cursor=pointer]: ×
        - generic [ref=e181]:
          - paragraph [ref=e182]: 名称便于辨识群组，简介帮助成员了解用途。仅保存本次修改的资料。
          - alert [ref=e183]:
            - generic [ref=e186]:
              - strong [ref=e187]: 暂时无法连接服务，请稍后重试。
              - generic [ref=e188]: NETWORK_ERROR
          - generic [ref=e189]:
            - text: 群名称
            - textbox "群名称 去除首尾空格后 1–80 个字符；已填写的名称不能清空。" [ref=e190]:
              - /placeholder: gateway-group-1
              - text: 晚到成功草稿
            - generic [ref=e191]: 去除首尾空格后 1–80 个字符；已填写的名称不能清空。
          - generic [ref=e192]:
            - text: 群简介
            - textbox "群简介 最多 500 个字符，留空可清除已有简介。" [ref=e193]:
              - /placeholder: 介绍这个群的用途与协作安排
            - generic [ref=e194]: 最多 500 个字符，留空可清除已有简介。
          - generic [ref=e195]:
            - button "取消" [ref=e196] [cursor=pointer]
            - button "保存资料" [ref=e197] [cursor=pointer]
      - generic [ref=e198]:
        - generic [ref=e199]: Kapibala Console
        - generic [ref=e200]: 状态有记录，执行可追踪。
```

# Test source

```ts
  1270 |         qa.gateway.snapshot().messages.some((message) => message.text === 'Agent自动提醒消息'),
  1271 |       )
  1272 |       .toBe(true);
  1273 |     await qa.api.waitFor<{ items: { text: string; isOwn: boolean }[] }>(
  1274 |       `/api/groups/${group.id}/messages`,
  1275 |       (value) =>
  1276 |         value.items.some((message) => message.text === 'Agent自动提醒消息' && message.isOwn),
  1277 |     );
  1278 |     await expect(page).not.toHaveTitle(quietTitle);
  1279 |     await page.bringToFront();
  1280 |     await expect(page.getByText('Agent自动提醒消息', { exact: true })).toBeVisible();
  1281 |   } finally {
  1282 |     qa.agent.barriers.release('automatic-send');
  1283 |     await background.close();
  1284 |   }
  1285 | });
  1286 | 
  1287 | test('[UI-035] 序列自动发送不因isOwn被排除提醒', async ({ qa, page }) => {
  1288 |   const group = await prepare(qa);
  1289 |   const sequence = await qa.api.require(
  1290 |     qa.api.post<{ id: string }>('/api/sequences', {
  1291 |       name: '提醒序列',
  1292 |       steps: [{ index: 1, accountRole: 'admin', text: '序列自动提醒消息', delaySeconds: 2 }],
  1293 |     }),
  1294 |   );
  1295 |   await login(page, qa);
  1296 |   await go(page, qa, 'group', group.id);
  1297 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1298 |   const quietTitle = await page.title();
  1299 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  1300 |     barrier: { phase: 'request', name: 'sequence-message' },
  1301 |   });
  1302 |   await qa.api.require(
  1303 |     qa.api.post(`/api/groups/${group.id}/sequence-runs`, {
  1304 |       sequenceId: sequence.id,
  1305 |       vars: {},
  1306 |       stepVars: {},
  1307 |     }),
  1308 |     201,
  1309 |   );
  1310 |   await qa.gateway.barriers.waitFor('sequence-message');
  1311 |   const background = await backgroundTab(page);
  1312 |   try {
  1313 |     qa.gateway.barriers.release('sequence-message');
  1314 |     await expect
  1315 |       .poll(() =>
  1316 |         qa.gateway.snapshot().messages.some((message) => message.text === '序列自动提醒消息'),
  1317 |       )
  1318 |       .toBe(true);
  1319 |     await qa.api.waitFor<{ items: { text: string; isOwn: boolean }[] }>(
  1320 |       `/api/groups/${group.id}/messages`,
  1321 |       (value) =>
  1322 |         value.items.some((message) => message.text === '序列自动提醒消息' && message.isOwn),
  1323 |     );
  1324 |     await expect(page).not.toHaveTitle(quietTitle);
  1325 |     await page.bringToFront();
  1326 |     await expect(page.getByText('序列自动提醒消息', { exact: true })).toBeVisible();
  1327 |   } finally {
  1328 |     qa.gateway.barriers.release('sequence-message');
  1329 |     await background.close();
  1330 |   }
  1331 | });
  1332 | 
  1333 | test('[UI-036] 编辑卸载后迟到成功不能污染新页面或重放提交', async ({ qa, page }) => {
  1334 |   const group = await prepare(qa);
  1335 |   await login(page, qa);
  1336 |   await go(page, qa, 'group', group.id);
  1337 |   await element(page, qa, 'editProfile').click();
  1338 |   await element(page, qa, 'groupName').fill('晚到成功草稿');
  1339 |   let release!: () => void;
  1340 |   const held = new Promise<void>((resolve) => (release = resolve));
  1341 |   let requests = 0;
  1342 |   let stored = false;
  1343 |   await page.route(`**/api/groups/${group.id}`, async (route) => {
  1344 |     if (route.request().method() !== 'PATCH') {
  1345 |       await route.continue();
  1346 |       return;
  1347 |     }
  1348 |     requests++;
  1349 |     const response = await route.fetch();
  1350 |     stored = true;
  1351 |     await held;
  1352 |     await route.fulfill({ response });
  1353 |   });
  1354 |   try {
  1355 |     await element(page, qa, 'saveProfile').click();
  1356 |     await expect.poll(() => stored).toBe(true);
  1357 |     await element(page, qa, 'navAccounts').click();
  1358 |     await expect(element(page, qa, 'accountRow')).toHaveCount((await qa.api.accounts()).length);
  1359 |     release();
  1360 |     await remains(async () => {
  1361 |       expect(requests).toBe(1);
  1362 |       expect(await element(page, qa, 'profileDialog').isVisible()).toBe(false);
  1363 |       expect(await page.locator('body').innerText()).not.toContain('晚到成功草稿');
  1364 |     }, 1500);
  1365 |     expect(
  1366 |       (await qa.api.require(qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`))).name,
  1367 |     ).toBe('晚到成功草稿');
  1368 |   } finally {
  1369 |     release();
> 1370 |     await page.unrouteAll({ behavior: 'wait' });
       |     ^ Error: page.unrouteAll: Target page, context or browser has been closed
  1371 |   }
  1372 | });
  1373 | 
```