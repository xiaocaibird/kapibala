# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-025] 同标签返回保留条件与已加载页，整页刷新清空目录内存
- Location: tests/ui/console.spec.ts:878:1

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
          - searchbox "搜索群组" [ref=e71]: cache-item
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
            - option "新到旧"
            - option "旧到新" [selected]
        - button "重置条件" [ref=e79] [cursor=pointer]
        - button "刷新列表" [ref=e80] [cursor=pointer]
        - paragraph [ref=e83]: 搜索与筛选完整群目录；关键词忽略首尾空白与英文大小写，按整段匹配。
      - generic [ref=e84]:
        - heading "匹配结果" [level=2] [ref=e85]
        - generic [ref=e86]: 已加载 20 个群 · 还有更多
      - generic [ref=e87]:
        - link "可用 cache-item-000 网关 ID · gateway-group-1 创建于 2026/10/01 14:47:08 3 位成员 Agent 未开启 查看群组详情" [ref=e88] [cursor=pointer]:
          - /url: "#/groups/81a5e07c-89f3-47bb-a96e-ae1d9aecd520"
          - generic [ref=e89]: 可用
          - heading "cache-item-000" [level=3] [ref=e95]
          - generic "gateway-group-1" [ref=e96]: 网关 ID · gateway-group-1
          - generic [ref=e97]:
            - text: 创建于
            - time [ref=e98]: 2026/10/01 14:47:08
          - generic [ref=e99]:
            - generic [ref=e100]: 3 位成员
            - generic [ref=e104]: Agent 未开启
          - generic [ref=e106]: 查看群组详情
        - link "可用 cache-item-001 网关 ID · gateway-group-2 创建于 2026/10/01 14:47:09 3 位成员 Agent 未开启 查看群组详情" [ref=e110] [cursor=pointer]:
          - /url: "#/groups/0d3aea92-9a60-46ae-826e-4037e316c3f8"
          - generic [ref=e111]: 可用
          - heading "cache-item-001" [level=3] [ref=e117]
          - generic "gateway-group-2" [ref=e118]: 网关 ID · gateway-group-2
          - generic [ref=e119]:
            - text: 创建于
            - time [ref=e120]: 2026/10/01 14:47:09
          - generic [ref=e121]:
            - generic [ref=e122]: 3 位成员
            - generic [ref=e126]: Agent 未开启
          - generic [ref=e128]: 查看群组详情
        - link "可用 cache-item-002 网关 ID · gateway-group-3 创建于 2026/10/01 14:47:10 3 位成员 Agent 未开启 查看群组详情" [ref=e132] [cursor=pointer]:
          - /url: "#/groups/1110d77c-8fc6-4452-9c97-269e1c69f788"
          - generic [ref=e133]: 可用
          - heading "cache-item-002" [level=3] [ref=e139]
          - generic "gateway-group-3" [ref=e140]: 网关 ID · gateway-group-3
          - generic [ref=e141]:
            - text: 创建于
            - time [ref=e142]: 2026/10/01 14:47:10
          - generic [ref=e143]:
            - generic [ref=e144]: 3 位成员
            - generic [ref=e148]: Agent 未开启
          - generic [ref=e150]: 查看群组详情
        - link "可用 cache-item-003 网关 ID · gateway-group-4 创建于 2026/10/01 14:47:11 3 位成员 Agent 未开启 查看群组详情" [ref=e154] [cursor=pointer]:
          - /url: "#/groups/504737a9-89e6-47e3-9e8a-ecd012bb5ad7"
          - generic [ref=e155]: 可用
          - heading "cache-item-003" [level=3] [ref=e161]
          - generic "gateway-group-4" [ref=e162]: 网关 ID · gateway-group-4
          - generic [ref=e163]:
            - text: 创建于
            - time [ref=e164]: 2026/10/01 14:47:11
          - generic [ref=e165]:
            - generic [ref=e166]: 3 位成员
            - generic [ref=e170]: Agent 未开启
          - generic [ref=e172]: 查看群组详情
        - link "可用 cache-item-004 网关 ID · gateway-group-5 创建于 2026/10/01 14:47:12 3 位成员 Agent 未开启 查看群组详情" [ref=e176] [cursor=pointer]:
          - /url: "#/groups/fc09f6e3-7136-4cc9-a741-ec788d37ecec"
          - generic [ref=e177]: 可用
          - heading "cache-item-004" [level=3] [ref=e183]
          - generic "gateway-group-5" [ref=e184]: 网关 ID · gateway-group-5
          - generic [ref=e185]:
            - text: 创建于
            - time [ref=e186]: 2026/10/01 14:47:12
          - generic [ref=e187]:
            - generic [ref=e188]: 3 位成员
            - generic [ref=e192]: Agent 未开启
          - generic [ref=e194]: 查看群组详情
        - link "可用 cache-item-005 网关 ID · gateway-group-6 创建于 2026/10/01 14:47:13 3 位成员 Agent 未开启 查看群组详情" [ref=e198] [cursor=pointer]:
          - /url: "#/groups/05b861cc-8ef2-4573-84ee-56f9fa18fcde"
          - generic [ref=e199]: 可用
          - heading "cache-item-005" [level=3] [ref=e205]
          - generic "gateway-group-6" [ref=e206]: 网关 ID · gateway-group-6
          - generic [ref=e207]:
            - text: 创建于
            - time [ref=e208]: 2026/10/01 14:47:13
          - generic [ref=e209]:
            - generic [ref=e210]: 3 位成员
            - generic [ref=e214]: Agent 未开启
          - generic [ref=e216]: 查看群组详情
        - link "可用 cache-item-006 网关 ID · gateway-group-7 创建于 2026/10/01 14:47:14 3 位成员 Agent 未开启 查看群组详情" [ref=e220] [cursor=pointer]:
          - /url: "#/groups/631eed02-9129-4ce6-8a07-63bd2f70ddc9"
          - generic [ref=e221]: 可用
          - heading "cache-item-006" [level=3] [ref=e227]
          - generic "gateway-group-7" [ref=e228]: 网关 ID · gateway-group-7
          - generic [ref=e229]:
            - text: 创建于
            - time [ref=e230]: 2026/10/01 14:47:14
          - generic [ref=e231]:
            - generic [ref=e232]: 3 位成员
            - generic [ref=e236]: Agent 未开启
          - generic [ref=e238]: 查看群组详情
        - link "可用 cache-item-007 网关 ID · gateway-group-8 创建于 2026/10/01 14:47:15 3 位成员 Agent 未开启 查看群组详情" [ref=e242] [cursor=pointer]:
          - /url: "#/groups/afc5ea8d-333e-49db-9387-e87f10ef1f7a"
          - generic [ref=e243]: 可用
          - heading "cache-item-007" [level=3] [ref=e249]
          - generic "gateway-group-8" [ref=e250]: 网关 ID · gateway-group-8
          - generic [ref=e251]:
            - text: 创建于
            - time [ref=e252]: 2026/10/01 14:47:15
          - generic [ref=e253]:
            - generic [ref=e254]: 3 位成员
            - generic [ref=e258]: Agent 未开启
          - generic [ref=e260]: 查看群组详情
        - link "可用 cache-item-008 网关 ID · gateway-group-9 创建于 2026/10/01 14:47:16 3 位成员 Agent 未开启 查看群组详情" [ref=e264] [cursor=pointer]:
          - /url: "#/groups/dc2f1d2e-441d-463e-8ca1-c1e22bb73b68"
          - generic [ref=e265]: 可用
          - heading "cache-item-008" [level=3] [ref=e271]
          - generic "gateway-group-9" [ref=e272]: 网关 ID · gateway-group-9
          - generic [ref=e273]:
            - text: 创建于
            - time [ref=e274]: 2026/10/01 14:47:16
          - generic [ref=e275]:
            - generic [ref=e276]: 3 位成员
            - generic [ref=e280]: Agent 未开启
          - generic [ref=e282]: 查看群组详情
        - link "可用 cache-item-009 网关 ID · gateway-group-10 创建于 2026/10/01 14:47:17 3 位成员 Agent 未开启 查看群组详情" [ref=e286] [cursor=pointer]:
          - /url: "#/groups/e9baab2e-5ebc-45c0-87c9-c9fcb0b8b388"
          - generic [ref=e287]: 可用
          - heading "cache-item-009" [level=3] [ref=e293]
          - generic "gateway-group-10" [ref=e294]: 网关 ID · gateway-group-10
          - generic [ref=e295]:
            - text: 创建于
            - time [ref=e296]: 2026/10/01 14:47:17
          - generic [ref=e297]:
            - generic [ref=e298]: 3 位成员
            - generic [ref=e302]: Agent 未开启
          - generic [ref=e304]: 查看群组详情
        - link "可用 cache-item-010 网关 ID · gateway-group-11 创建于 2026/10/01 14:47:18 3 位成员 Agent 未开启 查看群组详情" [ref=e308] [cursor=pointer]:
          - /url: "#/groups/cd4be868-7cfe-4fb1-983d-cd7bbb0a02ca"
          - generic [ref=e309]: 可用
          - heading "cache-item-010" [level=3] [ref=e315]
          - generic "gateway-group-11" [ref=e316]: 网关 ID · gateway-group-11
          - generic [ref=e317]:
            - text: 创建于
            - time [ref=e318]: 2026/10/01 14:47:18
          - generic [ref=e319]:
            - generic [ref=e320]: 3 位成员
            - generic [ref=e324]: Agent 未开启
          - generic [ref=e326]: 查看群组详情
        - link "可用 cache-item-011 网关 ID · gateway-group-12 创建于 2026/10/01 14:47:19 3 位成员 Agent 未开启 查看群组详情" [ref=e330] [cursor=pointer]:
          - /url: "#/groups/ddc2d76f-02a4-4312-a7dc-ed0cb392b96f"
          - generic [ref=e331]: 可用
          - heading "cache-item-011" [level=3] [ref=e337]
          - generic "gateway-group-12" [ref=e338]: 网关 ID · gateway-group-12
          - generic [ref=e339]:
            - text: 创建于
            - time [ref=e340]: 2026/10/01 14:47:19
          - generic [ref=e341]:
            - generic [ref=e342]: 3 位成员
            - generic [ref=e346]: Agent 未开启
          - generic [ref=e348]: 查看群组详情
        - link "可用 cache-item-012 网关 ID · gateway-group-13 创建于 2026/10/01 14:47:20 3 位成员 Agent 未开启 查看群组详情" [ref=e352] [cursor=pointer]:
          - /url: "#/groups/4fb5c4e8-5d1a-43c1-94bb-6a02416e84c7"
          - generic [ref=e353]: 可用
          - heading "cache-item-012" [level=3] [ref=e359]
          - generic "gateway-group-13" [ref=e360]: 网关 ID · gateway-group-13
          - generic [ref=e361]:
            - text: 创建于
            - time [ref=e362]: 2026/10/01 14:47:20
          - generic [ref=e363]:
            - generic [ref=e364]: 3 位成员
            - generic [ref=e368]: Agent 未开启
          - generic [ref=e370]: 查看群组详情
        - link "可用 cache-item-013 网关 ID · gateway-group-14 创建于 2026/10/01 14:47:21 3 位成员 Agent 未开启 查看群组详情" [ref=e374] [cursor=pointer]:
          - /url: "#/groups/27278446-8285-4716-b43b-a8153d130fc8"
          - generic [ref=e375]: 可用
          - heading "cache-item-013" [level=3] [ref=e381]
          - generic "gateway-group-14" [ref=e382]: 网关 ID · gateway-group-14
          - generic [ref=e383]:
            - text: 创建于
            - time [ref=e384]: 2026/10/01 14:47:21
          - generic [ref=e385]:
            - generic [ref=e386]: 3 位成员
            - generic [ref=e390]: Agent 未开启
          - generic [ref=e392]: 查看群组详情
        - link "可用 cache-item-014 网关 ID · gateway-group-15 创建于 2026/10/01 14:47:21 3 位成员 Agent 未开启 查看群组详情" [ref=e396] [cursor=pointer]:
          - /url: "#/groups/baf2e60c-950a-431b-993e-a8cd232c1a31"
          - generic [ref=e397]: 可用
          - heading "cache-item-014" [level=3] [ref=e403]
          - generic "gateway-group-15" [ref=e404]: 网关 ID · gateway-group-15
          - generic [ref=e405]:
            - text: 创建于
            - time [ref=e406]: 2026/10/01 14:47:21
          - generic [ref=e407]:
            - generic [ref=e408]: 3 位成员
            - generic [ref=e412]: Agent 未开启
          - generic [ref=e414]: 查看群组详情
        - link "可用 cache-item-015 网关 ID · gateway-group-16 创建于 2026/10/01 14:47:22 3 位成员 Agent 未开启 查看群组详情" [ref=e418] [cursor=pointer]:
          - /url: "#/groups/e662a650-80eb-42a8-8f4a-036bd2aaa76c"
          - generic [ref=e419]: 可用
          - heading "cache-item-015" [level=3] [ref=e425]
          - generic "gateway-group-16" [ref=e426]: 网关 ID · gateway-group-16
          - generic [ref=e427]:
            - text: 创建于
            - time [ref=e428]: 2026/10/01 14:47:22
          - generic [ref=e429]:
            - generic [ref=e430]: 3 位成员
            - generic [ref=e434]: Agent 未开启
          - generic [ref=e436]: 查看群组详情
        - link "可用 cache-item-016 网关 ID · gateway-group-17 创建于 2026/10/01 14:47:23 3 位成员 Agent 未开启 查看群组详情" [ref=e440] [cursor=pointer]:
          - /url: "#/groups/b9767cb6-3cc8-42cf-b8f9-0eaa21b22c9d"
          - generic [ref=e441]: 可用
          - heading "cache-item-016" [level=3] [ref=e447]
          - generic "gateway-group-17" [ref=e448]: 网关 ID · gateway-group-17
          - generic [ref=e449]:
            - text: 创建于
            - time [ref=e450]: 2026/10/01 14:47:23
          - generic [ref=e451]:
            - generic [ref=e452]: 3 位成员
            - generic [ref=e456]: Agent 未开启
          - generic [ref=e458]: 查看群组详情
        - link "可用 cache-item-017 网关 ID · gateway-group-18 创建于 2026/10/01 14:47:24 3 位成员 Agent 未开启 查看群组详情" [ref=e462] [cursor=pointer]:
          - /url: "#/groups/70626608-44da-4532-aaf2-52a4cce6c33a"
          - generic [ref=e463]: 可用
          - heading "cache-item-017" [level=3] [ref=e469]
          - generic "gateway-group-18" [ref=e470]: 网关 ID · gateway-group-18
          - generic [ref=e471]:
            - text: 创建于
            - time [ref=e472]: 2026/10/01 14:47:24
          - generic [ref=e473]:
            - generic [ref=e474]: 3 位成员
            - generic [ref=e478]: Agent 未开启
          - generic [ref=e480]: 查看群组详情
        - link "可用 cache-item-018 网关 ID · gateway-group-19 创建于 2026/10/01 14:47:25 3 位成员 Agent 未开启 查看群组详情" [ref=e484] [cursor=pointer]:
          - /url: "#/groups/576bf0af-d538-4fe3-b9ce-19b35bfd798b"
          - generic [ref=e485]: 可用
          - heading "cache-item-018" [level=3] [ref=e491]
          - generic "gateway-group-19" [ref=e492]: 网关 ID · gateway-group-19
          - generic [ref=e493]:
            - text: 创建于
            - time [ref=e494]: 2026/10/01 14:47:25
          - generic [ref=e495]:
            - generic [ref=e496]: 3 位成员
            - generic [ref=e500]: Agent 未开启
          - generic [ref=e502]: 查看群组详情
        - link "可用 cache-item-019 网关 ID · gateway-group-20 创建于 2026/10/01 14:47:26 3 位成员 Agent 未开启 查看群组详情" [ref=e506] [cursor=pointer]:
          - /url: "#/groups/7d25ee4c-901f-49b2-b937-65d2c154c1d9"
          - generic [ref=e507]: 可用
          - heading "cache-item-019" [level=3] [ref=e513]
          - generic "gateway-group-20" [ref=e514]: 网关 ID · gateway-group-20
          - generic [ref=e515]:
            - text: 创建于
            - time [ref=e516]: 2026/10/01 14:47:26
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
  792 |           tops.push(Math.round(r.top));
  793 |       }
  794 |     }
  795 |     return {
  796 |       visibleLines: new Set(tops).size,
  797 |       text: node.textContent,
  798 |       markup: node.querySelectorAll('b,img,script,svg').length,
  799 |     };
  800 |   });
  801 |   expect(layout.visibleLines).toBeGreaterThan(0);
  802 |   expect(layout.visibleLines).toBeLessThanOrEqual(2);
  803 |   expect(layout.markup).toBe(0);
  804 |   await expect(child(card(page, qa, '没有简介的群'), qa, 'directorySummary')).toBeHidden();
  805 |   await child(card(page, qa, '两行摘要专用群'), qa, 'directoryLink').click();
  806 |   await expect(element(page, qa, 'groupDescriptionView')).toHaveText(description);
  807 |   await expect(element(page, qa, 'groupDescriptionView').locator('b,img,script,svg')).toHaveCount(
  808 |     0,
  809 |   );
  810 |   await qa.evidence('ui-summary-layout', layout);
  811 | });
  812 | 
  813 | test('[UI-024] 单页五秒刷新、并发失效合并且无关消息不遍历目录', async ({ qa, page }) => {
  814 |   const group = await prepare(qa);
  815 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '轮询起点' }));
  816 |   await login(page, qa);
  817 |   const requests: { at: number; url: string }[] = [];
  818 |   page.on('request', (request) => {
  819 |     if (directoryRequest(request)) requests.push({ at: performance.now(), url: request.url() });
  820 |   });
  821 |   await go(page, qa, 'groups');
  822 |   await expect(card(page, qa, '轮询起点')).toHaveCount(1);
  823 |   const search = element(page, qa, 'search');
  824 |   await search.focus();
  825 |   const baseline = requests.length;
  826 |   const start = performance.now();
  827 |   await expect.poll(() => requests.length, { timeout: 6000 }).toBeGreaterThan(baseline);
  828 |   expect(requests[baseline]!.at - start).toBeLessThanOrEqual(5000);
  829 |   await expect(search).toBeFocused();
  830 |   const unrelated = requests.length;
  831 |   incoming(qa, group, '消息不改变目录摘要');
  832 |   await remains(async () => expect(requests.length).toBe(unrelated), 1000);
  833 |   let release!: () => void;
  834 |   const hold = new Promise<void>((resolve) => (release = resolve));
  835 |   let active = 0;
  836 |   let maxActive = 0;
  837 |   let intercepted = 0;
  838 |   await page.route('**/api/group-directory**', async (route) => {
  839 |     active++;
  840 |     maxActive = Math.max(maxActive, active);
  841 |     intercepted++;
  842 |     try {
  843 |       const response = await route.fetch();
  844 |       await hold;
  845 |       await route.fulfill({ response });
  846 |     } finally {
  847 |       active--;
  848 |     }
  849 |   });
  850 |   try {
  851 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '轮询变更一' }));
  852 |     await expect.poll(() => intercepted).toBe(1);
  853 |     await Promise.all(
  854 |       ['轮询变更二', '轮询最终值'].map((name) =>
  855 |         qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name })),
  856 |       ),
  857 |     );
  858 |     await remains(async () => expect(intercepted).toBe(1), 500);
  859 |     release();
  860 |     const actual = await qa.api.require(
  861 |       qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`),
  862 |     );
  863 |     await expect(card(page, qa, actual.name)).toHaveCount(1);
  864 |     expect(maxActive).toBe(1);
  865 |     expect(intercepted).toBeLessThanOrEqual(2);
  866 |     for (const request of requests) {
  867 |       const query = new URL(request.url).searchParams;
  868 |       expect(query.get('cursor')).toBeNull();
  869 |       expect(Number(query.get('pageSize') ?? 20)).toBeLessThanOrEqual(50);
  870 |     }
  871 |   } finally {
  872 |     release();
  873 |     await page.unrouteAll({ behavior: 'wait' });
  874 |     await qa.evidence('ui-directory-bounded-requests', requests);
  875 |   }
  876 | });
  877 | 
  878 | test('[UI-025] 同标签返回保留条件与已加载页，整页刷新清空目录内存', async ({ qa, page }) => {
  879 |   await qa.api.login();
  880 |   for (let i = 0; i < 23; i++) {
  881 |     const { group } = await qa.api.createGroup();
  882 |     await qa.api.require(
  883 |       qa.api.patch(`/api/groups/${group.id}`, { name: `cache-item-${String(i).padStart(3, '0')}` }),
  884 |     );
  885 |   }
  886 |   await login(page, qa);
  887 |   await go(page, qa, 'groups');
  888 |   await element(page, qa, 'search').fill('cache-item');
  889 |   await element(page, qa, 'order').selectOption('asc');
  890 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  891 |   await element(page, qa, 'loadMoreGroups').click();
> 892 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
      |                                                    ^ Error: expect(locator).toHaveCount(expected) failed
  893 |   const selected = card(page, qa, 'cache-item-022');
  894 |   await selected.scrollIntoViewIfNeeded();
  895 |   await child(selected, qa, 'directoryLink').click();
  896 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  897 |   await page.goBack({ waitUntil: 'domcontentloaded' });
  898 |   await expect(element(page, qa, 'search')).toHaveValue('cache-item');
  899 |   await expect(element(page, qa, 'order')).toHaveValue('asc');
  900 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  901 |   await expect(card(page, qa, 'cache-item-022')).toBeInViewport();
  902 |   await expect(element(page, qa, 'directoryLoadedCount')).toContainText('23');
  903 |   await page.reload({ waitUntil: 'domcontentloaded' });
  904 |   await expect(element(page, qa, 'search')).toHaveValue('');
  905 |   await expect(element(page, qa, 'order')).toHaveValue('desc');
  906 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  907 | });
  908 | 
  909 | test('[UI-026] 注销后更换身份不复用上一会话目录条件', async ({ qa, page }) => {
  910 |   const group = await prepare(qa);
  911 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '仅上一会话条件' }));
  912 |   await login(page, qa);
  913 |   await go(page, qa, 'groups');
  914 |   await element(page, qa, 'search').fill('仅上一会话');
  915 |   await element(page, qa, 'order').selectOption('asc');
  916 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  917 |   const loggedOut = page.waitForResponse(
  918 |     (response) =>
  919 |       new URL(response.url()).pathname === '/api/auth/logout' &&
  920 |       response.request().method() === 'POST',
  921 |   );
  922 |   await element(page, qa, 'logout').click();
  923 |   expect((await loggedOut).ok()).toBe(true);
  924 |   await login(page, qa, 'viewer');
  925 |   await go(page, qa, 'groups');
  926 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  927 |   await expect(element(page, qa, 'search')).toHaveValue('');
  928 |   await expect(element(page, qa, 'order')).toHaveValue('desc');
  929 |   await remains(async () => {
  930 |     expect(await element(page, qa, 'search').inputValue()).toBe('');
  931 |     expect(await page.getByRole('button', { name: '创建群', exact: true }).count()).toBe(0);
  932 |   });
  933 | });
  934 | 
  935 | test('[UI-027] composition期间不查询中间文本，确认后只查完成词且不抢焦点', async ({ qa, page }) => {
  936 |   const group = await prepare(qa);
  937 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '卡比验收群' }));
  938 |   await login(page, qa);
  939 |   await go(page, qa, 'groups');
  940 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  941 |   const requests: { q: string; at: number }[] = [];
  942 |   page.on('request', (request) => {
  943 |     if (directoryRequest(request))
  944 |       requests.push({
  945 |         q: new URL(request.url()).searchParams.get('q') ?? '',
  946 |         at: performance.now(),
  947 |       });
  948 |   });
  949 |   const search = element(page, qa, 'search');
  950 |   await search.focus();
  951 |   await search.evaluate((node) => {
  952 |     node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  953 |   });
  954 |   for (const value of ['k', 'ka', '卡'])
  955 |     await search.evaluate((node, text) => {
  956 |       const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  957 |       if (!setter) throw new Error('Input adapter is not an HTML input');
  958 |       setter.call(node, text);
  959 |       node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: text }));
  960 |       node.dispatchEvent(
  961 |         new InputEvent('input', {
  962 |           bubbles: true,
  963 |           inputType: 'insertCompositionText',
  964 |           data: text,
  965 |           isComposing: true,
  966 |         }),
  967 |       );
  968 |     }, value);
  969 |   await remains(
  970 |     async () =>
  971 |       expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0),
  972 |     1000,
  973 |   );
  974 |   const committedAt = performance.now();
  975 |   await search.evaluate((node) => {
  976 |     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '卡比');
  977 |     node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '卡比' }));
  978 |     node.dispatchEvent(
  979 |       new InputEvent('input', {
  980 |         bubbles: true,
  981 |         inputType: 'insertText',
  982 |         data: '卡比',
  983 |         isComposing: false,
  984 |       }),
  985 |     );
  986 |   });
  987 |   await expect.poll(() => requests.filter((request) => request.q === '卡比').length).toBe(1);
  988 |   await expect(card(page, qa, '卡比验收群')).toHaveCount(1);
  989 |   await expect(search).toBeFocused();
  990 |   expect(requests.find((request) => request.q === '卡比')!.at).toBeGreaterThan(committedAt);
  991 |   expect(requests.filter((request) => ['k', 'ka', '卡'].includes(request.q))).toHaveLength(0);
  992 |   await qa.evidence('ui-synthetic-composition', {
```