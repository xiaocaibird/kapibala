# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-028] 前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除
- Location: tests/ui/console.spec.ts:1199:1

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected: "群详情 · Kapibala"
Received: "[有更新] 群详情 · Kapibala"
Timeout:  8000ms

Call log:
  - Expect "toHaveTitle" with timeout 8000ms
    20 × locator resolved to <html lang="zh-CN">…</html>
       - unexpected value "[有更新] 群详情 · Kapibala"

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
  - link "← 群组工作台":
    - /url: "#/groups"
  - text: GROUP DETAILS
  - heading "gateway-group-1" [level=1]
  - paragraph: 网关群 ID · gateway-group-1
  - text: 可用
  - link "定时序列":
    - /url: "#/sequences/1b4de95a-62c4-406f-b91e-41d0935b825c"
  - heading "消息时间线" [level=2]
  - text: 2 条已加载
  - status:
    - text: 群消息有更新。
    - button "刷新并查看更新"
  - article:
    - text: ui
    - strong: external-ui
    - time: 10/01 15:49:41
    - text: 前台安静内容 gateway-message-1
  - article:
    - text: ui
    - strong: external-ui
    - time: 10/01 15:49:43
    - text: 失焦静态内容 gateway-message-2
  - textbox "消息内容":
    - /placeholder: 输入要发送到群的消息…
  - text: 发送身份
  - combobox "发送身份":
    - option "暂无可用账号" [disabled]
    - option "account-1" [selected]
    - option "account-2"
    - option "account-3"
  - button "发送消息" [disabled]
  - heading "最近 Agent 运行" [level=2]
  - text: "0"
  - strong: 暂无运行记录
  - paragraph: 开启 Agent 后，外部成员消息将触发运行。
  - complementary:
    - heading "群资料" [level=2]
    - button "编辑资料"
    - term: 群简介
    - definition: 未填写
    - term: 创建时间
    - definition:
      - time: 2026/10/01 15:49:40
    - term: 平台群 ID
    - definition: 1b4de95a-62c4-406f-b91e-41d0935b825c
    - heading "自动化设置" [level=2]
    - strong: Agent 自动应答
    - paragraph: 接收外部成员消息并启动执行。
    - switch "Agent 自动应答"
    - strong: 允许自动移除成员
    - paragraph: 需审计通过且执行账号具备权限。
    - switch "允许自动移除成员"
    - heading "群成员" [level=2]
    - text: 3 -2
    - strong: account-2
    - text: platform-account-2 群管理员 -1
    - strong: account-1
    - text: platform-account-1 群主 -3
    - strong: account-3
    - text: platform-account-3 成员
    - paragraph: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
    - heading "退出群组" [level=3]
    - paragraph: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
    - button "全部服务账号退群"
  - text: Kapibala Console 状态有记录，执行可追踪。
```

# Test source

```ts
  1130 |     expect(await element(page, qa, 'search').inputValue()).toBe('');
  1131 |     expect(await page.getByRole('button', { name: '创建群', exact: true }).count()).toBe(0);
  1132 |   });
  1133 | });
  1134 | 
  1135 | test('[UI-027] composition期间不查询中间文本，确认后只查完成词且不抢焦点', async ({ qa, page }) => {
  1136 |   const group = await prepare(qa);
  1137 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '卡比验收群' }));
  1138 |   await login(page, qa);
  1139 |   await go(page, qa, 'groups');
  1140 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  1141 |   const requests: { q: string; at: number }[] = [];
  1142 |   page.on('request', (request) => {
  1143 |     if (directoryRequest(request))
  1144 |       requests.push({
  1145 |         q: new URL(request.url()).searchParams.get('q') ?? '',
  1146 |         at: performance.now(),
  1147 |       });
  1148 |   });
  1149 |   const search = element(page, qa, 'search');
  1150 |   await search.focus();
  1151 |   await search.evaluate((node) => {
  1152 |     node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  1153 |   });
  1154 |   for (const value of ['k', 'ka', '卡'])
  1155 |     await search.evaluate((node, text) => {
  1156 |       const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  1157 |       if (!setter) throw new Error('Input adapter is not an HTML input');
  1158 |       setter.call(node, text);
  1159 |       node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: text }));
  1160 |       node.dispatchEvent(
  1161 |         new InputEvent('input', {
  1162 |           bubbles: true,
  1163 |           inputType: 'insertCompositionText',
  1164 |           data: text,
  1165 |           isComposing: true,
  1166 |         }),
  1167 |       );
  1168 |     }, value);
  1169 |   await remains(
  1170 |     async () =>
  1171 |       expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0),
  1172 |     1000,
  1173 |   );
  1174 |   const committedAt = performance.now();
  1175 |   await search.evaluate((node) => {
  1176 |     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '卡比');
  1177 |     node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '卡比' }));
  1178 |     node.dispatchEvent(
  1179 |       new InputEvent('input', {
  1180 |         bubbles: true,
  1181 |         inputType: 'insertText',
  1182 |         data: '卡比',
  1183 |         isComposing: false,
  1184 |       }),
  1185 |     );
  1186 |   });
  1187 |   await expect.poll(() => requests.filter((request) => request.q === '卡比').length).toBe(1);
  1188 |   await expect(card(page, qa, '卡比验收群')).toHaveCount(1);
  1189 |   await expect(search).toBeFocused();
  1190 |   expect(requests.find((request) => request.q === '卡比')!.at).toBeGreaterThan(committedAt);
  1191 |   expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0);
  1192 |   await qa.evidence('ui-synthetic-composition', {
  1193 |     requests,
  1194 |     committedAt,
  1195 |     limitation: '浏览器标准composition/input事件；不代表操作系统输入法已经实测',
  1196 |   });
  1197 | });
  1198 | 
  1199 | test('[UI-028] 前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除', async ({ qa, page }) => {
  1200 |   const group = await prepare(qa);
  1201 |   await login(page, qa);
  1202 |   await go(page, qa, 'group', group.id);
  1203 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1204 |   await page.bringToFront();
  1205 |   const quietTitle = await page.title();
  1206 |   const quietIcon = await favicon(page);
  1207 |   // An absent custom quiet icon is a valid browser default. The requirement
  1208 |   // is that a pending update changes the icon and confirmation restores it.
  1209 |   incoming(qa, group, '前台安静内容');
  1210 |   await expect(page.getByText('前台安静内容', { exact: true })).toBeVisible();
  1211 |   await remains(async () => {
  1212 |     expect(await page.title()).toBe(quietTitle);
  1213 |     expect(await favicon(page)).toBe(quietIcon);
  1214 |   });
  1215 |   const background = await backgroundTab(page);
  1216 |   try {
  1217 |     incoming(qa, group, '失焦静态内容');
  1218 |     await expect(page).not.toHaveTitle(quietTitle);
  1219 |     await expect.poll(() => favicon(page)).not.toBe(quietIcon);
  1220 |     const markedTitle = await page.title();
  1221 |     const markedIcon = await favicon(page);
  1222 |     await remains(async () => {
  1223 |       expect(await page.title()).toBe(markedTitle);
  1224 |       expect(await favicon(page)).toBe(markedIcon);
  1225 |     }, 1500);
  1226 |     await page.bringToFront();
  1227 |     await expect(page.getByText('失焦静态内容', { exact: true })).toBeVisible();
  1228 |     await remains(async () => expect(await page.title()).toBe(markedTitle));
  1229 |     await page.getByText('失焦静态内容', { exact: true }).click();
> 1230 |     await expect(page).toHaveTitle(quietTitle);
       |                        ^ Error: expect(page).toHaveTitle(expected) failed
  1231 |     await expect.poll(() => favicon(page)).toBe(quietIcon);
  1232 |   } finally {
  1233 |     await background.close();
  1234 |   }
  1235 | });
  1236 | 
  1237 | test('[UI-029] 内容加载失败不能确认，成功呈现后相关操作才清提醒', async ({ qa, page }) => {
  1238 |   const group = await prepare(qa);
  1239 |   await login(page, qa);
  1240 |   await go(page, qa, 'group', group.id);
  1241 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1242 |   const quietTitle = await page.title();
  1243 |   let failures = 0;
  1244 |   let fail = true;
  1245 |   await page.route(`**/api/groups/${group.id}/messages**`, async (route) => {
  1246 |     if (fail && route.request().method() === 'GET') {
  1247 |       failures++;
  1248 |       await route.fulfill({
  1249 |         status: 403,
  1250 |         contentType: 'application/json',
  1251 |         body: JSON.stringify({
  1252 |           error: {
  1253 |             code: 'FORBIDDEN',
  1254 |             message: 'QA content load unavailable',
  1255 |             requestId: 'qa-render-failure',
  1256 |           },
  1257 |         }),
  1258 |       });
  1259 |     } else await route.continue();
  1260 |   });
  1261 |   const background = await backgroundTab(page);
  1262 |   try {
  1263 |     incoming(qa, group, '只有成功读取后才能确认');
  1264 |     try {
  1265 |       await expect.poll(() => failures, { timeout: 8000 }).toBeGreaterThan(0);
  1266 |     } catch {
  1267 |       throw new BlockedError(
  1268 |         '此界面没有通过可观察messages GET读取新内容；需要适配真实内容加载失败入口，不能宣称已覆盖',
  1269 |       );
  1270 |     }
  1271 |     await expect(page).not.toHaveTitle(quietTitle);
  1272 |     await page.bringToFront();
  1273 |     await expect(element(page, qa, 'messageError')).toBeVisible();
  1274 |     await element(page, qa, 'messageError').click();
  1275 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1276 |     fail = false;
  1277 |     await element(page, qa, 'retryMessages').click();
  1278 |     await expect(page.getByText('只有成功读取后才能确认', { exact: true })).toBeVisible();
  1279 |     await page.getByText('只有成功读取后才能确认', { exact: true }).click();
  1280 |     await expect(page).toHaveTitle(quietTitle);
  1281 |   } finally {
  1282 |     fail = false;
  1283 |     await background.close();
  1284 |     await page.unrouteAll({ behavior: 'wait' });
  1285 |   }
  1286 | });
  1287 | 
  1288 | test('[UI-030] 搜索范围记录消失先展示成功结果，再明确确认范围变化', async ({ qa, page }) => {
  1289 |   const group = await prepare(qa);
  1290 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围甲唯一记录' }));
  1291 |   await login(page, qa);
  1292 |   await go(page, qa, 'groups');
  1293 |   await element(page, qa, 'search').fill('范围甲');
  1294 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  1295 |   const quietTitle = await page.title();
  1296 |   const background = await backgroundTab(page);
  1297 |   try {
  1298 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围乙唯一记录' }));
  1299 |     await expect(page).not.toHaveTitle(quietTitle);
  1300 |     await page.bringToFront();
  1301 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1302 |     const refresh = element(page, qa, 'attentionRefresh');
  1303 |     if (await refresh.isVisible()) await refresh.click();
  1304 |     await expect(element(page, qa, 'directoryEmpty')).toBeVisible();
  1305 |     await expect(element(page, qa, 'attentionScopeSummary')).toBeVisible();
  1306 |     await expect(element(page, qa, 'search')).toHaveValue('范围甲');
  1307 |     await expect(page).not.toHaveTitle(quietTitle);
  1308 |     await element(page, qa, 'attentionScopeConfirm').click();
  1309 |     await expect(page).toHaveTitle(quietTitle);
  1310 |   } finally {
  1311 |     await background.close();
  1312 |   }
  1313 | });
  1314 | 
  1315 | test('[UI-031] 状态先改变后还原仍保留期间变化候选', async ({ qa, page }) => {
  1316 |   await qa.api.login();
  1317 |   const accounts = await qa.api.connectAll();
  1318 |   const account = accounts[0]!;
  1319 |   await login(page, qa);
  1320 |   await go(page, qa, 'accounts');
  1321 |   await expect(element(page, qa, 'accountRow')).toHaveCount(accounts.length);
  1322 |   const quietTitle = await page.title();
  1323 |   const background = await backgroundTab(page);
  1324 |   try {
  1325 |     await qa.api.require(
  1326 |       qa.api.post(`/api/accounts/${account.id}/transition`, {
  1327 |         expectedFrom: 'online',
  1328 |         to: 'disconnected',
  1329 |       }),
  1330 |     );
```