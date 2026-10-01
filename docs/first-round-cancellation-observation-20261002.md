# 首轮取消观测接入与开发证据

本记录说明 KB-CANCEL / KB-CROSS 的最小研发观测接线。既有首轮 QA 原报告、原样本、判定边界保持原样；本记录不是独立 QA 报告，也不改签严格活动预算或强恢复要求。

## 接入位置

- `core/remote.ts` 在原 `RemoteClient.request` 内观察真正参与请求的 signal、`fetch` 与 `response.text()`；原第六参数 callback 现在接收扩展 `RemoteObservation`。第七参数 `signalSources` 仅给已经参与组合的 signal 附加内部来源身份，不增加 signal，不改变组合或取消。
- `core/messaging.ts` 的可选 `KickOptions.observation` 带 `runId / toolUseId / stepId / attemptId / signalSource`。它不是业务 API 字段，不写数据库；`signalSource: activity-budget` 由实际创建 kick 预算 signal 的工具代码提供。
- `modules/automation/tool-execution.ts` 在原 `AbortSignal.timeout(remaining)` 上安装只读监听，记录 `kick-budget-signal-aborted`，并将同一次执行身份传给 `Messages.kick`。最终会移除监听。
- `modules/gateway/messages.ts` 将实际 POST、504 后的确认 GET、成功后的投影刷新 GET 分别记录为 `kick-post-*`、`kick-confirmation-*`、`kick-projection-*`。三类请求共享工具执行 `attemptId`，每个 HTTP 调用有独立 `requestId`。
- 事实通过既有 `TestLifecycleObserver` / `LifecycleWitness` 通道交付。现有按 run 的生命周期 lease 可以取得这些事件，不增加业务 endpoint 或控制器能力。

## 事实与边界

| 字段或事件 | 实际意义 |
|---|---|
| `dispatch` | 同一同步调用栈内、调用原 fetch 前的客户端边界；不等于网关已经收到。 |
| `response-headers / response-body` | 原有成功路径事件，仍保留原含义。 |
| `source-aborted` | 对应实际源 signal 的 abort listener 执行；`source` 指明这次回调来自哪个源。 |
| `combined-aborted` | 交给 fetch 的实际组合 signal 的 abort listener 执行。 |
| `fetch-settled / body-settled` | await 原 fetch / 原 body promise 返回或拒绝后的客户端观察；未开始读取 body 时不伪造 body 事件。 |
| `request-settled` | 原请求解析成功或原错误即将返回调用方的边界，随后 finally 清理监听。 |
| `fetchPending / bodyPending` | 该观察点上原客户端 await 尚未收尾的阶段，不从网关 close 反推。 |
| `configuredSources` | `request-deadline`、`operation`、`caller`，及实际传入的 `kick-lock / activity-budget`。其中部分是同一来源的组合别名。 |
| `abortedSources` | 观察时已经 aborted 的源集合；不把多个来源强行归为一个。 |
| `reasonMatchedSources` | 已 aborted 且 `signal.reason === requestSignal.reason` 的实际对象身份匹配；不输出 reason，不根据 `TimeoutError` 名称推断原因。多个匹配会原样保留，别名匹配不能宣称多个独立根因。 |
| `errorName / transportCode` | 有限白名单的错误类别 / `Error.cause.code`；未触发任何 signal 的真实 socket 错误可保留其传输代码，未识别错误不强行归因。 |
| `kick-budget-signal-aborted` | 原预算 signal 的真实 listener 边界，带本次 `budgetMs`。后续 `agent-termination-decided` 仍是后续终态决定，名称与时间均未替换。 |

`operation / kick-lock` 可以是复合 scope signal。其触发只证明该 scope 取消；不能凭一个 TimeoutError 或 Error 名称把它进一步宣称为用户取消或具体数据库连接根因。用户的数据库取消标志也不自动等于本次 HTTP 的立即 abort。

每个 remote 事实含 `observedAtMonoNs` 和 `observedWindowMs: [before, after]`；预算事实对应 `signalObservedAtMonoNs / signalObservedWindowMs`。包络由两次 `performance.now()` 包住一次真实 `process.hrtime.bigint()` 采样。包络定位本次 listener / await continuation 内的采样，不声称是定时器阈值或服务端生效瞬间。生产工程观察入口的 witness 另附实际 PID、唯一进程 `clockDomain` 与投递采样；必须在同进程域中使用包络，不能把 hrtime 纳秒直接当成 performance 毫秒，亦不能省略跨进程测量误差。

## 不变行为与观察隔离

原 15 秒单请求 deadline、kick POST 准入、2100ms 后确认、5 秒发送等待、预算余额、未知结果保留及不自动重放均未调整。未新增业务 SQL、身份 SQL、外部协议或取消容差。正式入口未安装 observer 时，不生成请求 UUID、不安装新增源 listener、不输出事实或日志。observer 同步抛错被局部隔离；成功、真实 HTTP 错误及真实取消继续按原结果返回。所有新增 listener 在请求/工具的 finally 中移除，已结束请求不会继续观察后来触发的 signal。事实不包含 URL/path、请求/响应正文、密钥或错误 message。

## 开发验证

短 HTTP 套件 `tests/integration/remote-cancellation-observation.test.ts` 使用真实本机 HTTP 和真实 AbortSignal，最终 **7/7 PASS**：预算 signal、单请求 deadline、headers 后 body 取消、socket 关闭、多来源同时触发、observer 抛错隔离、关闭 observer 与监听清理。TypeScript 检查通过。

首次短套件为 **5/6 PASS、1 FAIL**，失败来自测试错误地预期同步触发的 operation signal 一定抢先成为组合 reason；实际 fetch 拒绝返回了 budget reason。只将测试断言改为检查真实返回 reason 与各 signal 的对象身份匹配，保留所有已触发源；未改产品控制流来迎合预期。随后原六项通过，再补第七项关闭 observer / abort 回调抛错检查后七项通过。首次短测试输出留在本次开发工具记录；没有将其重建为“原始日志”。

可选真实组合测试 `tests/integration/kick-cancellation-observation.test.ts` 的 **首次执行 1/1 PASS**，原样日志见 [开发首次日志](evidence/first-round-cancellation-observation-20261002/kick-cancellation-developer-first.log)。开启变量是 `KICK_CANCEL_OBSERVATION_EXPERIMENT=1`；默认跳过这条约 60 秒实验。它使用本轮独占 PostgreSQL 的 UUID 临时数据库和无密钥本机 stub，原 run 从零真实经历三次 14.5 秒模型等待；未注入 `active_ms`，未缩短真实预算，未自动重跑。执行命令通过 dotenv 从本机临时凭据文件读连接配置，凭据不归档。

该样本事实如下，时间单位均为同一测试进程的 `performance.now()` 毫秒：

| 项目 | 首次样本 |
|---|---|
| run / step | `3ecba19c-dde1-429f-b098-150620f35416` / ordinal 3 |
| 工具执行 attempt | `d602743a-9c37-4778-9f43-b339dab4b0b5` |
| POST / 确认 GET | 各 1 次；POST 真实返回 504，GET 未回 headers |
| GET 网关接收 | `45988.415833` |
| 原预算 listener 采样包络 | `[60279.695917, 60279.711792]` |
| 同 GET 的预算源 listener 采样包络 | `[60279.771042, 60279.773125]`，`fetchPending=true` |
| 同 GET combined abort | `[60279.980792, 60279.985667]`，`fetchPending=true` |
| 同 GET fetch 拒绝 | `[60282.090875, 60282.093958]` |
| GET 网关 close | `60283.153375` |
| 后续原终态决定 | `[60293.252417, 60293.26325]` |
| 来源 | `caller / activity-budget` 同一来源链匹配；`request-deadline / operation / kick-lock` 未触发 |
| 业务结果 | `failed / wall_clock`，step unknown 说明和 dispatching intent 保留；本次有限后续 tick 未产生第二次 POST |

本样本在本轮尚未冻结的开发工作区执行；其后补充的 pause cause 等元数据接线由主流程固定候选并回归，未再次执行这条长实验，故该日志不能标作最终固定候选的独立 QA 运行。

本样本只验证观测接线、真实取消来源与关联。它不判严格 60000ms 活动预算、不证明真实成员副作用、不替代 QA 的独立资源/源绑定或组合验收，也不外推永久不重放。较晚终态决定之前 GET 已关闭这一事实保持原样；正证针对更早、实际被观察的原预算 signal。

测试进程正常退出且 cleanup 无失败；随后只读核实临时库 `kapibala_test_dd3990fff70448f6b57b8f92c3892a5c` 已不存在。共享的本轮 PostgreSQL 容器由主收尾流程管理。

日志 SHA-256：`94a18fc30ef53a6482b3ba57b828415f9e6a5aef54bfb7db59d4f06e42e30ea2`。详见同目录 `SHA256SUMS`；日志保留首次执行原字节，未删除或改写其中的输出。
