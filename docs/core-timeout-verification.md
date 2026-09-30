# A2 超时收敛关键组合验证

日期：2026-10-01。范围：原始 A2 的明确 504、慢 202、by-client-id 查询不可用及恢复；不改外部协议、重发次数、SSE 体系或 unknown 的安全边界。

源码与新增测试提交：`8e00561f75d3b87dfcece8968b304785197c93d7`，基线 `0cdad82`（产品树等同此前 `48adfd9`）。分支 `agent/core-timeout-verification`，未合 main，未切换演示。新增 [core-timeout-boundaries.test.ts](../tests/integration/core-timeout-boundaries.test.ts)。

## 原条款与计时口径

- [原文 2.1 L59](original-interview-question.md#21-消息网关)：202 本身可能需要一两秒；accepted 与实际 sent 分开。
- 原文 L67–69：明确 504 后，已接收消息在两秒内落地；超过两秒的 404 才能否定该次发送。网关不按 clientMsgId 去重，查询也可能 503。
- [原文 A2 L225](original-interview-question.md#a2-网关接入)：收到 504 后为 unknown；从收到 504 起五秒内变为 accepted/sent/failed；确认未发出后最多重发一次。查询不可用期间保持 unknown，恢复后两秒内确定。

测试通过真实 `RemoteClient` 发 HTTP，在其接收到错误时记录 wall clock 与 monotonic clock，不替换 HTTP 请求、不修改 Date.now、不伪造 timeout_at。耗时从客户端收到首个/第二个 504 分别计；恢复耗时从远端测试端点切换为可用时计。驱动器在每次工作完成后间隔 100ms 再调用真实账号发送流程；这是受控有限负载，不是全应用调度 SLA。SSE 不提供确认，强制覆盖查询恢复路径。所有重发沿用同一个 clientMsgId，远端夹具不去重，并核对 POST 数、实际消息效果数及本地唯一 outbox。

所有测试使用 `127.0.0.1:64550` 的专用可抛 PostgreSQL，通过正式 temporaryDatabase helper 为每项创建 UUID 库、迁移该库并清理；管理库仅用于建库/删库。未运行 qa-acceptance、未触碰演示库。

## 已修复：接收时间被本地锁等待后移

原实现进入处理 504 的本地持久化事务后才生成 timeout_at。TB01 让真实 504 已返回，但群行锁额外阻塞 750ms，实测计时起点后移 **765ms**，断言失败，完整栈见[修前 TAP](evidence/core-timeout-before.tap)。首次单项反例也保留在[原始日志](evidence/core-timeout-TB01-before.log)。

修复仅在 [messages.ts](../apps/server/src/modules/gateway/messages.ts) 的 catch 入口捕获一次已知超时接收时间，后续行锁等待和本地事务重试共用该值。修后同一反例偏移 **0ms**。unknown 的判定、窗口内旧 404 不得重发、最多一次重发、无已知 504 的崩溃意图禁止重发均保持。

这只修复可避免的计时起点错误，不保证数据库长时间不可用时能够及时持久化状态，也不恢复进程在持久化前丢失的响应。

## 有限场景结果

| 用例 | 真实条件                                                                   | 修后观察                                                                      | 结论                                                      |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| TB01 | 504 接收后本地群锁再占用 750ms                                             | timeout_at 偏移 0ms；仍 unknown；1 POST、0 效果                               | 局部反例已修复                                            |
| TB02 | 首次 202 延迟 1900ms                                                       | 1919ms 后 accepted，响应前仍 queued；1 POST、0 效果                           | accepted 不抢在真实响应之前；没有 504，不能套用其五秒起点 |
| TB03 | 首次 504；安全 404 后重发；第二次 202 延迟 1800ms                          | 首次 504 起 4108ms accepted；2 POST、0 效果                                   | 此有限组合满足五秒，不把 accepted 当 sent                 |
| TB04 | 两次立即返回的真实 HTTP 504，均无效果                                      | 首次起 4424ms、第二次起 2201ms failed；恰好 2 POST                            | 五秒组合通过，与既有 G07 证据相容                         |
| TB05 | 重发的第二个 504 延迟 1400ms，均无效果                                     | 首次起 **5910ms**、第二次起 2206ms failed                                     | **首次五秒口径未满足**；测试仅通过安全窗口及单次重发断言  |
| TB06 | 查询持续 503 超过首个 504 后五秒；原消息已落地；恢复的 200 查询耗时 1400ms | 不可用期间一直 unknown；可用起 1521ms sent；1 POST、1 效果                    | 此有限恢复组合满足两秒                                    |
| TB07 | 一次查询响应延迟 2300ms，超过本地两秒 HTTP 超时；原消息期间落地            | 约 2006ms 返回本地等待；仍 unknown；改为快速查询后 116ms sent；1 POST、1 效果 | 查询超时不会伪造否定证据或触发重复发送                    |
| TB08 | 查询503超过五秒；恢复后快速404；合法重发又立即504且无效果                  | 恢复起 **2355ms**、第二次504起2114ms failed；恰好2 POST                       | **恢复后两秒口径未满足**；新一次504的否定窗口仍被保留     |

新增测试 **8/8**，其中 TB05/TB08 明确是“安全行为及未闭合时限边界”测试：通过数不能解读为 A2 全部时限通过。原始结果见[修后 TAP](evidence/core-timeout-after.tap)，机器可读摘录见[证据索引](evidence/core-timeout-verification.json)。

## 两项仍需决定的组合语义

1. **五秒从首次还是每次 504 起算。** TB05 使用有限的 1400ms 第二响应延迟，不是无限慢远端假设。首次否定窗口、一次重发耗时、第二次否定窗口相加，超过首次五秒。原文没有为重发响应耗时给出足以支撑总五秒的承诺。不能在第二窗口到期前强判 failed，也不能用“第二次起五秒内”擅自改写首次口径。先明确适用计时与允许策略，再判断是否需要调整内部重发政策或评估外部时延/结果保证；本次未作此选择。
2. **查询恢复后两秒与新重发的 504。** TB08 在恢复后所有 HTTP 都快速响应，仍需从第二次 504 再经过两秒才能证明该次未发出。保持既有重发政策时，无法在恢复时刻起两秒内提前得到该否定结论。原文“可以重发一次”是否允许某些场景不重发而失败、何时采用，以及新504是否另起窗口，需要明确；不能未经决定改变当前重发行为。也不能直接认定必须改外部协议。

以上不是 CG03“没有已记录 504 的崩溃窗口”，两者不能互相替代。新的安全证据也不关闭 CG03–06。

## 回归与复现

- 既有 gateway.test.ts：**31/31**，0 跳过；含 G07、窗口内旧404延迟返回、未知崩溃意图及查询不可用场景。[日志](evidence/core-timeout-gateway-regression.tap)
- 既有 P11 `platform: S1 distinguishes accepted from sent and unknown survives query outage`：**1/1**，0 跳过；保留其实际应用/模拟网关恢复证据。[日志](evidence/core-timeout-P11-regression.tap)
- 根 TypeScript `tsc --noEmit`、两处代码 Prettier 检查、`git diff --check` 均退出0。没有跑全套或独立 QA。
- P11 原始日志含一条已处理的 PostgreSQL `idle_connection_error / terminating connection due to administrator command`，测试退出0；保留日志，不声称所有连接清理日志已消失，也未扩展修改其他夹具。

复现前提供已有依赖；使用 Node 24.21.0。显式指定专用 PG，不能省略 DATABASE_URL 回落到演示端口：

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap tests/integration/core-timeout-boundaries.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap tests/integration/gateway.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap --test-name-pattern='platform: S1 distinguishes accepted from sent and unknown survives query outage' tests/integration/platform.test.ts
```

修前反例来源是基线 `0cdad82` 产品代码加同一 TB01–TB07 测试；TB08 是修后新增边界验证。两份 TAP 用例数不同，不能将其计数当成同一套回归差值。
