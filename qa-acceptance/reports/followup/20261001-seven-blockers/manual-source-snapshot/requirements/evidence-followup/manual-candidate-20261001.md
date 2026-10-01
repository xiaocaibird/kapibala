# 真人样例环境的候选核对

2026-10-01：真人辅助准备固定当前 main `fb1589df08f00c10e9e62801007b1698d4d0155a`，新独占 SUT 在 `/Users/zcm/.codex/worktrees/qa-manual-session/kapibala`。

从已评审的 `a6b14e73ec738b979b05510fdfac8c6fcbb09df7` 至此候选，非 QA 差异只有 docs/README、CAP003 边界、时间边界和恢复边界工程复核及其证据索引；产品源码、迁移、依赖锁、启动清单没有变化。已核对工程文档仍保留 CAP003 严格预算失败、首次接收记录保存前的排期缺陷和外部副作用恢复限制；未将工程处理方向当新业务豁免。新样例不重复宣称这些边界通过。

本轮首先通过真实公开 API 和独立 Agent/Gateway 桩准备正常、审计三次无结论 blocked、三次协议错误 failed、当前步骤后取消 cancelled、查询服务暂不可用的消息 unknown；不修改数据库或 DOM 造状态，不影响用户 5173 演示。网页使用该候选正常生产构建和 preview，端口/数据库随机独占。

`manual-environment.ts` 只创建原始采集环境，输出 kind=manual-environment-preparation，三项仍 NOT_RUN、formalRunId=null；不得作为已成立的人工 PASS。正式人工入口另建真实开始时间和 ready 绑定；此前体验不倒填正式记录。用户已获解释的 UX 只留体验反馈，原独立理解条件不满足时仍阻塞。七项工程补证的新候选另行冻结，不以此样例环境关闭。
