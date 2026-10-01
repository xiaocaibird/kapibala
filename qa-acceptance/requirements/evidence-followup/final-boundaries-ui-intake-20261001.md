# 2716ab 固定候选：UI 接入与结果范围审计

2026-10-01。产品候选固定为 `2716abdd2d43a779b6a0972a6323f895cf2b5b9c`；QA 接收基点为 `48fc949e7f2042e8bdad239da869054ceac9d9c0`，已包含 QA 修正提交 `f6eb630`，当前准备分支 `agent/qa-2716-boundaries-retest`。实际运行还须冻结当次 QA 源及目标摘要。本文件是静态接入审计，**没有启动产品、数据库或浏览器，没有产生新候选 PASS，也没有补造真人结果**。

依据为[固定交接](../../../docs/qa-final-boundaries-followup-20261001.md)、[已批准目录方案](../../../docs/group-directory-profile-proposal.md)、[提醒原则](../../../docs/page-update-notification-proposal.md)、[本轮收尾契约第 1 节](static-closeout-contract-20261001.md#1-ui-032职责不变量与可达前提)。产品源码只用于确认现有公开操作和定位，不替换这些业务预期。

## 公开定位可沿用，历史验证不改写

实际已有适配文件是 [ui-adapter-0af6443-retest.json](../../config/ui-adapter-0af6443-retest.json)，没有找到 `config/ui-adapter-e85ae61.json`。旧 e85 实际目标 `.runtime/evidence-retest-20261001/target.ui-headed.json` 的 `ui.routes`、`ui.selectors` 与该文件逐字段一致。文件中的旧 `candidateRevision`、`verification`、`adapterConfirmed` 反映历史定位接入边界，不能改写为 2716ab 已经浏览器验收。

对固定 e85 与 2716ab 的 `apps/web` 差异核对结果：只有 `api/schemas.ts` 增加可选 `localFilePath`；群目录页面、目录控制器、提醒组件及浏览器图标代码未变。本次不扩展到 C1 媒体或 C2 真实模型范围。

| 用途 | 既有公开定位 | 静态证据及限制 |
| --- | --- | --- |
| 登录及原查询 | `username`、`password`、`login`、`search`、`order`、`statusFilter`、`agentFilter` | 已有路由与表单定位；新会话仍实际登录并记录控件值，不能以旧 cookie 继承会话 |
| 卡片身份与续页 | `directoryItem=a[data-directory-group-id]`、`directoryLink=xpath=.`、`loadMoreGroups` | 固定候选 `Groups.tsx:442–447,529–536`；身份从公开详情链接解析。卡片本身是导航链接，本例用真实区域滚轮，不阻止链接导航来伪造同页点击 |
| 过期及真实失败 | `directoryStale`、`directoryError`、`refreshDirectory` | `Groups.tsx:391–408`；U3 从普通目录刷新触发实际 503，旧 40 条及未确认提醒须保持 |
| 恢复并查看更新 | `attentionRefresh=.attention-notice > button` | `attention/index.tsx:370–393,533–543`，公开文案“刷新并查看更新”。U4 已改用此入口；失败读取全部结束、旧状态核对后重新检查唯一、可见、可用，才解除故障并点击 |
| 成功结果范围与确认 | `attentionScopeSummary`、`attentionScopeConfirm` | `Groups.tsx:247–292`、`attention/index.tsx:464–489,574–606`；显示当前查询、实际首页数量和后续结果说明，再确认。普通工具栏“刷新”本身不代表已请求呈现范围摘要 |

UI-032 所需的定位键均已存在，无须新增控件或选择器键。上述是可接入的静态依据；实际控件不唯一、不可用、摘要未呈现或真实请求无法归属时，执行结果仍须保留 BLOCKED，不能用源文件中“存在按钮”代替页面事实。

## 执行前提与观察时间

1. 使用公开 API 创建至少 41 条匹配记录，公开创建时间和 ID 建立独立排序预期。本例的公开时间若在毫秒精度重合，无法由显示值判断数据库微秒顺序，应记录前提不足。真实读取两整页 40 条，第二页必须还有非空 `nextCursor`，并从实际第二页选择变更目标。
2. 初始 WS 水位必须实际收到；在原 5 秒目录周期内确认回放、读取收敛。真实失焦后修改目标；仅聚焦和旧卡片区域滚轮分别观察 1 秒，失败刷新后观察 2 秒，合法确认后观察 1 秒。它们是本例保留的观察窗口，不是新增业务响应 SLA。
3. U2/U3 保留原 document、URL、navigation、socket 和 scope；旧链续页一直禁止。U4 只有真实本次 200 之后，同原连接唯一 marker 与匹配 requestId 的 ack、且水位事件实际收到，才可接纳合法刷新同步。新水位可与旧值不同。摘要实际呈现、ack 完整后采集 U5 基线；采集的异步等待结束还要再次复核原 document 与完整旧账本，不能把迟到重建吸收到新基线。
4. 合法确认前后比较新首页 ID/顺序、查询条件、stale 和分页资格；之后真实“加载更多”的 cursor 来源为成功新首页响应。相同 cursor 字符串可合法再次出现，不要求服务器撤销旧字符串。刷新、确认及续页分别留证，不以瞬时零请求证明整段通过。
5. 本次 Chromium 焦点相关组应显式使用 `ui.headless=false`，使用 QA 专属浏览器及隔离上下文。既有 `nativeBackgroundTab` 去除 Chromium 的 always-focused 仿真并验证实际排他焦点；无法建立则 BLOCKED，不合成 `focus`、`visibility` 或输入法事件。不操作用户日常浏览器。

当前 Playwright 配置是单 worker、零重试、单测试 120 秒、一般断言 8 秒；目录前提的有限采集通常上限为 15 秒。这些是工具诊断预算，不能把“8/15/120 秒未见”不加归因地写成未约定的产品时限违约。41 次公开建群、隔离环境启动、浏览器启动及构建均需真实耗时，UI-032 未在新候选试跑，因此不声明准确完成 ETA。

## 建议选集及分母

| 组 | 用例与项目 | 可形成的结论 |
| --- | --- | --- |
| 目录确认主线 | UI-032、UI-017、UI-030，Chromium | 新的可达确认流程、原有失败刷新/旧游标保护及已有范围摘要确认的关联回归 |
| 已登记人工修复关联自动化 | `manual-ui-repair-regression-20261001`：UI-008、016、020、028、030、031、034、035，Chromium | 登录/Agent 页面、查询焦点、真实标签失焦、范围确认、自动消息提醒等自动化事实；不替代真人项 |
| 兼容性补项 | UI-008，`firefox-smoke`、`webkit-smoke` | 该 `@compat` 用例在两个额外引擎的实际结果；不扩写为所有页面均兼容 |

前两组若去重执行，Chromium 是 **10 个唯一用例**（UI-030 只算一次）；兼容性再增加 2 个 case×project，合计 **12 个不同 case×project**。若实际保留两个子集分别执行 UI-030，应保存两次 run/attempt 并分别计执行次数，最新覆盖分母仍只计一个 Chromium 项。按单测试 120 秒可预留最多 24 分钟的测试主体名义预算；这不是总运行上限或产品性能目标，独立环境准备、清理及故障归因另计。旧 e85 的上述 8 项组原始时间线约 52.119 秒，仅是旧版本单轮历史事实，不能承诺新轮耗时。

目录三项和 UI-008 两个额外项目应由执行者登记本轮明确的 suite/项目选择并冻结摘要；不能用 CLI 临时 grep 绕开已绑定的选择范围。当前 `manual-ui-repair-regression-20261001` 只选 Chromium，不能据其通过填 Firefox/WebKit。UI-024/025 可作为周期读取和返回缓存的额外关联组单独登记；并非本文件自动扩大授权选择或宣称已执行。

## 目标、授权与报告核对

执行时复用用户已给的授权依据，重新绑定固定 SUT 完整 SHA、独占 SUT 路径、QA 源、`targetSha256`、suite ID/摘要及浏览器项目；不得复用旧 e85 的 target、授权摘要、端口或资源。目标需真实生产前端构建与该 API 绑定、专用数据库、随机回环端口及明确资源 owner；使用专属已安装浏览器，清理只作用于本轮资源。本说明编写时尚未收到本轮已生成的 UI target/授权文件，因此这里只列审计条件，不声称已审核其实际字节。

现有选择子集的执行入口在原始 manifest 中属于 `developer-preflight`；`all-business`/正式全量入口不允许偷偷选子集。即使由 QA 实际执行，也要在补充复测报告如实保留原始 phase、选集、各项目状态和 raw whole-case 状态，不能修改 manifest 使它看起来是全量正式验收。

- 2716ab 新运行按新 QA 源、新 run ID 单独记录；旧 e85 的 UI-032 BLOCKED、初次失败/阻塞证据与已签报告均保留。修正测试前提不等于产品已经修复或通过。
- 记录 `caseId + project + SUT SHA + QA SHA + target/suite hash + runId/attempt`。新轮某项成功可形成该新版本的定向结论，不能覆盖旧首次结果，也不能与另一版本/配置的成功片段拼成一次 PASS。
- UI-008 旧记录为 Chromium PASS、raw whole-case NOT_RUN（Firefox/WebKit 缺失）。本轮必须分别保存三项目状态；没有同一固定候选和相容冻结配置的完整证据时，整用例不能由单项目升级为 PASS。
- 首个明确需求违约保留 FAIL；缺焦点、真实呈现、请求归属或连续性前提为 BLOCKED。后续截图、清理异常或观察边界变化不掩盖已经无干扰确证的失败；失败后的未执行断言明确标出。
- 定向浏览器结果不签发完整版本业务验收或上线准备度通过。容量、时限、跨 epoch、未知外部结果、C1/C2 和上线门禁均不由这组结果关闭。

## 真人与文案边界

H16/H17 的真实系统输入法和跨应用/窗口标签红点复验仍按 [MAN-IME-001 / MAN-FOCUS-001 指引](../../sharing/manual-execution-20261001.md) 在固定候选、独占环境安排真人操作及原生标签栏取证。合成 composition、DOM 图标属性、开发方截图和自动化标题断言均不能替代本人实际动作。

H18 四态文案体验维持有限认可及 `closed-by-user`，不重开样例、不补造 unknown 体验，不变更旧 MAN-UX-001 正式状态。工程文案复核须有实际固定版本/清单/结果；委托与开发自测不自动构成人工正式 PASS。
