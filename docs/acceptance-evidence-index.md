# 核心验收证据索引与补验证清单

状态：**第二轮修复与开发验证已完成，人工验收暂停，未代填结论**。更新日期：2026-10-01；产品候选 `3c071d2`。D032评审方法继续保留，D034本轮结果见[第二轮记录](core-repair-round-two.md)；逐项机制见[验收方案](acceptance.md#mechanism-review)。E01–E08保留原执行版本，E09–E14补充本轮开发与切换结果，不跨批次累加通过数。

## 证据怎样使用

每项先确认原文要求、实际机制和用例预期，再阅读对应证据。测试文件是可执行定义，不等于执行记录；汇总报告、原始日志、结构化观察、截图及事后转录分别说明来源。旧版本通过只能在核对相关代码差异后有限复用；无法对应版本或找不到原始材料时，降为待补证据。日志中的测试总数包含父子测试，不能当作独立需求数量。

| 类型 | 能支持的判断 | 不能替代的证明 |
|---|---|---|
| 源码核查 | 当前机制、数据来源、检查顺序和未受约束的假设 | 真实故障或并发已发生、性能达到目标 |
| 测试源码 | 场景怎样构造、断言检查什么 | 测试确实执行、故障窗口确实命中 |
| 固定版本执行日志与结构化观察 | 该版本、该场景的实际结果及失败记录 | 所有版本、所有边界均成立 |
| 浏览器观察 | 指定操作、页面内容、实际呈现时刻 | 数据库与外部系统全部副作用、任意规模时限 |
| 运行切换记录 | 当时运行版本、数据保留和健康检查 | 完整功能回归或用户验收通过 |

## 已有证据列表

<a id="e01"></a>
### E01 — A0 固定基线专项

- **定位**：[报告](archives/a0-2026-09-30/docs/a0-acceptance-report.md)、[JSON](archives/a0-2026-09-30/docs/evidence/a0-acceptance-verification.json)、[测试](archives/a0-2026-09-30/tests/integration/a0-acceptance.test.ts)、[新增测试日志](archives/a0-2026-09-30/docs/evidence/a0-tests.tap)、[首次重启夹具失败日志](archives/a0-2026-09-30/docs/evidence/a0-restart-fixture-initial.tap)。材料位于独立分支 `agent/a0-acceptance-evidence` 提交 `2ef168e`，尚未集成到主分支；以上是本机路径，不是可移植仓库相对路径。
- **基线与结果**：产品 `ef361957`；原定向4/4，新增7个子测试加父测试共8/8。仅为历史固定版本；第二轮迁移与客户端会话已改变，当前证据分别见E09/E12，不能称此报告在最新main重跑。
- **查找字段**：`observations[].id` 中的 `migration-startup`（真实 schema 5 拒启、补至 6 后健康）、`migration-repeat`（结构、迁移记录和业务摘要）、`viewer-all-write-routes`（注册路由与9项矩阵一致，逐项403且业务快照不变/外部零调用）、`error-envelope`（代表错误）、`real-process-session-restart`（重启后的身份权限）。
- **边界**：未检查历史 SQL 修改、迁移编号/记录缺口、迁移中途失败及并发迁移；15分钟有效期通过数据库间隔及到期前后请求验证，不是实等15分钟。正常旧库测试仍有效，不据此判断迁移历史校验完善。

<a id="e02"></a>
### E02 — 历史核心集成与可靠性回归

- **定位**：[需求矩阵的逐条用例](requirements-matrix.md)、[固定发布记录](evidence/release-verification.json)、[可靠性问题及修复](reliability-review.md)。测试入口包括 [gateway](../tests/integration/gateway.test.ts)、[automation](../tests/integration/automation.test.ts)、[platform](../tests/integration/platform.test.ts)、[membership](../tests/integration/membership-reliability.test.ts)、[transaction-events](../tests/integration/transaction-events.test.ts)、[auth](../tests/integration/auth.test.ts)。
- **基线与结果**：发布记录保留 `82312b9` 常规128项登记/125通过/3跳过，以及同产品源 `f52faec` 的3项独立长计时；更早 G/P/B/M/T 用例按矩阵中的实际版本引用。
- **使用重点**：状态转移/CAS/终态原子性，504查询及迟到404，双实例互斥、审计与幂等，变量预检、调度接管，退群和会话轮换。逐项查看测试名字、故障位置、断言及对应日志，不能只引用总体通过数。
- **边界**：部分原始日志在旧工作树 `.runtime` 忽略目录，路径与哈希由发布记录说明；使用前核对可读性与哈希，缺失则不能冒充有原始日志。历史测试隔离偏差及后续修正保留，不称此前始终未接触演示库。

<a id="e03"></a>
### E03 — 第一轮核心候选定向验证（历史）

- **定位**：[统一JSON](evidence/core-quality-closeout-verification.json)、[原始测试日志](evidence/core-closeout-tests.log)、[构建日志](evidence/core-closeout-build.log)、[收口报告](core-quality-closeout.md)。
- **基线与结果**：产品候选 `393d43e`，前端98项、网关6项、自动化6项，共110/110、0失败/跳过；构建含双方 TypeScript。JSON 的 `candidate`、`tests.final`、`tests.logs` 对应版本、命令和日志哈希。
- **边界**：这是定向执行，不是历史全部后端或60秒预算套件重跑。后端、契约和迁移未随这三处前端修复变化；不能用其通过数关闭新发现的 A0 或 B3 风险。

<a id="e04"></a>
### E04 — 网关、事件恢复与建群补证

- **定位**：[专项报告](core-gateway-closeout.md)、[测试入口](../tests/integration/core-gateway-closeout.test.ts)，执行日志包含在 E03。
- **基线与结果**：后端基线 `7f424f6`，集成候选 `393d43e` 后端相同；CG09–11 六个场景实际通过。包含真实连接/断开、限流期限刷新、非法建群零副作用、固定错误步骤、业务子进程被强制终止后事件补齐，以及不可写状态的跨模块事务屏障。
- **边界**：CG09限流期限刷新通过状态函数设置，不冒充两次远端429；CG11部分终态是数据库夹具，不冒充每条真实结束路径。CG03发送未知结果、CG04未知建群结果及CG07成员范围解释仍未闭合。

<a id="e05"></a>
### E05 — Agent、工具及序列补证

- **定位**：[专项报告](core-automation-closeout.md)、[六项测试](../tests/integration/core-automation-closeout.test.ts)，集成执行日志见 E03。
- **基线与结果**：后端 `7f424f6`，后端相同的 `393d43e` 集成验证包含六项。CG13完整历史前缀和协议计数、CG14审计及资格检查、CG15当前run读取消息和Unicode/长度边界、CG16非法步号及跳过后的排期。
- **边界**：被阻止的当前工具零副作用，不等于该run历史上没有其他已完成效果；CG16精确延时验证停在持久队列，不能写成已经远端发送。恢复未决kick与turn的CG05/06仍未闭合。

<a id="e06"></a>
### E06 — 真实超时与硬终止计量

- **定位**：[计时报告](core-automation-closeout.md)、[测试入口](../tests/integration/core-automation-timing.test.ts)、[9项工具输出转录](evidence/core-automation-nine-tests.tool-transcript.log)、[增强断言后的6项转录](evidence/core-automation-six-tests-final.tool-transcript.log)；结构化说明在 E03 的 `tests.timing`。
- **基线与结果**：产品 `7f424f6`；正式10秒/15秒配置的超时与迟到响应丢弃有实际HTTP证据。生产 ActivityClock 子进程的硬终止实验观察到1177ms在线尾段未记账，恢复未把705ms停机算入。
- **边界**：日志为执行后从工具输出归档的转录，不冒充原始shell文件；9项中包含 E05 的6项，不能重复叠加。一次1177ms不是误差上限；CG08严格硬终止计量仍未满足。

<a id="e07"></a>
### E07 — 控制台实际页面及异步竞争

- **定位**：[控制台报告](core-console-closeout.md)、E03 JSON 的 `browser`、[前端组件用例](../apps/web/tests/core-console.test.ts)、[时间线恢复用例](../apps/web/tests/timeline-recovery.test.ts)、[浏览器夹具](../scripts/core-console-qa.ts)。
- **基线与结果**：最终页面前端 `6a6dd80`（集成对应 `393d43e`）；夹具后端启动 `8bc7ef9`，后台源码与最终候选相同。CG01身份失效仍保留选择/草稿、CG02失败时间标签、CG12迟到历史页成功和超时均不覆盖新快照；CG17同身份REST/WS共同过期只续期一次；CG18指定144条/3页场景实际呈现；CG19步骤、blocked和原始响应可见。
- **时限依据**：CG18传输恢复可用到消息及群开关同时呈现1451ms，WS认证成功到呈现464ms。明确规模、一次读失败和测量起点，不能扩大为任意规模承诺。
- **边界**：CG17未覆盖换用户后旧请求401迟到重放。CG19审计次数附属[转录](evidence/core-console-cg19-counter.tool-transcript.json)是事后归档，只覆盖指定文本及所读请求，不能证明整个run全部副作用。截图辅助查看，不单独承担计时、去重或权限证明。

<a id="e08"></a>
### E08 — 本地交付和数据保留

- **定位**：[交付JSON](evidence/core-quality-closeout-rollout.json)、[收口报告](core-quality-closeout.md)。
- **记录事实**：10-01 01:27:42核验前端更新为 `393d43e`，后端仍从 `7e83191` 启动；schema6，18表和两个模拟器文件前后内容一致，未重启后端或迁移。
- **边界**：E08只引用当时运行记录；最新第二轮schema7演示切换另见E14。备份可读不等于恢复演练，数据库保留不等于未提交输入保留，健康不等于验收。后续隔离旧版升级演练另见E09。

<a id="e09"></a>
### E09 — 迁移历史完整性、旧六版基线及007保护

- **定位**：[专项报告](core-migration-integrity.md)、[结构化记录](evidence/core-migration-integrity-verification.json)、[原始日志](evidence/core-migration-integrity-tests.log)、[测试](../tests/integration/migration-integrity.test.ts)；真实旧库备份副本的隔离升级演练见[预检与演练](core-upgrade-preflight.md)。
- **当前机制与证明**：显式数字ID与数值排序；完整ledger逐条比较version/name/SHA-256，启动要求全部一致；同一SQL字节快照执行记账，事务迁移锁及整批原子提交。真实PG验证历史内容变化、记录缺口/改名/插入/删除/重编号、失败回滚、双独立进程锁等待、落后拒启和重复执行。
- **旧库边界**：缺checksum的legacy默认拒绝；显式入口仅支持固定`fa1baa7`旧六版清单，独立参考库重放并核对实际public结构，记录`legacy_schema_baseline`，不冒充历史执行字节已知。需要停旧服务、无其他非协作DDL、CREATEDB；不检查所有业务数据/权限配置。目标已提交后参考库清理仍可能失败，输出明确targetCommitted，不据命令失败推断回滚。
- **007**：旧running序列先在旧版自然完成，007遇running拒绝，历史观察字段保持NULL；已应用007的普通同版本重启不重跑升级guard。专项将running夹具改为finished后测试通过，不证明旧服务自然完成行为；备份副本演练时running本已为0。两者均为隔离环境，演示真实升级另记E14，不混用其结果。

<a id="e10"></a>
### E10 — SSE分帧、promote503及账号结果未知诊断

- **定位**：[网关第二轮报告](core-gateway-repair.md)及其中测试/原始日志；集成结果见E13。
- **已修与实证**：真实GatewayEvents.listen受控流复现跨块CRLF两帧零事件，修复先累积再归一，覆盖连续帧、逐字节UTF-8/注释/多行data。promote首次明确503后500ms重试一次，第二次503或NOT_MEMBER失败，真实HTTP验证总调用≤2；未知超时/响应或本地保存失败不转成安全重试。
- **跨群有限改善**：成员查询保留群锁以维护顺序，单次读取超时从15秒减为2秒；真实慢HTTP下另一群事件约2046ms后推进，失败事件后续重试，不把旧事件伪造为成功。多次慢事件、SSE顺序队列和全局资源等待仍有限制；自动化锁隔离另见E11。
- **V-ACC-01**：真实HTTP远端connect/disconnect成功、PG更新故障复现远端/本地不一致；新增日志及尽力写入的`account_result_unknown`事件，API仍报失败。仅诊断，不自动补偿/恢复或改变公开状态；崩溃先于诊断、DB不可写、响应丢失及COMMIT未知仍未闭合。诊断写失败的适配器注入不冒充真实数据库停机，未以浏览器提示作为本专项证据。

<a id="e11"></a>
### E11 — 自动化锁等待与message_sent观察时间

- **定位**：[专项报告](core-automation-repair.md)、[新增测试](../tests/integration/core-automation-repair.test.ts)、[取消收尾补修](core-scheduler-cancel-repair.md)、[007](../db/migrations/007_message_sent_observation.sql)；报告记录修前失败及实际隔离命令，集成结果见E13。
- **排期证明**：只有显式message_sent进入process时采集的本地时间可写首次`message_sent_observed_at`；回流/query提前变sent不推进下一步，重复不覆盖；普通、skipped、重启及迟到事件均有验证。skip仍从实际跳过时刻算起，精确排期断言不冒充远端已发送。
- **隔离证明**：扫描写pending改逐群；Agent启动、后台取消收尾、序列推进和接管重排使用50ms事务锁等待，只对55P03回滚后跳过。真实PG持群锁与慢HTTP下另一群可推进；不改变同群CAS/顺序、最多四个run执行槽及预算；未完成接管义务保留到下次，防止提前正常推进；取消意图在锁忙时保留，释放后只收尾一次。
- **边界**：50ms限单次锁获取，不是整tick、池获取、时钟初始化/采样或任意规模时限。首次接收时间只在同进程失败重试保留，成功落库后可重启恢复；**第一次持久化前硬死无法恢复准确原时刻，R09任意中断保证未闭合**；多实例全局最早观察也未证明。V-SEQ-01只读确认固定定义与vars/stepVars下预计算等价，没有引入动态重算；CG05/06/08仍保持原限制。

<a id="e12"></a>
### E12 — 同页请求代次、cookie顺序与真实重载

- **定位**：[代次证据](evidence/session-boundary-verification.json)、[真实修前失败](evidence/session-boundary-browser.json)、[cookie专项](core-session-cookie-repair.md)、[浏览器修后](evidence/session-cookie-browser-after.json)、[代次测试](../apps/web/tests/session-boundary.test.ts)、[cookie测试](../apps/web/tests/session-cookie.test.ts)。
- **已修**：普通request及重试绑定原代次，旧成功/401不能跨新身份重放或清会话；去掉旧WS失败直接清会话。login/logout/refresh共享同页队列，旧响应完成或原20秒超时结束后才发下一请求，REST/WS按代次singleflight仍保留。仅保护内存不足以挡住响应头Set-Cookie，因此必须另验cookie与重载。
- **实际结果**：cookie分支`2406ad6`相关受控fetch/代次/可靠性20项全通过，含生产20秒超时真实20001ms；没有用缩短时钟替代。隔离真实浏览器旧refresh200及401都等待释放后退出、新登录，再整页重载；refresh/me200且保持新身份。浏览器JSON分列前端`b347072`、后端`c8b322c`，不冒称当时运行最终候选`3c071d2`。后者另有E13集成回归。
- **边界**：网络失败释放队列但不伪报注销成功；abort不保证服务端回滚。保证限同页面正式入口，多标签协调为未实施增强。失败截图和HTTP记录保留，不能以当前页仍显示新用户代替持久cookie证明。

<a id="e13"></a>
### E13 — 第二轮最终候选集成及时间线页面

- **定位**：[第二轮报告](core-repair-round-two.md)、[最终全套日志](evidence/core-round-two-final-tests.log)、[最终构建日志](evidence/core-round-two-final-build.log)、[时间线浏览器记录](evidence/core-round-two-timeline-browser.json)。
- **集成结果**：产品`3c071d24712a99b56544573f6cf21e7d8b2fd32c`，全套**335/335，0失败/跳过，114.092秒**；构建退出0；真实turn超时、审计等待、60秒活动预算及20秒会话超时开关均开启。执行命令、环境及版本由总报告/日志固定，不能与专项结果重复相加，也不以全套通过覆盖测试未断言的强保证。
- **页面结果与时间界限**：最终154条消息身份、内容和顺序与DB完全一致，四页读取，包含断线、重复事件、迟到历史、一次503和群开关恢复，无手工刷新。接口在恢复后624ms读取结束，但CUA DOM观察迟到，**不能证明本候选3秒内呈现**；E07旧144条1451ms继续限定旧版本，不转记到新候选。
- **交付边界**：本卡为隔离开发验证，演示切换另记E14，人工验收仍暂停；V-ACC诊断、CG03–08及R09首次持久化前硬死的限制未因335项通过而消失。

<a id="e14"></a>
### E14 — 第二轮演示升级与既有数据保留

- **定位**：[实际切换JSON](evidence/core-round-two-rollout.json)、[第二轮记录](core-repair-round-two.md)。2026-10-01 03:50:31（北京时间）完成，从main启动源`56e320c`运行，产品树与已全测`3c071d2`一致，schema7。
- **实际步骤与保留**：停旧四实例，确认running序列/job/Agent及pending outbox均0、无其他DB连接；停写状态新备份后，显式旧六版基线化、007及重复迁移。18表旧字段/旧记录投影（含旧迁移applied_at微秒精度）和两个模拟器文件哈希保持，15条历史消息观察字段均NULL；不能把旧投影一致说成新ledger字段未改变。
- **检查与边界**：API及前端代理health均schema7、5173 HTTP200，真实浏览器登录入口呈现；未在演示重跑业务写流程，也不是全库恢复演练或人工验收通过。前置条件与显式基线的有限背书继续适用，不因一次升级成功扩展到任意旧库。

<a id="e15"></a>
### E15 — 架构局部质量候选（待 review，未合 main）

- **定位**：[本批记录](architecture-quality-closeout.md)、[结构化验证](evidence/architecture-quality-verification.json)。AR-04 执行准入、AR-08 请求 schema、AR-09 读取恢复、AR-10 测试夹具；其余架构建议维持原分类与授权边界。
- **当前证据**：夹具修后 `0972229` 全套 361/361、0 失败/跳过；三组真实计时开关开启。产品源与构建通过的 `e45fc4a` 相同；`a17db82` 生产浏览器 7/7、页面及清理错误均为 0。间歇失败的受控反例、最小夹具修复和原失败记录均保留，不覆盖旧批次事实。
- **版本边界**：独立 `agent/architecture-quality-review`，未合 main、未切换演示、用户未 review。仅更新候选证据，不将旧演示视为具有新机制，也不代填人工通过。

## 源码发现、修复结果与仍待决定事项

以下同时包含已执行修复/验证和仍开放的保证，不再统称拟验证项。正常原文要求、保护性反例、工程兼容选择分开；人工验收结论保持未填。

| 编号 / 对应卡 | 已知依据与分类 | 场景及必须观察的结果 | 当前状态 |
|---|---|---|---|
| V-MIG-01 / A0-1 | 旧数量/位置方案不能识别历史SQL变更；现为显式ID和SHA-256 | 同数量修改SQL，旧库拒绝而新库结构确实不同；显式1/2/10目标为10 | 已修、反例通过，见E09；不防同时篡改发布物与账本的管理员 |
| V-MIG-02 / A0-1 | 完整历史需逐条比较version/name/checksum | 保留最大记录的缺口、历史插入/删除/改名/重编号均拒绝且目标不变 | 已修、实际通过，见E09；普通入口默认拒绝legacy |
| V-MIG-03 / A0-1 | 同事务锁及整批SQL/记录原子性 | 真PG触发器在账本写前失败，整批回滚；双独立进程真实等待同迁移锁，只应用一次 | 已验证，见E09；非协作DDL仍是显式基线操作前提 |
| V-MIG-04 / A0-1 | 落后和更高均拒启的严格策略保留 | 区分原文落后拒启与额外高版本拒启、说明回退影响 | 拒启有证据，未自动改宽松，也未替用户认可兼容取舍 |
| V-ACC-01 / A1 | 远端效果不能由本地事务撤销 | 真实HTTP成功+PG本地失败，核对两侧实际状态；保持原错误并记录诊断 | 已复现、仅补诊断；两侧不一致和未知结果未自动恢复，见E10 |
| V-AUTH-01 / B3 | 代次隔离业务请求，cookie另须同页请求顺序 | 旧业务/重试响应不跨身份；旧refresh200/401释放后新登录，再整页重载核身份 | 已修，受控及真实浏览器通过，见E12；多标签未实施 |
| V-SEQ-01 / B1 | 启动预计算、运行输入和定义固定 | 核查当前契约无启动到发送间可变输入 | 已只读确认固定输入等价；未承诺动态重算。R09观察时间另见E11 |
| V-REC-01 / A2/A3/A5 | CG03–06已有协议不可判定窗口 | 分开评审每次外部调用前/后、本地提交前/后的持久状态、可查询事实及不可区分历史 | 保证未闭合；不靠重复跑正常路径或增强mock关闭 |
| V-VIEW-01 / B2 | CG07公开left空视图与远端外部成员范围不同 | 列出服务账号集合、外部成员集合、公开投影和完成快照；选择条款解释前不得标两侧全体一致 | 待澄清；不自动批准清理外部成员或新镜像 |
| V-TIME-01 / A5 | CG08硬终止漏记尾段已有实证 | 明确计量精度、故障模型及可接受/不可接受边界；需要改核心时钟则先评估 | 保证未闭合；不能将采样周期当硬误差上限 |

测试实施前固定产品与测试版本、预期、故障命中依据和独立临时数据库/端口。发现版本不明、隔离目标不明、未授权写入或未知远端效果时停止该场景的后续写入，保留现场；结果不明不盲重放。其他不依赖该场景的材料评审可继续。

## 单项证据记录模板

```text
条款 / 评审卡 / 用例编号：
保证的业务规则、关键机制及依赖前提：
前提由代码约束 / 协议承诺 / 仅约定保证：
产品版本 / 测试版本 / 运行版本 / 数据隔离：
触发位置、故障或竞争确实发生的依据：
预期：API / 数据库 / 外部效果 / 事件或页面 / 时间界限
实际：对应观察与原始证据位置
证据类别、生成方式、失败/重跑/跳过情况：
未覆盖范围及是否影响当前条款结论：
工程结论：已证明 / 源码风险待复现 / 需修复 / 待补证据 / 待澄清
负责人评审与决定：未发生时留空
```

本轮记录从机制追问、独立审查到已授权修复及实际验证的过程；已执行与未闭合边界均保留，未虚构人工通过。原始需求文件保持只读。
