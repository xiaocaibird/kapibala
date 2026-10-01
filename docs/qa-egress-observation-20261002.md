# Owned Node 出站观察契约

这是从 `main e79f1b4` 增加的显式工程 preload，生产入口不引用。它记录当前 **Node v24.21.0 / 内置 undici 7.29.1** 中经自测的 HTTP 诊断事件及 `net.Socket.prototype.connect` 调用；不同运行时拒绝启动。它不是任意代码、原生扩展或内核级全出口保证，也不代签 QA 用例。

## 启用与资源边界

使用 QA 已验证归属的独立应用进程、数据库、Gateway、Agent、端口与私有证据目录。保留原有应用配置，只在其隔离环境追加以下配置；不得继承其他 `NODE_OPTIONS`、代理配置或真实提供方凭据。`--import` 顺序固定，观察入口先于 `tsx` 和业务入口。

```sh
QA_EGRESS_OBSERVATION=true \
QA_EGRESS_MODE=strict \
QA_EGRESS_LEDGER_PATH="$OWNED_EGRESS_LEDGER_PATH" \
QA_EGRESS_ALLOWED_ENDPOINTS="$OWNED_EGRESS_ENDPOINTS" \
node --import ./scripts/qa-egress-observation.mjs --import tsx scripts/qa-observation-server.ts
```

`OWNED_EGRESS_LEDGER_PATH` 必须是私有目录内绝对路径且文件尚不存在。文件按 `O_EXCL`、`O_NOFOLLOW`、`0600` 创建，每次启动/重启用新文件，保留旧实例证据。`OWNED_EGRESS_ENDPOINTS` 是 JSON 数组，例如以下**格式示例**；端口必须替换为本次实际登记值，包含进程需要连接的数据库、Gateway、Agent：

```json
[{"host":"127.0.0.1","port":56001},{"host":"127.0.0.1","port":56002},{"host":"127.0.0.1","port":56003}]
```

仅接受精确 `127.0.0.1` 或 `::1` 和有效端口，不把 `localhost`/DNS 别名自动视为 owned。`strict` 是默认模式，空名单拒绝所有被此钩子捕获的出站连接；Unix socket 同样拒绝。显式 `observe` 模式仅观察，不执行网络保护。名单说明本次允许哪些目标，并不替代外部 ownership 核验。

## 双层事实与输出

输出为 NDJSON。所有行均带 `protocol: node-egress-hooks-v1`、随机 `instance`、实际 `pid`、连续 `seq`、`monoNs`、UTC `at`、`event`。`observer-ready` 包含运行时版本、脚本 SHA256、模式、允名单和排除范围。

| 层 | 事件与可得事实 | 不能直接推导 |
| --- | --- | --- |
| HTTP 请求 | `http-request-created`：`requestId`、`transport`、`method`、`originBasis`、`origin`、去 query 的 `path`/`url`；每次创建独立记录，包括 keep-alive 重用和自动重定向新请求 | 创建不等于派发成功，也不等于对端已收到 |
| HTTP 后续 | undici `http-send-headers`；原生 HTTP `http-request-start`；关联 `socketId` 与当时可得 peer；response-headers/complete、request-error/close | sendHeaders 钩子不证明字节已成功写出；原生 start 是获得 socket 阶段。均须结合独立接收端事实 |
| Socket | `socket-connect-call`：`socketId`、`connectId`、请求 `target{kind,host,port}`、`owned`、`blocked`；address-attempt/failed/timeout、connected/error/close | 调用数不等于 HTTP 次数；TCP connected 不证明 TLS 认证或业务响应 |
| 保护 | `socket-policy-denied` 及对应 connect-call/error；保留真实违规尝试 | 拦截造成“来源端零请求”不能证明产品正确；必须报告该尝试 |
| 完整性 | `observer-gap`；正常 JS 退出时 `process-exit`，含 gaps、未结束 HTTP/socket 身份和 hookStillInstalled | 没有退出尾记录不代表零活动；有尾记录也不证明排除范围没有出站 |

HTTP 行格式示例（共同身份/时间字段略）：

```json
{"event":"http-request-created","requestId":"h1","transport":"undici","method":"GET","originBasis":"undici-request-origin","origin":"http://127.0.0.1:56001","path":"/media/x","url":"http://127.0.0.1:56001/media/x","queryOmitted":true,"userinfoOmitted":false}
```

采集不保存 header、query、fragment、userinfo、请求/响应正文、SQL、异常 message/stack；错误仅保存受限格式的 code。HTTP 方法也只保留受限格式。原生 HTTP 的 origin 来自请求声明的 authority，标记 `native-http-authority`；Host 覆盖、绝对代理路径与物理 peer 必须分开核对，不能把它当成 connect 目标。无法安全解析的目标以 null/targetUnavailable 明示。

HTTP 原始账本保留该进程所有被这些钩子看到的请求。QA 按登记 API/source origin、用例窗口和独立关联划分媒体范围；不得把 Gateway SSE、其他后台调用隐去后声称完整进程观测。拒绝来源若在产品 URL 校验阶段就结束，可无 HTTP 创建事件；这与“已有 HTTP 创建但随后被工程保护拒绝”不同。

## 有限覆盖与退出

已纳入原型自测：真实内置 fetch、原生 HTTP/HTTPS、fetch HTTPS、实际 PG TCP 连接、HTTP keep-alive、preload 后预连接并供 HTTP 使用的 socket、自动/手动重定向、取消、环境代理；同一标准序列另以 `--import preload --import tsx` 执行。PG 仅验证连接层和真实 SELECT，账本不观察 SQL。

代理实测保留“HTTP 逻辑目标为 `qa-owned-proxy.invalid`，物理 peer 为 owned loopback 代理”的分层事实。**Socket 允名单不约束代理或隧道的最终目标**；安全默认不得启用代理，也不得把一个代理加入名单后推导任意目的均受保护。

未覆盖 preload 前副作用、继承/传入的既有 fd、原生扩展直接 I/O、未单独布置观察的子进程/worker、后续覆盖或绕过钩子、原生 HTTP/2 客户端、DNS/UDP 等。已连 socket 被 TLS 包装时，HTTP 可引用新的 socket 对象，其 `connectObserved:false` 必须保留，不能补造关联。只在 JS 退出时核对钩子仍在，不能排除执行途中曾被替换。

账本写入失败会终止本工程进程（退出 78），不继续产生虚假的零尝试结论；这种运行不能用于宣称产品行为通过。诊断字段不识别会产生 observer-gap。Socket 错误使用 `errorMonitor` 观察，不消费原有 error 事件；无应用 error listener 的原始失败行为已列入自测。

使用原有 owned PID guardian 清理。优雅退出应组合实际 PID 退出、对端未完成响应关闭、应用 session/资源状态和账本核对。SIGKILL 不期待进程内部最终事件；缺失尾记录、未完成最后一行或未结算身份均按不完整证据保留。记录 seq 只能发现可见区间内缺口，不能证明未写出的尾部不存在。取消/连接关闭不等于提供方未执行或未收费。

## 独立研发自测

```sh
QA_EGRESS_TEST_DATABASE_URL="$OWNED_EGRESS_TEST_DATABASE_URL" \
node scripts/verify-qa-egress-observation.mjs
```

只连接显式数值 loopback、非 55432、名称以 `egress_observation_` 开头的隔离数据库；脚本只执行 SELECT。调用者仍负责核验实际数据库归属。脚本启动自己的临时 HTTP/TLS/代理桩和观察子进程，原始账本、接收端事实、进程结果及报告写入新 `.runtime/egress-observation-*`。TLS 证书为本地临时合成物，不访问外部服务；退出清理其私钥/证书、桩与子进程。数据库/容器由创建它的 owned guardian 清理，脚本不删除未知数据库。

| 自测组 | 独立验证范围 |
| --- | --- |
| fetch-http-and-native-http-keepalive | 实际接收请求与每次 HTTP 创建对应；多条请求共享同一 socket |
| fetch-https-and-native-https | 真实本地 TLS 请求及 socket/HTTP 两层记录 |
| preconnected-http | preload 后提前连接的 socket 被 HTTP 使用仍有请求事实 |
| follow-vs-manual-redirect | follow 产生下一实际请求；manual 仅保留 302 且无下一请求 |
| strict-denial-is-visible-attempt | 未允许端口无来源接收，账本仍明确显示创建/违规连接尝试 |
| real-refused-connect | 真实无监听 owned 端口产生 ECONNREFUSED |
| real-fetch-abort | 来源已收到后取消；HTTP 错误及对端未完成响应关闭 |
| real-pg | 实际 PostgreSQL SELECT 与数据库 peer 连接事实 |
| env-proxy-original-vs-peer | 原始 HTTP 目标和实际代理 socket 分开记录 |
| unhandled-socket-errors-preserved | 无 error listener 时原始未处理 socket 错误仍使进程失败 |
| sigkill-incomplete-tail | 实际请求已到达后 SIGKILL；对端关闭且无虚构退出尾记录 |
| canary-not-retained | header/query/body 合成 canary 与隔离数据库密码不进入账本 |

## 固定候选证据

在干净候选 `ea79f370f4ff6412688a24e31d0426f757887a02` 上执行上述独立脚本，12 组全部通过；同一标准请求序列另经 `preload → tsx` 执行，并逐条对齐实际来源接收与 HTTP 创建。原始报告保留空 `status`、候选 SHA、preload/driver 哈希和运行时版本。这里验证工程观察路径，没有重跑应用全部业务或 QA 第二轮用例。

- [原始报告与实际来源事实](evidence/qa-egress-observation-20261002/report.json)、[标准进程账本](evidence/qa-egress-observation-20261002/standard.ndjson)、[tsx 引导账本](evidence/qa-egress-observation-20261002/standard-tsx.ndjson)。
- [代理账本](evidence/qa-egress-observation-20261002/proxy.ndjson)、[未处理 socket 错误控制](evidence/qa-egress-observation-20261002/unhandled.process.json)、[SIGKILL 账本](evidence/qa-egress-observation-20261002/kill.ndjson)与[真实进程结果](evidence/qa-egress-observation-20261002/kill.process.json)。控制中的 exit 1 / SIGKILL 是预期注入，不改写为正常退出。
- [资源清理记录](evidence/qa-egress-observation-20261002/cleanup.json)：只删除已按 ID/label 核对的研发自有 PG 容器和其匿名卷；清理前数据库其他连接为零，清理后容器/卷均不存在。自测桩、子进程及临时 TLS 私钥/证书已退出/删除。
- [逐文件 SHA256 清单](evidence/qa-egress-observation-20261002/sha256.json)：12 份原始文件按字节复制，未改写账本、进程结果或报告。

上述工程覆盖不改变 QA 的用例、断言、能力声明或验收结论。
