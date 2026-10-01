# C1 媒体接入操作与故障观察契约

后续补充：本文件下述无 C1 精确窗口的判断对应原固定源 `f639ee7`。2026-10-02 新增的显式工程入口能力及固定候选开发验证见[媒体引用/清理精确观察契约](qa-media-reference-observation-20261002.md)；普通生产入口、保留期和外部协议不变。QA 仍须取得负责人冻结的新源并独立验证，不能把历史固定源直接视为已有新 capability。

2026-10-02。本文只交接已经存在的机制、研发复现方法和证据边界，供 QA 独立接线；不新增产品能力，不复制研发断言作为 QA 用例，不修改 QA 资产。本次为只读梳理，未重新启动服务、数据库或故障实验，未产生新的产品 PASS。

核对产品源为 `f639ee75c5559f3ee8923af5dcbb53e9b41b168c`。其媒体模块、媒体开发测试、单 worker 子进程入口及全部迁移，与已有组合验证源 `210df671942908fc1682cef6e29b7ba9563a2a31` 的对应文件字节一致。历史 [C1 专项](evidence/c1-media-followup-after.tap)记录 19 项开发通过，后续[组合记录](c1-c2-final-combination-20261001.md)包含 20 项媒体开发检查；都是各自固定源的研发证据，不替代当前 QA 执行。功能与配置说明见[C1 文档](c1-media-files.md)，一般启动交接见[C1/C2 交付](c1-c2-delivery-20261001.md)。

## 两种运行入口

| 入口 | 实际运行内容 | 可见就绪与限制 |
|---|---|---|
| `node --import tsx apps/server/src/main.ts` | 标准应用启动，gateway 恢复后启动 SSE，正常后台每 100ms 调度；gateway 在自己的受控任务中调用真实媒体 `tick` | `GET /api/health` 返回 `ok: true, schemaVersion: 9` 证明服务启动，不能证明某文件或故障窗口已到达 |
| `node --import tsx scripts/qa-observation-server.ts` | 同一标准 gateway/automation，外加原有 capacity/message/runtime 观察桥 | 要求原有显式 registry、owner token、数据库、端口和远端配置；没有 C1 专用 checkpoint、虚拟媒体时钟或触发清理 API，不必为了普通媒体下载启用此入口 |
| `node --import tsx tests/support/media-worker-process.ts` | 研发子进程只构造一个 `MediaFiles`，顺序调用 `recover()`、一次 `tick()` 后退出；真实 HTTP、文件和 PG I/O | 无 HTTP health、ready 文本或循环调度。已有精确 SIGKILL 实验使用此入口，父测试负责准备事件/库、观察、杀进程和恢复；它不是全应用端到端运行 |

标准入口使用显式 `DATABASE_URL`、`GATEWAY_URL`、`AGENT_URL`、`PORT`、`MEDIA_DIR`；不要回落默认资源。媒体目录为 QA 自有持久绝对路径，同库重启和同库多实例使用同一物理目录。迁移先用最终候选的 `node --import tsx scripts/migrate.ts`，再启动应用；启动不会自动升级旧库。工作目录不得携带用户 `.env`，独立 Agent 替身不接真实模型。

在最终 SUT 工作目录安装其锁文件依赖后，下列命令使用 QA 预先填写并核对归属的 `qa_media_*` 变量；这里没有提供数据库凭据或默认资源值。循环调度的就绪信号取 HTTP health，后续文件阶段另取事实：

```sh
DATABASE_URL="$qa_media_database_url" node --import tsx scripts/migrate.ts
DATABASE_URL="$qa_media_database_url" GATEWAY_URL="$qa_media_gateway_url" \
  AGENT_URL="$qa_media_agent_url" PORT="$qa_media_port" MEDIA_DIR="$qa_media_directory" \
  node --import tsx apps/server/src/main.ts >"$qa_media_runtime_log" 2>&1 &
qa_media_sut_pid=$!
```

单 worker 的三个必填变量是 `MEDIA_TEST_DATABASE_URL`、`MEDIA_TEST_DIRECTORY`、`MEDIA_TEST_GATEWAY_URL`；除目录由测试变量覆盖外，仍读取正常 `MEDIA_RETENTION_DAYS`、`MEDIA_MAX_BYTES`、`MEDIA_DOWNLOAD_TIMEOUT_MS`、`MEDIA_CLEANUP_INTERVAL_MS`。它不执行迁移、不接 SSE、不建立群或消息，也不应与同库的完整应用并行来争抢本实验任务。QA 可以独立驱动标准入口；引用单 worker 时必须在报告中标明运行层次，不能导入研发测试里的期望或结果。

```sh
MEDIA_TEST_DATABASE_URL="$qa_media_database_url" \
  MEDIA_TEST_DIRECTORY="$qa_media_directory" MEDIA_TEST_GATEWAY_URL="$qa_media_gateway_url" \
  node --import tsx tests/support/media-worker-process.ts >"$qa_media_worker_log" 2>&1 &
qa_media_worker_pid=$!
```

## 网关消息、下载与独立事实

标准路径先经公开 API 建立群并取得本地群 ID 与网关群 ID，或明确使用隔离库的群夹具；后者不能记为“建群 API 已验”。QA 的自有 Gateway 保留真实媒体字节、HTTP 请求账本和 SSE 事件历史。在其 `GET /events?since=0` 流发送 `data: <JSON>` 加两个换行，消息至少含：

```json
{"eventId":101,"type":"message","groupId":"<网关群ID>","msgId":"<本例唯一消息ID>","senderPlatformUserId":"<真实外部身份>","text":"media fixture","sentAt":"<实际ISO时间>","mediaUrl":"/media/<本例媒体ID>"}
```

`eventId`、消息 ID 和外部身份需与本例账本一致；重连仍重放真实原事件，不能重置账本来掩盖重复副作用。媒体 URL 必须是配置 Gateway 同源的 `/media/:id`，不带查询、片段或凭据。媒体路由由 QA 控制为完整字节、指定 HTTP 错误或“发送首块后保持连接，待屏障释放再发尾部”；控制动作是 QA 替身能力，不是新产品接口。

普通下载事实由 Gateway 实际请求、磁盘字节/文件属性，以及 `GET /api/groups/:id/messages` 的当前 `localFilePath` 对应。只读 SQL 可帮助定位阶段，不能替代公开行为或独立文件事实：

```sql
SELECT f.id, f.group_id, f.msg_id, f.state, f.storage_root, f.partial_name,
       f.local_file_path, f.downloaded_at, f.next_attempt_at, f.attempts,
       m.local_file_path AS message_path
FROM media_files f JOIN messages m
  ON m.group_id=f.group_id AND m.msg_id=f.msg_id
WHERE f.group_id=:'local_group_id' AND f.msg_id=:'media_msg_id';
```

以上 `:'name'` 为 psql 参数记法，其他客户端应绑定参数。稳定文件名为 `MEDIA_DIR/media-<media_files.id>.bin`；临时名取持久 `partial_name`，不要推测 UUID。公开 `localFilePath` 是服务端路径，不是浏览器下载地址。读取旧游标时也应独立取实际响应，不从数据库预填响应结果。

## 保留期与活跃引用

没有媒体虚拟时钟。默认保留期是 30 天，清理间隔默认 3,600,000ms，允许显式改为 100–86,400,000ms；`MEDIA_RETENTION_DAYS` 可取 0–36500。缩短清理间隔只改变实际配置，不能冒称验证了默认一小时巡检。设保留期 0 可观察真实时间驱动的短期生命周期，但不能替代默认 30 天边界证据。

已有研发老化方法是在**独占 fixture 库**确认目标文件已经 ready 后，固定目标行的年龄。执行前后保存查询结果、夹具命令及时间，保持媒体字节、路径、状态和原事件不变：

```sql
UPDATE media_files
SET downloaded_at=now()-interval '31 days'
WHERE group_id=:'local_group_id' AND msg_id=:'media_msg_id' AND state='ready'
RETURNING id, state, downloaded_at, local_file_path;
```

这是测试输入老化，未真实等待 31 天；之后删除、清路径及外部可见变化必须由产品实际 `tick` 产生。研发还以显式两天保留期、一天/三天 fixture 覆盖年龄两侧。标准应用没有公开“立即清理”按钮：使用记录在案的清理间隔等待实际调度，或受控重启同库同目录；单 worker 下一次 `tick` 则是另一种明确记录的入口。不要把直接调用研发 `cleanupExpired()` 描述为标准 HTTP 行为，也不要通过把状态直接改成 deleted 制造结果。

真实引用的产品路径有两处：run 创建事务登记触发消息的媒体；`get_recent_messages` 工具的读取事务登记返回消息的媒体。QA 可按下列已有协议顺序接标准应用：先准备历史媒体，再以管理员 `PATCH /api/groups/:id`、`{"agentEnabled":true}` 开启 Agent，发送新的外部触发媒体；独立 Agent 第一轮返回合法 `get_recent_messages` 工具提议，第二轮实际请求到达替身后暂缓回应，再做年龄夹具及实际清理观察，最后释放合法 `end_turn` 并观察运行终态与后续清理。历史媒体应避免成为另一条未处理的外部触发；已有研发实验使用自有账号回声作为历史消息。

第二轮请求、run ID、工具结果和两条媒体身份必须真实对应；不能只靠随机 sleep 声称引用已登记。现有只读定位查询为：

```sql
SELECT r.id AS run_id, r.status, r.recovery_note, f.id AS media_id, f.msg_id
FROM agent_media_references p
JOIN agent_runs r ON r.id=p.run_id
JOIN media_files f ON f.id=p.media_id
WHERE f.group_id=:'local_group_id' ORDER BY r.id, f.msg_id;
```

这段标准入口接线顺序依据已存在协议及实际模块路径；已有“真实 Agent 触发/工具读取”的研发验证直接调用 `AgentModule`，并非独立 HTTP 全应用复测。QA 须实际验证其驱动能在原模型/活动预算内到达和保持窗口；若原预算先结束，就记录前提未形成，不增加业务超时掩盖问题。不能直接插入引用行来声称已验证真实触发/工具读取。已验证的直接 running/pin fixture 可以单独用于引用保留和重启实验，须与上述真实引用路径分列。

## 已验证的精确进程崩溃窗口

这些窗口来自研发真实子进程 SIGKILL，均使用独占库、单文件、单 worker 与真实 HTTP。父进程从自己的 `spawn` 取得 PID/退出事件；精确核对路径和数据库事实后杀该 PID，等待确认 `SIGKILL` 退出，保留数据库及目录。禁止按端口或名称模糊杀进程。进程崩溃不等于整机掉电、磁盘损坏或任意文件系统崩溃保证。

使用上述 shell 启动时，只在目标窗口已经形成且该子进程仍属于本例时执行 `kill -KILL "$qa_media_worker_pid"`，随后 `wait "$qa_media_worker_pid"` 并保存非零退出状态；Node 驱动保存 `exit` 的 signal。不能把计划发出信号当成已确认退出。完整应用实验则须绑定其自己的应用 PID，不能混用 worker PID。

| 窗口 | 形成方法与杀前实际事实 | 恢复材料与边界 |
|---|---|---|
| 流式文件尚未完成 | Gateway `/media/:id` 发送非空首块并保持响应；媒体目录中真实 `.part` 大小大于 0，消息路径尚空。到达后杀子进程，不凭开始请求推断已写盘 | 释放旧响应并让下一次请求返回完整字节；保留同库同目录，重启 worker。保留旧/新请求和文件清单，区分重下载与半文件发布 |
| 完整文件已落盘，ready 尚未提交 | 为 ready 更新安装下方真实 PG 触发器；确认目标 SQL 正在 PgSleep，稳定 `.bin` 已包含完整字节；另一连接看到已提交状态仍 downloading、消息路径空，再杀子进程 | 等原连接退出后移除本例触发器，将同一来源改为 404，重启同库同目录。已有机制复用完整文件，无须新增网关能力；HTTP 账本不能清零 |
| 文件已物理删除，deleted 尚未提交 | 先正常下载并用明确年龄 fixture 使其过期；触发器目标改为 deleted；PgSleep 时文件已不存在，另一连接看到已提交 deleting、消息路径空，再杀子进程 | 移除屏障后重启同库同目录；持续观察删除意图完成和文件事实，不重建媒体任务或重置库 |

研发原触发器如下。每个独占库只放本例一份媒体任务，`ready` 与 `deleted` 分次使用，避免把别的任务睡眠误认成目标窗口；SQL 是测试故障注入，不加入产品迁移：

```sql
CREATE FUNCTION media_save_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state='ready' THEN PERFORM pg_sleep(10); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_save_barrier BEFORE UPDATE ON media_files
FOR EACH ROW EXECUTE FUNCTION media_save_barrier();

SELECT pid, datname, application_name, state, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE datname=current_database() AND wait_event='PgSleep'
  AND query LIKE 'UPDATE media_files SET state=%';
```

deleted 窗口仅将触发器条件中的 `'ready'` 换为 `'deleted'`。10 秒是故障观察屏障，不是业务 SLA，也不是杀进程后的等待依据。观察超时、出现多个无法区分的会话，或对应文件/已提交行不符时，不宣称到达窗口。若要用于完整应用，QA 必须绑定其自有数据库连接/PID、实际 SQL 与目标文件，先验证没有其它后台工作混入；**当前没有全应用 C1 专用窗口控制器或该完整接线的独立通过证据**。

杀前记录 pg_stat_activity 与文件事实；杀后确认旧数据库会话已消失，再仅移除本例故障设施：

```sql
DROP TRIGGER media_save_barrier ON media_files;
DROP FUNCTION media_save_barrier();
```

恢复时不删除 `.bin`、`.part`、媒体行或引用行来帮产品通过。`recover()` 本身只检查目录一致性，实际续做发生于 `tick()`。另有已验证分支：完整文件落盘后硬杀，再把 `MEDIA_MAX_BYTES` 从原值降为 4；产品会保留无公开路径的删除意图，运行中引用仍保护物理文件，引用结束后删除。其 running pin 在研发实验中由 fixture 建立，不能宣称证明真实 Agent 触发过程。

## schema 8 至 9 的独立升级输入

精确旧源为 `fb1589df08f00c10e9e62801007b1698d4d0155a`，只含 001–008；逐文件已与当前 `f639ee7` 的前八条原 SQL 比较，字节完全一致。当前升级增加 `009_media_files.sql`，不修改旧 SQL。以下是可独立核验的原字节摘要：

| 文件 | SHA-256 |
|---|---|
| `001_core.sql` | `eabfdd3e50fa312558f14aeb2e3277bdb2ee186d0892a320c0643bed329bb06c` |
| `002_automation.sql` | `302e6d20b8aebfbed8431e852e1ef9e7c20c310bdaf11e89671f155cb49b09cb` |
| `003_agent_activity.sql` | `2d8fcc6b498b053614464e1bc49322899041ca74b404b44fbfb13b9440c45e6c` |
| `004_message_event_order.sql` | `5b7d6c9bcf202ad97276fececabe9e39c1422ebd9fbe25330158e7cac8339298` |
| `005_group_metadata.sql` | `bbb67a43a41aaaf172f6ba9469a5ad4cc47563447dabf9d3d2bbf0444f1ae003` |
| `006_group_directory.sql` | `760acc9148f851c1f6d75163655b65a0c15b7b7f929b4a57588c59ceecb9f533` |
| `007_message_sent_observation.sql` | `51117419e21aa060d15e7a38d8b5b49668d7ba5c9d2568d1bb5256090793706d` |
| `008_message_sent_receipts.sql` | `7bb4b8bd027ef2b7c5cdc21924aac3dc3d9635fe50547092daebc2a88584551c` |

已有研发升级实验从原字节复制 001–008 到临时目录，以既有迁移器的显式目录参数建空库，再装入下面的旧 schema fixture，最后运行当前迁移器两次。它验证的是带校验账本的 schema 8 升级，不是无校验账本的任意旧备份迁移。

```sql
INSERT INTO groups(id,gateway_group_id,creator_account_id)
VALUES('g','remote-g','account-1');
INSERT INTO messages(id,group_id,msg_id,is_own,text,metadata)
VALUES('legacy','g','legacy',false,'text','{"mediaUrl":"/media/legacy"}');
INSERT INTO agent_runs(id,group_id) VALUES('running','g');
INSERT INTO agent_runs(id,group_id,status,end_reason)
VALUES('terminal','g','finished','final');
```

这是空旧库的合成数据；其中插入的 running run 不能记成真实 Agent 启动证据。QA 不必导入研发测试：可独立导出上述固定旧提交至专属目录，在其原锁文件/runtime 下执行旧 `scripts/migrate.ts` 建 schema 8，再加载自己核定的 fixture；之后切换到最终 SUT 的标准迁移命令。旧入口经本次源码核对存在且只加载该 checkout 的迁移，但此整目录方式本次未实际运行；已执行证据对应的是上述显式目录方式，接线结果由 QA 实际记录。

迁移前保存旧 `schema_migrations` 的 version/name/checksum、消息/run 行、导出归档哈希和来源清单；升级后保留新账本、消息原字段、媒体任务与引用投影，以及再跑迁移的结果。当前应用在 schema 8 上拒绝启动是正常版本门禁，不能为了启动而伪造第 9 条账本、回填未经执行的 checksum、修改旧 SQL，或把所有启动失败都算作该门禁的证据。QA 需要归档格式时按其独立夹具契约组织；本文没有交付新的旧库二进制归档。

## 仍需实际接线的边界

- 标准应用的媒体下载/清理代码路径已明确；精确磁盘崩溃、真实 Agent HTTP 屏障及旧库导出归档尚需 QA 自己完成运行接入，研发历史结果不能替代。
- 没有公开媒体虚拟时钟、强制清理接口或磁盘 checkpoint 控制 API。年龄和旧数据 fixture、PG 故障注入、产品实际动作以及独立断言必须分别记录。
- 任意 fsync 中途、主机掉电、目录损坏、分布式文件系统一致性及未验证的新竞态窗口不由上述 SIGKILL 证据覆盖；无现成可控窗口则如实列缺证，不另造承诺。
- 只清理本例确认归属的进程、触发器/函数、数据库和目录；清理失败保留记录，不覆盖原始失败。当前文档没有创建这些资源，也不接触演示或真实模型。
