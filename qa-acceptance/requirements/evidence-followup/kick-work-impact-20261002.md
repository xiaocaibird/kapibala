# 首轮 kick work 修复的独立 QA 变更影响评审

评审编号：`QA-IMPACT-20261002-KICK-WORK`。产物角色：`change-review`。本文件是固定源码的只读静态影响评审，可用于候选启动门禁材料；不是产品执行记录或验收通过签字。

- 基线交付：`01f2c1a237e84bcff68ade470402b369b345cd58`。
- 本次正式交付：`7d53ee1f054961c9c997ff79dcb30e5a7e89ac46`；产品源：`aea111aa5438db1773e2990dc2fd0d26ea52c5b9`。已核对产品目录、脚本及根依赖清单在 aea→7d53 无增量；交付后继仅归档材料，不把开发结果移作 QA 结果。
- 评审人：独立 QA `/root/observation_contract_review`。
- 评审方式：只读 Git 固定提交 diff、公开工程观测接线、原用例与本轮准备资产；没有启动或连接 SUT、数据库、浏览器或真实 provider。
- 本文只新增这个文件；不修改原源码、报告、原始证据及业务预期。实际执行结果须由另冻 QA 版本、目标、子集和新 run 记录，本文不预填 PASS。

## 实际变化与影响

已逐项阅读指定九个文件的 `01f→7d53` diff，共 598 行新增、151 行删除。以下描述是源码事实及由此识别的验证风险，不等于运行已经有效。

| 文件 | 实际变化 | 本次需要区分的风险 |
| --- | --- | --- |
| `core/database-deadline.ts` | 新增进程内单调绝对 DB 截止作用域；嵌套只缩短。连接获取、查询使用剩余时间；保留更短的原 session timeout；确认 SQL 错误等待真实回滚，未知响应污染并销毁连接。 | 排队 connect 不能被 pg 公共接口撤销，晚到连接不得发 SQL；连接销毁不证明服务器已经回滚。设置恢复、网络与池复用仍须分别取证。 |
| `core/db.ts` | 有截止作用域的 query、transaction、tryWithLock 使用限时连接；无作用域保留原路径。未知/污染连接不排队假回滚，锁清理失败走销毁。 | 真实 BEGIN/UPDATE/COMMIT/ROLLBACK 与连接归还不能混为一件事；共享池和锁路径受影响，有限 kick 结果不覆盖全部模块。 |
| `core/messaging.ts` | 增加内部 2000ms 分配、hardBudgetSignal、workDatabaseDeadline、afterConfirmation、明确拒绝后本地修复失败类型。 | 成功远端事实、已确认拒绝、未知效果、真实持久结果必须分开。2000ms 是工程分配，不是收尾物理上界。 |
| `core/remote.ts` | 仅将实际 source 联合扩展为 `kick-work-budget`；原请求等待与观测实现未重写。 | work 与 hard 不能混名；错误名、socket close 和多个组合别名不能代替真实 signal/reason 因果。 |
| `automation/activity-clock.ts` | checkpoint 原1500ms上界进一步受当前总 DB 截止限制；观察前、连接及等待检查剩余时间，超时文字调整。 | 未改变活动起点、账本与未保存尾段定义。较短等待仍不证明真实 checkpoint 或终态已提交，不接受新容差。 |
| `automation/agent.ts` | 复用原下一阶段终止优先级；成功/明确拒绝的 kick 后重读 run 并在原总截止内收尾；scan/startNext退出旧 DB 截止。 | 取消/群不可写优先于预算等终止条件；后继 run 不应继承旧截止，原所有权 signal 不因此被清除。普通成功不能证明这些临界组合全部成立。 |
| `automation/tool-execution.ts` | 仅 kick 建立 DB 截止；首次 POST准入从15000增为17000ms，多次复核。分离 work/hard真实 signal，先保存确认成功；明确拒绝不因较晚 work到期改成未知，未知派发保留意图并尝试真实暂停/终态。 | 剩余15–17秒可能提前停止；未派发与已派发未知不能互换。成功保存失败必须传播真实错误，不能拿内存确认冒充 durable result或授权重派。 |
| `gateway/messages.ts` | 请求组合纳入 work/hard/原锁源；明确拒绝后的本地修复失败保留原因。成功确认先调用保存回调，可选成员投影使用较短 work DB截止；投影失败保留已确认成功。 | 正常成功/拒绝与跨 work的投影/修复不是同一个样本。投影 PG可早于work listener返回；不得要求所有正确路径都触发timer事件。 |
| `scripts/qa-runtime-observation/runtime.ts` | release仅在仍持有本 observer包装器时恢复旧query，保留限时连接已经恢复的原生query。 | 修复的是CO01显式组合观测接线。若QA未真正经历限时连接归还→同一连接复用→普通pg callback查询，不能宣称独立QA已覆盖该修复，也不从源码推导生产类必然同样挂死。 |

## 原要求与判定保持

原五秒发送等待路径没有新增 kick DB 截止调用，也没有修改五秒判断和 SEND_TIMEOUT形成条件。本轮不盲目重跑原五秒专项；`01f` 的 `QA-01F-READ-001`、原区间 `[5005.463667,5005.526083]ms` 和严格5000ms FAIL保留。不能由静态未改断言“7d53已经复现同一FAIL”或“已经修好”。共享DB/观测改动的有限回归也不关闭这个旧失败。

原总活动上限仍60000ms，`01f` 的 `QA-01F-ACTIVITY-001`、连续前缀 `[60007,60016]ms` FAIL保留。新 work样本若通过只证明其固定版本和实际轨迹；旧原件不重签。work是 `kick-work-budget`，hard仍是 `activity-budget`，其 listener及pauseCause分别保留真实名称。未发生hard不补造事件、不能将work重命名为旧hard正证。旧hard场景未实际达到，不算旧用例通过。

暂停原因使用真实wire：生命周期 `agent-activity-pause-committed.pauseCause`，或活动事件 `transitionEvidence[]` 中 `phase='pause'` 的 `pauseCause`。不是从函数名、TimeoutError或recoveryNote措辞猜测。暂停事务attempt与原kick执行attempt用途不同，不要求UUID相等；依据同run、实际PID/clock、原序列及各自真实事务关联。

真实创建包络下界到同run真实terminal outer COMMIT返回上界≤60000ms，是包含暂停及持久尾段的保守充分上界。仅这个上界跨60000记BLOCKED，不能将暂停后的提交尾差自动判活动超限，也不新增COMMIT业务SLA。任何已证明的原实际活动下界>60000或实际停止决定后新派发等违约仍先FAIL，缺COMMIT等不能抹去已证违约。没有最低运行时长、精确2000ms listener间距或“1500ms checkpoint+500ms事务必然完成”的要求。

COMMIT已发不等于已知提交；回包丢失时服务器可能已提交，须保留未知，不能伪造ROLLBACK。客户端超时/销毁连接不当作PG取消已确认；真实SQL错误后的可用连接须等待实际ROLLBACK确认。已收到成功COMMIT不因JS恢复较晚反向改写为回滚。

## 本次有限子集与未测边界

本轮共享入口 `qa-first-round-kick-work` 选定以下五个独立编号，最终以冻结的manifest和新run为准：

| 原编号 | 实际准备的有限覆盖 | 不可据此声称 |
| --- | --- | --- |
| `AGENT-017` | autoKick关闭的POLICY_DENIED、零外部kick、成员保留。 | 预算临界下全部政策/身份组合已验证。 |
| `AGENT-018` | 正常成功、精确审核动作、creator/admin执行者及真实目标移除。 | 成功后的可选投影跨work、投影真实PG取消或保存故障恢复已验证。 |
| `CAP-008` | 实际容量延后后OWNER_LEFT和NO_PERMISSION明确拒绝、零成员效果及原映射/状态。 | ACCOUNT_SUSPENDED等本地状态修复跨work、修复失败或取消优先级已验证。 |
| `CAP-010` | 已派发504真实效果、查询收敛、容量压力不重置意图/重审计/重放。 | 长pending确认跨work、COMMIT未知或任意重启全部已验证。 |
| `INT-KICK-WORK-001` | 从零真实活动、真实容量拒绝后准入、原POST504、唯一pending确认GET在work源取消、真实pauseCause、真实终态COMMIT保守上界及有限唯一效果。 | hard源同时触发、所有未来不重放、运行期第二实例交叉、任意崩溃恢复或全面上线准备度已验证。 |

成功投影跨work、明确拒绝本地修复跨work、成功/拒绝保存失败、取消优先级、连接池晚到、未知COMMIT、deadline后同一PG连接callback复用等不是上述普通回归自动具备的覆盖。它们按已识别的有界风险登记，不能把未执行场景计PASS，也不以空脚本注册成自动化覆盖。特别是CO01必须有真实复用轨迹才能说QA命中；本次仅同一工程入口或多个observer安装不是充分证据。

原运行中双实例 `AGENT-003` 的2716版本PASS保持；预算×已派发×运行中二实例是原额外交叉边界，不新增本五例关单条件。原 `BLK-EXT-001` 静默未落地分支的首轮BLOCKED仍按原证据缺口保留，不用有限等待造否定终态，不重复询问D039。有限H18四态体验仍closed-by-user，不重开四态/unknown样例；真实IME/焦点与完整真人证据另记。C1/C2与第二轮、真实provider、浏览器/真人及上线门禁不在本有限执行范围。

## 开发证据与一次收尾边界

7d53内研发说明记录了aea最终整合569 PASS/0 FAIL/11 SKIP、work完整链保守上界58021.999958ms，以及CO01修前反例和修后单连接/组合回归。这些是固定研发材料的陈述，本文没有重新执行或逐条独立复判它们，不能当QA结果或证明11条跳过已通过；较早约58秒样本不得转绑定新源码。开发材料路径为 `docs/kick-settlement-budget-20261002.md` 及其 `docs/evidence/kick-settlement-20261002/`。

本次用户最新收尾边界：仅一次冻结候选的有限影响执行，零自动重试；若有FAIL、BLOCKED或未能命中，保留首次结果、取证和资源清理，出报告后暂停。不因失败自动启动研发修复后的新产品补测，不以QA驱动修正重跑抹去首次记录。准备期工具自检及必要静态门禁修正不是产品重跑。根已核对实际用户新消息，本文不扩大既有执行授权。

## 固定源码字节索引

以下SHA-256由Git固定提交的实际blob计算，不取当前可变工作树。此索引仅覆盖本次指定九个文件，不冒充整项目签名或全量验收。

| 文件 | 01f SHA-256 | 7d53 SHA-256 |
| --- | --- | --- |
| `apps/server/src/core/db.ts` | `0d2363bf66f9def7c63a188ea1b356d8421d941bf09a14220da6f1c2321a9a75` | `2e66f051f3fa295eac3fb1e236c23a1324dad0cc93558b03031a6fc404d482fd` |
| `apps/server/src/core/database-deadline.ts` | `新增文件` | `3f8de0f41b8bb4679cf2222afab83d63a82c830700826684f5351503f8593a8c` |
| `apps/server/src/core/messaging.ts` | `a64cd63ba634cf7000c46ccbd1092eb51dc21668c7a128c8351b765a856f1ead` | `aa8404cf7ff7e3244591863f0fd13962cd4adda98509f3c440c51173bc53bf23` |
| `apps/server/src/core/remote.ts` | `a2ab73804b027d5cd8cc00a6f9d28f4525ba0682678f72ccb38ab161ea178da2` | `69a7503fb0f9407ff099e92f039369750dd5c05025f1b1eef32b9f1dbe6096ba` |
| `apps/server/src/modules/automation/activity-clock.ts` | `d46ee304f1a1138df20dbb583e73efedd47cf588e0934d49a3e2b002ac212723` | `c0567e13f21276156c810a35f6ca1fd7a1168d808e7e4000973472b6cb750e99` |
| `apps/server/src/modules/automation/agent.ts` | `990e61de82997926008b2dd03258be374fcf0ea2135e15b4f6c34e0653104e87` | `21aa1f085ea3d77520158a30880f933d9657854667bef880779e09b20778af11` |
| `apps/server/src/modules/automation/tool-execution.ts` | `5d91567ab7e4d832ab045ba9d20e22a3607235f6fe358a22ba8d94db25e0755f` | `186898f3be1a96675cf2094c60f42d06ae719d5e69d76ef0d2a358b611b97f59` |
| `apps/server/src/modules/gateway/messages.ts` | `0024c5bb0186892f47eb9ee45e11fd61652c79bdd6aa82b1b4fc206f3fcf8d8e` | `ae1ac18de710168839457460200d323adb1b036084d6403b30c45ff7a532f7bb` |
| `scripts/qa-runtime-observation/runtime.ts` | `d54f0ad3db4cfb98ae7ddb5e2242c24fb54bc797ed856fffe962e74a4ee26ea0` | `7340e26e1ce56d968743725992dfe9e9367d7ac96d019d34357dac4025ac16ea` |

评审时间（UTC）：`2026-10-01T20:03:02.076703+00:00`。只读评审结论：允许按上述有限范围继续准备和冻结；产品结果仍以新run报告为准。
