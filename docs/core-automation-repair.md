# 原始核心补修：序列观察时间与跨群调度

本轮基线 `fa1baa7d7524bf16f379c9c2837fa8cc9ef0bcac`。只修 R09/B1 的排期来源、R05 中自动化被单群锁阻塞的路径；人工验收暂停，增强项继续仅记录。原文未修改，演示服务和演示数据库未升级。

## R09：消息已发出与收到 message_sent 分开记录

原实现 `recordSent` 在首次确认后提前返回，**不是重复确认反复刷新 `updated_at`**。实际问题是自己的 `message` 回流经查询匹配、或 by-client-id 查询先确认时，`delivery_status` 已为 `sent`；序列把该次 `updated_at` 当作 B1 所说收到 `message_sent` 的时刻，提前排下一步。

新增 `messages.message_sent_observed_at`。只有 `message_sent` 分支传入本地观察时间；事件进入 `process`、任何 await 和行锁等待之前取时间，同进程失败重试复用首次值。`recordSent` 即使之前被回流/查询置为 sent，也补写该专用字段；重复确认通过 `COALESCE` 保持原值，不同远端 msgId 不写观察值。消息自身的网关 `sent_at` 仍用于时间线。

序列只有在消息为 sent 且专用观察时间存在时，才将该步置为 sent，并以该时间加下一步延迟。回流/query 先确认不会排下一步，也不会重发已有 clientMsgId；普通事件、限流、跳过与终态取消仍走既有路径。步骤 skipped 使用实际跳过时间。专用时间一旦提交，正常重启读取持久值，不能被重放改写。

证据边界：同进程数据库写失败重试保留首次收到时间；已提交记录经模块重建保持。若进程在首次观察尚未成功持久化时硬终止，本地内存里的时刻无法还原，恢复后只能观察网关重放到达。此次没有新增持久收件箱或声称该任意硬崩溃窗口被消除。

## 007 升级前置条件

历史 `updated_at`、`gateway_events.processed_at` 都不能还原首次收到事件时间，迁移不回填它们，不改历史已推进的步骤。迁移 `007_message_sent_observation.sql` 遇到任何 running 序列直接失败，整个迁移事务回滚。

升级时先保持旧版本工作，使既有序列自然完成；不要为升级取消它们，不要启动新的序列。只读预检：

```sql
SELECT id, group_id, current_step_index, created_at
FROM sequence_runs
WHERE status = 'running'
ORDER BY created_at, id;
```

结果为空后停止旧服务，再执行迁移与新版本启动，避免预检后旧实例又创建新运行。本轮没有在演示环境执行这些步骤。历史已结束消息的专用字段保持 null，表示没有记录；已去重的旧事件不会补成新的观察时间。同版本已应用 007 后正常迁移重跑和服务重启，不会因新运行正在进行而触发该升级前置检查。

## R05：让锁忙的群延后一个调度周期

复现不仅涉及显式 `startNext` 群锁：扫描阶段批量插入 `agent_pending` 的外键检查也会取得群/消息的 key-share 锁，等待成员事件持有的群行锁。因此只修 startNext 仍不能隔离另一群。

扫描按群执行短事务；扫描、Agent 启动、序列推进及接管重排使用事务局部 `lock_timeout = 50ms`，只将 PostgreSQL `55P03` 视为本轮锁忙。整个事务回滚后继续其他群，下一 tick 重试；其他错误照常抛出，调度器失去所有权的取消信号也优先抛出。超时同样可能来自事务中的账号、消息、步骤、唯一键或事件提交锁，故不能把每次超时断言为群锁问题。

保留原有同群锁序、部分唯一索引、CAS、待处理消息身份、发送队列和最多四个 Agent 执行槽，没有按群无限并发。锁忙回滚不创建 run、不消费待处理消息、不耗 Agent 步、不提交发送。每轮遍历所有待处理群，锁忙的群在后续轮次重试；持续持锁的群仍无法推进。50ms 是单次锁获取等待限制，**不是全局 tick 耗时或所有数据库阻塞的严格上界**；连接池等待、活动时钟初始化/采样以及任意数据库故障不是此修复所声称解决的场景。

接管调度器保留尚未完成重排的 run 集合；一个群锁忙时其他群可继续，该 run 在恢复成功前不能进入正常派发。释放锁后先补齐确认，再仅重排最早一个过期未入队步骤，按实际成功重排时间加该步 delay。原有调度器失锁栅栏保留。

## 验证与复现

使用独立容器 `kapibala-automation-2f9fdc467b40`、镜像 `postgres:17-alpine`、Docker 随机映射端口 `127.0.0.1:62258`。新专项每例创建 `kapibala_test_<UUID>` 数据库，旧 automation 文件仅在该独立容器的管理库内创建随机 schema。远端 Agent/members/query HTTP 服务使用随机端口。没有访问 `55432` 演示库。

先在未改产品的 fa1baa7 上执行首批四例，**0 passed / 4 failed**：echo 和 query 提前产生步骤 sent_at；普通事件观察不等于所断言的接收窗口；锁住一个群一秒，tick 仍不返回。修复后专项共九例：

| 场景 | 直接断言 |
|---|---|
| 回流先到、query 先确认 | 消息可为 sent，但步骤无 sent_at、下一步无 scheduled_at；等超过 delay 也只有一条出站，关闭/重建后等 message_sent 才推进 |
| 普通 message_sent、重复事件 | 步骤时间在本地接收窗口内；下一步精确 +500ms；重复 eventId 和新 eventId 的重复确认均不漂移 |
| 外部群行锁 | 另一群 Agent 正常结束、序列入队；被锁群零 run/零入队；释放后各恰好一次；该次合跑 tick 134ms 返回 |
| 真实慢 members HTTP | 成员事件尚持有群锁、事件事务未提交时，另一群 Agent/序列仍推进 |
| 接管中群锁忙 | recover 可返回，未恢复 run 不派发；释放后先重排完整 delay，后续步骤仍未排期 |
| skipped | 仍以实际跳过时间精确 +500ms |
| 行锁等待 + 事务故障 | message_sent 先等待 120ms 行锁，再触发数据库写失败；50ms 后重试仍保存进入 process 时的观察值 |
| 升级 | 旧 running 时 007 拒绝且没有新增字段/改运行；旧运行结束后可应用，历史值 null；同版本有新 running 时 migrate 重跑正常 |

实际命令：

```sh
PATH=/Users/zcm/.nvm/versions/node/v24.21.0/bin:$PATH \
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:62258/postgres \
node --import tsx --test \
  tests/integration/core-automation-repair.test.ts \
  tests/integration/automation.test.ts \
  tests/integration/core-automation-closeout.test.ts
```

**60 passed / 0 failed / 3 skipped，17.889 秒**，含原有同群并发、限流、预算、审计、失锁、停机恢复与初始化栅栏回归。三个 skipped 是需要显式启用的真实 12 秒 turn / 三次 5 秒 audit / 60 秒活动预算长测，本轮没有冒称重跑。`npx tsc --noEmit`、格式检查、`git diff --check` 与原文 SHA 检查通过。清理时出现一条 `idle_connection_error: terminating connection due to administrator command`，测试/清理 hook 仍通过；不隐藏该日志。结束前在此独立容器只读查询，`kapibala_test_%` 数据库和 `automation_%` schema 均为零；随后停止并由 `--rm` 删除该容器，移除工作区临时 node_modules 符号链接。

## V-SEQ01 与未关闭的协议限制

只读核查：启动参数和定义在当前 API 中没有运行中修改入口，步骤索引连续并按序解析；变量只由固定 `vars` 与逐步非空 `stepVars` 决定，解析函数无时间/远端依赖，每步复制取值与来源。对这些固定输入，启动时预计算文本与发送时重算结果等价。预检也需要同样遍历所有步骤。没有为措辞差异重写实现；此结论不外推至未来新增运行中修改变量的 API。

CG05 的不确定 kick、CG06 的丢失 Agent 原轮响应、CG08 的硬终止活动计量缺口仍以 `core-automation-closeout.md` 的协议分析为准。本轮没有增加网关操作幂等/结果查询、Agent turnId/原响应查询或可严格计量任意停机瞬间的新协议；不据此承诺所有未知操作自动恢复或精确 60 秒。人工验收与偏差接受均未代替用户确认。
