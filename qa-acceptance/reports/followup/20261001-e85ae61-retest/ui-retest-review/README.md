# ARC-UI-015 复测证据独立复核

2026-10-01。只读检查已保存的原始 JSON、截图、执行记录与冻结 QA 源；没有操作产品、启动浏览器/数据库或修改源码。只在本目录新建复核材料。

**结论：本次冻结 Chromium 复测的 ARC-UI-015 PASS 有实际证据支持。** 原首轮 `2026-10-01T12-31-30.250Z-1384f257` 的 BLOCKED 原样保留，没有回填或覆盖。本条通过不外推为全部业务验收或上线通过，也不改变 UI-032 的独立阻塞。

## 版本与执行边界

| 项目 | 实际值 |
| --- | --- |
| 新运行 | `2026-10-01T12-46-08.250Z-9b50fc8a` |
| 阶段 / 浏览器 | `developer-preflight` / Chromium |
| QA | `526d814db45d15896f96563e7a2a8b8f75064f81` |
| SUT | `e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb` |
| 开始 / 时长 | `2026-10-01T12:47:05.802Z` / 10595ms |
| 原始执行 | 一次 `passed`，retry=0，errors=[] |
| 独立预置序列 | `ebc362a5-d14b-41f1-8746-507177883438` |

预置来自公开 POST `/api/sequences`，qaRequestId=`17b8e631-f865-4dd0-9d86-31d4ba532e3c`，真实 200 返回上述身份；后续浏览器读取响应及已执行的选中值断言使用同一身份。复核的 `architecture.spec.ts`、`page-continuity.ts`、`playwright.config.ts` 与冻结 QA 提交逐字节一致。

## 实际结果

以下时间均为 **同一 QA worker 的 performance.now 毫秒**，不与 wallclock、trace 或其他进程时钟混算。

| 检查 | 原始证据 |
| --- | --- |
| 四次失败耗尽 | 读取开始为 3595.833250、3851.635750、4354.506917、5359.259959；实际响应状态依次 503、503、503、503 |
| 耗尽后没有自行继续请求 | 第四次 503 响应 5361.255125；操作前 document 基线 8512.423750，间隔 3151.168625ms；此期间读取数维持 4 |
| 真实公开入口 | `refreshPremise={count:1, visible:true, enabled:true}`；冻结用例实际执行错误 requestId 所在区域的“重试” click，没有直接 fetch 或整页重载替代 |
| 手动恢复请求 | 第五次也是最后一次 GET 于 8543.136125 开始；绑定同一实际 Request 的 200 响应回调为 8558.396500 |
| 响应身份 / 呈现 | 返回 `QA恢复目标` 及预置 ID；`refresh-response` 与 `sequence-presented` 断言均已实际执行且成功；最终截图显示 `QA恢复目标 · 1 步`、`{event_1}`，visibleErrors=[] |
| 后置 marker | 8563.277667，同一 `socketId:1`，requestId=`add8bde5-9df8-4178-84b2-dfbf42b7b52d`；比成功响应晚 4.881167ms |
| 精确 ack | 8567.636542，socketId 和 requestId 与 marker 相同，`startSeq:1` 与动作前相同；marker 后 4.358875ms；无第二个后置 marker/ack |
| 页面连续性 | 119 次检查的 sameDocument 均 true；URL 始终 `http://127.0.0.1:56846/#/sequences`；navigations=2、socketChanges=1、scopeEstablished=true 不变，staleScopeReady=0 |
| 认证 / 外来触发 | authentications=1、socketChanges=1；唯一业务事件是预置序列的 created，时间 3015.955042，早于入序列页面及首个失败读取；此后无新业务事件 |
| 完整稳定窗口 | 55 次 `stable-request-count` 断言；首个前边界 8572.819750，最后后边界 11634.037334，跨度 **3061.217584ms**；请求总数始终 5 |
| 最后边界 | `post-response-scope-settled` 已执行成功，requireReady=true；无 primary/error/boundaryErrors；最后边界 11642.495959，比成功响应晚 3084.099459ms |
| 清理 | `cleanup.json` failures=[]，完成时间 `2026-10-01T12:47:17.427Z` |

账本共 58 项成功断言：响应 1、真实选中值 1、稳定请求数 55、最终 scope 完成 1。与首轮相比，本次确实执行了此前被连续性判断中断的呈现和完整稳定窗口，不是仅凭最终截图改判。

## 结论限制与可复核性

Document 身份稳定不表示页面所有 DOM 节点或内部 controller 未变化；资源呈现本来需要更新 DOM。真实 socket/requestId/startSeq 证明本次后置控制握手归属，没有假定公开帧包含内部业务 scope 身份。3000ms 是沿用版本化 QA profile 的有限观察窗口，不扩成无限期无重试保证。

成功用例采用冻结配置 `trace: retain-on-failure`，本次没有保留 trace.zip；复核依据为实际运行 JSON、被动 HTTP/WS/连续性账本、截图、零重试结果及匹配的冻结执行代码。没有为通过结果补造 trace 或操作记录。

[analysis.json](analysis.json) 保存提取值、来源及 **10 个原始文件 SHA-256**；[analyze.py](analyze.py) 可在内存中独立重算状态、身份、帧顺序、窗口长度和前后哈希一致性。脚本只读已有文件，输出采用排他创建；复现时须指定新的输出目录，不能覆盖本次分析。脚本自身哈希见 [analysis-script.sha256](analysis-script.sha256)。
