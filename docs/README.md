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
| 查看已批准实施的群目录排序、搜索、分页与表单保护 | [群列表与资料完善方案](group-directory-profile-proposal.md)；[待验证场景GD01–GD12](acceptance.md#group-directory-acceptance) |
| 区分用户已确认决定与暂定技术选择 | [决策与变更记录](decisions.md) |
| 理解后端及控制台的接口依赖 | [模块协作接口](module-interfaces.md) |
| 理解状态、发送、群任务和消息恢复 | [网关设计](gateway-design.md) |
| 理解Agent工具、审计、恢复和序列排期 | [自动化设计](automation-design.md) |
| 理解登录、权限、页面与实时合并 | [控制台设计](console-design.md) |
| 复现正常流程与可控故障 | [模拟服务说明](simulator.md) |
| 核对本轮实际环境与选择依据 | [工具链记录](toolchain.md) |
| 查看固定的完整原始要求 | [原始需求（只读）](original-interview-question.md) |

## 代码与命令执行位置

所有文档中的 `apps/`、`packages/`、`db/`、`scripts/`、`tests/` 与根README路径均相对于完整代码仓库；模块文件的简写在需求矩阵中另列映射。执行命令前用 `git branch --show-current`、`git rev-parse HEAD` 核对当前位置；完整安装和验证命令见[项目README](../README.md)。

| 用途 | 本地路径 | 版本说明 |
|---|---|---|
| 本地main及当前演示目录 | `/Users/zcm/Desktop/kapibala` | 群资料扩展已本地合入；20:57:22启动源码7efdbf3，产品源码与已验证2d67500一致 |
| 发布验证工作树 | `/Users/zcm/.codex/worktrees/platform-gateway/kapibala` | `agent/group-metadata-release`；本批集成及隔离验证在此执行 |
| 历史实施目录 | `/Users/zcm/.codex/worktrees/42fe/kapibala` | 旧演示已停止；保留实施历史和较早日志，不再从此目录启动默认端口 |

服务已运行，直接访问 [本地控制台](http://127.0.0.1:5173)，管理员 `admin/admin`，只读账号 `viewer/viewer`。2026-09-30 **20:57:22（北京时间）**从main的 `7efdbf3` 启动本批群资料功能，产品源码与已验证 `2d67500` 一致：父进程58240、模拟服务58241、业务API58242、Vite58243，健康检查schemaVersion为5。运行manifest在main的 `.runtime/runtime-manifest.json`，后续文档提交不改变该次已加载产品源码。

群名称、简介、创建时间与变更台账已交付，具体规则和待确认项见[CR-001–CR-005](change-requests.md)。迁移005只增加两个可空本地字段；更新前已备份PG及模拟器状态，17张业务与会话表的既有字段规范化JSON在迁移前后完全一致，4个旧群保持无名称/简介且创建时间不变。用户新群及“你好，我是用户4”消息已在更新后只读核对；两个模拟器文件备份与启动后哈希相同。[本批运行证据](evidence/group-metadata-rollout.json)记录版本、进程、备份、保留核对和独立页面结果。

19:57:51启动的9befc8a、父6107/API6110等属于上一轮运行，见[历史统一演示证据](evidence/demo-verification.json)。此前开发者新增的复验群及用户数据均保留，不回删历史数据。

原始目录的文档入口为 `/Users/zcm/Desktop/kapibala/docs/README.md`。后续本地启动默认使用此main目录；只有服务未运行时才执行冷启动命令，不要同时从两个工作树启动默认端口。

后续群目录批次正在 `agent/group-directory-release`（`/Users/zcm/.codex/worktrees/42fe/kapibala`）实施，起点`324486b`、契约`c4831e0`。CR-007–010已批准实施，验证与演示切换尚待单独留证；本段不把旧20:57:22运行记录更新成新功能已上线。提醒、其他产品及架构方案仍按各自待审索引保留。

## 来源与证据边界

本批 `2d67500` 构建、类型和原文校验通过，独立临时base库常规143项登记、140通过、3跳过、0失败，111.872秒；新增字段创建/编辑/清空、旧群回退、跨日时间和viewer只读通过独立浏览器检查，见[本批验证](evidence/group-metadata-verification.json)。用户对新群资料功能仍待验收。

文档由最初工程基线持续更新，最新源码版本、测试命令、日志、浏览器场景及待验范围集中记录在[需求矩阵](requirements-matrix.md)。较早日志保留其时间和覆盖范围，不能证明后来发现的并发或故障窗口；R11活动时钟接管初始化竞态已在候选`f52faec`修复，真实PG屏障回归与模块检查通过；最终82312b9隔离基库常规128项登记、125通过、3跳过、0失败，f52faec相同产品源的独立真实长计时3/3通过，新版演示关键流程已由开发者复验通过，用户人工验收仍待进行。十一项实现缺陷单独记录在可靠性复查表，不与外部协议本身缺少判定证据的限制混同。

用户全面人工验收尚未完成；已反馈的账号与一次建群单点观察见[需求变更记录](change-requests.md#用户单点观察记录)，其余项目仍应对当前统一演示版本逐项确认。上一轮基础功能开发者截图为[Agent步骤](evidence/demo-agent.png)、[序列预检与执行](evidence/demo-sequence.png)、[viewer只读](evidence/demo-viewer.png)。较早开发者浏览器证据包括[序列运行](evidence/console-sequence.png)、[只读视图](evidence/console-viewer.png)、[断线恢复数据](evidence/browser-reconnect.json)与[断线恢复截图](evidence/console-reconnect.png)；另有新版[断线与503自动恢复数据](evidence/browser-reconnect-retry.json)、[截图](evidence/console-reconnect-retry.png)、[发布测试清单](evidence/release-verification.json)和[已有数据迁移验证](evidence/migration-upgrade.json)。每份证据只适用于其记录的版本和场景。

原始需求 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。可在项目根目录不依赖安装直接核验：

```sh
shasum -a 256 docs/original-interview-question.md
```

测试环境复查发现旧auth测试曾连接演示库并提前应用003/004、写入自身测试会话，业务行未被删除；不能声称冻结期间演示数据完全未变。9befc8a已修复auth/core/database的临时库隔离，专用基库完整复跑已通过，计数与版本见需求矩阵，详见[决策D016](decisions.md)及验收记录。
