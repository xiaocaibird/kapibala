# C1 媒体文件管理

来源：原文 `docs/original-interview-question.md` 的 C1 和网关 `message.mediaUrl` / `GET /media/:id`。本功能不修改原文、QA 资产、网关协议或 Agent 的工具格式，不需要真实模型。

## 数据与配置

新增迁移 `009_media_files.sql`。`messages.local_file_path` 投影为消息 API 的可选 `localFilePath`；没有附件的旧消息响应保持原形，尚未下载、不可用或已清理的附件返回 `null`。路径是服务器本地绝对路径，未新增静态文件服务，也不把本地路径送给外部模型。完整配置及默认值见 README / `.env.example`。

`media_files` 按 `(group_id,msg_id)` 去重并保存来源、重试时间、完整文件位置和处理中状态。事件事务只登记任务；网络与文件 I/O 由后台独立处理。相同事件或历史重放不会重新下载已删除文件，也不会覆盖第一次记录的来源。旧消息的 `metadata.mediaUrl` 在升级时回填；网关已经过期时按真实 404 记录不可用，消息文本继续可读。

媒体只接受配置的 `GATEWAY_URL` 同源 HTTP(S) `/media/:id`。拒绝其他源、其他路径、凭据、查询串、片段和危险路径字符，不跟随重定向。文件名由内部 UUID 生成，来源不能指定磁盘路径。新建目录 0700、文件 0600；打开文件使用 `O_NOFOLLOW`，完整文件通过独占硬链接发布，不覆盖既有文件。

同一数据库通过会话锁最多执行一条下载流，每轮最多两项，串行处理。默认单次 15 秒、单文件 20 MiB，同时检查声明长度和实际流中字节数。响应直接流到临时文件，不完整缓冲整个附件。网络错误、408、429、5xx 指数退避，最长间隔五分钟；其他 3xx/4xx、非法 URL、超限转为不可用。后台需要正常 tick 才会继续工作；这些数值不是数据库或操作系统任意阻塞下的物理时限承诺。

## 发布、清理与恢复顺序

1. 下载前持久保存 `downloading` 及临时文件名；完成字节写入、文件 fsync、独占链接和目录 fsync 后，事务发布 `ready` 和消息路径。失败不会把半文件发布给消息。
2. 下载中断后删除原临时文件并重新下载。完整文件已发布、数据库未保存时，重启复用该文件；不会因来源此时 404 丢失已完成的附件。保留期从完整文件时间起算，重试发布不延长其寿命。
3. 每轮清理至多 50 项。先锁定文件行，重新检查运行中引用，然后在一个事务中保存 `deleting`、清空媒体与消息路径，提交后才 unlink。文件删除后保存 `deleted`。任一窗口崩溃都可由后续 tick 继续，已删文件不会保留公开的数据库路径。
4. unlink 失败保留无路径的删除意图，按清理间隔重试，其他候选继续。保留状态行用于阻止历史重放复活附件。

`localFilePath` 是当前文件可用性字段：时间线快照只冻结已有消息内容、身份、顺序与确认状态，存储时剥离文件路径，响应时查询当前附件状态。旧游标在文件删除后返回 `localFilePath: null`，不会留下历史 JSON 中的永久悬空路径。媒体状态变化发出原 `message` 类型的 `changeKind: media` 通知，供现有资源刷新使用，不计为新的入站消息或提醒。

## Agent 引用与并发

run 创建时登记触发消息附件，`get_recent_messages` 的读取事务登记该次结果消息的附件。引用包含尚未完成的下载，保存为 `agent_media_references`；模型的上下文和工具结果仍使用原文的文本字段。工具结果因 8 KiB 限制省略的消息可能被保守多保留到 run 终态。

引用登记与清理使用同一文件行锁。引用先提交，清理会保留文件；清理先取得锁并提交删除意图，后来读取不能登记一个已经不可用的附件。`status=running` 包括因未知远端效果暂停恢复的 run，重启不会丢失保护。迁移时无法重建旧版每次工具读取的引用，所以保守保护旧 running run 所在群的已有媒体，直至 run 终态。

自身消息回声与发送确认可能合并记录；确认也按“文件行 → 消息行”加锁，与发布、清理顺序一致，避免确认事务把旧路径重新复制到已经清理的消息中。

## 运行边界

`MEDIA_DIR` 必须是服务独占管理的持久目录；同一数据库的多实例须共享同一路径及同一文件系统。不能使用各实例彼此独立的本地卷。启动会核对持久位置，目录配置改变时拒绝启动；迁移目录需要运维协调备份、停服与数据位置，当前没有自动迁移接口。应用管理范围外的人工删文件、磁盘丢失、文件系统篡改不属于崩溃恢复保证。

保留期只作用于附件文件；消息文本、来源、删除意图、历史 run 和引用账本仍保留。当前没有整个媒体卷的总配额，吞吐持续高于保留期容量时仍需监控磁盘空间。运行中暂停会保守延长文件保留。文件系统 I/O 失败会留下可重试状态及日志，不伪装成已完成。

## 开发验证

测试使用专用 PostgreSQL 17 容器、逐用例 UUID 数据库、随机端口 HTTP 服务和逐用例临时文件目录。没有访问演示环境、用户 5173、QA 冻结服务或真实模型。详细测试日志及资源清理记录随本提交保存；这些属于开发验证，不代表独立 QA 已验收。

产品来源：基于 `fb1589df08f00c10e9e62801007b1698d4d0155a`，主体提交 `9d0e81e0f86f41986bbd42bb006e751b2fadc8c6`，响应体释放补充提交 `5e3b5cecbe11e404c4d88a0189139bfb4ca37b47`。后者只确保文件打开失败时关闭尚未消费的 HTTP 响应，并增加对应开发反例。

| 验证 | 结果与证据 |
| --- | --- |
| 最终 C1 专项 | [17 通过，0 失败/跳过](evidence/c1-media-focused-complete.tap)：旧版迁移、来源校验、重复事件及多 worker、退避/404/重定向/超限/超时、文件打开失败释放响应、自身消息确认合并与清理竞争、配置保留期、删除失败继续其他文件、旧游标路径清空、双向 run 引用竞争、实际 Agent 工具路径、三处真实 SIGKILL 恢复 |
| 既有消费者合跑 | [280 通过、4 跳过、4 启动失败](evidence/c1-media-consumer-regression.tap)。覆盖全部前端单元测试及 gateway、gateway-stream-repair、platform、automation、agent-dispatch-budget、agent-kick-recovery、migration-integrity、core-resource-observability。4 项失败均是 CAP009 控制器拒绝未提交源码，未进入业务断言；原始日志保留 |
| 提交后恢复专项重跑 | [23 通过，0 失败/跳过](evidence/c1-media-committed-regression.tap)，包括当时全部 16 项 C1 和 7 项 CAP009；前轮 4 项已实际通过，不修改控制器或断言 |
| 构建与原文 | [最终 build](evidence/c1-media-build.txt) 和[原文校验](evidence/c1-media-original.txt)通过。测试观察包装器曾有一次泛型签名编译错误，[原日志](evidence/c1-media-build-test-wrapper-initial.txt)保留，修正后重新完整 build |
| 隔离启动 | [真实 smoke](evidence/c1-media-isolated-smoke.txt)通过，健康返回 `schemaVersion: 9`，随机 web/api/gateway/agent 端口，自动清理完成 |
| 清理 | [精确清理记录](evidence/c1-media-cleanup.json)：C1 容器及匿名卷已删除；删除前测试数据库与会话均为 0；日志内 68 个临时目录全部不存在；smoke 自有目录、容器、卷均不存在 |

首轮 [10 项媒体日志](evidence/c1-media-focused-initial.tap)及补并发反例后的 [14 项日志](evidence/c1-media-focused-final.tap)亦保留。SIGKILL 用例使用真实子进程、真实 HTTP 和 PG 触发器：分别观察已写入临时文件、完成文件已落盘且 `ready` 未提交、物理删除完成且 `deleted` 未提交，再杀进程。PG 触发器的睡眠只用于固定观察窗口，恢复断言不依赖网关新增能力；完成文件的恢复将来源改为 404，仍验证只发生一次 HTTP 下载。

复现最终专项（使用专用 PostgreSQL 连接，测试自行创建 UUID 数据库）：

```sh
DATABASE_URL='<专用测试 PostgreSQL 连接>' npx tsx --test tests/integration/media-files.test.ts
npm run build
npm run verify:original
npm run dev:isolated -- --smoke
```

如果运行 `agent-kick-recovery.test.ts`，先提交工程源码；受控 SUT 的既有归属检查会拒绝未提交的产品/控制器代码。4 个既有跳过项为前端 20 秒 refresh 等待及三个需显式开启的长时间 automation timing 用例，本轮没有将它们计为通过。
