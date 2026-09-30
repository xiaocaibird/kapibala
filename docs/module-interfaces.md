# 模块协作接口

> 文档基线说明：当前 `main` 仅含文档。本文的代码入口、启动与测试命令均指 `agent/platform-integration` 实施分支；工作树位置和证据边界见[文档入口](README.md)。

共享基础由协调模块维护。领域行使用 PostgreSQL snake_case；公开 API 使用 contracts 中 camelCase。日期字段输出 ISO UTC。所有写 API 由入口统一校验管理员权限。错误抛 AppError(status,code,message,details)。远端 RemoteError 保留 status/code/body。

网关模块 `apps/server/src/modules/gateway/index.ts` 导出 `createGatewayModule(ctx): PlatformModule & MessagingService`。负责账号、群、jobs、messages REST；SSE ingestion；统一发送 tick、群任务、kick。启动 register 后 tick 每 100ms（入口防止同模块 tick 重叠）；长任务应独立调度，避免一个等待阻塞整个队列。注册模块前数据库迁移必须齐全。

Agent/序列模块 `apps/server/src/modules/automation/index.ts` 导出 `createAutomationModule(ctx,messaging): PlatformModule`。负责 Agent/sequence APIs、tick/recover；自行维护 migration 002_automation.sql。Agent 触发由该模块扫描 messages 的非自身记录并持久去重，无需网关调用回调。网关模块终态/群不可写事务需同步更新 Agent/sequence 的行或步骤，依照后续共享 schema 约定。此接口若需变更先协调。

MessagingService.enqueueSend(input,tx?) 返回公开 Message（包含稳定 id）；提供 tx 时与调用方同一事务，否则自建事务。getMessage(clientMsgId) 查询当前状态。kick 负责网关调用及成员一致性，Agent 持久化调用意图、防重放和审计。metadata 保留 source/sourceRef，可供跨模块追踪。

控制台仅修改 apps/web，REST 同源 /api，WS /ws；Vite proxy 指向 3100。额外 GET /api/auth/me 返回 {username,role}；GET /api/sequences 返回 Sequence[]；POST /api/sequences/preview 接受 {sequenceId,vars,stepVars} 返回 {steps:[{index,text,resolvedVars,varSources}]}。消息追加的稳定 id、快照 cursor、实时 GET /api/groups/:id/messages 获取新快照并按 id 合并。鉴权 access token 用 Authorization: Bearer；refresh 由 cookie 发送。

执行单元只提交自己的模块及模块测试、文档。禁止改原始需求、共享 package/lock、入口、共享契约、其他模块。迁移与依赖修改先协调。
