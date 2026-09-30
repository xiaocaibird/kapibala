# A2 确定未发送后的收敛策略

日期：2026-10-01。源码与相关测试提交：`62128437ebaf7ae7a20d1dc0fa11e354cfc4d4d3`，前版为 `df7cecb`；分支 `agent/core-timeout-verification`。本页记录[上一轮时序验证](core-timeout-verification.md)之后的实施结果，旧报告和全部修前证据保持原样。未合 main、未切换演示，由主线集成后另跑全套。

用户决定本次不新增外部服务能力，并授权执行原契约内明确可行的工作。实施侧核对原文后选择：**确认未发送时不采用可选自动重发，直接结束为 failed / NETWORK_TIMEOUT**。这是依据原文作出的局部实现选择，不表述为用户逐项设计，也不改写原文或放宽五秒、两秒时限。

## 原文依据与行为变化

| 原条款                                                | 对本策略的约束                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [2.1 L67](original-interview-question.md#21-消息网关) | 只有明确504之后经过两秒，且新的查询仍404，才可确定未发送。窗口内发起、窗口后才返回的旧404不能用来失败。                                   |
| [A2 L225](original-interview-question.md#a2-网关接入) | 写的是“可以…重发一次”“总共只允许重发一次”，没有要求必须重发。选择不重发仍需 reliable absence；未知不能当失败。查询不可用期间保持unknown。 |
| 2.2 L121 / 2.3 L160、163                              | 手动发送与Agent沿用A2；持久failed带failCode。Agent观察到失败后沿现有工具错误路径返回SEND_FAILED，不伪造accepted/sent。                    |
| S5 L181 / A5.7 L263                                   | 第一次504后1.5秒已落地的消息仍收敛sent；同key再次调用复用当前结果，不再发送或审计。不能用本策略取消已经发生的效果。                       |
| A5.8 L264                                             | 无已记录504、第二次结果未知或连接丢失的调用仍保守恢复；不使用第一次504锚点否定后续调用。                                                  |
| B2 L300                                               | 邀请的强制重试属于另一操作，不受本次消息策略影响。                                                                                        |

可见变化是：以前一次可选自动重发可能让消息最终成功；现在第一次发送已被可靠证明未发生时，消息结束为failed，Agent或序列沿既有失败处理推进。发送503退避、429排队、已落地确认及其他错误传播不变。

## 源码与旧记录兼容

[messages.ts](../apps/server/src/modules/gateway/messages.ts) 的账号处理把unknown统一送去确认，不再直接派发旧unknown/pending。正常明确504仍要求当前timeout_at、安全窗口后的查询起点、新404，以及事务内状态、attempts、锚点复核；确认后直接失败，不新建timeoutRetries或第二次发送。

| 升级前持久状态                                     | 新处理及证明边界                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unknown/pending、timeoutRetries=1、timeout_at=null | 旧代码只在安全404后持久化此重发预约；后续明确503也可能回到该状态。账号锁下再查询，503/查询超时仍unknown，新404后failed，200后sent，不执行该预约。attempts不能简单限定为1，因为它也统计明确503等尝试。 |
| unknown/sending，含旧第一次timeout_at              | 先沿既有恢复逻辑转uncertain并清空锚点；404仍unknown，后续200可sent。不能根据重试标记或attempts判断效果。                                                                                              |
| unknown/uncertain、timeout_at=null                 | 缺少后续调用的明确504，404不构成安全否定；保持unknown，仅用正证据收敛。                                                                                                                               |
| unknown/uncertain、第二次明确504时间已保存         | 只使用这一次时间，窗口内404不失败，安全窗口后的新404可失败。                                                                                                                                          |
| queued/pending，可能带历史timeoutRetries=1         | 保持明确503/429后的原排队语义；例如限流恢复后仍可以发送。不能将本次描述成“所有历史重试标记记录绝不再POST”。                                                                                           |

旧unknown/pending的可靠否定依据来自旧状态写入路径，不来自空时间戳本身，也不是把第一次超时锚点套到第二次未知请求。只有该严格状态组合可用兼容分支，落库前还会核验状态、attempts、锚点和旧标记未变。

## 修前反例与修后测量

| 用例                                      | 保留的修前结果                          | 新策略同一远端配置                                                                |
| ----------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| TB05 第二次504原配置延迟1400ms            | 首次504起5909.7ms才安全failed，超过五秒 | **2201.7ms** failed，仅1次POST、0效果；第二次配置不再被调用                       |
| TB08 查询503恢复→404→原配置第二次504      | 恢复起2354.5ms才安全failed，超过两秒    | **114.0ms** failed，仅1次POST、0效果；未产生新安全窗口                            |
| TB03 原配置第二次202延迟1800ms            | 可选重发后4107.9ms accepted             | 可靠确认未发送后2108.6ms failed；这是政策行为变化，不能仍宣称该配置会最终发送成功 |
| TB06 查询503超过五秒，恢复的200耗时1400ms | 有限恢复场景通过                        | 不可用期间始终unknown；恢复起1523.8ms sent；1次POST、1效果                        |
| TB07 查询超过本地两秒HTTP超时             | 超时仍unknown，快速查询恢复             | 约2009.9ms超时仍unknown；后续正证据112.4ms收敛；1次POST、1效果                    |

修前的 [TAP](evidence/core-timeout-after.tap) 和[JSON](evidence/core-timeout-verification.json)一字未改。新结果见[专项TAP](evidence/core-timeout-policy-focused.tap)及[机器索引](evidence/core-timeout-policy-verification.json)。这些是真实HTTP、真实时钟、隔离PG下的有限结果，不是任意外部延迟和本地负载的上界。

## 测试修订依据与验证

只修订与可选重发直接相关的断言，保留安全与幂等检查：

- G06/G07：原“恰好重发一次”是旧实现的选择，改为安全窗口前unknown、新404后NETWORK_TIMEOUT失败、仅1次POST、五秒内收敛；旧404延迟返回不误判和崩溃未知不重放继续验证。
- P02：第一次504最终落地的sent路径仍保留；已确认无效果的第二条改为failed、0远端效果和1次POST，后续限流排队仍照常成功。
- P11：初始202→sent仍保留；查询不可用期间unknown不变，恢复后可靠404在两秒内failed，不再要求一次可选重发后sent。
- Agent SEND_TIMEOUT同key：首次查询不可用仍给SEND_TIMEOUT；查询恢复确认无效果后，同key读取同一失败结果，返回SEND_FAILED、审计仍1次、无远端效果。
- **S5未放宽或删除**：实际平台测试仍配置504后1500ms落地，同key再次调用返回sent，远端恰好1条消息、审计恰好1次、run正常finished。
- TB09–TB12新增6项旧状态兼容检查：已排定重发（attempts分别1和3）、第二次sending/uncertain未知、第二次已有504、历史queued限流恢复。

| 验证                                                               | 结果              | 原始输出                                              |
| ------------------------------------------------------------------ | ----------------- | ----------------------------------------------------- |
| A2真实HTTP时序与兼容专项                                           | 14/14，0失败/跳过 | [focused](evidence/core-timeout-policy-focused.tap)   |
| gateway完整文件回归                                                | 31/31，0失败/跳过 | [gateway](evidence/core-timeout-policy-gateway.tap)   |
| 实际platform四组合，含S5                                           | 4/4，0失败/跳过   | [platform](evidence/core-timeout-policy-platform.tap) |
| Agent四项定向：同key、持久发送恢复、账号终态、SEND_TIMEOUT后正证据 | 4/4，0失败/跳过   | [agent](evidence/core-timeout-policy-agent.tap)       |
| TypeScript、四个修改代码文件格式、git diff                         | 均退出0           | 命令记录于JSON索引                                    |

共53项定向检查；不是全项目全套。部分既有夹具日志仍出现已处理的 `idle_connection_error / terminating connection due to administrator command`，原始日志保留，未扩张修改清理夹具。

全部PG调用显式使用64550专用可抛实例，每个fixture使用UUID临时数据库，正式迁移只作用于临时库。未使用演示库、未改qa-acceptance。复现命令：

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap tests/integration/core-timeout-boundaries.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap tests/integration/gateway.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap --test-name-pattern='platform: (explicit 504 absence|Agent exactly-once key|S1 distinguishes|Agent SEND_TIMEOUT)' tests/integration/platform.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres node --import tsx --test --test-reporter=tap --test-name-pattern='multiple workers create one agent run and same send key|persisted final and prepared send|an accepted send whose account becomes terminal|SEND_TIMEOUT retries with the same key' tests/integration/automation.test.ts
```

## 仍保留的限制

原协议没有给by-client-id成功响应耗时上界；本地两秒HTTP超时不提供权威否定证据。查询不可用/超时、恢复检测、数据库或锁等待仍可能影响总耗时，不能通过强判failed或放宽时限掩盖。TB05/TB08的具体冲突已通过内部策略消除，不据此宣称A2在任意查询耗时下完全闭合。

没有已记录504的远端未知结果、结果持久化前崩溃等CG03–06边界保持，不新增外部接口、去重或查询能力。相关外部能力建议只保留在既有正式工程记录，不作为本批待实施项。
