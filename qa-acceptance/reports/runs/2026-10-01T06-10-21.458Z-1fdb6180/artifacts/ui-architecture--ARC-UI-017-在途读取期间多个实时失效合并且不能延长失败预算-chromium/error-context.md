# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/architecture.spec.ts >> [ARC-UI-017] 在途读取期间多个实时失效合并且不能延长失败预算
- Location: tests/ui/architecture.spec.ts:611:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 5

Call Log:
- Timeout 8000ms exceeded while waiting on the predicate
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
      - link "服务账号" [ref=e14] [cursor=pointer]:
        - /url: "#/accounts"
      - link "Agent 运行" [ref=e19] [cursor=pointer]:
        - /url: "#/agent-runs"
      - link "定时序列" [active] [ref=e23] [cursor=pointer]:
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
        - strong [ref=e54]: 定时序列
      - status [ref=e56]: 连接恢复中
    - main [ref=e58]:
      - generic [ref=e59]: 实时连接已断开，正在自动重连并补齐期间的变化。
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: SCHEDULED MESSAGING
          - heading "定时序列" [level=1] [ref=e63]
          - paragraph [ref=e64]: 预检每一步的消息与变量来源，再有序发送到群组。
        - button "新建序列" [ref=e66] [cursor=pointer]
      - alert [ref=e69]:
        - generic [ref=e72]:
          - strong [ref=e73]: QA controlled resource failure
          - generic [ref=e74]: SERVICE_UNAVAILABLE · 请求 qa-architecture
      - generic [ref=e76]:
        - paragraph [ref=e77]: 当前群组：未选择 · 状态：—
        - paragraph [ref=e78]: 当前展示运行：尚无运行
      - generic [ref=e79]:
        - generic [ref=e80]:
          - generic [ref=e81]:
            - heading "运行配置" [level=2] [ref=e82]
            - generic [ref=e83]: 先预检 · 后执行
          - generic [ref=e84]:
            - generic [ref=e85]:
              - text: 目标群组
              - combobox "目标群组" [ref=e86]:
                - option "请选择群组" [disabled] [selected]
            - generic [ref=e87]:
              - text: 消息序列
              - combobox "消息序列" [ref=e88]:
                - option "请选择序列" [disabled] [selected]
            - generic [ref=e89]:
              - text: 默认变量
              - code [ref=e90]: vars
              - textbox "默认变量 vars" [ref=e91]: "{}"
            - paragraph [ref=e92]: JSON 键值对象。此序列没有占位符。空字符串视为未提供。
            - generic [ref=e93]:
              - text: 分步变量
              - code [ref=e94]: stepVars
              - textbox "分步变量 stepVars" [ref=e95]: "{}"
            - paragraph [ref=e96]:
              - text: 例如
              - code [ref=e97]: "{\"2\":{\"location\":\"共享盘\"}}"
              - text: 。从该步起沿用新值；空字符串保留原值。
            - button "预检所有步骤" [disabled] [ref=e98]
        - generic [ref=e101]:
          - generic [ref=e103]:
            - strong [ref=e110]: 尚无序列运行
            - paragraph [ref=e111]: 选择序列并完成变量预检后，执行进度会在这里实时展示。
          - generic [ref=e112]:
            - heading "发送后，再开始下一步计时" [level=3] [ref=e113]
            - paragraph [ref=e114]: 限流时步骤等待恢复。没有匹配角色的可用账号时跳过；群不可写时停止运行。
      - generic [ref=e115]:
        - generic [ref=e116]: Kapibala Console
        - generic [ref=e117]: 状态有记录，执行可追踪。
```

# Test source

```ts
  534 |     release!();
  535 |     await remains(async () => {
  536 |       await expect(
  537 |         element(page, qa, 'sequence').locator(`option[value="${fresh.id}"]`),
  538 |       ).toHaveCount(1);
  539 |       await expect(element(page, qa, 'sequence').locator(`option[value="${old.id}"]`)).toHaveCount(
  540 |         1,
  541 |       );
  542 |       await expect(element(page, qa, 'createSequence')).toBeHidden();
  543 |     });
  544 |   } finally {
  545 |     release!();
  546 |     await originalDocument?.dispose();
  547 |     await page.unrouteAll({ behavior: 'wait' });
  548 |   }
  549 | });
  550 | test('[ARC-UI-015] 耗尽后显式同页刷新可开始新一轮', async ({ qa, page }) => {
  551 |   const item = await seed(qa);
  552 |   let attempts = 0;
  553 |   let recovered = false;
  554 |   await page.route('**/api/sequences', async (route) => {
  555 |     if (route.request().method() !== 'GET') return route.continue();
  556 |     attempts++;
  557 |     if (!recovered) await errorResponse(route);
  558 |     else await route.continue();
  559 |   });
  560 |   try {
  561 |     const baseline = await startQuietRead(page, qa);
  562 |     await expect
  563 |       .poll(() => attempts, { timeout: profile.recoveryTimeoutMs })
  564 |       .toBe(profile.maximumReadAttempts);
  565 |     await remains(async () => {
  566 |       expect(attempts).toBe(profile.maximumReadAttempts);
  567 |       noNewEvents(page, baseline);
  568 |     });
  569 |     const refresh = element(page, qa, 'sequenceResourceRefresh');
  570 |     if (!(await refresh.isVisible()))
  571 |       throw new BlockedError(
  572 |         '未找到公开可见的同页资源刷新操作；需适配真实入口，禁止直接调用业务reload或用整页重载冒充同控制器恢复',
  573 |       );
  574 |     recovered = true;
  575 |     await refresh.click();
  576 |     await expect(element(page, qa, 'sequence')).toHaveValue(item.id);
  577 |     await remains(async () => {
  578 |       expect(attempts).toBe(profile.maximumReadAttempts + 1);
  579 |       noNewEvents(page, baseline);
  580 |     });
  581 |   } finally {
  582 |     await page.unrouteAll({ behavior: 'wait' });
  583 |   }
  584 | });
  585 | test('[ARC-UI-016] 错误后离页取消退避期间的后续读取', async ({ qa, page }) => {
  586 |   await seed(qa);
  587 |   let attempts = 0;
  588 |   await page.route('**/api/sequences', async (route) => {
  589 |     if (route.request().method() !== 'GET') return route.continue();
  590 |     attempts++;
  591 |     await errorResponse(route);
  592 |   });
  593 |   try {
  594 |     await startQuietRead(page, qa);
  595 |     await expect(element(page, qa, 'sequenceResourceError')).toBeVisible();
  596 |     // The first error is presented during retry. Navigation must happen before exhaustion.
  597 |     if (attempts >= profile.maximumReadAttempts)
  598 |       throw new BlockedError('首次可见错误前预算已经耗尽，未建立退避期间离页前提');
  599 |     await element(page, qa, 'navAccounts').click();
  600 |     await expect(element(page, qa, 'accountRow')).not.toHaveCount(0);
  601 |     const atDeparture = attempts;
  602 |     if (atDeparture >= profile.maximumReadAttempts)
  603 |       throw new BlockedError(
  604 |         '浏览器操作慢于本轮退避预算，未建立退避期间离页的前提；需重跑，不能冒充取消验证',
  605 |       );
  606 |     await remains(async () => expect(attempts).toBe(atDeparture));
  607 |   } finally {
  608 |     await page.unrouteAll({ behavior: 'wait' });
  609 |   }
  610 | });
  611 | test('[ARC-UI-017] 在途读取期间多个实时失效合并且不能延长失败预算', async ({ qa, page }) => {
  612 |   await seed(qa);
  613 |   let attempts = 0,
  614 |     active = 0,
  615 |     maximumActive = 0;
  616 |   let release: (() => void) | undefined;
  617 |   const hold = new Promise<void>((resolve) => {
  618 |     release = resolve;
  619 |   });
  620 |   await page.route('**/api/sequences', async (route) => {
  621 |     if (route.request().method() !== 'GET') return route.continue();
  622 |     attempts++;
  623 |     active++;
  624 |     maximumActive = Math.max(maximumActive, active);
  625 |     try {
  626 |       if (attempts === 1) await hold;
  627 |       await errorResponse(route);
  628 |     } finally {
  629 |       active--;
  630 |     }
  631 |   });
  632 |   try {
  633 |     const baseline = await startQuietRead(page, qa);
> 634 |     await expect.poll(() => attempts).toBe(1);
      |                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  635 |     const createdIds: string[] = [];
  636 |     for (let i = 0; i < 3; i++) createdIds.push((await seed(qa, `QA在途失效${i}`)).id);
  637 |     const matchingEvents = () =>
  638 |       observed(page)
  639 |         .events.slice(baseline.events)
  640 |         .filter((event) => {
  641 |           if (typeof event.payload !== 'object' || event.payload === null) return false;
  642 |           const sequenceId = (event.payload as Record<string, unknown>).sequenceId;
  643 |           return typeof sequenceId === 'string' && createdIds.includes(sequenceId);
  644 |         });
  645 |     try {
  646 |       await expect
  647 |         .poll(
  648 |           () =>
  649 |             new Set(
  650 |               matchingEvents().map(
  651 |                 (event) => (event.payload as Record<string, unknown>).sequenceId,
  652 |               ),
  653 |             ).size,
  654 |         )
  655 |         .toBe(3);
  656 |     } catch {
  657 |       throw new BlockedError(
  658 |         '未观察到分别关联本轮3个新序列ID的公开事件，无法建立相关并发失效前提；任意其他事件或重复帧不计数',
  659 |       );
  660 |     }
  661 |     await remains(async () => {
  662 |       expect(attempts).toBe(1);
  663 |       expect(maximumActive).toBe(1);
  664 |     }, 500);
  665 |     release!();
  666 |     await expect
  667 |       .poll(() => attempts, { timeout: profile.recoveryTimeoutMs })
  668 |       .toBe(profile.maximumReadAttempts);
  669 |     await remains(async () => {
  670 |       expect(attempts).toBe(profile.maximumReadAttempts);
  671 |       expect(maximumActive).toBe(1);
  672 |     });
  673 |     await qa.evidence('architecture-single-flight', {
  674 |       attempts,
  675 |       maximumActive,
  676 |       createdIds,
  677 |       matchingEvents: matchingEvents(),
  678 |     });
  679 |   } finally {
  680 |     release!();
  681 |     await page.unrouteAll({ behavior: 'wait' });
  682 |   }
  683 | });
  684 | test('[ARC-UI-018] 网络失败及其他已登记暂时HTTP错误均可自动恢复', async ({ qa, page }) => {
  685 |   const item = await seed(qa);
  686 |   await login(page, qa);
  687 |   await waitForQuietSocket(page);
  688 |   for (const status of [0, 408, 500, 502, 504]) {
  689 |     await navigateWithinDocument(page, qa, 'navAccounts');
  690 |     await expect(element(page, qa, 'accountRow')).not.toHaveCount(0);
  691 |     let attempts = 0;
  692 |     await page.route('**/api/sequences', async (route) => {
  693 |       if (route.request().method() !== 'GET') return route.continue();
  694 |       attempts++;
  695 |       if (attempts > 1) return route.continue();
  696 |       if (status === 0) await route.abort('failed');
  697 |       else await errorResponse(route, status, 'QA_TEMPORARY_FAILURE');
  698 |     });
  699 |     try {
  700 |       const baseline = quietBaseline(page);
  701 |       await navigateWithinDocument(page, qa, 'navSequences');
  702 |       noNewEvents(page, baseline);
  703 |       await expect(element(page, qa, 'sequence')).toHaveValue(item.id, {
  704 |         timeout: profile.recoveryTimeoutMs,
  705 |       });
  706 |       await remains(async () => {
  707 |         expect(attempts).toBe(2);
  708 |         noNewEvents(page, baseline);
  709 |       });
  710 |       await qa.evidence(`architecture-recovery-${status}`, { status, attempts });
  711 |     } finally {
  712 |       await page.unrouteAll({ behavior: 'wait' });
  713 |     }
  714 |   }
  715 | });
  716 | 
```