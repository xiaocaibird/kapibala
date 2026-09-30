# 集成复核补修：暂停 Agent 的取消调度

独立复核基线 `473b38a`，实施分支 `agent/core-scheduler-cancel-repair`。本次只补 R05 已授权的跨群阻塞遗漏，不操作 root 工作树、演示服务或演示数据库，不重跑全项目测试。

## 发现与最小修复

`AgentModule.tick` 在遍历 `pausedCancellations` 时串行 await `withLock → finish`；此前 `finish` 的普通事务会无限等待群行锁。暂停 run 同时满足取消条件时，一个群的锁会卡住健康群 Agent 的执行启动及后续 `sequences.tick`。扫描和入场的 50ms 锁超时没有覆盖该分支。

只为该后台取消调用启用已有 `schedulingTransaction`，继续保留原状态写入、通知和取消原因。锁忙时完整事务回滚，数据库中的 `status=running`、`cancel_requested` 和 `recovery_note` 不变；后续 tick 重新查询并处理。只有成功提交后才进入 scan/startNext；不吞非 `55P03` 错误，不把未知远端副作用改成失败，不改变正在执行 run 的其他 finish 路径。

## 定向证据

新增 `tests/integration/core-scheduler-cancel-repair.test.ts` 两项，均使用独立 UUID PostgreSQL 数据库和随机 HTTP 端口：

1. 修前锁住暂停 run 的群一秒，tick 仍 blocked；修后合跑中 tick **90ms** 返回。锁仍在时，取消意图完整保留，另一群 Agent 结束且序列已入队；解锁后只产生一次 cancelled 通知，健康群出站仍只有一条。
2. 实际 PG 触发器注入非锁写失败，错误向调用方抛出、run 及取消意图保留、没有错误的 cancelled 通知；移除故障后下次 tick 成功取消。

两项与既有 `core-automation-repair.test.ts` 九项合跑：**11/11 通过，0 跳过、0 失败，5.115 秒**。`npm run typecheck`、原文 SHA 校验和 diff 检查通过。原文仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。修前失败清理出现临时数据库连接终止日志，未隐藏；修后检查通过。没有声明完整应用回归或浏览器验收。

## 跨模块复核边界

- 调度事务只把 `55P03` 视作延后，所有本地状态、待处理关联、发送入队和通知由同一事务提交；锁超时不会单独消费队列意图。序列接管的 pendingRebases 在重排成功前阻止正常派发，旧调度器连接取消仍优先抛出。
- 50ms 限制每次锁获取，不能限制连接池等待、数据库执行时间、多群累计耗时或其他没有采用此包装的路径；本次不承诺全局 tick 固定时限。
- 007 的 running 守卫检查现存运行，迁移不回填历史观察时间；必须遵守旧运行结束、停止旧实例、再迁移的升级顺序。它不是运行中迁移与并发新建序列的互斥协议。
- message_sent 的已提交时间不会被普通重复确认重写；未持久化前硬终止仍只能在重放时重新观察。既有模块重建测试不等于该窗口的真实 SIGKILL 证明。
- 另发现并向协调者报告 R09 组合问题：首次事件写失败后，同一消息的新 eventId 重复确认先成功，随后重试原事件时 `COALESCE` 留下较晚时间。独立 PG 复现中后移 **105ms**。协调者随后明确授权在本分支另一个提交修复，证据见下节。

## R09 组合补修：同一消息的新 eventId

首次观察缓存现在以 JSON 编码的 `[clientMsgId, msgId]` 组合为键，不再以 eventId 为键。写库失败后收到同一消息的新 eventId，会沿用尚未持久化的首次时间；包含 msgId 可以隔离同一 clientMsgId 下错误的远端确认。持久化成功或已处理去重后清理对应缓存；原失败事件之后重试仍由数据库 `COALESCE` 保护已经保存的时间。缓存只属于当前 `GatewayEvents` 实例，没有新增持久协议或跨进程最早接收时间保证。

新增 `gateway-observation-repair.test.ts` 两项：

1. 首次 message_sent 的实际 PG 写失败，100ms 后相同 clientMsgId/msgId 的新 eventId 成功，再重试旧事件。修前首次时间窗口断言失败；修后最终观察值和序列 sent_at 均在首次调用窗口内，下一步精确 +500ms。成功、新 eventId 重复、旧 eventId 去重与失败重试之后，相关缓存均清空，三条唯一事件都落库。
2. query 已确认正确 msgId，但另一个错误 msgId 的事件先写失败。稍后正确事件仍采用自己的接收时刻，不被错误身份占用；错误事件重试只报告重复远端投递，正确观察值不变，最终缓存清空。

两项、暂停取消两项、现有自动化修复九项和 SSE 分帧两项合跑：**15/15 通过，0 跳过、0 失败，5.304 秒**；暂停取消锁场景此次 tick **94ms**。`npm run typecheck` 和原文 SHA 校验通过，未重跑全套。临时数据库清理出现一条连接终止日志，测试与清理均完成。首次观察未持久化前硬终止、多个处理器实例各自观察的全局先后，以及迁移前历史时刻仍保留原有边界。
