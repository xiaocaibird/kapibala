# 工具等待与 PostgreSQL 读取因果观测

2026-10-02。对应首轮 `READ-CAUSAL-1`，依据 QA 的 `minimal-observation-followup-20261002.md` 接入条件。开发基线为 `5cc04f7`；本记录及下面的开发日志产生于共同开发工作树，最终固定候选 SHA 由集成交付记录给出，不能把开发中日志当成固定旧版 `8e047ae` 的追加通过证据。

本次增加工程入口的真实观测，不改变五秒标准、不增加外部协议、不修改 QA 用例或结论。原严格五秒超限仍保留。观察器本身不提供业务结果，正文、SQL 参数和错误消息不进入新增读取事件。

## 关联与真实边界

`AgentTools.send` 的原 `attemptId`、`groupId/runId/stepId/toolUseId/clientMsgId` 传入 `observeDelivery` 的可选 callback。每次连接读取产生独立 `readAttemptId`；本轮连接上每条 SQL 有唯一 `queryAttemptId`、`queryRole` 和 SQL 文本的 SHA-256（不包含 SQL 参数）。同一个原工具可能在原五秒窗口内产生多个只读事务，不能把多个 attempt 拼成一笔事务。

| 事件 | 实际含义 |
| --- | --- |
| `delivery-read-attempt-started` | 此轮读取开始，保留原 `deadlineMonotonicMs` |
| `delivery-read-client-acquired` | 本轮 PoolClient 实际取得；此时还未宣称知道后端身份 |
| `delivery-read-backend-identified` | 此连接在真实只读事务中查得 `backend.pid` 和 `backend.backendStarted` |
| `delivery-read-query-started/returned/failed` | 对同一条实际 SQL 的调用、返回或拒绝；返回/失败带原进程 `queryWindowMs`，失败保留安全的 SQLSTATE |
| `delivery-read-value-observed` | 原读取回调完成并通过原截止检查；随后 cleanup 的耗时另算，不改写已及时读取的事实 |
| `delivery-read-attempt-failed` | 原截止、自己的读取超时、所有权或其他错误已被此轮实际捕获，不等于远端消息失败 |
| `delivery-read-client-released` | 实际调用 release 已返回；`returned-to-pool` 与 `destroy-requested` 分开 |
| `delivery-read-connection-ended` | pg 客户端实际发出 `end`，仅证明本地连接生命周期结束，不能替代 PG 服务端取消/事务提交确认 |

SQL 角色为 `begin/identity/set-timeouts/delivery-select/rollback`。同 `readAttemptId` 下 `rollback` 的 `returned` 才是应用收到真实 ROLLBACK 确认；只有 `started` 不算确认。连接已坏而无法回滚时，不能伪造回滚成功。`ownReadTimeout=true` 仅针对本轮有界读取收到的既有精确 55P03/57014 超时分类；外部 `pg_cancel_backend`、连接失败和其他 SQL 错误继续传播。

`backendStarted` 是本连接查询得到的 PostgreSQL `backend_start::text` 原字符串，用作 PID 防复用身份，不用于活动时间计算。身份 SQL 只在工程 observer 启用时执行，并先使用已有的 SET LOCAL 读取限制；它的耗时计入原截止，不为它另开五秒窗口。正常入口没有这条身份查询。新增时间均来自应用 `performance.now()`；公开工程通道原有 `clockDomain/applicationPid/monotonicMs` 与进程归属仍需同时核对，不能与另一进程的单调数值直接相减。

生命周期通道按原规则保留和转发这些增量字段。QA 需显式读取新事件，不能因严格解码丢字段后再用源码推断实际发生。观察回调异常时不改变真实查询结果和 cleanup；该 recorder 后续记录停止，缺失的结束/释放事实不能判完整。原通道的截断/保留限制仍有效。

## 保存事务与只读事务分开

新增 `send-tool-history-save-started/returned/failed` 记录原调用者开始保存步骤、实际返回或拒绝；`returned` 不自动等于 COMMIT，`failed` 不自动等于 ROLLBACK。实际保存由根工作线的 `agent-step-save-transaction` 提供同原 `attemptId` 的独立 `transactionAttemptId`、真实域 UPDATE 及外层 COMMIT/ROLLBACK 边界，既有 `send-tool-history-committed` 仍保持原含义。

因此工具交还→历史保存的关联成立，不代表它们共用一个数据库事务。后台日常查询没有本轮关联，不得根据“随后某连接 idle”冒认本工具已回滚。

## 定向开发验证

开发日志位于 `.runtime/first-round-read-causal-20261002/`，由根最终归档并绑定候选。只使用本轮专属 PG 容器中的 UUID 临时库；不访问 QA、演示环境或真实模型。各夹具负责自己的临时库和连接清理，公共容器由根统一清理。

1. `focused.tap`：两份既有 delivery 定向文件 **21 PASS、0 FAIL、0 SKIP**。真实 messages 表锁捕获到本次后端 PID/start 和实际 locker 的 `pg_blocking_pids` 链；原工具 31 次服务端 55P03 都能对应到本轮 SELECT、ROLLBACK 确认和释放。工具在锁仍持有时返回，同 key 解锁后恢复，未重复审计或发送。该首次样例物理耗时 **5008.344083ms**，没有按严格五秒判通过。
2. `observer-robustness.tap`：新增 recorder 故障保护后的 helper 定向 **8 PASS、0 FAIL、0 SKIP**。包括真实 statement timeout、外部 PG cancel/terminate、ROLLBACK 失败、所有权丢失、迟到读取；无 observer 不查身份；观察器抛错仍返回真实 SQL 结果，且不发布虚假的完整 cleanup 证据。
3. TypeScript 检查通过。最终集成固定源回归另记，本报告不冒称整仓验证或独立 QA 通过。

真实锁测试的完整 `causalFacts` 已写入日志；参数与正文泄漏扫描未命中凭据或鉴权标记。测试中的简化 host 不执行真实历史保存，因此特意断言不能出现 `send-tool-history-committed`；实际保存事务的正反例由根的真实事务专项验证，不能用此简化 host 顶替。

## 保留边界

- 新增因果观测不消除既有严格五秒物理超限；不得改用“查询被及时取消”替代“工具按原文时限交还”。
- PG 的 lock/statement timeout 不涵盖连接池排队、网络、JS 调度及 cleanup；没有增加 Promise.race 去遗弃服务器查询。
- 旧版未记录的 backend/query/transaction 关系无法事后补造。只有新版同一次真实运行的匹配原始事件和 PG 锁链才能关闭该因果缺证。
- 新增事件是开发取证入口，不是业务 API，也不赋予重复发送、恢复未知外部效果或任何新时限保证。
