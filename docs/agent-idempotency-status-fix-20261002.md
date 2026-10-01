# 同 run 重复 send key 的当前状态修复

基线为 `47423c165f74d8b8908297974f7df71bc53b470d`。QA 的 `SR-BE-GRD-003 / same-key-at-queued` 揭示产品缺陷：同 run 中新的 `tool_use.id` 重用已有 `idempotency_key` 时，已有消息仍为 queued，结果却再次返回 `SEND_TIMEOUT`，丢失原 `clientMsgId` 与状态。此次仅修复该状态读取路径，未修改 QA 目录、断言或原始题目。

## 原文依据与根因

[原文 §2.2](original-interview-question.md) 规定首次 `send_message` 等待 accepted/sent 最多 5 秒，失败按既定错误返回；同时明确 Agent 可能在成功或 `SEND_TIMEOUT` 后以新 tool_use 重试同 key。[A5 第 7 条](original-interview-question.md) 单独规定，同 run 的相同 key 第二次及以后“不再发送、不再审计，返回那条消息的当前状态”。

原实现正确复用了 key→clientMsgId，也没有重复发送或审计，但 existing-key 分支仍进入首次发送的 `waitForDelivery`。该等待只接受 accepted/sent 或映射已知失败，queued/unknown 会被持续忽略，最终再次产生没有消息身份的超时错误。

QA 只读核对来自 `2026-10-01T22-25-01.466Z-7951d02e` 批次，实际文件名为 `SR-BE-GRD-003-same-key-at-queued.json`。同一 clientMsgId 的 gateway 账本记录 1 次真实 send、响应 429；相应审计 1 次、网关落地消息 0 条；两个发送工具结果均为 `SEND_TIMEOUT`。选定字段和原文件 SHA-256 见 [证据索引](evidence/agent-idempotency-status-20261002/qa-queued-reference.json)。accepted/unknown 变体的 QA fetch 隔离问题未作为此次缺陷证据。

## 最小修复与恢复边界

`tool-execution.ts` 在 `keyReused && step.state !== "executing"` 时，把实际读到的已有消息身份及任意公开 `deliveryStatus` 直接作为读取结果返回。公开状态为 queued、unknown、accepted、sent、failed、cancelled；sending 是内部 dispatch 状态，不新增为公开 deliveryStatus。返回 failed/cancelled 准确表达该消息的当前状态；这时 `is_error=false` 只表示读取完成，不能解释成消息送达。

该区分使用既有原子事务事实：首次 enqueue、key 关联和原 step 的 executing 状态一同提交。新模型工具落库默认 prepared；审计成功才变 ready。新的重复工具在审计前命中 existing-key 分支，不会改成 executing。原步骤崩溃恢复仍为 executing，因此继续保留首次的 5 秒等待、账号终态与消息失败映射。首次调用的内存 step 即使仍是 prepared/ready，`keyReused=false` 也会保留首次语义。

读取继续通过原 `observeDelivery`，保留数据库 deadline、读超时重试、取消及非超时 SQL 错误传播。没有读到消息或有效状态不会伪造结果、重新入队或触发新审计/发送；旧有保守超时路径不变。历史结果仍通过原 completeStep 事务提交。未改 key schema、消息恢复、未知结果重发或网关状态机。

## 修前与修后验证

独立开发测试启动自有 PostgreSQL 容器及真实 HTTP gateway/Agent 桩，实际自动化模块创建两个不同 tool_use：首次 send 回 429、retryAfterSeconds=60；第二模型响应先停在显式屏障，确认真实消息为 queued、账号处于尚未到期的 rate_limited，再释放响应。

- **修前**：将同一开发测试放入固定 `47423c1` 的隔离源码副本，第二结果仍为 SEND_TIMEOUT、无身份。第二工具完成约 5026ms；send=1、audit=1、key=1、outbound message=1。此失败来自预期结果断言，[原始 before TAP](evidence/agent-idempotency-status-20261002/before.tap) 保留。
- **修后**：同一真实 429 场景，首次仍为 SEND_TIMEOUT，第二工具返回原 clientMsgId + queued，且不新增发送/审计。另以明确的持久化状态夹具覆盖六种公开状态及原发送账号随后变终态；这六项仅证明重复读取规则，不冒充外部状态转换或未知结果恢复验证。新增 **7 PASS / 0 FAIL**，见 [after TAP](evidence/agent-idempotency-status-20261002/after.tap)。
- **相关回归**：原自动化、guard effects、delivery deadline、core repair/closeout 共 **79 PASS / 0 FAIL / 3 原 opt-in SKIP**；包括原 executing 恢复的账号终态失败、首次超时、真实 PostgreSQL 锁/取消/预算、审计与单次发送保护。见 [regression TAP](evidence/agent-idempotency-status-20261002/regression.tap)。
- `npm run build`（含边界校验和前后端类型检查）、`npm run verify:original` 均通过。

旧 deadline 开发夹具先创建消息/key，却把原待恢复 step 设为 ready；现改为真实生产原子提交的 executing，保留原等待/失败断言。新的独立 HTTP 测试覆盖 prepared 的重复调用，避免通过旧夹具掩盖 A5.7 语义。

探索阶段两次夹具错误日志另外保留并标明用途：最初错误地从 message metadata 读取 429 重试期限（实际在 account），以及 failed/cancelled 夹具缺少数据库 CHECK 要求的 fail_code。它们都不计为产品失败证据；最终 before/after 使用修正后的合法夹具。

各阶段 manifest 保存源码哈希、命令、容器/卷身份和清理结果；所有临时数据库、独立容器、卷与源码副本均已回收。未访问真实模型、真实 Key 或收费服务。

## 风险与限制

重复调用现在可能返回 queued/unknown/failed/cancelled 的普通状态对象，调用者必须按 deliveryStatus 理解结果。这是 A5.7 所要求的已有消息查询，不承诺消息后续落地。读取后消息可继续变化，返回值表示实际观察时刻；本修复不提供跨进程强一致状态订阅或自动重发能力。独立 QA 是否通过仍须 QA 在固定交付版本自行复测。
