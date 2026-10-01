# DB-002：时间线续页查询的固定源与应用回滚复跑材料

2026-10-02。这是研发交给 QA 的公开复跑步骤和受控差异，供补充 `SR-BE-DB-002`；不改 QA 用例或结果，不新增优化。本次实际执行范围是源比对、补丁 `apply --check`、临时文件副本中的正反往返和脚本语法检查。**本次没有启动数据库或应用，没有执行下面的 HTTP 流程，也没有新增性能样本或 QA PASS。** QA 本批原结果仅对同库 SQL/API 子项记录通过，应用回滚和最终差异仍由 QA 独立核查。

## 固定源、改动范围与材料

| 身份 | 固定值及含义 |
|---|---|
| 产品基线 | `cca7fd2422f58b57b4156b620101929e5eb39a1c`，以下两个应用都从其源码归档建立 |
| 原优化提交 | `544c4f9ce71b5dd893be286853a35df340072a7d` |
| 优化前来源 | `ac5e8e639237070fb5c48751ce04a7645b4a19ab`，只从它提取旧续页 SELECT |
| 核对结果 | `cca7fd2` 与 `544c4f9` 的续页 SELECT 源行逐字相同；整个 gateway 文件因其他功能差异而不同 |
| 后续已核对 | `495374b8ea57d6d7672a4d692890523919ecc3ec` 的 gateway 文件与 `cca7fd2` 字节全等；不代表所有产品文件相同，也不将下面流程称为在该版执行过 |
| 受控旧查询应用 | `cca7fd2` + `to-original-query.patch`；它是同一最终应用只回退查询的变体，**不是完整 `ac5e8e6` 应用** |

补丁只把 `apps/server/src/modules/gateway/index.ts` 的一条续页 SELECT 在 `jsonb_path_query_array` 与原 `generate_series`/逐项提取之间互换；每份 `numstat` 都是 **1 行加入、1 行删除、1 个文件**。不改首次查询、快照数据、游标编码、返回 DTO、迁移、索引、其他业务或同原提交中的 Gemini 用量功能。为了保持严格单行实验，回退变体保留当前源码注释；以实际 SQL、文件哈希和补丁为身份，不能把注释当其执行事实。

材料目录：[second-round-timeline-reproduction-20261002](evidence/second-round-timeline-reproduction-20261002/)。

- [manifest.json](evidence/second-round-timeline-reproduction-20261002/manifest.json)：三个固定提交、各源文件/SQL 源行/补丁 SHA-256，以及 `495374b` 的文件等同性。
- [to-original-query.patch](evidence/second-round-timeline-reproduction-20261002/to-original-query.patch)：当前优化查询 → 原查询；[to-optimized-query.patch](evidence/second-round-timeline-reproduction-20261002/to-optimized-query.patch)：原查询变体 → 当前查询。
- [verify-patches.py](evidence/second-round-timeline-reproduction-20261002/verify-patches.py)、[patch-verification.json](evidence/second-round-timeline-reproduction-20261002/patch-verification.json)：固定 Git 对象比对、临时副本 apply-check/应用、字节级还原及临时目录移除的实际开发记录。
- [application.mjs](evidence/second-round-timeline-reproduction-20261002/application.mjs)：可选工程装配入口；[http-replay.mjs](evidence/second-round-timeline-reproduction-20261002/http-replay.mjs)：公开 HTTP 复跑示例。两者本次只做语法检查，HTTP 行为留待执行者验证。
- [SHA256SUMS](evidence/second-round-timeline-reproduction-20261002/SHA256SUMS)：以上交付文件与静态验证记录的校验清单。

现有 1,000/10,000 条开发测量、真实旧/新 SQL、计划/BUFFERS、两版 HTTP 样本和语义覆盖继续见[测量报告](final-enhancement-measurement-20261002.md#p1-01真实测量)及其归档；本材料不重复这些 benchmark。旧报告的 `TIMELINE_COMPARE_SLICE=1` 在优化后源码上会自比，不能用于本次原版应用回滚证明。

## 1. 建立两个隔离源码副本

以下是 Bash 命令；在已包含本材料的研发仓库执行。仅在独立临时目录创建副本，不切换主工作区、不改 QA 工程。需要 Node 24.21.0+（小于 25）、npm 12.1.0+（小于 13）、Git、Python 3；数据库步骤另需 Docker CLI。设置的变量均为本次专属变量。

```bash
set -euo pipefail
db002_repo=$(git rev-parse --show-toplevel)
db002_material="$db002_repo/docs/evidence/second-round-timeline-reproduction-20261002"
db002_revision=cca7fd2422f58b57b4156b620101929e5eb39a1c
db002_root=$(mktemp -d "${TMPDIR:-/tmp}/kapibala-db002.XXXXXX")
chmod 700 "$db002_root"
mkdir "$db002_root/A" "$db002_root/B" "$db002_root/evidence" "$db002_root/media"
(cd "$db002_material" && shasum -a 256 -c SHA256SUMS)
python3 "$db002_material/verify-patches.py" > "$db002_root/evidence/patch-check.json"
git -C "$db002_repo" archive "$db002_revision" | tar -x -C "$db002_root/A"
git -C "$db002_repo" archive "$db002_revision" | tar -x -C "$db002_root/B"
for db002_side in A B; do
  cp "$db002_material/application.mjs" "$db002_root/$db002_side/.db002-application.mjs"
  cp "$db002_material/http-replay.mjs" "$db002_root/$db002_side/.db002-http-replay.mjs"
  (cd "$db002_root/$db002_side" && npm ci) > "$db002_root/evidence/install-$db002_side.txt" 2>&1
done
export DB002_MANIFEST="$db002_material/manifest.json"
```

任何命令非零均停在该阶段并保留输出，不继续套用成功描述。归档没有工作区未跟踪的 `.env`；不要拷入真实密钥或演示配置。源码身份是归档 SHA + 实际补丁 + 文件哈希，归档目录本身没有 Git HEAD，不把受控变体称为干净原提交。

## 2. 同一个专属 PostgreSQL 与小型游标夹具

可复用 QA 已明确归属的独立数据库及自己的数据生成器。下面给出自建单独 PG17 的替代方法，**A/B 始终使用完全相同的数据库 URL**；不是各自跑一次夹具后比较两个不同数据库。禁止使用 55432 演示库。本例 120 条只用于跨应用分页/回滚，不替代已有两档规模测量。

```bash
db002_owner=$(node -p 'crypto.randomUUID()')
db002_database="timeline_${db002_owner//-/_}"
db002_password=$(node -p 'crypto.randomBytes(24).toString("hex")')
db002_engine=$(docker info --format '{{.ID}}')
db002_container=$(docker run -d --rm --name "kapibala-db002-$db002_owner" \
  --label "kapibala.db002.owner=$db002_owner" \
  -e "POSTGRES_PASSWORD=$db002_password" -e "POSTGRES_DB=$db002_database" \
  -p 127.0.0.1::5432 postgres:17-alpine)
db002_port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$db002_container")
test "$db002_port" != 55432
export DATABASE_URL="postgres://postgres:$db002_password@127.0.0.1:$db002_port/$db002_database"
for db002_try in $(seq 1 60); do
  docker exec "$db002_container" pg_isready -U postgres -d "$db002_database" && break
  sleep 1
done
docker exec "$db002_container" pg_isready -U postgres -d "$db002_database"
(cd "$db002_root/A" && node --import tsx scripts/migrate.ts) > "$db002_root/evidence/migration.txt" 2>&1
docker inspect --format '{{json .Mounts}}' "$db002_container" > "$db002_root/evidence/owned-mounts.json"
docker exec -i "$db002_container" psql -v ON_ERROR_STOP=1 -U postgres -d "$db002_database" <<'SQL'
INSERT INTO groups(id,gateway_group_id,creator_account_id)
VALUES('db002-measured','db002-measured','account-1'),('db002-control','db002-control','account-2');
INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at,delivery_status)
SELECT g||'-'||lpad(n::text,6,'0'),g,g||'-remote-'||n,'fixture-user',false,
       'DB002 synthetic '||n,'2026-01-01'::timestamptz+(n/3)*interval '1 millisecond','sent'
FROM unnest(ARRAY['db002-measured','db002-control']) g CROSS JOIN generate_series(1,120) n;
ANALYZE messages;
SELECT current_database(),version();
SELECT group_id,count(*) FROM messages GROUP BY group_id ORDER BY group_id;
SQL
umask 077
{
  printf 'export db002_root=%q\n' "$db002_root"
  printf 'export DATABASE_URL=%q\n' "$DATABASE_URL"
  printf 'export DB002_MANIFEST=%q\n' "$DB002_MANIFEST"
} > "$db002_root/launch-env.bash"
```

这只是合成数据，所有账号仍 idle、群 Agent 默认关闭、无 queued/accepted/unknown 出站或活动 run/job。没有用 SQL 伪造实际网关发送/确认。若 QA 要复核迟到消息或真实 accepted→sent，则使用自己的独立事实驱动，旧快照仍保持以下身份约束；本例不替代那些已有子项。

## 3. 选择应用入口并记录两个实例

一次回滚循环始终使用相同入口类型，A/B 是两个独立 Node 进程和两个实际监听端口；不能将两端合为一个应用内的两个 SQL 调用。所有进程共享本次数据库和 `MEDIA_DIR="$db002_root/media"`。第 2 节生成的 `launch-env.bash` 位于 0700 临时目录，文件权限为 0600，只供本地终端传递同库参数；**含临时数据库凭据，不归档或分享**。每个新终端先执行以下两行，再运行所选启动命令；不要另建数据库。标准 main 所需的网关/Agent 地址另在两个终端设为同一组自有地址。

```bash
set -euo pipefail
source '/absolute/path/to/kapibala-db002.XXXXXX/launch-env.bash'
```

### 标准 main（正常服务回滚复跑）

QA 若要补正常主入口的应用回滚证据，使用 `apps/server/src/main.ts`，保留 gateway/automation 的正常后台启动、恢复和关闭。先设置 QA 自有、真实可达的 loopback 网关与 Agent 替身地址，不使用正式外部服务。此流程不需要真实模型或 Key。`PORT=0` 由 OS 分配，采用每次启动 Fastify 日志中的实际监听地址及 pid，不能抄默认端口。

```bash
: "${DB002_GATEWAY_URL:?set the owned reachable loopback gateway URL}"
: "${DB002_AGENT_URL:?set the owned reachable loopback agent URL}"
# 在 A 的独立终端执行；B 终端将 A 改为 B，使用同一 DATABASE_URL。
cd "$db002_root/A"
shasum -a 256 apps/server/src/modules/gateway/index.ts
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  DATABASE_URL="$DATABASE_URL" PORT=0 MEDIA_DIR="$db002_root/media" \
  GATEWAY_URL="$DB002_GATEWAY_URL" AGENT_URL="$DB002_AGENT_URL" \
  node --import tsx apps/server/src/main.ts
```

保存各阶段实际命令、stdout/stderr、pid 与启动时间、监听地址、源文件哈希、网关/Agent 替身身份、`GET /api/health` 与管理员 `GET /api/diagnostics/background` 响应。正常入口应显示 `backgroundEnabled:true`；处理实际启动/后台错误，不能把暂时可 GET 时间线当完整启动成功。**该入口尚未在本材料交付时执行**。QA 已有正常 SUT 启动器也可使用，只要两个受控版本及同库身份可证明。

### 工程装配（仅隔离查询影响）

这一入口沿既有开发测量装配，真实调用 `createApp`、鉴权、gateway 路由和数据库，但 `background:false`，只挂载 gateway；它不覆盖标准 main、automation 或后台恢复。因此结果只能称“两个工程应用进程的查询回退兼容性”，不能包装为完整服务回滚验证。

```bash
# A、B 分别在独立终端执行；初始二者都是 optimized。
cd "$db002_root/A"
DATABASE_URL="$DATABASE_URL" MEDIA_DIR="$db002_root/media" \
  DB002_MANIFEST="$DB002_MANIFEST" DB002_VARIANT=optimized \
  node --import tsx .db002-application.mjs
```

入口会核对实际 gateway 文件 SHA-256，输出 `db002-application-ready`，含变体、baseRevision、pid、apiUrl、数据库主机/端口/库名和 `backgroundEnabled:false`，不输出连接凭据。B 回退后须用 `DB002_VARIANT=original`，还原后用 `optimized`，不匹配时拒绝启动。两入口都应在各自前台终端 Ctrl-C 并等待退出后才能替换文件；不能让旧进程继续运行再声称补丁已生效。

## 4. 保存真实快照与同游标 HTTP 基线

填入 A/B 实际地址。B 每次重启的新端口都必须重新填入，不能沿用历史 URL。以下只调用公开 login/messages HTTP；登录 token 只在脚本内存，不写输出。示例源码为研发 recipe，QA 可以采用自己的独立实现及断言，不能直接把此脚本的 `HTTP_ASSERTIONS_PASS` 改写为 QA PASS。

```bash
export DB002_A_URL='http://127.0.0.1:ACTUAL_A_PORT'
export DB002_B_URL='http://127.0.0.1:ACTUAL_B_PORT'
export DB002_GROUP=db002-measured DB002_COUNT=120
export DB002_SNAPSHOTS="$db002_root/evidence/frozen-snapshots.json"
cd "$db002_root/A"
DB002_MODE=seed DB002_RESULT="$db002_root/evidence/01-optimized-pair.json" \
  node .db002-http-replay.mjs
```

脚本通过 A、B 各做一次真实首屏 HTTP，得到两个不同 `snapshotId`，分别保留原 `nextCursor` 和全部预期页。随后对每个快照，把**同一原游标**提交给 A、B，逐页核对全部字段、顺序、`snapshotId`、`nextCursor`、总项数和无重复；另用分页大小 1/37/100 交叉读取。偏移 0 使用原公开游标编码生成，读取同一持久快照，不另建首屏。每次非登录请求保存实际状态、完整响应字节、大小和单次耗时；耗时不外推 SLA、p95 或性能收益。

同时保留真实 SQL 观察，与 HTTP 的 snapshotId 交叉核对：

```bash
docker exec "$db002_container" psql -U postgres -d "$db002_database" -c \
  "SELECT id,group_id,jsonb_array_length(items) AS count,md5(items::text) AS content_digest FROM timeline_snapshots WHERE group_id='db002-measured' ORDER BY id" \
  > "$db002_root/evidence/snapshots-before.txt"
```

预期是该独立空库中新建的两个快照各 120 项；后续 replay 不创建新快照。MD5 在这里只是同库内容变动标记，不承担可信来源校验；交付文件使用 SHA-256。

## 5. B 回退旧查询并以相同快照复跑

保持 A 和数据库运行。先在 B 终端 Ctrl-C，等待该实际进程退出并保存退出码；确认旧监听已关闭。只在 B 隔离副本应用补丁：

```bash
git -C "$db002_root/B" apply --check "$db002_material/to-original-query.patch"
git -C "$db002_root/B" apply "$db002_material/to-original-query.patch"
shasum -a 256 "$db002_root/B/apps/server/src/modules/gateway/index.ts"
```

应等于 manifest 的 `controlledOriginalQueryVariant`：`b17db37b266eef6583de2cd562fe5cc6abce4ecfba733c5aab41a6da3a5d8c35`。按第 3 节**同入口**重新启动 B，记录新 pid/启动时间/地址和哈希；工程入口改 `DB002_VARIANT=original`，标准 main 不接受也不需要该参数。无需迁移、重建库、重种数据或重建快照。

```bash
export DB002_B_URL='http://127.0.0.1:ACTUAL_RESTARTED_B_PORT'
cd "$db002_root/A"
DB002_MODE=replay DB002_RESULT="$db002_root/evidence/02-original-query-B.json" \
  node .db002-http-replay.mjs
```

replay 从同一 `frozen-snapshots.json` 读取原游标，比较 A/B 和最初保存的所有页。任何 HTTP 错误、字段/顺序改变、快照消失、游标变化、遗漏或重复都应保留为实际失败；不刷新首屏来绕过旧游标失败。

## 6. B 还原优化查询后再次读取原游标

再次正常停止 B、等待退出；应用反向补丁并核对哈希：

```bash
git -C "$db002_root/B" apply --check "$db002_material/to-optimized-query.patch"
git -C "$db002_root/B" apply "$db002_material/to-optimized-query.patch"
shasum -a 256 "$db002_root/B/apps/server/src/modules/gateway/index.ts"
cmp "$db002_root/A/apps/server/src/modules/gateway/index.ts" "$db002_root/B/apps/server/src/modules/gateway/index.ts"
```

应字节级恢复为 `6796745e10cc6ac1846187b4233ec7a18d6960d7bfbef7ca68ca88a379ee4c7c`。同入口重启 B（工程入口 `optimized`），填入新的 B URL：

```bash
export DB002_B_URL='http://127.0.0.1:ACTUAL_RESTORED_B_PORT'
cd "$db002_root/A"
DB002_MODE=replay DB002_RESULT="$db002_root/evidence/03-restored-query-B.json" \
  node .db002-http-replay.mjs
docker exec "$db002_container" psql -U postgres -d "$db002_database" -c \
  "SELECT id,group_id,jsonb_array_length(items) AS count,md5(items::text) AS content_digest FROM timeline_snapshots WHERE group_id='db002-measured' ORDER BY id" \
  > "$db002_root/evidence/snapshots-after.txt"
diff -u "$db002_root/evidence/snapshots-before.txt" "$db002_root/evidence/snapshots-after.txt"
```

最终独立核查还需把实际 QA 固定源的 SELECT/周边差异与本 manifest 对上。`495374b` 的整个 gateway 文件已静态核对相同；更晚源必须重新核对，不能只凭这个历史结论复用。不得把整份 `544c4f9` 提交反向回退，因为它还含与本实验无关的用量功能。

## 7. 证据与资源收尾

保留三次 HTTP 输出、原始失败（若有）、两个源的 base SHA/补丁/hash、每次真正启动的 pid/地址/时间/入口类型、同库身份、前后快照 SQL、安装/迁移和退出日志。正常 main 的外部替身观察与工程入口的局限分列。QA 使用自己的 case/run/SUT/QA SHA 和结果格式，研发不代签。

停止 A/B 并等待退出；仅删除本例自己创建的数据库容器。容器用 `--rm`，正常停止时 Docker 自动移除它和自己的匿名卷；先前保存的 Mounts 用于复核，不执行全局 prune，也不按名称猜测其他资源。

```bash
test "$(docker info --format '{{.ID}}')" = "$db002_engine"
test "$(docker inspect --format '{{index .Config.Labels "kapibala.db002.owner"}}' "$db002_container")" = "$db002_owner"
docker stop "$db002_container"
docker ps -a --no-trunc --format '{{.ID}}' > "$db002_root/evidence/containers-after.txt"
docker volume ls --format '{{.Name}}' > "$db002_root/evidence/volumes-after.txt"
```

核对本容器 ID 和先前保存的自有匿名卷均已消失；若使用 QA 原有专属库/外部替身，则沿其所有权流程收尾，不执行上面的容器删除。归档证据后才移除本次两个副本和临时目录，不能先删原始失败。本次研发静态验证没有创建上述容器、应用或数据库，实际临时 patch 副本已移除，记录见 `patch-verification.json`。
