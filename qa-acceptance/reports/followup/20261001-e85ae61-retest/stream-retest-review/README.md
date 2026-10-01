# INT-STREAM-001 / 002 原始证据独立复核

2026-10-01，AI QA 只读复核。两条所选用例的实际证据支持本轮 **PASS**；未重新运行产品。离线分析完成 429 项一致性检查，详见 [review.json](review.json) 和可重复执行的 [analyze.py](analyze.py)。分析文件只读取既有证据，不导入产品或发起网络请求。

本轮工具阶段是 `developer-preflight`，属于登记子集的独立 QA 复测。它不构成 `e85ae61` 全业务验收或上线通过；同 run 的 ARC-UI-015 不在本次审阅范围内。runner 已结束且无 runner/integrity/rejected-attempt 错误，两条都是 attempt 0。

| 绑定 | 值 |
| --- | --- |
| run | `2026-10-01T12-46-08.250Z-9b50fc8a` |
| SUT | `e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb` |
| QA | `526d814db45d15896f96563e7a2a8b8f75064f81` |
| QA authored source SHA256 | `4dc2715ee57cf8deb83c831977432bf5c49d0a52942eff0022b6f9abbd3002fc` |
| target SHA256 | `3b41aa332cf319c6583b7dd452e54d66512071ec94281c779d00b182415f6115` |
| suite | `qa-observation-correction-retest-20261001` |
| suite SHA256 | `926a9c58e7d43d8c417c445412c6ffb43f0f9def0d857d1ef67b718ab2c3ad45` |

绑定来源：[manifest](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/manifest.json)、[runner-summary](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/runner-summary.json)、[results](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/results.json)。机器分析保留所读 23 个原始文件的当前字节数和 SHA256。

## INT-STREAM-001

| 真实观察 | 结果 |
| --- | --- |
| 网关工作消息 | 8,208 条；另有 1 条 pause-checkpoint，台账合计 8,209 条 |
| 健康消费者 | 工作消息 8,208 条完整、无重复、组和身份正确；含 auth/checkpoint 共 8,210 个应用帧 |
| 暂停消费者 | 暂停时 seq 13、2 帧；恢复读取前仍 seq 13、2 帧 |
| 关闭前实际收取的工作消息 | 恢复读取时排空缓冲取得 3,454 条；最终真实 lastReceivedSeq=3,467 |
| 新连接回放 | auth sinceSeq=3,467；完整收取缺口 4,754 条，seq 3,468–8,221 |
| 完整性 | 慢侧已收前缀与回放拼接，逐个 `(seq,msgId,groupId,isOwn)` 等于健康侧完整有序集合 |
| 公开历史 | 实际 165 页、每页 limit=50，共 8,209 条；身份唯一，所有 text/sentAt 与独立网关台账逐条相等 |
| 实际应用 payload | healthy 2,041,887 B；slow 858,141 B；replay 1,183,776 B；单帧最大 249 B |
| 清理前异常 | 三 reader 的 errors/protocolErrors/resourceErrors 均空；网关 backgroundErrors 空；本例最终 server.log 无 warning/error |

payload 数字是接收到的 WebSocket 应用载荷，包含 auth/checkpoint；不是 TCP 总字节，也不是发送正文长度。正文注入量为 1,189,060 B，没有将正文尺寸替代真实 WS 尺寸。

[真实 reader 账本](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-344ee-ived-cursor-replay-complete-system/evidence/real-reader-receipts.json)、[API 逐请求记录](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-344ee-ived-cursor-replay-complete-system/evidence/api.ndjson)、[独立网关台账](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-344ee-ived-cursor-replay-complete-system/evidence/external-facts.json)。

关闭是实际产品连接事件。slow 的本机 TCP tuple 为 `127.0.0.1:56519 → 127.0.0.1:56486`；原始服务端日志中反向 tuple、connectionId `e73039d8-d0ea-4e95-bdcd-57b77fd9cefc`、PID `58680` 一致：

| 原始日志行 | 时刻 UTC | 事件 |
| --- | --- | --- |
| 71 | 12:46:11.519 | configured：maxBufferedBytes=1,048,576，sendTimeoutMs=5,000，closeGraceMs=1,000 |
| 74 | 12:46:11.522 | realtime-auth：首次连接，requestedSinceSeq=null，replayAfterSeq=12 |
| 76 | 12:46:30.225 | close-requested：trigger=send-timeout，code=1013，reason=`Slow consumer; reconnect to resume` |
| 77 | 12:46:31.225 | terminate-requested：同一 trigger/code/reason |
| 78 | 12:46:31.226 | closed：trigger=send-timeout，实际 code=1006，reason 空 |

客户端恢复读取后于 12:47:00.516 观察到 `1006 / transport-ended`。这是暂停网络读取后延后获知关闭；原值没有被改成 1013，也没有声称收到有效 peer close frame。没有 QA 本端 terminate 先行。原因归属依赖以上真实同连接完整日志链，而不是凭 1006 或公开阈值推断。捕获时原日志前缀 126,591 字节的 SHA256 已重新计算匹配 `2b8541ec237e7c99b63e9dce40e32407231ea102dd4d2ab78d024180eec77c98`；所引五行与最终 [server.log](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-344ee-ived-cursor-replay-complete-system/evidence/server.log) 原行逐项相等。

实际触发 **send-timeout**。close-requested 的 bufferedBytes=253、maxObservedBufferedBytes=253，terminate 时 max=291；不能表述为触发 1 MiB 高水位。healthy/replay 在断言完成前均未关闭；其后 QA cleanup 的本端终止单独记为 `local-termination / cleanup`，slow 原始关闭保持不变，见 [after-cleanup](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-344ee-ived-cursor-replay-complete-system/evidence/real-reader-after-cleanup.json)。

注入 13.549 s，健康排空额外 19.324 s，历史遍历 7.947 s，回放观察约 1.052 s。这些只是本轮测量，不新增吞吐或恢复 SLA，不证明任意规模/任意故障窗口的普遍保证。阶段相对耗时使用各自 monotonic 记录；Playwright 派生 completedAt 与最后阶段墙钟存在约 465 ms 差异，不将跨记录墙钟差当成产品计时精度结论。

## INT-STREAM-002

实际初始集合为 58 条外部消息加 1 条 accepted 自发消息。先取首屏 limit=7，再从该**同一个 nextCursor** 以 50/50 读取剩余 52 条，固化 59 条完整记录；不是拿另一份新快照假定内容相同。

之后独立网关产生真实 `message_sent` 确认、新消息和历史补投。随后从原首屏 cursor 按下列实际请求继续：

| 请求 limit | 1 | 9 | 4 | 17 | 3 | 1 | 9 | 4 | 17 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 实际返回条数 | 1 | 9 | 4 | 17 | 3 | 1 | 9 | 4 | 4 |
| api.ndjson response 行 | 108 | 110 | 112 | 114 | 116 | 118 | 120 | 122 | 124 |

每次请求都使用前页实际返回 cursor，最终 nextCursor 为空。最终 59 条与原同 cursor 完整快照**全部字段、身份顺序和内容精确相等**。原自发记录仍是 accepted、msgId=null，原 sentAt 不变。刷新后的真实 API 两页（行 104/106）返回 61 条：新消息在前、原 59 个身份随后、历史补投最后；同一个自发 id/clientMsgId 已为 sent，并绑定真实网关 msgId/sentAt。所有刷新记录 text/sentAt 与网关 61 条真实消息逐条相同，网关实际 send effect 恰好 1 次。

[同 cursor 原始快照](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-a7924--confirmations-and-backfill-system/evidence/same-cursor-before-confirmation.json)、[冻结/刷新对照](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-a7924--confirmations-and-backfill-system/evidence/frozen-page-size-change.json)、[真实请求链](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-a7924--confirmations-and-backfill-system/evidence/api.ndjson)、[独立网关副作用与事件](../../../preflight/2026-10-01T12-46-08.250Z-9b50fc8a/artifacts/system-integration-streams-a7924--confirmations-and-backfill-system/evidence/external-facts.json)。

该样本 `queryRequestsBeforeSnapshot=0`，不能声称实际 by-client-id 查询命中过屏障；这里有实际 accepted 完整快照以及之后独立 `message_sent` 事件，已建立此用例所需“先冻结 accepted、后确认变化”的前提。未额外推断其他确认路径。

## 原始结果与边界

首轮 `2026-10-01T12-26-30.110Z-c5165321` 的 INT-STREAM-001 仍为 **BLOCKED**：`Bounded healthy drain did not establish the complete injected set`。[首轮 results](../../../preflight/2026-10-01T12-26-30.110Z-c5165321/results.json) 未改写。首轮实际只注入 2,848 条、healthy 收到 1,209 条工作消息；本轮完成了之前未建立的关闭/完整回放证据，但不删除首轮 QA 观察自耗时问题及当时产品错误日志。

两个 manifest 的 slow-reader profile 字节哈希相同：`f4b59b4d1220ed60558a8f12379021fb014f82dd326920e41bde1f2812fd7cdb`。本轮不是扩大预算或删除数据断言换取 PASS。另逐字节校验了首轮 7 份原始文件，与既存 [首轮归因哈希](../stream-postmortem/triage.json) 完全一致，包括 trace.zip、reader 账本、网关台账和 server.log。

两例 cleanup.json 均报告 failures=[]。本报告仅核对 runner 清理记录和客户端关闭归属；容器/卷/进程逐项清理的独立审计由整体资源审查记录承担，不从空 failures 推断完成所有资源审计。
