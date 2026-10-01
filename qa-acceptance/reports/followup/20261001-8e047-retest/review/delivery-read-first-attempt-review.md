# INT-READ-001 首次执行归因

run `2026-10-01T15-29-58.209Z-a06abe2a`，固定8e047 / QA02ea807；原始 **BLOCKED**，独立审阅仍 **BLOCKED（QA夹具解码错误）**。不是产品通过，也未取得5秒产品失败证据。

真实自有容器 `50cf4d9ec870de6ba4793844f8a89acd6e1f928d379f2a7d40925ad260c8e8e9`，owner `8e1426c5-f4d7-4708-af3f-8cf69c431078`，回环端口49998，数据库 `qa_28e23dcabce14e80be3f0a6b`。locker PID69和 backend_start `2026-10-01 15:30:00.468878+00` 一致，实际持有 AccessExclusiveLock。OID定位为数字16447，而PG json_build_object返回relation字符串"16447"；helper严格数值比较导致误拒绝。此处 idle in transaction 是 QA 正在持锁的自有连接，不是 SUT 泄漏。

15:30:01.647Z取得锁，15:30:01.650Z只采样一次即停止；15:30:01.651Z真实QA locker ROLLBACK完成，两条自有连接随后endCompleted。PG错误为空，fixture cleanup.failures为空。工具流只到send-wait-started，无真实result-ready/returned/history；锁内等待、实际PG reader候选、解锁后sent与同key恢复未执行。测试总耗时5106ms含准备与清理，不能冒充工具5秒时限。清理快照有一次send请求，但无实际send effect，不能据此宣称成功或失败落地。

runnerErrors为空；raw results.integrity保留 `执行器整体状态: failed`，这是本次单例BLOCKED伴随runner整体failed的真实汇总字段，不写成空。

已授权的最小源码修正仅将PG诊断SQL中的l.relation显式cast为bigint；归属helper、同表锁模式及pg_blocking_pids判断未放宽。typecheck、既有5条工具自测、diff检查通过；不增加只复述SQL字符串的镜像断言。旧B和raw保留，真实PG验证待主任务重新冻结后新单例执行。现有tool→PG query/transaction唯一关联缺口继续保留，不因OID修正就宣布SUT取消/ROLLBACK已证实。

[机器审阅与本次原件哈希](delivery-read-first-attempt-review.json)。本归因只读原记录；授权的源码修正独立于旧执行版本，未操作产品或改写原结果。
