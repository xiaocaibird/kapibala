# 第一轮固定候选独立验收补充报告

**业务验收建议：不通过（FAIL）。上线准备度：本轮未评估。** 这份报告绑定交付 `01f2c1a`；存在两项原要求下的时限违约，保存整例的QA适配阻塞已在另冻QA源的一次限定补测中关闭。没有降低原5000／60000毫秒标准，也没有把局部恢复通过写成全部业务验收通过。

## 版本、范围与执行

| 项目 | 固定事实 |
|---|---|
| 被测交付 | `01f2c1a237e84bcff68ade470402b369b345cd58` |
| 产品源 | `70dd1eeb83e64b72f250a0b83b63c933feaa4b23`，至交付仅文档变更 |
| 实际执行QA源 | `3ed9a178a7538be58068de8d85f4ff7fb54f8967`；执行时Git干净 |
| run | `2026-10-01T18-39-27.933Z-15f16ec6` |
| 时间 | `2026-10-01T18:39:27.987Z` 至 `2026-10-01T18:40:48.154Z`（UTC；北京时间2026-10-02 02:39–02:40） |
| 目标指纹 | `8f646beb5370fd1f0702032a162f0d1521d7539ef7230dd8425e359ab719f9c5` |
| 子集指纹 | `94e0aece6b269194395715c66ea139dc7d065decb37cda44fbc6e3957d305eb6` |
| 首次执行 | 3／3选定用例执行，1次／例，自动重试0次；保存场景内设计的保留状态重启1次 |
| 独立复核 | 最新3／3结论复核；2 FAIL、1 PASS、0 BLOCKED；首次2F／1B原样保留 |
| 限定修正补测 | `2026-10-01T19-06-58.963Z-ecfeb5bc`；实际QA `ad712b6d68c4b4a72cf2a4984575e4dc147d6592`；同01f、1例、零自动重试 |

执行器原生阶段为 `developer-preflight`，原始输出保留“开发预跑、不构成正式验收”标记。此次由QA独立控制环境、故障和证据，并给出本补充报告的验收建议；它仍是固定三例补证，不代表该候选全量业务用例重新通过。原始机器结果 **3 FAIL** 保留；独立归类为 **2产品FAIL／1 QA驱动BLOCKED**，两套首次结果同时提供。随后明确的QA修正版限定补测1例PASS，最新三例为2 FAIL／1 PASS；累计4次产品case调用，不隐藏第一次记录，也没有重复两条已证产品FAIL。

原始需求SHA `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。实际 Node `v24.21.0`，真实PostgreSQL、独立Gateway／Agent桩、动态端口、专属数据库；无浏览器／真人输入法／真实付费模型执行。开发归档15份原件仅核哈希与固定版本，开发PASS未继承为QA通过。

## 用例与需求追踪

| 用例／来源 | 独立结论 | 主要判定 |
|---|---|---|
| INT-KICK-OBSERVATION-001／R-A5-06、09，A5.2／A5.6 | **FAIL** | 实际连续活动前缀 `[60007,60016]ms` 超过60000；原确认GET取消与预算来源小项通过 |
| INT-READ-CAUSAL-001／R-A5-10、16，A5.7／2.2 | **FAIL** | 原工具等待 `[5005.463667,5005.526083]ms` 超过5000；真实锁链与回滚、保存、同key恢复通过 |
| INT-READ-SAVE-ROLLBACK-001／R-A5-10、16 | **PASS（限定补测）** | 首次QA驱动BLOCKED保留；新QA源另跑1例，真实落地／回滚／恢复COMMIT完整通过 |

优先级仅影响顺序。本轮三个case的本地取证小项不能加入历史254条全量分母，也不代表R-A5-06／10／16的全部其他场景都重新验证。逐项机器结论、实际来源文件见 [results.json](results.json)。

## 已确认产品缺陷

**QA-01F-READ-001，P1，OPEN。** 原要求2.2的send_message最多等待5秒。公开流程产生原run／工具和真实消息；Gateway真实504已落地一次、事件隐去，专属messages表被独立locker持有真实ACCESS EXCLUSIVE锁，确认持续503。同一原执行进程72920的实际source8／9至548／549形成等待区间 `[5005.463667,5005.526083]ms`。三个失败断言均是这一项违约，计一个缺陷。实际14个PG样本分别闭合原SELECT／55P03／同read ROLLBACK returned／release；原Agent保存事务 `9ff3a3ff…` 真实COMMIT返回，同key再用sent且audit／POST／效果各一次。这些后续通过不抹去首次严格时限FAIL。

**QA-01F-ACTIVITY-001，P1，OPEN。** 原A5.2最多累计活动60秒。容量实际拒绝后于38–40秒释放，真实kick POST504在43–44秒放行，精确确认GET保持未返回。活动seq700仍为active、continuous=true、includesUnsavedTail=true，原区间 `[60007,60016]ms`；随后seq701／702暂停／终态为 `[60008,60021]ms`。因此已证超限前缀成立，不因后续continuous=false改成缺证；新SQL事务包络不裁剪活动区间。创建最大1551.952167至实际暂停最小61560.027167的保守差为60008.075ms，独立支持这一结论。

复现使用已登记 `qa-01f-first-round-observation` 的对应case及受控屏障，具体夹具、操作、取证和清理要求见 [用例](../../../cases/first-round-observation-followup.json)。后续合理修复由研发处理；本报告不接受未经确认的时限放宽，修复版本须另冻版本和新run。

## 组合取证与QA问题

原预算source11 `[61545.9125,61545.918792]` 之后，同原确认GET的预算source12 `[61546.068209,61546.071709]` 直接记录fetchPending=true，**KB-CROSS通过**。同GET真实combined abort、fetch rejected、request rejected依次闭合，reason匹配caller／activity-budget，deadline／operation／kick-lock截至settled未触发，**KB-CANCEL通过**。两个别名不当成两个独立根因，也不声称唯一底层传输失败根因。实际终态decision与独立outer COMMIT返回闭合；POST16、GET17、kick效果／audit／turn各1。终态后9次采样保守覆盖1599.972958ms，仅证明有限窗口无重复。较晚终态跨界仍BLOCKED：GET关闭62984.088早于较晚decision映射下界62999.163417，两种边界未混合。

原包装错误访问不存在的lifecycle顶层clockObservation，使raw CROSS／CANCEL记录为BLOCKED；实际PID／start在live provenance、事件及同run活动校准中已有记录。独立PASS来自**同一次原字节复核**，未重跑、未补造事件。活动通道没有lifecycle的monotonicMs，活动checkpoint也可能尚无停止终点；QA现已按两种实际协议分别校验，原下界FAIL优先。早期分析适配记录及最终分析均保留。

保存场景中，唯一send#15在18:39:31.765到达，200响应31.777完成，真实消息31.815异步落地，符合桩的正常50ms安排。before-response屏障控制HTTP响应，原驱动在实际落地前断言必须等于1，造成raw错误FAIL。这是**QA问题**，不是产品副作用丢失。原真实history保存31.859以P0001失败，事务 `cdcd4086…`／PG64实际ROLLBACK返回；真实step／history与基线完全相同，无半提交、无下一turn。

保留DB／Gateway／Agent重启后，新进程72492、新attempt `deb88461…` 与原进程72334分列；同run／step／key／clientMsgId复用sent，独立事务 `1d2dd9df…`／PG74实际COMMIT，持久tool_result唯一、原run finished、audit／send／效果仍各1。原工具等待 `[112.089125,112.161208]ms`、恢复 `[4.749791,4.785958]ms` 均满足5秒。原通用completion helper错误要求恢复进程重新产生prepared，而工具来源是原进程已提交的持久step。各真实子事实通过可单列，**首次整例仍BLOCKED**，仅凭上述本地复核不升级。QA修正版另冻为ad712b6，限定新run独立执行这一例并通过，才将最新整例记PASS；首次raw及BLOCKED没有改签。

QA修正仍由QA维护，研发只读使用。最终5项QA自身检查通过，自测 **343／343 PASS，0 FAIL／SKIP**；这证明QA工具的校验结果，不能证明产品已通过。产品执行期间的实际QA源仍为3ed9a17；修正后第三例实际执行源为ad712b6，原run不改写；kick修正驱动未再产品试跑。

## QA适配限定补测

新run `2026-10-01T19-06-58.963Z-ecfeb5bc`，固定同01f、实际QA源ad712b6、执行时Git干净，1例1次、零自动重试。独立原件与逐项复核见 [补测复核](save-correction-independent-review.json)。真实消息在放行200之前已唯一落地；2秒是QA观察窗口，未用它宣称从请求接收起严格两秒上界。真实原事务ROLLBACK与恢复事务COMMIT分列，原prepared持久来源和新PID／attempt／clock分别验证，原副作用未重发，原run完成。该限定场景PASS不能外推任意重启、全部未知结果或所有未来无重复。

## 清理与证据完整性

三条case的cleanup.failures均为空。同一Docker engine下，本run三容器、三卷，4个实际应用及4个guardian、6个controller进程、2个registry均已按归属核验退出／移除；13个已识别端口后置无连接／监听。首worker72278已补独立ps检查，另两worker也已退出。共享Docker backend不记泄漏。

首PG容器在最早live inspect前已删，其卷由本case实际containerId／owner／数据库和精确Docker mount／unmount事件关联；**没有捕获首PG HostPort，也未声称该未知端口单独lsof复查**。原资源结论只覆盖首run，不外推所有历史资源。限定补测另有1容器／1卷、2app／2guardian及新runtime控制器／registry清理证据，见 [补测资源复核](resource-audit/correction-independent-review.json)。补测PG HostPort也未捕获，不假称逐端口已复查。[资源复核](resource-audit/independent-review.json) 保留这项取证限制。

原件 1559 份，共 766909283 字节，逐文件SHA和归档内字节复核通过。见 [原件索引](original-file-index.json)、[原件包](original-evidence.tar.gz)、[独立JUnit](junit.xml)、[原始执行摘要](raw-run-summary/manifest.json)。执行器原始JUnit与独立JUnit并存，BLOCKED用error明确表示，不能作为PASS／静默跳过。

## 与历史验收及后续范围的关系

[第一轮总报告](../../acceptance/20261002-current-delivery/report.md) 原全量254条：240P／9F／5B；8e差异51条：46P／5F，均是各自版本事实，历史强恢复FAIL不被本例有限恢复关闭。原[8e预算补充报告](../20261002-dispatched-kick-budget/report.md) 的 `[59999,60008]ms` 保持BLOCKED，与本次新样本FAIL分列；两份旧报告SHA未变。

01f仅执行本次三例，没有宣称全量候选重新通过。保存整例已由修正后的单例补测关闭QA阻塞；READ-CAUSAL-1和原预算信号下的KB-CROSS／KB-CANCEL缺口已经取得本轮真实补证，KB-ACTIVITY得到新FAIL。当前业务不满足无条件通过门槛，建议处理两条时限违约并在新固定候选复测。

剩余项按已有来源和实际可完成的范围登记，详见 [范围澄清](scope-clarification.json)。BLK-EXT-001（R-A2-01、R-A5-11）的静默未落地分支是**原首轮未闭合项**：原run有限观察仍unknown，没有SUT可使用的权威否定终态或明确永久暂停证据。已有脚本可重现两种前缀、核对唯一效果并接收合法正向结论；延长观察或新增本地日志不能创造现协议没有的否定保证。运行中第二实例×已派发kick×预算的GAP-RUNNING-SECOND-INSTANCE-COMPETITION是既有登记的**额外交叉覆盖**，非本三例关单新必要条件；目前未有该组合的独立场景和真实租约接管证据，不拿终态后开实例充数。原双实例AGENT-003（R-A5-01／02）已在2716首轮PASS，不因本组合未测重开整项。任意未来／任意重启／所有未来无重复只是本有限实验的**不可外推边界**，不据此新建无界待办；旧明确强恢复FAIL仍按旧用例保留。整个observer通道全面异常隔离也只保留工程风险，没有编造本轮已测失败或新增必验项。

真人项MAN-IME-001／MAN-FOCUS-001保留真实输入法和跨应用焦点复验。MAN-UX-001（R-A6-03／ADD-COPY-01）尚缺未经预读说明的操作者对账号断开／释放及控制台权限、群内creator／admin／member区别的实际说明记录；步骤是查看真实账号说明和成员角色、解释权限及历史含义、记录误读与指导位置。**已关闭H18四态有限文案体验不重开、不另造unknown样例**。本报告不把自动化或研发解释代签为完整真人PASS。

C1／C2**产品开发及自测交付已合main**；本轮未执行其独立QA验收、不继承开发PASS。C1／C2的QA准备及第二轮P0／P1增强QA资产均只准备、未执行；**第二轮增强准备分支未合main**，QA提交28b3b31保留。真实付费provider本轮未授权未调用。上线专项／容量指标／RPO-RTO等另算，不能用本轮或历史功能通过代替上线结论。

研发记录了五秒截止才可宣告未知与物理返回／清理尾差的工程限制，当前没有新五秒补丁。60秒方案新增独立kick-work-budget、为真实终态收尾留预算，原activity-budget信号保留；研发的首个约58秒样本只是开发证据，准备源码已冻结`f285777f25dc644fe5181cd40ae2f0c316ae5389`，完整自测和正式执行交接仍待完成，独立QA未执行，旧01f FAIL不改签。后续场景需分别核对工作截止时确认GET仍在途、真实取消来源及原60秒内实际终态，不能把work信号冒充原hard信号。如果最终确需调整业务时限语义，须明确另留决定；当前仍按原标准FAIL，不由QA放宽。
