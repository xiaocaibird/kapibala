# 首轮剩余技术补证：研发交付记录

2026-10-02。本记录针对首轮仍缺少的取消来源、活动边界及查询到保存回滚的关联证据。它记录研发观测接线和自测，不替代独立 QA 结论。

## 版本与执行边界

| 对象 | 固定标识 / 状态 |
| --- | --- |
| 首轮上一产品版本 | `8e047aea842bfcec64802e4918b52b460b93c48b` |
| 本次开发起点 | `5cc04f7300ba6f49fc293953b3eb334e0b743fa6`；相对上一产品版本只有 QA 文档变化 |
| 首次冻结候选 | `89fd465d8f864b248a9df7402efe88ba6be88fbb`；完整回归后，交付复核发现一处观察器异常隔离遗漏，已保留并补修 |
| 最终产品 / 测试源码 | `70dd1eeb83e64b72f250a0b83b63c933feaa4b23` |
| 研发工作分支 | `agent/first-round-observation-closeout` |
| 最终自测 | 565 项：554 PASS、0 FAIL、11 SKIP；构建、原文校验通过，独占资源清理完成 |
| 独立 QA 补测 | 待研发固定候选交付后，由 QA 独立核对和执行；没有预先改判 |

本次没有引入独立增强分支上的第二轮 P0/P1 增量，没有对 C1/C2 作出新的 QA 通过结论。第二轮仍只准备用例；本记录不授予第二轮执行、合并或部署权限。`qa-acceptance/`、原始需求文件以及已签发 QA 报告未被研发修改。

## 已补齐的研发接线

| QA 缺证项 | 接线与实际事实 | 保留边界 |
| --- | --- | --- |
| KB-CROSS / KB-CANCEL | 同一原 run、tool、execution attempt 下，实际 kick POST、504、确认 GET 分别关联真实 request ID；记录原预算 signal、单请求 deadline、operation signal 的实际触发，以及 fetch/body 的 pending 与 settle | 不把后续终态决定倒写为预算触发时刻；不依据错误名称或对端关闭猜取消来源；同一 signal 的别名不算多个独立根因 |
| KB-ACTIVITY | 原活动 witness 附加创建、暂停、终态的真实事务 BEGIN、域写入、COMMIT/ROLLBACK 调用与返回包络；暂停分支记录明确 cause | 原始活动起止、保守区间和 `continuous=false` 不变；原数据库 `now()` 起点不能换成 INSERT/COMMIT，预算 signal 也不能替代活动结束；硬崩溃尾段仍不完整 |
| READ-CAUSAL-1 | 同一发送执行关联 read attempt、query attempt、实际 PG PID/start、SQLSTATE、ROLLBACK 确认与释放；实际 Agent 保存步骤有独立 transaction attempt、域 UPDATE 和外层 COMMIT/ROLLBACK | 读取和保存是不同事务，不拼成一笔；调用失败不等于已回滚，只有实际 ROLLBACK 返回可算确认；旧版缺失事实不能事后补造 |
| 观察器异常隔离 | 同步 recorder 抛错不会阻止新增发送保存路径、改变成功结果或替换原持久化错误；事务、remote、读取 observer 都有局部隔离 | recorder 缺失/截断后不能声称证据完整；隔离抛错不表示观察器零开销，也不解决进程整体阻塞 |

具体接线分别见 [取消观测与开发证据](first-round-cancellation-observation-20261002.md) 和 [读取因果接入说明](qa-delivery-read-causal-observation-20261002.md)。继续使用已有工程观察入口及 `qa-runtime-observation/1` 的活动 / 生命周期 lease；未新增业务 API。既有入口使用方法见 [生命周期与恢复观察](qa-recovery-boundary-followup-20261001.md)、[活动 witness](qa-activity-witness-20261001.md) 和 [工程入口](qa-runtime-observation-adapter.md)。

### 活动与事务时间不能混用

`TransactionBoundaryFact` 的 `windowMs` 是应用实际发起 SQL 到 await 返回/拒绝的包络，不是数据库服务端精确执行时间。`backendPid` 来源于实际 pg 客户端握手身份；读取通道另有真实身份 SQL 给出的 `backendStarted`。只有 observer 已安装的读取会增加身份查询，其耗时仍计入原截止；普通业务入口没有这条身份 SQL。

活动证据通过 `transitionEvidence` 追加这些原始事实，不自动重新计算或缩小原 `activeElapsedMs`。所有计算必须保留实际应用 PID、唯一时钟域、完整 epoch 与暂停/恢复关系；跨进程须用实测包络，不能直接相减。暂停 cause 只说明执行分支，不改变已知结果未知的恢复保证。

### 保存成功、失败和回滚的证明范围

`send-tool-history-save-started/returned/failed` 是实际调用者边界。真实 `Agent.completeStep` 另发 `agent-step-save-transaction`，使用原执行 `attemptId`，并附独立 `transactionAttemptId`、`backendPid`、`phase`、`edge`、`windowMs` 与必要的安全 SQLSTATE。只有外层 COMMIT 实际返回后，原有 `send-tool-history-committed` 才会发布。

补充 `qa-agent-save-boundaries.test.ts` 直接执行真实 Agent 与真实 PostgreSQL：

1. 已持久化发送步骤复用既有消息 key，observer 只在 save-started 或 save-returned 抛错；均核对实际 step、history 和 COMMIT，以及没有重复审计 / 发送。
2. 在独占临时库中安装真实 PG trigger，使 history UPDATE 返回 `P0001`；实际 step UPDATE 已成功，但同笔事务随后收到 ROLLBACK 确认。核对 step 仍 ready、result 仍空、history 未改变，没有发布成功 COMMIT，也没有发起下一次模型调用。
3. 上述场景有原 run/step/tool、读取与保存 attempt 的完整关联。它们验证保存接线与故障隔离；其输入使用已持久化的发送步骤，不是新的一轮端到端严格预算或真实远端消息发送验收。

简化 `host.completeStep` 的定向测试只证明调用包装和原错误对象传播，不能顶替上述持久化证明。真实 PG 的通用事务专项另验证回滚后数据不残留、连接可复用、观察 scope 不泄漏。

## 开发验证与原始材料

证据目录：[first-round-observation-20261002](evidence/first-round-observation-20261002/)。日志保留实际输出原字节，SHA-256 索引在目录内；凭据文件不归档。开发中样本和固定提交回归分开标识。

| 验证 | 实际结果 / 含义 |
| --- | --- |
| 首次冻结 `89fd465` 完整回归 | 559 项：548 PASS、0 FAIL、11 SKIP；构建和原文校验通过。随后发现的隔离缺口仍保留，不能因回归通过忽略 |
| 新增保存包装的反例 | 补修前相同三例 3 FAIL；补修后 3 PASS。保留两份原始日志及独占测试库清理记录 |
| 真实 Agent 保存 / 回滚 | 开发样本 3 PASS；真实 PG trigger 故障、真实域数据与同事务回滚均已核对 |
| 活动与真实事务专项 | 开发样本 14 PASS；包括 recorder 异常、真实 SIGKILL 与接管不伪造尾段 |
| READ 读取因果 | 开发样本 21 PASS；其物理工具等待 `5008.344083ms` 仍按严格五秒不符合，不把接线 PASS 当时限 PASS |
| READ recorder / DB 故障保护 | 开发样本 8 PASS；覆盖真实 cancel/terminate、超时、回滚失败及关闭 observer |
| HTTP 取消观测 | 短套件最终 7 PASS。早期错误的组合 reason 预期已更正并留说明，不删首次失败 |
| 一次真实预算组合开发实验 | 首次 1 PASS 仅指观测接线：真实运行约 60 秒、原 POST 504、唯一 GET pending 时实际预算 signal 触发；没有注入活动值或自动重跑。源码尚未最终冻结，不能当最终候选的独立 QA 样本 |
| 最终 `70dd1ee` 完整回归 / 构建 | 565 项：554 PASS、0 FAIL、11 SKIP；约 282.31 秒。类型检查、生产构建与原文校验通过；最终固定源中包含上述真实 Agent 三例及包装三例 |

默认完整回归的跳过项包括显式启用的真实分钟 / 超时实验、真实 provider 和慢客户端测量。未把这些跳过项记成通过，未调用付费模型；真实预算组合的开发样本单独归档，不与默认回归合并计数。

## 仍不能关闭的结论

- 原严格五秒的实测失败保持。新增 query/ROLLBACK 因果只能补清发生过程，不能让超限变成通过。
- 原预算组合的活动区间跨越 60000ms，且暂停连续性不完整；本次没有拿账本值、墙钟、最后采样或较晚终态替代真值。新样本仍由 QA 根据完整原始边界独立计算。
- 已确认的未知外部效果与强恢复缺口保持原报告；不增加外部能力，不进行盲目重放，不把负责人已有范围决定当作原始测试通过。
- 单实例有限实验不证明运行中第二实例竞争、永久不重复、任意崩溃恢复；这些不能由两个单独通过场景拼接。
- 本次不重开已结束的状态文案评审。输入法与原生浏览器提醒的真人复验仍按原清单处理。

## QA 交接与收尾

研发提供最终源码 SHA、构建 / 回归与接线证据、原始日志哈希及自有资源清理结果。QA 独立核对版本和工程入口，决定如何构造同一原 run 的补测，维护其用例、驱动、断言和签发报告。研发没有改动其目录。补测结果须保留旧样本原判，再分别记录新事实、仍不满足的要求及最终需要负责人确认的偏差。

研发独占 PostgreSQL 清理前查得临时库为零、其他客户端连接为零；核对所有权后移除本次容器和卷，复查均不存在，私有连接凭据文件已移除。详见 [资源清理原件](evidence/first-round-observation-20261002/cleanup.json)。演示环境和 QA 环境没有用于本次开发实验。
