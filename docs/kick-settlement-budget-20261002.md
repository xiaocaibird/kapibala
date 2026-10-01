# kick 工作截止与持久收尾预算说明

本文说明候选 `aea111aa5438db1773e2990dc2fd0d26ea52c5b9` 的实现、开发验证及剩余边界。该候选基于 `01f2c1a237e84bcff68ade470402b369b345cd58`，`f3f041e` 实施内部预算，`f285777` 更正真实 signal 源身份，`430a777` 对齐既有派发 fixture 和超时文案，`aea111a` 修复限时连接与工程观测包装的复用冲突。本文不是独立 QA 报告，也不将开发定向测试等同于整体验收通过。

## 修复对象与不变标准

原实现允许已派发 kick 的外部等待一直占用总活动预算，随后才执行未知结果说明、暂停、checkpoint 与终态事务。独立 QA 在 `01f` 上保留了严格 60 秒反例：暂停前的 seq 700 仍为 active、continuous，并包含未保存尾段，活动区间为 `[60007,60016]ms`。实际原预算 signal 到确认 GET 拒绝的因果观测通过，并不能抵消这条活动超时失败。

本次在原总预算内部提前结束 kick 工作，给真实持久收尾留出时间。总活动上限仍为 60000ms；ActivityClock 的账本、pulse、活动起点、未保存尾段及原暂停语义未改变，也未增加判定容差。五秒发送观察路径没有启用本次 DB 截止作用域，其五秒标准不变。

## 2000ms 内部分配与 17 秒准入

进入 kick 时，用真实剩余活动余额形成进程内单调时钟的绝对数据库截止。完成原政策、审核、账号与意图准备后，再取实际剩余余额：

- 第一条有副作用的 POST 只有在余额至少为 `15000 + 2000 = 17000ms` 时才能准入。持久派发标记前后及最终 fetch 前继续复核；第一次检查通过不构成之后无限期派发的授权。
- work signal 的时限为当时剩余余额减去 2000ms。hard signal 保留当时完整剩余余额，两者是不同 AbortSignal。
- 原 POST 请求超时仍为 15000ms。504 后的 2100ms 安全等待及确认 GET 的原单请求超时保持原值，但都受 work signal 限制。没有将完整 POST、等待及确认 GET 的最大总和作为新的首次准入阈值。
- 成功后的可选成员投影，包括其本地事务，使用嵌套的 work DB 截止。权威结果保存、未知说明、暂停、checkpoint、终态事务和必要锁清理仍使用原总截止。

2000ms 是工程工作分配，不是对全部收尾事务耗时的证明。已有 checkpoint 单次最多等待 1500ms；本次将其等待进一步限制在原总截止内。不能据此声称“1500ms checkpoint 加 500ms 事务”已构成可保证的物理上界：连接池、事务、服务器调度、网络、事件循环和清理都可能竞争这段余额。

这项策略会拒绝原来在剩余 15–17 秒之间可准入的首次 POST，也可能在外部操作原本可于最后两秒返回时提前停止等待，产生需要保留的未知结果。普通场景的收益是收尾可在总活动上限前真实落库；代价是可用等待时间缩短以及部分 run 更早以 `wall_clock` 结束。60 秒是上限，不要求用满；提前停止的说明明确表示为收尾预留时间，不能表述为原 60 秒 signal 已到期。

## 结果事实与取消优先级

| 实际事实                                                 | 当前处理                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 有效成功响应，或 504 后确认 GET 已给出协议允许的成功证据 | `afterConfirmation` 先保存实际 step 结果和 history，再尝试可选成员投影。投影失败、工作截止或随后本地清理失败不把已确认成功改成 unknown，也不重复保存同一个工具结果。     |
| 已收到明确账号、权限或群状态拒绝                         | 保留既有工具错误映射。即使随后的本地状态修复跨过 work 截止，也不因 signal 后来触发而改成未知。提前识别只用于明确拒绝白名单，不能凭任意错误名或 HTTP 状态概括为无副作用。 |
| 明确拒绝后的本地状态修复失败                             | `KickRejectionPersistenceError` 保留拒绝 code 和原本地 cause，并传播基础设施失败；不伪造已保存工具结果。                                                                 |
| 成功已被当前进程确认，但实际 step/history 保存失败       | 传播实际持久化错误；不能把内存中的确认当作 durable result。若进程重启，只能根据仍为 dispatching 的原意图保守暂停，不自动重派。                                           |
| 已派发而没有可证明结果，工作分配结束                     | 保存未知说明，保留 executing / dispatching 意图，暂停后尝试真实终态提交。run 的 `failed / wall_clock` 不代表远端操作已失败，也不授权重放。                               |
| 派发前本地准入失败                                       | 当前进程保留未发出请求的事实；已提交意图不被倒改为可重放。若终态落库失败或进程中断，恢复仍按已有持久证据处理。                                                           |

成功或明确拒绝完成后的收尾通过 `Agent.settleAfterKick` 重新读取 run，复用原 `finishBeforeNextTurn` 检查：取消或群不可写优先，其次实际总余额耗尽、协议错误、步骤数上限，最后检查下一完整模型阶段是否仍可准入。需要终止时，真实终态事务继续处在 kick 的总 DB 截止作用域内。该顺序避免投影 SQL 稍早返回后，下一轮准入触发的终态保存逃出作用域，也避免用 `wall_clock` 覆盖已经请求的取消。

终态提交后的 `scan / startNext` 退出旧 run 的 DB 截止作用域，以免后继 run 继承旧截止。现有所有权 operation signal 不因此清除；work signal 也没有被提升为所有权取消信号。

## work 与 hard 的观测身份

| 项目             | work                              | hard                               |
| ---------------- | --------------------------------- | ---------------------------------- |
| 源身份           | `kick-work-budget`                | `activity-budget`                  |
| 源 listener 事实 | `kick-work-budget-signal-aborted` | `kick-budget-signal-aborted`       |
| 对应暂停原因     | `kick-work-budget-exhausted`      | `kick-budget-exhausted`            |
| 时间含义         | 提前停止工作以预留持久收尾        | 原总活动余额对应的真实 signal 触发 |

预算事实保留 `budgetMs`，新增 `workBudgetMs / settlementBudgetMs`；最终候选的 `source` 与 `signalSource` 均反映实际触发源。事实继续使用相同 run / step / tool / attempt 关联，HTTP 请求仍各有独立 requestId。remote 的源触发、组合触发、fetch/body/request 收尾来自原真实控制流，多个来源同时触发时保留歧义，不以 `TimeoutError` 名称猜测原因。

`signalObservedWindowMs` 与 remote 的 `observedWindowMs` 仍是同进程 `performance.now()` 捕获包络；纳秒采样仅是包络内的辅助记录。没有触发的 hard signal 不会补造事件，后来的 `agent-termination-decided` 也不改名为原 signal。PG 取消可能先于 work 定时器 listener 返回；此时缺少该 listener 事件本身不是远端取消证明，也不能补填时间迎合测试。

observer 未安装时不输出这些工程事实，不新增观测身份 SQL；回调异常隔离和 finally 清理监听保持原有规则。本次 DB 截止本身会增加必要的超时设置 SQL，这属于局部产品控制，不属于 observer 工作。

## 数据库等待与连接处理

`withDatabaseDeadline` 默认不启用，仅由本条 kick 路径建立；嵌套作用域只能缩短截止，退出后恢复上层截止。`Database.query / transaction / tryWithLock` 在无作用域时仍使用原路径。未扩大业务事务边界，事件与域状态仍在原事务中原子提交。

- 连接池获取使用剩余绝对时间。pg 公共接口不能撤销已排队的 connect；若连接晚到，立即归还且不执行 SQL，不恢复已过期工作。
- 取得连接后读取并保存原 statement/lock timeout。每次 SQL 使用剩余截止，并保留原有更短的非零超时；成功归还前恢复原设置。
- 服务端 statement/lock timeout 最多设置为剩余时间减 25ms，给取消响应和清理留提前量；客户端读取仍受同一绝对截止约束。25ms 是内部操作策略，不是验收容差或任意环境下的取消保证。
- PostgreSQL 已返回可确认的 SQL 错误时，等待真实 ROLLBACK 确认；只有连接仍可用且清理成功后才允许复用。
- 客户端 read timeout、传输故障或未知响应会将连接标为不可复用并请求销毁。不会先返回一个未完成 SQL 的连接给池，再让它继续承担新事务。
- COMMIT 发出并不等于提交已知。COMMIT 回复丢失时保留未知状态、销毁连接，不称回滚已证实；服务器可能已经提交。
- 已收到成功 COMMIT 后，不因 JavaScript 随后恢复较晚而反向抹掉提交事实。超时设置恢复或连接清理失败也不能伪造一次已确认的回滚。

这些机制限制本路径可控制的等待，并保留真实事务结果；它们不能保证进程崩溃、任意锁争用、网络失联、服务器停顿或长时间事件循环阻塞时仍在 60000ms 前完成终态提交。到期后若持久化不能确认，必须如实留下未完成或未知状态，不能裁剪活动账本、提前宣布终态成功或盲目重放。

## 开发证据与历史失败

原始日志将归档到 [本次证据目录](evidence/kick-settlement-20261002/)，保留原字节与 SHA-256。以下是开发运行，不替代最终固定候选回归或独立 QA。

| 运行                               | 结果及限定                                                                                                                                                                                                                                        | 归档文件                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| DB 新套及相关回归                  | 18/18 PASS，其中新 DB 用例 8 条；真实 pool 晚到、短/长行锁、55P03/57014 后 ROLLBACK 与复用、原更短超时恢复、客户端读超时销毁、真实 TCP 丢 COMMIT 回包、COMMIT 成功后 JS 停顿。                                                                    | [DB 日志](evidence/kick-settlement-20261002/kick-database-deadline-final.log)     |
| 首次业务套                         | 5 条中 4 PASS、1 FAIL。失败是投影场景要求 work listener 必须发生；实际 PG 在定时器前返回，step 成功及终态 COMMIT 已保存。该样本同时暴露终态检查离开 kick 截止作用域的边界，随后通过复用原 Agent 终止检查修复。没有补造 signal，也没有删除首失败。 | [首次业务日志](evidence/kick-settlement-20261002/kick-settlement-first.log)       |
| 最终开发短套                       | 22 PASS、0 FAIL、1 长实验 SKIP。包括 send 17 条，成功投影/成功后取消/明确拒绝的三条真实跨 work 行锁用例，以及成功/拒绝后的两条真实 trigger 持久化失败及恢复不重放用例。                                                                           | [开发短套日志](evidence/kick-settlement-20261002/kick-settlement-final-short.log) |
| 既有 kick/capacity/recovery 定向套 | 19 PASS、4 启动失败。四条 controlled SUT 测试被既有 sourceRevision 保护以未提交产品源码为由拒绝启动，没有执行到业务断言；未绕过保护，需固定源码后补跑。                                                                                           | [既有定向首跑日志](evidence/kick-settlement-20261002/kick-existing-first.log)     |

首次业务套中的真实完整链没有注入 `active_ms`，从实际 inbound 创建开始，经三次真实模型等待、真实 POST 504、pending 确认 GET、work signal 取消及持久收尾。原创建包络为 `[32290.166917,32295.284625]`，终态 COMMIT 确认包络为 `[90316.166667,90317.072917]`，单位为同一进程的毫秒。保守的创建下界到终态 COMMIT 上界为 **58026.906ms**，包含暂停及终态尾段；该样本观察到 1 次 POST、1 次确认 GET、1 次受控 stub 效果，原 hard signal 未触发。

这个 **58026.906ms** 样本运行于尚未完成后续作用域修复的中间源码，不能标为 `f285777` 的最终固定候选结果。受控 stub 的效果也不等于真实外部平台成员效果或外部协议保证。随附 [开发源码元信息](evidence/kick-settlement-20261002/kick-settlement-final-source.json) 记录实施线冻结时的文件 SHA；它早于 root 对冗余 `signalSource` 的最后修正，不替代最终 commit 的源绑定。

## 既有 fixture 与旧实验的变化

局部边界用例仍用持久 `active_ms` fixture 缩短测试准备；它们不是从零开始的完整 60 秒证明。

| 用例                                          | 变化                                                                                                                                        | 保留的检查目标                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-capacity.test.ts` 两个临界等待 fixture | 原 `43800` 改为 `41800`；跨准入后活动断言由 45–48 秒改为 43–46 秒。                                                                         | 真实容量拒绝后继续等待，跨过新 17 秒准入线；不派发、不重复审核、不伪造 unknown。                                                                      |
| `kick-dispatch-budget.test.ts` 临界 fixture   | `44800/44000/44500` 分别改为 `42800/42000/42500`，对应跨线断言同步调整。                                                                    | 原准备 SQL、序列化、fetch 前同步检查、定时器已触发、终态保存失败恢复，以及已派发确认超时。确认超时现在归于 work 分配结束，不能称原 hard signal 触发。 |
| 已确认 POST 后的投影用例                      | 调整首次准入 fixture，继续真实执行 POST，再在低于首次准入窗口时刷新。                                                                       | 首次 POST 的准入线不被误套到后续只读确认/投影。                                                                                                       |
| 原 `kick-cancellation-observation.test.ts`    | 原 3×14.5 秒模型等待留下的余额不足新 17 秒准入，原“GET pending 跨 hard signal”组合在该新策略下不再由此 fixture 达到。原文件及历史证据保留。 | 旧运行只证明其当时源码的实际取消链；不得把新策略提前拒绝或默认 SKIP 算成旧组合 PASS。                                                                 |

新的完整链使用 `KICK_SETTLEMENT_OBSERVATION_EXPERIMENT=1`，明确验证 work 截止与真实 terminal COMMIT。旧 `KICK_CANCEL_OBSERVATION_EXPERIMENT` 不作为本候选常规回归开关。旧 `01f` 的严格 60 秒失败和既有独立 QA 原件保持原结论。

## 最终候选回归记录

以下结果由主收尾流程依据实际完成日志填写；本说明不预填 PASS。

固定 `f285777` 的首次整合回归已经结束：579 项登记，564 PASS / 4 FAIL / 11 SKIP，578099ms。原始 [TAP](evidence/kick-settlement-20261002/final-f285777-regression.tap) 和 [运行元信息](evidence/kick-settlement-20261002/final-f285777-regression.json) 保留。四项失败分别处理：

- `automation.test.ts` 的 `budget-kick` 用 `active_ms=44000` 初始化，只剩 16 秒，未进入新 17 秒准入后的已派发未知分支。改为 `42000`，保留未知结果、不重放与原时间等待断言。
- `platform.test.ts` 的 `active_ms=43000` 恰好剩 17 秒，实际准备消耗后无法派发。改为 `41000`，为原外部工作窗口保留同等余额，仍检查真实 POST、确认 GET 取消及第二实例不重放。
- `core-activity-accounting.test.ts` 已正确拒绝未确认 checkpoint，但新错误文案没有匹配原超时断言。产品错误文字改为 `Activity checkpoint timed out before confirmation`，不修改计时、拒绝和接管逻辑。
- `CO01` 三种观测同时安装时，数据库完成了查询，调用端却一直等待直至 HTTP 超时。已定位为观测层 release 恢复旧查询包装器，与限时连接恢复发生冲突；这是实际组合接线缺陷，不能归为计时断言过严。`aea111a` 通过包装器身份判断修复，保留数据库层已恢复的原生 query，避免重新安装旧限时包装器。

前三项固定在 `430a7773aa3ec01296a92c00913f0c5de1d564e1` 后，三个原失败定向用例均通过，原断言未放宽，见 [定向原件](evidence/kick-settlement-20261002/known-three-430a777.tap) 和 [执行元信息](evidence/kick-settlement-20261002/known-three-430a777.json)。CO01 修复后的同一场景用时 1241.865ms；固定 `aea111a` 的 combined 三条与 runtime 六条共 9/9 PASS。新增单连接回归修前明确失败，修后与 DB 截止套共 9/9 PASS；验证普通 pg callback 查询、后继事务、相同 backend 复用以及 COMMIT/ROLLBACK 事实。缺陷发生在显式工程观测类，不能直接推断普通生产数据库类同样挂死。原件见 [有界复现](evidence/kick-settlement-20261002/co01-bounded-first.log)、[修前反例](evidence/kick-settlement-20261002/co01-native-query-before.log)、[DB 修后](evidence/kick-settlement-20261002/co01-native-query-after.log)、[固定源组合复验](evidence/kick-settlement-20261002/co01-aea111a-combined-runtime.log)。最终整合结果另记。

首次整合中的真实完整链独立通过：创建包络 `[48141.411916,48146.783125]`，终态 COMMIT 返回包络 `[106162.026916,106162.80375]`，保守上界 **58021.391834ms**。它属于 `f285777`，不能挪用为后续源码的最终结果。
| 项目 | 固定来源 | 实际结果与证据 |
| --- | --- | --- |
| 首次整合 | `f285777`，并发 2 | 579 项：564 PASS / 4 FAIL / 11 SKIP，失败及修复原因保留于上文。 |
| 最终整合，含新真实时间链 | `aea111aa5438db1773e2990dc2fd0d26ea52c5b9`，并发 2 | **580 项：569 PASS / 0 FAIL / 11 SKIP**，约 345 秒。见 [结果](evidence/kick-settlement-20261002/results.json) 与 [原始 TAP](evidence/kick-settlement-20261002/final-aea111a-regression.tap)。 |
| 最终候选创建到 terminal COMMIT 上界 | 同上，显式开启 `KICK_SETTLEMENT_OBSERVATION_EXPERIMENT=1` | **58021.999958ms**；创建包络 `[48042.710542,48048.54975]`，实际 COMMIT 确认包络 `[106063.786667,106064.7105]`；1 POST、1 确认 GET、1 次受控效果。包含暂停及终态尾段，不用较早样本替代。 |
| build / 类型检查 | 同上 | PASS，见 [构建原件](evidence/kick-settlement-20261002/final-aea111a-build.log)。 |
| 原文约束校验 | 同上 | PASS，原始文件 SHA-256 不变；[执行记录](evidence/kick-settlement-20261002/final-aea111a-checks.json)。 |
| 独立 QA 对新候选的结论 | 固定交付 `7d53ee1`，产品同 `aea111a`，QA `4f1af77` | **5 PASS / 0 FAIL / 0 BLOCKED**，单次执行、零重试。正常 work 场景真实创建至 COMMIT 区间 `[58014.728959,58023.478584]ms`；[独立报告](../qa-acceptance/reports/followup/20261002-kick-work-retest/report.md)。首轮整体仍未通过；旧 `01f` 结果保留。 |

十一项跳过为既有显式开关：真实 20 秒续期、终态锁跨 60 秒、默认 12 秒模型超时、连续三次 5 秒审计、整段模型预算、配置 10/15 秒模型超时两项、真实 Gemini、旧 hard-budget 交叉实验、原一分钟活动见证、默认慢消费者测量。它们不计通过，部分有此前独立记录，但不能宣称本次重跑。本次新增 work-cutoff 完整链已显式执行，不能据此外推旧 hard 交叉或任意终态锁保证。

[固定源清单](evidence/kick-settlement-20261002/final-source.json)记录产品及研发测试文件摘要；[证据哈希清单](evidence/kick-settlement-20261002/sha256.json)绑定原件。TAP 为测试器原始输出，诊断内字符串可能按 TAP 转义；结果 JSON 的计时摘录只解析诊断中 ledger 之前的原始数值字段，不重写原件或用重序列化结果替代因果记录。

自有 PostgreSQL 17 容器及命名卷已按实际 ID 和所有者标签删除。删除前临时数据库、其他客户端连接均为零；删除后核实容器、卷不存在，私有连接文件已移除，见 [资源清理](evidence/kick-settlement-20261002/cleanup.json)。未修改演示数据、使用真实模型 Key、变更 QA 资产或合入第二轮 P0/P1 产品。

独立 QA 已完成本次有限影响复测、资源清理和签发，报告 SHA-256 为 `f3326ca4eff572d4b0134bff70dcfb450c6d2b3dcf90506af99dc9758ddcf17a`，由 QA 合入 `547ee0ba`。正常成功、政策拒绝、两种明确外部拒绝及已派发 504 确认不重放均有本次有限证据；跨 work 投影及同连接包装器复用专项没有被本次 QA 场景逼真触达，不能借开发通过代签。五秒等待路径未改变，原失败未盲目重跑。

按负责人最新要求，本报告与原件归档后暂停后续修复和补测，等待是否继续的决定。首轮整体未通过，剩余项与额外未测边界在 QA 清单中分开；不启动第二轮验收或上线评估，也不将第二轮待审阅产品合入 main。
