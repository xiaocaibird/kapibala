# 原始运行观测与局部故障接入

本契约对应 INT-R02／INT-R04／INT-R06，并包含 AGENT-025／028 与 CAP-003 的运行取证。工程提供本机薄适配与必要的真实执行观测，QA 维护公开接口预期和独立网关／WS证据；不能用 fake-controller 工具自测代替产品验收。e85 控制器已经隔离接入并留下[实际补证复测报告](../reports/followup/20261001-e85ae61-retest/report.md)；本文后续源码修订尚未对新产品候选执行，不能继承该旧版本的结果。

依据：原 A5.2 的60秒累计活动预算与重启恢复；D040 保留停机不计、不虚报任意硬崩溃尾差上界；原 A1 提交后状态事件与 D043 原事务内有限本地保存恢复；D045 以及 `docs/core-resource-observability.md` 的管理员诊断语义。这是隔离测试接入，不新增生产公开业务接口、不要求暴露业务表名、SQL或内部模块导入。

## 配置、实际归属与故障安全

`adapters.runtimeObservation={url,contractReference,diagnostics?}` 纳入目标配置及授权指纹。URL 只能是带显式端口的 `http://127.0.0.1` origin；无重定向、用户名、密码、额外路径、query 或 hash。契约引用须绑定已评审工程实现。无真实配置、进程归属、窗口证据或字段profile时用例为 BLOCKED。

QA 使用既有 `capacityControlTarget()` 的 `{apiUrl,revision,pid,ownerToken}`，其中 pid 是 QA guardian/进程组拥有者。控制器必须验证该拥有者下实际应用进程、完整40位版本、API地址与从进程观察到的随机资源token。QA **不将 ownerToken 随请求发出**；回包 `binding.observedOwnerToken` 须由实际进程观察取得，不接受请求参数回显或只核对端口。SUT重启后，新的控制器客户端重新核对新pid；旧租约只允许读取／释放历史，不得自动跟随端口控制新实例。

每个故障是客户端随机UUID租约，TTL 5–120秒，由工程控制器独立自动释放；此值是 QA 资源安全边界，不是产品性能指标。PUT前即登记本地leaseId，响应丢失后仍只清理这个ID。DELETE幂等且保留证据；不可按模块名或全局条件释放其他运行的资源。所有用例在finally清理，并保留第一次业务失败；清理异常另记。共享控制器不可将不同QA owner的租约混用。

请求不得含业务预期、结束状态、预算数值、时间戳、SQL、回调、文件路径或可执行代码。允许的 `faultMarker` 仅为 `qa-runtime-` 前缀、最多96字符的合成错误样本，供真正抛出的模块异常携带；不得覆盖诊断接口输出。

## `qa-runtime-observation/1` 协议

- `GET /qa/runtime/v1/capabilities?apiUrl=...&revision=...&pid=...`：返回 `{protocol,binding,capabilities}`。既有能力为 `activity-witness / activity-safe-boundary / account-local-save / account-intent-wait / module-tick`；本次预交接扩展 `agent-lifecycle-witness / tool-wait-witness / message-recovery-witness`，见下节。声明能力不等于故障发生。
- `PUT /qa/runtime/v1/leases/<UUID>`：`{protocol,target:{apiUrl,revision,pid},mode,correlation,ttlMs,faultMarker?}`。初始state可为armed，必须通过后续真实事件确认触发后才能断言。
- `GET /qa/runtime/v1/leases/<UUID>`：完整快照。事件必须追加、全局租约seq严格递增、已观察历史不可改写或删除；字段对象键顺序不影响相同证据的判定。
- `POST /qa/runtime/v1/leases/<UUID>/advance`：只放行模式中当前已命中的屏障，不能制造业务成功。重复调用不得跨越未命中的阶段；不接受任何请求体中的结果或时间值。
- `DELETE /qa/runtime/v1/leases/<UUID>`：释放本租约注入／屏障，返回state=released。后续真实提交／回滚事件仍可追加，租约不得复活或延长期限。

快照：`{protocol,leaseId,state:armed|held|released,expiresAt,binding,correlation,events}`。事件公共字段：`{seq,at,kind,correlation,attemptId,instancePid}`。`attemptId` 来自真实执行尝试，`at` 来自实际观测，`instancePid` 沿用协议的历史字段名，指本次绑定的guardian/进程组拥有者PID，**不是要求实际应用子PID等于guardian**。控制器仍须确认API监听应用实际属于此进程组并从其进程读取token；实际子PID可作为额外只读诊断。correlation只选择目标，不能成为实际发生证据；工程记录必须能够从公开run/账号/模块追溯到实际尝试。接口失败必须用非2xx，无重定向；QA不执行服务返回的任何指令。

## 生命周期只读扩展：AGENT-025／028、BLK-EXT-001

2026-10-01 客户端初次准备基于研发预交接 `68d28d80acb059387af14dcb41a2be62f1d14e12` 的 `docs/qa-backend-evidence-followup-20261001.md`、真实挂点及样例；正式文档提交为 `e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb`，产品源 `7a38ae2979b187a74757dfe4456f947e26ee27b7`，见 `docs/qa-followup-integration-20261001.md`。旧文档中的开发计量版本 `22d770bafcf7b2e2f64e42deb1c4189da81baaf6` 不改写为最终候选的独立 QA 运行。初次准备仅验证客户端；后续 e85 实际冻结/执行由上述报告单独记录。本轮再修订仅校验 QA 工具，尚无新候选运行。这些入口没有改变原 5000/60000ms 上限，不自动关闭旧结果。

| 能力                     | 模式                     | 关联                                                         |
| ------------------------ | ------------------------ | ------------------------------------------------------------ |
| agent-lifecycle-witness  | observe-agent-lifecycle  | `{kind:'tool-wait',groupId,runId,toolUseId:'all-run-steps'}` |
| tool-wait-witness        | observe-tool-wait        | 同上，包含该 run 的真实工具阶段                              |
| message-recovery-witness | observe-message-recovery | `{kind:'message-recovery',groupId,clientMsgId:<UUID>}`       |

复用上述 owner/token/revision/API、UUID 租约、TTL、不可变前缀及清理规则。不改变注册目录或注入任意 `QA_*`。三个模式都是只读：state 通常为 armed，DELETE/TTL 停止追加并保留已记录历史；不调用 advance，不用租约暂停产品计时。agent 生命周期可以和同 run 的 activity 观察并存。必须先通过公开接口取得真实 run/message 身份再订阅，不声称创建前已 arm；observer 必须在模块恢复前安装，并诚实回放实际历史。

每条流首项是 `lifecycle-observation-attached`：`resourceId` 由真实 run/group 或 message/group 查询确认，`databaseIdentity` 是实际数据库/模式/启动身份摘要；`historyScope:'this-process-only'`、`includesPriorProcessHistory:false`、非负整数 `droppedThroughSourceSeq` 必须存在。该项 attemptId 是观察接入身份，绝不能当成业务执行尝试。截断不抹去已经观察到的硬违约，但不能据不完整历史声称全链通过。

后续事件除公共 lease seq/attempt/guardian 字段外，必须含实际业务身份、正整数 `sourceSeq`、实际 `applicationPid`、`clockDomain=process-performance:<applicationPid>:<UUID>`、`clockUnit:'ms'`、有限非负有序的 `monotonicMs`。业务 sourceSeq 严格递增但允许过滤造成的 gaps；业务单调读数须在同一实际进程域内递增。**attached 发生于晚订阅时，回放的 UTC/单调时间早于 attached 是合法的**，不能把首条接入元信息当计时起点。已返回的事件不能改写、删除或换进程。SUT 重启后重新核对新 PID，旧租约仅可读/释放原历史；只按真实消息/run/attempt 身份关联新旧文件，禁止相减不同 clockDomain。

- **AGENT-025**：原 `observe-activity` 完整单 epoch 上限裁判保留，删除仅凭wall_clock较早就自动FAIL的附加下限。追加创建事务与 INSERT 包围、BEGIN 确认读数、turn 派发、实际终止决定及同 attempt 的终态 COMMIT。创建、BEGIN、INSERT、决定、提交不能互相替换；不能挑最晚起点来缩短预算。完整活动下界，或经完整连续单 epoch 活动见证关联的同域实际决定/新派发下界，大于 60000ms 即 FAIL；缺流、缺决定/提交配对、缺同域活动来源则 BLOCKED，继续公开终态/指针/步骤/零副作用断言。生命周期区间仅追加诊断，不能把缺 activity 完整性的情况升级为 PASS。
- **AGENT-028**：按同真实 `runId/stepId/toolUseId/execution attemptId/clientMsgId/idempotencyKey` 配对 `send-key-resolved → send-wait-started → send-wait-result-ready → send-tool-result-returned`。原始包围为 `S=[key.lower,waitStarted.upper]`、`E=[ready.lower,returned.upper]`，耗时 `[E.lower-S.upper,E.upper-S.lower]`，保留小数、不扣日志或调度成本。prepared/entered/审计阶段也保存，用于复核早期阶段，不能将下一 turn 或 history COMMIT 当交还时点。真实等待下界>5000ms 为 FAIL；区间跨界为 BLOCKED；尚未到5秒却返回 SEND_TIMEOUT 同样 FAIL。结果/history 必须按**同 execution attemptId** 与原值配对；正式候选已修复旧 host adapter 漏传该 ID 的接线；QA 仍不能按 toolUseId 猜配，缺链 BLOCKED；但已证明超时先 FAIL。第二次同 key 的公开 sent、只有一次审计/发送/落地继续独立验证。
- **BLK-EXT-001**：kill 前保存原 `message-send-dispatch` 流和外部未返回事实，重启后以新 PID 建立同 clientMsgId 的观察。`attemptId=<真实消息行id>:<持久dispatch次数>`、`messageId` 及 databaseIdentity 关联同一原请求；每个真实查询有独立 queryAttemptId，headers/body 的 responseStatus 只在真实接收后出现。`not-durably-recorded` 不是未生效保证，automatic-query-pending 不是人工暂停。记录真实查询和提交原因；普通404、私有 effect:none 或长等待都不能造出否定完成保证。SSE/echo 终态可能不在此流，仍由现有公开状态/receipt/独立网关取证，不能因缺 query-result-committed 误判产品。两分支原安全断言始终执行，静默无终结信号仍保留 BLOCKED。
- **INT-ACT-001**：本次不改既有重启场景或裁判。新增同进程时钟字段不能填补旧 epoch 的 SIGKILL 尾段；`includesUnsavedTail=false` 合法并继续恢复断言，不能把 persistedActiveMs 或多个不完整域机械相加成完整证据。

QA 工具自测覆盖上述映射、晚订阅、实际身份/时钟/前缀、history attempt 缺失，以及 `60005..60017ms`、`5000.74675..5000.849417ms` 这类已明确超限必须 FAIL 的边界。工具自测不运行 SUT，也不替代新的独立验收。开发样例中部分条目是直接 helper 与真实 PG/HTTP 测量而非控制器验证的归属，不能直接冒充正式 QA 证据。

## 活动预算：INT-ACT-001

模式 `observe-activity`，关联 `{kind:'activity',groupId,runId,toolUseId:'all-run-steps'}`。此模式只观察，不暂停／修改时钟或引入新持久幂等保证。返回 `activity-checkpoint / activity-terminal`，附：

- `activeElapsedMs:[lower,upper]`：原run从创建到该实际观测点（终态事件则到真实终止判定）的**实际活动总量区间**，包括多个实例epoch，排除有证据的停机。不是当前观测请求起点或最终一次重试的年龄。
- `epochIds`：真实观察到的活动所有权段标识，始终为字符串数组。`includesUnsavedTail=true` 时必须非空且覆盖完整原run；false时可以是空数组，诚实表示尚未见任何epoch，不因此屏蔽独立恢复暂停事实。新pid接管必须保留原run关联，但不得伪造不可观测的旧epoch；缺跨实例完整关联仍阻塞重启预算通过。`persistedActiveMs`可额外说明持久采样量，但不能替代活动真值。
- `includesUnsavedTail`：只有确实测量／约束全部epoch及未保存尾段才为true，此时 `activeElapsedMs` 必须是有效完整区间。无法提供完整活动区间时必须为false，`activeElapsedMs` 可为null或缺省；这是合法的不完整证据，不是格式错误。如果仍提供非null区间，其格式仍须有效，但不得据此判预算通过。`observedEpochActiveMs`、`persistedActiveMs` 等局部采样及缺失原因只作为原始诊断保存，不能替代跨epoch总量，未固定的附加字段不作判定依据。不能因D040登记了风险就补造500ms容差。
- `activityState: active | recovery-paused | terminal | unknown`：实际执行状态。`recovery-paused` 专指等待人工／外部结果确认、无法自动续跑的恢复暂停，不是普通排队或自动调度暂未开始。未能确定真实状态用unknown。控制器必须按实际状态变化追加检查点；公开run的running和进程存活均不能用来伪造active。终态事件必须为terminal。

纯预算用例另需 **activity-safe-boundary** 能力和 `hold-safe-activity-boundary` 模式。该模式只在当前Agent响应与继续执行所需状态已真实持久化、无外部请求在途、下一次外部派发之前保持原run；不补写状态、不清恢复标记、不替换响应、不改变产品时钟。返回真实 `activity-safe-held`，附 `stepId`（实际持久步骤的opaque身份）、`continuationDurable:true`、`remoteInFlightCount:0`、`activityState:active` 及上述活动字段。租约必须保持held且未到期，直到显式advance、DELETE、TTL释放或该被绑定进程退出。跨进程不可续用旧屏障。缺能力、实际安全窗口或因果证明为BLOCKED，不能只看到running就直接崩溃并声称完成纯预算覆盖。

QA用外部Agent各轮7秒的合法不同只读工具响应保持运行，17秒后**请求**安全屏障；17秒不是崩溃时刻保证。在真实安全屏障命中并与独立Agent已完成请求账本核对后，紧邻kill前重读快照确认仍held且未过期才SIGKILL；记录kill完成UTC并确认仍早于expiresAt，跨TTL则BLOCKED。随后停机5秒，再启动相同数据库上的SUT。工程必须证明响应已被应用接受且续跑状态已持久化；Agent桩仅证明已响应，不能替代这段见证。安全屏障保持期间的时间按实际产品规则计入活动见证，不从测量中擅自减去。恢复不能清除未知结果标记来强行续跑。

时间数据为用例输入，不是产品时限变更。QA保存performance.now下的创建、kill、start、最后running／首次terminal请求响应区间，独立减去停机上下界。但**进程在线仅能提供实际活动量的保守上界**：不能用在线下界超过60秒断言活动预算失败，也不能假设在线区间必与实际活动区间相交。真实活动下界超过在线上界属于矛盾证据。真实网关不得收到发送，公开结果须原runId、failed/wall_clock、active指针清空。

裁判是一侧上限：完整活动见证下界已超过60000则FAIL；完整上界不超过60000才证明最大预算。原A5.2没有最低运行时长；wall_clock而上界小于60000本身不判FAIL，真实结束原因与合法循环/终止后不再派发分别核查。实际活动区间跨过60000且下界未超过时证据不能确定，记BLOCKED；允许 `[59999,60000]` 这类有界证明，不要求物理采样精确成 `[60000,60000]`。缺完整epoch/尾段或真实活动状态记BLOCKED。若真实恢复见证表明等待人工／外部确认而无法自动续跑，准确记录**原A5.8强恢复不满足FAIL**，不归因成预算超时；这是独立恢复要求，不放宽原预算。

不完整活动区间不能中止独立恢复观察。QA先检查整份快照中是否已经出现 `recovery-paused`，不能被较早的unknown或缺尾段检查点遮盖；对合法的不完整证据继续有限观察公开原run身份、终态、发送副作用和后续实际恢复状态。已经确认恢复暂停即为原A5.8的FAIL；没有独立违约但最终仍无完整活动证据才将预算判断记BLOCKED，绝不以局部采样推算通过。85秒仅为终态诊断观察预算，超出而无确证违约记BLOCKED，不另设业务SLA。真实控制器和新增安全屏障仍是工程接入依赖，QA客户端自测不能证明已接入。该例只分离并验证安全阶段重启后的预算累计，不宣称覆盖任意在途崩溃、全部双实例所有权或未知外部结果窗口；后者仍保留原强恢复验收要求。

## 账号原事务保存：INT-ACCOUNT-001／002

关联 `{kind:'account',accountId,operation:'connect',intentId:<QA UUID>}`。intentId仅选择本租约下下一次真实公开connect操作；实际 `requestId / transactionId / attemptId` 必须独立观测，每个事件附不含数据库对象名的opaque关联值。QA只在该账号一次connect前布置，外部Gateway记录实际请求及结果。

- `account-save-once`：远端connect成功后，在其原事务局部savepoint内注入一次真实、可在同原事务恢复的局部保存错误，进入 `local-retry-held`，随后advance解除故障并放行原保存重试。事件依序包含 `remote-success / local-save-failed / local-retry-held / local-save-committed`。不替换公开HTTP状态、不预写账号、不把异常后的新事务结果伪称原事务。具体安全错误种类由工程实现并在contractReference证明，QA不指定savepoint个数或SQLSTATE。`local-save-failed.recoverableInOriginalTransaction:true` 必须来自实际可恢复局部错误，不是仅返回一个HTTP故障。`local-save-committed.commitBoundary:outer-commit-confirmed` 必须在原外层事务COMMIT确认后记录，不能把RELEASE SAVEPOINT、内存状态变更或提交尝试冒充提交成功。
- `account-save-persistent`：同一窗口持续出现真实本地保存错误，工程已有有限重试耗尽后产生 `transaction-rolled-back`，公开请求显式失败。保持租约并不允许无限重试；观察预算不足记BLOCKED，不发明重试次数。释放后才允许QA显式新connect。

001还需 `account-intent-wait` 能力。在保存被保持时核对远端实际connect仅1次、本地仍idle、WS无已提交状态通知；再发起expectedFrom=online的新disconnect。**客户端创建Promise不证明并发到达**。放行前必须观测 `newer-account-intent-waiting`：该新HTTP请求已被真实SUT接收且正等待本次connect原事务持有的账号串行边界。事件公共requestId/transactionId仍关联原connect，另附 `waitingIntent:{requestId,accountId,expectedFrom:'online',to:'disconnected',waitingForTransactionId}`，其中新requestId必须独立且不同，waitingForTransactionId必须等于原transactionId。仅控制器收到命令、网络发出、请求路由开始但未等待，均不足以证明这个事件。

等到真实等待事件、屏障仍held未到期，且Gateway尚无disconnect、本地仍idle/无成功WS后才advance。缺等待能力或窗口记BLOCKED；禁止随机sleep补造竞争。最终确认两请求正常结束、最终disconnected、远端connect/disconnect各1次。事件顺序是原保存失败/held → 新请求实际等待 → 原外层事务提交。同一原事务和原请求诊断一致，不能通过另启事务重放旧连接使新意图被覆盖。

002确认错误结构、本地回滚、无虚假状态WS、无自动外部重放；解除故障后由QA主动执行新connect再disconnect，观察旧意图不得恢复。远端成功而本地失败仍是跨系统差异，**此例不将其写成原子提交或全面恢复保证**。每条用例的1500ms负向观察只证明有限本次窗口。

## 诊断生命周期：INT-DIAG-002

`diagnostics` 是事先审核、只定位公开JSON的静态profile：module，modulesPointer及相对模块的namePointer、statePointer、consecutiveFailuresPointer、lastFailureAtPointer、lastSuccessAtPointer、currentDurationMsPointer、tickCountPointer，加states.failed/running/healthy三种实际状态文本。全部为RFC6901指针和纯字符串，无代码、阈值或改写输出。公开说明只描述语义未固定字段拼写，因此缺profile先BLOCKED，不看内部实现编造新API。

模式 `module-fail-then-hold`，关联 `{kind:'module',module,attemptLabel:<QA UUID>}`：

1. 真实模块tick抛出包含faultMarker的异常；记录 `module-failed` 后，在下一轮任何活动计时、诊断running更新及tick-start之前保持，记录 `module-before-next-held`，附 `tickBoundary:before-activity-and-diagnostics-start` 真实挂点见证。不能在tick-start已经更新running之后暂停并再把状态改回failed。此时诊断应failed、连续失败数至少1、有真实失败时间。
2. advance使下一轮真实开始，在tick进行中保持并记录 `module-running-held`。诊断running、持续时长非负且不减少，未完成时不得刷新成功时间。
3. 再advance让真实tick自然成功，记录 `module-succeeded`，在后续tick开始前保持，允许QA观察完成状态。诊断健康、连续失败数清零、保留原失败时间、成功时间更新、tick计数增加。DELETE解除后续入口保持。

控制器不得直接写诊断状态或计数；必须由原模块执行/异常/完成路径更新。任一步实际tick失败未出现都不能靠返回合成事件判通过。QA从真实管理员REST验证整个生命周期并检查本次错误正文marker、会话token/cookie和连接串/堆栈模式不泄漏；它是有限样本，不声称任意秘密皆无泄漏。不要求某个固定tick周期，也不把模块成功等同业务成功、容量可用或全局健康。

## 工程最小交付

交付版本化接入文档、可运行本机控制器、真实owner识别方式、上述能力中已实现集合、真实挂点与opaque因果字段来源、TTL/崩溃释放证据，以及诊断profile的公开响应样本。未实现能力可缺省并让对应用例BLOCKED，不可用接口自报假象关闭依赖。QA四条自动化和工具自测是客户端准备；联调时才确认接入成立。

## 2026-10-01 严格时限裁判纠正

依据[收尾判定契约第3/4节](../requirements/evidence-followup/static-closeout-contract-20261001.md)，60秒为上限；不要求停止决定恰好发生在60秒，也不凭较早的wall_clock自动判FAIL。完整真实活动/停止决定或新派发下界超过60000仍FAIL，完整上界不超过60000方可证明上限，跨界或缺段仍BLOCKED。真实停止决定之后再派发是独立违约，缺活动时长或随后COMMIT不能掩盖；终态与同attempt实际COMMIT、原因映射仍须核对。

CAP-003复用`activity-witness`/`agent-lifecycle-witness`两个只读流，与既有容量控制同时绑定同一SUT。`includesUnsavedTail=true`采用工程[活动见证说明](../../docs/qa-activity-witness-20261001.md)第32/36行公开语义：从真实创建开始，连续同epoch边界完整；不能由若干active样本推断连续性。真实run/group/applicationPid/clockDomain/epoch必须一致，缺创建、失去所有权、历史被截断、尾段不完整均不得将创建至决定差当完整活动。实际决定先于同attempt终态COMMIT；提交和公开GET/WS可见性延迟单列诊断，不要求其区间与活动决定区间相交，不新增公开终态SLA。旧capacity的持久active_ms和采样至读回尾段不能代替此证明；缺runtime接入时仍完成公开/零效果/释放后不迟发检查，预算项保留BLOCKED。

现有工程活动见证第22行把正常terminal边界包围为`finish进入→终态COMMIT确认`，不是COMMIT本身的精确停止点。该完整活动区间的真实下界已超限仍FAIL；上界仅因宽包围跨界则BLOCKED，不能报告为已证明迟停止，也不能把其中persistedActiveMs当更精确答案。另有同域生命周期`decisionWindowMs`时，单独判断创建至实际决定的区间，并保存同attempt COMMIT；决定≤60秒且COMMIT晚于60秒不会因提交滞后自动FAIL。若活动完整性或粗区间仍不足以单独证明预算，保留对应缺口，不能将配置deadline或终态取样反填成精确决定。

5秒等待没有套用删除下限：原工具表同时要求最多等5秒和“5秒后仍无法确认→SEND_TIMEOUT”。已确认accepted/sent/failed可提前返回；持续未决支路必须有实际504接收、查询故障、事件控制及整个等待段没有明确结果的前提。保留prepared/审计、等待进入、结果交还、history与下一turn不同边界；故障开启和504到达都不能重置等待预算。已证明超过5000的真实下界仍FAIL；不舍入、不加容差。本次仅修后续QA资产，旧版本结果和真实超限证据保持。
