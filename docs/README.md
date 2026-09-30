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
| 本地main集成目录 | `/Users/zcm/Desktop/kapibala` | 完整代码按本轮验证结果本地合入；以该目录实际HEAD为准 |
| 发布验证工作树 | `/Users/zcm/.codex/worktrees/platform-gateway/kapibala` | `agent/platform-release`；当前最终验证在此执行，含时间线自动重试修复 |
| 旧演示运行目录 | `/Users/zcm/.codex/worktrees/42fe/kapibala` | 保留正在运行的5173页面及后端/模拟服务；此目录HEAD不代表已加载版本 |

服务已运行时访问 [本地控制台](http://127.0.0.1:5173)，管理员 `admin/admin`，只读账号 `viewer/viewer`。开发总父进程 `scripts/dev.ts` 为PID `73373`（2026-09-30 18:46:02启动）；后端PID `73376`、模拟器PID `73375` 均于18:46:03启动，Vite为PID `73377`，三者cwd均为旧演示目录。后端的 `34d9af2` 仅为根据启动时间推断的源码版本，未保存启动manifest。后端和模拟器未watch、未重启，前端曾热更新，旧演示工作树 `apps/web` 与 `a8aac5f` 的差异已确认为空；本轮R8等前端修复仅合入独立release，没有热更新到5173。发布分支的新代码不会自动替换该演示。用户已授权在验证后重启到新版本并保留数据，实际重启及运行manifest尚待记录（见D015）。

原始目录的文档入口为 `/Users/zcm/Desktop/kapibala/docs/README.md`。只有需要启动新环境且端口未被现有服务占用时，才执行验收指南中的冷启动步骤；不要同时从两个工作树启动默认端口的开发服务。

## 来源与证据边界

文档由最初工程基线持续更新，最新源码版本、测试命令、日志、浏览器场景及待验范围集中记录在[需求矩阵](requirements-matrix.md)。较早日志保留其时间和覆盖范围，不能证明后来发现的并发或故障窗口；R11活动时钟接管初始化竞态已在候选`f52faec`修复，真实PG屏障回归与模块检查通过；最终候选f52faec常规124通过/3跳过及独立真实长计时3/3通过，用户人工验收和新版演示运行验证仍待进行。十一项实现缺陷单独记录在可靠性复查表，不与外部协议本身缺少判定证据的限制混同。

所有用户人工验收仍待进行。开发者浏览器证据包括[序列运行](evidence/console-sequence.png)、[只读视图](evidence/console-viewer.png)、[断线恢复数据](evidence/browser-reconnect.json)与[断线恢复截图](evidence/console-reconnect.png)；另有新版[断线与503自动恢复数据](evidence/browser-reconnect-retry.json)、[截图](evidence/console-reconnect-retry.png)、[发布测试清单](evidence/release-verification.json)和[已有数据迁移验证](evidence/migration-upgrade.json)。每份证据只适用于其记录的版本和场景。

原始需求 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。可在项目根目录不依赖安装直接核验：

```sh
shasum -a 256 docs/original-interview-question.md
```
