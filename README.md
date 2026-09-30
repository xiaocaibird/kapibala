# 多账号群组消息平台

Node.js / TypeScript / PostgreSQL 后端，React 18 控制台，独立消息网关与 Agent 模拟服务。

## 本地启动

要求 Node 24.21.0、npm 12.1.0、Docker Desktop。项目使用唯一的 npm lock 文件。

```sh
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

测试说明与当前证据见后续需求矩阵。通过编译不代表全部业务通过；尚未人工验收的项目不标为已验收。

- [工程要求](docs/engineering-requirements.md)
- [决策与变更记录](docs/decisions.md)
- [模块接口](docs/module-interfaces.md)
- [实际工具链](docs/toolchain.md)
- [模拟场景与限制](docs/simulator.md)

原始需求文件保持字节不变；开发提交及交付前均验证校验值。
