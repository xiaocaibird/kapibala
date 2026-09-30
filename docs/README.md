# 工程文档与验收入口

本文汇总工程要求、模块设计、验收步骤、可靠性复查及验证证据。原始需求保持字节不变。代码通过自动检查与开发者浏览器验证，不等于用户已完成人工验收。

## 阅读顺序

| 目的 | 文档 |
|---|---|
| 按原始A/B要求逐组评审证据、关键机制与剩余风险 | [核心功能验收与验证记录](acceptance.md)；工程侧执行验证，负责人审查标准与结果 |
| 区分原始要求未闭合与额外产品增强 | [核心缺口与证据复核](core-requirements-gap-review.md)；[额外增强建议](product-enhancement-proposal.md)；[旧PI提案映射](product-improvement-proposal.md) |
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
## 当前演示与代码位置

当前演示已于 **2026-10-01 00:02:35（北京时间）** 从main产品提交 `7e83191` 统一启动模拟器/API/Vite，schemaVersion仍为6，没有新迁移。入口：[本地控制台](http://127.0.0.1:5173)，管理员`admin/admin`，只读账号`viewer/viewer`。父进程21643、模拟21646、API21647、Vite21648；脱离启动shell运行（PPID1），未设置开机自启。源码、进程和运行检查以main `.runtime/runtime-manifest.json`与[本次运行证据](evidence/group-profile-conflict-rollout.json)为准；后续文档提交不自动重启服务。

本次增加PI-03获准的群资料同字段冲突保护：当前表单只为本次修改字段携带原值条件；冲突整次不写入，保留草稿、展示服务器快照，明确重新确认后再次比较。不同字段编辑可共存；无expected旧调用方仍按最后写入生效。仅第三项获准，序列表单及PI-03其余建议不在本批。PI-01文案、PI-02目录完善和本项均已交付待人工复验；PI-04–23暂缓，提醒维持已交付范围，下一步按D029优先验收原始核心能力及处理发现的问题。

`7e83191`通过构建/前后端TS/原文SHA、定向 **138/138**（前端92、5个PG文件46；0失败/跳过）和16项双IAB观察。测试覆盖原值条件、真实行锁并发、整请求原子性、草稿/二次确认、空值、503、关闭/迟到和只读权限；详情见[专项](group-profile-conflict-review.md)、[结构化验证](evidence/group-profile-conflict-verification.json)。本批未重跑全部后端或长计时套件，不扩大历史验证范围；用户仍待验。

切换前四类在途任务均为0，67613字节PG归档通过archive-list核验，备份位于main `.runtime/backups/2026-10-01-before-group-profile-conflict`。重启后、viewer只读冒烟前，18表行数/哈希和2个模拟器文件完全一致，4群/15消息/6账号保留；未运行迁移/seed/reset。独立IAB viewer只读核对4群和资料页无编辑入口后关闭，未做业务写入或操作用户Chrome；登录正常生成认证记录。备份可读不等于灾难恢复演练，持久数据保留也不承诺浏览器未提交输入保留。

| 用途 | 本地路径 | 版本与执行边界 |
|---|---|---|
| main及当前演示 | `/Users/zcm/Desktop/kapibala` | 统一运行产品源7e83191；默认端口只从此目录启动 |
| 本批集成与证据 | `/Users/zcm/.codex/worktrees/42fe/kapibala` | `agent/group-profile-conflict-release`；验证使用独立库/随机端口，资源已清理 |
| 本批API与前端实现 | `group-directory-api`、`group-directory-web`托管工作树 | 原提交6834dd9、aa28ee9分别集成为9c81c96、7e83191；不是默认服务目录 |

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
