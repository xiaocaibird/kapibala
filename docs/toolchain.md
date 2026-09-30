# 工具链与环境

2026-09-30 18:35 实测，macOS 26.5.2 / arm64。用户授权按合适的最新稳定版本升级必要环境；保留 React 18 的需求约束。

| 工具 | 实际版本 | 选择与验证 |
|---|---|---|
| Node.js | 24.21.0 LTS | 官方 index 与 SHA-256 校验后安装到 nvm 并列版本；项目 `.nvmrc` 固定，不修改其他项目默认版本 |
| npm | 12.1.0 | 官方 registry latest；兼容 Node 24.21；唯一 package-lock.json，不另引入 pnpm |
| Docker Desktop | 4.93.0 | 官方 updater 升级；保留数据库卷，暂停后恢复 PostgreSQL |
| Docker Engine / Compose | 29.8.1 / 5.5.1 | 升级后实际 CLI 核验 |
| PostgreSQL | 17.11（17-alpine） | 2026-09-30 官方维护表与安全页确认17系最新安全维护版本；成熟受支持主线，无需为本项目无差别升级主版本。真实连接/事务测试通过 |
| React / Vite / TypeScript | 18.3.1 / 8.3.1 / 7.0.2 | React 遵守指定主线；其余取官方 registry 当前稳定，package 与 lock 精确固定 |

执行前 `nvm use`；若当前 shell 未加载 nvm，使用 Node 安装路径加入本 shell PATH。`npm ci` 后 `npm run db:migrate`。npm 12 对依赖安装脚本默认隔离，当前无需放开全部脚本；构建验证实际需要时仅允许相应包。

已通过：新 Node/npm 运行、Docker/Compose 启动、数据库健康、重复迁移、会话轮换/重放撤销/权限/注销集成测试；`npm audit --audit-level=high` 报告 0 vulnerabilities。系统整体构建和业务验证随模块集成进行，以上不表示 A/B 整体验收完成。

来源：[Node 官方分发](https://nodejs.org/dist/index.json)、[Node 24.21.0](https://nodejs.org/en/blog/release/v24.21.0)、[npm 12.1.0](https://github.com/npm/cli/releases/tag/v12.1.0)、[Docker Desktop 4.93.0](https://docs.docker.com/desktop/release-notes/#4930)、npm registry 各包 dist-tag 元数据。

PostgreSQL 维护依据：[版本支持表](https://www.postgresql.org/support/versioning/)、[17 系安全修复](https://www.postgresql.org/support/security/17/)。
