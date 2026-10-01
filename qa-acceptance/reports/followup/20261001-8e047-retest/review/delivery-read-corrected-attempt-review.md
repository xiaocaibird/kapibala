# INT-READ-001：OID 修正后独立复核

**原始 FAIL，独立审定仍为 FAIL。** 本次原工具状态等待区间是 **[5000.443875, 5000.529792] ms**，安全下界已超过原 5000 ms 上限；后续恢复成功及 PG 精确查询关联缺口都不能抵消这项失败。

run `2026-10-01T15-58-10.937Z-4ed62619`；SUT `8e047aea842bfcec64802e4918b52b460b93c48b`；QA `b076790de087406de12336bdfd385a569b014f83`；QA 源指纹 `3f3a11385b0f8008fc604b543e4ce89a6b687a391f63aa2f4b19c5c5588301bd`。phase 为 `developer-preflight` 的注册单例，首次 attempt 0。runner 已结束，runnerErrors 和 integrity 均空。测试总耗时 7240 ms 包括准备、取证与恢复，**不作为工具时限**。

## 严格工具时限

同一真实应用 PID46391 / 时钟 `process-performance:46391:fa0a00e2-541f-4d67-a309-3cdb5f5e741e`，原 run `14672e0e-634d-4b73-98ef-d38a1fb6f545`：

| 阶段 | 单调时间区间 ms |
|---|---|
| 原 key 解析 → 等待开始 | [1600.735416, 1600.790041] |
| 原结果 ready → 实际交还 | [6601.233916, 6601.265208] |
| 由原始十进制端点计算的等待 | **[5000.443875, 5000.529792]** |
| 原结果 history COMMIT | [6605.6145, 6605.6145] |
| 后续同 key 等待 | [1.792125, 1.848125] |

原执行 attempt `523986d2-09d4-4a0f-8290-2bc9ac6729c3` 的四个计时事件、结果与 history 均同身份。history COMMIT 晚于实际交还，单独留证，**没有混入计时结束点**；下一 turn、QA 轮询和表锁获取时刻也未用作工具时钟。三处断言留痕是同一硬超限的重复核对，只计一项产品失败。

## 真实表锁与查询证据

容器 `3d9ee663bedb8c271c3ea5b170a6d320d877e69dba414532336e8a36a1b2cacc`，owner `f50f8f80-1ea9-4ba5-b935-e77b556780b0`，唯一回环端口54949；本例数据库 `qa_8334bfd4143c4424bcf8c2b7`。locker PID69、backend_start `2026-10-01 15:58:13.571831+00`，故障定位 OID16447 已正确解码为数字。

197 次独立 PG 采样都确认本例 locker 持有 `AccessExclusiveLock`；其中195次实际捕获读者以 `AccessShareLock` 等待，`pg_blocking_pids` 指向69。共34个不同查询实例、3个backend：

- PID68：32次 `SELECT * FROM messages WHERE client_msg_id=$1`，原始 query_start/xact_start 均保留。工具返回后最后采样为 idle、xact_start=null、无关系锁，且已执行另一条 `UPDATE agent_runs SET inflight_turn=true...`；这是该连接当时没有未结束事务的证据，不是完整 ROLLBACK 因果链。
- PID71/72：两个不同后台形状的 SELECT 仍被同一表锁阻塞。不能把这两条后台读取自动归因成被遗弃的工具查询。

实际工具返回时锁仍在。最后 PG 采样的 QA 父时钟包络为 `[8308.807458, 8310.373875]`，QA locker 随后于 `[8310.533667, 8311.000208]` 完成真实 ROLLBACK。父时钟、应用单调时钟、PG 时间戳分别保留，未相互直接相减。此 ROLLBACK 属于 **QA locker**，不是伪造的 SUT 清理事件。

现有公开 tool-wait 流未关联 PG backend/query/transaction attempt。虽然 PID68 的查询形状和行为吻合，仍不能严密证明它就是该工具的每一次读取，也不能证明每次服务端取消与串行 ROLLBACK 的完整顺序。因此该细分义务继续为 **BLOCKED**；不会把整个用例从已证明的 FAIL 降为 BLOCKED。

## 恢复、历史与清理

解锁恢复后公开消息中原 `clientMsgId=3f3d3c3d-4677-4465-89d8-305e924ac8b0` 唯一且为 sent，正文一致。原 run 正常 finished/final：第一工具保留 SEND_TIMEOUT，第二次同 key 返回原 clientMsgId/sent、非错误；两步 history 都对应各自真实 execution attempt。独立账本显示审计1次、send请求1次、实际落地1次、Agent turn共3次，没有用重发制造恢复。

实际 send 响应504、效果于 `15:58:16.198Z` 落地（UTC）。故障期间配置了查询不可用，但本次账本没有实际503确认请求；表锁阻塞了其他读取，解锁后只记录一次200确认请求。**不宣称此次覆盖了503 HTTP查询分支。**

QA locker ROLLBACK成功，两条QA连接 endCompleted，pgErrors为空，fixture cleanup.failures为空。该只读复核未额外执行 Docker/PG 请求，因此不冒称独立复查了每个匿名卷删除，也不把 fixture 清理记录当作 SUT ROLLBACK 已证实。

首轮 `2026-10-01T15-29-58.209Z-a06abe2a` 的 OID 类型错误及原 BLOCKED 完整保留。本次是修正 QA 前提后的新执行，不覆盖旧结果，不代表新候选全量业务验收或上线通过。

[机器审阅与225份原件哈希索引](delivery-read-corrected-attempt-review.json)保存本次原始事件、精确十进制计算、完整关联和逐项证据；[首轮前提归因](delivery-read-first-attempt-review.json)单独保留。
