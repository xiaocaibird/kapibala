# 最后一轮增强：后端开发交付记录

日期：2026-10-02。基线 `ac5e8e639237070fb5c48751ce04a7645b4a19ab`，开发代码与用例提交 `d832573e7302b00e655da17f8dcce2acac96b4b8`。范围为 [V3](product-enhancement-proposal.md) 的 P0-05、P1-03、P1-04；本轮已获实施授权，包括新增的托管目标保护政策。

**结论：本分支开发与定向自测完成，待负责人 review。** 本记录不是 QA 通过或正式业务验收结论；按最新交付安排，不合并 main，不发起这一轮 QA。没有修改 QA 用例、演示数据、外部协议或真实模型服务。首次验收已有时限和恢复边界不由本轮关闭。

## P0-05：关键守卫检错与一个职责入口

关闭群 Agent 的 PATCH 继续在原群行锁及事务内完成资料 CAS、取消请求与 `group_changed` 事件。CAS 成功后通过既有 `requestGroupAgentCancellation(tx, groupId)` 更新运行；该函数不自行提交、不调用远端、不异步补写。关闭后仍允许当前步完成，再停止后续轮次。[入口](../apps/server/src/modules/gateway/index.ts)与[事务协作实现](../apps/server/src/modules/automation/lifecycle.ts)保持原顺序。

本次明确的归属与检查范围：

| 数据/规则 | 权威入口 | 本轮约束 |
|---|---|---|
| `groups` 资料、开关及资料 CAS | gateway PATCH | 继续由 gateway 在群事务内更新 |
| `agent_runs.cancel_requested` | automation/lifecycle | gateway 委托同一事务，不能重复直接写 SQL |
| `agent_runs`、`agent_steps`、`agent_pending`、`agent_send_keys`、`sequence_runs`、`sequence_steps` 的写入 | automation 内部及既有事务协作函数 | 有限门禁扫描 gateway 下 12 个 TypeScript 文件中的字面量 SQL；允许读取和函数委托 |
| 事件提交 | 既有 `emit(tx, ...)` | 不拆出原事务；事件写失败时资料及取消请求一起回滚 |

[`check-automation-boundaries.ts`](../scripts/check-automation-boundaries.ts) 已进入 `npm run typecheck` / `build`。使用已固定 TypeScript 7.0.2 的导出 scanner 识别字符串与模板片段，跳过源码注释；未增加依赖。自检覆盖允许读取/委托、直接 UPDATE、带引号表名及模板插值；临时副本新增 `UPDATE agent_runs` 的违规文件后，门禁以明确文件和行号退出 1。

这不是完整 SQL 数据流或表归属证明：动态拼接表名、运行时生成 SQL、其他模块和未列出的表不在本轮门禁覆盖内。升级 TypeScript 时需要复验 scanner 接口。没有开展全模块重构。

两条固定检错实验均在提交副本中执行，原产品不含错误补丁：

| 实验 | 正常实现 | 最小错误补丁及实际后果 | 判定 |
|---|---|---|---|
| 审计 `fail` 不派发 | 审计 1 次；远端 send 0；消息/key 各 0；`AUDIT_REJECTED` | 绕过 send 的 `fail` 分支；真实 HTTP send 1，消息/key 各 1，错误码消失 | 指定业务断言 `ERR_ASSERTION`；另一用例仍通过 |
| 同 key 复用，不重审不重发 | 审计 1 次；真实 HTTP send 1；消息/key 各 1；两步 clientMsgId 相同 | 同 key 已有分支额外调用审计；审计变为 2，消息和发送仍各 1 | 指定审计次数断言 `ERR_ASSERTION`；另一用例仍通过 |

原实现 2/2 通过；每个错误副本均为 1 pass、1 指定 assertion fail。没有把编译、连接、夹具失败或超时当作检出。实验只证明这两种确定错误能被当前断言发现，不推导全部审计/幂等实现均正确；审计非确定响应及旧执行者失权另有既有回归。

复跑入口：在干净、已提交的工作树，配置独立开发 PostgreSQL 的 `DATABASE_URL`，执行：

```sh
npm run verify:boundaries -- --self-test
node_modules/.bin/tsx scripts/verify-automation-guards.ts --output .runtime/guard-evidence
```

脚本从 HEAD 归档临时源副本，只修改副本，保存最小替换补丁、源 SHA-256、命令与原始 TAP，并 finally 删除副本。测试夹具创建 UUID 数据库并清理；不得把 `DATABASE_URL` 指向演示或 QA 服务。

## P1-03：后台诊断的安全原因和下一步

入口仍为 **管理员 API `GET /api/diagnostics/background`**，需要正常管理员 Bearer 身份；本轮没有新增前端诊断页面。原有响应字段、匿名 401、viewer 403 和公开 health 保持不变。

每个模块增量字段如下：

| 字段 | 含义 |
|---|---|
| `tickId` | 最近一次实际调度 tick 开始时生成的 UUID；用于与受限服务日志关联 |
| `lastFailure.reason` | 稳定白名单类别：数据库不可用/争用/查询取消，远端不可用/拒绝，响应结构无效，或未分类失败 |
| `lastFailure.occurredAt` | 该 tick 失败被捕获的 ISO 时刻，等于其 `lastFailedAt`，不冒充故障最早发生时刻 |
| `lastFailure.correlation` | 实际模块名及失败 tickId；日志记录同一关联，不编造群、消息或步骤 ID |
| `lastFailure.recoveredAt` | 后续首个成功 tick 的时刻；只表示调度随后成功，不表示此前业务或未知远端效果已恢复 |
| `lastFailure.nextStep` | 失败发生时的保守处置说明，属于历史记录 |
| 顶层模块 `nextStep` | 当前建议；恢复后明确保留历史且不保证业务完成 |

分类读取受控异常类型或已知 PostgreSQL SQLSTATE，不公开异常原文、任意错误码、连接串、凭据或消息正文。未知错误仍明确为 `UNEXPECTED_FAILURE`，不猜测实体归因。所有涉及未知远端效果的说明均要求核对既有事实，没有一键重发或“失败等于未执行”的表述。

[实现](../apps/server/src/core/module-progress.ts)仍是**进程内最近失败记录**：重启不保留历史，不新增持久日志库；调度 tick 捕获不到的模块内部异步异常、启动前失败不由此证明已覆盖，后台禁用也不代表所有业务健康。真实受控 tick 抛错、实际 PostgreSQL statement timeout、后续 tick 恢复与权限均已通过定向测试；日志关联来自执行中的真实 tick，不使用测试捏造实体。

## P1-04：托管身份的自动移除保护

这是一项负责人明确选择的新增业务政策，不回写为原始权限契约曾经缺失。后端的 `kick_user` 工具在审计通过后的群事务中检查一次，在真实移除调用前、容量准入及持久化 dispatch intent 完成后再次读取数据库当前事实。模拟 Agent 和真实模型均走同一工具执行入口；本轮没有额外调用真实模型。

身份识别采用两项当前已提交事实：`accounts.platform_user_id` 对应的托管身份，或本群 `members.account_id` 非空的托管关联。不根据模型给出的角色、缓存的成员列表放行。账号断连或组内角色为普通成员不取消保护。账号身份刷新与成员投影存在短暂差异时，保守保护已知当前账号身份及仍有托管关联的旧投影；普通外部目标保留现有开关、审计、执行账号权限与远端处理规则。

拒绝沿用工具已有 `POLICY_DENIED`，不增加外部错误码或网关能力；拒绝不派发远端 kick，也不把本地拒绝记成移除成功。保护不扩展到外部成员角色白名单或人工移除流程。

已验证的情形：群主、管理员、断连普通托管成员、成员投影尚未出现的当前账号身份、账号更换身份时旧托管投影；审计等待、真实执行容量等待和 dispatch intent 的真实 PG 行锁等待期间，目标变为托管身份，均零远端 kick；正常外部目标真实调用一次。现有不可写、权限错误、运行失权与未知派发恢复用例继续回归。

[守卫实现](../apps/server/src/modules/automation/tool-execution.ts)使用实际派发前的新数据库读取，不能把它解释为数据库身份变更与外部 HTTP 操作之间的分布式原子事务：最终检查完成后的外部并发变化仍无跨系统原子保证。已派发或保存为 `dispatching` 后崩溃的未知意图仍保守暂停，绝不以新政策推定旧操作没执行或自动重放。这个边界未新增外部协议、未改变既有恢复决定。

## 开发验证与证据

固定源提交：`d832573e7302b00e655da17f8dcce2acac96b4b8`；Node `24.21.0`、PostgreSQL `17.11`。使用本线独占容器及每例 UUID 数据库，测试文件并发为 1；变异实验与关联回归可在各自 UUID 数据库同时执行。所有远端效果来自独立本地 HTTP 夹具，没有真实模型费用。

| 验证 | 实际结果 | 证据 |
|---|---|---|
| 最终定向：新守卫、容量、资料 CAS、回滚、诊断与资源既有场景 | 37 pass / 0 fail / 0 skip | [focused-final.tap](evidence/final-enhancement-backend-20261002/focused-final.tap) |
| 关联：automation、CAP009 恢复、运行时观测兼容、既有修复、派发预算 | 69 pass / 0 fail / 3 skip | [regression.tap](evidence/final-enhancement-backend-20261002/regression.tap) |
| 两条固定错误补丁 | 基线 2/2；两次各 1 个指定断言失败 | [manifest](evidence/final-enhancement-backend-20261002/mutations/manifest.json)、[审计补丁](evidence/final-enhancement-backend-20261002/mutations/audit-fail-bypass.patch.json)、[同 key 补丁](evidence/final-enhancement-backend-20261002/mutations/same-key-repeat-audit.patch.json) |
| 有限静态门禁 | 当前 12 文件通过；受控越权文件 exit 1 | [正常及自检](evidence/final-enhancement-backend-20261002/boundaries.log)、[受控违规](evidence/final-enhancement-backend-20261002/mutations/controlled-boundary-violation.log) |
| TypeScript、前端生产构建 | 通过 | [typecheck](evidence/final-enhancement-backend-20261002/typecheck.log)、[build](evidence/final-enhancement-backend-20261002/build.log) |

关联回归的三项 skip 是既有可选 12 秒 turn 超时、三次 5 秒审计超时、60 秒活动预算长时检查。本轮没有启用或据此声称严格时限通过。初次新用例的三个夹具/断言编写错误（账号枚举、步骤状态拼写、把终态响应计入工具步）已更正，保留 [初次失败记录](evidence/final-enhancement-backend-20261002/initial-focused.tap)，未更改产品行为来放宽期望。

[命令](evidence/final-enhancement-backend-20261002/commands.txt)、[清理记录](evidence/final-enhancement-backend-20261002/cleanup.json)、[校验和](evidence/final-enhancement-backend-20261002/SHA256SUMS)一并保留。容器移除前临时数据库和连接均为 0；所属容器及匿名卷已删除，错误源副本已删除。证据经过凭据格式检查与人工核对，运行时 owner token 已由既有用例脱敏。无 QA 资产或演示环境变更。

后续 review 可直接从管理员诊断 API、新托管目标工具用例、两条检错原始 TAP 和原群开关 PATCH 入口开始。新一轮 QA 用例及判定继续由 QA 维护，须等负责人后续明确指示再联调；本报告不继承或覆盖首轮 QA 的未通过项。
