# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-024] 单页五秒刷新、并发失效合并且无关消息不遍历目录
- Location: tests/ui/console.spec.ts:813:1

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
      - link "可用 轮询起点 网关 ID · gateway-group-1 创建于 2026/10/01 14:47:04 3 位成员 Agent 未开启 查看群组详情" [ref=e88] [cursor=pointer]:
        - /url: "#/groups/a9a88cbb-af44-494b-8ea5-b11d11815af3"
        - generic [ref=e89]: 可用
        - heading "轮询起点" [level=3] [ref=e95]
        - generic "gateway-group-1" [ref=e96]: 网关 ID · gateway-group-1
        - generic [ref=e97]:
          - text: 创建于
          - time [ref=e98]: 2026/10/01 14:47:04
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
  732 |   } finally {
  733 |     await background.close();
  734 |   }
  735 | });
  736 | test('[UI-022] 创建群表单同样执行未保存关闭保护', async ({ qa, page }) => {
  737 |   await qa.api.login();
  738 |   await qa.api.connectAll();
  739 |   await login(page, qa);
  740 |   await go(page, qa, 'groups');
  741 |   await element(page, qa, 'createGroup').click();
  742 |   await element(page, qa, 'groupName').fill('创建草稿');
  743 |   await element(page, qa, 'closeCreateGroup').click();
  744 |   await element(page, qa, 'continueEditing').click();
  745 |   await expect(element(page, qa, 'groupName')).toHaveValue('创建草稿');
  746 |   await element(page, qa, 'closeCreateGroup').click();
  747 |   await element(page, qa, 'discardChanges').click();
  748 |   expect(await qa.api.require(qa.api.get<Group[]>('/api/groups'))).toEqual([]);
  749 | });
  750 | 
  751 | test('[UI-023] 简介摘要最多两行纯文本、详情完整且空简介无占位', async ({ qa, page }) => {
  752 |   const group = await prepare(qa);
  753 |   const { group: empty } = await qa.api.createGroup();
  754 |   const description = '纯文本摘要 '.repeat(35) + '<b>不得解释HTML</b> 最后一句';
  755 |   await qa.api.require(
  756 |     qa.api.patch(`/api/groups/${group.id}`, { name: '两行摘要专用群', description }),
  757 |   );
  758 |   await qa.api.require(qa.api.patch(`/api/groups/${empty.id}`, { name: '没有简介的群' }));
  759 |   await login(page, qa);
  760 |   await go(page, qa, 'groups');
  761 |   const summary = child(card(page, qa, '两行摘要专用群'), qa, 'directorySummary');
  762 |   await expect(summary).toBeVisible();
  763 |   const layout = await summary.evaluate((node) => {
  764 |     let clip = node.getBoundingClientRect();
  765 |     for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
  766 |       const style = getComputedStyle(ancestor);
  767 |       if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) {
  768 |         const r = ancestor.getBoundingClientRect();
  769 |         clip = {
  770 |           ...clip,
  771 |           top: Math.max(clip.top, r.top),
  772 |           bottom: Math.min(clip.bottom, r.bottom),
  773 |           left: Math.max(clip.left, r.left),
  774 |           right: Math.min(clip.right, r.right),
  775 |         } as DOMRect;
  776 |       }
  777 |     }
  778 |     const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  779 |     const tops: number[] = [];
  780 |     while (walker.nextNode()) {
  781 |       const range = document.createRange();
  782 |       range.selectNodeContents(walker.currentNode);
  783 |       for (const r of range.getClientRects()) {
  784 |         if (
  785 |           r.height > 0 &&
  786 |           r.width > 0 &&
  787 |           r.top < clip.bottom - 1 &&
  788 |           r.bottom > clip.top + 1 &&
  789 |           r.left < clip.right &&
  790 |           r.right > clip.left
  791 |         )
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
> 832 |   await remains(async () => expect(requests.length).toBe(unrelated), 1000);
      |                                                     ^ Error: expect(received).toBe(expected) // Object.is equality
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
  892 |   await expect(element(page, qa, 'directoryItem')).toHaveCount(23);
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
```