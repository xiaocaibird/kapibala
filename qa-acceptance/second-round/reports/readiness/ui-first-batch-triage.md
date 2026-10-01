# 首批 UI 归因与复测准备

本记录只归因冻结批次 `2026-10-01T21-48-07.275Z-4e425702`；未改写其原始结果，也未在本复测工作区启动被测工程。SUT `5906d8d`，QA `87f5aea2519554616301f403643020b46e1d8a09`。

## 产品异常：SR-UI-008

原始断言为保存响应仍持有期间表单 `open=true`、`saving=true`（`tests/ui-flows.ts:88–89`）。首个模板通过真实 POST 创建成功，但响应尚未交回浏览器时，表单从用户草稿重置为默认“活动提醒”，保存按钮重新可用。

事实时间线（UTC）：

- 21:48:55.335：实际 POST `/api/sequences` 返回 200，被 QA 响应屏障持有；返回 ID `8deaba87-3ca6-4a21-99e2-1d6bceee16c3`。
- 21:48:55.412：点击关闭后 `open=true, saving=true`。
- trace `call@1813`：Escape，单调时钟 48598.645–48599.541 ms；随后 `call@1815` 等待两帧。
- 21:48:55.447：实际 GET `/api/sequences` 返回新建模板；单调时钟 48634.361 ms。
- 21:48:55.459：`open=true, saving=false`，随后断言失败。
- `final.png` 显示默认 JSON 替换用户草稿；`ui.ndjson` ordinal 5–9、`trace.zip`、`error.json` 保存上述原始证据。

没有证据可以只把因果归给 Escape；实时刷新与按键位于同一窗口。模板自动选择触发表单重建是待研发验证的机制推断。复测增加每个关闭动作前后的真实字段和 busy 状态证据，不改变验收标准、不通过预种模板隐藏空目录场景。

## QA 接入问题

1. 原生 label 包含 select 和 option，Playwright `getByLabel(..., exact:true)` 比较的完整文本包括子选项；实际控件存在。首批 UI011 trace 和 UI022 error.json 的真实 ariaSnapshot 证明该前提。所有涉及下拉框改为准确的 accessible combobox 名称，变量编辑框采用 textbox 名称。涵盖 UI009–018 及 Agent 运行目录相关场景。原始 FAIL/BLOCKED 保留，归因为 QA_DRIVER，不据此宣告产品缺陷。
2. UI027 的 `goto(oldUrl)` 是同一文档的 hash 导航；真实 trace 在 logout 后没有 refresh 请求。UI028 同样受此影响。冷启动入口改为明确 reload，URL保持不变。
3. 原 ui.ndjson 为带缩进对象串接，现改为真正单行 JSON，继续使用原脱敏方法。旧批证据不修改。

QA 工具自检共 9 项通过，含忠实原生 DOM 控件操作、保持上游响应原字节、未知响应不重试、嵌套弹窗、单行证据与真实文档刷新。UI025 的真实排他焦点无法建立仍属环境前提阻塞，不伪造 focus/visibility 事件。

复测重点：UI008 产品修复；UI009–018、UI020–029 修正驱动后的实际执行；UI025 根据可建立真实焦点的环境决定可执行子项。产品通过结论以新冻结版本的实际复测为准。

## DB001/002 测量前提的 QA 缺陷

两条原始 `354 !== 1000` 都在输入分布检查处发生，尚未调用消息分页 API。SQL 同时选择无别名的 `count(*)` 与 `count(DISTINCT sent_at)`，二者结果字段同名，node-postgres 后列覆盖前列。实际比较的是不同时间戳桶数和消息数。复测驱动给列独立名称，分别校验两组消息数量及总插入数，并在断言前保存 `timeline-seed-<count>.json`。预期数量保持原来的 1000/10000，不据此更改产品结论。

## 最终首批计数及归因规则

截至 2026-10-01 22:01:32 UTC，原始冻结批次完成 **112 项：52 PASS、10 FAIL、50 BLOCKED**，未重试，POL008 已结束。计数是运行器原始结果，包含材料审查和下述 QA 覆盖过度声明；不能直接称为“52 项完整产品业务通过”。旧 `result.json` 与错误、trace 不改写。最终汇总须单列原始状态、QA 归因、有效覆盖子项和复测去向。

### 必须保留的 QA 错误记录

以下 8 项原始 FAIL 均已找到 QA 原因，不能据此认定 8 个产品缺陷，也不能未经复测改成产品 PASS：

| 用例 | 原始状态 | 归因 | 原始错误证据 |
| --- | --- | --- | --- |
| SR-UI-017 | FAIL | QA_DRIVER：exact getByLabel 未定位已真实渲染的原生下拉框 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-017/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-017/result.json) |
| SR-UI-022 | FAIL | QA_DRIVER：exact getByLabel 未定位已真实渲染的原生下拉框 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-022/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-022/result.json) |
| SR-UI-024 | FAIL | QA_DRIVER：exact getByLabel 未定位已真实渲染的原生下拉框 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-024/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-024/result.json) |
| SR-UI-026 | FAIL | QA_DRIVER：exact getByLabel 未定位已真实渲染的原生下拉框 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-026/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-026/result.json) |
| SR-UI-028 | FAIL | QA_DRIVER：同文档 hash goto 未触发真正冷启动；trace 无第二轮 refresh | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-028/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-028/result.json) |
| SR-UI-029 | FAIL | QA_DRIVER：exact getByLabel 未定位已真实渲染的原生下拉框 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-029/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-029/result.json) |
| SR-BE-DB-001 | FAIL | QA_FIXTURE：两列 count 同名，分布行的时间戳桶数覆盖消息数 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-BE-DB-001/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-BE-DB-001/result.json) |
| SR-BE-DB-002 | FAIL | QA_FIXTURE：两列 count 同名，分布行的时间戳桶数覆盖消息数 | [error.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-BE-DB-002/error.json) · [result.json](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-BE-DB-002/result.json) |

同一定位缺陷还导致下列 12 项原始 BLOCKED：

- SR-UI-009：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-009/error.json)。
- SR-UI-010：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-010/error.json)。
- SR-UI-011：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-011/error.json)。
- SR-UI-012：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-012/error.json)。
- SR-UI-013：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-013/error.json)。
- SR-UI-014：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-014/error.json)。
- SR-UI-015：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-015/error.json)。
- SR-UI-016：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-016/error.json)。
- SR-UI-018：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-018/error.json)。
- SR-UI-020：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-020/error.json)。
- SR-UI-021：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-021/error.json)。
- SR-UI-023：[原始错误](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-023/error.json)。

另有 [UI027 原始 BLOCKED](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-027/error.json) 与 UI028 同为冷启动未真正刷新；修复代码不等于复测通过。

UI017、UI022、UI024、UI026、UI029 的 error.json 附实际 ariaSnapshot；UI011 的 trace 保存原生 label/select DOM。UI027/028 的 trace.network 分别证明 logout 后和 me 中止后没有真正新文档刷新请求。DB001/002 的 error.stack 均指向原 timeline-driver.ts:74 的输入分布检查，早于消息 API 测量。

### PASS 的实际覆盖边界

| 用例 | 本批实际证据支持 | 不能扩大声称的内容 / 未覆盖义务 |
| --- | --- | --- |
| UI001–004 | A/B/ABA/换群四种真实响应屏障；对应草稿值；一次浏览器 send；原群一次网关落地，另一群零落地 | 仅此批 Chromium、此版本和此有限观察，不代表所有 IME、系统焦点或长期无重发证明 |
| UI005 | 同一 admin 注销再登录形成新会话；旧响应释放后 B 保留；原群一次落地 | 采用“换会话”合法分支；没有创建第二个管理员账号，不称为已测所有账号切换组合 |
| UI006 | 真实数据库故障产生 HTTP500；B 保留、一次浏览器请求、网关零落地；final-browser 明确显示 INTERNAL_ERROR 及请求号 | 自动断言重点为草稿/次数；错误可见性由本次独立读原始 DOM 证据补充确认；不覆盖所有错误码 |
| UI007 | 真实 upstream202 已受理后浏览器响应被中止；B 保留，一次请求和一次远端落地；final-browser 显示 NETWORK_ERROR | 未把 202 当 sent；本例不替代后端未知副作用恢复专项，也不证明无限时间无重发 |
| UI019 | 真实群A→run→返回群A；记录的详情标题为“群组工作台 · Agent 运行详情”，高亮“群组工作台” | 不替代所有其他入口/刷新/历史/会话变体；它们各有独立用例 |
| DEL001 | 四份原报告 hash、文件级 diff、类别 impactMap 保留 | **QA_COVERAGE_OVERCLAIM**：首批缺逐条需求→实现/开发自测/独立QA证据/责任去向的完整核对。新驱动保留材料 PASS 子项，整体 BLOCKED，待映射核查 |
| DEL002 | 历史决定/真人/上线的隔离策略与原始 hash 保留 | 只是材料和报告边界审查；不关闭既有技术失败，不作真人通过，不增加产品功能分母 |
| DEL003 | 冻结候选、原文 hash、锁文件、干净状态、许可和离线/付费分层核查 | 只是当前执行准入的材料核查；没有实际付费模型调用或上线评估 |
| DEL004 | 干净候选 npm ci/build、QA自有环境迁移/启动、health schemaVersion9、账号/建群、QA cleanup | **QA_COVERAGE_OVERCLAIM**：首批未运行 README 的公开 dev:isolated 入口。新驱动补接独立公开入口和精确清理；未完成则只保留QA环境PASS子项，整体BLOCKED |
| DEL006 | 当前版本真实 BAD_JSON→审计通过send_message→结束，共3步；admin/viewer各自实际登录/进入群/进入run，逐字段和raw展开对照API；viewer管理按钮隐藏 | 属本批真实浏览器执行，不是历史框架存在性检查；只覆盖这组协议/工具样本，不等同所有四工具与审计错误组合 |
| MUT001–002 | 历史开发 baseline/错误副本 TAP、计数、同run/key身份、指定业务失败行和 source/patch/命令独立核查 | 材料审查 PASS；没有在当前 SUT 重新运行错误副本。清理是历史材料的明确记录，不是本轮制造或清理的副本；不能证明可检出所有错误实现 |
| MUT003 | 当前代码在同一 transaction 回调内 await 协作入口；工程命令接入有限SQL扫描；正常/受控违规历史日志可核查 | 静态交付审查，不证明动态SQL全覆盖或业务原子性；原子性由其他真实故障用例验收 |
| DB003 | 两条冻结cursor链都83个既有身份；追加新/旧时间消息后旧链集合与已观测同毫秒顺序不变，fresh集合85 | 允许实际 API refresh 合并，不声称浏览器实时合并也由本例测完；不强制id排序 |
| DB004 | own消息原先在续页；真实确认越过marker；实际重读旧cursor；新快照重新排序；同确认重复事件后身份唯一 | 重复事件只作500ms有限观察；不额外要求整个消息对象状态冻结或永久cursor有效 |
| DB005 | 同版本重启前后两条cursor链保持集合/顺序 | **QA_COVERAGE_OVERCLAIM（独立会话子项）**：首批两条链共用一个登录会话。新驱动分别登录两PlatformClient后建链/读链并记录会话标签。没有跨版本cursor有效性承诺，跨版本回滚条件项为不适用，不凭空新增BLOCKED |

以上每项均以 `/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/<case-id>/` 下的 `result.json`、UI `ui.ndjson`/`trace.zip`，或 `delivery-evidence.json`、`timeline-fixed-set.json`、`timeline-confirmation.json` 为原始证据。UI002/005/006/007 trace 的最后完整 textarea 节点均保留值 B，且没有 disabled/readonly 属性；没有将输入法或原生系统焦点签为通过。

### 人工边界与最后预算专项

- [UI025](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-UI-025/result.json) 仍为 BLOCKED：没有建立真实排他标签焦点。不能通过脚本伪造 focus/visibility 事件或“运行无异常”补成人工签字。其余 UI 的 `case-complete.humanImeFocusSigned` 均明确为 false。
- [POL008](/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T21-48-07.275Z-4e425702/cases/SR-BE-POL-008/result.json) 最后真实完成，no-cancel 和 cancel-requested 两个变体各有原始证据：无取消时终态 failed/wall_clock，取消时 cancelled/cancelled；两者 POLICY_DENIED 结果落盘且 postResult 网关请求/副作用为空。约119.9秒总耗时是本批观察事实，不是新设产品 SLA。
- DEL005 本轮仍缺支持升级路径、旧schema/媒体/会话保留、foreign哨兵及本例完整清理关联证据。不能用 DEL004 当前新库启动或其他媒体/provider片段拼成整条 PASS。

## 新驱动收尾

本次修正新增公开 README 入口驱动，仅调用公开 npm 命令，不导入产品模块或开发辅助。审计过的脚本 SHA256 固定为 `ac868241c41087013ceff48123f6454325f1997fa40b63f3a284149a13b2ca86`；变化时先阻塞复审。它只使用 QA `.runtime` 内的 TMPDIR、随机资源、当前实际归属标签，独立核对服务端口/PID/启动身份、公开HTTP以及退出后的容器/卷/目录；没有 compose/down/prune。次轮产品执行由根运行器冻结后发起，本次准备阶段没有自行运行被测工程。UI与timeline/delivery自身测试共15项通过，全二轮TypeScript检查通过。
