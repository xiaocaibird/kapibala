# message_sent 首次接收记录持久化

本轮基于 `7339f7e2851ad6efc0679a958e485f995374acf0`，对应已确认的“常规完全符合原文、极端合理处理”。原文 [B1 序列排期](original-interview-question.md)（第 294 行）把发出定义为收到 `message_sent` 的时刻；第 192 行要求重启前后行为成立，第 73–74 行允许历史重放、重复与乱序。本轮保留这些定义，不采用网关 `sentAt`、数据库处理完成时间或重放时间补造已丢失的原始接收时间。

## 实现

- `GatewayEvents.process()` 仍在入口同步捕获本进程首次观察时间，以 `(clientMsgId, msgId)` 为确认身份。相同身份的新 `eventId` 不能改写时间；不同 `msgId` 仍由现有重复远端投递检查处理。
- 新增 `message_sent_receipts`：通过独立自动提交写入，再进入已有事件去重和业务事务。因此消息行锁、业务回滚、失败重试以及业务事务前后的进程死亡不会撤销已经提交的接收记录。重复插入只读取赢家时间，不更新它。
- 新迁移 `008` 从消息保留已有真实本地观察时间；对于旧去重账本中已处理、但没有真实观察时间的确认，建立时间为 `NULL` 的历史占位。之后重放不能给这类记录制造历史时间。只有通过查询/回显确认、尚未收到显式 `message_sent` 的消息，仍在首次显式确认时记录真实新观察。
- 历史迁移不变，007 对旧活动序列的升级拒绝仍保留；008 不重排或停止已有 version-7 序列。迁移账本测试的两个固定目标版本改为当前迁移集合版本。
- `recordSent` 的原有首次观察 `COALESCE`、冲突消息 ID 守卫、序列恢复规则和预算均未改动。没有增加外部能力，也没有引入全事件 inbox/队列。

## 可复现验证

所有数据库测试使用 `127.0.0.1:64550` 的可抛 PostgreSQL；测试工具先创建 UUID 临时数据库，仅在该临时库迁移和写业务数据，清理只删除自己创建的库。不触碰管理库业务表、演示库、QA 资产。

| 专项 | 验证内容                                                                                                              | 结果                 |
| ---- | --------------------------------------------------------------------------------------------------------------------- | -------------------- |
| CR01 | 7→8 升级、账本写入故障时全迁移回滚、重复迁移、真实旧时间与历史未知占位、当前活动序列不被重排                          | 通过                 |
| CR02 | 接收记录已提交后业务触发器失败；新 handler、原 handler 重试、不同 eventId 重放均复用原时间；不同 msgId 不覆盖消息时间 | 通过                 |
| CR03 | 接收记录写入失败时不应用业务；存活进程保留入口时间并在重试时写入                                                      | 通过                 |
| CR04 | 独立 Node 进程接收记录提交后阻塞于消息行锁，真实 SIGKILL；另一独立进程重放后复用原时间，序列下一步仍为原时间 + 60 秒  | 通过                 |
| CR05 | 两个独立进程竞争，同一确认较早观察者在 INSERT 前被数据库锁阻塞；较晚观察者先可靠记录，前者恢复不能反写较早时间        | 通过                 |
| CR06 | 独立进程已捕获观察时间、尚未提交接收 SQL 时真实 SIGKILL；无持久记录，新进程只能建立新的可靠观察，明确不声称恢复原时间 | 通过，保留此极端边界 |

专项首次 6/6 通过，另重复三轮共 18/18 通过。既有 `gateway-observation-repair`、`core-automation-repair`、`gateway`、`gateway-stream-repair`、`migration-integrity` 共 70/70 通过；服务端 TypeScript、变更 TypeScript 格式、`verify:original` 和 `git diff --check` 通过。此处不声称全套或浏览器验收通过，主线负责集成回归。

复现命令（先准备可抛 PG 64550，使用本项目已安装依赖）：

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres \
node --import tsx --test --test-reporter=tap tests/integration/confirmation-receipt-hardening.test.ts
```

原始 TAP：[首次专项](evidence/core-confirmation-receipt-focused.tap)、[既有定向回归](evidence/core-confirmation-receipt-regression.tap)、[重复 1](evidence/core-confirmation-receipt-repeat-1.tap)、[重复 2](evidence/core-confirmation-receipt-repeat-2.tap)、[重复 3](evidence/core-confirmation-receipt-repeat-3.tap)。CR04–06 的真实子进程信号、时间与退化说明均写在 TAP 诊断 JSON 中；[子进程程序](../tests/support/confirmation-receipt-process.ts)和[专项用例](../tests/integration/confirmation-receipt-hardening.test.ts)一起保存。本轮没有初始失败后被覆盖的测试日志。

## 保留的边界

1. 单进程正常接收及已可靠提交后的恢复均使用首次本地观察时间。独立接收记录提交以前发生硬崩溃、没有其他存活记录的窗口，原始物理接收时间不可还原。CR06 在测试适配层暂停于 SQL 提交前后发送真实 SIGKILL；不能把杀死一个已经提交 SQL 的客户端等同于证明 PostgreSQL 一定回滚该自动提交语句。无原始记录时重放所建立的是新的可靠观察，不能声称满足丢失原始接收时间的严格恢复。
2. 多实例的选择是同一身份第一条成功可靠记录携带的本地观察时间，不保证所有进程中物理接收最早者获胜，也不以更早的迟到写入回拨时间。CR05 明确测得这一区别；跨进程时钟本身仍依赖部署时钟一致性。
3. 历史未知占位继续为未知，不用升级时刻补值。保证适用于升级后的消费进程；旧程序仍运行并消费时不会自动获得新写入逻辑。
4. 这是独立确认时间事实，不是持久事件队列；业务恢复继续依靠原有历史重放/去重机制。未新增接收表清理策略，不更改原有事件留存或 sequence 重启排期。
