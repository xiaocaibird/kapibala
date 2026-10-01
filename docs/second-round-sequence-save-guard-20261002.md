# 第二轮新建序列表单刷新修复

2026-10-02（北京时间）。针对独立 QA 的 SR-UI-008 反馈，研发已复现并修复：首次创建序列时，保存响应尚未送回浏览器，后台 WebSocket 触发的列表读取已看到新模板，导致打开的表单被重建，输入恢复默认值、保存状态消失。**固定产品候选为 `a99a6a80ffa5b887a74e0ef9414e85b9068db9eb`，研发浏览器专项 4/4 通过；独立 QA 复测结论另记。** 原 QA 报告及资产未修改，序列选择器适配问题未改成产品修复。

## 根因与最小改动

标准保存接口在同一真实事务内保存模板并发出 `sequence_definition_changed`；浏览器接到真实 WebSocket 事件后，`useResource` 自动读取序列列表。当原列表为空，首条模板进入列表会使 `sequenceId` 从空字符串变成新 ID。`PageAttentionScope` 的 key/scopeKey 随之改变，其内部 `CreateSequence` 被卸载并重新建立，而父组件的 `createOpen` 仍为 true，所以弹窗表面仍打开，却已不是原保存表单。

只将独立的新建表单移到选择相关的 `PageAttentionScope` 外，保留该范围的 key、scopeKey 和原预检处理。API、保存内容、草稿规则、关闭 guard、初次默认选择及显式选择失效语义均保持。JSX 新增外层 Fragment 后由格式化工具统一缩进；忽略空白的产品差异是弹窗位置及说明注释，没有重写页面逻辑。

## 修前与修后证据

研发使用[独立浏览器脚本](../apps/web/tests/verify-sequence-save-refresh.mjs)，连接真实 PostgreSQL、标准 REST、数据库事件日志、真实 WebSocket 和生产 React 构建。浏览器只持有实际 POST/GET 响应，再原样释放，不伪造结果或事件。无关后台 worker 关闭，不执行外部 Gateway/Agent，也不读取 QA 用例、驱动或断言。

| 场景 | 修前 `2c1826b` | 修后固定 `a99a6a8` |
|---|---|---|
| 原列表为空，保存响应持有，无 Escape，释放实际后台列表读取 | FAIL：JSON 恢复默认、保存中和禁用状态消失 | PASS：精确提交 JSON、保存中和禁用状态保留 |
| 原列表为空，先在列表响应仍持有时按 Escape，再释放列表 | FAIL：Escape 单独不影响原表单；列表渲染后才重置 | PASS：Escape 前后及列表刷新后均保留原表单 |
| 已有明确序列选择时保存新模板 | PASS，对照场景 | PASS |
| 未提交的脏表单，另一真实请求创建首条模板并触发刷新 | FAIL：未提交草稿同样重置 | PASS：草稿保留，继续编辑/明确放弃仍按原规则 |

保存场景还核对刷新后的 ×、Escape 和禁用取消入口，释放原保存响应后弹窗关闭，只发生一次浏览器 POST，真实列表中的保存步骤与提交快照逐字段一致。失败场景不自动重试；首轮三个明确失败原样保留，未因修后结果覆盖。

原始报告：[修前](evidence/second-round-sequence-save-20261002/before.json)、[修后](evidence/second-round-sequence-save-20261002/after.json)。每例包含实际 POST/GET 与 WebSocket 事件、响应释放顺序、公开 DOM 快照、截图摘要和清理结果。修后四例均无 pageerror/route error，逐例数据库及服务已清理。修前报告记录当时未提交的研发脚本和实际哈希；其后仅由 Prettier 统一脚本格式，修后运行绑定已提交候选且工作区干净。历史结果不改写为另一脚本字节版本的运行。

## 验证与复跑

- 全部前端开发测试：135 项登记，134 PASS、0 FAIL、1 个既有跳过；[原始输出](evidence/second-round-sequence-save-20261002/frontend.tap)。跳过不计通过。
- [修后构建](evidence/second-round-sequence-save-20261002/build-after.txt)完成边界检查、类型检查及生产构建；[原始来源校验](evidence/second-round-sequence-save-20261002/original.txt)通过，校验值仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。
- 本次未运行后端全套、全部浏览器流程或独立 QA；相关结果不能由四条专项外推。后续组合与 main 冻结由研发集成另记。

使用 Node 24.21+/npm 12.1+、候选锁文件依赖、专属 PostgreSQL 17 与已安装的 Playwright。脚本使用给定连接的凭据创建逐例 UUID 数据库，不改给定连接所选数据库；必须给专属容器连接，禁止默认 55432。`PLAYWRIGHT_MODULE` 指向第三方 Playwright 的实际安装模块，不需要导入 QA 工程。

```sh
npm run build
DATABASE_URL='<专属 PostgreSQL 连接>' \
  PLAYWRIGHT_MODULE='<已安装 Playwright 的绝对 index.mjs 路径>' \
  UI_EVIDENCE_PATH='<本轮自有绝对输出路径>/browser.json' \
  node --import tsx apps/web/tests/verify-sequence-save-refresh.mjs
node_modules/.bin/tsx --test apps/web/tests/*.test.ts
npm run verify:original
```

本轮专属容器 `a2aa7723eb9e0135a60d1132f30043722e8f41b9e3bbd23cd4ce98430217c92e` 删除前临时库与测试连接均为零；按归属标签及完整 ID 核验后，容器与其实际挂载卷均已删除，见[清理记录](evidence/second-round-sequence-save-20261002/cleanup.json)。没有修改演示、用户数据或真实模型配置。

原始日志字节和截图保持不变；仅将 `.log` 归档名改为 `.txt`，映射、字节数及 SHA-256 见[证据清单](evidence/second-round-sequence-save-20261002/sha256.json)。本文不代签 QA 结果，不改变第一轮遗留及第二轮其它未完成项。
