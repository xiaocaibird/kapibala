# INT-READ-001：真实数据库读取阻塞的独立 QA 接入

本轮只新增 QA 代码并静态、自身校验，尚未执行产品。本次完整正式原 run 1e0cb38a 和六项审定原件不变；本用例不能回填旧覆盖/结果。产品候选将由主任务以完整 SHA、目标指纹和新的 QA 源指纹重新绑定。

实际入口：`tests/system/delivery-read-boundaries.spec.ts`；独立登记 `cases/delivery-read-boundaries.json`。沿用 R-A5-10/R-A5-16（同 key、工具等待、实际 history），没有引入新业务时限或外部幂等能力。

## 真实触发与独立断言

1. 对本例注册数据库校验容器随机 owner、精确 ID、唯一回环映射、实际数据库名/角色、表 OID。加锁前再次核容器身份。只用两条自有 PG 连接，不连接默认库或业务库，不写业务行。
2. 公开 API 创建群和 run；原发送真实派发到网关，504 已实际产生效果但无事件，响应被可控屏障保持。只在原 `send-wait-started` 已出现且工具未交还后加 `public.messages ACCESS EXCLUSIVE` 锁；查询故障开启后释放 504。表名只定位故障，不能决定产品期望。
3. 独立 `pg_stat_activity`/`pg_locks`/`pg_blocking_pids` 记录数据库、backend_start、query_start、xact_start、SQL、锁模式及等待关系。必须实际观察同 locker 阻塞 messages SELECT；多个候选完整保留。仅缺少观测不能算已命中。
4. 锁保持期间观察原工具返回，严格 `toolWaitWindow` 使用原真实 key-resolved/wait-started → result-ready/result-returned 包络。下界 >5000 ms 即 FAIL；跨线仍 BLOCKED；持续未决不允许提前 SEND_TIMEOUT。下一 turn、QA 加锁时间和假 ROLLBACK 尾差不能成为计时起止。
5. 锁内采样后，QA locker 实际 ROLLBACK，再恢复网关。公开消息中的原 clientMsgId 最终 sent 后才放行同 key 第二次调用。公开原 run 步骤、真实同 attempt history、Agent 审计账本、网关请求和实际落地均核对；不能因 PG 关联缺口跳过已能执行的业务断言。已得 FAIL 先于后续 BLOCKED。
6. finally 释放仅本例锁和屏障/租约、关闭自有连接，失败仍保存所有原观测。QA locker 的 ROLLBACK 标记明确为夹具清理，绝不冒充 SUT 的清理见证。

## 当前精确接入缺口

已交付 `tool-wait-witness` 关联 run、step、tool、attempt、clientMsgId 和原进程时钟，但没有 PG backend PID/backend_start、具体 query attempt/事务身份。单看“一个 SELECT messages 被阻塞”无法排除后台消息读取；空闲 pool 连接也不能证明待测语句的服务端取消和串行 ROLLBACK。因此当前脚本最终保留这一 BLOCKED，不伪造字段，不按源码猜答案。

最小只读交付应关联实际 delivery read 的 query/transaction attempt → 原 tool execution attempt/clientMsgId → PostgreSQL backend PID/backend_start；在实际服务端 SQL error 回包与实际 ROLLBACK 完成位置记录原事实、SQLSTATE/错误类别、同一连接/事务身份及前后单调包络。若连接被销毁应提供实际 disposition，而非宣布已清理；QA 用独立 PG 活动/锁记录交叉核对。不能仅提供返回布尔值、代码行或开发测试回调。

没有这条交付时，脚本可确认真实库阻塞、真实 5 秒违约、公开恢复及无重发，但不能宣布“特定 waitForDelivery 查询没有被遗弃、所有 ROLLBACK 顺序已证实”。采样发现 idle-in-transaction 只记录待归属诊断；不能将他人的后台事务当产品违约。特定语句缺精确归属记 B，而已观察工具 5 秒硬超限和真实重复副作用仍记 F。

## 非目标与预算

1500 ms 的 QA 锁获取、12000 ms 的本例闲置事务安全 TTL、8000 ms 的锁内取证、两段 10000 ms 的恢复采样是夹具资源预算，不是产品 SLA。开发文档所述 50/100 ms 局部 PG 切片不作为验收标准。没有通过客户端 Promise.race、业务内部导入、提前伪造超时、包装 ROLLBACK 延迟来制造目标窗口。

本轮不声称验证了 statement timeout 分支、连接池获取硬上限、丢失所有权、ROLLBACK 网络延迟或连接销毁的全部情形；后续有真实关联观测再扩展，不能用当前一次表锁覆盖这些窗口。
