# 正式 2716abd 六项恢复边界：独立逐项审定

审阅者：独立 AI QA；本次只读原始工件，无产品执行、无源码/断言/原结果修改。审阅时间：`2026-10-01T14:57:47.966307+00:00`。

本次六项审定均为技术 **FAIL**：四条 BLK-EXT 的原分类为 BLOCKED，另两条原分类为 FAIL。四项 B→F 依据为完整故障链与同一公开资源明确停止自动恢复的说明，不以 20 秒等待判永久停滞。REC-007 的 30 秒诊断超时也不是失败依据。

**运行仍在进行，最终 events.json 和全运行源完整性尚待核对。** 此处 rawStatus 取自已完成用例的 error-context.md 与固定 reporter 的分类规则；六例都有清理完成记录且 failures=[]，相关 47 份输入在审阅末尾重新核对哈希一致。本文件是逐项事实审定，不签发整轮报告、不补造未执行的后半段。后续须绑定最终唯一 attempt=0、system 项目及原 events 状态，如不一致立即重新核查。

精确版本：`2716abdd2d43a779b6a0972a6323f895cf2b5b9c`；QA `ec46f9b30fb2f5a312c92fc78463ddbfe200042f`；源树 `40b301c87542929beab4974f140879da2a698ac9498056cc2c3a3c5c1f52b0bd`；target `6ccd4df091116eea6ee0324771526dde531bb834d5e3264bc76c5e9f706a028e`；run `2026-10-01T14-26-25.068Z-1e0cb38a`。

| 用例 | raw → reviewed | 直接证据 |
|---|---|---|

| BLK-EXT-002 | BLOCKED → FAIL | 360 个同资源 HTTP 200 响应有一致暂停说明；api.ndjson:30 / 748 |

| BLK-EXT-003 | BLOCKED → FAIL | 349 个同资源 HTTP 200 响应有一致暂停说明；api.ndjson:30 / 726 |

| BLK-EXT-004 | BLOCKED → FAIL | 351 个同资源 HTTP 200 响应有一致暂停说明；api.ndjson:72 / 772 |

| BLK-EXT-005 | BLOCKED → FAIL | 353 个同资源 HTTP 200 响应有一致暂停说明；api.ndjson:72 / 776 |

| REC-007 | FAIL → FAIL | 531 个同资源 HTTP 200 响应有一致暂停说明；api.ndjson:72 / 1132 |

| INT-MSG-007 | FAIL → FAIL | 原排期允许上界 14:49:46.558；实际 14:49:48.862，至少晚 2304 ms |

## BLK-EXT-002

[本例原始证据目录](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-83d92-iled-without-another-create-system/evidence)；[原始错误](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-83d92-iled-without-another-create-system/error-context.md)。

原资源 `8e3c72ba-458c-45e5-9f61-01536e9edc0e`；自有数据库 `qa_3efc4b1e57374caabd98e1ee`；kill `2026-10-01T14:52:45.762Z`，guardian PID `97097`。清理完成 `2026-10-01T14:53:06.289Z`，没有清理失败。

14:52:45.761 真实 create 产生 `gateway-group-1`，请求 #8 的 after-effect 屏障命中；原响应连接在 finish 之前关闭，崩溃点没有 responseStatus。重启后相同 job `8e3c72ba-458c-45e5-9f61-01536e9edc0e` 的公开说明为“建群请求已开始但没有保存结果；网关没有查询本次创建结果的接口，不自动重新建群。”远端始终一个原群、一次 create，但 job 未自动完成。因此证明的是强恢复不符合，不是已经重复建群；未向 SUT 注入私有远端身份。

HTTP 原文定位：[api.ndjson](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-83d92-iled-without-another-create-system/evidence/api.ndjson) 第 30 / 748 行，首/末请求时间 `2026-10-01T14:52:46.228Z` / `2026-10-01T14:53:06.228Z`；resource ID、note、状态及 requestId 全部保存在 JSON 审定记录。

## BLK-EXT-003

[本例原始证据目录](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8943-acts-and-the-two-call-limit-system/evidence)；[原始错误](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8943-acts-and-the-two-call-limit-system/error-context.md)。

原资源 `2385e426-bae3-4a33-8619-a85b04233d45`；自有数据库 `qa_d0092afe010b4434a17bc897`；kill `2026-10-01T14:53:09.025Z`，guardian PID `98852`。清理完成 `2026-10-01T14:53:29.567Z`，没有清理失败。

14:53:09.023 首次 promote 实际把首成员设为 admin，请求 #12 在响应完成前断开；重启同 job `2385e426-bae3-4a33-8619-a85b04233d45`，公开说明为“提升管理员请求已开始但没有保存结果；网关没有查询管理员角色的接口，结果未知时不自动重试。”最终仍为一次 promote、角色 admin、一个远端群，未进入第二次 promote 屏障，不冒称验证了双次丢响应。失败是原 job 明确不自动正常完成，未见调用超限。

HTTP 原文定位：[api.ndjson](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8943-acts-and-the-two-call-limit-system/evidence/api.ndjson) 第 30 / 726 行，首/末请求时间 `2026-10-01T14:53:09.498Z` / `2026-10-01T14:53:29.498Z`；resource ID、note、状态及 requestId 全部保存在 JSON 审定记录。

## BLK-EXT-004

[本例原始证据目录](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-1e31b-joined-target-after-restart-system/evidence)；[原始错误](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-1e31b-joined-target-after-restart-system/error-context.md)。

原资源 `7d503442-5a82-40f3-83bf-739b73e266e2`；自有数据库 `qa_30a1db5360474512b6e26582`；kill `2026-10-01T14:53:53.419Z`，guardian PID `1597`。清理完成 `2026-10-01T14:54:15.021Z`，没有清理失败。

14:53:53.413 旧 kick 真正移除目标，响应连接未完成即中断；停机后旧请求完成，member_left 事件 #5 于 14:53:54.424 记录，重入 member_joined #6 于 14:53:54.465 记录，顺序没有倒置。重启后的同 run `7d503442-5a82-40f3-83bf-739b73e266e2` 公开说明：`A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.` 与固定公开恢复说明的保守暂停语义一致。原 kick 仅一次，重入目标仍在，旧步没有标错；不符合的是原 run 自动继续并正常结束，不是已实证重复踢人。

HTTP 原文定位：[api.ndjson](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-1e31b-joined-target-after-restart-system/evidence/api.ndjson) 第 72 / 772 行，首/末请求时间 `2026-10-01T14:53:54.951Z` / `2026-10-01T14:54:14.952Z`；resource ID、note、状态及 requestId 全部保存在 JSON 审定记录。

## BLK-EXT-005

[本例原始证据目录](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8352-history-and-effects-survive-system/evidence)；[原始错误](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8352-history-and-effects-survive-system/error-context.md)。

原资源 `7ace8a52-b075-429b-98bc-9a086cacf647`；自有数据库 `qa_8c7680c7794748bd82dfb7b7`；kill `2026-10-01T14:54:18.234Z`，guardian PID `3648`。清理完成 `2026-10-01T14:54:38.780Z`，没有清理失败。

原 send 已真实落地且工具结果进入第二次 turn 请求历史。第二次模型请求 #3 在 14:54:18.226 命中 before-response 屏障，崩溃快照无 completedAt；同 run `7ace8a52-b075-429b-98bc-9a086cacf647` 重启后公开说明：`An Agent turn was sent before interruption; the protocol cannot safely replay an unrecorded response.` 原 send 仍一次、历史保留、总 turn 仍两次，正常续跑未发生。QA 不要求未执行模型响应逐字一致，预设第三次不同合法 end_turn 也未被调用；只据明确暂停判断恢复要求不符合。

HTTP 原文定位：[api.ndjson](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8352-history-and-effects-survive-system/evidence/api.ndjson) 第 72 / 776 行，首/末请求时间 `2026-10-01T14:54:18.710Z` / `2026-10-01T14:54:38.712Z`；resource ID、note、状态及 requestId 全部保存在 JSON 审定记录。

## REC-007

[本例原始证据目录](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-007-a-acffc-tion-without-repeating-kick-system/evidence)；[原始错误](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-007-a-acffc-tion-without-repeating-kick-system/error-context.md)。

原资源 `88ea65ee-78b6-4302-b3f9-390fad340e3b`；自有数据库 `qa_ee02387973ac4e0eb4ee73d1`；kill `2026-10-01T14:55:06.882Z`，guardian PID `8483`。清理完成 `2026-10-01T14:55:37.415Z`，没有清理失败。

14:55:06.877 真实 kick 移除 `recover-kick-target`，kick-landed 屏障命中；14:55:06.886 响应连接在 finish 前断开。保留外部账本重启后，同 run `88ea65ee-78b6-4302-b3f9-390fad340e3b` 的 531 次公开响应均有当前 kick 暂停说明，目标保持不在群、kick 请求一次。原 raw FAIL 是 waitFor 的普通超时错误，但本次 reviewed FAIL 的依据是明确公开恢复暂停及固定说明，绝非“必须30秒恢复”。没有给未到达的 finished/最终工具断言补填通过。

HTTP 原文定位：[api.ndjson](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-007-a-acffc-tion-without-repeating-kick-system/evidence/api.ndjson) 第 72 / 1132 行，首/末请求时间 `2026-10-01T14:55:07.345Z` / `2026-10-01T14:55:37.307Z`；resource ID、note、状态及 requestId 全部保存在 JSON 审定记录。

## INT-MSG-007

[本例原始证据目录](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-64129--original-scheduling-origin-system/evidence)；[原始错误](../../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-64129--original-scheduling-origin-system/error-context.md)。

原资源 `c3fb69e9-ddda-40af-bc61-5cf276028646`；自有数据库 `qa_46d7f9e7b14d46c09430ba0e`；kill `2026-10-01T14:49:28.072Z`，guardian PID `83149`。清理完成 `2026-10-01T14:49:28.981Z`，没有清理失败。

已命中 `receipt-insert-not-issued`、receiptPresentAtProbe=false，绑定 guardian 83149、原消息 `5ce9254e-15cc-40c4-b116-1e050d638c76`、event #3。工程 observedAt 为 14:49:26.531，位于独立首次递送/读回区间 `[1790866166337,1790866166558]` 内。原后步应排期区间 `[1790866186337,1790866186558]`。kill 为 14:49:28.072，重启上界 14:49:28.564，重放递送上界 14:49:28.889，均早于原最早到期，不能套用到期重排规则。恢复公开首步 sentAt 为 14:49:28.862，后步 scheduledAt 为 14:49:48.862，较原允许上界确定晚 `2304ms`；此时只有一次原 send。是单实例保存前窗口反例，coverage 明确 allDatabaseWritersProven=false；不扩成多实例全局首收证明。排期断言失败后没有继续验证后续重复事件稳定性和第二步完成，不补填通过。

## 结论边界

D039/D041 是负责人已确认的工程处理方向，不要求重选方向，不要求本轮新增外部能力或人工处置功能；原验收标准未因本报告改变，也没有代填偏差接受。已观察到的明确拒绝恢复/排期偏离如实保留为技术不符合；安全保守策略避免盲重试是另一事实，不能替代强恢复符合性。

[机器审定记录](recovery-adjudication-six-cases.json) 保留 raw/reviewed、每项原因、原身份/工件和47份SHA索引；[准备口径](triage-policy.md) 说明证据门槛。所有结果限于本次 SUT 2716，未混用之前候选事实。最终 run/source/唯一 attempt 绑定由追加核对记录完成，原记录不改写。
