# 工程文档与验收入口

## 第二轮当前执行入口（2026-10-02）

D052 已批准 C1/C2 与全部五项 P0、五项 P1 的产品、文档和 QA 准备资产本地合入 main，随后固定版本推进独立冒烟、联调和验收。研发已完成[本次组合与补修验证](second-round-integration-20261002.md)，实际版本、结果与剩余交接见[第二轮执行总表](second-round-execution-20261002.md)。QA 自行维护并合入其用例与驱动，开发通过不代替 QA 通过。首轮第 1、8 项继续保留，第 2–7 项既有决定及原始结果不改；以下旧阶段记录保留历史，不再作为当前合入或执行的授权限制。

本轮查阅入口：

- [逐条交付追踪](second-round-delivery-traceability-20261002.md)：73 条款、112 用例与实现、固定开发证据、独立 QA 原结果及责任去向。
- [执行中修复与未闭合项](second-round-followup-20261002.md)：各批发现、产品修复、QA 接线问题和保留限制，结果不跨版本混算。
- [查询优化回退复跑](second-round-timeline-reproduction-20261002.md)：仅回退续页查询的正反补丁、同库同快照复跑步骤；静态材料不替代 QA 实际执行。

## 首轮验收自主收尾（2026-10-02 历史记录）

最新四条工作线、固定版本与尚未关闭的问题统一查看[首轮验收收尾与交付状态](first-acceptance-closeout-20261001.md)。[独立 QA 交付报告](../qa-acceptance/reports/acceptance/20261002-current-delivery/report.md)已签发：旧完整基线254条为240通过、9失败、5阻塞；修复候选51条差异用例为46通过、5失败。预算停止、容量等待、安全阶段重启和状态文案的本轮场景通过；五秒等待及未知结果续跑仍不符合，不能合并为新版全量通过。已授权的预算×已派发kick组合补证已独立签发BLOCKED，详见收尾汇总，真实输入法与跨窗口提醒待真人复验。C1/C2待第二轮独立联调，V3全部P0/P1（含路由最小修复）已批准开发自测，完成后等待负责人审阅，不自动合main或提测。

## 最终交付改进与第二轮准备（2026-10-02 历史阶段）

[最终交付改进建议 V3：P0 / P1](product-enhancement-proposal.md)中的五项P0和五项P1已按D050批准，本轮产品开发及集成自测结果见[开发交付汇总](final-enhancement-delivery-20261002.md)。最终产品源d46669a；较早组合回归562通过、0失败、10跳过，最终前端134通过、0失败、1跳过及构建通过，分别保留版本范围。代码仍在独立分支，等待负责人审阅。[第二轮需求交接](second-round-qa-intake-20261002.md)按D051整合C1/C2及本轮改进，由QA独立准备用例；研发不修改QA目录，新轮实际联调及验收仍待负责人指示。原20小时窗口不重新起算。[V2原稿](product-enhancement-proposal-v2-20261001.md)及PI编号保留，表外暂缓建议未纳入本轮；集中人工验收计划放在两轮QA之后，零散反馈继续记录。

## QA 联调固定版本与未闭合事项（2026-10-01）

本轮继续处理首轮验收剩余事项，见[开发修复与补证交接](qa-final-boundaries-followup-20261001.md)：投递等待的迟到观察和无关读取已修，跨进程计时新增完整性检查与重新取证入口；严格六十秒、五秒仍保留未关闭。UI-032 的公开流程和时间用例的附加限制由 QA 独立校正，既有失败及阻塞报告保留，不用新开发回归替换验收结论。

QA 接入追加材料：[真实 HTTP 快照来源与启动身份](qa-epoch-http-provenance-20261001.md)及[跨进程计时范围澄清](qa-cross-epoch-evidence-20261001.md#qa-接入复核后的范围澄清)。初始化区间尚未证明可按停机扣除，所观察两段在上限内不能直接推导全 run 通过；本次仅补文档与样例，被测产品仍固定 `2716abd`。

首次验收的新补证与人工体验修复见[集成交付记录](qa-followup-integration-20261001.md)：输入提示、图标恢复、同页读取重试以及后端/慢消费者证据已整理；严格时间上限与不完整恢复证据仍单列，开发回归通过不代表正式业务验收通过。

QA 后续具体缺陷的独立修复：[BLK-SPEC-006 群资料 UTF-16 长度](qa-group-profile-utf16-fix-20261001.md)。该修复保留 `86ad4e7` 全量运行，由 QA 另取固定候选复测；不追改旧运行结果。

QA 的 CAP003 严格时间上限与 INT-MSG007 保存前接收时间丢失已有实际失败证据，见[工程边界复核](qa-timing-boundary-followup-20261001.md)；两项继续未满足，不因已有风险说明而改判通过。

QA 对未知外部结果的[强恢复归因](qa-recovery-boundary-followup-20261001.md)另行记录：保留原始运行状态与专业审定的区别，已核实的恢复暂停不能算自动恢复通过。

最新研发接入及修复见[最终交付记录](qa-remediation-final-20261001.md)，包括三类观测协议的组合入口、活动见证和可移植隔离启动。记录分别列出完整开发回归、后续定向验证、最终构建和 smoke 的实际版本；它们不构成 QA 全业务通过。CAP003 严格 60 秒界限和跨强杀完整活动见证继续保留，未放宽断言或伪造时间。

以下收口状态及运行记录保留其原版本。main 合入不代表演示环境升级；本次未升级演示，也未改独立 QA 的用例和结果。

## 原始可选 C1 / C2 的后续选择

负责人已通过 D047 明确选择 C1 媒体文件与 C2 真实模型接入。[媒体管理](c1-media-files.md)、[独立 Gemini 服务](c2-gemini-agent.md)已开发；[最终组合回归](c1-c2-final-combination-20261001.md)为 503 通过、0 失败、9 跳过，构建与原文校验通过。版本、接入和限制见[交付记录](c1-c2-delivery-20261001.md)，[首轮失败与修复记录](c1-c2-integration-20261001.md)原样保留。C1 包含新的 009 迁移，C2 需显式切换 `AGENT_URL`；合并不等于演示已启用或独立 QA 已通过。C3 复用既有 QA 资产核对原文完整流程，不重复开发。

## 本轮收口状态（2026-10-01）

本轮六项处理方向均已确认，代码候选 `2318a11` 已通过完整416/416回归（零失败/跳过）、构建及原文校验；本轮实现和开发自测已完成。逐项结论及后续验证以[最终收口表](core-verification-closeout.md)为准；本文下方涉及 `3c071d2`、`56e320c` 及更早版本的“当前／待决／未补”等描述保留为**当时的历史事实**，不覆盖本轮结论。原始需求不变，不代填用户验收或独立 QA。

本轮不重启/迁移演示，候选新增008接收记录。main代码更新与运行版本是两件事，不能直接用旧演示验新增机制。外部未知结果、硬崩溃时间尾差和长期容量边界继续明确保留；退群公开members保留外部成员是D042已确认的原文差异，不再待决。

本文汇总工程要求、模块设计、验收步骤、可靠性复查及验证证据。原始需求保持字节不变。代码通过自动检查与开发者浏览器验证，不等于用户已完成人工验收。

## 阅读顺序

| 目的 | 文档 |
|---|---|
| 集中查看负责人提出的问题、判断、决定及实际落实结果 | [人工评审与需求调整记录](human-review-record.md)；分类索引保留原决策、变更与证据归属 |
| 查看人工验收发现的路由、导航与返回问题初步方案 | [路由与导航初步评估](navigation-review-proposal.md)；两入口最小范围已按P1-02开发，见[前端记录](final-enhancement-ui-20261002.md)，其余全站方案暂缓 |
| 开始逐项评审：先看实际机制和用例，再看执行结果 | [A0-1 数据库迁移与启动保护](acceptance.md#review-a0-migration)；[完整A/B评审卡](acceptance.md#mechanism-review)，工程侧准备材料，负责人判断充分性 |
| 定位已有证据、版本及尚未执行的反例 | [核心验收证据索引与补验证清单](acceptance-evidence-index.md)；现已加入第二轮机制和执行证据，用户验收仍独立；方法修订见[决策D032](decisions.md) |
| 区分原始要求未闭合与额外产品增强 | [核心缺口与证据复核](core-requirements-gap-review.md)；[额外增强建议](product-enhancement-proposal.md)；[旧PI提案映射](product-improvement-proposal.md) |
| 关联最新独立审查、区分重复发现与新增场景 | [独立审查关联索引](independent-review-mapping.md)；两份清单沿用CG/PI编号，不重复登记 |
| 评审架构、工程质量与阶段演进，关联原始要求和增强范围 | [架构评审系列](architecture-reviews/README.md)；[当前基线](architecture-reviews/2026-10-01-baseline.md)；[本批局部改进](architecture-quality-closeout.md)（用户已 review 同意并合 main；运行服务尚未统一重启） |
| 跟踪本轮核心修复，人工验收暂缓 | [第二轮修复与验证](core-repair-round-two.md)；额外增强继续暂缓 |
| 跟踪已授权核心修复、补证和协议待决事项 | [本轮核心质量收口](core-quality-closeout.md)；修复与开发验证不自动代表用户验收 |
| 快速了解当前能力、来源、实现与用户验收状态 | [当前功能总表与需求追踪](feature-matrix.md) |
| 先体验和验收功能 | [分批验收与运行说明](acceptance.md) |
| 查看逐条实现、测试证据和未验范围 | [需求实现与验证矩阵](requirements-matrix.md) |
| 核对十一项可靠性缺陷的修复与回归 | [可靠性复查记录](reliability-review.md) |
| 核对目标、固定约束、阶段与协作要求 | [工程要求](engineering-requirements.md) |
| 追踪用户新增功能、实施状态与本轮单点反馈 | [需求变更记录](change-requests.md) |
| 查看已批准实施的群目录排序、搜索、分页与表单保护 | [群列表与资料完善方案](group-directory-profile-proposal.md)；[验证范围与待验项GD01–GD12](acceptance.md#group-directory-acceptance) |
| 核对PI-01账号操作及群管理员文案的实际范围与验收 | [账号操作与群内角色文案](account-operation-copy.md) |
| 核对PI-02群状态与Agent开关筛选的范围、兼容及验收 | [群目录筛选记录](group-directory-filter-review.md) |
| 核对PI-03第三项群资料并发保护的条件、旧调用边界和验收 | [字段并发保护](group-profile-conflict-review.md)；[GC01–GC06](acceptance.md#group-profile-conflict-acceptance) |
| 区分用户已确认决定与暂定技术选择 | [决策与变更记录](decisions.md) |
| 理解后端及控制台的接口依赖 | [模块协作接口](module-interfaces.md) |
| 理解状态、发送、群任务和消息恢复 | [网关设计](gateway-design.md) |
| 理解Agent工具、审计、恢复和序列排期 | [自动化设计](automation-design.md) |
| 查看当前页面更新提醒范围、复核修正与验证 | [页面提醒实施记录](page-update-notification-implementation.md)；[PA01–PA08](acceptance.md#page-attention-acceptance) |
| 理解登录、权限、页面与实时合并 | [控制台设计](console-design.md) |
| 复现正常流程与可控故障 | [模拟服务说明](simulator.md) |
| 核对本轮实际环境与选择依据 | [工具链记录](toolchain.md) |
| 查看固定的完整原始要求 | [原始需求（只读）](original-interview-question.md) |

<a id="代码与命令执行位置"></a>
## 最近一次演示切换与验收入口（历史运行记录）

[本地控制台](http://127.0.0.1:5173)已统一更新，main启动提交`56e320c`、实际产品候选`3c071d2`、schema7。后续纯文档提交不改变运行产品树；实际PID和启动时刻见main `.runtime/runtime-manifest.json`及[本轮运行记录](evidence/core-round-two-rollout.json)。原18表数据/旧迁移时间、4群/15消息/6账号及两个模拟器状态保留，新观察时间不伪造历史值。

本轮完整335/335、0跳过、生产构建和有限真实浏览器复验通过，见[第二轮修复与验证](core-repair-round-two.md)及[统一证据](evidence/core-round-two-verification.json)。升级先经过[真实备份副本演练](core-upgrade-preflight.md)，再停旧服务重新备份、显式基线化及007。测试与演示环境分开，真实演示只检查入口/health，未重跑故障注入。

现在可从[A0迁移评审卡](acceptance.md#review-a0-migration)继续，先看实际机制和假设，再看反例、执行证据与未关闭范围。用户验收尚未完成；协议恢复窗口、账号结果未知、硬终止计量及本候选3秒DOM呈现证据等限制仍明确保留。增强项不新增实施。

## 上一轮演示与代码位置（历史）

当前演示前端已更新为产品提交 **`393d43e`**，于 **2026-10-01 01:27:42（北京时间）** 完成只读运行核验；模拟器/API仍从`7e83191`于00:02:35启动，schemaVersion=6，无新迁移或重启。入口：[本地控制台](http://127.0.0.1:5173)，管理员`admin/admin`，只读账号`viewer/viewer`。父进程21643、模拟21646、API21647、Vite21648及启动时间未变；脱离启动shell运行（PPID1），未设置开机自启。源码与运行检查以main `.runtime/runtime-manifest.json`和[本轮运行证据](evidence/core-quality-closeout-rollout.json)为准，后端启动源与前端更新源分列。

本轮修复发送身份静默替换、序列失败时间误标、迟到历史页覆盖新快照三处前端问题。构建/双方TS及定向110/110通过，隔离真实页面验证已归档；CG03–08六项协议、成员视图与计时边界仍待决，用户验收未完成，见[核心收口记录](core-quality-closeout.md)。切换前67863字节PG归档可读，更新前后18表和两个模拟器文件完全一致，4群/15消息/6账号保留；没有使用演示进行故障测试。此次仅HTTP模块/health只读核验，不冒称在演示重新完成全部浏览器测试。

上一批增加PI-03获准的群资料同字段冲突保护：当前表单只为本次修改字段携带原值条件；冲突整次不写入，保留草稿、展示服务器快照，明确重新确认后再次比较。不同字段编辑可共存；无expected旧调用方仍按最后写入生效。仅第三项获准，序列表单及PI-03其余建议不在本批。PI-01文案、PI-02目录完善和本项均已交付待人工复验；PI-04–23暂缓，提醒维持已交付范围，下一步按D029优先验收原始核心能力及处理发现的问题。

`7e83191`通过构建/前后端TS/原文SHA、定向 **138/138**（前端92、5个PG文件46；0失败/跳过）和16项双IAB观察。测试覆盖原值条件、真实行锁并发、整请求原子性、草稿/二次确认、空值、503、关闭/迟到和只读权限；详情见[专项](group-profile-conflict-review.md)、[结构化验证](evidence/group-profile-conflict-verification.json)。本批未重跑全部后端或长计时套件，不扩大历史验证范围；用户仍待验。

上一批PI-03切换前四类在途任务均为0，67613字节PG归档通过archive-list核验，备份位于main `.runtime/backups/2026-10-01-before-group-profile-conflict`。重启后、viewer只读冒烟前，18表行数/哈希和2个模拟器文件完全一致，4群/15消息/6账号保留；未运行迁移/seed/reset。独立IAB viewer只读核对4群和资料页无编辑入口后关闭，未做业务写入或操作用户Chrome；登录正常生成认证记录。备份可读不等于灾难恢复演练，持久数据保留也不承诺浏览器未提交输入保留。

| 用途 | 本地路径 | 版本与执行边界 |
|---|---|---|
| main及当前演示 | `/Users/zcm/Desktop/kapibala` | 后端启动源7e83191、前端393d43e；默认端口只从此目录启动 |
| 本批集成与证据 | `/Users/zcm/.codex/worktrees/42fe/kapibala` | `agent/core-quality-closeout-release`；验证使用独立库/随机端口，所列40个QA库均清理 |
| 本批模块验证与前端修复 | `core-gateway-checks`、`group-directory-api`、`group-directory-web`托管工作树 | 网关/自动化补证及前端最小修复；版本对应见核心收口记录；不是默认服务目录 |

历史版本保持各自证据，不作为当前运行状态：

- 提醒批次23:19:29的`e1c890c`（验证产品源`ee2a0d9`）见[提醒实施](page-update-notification-implementation.md)和[运行记录](evidence/page-attention-rollout.json)；234登记/231通过/3既有计时跳过、24项浏览器属于该批。23:35:20曾原样恢复至文档头`ef36195`、产品不变，后由本次替换。
- 筛选22:47:25的`b6d7743`见[筛选记录](group-directory-filter-review.md)；目录22:18:35的`9bc34fd`及后续纯前端`028a2e8`、文案`f1257c1`分别见[分页运行](evidence/group-directory-rollout.json)和[文案记录](account-operation-copy.md)。
- 群资料20:57:22的`7efdbf3`/schema5及基础19:57:51的`9befc8a`/schema4见[资料运行](evidence/group-metadata-rollout.json)、[基础运行](evidence/demo-verification.json)。各批备份大小、迁移和认证变化不得混用。

所有代码与命令路径均相对完整仓库。执行前核对当前分支、HEAD及运行manifest；安装和冷启动见[项目README](../README.md)，仅在服务未运行时启动，避免不同工作树争用默认端口。

## 来源与证据边界

群目录完整套件从`3486a11`启动，执行期间仅追加JobProgress一句文案，完成时HEAD为`9bc34fd`；未重新启动9bc34fd的exact-head全套。该次169登记/166通过/3旧计时跳过/0失败，约112.306秒；build/typecheck在3486a11通过，其后9bc34fd仅JobProgress文案。实际命令、独立base删除、18项目录前端与真实PG16专项，以及隔离浏览器范围见[验证证据](evidence/group-directory-verification.json)和[GD01–GD12](acceptance.md#group-directory-acceptance)。QA服务及临时数据库已清理。最终028a2e8另通过build/typecheck、前端38/38及独立任务找回浏览器复验；未重跑完整后端套件，不能将上述跨提交执行的169项改记为028a2e8全套。两次QA及临时库均清理，用户人工验收仍待进行。

上一批群资料 `2d67500` 构建、类型和原文校验通过，独立临时base库常规143项登记、140通过、3跳过、0失败，111.872秒；新增字段创建/编辑/清空、旧群回退、跨日时间和viewer只读通过独立浏览器检查，见[本批验证](evidence/group-metadata-verification.json)。用户对新群资料功能仍待验收。

文档由最初工程基线持续更新，最新源码版本、测试命令、日志、浏览器场景及待验范围集中记录在[需求矩阵](requirements-matrix.md)。较早日志保留其时间和覆盖范围，不能证明后来发现的并发或故障窗口；R11活动时钟接管初始化竞态已在候选`f52faec`修复，真实PG屏障回归与模块检查通过；最终82312b9隔离基库常规128项登记、125通过、3跳过、0失败，f52faec相同产品源的独立真实长计时3/3通过，新版演示关键流程已由开发者复验通过，用户人工验收仍待进行。十一项实现缺陷单独记录在可靠性复查表，不与外部协议本身缺少判定证据的限制混同。

用户全面人工验收尚未完成；已反馈的账号与一次建群单点观察见[需求变更记录](change-requests.md#用户单点观察记录)，其余项目仍应对当前统一演示版本逐项确认。上一轮基础功能开发者截图为[Agent步骤](evidence/demo-agent.png)、[序列预检与执行](evidence/demo-sequence.png)、[viewer只读](evidence/demo-viewer.png)。较早开发者浏览器证据包括[序列运行](evidence/console-sequence.png)、[只读视图](evidence/console-viewer.png)、[断线恢复数据](evidence/browser-reconnect.json)与[断线恢复截图](evidence/console-reconnect.png)；另有新版[断线与503自动恢复数据](evidence/browser-reconnect-retry.json)、[截图](evidence/console-reconnect-retry.png)、[发布测试清单](evidence/release-verification.json)和[已有数据迁移验证](evidence/migration-upgrade.json)。每份证据只适用于其记录的版本和场景。

原始需求 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。可在项目根目录不依赖安装直接核验：

```sh
shasum -a 256 docs/original-interview-question.md
```

测试环境复查发现旧auth测试曾连接演示库并提前应用003/004、写入自身测试会话，业务行未被删除；不能声称冻结期间演示数据完全未变。9befc8a已修复auth/core/database的临时库隔离，专用基库完整复跑已通过，计数与版本见需求矩阵，详见[决策D016](decisions.md)及验收记录。
