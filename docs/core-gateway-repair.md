# 核心网关修复与账号一致性边界

2026-10-01，从 `fa1baa7` 的独立工作树实施。范围为 IR-01/R03、R08、IR-01/R05 的网关消费等待及 V-ACC01；不改原始题干，不更改演示数据库或服务，不代表用户人工验收。本记录区分已修复行为、实测故障和仍未关闭的窗口。

## 原文依据与实施边界

- [原文 2.1](original-interview-question.md#21-消息网关) L41–42：connect 返回稳定平台身份，disconnect 使账号离线。没有账号远端状态查询、操作标识或本地与远端的联合事务协议。
- 原文 L69：任何端点都可能整体不可用（503）。这为收到明确 503 后的退避提供依据，不能将未知的网络中断等同于 503。
- [原文 A2](original-interview-question.md#a2-网关接入) L229–230：事件写失败不能丢失或中断后续处理；要求 inconsistency 和恢复补齐。
- 原文 L240：promote 调用总数不超过 2；没有对 503 的额外豁免。此次仍把 503 计入总数。第二次明确拒绝时以原有 `failed` 和 `step=promote` 结束，不能为了恢复继续第三次。
- 原文总则 L192 要求重启前后成立；账号远端成功但本地无法确认的崩溃窗口仍不能因本次告警补充而标记完成。

## SSE 跨块 CRLF（72f3620）

原逻辑只替换单个网络 chunk 内的 CRLF。当 CR 和 LF 分属不同 chunk，两个 JSON 事件可能错误地合成同一帧。独立修前复现 KG01：两帧实际处理 0 条，出现 1 次“网关事件格式错误”。KG02 按单字节分块，包含中文 UTF-8、注释、CRLF、多行 data 和后续 LF 帧，同样修前失败。

修复在拼接累计缓冲后统一 CRLF，仍使用原先的事件校验、持久去重与失败重试。KG01/KG02 修后均处理完整两帧且没有格式错误。这是对实际 `GatewayEvents.listen` 的受控 `ReadableStream` 字节边界测试，确定性覆盖 chunk 切分；并非宣称测试过所有网络栈缓冲行为。原有真实 HTTP/SSE 重启回归也通过。

## Promote 明确拒绝与未知结果（fcef080）

修前首个 HTTP 503 持久为 `promote_dispatch` 加 `recoveryNote`，后续 `advance` 永久跳过。现在：

| 已观察结果 | 后续行为 |
|---|---|
| 第一次明确 503 | 保存 `promote`、次数 1、500ms 退避；额度内允许第二次 |
| 第一次 `NOT_MEMBER_YET` | 保留原 250ms 退避和最多一次重试 |
| 第二次明确 503 / `NOT_MEMBER_YET` | `failed`，错误仍是固定 `step=promote` 和原远端 code；不再调用 |
| 504、其他未知错误、结果落库失败 | 保留 `recoveryNote`，不视作明确拒绝 |
| 遗留 `promote_dispatch`，没有保存响应 | 保守暂停，不因剩余调用额度自动重放；成员接口没有管理员角色结果，无法证明第一次没有成功 |

KG03 使用真实 HTTP 503→成功，验证首次退避、第二次完成与成员 admin 角色。KG04 分别验证 503→503、NOT_MEMBER_YET→503、503→NOT_MEMBER_YET，共三项，之后继续 advance 也没有第三次调用。KG05 验证未知响应及持久 dispatch 的新 worker 接管，远端调用不增加；这里接管是新 `Jobs` 实例读取真实 PG，未将其写成进程 SIGKILL 验证。旧正常建群、邀请过期、ALREADY_MEMBER、两次 promote、JOIN_TIMEOUT 和建群未知窗口回归全部通过。

## 成员查询等待（09ce7f2）

成员事件仍在获取群行锁后查询远端并保存投影，以维持“旧快照不能覆盖更新后的删除/退出/终态”不变量。仅把这条只读成员查询的 HTTP 超时从默认 15 秒降为 2 秒；失败仍整笔回滚并进入原有事件重试与 inconsistency 机制。不把查询移出锁，不新建并发事件调度系统。

KM01 使用独立真实 HTTP/SSE 和 PG：第一条是群 A 的成员事件，其成员查询保持挂起；第二条为群 B 普通消息。实测后者在 2046ms 落库（此前单项 2039ms）。此时群 A 既无 gateway_events 确认记录也无伪造成员；第一次 HTTP 仍未完成时，通过第二次成功查询重试，成员与事件落库且出现 inconsistency，群 B 消息仍只有一条。成员快照、重入、终态、退出和踢人相关旧竞态测试也全部通过。

剩余边界：`listen` 仍逐帧 await；多个慢事件可累积等待，数据库群锁等待没有被这次 HTTP 超时限制，其他远端查询也不是此次缩短对象。此结果仅证明一个慢成员查询后另一群事件能继续，不证明任意积压的跨群端到端时限。自动化启动扫描与 tick 的锁隔离由另外专项处理，不能把两个局部修复合并成未测试的整体保证。

## V-ACC01：实测不一致与可观测缓解（560ad65）

KA01/KA02 在独立真实 PG 中设置状态更新触发器失败，并以真实 HTTP 记录远端状态。实测：

| 路径 | 远端实际结果 | 回滚后本地结果 |
|---|---|---|
| `/connect` | online | idle，platformUserId 仍为 null |
| transition idle→online | online | idle，platformUserId 仍为 null |
| transition online→disconnected | offline | online；只有此前 connect 的已提交状态事件 |

本次只补“远端成功响应已经被本进程观察到，但本地事务未确认完成”的报告：记录日志，并尽力通过既有 `inconsistency` 写入 `kind=account_result_unknown`、账号 ID 和固定提示。没有追加远端调用、反向补偿、自动状态覆盖或新公开状态枚举。KA04 经正式 API 实测返回 `500 INTERNAL_ERROR`，不返回成功；匿名为 401、viewer 为 403 且没有远端调用。通知 payload 仅 `kind/ref/message`，没有 SQL 错误、凭证或远端响应体，沿用现有认证后的 WebSocket 通知渠道。

KA03 在实际业务事务写失败之后，再注入告警事务不可用：调用方仍得到原始操作失败，日志记录原故障和告警未持久化两条，不用第二个错误覆盖第一个。这里第二次故障是受控数据库适配器注入，不写成真实数据库停机。没有逐浏览器验证告警呈现。

**未关闭：** 本地状态仍可能与远端不一致；本进程观察到结果但报告前崩溃、数据库持续不可用、HTTP 响应丢失、COMMIT 应答丢失等窗口仍不能完全恢复。当前变化是诊断缓解，不能标成账号一致性已修复。

**只重试本地落库的评估：** 当前事务出错后会回滚并释放账号锁。此时重新使用原 `expectedFrom` 无法排除另一操作已经完成或状态先变后恢复，不能直接重放旧结果。预先 savepoint 能在同一连接且外层锁仍有效时重试部分语句错误，但不能覆盖连接失效、COMMIT 未知或进程崩溃；本次注入的持续触发器错误也不会因此恢复。安全的跨事务补写需要另行设计持久操作身份或可信版本核对以及并发恢复行为，本轮没有暗加该机制。人工核验和现有显式操作仍是此边界的处理方式。

## message_sent 接入协作（8656a0f）

仅 message_sent 在 `process` 第一次 await 之前采集本进程观察时间并传给 `recordSent` 第五参；同进程数据库失败重试保留首次时间，成功或已处理去重后清理临时记录。查询确认和消息回流仍不传该时间，历史去重事件不补造历史首次接收时间。持久字段、升级门禁、序列排期与对应测试由自动化专项负责。此次相关回归使用了自动化依赖 `9300a8a`（在本分支 cherry-pick 为 `041b67b`），不将该依赖记作本专项独立实现。

## 本轮验证记录

- 修前：KG01/KG02、KG03 和 KG04 的三组合共 6 项失败，符合上述分帧/503问题；KA01 两路径和 KA02 共 3 项在报告事件断言失败前，已经实测远端与本地不一致。
- 修后相关回归：9 个测试文件，**64/64 通过、0 跳过、0 失败，31.418 秒**。覆盖 `gateway`、`membership-reliability`、`member-rejoin`、`transaction-events`、`core-gateway-closeout` 以及新增 stream/promote/member-timeout/account-boundary 文件。
- 旧 gateway fixture 使用独立 UUID 外层数据库 `gateway_regression_b9c5fe96ed2a4bf0981a924e5508e2ea`；其他 fixture 使用各自 UUID 临时数据库。测试结束已清理，HTTP/SSE 均随机端口。清理时出现的“terminating connection due to administrator command”对应删除临时数据库，没有作为业务成功证据。
- `npm run typecheck` 通过。`npm run verify:original` 保持 SHA-256 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。
- 测试运行开始时账号/成员超时补丁尚未提交，期间仅将已测试内容提交为 `560ad65`、`09ce7f2`、`841d4c4`，源码未继续改变；结束代码 HEAD 为 `841d4c4`，不声称开始时就是该 HEAD。没有在本专项独立跑全项目 `npm test`、浏览器人工验收或部署。
