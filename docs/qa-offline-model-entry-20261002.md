# 第二轮 C2 独立离线模型进程入口

本入口让独立 QA 通过真实 HTTP 启动 C2 适配服务，并把实际 `GeminiProvider` 的固定 Google 请求映射至 QA 自有的本机 HTTP provider 桩。请求体、响应字节、provider 解析、服务校验、session/history、缓存及 usage 均走实际研发实现。QA 驱动无需导入产品模块。

入口仅为 `scripts/qa-gemini-agent.ts`，不接入 `dev`、`dev:gemini-agent` 或生产启动路径。它不读取 `.env`、`GEMINI_ENV_FILE`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`，没有真实 provider 或外网 fallback。此材料提供执行接入能力，本身不授予第二轮执行、真实模型收费调用、合并或上线权限。

## 启动与配置

使用工程锁文件安装的依赖，以及项目要求的 Node 24。先由 QA 启动并拥有一个 HTTP provider 桩，再填写其实际监听端口：

```sh
qa_session_directory=$(mktemp -d "${TMPDIR:-/tmp}/kapibala-qa-gemini.XXXXXX")
QA_GEMINI_OFFLINE=true \
QA_GEMINI_PROVIDER_URL=http://127.0.0.1:49152 \
QA_GEMINI_SESSION_DIR="$qa_session_directory" \
node --import tsx scripts/qa-gemini-agent.ts
```

`49152` 仅示例，须替换为当前自有桩的实际端口。QA 应保存子进程 PID、ready 行和资源归属，关闭后只清理自己的目录。入口不自动连接业务数据库或主后端，不启动 provider 桩。

| 配置 | 契约 |
|---|---|
| `QA_GEMINI_OFFLINE` | 必须精确为 `true`，缺失或其他值均拒绝启动。 |
| `QA_GEMINI_PROVIDER_URL` | 必填，仅接受原始拼写 `http://127.0.0.1:<1..65535>`，可有一个末尾 `/`。端口必须显式且无前导零。不接受 hostname、IPv6、其他 loopback 别名、HTTPS、凭据、路径、query 或 fragment。 |
| `QA_GEMINI_SESSION_DIR` | 必填绝对路径；复用实际 `SessionStore` 的所有者、0700 目录、独占 `owner.lock` 和私有文件保护。没有默认目录。 |
| `QA_GEMINI_MODEL` | 可选，默认 `gemini-3.1-flash-lite`；通过实际 `GeminiProvider` 的模型名校验。不会改用该模型的真实网络服务。 |
| `GEMINI_USAGE_ENABLED` | 沿用实际 usage 配置，精确 `false` 关闭，默认开启。 |
| `GEMINI_USAGE_MAX_RECORDS` / `GEMINI_USAGE_MAX_BYTES` / `GEMINI_USAGE_MAX_AGE_DAYS` | 沿用实际 usage 配置及限制；默认 1000 条、2097152 字节、30 天。非法限制沿用 usage 的固定诊断与降级语义，不伪造 usage 成功。 |

服务只监听 `127.0.0.1` 随机端口，不读取 `GEMINI_AGENT_PORT` 或普通 `GEMINI_MODEL`。provider 桩须接收 `POST /v1beta/models/<model>:generateContent`；header `x-goog-api-key` 恒为 `qa-offline-synthetic-key`。桩按 Gemini HTTP JSON 格式返回结果，而不是直接返回 `/agent/turn` 或 `/agent/audit` 的最终业务响应。

映射仅发生于 provider 的 fetch transport 注入点：只接受它构造的精确固定 Google URL 与 POST 字符串 body，然后用原生 HTTP 直接连接数值 `127.0.0.1` 和已校验端口。独立 `agent: false` 不使用 Node 的全局代理 agent；请求不会因 `HTTP_PROXY`、`HTTPS_PROXY` 或 `NODE_USE_ENV_PROXY` 改走代理。301/302/303/307/308 全部拒绝，任何地址的重定向都不会发起第二个请求；没有重试或其他目标选择路径。

## Ready、错误与公开端点

启动成功后 stdout 输出单行 JSON；以该行取服务地址，不猜端口：

```json
{"event":"qa-gemini-agent-ready","address":"http://127.0.0.1:54321","model":"gemini-3.1-flash-lite","offline":true,"providerOrigin":"http://127.0.0.1:49152","providerTransport":"loopback-http","credentialSource":"synthetic","sessionDirectory":"/absolute/owned/directory"}
```

公开端点与实际服务一致：`GET /health`、`POST /agent/turn`、`POST /agent/audit`，请求/响应契约见 [C2 说明](c2-gemini-agent.md)。ready 只证明服务已监听并取得 session owner，不证明 provider 桩健康或任何业务用例通过。

启动失败退出码为 1，stderr 单行 `{"event":"qa-gemini-agent-start-failed","code":"..."}`。入口自有错误码为 `QA_OFFLINE_REQUIRED`、`QA_PROVIDER_URL_INVALID`、`QA_SESSION_DIRECTORY_REQUIRED`；模型和存储错误继续输出实际 `MODEL_NAME_INVALID`、`SESSION_DIRECTORY_UNSAFE`、`SESSION_DIRECTORY_LOCKED` 等 `AgentError.code`。其他启动异常统一 `CONFIG_OR_STARTUP_ERROR`，不输出异常正文、凭据或 provider 响应体。

HTTP 运行时错误由真实服务/provider 处理：429 → `MODEL_RATE_LIMITED`，401/403 → `MODEL_AUTH_ERROR`，400 → `MODEL_REQUEST_INVALID`，其他非成功状态、断连或拒绝重定向 → `MODEL_UNAVAILABLE`；非法 JSON/模型结构走实际 `MODEL_INVALID_OUTPUT`。已取得的合法 usage 不因后续输出校验失败丢弃；非成功 HTTP 不解析 body 用量，缺失保持 `null`，明确合法 0 保留。入口不改判结果、不补零、不生成 PASS。

## 关闭、恢复与资源归属

对保存的入口 PID 发送 SIGINT 或 SIGTERM，沿用真实服务的 in-flight abort、等待已发起任务结算、usage flush 和 owner 核对；成功退出码 0。关闭失败退出码 1，stderr 为 `qa-gemini-agent-stop-failed` 及固定 code。

正常关闭只由实际 `SessionStore` 核对本进程 owner 后释放自己的锁；不会删除未知或变化的 owner。SIGKILL 后的 `owner.lock` 保留，直接重启会返回 `SESSION_DIRECTORY_LOCKED`。QA 不得通过自动删锁制造恢复通过；需要隔离恢复场景或明确人工核实所有权。入口不自动删除 session、history、usage 或整个目录。

## 研发验证及证明范围

开发进程级测试 `tests/integration/qa-gemini-agent-process.test.ts` 从实际入口启动子进程，只经服务 HTTP 与真实本机 HTTP 桩交互，核对：

- 原请求路径、合成 key、完整历史、真实 provider JSON 解析及 service 校验；相同请求缓存、历史冲突和正常关闭后重启缓存。
- 成功、失败、无效输出与已知/未知用量，非成功状态不解析 body；usage 在关闭后实际落盘。
- 离线标志、非标准/非 loopback/无端口/凭据/query/fragment/path 地址的启动拒绝；错误配置在创建 session 前失败。
- 代理探针零调用；所有标准重定向无第二次本机请求；真实 Google 地址重定向也被本地拒绝。
- 双进程独占、SIGINT 正常释放、SIGKILL 锁保留、owner 被替换后拒绝删锁，以及真实未完成 HTTP 请求在 SIGTERM 时取消并落 usage。

测试仅使用合成凭据、自有临时目录和随机本机监听端口，结束回收自有子进程、连接、服务和目录。`.env` 被设为不能作为文件读取的目录，并测试无 key 环境启动；不需要读取任何真实凭据。

```sh
node --import tsx --test tests/integration/qa-gemini-agent-process.test.ts
```

本入口只证明可执行的离线接入链。它不证明真实 Gemini 网络、TLS、认证、收费、提供方模型行为或模型安全性，也不替代 QA 第二轮用例执行、主后端工具授权与事务验证、真人体验或上线结论。桩应发送未压缩的原始 Gemini JSON HTTP 响应；此受控 HTTP transport 不提供生产 fetch 的压缩解码、代理或外网能力。

本次最终研发验证：入口六组进程测试及既有 provider/protocol/usage/main 相关回归共 **25/25 PASS，0 FAIL，0 SKIP**；`npm run build`（含边界校验及前后端类型检查）与 `npm run verify:original` 通过。代理场景同时启用 `NODE_USE_ENV_PROXY=1`、大小写 HTTP/HTTPS proxy 配置并清空 NO_PROXY；桩收到实际调用而代理探针收到 **0** 次请求。相关原始日志和源文件哈希见 [验证记录](evidence/qa-offline-model-entry-20261002/verification.json)。这 25 项是研发验证，不写入或代签独立 QA 用例结果。
