# 多账号群组消息平台

Node.js / TypeScript / PostgreSQL 后端，React 18 控制台，独立消息网关与 Agent 模拟服务。

## 全新隔离启动

要求 Node.js 24.21.0（见 `.nvmrc`）、npm 12.1.0、当前用户可访问的本机 Docker daemon，以及 macOS/Linux 的 `ps`。使用仓库唯一 lock 文件安装依赖。在本仓库任意克隆目录的根目录执行：

```sh
nvm use
npm ci
npm run dev:isolated
```

未使用 nvm 时，先自行准备匹配 `.nvmrc` 的 Node 版本即可。Docker Desktop 必须已运行；如果使用其他本机 Docker context，可显式设置 `DOCKER_CONTEXT` 或 `DOCKER_HOST`。首次可能需要拉取 `postgres:17-alpine` 镜像。

命令会创建独占的 PostgreSQL 容器、卷、随机数据库和临时模拟器状态目录，执行真实迁移，然后启动网关、Agent、API 与控制台，全部监听 `127.0.0.1` 的随机端口。**以终端 `isolated-ready` 输出的 `urls.web` 为控制台入口**；`urls.api/gateway/agent` 和数据库端口也是本次实测地址，不依赖 5173/3100 等固定端口。Vite 的 `/api`、`/ws` 代理指向这次随机 API。

登录账号为 `admin/admin`（管理）、`viewer/viewer`（只读）。新库预置六个待连接服务账号，管理员先连接账号再建群。只读账号可以查询，业务写接口返回 403。本入口不读取已有 `.env` 的数据库或模拟状态，不访问已有演示资源，也不启用 QA 故障控制器。

启动日志提供本次私有 `manifest.json` 路径，记录真实 PID/启动身份、容器/卷归属、全部地址和状态路径。该文件权限为 0600，包含本次随机数据库凭据，勿提交或分享。正常 **Ctrl-C 会删除本次数据库、容器、卷与模拟状态**；这是一次性复现环境，不用于保存正式验收数据。

如进程遭 SIGKILL，使用之前输出的完整 manifest 路径精确清理：

```sh
npm run dev:isolated -- cleanup /absolute/path/from-startup/manifest.json
```

清理核对用户、路径、原进程启动身份、Docker daemon 和随机资源标签；原拥有者仍运行时拒绝操作，不杀其他 PID，不使用 `docker prune`。如果 Docker 不可用或归属不能确认，保留 manifest 并返回失败，恢复同一 daemon 后重试。不要用其他运行的 manifest，也不要手工删除未核对归属的数据卷。

无需人工操作的启动自检：

```sh
npm run dev:isolated -- --smoke
```

该命令在新环境验证页面入口、随机 API/WS 代理、双角色登录与权限、管理员连接/断开，以及两份独立模拟状态文件，结束后执行同样的精确清理。它是交付环境检查，不代表全部业务验收通过。复现记录见[隔离启动验证](docs/isolated-local-reproduction.md)。

原有 `npm run dev` 和 Docker Compose 仍供主动配置固定本地环境使用，可能访问 `.env` 或默认端口，**不作为全新隔离复现步骤**。迁移命令不会自动升级运行中的已有数据库；已有数据升级仍须按下节处理。

## 可选 C2：真实 Gemini Agent

独立服务提供原协议的 `/agent/turn` 和 `/agent/audit`。在本地 `.env` 设置 `GEMINI_API_KEY`（或显式环境变量），然后启动：

```sh
npm run dev:gemini-agent
```

服务默认只监听 `127.0.0.1` 的随机端口，终端输出 `gemini-agent-ready.address`。在你已经配置好的后端环境中，仅把 `AGENT_URL` 改为该地址后启动后端；其数据库、网关、权限、工具执行、审计重试和原有时间预算均不变。`dev:isolated` 仍默认使用模拟 Agent，不会自动启用付费模型。

可用 `GEMINI_ENV_FILE=/absolute/path/to/main-workspace/.env` 只读取已有文件的 Key 字段，不复制该文件，也不导入其中的数据库或网关配置。默认模型为本次 Key 实测完成工具往返的稳定 `gemini-3.1-flash-lite`，可用 `GEMINI_MODEL` 指定其他可用 Gemini 型号；不自动切换或重试计费请求。`GEMINI_AGENT_PORT` 可指定固定空闲端口，`GEMINI_SESSION_DIR` 指定该服务独占的私有会话目录。

密钥、群上下文和会话文件不要提交；服务默认不打印请求正文、令牌或模型原始异常。会话持久化、故障保守处理、费用/资源上限和真实测试中的失败记录见 [C2 接入与验证](docs/c2-gemini-agent.md)。这项接入不消除既有后端未知执行结果或严格 60 秒终态的限制。

## 数据库升级边界

新库由上面的隔离入口执行迁移后启动。已有001–006且没有checksum列的旧库必须先停止旧服务、保留数据库与模拟器一致备份，并按[旧六版基线核验](docs/core-migration-integrity.md#已部署六版库的兼容路径)显式处理，再执行普通迁移。不能直接回填当前SQL哈希冒充历史已经验证。007要求没有running序列；应让旧版运行自然完成后再停服务，不通过修改状态绕过。

当前迁移按显式编号、名称和内容校验和核对完整历史；启动要求当前清单全等，健康接口不是物理schema巡检。第二轮修复、证据及尚未闭合的边界见[本轮记录](docs/core-repair-round-two.md)。

## C1 媒体文件

网关 `message.mediaUrl` 入库后由后台下载，成功后消息 API 的 `localFilePath` 返回服务器本地绝对路径。默认保存在启动目录下的 `media/`；这不是浏览器下载 URL，也没有新增网关或模型接口。下载失败保留消息文本，过期的网关 404 不重复尝试。运行中的 Agent 所引用消息的附件会保留，终态后恢复按保留期清理。

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `MEDIA_DIR` | `media` | 专用持久目录；使用同一数据库的服务实例须共享同一绝对路径和文件系统 |
| `MEDIA_RETENTION_DAYS` | `30` | 完整下载后的保留天数，允许 0；正在使用的文件仍受保护 |
| `MEDIA_MAX_BYTES` | `20971520` | 单文件最多 20 MiB，按流累计检查，超限不保存 |
| `MEDIA_DOWNLOAD_TIMEOUT_MS` | `15000` | 单次下载等待上限 |
| `MEDIA_CLEANUP_INTERVAL_MS` | `3600000` | 清理巡检及删除失败后的重试间隔，默认一小时 |

升级须先停止旧服务并备份数据库与媒体目录，再执行 `npm run db:migrate`。新增 009 会为旧消息中的 `metadata.mediaUrl` 创建下载任务，并保护旧版仍在运行的 Agent 对应群的已有附件。请保持目录稳定，不手动删除受管文件；目录与已保存位置不一致时服务拒绝启动。`npm run dev:isolated` 自动使用本次临时根下的 `media/`，退出时一并清理。下载、安全边界、恢复及开发证据见 [C1 说明](docs/c1-media-files.md)。

## 验证与说明

```sh
npm run verify:original
npm run typecheck
npm run build
npm test
```

运行数据库集成测试前，应显式提供专用测试 PostgreSQL 的 `DATABASE_URL`；不要使用演示库连接。当前测试创建独立 UUID 数据库，并启动随机端口的模拟服务，正常结束后清理测试资源。认证、连接及容量三个测试文件另覆盖初始化失败清理。旧认证测试曾连接默认演示库，已由`9befc8a`修正，历史影响和验证记录见[决策D016](docs/decisions.md)。12 秒、15 秒、60 秒的真实等待专项单独运行：

```sh
AUTOMATION_TIMING_TESTS=1 npx tsx --test --test-name-pattern='timing:' tests/integration/automation.test.ts
```

运行版本、进程及本批证据统一见[文档入口](docs/README.md)；当前能力与验证边界见[功能总表](docs/feature-matrix.md)。历史运行记录保留各自版本，不作为当前状态。通过编译或开发者浏览器检查不代表用户已完成人工验收。

- [当前功能总表与需求追踪](docs/feature-matrix.md)
- [首轮验收收尾、四条工作线与剩余确认](docs/first-acceptance-closeout-20261001.md)
- [分批功能验收](docs/acceptance.md)
- [逐条需求与验证证据](docs/requirements-matrix.md)
- [工程要求](docs/engineering-requirements.md)
- [决策与变更记录](docs/decisions.md)
- [C1 媒体文件管理](docs/c1-media-files.md)
- [C2 独立 Gemini 服务](docs/c2-gemini-agent.md)
- [C1 / C2 交付与 QA 接入](docs/c1-c2-delivery-20261001.md)
- [C1 / C2 最终组合回归](docs/c1-c2-final-combination-20261001.md)
- [模块接口](docs/module-interfaces.md)
- [实际工具链](docs/toolchain.md)
- [模拟场景与限制](docs/simulator.md)

原始需求文件保持字节不变；开发提交及交付前均验证校验值。
