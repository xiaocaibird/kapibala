# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-032] 提醒确认不能恢复多页过期旧游标
- Location: tests/ui/console.spec.ts:1343:1

# Error details

```
BlockedError: [BLOCKED] 需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期
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
      - status [ref=e84]:
        - generic [ref=e85]: 当前群目录可能有变化；刷新后确认当前范围。
        - button "刷新并查看更新" [ref=e86] [cursor=pointer]
      - generic [ref=e87]:
        - heading "所有群组" [level=2] [ref=e88]
        - generic [ref=e89]: 已加载 23 个群 · 列表待刷新
      - generic [ref=e90]:
        - link "可用 游标提醒-22 网关 ID · gateway-group-23 创建于 2026/10/01 15:50:30 3 位成员 Agent 未开启 查看群组详情" [ref=e91] [cursor=pointer]:
          - /url: "#/groups/43d38e13-cd3b-4641-813f-40633c27958b"
          - generic [ref=e92]: 可用
          - heading "游标提醒-22" [level=3] [ref=e98]
          - generic "gateway-group-23" [ref=e99]: 网关 ID · gateway-group-23
          - generic [ref=e100]:
            - text: 创建于
            - time [ref=e101]: 2026/10/01 15:50:30
          - generic [ref=e102]:
            - generic [ref=e103]: 3 位成员
            - generic [ref=e107]: Agent 未开启
          - generic [ref=e109]: 查看群组详情
        - link "可用 游标提醒-21 网关 ID · gateway-group-22 创建于 2026/10/01 15:50:29 3 位成员 Agent 未开启 查看群组详情" [ref=e113] [cursor=pointer]:
          - /url: "#/groups/4b788f24-7319-4ed5-9edf-2df714aed9eb"
          - generic [ref=e114]: 可用
          - heading "游标提醒-21" [level=3] [ref=e120]
          - generic "gateway-group-22" [ref=e121]: 网关 ID · gateway-group-22
          - generic [ref=e122]:
            - text: 创建于
            - time [ref=e123]: 2026/10/01 15:50:29
          - generic [ref=e124]:
            - generic [ref=e125]: 3 位成员
            - generic [ref=e129]: Agent 未开启
          - generic [ref=e131]: 查看群组详情
        - link "可用 游标提醒-20 网关 ID · gateway-group-21 创建于 2026/10/01 15:50:28 3 位成员 Agent 未开启 查看群组详情" [ref=e135] [cursor=pointer]:
          - /url: "#/groups/64153512-75ac-4378-9565-47a3ee824b87"
          - generic [ref=e136]: 可用
          - heading "游标提醒-20" [level=3] [ref=e142]
          - generic "gateway-group-21" [ref=e143]: 网关 ID · gateway-group-21
          - generic [ref=e144]:
            - text: 创建于
            - time [ref=e145]: 2026/10/01 15:50:28
          - generic [ref=e146]:
            - generic [ref=e147]: 3 位成员
            - generic [ref=e151]: Agent 未开启
          - generic [ref=e153]: 查看群组详情
        - link "可用 游标提醒-19 网关 ID · gateway-group-20 创建于 2026/10/01 15:50:27 3 位成员 Agent 未开启 查看群组详情" [ref=e157] [cursor=pointer]:
          - /url: "#/groups/edce78d2-e5fc-436a-afff-a510bf389485"
          - generic [ref=e158]: 可用
          - heading "游标提醒-19" [level=3] [ref=e164]
          - generic "gateway-group-20" [ref=e165]: 网关 ID · gateway-group-20
          - generic [ref=e166]:
            - text: 创建于
            - time [ref=e167]: 2026/10/01 15:50:27
          - generic [ref=e168]:
            - generic [ref=e169]: 3 位成员
            - generic [ref=e173]: Agent 未开启
          - generic [ref=e175]: 查看群组详情
        - link "可用 游标提醒-18 网关 ID · gateway-group-19 创建于 2026/10/01 15:50:26 3 位成员 Agent 未开启 查看群组详情" [ref=e179] [cursor=pointer]:
          - /url: "#/groups/f6952d7b-336d-4008-8a9c-06f77b021ac4"
          - generic [ref=e180]: 可用
          - heading "游标提醒-18" [level=3] [ref=e186]
          - generic "gateway-group-19" [ref=e187]: 网关 ID · gateway-group-19
          - generic [ref=e188]:
            - text: 创建于
            - time [ref=e189]: 2026/10/01 15:50:26
          - generic [ref=e190]:
            - generic [ref=e191]: 3 位成员
            - generic [ref=e195]: Agent 未开启
          - generic [ref=e197]: 查看群组详情
        - link "可用 游标提醒-17 网关 ID · gateway-group-18 创建于 2026/10/01 15:50:25 3 位成员 Agent 未开启 查看群组详情" [ref=e201] [cursor=pointer]:
          - /url: "#/groups/3c6cd435-d30f-43cc-b747-87b8004da8ca"
          - generic [ref=e202]: 可用
          - heading "游标提醒-17" [level=3] [ref=e208]
          - generic "gateway-group-18" [ref=e209]: 网关 ID · gateway-group-18
          - generic [ref=e210]:
            - text: 创建于
            - time [ref=e211]: 2026/10/01 15:50:25
          - generic [ref=e212]:
            - generic [ref=e213]: 3 位成员
            - generic [ref=e217]: Agent 未开启
          - generic [ref=e219]: 查看群组详情
        - link "可用 游标提醒-16 网关 ID · gateway-group-17 创建于 2026/10/01 15:50:24 3 位成员 Agent 未开启 查看群组详情" [ref=e223] [cursor=pointer]:
          - /url: "#/groups/6f64a57f-73dd-4145-91dd-7cf473499f4b"
          - generic [ref=e224]: 可用
          - heading "游标提醒-16" [level=3] [ref=e230]
          - generic "gateway-group-17" [ref=e231]: 网关 ID · gateway-group-17
          - generic [ref=e232]:
            - text: 创建于
            - time [ref=e233]: 2026/10/01 15:50:24
          - generic [ref=e234]:
            - generic [ref=e235]: 3 位成员
            - generic [ref=e239]: Agent 未开启
          - generic [ref=e241]: 查看群组详情
        - link "可用 游标提醒-15 网关 ID · gateway-group-16 创建于 2026/10/01 15:50:23 3 位成员 Agent 未开启 查看群组详情" [ref=e245] [cursor=pointer]:
          - /url: "#/groups/77106cac-bd7c-44ce-b537-b88b4dab0e35"
          - generic [ref=e246]: 可用
          - heading "游标提醒-15" [level=3] [ref=e252]
          - generic "gateway-group-16" [ref=e253]: 网关 ID · gateway-group-16
          - generic [ref=e254]:
            - text: 创建于
            - time [ref=e255]: 2026/10/01 15:50:23
          - generic [ref=e256]:
            - generic [ref=e257]: 3 位成员
            - generic [ref=e261]: Agent 未开启
          - generic [ref=e263]: 查看群组详情
        - link "可用 游标提醒-14 网关 ID · gateway-group-15 创建于 2026/10/01 15:50:22 3 位成员 Agent 未开启 查看群组详情" [ref=e267] [cursor=pointer]:
          - /url: "#/groups/6d60975d-da51-4bb7-8330-1aca77c83e11"
          - generic [ref=e268]: 可用
          - heading "游标提醒-14" [level=3] [ref=e274]
          - generic "gateway-group-15" [ref=e275]: 网关 ID · gateway-group-15
          - generic [ref=e276]:
            - text: 创建于
            - time [ref=e277]: 2026/10/01 15:50:22
          - generic [ref=e278]:
            - generic [ref=e279]: 3 位成员
            - generic [ref=e283]: Agent 未开启
          - generic [ref=e285]: 查看群组详情
        - link "可用 游标提醒-13 网关 ID · gateway-group-14 创建于 2026/10/01 15:50:21 3 位成员 Agent 未开启 查看群组详情" [ref=e289] [cursor=pointer]:
          - /url: "#/groups/e41af068-3446-4e00-87dd-1efa47fd3759"
          - generic [ref=e290]: 可用
          - heading "游标提醒-13" [level=3] [ref=e296]
          - generic "gateway-group-14" [ref=e297]: 网关 ID · gateway-group-14
          - generic [ref=e298]:
            - text: 创建于
            - time [ref=e299]: 2026/10/01 15:50:21
          - generic [ref=e300]:
            - generic [ref=e301]: 3 位成员
            - generic [ref=e305]: Agent 未开启
          - generic [ref=e307]: 查看群组详情
        - link "可用 游标提醒-12 网关 ID · gateway-group-13 创建于 2026/10/01 15:50:21 3 位成员 Agent 未开启 查看群组详情" [ref=e311] [cursor=pointer]:
          - /url: "#/groups/dc51595e-5256-4619-8137-fbae536c06f1"
          - generic [ref=e312]: 可用
          - heading "游标提醒-12" [level=3] [ref=e318]
          - generic "gateway-group-13" [ref=e319]: 网关 ID · gateway-group-13
          - generic [ref=e320]:
            - text: 创建于
            - time [ref=e321]: 2026/10/01 15:50:21
          - generic [ref=e322]:
            - generic [ref=e323]: 3 位成员
            - generic [ref=e327]: Agent 未开启
          - generic [ref=e329]: 查看群组详情
        - link "可用 游标提醒-11 网关 ID · gateway-group-12 创建于 2026/10/01 15:50:20 3 位成员 Agent 未开启 查看群组详情" [ref=e333] [cursor=pointer]:
          - /url: "#/groups/092d4795-2ca3-4e6d-8784-58270b0798ba"
          - generic [ref=e334]: 可用
          - heading "游标提醒-11" [level=3] [ref=e340]
          - generic "gateway-group-12" [ref=e341]: 网关 ID · gateway-group-12
          - generic [ref=e342]:
            - text: 创建于
            - time [ref=e343]: 2026/10/01 15:50:20
          - generic [ref=e344]:
            - generic [ref=e345]: 3 位成员
            - generic [ref=e349]: Agent 未开启
          - generic [ref=e351]: 查看群组详情
        - link "可用 游标提醒-10 网关 ID · gateway-group-11 创建于 2026/10/01 15:50:19 3 位成员 Agent 未开启 查看群组详情" [ref=e355] [cursor=pointer]:
          - /url: "#/groups/b1a0e155-25f6-43ec-b15b-9369b40ad207"
          - generic [ref=e356]: 可用
          - heading "游标提醒-10" [level=3] [ref=e362]
          - generic "gateway-group-11" [ref=e363]: 网关 ID · gateway-group-11
          - generic [ref=e364]:
            - text: 创建于
            - time [ref=e365]: 2026/10/01 15:50:19
          - generic [ref=e366]:
            - generic [ref=e367]: 3 位成员
            - generic [ref=e371]: Agent 未开启
          - generic [ref=e373]: 查看群组详情
        - link "可用 游标提醒-9 网关 ID · gateway-group-10 创建于 2026/10/01 15:50:18 3 位成员 Agent 未开启 查看群组详情" [ref=e377] [cursor=pointer]:
          - /url: "#/groups/226fcc35-cbba-445d-8ea3-c757c981f50a"
          - generic [ref=e378]: 可用
          - heading "游标提醒-9" [level=3] [ref=e384]
          - generic "gateway-group-10" [ref=e385]: 网关 ID · gateway-group-10
          - generic [ref=e386]:
            - text: 创建于
            - time [ref=e387]: 2026/10/01 15:50:18
          - generic [ref=e388]:
            - generic [ref=e389]: 3 位成员
            - generic [ref=e393]: Agent 未开启
          - generic [ref=e395]: 查看群组详情
        - link "可用 游标提醒-8 网关 ID · gateway-group-9 创建于 2026/10/01 15:50:17 3 位成员 Agent 未开启 查看群组详情" [ref=e399] [cursor=pointer]:
          - /url: "#/groups/04e4bc1b-156a-4b9b-ab07-279a4a41d39c"
          - generic [ref=e400]: 可用
          - heading "游标提醒-8" [level=3] [ref=e406]
          - generic "gateway-group-9" [ref=e407]: 网关 ID · gateway-group-9
          - generic [ref=e408]:
            - text: 创建于
            - time [ref=e409]: 2026/10/01 15:50:17
          - generic [ref=e410]:
            - generic [ref=e411]: 3 位成员
            - generic [ref=e415]: Agent 未开启
          - generic [ref=e417]: 查看群组详情
        - link "可用 游标提醒-7 网关 ID · gateway-group-8 创建于 2026/10/01 15:50:16 3 位成员 Agent 未开启 查看群组详情" [ref=e421] [cursor=pointer]:
          - /url: "#/groups/c3bbf051-3b43-4ac9-abc4-6efd7ae89b8d"
          - generic [ref=e422]: 可用
          - heading "游标提醒-7" [level=3] [ref=e428]
          - generic "gateway-group-8" [ref=e429]: 网关 ID · gateway-group-8
          - generic [ref=e430]:
            - text: 创建于
            - time [ref=e431]: 2026/10/01 15:50:16
          - generic [ref=e432]:
            - generic [ref=e433]: 3 位成员
            - generic [ref=e437]: Agent 未开启
          - generic [ref=e439]: 查看群组详情
        - link "可用 游标提醒-6 网关 ID · gateway-group-7 创建于 2026/10/01 15:50:15 3 位成员 Agent 未开启 查看群组详情" [ref=e443] [cursor=pointer]:
          - /url: "#/groups/14e37418-5f1c-4fcd-af61-0c4db7b4efdc"
          - generic [ref=e444]: 可用
          - heading "游标提醒-6" [level=3] [ref=e450]
          - generic "gateway-group-7" [ref=e451]: 网关 ID · gateway-group-7
          - generic [ref=e452]:
            - text: 创建于
            - time [ref=e453]: 2026/10/01 15:50:15
          - generic [ref=e454]:
            - generic [ref=e455]: 3 位成员
            - generic [ref=e459]: Agent 未开启
          - generic [ref=e461]: 查看群组详情
        - link "可用 游标提醒-5 网关 ID · gateway-group-6 创建于 2026/10/01 15:50:14 3 位成员 Agent 未开启 查看群组详情" [ref=e465] [cursor=pointer]:
          - /url: "#/groups/1d6f1e2f-7eea-483e-930d-60c63dd917a9"
          - generic [ref=e466]: 可用
          - heading "游标提醒-5" [level=3] [ref=e472]
          - generic "gateway-group-6" [ref=e473]: 网关 ID · gateway-group-6
          - generic [ref=e474]:
            - text: 创建于
            - time [ref=e475]: 2026/10/01 15:50:14
          - generic [ref=e476]:
            - generic [ref=e477]: 3 位成员
            - generic [ref=e481]: Agent 未开启
          - generic [ref=e483]: 查看群组详情
        - link "可用 游标提醒-4 网关 ID · gateway-group-5 创建于 2026/10/01 15:50:13 3 位成员 Agent 未开启 查看群组详情" [ref=e487] [cursor=pointer]:
          - /url: "#/groups/54786b9d-365b-45dc-a9a5-f7163bccd258"
          - generic [ref=e488]: 可用
          - heading "游标提醒-4" [level=3] [ref=e494]
          - generic "gateway-group-5" [ref=e495]: 网关 ID · gateway-group-5
          - generic [ref=e496]:
            - text: 创建于
            - time [ref=e497]: 2026/10/01 15:50:13
          - generic [ref=e498]:
            - generic [ref=e499]: 3 位成员
            - generic [ref=e503]: Agent 未开启
          - generic [ref=e505]: 查看群组详情
        - link "可用 游标提醒-3 网关 ID · gateway-group-4 创建于 2026/10/01 15:50:12 3 位成员 Agent 未开启 查看群组详情" [ref=e509] [cursor=pointer]:
          - /url: "#/groups/a3e54efb-e969-4ecb-b1e8-f283b753c552"
          - generic [ref=e510]: 可用
          - heading "游标提醒-3" [level=3] [ref=e516]
          - generic "gateway-group-4" [ref=e517]: 网关 ID · gateway-group-4
          - generic [ref=e518]:
            - text: 创建于
            - time [ref=e519]: 2026/10/01 15:50:12
          - generic [ref=e520]:
            - generic [ref=e521]: 3 位成员
            - generic [ref=e525]: Agent 未开启
          - generic [ref=e527]: 查看群组详情
        - link "可用 游标提醒-2 网关 ID · gateway-group-3 创建于 2026/10/01 15:50:11 3 位成员 Agent 未开启 查看群组详情" [ref=e531] [cursor=pointer]:
          - /url: "#/groups/16d48618-1575-4c8e-bfd9-2129114ec5a1"
          - generic [ref=e532]: 可用
          - heading "游标提醒-2" [level=3] [ref=e538]
          - generic "gateway-group-3" [ref=e539]: 网关 ID · gateway-group-3
          - generic [ref=e540]:
            - text: 创建于
            - time [ref=e541]: 2026/10/01 15:50:11
          - generic [ref=e542]:
            - generic [ref=e543]: 3 位成员
            - generic [ref=e547]: Agent 未开启
          - generic [ref=e549]: 查看群组详情
        - link "可用 游标提醒-1 网关 ID · gateway-group-2 创建于 2026/10/01 15:50:10 3 位成员 Agent 未开启 查看群组详情" [ref=e553] [cursor=pointer]:
          - /url: "#/groups/ca25f6d9-841b-4e43-9e96-df13897130c0"
          - generic [ref=e554]: 可用
          - heading "游标提醒-1" [level=3] [ref=e560]
          - generic "gateway-group-2" [ref=e561]: 网关 ID · gateway-group-2
          - generic [ref=e562]:
            - text: 创建于
            - time [ref=e563]: 2026/10/01 15:50:10
          - generic [ref=e564]:
            - generic [ref=e565]: 3 位成员
            - generic [ref=e569]: Agent 未开启
          - generic [ref=e571]: 查看群组详情
        - link "可用 游标提醒-0 网关 ID · gateway-group-1 创建于 2026/10/01 15:50:09 3 位成员 Agent 未开启 查看群组详情" [ref=e575] [cursor=pointer]:
          - /url: "#/groups/553a2142-009d-435d-a230-11daa3c8f7f1"
          - generic [ref=e576]: 可用
          - heading "游标提醒-0" [level=3] [ref=e582]
          - generic "gateway-group-1" [ref=e583]: 网关 ID · gateway-group-1
          - generic [ref=e584]:
            - text: 创建于
            - time [ref=e585]: 2026/10/01 15:50:09
          - generic [ref=e586]:
            - generic [ref=e587]: 3 位成员
            - generic [ref=e591]: Agent 未开启
          - generic [ref=e593]: 查看群组详情
      - generic [ref=e597]:
        - generic [ref=e598]: Kapibala Console
        - generic [ref=e599]: 状态有记录，执行可追踪。
```

# Test source

```ts
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
  1402 |     const onCursor = (request: Request) => {
  1403 |       if (directoryRequest(request) && new URL(request.url()).searchParams.has('cursor'))
  1404 |         cursorRequests.push(request.url());
  1405 |     };
  1406 |     page.on('request', onCursor);
  1407 |     try {
  1408 |       await qa.api.require(qa.api.patch(`/api/groups/${changed!.id}`, { name: '游标提醒已变化' }));
  1409 |       await expect(element(page, qa, 'directoryStale')).toBeVisible();
  1410 |       await expect(page).not.toHaveTitle(quietTitle);
  1411 |       await page.bringToFront();
  1412 |       const confirm = element(page, qa, 'attentionConfirm');
  1413 |       if (!(await confirm.isVisible()))
> 1414 |         throw new BlockedError(
       |               ^ BlockedError: [BLOCKED] 需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期
  1415 |           '需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期',
  1416 |         );
  1417 |       await confirm.click();
  1418 |       await expect(page).toHaveTitle(quietTitle);
  1419 |       await expect(element(page, qa, 'directoryStale')).toBeVisible();
  1420 |       await remains(async () => {
  1421 |         const more = element(page, qa, 'loadMoreGroups');
  1422 |         expect((await more.count()) === 0 || (await more.isDisabled())).toBe(true);
  1423 |         expect(cursorRequests).toEqual([]);
  1424 |       });
  1425 |     } finally {
  1426 |       page.off('request', onCursor);
  1427 |       await background.close();
  1428 |       await qa.evidence('ui-directory-stale-cursor-requests', cursorRequests);
  1429 |     }
  1430 |   } finally {
  1431 |     observer.dispose();
  1432 |     await qa.evidence('ui-directory-stale-premises', observer.ledger);
  1433 |     observer.assertProtocol();
  1434 |   }
  1435 | });
  1436 | 
  1437 | test('[UI-033] 本地手动发送先带clientMsgId，回流早于响应不误标远端未读', async ({ qa, page }) => {
  1438 |   const group = await prepare(qa);
  1439 |   await login(page, qa);
  1440 |   await go(page, qa, 'group', group.id);
  1441 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  1442 |   const quietTitle = await page.title();
  1443 |   await element(page, qa, 'senderAccount').selectOption(group.creatorAccountId);
  1444 |   await element(page, qa, 'messageInput').fill('本标签手动发送');
  1445 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  1446 |     effectDelayMs: 1500,
  1447 |     barrier: { phase: 'before-response', name: 'manual-send-response' },
  1448 |   });
  1449 |   let releaseApi!: () => void;
  1450 |   const apiHeld = new Promise<void>((resolve) => (releaseApi = resolve));
  1451 |   let apiDelivered = false;
  1452 |   await page.route(`**/api/groups/${group.id}/send`, async (route) => {
  1453 |     const response = await route.fetch();
  1454 |     await apiHeld;
  1455 |     await route.fulfill({ response });
  1456 |     apiDelivered = true;
  1457 |   });
  1458 |   let background: Page | undefined;
  1459 |   try {
  1460 |     const outgoing = page.waitForRequest(
  1461 |       (request) =>
  1462 |         new URL(request.url()).pathname === `/api/groups/${group.id}/send` &&
  1463 |         request.method() === 'POST',
  1464 |     );
  1465 |     await element(page, qa, 'sendMessage').click();
  1466 |     const payload = (await outgoing).postDataJSON() as { clientMsgId?: unknown };
  1467 |     expect(typeof payload.clientMsgId).toBe('string');
  1468 |     expect(String(payload.clientMsgId).length).toBeGreaterThan(0);
  1469 |     background = await backgroundTab(page);
  1470 |     await qa.gateway.barriers.waitFor('manual-send-response');
  1471 |     await expect
  1472 |       .poll(
  1473 |         () => qa.gateway.snapshot().messages.some((message) => message.text === '本标签手动发送'),
  1474 |         { timeout: 4000 },
  1475 |       )
  1476 |       .toBe(true);
  1477 |     await qa.api.waitFor<{ items: { text: string }[] }>(
  1478 |       `/api/groups/${group.id}/messages`,
  1479 |       (value) => value.items.some((message) => message.text === '本标签手动发送'),
  1480 |     );
  1481 |     await remains(async () => {
  1482 |       expect(await page.title()).toBe(quietTitle);
  1483 |       expect(apiDelivered).toBe(false);
  1484 |     }, 2000);
  1485 |   } finally {
  1486 |     releaseApi();
  1487 |     qa.gateway.barriers.release('manual-send-response');
  1488 |     await background?.close();
  1489 |     await page.unrouteAll({ behavior: 'wait' });
  1490 |   }
  1491 | });
  1492 | 
  1493 | test('[UI-034] Agent自己的自动消息仍参与失焦提醒', async ({ qa, page }) => {
  1494 |   const group = await prepare(qa);
  1495 |   qa.agent.enqueueTurns({
  1496 |     barrier: { phase: 'request', name: 'automatic-send' },
  1497 |     body: {
  1498 |       stop_reason: 'tool_use',
  1499 |       content: [
  1500 |         {
  1501 |           type: 'tool_use',
  1502 |           id: 'attention-agent',
  1503 |           name: 'send_message',
  1504 |           input: { text: 'Agent自动提醒消息', idempotency_key: 'attention-agent' },
  1505 |         },
  1506 |       ],
  1507 |     },
  1508 |   });
  1509 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  1510 |   await login(page, qa);
  1511 |   await go(page, qa, 'group', group.id);
  1512 |   incoming(qa, group, '前台读取的触发消息');
  1513 |   await expect(page.getByText('前台读取的触发消息', { exact: true })).toBeVisible();
  1514 |   await page.getByText('前台读取的触发消息', { exact: true }).click();
```