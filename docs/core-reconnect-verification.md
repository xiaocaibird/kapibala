# 当前候选 B4 浏览器重连补证

**最终候选补证：** `2318a11`已重新执行本页同一真实REST/WS+DOM脚本，165行/4页在断线、一次503、重复旧帧及迟到历史后自动恢复，传输可用至稳定呈现454.37ms，误差界1.68ms；见[最终JSON](evidence/core-reconnect-browser-2026-09-30T22-47-41-185Z.json)及[本轮收口](core-verification-closeout.md)。下方三次早期运行保持其原版本，不替换或累加。仍限定process注入、后台关闭与有限规模，不冒充SSE全链路或长期容量。

2026-10-01（北京时间）。原始要求：[B4 L312](original-interview-question.md#b4-断线补齐与-agent-步骤详情)：“前端断线期间发生的事件，重连后 3 秒内出现在页面上，且不重复。”关联 **CG-18 / CG-12、IR-01/R04、AR-03**；范围为本次有限规模的前端断线补齐与页面呈现，不覆盖 B4 的 Agent 步骤详情。

本次补齐了当前产品候选的 **3 秒 DOM 呈现证据**，没有修产品代码，也没有填写人工验收通过。历史[第二轮浏览器记录](evidence/core-round-two-timeline-browser.json)的“624ms 仅接口完成、DOM 计时不足”保持原结论，不能回填为当时已通过。

## 版本与结果

分支 `agent/core-reconnect-verification` 从 `0cdad82` 开始；全部运行的 `apps` / `packages` 树与 `48adfd9` 一致。本次只增加独立 harness 与证据文件。

- `apps` 树：`227a3d3a500ecd76c280142431bf99daa97a5c3b`。
- `packages` 树：`7a0779814b5353928913f32eb2cc961998c99b21`。
- `npm run build` 通过，包括服务端及前端 TypeScript 检查与 Vite 生产构建。
- 实际运行 `apps/web/dist`，JS 为 `index-vDlW4rvq.js`，SHA-256 `d2bc85add3d7aaab78d067ec83b999faaf7f17ffa699ce9d2d41070aa5864d47`。JSON 同时保留源码提交、harness 哈希、CSS/JS 哈希、浏览器版本、随机端口。

| 运行 / harness 提交 | 可用→WS 认证 | WS 认证→DOM 完成 | 可用→DOM 完成 | 时钟保守界 | 结果与原始证据 |
| --- | ---: | ---: | ---: | ---: | --- |
| 首轮 `34fb1b1` | 4.32ms | 368.80ms | **373.12ms** | 0.80ms | [JSON](evidence/core-reconnect-browser-2026-09-30T21-56-01-127Z.json) / [截图](evidence/core-reconnect-browser-2026-09-30T21-56-01-127Z.png) |
| 加强身份/视口断言 `dfc887c` | 70.94ms | 369.30ms | **440.24ms** | 0.94ms | [JSON](evidence/core-reconnect-browser-2026-09-30T21-57-36-579Z.json) / [截图](evidence/core-reconnect-browser-2026-09-30T21-57-36-579Z.png) |
| 最终 WS 断线/补发断言 `9189a55` | 89.69ms | 367.70ms | **457.39ms** | 0.84ms | [JSON](evidence/core-reconnect-browser-2026-09-30T21-58-26-805Z.json) / [截图](evidence/core-reconnect-browser-2026-09-30T21-58-26-805Z.png) |

三次均首次运行即通过，各自文件保留，未覆盖旧结果或修改 3000ms 阈值。最终成功条件使用“可用→DOM + 时钟保守界 ≤ 3000ms”；从恢复可用开始计时，比从 WS 认证完成开始更早。每次完整恢复快照均为 **50 + 50 + 50 + 15 = 165 条，4 页**，页面异常为 0，清理异常为 0。

## 场景及观察点

[独立脚本](../scripts/verify-core-reconnect-browser.mjs)复用 `temporaryDatabase`，在首次创建数据库之前注册清理，并使用独立 Chromium 上下文。实际 API、真实鉴权 WS 与生产 React 前端均启动在随机本地端口；开发演示库、浏览器及端口未使用。

1. 创建 160 条初始消息，真实登录并等待完整时间线呈现。
2. 断开现有 WS（1012），随后在夹具边界对浏览器 REST 和新 WS 握手返回 503，页面实际显示“连接恢复中”，并观察到拒绝的重连握手。
3. 在断线期间通过生产 `GatewayEvents.process` 写入 3 条新消息和 2 条迟到历史消息。其中一条早于全部初始消息，另一条与已有消息同时间，检查时间和 ID 的排序。再重复提交同一网关 eventId，以及同 msgId 的新 eventId，保持总数 165。
4. 通过真实鉴权的 PATCH 路由把群“允许自动移除成员”从关改为开，形成 `group_changed` 事件。
5. 恢复浏览器 REST/WS 可用；恢复后的第一条时间线 GET 单独返回一次 503。重连认证后额外补投 3 个既有持久事件各两次；正式 WS 流同时按 `sinceSeq=160` 补发新序号 161–166。
6. 页面自行重连、读取失败后自行退避重试，完整读取四页。恢复阶段不刷新、不导航、不点击重试、不派发 focus/online 事件。

最终两轮含三个发送身份（两个外部身份和一个自有服务账号）；浏览器核对全部 165 行的内部 ID、网关 msgId、正文、发送身份、`own` 标记、时间及顺序，与数据库完整投影逐行一致。新增三条消息及开启后的开关还必须完整落在视口/时间线可视区域内；全部历史行必须有实际布局尺寸。历史消息可在滚动区内，未要求 165 行同时出现在同一屏。

最终轮明确断言浏览器实际收到 6 个旧序号帧及 161–166 六个新帧，ID 集合仍为 165 个；DOM 完成后再观察 700ms，内容与顺序继续一致。最终结果没有依赖人工点击页面“刷新并查看更新”。该按钮仍可能保留为已交付提醒功能的用户确认入口。

## 时间定义与证据界限

- **恢复可用时间**：Node 在解除夹具 REST/WS 阻断前立即记录 `performance.timeOrigin + performance.now()`，未等待下一次连接成功才开始计时。
- **认证时间**：浏览器收到真实 WS `{ type: 'auth', success: true }` 帧的时间，来自只观察消息的 WebSocket 包装器；发送/关闭/事件处理仍由原生 WebSocket 执行。
- **DOM 完成时间**：浏览器 MutationObserver 发现所有正文、身份、顺序、群状态、连接状态和同步结束标记符合预期，再经过两次 `requestAnimationFrame` 并重新确认。没有把 REST 响应结束或 Playwright 后续查询返回时间当成 DOM 完成。双帧表示布局与绘制机会，未声称测量屏幕像素发光时刻。
- Node/Chromium 在同一主机，记录一次浏览器时间读取的前后 Node 时间，使用最大差值作为保守时钟界；截图用于事后视图复核，计时来源是页面内观察器。
- 原始 JSON 包含请求开始/完成、故障种类、各页快照与数量、WS 认证/事件、浏览器 DOM 投影、夹具预期、清理结果和可捕获的代理错误日志。前两轮关闭故障 WS 时终端出现 Vite `EPIPE`；第二轮两条也在 `proxyLogs` 留存，最终轮无此日志，三轮均无 `pageerror`。

这证明当前候选在该本机有限数据量和指定故障组合下满足页面 3 秒补齐要求。**不证明任意消息量/并发量/网速的 SLA，也不是网关 SSE 网络断线重放验收**：网关入口直接调用生产事件处理器，未经过 SSE 解析与远程模拟器；真实验证的是随后数据库→REST/WS→生产页面的恢复链。后台 worker 关闭，不把该结果计为调度器、外部写接口幂等或全系统断网证据。上述更大范围仍需独立场景与边界，不影响本项有限规模结论。

## 重跑与清理

先使用已安装项目依赖运行 `npm run build`，再执行：

```sh
DATABASE_URL='<专用临时 PostgreSQL 连接>' \
PLAYWRIGHT_MODULE='<本机 playwright/index.mjs 绝对路径>' \
CHROMIUM_EXECUTABLE='<独立测试 Chromium 可执行文件绝对路径>' \
./node_modules/.bin/tsx scripts/verify-core-reconnect-browser.mjs
```

`PLAYWRIGHT_MODULE` 可省略以使用项目可解析的 `playwright`；`CHROMIUM_EXECUTABLE` 可省略以使用 Playwright 管理的浏览器。脚本要求显式数据库连接并拒绝演示 PG 55432；连接只作为建库凭据，迁移和夹具写入均在新 UUID 数据库进行。本批专用 PG 为 64550，输出中的 API/浏览器服务端口均随机。

每次使用新的时间戳输出 `docs/evidence/core-reconnect-browser-*.json/.png`。失败仍写 JSON 和失败截图，返回非零退出码；不会调高阈值。三次已使用的 UUID 数据库在脚本清理后另行查询 `pg_database`，剩余记录为 0。未停止共享专用 PG 容器。
