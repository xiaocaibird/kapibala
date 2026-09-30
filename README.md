# 多账号群组消息平台

Node.js / TypeScript / PostgreSQL 后端，React 18 控制台，独立消息网关与 Agent 模拟服务。

## 本地启动

要求 Node 24.21.0、npm 12.1.0、Docker Desktop。项目使用唯一的 npm lock 文件。本机当前演示已从原始目录的main启动；直接访问下方控制台即可体验。只有服务未运行时才执行启动命令，避免从其他工作树重复占用端口。

```sh
cd /Users/zcm/Desktop/kapibala
nvm use
npm ci
docker compose up -d --wait
npm run db:migrate
npm run dev
```

控制台：[http://127.0.0.1:5173](http://127.0.0.1:5173)，API：3100，网关：3101，Agent：3102。默认账号 `admin/admin`（管理）与 `viewer/viewer`（只读）。数据库预置六个服务账号，先在控制台连接，再建群。停止开发服务使用 Ctrl-C；数据库使用 `docker compose stop`，保留数据卷。

可复制 `.env.example` 为 `.env` 配置 `PORT`、`DATABASE_URL`、`GATEWAY_URL`、`AGENT_URL`。模拟服务状态保存在忽略目录 `.runtime/`，仅绑定本机地址。业务数据库迁移需显式执行；schema 版本不匹配时后端拒绝启动。

## 验证与说明

```sh
npm run verify:original
npm run typecheck
npm run build
npm test
```

当前测试创建独立数据库或schema，并启动随机端口的模拟服务，不复用演示群数据，正常结束后清理测试资源。认证、连接及容量三个测试文件另覆盖初始化失败清理。旧认证测试曾连接默认演示库，已由`9befc8a`修正，历史影响和验证记录见[决策D016](docs/decisions.md)。12 秒、15 秒、60 秒的真实等待专项单独运行：

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
