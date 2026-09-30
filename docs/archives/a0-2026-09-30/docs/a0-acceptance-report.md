# A0 基础需求验证报告

状态：**固定基线的自动化验证通过，待验收人确认。** 本报告不代表已经完成人工验收，也不覆盖后续提交。

## 基线、时间与隔离

- 依据：`docs/original-interview-question.md` 的 A0 与 2.3。
- 产品基线：`main` 提交 `ef3619577228ee8a776023a99c296a0fdbeb8948`，数据库版本 6。
- 验证分支：`agent/a0-acceptance-evidence`。
- 工作区：`/Users/zcm/.codex/worktrees/a0-acceptance/kapibala`。
- A0 定向执行：2026-09-30（Asia/Shanghai）；最终执行开始、结束及清理复核的精确 UTC 时间见 JSON 的 `startedAt`、`completedAt`、`cleanupVerification.at`。
- Node.js `v24.21.0`、npm `12.1.0`、tsx `4.23.15`、TypeScript `7.0.2`、Fastify `5.12.5`、pg `8.23.0`；数据库为 PostgreSQL `17.11`，容器镜像 `postgres:17-alpine`。
- 只使用已有 PostgreSQL 容器的 `postgres` 管理库创建独立 UUID 临时数据库；没有向演示 `kapibala` 数据库执行迁移、业务写入或故障注入。没有以随机 schema 代替数据库隔离。
- API 定向测试使用生产 `createApp`、gateway 与 automation 注册逻辑，停用后台任务；外部故障由本次独立 HTTP fixture 提供。真实启动检查运行 `apps/server/src/main.ts` 子进程，服务及 fixture 均使用动态端口。没有操作浏览器或重启既有演示端口。
- 测试通过 `temporaryDatabase` 的 `t.after` 清理；另已查询确认本次临时数据库不存在，真实服务与外部 fixture 端口均已关闭。
- 原题 SHA-256 在测试前后均为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`，`npm run verify:original` 通过。

## 结果清单

| 检查 | 预期 | 实际观察 | 状态 | 证据 JSON observation id |
|---|---|---|---|---|
| 旧 schema 启动保护 | schema 落后时不启动 | 从原始迁移 SQL 建立真正的版本 5 数据库，第 6 次迁移的索引不存在；生产入口进程退出码 1，输出 `Schema mismatch: installed=5, required=6`，未监听端口 | 通过 | `migration-startup` |
| 补迁移恢复 | 补迁移后服务可用 | 执行原有 `migrate()` 后索引存在；再次启动生产入口，HTTP `/api/health` 返回 200、`ok: true`、`schemaVersion: 6` | 通过 | `migration-startup` |
| 迁移可重复 | 第二次执行不改变结构、迁移记录及既有业务数据 | 迁移前后所有 public 列、约束、索引、序列定义/值一致；6 条迁移记录含 `applied_at` 一致；已有账号、群资料、成员、消息、任务、序列及运行数据逐表行数与摘要一致 | 通过 | `migration-repeat` |
| 两种身份登录 | 均返回非空 accessToken，15 分钟有效期 | admin/viewer 均返回非空 string；实际存储的 `access.expires_at - session.created_at` 均恰为 900 秒；`/api/auth/me` 身份匹配 | 通过 | `login-and-viewer-reads` |
| viewer 可读 | 已注册业务读接口可访问 | 下列 10 个业务 GET 均返回 200 | 通过 | `login-and-viewer-reads` |
| viewer 拒绝业务写入 | 所有当前注册写路由均 403，无业务副作用 | 运行时捕获的业务非 GET/HEAD/OPTIONS 路由与 9 项测试矩阵完全一致；逐条返回 `403/FORBIDDEN`；每次请求后逐表业务快照一致，外部请求增量为 0 | 通过 | `viewer-all-write-routes` |
| 统一错误契约 | `{ error: { code, message, requestId, ...业务字段 } }` | 15 个代表错误场景及 9 个权限拒绝场景均满足共同结构；message 非空、requestId 为非空 UUID 且样本间不重复；422 保留业务字段 | 通过 | `error-envelope`、`viewer-all-write-routes` |
| 到期边界 | 未到期允许，已到期拒绝 | 临时数据库中设未来到期返回 200；到期时间设为当前数据库时刻后，请求返回 `401/UNAUTHORIZED` | 通过 | `expiry-and-session-lifecycle` |
| 会话生命周期 | viewer 可以续期和退出自己的身份会话 | viewer refresh 返回 200 及非空新 accessToken；logout 返回 200；退出后 access 与 refresh 均返回 `401/UNAUTHORIZED` | 通过 | `expiry-and-session-lifecycle` |
| 真实进程重启后的权限 | 已持久化身份与业务权限在重启后仍成立 | 关闭原应用后启动生产入口；原 admin/viewer token 的 `/api/auth/me` 均 200；viewer 的 10 个业务 GET 均 200，9 个受限接口仍全部 `403/FORBIDDEN`，逐次业务快照不变 | 通过 | `real-process-session-restart` |

重复迁移检查对所有业务表（含空表）和迁移记录进行快照比较；`auth_sessions`、`auth_tokens` 不纳入业务快照。登录有效期及会话撤销另外直接验证。证据只保存行数、摘要和必要字段，不保存 token、refresh cookie 或其数据库哈希原值。

viewer 可读清单：`GET /api/accounts`、`GET /api/groups`、`GET /api/group-directory`、`GET /api/groups/:id`、`GET /api/groups/:id/messages`、`GET /api/jobs/:id`、`GET /api/sequences`、`GET /api/sequence-runs/:id`、`GET /api/agent-runs/:id`、`GET /api/groups/:id/agent-runs`。每个带 id 的请求使用实际存在的测试资源。

## viewer 权限矩阵

请求使用有效 viewer token、实际存在的群/账号/序列及合理业务参数。测试同时检查运行时注册列表，避免以不存在路径的通用 403 充当路由覆盖。

| 方法 | 注册路由 | 实际 HTTP / code | 每次请求后的业务快照 | 外部调用增量 |
|---|---|---|---|---|
| POST | `/api/accounts/:id/connect` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/accounts/:id/transition` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/groups` | 403 / FORBIDDEN | 不变 | 0 |
| PATCH | `/api/groups/:id` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/groups/:id/send` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/groups/:id/leave-all` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/sequences` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/groups/:id/sequence-runs` | 403 / FORBIDDEN | 不变 | 0 |
| POST | `/api/sequences/preview` | 403 / FORBIDDEN | 不变 | 0 |

前 8 个接口可改变业务状态。`POST /api/sequences/preview` 自身只解析预览，但现有权限策略对该 POST 同样拒绝 viewer，因此纳入验证。当前没有注册其他业务 PUT/DELETE 或 Agent 写接口。

`POST /api/auth/login`、`POST /api/auth/refresh`、`POST /api/auth/logout` 是身份会话操作。viewer 正常登录、续期和退出不属于业务写权限违规。另一个边界是 `GET /api/groups/:id/messages` 会保存内部翻页快照；这不改变群、消息或运行业务状态。本次拒绝写入的基线在读取完成后建立，避免把读请求的内部快照误判为拒绝请求的副作用。

## 代表错误来源

所有场景都经过真实应用统一错误处理器；未新增用于直接抛异常的假 API 路由。

| 来源 / 场景 | HTTP | error.code | 额外验证 |
|---|---|---|---|
| login Zod 校验 | 400 | VALIDATION_ERROR | `issues` 保留 |
| 建群业务参数校验 | 400 | VALIDATION_ERROR | `issues` 保留 |
| 非法 JSON 请求体 | 400 | VALIDATION_ERROR | 框架解析错误也进入共同 envelope |
| 缺少 access token | 401 | UNAUTHORIZED | 非空 message/requestId |
| 无效 access token | 401 | UNAUTHORIZED | 同上 |
| 密码错误 | 401 | UNAUTHORIZED | 同上 |
| viewer 的 9 个受限业务接口 | 403 | FORBIDDEN | 每个接口均验证完整 envelope |
| 群不存在 | 404 | GROUP_NOT_FOUND | 业务不存在错误 |
| 未注册 API | 404 | NOT_FOUND | 通用不存在处理器 |
| 不合法状态转移 | 409 | ILLEGAL_TRANSITION | 冲突错误 |
| 状态前置条件不符 | 409 | CAS_CONFLICT | 冲突错误 |
| 离线账号创建群 | 422 | ACCOUNT_NOT_ONLINE | 业务校验 |
| 未解析序列变量 | 422 | UNRESOLVED_PLACEHOLDER | `stepIndex: 1`、`key: "topic"` 原样保留 |
| 独立外部 HTTP fixture 返回 503 | 502 | UPSTREAM_UNAVAILABLE | 真实 RemoteClient 到统一处理器 |
| 独立外部 HTTP fixture 返回非 JSON | 502 | BAD_JSON | 同上 |
| 临时数据库 accounts 暂时不可用 | 500 | INTERNAL_ERROR | 在专用数据库短暂改表名并在 finally 恢复；响应不泄露 SQL、表名或堆栈 |

这证明所列错误来源和样本符合 A0 契约，不代表穷尽每个 API 与每种故障的组合。未将网关内部的 401/403 状态与本服务的 401/403 权限契约混为一谈：此处上游 `RemoteError` 对外统一映射为 502。

## 执行与复核

已复用现有认证、数据库连接容量、平台 schema/viewer、序列预检测试：**4/4 通过**，约 7.42 秒。新增 A0 文件最终含一个父测试和七个子测试：**8/8 通过**，约 2.06 秒。这里的 8 包含父测试，不能当作八类独立业务需求。测试运行时记录实际 Git HEAD，并断言产品源码、迁移和 contracts 相对固定基线没有差异，避免在后续产品版本上误标本次基线。

补充真实进程重启的首次尝试中，重启子测试及其父测试失败：生产后台第一轮正常扫描为已有 fixture 消息补建了 `eligible=false` 的 `agent_pending` 记录，发生在测试取基线和比较之间。失败时 viewer 请求仍为 403。调整验证脚本为等待这一独立后台扫描完成后再取快照，最终重跑通过；没有修改产品逻辑。保留首次失败日志，以便区分验证时序问题和产品行为缺陷。

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:55432/postgres \
  node --import tsx --test \
  --test-name-pattern='PostgreSQL sessions|PostgreSQL lock admission|platform: schema lag|platform: sequence preflight' \
  tests/integration/auth.test.ts tests/integration/database.test.ts tests/integration/platform.test.ts

A0_EVIDENCE_PATH=docs/evidence/a0-acceptance-verification.json \
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:55432/postgres \
  node --import tsx --test tests/integration/a0-acceptance.test.ts

node node_modules/typescript/bin/tsc --noEmit
npm run verify:original
node node_modules/prettier/bin/prettier.cjs --check tests/integration/a0-acceptance.test.ts
```

上述数据库用户/密码为项目公开的本地 fixture 约定；URL 选中 `postgres` 管理库。所用测试各自创建独立数据库。已有定向日志含一条 `idle_connection_error: terminating connection due to administrator command`，表示连接因管理命令终止；日志本身没有细分原因，本批 4 项测试均成功完成，新增 A0 的清理另已复核。

后端、脚本和测试的 `tsc --noEmit`、新增测试的 Prettier 检查、原题 hash 检查均通过。本次未运行完整项目测试矩阵或前端类型检查；没有前端/产品代码变更。

| 文件 | 用途 |
|---|---|
| [a0-acceptance-verification.json](evidence/a0-acceptance-verification.json) | 时间、版本、预期/观察、路由响应、迁移快照、执行命令与清理复核 |
| [a0-existing-tests.tap](evidence/a0-existing-tests.tap) | 复用测试原始控制台输出 |
| [a0-tests.tap](evidence/a0-tests.tap) | 新增定向测试原始控制台输出 |
| [a0-restart-fixture-initial.tap](evidence/a0-restart-fixture-initial.tap) | 首次重启补测的 fixture 时序失败原始输出 |
| [a0-acceptance.test.ts](../tests/integration/a0-acceptance.test.ts) | 可重跑的定向断言与证据生成 |

JSON 文件主体由测试产生；末尾 `cleanupVerification`、`validation`、`commands`、`tooling` 为执行结束后依据实际命令和复核结果补充。重跑测试会重新产生主体，清理复核元数据需要按该次结果重新填写。日志保存的是 Node 测试 runner 实际输出，仅去除行尾空白；不保证其文本格式在不同终端中完全相同。

## 验证边界与待确认事项

- **未验证**：人工浏览器流程、真实外部网关/Agent、生产部署环境、所有错误组合、15 分钟真实等待测试。token 有效期已通过实际数据库 900 秒间隔和到期前后请求边界证明；未声称进行过 15 分钟持续运行观察。
- **不在本报告范围**：固定基线之后的产品变更及其他需求组。后续行为变更应在对应提交上另行复核。
- **最终重跑的已测场景无失败项**；首次重启补测的验证时序问题及日志已保留。未因测试通过将验收状态改为“人工已验收”。
- 本分支仅增加验证测试、报告和证据；未修改产品实现、数据库迁移或原始需求，也未合入 `main`。
