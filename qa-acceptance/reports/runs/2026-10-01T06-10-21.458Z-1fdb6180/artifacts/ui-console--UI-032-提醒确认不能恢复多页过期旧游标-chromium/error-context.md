# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-032] 提醒确认不能恢复多页过期旧游标
- Location: tests/ui/console.spec.ts:1142:1

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
        - generic [ref=e85]:
          - strong [ref=e86]: 列表有更新，刷新后继续加载。
          - generic [ref=e87]: 当前保留已加载结果；刷新成功后从第一页重新浏览。
        - button "刷新" [ref=e88] [cursor=pointer]
      - generic [ref=e89]:
        - heading "所有群组" [level=2] [ref=e90]
        - generic [ref=e91]: 已加载 23 个群 · 列表待刷新
      - generic [ref=e92]:
        - link "可用 游标提醒-22 网关 ID · gateway-group-23 创建于 2026/10/01 14:48:28 3 位成员 Agent 未开启 查看群组详情" [ref=e93] [cursor=pointer]:
          - /url: "#/groups/fdb4f264-f5f8-48fe-83ac-fe0c7367cc16"
          - generic [ref=e94]: 可用
          - heading "游标提醒-22" [level=3] [ref=e100]
          - generic "gateway-group-23" [ref=e101]: 网关 ID · gateway-group-23
          - generic [ref=e102]:
            - text: 创建于
            - time [ref=e103]: 2026/10/01 14:48:28
          - generic [ref=e104]:
            - generic [ref=e105]: 3 位成员
            - generic [ref=e109]: Agent 未开启
          - generic [ref=e111]: 查看群组详情
        - link "可用 游标提醒-21 网关 ID · gateway-group-22 创建于 2026/10/01 14:48:27 3 位成员 Agent 未开启 查看群组详情" [ref=e115] [cursor=pointer]:
          - /url: "#/groups/51b822d7-becf-4dfe-97a6-086f45a040a4"
          - generic [ref=e116]: 可用
          - heading "游标提醒-21" [level=3] [ref=e122]
          - generic "gateway-group-22" [ref=e123]: 网关 ID · gateway-group-22
          - generic [ref=e124]:
            - text: 创建于
            - time [ref=e125]: 2026/10/01 14:48:27
          - generic [ref=e126]:
            - generic [ref=e127]: 3 位成员
            - generic [ref=e131]: Agent 未开启
          - generic [ref=e133]: 查看群组详情
        - link "可用 游标提醒-20 网关 ID · gateway-group-21 创建于 2026/10/01 14:48:26 3 位成员 Agent 未开启 查看群组详情" [ref=e137] [cursor=pointer]:
          - /url: "#/groups/eca1d4f8-ebd6-4b27-b97d-f4382bfeee6c"
          - generic [ref=e138]: 可用
          - heading "游标提醒-20" [level=3] [ref=e144]
          - generic "gateway-group-21" [ref=e145]: 网关 ID · gateway-group-21
          - generic [ref=e146]:
            - text: 创建于
            - time [ref=e147]: 2026/10/01 14:48:26
          - generic [ref=e148]:
            - generic [ref=e149]: 3 位成员
            - generic [ref=e153]: Agent 未开启
          - generic [ref=e155]: 查看群组详情
        - link "可用 游标提醒-19 网关 ID · gateway-group-20 创建于 2026/10/01 14:48:25 3 位成员 Agent 未开启 查看群组详情" [ref=e159] [cursor=pointer]:
          - /url: "#/groups/fd825573-26ec-4aa6-a0d6-a4582d8a63ce"
          - generic [ref=e160]: 可用
          - heading "游标提醒-19" [level=3] [ref=e166]
          - generic "gateway-group-20" [ref=e167]: 网关 ID · gateway-group-20
          - generic [ref=e168]:
            - text: 创建于
            - time [ref=e169]: 2026/10/01 14:48:25
          - generic [ref=e170]:
            - generic [ref=e171]: 3 位成员
            - generic [ref=e175]: Agent 未开启
          - generic [ref=e177]: 查看群组详情
        - link "可用 游标提醒-18 网关 ID · gateway-group-19 创建于 2026/10/01 14:48:24 3 位成员 Agent 未开启 查看群组详情" [ref=e181] [cursor=pointer]:
          - /url: "#/groups/4c27cc46-39ee-4a70-9b78-713bf24f303a"
          - generic [ref=e182]: 可用
          - heading "游标提醒-18" [level=3] [ref=e188]
          - generic "gateway-group-19" [ref=e189]: 网关 ID · gateway-group-19
          - generic [ref=e190]:
            - text: 创建于
            - time [ref=e191]: 2026/10/01 14:48:24
          - generic [ref=e192]:
            - generic [ref=e193]: 3 位成员
            - generic [ref=e197]: Agent 未开启
          - generic [ref=e199]: 查看群组详情
        - link "可用 游标提醒-17 网关 ID · gateway-group-18 创建于 2026/10/01 14:48:23 3 位成员 Agent 未开启 查看群组详情" [ref=e203] [cursor=pointer]:
          - /url: "#/groups/f369b15d-f431-43dc-82e0-5d243be87158"
          - generic [ref=e204]: 可用
          - heading "游标提醒-17" [level=3] [ref=e210]
          - generic "gateway-group-18" [ref=e211]: 网关 ID · gateway-group-18
          - generic [ref=e212]:
            - text: 创建于
            - time [ref=e213]: 2026/10/01 14:48:23
          - generic [ref=e214]:
            - generic [ref=e215]: 3 位成员
            - generic [ref=e219]: Agent 未开启
          - generic [ref=e221]: 查看群组详情
        - link "可用 游标提醒-16 网关 ID · gateway-group-17 创建于 2026/10/01 14:48:22 3 位成员 Agent 未开启 查看群组详情" [ref=e225] [cursor=pointer]:
          - /url: "#/groups/f1bbf67a-11e8-4f7e-bd96-f82f87366c6d"
          - generic [ref=e226]: 可用
          - heading "游标提醒-16" [level=3] [ref=e232]
          - generic "gateway-group-17" [ref=e233]: 网关 ID · gateway-group-17
          - generic [ref=e234]:
            - text: 创建于
            - time [ref=e235]: 2026/10/01 14:48:22
          - generic [ref=e236]:
            - generic [ref=e237]: 3 位成员
            - generic [ref=e241]: Agent 未开启
          - generic [ref=e243]: 查看群组详情
        - link "可用 游标提醒-15 网关 ID · gateway-group-16 创建于 2026/10/01 14:48:21 3 位成员 Agent 未开启 查看群组详情" [ref=e247] [cursor=pointer]:
          - /url: "#/groups/dff030b7-9436-4e6f-8621-013f7718df0b"
          - generic [ref=e248]: 可用
          - heading "游标提醒-15" [level=3] [ref=e254]
          - generic "gateway-group-16" [ref=e255]: 网关 ID · gateway-group-16
          - generic [ref=e256]:
            - text: 创建于
            - time [ref=e257]: 2026/10/01 14:48:21
          - generic [ref=e258]:
            - generic [ref=e259]: 3 位成员
            - generic [ref=e263]: Agent 未开启
          - generic [ref=e265]: 查看群组详情
        - link "可用 游标提醒-14 网关 ID · gateway-group-15 创建于 2026/10/01 14:48:20 3 位成员 Agent 未开启 查看群组详情" [ref=e269] [cursor=pointer]:
          - /url: "#/groups/e3d13025-2938-4a0f-a652-206a3538e9ec"
          - generic [ref=e270]: 可用
          - heading "游标提醒-14" [level=3] [ref=e276]
          - generic "gateway-group-15" [ref=e277]: 网关 ID · gateway-group-15
          - generic [ref=e278]:
            - text: 创建于
            - time [ref=e279]: 2026/10/01 14:48:20
          - generic [ref=e280]:
            - generic [ref=e281]: 3 位成员
            - generic [ref=e285]: Agent 未开启
          - generic [ref=e287]: 查看群组详情
        - link "可用 游标提醒-13 网关 ID · gateway-group-14 创建于 2026/10/01 14:48:19 3 位成员 Agent 未开启 查看群组详情" [ref=e291] [cursor=pointer]:
          - /url: "#/groups/e8129467-cb24-47ff-a63e-4cc0ceabf6b9"
          - generic [ref=e292]: 可用
          - heading "游标提醒-13" [level=3] [ref=e298]
          - generic "gateway-group-14" [ref=e299]: 网关 ID · gateway-group-14
          - generic [ref=e300]:
            - text: 创建于
            - time [ref=e301]: 2026/10/01 14:48:19
          - generic [ref=e302]:
            - generic [ref=e303]: 3 位成员
            - generic [ref=e307]: Agent 未开启
          - generic [ref=e309]: 查看群组详情
        - link "可用 游标提醒-12 网关 ID · gateway-group-13 创建于 2026/10/01 14:48:18 3 位成员 Agent 未开启 查看群组详情" [ref=e313] [cursor=pointer]:
          - /url: "#/groups/41698b5c-5e40-4287-aa79-c5dfda7151ab"
          - generic [ref=e314]: 可用
          - heading "游标提醒-12" [level=3] [ref=e320]
          - generic "gateway-group-13" [ref=e321]: 网关 ID · gateway-group-13
          - generic [ref=e322]:
            - text: 创建于
            - time [ref=e323]: 2026/10/01 14:48:18
          - generic [ref=e324]:
            - generic [ref=e325]: 3 位成员
            - generic [ref=e329]: Agent 未开启
          - generic [ref=e331]: 查看群组详情
        - link "可用 游标提醒-11 网关 ID · gateway-group-12 创建于 2026/10/01 14:48:17 3 位成员 Agent 未开启 查看群组详情" [ref=e335] [cursor=pointer]:
          - /url: "#/groups/b728d155-e88f-4c1b-abf4-c8b17a95757a"
          - generic [ref=e336]: 可用
          - heading "游标提醒-11" [level=3] [ref=e342]
          - generic "gateway-group-12" [ref=e343]: 网关 ID · gateway-group-12
          - generic [ref=e344]:
            - text: 创建于
            - time [ref=e345]: 2026/10/01 14:48:17
          - generic [ref=e346]:
            - generic [ref=e347]: 3 位成员
            - generic [ref=e351]: Agent 未开启
          - generic [ref=e353]: 查看群组详情
        - link "可用 游标提醒-10 网关 ID · gateway-group-11 创建于 2026/10/01 14:48:17 3 位成员 Agent 未开启 查看群组详情" [ref=e357] [cursor=pointer]:
          - /url: "#/groups/55833be1-9439-44f2-aa2d-73037c14a42f"
          - generic [ref=e358]: 可用
          - heading "游标提醒-10" [level=3] [ref=e364]
          - generic "gateway-group-11" [ref=e365]: 网关 ID · gateway-group-11
          - generic [ref=e366]:
            - text: 创建于
            - time [ref=e367]: 2026/10/01 14:48:17
          - generic [ref=e368]:
            - generic [ref=e369]: 3 位成员
            - generic [ref=e373]: Agent 未开启
          - generic [ref=e375]: 查看群组详情
        - link "可用 游标提醒-9 网关 ID · gateway-group-10 创建于 2026/10/01 14:48:16 3 位成员 Agent 未开启 查看群组详情" [ref=e379] [cursor=pointer]:
          - /url: "#/groups/524d2ae0-8898-4d4d-921b-d159e42ed6d7"
          - generic [ref=e380]: 可用
          - heading "游标提醒-9" [level=3] [ref=e386]
          - generic "gateway-group-10" [ref=e387]: 网关 ID · gateway-group-10
          - generic [ref=e388]:
            - text: 创建于
            - time [ref=e389]: 2026/10/01 14:48:16
          - generic [ref=e390]:
            - generic [ref=e391]: 3 位成员
            - generic [ref=e395]: Agent 未开启
          - generic [ref=e397]: 查看群组详情
        - link "可用 游标提醒-8 网关 ID · gateway-group-9 创建于 2026/10/01 14:48:15 3 位成员 Agent 未开启 查看群组详情" [ref=e401] [cursor=pointer]:
          - /url: "#/groups/4a872df3-a889-4ed2-91ab-e0cff3efe105"
          - generic [ref=e402]: 可用
          - heading "游标提醒-8" [level=3] [ref=e408]
          - generic "gateway-group-9" [ref=e409]: 网关 ID · gateway-group-9
          - generic [ref=e410]:
            - text: 创建于
            - time [ref=e411]: 2026/10/01 14:48:15
          - generic [ref=e412]:
            - generic [ref=e413]: 3 位成员
            - generic [ref=e417]: Agent 未开启
          - generic [ref=e419]: 查看群组详情
        - link "可用 游标提醒-7 网关 ID · gateway-group-8 创建于 2026/10/01 14:48:14 3 位成员 Agent 未开启 查看群组详情" [ref=e423] [cursor=pointer]:
          - /url: "#/groups/2865f49b-48ee-4e93-b621-dc070bb36dd4"
          - generic [ref=e424]: 可用
          - heading "游标提醒-7" [level=3] [ref=e430]
          - generic "gateway-group-8" [ref=e431]: 网关 ID · gateway-group-8
          - generic [ref=e432]:
            - text: 创建于
            - time [ref=e433]: 2026/10/01 14:48:14
          - generic [ref=e434]:
            - generic [ref=e435]: 3 位成员
            - generic [ref=e439]: Agent 未开启
          - generic [ref=e441]: 查看群组详情
        - link "可用 游标提醒-6 网关 ID · gateway-group-7 创建于 2026/10/01 14:48:13 3 位成员 Agent 未开启 查看群组详情" [ref=e445] [cursor=pointer]:
          - /url: "#/groups/a1eb09d6-1ef4-4ba3-aa7d-24b83d0afdb4"
          - generic [ref=e446]: 可用
          - heading "游标提醒-6" [level=3] [ref=e452]
          - generic "gateway-group-7" [ref=e453]: 网关 ID · gateway-group-7
          - generic [ref=e454]:
            - text: 创建于
            - time [ref=e455]: 2026/10/01 14:48:13
          - generic [ref=e456]:
            - generic [ref=e457]: 3 位成员
            - generic [ref=e461]: Agent 未开启
          - generic [ref=e463]: 查看群组详情
        - link "可用 游标提醒-5 网关 ID · gateway-group-6 创建于 2026/10/01 14:48:12 3 位成员 Agent 未开启 查看群组详情" [ref=e467] [cursor=pointer]:
          - /url: "#/groups/b10324f1-2729-4a3f-827d-9e459355dc6f"
          - generic [ref=e468]: 可用
          - heading "游标提醒-5" [level=3] [ref=e474]
          - generic "gateway-group-6" [ref=e475]: 网关 ID · gateway-group-6
          - generic [ref=e476]:
            - text: 创建于
            - time [ref=e477]: 2026/10/01 14:48:12
          - generic [ref=e478]:
            - generic [ref=e479]: 3 位成员
            - generic [ref=e483]: Agent 未开启
          - generic [ref=e485]: 查看群组详情
        - link "可用 游标提醒-4 网关 ID · gateway-group-5 创建于 2026/10/01 14:48:11 3 位成员 Agent 未开启 查看群组详情" [ref=e489] [cursor=pointer]:
          - /url: "#/groups/bda3e2d8-4b13-4d00-9720-ad7077cc6c1d"
          - generic [ref=e490]: 可用
          - heading "游标提醒-4" [level=3] [ref=e496]
          - generic "gateway-group-5" [ref=e497]: 网关 ID · gateway-group-5
          - generic [ref=e498]:
            - text: 创建于
            - time [ref=e499]: 2026/10/01 14:48:11
          - generic [ref=e500]:
            - generic [ref=e501]: 3 位成员
            - generic [ref=e505]: Agent 未开启
          - generic [ref=e507]: 查看群组详情
        - link "可用 游标提醒-3 网关 ID · gateway-group-4 创建于 2026/10/01 14:48:10 3 位成员 Agent 未开启 查看群组详情" [ref=e511] [cursor=pointer]:
          - /url: "#/groups/48537fa8-c231-4cd0-9920-b1eeb43bef29"
          - generic [ref=e512]: 可用
          - heading "游标提醒-3" [level=3] [ref=e518]
          - generic "gateway-group-4" [ref=e519]: 网关 ID · gateway-group-4
          - generic [ref=e520]:
            - text: 创建于
            - time [ref=e521]: 2026/10/01 14:48:10
          - generic [ref=e522]:
            - generic [ref=e523]: 3 位成员
            - generic [ref=e527]: Agent 未开启
          - generic [ref=e529]: 查看群组详情
        - link "可用 游标提醒-2 网关 ID · gateway-group-3 创建于 2026/10/01 14:48:09 3 位成员 Agent 未开启 查看群组详情" [ref=e533] [cursor=pointer]:
          - /url: "#/groups/08780a19-db3b-42db-996e-8a710c1ab655"
          - generic [ref=e534]: 可用
          - heading "游标提醒-2" [level=3] [ref=e540]
          - generic "gateway-group-3" [ref=e541]: 网关 ID · gateway-group-3
          - generic [ref=e542]:
            - text: 创建于
            - time [ref=e543]: 2026/10/01 14:48:09
          - generic [ref=e544]:
            - generic [ref=e545]: 3 位成员
            - generic [ref=e549]: Agent 未开启
          - generic [ref=e551]: 查看群组详情
        - link "可用 游标提醒-1 网关 ID · gateway-group-2 创建于 2026/10/01 14:48:08 3 位成员 Agent 未开启 查看群组详情" [ref=e555] [cursor=pointer]:
          - /url: "#/groups/6e3ceccb-0293-4117-b474-e1dc05a7e1fb"
          - generic [ref=e556]: 可用
          - heading "游标提醒-1" [level=3] [ref=e562]
          - generic "gateway-group-2" [ref=e563]: 网关 ID · gateway-group-2
          - generic [ref=e564]:
            - text: 创建于
            - time [ref=e565]: 2026/10/01 14:48:08
          - generic [ref=e566]:
            - generic [ref=e567]: 3 位成员
            - generic [ref=e571]: Agent 未开启
          - generic [ref=e573]: 查看群组详情
        - link "可用 游标提醒-0 网关 ID · gateway-group-1 创建于 2026/10/01 14:48:07 3 位成员 Agent 未开启 查看群组详情" [ref=e577] [cursor=pointer]:
          - /url: "#/groups/b55cc965-0928-4f37-bbf9-9372f48d7e43"
          - generic [ref=e578]: 可用
          - heading "游标提醒-0" [level=3] [ref=e584]
          - generic "gateway-group-1" [ref=e585]: 网关 ID · gateway-group-1
          - generic [ref=e586]:
            - text: 创建于
            - time [ref=e587]: 2026/10/01 14:48:07
          - generic [ref=e588]:
            - generic [ref=e589]: 3 位成员
            - generic [ref=e593]: Agent 未开启
          - generic [ref=e595]: 查看群组详情
      - generic [ref=e599]:
        - generic [ref=e600]: Kapibala Console
        - generic [ref=e601]: 状态有记录，执行可追踪。
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