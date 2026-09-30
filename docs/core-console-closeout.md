# 核心控制台有限补证记录

本轮对应 CG-01、CG-02、CG-12、CG-17、CG-18、CG-19；来源为 [核心要求缺口复核](core-requirements-gap-review.md) 与 [原始需求](original-interview-question.md)。本记录区分源码修复、自动验证、实际浏览器观察及用户验收，不把隔离开发验证计为用户人工签收。没有实施 C3 完整浏览器回归扩展。

## 当前状态

| 编号 | 处理与依据 | 开发验证 | 用户验收 |
|---|---|---|---|
| CG-01 | Timeline 已选发送身份失效后保留账号与草稿，禁发并提示明确重选；初始仍默认首个可用身份；`rate_limited` 仍可提交原账号队列 | 修前复现账号从 account-2 变为 account-1；隐藏页确认断开后仍选 2、草稿保留、禁发且零写；明确改 3 后唯一 sent；原 2 限流 queued→解除后同一行 sent | 待验 |
| CG-02 | SequenceProgress 按步骤状态显示确认发出、跳过或失败处理时间；pending/accepted 不把时间当作已发送证据 | 修前 failed 实际渲染“实际发出”；实际时间组件覆盖全部五种状态通过；隐藏页另核对 sent/failed/pending，失败处理时间及未确认提示与接口一致；公开枚举、sentAt 字段及调度未变 | 待验 |
| CG-12 | 125 条真实网关入站消息的快照分页；旧页挂起与实时新消息、历史时间补投、重复事件交错 | 隐藏页修前 131 条唯一但旧 cursor 重现；修后 137 条唯一且旧页释放后按钮不重现；138 条完整快照成功后等待旧页超过 20 秒超时，错误与 cursor 均未回挂 | 待验 |
| CG-17 | 同一页面 access 过期，REST 与 WS 共同续期；记录实际 refresh 次数、写请求身份与结果 | 隐藏页实际 WS 4401 + 3 个 GET 401 + 1 个 send 401，同一页只有 1 次 refresh、1 条成功鉴权写入，admin/account-2 与 UI 身份保持，消息唯一 sent；不声称跨标签 single-flight | 待验 |
| CG-18 | 确定规模与故障窗口中断浏览器 REST/WS；真实消息及群开关事件恢复，另注入一次时间线 503 | 隐藏页 144 条唯一消息、3 页；20.192 秒断线与首次查询 503 一次后，恢复可用→消息及群开关呈现 1451ms，WS 鉴权→呈现 464ms，ID 顺序与数据库完全一致 | 待验 |
| CG-19 | 现有 Agent 模拟器返回三次审计 503 或畸形 JSON；真实后台生成 blocked / protocol_error 轨迹 | 隐藏页 blocked 醒目提示、工具入参/结果/错误码与原始响应展开通过；畸形协议步骤及合法 finish 轨迹通过；清理前工具结果观测该文本三次审计、零匹配网关请求（下述事后转录，不代表 run 全部副作用） | 待验 |

## 修复与自动验证

修复提交 `8bc7ef9`，随后 `4d6b45d` 修正测试枚举、import 位置并加入隔离夹具；`6a6dd80` 修复浏览器实际发现的 CG-12 迟到分页结果竞态。产品入口为 `apps/web/src/components/Timeline.tsx`、`SequenceProgress.tsx`，调用实际公用选择规则 `senderSelection.ts` 和时间呈现组件 `SequenceStepTime.tsx`。没有修改账号/发送/序列后台协议。

`apps/web/tests/core-console.test.ts` 三项分别覆盖：选择失效/退群不静默换号、初始默认及限流队列策略、五种步骤状态的实际 HTML 标签。前两项通过实际组件所用规则验证，时间项以 React 服务端渲染验证实际组件。它们不能替代浏览器中真实 Timeline 提交负载证据。

修前将原表达式原样提取，隔离执行得 1 通过、2 失败：失效 account-2 被替换为 account-1，failed 的时间 HTML 包含“实际发出”。首轮修后前端全套 **95/95**、根 TypeScript、web build 通过；CG-12 修后前端为 **98/98**，web build 再次通过。修前日志 `.runtime/core-console-before.log`、修后日志 `.runtime/core-console-web-tests.log` 是当次工作树诊断输出，未把日志文件当作公开永久证据。

```sh
export PATH=/Users/zcm/.nvm/versions/node/v24.21.0/bin:$PATH
node_modules/.bin/tsx --test apps/web/tests/*.test.ts
node_modules/.bin/tsc --noEmit
npm run build -w apps/web
npm run verify:original
```

CG-12 额外发现与修复：首次交错验证超过请求 20 秒超时，只能证明迟到错误可覆盖新快照；随后短窗口验证在请求超时前释放旧页，完整 131 行已到达且没有重复，但“加载更早”重新出现。`useTimeline` 的旧页加载现在捕获群 generation 与快照 revision；完整快照成功后，旧页的结果与错误都失去写入资格。实际加载函数 `loadEarlierTimelinePage.ts` 与现有完整快照协调器的组合测试覆盖旧 cursor、旧失败、正常失败重试及切群，不修改时间线分页 API 或发送状态合并规则。修前浏览器记录由根协调器保存在 `.runtime/cg12-race-before-fix.json` 与 `.runtime/cg12-race-release.json`，修后短交错页为 137 行，旧页成功释放不重现按钮；另一轮完整 138 行之后等待旧页超过 20 秒超时，没有重新出现错误或游标。汇总证据见 [本轮统一验证记录](evidence/core-quality-closeout-verification.json)。

CG-01 另外从 `git show 7f424f6:apps/web/src/components/Timeline.tsx` 直接提取原 selected 表达式执行：合法 disconnected/idle/suspended/session_expired 状态使 account-2 离开候选后，原表达式均得到 account-1。这个源码隔离证据保存在 `.runtime/core-console-baseline-repro.json`，不冒充修前浏览器操作。

原文 SHA-256 保持 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。

## 独立浏览器夹具

启动 `node_modules/.bin/tsx scripts/core-console-qa.ts`。脚本仅使用随机命名数据库 `core_console_qa_*`，所有 HTTP 服务绑定 `127.0.0.1` 的随机端口；网关与 Agent 状态在独立临时目录中。真实生产模块在后台执行，前端来自本工作树。没有改动主演示数据库或用户 Chrome 页面。浏览器操作由根协调器的隐藏 IAB/CUA 执行，子任务不能访问 IAB，未改用 Chrome 或原生 Playwright。

脚本写 `.runtime/core-console-qa.json`，其中包含启动源码 HEAD、PID、数据库名、服务 URL、群 ID 及临时路径。`QA_DATABASE_URL` 可指定测试 PostgreSQL 的连接来源；脚本只取其中的连接参数，随后创建独立随机库。结束时向该 PID 发 SIGTERM，关闭服务并 DROP 自建库，清理自己的临时目录；清理结果写回 metadata。不得用演示服务端口代替夹具端口。

夹具初始创建一个四服务账号群，并经现有模拟网关控制发布 125 条不同消息，再等待实际网关摄取入库。以下控制只存在夹具，不加入生产应用路由：

| 路径（相对 metadata.serverURL） | 用法与计量 |
|---|---|
| `GET /__qa/state` | 返回浏览器 HTTP 路径/开始/结束/状态、成功鉴权的写请求身份与 body、WS 握手和事件发送时间、数据库消息稳定 ID/顺序；不记录 access/refresh token 内容 |
| `POST /__qa/reset-metrics` `{}` | 清空当轮计数与时标，不改业务数据 |
| `POST /__qa/control` | 支持 `outage`、`holdRefresh`、`holdNextEarlier`、`releaseEarlier`、`failTimelineCount`；`restoreAfterMs:5000` 定时恢复并记录实际恢复时刻。REST 故障位于夹具 Vite 代理，WS 断开与拒绝升级也只在夹具 |
| `POST /__qa/expire-access` `{"username":"admin"}` | 使浏览器该身份的 access 到期并挂起 refresh；保留夹具内部操作会话。之后 `holdRefresh:false` 放行真实单次轮换 |
| `POST /__qa/publish` | `prefix` 必填，`count` 1–150，`historical:true` 使用 2020 年时间，`duplicates:true` 对每个真实 msgId 重复发布；仍由生产摄取/去重处理 |
| `POST /__qa/group-setting` `{"autoKickEnabled":true}` | 调用生产 PATCH；提供与消息不同的实际页面状态变化和提交完成时标 |
| `POST /__qa/sender` | `accountId` + `disconnect/connect/rate-limit/clear-rate-limit`。断开/连接调用真实公开接口；限流前置通过生产 `changeAccount` 事务设置 60 秒期限，明确为隔离前置而非声称网关返回了该期限；释放后由生产 tick 处理队列 |
| `POST /__qa/agent-scenario` | `scenario:blocked/protocol`；创建独立群、配置已有模拟器脚本、触发真实运行、等待终态，返回 run 与详情 URL。两场景串行执行，避免共享脚本覆盖 |

CG-12 交错顺序：页面先看到加载更早，挂起下一页的真实响应；发布新消息及更早时间消息并重复投递，待实时补齐后释放旧页；核对总行数、ID 唯一性、sentAt/id 排序、自己的消息状态和游标。不能仅凭 API 结果认定页面正确。

CG-02 实际浏览器结果：先前 `SENDER_NOT_IN_GROUP` 的 sendFaults 配置没有对应模拟器实际分支，两步正常 sent，只作为 sent 标签证据，不能计为失败注入。随后直接调用隔离网关 account-2/disconnect 产生真实 ACCOUNT_OFFLINE，再通过页面预检并启动同一序列，run `d32160f8-fa95-464a-8f88-52811ffef2e0` 失败；第一步显示 failed 与“失败处理时间”，第二步 pending 显示“尚无确认发出时间”，接口与 UI 一致。截图：[真实失败序列](evidence/core-sequence-failed.png)。五态覆盖由组件渲染测试提供，浏览器没有另外制造 skipped/accepted 场景。

CG-01 实际浏览器结果：选择 account-2 后由真实 transition 断开，原选择、草稿仍在且发送禁用，没有写请求；手动选择 account-3 后消息只出现一行 sent。重新连接 account-2 并设置限流前置后，提交仍使用 account-2，queued 与解除后的 sent 为同一行。截图：[失效发送身份](evidence/core-sender-unavailable.png)。

CG-17 顺序：清计数→过期并挂起 refresh→在同页发生 REST 轮询、WS 4401 与手工写→放行→核对 refresh 为 1、身份/角色不变、写入一次且 accountId 正确。hold 时间应小于前端单次请求 20 秒超时。本轮实际观察为 WS 4401、三个并行 GET 的 401、一个 send 的 401，共用一次 refresh；成功鉴权的写请求仅一条，username/role 均为 admin、accountId 为 account-2，返回 202 后该 clientMsgId 唯一变为 sent。页面身份亦由隐藏页核对。

CG-18 实测：第三轮在故障恢复前已开始持续等待独特消息和开关状态。传输故障窗口为 20,192ms，数据库及页面最终均为 144 条唯一消息、三页，第一次时间线查询额外返回一次 503。传输恢复可用时刻 `1790788099753`、WS 鉴权成功 `1790788100740`、DOM 消息与 autoKick=true 同时观测到 `1790788101204`（Unix 毫秒），对应恢复可用到呈现 **1451ms**、WS 鉴权到呈现 **464ms**。全部 ID 的顺序与数据库 `sent_at,id` 一致。前两轮开始观察过晚，仅能证明最终补齐，未用于 3 秒结论。

CG-18 应分别记录服务器事件生成/提交、传输恢复、WS 鉴权成功、浏览器同时显示消息与页面状态的观察上界。故障持续时间与恢复后呈现耗时不能混为一谈，3 秒结论仅限记录的数据规模及故障窗口；不得将任意长断线或任意远端故障概括为满足 3 秒。

CG-19 场景不新增外部协议能力。blocked 的审计配置为三个实际 503；协议错误场景为实际畸形 JSON 后合法 finish。隐藏页已核对步骤 kind、工具名、入参、结果、错误码与 raw 展开。blocked run `c4d43380-725d-4995-87fc-1dbacf2d4f3d` 的 endReason=audit_blocked，send_message 步错误码为 AUDIT_REJECTED，auditVerdict=null；null 在这里表示未得到明确审计结论，不能写成审计服务明确 reject。协议错误 run `59d570f2-4337-41ed-aebd-564e103bc987` 的第一步为 protocol_error/BAD_JSON，下一步合法 finish，最终 finished/final。清理前实际读取 gateway 与 agent 两个模拟器的 `/__control` 端点，并读取夹具 `/__qa/state` 关联运行；工具结果 `chunk_id=07d645` 显示三条审计记录均为文本“CG19 blocked 不应发送”，按同一文本筛选的网关请求记录为空。当时未单独归档这些响应；[附属工具结果转录](evidence/core-console-cg19-counter.tool-transcript.json) 是清理后根据已显示工具输出重建的记录，不是当时保存的原始文件。计数仅覆盖该文本及所读请求记录，不能外推整个 run 的全部副作用。截图：[审计阻塞轨迹](evidence/core-agent-blocked.png)、[协议错误原始响应](evidence/core-agent-protocol.png)。

## 本轮版本与清理

浏览器使用独立夹具：后端及模拟器由 PID `79476` 在 `2026-09-30T16:57:09.579Z` 启动，启动 HEAD 为 `8bc7ef9`（后台源码与 `7f424f6` 相同）；前端在 CG-12 修复后由隐藏页刷新，加载本工作树 `6a6dd80` 源码。没有把后续文档提交或根协调器其他后端测试的提交伪称为该进程启动版本。根协调器另外完成集成候选的构建与回归，结果以统一验证记录为准。

浏览器关闭、证据归档后，向上述隔离 PID 正常 SIGTERM，并于 `2026-09-30T17:14:05.890Z` 完成关闭清理；metadata 标为 stopped、cleanupErrors=[]。随后连接 PostgreSQL 的 postgres 库按唯一库名核验，`core_console_qa_dead8850976e4069805de6af52d1922b` 已不存在，自建临时目录 `kapibala-core-console-qa-v3LuW1` 已删除，四个随机端口 60525/60518/60513/60514 均无监听。清理检查为 `.runtime/core-console-cleanup.json`；没有停止或修改主演示服务。

本文件对应六项均取得本轮有限开发验证；CG-12 补证中发现的游标/错误覆盖已修复并完成成功、超时两边实际复验。3 秒结果限于上述规模和故障窗口，不推广为任意规模 SLA。原文协议限制、其他 CG 项及用户人工验收由各自记录管理，本文件不代为关闭。
