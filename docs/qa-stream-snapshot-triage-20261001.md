# INT-STREAM-002 快照内容差异复核

2026-10-01。收到 QA 的具体联调反馈后，对原始证据和源码只读复核。**暂未确认产品缺陷；当前失败比较的是两份不同快照，不能据此证明旧游标的冻结内容被更新。** 这不是 QA 重新执行结果，原运行记录及其结论由 QA 保留和复核。

## 证据定位

QA 固定 SUT 为 `0af644334b00eb13e2e56df33c70f22358a6a0f7`。原始制品位于 QA 工作树的 `qa-acceptance/reports/runs/2026-10-01T06-10-21.458Z-1fdb6180/artifacts/system-integration-streams-a7924--confirmations-and-backfill-system/evidence/`。以下时间均为 2026-10-01 UTC，行号对应此次原始文件。

| 时间 | 事实 | 依据 |
| --- | --- | --- |
| 06:35:00.392 / .421 | limit=50 首屏创建快照 `222aca04-d825-46c5-aa2c-d0d58eaabfcc`，续页 own 消息为 accepted | `api.ndjson:86、88` |
| 06:35:00.397 | 同一 clientMsgId 的 by-client-id 查询已准备返回 200；远端 sentAt 为 .394 | `external-facts.json:841` 起 |
| 06:35:00.451 | limit=7 无游标请求另建快照 `152569c5-50b9-46fc-99ac-f78d633b53a7`；首屏没有该 own 消息 | `api.ndjson:90` |
| 06:35:00.458 | QA 人工投递 message_sent | `external-facts.json:1692` |
| 06:35:00.763 | 续读 `152569c5…` 返回 own 消息 sent、gateway-message-1、sentAt .394 | `api.ndjson:116` |

消息 clientMsgId 为 `c8401835-d92a-4c94-b30d-f436f5f9bba3`。200 查询已在第二份快照之前发生；现有证据没有证明第二份快照曾包含 accepted。不能把人工发送确认事件的时间当作唯一可能的本地消息确认时间。

## 源码与结论边界

`apps/server/src/modules/gateway/messages.ts` 的 `accountWork` 会对 accepted 消息调用 `confirm`，查询 200 后走 `recordSent`。`apps/server/src/modules/gateway/index.ts` 的消息列表在每次无游标请求时生成新 snapshotId，并保存 DTO JSONB；续页从对应 JSONB 取片，不回填当前 messages 表字段。本次核对从 QA 固定候选到当前 `8c92b3491ade262b2f81e3257d3809be02223529`，上述分页行为未变。

因此，两次首屏之间发生主动查询确认是符合现有证据的解释；只凭这些日志，不能反向证明任意快照场景都正确。工程保留 `docs/core-resource-observability.md` 的冻结内容承诺，未降低技术契约，也未修改产品或 QA 断言。

复测需要绑定同一 snapshotId 的初始内容，并控制真实查询确认与事件确认的时序。具体用例、断言及最终分类由 QA 维护，开发负责解释机制、提供证据并共同排查。

交付前 QA 回函确认上述前提错误，并已在 QA 自有开发树用真实查询屏障及同一 cursor 初值取证修正场景；原有状态、内容、顺序断言均保留。旧 FAIL 原始记录不改，后续固定候选独立复测尚未在本记录中给出结果。
