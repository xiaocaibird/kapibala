# AR-02：成员事件的跨群数据库锁等待

本轮基线 `0cdad82`，实施分支 `agent/core-event-isolation-verification`。只验证并修复 `GatewayEvents` 成员事件事务的锁等待；没有改 `messages.ts`、数据库结构、前端、QA 验收项目或演示环境。

## 修前证据与实际调用路径

[架构复核 AR-02](architecture-reviews/2026-10-01-baseline.md)指出：SSE `listen` 逐帧等待 `process`。成员事件先进入数据库事务、插入去重记录、取得群行锁，之后才发起超时为 2 秒的成员 HTTP 查询。因此 HTTP 超时不限制前面的数据库锁等待。

新增[专项测试](../tests/integration/core-event-isolation.test.ts)使用独立 UUID PostgreSQL 数据库、随机 HTTP 端口和真实 SSE 响应。测试连接持有 A 群 `FOR UPDATE` 锁，服务流依次发送 A 成员事件、B 消息、B 重复消息、B 历史消息和 A 的另一条成员确认，并通过 `pg_blocking_pids` 确认真正发生了 PostgreSQL 锁等待。

[修前日志](evidence/core-event-isolation-before.log)保留了反例：A 锁保持 **2328ms** 时，B 两条消息仍未落库，成员 HTTP 请求数仍为 **0**。释放 A 后，四条唯一网关事件、一个 A 成员、一次成员变更通知和两条 B 消息完整落库。失败点是 B 在 A 被锁期间不能继续，未把测试清理或最终恢复失败混作反例。此轮另一个非锁失败与迟到成员事件测试通过。

## 最小修复及安全性

产品代码只在 `events.ts` 的 `member_joined` / `member_left` 事务开头添加 `SET LOCAL lock_timeout = '50ms'`，覆盖成员事务里的去重插入、群行锁、成员/账号锁和提交前事件锁等待。其他事件类型、SSE 逐帧接收方式及现有重试调用保持原样。

超时会令整个事务回滚，包括 `gateway_events` 去重记录、成员投影及待提交通知。`process` 的既有失败分支保留事件，`retryFailed` 在后续 tick 重试；处理器重建后仍从网关 `since=0` 历史重放。没有引入新的持久队列，也没有把锁忙当成已成功处理。

成员 HTTP 查询属于读取，并且仍然在取得群锁之后进行。重试重新读取网关当前成员事实，避免把失败前或迟到事件里的过时成员状态直接写回。事件 ID 仍用于去重，不是必须按 ID 顺序提交的游标；现有非锁失败原本也允许后续事件先提交。本次没有并发执行整个事件流，没有新增历史成员状态还原或全局严格顺序保证。

非锁异常没有被新增规则忽略，继续进入原有失败记录和重试路径。锁超时同样沿用原有错误日志及 `inconsistency` 通知，因此正常但持续的锁争用也可能产生这一已有通知；没有新增通知类型或把它描述为永久数据损坏。

## 修后检查

[合跑日志](evidence/core-event-isolation-after.log)包含 **41/41 通过，0 跳过、0 失败**：新增专项三项，加上既有 `gateway.test.ts`、`gateway-stream-repair.test.ts`、`gateway-member-timeout.test.ts`、`gateway-observation-repair.test.ts` 与 `core-scheduler-cancel-repair.test.ts`。

本轮合跑实测：A 仍被锁住时，B 在 **88ms** 落库；锁中重试在 **103ms** 返回。整组合跑耗时 **14.016 秒**。

新增三项的断言分别是：

1. A 锁持续持有时，B 两条消息在 1 秒检查窗口内提交；A 的去重记录和成员投影仍为零。锁仍在时，显式重试也在 1 秒窗口内结束。释放 A 后四条唯一事件全部处理，成员和成员变更通知各一次，B 消息仍为两条。重复事件不重复写入，B 通知保留到达顺序，历史消息的原始发送时间排序不被覆盖。
2. 真实 PG 触发器注入非锁成员写失败，去重和通知均不提前提交；B 消息继续。较新的离群事实先落库后，旧 joined 事件重试重新读取当前远端事实，不复活已离开的成员；最终三条事件、一条成员变更、一条原有异常通知各按预期持久化。
3. A 事件因锁忙尚未持久化时关闭并重建 `GatewayEvents`，不调用旧实例的 `retryFailed`。新实例通过真实 SSE `since=0` 历史补回 A，已提交 B 消息和通知均没有重复。此项是处理器实例重建，不是真实进程 SIGKILL。

准确毫秒计时与临时数据库名保留在合跑原始日志。既有慢成员 HTTP 测试仍约 2 秒后才让后续群事件继续，符合原有读取预算。

命令使用专用可抛 PostgreSQL 服务 `127.0.0.1:64550` 的管理连接；每条测试自行创建和回收 UUID 数据库，没有读写演示数据库：

```sh
DATABASE_URL='<专用测试服务连接，数据库路径为 /postgres>' ./node_modules/.bin/tsx --test \
  tests/integration/core-event-isolation.test.ts \
  tests/integration/gateway-member-timeout.test.ts \
  tests/integration/gateway-observation-repair.test.ts \
  tests/integration/core-scheduler-cancel-repair.test.ts \
  tests/integration/gateway-stream-repair.test.ts \
  tests/integration/gateway.test.ts
npm run typecheck
npm run verify:original
git diff --check
```

[类型检查](evidence/core-event-isolation-typecheck.log)覆盖服务端和前端，已通过。[原文校验](evidence/core-event-isolation-original.log)通过，SHA-256 仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。本轮未执行 QA 验收或完整应用回归。[回收检查](evidence/core-event-isolation-cleanup.json)逐一查询修前/修后日志中记录的 9 个 UUID 库名，剩余数据库和对应会话均为零；没有按通配符清理其他任务的数据库。

## 明确保留的边界

- 50ms 限制每次 PostgreSQL 锁获取，不是整个事件或 tick 的总预算；多个锁、多次慢成员 HTTP、重试积压可以累计等待。
- 连接池等待、一般查询执行时间、事务外预检查、其他事件类型的锁等待及 `findEcho` 的多个远端读取没有因此获得统一时限。AR-02 的一般接收/应用解耦问题仍未全面解决。
- 重试队列在当前处理器内存中；重建后的恢复依赖网关仍保留并能返回历史。没有网关保留约定、进程崩溃前持久接收确认或无限积压承载能力的新保证。
- 如需所有事件类型或任意积压下的跨群时限，应另行设计持久处理状态、群/账号分区及跨分区顺序、容量/退避、故障恢复和监测。本轮证据不足以直接实施这类重构。
