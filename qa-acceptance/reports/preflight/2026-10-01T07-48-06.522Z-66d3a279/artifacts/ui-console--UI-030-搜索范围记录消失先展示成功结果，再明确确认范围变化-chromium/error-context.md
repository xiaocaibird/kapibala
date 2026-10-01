# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-030] 搜索范围记录消失先展示成功结果，再明确确认范围变化
- Location: tests/ui/console.spec.ts:1288:1

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "群组工作台 · Kapibala"
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
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: GROUP WORKSPACE
          - heading "群组工作台" [level=1] [ref=e63]
          - paragraph [ref=e64]: 按创建时间浏览群组，或搜索名称、简介和群 ID。
        - button "创建群组" [ref=e66] [cursor=pointer]
      - region "群列表查找、筛选与排序" [ref=e69]:
        - generic [ref=e70]:
          - text: 搜索群组
          - searchbox "搜索群组" [active] [ref=e71]: 范围甲
        - button "清除搜索" [ref=e72] [cursor=pointer]
        - generic [ref=e73]:
          - text: 群状态
          - combobox "群状态" [ref=e74]:
            - option "全部" [selected]
            - option "可用"
            - option "不可写"
            - option "已退出"
        - generic [ref=e75]:
          - text: Agent 自动应答
          - combobox "Agent 自动应答" [ref=e76]:
            - option "全部" [selected]
            - option "开启"
            - option "关闭"
        - generic [ref=e77]:
          - text: 创建时间
          - combobox "创建时间" [ref=e78]:
            - option "新到旧" [selected]
            - option "旧到新"
        - button "重置条件" [ref=e79] [cursor=pointer]
        - button "刷新列表" [ref=e80] [cursor=pointer]
        - paragraph [ref=e83]: 搜索与筛选完整群目录；关键词忽略首尾空白与英文大小写，按整段匹配。
      - generic [ref=e84]:
        - heading "匹配结果" [level=2] [ref=e85]
        - generic [ref=e86]: 已加载 0 个群 · 已全部加载
      - generic [ref=e87]:
        - generic [ref=e88]:
          - strong [ref=e92]: 没有匹配的群
          - paragraph [ref=e93]: 试试其他关键词或筛选条件，也可以重置条件查看全部群。
        - button "重置条件" [ref=e95] [cursor=pointer]
      - generic [ref=e96]:
        - generic [ref=e97]: Kapibala Console
        - generic [ref=e98]: 状态有记录，执行可追踪。
```

# Test source

```ts
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
  1230 |     await expect(page).toHaveTitle(quietTitle);
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
> 1301 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
       |                                                              ^ Error: expect(received).not.toBe(expected) // Object.is equality
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
  1331 |     await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`));
  1332 |     await expect
  1333 |       .poll(async () => (await qa.api.accounts()).find((item) => item.id === account.id)?.status)
  1334 |       .toBe('online');
  1335 |     await expect(page).not.toHaveTitle(quietTitle);
  1336 |     await page.bringToFront();
  1337 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1338 |   } finally {
  1339 |     await background.close();
  1340 |   }
  1341 | });
  1342 | 
  1343 | test('[UI-032] 提醒确认不能恢复多页过期旧游标', async ({ qa, page }) => {
  1344 |   await qa.api.login();
  1345 |   let changed: Group | undefined;
  1346 |   const createdIds: string[] = [];
  1347 |   for (let i = 0; i < 23; i++) {
  1348 |     const { group } = await qa.api.createGroup();
  1349 |     changed ??= group;
  1350 |     createdIds.push(group.id);
  1351 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: `游标提醒-${i}` }));
  1352 |   }
  1353 |   const observer = observeDirectory(page);
  1354 |   try {
  1355 |     await login(page, qa);
  1356 |     await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  1357 |     await observer.settle();
  1358 |     const first = observer.ledger.reads.findLast(
  1359 |       (read) => !new URL(read.url).searchParams.has('cursor'),
  1360 |     )!;
  1361 |     expect(first.status).toBe(200);
  1362 |     expect(first.error).toBeUndefined();
  1363 |     const firstBody = first.body as { items: { id: string }[]; nextCursor: string | null };
  1364 |     expect(firstBody.items).toHaveLength(20);
  1365 |     expect(typeof firstBody.nextCursor).toBe('string');
  1366 |     expect(firstBody.nextCursor).not.toBe('');
  1367 |     const beforeMore = observer.ledger.reads.length;
  1368 |     const version = observer.ledger.boundaryVersion;
  1369 |     await element(page, qa, 'loadMoreGroups').click();
  1370 |     try {
  1371 |       await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  1372 |     } finally {
  1373 |       observer.unchanged(version);
  1374 |     }
  1375 |     const second = observer.ledger.reads.slice(beforeMore).find(
  1376 |       (read) => new URL(read.url).searchParams.get('cursor') === firstBody.nextCursor,
  1377 |     );
  1378 |     expect(second, '多页前提必须使用当前首页公开cursor').toBeDefined();
  1379 |     await directoryPremise(() => second!.endedAt !== undefined, '提醒用例第二页真实响应正文已完成');
  1380 |     expect(second!.status).toBe(200);
  1381 |     if (second!.error || second!.body === undefined)
  1382 |       throw new BlockedError(
  1383 |         `第二页正文未取得，不能建立多页游标前提：${second!.error ?? 'missing body'}`,
  1384 |       );
  1385 |     const secondBody = second!.body as typeof firstBody;
  1386 |     expect(secondBody.items).toHaveLength(3);
  1387 |     expect(secondBody.nextCursor).toBeNull();
  1388 |     const expectedIds = [...firstBody.items, ...secondBody.items].map((item) => item.id);
  1389 |     expect(new Set(expectedIds).size).toBe(23);
  1390 |     expect([...expectedIds].sort()).toEqual([...createdIds].sort());
  1391 |     const cards = await element(page, qa, 'directoryItem').all();
  1392 |     const hrefs = await Promise.all(
  1393 |       cards.map((item) => child(item, qa, 'directoryLink').getAttribute('href')),
  1394 |     );
  1395 |     const actualIds = directoryGroupIds(hrefs, page.url());
  1396 |     await qa.evidence('ui-directory-stale-initial-identities', { expectedIds, actualIds, hrefs });
  1397 |     expect(actualIds).toEqual(expectedIds);
  1398 |     observer.unchanged(version);
  1399 |     const quietTitle = await page.title();
  1400 |     const background = await backgroundTab(page);
  1401 |     const cursorRequests: string[] = [];
```