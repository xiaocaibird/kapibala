# 模块协作接口

> 代码入口与命令均相对于项目根目录。运行位置、当前演示版本和证据边界见[文档入口](README.md)。

共享基础由协调模块维护。领域行使用 PostgreSQL snake_case；公开 API 使用 contracts 中 camelCase。日期字段输出 ISO UTC。所有写 API 由入口统一校验管理员权限。错误抛 AppError(status,code,message,details)。远端 RemoteError 保留 status/code/body。

网关模块 `apps/server/src/modules/gateway/index.ts` 导出 `createGatewayModule(ctx): PlatformModule & MessagingService`。负责账号、群、jobs、messages REST；SSE ingestion；统一发送 tick、群任务、kick。启动 register 后 tick 每 100ms（入口防止同模块 tick 重叠）；长任务应独立调度，避免一个等待阻塞整个队列。注册模块前数据库迁移必须齐全。

Agent/序列模块 `apps/server/src/modules/automation/index.ts` 导出 `createAutomationModule(ctx,messaging): PlatformModule`。负责 Agent/sequence APIs、tick/recover；自行维护 migration 002_automation.sql。Agent 触发由该模块扫描 messages 的非自身记录并持久去重，无需网关调用回调。网关模块终态/群不可写事务需同步更新 Agent/sequence 的行或步骤，依照后续共享 schema 约定。此接口若需变更先协调。

MessagingService.enqueueSend(input,tx?) 返回公开 Message（包含稳定 id）；提供 tx 时与调用方同一事务，否则自建事务。getMessage(clientMsgId) 查询当前状态。kick 负责网关调用及成员一致性，Agent 持久化调用意图、防重放和审计。metadata 保留 source/sourceRef，可供跨模块追踪。

控制台仅修改 apps/web，REST 同源 /api，WS /ws；Vite proxy 指向 3100。额外 GET /api/auth/me 返回 {username,role}；GET /api/sequences 返回 Sequence[]；POST /api/sequences/preview 接受 {sequenceId,vars,stepVars} 返回 {steps:[{index,text,resolvedVars,varSources}]}。消息追加的稳定 id、快照 cursor、实时 GET /api/groups/:id/messages 获取新快照并按 id 合并。鉴权 access token 用 Authorization: Bearer；refresh 由 cookie 发送。

执行单元只提交自己的模块及模块测试、文档。禁止改原始需求、共享 package/lock、入口、共享契约、其他模块。迁移与依赖修改先协调。

## 本批群 metadata 契约变更（已实现，待用户验收）

[CR-001、CR-002、CR-005](change-requests.md)已为 Group 增加本地可空名称、简介和 `createdAt: string`；日期仍按 ISO UTC 输出，取已有 `groups.created_at`。创建请求可省略新字段；PATCH 未提供的字段保持原值，简介显式清空才写空值。名称/简介不发送到 gateway，旧ID契约不变。字段校验建议、数据保留及最终实现提交以台账为准，当次schema5演示已启用，历史见[资料运行证据](evidence/group-metadata-rollout.json)；当前schema6运行见[群目录记录](evidence/group-directory-rollout.json)。

<a id="群目录增量契约已批准实施验证待完成"></a>
## 群目录增量契约（已实现并切换演示）

共享`GroupDirectoryItem`及`GroupDirectoryPage`已由`c4831e0`定义：新 `GET /api/group-directory?pageSize&order&q&cursor` 返回 `{items,nextCursor}`。`pageSize`为1–50整数、默认20，`order`为asc/desc、默认desc；q首尾trim、内部空白保留、最多500并拒NUL，按名称/简介/两个ID不敏感字面包含搜索。原 `GET /api/groups` 数组及详情/写接口不变。

目录摘要提供成员数及活动run ID，不返回完整成员数组；服务端按created_at方向、id始终ASC，用UTC六位微秒边界续页。cursor v1严格校验字段和值，绑定保留原大小写的trim后q、order、pageSize；每次请求仍鉴权，编码不是安全签名。正常活数据分页不是消息快照分页，不提供total或随机跳页。接口及客户端刷新/过期规则以[批准方案](group-directory-profile-proposal.md#2-目录接口与查询语义)为准；f7045d0实现已由真实PG相关场景验证，前端3486a11的控制器及独立浏览器证据见[GD01–GD12](acceptance.md#group-directory-acceptance)；未验细项保留。22:18:35已从main 9bc34fd启动schema6演示，实际保留与只读冒烟见[运行记录](evidence/group-directory-rollout.json)；用户验收仍待进行。
