# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-032] 提醒确认不能恢复多页过期旧游标
- Location: tests/ui/console.spec.ts:1149:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('a[data-directory-group-id]')
Expected: 23
Received: 20
Timeout:  8000ms

Call log:
  - Expect "toHaveCount" locator('a[data-directory-group-id]') with timeout 8000ms
  - waiting for locator('a[data-directory-group-id]')
    20 × locator resolved to 20 elements
       - unexpected value "20"

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
          - searchbox "搜索群组" [ref=e71]
        - button "清除搜索" [disabled] [ref=e72]
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
        - button "重置条件" [disabled] [ref=e79]
        - button "刷新列表" [ref=e80] [cursor=pointer]
        - paragraph [ref=e83]: 搜索与筛选完整群目录；关键词忽略首尾空白与英文大小写，按整段匹配。
      - generic [ref=e84]:
        - heading "所有群组" [level=2] [ref=e85]
        - generic [ref=e86]: 已加载 20 个群 · 还有更多
      - generic [ref=e87]:
        - link "可用 游标提醒-22 网关 ID · gateway-group-23 创建于 2026/10/01 15:30:38 3 位成员 Agent 未开启 查看群组详情" [ref=e88] [cursor=pointer]:
          - /url: "#/groups/a68aa178-64db-4c90-a2f5-cb989122511a"
          - generic [ref=e89]: 可用
          - heading "游标提醒-22" [level=3] [ref=e95]
          - generic "gateway-group-23" [ref=e96]: 网关 ID · gateway-group-23
          - generic [ref=e97]:
            - text: 创建于
            - time [ref=e98]: 2026/10/01 15:30:38
          - generic [ref=e99]:
            - generic [ref=e100]: 3 位成员
            - generic [ref=e104]: Agent 未开启
          - generic [ref=e106]: 查看群组详情
        - link "可用 游标提醒-21 网关 ID · gateway-group-22 创建于 2026/10/01 15:30:37 3 位成员 Agent 未开启 查看群组详情" [ref=e110] [cursor=pointer]:
          - /url: "#/groups/efb69696-bdb0-445a-aa7d-7df0d1842346"
          - generic [ref=e111]: 可用
          - heading "游标提醒-21" [level=3] [ref=e117]
          - generic "gateway-group-22" [ref=e118]: 网关 ID · gateway-group-22
          - generic [ref=e119]:
            - text: 创建于
            - time [ref=e120]: 2026/10/01 15:30:37
          - generic [ref=e121]:
            - generic [ref=e122]: 3 位成员
            - generic [ref=e126]: Agent 未开启
          - generic [ref=e128]: 查看群组详情
        - link "可用 游标提醒-20 网关 ID · gateway-group-21 创建于 2026/10/01 15:30:36 3 位成员 Agent 未开启 查看群组详情" [ref=e132] [cursor=pointer]:
          - /url: "#/groups/cb84be96-d4fb-4fcf-8c98-717af7bfe68e"
          - generic [ref=e133]: 可用
          - heading "游标提醒-20" [level=3] [ref=e139]
          - generic "gateway-group-21" [ref=e140]: 网关 ID · gateway-group-21
          - generic [ref=e141]:
            - text: 创建于
            - time [ref=e142]: 2026/10/01 15:30:36
          - generic [ref=e143]:
            - generic [ref=e144]: 3 位成员
            - generic [ref=e148]: Agent 未开启
          - generic [ref=e150]: 查看群组详情
        - link "可用 游标提醒-19 网关 ID · gateway-group-20 创建于 2026/10/01 15:30:35 3 位成员 Agent 未开启 查看群组详情" [ref=e154] [cursor=pointer]:
          - /url: "#/groups/e25f18e5-3de7-4580-9a7f-010c3e0a49d9"
          - generic [ref=e155]: 可用
          - heading "游标提醒-19" [level=3] [ref=e161]
          - generic "gateway-group-20" [ref=e162]: 网关 ID · gateway-group-20
          - generic [ref=e163]:
            - text: 创建于
            - time [ref=e164]: 2026/10/01 15:30:35
          - generic [ref=e165]:
            - generic [ref=e166]: 3 位成员
            - generic [ref=e170]: Agent 未开启
          - generic [ref=e172]: 查看群组详情
        - link "可用 游标提醒-18 网关 ID · gateway-group-19 创建于 2026/10/01 15:30:34 3 位成员 Agent 未开启 查看群组详情" [ref=e176] [cursor=pointer]:
          - /url: "#/groups/b9a9c5b1-b5e8-4060-9210-ca7e03c839ed"
          - generic [ref=e177]: 可用
          - heading "游标提醒-18" [level=3] [ref=e183]
          - generic "gateway-group-19" [ref=e184]: 网关 ID · gateway-group-19
          - generic [ref=e185]:
            - text: 创建于
            - time [ref=e186]: 2026/10/01 15:30:34
          - generic [ref=e187]:
            - generic [ref=e188]: 3 位成员
            - generic [ref=e192]: Agent 未开启
          - generic [ref=e194]: 查看群组详情
        - link "可用 游标提醒-17 网关 ID · gateway-group-18 创建于 2026/10/01 15:30:33 3 位成员 Agent 未开启 查看群组详情" [ref=e198] [cursor=pointer]:
          - /url: "#/groups/c1e08fd4-71c8-449e-90ac-408e59780f62"
          - generic [ref=e199]: 可用
          - heading "游标提醒-17" [level=3] [ref=e205]
          - generic "gateway-group-18" [ref=e206]: 网关 ID · gateway-group-18
          - generic [ref=e207]:
            - text: 创建于
            - time [ref=e208]: 2026/10/01 15:30:33
          - generic [ref=e209]:
            - generic [ref=e210]: 3 位成员
            - generic [ref=e214]: Agent 未开启
          - generic [ref=e216]: 查看群组详情
        - link "可用 游标提醒-16 网关 ID · gateway-group-17 创建于 2026/10/01 15:30:33 3 位成员 Agent 未开启 查看群组详情" [ref=e220] [cursor=pointer]:
          - /url: "#/groups/ca7efeb2-bbf3-47a4-91bf-9966d501ac74"
          - generic [ref=e221]: 可用
          - heading "游标提醒-16" [level=3] [ref=e227]
          - generic "gateway-group-17" [ref=e228]: 网关 ID · gateway-group-17
          - generic [ref=e229]:
            - text: 创建于
            - time [ref=e230]: 2026/10/01 15:30:33
          - generic [ref=e231]:
            - generic [ref=e232]: 3 位成员
            - generic [ref=e236]: Agent 未开启
          - generic [ref=e238]: 查看群组详情
        - link "可用 游标提醒-15 网关 ID · gateway-group-16 创建于 2026/10/01 15:30:32 3 位成员 Agent 未开启 查看群组详情" [ref=e242] [cursor=pointer]:
          - /url: "#/groups/c3a6ac8f-3a98-4add-ac57-5d06ae65ebf2"
          - generic [ref=e243]: 可用
          - heading "游标提醒-15" [level=3] [ref=e249]
          - generic "gateway-group-16" [ref=e250]: 网关 ID · gateway-group-16
          - generic [ref=e251]:
            - text: 创建于
            - time [ref=e252]: 2026/10/01 15:30:32
          - generic [ref=e253]:
            - generic [ref=e254]: 3 位成员
            - generic [ref=e258]: Agent 未开启
          - generic [ref=e260]: 查看群组详情
        - link "可用 游标提醒-14 网关 ID · gateway-group-15 创建于 2026/10/01 15:30:31 3 位成员 Agent 未开启 查看群组详情" [ref=e264] [cursor=pointer]:
          - /url: "#/groups/cbd558be-1d77-4b75-981a-cf5041016c7f"
          - generic [ref=e265]: 可用
          - heading "游标提醒-14" [level=3] [ref=e271]
          - generic "gateway-group-15" [ref=e272]: 网关 ID · gateway-group-15
          - generic [ref=e273]:
            - text: 创建于
            - time [ref=e274]: 2026/10/01 15:30:31
          - generic [ref=e275]:
            - generic [ref=e276]: 3 位成员
            - generic [ref=e280]: Agent 未开启
          - generic [ref=e282]: 查看群组详情
        - link "可用 游标提醒-13 网关 ID · gateway-group-14 创建于 2026/10/01 15:30:30 3 位成员 Agent 未开启 查看群组详情" [ref=e286] [cursor=pointer]:
          - /url: "#/groups/1476d3e0-8f96-492c-bd7e-3785bfad5482"
          - generic [ref=e287]: 可用
          - heading "游标提醒-13" [level=3] [ref=e293]
          - generic "gateway-group-14" [ref=e294]: 网关 ID · gateway-group-14
          - generic [ref=e295]:
            - text: 创建于
            - time [ref=e296]: 2026/10/01 15:30:30
          - generic [ref=e297]:
            - generic [ref=e298]: 3 位成员
            - generic [ref=e302]: Agent 未开启
          - generic [ref=e304]: 查看群组详情
        - link "可用 游标提醒-12 网关 ID · gateway-group-13 创建于 2026/10/01 15:30:29 3 位成员 Agent 未开启 查看群组详情" [ref=e308] [cursor=pointer]:
          - /url: "#/groups/98dd99e1-1e8a-4d4d-b223-a120d4290399"
          - generic [ref=e309]: 可用
          - heading "游标提醒-12" [level=3] [ref=e315]
          - generic "gateway-group-13" [ref=e316]: 网关 ID · gateway-group-13
          - generic [ref=e317]:
            - text: 创建于
            - time [ref=e318]: 2026/10/01 15:30:29
          - generic [ref=e319]:
            - generic [ref=e320]: 3 位成员
            - generic [ref=e324]: Agent 未开启
          - generic [ref=e326]: 查看群组详情
        - link "可用 游标提醒-11 网关 ID · gateway-group-12 创建于 2026/10/01 15:30:28 3 位成员 Agent 未开启 查看群组详情" [ref=e330] [cursor=pointer]:
          - /url: "#/groups/a154782c-30d0-4843-a5ef-43379ed45a94"
          - generic [ref=e331]: 可用
          - heading "游标提醒-11" [level=3] [ref=e337]
          - generic "gateway-group-12" [ref=e338]: 网关 ID · gateway-group-12
          - generic [ref=e339]:
            - text: 创建于
            - time [ref=e340]: 2026/10/01 15:30:28
          - generic [ref=e341]:
            - generic [ref=e342]: 3 位成员
            - generic [ref=e346]: Agent 未开启
          - generic [ref=e348]: 查看群组详情
        - link "可用 游标提醒-10 网关 ID · gateway-group-11 创建于 2026/10/01 15:30:27 3 位成员 Agent 未开启 查看群组详情" [ref=e352] [cursor=pointer]:
          - /url: "#/groups/dafe4d9b-543f-453a-b6a2-cea4ae592a40"
          - generic [ref=e353]: 可用
          - heading "游标提醒-10" [level=3] [ref=e359]
          - generic "gateway-group-11" [ref=e360]: 网关 ID · gateway-group-11
          - generic [ref=e361]:
            - text: 创建于
            - time [ref=e362]: 2026/10/01 15:30:27
          - generic [ref=e363]:
            - generic [ref=e364]: 3 位成员
            - generic [ref=e368]: Agent 未开启
          - generic [ref=e370]: 查看群组详情
        - link "可用 游标提醒-9 网关 ID · gateway-group-10 创建于 2026/10/01 15:30:26 3 位成员 Agent 未开启 查看群组详情" [ref=e374] [cursor=pointer]:
          - /url: "#/groups/4178a2dd-172e-45c8-855b-33c46e3441f2"
          - generic [ref=e375]: 可用
          - heading "游标提醒-9" [level=3] [ref=e381]
          - generic "gateway-group-10" [ref=e382]: 网关 ID · gateway-group-10
          - generic [ref=e383]:
            - text: 创建于
            - time [ref=e384]: 2026/10/01 15:30:26
          - generic [ref=e385]:
            - generic [ref=e386]: 3 位成员
            - generic [ref=e390]: Agent 未开启
          - generic [ref=e392]: 查看群组详情
        - link "可用 游标提醒-8 网关 ID · gateway-group-9 创建于 2026/10/01 15:30:25 3 位成员 Agent 未开启 查看群组详情" [ref=e396] [cursor=pointer]:
          - /url: "#/groups/6829a50a-ee94-47a1-8639-2926ea7dfab5"
          - generic [ref=e397]: 可用
          - heading "游标提醒-8" [level=3] [ref=e403]
          - generic "gateway-group-9" [ref=e404]: 网关 ID · gateway-group-9
          - generic [ref=e405]:
            - text: 创建于
            - time [ref=e406]: 2026/10/01 15:30:25
          - generic [ref=e407]:
            - generic [ref=e408]: 3 位成员
            - generic [ref=e412]: Agent 未开启
          - generic [ref=e414]: 查看群组详情
        - link "可用 游标提醒-7 网关 ID · gateway-group-8 创建于 2026/10/01 15:30:24 3 位成员 Agent 未开启 查看群组详情" [ref=e418] [cursor=pointer]:
          - /url: "#/groups/db3ef3d7-2d5f-4c02-9e7e-fa0cf336dc1a"
          - generic [ref=e419]: 可用
          - heading "游标提醒-7" [level=3] [ref=e425]
          - generic "gateway-group-8" [ref=e426]: 网关 ID · gateway-group-8
          - generic [ref=e427]:
            - text: 创建于
            - time [ref=e428]: 2026/10/01 15:30:24
          - generic [ref=e429]:
            - generic [ref=e430]: 3 位成员
            - generic [ref=e434]: Agent 未开启
          - generic [ref=e436]: 查看群组详情
        - link "可用 游标提醒-6 网关 ID · gateway-group-7 创建于 2026/10/01 15:30:23 3 位成员 Agent 未开启 查看群组详情" [ref=e440] [cursor=pointer]:
          - /url: "#/groups/c0a9b620-056e-4bc2-b1a6-8bbbe5e143ac"
          - generic [ref=e441]: 可用
          - heading "游标提醒-6" [level=3] [ref=e447]
          - generic "gateway-group-7" [ref=e448]: 网关 ID · gateway-group-7
          - generic [ref=e449]:
            - text: 创建于
            - time [ref=e450]: 2026/10/01 15:30:23
          - generic [ref=e451]:
            - generic [ref=e452]: 3 位成员
            - generic [ref=e456]: Agent 未开启
          - generic [ref=e458]: 查看群组详情
        - link "可用 游标提醒-5 网关 ID · gateway-group-6 创建于 2026/10/01 15:30:22 3 位成员 Agent 未开启 查看群组详情" [ref=e462] [cursor=pointer]:
          - /url: "#/groups/94a7a49e-42ec-4fdf-9de9-fe4990d8b3c1"
          - generic [ref=e463]: 可用
          - heading "游标提醒-5" [level=3] [ref=e469]
          - generic "gateway-group-6" [ref=e470]: 网关 ID · gateway-group-6
          - generic [ref=e471]:
            - text: 创建于
            - time [ref=e472]: 2026/10/01 15:30:22
          - generic [ref=e473]:
            - generic [ref=e474]: 3 位成员
            - generic [ref=e478]: Agent 未开启
          - generic [ref=e480]: 查看群组详情
        - link "可用 游标提醒-4 网关 ID · gateway-group-5 创建于 2026/10/01 15:30:21 3 位成员 Agent 未开启 查看群组详情" [ref=e484] [cursor=pointer]:
          - /url: "#/groups/b20d96b9-221d-4d7e-aee0-b7605edfd3be"
          - generic [ref=e485]: 可用
          - heading "游标提醒-4" [level=3] [ref=e491]
          - generic "gateway-group-5" [ref=e492]: 网关 ID · gateway-group-5
          - generic [ref=e493]:
            - text: 创建于
            - time [ref=e494]: 2026/10/01 15:30:21
          - generic [ref=e495]:
            - generic [ref=e496]: 3 位成员
            - generic [ref=e500]: Agent 未开启
          - generic [ref=e502]: 查看群组详情
        - link "可用 游标提醒-3 网关 ID · gateway-group-4 创建于 2026/10/01 15:30:20 3 位成员 Agent 未开启 查看群组详情" [ref=e506] [cursor=pointer]:
          - /url: "#/groups/a13c8cd8-44c9-4579-9ea7-8c21617dd231"
          - generic [ref=e507]: 可用
          - heading "游标提醒-3" [level=3] [ref=e513]
          - generic "gateway-group-4" [ref=e514]: 网关 ID · gateway-group-4
          - generic [ref=e515]:
            - text: 创建于
            - time [ref=e516]: 2026/10/01 15:30:20
          - generic [ref=e517]:
            - generic [ref=e518]: 3 位成员
            - generic [ref=e522]: Agent 未开启
          - generic [ref=e524]: 查看群组详情
      - generic [ref=e528]:
        - button "加载更多" [ref=e529] [cursor=pointer]
        - generic [ref=e530]: 每次最多加载 20 个群
      - generic [ref=e531]:
        - generic [ref=e532]: Kapibala Console
        - generic [ref=e533]: 状态有记录，执行可追踪。
```

# Test source

```ts
  1061 |             requestId: 'qa-render-failure',
  1062 |           },
  1063 |         }),
  1064 |       });
  1065 |     } else await route.continue();
  1066 |   });
  1067 |   const background = await backgroundTab(page);
  1068 |   try {
  1069 |     incoming(qa, group, '只有成功读取后才能确认');
  1070 |     try {
  1071 |       await expect.poll(() => failures, { timeout: 8000 }).toBeGreaterThan(0);
  1072 |     } catch {
  1073 |       throw new BlockedError(
  1074 |         '此界面没有通过可观察messages GET读取新内容；需要适配真实内容加载失败入口，不能宣称已覆盖',
  1075 |       );
  1076 |     }
  1077 |     await expect(page).not.toHaveTitle(quietTitle);
  1078 |     await page.bringToFront();
  1079 |     await expect(element(page, qa, 'messageError')).toBeVisible();
  1080 |     await element(page, qa, 'messageError').click();
  1081 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1082 |     fail = false;
  1083 |     await element(page, qa, 'retryMessages').click();
  1084 |     await expect(page.getByText('只有成功读取后才能确认', { exact: true })).toBeVisible();
  1085 |     await page.getByText('只有成功读取后才能确认', { exact: true }).click();
  1086 |     await expect(page).toHaveTitle(quietTitle);
  1087 |   } finally {
  1088 |     fail = false;
  1089 |     await background.close();
  1090 |     await page.unrouteAll({ behavior: 'wait' });
  1091 |   }
  1092 | });
  1093 | 
  1094 | test('[UI-030] 搜索范围记录消失先展示成功结果，再明确确认范围变化', async ({ qa, page }) => {
  1095 |   const group = await prepare(qa);
  1096 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围甲唯一记录' }));
  1097 |   await login(page, qa);
  1098 |   await go(page, qa, 'groups');
  1099 |   await element(page, qa, 'search').fill('范围甲');
  1100 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  1101 |   const quietTitle = await page.title();
  1102 |   const background = await backgroundTab(page);
  1103 |   try {
  1104 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '范围乙唯一记录' }));
  1105 |     await expect(page).not.toHaveTitle(quietTitle);
  1106 |     await page.bringToFront();
  1107 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1108 |     const refresh = element(page, qa, 'attentionRefresh');
  1109 |     if (await refresh.isVisible()) await refresh.click();
  1110 |     await expect(element(page, qa, 'directoryEmpty')).toBeVisible();
  1111 |     await expect(element(page, qa, 'attentionScopeSummary')).toBeVisible();
  1112 |     await expect(element(page, qa, 'search')).toHaveValue('范围甲');
  1113 |     await expect(page).not.toHaveTitle(quietTitle);
  1114 |     await element(page, qa, 'attentionScopeConfirm').click();
  1115 |     await expect(page).toHaveTitle(quietTitle);
  1116 |   } finally {
  1117 |     await background.close();
  1118 |   }
  1119 | });
  1120 | 
  1121 | test('[UI-031] 状态先改变后还原仍保留期间变化候选', async ({ qa, page }) => {
  1122 |   await qa.api.login();
  1123 |   const accounts = await qa.api.connectAll();
  1124 |   const account = accounts[0]!;
  1125 |   await login(page, qa);
  1126 |   await go(page, qa, 'accounts');
  1127 |   await expect(element(page, qa, 'accountRow')).toHaveCount(accounts.length);
  1128 |   const quietTitle = await page.title();
  1129 |   const background = await backgroundTab(page);
  1130 |   try {
  1131 |     await qa.api.require(
  1132 |       qa.api.post(`/api/accounts/${account.id}/transition`, {
  1133 |         expectedFrom: 'online',
  1134 |         to: 'disconnected',
  1135 |       }),
  1136 |     );
  1137 |     await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`));
  1138 |     await expect
  1139 |       .poll(async () => (await qa.api.accounts()).find((item) => item.id === account.id)?.status)
  1140 |       .toBe('online');
  1141 |     await expect(page).not.toHaveTitle(quietTitle);
  1142 |     await page.bringToFront();
  1143 |     await remains(async () => expect(await page.title()).not.toBe(quietTitle));
  1144 |   } finally {
  1145 |     await background.close();
  1146 |   }
  1147 | });
  1148 | 
  1149 | test('[UI-032] 提醒确认不能恢复多页过期旧游标', async ({ qa, page }) => {
  1150 |   await qa.api.login();
  1151 |   let changed: Group | undefined;
  1152 |   for (let i = 0; i < 23; i++) {
  1153 |     const { group } = await qa.api.createGroup();
  1154 |     changed ??= group;
  1155 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: `游标提醒-${i}` }));
  1156 |   }
  1157 |   await login(page, qa);
  1158 |   await go(page, qa, 'groups');
  1159 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  1160 |   await element(page, qa, 'loadMoreGroups').click();
> 1161 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
       |                                                    ^ Error: expect(locator).toHaveCount(expected) failed
  1162 |   const quietTitle = await page.title();
  1163 |   const background = await backgroundTab(page);
  1164 |   const cursorRequests: string[] = [];
  1165 |   page.on('request', (request) => {
  1166 |     if (directoryRequest(request) && new URL(request.url()).searchParams.has('cursor'))
  1167 |       cursorRequests.push(request.url());
  1168 |   });
  1169 |   try {
  1170 |     await qa.api.require(qa.api.patch(`/api/groups/${changed!.id}`, { name: '游标提醒已变化' }));
  1171 |     await expect(element(page, qa, 'directoryStale')).toBeVisible();
  1172 |     await expect(page).not.toHaveTitle(quietTitle);
  1173 |     await page.bringToFront();
  1174 |     const confirm = element(page, qa, 'attentionConfirm');
  1175 |     if (!(await confirm.isVisible()))
  1176 |       throw new BlockedError(
  1177 |         '需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期',
  1178 |       );
  1179 |     await confirm.click();
  1180 |     await expect(page).toHaveTitle(quietTitle);
  1181 |     await expect(element(page, qa, 'directoryStale')).toBeVisible();
  1182 |     await remains(async () => {
  1183 |       const more = element(page, qa, 'loadMoreGroups');
  1184 |       expect((await more.count()) === 0 || (await more.isDisabled())).toBe(true);
  1185 |       expect(cursorRequests).toEqual([]);
  1186 |     });
  1187 |   } finally {
  1188 |     await background.close();
  1189 |   }
  1190 | });
  1191 | 
  1192 | test('[UI-033] 本地手动发送先带clientMsgId，回流早于响应不误标远端未读', async ({ qa, page }) => {
  1193 |   const group = await prepare(qa);
  1194 |   await login(page, qa);
  1195 |   await go(page, qa, 'group', group.id);
  1196 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1197 |   const quietTitle = await page.title();
  1198 |   await element(page, qa, 'senderAccount').selectOption(group.creatorAccountId);
  1199 |   await element(page, qa, 'messageInput').fill('本标签手动发送');
  1200 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  1201 |     effectDelayMs: 1500,
  1202 |     barrier: { phase: 'before-response', name: 'manual-send-response' },
  1203 |   });
  1204 |   let releaseApi!: () => void;
  1205 |   const apiHeld = new Promise<void>((resolve) => (releaseApi = resolve));
  1206 |   let apiDelivered = false;
  1207 |   await page.route(`**/api/groups/${group.id}/send`, async (route) => {
  1208 |     const response = await route.fetch();
  1209 |     await apiHeld;
  1210 |     await route.fulfill({ response });
  1211 |     apiDelivered = true;
  1212 |   });
  1213 |   let background: Page | undefined;
  1214 |   try {
  1215 |     const outgoing = page.waitForRequest(
  1216 |       (request) =>
  1217 |         new URL(request.url()).pathname === `/api/groups/${group.id}/send` &&
  1218 |         request.method() === 'POST',
  1219 |     );
  1220 |     await element(page, qa, 'sendMessage').click();
  1221 |     const payload = (await outgoing).postDataJSON() as { clientMsgId?: unknown };
  1222 |     expect(typeof payload.clientMsgId).toBe('string');
  1223 |     expect(String(payload.clientMsgId).length).toBeGreaterThan(0);
  1224 |     background = await backgroundTab(page);
  1225 |     await qa.gateway.barriers.waitFor('manual-send-response');
  1226 |     await expect
  1227 |       .poll(
  1228 |         () => qa.gateway.snapshot().messages.some((message) => message.text === '本标签手动发送'),
  1229 |         { timeout: 4000 },
  1230 |       )
  1231 |       .toBe(true);
  1232 |     await qa.api.waitFor<{ items: { text: string }[] }>(
  1233 |       `/api/groups/${group.id}/messages`,
  1234 |       (value) => value.items.some((message) => message.text === '本标签手动发送'),
  1235 |     );
  1236 |     await remains(async () => {
  1237 |       expect(await page.title()).toBe(quietTitle);
  1238 |       expect(apiDelivered).toBe(false);
  1239 |     }, 2000);
  1240 |   } finally {
  1241 |     releaseApi();
  1242 |     qa.gateway.barriers.release('manual-send-response');
  1243 |     await background?.close();
  1244 |     await page.unrouteAll({ behavior: 'wait' });
  1245 |   }
  1246 | });
  1247 | 
  1248 | test('[UI-034] Agent自己的自动消息仍参与失焦提醒', async ({ qa, page }) => {
  1249 |   const group = await prepare(qa);
  1250 |   qa.agent.enqueueTurns({
  1251 |     barrier: { phase: 'request', name: 'automatic-send' },
  1252 |     body: {
  1253 |       stop_reason: 'tool_use',
  1254 |       content: [
  1255 |         {
  1256 |           type: 'tool_use',
  1257 |           id: 'attention-agent',
  1258 |           name: 'send_message',
  1259 |           input: { text: 'Agent自动提醒消息', idempotency_key: 'attention-agent' },
  1260 |         },
  1261 |       ],
```