# 第二轮执行中的修复与未闭合项

**最新交接：** 媒体 NUL 修复的固定开发回归已完成（24 PASS / 0 FAIL / 0 SKIP），组合构建通过。第四批待最终 main 冻结后执行；本次复测结束后直接出报告，仍未通过则暂停继续修复和再测。详见[第四批候选交接](second-round-fourth-candidate-20261002.md)。下方批次与处理历史按各自时点保留。

2026-10-02。本文记录研发对独立 QA 实测的处理，不替代 QA 自行维护的报告、用例及原始证据。初始被测产品为 `5906d8d6b230699fec4a51302677a79c409cac46`；首批 QA 工具源为 `87f5aea2519554616301f403643020b46e1d8a09`。新修复按新的固定提交复测，首次失败和阻塞保留。

**当前阶段：第三批已结束，SUT / QA 均为 `ed50ca14ae3f4140d7f020f282b313b137920209`，run `2026-10-01T23-12-22.471Z-739fbbec`，112 项为 96 PASS / 6 FAIL / 10 BLOCKED / 0 NOT_RUN，`runnerErrors=[]`。第四批尚未开始，待下一候选完成组合验证并固定 main 后由 QA 执行。** 第二批 `47423c1` 的 80 PASS / 4 FAIL / 28 BLOCKED 保留；UI008、DIA005 在第二、三批均 PASS，GRD003 在第三批独立复验 PASS。媒体 raw NUL 入站保存失败正在修复，用量关闭和 run-lock 观察已完成开发验证，第三批结果不继承到第四批。

## 既有问题处理与已完成批次

| 项目 | 已核实事实 | 当前处理与判定边界 |
| --- | --- | --- |
| SR-UI-008：序列创建保存中重置 | 真实创建请求的成功响应仍被持有时，实时列表读取到了新模板，弹窗继续显示但输入回默认值、保存状态解除。`PageAttentionScope` 的群/序列 key 变化会卸载内部创建表单；不能单凭同一时段按了 Escape 就归因为 Escape | 已修复表单生命周期，开发真实浏览器修前 3 FAIL / 1 PASS、修后 4 PASS；前端 134 PASS / 1 既有 SKIP。详见[修复与原始证据](second-round-sequence-save-guard-20261002.md)，QA 在固定 `47423c1` 第二批独立复验为 PASS；第三批另行独立复验亦为 PASS，不能外推第四批结果 |
| SR-BE-DIA-005：同实例多模块故障观察 | 初始工程控制器拒绝同实例第二条模块租约，无法用同进程双故障证明模块独立恢复 | 已补工程入口 `module-tick-independent`；同实例专项修前 2 FAIL、修后 2 PASS，相关 22 PASS。见[接入及证据](qa-multimodule-observation-20261002.md)；生产逻辑不变；QA 在固定 `47423c1` 第二批及 `ed50ca14` 第三批均独立复验 PASS |
| SR-C2-012：模型服务硬崩溃后的目录锁 | QA 在原进程被强制终止后启动同目录服务，得到 `SESSION_DIRECTORY_LOCKED`，未达到后续原运行恢复检查 | 保留原 FAIL；当前元数据不足以安全自动接管。下文记录可行改进方向及未决边界，不擅自清锁、不盲重发未知轮次 |
| 部分页面控件定位 | QA 已将若干 label/combobox 定位失败归为执行器适配问题 | QA 独立维护适配，研发不修改 QA 文件；修正后以新运行记录复测，不改写首次结果 |

## 前序修复与接入记录（保留当时阶段）

两项候选已组合到研发集成提交 `27a714b`，组合后的 `npm run build`（含类型与边界检查）、原始来源校验及差异空白检查通过，没有修改 `qa-acceptance/`。专项证据各自保留原固定候选；此处没有把专项相加为完整回归或 QA 结论。

QA 首次全范围运行 `2026-10-01T21-48-07.275Z-4e425702` 已结束，原始汇总为 52 PASS / 10 FAIL / 50 BLOCKED / 0 NOT_RUN，112 条。QA 将其中 8 个原始失败归因于其定位、启动或测量适配，原结果保留；这些不能算作 8 个新增产品缺陷。其余缺少故障窗口或执行接线的项目继续按责任补齐。QA 报告及复测汇总以其独立签发结果为准。

QA 另提出用量写队列/工厂模式、媒体引用与清理竞争、出站行为记录三组工程接入补证。已完成实现与开发专项，自测边界如下；均限于显式工程入口，不增加外部协议能力，不读取真实凭据，不替代 QA 独立执行。

| 补证入口 | 开发验证及用途 | 保留边界 |
| --- | --- | --- |
| [媒体引用与清理](qa-media-reference-observation-20261002.md) | 最终真实进程 3 PASS；关联 31 PASS。核对真实事务锁、未提交/已提交引用、清理认领，以及真实未知工具结果跨强杀重启 | 初测 fixture 的失败保留；不把未观测事件当作业务未发生。原未知结果仍保守暂停 |
| [用量与 provider transport](qa-usage-observation-20261002.md) | 31 PASS，涵盖真实队列门、141 次离线调用中的 76 次容量拒绝、65 条持久结果、factory 真省略、TTL、退出/强杀 | telemetry 可丢弃；仅 provider transport；signal 不等于远端取消，强杀缺尾；不使用付费模型 |
| [Node 有限出口观察](qa-egress-observation-20261002.md) | 固定候选 12 组通过，真实 HTTP/fetch/socket、keep-alive、TLS、PG、代理和 tsx 路径 | 仅 Node 24.21.0 / undici 7.29.1 指定钩子；tsx 原始账本含 3 次 denied，部分退出仍有 active 身份；通过不等于零尝试或所有资源结清 |

组合源码 `1e1ce57` 的 build（含类型与边界）与原始来源校验通过；后续 `9324465` 只补出口边界文档。用量源码/证据和出口证据共 32 个哈希核对一致，媒体证据在前一步已核对。此组合没有改 QA 资产；专项不加总为一次完整回归。QA 当前全量批仍固定在 `47423c1`，新增入口应使用后续固定主分支提交建立新批记录。

QA 当前批新增报告 SR-BE-GRD-003：同一运行重复工具请求的 key 在已有消息 queued 时仍返回 SEND_TIMEOUT，没有当前 clientMsgId/deliveryStatus。已按 A5.7 修复新重复工具的当前状态读取，原 executing 步骤恢复仍沿用首次等待。固定开发候选 `c80ef0c` 修前真实 429 场景为 FAIL；修后新增 7 PASS，关联 79 PASS / 0 FAIL / 3 原 SKIP。见[修复与证据](agent-idempotency-status-fix-20261002.md)。集成 `bc977f3` 仅叠加已验证的媒体观察入口，组合 build/typecheck/boundaries/original 通过；候选源码与原始证据哈希已核对。QA 需在新固定版本独立复测，不以单次派发/审计已受保护就代替返回契约判断。另 C1-009 的过早清理判定，QA 已确认属于等待 next_attempt_at 的测试器边界，由 QA 独立修正，不能归为产品删除失败。

## SR-C2-012 的限制、成本与后续取舍

当前 `apps/gemini-agent/src/sessions.ts` 的 `owner.lock` 仅保存 PID、随机 nonce 和创建时间，启动通过 `O_EXCL` 独占创建；已有锁一律拒绝。原 `docs/c2-gemini-agent.md` 和 D047 已披露硬崩溃后需人工核实原进程及目录归属，但 **D047 明确这不是负责人已批准的恢复豁免**。不能把已披露、已接受和测试通过混为一项。

只检查本机 PID 不存在再删除锁不足以证明安全：锁中没有同机器、同启动周期或同进程实例的可靠身份，共享目录可能仍有其他主机使用；读取身份后再删除路径还存在竞争接管和文件替换窗口。因此本轮不使用自动删除、超时抢锁或人工清锁后重跑来掩盖首次失败。

有价值的后续方向是明确限定本机文件系统及进程命名空间，采用进程退出即释放的互斥机制，或增加可信 owner 身份并实现可验证的竞争接管；同时验证 PID 复用、多个服务争用、硬崩溃、目录替换和旧格式迁移。旧格式身份不足时仍应保守拒绝自动接管。该改动涉及平台兼容与故障验证，不能视为加一次 PID 查询即可完成的局部补丁。

锁恢复的有限收益是恢复服务可用性、读取已完成的会话缓存，以及处理其他运行。对于已持久保存为 `pending`、但远端模型结果尚未可靠保存的轮次，现有接口仍返回 `TURN_OUTCOME_UNCERTAIN`；本地锁改进不能查回远端原响应，不能据此承诺原运行必然完成。本轮不新增外部协议能力的决定继续有效。

QA 此次 SR-C2-012 在“服务能否重启”断言处失败，不能将后续原运行完成、工具不重复等尚未执行的断言说成已验证。该限制及是否另行投入安全本地自动接管，留在最终需要负责人判断的清单；其他已授权修复和可运行用例继续执行。

## 历史范围保持

第一轮第 1 项五秒边界及第 8 项真人体验继续保留，当前第二轮不重新判定；第 2–7 项按既有处理方向和原证据保留。第二轮实测不能自动豁免 C2 新发现的本地锁限制，也不代替真实提供方或真人操作的证据。本轮不切换演示环境、不发布、不推送远端。

## 第二批已执行结果

QA 固定 `47423c165f74d8b8908297974f7df71bc53b470d` 的 [2026-10-01T22-25-01.466Z-7951d02e 原报告](../qa-acceptance/reports/acceptance/20261002-second-round/batches/2026-10-01T22-25-01.466Z-7951d02e/report.md)已归档：80 PASS / 4 FAIL / 28 BLOCKED / 0 NOT_RUN。UI008、DIA005 已独立通过。四项原始失败中，C1-009 为清理重试期限之前过早断言，UI021 为导航提交之前读标题；两者由 QA 修正执行器并保留原结果。GRD003 是本次产品修复，C2-012 保留目录锁限制。新增三组工程入口、迁移等夹具和交付追踪仍待后续独立复测；本摘要不替代 QA 归档报告，不把各批通过项机械相加。

归档中的 [manifest](../qa-acceptance/reports/acceptance/20261002-second-round/batches/2026-10-01T22-25-01.466Z-7951d02e/manifest.json)与 [results](../qa-acceptance/reports/acceptance/20261002-second-round/batches/2026-10-01T22-25-01.466Z-7951d02e/results.json)固定 SUT / QA 均为 47423c1；逐例原始文件由 [evidence-index](../qa-acceptance/reports/acceptance/20261002-second-round/batches/2026-10-01T22-25-01.466Z-7951d02e/evidence-index.json)和 [evidence.tar.gz](../qa-acceptance/reports/acceptance/20261002-second-round/batches/2026-10-01T22-25-01.466Z-7951d02e/evidence.tar.gz)保留。以上仅是第二批历史证据；第三批的实际 run 和结果另见下节，不以第二批结果代填。


## 第三批已执行结果与下一批准备

QA 第三批固定 SUT / QA `ed50ca14ae3f4140d7f020f282b313b137920209`，run `2026-10-01T23-12-22.471Z-739fbbec`：112 项，96 PASS / 6 FAIL / 10 BLOCKED / 0 NOT_RUN，整体结论 FAIL，`runnerErrors=[]`。直接依据独立 QA 工作树的 [manifest](/Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T23-12-22.471Z-739fbbec/manifest.json)、[results](/Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T23-12-22.471Z-739fbbec/results.json)及 [原报告](/Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T23-12-22.471Z-739fbbec/report.md)。这些链接是该次原运行位置，不冒充已合 main 的最终归档地址；归档仍由 QA 维护。

六项原 FAIL 为 SR-C1-003、SR-C1-013、SR-C2-012、SR-C2-019、SR-BE-DIA-004、SR-BE-POL-005，保留该批原结果及子项证据；失败标签不自动等同产品归因。GRD003、UI008、DIA005 在该批独立 PASS；不拼接各批或把这些通过传播到新候选。

| 当前研发处理 | 已有材料与剩余边界 |
| --- | --- |
| C1 非法来源路径 | [规范化前检查修复与开发证据](second-round-media-source-normalization-20261002.md)已交付；另 raw NUL 已经真实 SSE / PG 复现为 `22P05` 并导致整个入站事务回滚，媒体线仍在修复，独立修复证据待补；不能称 C1-003 全部闭环 |
| C2 用量关闭观察 | [真实 writer 关闭接入与开发证据](qa-usage-writer-close-20261002.md)已完成；新入口待后续固定批次独立验证，不改写 C2-015 / C2-019 原结果 |
| POL005 同运行竞争观察 | [真实 run-lock 观察与开发证据](qa-agent-ownership-witness-20261002.md)已完成，区分 lock_busy / capacity_unavailable；QA 仍须在 primary 实际持锁窗口安排 secondary。只补观察缺口，不关闭未知效果强恢复 FAIL |

下一候选需完成组合验证、本地合 main 及固定身份后，才进入第四批独立执行；当前没有第四批结果。第一轮 1/8 留后处理、2–7 既定恢复/协议方向、C2-012 的 D047 披露不构成豁免、真实提供方新费用/凭据需另行授权等边界继续有效，不重复要求已经批准的范围决定。
