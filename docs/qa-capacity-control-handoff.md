# 容量工程接入交接

本批从 `4c035b8c24e95f33182b4248ee676fcd184f74a5` 独立实现 `qa-capacity-control/1`。控制器是开发试验接入，不是生产 API，也不代表 QA 用例通过。QA 目录未修改、未执行。本报告中 DC 编号均为工程自测，CAP 编号仅说明对应接入边界。

## 运行方式与归属

必须从固定候选仓库根目录启动，使用 Node 24.21.0 及该仓库依赖。先安装已有锁定依赖；生产/工程代码、迁移、依赖锁及编译配置须已提交。专用 SUT 入口启动时检查 `apps/server`、`packages`、`scripts`、`db`、`package.json`、`package-lock.json`、`tsconfig.json` 的未提交变化，拒绝以脏产品源码冒充 HEAD。文档、测试、QA 资产不会因此被修改或执行。

先选择本轮独占、较短的绝对目录，例如 `/tmp/kap-cap-<本轮随机标识>`，权限 0700，归当前 uid 所有；Unix socket 完整路径须不超过 100 字节。控制器在所有串行用例期间保持存活，独立于每例的 SUT guardian 进程组：

```sh
QA_CAPACITY_REGISTRY_DIR=/tmp/kap-cap-<本轮随机标识> \
QA_CAPACITY_PORT=<已分配的独占loopback端口> \
node --import tsx scripts/qa-capacity-controller.ts
```

QA 目标配置的 `adapters.capacityControl.url` 使用上述 `http://127.0.0.1:<端口>`；`contractReference` 指向本交接文档及集成后的固定 commit。每例的 SUT 启动命令改用：

```sh
node --import tsx scripts/qa-capacity-server.ts
```

SUT 配置额外传同一 `QA_CAPACITY_REGISTRY_DIR`。`DATABASE_URL`、`PORT`、`GATEWAY_URL`、`AGENT_URL` 与 `QA_ACCEPTANCE_RESOURCE_TOKEN` 仍由 QA 自有环境注入，控制器不创建业务库、不迁移、不分配 QA 资源。迁移仍使用原命令 `node --import tsx scripts/migrate.ts`。SUT 须置于 QA guardian 管理的独立进程组；该组的 leader PID 才是契约 target.pid。控制器不接收或信任客户端提供的 ownerToken，实际 SUT 从自身环境读取，QA 独立比对。

每次 capabilities 和新租约会检查：真实 bridge 握手、应用 PID 启动时间、guardian 启动时间、uid、应用到 guardian 的完整父子链及 PGID、应用确实持有目标 API TCP listener、启动时完整 HEAD SHA。需要本机 `ps` 与 `lsof`。注册目录/socket 归当前 uid，限制为 0700/0600。异常、无法观测或不匹配拒绝接入。默认 `apps/server/src/main.ts` 即便带 token/registry 环境变量，也不导入或监听控制运行时。

## 可执行能力

| 能力 | 实现事实与自测范围 |
| --- | --- |
| admission-hold | 专用入口给 createApp 的同一 ControlledDatabase，转发原 tryWithLock 判定。逐个等待真实 PostgreSQL advisory lock 回调进入，再观察本地 capacity_unavailable。Agent 已占一槽时实际持有 7 槽，已派发 kick 占第二槽时实际持有 6 槽；这些是此版本观测，不是契约固定容量。 |
| admission-refused | 只关联目标 kick 的 AsyncLocalStorage attempt，只有实际 capacity_unavailable 且保护回调没进才发事件。该次回调内远端派发为 0；开发独立网关计数交叉核对。外层 Agent、别的工具、lock_busy 和已派发未知效果不会冒充拒绝。 |
| before-ready-window | 真实拒绝后、原 ready SQL 前阻塞；ready-persisted 只在原 SQL 完成后追加。TTL/DELETE 解开控制屏障，不写步骤、审计、run 或效果状态。 |
| active-clock | 对原 run 只读取持久 active_ms 与末样本时间，在首次读到终态时给 `[active_ms, active_ms + DB末样本至终态观察尾段 + 1ms]`。不从租约起点计时、不截断成 60000；不声称区间端点是物理停止的精确时刻。 |
| lease | UUID 重复同参返回原到期时间；异参拒绝；同实例只许一个已持有租约，创建串行。无效相关步骤/已终态的明确创建失败不会污染后续创建。释放只用固定旧 instance socket，不按可复用的 API 端口路由。 |
| history/restart | 事件 seq/内容只追加，GET 不延长到期时间。常驻控制器缓存已观察完整前缀，SUT 被硬杀后可读取及幂等释放旧租约；同端口的新 guardian 重新校验。未知 UUID 返回 404，不触及其他资源。 |
| HTTP compatibility | 兼容 QA 当前带 application/json 的空 DELETE；畸形非空 JSON 拒绝，PUT 仍严格验证结构和 TTL。无重定向。 |

## 明确限制与未满足的产品结果

1. **CAP009 开发实测未满足恢复标准**：同一 attempt 的 executing 已持久化、真实拒绝且零派发、before-ready-held 成立后 SIGKILL。重启公开 run 仍为 running 且有 recoveryNote（保守暂停），未正常续跑；后续 1500ms 网关仍 0 请求，原 audit/turn 各 1 次。控制器没有修写 ready。该记录是开发反例，不能冒称 QA 已执行 FAIL，更不能把接入测试通过当成产品恢复通过。
2. **CAP003 不制造精确 60 秒证据**：真实测量原值记录在下方证据。跨阈值区间是精度不足；如果可信下界已大于 60000，则是本次超限观察，交 QA 独立裁判，不能统一写成 BLOCKED。本批不修改活动预算。测量只覆盖本次无重启、健康数据库、连续活动时钟 epoch；此前硬崩溃的未采样尾段、跨实例/跨 epoch 真正活动时长没有可还原真值，不声明已支持。
3. **TTL 范围**：最大接受 120000ms，broker 与 SUT 各自定时发起定向释放；健康数据库与响应正常进程已测实际归还、TTL/DELETE 竞态和 holder 连接终止。若基础 Database 的 pool.connect/advisory SQL/unlock 永久挂起，无法保证任意数据库故障下硬期限前归还。此时返回不可用，不把仍未归还的槽写成 released；不改生产池超时，不全局杀 SUT 来冒充独立释放。归属 ps 观测失败也不能等同进程死亡；只有内核 ESRCH 或启动身份已变化才能使用死亡清理分支。
4. **历史存活范围**：常驻控制器内存保留已观察历史，须在这批串行用例期间保持运行；控制器自身重启、宿主机重启或没来得及被控制器观察的最后事件不保证历史恢复。SUT 正常/异常退出不影响已返回给 QA 的历史前缀。不得把这个工具当全事件可靠 inbox。
5. 暂未覆盖恶意同 uid 操作者篡改 registry 或进程命令、生产多租户授权。它是同用户本机、显式授权的隔离试验工具。任意执行代码/业务 SQL 不在 HTTP 接口中开放。

## 开发证据

完整 DC01–08 所测源版本 `c7d2c9bb92c8cfed7682753b99a9f02e8a7397cc`；最终源版本 `334c17b4b804cd53d941e7aa51cccb2562a80a9d` 仅增加在到期/已释放后拒绝确认 holder 的保护，并重复运行除 60 秒观察外的 7 项。新增开发测试见 `tests/integration/qa-capacity-control.test.ts` 与 `tests/support/capacity-control-fixture.ts`。测试固定版本 `0559ea329c39c981f056c69216d16d3ac48be20f`，测试和证据提交没有改变上述最终运行源码；源版本差异应从 Git 核验。

- `docs/evidence/qa-capacity-control/initial.tap`：首轮原始输出（Node 默认文本 reporter，尽管扩展名为 .tap）。macOS 长 Unix socket 路径导致启动失败，已限制路径长度、夹具使用短 `/tmp` 目录。
- `second.tap`：原始失败完整栈。空 DELETE JSON 形状被 Fastify 拒绝、夹具误用 refresh cookie 导致公开观察失败。前者工程控制器局部兼容；后者夹具改用 access Bearer 且每次请求先断言 HTTP 200。没有为这些夹具问题修改业务预算或调度。
- `third.tap`：上述修正后 DC01–05 5/5。默认入口关闭、真实占用/拒绝、幂等与定向清理、丢失 PUT 响应、旧进程硬杀/新 guardian 重绑、已派发后压力均有独立 HTTP/PG 事实。
- `development-eight.tap`：DC01–08 **8/8**，另含真实 60 秒活动窗口、before-ready TTL 与真实 holder PostgreSQL 连接终止。
- DC06 原值：持久 `active_ms=60007`，控制器 `[60007,60022]ms`，独立公开观察 `[59996.847542,60019.202458]ms`，终态事件时间 `2026-10-01T05:25:03.684Z`。**本次预算计量下界已超过 60000 达 7ms，是严格上限潜在不满足的开发观察；不能称为仅区间跨界 BLOCKED。** 计量输出机制断言通过不等于 A5 预算要求通过，QA 仍独立判断。
- `final-control-targeted.tap`：最终源版本的 **7/7** 短接入复验，60 秒观察没有重复或改写。
- `product-targeted.tap`：原 Agent 容量、锁准入、自动化、活动计量相关开发回归，**61 通过、0 失败、3 跳过**。跳过的是 `automation.test.ts` 原有 `AUTOMATION_TIMING_TESTS=1` 开关控制的 12 秒 turn、3×5 秒 audit 和 60 秒活动用例；本线没有开启它们，不宣称全套零跳过。根集成线另行完整回归。
- `typecheck.txt`：`tsc --noEmit` 原始空输出，进程 exit 0；`validation.json` 记录命令、版本与结果。

运行命令（仅开发专项，不是 QA 脚本）：

```sh
DATABASE_URL=<本轮独占PG管理连接> node --import tsx --test --test-reporter=tap tests/integration/qa-capacity-control.test.ts
DATABASE_URL=<本轮独占PG管理连接> node --import tsx --test --test-reporter=tap --test-name-pattern='DC0[1-578]' tests/integration/qa-capacity-control.test.ts
DATABASE_URL=<本轮独占PG管理连接> node --import tsx --test --test-reporter=tap tests/integration/agent-capacity.test.ts tests/integration/lock-admission.test.ts tests/integration/automation.test.ts tests/integration/core-activity-accounting.test.ts
node_modules/.bin/tsc --noEmit
```

本轮容器 `kapibala-dev-capacity-2cefa20d`，ID `69baa49bf5ed1efc0ace0a1b6ffa56ef3a969e709cdd75ea48aaa2d1c3de9fb4`，标签 `kapibala.owner=engineering-capacity-2cefa20d`，实际发布 `127.0.0.1:57084`。镜像 `postgres:17-alpine`，匿名卷 `defbdaa04a94595fd6d6374ec0ea5a4c0e17b212f9ca6726a152c6dcd463f325`。数据库夹具均由 temporaryDatabase 创建 UUID 数据库，管理库仅 CREATE/DROP，测试不写演示/QA 数据；结束执行本容器的精确 `docker rm -f -v` 并核对卷不存在。已完成清理：管理库查询无遗留 UUID 测试库；精确删除上述容器及匿名卷，随后两次 inspect 均确认不存在。清理结果见 `cleanup.txt`，删除前归属见 `resource-ownership.json`。仅移除本工作树指向主项目依赖的 node_modules 软链接，未触碰主项目依赖。
