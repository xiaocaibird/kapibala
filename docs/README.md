# 工程文档与验收入口

本文汇总工程要求、模块设计、验收步骤、可靠性复查及验证证据。原始需求保持字节不变。代码通过自动检查与开发者浏览器验证，不等于用户已完成人工验收。

## 阅读顺序

| 目的 | 文档 |
|---|---|
| 快速了解当前能力、来源、实现与用户验收状态 | [当前功能总表与需求追踪](feature-matrix.md) |
| 先体验和验收功能 | [分批验收与运行说明](acceptance.md) |
| 查看逐条实现、测试证据和未验范围 | [需求实现与验证矩阵](requirements-matrix.md) |
| 核对十一项可靠性缺陷的修复与回归 | [可靠性复查记录](reliability-review.md) |
| 核对目标、固定约束、阶段与协作要求 | [工程要求](engineering-requirements.md) |
| 追踪用户新增功能、实施状态与本轮单点反馈 | [需求变更记录](change-requests.md) |
| 查看已批准实施的群目录排序、搜索、分页与表单保护 | [群列表与资料完善方案](group-directory-profile-proposal.md)；[验证范围与待验项GD01–GD12](acceptance.md#group-directory-acceptance) |
| 核对PI-01账号操作及群管理员文案的实际范围与验收 | [账号操作与群内角色文案](account-operation-copy.md) |
| 核对PI-02群状态与Agent开关筛选的范围、兼容及验收 | [群目录筛选记录](group-directory-filter-review.md) |
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

当前演示已于**2026-09-30 22:47:25（北京时间）**从main的`b6d7743`统一启动模拟器/API/Vite，schemaVersion为6，控制台HTTP200，无新增迁移。父进程10600、模拟10602、API10603、Vite10604；入口[本地控制台](http://127.0.0.1:5173)，管理员`admin/admin`，只读账号`viewer/viewer`。启动源码、产品树及进程以[筛选运行证据](evidence/group-directory-filters-rollout.json)和main `.runtime/runtime-manifest.json`为准，文档提交不会自动重启服务。

当前版本包含既有群目录排序、四字段搜索、游标分页、两处表单保护、PI-01文案，以及PI-02群状态/Agent开关筛选。筛选构建含双方TS、定向65/65及列明开发者浏览器场景通过，详见[筛选验证](group-directory-filter-review.md)；用户验收待进行。原028a2e8的创建任务sessionStorage找回保持，目录关键词/方向/筛选/页仍只在本次登录内存保存；其独立38项前端及任务刷新/隐藏浏览器证据保持原版本范围，不改记为本轮重验。

22:18:35启动9bc34fd的API及后来仅前端028a2e8/f1257c1热更新现已成为历史，见[上一批运行记录](evidence/group-directory-rollout.json)、[文案记录](account-operation-copy.md)。本次main从7990ddd ff到b6d7743后统一重启，消除了之前API与前端源码版本不同的运行状态。

| 用途 | 本地路径 | 版本与执行边界 |
|---|---|---|
| main及当前演示 | `/Users/zcm/Desktop/kapibala` | 当前b6d7743统一运行，含PI-01文案及PI-02筛选；默认端口只从此目录启动 |
| 群目录集成与文档 | `/Users/zcm/.codex/worktrees/42fe/kapibala` | 当前`agent/group-directory-filters-release`，后端0ad7cb7/前端b6d7743；定向及列明隔离浏览器范围通过，已更新统一演示，不在此启动第二套默认端口 |
| 历史群资料验证 | `/Users/zcm/.codex/worktrees/platform-gateway/kapibala` | 当时群资料集成记录保留；当前是否复用以对应工作树实际状态为准，不视为默认运行目录 |

本轮停服前四类在途任务均为0；备份在main `.runtime/backups/2026-09-30-before-group-filters`，66594字节PG归档可列目录。业务数据、4群及两个模拟器文件保留；viewer冒烟前18表中17表哈希相同，仅auth_tokens变化。原154条token_hash均在，1旧行仅used_at变化，重启恢复阶段新增2行，随后viewer登录再新增2行；符合正常认证生命周期，具体浏览器来源未观测，不宣称所有业务和认证表完全相同。新IAB viewer默认看到4群，active+false为1群且无创建入口，未做业务写入；[本轮演示截图](evidence/group-directory-filters-main.png)已保存并关闭浏览器，用户Chrome未操作。备份可读不等于完整灾难恢复演练。

历史22:18批次备份`.runtime/backups/2026-09-30-before-group-directory`为65327字节，006重复迁移与当时17表保留核对见[上一批运行记录](evidence/group-directory-rollout.json)；不将该历史结果用于声称本轮认证数据未变化。

所有`apps/`、`packages/`、`db/`、`scripts/`、`tests/`及根README路径相对完整仓库。执行命令前核对`git branch --show-current`、`git rev-parse HEAD`及运行manifest；安装和冷启动见[项目README](../README.md)，只有服务未运行时才启动，避免不同工作树争用默认端口。

20:57:22的7efdbf3/schema5群资料版本及19:57:51的9befc8a/schema4均已成为历史，分别见[群资料运行证据](evidence/group-metadata-rollout.json)、[基础运行证据](evidence/demo-verification.json)。既有业务与用户验收记录保留，不将后续数据变化追溯为当时计数。

提醒专项已在独立候选实现，最终产品源码ee2a0d9通过234项登记/231通过/3既有跳过及24项浏览器检查，见[实施与证据](page-update-notification-implementation.md)；当前候选等待统一集成及演示切换，不倒写为上一筛选批次已交付。PI-01仅文案已在独立f1257c1完成并启用，证据见[文案验收](account-operation-copy.md)；PI-02状态/Agent开关筛选已按CR-012独立集成，b6d7743构建含双方TS、定向65/65及列明隔离浏览器场景通过，演示已启用，见[专项记录](group-directory-filter-review.md)；不并入分页或PI-01的历史已测范围。其他未采纳产品/架构建议仍按各自记录评审。

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
