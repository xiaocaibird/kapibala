# INT-STREAM-001 开发侧默认配置补证

2026-10-01。源码提交 `866c7e9ba3a3ff89f1e2fb8ba8872b5fb178ee06`，基线 `a7c0122e2daf46fac9446998ac965af43be4f574`，工作分支 `agent/qa-stream-evidence-followup`。本轮只补只读连接诊断和开发实验，没有修改 QA 目录、原文、发送策略或默认阈值，也没有连接演示服务。独立 QA 的 `INT-STREAM-001` 结论仍由 QA 在新冻结候选上实际复测，不用这份开发记录回填旧 BLOCKED。

## 已取得的事实

两轮有限、直连真实慢读实验都在正常 `apps/server/src/main.ts` 和默认参数下触发产品发送回调超时关闭。健康连接收到全部合法注入集合；慢端恢复读取并排空旧连接后，按最后完整实际收到的 seq 重连，旧前缀与回放尾部恰好覆盖目标集合；公开历史内容哈希全部相等。

| 项目 | 第二轮原始实验 | 最终源码绑定实验 |
| --- | --- | --- |
| 注入 | 8192 条 / 13,539.076 ms，关闭后追加 16 条 | 8192 条 / 14,079.517 ms，关闭后追加 16 条 |
| 正常入口实参 | 1,048,576 B / 5000 ms / 1000 ms | 相同，每个连接的 configured 日志留证 |
| 产品关闭原因 | `send-timeout`，请求码 1013 | `send-timeout`，请求码 1013 |
| 关闭请求时当前发送等待 | 5000.072125 ms | 4999.778750 ms |
| 当时 bufferedAmount / 待回调数 / 已接纳帧数 | 287 B / 1 / 1 | 287 B / 1 / 1 |
| 请求关闭到实际调用 terminate | 999.959667 ms | 1000.101292 ms |
| 产品真实 close 事件 | 1006，关联同一连接的超时及 terminate 记录 | 相同 |
| 健康端目标身份 | 8208 / 8208 | 8208 / 8208 |
| 健康端实际 JSON payload 总字节 | 2,321,894 B，含两控制帧 116 B | 相同；消息帧实际为 280–283 B |
| 旧端排空后前缀 / 最后实际 seq | 2907 条 / 2914 | 2910 条 / 2917 |
| 重连 sinceSeq / 缺口回放 | 2914 / 5301 条 | 2917 / 5298 条 |
| 历史 | 83 页，8208 个身份和正文 SHA-256 全相等 | 相同 |
| 健康端在实验结束前关闭 | 否 | 否 |

这些时间保留实测原值。Node 定时器不是严格物理实时 SLA；没有把略小于或大于整数毫秒的观测裁剪成配置值。此次真实命中的是 5 秒发送回调等待分支，**没有证明真实网络命中过 1 MiB 水位分支**。1006 本身不能证明慢消费者策略，只有关联产品侧 `close-requested → terminate-requested → closed`、未执行读端 cleanup 的时间线和健康对照才能解释本轮关闭。

首次尝试在建群时给了空 `memberAccountIds`，公开 API 按既有至少一个成员的校验返回 400，未进入 WS 慢读场景。原始失败保留；随后连接两个真实账号，通过公开建群任务建立合法群。第二轮成功后仅补实验的源码哈希、必要消息字段校验、显式 opt-in 和失败清理信息，再跑最终轮；没有改变产品行为或负载上限。

## 正常接入与载荷来源

- `POST /api/auth/login` 获得访问令牌，真实连接 `/ws` 后发送 `{"type":"auth","accessToken":"…","sinceSeq":最后实际收到的事件seq}`。缺省 `sinceSeq` 从当时数据库水位开始；控制帧不作为持久事件游标。无效令牌实际关闭码为 4401。
- 鉴权成功响应为 `{"type":"auth","success":true}`。需要暂停起点时发送 `{"type":"scope_marker","requestId":"独立ID"}`，等真实 `scope_ready`；其 `startSeq` 只用作范围起点，不能假称之后事件已收到。
- 实际事件格式为 `{seq,type,payload}`；服务器按 `seq > sinceSeq` 递增查询，每批最多 500 条，并等待逐帧发送回调。来源是 [realtime.ts](../apps/server/src/core/realtime.ts)。浏览器现有 [live.tsx](../apps/web/src/state/live.tsx) 在当前连接收到事件后更新游标，关闭后安排 400 ms 重连；特定认证关闭码先刷新令牌。这里只列源码行为，未将 Node 读端实验证明扩大为浏览器恢复专项。
- 本轮通过实际模拟网关 HTTP `POST /__control/message` 生成稳定 `msgId`、128 字节 ASCII 正文和合法 `sentAt`；网关真实 SSE 到产品入库后，再由正常 WS 发给两个独立认证读端。没有直接写事件表或调用发送器。群由公开 API 创建，Agent 保持关闭；独立台账只记录网关成功响应的身份及正文哈希。
- 网关该控制入口的 `text` 是字符串，[gateway.ts](../apps/simulator/src/gateway.ts) 没有另设 8 KiB 规则；产品公开手动发送 `/api/groups/:id/send` 当前另有 `text` 的 Zod `min(1).max(100000)` 限制，这是字符串长度校验，不是 WS 字节限制。两者不能混为一个协议。这里仅使用固定的 128 字节正文，没有靠异常长 ID、填充产品事件字段或增大正文伪造网络压力。
- [gateway/events.ts](../apps/server/src/modules/gateway/events.ts) 的 message 事件投影含群、消息身份及变更元数据，不含正文。正文哈希从独立注入台账与公开 `/api/groups/:id/messages` 历史比较，WS 字节直接对收到的 JSON payload 测量，**不是正文大小乘消息数**；该数值也不含 WebSocket 帧头、TCP/IP 头或重传。

## 默认参数与只读日志

[socket-sender.ts](../apps/server/src/core/socket-sender.ts) 的缺省值是缓冲水位 `1024 * 1024`、发送回调等待 `5000`、关闭兜底 `1000`。正常 [main.ts](../apps/server/src/main.ts) 不传 `realtime` 覆盖值；[app.ts](../apps/server/src/app.ts) 默认启用 logger。实验直接启动该 main，日志中的 `limits` 是该连接实际使用的值。

新增日志默认随正常服务 logger 启用；`createApp({logger:false})` 的专用装配会静默。没有新增 HTTP 诊断 API、控制器端点或 runtime 协议。日志只在配置、认证、请求关闭、请求 terminate 和真实 close 时输出，不逐帧打日志，不记录令牌或消息正文。观测异常被隔离，不改变鉴权、发送、关闭或游标推进。

| 字段 | 真实来源与边界 |
| --- | --- |
| `connectionId`, `pid`, `peerAddress/Port`, `localAddress/Port` | 正常 Fastify 请求 UUID、服务进程和真实升级连接的 TCP tuple；外部读端 localPort 可对应服务器 peerPort。使用中继时必须另外保留中继两侧映射。 |
| `at`, `monotonicMs` | 该事件发生时的 UTC 和该进程 `performance.now()`；只有同 PID 的单调时钟可直接作差，不能把读端和服务进程的原点混用。 |
| `bufferedBytes`, `maxObservedBufferedBytes` | 当时真实 `ws.bufferedAmount` 和发送/生命周期采样点的最大值；不代表所有时刻峰值或内核 TCP 缓冲总量。 |
| `admittedFrames`, `maxAdmittedFrames`, `pendingWaiters` | 发送器实际已接纳串行工作数量、采样最大值、尚待取消/完成的 Promise 集合大小；关闭后 Promise 可已释放而底层回调仍未返回。 |
| `attemptedFrames/Bytes`, `successfulCallbacks` | 实际调用 send 的次数、已序列化 JSON 的 UTF-8 字节和无错误回调数；均不承诺客户端收到。 |
| `currentSendWaitMs`, `currentFrameBytes`, `maxCallbackWaitMs` | 当前实际发送开始后的等待、JSON 字节、已返回回调（含错误）的最长等待；超时瞬间当前等待与先前已完成回调等待是不同数。 |
| `kind`, `trigger`, `code`, `reason` | `close-requested` 是产品发起及原因；`terminate-requested` 在真实 terminate 前发出；`closed` 来自真实 socket close 事件，码可能不同。没有产品发起原因的外部关闭不伪造 trigger。 |

水位是逐连接后续写入保护，不是整个进程 1 MiB 内存上限。排空时允许单条合法大帧，串行发送最多一条在发送、两条等待；数据库回放结果、已持久事件、连接数量和 TCP 缓冲另有成本。此次新接入不改这些既有语义，详见 [公开资源边界](core-resource-observability.md)。

## 有限复现实验与上限

[stream-default-observation.test.ts](../tests/integration/stream-default-observation.test.ts) 默认跳过，需要显式 `STREAM_EXPERIMENT=1`。它是开发侧 measurement harness：有限负载未命中时输出具体 `BLOCKED`，Node 测试进程正常退出不等于该 QA 用例 PASS。

```sh
DATABASE_URL='<仅本任务拥有的 PostgreSQL 服务，路径 /postgres>' \
STREAM_EXPERIMENT=1 \
STREAM_EVIDENCE_PATH='<自有输出目录>/stream-default.json' \
node --import tsx --test tests/integration/stream-default-observation.test.ts
```

调用者先准备专属 PostgreSQL 服务及依赖；测试在该服务中创建 UUID 数据库并运行迁移，随后分配三个本机动态端口，给正常 main 显式传入专属 `DATABASE_URL/GATEWAY_URL/AGENT_URL/PORT`。不会采用 main 的演示地址默认值。两个模拟器使用单独临时目录；完成或失败后关闭自有读端、服务与模拟器，删除该目录及确切 UUID 数据库。实验 cleanup 发起的连接终止单独留痕，不能作为慢消费者产品关闭。

| 资源/阶段 | 本轮 profile |
| --- | --- |
| 注入上限 | 最多 8192 条主负载，batch 32 个并发 HTTP，不额外延迟；只在已确认产品关闭后再加 16 条合法尾部，最多 8208 条、1,050,624 字节正文。 |
| 注入时限 | batch 边界检查 120,000 ms；单 HTTP 超时 10,000 ms。不是承诺在指定物理毫秒中断一个已开始批次。 |
| 健康端排空 | 停止主注入后 45,000 ms；若增加关闭后尾部，再独立等待最多 45,000 ms。 |
| 关闭观察 | 8,000 ms；已发起关闭后等真实服务器 close 最多 5,000 ms。 |
| 旧端排空及 replay | 恢复旧 socket 读取后最多 10,000 ms 等真实关闭；以实际末尾 seq 重连，回放最多 30,000 ms，继续 1000 ms 迟到重复观察。 |
| 每个读端账本 | 最多 20,000 帧、16 MiB 实际 payload；只建无效鉴权、慢端、健康端和必要的一条 replay 连接。 |
| 历史/证据 | 最多 100 页，每页 100 项；输出 JSON 最多 16 MiB。最终原始 JSON 12,161,561 B，压缩只为存储，不删改内容。 |
| 整体测试 | Node test 超时 250,000 ms；HTTP 使用测试取消信号，清理另有服务退出等待与兜底。实际最终测试 43.22 秒左右。 |

该直连 profile 在本机两轮命中，不保证其他内核缓冲、机器或并发负载下也命中。QA 应冻结自己的 profile 和资源上限，独立暂停真实 socket，保留完整事件集合及所有原始观察；若健康集合不完整、关闭未命中、原因不明或排空后无缺口，继续据实 BLOCKED，不无界加压或降低产品阈值。独立 QA 不需要导入此 harness，也不应把产品日志尝试发送数当实际接收数。

## 验证与原始证据

- [首次失败日志](evidence/stream-default-observation-first.log)及 [JSON](evidence/stream-default-observation-first.json)：公开参数校验拒绝，没有慢读结论。
- [第二轮日志](evidence/stream-default-observation-second.log)及 [原始 JSON gzip](evidence/stream-default-observation-second.json.gz)：第一次真实默认闭环。解压 JSON SHA-256 为 `ff8dfde8f84d146ee9535206daff503f654bd0e4c364e32b1410f83a9feeba60`。
- [最终轮日志](evidence/stream-default-observation-final.log)及 [原始 JSON gzip](evidence/stream-default-observation-final.json.gz)：增加消息必要字段校验和源码文件哈希绑定；三个哈希均已与提交 `866c7e9` 核对一致。解压 JSON SHA-256 为 `a540631d7a1dc755e36e6839004a4bdf260e9f4af3d35f8194a56ca1fe96884a`。gzip 解压后是完整原始 JSON，未回填计量值。
- [既有资源专项回归](evidence/stream-related-core-regression.log)：11/11。它含旧 fake sender 和缩短等待的真实 TCP 专项，仅用作关联机制回归，不能替代上述默认入口实验。
- [正常鉴权、回放、注销关闭专项](evidence/stream-related-auth-regression.log)：1/1，公开网关注入的既有测试；没有重跑不相关业务整套。
- [静态检查](evidence/stream-static-checks.log)：`tsc --noEmit`、原文校验和 `git diff --check` 成功。原文 SHA-256 仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。

环境为 Node `v24.21.0`、tsx `v4.23.15`，专属 `postgres:17-alpine`。每轮实验先后独占自己的数据库服务；关联回归在两轮实验结束后执行。详细大小和哈希见 [证据清单](evidence/stream-evidence-manifest.json)。

[清理记录](evidence/stream-evidence-cleanup.json)核对专属容器完整 ID 和归属 label 后，先确认测试 UUID 数据库和会话均为零，再删除该容器及其唯一匿名卷并确认不存在；三轮正常服务子进程均退出 0，临时目录均不存在，临时依赖软链接已删除。没有清理其他人的资源；此前必须保留的 QA staging 仍存在。未合 main、未 push、未联系 QA。
