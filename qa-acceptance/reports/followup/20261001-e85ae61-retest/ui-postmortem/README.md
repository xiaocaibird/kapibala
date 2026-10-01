# ARC-UI-015 原始阻塞与 QA 连续性修正

2026-10-01；只读原始证据分析，另行修订后续 QA 源。没有启动产品、浏览器或数据库，没有修改首轮原始结果。首轮 `2026-10-01T12-31-30.250Z-1384f257` 的 **ARC-UI-015 仍为 BLOCKED**；UI-032 仍因公开前提不可达而 BLOCKED，本修正不改变它。

## 归因与可核实事实

原通用错误文本列出 document、URL、导航、WS、scope；实际账本只有 `scopeReady: 2 → 3`。全部 document 身份比较为 true，URL 始终为 `/#/sequences`，导航计数始终 2，socket 计数始终 1，认证次数 1；trace 仅有进入页面时的一次 document 请求和一个 WS 连接。不是观察到整页重建，也没有错配新旧 socket 的证据。

同一 trace 时钟中，操作与控制帧顺序为：

| 事实 | trace 毫秒 | 证据定位 |
| --- | ---: | --- |
| 真实重试按钮 click 开始 | 9329.802 | `1-trace.trace:176` |
| 第五次 GET `/api/sequences` 开始，返回 200 | 9362.935 | `1-trace.network:17` |
| 该读取完成（开始 + HAR 总耗时 4.423） | 9367.358 | 同上，send/wait/receive 均已保存 |
| 浏览器发出 `scope_marker` | 9380.928 | `1-trace.trace:197` |
| 服务端返回匹配 `scope_ready` | 9390.089 | `1-trace.trace:208` |

marker 与 ready 的 requestId 同为 `1e692cff-f5d2-4cdf-a926-46c1028e666b`，`startSeq:1` 与动作前水位相同。它们经 QA 的 WS 转发记录被真实观察，不是 QA 手工制造帧。新增 marker **晚于本次成功读取**，不能作为这次 GET 发起或成功的原因。QA worker 自身时钟也记录 GET 9028.573667、200 响应 9042.457667、ready 9054.941667；这组时钟单独比较，不与 trace 时间相减。

四次 503 后确实停止重试，存在唯一、可见、可用的同页“重试”按钮。操作后只有一次 GET，响应含预置序列 `409edaff-67c6-476c-91d3-b2e96733924d`。无新业务事件、无再次认证或 WS 变化。最终截图实际显示“QA恢复目标 · 1 步”和 `{event_1}`，错误区域已消失。

但原脚本在 `refresh-response:after` 被通用连续性判断中止；后续 `sequence-presented` 断言以及 **成功后完整 3000ms 请求稳定窗口没有执行**。截图和事后解析不能代替这两项，也不将原 BLOCKED 回填成 PASS。

## 依据、限制与最小修正

- `ENG-READ-01`、`docs/architecture-quality-closeout.md:19–20` 要求耗尽后可由新的显式操作启动一轮有界读取；本场景须证明真实同页操作及成功呈现，不要求产品内部 controller 身份永不改变。
- `docs/page-update-notification-proposal.md:162` 明确 marker 是无持久化控制握手，不改变全局事件传输。单独新增一次 ready 不能证明文档重载或重新读取是由该握手触发。
- 原始公开帧只提供 requestId / startSeq，不包含当前业务资源 ID。因此不能据此声称完整证明内部 scope 身份或提醒语义均正确；本次只修正“后置握手被当作读取恢复原因”的 QA 前提。真实响应、最终 UI 与操作顺序共同提供这一场景所需证据。

修订仅供新冻结运行使用：ARC-UI-015 预先监听真实 `response` 事件，绑定由路由实际观察的同一个 `Request`，记录该 GET 开始与 200 响应的单调时间。被动监听 `framesent` 的真实 marker 和收到的 ready，保留 socket 代次、requestId、startSeq、时间。只有 **成功响应之后发出的唯一 marker、同一 socket、同一水位及匹配身份的 ready** 可解释为读取成功后的范围同步。请求或响应前 marker、无匹配 ready、身份/水位变化、多重握手、文档/导航/连接变化仍阻塞；最后边界必须已收到真实 ack。

document、URL、导航、WS、认证、无外来业务事件以及原始响应内容、序列选中值、请求数稳定断言全部保留。其他用例不传该窄模式，继续执行默认严格连续性检查；尤其 UI-032 不获放行。明确成立的业务 FAIL 仍先于后来出现的连续性 BLOCKED。无直接 fetch、无内部状态读写、无整页刷新、无伪造 marker。

## 文件与校验

QA 源仅修改 `tests/ui/architecture.spec.ts` 的 ARC-UI-015 及类型引入、`tests/ui/page-continuity.ts` 和 `tests/self/page-continuity.test.ts`。工具自测 **15/15 PASS**；`tsc --noEmit`、`git diff --check` 通过。覆盖响应前 marker、不同身份/水位、重复/缺失握手、未完成 ack、重连/文档/导航变化、默认严格路径、原始业务失败优先，以及被动监听器清理。独立只读 peer review 后，额外修正旧 helper 对动作窗口内旧 socket 迟到 ready 仅记录、不阻塞的遗漏：现将 staleScopeReady 计数纳入全部连续性模式，旧帧仍不能建立当前 scope，也不能在动作窗口中被静默忽略；新增 strict 和窄模式共同拒绝该反例的自测。产品修订后测试尚未在本文阶段执行。

原始证据摘要与逐文件哈希见 [analysis.json](analysis.json)。[analyze.py](analyze.py) 只读取已保存文件，以排他写入生成新分析；重复分析须提供新的输出目录。首次解析发现 trace 的非发送 WebSocketRoute 记录没有 message 字段，已限定为实际 sendToServer/sendToPage 后完成；未写入或覆盖任何原始文件。脚本自身校验值见 [analysis-script.sha256](analysis-script.sha256)。
