# C2 离线用量队列与 provider transport 工程观测

本接缝扩展既有 [离线进程入口](qa-offline-model-entry-20261002.md)，用于独立 QA 经 HTTP 观察真实 `UsageJournal` 的等待队列、当前写批次及拒绝记录，并在下一批实际持久化开始前建立一个有期限的门。它不进入生产启动路径，不替代 QA 判定，也不扩充外部模型协议。固定合成凭据、数值 loopback、独占 session、无 dotenv、无代理/重定向/外网 fallback 的边界不变。

## 启动契约

既有 `QA_GEMINI_OFFLINE=true`、严格 loopback `QA_GEMINI_PROVIDER_URL`、绝对 `QA_GEMINI_SESSION_DIR` 仍必填。新增配置：

| 配置 | 行为 |
|---|---|
| `QA_GEMINI_USAGE_ENTRY=main\|factory` | 默认 `main`。main 沿用 `usageOptions(process.env)`：usage 默认开启，`GEMINI_USAGE_ENABLED=false` 关闭。非法 entry 拒绝启动。 |
| `QA_GEMINI_FACTORY_USAGE=true` | 仅 factory 下显式提供 usage 对象，并设 `enabled:true`；保留 `GEMINI_USAGE_MAX_*` 限制。缺失或 `false` 时真正省略 factory 的 usage 属性，即使 `GEMINI_USAGE_ENABLED=true` 也不创建 journal。其他值拒绝启动。 |
| `QA_GEMINI_USAGE_OBSERVATION=true` | 注入真实 journal 的可选 `testObserver`，开启队列事件与单门控制。缺失或非 `true` 不启用。 |
| `QA_GEMINI_TRANSPORT_OBSERVATION=true` | 开启本入口 provider transport 事件。与 usage 观测可独立开关。 |
| `QA_ACCEPTANCE_RESOURCE_TOKEN` | 任一观测开启时必填，长度 32–256 字符；建议由调用者随机生成。缺失/非法在创建 session 前以 `QA_OBSERVATION_TOKEN_REQUIRED` 拒绝启动。不得记录其完整值。 |

示例（端口和目录须由调用者实际拥有；token 不输出到终端）：

```sh
qa_observation_token=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
QA_GEMINI_OFFLINE=true \
QA_GEMINI_PROVIDER_URL=http://127.0.0.1:49152 \
QA_GEMINI_SESSION_DIR=/absolute/owned/session-directory \
QA_GEMINI_USAGE_ENTRY=factory \
QA_GEMINI_FACTORY_USAGE=true \
QA_GEMINI_USAGE_OBSERVATION=true \
QA_GEMINI_TRANSPORT_OBSERVATION=true \
QA_ACCEPTANCE_RESOURCE_TOKEN="$qa_observation_token" \
node --import tsx scripts/qa-gemini-agent.ts
```

显式设置 entry 时，ready 追加 `usageEntry`。任一观测开启时，ready 追加：

```json
{"observation":{"protocol":"qa-gemini-observation/1","instanceId":"<new UUID per process>","basePath":"/qa/usage/v1","usageEnabled":true,"transportEnabled":true}}
```

没有观测开关时不注册控制路由、不注入 journal hook、不保存 transport 事件，原 ready 字段保持兼容。生产 main 与 factory 本身的默认行为未修改。

## 独立 HTTP 控制

控制路由与服务同一 loopback 随机端口。每次请求同时提供 `Authorization: Bearer <token>` 和 `x-qa-instance-id: <ready UUID>`。token 缺失/错误为 HTTP 403 `QA_OBSERVATION_FORBIDDEN`；instance 缺失/错误为 HTTP 409 `QA_OBSERVATION_INSTANCE_MISMATCH`。身份校验先于任何门操作。

| 请求 | 请求体 / 响应 |
|---|---|
| `GET /qa/usage/v1/snapshot` | 当前实例、usage、hold、transport 快照。 |
| `PUT /qa/usage/v1/holds/<UUID>` | 严格 JSON `{ "ttlMs": 100..120000 }`，创建下一批写入前的唯一门。返回 hold。 |
| `GET /qa/usage/v1/holds/<UUID>` | 当前指定 hold；未知/旧 ID 为 HTTP 404 `QA_HOLD_NOT_FOUND`。 |
| `DELETE /qa/usage/v1/holds/<UUID>` | 释放该门，返回实际状态；未知/旧 ID 不操作当前门。 |

非法 UUID/请求体/TTL 返回 400 `QA_HOLD_INVALID`。无 usage 观测、journal 未初始化或控制已关闭时，PUT 返回 409 `QA_USAGE_WRITER_UNAVAILABLE`。已有 armed/held 门时另建新 ID 返回 409 `QA_HOLD_BUSY`。同 ID、同 TTL 重放返回原状态且不续期；同 ID 改 TTL 返回 409 `QA_HOLD_CONFLICT`。

hold 字段为 `id,state,ttlMs,expiresAt,reached,releaseReason`。状态 `armed` 等待唯一 writer 的下一批，`held` 表示已进入真实 `before-write`；此时 `reached` 保存那次完整用量事件。`released` 表示 DELETE/正常关闭释放，`expired` 表示真实定时器到期；`releaseReason` 为 `delete|ttl|shutdown|null`。TTL 从 PUT 创建时开始，最低 100ms，不由后续请求延长。只能有一个当前门；它终止后可用新 UUID 建门，旧 ID 随即不可用于操作新门。门不暂停业务返回，也不挑选请求或改写用量内容。

## 用量快照与真实写入阶段

`snapshot.usage` 返回：

- `entry,optionsSupplied,configuredEnabled,observationEnabled,initialized`：入口配置与真实 journal 初始化事件；工厂省略对象可直接辨别。只开 transport 时 `initialized` 及队列数字为 `null`，不把未观察解释为零。
- `queued`：真实等待队列长度；`queuedIncludesActiveBatch:false` 明确不含当前批。`activeBatch`：唯一 writer 已取出的真实批条数。`dropped`：本进程实际 `queue.length >= 64` 拒绝分支累计次数；`writeFailures`：实际异步批写失败次数。重启重新计数，不是跨进程完整账本。
- `diagnosticCodes`：实际出现的固定诊断；`events`：最新最多 2048 个事件；`truncatedEvents`：已经截去的事件数量。不得把截断快照解读为完整历史。

每个 usage 事件含 `seq,at,monotonicMs,kind,queued,activeBatch,dropped,writeFailures,batchId,attemptIds`；入队与队列拒绝另含实际 `requestId,attemptId`，诊断含 `diagnosticCode`。这些 ID 来自真实 provider/service 调用；不包含 prompt、消息、runId、key、token 或文件路径。

事件含义与顺序：

1. `enqueued` 由 `queue.push` 后直接发出；`rejected-queue-full` 由实际容量检查拒绝分支发出。两者都不代表落盘。
2. `batch-dequeued` 在唯一 writer 实际 `splice` 取得批次后发出，使用新的 `batchId` 和实际 `attemptIds`。
3. `before-write` 在保留策略计算完毕、调用本批 `persist` 前发出；门仅在这里等待。确认 `hold.state=held` 且批次匹配后，才建立“已入队且该批尚未开始持久化”的窗口。
4. `write-started` 在实际文件 `open` 请求已发出后记录。它不是“写完成”或 fsync 成功证明，不能用 await 门后的入口事件代替。
5. `write-settled` 在原始 writeFile、fsync、close、rename 及清理返回之后发出；随后 `batch-settled` 清空当前批。失败发出 `write-failed` 和原固定诊断；原降级与丢弃规则不变。

启动保留处理也会实际重写 journal，其 `write-started` 的 `batchId=null`；启动写完成以 `initialized` 为证。用于强杀的必须是 `reached.batchId` 对应批次，不可误用启动事件。工厂省略/显式关闭时无 journal、无这些事件；成功业务响应不能据此推导已记录用量。

SIGINT/SIGTERM 先释放自有门，再走原服务 abort、任务结算、usage flush 和 owner 核对；无自动删锁。SIGKILL 无最后一次事件或自动 flush 保证：应先保存 held 快照及文件证据，再以监护进程退出信号、退出后实际文件与锁核对。不能据“没有后续事件”单独证明退出前绝无物理操作，更不能把 usage 文件当作模型重发或未知结果恢复凭证。

## 有限 provider transport 事实

`snapshot.transport` 含 `enabled,coverage:"provider-transport-only",events,truncatedEvents`，事件同样最多 2048 条。每事件含 `seq,at,monotonicMs,requestId,kind,details`。这里 `requestId` 是 transport 自己的关联 ID，与 usage requestId 分属不同命名空间，不能假定相等。

`attempt` 记录实际输入中的允许 Google URL、method、redirect、固定 modelPath；非允许目的 URL/path 与非标准 method 值脱敏。凭据只记录 `keyHeaderPresent`、`matchesSyntheticKey`、`syntheticKeyElsewhere` 布尔，不记录 key 值或请求体。未知目标即使在连接前拒绝，仍有 `attempt` + `request-rejected`，不能因 provider 桩没收到请求而宣称没有尝试。

后续事件为 `request-created`、`socket-assigned`、`socket-connected`、`response-status`、`redirect-rejected`、`response-conversion-rejected`、`signal-aborted`、`request-error`、`response-end`、`response-close`、`socket-close`。实际 socket 事件使用独立 `socketId`；连接事件保留本机数值 loopback 地址与自有临时端口以核对身份，其他地址脱敏。只保存已验证模型路径，不保存任意 URL、redirect Location、session 路径、异常正文或 header 值。观察回调异常被隔离，不吞 transport 错误、不推迟 signal、不改 provider 返回。

`seq` 是各事件流内的发出次序，`at` 为墙钟时间，`monotonicMs` 为同一进程 performance 时钟；均描述观测回调时点。`signal-aborted` 只表示 signal 已触发，不能当作远端取消、socket 已关闭或模型未执行证明；要分别核对 request/socket 后续事件和独立桩/监护事实。

这些事实只覆盖注入的 provider transport，不覆盖进程其他 socket/HTTP、DNS、TLS、代理或真实模型。关闭或强杀可留下事件尾部不完整，独立监护证据仍必要；本接缝不提供全进程零外连证明。

## 研发验证

独立子进程测试只用自有本机 HTTP 桩、随机端口、临时目录及合成凭据，不导入服务实现来替代 HTTP 调用。测试后关闭/回收所有自有进程、socket、服务器和目录，包括被强杀的自有测试目录；产品入口不执行这类人工清理。

```sh
node --import tsx --test tests/integration/qa-gemini-usage-observation.test.ts tests/integration/qa-gemini-transport.test.ts
```

验证覆盖 main 开/关、factory 真省略/显式启用、无标志路由关闭、缺 token 启动拒绝、运行期无 writer 拒绝、错误 token/instance/ID、门重放不续期、旧 ID 隔离、真实 100ms TTL 与 held 到期释放、正常退出 flush/清锁及 queued-write 强杀。

141 次实际 audit → GeminiProvider → 本机 HTTP 请求在门内形成 `activeBatch=1,queued=64,dropped=76`，所有业务请求成功；解除后真实 usage 文件 65 条、无批写失败。这反映既有有界可丢弃 telemetry 语义，不把被拒绝的 76 条伪装为已持久化。transport 专项核对真实连接身份、未知目标拒绝、重定向目标零调用、HTTP 600 安全拒绝、真实 abort/reset 与观察回调抛错后成功路径。

原始 TAP、有限事件快照和源码哈希见 [研发证据](evidence/qa-usage-observation-20261002/verification.json)。此处结果仅为研发验证，不写入独立 QA 目录或把任何 QA 用例改为 PASS。
