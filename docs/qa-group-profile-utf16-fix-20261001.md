# BLK-SPEC-006 群资料 UTF-16 长度修复

2026-10-01，开发分支 `agent/qa-group-profile-utf16`，基线 `86ad4e7e63786f652c965308b032b98415bdd7ac`，产品修复 **`f2fe26529b2c5b849a44c61cdfbdc4b00ad78090`**。本记录仅针对 QA 提交的群资料输入契约缺陷，不改变正在进行的固定候选验收或其原始结果。

## 公开要求与原因

[资料方案](group-directory-profile-proposal.md#4-资料摘要与两处表单)、[字段并发契约](group-profile-conflict-review.md)及 D024 沿用：名称 trim 后 1–80 个 JavaScript UTF-16 单元，简介 trim 后最多 500；已填名称不可清空，简介空白转 null。此处不是新增长度决策。

现有锁定依赖 Zod 4.6.5 的字符串 `.max()` 按 Unicode 码点计数。前后端待写 schema 均直接使用 `.max(80/500)`，所以 `😀` 重复 41 次虽然为 82 个 UTF-16 单元，仍通过名称校验；简介的 251 个 emoji 同类。QA 在 `0af6443` 的 PATCH 实测为 200；开发在 `86ad4e7` 复核同一机制，并用新增回归独立复现。

## 修复与兼容

- 后端 `group-profile.ts` 在 trim 后显式使用 `value.length` 校验既有上限；POST 创建及 PATCH 资料共用同一 schema。
- 前端 `api/groupProfile.ts` 的创建、条件编辑路径使用相同度量；超长新值在表单提交准备时被拒绝，不截断用户内容。
- 名称非空、简介清空、资料可省略、权限和整请求校验顺序保持原样；无效资料混合开关请求不会部分修改群或发事件。
- `expected` 是已存储原值，不增加 trim 或长度限制。此前已落库的超长 emoji 值仍可读取，并作为比较条件修正；只改另一字段时不重写旧超长值。前端响应 schema 不在本次一起收紧，避免旧数据令详情或目录不可读。
- 无数据库迁移、数据清理、外部协议或依赖版本调整；不修改 QA 测试及断言，也不改变原始需求文件。

## 实际验证

| 阶段 | 实际结果 | 证据与范围 |
| --- | --- | --- |
| 修前回归 | 4 个新增 UTF-16 反例全部失败，退出码 1 | [原始失败](evidence/qa-group-profile-utf16-before-regression-before.log)、[索引](evidence/qa-group-profile-utf16-before-verification.json)。基线产品 `86ad4e7` 加未提交的新开发用例；索引保存用例 diff 哈希。该索引 passed 只表示预期的失败复现成功，不是产品通过。 |
| 修后定向及前端回归 | **156/156，零失败、跳过、取消** | [原始日志](evidence/qa-group-profile-utf16-after-focused.log)、[索引](evidence/qa-group-profile-utf16-after-verification.json)，实际源码 `f2fe265`。三份真实 PostgreSQL 群资料/冲突/目录套件及全部前端单元套件。 |
| 构建与原文 | 前后端类型、生产构建、原始文件校验通过 | 同上索引及构建/原文日志；原文 SHA-256 仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。 |
| 独立源码复核 | 未发现本次 diff 的阻塞或实质漏项 | 只读检查写入度量、共享路径、expected/读取兼容及回归范围；不将其算作独立 QA 验收。 |

新增 API 检查通过 Fastify `app.inject` 运行真实认证/路由及 PostgreSQL 写入，不是独立浏览器端到端检查。分别验证名称和简介的精确上限、少一个单元、混合 emoji 多一个单元、整 emoji 多两个单元、组合字符及首尾空白；创建作业状态、PATCH 回显与 GET 持久内容一致。无效 POST/PATCH 均为 400 `VALIDATION_ERROR`，业务行、作业、事件和远端调用无部分副作用。历史超长名称/简介读取与条件修复另有回归。

两次开发运行各使用自建 PostgreSQL 容器的随机回环端口和 UUID 数据库；索引记录测试库为零、各自容器及匿名卷已精确删除。没有连接 QA 冻结 SUT、验收数据库或演示环境。未重跑全项目长计时套件，156 项不得写成完整业务通过；本改动不关闭 CAP003 等既有其他限制。

## QA 交接

由 QA 另取交接的固定修复提交，对 BLK-SPEC-006 的创建/编辑、名称/简介边界及原值兼容完成独立复测。`86ad4e7` 全量运行保留原版本和结果，不热替换其工作树或资源。UI-024/025 的回放前提问题由 QA 自行修订，本批未据此修改产品。
