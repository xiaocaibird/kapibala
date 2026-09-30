# 工程文档与验收入口

本文汇总工程要求、模块设计、验收步骤、可靠性复查及验证证据。原始需求保持字节不变。代码通过自动检查与开发者浏览器验证，不等于用户已完成人工验收。

## 阅读顺序

| 目的 | 文档 |
|---|---|
| 先体验和验收功能 | [分批验收与运行说明](acceptance.md) |
| 查看逐条实现、测试证据和未验范围 | [需求实现与验证矩阵](requirements-matrix.md) |
| 核对十一项可靠性缺陷的修复与回归 | [可靠性复查记录](reliability-review.md) |
| 核对目标、固定约束、阶段与协作要求 | [工程要求](engineering-requirements.md) |
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
| 本地main及当前演示目录 | `/Users/zcm/Desktop/kapibala` | 完整代码已本地合入；当前演示启动源码为9befc8a，产品源码与f52faec一致，后续测试/文档提交另记 |
| 发布验证工作树 | `/Users/zcm/.codex/worktrees/platform-gateway/kapibala` | `agent/platform-release`；当前最终验证在此执行，含时间线自动重试修复 |
| 历史实施目录 | `/Users/zcm/.codex/worktrees/42fe/kapibala` | 旧演示已停止；保留实施历史和较早日志，不再从此目录启动默认端口 |

服务已运行，直接访问 [本地控制台](http://127.0.0.1:5173)，管理员 `admin/admin`，只读账号 `viewer/viewer`。2026-09-30 19:57:51（北京时间）统一从main启动：父进程6107、模拟服务6109、业务API6110、Vite6111。运行manifest明确记录源码`9befc8a580eb5dc034ed5771d3f3dfc3e756eb76`，产品源码树与`f52faec`完全一致，健康检查schemaVersion为4。此前冻结已按D015结束；旧进程73373/73375/73376/73377属于历史运行记录。

更新前已备份PostgreSQL及两个模拟器状态文件，保留原容器和卷；迁移前后17张表的规范化JSON完全一致。旧群保留4成员、5消息、1个Agent运行和1个序列运行。更新后另建了开发者复验群，检查通过后保留，不能将新增复验记录误算为旧数据改变。[统一演示运行证据](evidence/demo-verification.json)记录进程、版本、哈希、备份、复验对象与待处理任务计数。

原始目录的文档入口为 `/Users/zcm/Desktop/kapibala/docs/README.md`。后续本地启动默认使用此main目录；只有服务未运行时才执行冷启动命令，不要同时从两个工作树启动默认端口。

## 来源与证据边界

文档由最初工程基线持续更新，最新源码版本、测试命令、日志、浏览器场景及待验范围集中记录在[需求矩阵](requirements-matrix.md)。较早日志保留其时间和覆盖范围，不能证明后来发现的并发或故障窗口；R11活动时钟接管初始化竞态已在候选`f52faec`修复，真实PG屏障回归与模块检查通过；最终82312b9隔离基库常规128项登记、125通过、3跳过、0失败，f52faec相同产品源的独立真实长计时3/3通过，新版演示关键流程已由开发者复验通过，用户人工验收仍待进行。十一项实现缺陷单独记录在可靠性复查表，不与外部协议本身缺少判定证据的限制混同。

所有用户人工验收仍待进行，应对当前统一演示版本重新勾选。当前版本的开发者截图为[Agent步骤](evidence/demo-agent.png)、[序列预检与执行](evidence/demo-sequence.png)、[viewer只读](evidence/demo-viewer.png)。较早开发者浏览器证据包括[序列运行](evidence/console-sequence.png)、[只读视图](evidence/console-viewer.png)、[断线恢复数据](evidence/browser-reconnect.json)与[断线恢复截图](evidence/console-reconnect.png)；另有新版[断线与503自动恢复数据](evidence/browser-reconnect-retry.json)、[截图](evidence/console-reconnect-retry.png)、[发布测试清单](evidence/release-verification.json)和[已有数据迁移验证](evidence/migration-upgrade.json)。每份证据只适用于其记录的版本和场景。

原始需求 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。可在项目根目录不依赖安装直接核验：

```sh
shasum -a 256 docs/original-interview-question.md
```

测试环境复查发现旧auth测试曾连接演示库并提前应用003/004、写入自身测试会话，业务行未被删除；不能声称冻结期间演示数据完全未变。9befc8a已修复auth/core/database的临时库隔离，专用基库完整复跑已通过，计数与版本见需求矩阵，详见[决策D016](decisions.md)及验收记录。
