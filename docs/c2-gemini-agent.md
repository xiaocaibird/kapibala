# C2：独立 Gemini Agent 服务

2026-10-01。实现提交 `ef167e6527db6e0464f385a0d7d30a6ed24f6850`，基线 `fb1589df08f00c10e9e62801007b1698d4d0155a`，分支 `agent/c2-gemini-agent`。仅实现原文 2.2 / C2：独立 HTTP 服务，主后端通过 `AGENT_URL` 切换。没有改主后端、数据库迁移、网关能力、权限检查、审计执行、12 步或 60 秒预算；没有改原文、QA 目录、既有决策台账或演示资源。

## 使用方式

安装仓库 lock 对应依赖后，在本地未跟踪 `.env` 设置 `GEMINI_API_KEY`，或显式设置该环境变量（也接受 `GOOGLE_API_KEY`）。启动：

```sh
npm run dev:gemini-agent
```

也可以只读取另一个本地主工作区已有 `.env` 的密钥字段：

```sh
GEMINI_ENV_FILE=/absolute/path/to/main-workspace/.env \
GEMINI_SESSION_DIR=/absolute/path/to/private/gemini-sessions \
npm run dev:gemini-agent
```

服务不复制 `.env`，不把该文件的数据库、网关等字段导入进程配置。显式 Key 环境变量优先；本轮只读取了用户已有 Key 文件，没有修改它。服务默认输出一条 `gemini-agent-ready`，其中 `address` 是实际 `http://127.0.0.1:<随机端口>`。在已经准备好的后端环境中，将 `AGENT_URL` 改为这个地址；其他后端配置保持该环境原有值。

| 配置 | 默认及含义 |
| --- | --- |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite`；可以显式指定当前 Key 可用的 Gemini 型号，不静默换模型。 |
| `GEMINI_AGENT_PORT` | `0`，随机本机端口；需要稳定 `AGENT_URL` 时显式选一个空闲端口。 |
| `GEMINI_SESSION_DIR` | `.runtime/gemini-agent`；独立服务独占的私有会话目录。 |
| `GEMINI_ENV_FILE` | 仅当显式 Key 缺失时读取，缺省为当前目录 `.env`。 |

入口固定监听 loopback；没有添加与原后端不兼容的鉴权头要求，也没有开放远程监听配置。会话目录包含业务上下文，应位于受控本机存储中。该服务的请求正文、Key、模型原始错误正文不写日志；`GET /health` 只返回服务存活状态，不证明 Key 配额、模型可用性或审计完成。

`dev:isolated` 继续使用原模拟 Agent；它不会因为 `.env` 存在 Key 而自动产生真实模型调用。C2 要显式启动及配置。

## 协议与模型适配

独立目录 [apps/gemini-agent/src](../apps/gemini-agent/src/) 包含 HTTP 接口、协议验证、Gemini 客户端、会话存储和进程入口。不依赖业务数据库或模拟器状态。服务提供：

- `POST /agent/turn {runId,tools,messages}` → 原文要求的一个 `tool_use` 块，或一个 `end_turn/text` 块。
- `POST /agent/audit {text,groupId}` → `{verdict:"pass"|"fail",reason}`。基础设施或协议故障返回非 2xx，绝不补造审计 verdict。
- 四个工具固定为 `get_recent_messages`、`send_message`、`kick_user`、`finish`；重复/未知/缺失工具、required 缺参或非法 JSON Schema 返回 `400 TOOLS_INVALID`，不调用模型。支持 draft-07、2019-09、2020-12 的 metaschema 校验；未支持的 dialect 明确返回 `400 SCHEMA_DIALECT_UNSUPPORTED`。现有后端真实 `z.toJSONSchema` 工具声明已验证兼容。

已核查 [Google 官方库说明](https://ai.google.dev/gemini-api/docs/libraries)：官方 JS/TS SDK 是 `@google/genai`。本实现选择官方 [GenerateContent REST API](https://ai.google.dev/api/generate-content) 和 [结构化 JSON 输出](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)，只使用仓库现有 fetch / Zod，并把已有锁文件内的 AJV `8.20.0` 提升为直接依赖。没有引入 SDK 自动工具执行循环。

模型产生受约束的单个 `decision`，本地再次验证，转换成原单块协议；工具 ID 由服务生成并排除本 run 历史已用 ID。`send_message.idempotency_key` 保留模型提供的值，不因为失败替换成新 key。模型每次接收该请求完整、按原顺序的 `messages`，包括 assistant 块、全部 `tool_result`、`is_error`、错误 JSON 和 `PROTOCOL_ERROR` 文本，不静默截断或丢弃历史。

这里没有使用 Gemini 原生 function-call 消息、函数自动执行或签名链，而是每轮用完整原协议历史构造独立的结构化生成。因此无需伪造或丢弃原生函数签名；若供应方意外返回原生 `functionCall`、多候选、截断、安全阻断或不合法 JSON，服务明确失败，不选第一个工具或丢掉其余输出冒充正常响应。`end_turn` 仍仅作结束摘要，不能转成群消息。

模型没有网关、数据库、shell 或业务工具能力。实际工具调用、审计重试、账号选择、幂等、权限和确认仍在原后端。审计提示要求拒绝威胁、定向辱骂、诈骗、凭证泄露或绕过审批指令，普通回复和中性管理理由可通过；这是此独立服务的可读内容审核提示，不是账号权限证明。`/agent/audit` 只有 text/groupId，缺少成员角色及完整群策略，不能替代后端校验。

## 会话、读写和失败边界

原文要求按 `runId` 维护会话；实现按该 ID 的 SHA-256 命名文件，路径不使用原始 ID。会话记录包含完整最近请求历史、工具声明摘要、请求摘要、状态及已提交响应。不同 run 交错调用不会复用模型聊天状态。同 run 同时请求返回 `RUN_BUSY`，不同历史分叉返回 `RUN_HISTORY_CONFLICT`；已提交的相同请求返回同一个持久响应，不再次购买推理。

文件先写私有临时文件，fsync，再原子 rename 并同步目录，之后才向客户端返回。目录要求当前用户拥有、非符号链接、权限 0700；记录权限 0600，读取拒绝符号链接、错误归属、过宽权限、损坏数据或异常大文件。目录持有独占 `owner.lock`，防止两个进程同时写同一状态目录。正常关闭释放锁，已完成会话在重启后可返回缓存响应并继续新一轮；离线测试覆盖此路径。

硬崩溃可能留下锁和 `pending` 记录。服务不会猜测远端是否完成，也不会自动删除锁或重发该未决轮；仅在操作员核对原进程已退出及目录归属后处理残留锁，未决请求仍返回 `TURN_OUTCOME_UNCERTAIN`。已知生成错误保存 failed 状态并允许携带后端后续协议错误历史继续。状态文件没有自动 TTL，运行者负责私有备份和留存；不能在仍需重放的 run 下随意删除缓存并继续声称相同请求响应稳定。

2026-10-02 后续处置：[D053](decisions.md#d053--第二轮八项遗留的处置与一次定向复验) 已明确接受本轮人工恢复服务的限制。具体[人工恢复步骤](c2-manual-recovery.md)要求先停相关实例、核对精确目录及归属、完整备份后只处理遗留锁，保留原pending会话。步骤来自源码核对，本轮未执行人工恢复演练，不代替原自动恢复保证或QA通过。

这些措施提供独立服务自己的持久上下文和已提交响应缓存。它们不增加原协议的远端操作查询接口，也不解决主后端 `inflight_turn` 未知窗口、踢人未知结果恢复或 CAP003 严格物理终态 60 秒的问题。

| 边界 | 实际行为 |
| --- | --- |
| 并发与请求大小 | 最多 4 个在途模型请求，无无限队列；超量 429。HTTP 正文最多 1 MiB，超量拒绝；不截短历史后继续。 |
| 上游调用 | 固定 Google HTTPS 端点，Key 仅放 `x-goog-api-key` 头，禁止跟随重定向；没有自动请求重试或模型降级。 |
| 生成预算 | turn 上游最多等 9000 ms，audit 最多等 4000 ms；原后端 turn 10–15 秒 / 默认 12 秒、单次 audit 5 秒及总活动预算都不变。 |
| 输出限制 | 单候选；turn 最多 2048 输出 token，audit 最多 1024；上游 HTTP 响应最多 1 MiB，截断或超量明确失败。 |
| 取消 | 客户端断开或服务关闭会取消在途 fetch；这不能保证供应方已经停止计算或不会计费。 |
| 上游错误 | 401/403→`MODEL_AUTH_ERROR`，429→`MODEL_RATE_LIMITED`，400→`MODEL_REQUEST_INVALID`，其他网络/HTTP 故障→`MODEL_UNAVAILABLE`；超时→`MODEL_TIMEOUT`；不泄露上游原始异常。 |
| 后端语义 | 本服务非 2xx 仍按原协议由后端记 `BAD_JSON`；审计拿不到结论由后端最多尝试三次后 blocked；本服务不会自行授权执行。 |

## 当前 Key 的真实模型选择

[官方模型目录](https://ai.google.dev/gemini-api/docs/models)列 `gemini-3.1-flash-lite` 为稳定型号，[官方价格页](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite)在本次核查时列标准文本输入 $0.25、输出 $1.50 / 百万 token。API `models` 实际返回 200 并列出该型号；最终真实生成也成功，因此选择它为默认，可由配置更换。

选择过程保留失败：最先试的 3.5 Flash-Lite 在第二轮能读真实工具结果并提出发送，但审计三次没有明确结论，原后端正确 blocked 且没有发送。另一个 2.5 Flash-Lite 虽出现在列表里，实际生成探针返回不可用。3.1 Flash-Lite 的独立审计探针成功，随后完成整个真实后端工具往返。模型列表可见不等于 Key 已获该模型生成能力；一次较快返回也不是未来延迟保证。

## 开发验证：离线和真实 API 分开

源码绑定的 [最终真实 JSON](evidence/c2-gemini-live-final.json)及 [日志](evidence/c2-gemini-live-final.log)记录：专属 PostgreSQL UUID 库、真实模拟网关、正常后端模块与新 Agent HTTP 服务，只有合成账号群和文本。后端正常通过 `AGENT_URL` 调用新服务，没有业务库造事件或绕开审计执行。

| 最终真实场景 | 结果 |
| --- | --- |
| Gemini 请求 `get_recent_messages` | 后端实际执行并把结果传给下一轮模型。 |
| Gemini 请求 `send_message` | 新服务真实模型 audit 返回 pass；后端按原路径执行，真实网关及公开消息历史出现合成回复。 |
| 完成 | 第三步模型请求 finish，run `finished/final`，摘要“已成功发送确认消息。”。 |
| 独立拒绝审计 | 要求绕过审核并公开密码/Key 的合成文本获真实 `fail`。没有向模型提供任何真实密钥。 |
| 错误结果上下文 | 另一个 run 接收合成 `SEND_TIMEOUT` tool_result 后，真实模型返回 finish、摘要保留错误码、没有再次请求发送。该错误工具结果是显式合成场景，不假称这次网关实际超时。 |

最终运行约 21 秒，共 6 次真实调用，服务报告 5467 token；真实审计两次分别约 2859 ms / 2406 ms，模型 turn 约 1935–3832 ms。未延长任何原后端时限，也没有证明任意供应方负载下都能在该窗口内结束。

首次真实轮因输出 MIME 值使用 `application/json` 被当前 API 拒绝，后端记三次 BAD_JSON 后 failed；一次有界诊断确认需要 API 参考中的枚举 `APPLICATION_JSON`，后续修正。第二轮 3.5 型号如上 blocked。全部原始记录保留：

- [首次真实 JSON](evidence/c2-gemini-live-first.json) / [日志](evidence/c2-gemini-live-first.log)：3 次生成尝试，failed/protocol_errors。
- [第二轮真实 JSON](evidence/c2-gemini-live-second.json) / [日志](evidence/c2-gemini-live-second.log)：5 次尝试，2 次 turn 成功，三次审计未获结论后 blocked/audit_blocked。
- [模型选择探针](evidence/c2-model-selection-probe.log)：2.5 不可用；3.1 审计约 1639 ms 成功。
- [最终真实 JSON](evidence/c2-gemini-live-final.json) / [日志](evidence/c2-gemini-live-final.log)：6 次，闭环成功。记录的 5 个源码/测试 SHA-256 已与 `ef167e6` 核对一致。

本次总计一次模型列表读取和 **17 次生成尝试**：三轮 3+5+6，一次 MIME 诊断和两次模型探针。各真实轮最多 8 次生成、每次业务 payload ≤32768 B，输出上限如前表，测试整体限 120 秒。失败或取消响应没有 usage 时不记作零消耗；这不是账单核验，也不是生产终生调用限额。最终成功后没有继续追加付费调用。

[离线专项](evidence/c2-offline-final.log)为 14 项通过：使用可注入的假供应方证明四工具原协议兼容、JSON Schema、全历史错误保留、跨 run 隔离、持久缓存与重启、分叉/损坏/符号链接/双写拒绝、非法或多决定拒绝、审计 fail 和异常、并发上限、HTTP 错误/限流/超时与取消。另含独立子进程的本地 Key 文件读取、随机监听、原协议请求、日志不带 Key、退出 0 和锁释放；该进程入口专项没有发真实模型请求。保留 [较早的 13 项离线记录](evidence/c2-offline-first.log)，它先于真实 API 字段修正，不能代替真实验证。

[既有后端 Agent 兼容专项](evidence/c2-backend-compatibility.log) 1 项通过，涵盖幂等 key、坏响应、审计阻塞与不自触发，仍使用原模拟 Agent。类型检查、原文校验、diff 检查见 [静态检查](evidence/c2-static-checks.log)；原文 SHA-256 未变。

复现离线检查无需 Key 或数据库：

```sh
node --import tsx --test tests/integration/gemini-agent-protocol.test.ts \
  tests/integration/gemini-agent-provider.test.ts tests/integration/gemini-agent-main.test.ts
```

真实测试默认跳过，只在明确提供自有专属 PostgreSQL 和 Key 后启动；会产生真实模型调用：

```sh
DATABASE_URL='<自有专属PostgreSQL服务，路径 /postgres>' \
GEMINI_LIVE_TESTS=1 GEMINI_ENV_FILE=/absolute/path/to/local/.env \
GEMINI_LIVE_EVIDENCE_PATH=/absolute/path/to/owned-output.json \
node --import tsx --test tests/integration/gemini-agent-live.test.ts
```

## 清理与交付范围

[清理记录](evidence/c2-cleanup.json)保存专属容器完整 ID、归属标签和端口；删除前 UUID 测试数据库及会话均为零，再删除该容器及唯一匿名卷并确认不存在。三轮真实测试自己的临时模拟器/会话目录均已删除；独立入口子进程确认退出；临时依赖软链接已移除。旧 QA staging 保留。所有 Key 扫描仅输出是否匹配，不输出值；本任务源码和证据未发现真实 Key。

未修改用户 `.env`、5173、用户数据库或 QA 资产，未合 main、未 push、未联系 QA。此 C2 是可选独立服务交付，不把真实模型接入计作既有严格时间或未知效果问题的修复，也不替代独立 QA 验收。
