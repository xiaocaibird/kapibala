# P1-01 / P1-05 开发交付与测量

2026-10-02。开发源 `544c4f9ce71b5dd893be286853a35df340072a7d`，基线 `ac5e8e639237070fb5c48751ce04a7645b4a19ab`，独立分支 `agent/final-enhancement-measurement`。本轮已获得两项实施授权；旧提案中的“尚未授权”属于此前状态。本报告仅报告开发及开发自测，供负责人 review；未合入 main、未推送、未启动新 QA 或修改 QA 资产。

## 结果与精确改动

- **P1-01：** 完成真实 PostgreSQL 1,000 / 10,000 条测量，并依据同库、同快照、同参数对比，仅替换 `apps/server/src/modules/gateway/index.ts` 时间线**续页**的一个 SELECT 及注释。JSONPath 一次范围切片代替按 position 逐次提取同一个 JSONB；两端仍先限制到数组长度。未改首次读取、快照格式、游标格式、存储结构或索引。群 Agent 取消入口不在此分支改动内。
- **P1-05：** Gemini 服务记录真实生成尝试的服务内 request/attempt ID、用途、模型、耗时、输出校验结果、可得 runId 与供应方报告的 token。正式入口接入有界私有日志，缓存命中不新增推理记录，失败缺失用量为 `null`。日志失败可诊断且不改变请求结果。未增加真实模型调用、费用或后台协议字段。
- **开发验证：** 固定源组合 **32 通过、0 失败、0 跳过**，`npm run build` 通过，原文校验通过。尚无本版独立 QA 或人工验收结论。

## P1-01：真实测量

夹具为 [timeline-measurement.test.ts](../tests/integration/timeline-measurement.test.ts)，默认跳过，须显式 `TIMELINE_MEASUREMENT=1`。它只从 `DATABASE_URL` 取得连接参数，创建 UUID 临时库后迁移；不写该 URL 原数据库。真实 loopback HTTP 调用正常 `createApp`、鉴权及 gateway 路由，后台调度关闭，未连接外部网关或 Agent。每档含被测群 N 条、控制群 N 条，共 2N 条；人工合成消息约 240 个 ASCII 字符，10% 已受理自发消息，2% 具有早一天的时间戳，十条左右共享一个秒级时间戳，插入顺序独立于发送顺序。高重复合成文本压缩较好，并不代表所有实际消息分布。

环境：PostgreSQL 17 Alpine、`work_mem=4MB`，精确版本、Node 版本、索引定义、ANALYZE 统计、SQL、参数、EXPLAIN 完整树、buffers、行数、API 字节及源码 SHA-256 都在每档 JSON。仅现有主键/唯一索引与消息队列部分索引；没有新增索引。EXPLAIN 在 API 样本之后执行，数据已经变热，不属于冷盘测试。

### 同快照候选比较

候选评估保持原产品源码，在同一临时库对旧 SQL 和新 SQL 实际执行并校验结果全等；随后分别采集 EXPLAIN。没有用客户端计时替代服务端计划。

| 群消息数 | 原续页 SQL Execution Time | 候选 SQL Execution Time | 原 / 候选 Shared Hit Blocks |
| -------- | ------------------------: | ----------------------: | --------------------------: |
| 1,000    |                  7.046 ms |                0.614 ms |                    267 / 22 |
| 10,000   |                 64.340 ms |                4.760 ms |                  1910 / 146 |

候选仍按主键找到同一完整 JSONB 快照，只改善切片表达式。偏移 0、49、最后一条、数组末尾、`Number.MAX_SAFE_INTEGER` 的结果与原 SQL 全等；JSONPath 下标先钳到数组长度，避免大偏移整数溢出。[候选原始记录](evidence/final-enhancement-measurement/candidate.tap)、[1,000 条计划](evidence/final-enhancement-measurement/candidate/timeline-1000.json)、[10,000 条计划](evidence/final-enhancement-measurement/candidate/timeline-10000.json)。

### 实际 HTTP 与固定源结果

每格是一次 HTTP 请求到完整响应正文读完的实测值，包含真实 loopback/鉴权/数据库/JSON 序列化开销；两版来自分别创建的隔离库。它们不是统计分位数、生产容量或所有负载下的保证。

| 群消息数 |     原首屏 / 续页 |  新版首屏 / 续页 | 新版首屏 / 续页响应字节 |
| -------- | ----------------: | ---------------: | ----------------------: |
| 1,000    |  18.89 / 10.95 ms |  23.73 / 5.93 ms |       22,961 / 22,955 B |
| 10,000   | 114.89 / 68.55 ms | 120.66 / 8.58 ms |       23,065 / 23,059 B |

新版固定源续页 EXPLAIN Execution Time 为 0.927 / 4.313 ms，Shared Hit Blocks 为 22 / 146。首次全群查询仍返回 1,000 / 10,000 行；初次测量该查询从 PG 传入进程的行 JSON 约 713,629 / 7,157,182 B，完整快照 JSON 为 455,929 / 4,580,182 B。快照压缩后的 `pg_column_size` 为 27,824 / 274,969 B。首次读全历史、保存完整快照的成本保留；此修改不是增量历史存储，也没有缩短历史或删快照。

最初计划中首次全群排序仅约 0.481 / 5.207 ms，而 50 条续页的重复 JSONB 提取约 7.727 / 64.763 ms，因此没有盲目增加排序索引。进程内存只记录请求前后 heap/RSS 差值，可能受 GC 影响为负；不是峰值或归因后的内存节省证据。

验证覆盖：同时间戳消息顺序、迟到插入、出站 accepted→sent 同时变更发送时间、原游标跨变更继续逐页读取全部原快照、不同分页大小、空快照、超尾部及极大偏移。旧游标的身份、顺序和所有字段完全不变，新快照反映确认后的顺序和新增消息。既有 `core-resource-observability.test.ts` 的错误/跨群游标、完整冻结快照回归也通过。[最初基线](evidence/final-enhancement-measurement/baseline.log)、[新版固定源 1,000](evidence/final-enhancement-measurement/final/timeline-1000.json)、[新版固定源 10,000](evidence/final-enhancement-measurement/final/timeline-10000.json)。较早新版样本保留在 `after/` 和 `after-initial.tap`，不覆盖为最终样本。

## P1-05：有界模型用量记录

[provider.ts](../apps/gemini-agent/src/provider.ts) 每次实际 `generate` 都产生一份完成观察，包括超时、取消、HTTP 错误、非法输出、安全阻断等失败。供应方报告且经过非负安全整数检查的 `promptTokenCount`、`candidatesTokenCount`、`totalTokenCount` 分别保留为 `inputTokens`、`outputTokens`、`totalTokens`；缺失或非法字段明确为 `null`。供应方明确返回的 0 保留为 0。局部输出校验失败仍可保留已经收到的真实用量，不推算或补齐 token，也不计算费用。

[app.ts](../apps/gemini-agent/src/app.ts) 在 HTTP 请求内生成 request UUID，每次实际调用前生成 attempt UUID；turn 可关联协议实际提供的 `runId`，audit 没有 run/step 信息，保存 `runId:null`。这些是服务内标识，不是供应方请求 ID、后端 step ID，也不能据此宣称完成跨服务审计关联。整个请求进入持久会话缓存复用分支时不调用 provider，不写新推理记录；开发测试覆盖服务重启后的同请求复用。

日志 `stage=validated-generation` 的 `outcome=success` 只表示模型返回及本地输出协议校验成功，**不代表业务工具已执行、消息已发送、审计给予许可，或完整 HTTP 请求/会话持久化成功**。合法的审计 fail 也属于成功读取了一份有效审计结果。`elapsedMs` 是 provider 开始到返回/抛错的真实本地单调时间，不是后端端到端耗时；`observedAt` 是 provider 完成观察时间。失败 `errorCode` 使用固定白名单，不写原始异常、正文、系统提示、工具输入/输出、凭据或供应方响应体。

### 配置、留存与清理

[main.ts](../apps/gemini-agent/src/main.ts) 默认启用 [usage.ts](../apps/gemini-agent/src/usage.ts)。只使用进程环境中的以下选项，不额外读取任何 Key 文件。记录在 `${GEMINI_SESSION_DIR}/usage/usage.jsonl`；外层 SessionStore 的独占 owner.lock 保护该服务整个目录，不增加跨进程共享日志写入。

| 配置                        | 默认    | 有效范围 / 行为                                                |
| --------------------------- | ------- | -------------------------------------------------------------- |
| `GEMINI_USAGE_ENABLED`      | 启用    | 仅字符串 `false` 关闭；关闭不创建 usage 目录，也不删除既有记录 |
| `GEMINI_USAGE_MAX_RECORDS`  | 1000    | 整数 1–10000                                                   |
| `GEMINI_USAGE_MAX_BYTES`    | 2097152 | 整数 4096–16777216；按 UTF-8 JSONL 实际字节限制                |
| `GEMINI_USAGE_MAX_AGE_DAYS` | 30      | 整数 1–365；启动及写入时清除超龄记录，没有额外定时器           |

目录要求当前进程用户拥有、非符号链接、0700；既有记录要求普通单链接文件、当前用户拥有、0600，最大读取 16 MiB。每条通过严格白名单 schema，最大 4096 B。内存等待队列最多 64 条，加一份至多 64 条的在写批次；满队列明确丢弃额外观察并输出一次 `USAGE_QUEUE_FULL`。写入合并受限旧记录与新批次，裁剪年龄/条数/字节，再写私有临时文件、fsync、原子 rename；活动写入期间至多同时保留旧、新两份受限日志。

启动仅清理由本日志产生、符合精确 `usage-<UUID>.tmp` 名称且归属/权限安全的崩溃临时文件，其他文件不删除。已有日志不安全或配置非法时输出 `USAGE_STORE_UNAVAILABLE` 并停用本次可选记录；运行期写失败输出 `USAGE_WRITE_FAILED`，无效记录输出 `USAGE_RECORD_INVALID`。诊断只含固定事件/码，同一实例每类只报一次；不把文件路径、异常原文或记录内容混入诊断。

模型响应不等待日志落盘；文件写失败不改变模型/API 结果，服务正常关闭会等待已经入队的有限写入。它是尽力留存的开发/运营观察，不是完整计费账本：队列溢出、磁盘故障或进程硬退出会丢失未持久观察。文件系统/调度停顿仍可延迟启动或关闭，不承诺物理 I/O 时限。

若要人工清理已留存用量，在确认本服务已停止后，只处理专属 `usage/usage.jsonl` 与已核对归属的 `usage-<UUID>.tmp`。不要为了清用量删除整个 `GEMINI_SESSION_DIR`、会话 `.json` 或仍被运行实例持有的 `owner.lock`；那会影响原有响应重放保证。

## 开发验证与复现入口

[固定源最终日志](evidence/final-enhancement-measurement/final-tests.tap) **32/32**：既有 provider、协议、独立正式入口、core-resource 回归，加 5 项新的用量场景、2 项规模案例。用量场景实际使用生产 GeminiProvider 配合离线合法 Response；覆盖校验成功/失败、真实 AbortSignal 超时/取消、未知/非法/明确零用量、同请求及重启缓存、私有权限、条数/字节/年龄裁剪、崩溃临时文件、关闭配置、不安全路径、写失败及队列上界。正式 main 子进程仅用合成 Key、health 和拒绝推理的非法请求，验证默认私有日志文件存在且为空；**真实模型生成调用数为 0**。

```sh
# DATABASE_URL 必须指向专属测试 PostgreSQL；夹具会自行创建/删除 UUID 库。
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 TIMELINE_MEASUREMENT=1 \
  TIMELINE_MEASUREMENT_OUTPUT=/absolute/path/to/new-evidence-directory \
  DATABASE_URL='postgres://test-user:test-password@127.0.0.1:TEST_PORT/postgres' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/gemini-agent-provider.test.ts \
  tests/integration/gemini-agent-protocol.test.ts \
  tests/integration/gemini-agent-main.test.ts \
  tests/integration/gemini-agent-usage.test.ts \
  tests/integration/core-resource-observability.test.ts \
  tests/integration/timeline-measurement.test.ts
```

纯 Gemini 离线四文件无需数据库，可省去 `DATABASE_URL`、测量开关及最后两个文件。请使用新的证据目录，不覆盖本报告原始样本。已有 `TIMELINE_COMPARE_SLICE=1` 是原 SQL 上评估候选时的开发开关；在已替换查询的新版本开启它会比较同一个新 SQL，不能称作新的前后收益对比。

[构建日志](evidence/final-enhancement-measurement/build.log)、[原文校验](evidence/final-enhancement-measurement/original.log) 均成功；原文 SHA-256 为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。最终源 SHA/源码摘要与命令日志一起留存，不把初步样本当最终源执行。

## 资源归属与未覆盖范围

只创建 `kapibala-final-measurement-20261002` 容器，loopback 动态端口 60617，标签 `kapibala.task=final-enhancement-measurement`。结束时临时库和连接均为 0，随后按捕获的完整容器 ID 删除本容器及其唯一匿名卷；二者均确认不存在。[精确清理记录](evidence/final-enhancement-measurement/resource-cleanup.json)。测试创建的 HTTP 服务、进程、临时会话目录均由夹具关闭/移除；没有读取用户 Key、真实模型请求、演示环境、其他任务容器或业务数据。

尚未覆盖：生产规模/真实分布/持续并发性能，长期 usage 压力及真实供应方账单核验，跨服务后端 step 审计关联，任意存储故障下完整留存，第二轮 QA/联调/人工验收。现有首屏全快照存储与原系统时限/未知外部效果边界均保留，不借本次局部测量声明全部质量问题结清。
