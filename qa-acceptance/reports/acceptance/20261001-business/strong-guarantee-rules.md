# 强保证判定规则与最终候选冒烟证据复核

本记录供最终业务验收报告引用；不是完整业务验收结论。仅只读复核已有冻结证据和原验收依据，没有运行产品或修改冻结执行树。最终候选为 `86ad4e7e63786f652c965308b032b98415bdd7ac`；以下规则不因候选实现采用了某种持久化、锁或恢复策略而改变。

## 判定依据与共同规则

- 原始需求 `docs/original-interview-question.md:192` 的任意时刻重启总则；A2 第224–225行的出站记录、唯一效果与504确认规则；A5 第258行的60秒活动预算及第264行的同run恢复、已生效工具不重复也不记失败。
- [澄清表 CL-01/02/03](../../../requirements/clarifications.md)、[容量接入合同](../../../contracts/capacity-observation.md)、[运行期观测合同](../../../contracts/runtime-observation.md)、[实时与分页准备范围](../../../requirements/next-integration-preparation-20261001.md)。这些合同规定取证方式，不能替产品新增幂等、确定性响应、时限或结果。
- `FAIL` 需要已成立的测试前提与明确违反要求的事实；`BLOCKED` 表示环境、窗口或证据不足，不能计为通过。独立硬违约不能被同场景另一个计量缺口遮盖。用例最差结果与单条断言归因分别保留。
- 协议桩是外部事实见证。QA私有账本知道“不会落地”，不等于产品得到了公开未发送证明。控制器声明能力、公开 `running`、进程存活、没有请求，分别不能单独证明窗口命中、实际活动、正在执行或容量耗尽。
- 有限观察预算只是让测试有界，不自动成为业务SLA。首次失败、测量原始值及后续校正/复测各自保留；禁止截断值、加未批准容差、重跑择优或拼接不同版本的通过。

## 后续报告判定表

| 场景 | 判定前提和必须保留的事实 | 明确 FAIL | BLOCKED / 不足以通过 | 有限通过及结论边界 |
| --- | --- | --- | --- | --- |
| **CAP-003：持续真实容量拒绝与60000ms预算** | 原run创建区间；真实容量占用及关联拒绝事件；受保护回调未进入、网关零请求/效果；同一run持续等待；真实预算终止活动区间 `[L,U]`；独立 `performance.now` 创建、最后running/首次terminal请求响应区间。此场景没有重启和恢复暂停前提，不能移用到跨崩溃活动总量。 | 可信活动 `L > 60000` 已证明晚停；`endReason=wall_clock` 而可信活动 `U < 60000` 已证明提前错误宣告耗尽；本场景独立终止区间完整落在阈值一侧也需调查并判实际违约；拒绝期间真实副作用、等待重置原预算、重复审计/工具、错误终态或释放后迟发，按各自要求FAIL。不能把 `[60005,60081]` 说成仅跨界不足。 | 缺关联拒绝/活动计量，控制器与独立时钟互相矛盾且不能归因，或有效 `[L,U]` 满足 `L ≤ 60000 < U`，不能证明没有超限；仅看到最终持久计数60000也不足。矛盾证据单列接入/计量问题，不擅断产品活动真值。 | 活动最大值的有界证据需 `U ≤ 60000`；若因预算耗尽结束，还要排除明确提前。因此允许 `[59999,60000]` 这种含阈值且不超限的区间，不要求物理仪器报告精确点。仍须核对公开 `failed/wall_clock`、原run身份、步骤/审计与释放后的有限无迟发。通过仅覆盖本次持续拒绝场景。 |
| **INT-ACT-001：硬崩溃、未落盘尾段、跨epoch活动累计** | SIGKILL前实际命中已持久续跑信息、无远端在途的安全边界；租约在kill完成前未过期；原runId；独立停机上下界；旧/新实例epoch关联；`includesUnsavedTail`、真实 `activityState`、完整活动总量或诚实的不完整原因；公开结果及外部请求。 | 完整且可信活动见证下界超过60000，或明确提前 `wall_clock`；重启重置已计活动有直接证据；真实 `recovery-paused` 表示需人工/外部确认而不能自行继续，属于A5.8强恢复FAIL；原run丢失、已生效工具重复/记失败等硬违约独立FAIL。 | `includesUnsavedTail=false`、缺旧epoch/尾段、仅有当前epoch或持久值、不能命中安全边界、租约跨TTL、完整区间跨阈值，均阻塞对应预算结论。85秒内没有终态但也没有真实暂停/硬违约，只是有限观察不足。进程在线量仅可提供活动保守上界，在线下界超过60秒不能单独推出活动超限。 | 先看全部事件有无确证恢复暂停，再判计量完整性；不能被较早unknown/缺尾段事件掩盖后来的恢复FAIL。无硬违约仍需完整活动区间和同run正常恢复才可能通过。安全窗口一次成功不证明任意在途崩溃、全部双实例所有权或所有未保存尾段。 |
| **BLK-EXT-001..005 / CAP-009：未知远端结果与恢复暂停** | 请求是否已发、原响应是否实际送达、是否收到明确504、网关实际效果/完整事件历史、kill窗口、重启同run/任务、公开进度和真实恢复状态。CAP-009必须证明零远端拒绝后、ready持久化前的窗口，不得由控制器补写ready。 | 未有公开未发送证明即盲目重发；重复实际消息/踢人；已生效工具被记失败；错误终态、丢失持久历史/原run身份；在应自动恢复的场景，可信见证明确进入只能人工/外部确认的恢复暂停。安全地不重复只是部分安全性质，不能使明确的不能自动恢复变成通过。 | 没收到504时，普通404以及超过2秒均不能证明未发送；原协议缺操作身份/结果查询的不可区分窗口仍保留协议风险。仅公开running、有限10/20秒无终态、只有无固定语义的recoveryNote文字或没有进展，均不足以证明永久停滞。缺精确窗口/归属/外部事实也BLOCKED。 | 按具体用例验证同身份完成、应保留的历史、已发生效果一次且成功；Agent丢失且未执行的模型响应不要求逐字确定性重放。504确认的5秒/恢复查询2秒仅用于明确符合A2前提的分支，不能推广到无响应请求。协议不足不自动豁免原强保证，接受降级须单独决定。 |
| **INT-STREAM-001：真实慢读、健康消费者与已收游标回放** | 两个真实WS均鉴权；慢端实际收到checkpoint后暂停底层读取；健康端实际收到注入消息；慢端真实对端关闭；恢复读取后使用慢端最后实际收到的seq，而非健康端或服务端尝试发送游标；存在真实未收缺口；新连接从该seq回放。独立历史接口验证内容。 | 在前提已确立时，已观察到非法帧/序号、重复身份、错误内容、越过/重放错误游标范围、额外消息，或完整集合/顺序与已存事实明确矛盾；健康消费者实际异常或确定的数据丢失按对应独立断言FAIL。 | 有限2048×8KiB注入没有让服务器关闭，或旧连接恢复读取后已经收齐、没有回放缺口：场景未建立，BLOCKED；健康接收或回放仅在有限观察预算内尚未完成，且无已证实违约，同样BLOCKED。不能自行丢帧、伪造发送回调或把QA主动关闭冒充慢端被关闭。 | 必须真实形成缺口并恢复完整、唯一、有序消息集合，健康端继续工作，才通过这个具体故障样本。45/8/15秒是QA观察配置，不是吞吐/关闭/回放生产SLA；不证明整体内存上限，也不代替浏览器3秒恢复用例。 |

### 冻结脚本的报告解释边界

当前冻结 `tests/system/capacity-control.spec.ts` 的CAP-003在检查实际超限、提前与独立区间后，仍要求控制器区间恰为 `[60000,60000]` 才不阻塞；因此假如真实证据是 `[59999,60000]`，脚本会比上述一侧最大预算规则更保守地给出BLOCKED。应保留原运行结果并明确记录该QA观测判定限制，必要时另做版本化校正与复测，不把区间分辨率变成业务要求，不在运行期间改冻结脚本。已确定 `L > 60000` 的样本不受这一潜在过阻塞影响，仍是明确超限。

原外部协议用例的有限超时可能先生成BLOCKED，而独立工程见证稍后已明确 `recovery-paused`。报告可在保留原用例机器结果的前提下，关联该见证和原A5.8记录独立产品FAIL；必须列出具体见证及其语义来源，不能仅凭模糊备注或静态风险推定运行时暂停。

## 最终候选联调冒烟：独立只读证据核对

冻结报告根目录：`/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/preflight/2026-10-01T06-53-16.144Z-9b614b2e`。QA版本 `f63b3e3b2b4f6e84b145dc03e724c0da03a4acdc`，SUT版本 `86ad4e7e63786f652c965308b032b98415bdd7ac`。`manifest.json`、`runner-summary.json`、`results.json`记录所选15个用例/项目组合15 PASS、重试0、runnerErrors空，性质是 `developer-preflight`；总体结论仍为INCOMPLETE。以下只独立复核选定接入事实，不替其余11例再作全量审查。

| 用例 / 工程接入 | 实際观察和副作用交叉核对 | 证据文件（相对报告根目录） | 本次边界 |
| --- | --- | --- | --- |
| CAP-001 | 绑定PID93101及固定SHA；租约实际持有容量，06:53:29.736Z与.795Z两次关联拒绝均 `callbackEntered=false`、`remoteRequestCount=0`。释放后原run `65cf013f…` 结束final，同tool一次审计、一次kick请求、一次kick效果。 | `artifacts/system-capacity-control--C-c40a9--original-audited-step-once-system/evidence/{capacity-binding-verified,capacity-refusal,capacity-release-final,external-facts}.json` | 接入与该等待/释放样本成立；不关闭CAP-003严格预算或CAP-009崩溃窗口。 |
| INT-MSG-006 | PID95249实际命中 `504-recognized-local-result-save-not-started`，attempt `4189dd26…`，数据库身份已关联。504接收区间 `[1790837616644,1790837616674]`；真实消息及message_sent在06:53:37.562Z落地/保存；保持本地处理约2.5秒后，06:53:39.283Z真实by-client查询200，公开sent读回上界1790837619320，即从原接收下界2676ms以内确定；只有1次send、1条真实落地。 | `artifacts/system-integration-message-2a93a-t-origin-across-local-delay-system/evidence/{message-timeout-window-held,message-timeout-original-deadline,message-timeout-final-confirmation,message-window-final-ledger}.json` | 只证明该延迟样本在原5秒内收敛。一个错误重置deadline但迅速得到正查询结果的实现也可能通过此样本，不能单独据此宣称排除全部重置实现；也没执行007/008两种receipt提交窗口。 |
| INT-ACCOUNT-001 | PID95686原attempt `28ed73ff…` / transaction `4d5f83c3…`：remote-success→local-save-failed→local-retry-held；新disconnect实际等待同一原事务；随后 `local-save-committed` 明确 `outer-commit-confirmed`。网关connect和disconnect各1次；WS online→disconnected；1508ms、27次后续采样无旧连接覆盖。 | `artifacts/system-integration-runtime-87a64-n-before-a-newer-disconnect-system/evidence/{account-original-transaction-and-newer-intent,external-facts}.json` | 真实原事务局部保存恢复和竞争前提成立；有限无迟发样本不证明所有旧意图永不恢复，也不关闭持续保存失败002或硬崩溃预算001。 |
| INT-DIAG-002 | PID96121真实module-failed→下轮开始前held→同一下一attempt running-held→succeeded。公开连续失败数1，在running保持失败时间/成功计数不变，耗时4.57→163.96ms；成功后连续失败归0、successfulTicks 3→4、保留原失败时间。 | `artifacts/system-integration-runtime-76161-hful-restricted-diagnostics-system/evidence/diagnostic-controlled-lifecycle.json`及`api.ndjson` | 真实tick生命周期和本次错误样本检查成立；模块恢复不等于业务完成、外部可用、全局健康或任意秘密皆不泄漏。 |

清理交叉检查：以上四个租约都有DELETE返回200且 `state=released`：容量 `451c39e0…`，message `b7b99cd1…`，账号 `c03d34eb…`，诊断 `95e78fa9…`。对应保存的 `capacity-http-* / message-control-* / runtime-control-*` HTTP证据可复核；同租约重复DELETE仍返回released。全部15个用例都有 `cleanup.json` 或 `fixture-cleanup.json`，`failures=[]`。这仅证明各用例声明的资源/租约清理成功；共享controller仍供后续正式运行使用，不声称controller进程和registry全生命周期已结束或已清空。

结果索引注意：冒烟 `results.json` 的BLK-MIG-001与UI-037条目 `evidence=[]`，但相应 `artifacts/system-fixture-boundaries--*` 目录实际保存夹具来源、拒启/分页及清理证据。最终报告应链接这些实际文件，不能把空链接当作未执行，也不能仅凭PASS省略取证入口。本记录未修改冻结机器报告。
