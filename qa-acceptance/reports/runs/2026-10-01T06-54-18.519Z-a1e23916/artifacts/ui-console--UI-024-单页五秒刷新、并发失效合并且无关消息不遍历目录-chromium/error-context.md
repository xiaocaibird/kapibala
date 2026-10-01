# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-024] 单页五秒刷新、并发失效合并且无关消息不遍历目录
- Location: tests/ui/console.spec.ts:819:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 2
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
          - searchbox "搜索群组" [active] [ref=e71]
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
        - generic [ref=e86]: 已加载 1 个群 · 已全部加载
      - link "可用 轮询起点 网关 ID · gateway-group-1 创建于 2026/10/01 15:29:24 3 位成员 Agent 未开启 查看群组详情" [ref=e88] [cursor=pointer]:
        - /url: "#/groups/ab0db951-2ebc-40ec-be3c-1502613ec530"
        - generic [ref=e89]: 可用
        - heading "轮询起点" [level=3] [ref=e95]
        - generic "gateway-group-1" [ref=e96]: 网关 ID · gateway-group-1
        - generic [ref=e97]:
          - text: 创建于
          - time [ref=e98]: 2026/10/01 15:29:24
        - generic [ref=e99]:
          - generic [ref=e100]: 3 位成员
          - generic [ref=e104]: Agent 未开启
        - generic [ref=e106]: 查看群组详情
      - generic [ref=e110]:
        - generic [ref=e111]: Kapibala Console
        - generic [ref=e112]: 状态有记录，执行可追踪。
```

# Test source

```ts
  738 |   } finally {
  739 |     await background.close();
  740 |   }
  741 | });
  742 | test('[UI-022] 创建群表单同样执行未保存关闭保护', async ({ qa, page }) => {
  743 |   await qa.api.login();
  744 |   await qa.api.connectAll();
  745 |   await login(page, qa);
  746 |   await go(page, qa, 'groups');
  747 |   await element(page, qa, 'createGroup').click();
  748 |   await element(page, qa, 'groupName').fill('创建草稿');
  749 |   await element(page, qa, 'closeCreateGroup').click();
  750 |   await element(page, qa, 'continueEditing').click();
  751 |   await expect(element(page, qa, 'groupName')).toHaveValue('创建草稿');
  752 |   await element(page, qa, 'closeCreateGroup').click();
  753 |   await element(page, qa, 'discardChanges').click();
  754 |   expect(await qa.api.require(qa.api.get<Group[]>('/api/groups'))).toEqual([]);
  755 | });
  756 | 
  757 | test('[UI-023] 简介摘要最多两行纯文本、详情完整且空简介无占位', async ({ qa, page }) => {
  758 |   const group = await prepare(qa);
  759 |   const { group: empty } = await qa.api.createGroup();
  760 |   const description = '纯文本摘要 '.repeat(35) + '<b>不得解释HTML</b> 最后一句';
  761 |   await qa.api.require(
  762 |     qa.api.patch(`/api/groups/${group.id}`, { name: '两行摘要专用群', description }),
  763 |   );
  764 |   await qa.api.require(qa.api.patch(`/api/groups/${empty.id}`, { name: '没有简介的群' }));
  765 |   await login(page, qa);
  766 |   await go(page, qa, 'groups');
  767 |   const summary = child(card(page, qa, '两行摘要专用群'), qa, 'directorySummary');
  768 |   await expect(summary).toBeVisible();
  769 |   const layout = await summary.evaluate((node) => {
  770 |     let clip = node.getBoundingClientRect();
  771 |     for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
  772 |       const style = getComputedStyle(ancestor);
  773 |       if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) {
  774 |         const r = ancestor.getBoundingClientRect();
  775 |         clip = {
  776 |           ...clip,
  777 |           top: Math.max(clip.top, r.top),
  778 |           bottom: Math.min(clip.bottom, r.bottom),
  779 |           left: Math.max(clip.left, r.left),
  780 |           right: Math.min(clip.right, r.right),
  781 |         } as DOMRect;
  782 |       }
  783 |     }
  784 |     const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  785 |     const tops: number[] = [];
  786 |     while (walker.nextNode()) {
  787 |       const range = document.createRange();
  788 |       range.selectNodeContents(walker.currentNode);
  789 |       for (const r of range.getClientRects()) {
  790 |         if (
  791 |           r.height > 0 &&
  792 |           r.width > 0 &&
  793 |           r.top < clip.bottom - 1 &&
  794 |           r.bottom > clip.top + 1 &&
  795 |           r.left < clip.right &&
  796 |           r.right > clip.left
  797 |         )
  798 |           tops.push(Math.round(r.top));
  799 |       }
  800 |     }
  801 |     return {
  802 |       visibleLines: new Set(tops).size,
  803 |       text: node.textContent,
  804 |       markup: node.querySelectorAll('b,img,script,svg').length,
  805 |     };
  806 |   });
  807 |   expect(layout.visibleLines).toBeGreaterThan(0);
  808 |   expect(layout.visibleLines).toBeLessThanOrEqual(2);
  809 |   expect(layout.markup).toBe(0);
  810 |   await expect(child(card(page, qa, '没有简介的群'), qa, 'directorySummary')).toBeHidden();
  811 |   await child(card(page, qa, '两行摘要专用群'), qa, 'directoryLink').click();
  812 |   await expect(element(page, qa, 'groupDescriptionView')).toHaveText(description);
  813 |   await expect(element(page, qa, 'groupDescriptionView').locator('b,img,script,svg')).toHaveCount(
  814 |     0,
  815 |   );
  816 |   await qa.evidence('ui-summary-layout', layout);
  817 | });
  818 | 
  819 | test('[UI-024] 单页五秒刷新、并发失效合并且无关消息不遍历目录', async ({ qa, page }) => {
  820 |   const group = await prepare(qa);
  821 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '轮询起点' }));
  822 |   await login(page, qa);
  823 |   const requests: { at: number; url: string }[] = [];
  824 |   page.on('request', (request) => {
  825 |     if (directoryRequest(request)) requests.push({ at: performance.now(), url: request.url() });
  826 |   });
  827 |   await go(page, qa, 'groups');
  828 |   await expect(card(page, qa, '轮询起点')).toHaveCount(1);
  829 |   const search = element(page, qa, 'search');
  830 |   await search.focus();
  831 |   const baseline = requests.length;
  832 |   const start = performance.now();
  833 |   await expect.poll(() => requests.length, { timeout: 6000 }).toBeGreaterThan(baseline);
  834 |   expect(requests[baseline]!.at - start).toBeLessThanOrEqual(5000);
  835 |   await expect(search).toBeFocused();
  836 |   const unrelated = requests.length;
  837 |   incoming(qa, group, '消息不改变目录摘要');
> 838 |   await remains(async () => expect(requests.length).toBe(unrelated), 1000);
      |                                                     ^ Error: expect(received).toBe(expected) // Object.is equality
  839 |   let release!: () => void;
  840 |   const hold = new Promise<void>((resolve) => (release = resolve));
  841 |   let active = 0;
  842 |   let maxActive = 0;
  843 |   let intercepted = 0;
  844 |   await page.route('**/api/group-directory**', async (route) => {
  845 |     active++;
  846 |     maxActive = Math.max(maxActive, active);
  847 |     intercepted++;
  848 |     try {
  849 |       const response = await route.fetch();
  850 |       await hold;
  851 |       await route.fulfill({ response });
  852 |     } finally {
  853 |       active--;
  854 |     }
  855 |   });
  856 |   try {
  857 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '轮询变更一' }));
  858 |     await expect.poll(() => intercepted).toBe(1);
  859 |     await Promise.all(
  860 |       ['轮询变更二', '轮询最终值'].map((name) =>
  861 |         qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name })),
  862 |       ),
  863 |     );
  864 |     await remains(async () => expect(intercepted).toBe(1), 500);
  865 |     release();
  866 |     const actual = await qa.api.require(
  867 |       qa.api.get<Group & { name: string }>(`/api/groups/${group.id}`),
  868 |     );
  869 |     await expect(card(page, qa, actual.name)).toHaveCount(1);
  870 |     expect(maxActive).toBe(1);
  871 |     expect(intercepted).toBeLessThanOrEqual(2);
  872 |     for (const request of requests) {
  873 |       const query = new URL(request.url).searchParams;
  874 |       expect(query.get('cursor')).toBeNull();
  875 |       expect(Number(query.get('pageSize') ?? 20)).toBeLessThanOrEqual(50);
  876 |     }
  877 |   } finally {
  878 |     release();
  879 |     await page.unrouteAll({ behavior: 'wait' });
  880 |     await qa.evidence('ui-directory-bounded-requests', requests);
  881 |   }
  882 | });
  883 | 
  884 | test('[UI-025] 同标签返回保留条件与已加载页，整页刷新清空目录内存', async ({ qa, page }) => {
  885 |   await qa.api.login();
  886 |   for (let i = 0; i < 23; i++) {
  887 |     const { group } = await qa.api.createGroup();
  888 |     await qa.api.require(
  889 |       qa.api.patch(`/api/groups/${group.id}`, { name: `cache-item-${String(i).padStart(3, '0')}` }),
  890 |     );
  891 |   }
  892 |   await login(page, qa);
  893 |   await go(page, qa, 'groups');
  894 |   await element(page, qa, 'search').fill('cache-item');
  895 |   await element(page, qa, 'order').selectOption('asc');
  896 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  897 |   await element(page, qa, 'loadMoreGroups').click();
  898 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  899 |   const selected = card(page, qa, 'cache-item-022');
  900 |   await selected.scrollIntoViewIfNeeded();
  901 |   await child(selected, qa, 'directoryLink').click();
  902 |   await expect(page.locator('body')).toContainText(/群主|creator/);
  903 |   await page.goBack({ waitUntil: 'domcontentloaded' });
  904 |   await expect(element(page, qa, 'search')).toHaveValue('cache-item');
  905 |   await expect(element(page, qa, 'order')).toHaveValue('asc');
  906 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
  907 |   await expect(card(page, qa, 'cache-item-022')).toBeInViewport();
  908 |   await expect(element(page, qa, 'directoryLoadedCount')).toContainText('23');
  909 |   await page.reload({ waitUntil: 'domcontentloaded' });
  910 |   await expect(element(page, qa, 'search')).toHaveValue('');
  911 |   await expect(element(page, qa, 'order')).toHaveValue('desc');
  912 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(20);
  913 | });
  914 | 
  915 | test('[UI-026] 注销后更换身份不复用上一会话目录条件', async ({ qa, page }) => {
  916 |   const group = await prepare(qa);
  917 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '仅上一会话条件' }));
  918 |   await login(page, qa);
  919 |   await go(page, qa, 'groups');
  920 |   await element(page, qa, 'search').fill('仅上一会话');
  921 |   await element(page, qa, 'order').selectOption('asc');
  922 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  923 |   const loggedOut = page.waitForResponse(
  924 |     (response) =>
  925 |       new URL(response.url()).pathname === '/api/auth/logout' &&
  926 |       response.request().method() === 'POST',
  927 |   );
  928 |   await element(page, qa, 'logout').click();
  929 |   expect((await loggedOut).ok()).toBe(true);
  930 |   await login(page, qa, 'viewer');
  931 |   await go(page, qa, 'groups');
  932 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(1);
  933 |   await expect(element(page, qa, 'search')).toHaveValue('');
  934 |   await expect(element(page, qa, 'order')).toHaveValue('desc');
  935 |   await remains(async () => {
  936 |     expect(await element(page, qa, 'search').inputValue()).toBe('');
  937 |     expect(await page.getByRole('button', { name: '创建群', exact: true }).count()).toBe(0);
  938 |   });
```