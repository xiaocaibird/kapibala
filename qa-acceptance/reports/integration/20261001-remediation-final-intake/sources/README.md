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

## 数据库升级边界

新库由上面的隔离入口执行迁移后启动。已有001–006且没有checksum列的旧库必须先停止旧服务、保留数据库与模拟器一致备份，并按[旧六版基线核验](docs/core-migration-integrity.md#已部署六版库的兼容路径)显式处理，再执行普通迁移。不能直接回填当前SQL哈希冒充历史已经验证。007要求没有running序列；应让旧版运行自然完成后再停服务，不通过修改状态绕过。

当前迁移按显式编号、名称和内容校验和核对完整历史；启动要求当前清单全等，健康接口不是物理schema巡检。第二轮修复、证据及尚未闭合的边界见[本轮记录](docs/core-repair-round-two.md)。

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
- [分批功能验收](docs/acceptance.md)
- [逐条需求与验证证据](docs/requirements-matrix.md)
- [工程要求](docs/engineering-requirements.md)
- [决策与变更记录](docs/decisions.md)
- [模块接口](docs/module-interfaces.md)
- [实际工具链](docs/toolchain.md)
- [模拟场景与限制](docs/simulator.md)

原始需求文件保持字节不变；开发提交及交付前均验证校验值。
