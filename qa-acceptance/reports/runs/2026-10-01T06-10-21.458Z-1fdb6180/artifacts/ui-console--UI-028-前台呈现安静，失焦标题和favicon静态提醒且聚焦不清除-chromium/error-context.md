# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-028] 前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除
- Location: tests/ui/console.spec.ts:999:1

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "[]"
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
            - /url: "#/sequences/aac1ce5c-5d99-4115-a4cc-98f97e2551ef"
      - alert [ref=e72]:
        - generic [ref=e75]:
          - strong [ref=e76]: 暂时无法连接服务，请稍后重试。
          - generic [ref=e77]: NETWORK_ERROR
      - generic [ref=e78]:
        - generic [ref=e79]:
          - generic [ref=e80]:
            - generic [ref=e81]:
              - heading "消息时间线" [level=2] [ref=e82]
              - generic [ref=e85]: 0 条已加载
            - alert [ref=e86]:
              - generic [ref=e89]:
                - strong [ref=e90]: 暂时无法连接服务，请稍后重试。
                - generic [ref=e91]: NETWORK_ERROR
              - button "重试" [ref=e92] [cursor=pointer]
            - generic [ref=e95]:
              - strong [ref=e99]: 消息会出现在这里
              - paragraph [ref=e100]: 发送一条消息，或等待群成员的消息到达。
            - generic [ref=e101]:
              - alert [ref=e102]:
                - generic [ref=e105]:
                  - strong [ref=e106]: 暂时无法连接服务，请稍后重试。
                  - generic [ref=e107]: NETWORK_ERROR
              - textbox "消息内容" [ref=e108]:
                - /placeholder: 输入要发送到群的消息…
              - generic [ref=e109]:
                - generic [ref=e110]:
                  - text: 发送身份
                  - combobox "发送身份" [ref=e111]:
                    - option "暂无可用账号" [disabled]
                    - option "account-1" [selected]
                    - option "account-2"
                    - option "account-3"
                - button "发送消息" [disabled] [ref=e112]
          - generic [ref=e115]:
            - generic [ref=e116]:
              - heading "最近 Agent 运行" [level=2] [ref=e117]
              - generic [ref=e120]: "0"
            - alert [ref=e121]:
              - generic [ref=e124]:
                - strong [ref=e125]: 暂时无法连接服务，请稍后重试。
                - generic [ref=e126]: NETWORK_ERROR
              - button "重试" [ref=e127] [cursor=pointer]
            - generic [ref=e128]:
              - strong [ref=e132]: 暂无运行记录
              - paragraph [ref=e133]: 开启 Agent 后，外部成员消息将触发运行。
        - complementary [ref=e134]:
          - generic [ref=e137]:
            - generic [ref=e138]:
              - heading "群资料" [level=2] [ref=e139]
              - button "编辑资料" [ref=e140] [cursor=pointer]
            - generic [ref=e141]:
              - generic [ref=e142]:
                - term [ref=e143]: 群简介
                - definition [ref=e144]: 未填写
              - generic [ref=e145]:
                - term [ref=e146]: 创建时间
                - definition [ref=e147]:
                  - time [ref=e148]: 2026/10/01 14:47:50
              - generic [ref=e149]:
                - term [ref=e150]: 平台群 ID
                - definition [ref=e151]: aac1ce5c-5d99-4115-a4cc-98f97e2551ef
          - generic [ref=e154]:
            - heading "自动化设置" [level=2] [ref=e156]
            - generic [ref=e157]:
              - generic [ref=e158]:
                - generic [ref=e159]:
                  - strong [ref=e160]: Agent 自动应答
                  - paragraph [ref=e161]: 接收外部成员消息并启动执行。
                - switch "Agent 自动应答" [ref=e162] [cursor=pointer]
              - generic [ref=e164]:
                - generic [ref=e165]:
                  - strong [ref=e166]: 允许自动移除成员
                  - paragraph [ref=e167]: 需审计通过且执行账号具备权限。
                - switch "允许自动移除成员" [ref=e168] [cursor=pointer]
          - generic [ref=e172]:
            - generic [ref=e173]:
              - heading "群成员" [level=2] [ref=e174]
              - generic [ref=e175]: "3"
            - generic [ref=e176]:
              - generic [ref=e177]:
                - generic [ref=e178]: "-2"
                - generic [ref=e179]:
                  - strong [ref=e180]: account-2
                  - generic "platform-account-2" [ref=e181]
                - generic [ref=e182]: 群管理员
              - generic [ref=e183]:
                - generic [ref=e184]: "-1"
                - generic [ref=e185]:
                  - strong [ref=e186]: account-1
                  - generic "platform-account-1" [ref=e187]
                - generic [ref=e188]: 群主
              - generic [ref=e189]:
                - generic [ref=e190]: "-3"
                - generic [ref=e191]:
                  - strong [ref=e192]: account-3
                  - generic "platform-account-3" [ref=e193]
                - generic [ref=e194]: 成员
            - paragraph [ref=e195]: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
          - generic [ref=e196]:
            - heading "退出群组" [level=3] [ref=e197]
            - paragraph [ref=e198]: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
            - button "全部服务账号退群" [ref=e199] [cursor=pointer]
      - generic [ref=e200]:
        - generic [ref=e201]: Kapibala Console
        - generic [ref=e202]: 状态有记录，执行可追踪。
```

# Test source

```ts
  907  | });
  908  | 
  909  | test('[UI-026] 注销后更换身份不复用上一会话目录条件', async ({ qa, page }) => {
  910  |   const group = await prepare(qa);
  911  |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '仅上一会话条件' }));
  912  |   await login(page, qa);
  913  |   await go(page, qa, 'groups');
  914  |   await element(page, qa, 'search').fill('仅上一会话');
  915  |   await element(page, qa, 'order').selectOption('asc');
  916  |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  917  |   const loggedOut = page.waitForResponse(
  918  |     (response) =>
  919  |       new URL(response.url()).pathname === '/api/auth/logout' &&
  920  |       response.request().method() === 'POST',
  921  |   );
  922  |   await element(page, qa, 'logout').click();
  923  |   expect((await loggedOut).ok()).toBe(true);
  924  |   await login(page, qa, 'viewer');
  925  |   await go(page, qa, 'groups');
  926  |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  927  |   await expect(element(page, qa, 'search')).toHaveValue('');
  928  |   await expect(element(page, qa, 'order')).toHaveValue('desc');
  929  |   await remains(async () => {
  930  |     expect(await element(page, qa, 'search').inputValue()).toBe('');
  931  |     expect(await page.getByRole('button', { name: '创建群', exact: true }).count()).toBe(0);
  932  |   });
  933  | });
  934  | 
  935  | test('[UI-027] composition期间不查询中间文本，确认后只查完成词且不抢焦点', async ({ qa, page }) => {
  936  |   const group = await prepare(qa);
  937  |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '卡比验收群' }));
  938  |   await login(page, qa);
  939  |   await go(page, qa, 'groups');
  940  |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  941  |   const requests: { q: string; at: number }[] = [];
  942  |   page.on('request', (request) => {
  943  |     if (directoryRequest(request))
  944  |       requests.push({
  945  |         q: new URL(request.url()).searchParams.get('q') ?? '',
  946  |         at: performance.now(),
  947  |       });
  948  |   });
  949  |   const search = element(page, qa, 'search');
  950  |   await search.focus();
  951  |   await search.evaluate((node) => {
  952  |     node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  953  |   });
  954  |   for (const value of ['k', 'ka', '卡'])
  955  |     await search.evaluate((node, text) => {
  956  |       const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  957  |       if (!setter) throw new Error('Input adapter is not an HTML input');
  958  |       setter.call(node, text);
  959  |       node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: text }));
  960  |       node.dispatchEvent(
  961  |         new InputEvent('input', {
  962  |           bubbles: true,
  963  |           inputType: 'insertCompositionText',
  964  |           data: text,
  965  |           isComposing: true,
  966  |         }),
  967  |       );
  968  |     }, value);
  969  |   await remains(
  970  |     async () =>
  971  |       expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0),
  972  |     1000,
  973  |   );
  974  |   const committedAt = performance.now();
  975  |   await search.evaluate((node) => {
  976  |     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '卡比');
  977  |     node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '卡比' }));
  978  |     node.dispatchEvent(
  979  |       new InputEvent('input', {
  980  |         bubbles: true,
  981  |         inputType: 'insertText',
  982  |         data: '卡比',
  983  |         isComposing: false,
  984  |       }),
  985  |     );
  986  |   });
  987  |   await expect.poll(() => requests.filter((request) => request.q === '卡比').length).toBe(1);
  988  |   await expect(card(page, qa, '卡比验收群')).toHaveCount(1);
  989  |   await expect(search).toBeFocused();
  990  |   expect(requests.find((request) => request.q === '卡比')!.at).toBeGreaterThan(committedAt);
  991  |   expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0);
  992  |   await qa.evidence('ui-synthetic-composition', {
  993  |     requests,
  994  |     committedAt,
  995  |     limitation: '浏览器标准composition/input事件；不代表操作系统输入法已经实测',
  996  |   });
  997  | });
  998  | 
  999  | test('[UI-028] 前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除', async ({ qa, page }) => {
  1000 |   const group = await prepare(qa);
  1001 |   await login(page, qa);
  1002 |   await go(page, qa, 'group', group.id);
  1003 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1004 |   await page.bringToFront();
  1005 |   const quietTitle = await page.title();
  1006 |   const quietIcon = await favicon(page);
> 1007 |   expect(quietIcon).not.toBe('[]');
       |                         ^ Error: expect(received).not.toBe(expected) // Object.is equality
  1008 |   incoming(qa, group, '前台安静内容');
  1009 |   await expect(page.getByText('前台安静内容', { exact: true })).toBeVisible();
  1010 |   await remains(async () => {
  1011 |     expect(await page.title()).toBe(quietTitle);
  1012 |     expect(await favicon(page)).toBe(quietIcon);
  1013 |   });
  1014 |   const background = await backgroundTab(page);
  1015 |   try {
  1016 |     incoming(qa, group, '失焦静态内容');
  1017 |     await expect(page).not.toHaveTitle(quietTitle);
  1018 |     await expect.poll(() => favicon(page)).not.toBe(quietIcon);
  1019 |     const markedTitle = await page.title();
  1020 |     const markedIcon = await favicon(page);
  1021 |     await remains(async () => {
  1022 |       expect(await page.title()).toBe(markedTitle);
  1023 |       expect(await favicon(page)).toBe(markedIcon);
  1024 |     }, 1500);
  1025 |     await page.bringToFront();
  1026 |     await expect(page.getByText('失焦静态内容', { exact: true })).toBeVisible();
  1027 |     await remains(async () => expect(await page.title()).toBe(markedTitle));
  1028 |     await page.getByText('失焦静态内容', { exact: true }).click();
  1029 |     await expect(page).toHaveTitle(quietTitle);
  1030 |     await expect.poll(() => favicon(page)).toBe(quietIcon);
  1031 |   } finally {
  1032 |     await background.close();
  1033 |   }
  1034 | });
  1035 | 
  1036 | test('[UI-029] 内容加载失败不能确认，成功呈现后相关操作才清提醒', async ({ qa, page }) => {
  1037 |   const group = await prepare(qa);
  1038 |   await login(page, qa);
  1039 |   await go(page, qa, 'group', group.id);
  1040 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1041 |   const quietTitle = await page.title();
  1042 |   let failures = 0;
  1043 |   let fail = true;
  1044 |   await page.route(`**/api/groups/${group.id}/messages**`, async (route) => {
  1045 |     if (fail && route.request().method() === 'GET') {
  1046 |       failures++;
  1047 |       await route.fulfill({
  1048 |         status: 403,
  1049 |         contentType: 'application/json',
  1050 |         body: JSON.stringify({
  1051 |           error: {
  1052 |             code: 'FORBIDDEN',
  1053 |             message: 'QA content load unavailable',
  1054 |             requestId: 'qa-render-failure',
  1055 |           },
  1056 |         }),
  1057 |       });
  1058 |     } else await route.continue();
  1059 |   });
  1060 |   const background = await backgroundTab(page);
  1061 |   try {
  1062 |     incoming(qa, group, '只有成功读取后才能确认');
  1063 |     try {
  1064 |       await expect.poll(() => failures, { timeout: 8000 }).toBeGreaterThan(0);
  1065 |     } catch {
  1066 |       throw new BlockedError(
  1067 |         '此界面没有通过可观察messages GET读取新内容；需要适配真实内容加载失败入口，不能宣称已覆盖',
  1068 |       );
  1069 |     }
  1070 |     await expect(page).not.toHaveTitle(quietTitle);
  1071 |     await page.bringToFront();
  1072 |     await expect(element(page, qa, 'messageError')).toBeVisible();
  1073 |     await element(page, qa, 'messageError').click();
  1074 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1075 |     fail = false;
  1076 |     await element(page, qa, 'retryMessages').click();
  1077 |     await expect(page.getByText('只有成功读取后才能确认', { exact: true })).toBeVisible();
  1078 |     await page.getByText('只有成功读取后才能确认', { exact: true }).click();
  1079 |     await expect(page).toHaveTitle(quietTitle);
  1080 |   } finally {
  1081 |     fail = false;
  1082 |     await background.close();
  1083 |     await page.unrouteAll({ behavior: 'wait' });
  1084 |   }
  1085 | });
  1086 | 
  1087 | test('[UI-030] 搜索范围记录消失先展示成功结果，再明确确认范围变化', async ({ qa, page }) => {
  1088 |   const group = await prepare(qa);
  1089 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围甲唯一记录' }));
  1090 |   await login(page, qa);
  1091 |   await go(page, qa, 'groups');
  1092 |   await element(page, qa, 'search').fill('范围甲');
  1093 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  1094 |   const quietTitle = await page.title();
  1095 |   const background = await backgroundTab(page);
  1096 |   try {
  1097 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围乙唯一记录' }));
  1098 |     await expect(page).not.toHaveTitle(quietTitle);
  1099 |     await page.bringToFront();
  1100 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1101 |     const refresh = element(page, qa, 'attentionRefresh');
  1102 |     if (await refresh.isVisible()) await refresh.click();
  1103 |     await expect(element(page, qa, 'directoryEmpty')).toBeVisible();
  1104 |     await expect(element(page, qa, 'attentionScopeSummary')).toBeVisible();
  1105 |     await expect(element(page, qa, 'search')).toHaveValue('范围甲');
  1106 |     await expect(page).not.toHaveTitle(quietTitle);
  1107 |     await element(page, qa, 'attentionScopeConfirm').click();
```