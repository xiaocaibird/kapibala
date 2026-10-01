# 原始运行观测与局部故障接入

本契约对应 INT-R02／INT-R04／INT-R06。QA 客户端及四条自动化已准备，**真实工程控制器尚未接入，产品未执行**。工程提供本机薄适配与必要的真实执行观测，QA 维护公开接口预期和独立网关／WS证据；不能用 fake-controller 工具自测代替产品验收。

依据：原 A5.2 的60秒累计活动预算与重启恢复；D040 保留停机不计、不虚报任意硬崩溃尾差上界；原 A1 提交后状态事件与 D043 原事务内有限本地保存恢复；D045 以及 `docs/core-resource-observability.md` 的管理员诊断语义。这是隔离测试接入，不新增生产公开业务接口、不要求暴露业务表名、SQL或内部模块导入。

## 配置、实际归属与故障安全

`adapters.runtimeObservation={url,contractReference,diagnostics?}` 纳入目标配置及授权指纹。URL 只能是带显式端口的 `http://127.0.0.1` origin；无重定向、用户名、密码、额外路径、query 或 hash。契约引用须绑定已评审工程实现。无真实配置、进程归属、窗口证据或字段profile时用例为 BLOCKED。

QA 使用既有 `capacityControlTarget()` 的 `{apiUrl,revision,pid,ownerToken}`，其中 pid 是 QA guardian/进程组拥有者。控制器必须验证该拥有者下实际应用进程、完整40位版本、API地址与从进程观察到的随机资源token。QA **不将 ownerToken 随请求发出**；回包 `binding.observedOwnerToken` 须由实际进程观察取得，不接受请求参数回显或只核对端口。SUT重启后，新的控制器客户端重新核对新pid；旧租约只允许读取／释放历史，不得自动跟随端口控制新实例。

每个故障是客户端随机UUID租约，TTL 5–120秒，由工程控制器独立自动释放；此值是 QA 资源安全边界，不是产品性能指标。PUT前即登记本地leaseId，响应丢失后仍只清理这个ID。DELETE幂等且保留证据；不可按模块名或全局条件释放其他运行的资源。所有用例在finally清理，并保留第一次业务失败；清理异常另记。共享控制器不可将不同QA owner的租约混用。

请求不得含业务预期、结束状态、预算数值、时间戳、SQL、回调、文件路径或可执行代码。允许的 `faultMarker` 仅为 `qa-runtime-` 前缀、最多96字符的合成错误样本，供真正抛出的模块异常携带；不得覆盖诊断接口输出。

## `qa-runtime-observation/1` 协议

- `GET /qa/runtime/v1/capabilities?apiUrl=...&revision=...&pid=...`：返回 `{protocol,binding,capabilities}`。能力为 `activity-witness / activity-safe-boundary / account-local-save / account-intent-wait / module-tick`。声明能力不等于故障发生。
- `PUT /qa/runtime/v1/leases/<UUID>`：`{protocol,target:{apiUrl,revision,pid},mode,correlation,ttlMs,faultMarker?}`。初始state可为armed，必须通过后续真实事件确认触发后才能断言。
- `GET /qa/runtime/v1/leases/<UUID>`：完整快照。事件必须追加、全局租约seq严格递增、已观察历史不可改写或删除；字段对象键顺序不影响相同证据的判定。
- `POST /qa/runtime/v1/leases/<UUID>/advance`：只放行模式中当前已命中的屏障，不能制造业务成功。重复调用不得跨越未命中的阶段；不接受任何请求体中的结果或时间值。
- `DELETE /qa/runtime/v1/leases/<UUID>`：释放本租约注入／屏障，返回state=released。后续真实提交／回滚事件仍可追加，租约不得复活或延长期限。

快照：`{protocol,leaseId,state:armed|held|released,expiresAt,binding,correlation,events}`。事件公共字段：`{seq,at,kind,correlation,attemptId,instancePid}`。`attemptId` 来自真实执行尝试，`at` 来自实际观测，`instancePid` 沿用协议的历史字段名，指本次绑定的guardian/进程组拥有者PID，**不是要求实际应用子PID等于guardian**。控制器仍须确认API监听应用实际属于此进程组并从其进程读取token；实际子PID可作为额外只读诊断。correlation只选择目标，不能成为实际发生证据；工程记录必须能够从公开run/账号/模块追溯到实际尝试。接口失败必须用非2xx，无重定向；QA不执行服务返回的任何指令。

## 活动预算：INT-ACT-001

模式 `observe-activity`，关联 `{kind:'activity',groupId,runId,toolUseId:'all-run-steps'}`。此模式只观察，不暂停／修改时钟或引入新持久幂等保证。返回 `activity-checkpoint / activity-terminal`，附：

- `activeElapsedMs:[lower,upper]`：原run从创建到该实际观测点（终态事件则到真实终止判定）的**实际活动总量区间**，包括多个实例epoch，排除有证据的停机。不是当前观测请求起点或最终一次重试的年龄。
- `epochIds`：真实活动所有权段标识，新pid接管必须保留原run关联；`persistedActiveMs`可额外说明持久采样量，但不能替代活动真值。
- `includesUnsavedTail`：只有确实测量／约束全部epoch及未保存尾段才为true。无法提供完整活动区间时必须为false，并报告BLOCKED；不能因D040登记了风险就补造500ms容差。
- `activityState: active | recovery-paused | terminal | unknown`：实际执行状态。`recovery-paused` 专指等待人工／外部结果确认、无法自动续跑的恢复暂停，不是普通排队或自动调度暂未开始。未能确定真实状态用unknown。控制器必须按实际状态变化追加检查点；公开run的running和进程存活均不能用来伪造active。终态事件必须为terminal。

纯预算用例另需 **activity-safe-boundary** 能力和 `hold-safe-activity-boundary` 模式。该模式只在当前Agent响应与继续执行所需状态已真实持久化、无外部请求在途、下一次外部派发之前保持原run；不补写状态、不清恢复标记、不替换响应、不改变产品时钟。返回真实 `activity-safe-held`，附 `stepId`（实际持久步骤的opaque身份）、`continuationDurable:true`、`remoteInFlightCount:0`、`activityState:active` 及上述活动字段。租约必须保持held且未到期，直到显式advance、DELETE、TTL释放或该被绑定进程退出。跨进程不可续用旧屏障。缺能力、实际安全窗口或因果证明为BLOCKED，不能只看到running就直接崩溃并声称完成纯预算覆盖。

QA用外部Agent各轮7秒的合法不同只读工具响应保持运行，17秒后**请求**安全屏障；17秒不是崩溃时刻保证。在真实安全屏障命中并与独立Agent已完成请求账本核对后，紧邻kill前重读快照确认仍held且未过期才SIGKILL；记录kill完成UTC并确认仍早于expiresAt，跨TTL则BLOCKED。随后停机5秒，再启动相同数据库上的SUT。工程必须证明响应已被应用接受且续跑状态已持久化；Agent桩仅证明已响应，不能替代这段见证。安全屏障保持期间的时间按实际产品规则计入活动见证，不从测量中擅自减去。恢复不能清除未知结果标记来强行续跑。

时间数据为用例输入，不是产品时限变更。QA保存performance.now下的创建、kill、start、最后running／首次terminal请求响应区间，独立减去停机上下界。但**进程在线仅能提供实际活动量的保守上界**：不能用在线下界超过60秒断言活动预算失败，也不能假设在线区间必与实际活动区间相交。真实活动下界超过在线上界属于矛盾证据。真实网关不得收到发送，公开结果须原runId、failed/wall_clock、active指针清空。

裁判是一侧上限：完整活动见证下界已超过60000则FAIL；上界不超过60000才证明最大预算。若公开理由是wall_clock而实际活动上界（或独立在线上界）严格小于60000，则为提前错误宣告耗尽。实际活动区间跨过60000且下界未超过时证据不能确定，记BLOCKED；允许 `[59999,60000]` 这类有界证明，不要求物理采样精确成 `[60000,60000]`。缺完整epoch/尾段或真实活动状态记BLOCKED。若真实恢复见证表明等待人工／外部确认而无法自动续跑，准确记录**原A5.8强恢复不满足FAIL**，不归因成预算超时；这是独立恢复要求，不放宽原预算。

85秒仅为终态诊断观察预算，超出而无确证违约记BLOCKED，不另设业务SLA。真实控制器和新增安全屏障仍是工程接入依赖，QA客户端自测不能证明已接入。该例只分离并验证安全阶段重启后的预算累计，不宣称覆盖任意在途崩溃、全部双实例所有权或未知外部结果窗口；后者仍保留原强恢复验收要求。

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
