# 活动见证与持久续跑安全屏障

2026-10-01，活动接入源码 `d0c5c29`。本批提供独立 helper 与真实产品挂点，供显式 QA runtime 入口组合；没有改独立 QA 目录、QA 断言、协议文件或默认生产入口。**跨进程的完整活动见证仍未建立，INT-ACT-001 不能因本批自测通过而标 PASS。** 既有 CAP003 严格 60000ms 上限结论仍见 [CAP003 报告](cap003-budget-feasibility-20261001.md)。

## 接入方式与职责

`scripts/qa-runtime-observation/activity-witness.ts` 导出 `ActivityWitness`、`activityRequestSchema`、`ActivityRequest`。构造函数接收当前 SUT 的 `Database`，实例实现 `ObservationRuntime` 的 `capabilities / establish / snapshot / advance / release`，另有 `close()`。把同一个实例放入 `AppContext.testActivityObserver`，须在模块 `recover()` 之前完成注入；默认生产 main 不安装观察者。

helper 接受 `observe-activity` 和 `hold-safe-activity-boundary`，关联同一真实 group/run，声明 `activity-witness / activity-safe-boundary`。同一 run 的 observe 与 safe 租约可以并存；第二个未释放 safe 租约拒绝，避免两个屏障相互影响。控制器负责真实进程归属、guardian token、版本/API 绑定、独立 TTL 和历史租约隔离；helper 不把请求里的 target 当作真实归属证明。本批没有替代已存在的共享传输实现，也没有自行创建公开业务 API。

所有事件追加保存并返回深拷贝；UUID 租约不可重新绑定目标，DELETE 幂等且保留已观察历史。advance 只放行已经命中的屏障；提前 advance 不消费未来屏障，已命中过一次的 safe 租约不会再次拦截后续步骤。TTL 到期和 close 解除等待。关闭 helper 应先于等待 Agent 任务的 app.close，避免关机反等一个尚未释放的测试屏障。

## 真实挂点

| 挂点                   | 见证来源                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ActivityClock 新 owner | session advisory lock 已取得、旧活动基线重设事务 COMMIT 返回之后；每次真实 acquisition 新 UUID epoch                                     |
| ActivityClock 采样     | 原持锁连接上真实 UPDATE 返回之后；只在 observer 存在时增加 RETURNING 读取该次实际账本值                                                  |
| 时钟所有权丢失         | 连接 error 当场撤销完整性，release 同样撤销；不等待下次 500ms tick 才承认丢失                                                            |
| 新 run 创建            | 原 startNext 外层事务确认提交后发布；以整个事务调用前后 performance.now 窗口覆盖 BEGIN 默认时间、INSERT 及提交，不把 INSERT 返回冒充提交 |
| 恢复暂停               | 原 recovery_note 事务确认提交后，报告 recovery-paused；没有清除恢复标记                                                                  |
| 正常终态               | finish 的终止流程进入至终态事务提交确认的单调时钟窗口                                                                                    |
| 审计阻断终态           | completeStep 中 audit_blocked 原事务提交确认；该路径不经过 finish，也已覆盖                                                              |
| 安全续跑               | 合法 get_recent_messages 的实际结果和续跑 history 完成原事务提交后，下一轮模型请求之前                                                   |

安全屏障位于顺序执行且仍持有 run advisory lock 的只读工具路径：当前模型响应已经完成并持久化，实际工具结果与 history 已提交，`inflight_turn=false`，该路径无审计、网关或其他外部请求在途。`stepId` 为实际 run/ordinal 身份的 SHA-256 opaque 映射。屏障不补写数据、替换模型响应或设置业务恢复字段。

持有期间仍为产品真实 active 状态，原 clock 持续记账，观察区间继续增长。仅 clock 连接丢失会使计时完整性变为 false、状态暂为 unknown，**不擅自放行仍由 run lock 保护的屏障**。run lock 的实际 AbortSignal 失效时，则立即撤销 held 证明并抛出原所有权错误，禁止旧执行者继续。迟到的 acquisition/sample 通知不会把已提交的 terminal 或 recovery-paused 改回 active。

## 活动区间与明确的不完整情况

完整性仅在该观察者从真实创建事务开始、始终见证同一时钟所有权 epoch、且已观察到真实状态边界时成立。即便 QA 在创建后才 arm，helper 从模块启动就保留活动 run 的创建与 epoch，因此不会把订阅起点误当 run 起点。使用的是进程 `performance.now()` 的真实边界窗口，`activeElapsedMs` 下界向下取整、上界向上取整；没有按 60000 截断或加业务容差。

`persistedActiveMs` 是原 PostgreSQL 墙钟账本的最近确认值，仅作独立诊断，不替代上述单调时钟活动区间。创建窗口和终态窗口是保守区间，不能据其宽度发明更精确的时刻。terminal 的后续取消/读取也不会重新累计暂停时间。

以下情况均保留 `includesUnsavedTail=false`：首次只看到已存在的 run；新的进程接管；clock/run 所有权丢失；缺失创建或连续活动边界。新进程只能给出自己确实观察到的 epoch 身份，不能假装旧 epoch 已被完整继承。`observedEpochActiveMs` 只表示当前已观测段，绝不写入代表全 run 的 `activeElapsedMs`。首次读取已暂停/终态行，不把订阅后的等待计入活动段。

**当前 QA 兼容限制需要保留：** `qa-acceptance/harness/runtime-observation.ts` 对 `includesUnsavedTail=false` 的事件仍要求有限全 run `activeElapsedMs` 和非空 epochIds。跨强杀的旧尾段没有可证明的完整上界时，本 helper 故意省略全 run `activeElapsedMs`，而不是填一个虚假有限数。当前 QA 会在结构验证时报告 BLOCKED；这也可能使恢复暂停的独立 A5.8 结论先被该结构检查遮住。该缺口必须由双方明确协商不完整证据格式或补充真实跨 epoch 事实来源，不能在控制器中补造区间或宣称已满足原契约。本批未改 QA 校验。

测试范围是单个已注入观察者的 SUT 的真实状态路径，以及明确被识别为不完整的接管情形；没有证明多个独立实例的观察历史自动聚合，也没有建立任意系统故障下的物理实时上界。

## 开发证据

[最终专项日志](evidence/qa-activity-witness-reviewed.log)为 **11/11** 真实 PostgreSQL 自测：晚 arm 保留创建前段、observe/safe 共存、持久结果/history 屏障、保持期计费、5000ms TTL、DELETE、真实 run 锁与 clock 锁连接终止、已有 inflight 恢复暂停、审计阻断终态、创建外层事务回滚、已暂停订阅后取消、迟到 acquisition 通知，以及实际子进程 SIGKILL/重启。日志中部分单条测试包含多个上述检查；不是 11 条独立 QA 验收用例。

实际 SIGKILL 场景先确认 held、结果完成和 `inflight_turn=false`，再在 TTL 内强杀旧进程。第二个真实进程使用同一 UUID 数据库，旧 lease 读取返回 Unknown，原 run 从持久只读续跑点继续，远端只出现原 read 请求及恢复后的下一轮请求，没有网关请求。重启后的事件保留新 epoch 与不完整标记，未返回全 run 活动区间；测试没有清理恢复标记来强制成功。本次短测试停机 200ms 只验证隔离/续跑机制，**没有冒充 QA 的 17 秒请求屏障、5 秒停机及真实一分钟完整用例**。

[联合回归](evidence/qa-activity-witness-final.log)为 **20/20**，包含当时的 8 项活动测试、10 项既有计量测试和 2 项晚派发测试；与最终专项重叠，不能相加宣称独立场景数量。[独立强杀日志](evidence/qa-activity-witness-restart.log)保留较早一次真实重启记录。[类型检查](evidence/qa-activity-witness-typecheck.log)、限定文件 Prettier 与 git diff --check 通过。

[首次运行](evidence/qa-activity-witness-first.log)的 7/8 原始失败也保留：开发测试误以为等待 650ms 必然已经得到超过屏障点 400ms 的持久样本，没有考虑 500ms 周期的相位。测试改为等待实际采样条件，业务时钟、60000ms 预算及 QA 断言均未改。随后独立只读审查发现的两个状态回退/暂停诊断问题均有上述真实 PG 回归。

这些测试直接调用 helper 或开发子进程 IPC，证明挂点和屏障因果；真实 guardian/controller 的 HTTP 组合、token 归属及原 QA 客户端验收由集成入口的独立联调证明，不能以这里的通过数替代。

## 清理

本批仅使用专用容器 `kapibala-activity-witness-dev-20261001` 的 `127.0.0.1:64561` 和新 UUID 数据库。[清理记录](evidence/qa-activity-witness-cleanup.json)确认测试数据库/连接均为零、实际子进程已退出，之后移除本批容器和依赖软链接。未触碰演示环境或 QA staging `.runtime/qa-fixtures/5d1885e76871460bb0c146fd4cc90032`。
