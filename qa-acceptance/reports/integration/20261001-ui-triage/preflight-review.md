# 正式 UI 执行前定位与场景前提分诊

只读检查首轮 `2026-10-01T06-10-21.458Z-1fdb6180` 的冻结 QA 与候选 `0af644334b00eb13e2e56df33c70f22358a6a0f7`。仅在开头读取一次 console：当时 AUTH-006 已结束，UI 尚未运行。本记录不是执行结论，不改写首轮结果。全部定位调用清单见 `selector-context-inventory.json`。

## 已确定的 QA 接入问题

1. **UI-012 日期子上下文不匹配。** 冻结 `tests/ui/console.spec.ts:461` 先在目录卡片内查 `groupCreatedAt`，后在详情页查同键。原适配只覆盖详情 `.group-profile`，目录 `pages/Groups.tsx:488` 实际为 `.group-created > time`；这会把存在的日期误报为缺失。独立复测适配器补目录分支，同时保留详情日期断言。补充目录分支还未实跑，不冒充原 53 个定位的全面验证。
2. **UI-017 / UI-032 过期提示只定位了互斥显示分支。** `pages/Groups.tsx:371` 在目录提醒 pending 时不渲染旧 warning，而本轮选择器只定位旧 warning。公开的已加载状态在 `:399–406` 另显示“列表待刷新”。复测键改为这个专门的可见过期状态。没有把一般未读 `.attention-notice` 当成过期，避免刷新后仍有未读提醒时又误判目录仍旧过期。首次实际失败仍须结合截图与状态核实；新多页定位待复测。
3. **UI-009 / UI-010 导航前提错误。** 冻结脚本在群详情直接操作序列表单；公开页面的定时序列是独立页面，群详情提供跳转入口。这属于 QA 场景路径错误，不应要求产品新增内嵌表单。开发 QA 现点击已验证的真实侧栏 `navSequences`，明确选择当前群，原变量继承、来源、步骤/key、预检和零发送断言原样保留。
4. **UI-036 模态下的导航可达性。** 保存响应被 QA 持有时，编辑通过原生 `dialog.showModal()` 展示；原脚本尝试点击底层侧栏，在模态仍开时不能建立卸载前提。开发 QA 改用真实公开 hash 地址导航，先限定同 origin/path/query，随后严格核对原 document 及 SUT WS 连接/认证代次；改变文档或会话则 BLOCKED。它对应用户通过地址栏跳转离开表单这一公开行为，不穿透模态、不调用内部路由、不用全页重载丢弃旧响应。仍须单独实跑证明前提成立和旧结果隔离。

## 横向复核结果与未消除边界

- `createGroup` 只有 UI-022 的“打开创建表单”调用，没有复用作提交按钮，因此页头限定是正确的；不修改。
- `directoryLink` 的 `xpath=.` 是 `child(card, …)` 返回卡片本身 A，已有真实 count=1、A 标签和点击证据；不是将 page 根对象当链接。不修改。
- `groupName`/`groupDescription` 的创建/编辑两种 aria-describedby 联合定位，在各自页面仅有一种业务表单；丢弃确认对话框不新增输入。不修改。
- `saveProfile` 与 `confirmConflict` 定位编辑对话框内同一 primary 按钮。UI-015 先验证 409 与保留草稿，再作第二次明确点击；按钮文字变化不改变按钮语义。当前没有以过宽“保存”命中其他对话框的问题。
- `attentionScopeConfirm` 与 `attentionScopeSummary` 使用“确认当前范围更新”这一专用按钮，范围摘要与单条摘要语义分开；UI-030 在目录范围页使用。尚未实测该条件分支，不根据源码宣告行为通过。
- `attentionConfirm` 对应单条更新摘要。候选目录仅提供范围摘要，且当前 UI-032 未先进行定位动作，因此可能没有独立不刷新确认入口。原用例已明确缺入口 BLOCKED；保留，不让一般点击、刷新或隐藏状态代替它。
- `directoryError`/`retryDirectory` 覆盖初次、刷新、追加页三种明确错误容器；`messageError`/`retryMessages` 在 UI-029 只注入 messages 读取错误，未同时注入发送错误。若正式 trace 显示多匹配，需按实际同时错误上下文再定，不提前猜测为产品错误。
- 序列 `sequencePreviewError`/`sequenceInputError`/`sequenceResourceError` 共享页级 ErrorNotice，现有各用例分别制造业务错误、输入错误或资源错误。步骤/span 与 key/code 是相对已找到错误容器的子查询。新建序列错误另限定原对话框；没有跨对话框全局取错。
- `rawResponseToggle` 实际调用 `.first()`，允许多步骤有多段原始响应；不强行改为唯一元素。
- `sequenceResourceRefresh` 已实测真实 403 页面 count=0。保留 ARC-UI-015 的既有 BLOCKED，不创造刷新按钮，也不换成 reload。
- 账号 `ObservationFixture` 已确认 ID 限定行、状态子节点、页级错误与只重读账号的页头刷新，状态文字为“在线/已离线”；未执行完整未读确认业务。

## 独立复测交付

- 新文件 `config/ui-adapter-0af6443-retest.json`：只改日期与专门的过期状态定位；基础确认来源继承且两条新增分支逐项标记尚未实跑。原适配器和冻结 target 未修改。
- 开发 QA `tests/ui/console.spec.ts`：仅修 UI-009/010 导航、UI-036 卸载前提，并同步其用例步骤。业务预期未删改。
- `sharing/suites.json` 新增 QA 维护 `browser-adapter-regression`：引用正式用例 ID，Chromium 覆盖 19 条，Firefox/WebKit 仅执行原 `@compat` 的 UI-001/003/006，不复制另一套断言。
- 根任务须等当前完整运行结束，再冻结新 QA、target、业务/子集摘要与授权，显式登记独立复测。首轮原始工具失败保留；修正工具不代表产品通过，任何剩余 FAIL/BLOCKED 继续报告。

静态检查结果将附于本目录验证日志；本次校正阶段没有再启动产品、数据库或浏览器。

## 本次工具校验

- `npm run typecheck`：通过。
- `npm run check:suites`：通过，包括新子集及其 project 注册。
- `git diff --check`：通过。
- `npm run check:catalog`：已执行，当前未通过；唯一列出的三项是并行建设中的未登记 `INT-MSG-006 / INT-MSG-007 / INT-MSG-008`，与本次 UI 修订无关。没有修改全局目录去掩盖问题，已交根任务完成登记后统一重跑。
- 用例阅读版已重新生成。未执行本次 UI 复测，新增定位/导航前提不预填 PASS。
