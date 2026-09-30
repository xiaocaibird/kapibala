# 文档基线与阅读入口

当前 `main` 是**文档基线**：包含工程要求、决策、设计、验收指南、证据矩阵和两张开发者检查截图，尚未合入应用代码、依赖、迁移或测试。原始需求文件保持字节不变。文档合入不代表代码已交付到 `main`，也不代表用户已完成验收。

## 阅读顺序

| 目的 | 文档 |
|---|---|
| 先体验和验收功能 | [分批验收与运行说明](acceptance.md) |
| 查看逐条实现、测试证据和未验范围 | [需求实现与验证矩阵](requirements-matrix.md) |
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

实施代码和测试位于本地分支 `agent/platform-integration`，当前工作树为：

```text
/Users/zcm/.codex/worktrees/42fe/kapibala
```

所有文档中的 `apps/`、`packages/`、`db/`、`scripts/`、`tests/`、根 `README.md` 和依赖文件路径，都指向该实施分支的项目根目录；这些文件在当前文档版 `main` 中不存在。涉及 `npm`、`nvm`、Docker Compose 或测试的命令，应先进入上述工作树；不要在原始 `main` 目录直接运行。代码以后独立验证和集成。

服务已运行时可访问 [本地控制台](http://127.0.0.1:5173)，不必为了阅读文档重启服务或数据库。管理员 `admin/admin`，只读账号 `viewer/viewer`。首次冷启动、故障复现和验收步骤见验收指南。

原始工作目录的文档入口是：

```text
/Users/zcm/Desktop/kapibala/docs/README.md
```

## 来源与证据边界

本批文档取自实施工作树 `374d83c7f84b7ba156f38a59818438399b0a6639` 的文档内容，同时纳入当时尚未提交的 PostgreSQL 17.11 维护说明及两张截图。为适配文档版 `main`，补充了本入口、代码执行位置说明，并消除了指向尚不存在的根README的相对链接；未复制应用代码。

不同文档中的检查记录保留其原有时间和适用版本。需求矩阵明确区分已执行通过、部分验证、待复验及协议限制；较新的模块证据不能自动代替较早版本之后的整体验证。所有用户人工验收仍待进行。截图属于开发者浏览器检查证据：[序列运行](evidence/console-sequence.png)、[只读视图](evidence/console-viewer.png)。

原始需求 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。可在当前 `main` 不依赖项目安装直接核验：

```sh
shasum -a 256 docs/original-interview-question.md
```
