# 需求实现与验证矩阵

> 代码入口与命令均相对于项目根目录。运行位置、当前演示版本和证据边界见[文档入口](README.md)。

本表按原始需求逐项记录实现入口、验证断言和限制。原始需求文件 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`，保持字节不变。

按模块查看原始能力、后续补充与待评审范围，请先读[当前功能总表](feature-matrix.md)。本页继续维护细分实现与执行证据；功能编号不替代本页测试索引。

## 证据口径与版本

早期群资料功能依据 `2d67500` 验证并从 `7efdbf3` 启动，新增要求见[变更台账](change-requests.md)；原基础功能的逐项历史证据以 `82312b9` 及之前版本保留，不能把当时的同源码说明扩展到新增功能。测试名称与路径见文末索引；后续修订需更新版本及受影响条目。**用户全面人工验收尚未完成，已确认的单点见变更台账**；开发者浏览器检查、自动验证均不等于用户已验收。

- **自动通过**：已实际执行且断言覆盖本行描述的场景，不扩大到未测分支。
- **部分验证**：已有实现和部分证据，列出的分支或时限仍待验证。
- **未验证**：已实现或已有测试源码，但尚无对应执行证据。
- **协议限制**：原协议缺少可判定证据，系统保守暂停；不能声称原始的任意崩溃自动完成保证已全部满足。
- **待修复**：有明确失败或已确认缺陷；修复后须复验。当前表不以“未验证”冒充失败。
- **未实现**：未进入当前范围的扩展。

本轮执行证据分开登记，避免把后续新增断言混入较早的全套结果：

| 证据 | 执行结果与覆盖 | 版本边界 |
|---|---|---|
| CR-013字段并发保护 | 定向138/138（web92、5个PG文件46）、构建/两项TS/SHA、16项双IAB观察；原值条件、锁屏障、原子回滚、草稿/重确认/迟到及相关事件通过，未重跑全部长计时 | `7e83191`；[GC01–GC06](group-profile-conflict-review.md)、[验证](evidence/group-profile-conflict-verification.json)、[运行](evidence/group-profile-conflict-rollout.json)；用户待验 |
| 本批 `.runtime/group-metadata-isolated-verification.log` | 143登记，140通过、3计时跳过、0失败，111.872秒；新增后端8项和前端7项均进入常规回归；独立base资源已清理 | `2d67500`；结构化结果见[本批验证](evidence/group-metadata-verification.json) |
| 历史日志名 `.runtime/release-isolated-verification.log`（原路径后续复用，旧哈希存结构化记录） | 128登记，125通过、3跳过、0失败，112.206秒；R1–R11及B38通过；额外临时base库与测试隔离资源已清理 | `82312b9`，相对f52faec仅测试和文档变化；Node计数含10个嵌套子场景 |
| 上轮发布工作树 `.runtime/release-final-verification.log` | 127登记，124通过、3跳过、0失败，111.589秒；含B37，R1–R11修复均进入常规回归 | `f52faec`；Node计数包含10个嵌套子场景 |
| 发布工作树 `.runtime/release-final-timing.log` | B21–B23同产品源码独立3/3通过，94.470秒；单项13.614/16.485/60.032秒 | `f52faec`；与当时82312b9产品源一致，未因当时纯测试/文档变化重复长等待；常规skip与独立执行分开计数 |
| 上轮发布工作树 `.runtime/release-verification.log` | 126登记，123通过、3跳过、0失败，111.47秒；P01–P15、G01–G31、B01–B20/B24–B36、M01–M11、T01–T03、R01–R05、H01、D01、W01–W13均通过 | `32bd438`；Node计数包含10个嵌套子场景，与本表顶层名称数量不同 |
| 上轮发布工作树 `.runtime/release-timing.log` | B21–B23同版本独立3/3通过，94.252秒；单项13.541/16.468/60.032秒，含观察等待 | `32bd438`；常规skip与独立实际执行分开计数 |
| [已有数据迁移验证](evidence/migration-upgrade.json) | 001+002真实旧库升级至003+004，全部既有消息/run/events字段不变、active_ms保留12345；二次迁移幂等；独立库已清理 | `32bd438`专项使用独立库；另有旧auth测试提前迁移演示库，见D016 |
| 构建与原文完整性 | `npm run build`、`npm run verify:original`通过 | `82312b9`；不替代业务断言或用户验收 |
| 较早常规与长计时记录 | `verification-final.log`：87登记/84通过/3跳过；`verification-timing-final.log`：3/3；`verification-kick-accounts.log`：P13补充断言1/1 | 保留在旧实施工作树，适用5a35ce6/52e7dbd及当时被测树；本轮常规结论以上方release日志为准 |

本轮日志位于 `/Users/zcm/.codex/worktrees/platform-gateway/kapibala/.runtime/`，历史日志位于旧实施工作树 `.runtime/`；原始日志属于忽略目录。R1–R11均已修复并通过82312b9最终常规回归，相同产品源码的独立长计时也通过；B37真实PG屏障修前失败、修后通过；82312b9补充真实PG锁状态证明follower正在等待，并新增B38初始化owner连接终止后的接管，2/2专项通过。新版B4的独立浏览器证据来自`32bd438`，与最终候选分别记录。[结构化测试记录](evidence/release-verification.json)保存最终128项常规测试与三项长计时各自的源码、日志哈希及测试隔离纠正记录。逐项修复和复验见[可靠性复查](reliability-review.md)。

**上一轮统一演示（已于20:57:22替换）：**main目录`/Users/zcm/Desktop/kapibala`，2026-09-30 19:57:51北京时间从`9befc8a580eb5dc034ed5771d3f3dfc3e756eb76`启动；父6107、模拟6109、API6110、Vite6111，health schemaVersion=4。manifest保存源码树哈希，产品源与`f52faec`完全一致。原PG容器卷保留，PG dump及两个模拟器JSON已备份校验，本次迁移前后17张表规范化JSON全一致。旧群4成员/5消息/1Agent/1序列保留；新开发者复验群`4e1fa8c5-ea29-40a6-b432-1490d4dfaa5b`明确新增并保留。正常关键流程已复验，原Chrome账号页仍登录且4账号online，待处理jobs/Agent/sequence/outgoing均0。具体见[运行与复验证据](evidence/demo-verification.json)，全部用户人工验收仍待进行。

**当前群资料演示：**main于20:57:22从 `7efdbf3` 启动，产品源与已验证 `2d67500` 一致，health schema5。005 nullable迁移两次执行后17表既有字段完全相同，4个旧群时间未改；用户最新群/消息在独立viewer页面保留，见[本批运行证据](evidence/group-metadata-rollout.json)。首轮gateway/automation曾使用默认库随机schema，之后独立库76通过/3跳过及完整独立base140通过已分别登记；不称首轮完全未接触演示库。

**测试环境历史修正：**冻结阶段旧auth测试连接默认演示kapibala库并执行两次迁移、写入测试会话，使其提前达到schema 4；业务行未被删除。`9befc8a`改auth/core/database为专用临时库，7项针对性检查及初始化失败清理通过；完整隔离基库复跑128登记/125通过/3跳过已单列，不以新修复抹去此前影响。原数据和会话保留。旧42fe进程已停止，历史后端34d9af2仅为推断版本，当前演示以manifest为准。

P 系列使用真实 PostgreSQL、真实业务模块、本地 HTTP/SSE 模拟服务；其中 P09 使用真实 WebSocket，P10 对独立业务服务进程执行 SIGKILL。G 系列使用真实 PostgreSQL 与受控网关适配器，其中G29另使用真实HTTP断流/取消；B 系列使用真实 PostgreSQL 和 HTTP Agent，但发送适配器受控。R 系列使用真实PG连接终止与HTTP服务验证连接失效。W 系列是受控 fetch / 纯合并逻辑检查。模块测试不替代跨模块和浏览器证据；P09 的三秒断言只覆盖服务端重放，不能直接证明浏览器完成渲染的时限。

表内路径简写：`gateway/` 和 `automation/` 位于 `apps/server/src/modules/`，`core/` 位于 `apps/server/src/`；`pages/`、`components/`、`hooks/`、`state/` 位于 `apps/web/src/`。测试文件路径均从项目根目录开始。

## A0 基础与统一契约

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 迁移可重复执行 | `scripts/migrate.ts` | H01连续调用migrate两次；升级证据从真实001+002旧库到003+004，保留字段及预算，二次迁移全部不变 | 自动通过：专项迁移保留字段与幂等；旧auth测试触及演示库的隔离遗漏见D016 |
| schema 落后拒绝启动 | `apps/server/src/app.ts` | P12 在真实PG移除最新版本记录，启动因Schema mismatch拒绝 | 自动通过 |
| Node/TS/PG、环境变量、健康检查 | `apps/server/src/main.ts`、`app.ts`、`.env.example` | P 系列 fixture 使用真实 PG 和独立配置；构建通过 | 部分验证：环境变量路径已用，health 字段专项断言待补 |
| API 错误统一 code/message/requestId，401/403 固定码 | `app.ts`、`core/errors.ts` | H01 覆盖状态码；W04 读取并保留错误码/requestId | 部分验证：所有错误来源及字段完整性未穷举 |
| UTC ISO 时间、无值 null、公开状态/字段 | `packages/contracts/src/index.ts`、各模块 public 映射、`apps/web/src/api/schemas.ts` | P01/P04/P08 读取业务字段；前端运行时校验 | 部分验证：全部端点及所有空值形态未逐项断言 |
| admin/viewer 登录、viewer 所有写请求 403 | `core/auth.ts`、`apps/web/src/state/auth.tsx` | H01两角色；P12全部8类业务写路由均403/FORBIDDEN；开发者已核对viewer隐藏入口 | 自动通过 + 开发者浏览器通过；额外preview写路由未单独枚举 |
| access token 15 分钟 | `core/auth.ts:issue` | 数据库 expires_at 设置 15 分钟；W01/W02 模拟失效续期 | 未验证：真实过期边界、15 分钟字段断言待补 |

## A1 账号状态

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 预置账号 idle/null，connect 稳定身份 | `db/migrations/001_core.sql`、`gateway/accounts.ts` | P 系列先连接预置账号；浏览器已连接 4 个账号 | 部分验证：初始空值与重复 connect 平台身份稳定专项待补 |
| 允许转移表、非法边/同状态、404、expectedFrom 必填 | `gateway/accounts.ts`、`gateway/index.ts` | G01非法同状态优先CAS；G23逐一验证36种from/to组合及终态connect拒绝 | 部分验证：全转移表通过；API 400/404及expectedFrom缺失组合仍待专项 |
| CAS 并发至多一成功、不后写覆盖 | `gateway/accounts.ts` | P05 两个合法竞争操作恰好一个 200、一个 409；G01 | 自动通过：此并发场景 |
| suspended/session_expired 无出边，重复终态静默 | `gateway/accounts.ts`、`gateway/state.ts` | G23两个终态全部出边拒绝；G02/G26重复终态只一条terminal事件 | 自动通过：终态出边与已测重复事件 |
| 终态成员移除、queued cancelled、failCode、序列 skipped 原子性 | `gateway/state.ts` | P05 确认成员删除；G02 通过数据库触发器失败注入核对整笔回滚及 skipped | 自动通过：G02状态/成员/消息/步骤同事务回滚及成功后果 |
| 所有来源终态后果一致、提交后事件 | `gateway/state.ts`、`gateway/events.ts`、`gateway/messages.ts`、`core/db.ts:emit` | G12同步kick suspended；G26同步send/异步account_status session_expired；G27异步message_failed suspended；G02回滚/提交事件 | 自动通过：上述来源的具体断言；M02/M04/M05阻止迟到事件或ALREADY_MEMBER恢复终态/left成员；全部错误与来源组合未穷举 |
| 限流自动恢复；已手动离线不恢复；刷新截止不算转移 | `gateway/accounts.ts:releaseRateLimits`、`gateway/messages.ts` | P02限流恢复；G03队列顺序；G24手动disconnected后到期仍离线 | 部分验证：恢复与手动离线反例通过；刷新截止事件计数待专项 |
| 标记 disconnected/idle 调 disconnect | `gateway/accounts.ts` | P05 执行合法转移；对应实现调用网关 | 部分验证：远端请求与状态联合断言待补 |

## A2 网关与可靠发送

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 三种发送共用持久出站、稳定 id、queued 起可见 | `core/messaging.ts`、`gateway/messages.ts` | P01/P03/P04 实际手动/Agent/序列发送；W06 稳定 id；浏览器已观察 queued→sent 单行 | 自动通过：P11明确accepted时远端消息数为0，随后sent |
| 多实例同一 outbox 不重复调用网关 | `gateway/messages.ts`、`core/db.ts:withLock` | G13双worker；G28强制终止持锁PG连接，新worker接管、旧worker不能写accepted/重发；P10 SIGKILL可确认成功恢复 | 自动通过：上述互斥和接管窗口；任意未知窗口见L1 |
| 明确 504 后 unknown，确认后收敛，不确认不重发，最多一次重发 | `gateway/messages.ts` | P02 覆盖已落地/未落地再发；G06/G07 两次均未落地失败且真实时钟 ≤5s | 自动通过：G30真实HTTP修前send=2、修后send=1；只使用窗口后发起的查询；原G07≤5秒与候选全套通过 |
| by-client-id 503 保持 unknown，恢复后两秒内确认 | `gateway/messages.ts` | G10查询恢复不重复；P11真实查询503期间unknown，恢复后<2秒sent | 自动通过：上述恢复场景 |
| 入站按 (groupId,msgId) 去重，同毫秒稳定排序、任意历史补投 | `gateway/events.ts`、`gateway/models.ts` | P01/P08；W08 同时间稳定 id 排序；G15 乱序 eventId | 自动通过：重复、乱序与历史补投测试场景；浏览器历史分页待验 |
| 自己回流一行 isOwn=true、不触发 Agent | `gateway/events.ts`、`automation/agent.ts:scan` | P01 单行 isOwn；P03/P07 运行数与副作用数；B07/W06 | 自动通过 |
| 数据库写失败不丢事件、不阻塞其他事件、inconsistency | `gateway/events.ts` | P06 注入单条写失败，其他消息成功，撤除故障后补齐且只有一条 | 自动通过：局部写失败；M06前20项持续失败时第21项恢复后仍能落库；完整数据库进程停机时长及告警延迟未覆盖 |
| 服务/SSE 停机期间事件恢复不漏 | `gateway/events.ts` | P06 断流并 503 后恢复；P10 业务重启查询收敛 | 部分验证：断流补齐已过；业务停机期间多个外部历史事件专项待补 |
| RATE_LIMITED 账号全局暂停、队首顺序、序列顺延 | `gateway/messages.ts`、`automation/sequences.ts` | P02 请求时间差 ≥1.95s；G03/G04 手动+Agent/503队首；B09 序列限流顺延 | 自动通过：已测限流与序列场景；跨全部来源同一瞬间竞争待扩展 |
| ACCOUNT_SUSPENDED / SESSION_EXPIRED | `gateway/state.ts`、`gateway/messages.ts` | G12同步kick suspended；G26同步send和异步account_status session_expired；G27异步message_failed suspended；B16 accepted后终态 | 自动通过：T01避免终态/成员事件锁死锁；T02只重试40P01/40001本地结果事务、远端send=1；候选全套通过 |
| GROUP_WRITE_FORBIDDEN 仅影响群、序列 stopped、Agent 当前步后取消 | `gateway/state.ts`、`automation/agent.ts` | G12同步kick、G27异步message_failed仅改变群并停止序列/标记取消；G14原子后果；B13当前步后取消 | 部分验证：来源传播和模块取消已过；真实HTTP错误到Agent当前步结束的完整链待专项 |
| SENDER_NOT_IN_GROUP / ACCOUNT_OFFLINE 仅消息 failed | `gateway/messages.ts` | G25两种错误都保留账号online、群active和成员，仅当前消息failed/failCode | 自动通过 |
| NOT_MEMBER_YET ≤2 次 promote；入群超过 10s 失败 | `gateway/jobs.ts` | G17 一次重试计数2；G19 调整持久时间触发 JOIN_TIMEOUT 且无提前 promote | 自动通过：G17/G19对应分支；G19是持久时钟推进断言，非实际等待10秒 |
| kick OWNER_LEFT/NO_PERMISSION 不改账号群，504 查询成员确认 | `gateway/messages.ts:kick`、`automation/tool-execution.ts` | B18成功/权限映射；P13真实HTTP 504确认、两个权限码、群仍active、3次审计及kick文本；G29取消贯穿HTTP/504等待/成员查询 | 自动通过：52e7dbd的P13另直接deepEqual核对三个场景全部账号响应不变；重入歧义见L3 |

## A3 建群、A4 时间线与实时事件

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 建群输入：全员 online、成员非空、不含群主 | `gateway/index.ts`、`gateway/jobs.ts` | 页面只选在线且分离群主；后端校验存在 | 未验证：422/400 反例组合待补 |
| 异步 create→invite→join事件→promote；creator无需事件入表 | `gateway/jobs.ts`、`gateway/events.ts` | P01 成员角色 creator/admin/member/member；G16；浏览器已完成4成员建群 | 自动通过：正常流程；异常邀请见 B2 |
| 新群 agentEnabled/autoKickEnabled=false；任务 errors 非空即 failed | `gateway/jobs.ts`、`gateway/models.ts` | P05 失败退出 errors；G19 JOIN_TIMEOUT；数据库默认设置 | 部分验证：所有 step 名称与新群两个默认值专项待补 |
| 群详情及仅 running 的 activeRunId | `gateway/models.ts` | 前端真实读取当前运行和成员；查询仅筛 running | 部分验证：所有终态 activeRunId 归零待专项断言 |
| 游标分页：新消息、历史补投、queued.sentAt 改写不重漏 | `gateway/index.ts` 快照；`apps/web/src/hooks/useTimeline.ts` | P01/P08；G22；W06/W07；快照内固定成员，后续更新以新快照合并 | 自动通过：后端快照与前端合并机制；浏览器“加载更早+重连”联合待验 |
| WS 先认证再推，seq 单调、已提交事件、sinceSeq 补齐去重 | `core/realtime.ts`、`core/db.ts:emit`、`apps/web/src/state/live.tsx` | P09 auth先到、所有seq>游标且唯一、注销断开；事务收尾分配seq并与领域状态共同提交；T01/T03并发回归 | 部分验证：真实WS、锁顺序和提交FIFO已有专项证据；全部事件类型字段仍未穷举 |

## A5 Agent（逐条）

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| A5.1 非自身消息触发；同群单 running；期间消息聚合下一 run | `automation/agent.ts:scan/startNext/finish`、`002_automation.sql` | B04/B07；P07 双实例、重复事件、两个run触发数1+2、每run3轮 | 自动通过 |
| A5.2 完整历史循环、12步、连续3协议错、合法响应清零 | `automation/agent.ts:run/turn/protocolError` | B05 连续3错误；B12 恰12轮；P03 错误后合法工具完成 | 自动通过：这些断言；“合法后重置再累计”反例序列待补 |
| A5.2 60秒活动预算、停机不计、等待容量计入 | `automation/agent.ts`、`automation/activity-clock.ts`、`003_agent_activity.sql` | B14/B15迟到turn/audit丢弃；B23真实60秒未满12步即wall_clock；B26/P15 kick预算中止且未知不重放 | 自动证据：B34–B36与32bd438真实60秒通过；R11在f52faec增加B37初始化栅栏回归，修前失败、修后通过；82312b9补PG实际锁等待与B38初始化owner终止接管，最终全套通过 |
| A5.2 每turn 10–15秒可配，超时计协议错、迟到丢弃 | `automation/agent.ts:constructor/turn` | B21实际默认12秒后TURN_TIMEOUT，下一合法轮结束，迟到响应不新增步骤 | 部分验证：真实12秒已通过；10/15秒配置边界专项待补 |
| A5.3 工具未知/入参错历史形状；坏JSON/重复ID/超时不追加assistant | `automation/protocol.ts`、`agent.ts:turn/protocolError` | B01/B05；P03 坏JSON→未知工具→正常完成 | 部分验证：B29已核对null/缺summary/错类型finish的INVALID_INPUT工具结果并继续合法end/finish；B30/B31验证恢复与限额；其他工具非2xx/缺字段等完整组合未穷举 |
| A5.4 send/kick执行前审计；明确pass才允许；fail拒绝 | `automation/tool-execution.ts:audit/send/kick` | B06 fail不占key；P03发送审计；B18/P13 kick合法成功、3次调用各有审计且文本字段正确 | 自动通过：已测send/kick审计流程 |
| A5.4 不确定最多3次，不计步，3次blocked/no side effect/通知 | `automation/tool-execution.ts:audit` | P03 500/坏JSON/maybe；B06次数3；B22实际3×5秒超时后blocked，迟到pass不发送 | 部分验证：B32失败注入验证工具完成与blocked同事务回滚；B33旧中间态恢复不进入下一turn；缺verdict、全部通知字段专项仍待补 |
| A5.5 仅online群成员；kick需creator/admin；无账号业务错误 | `automation/tool-execution.ts:account/delivery` | SQL角色/状态过滤；B16 accepted后账号终态为SEND_FAILED且无重发 | 部分验证：B16已通过；无账号及更多执行中状态变化分支待补 |
| A5.6 kick须autoKickEnabled | `automation/tool-execution.ts:kick` | B11关闭时POLICY_DENIED，零审计、零kick | 自动通过：关闭策略场景；审计期间关闭的竞态待补 |
| A5.7 run+key相同不重复发送/审计，读取当前状态；拒绝不占key | `agent_send_keys`、`tool-execution.ts:send` | P03第二次同key返回sent；B04/B06；B19完整SEND_TIMEOUT后同key读sent，enqueue/audit均1；P14真实HTTP仅一消息/一次审计 | 自动通过：同key成功、拒绝及5秒超时后的恢复场景 |
| A5.8 持久会话/步骤/审计/工具恢复，同runId不重复副作用 | `automation/agent.ts`、`tool-execution.ts`、`002_automation.sql` | B10持久final/prepared send；B08/B11不确定暂停；B24 turn失锁不写假协议错；B25审计失锁旧worker零发送、新worker安全恢复；B26/P15未知kick不重放；P10发送SIGKILL | 部分验证 + 协议限制L1/L3/L4；不声明任意崩溃自动正常结束 |
| A5.9 tool_result≤8KB，摘要≤200字，rawResponse≤2KB | `automation/protocol.ts`、`tool-execution.ts:recent` | B01字节上限；B12 55条长消息、limit100000、12步均≤8192 bytes | 部分验证：结果限制已过；每条≤500字、摘要200/原文2048字节专项断言待补 |
| A5.10 群不可写或关闭Agent，在当前步后cancelled | `gateway/state.ts`、`gateway/index.ts`、`automation/agent.ts` | B13已开始步骤完成后cancelled且无下一turn；G14群状态取消标记 | 部分验证：关闭场景通过；群不可写的真实跨模块链待补 |
| A5.11 同参重复get_recent_messages在12步内合理结束 | `automation/agent.ts:run` | B12 12次读取后budget_exhausted | 自动通过 |
| A5.12 步骤API可见，kind/tool/input/result/audit/error/raw | `automation/agent.ts:register`、`apps/web/src/pages/AgentRuns.tsx` | B04 API3步；B05错误kind/raw；浏览器已查看3步及audit pass | 部分验证：正常详情通过；blocked/协议错误原文浏览器待验 |
| 工具协议：恰好4工具、required全入参；finish/end_turn只写摘要 | `automation/protocol.ts`、`agent.ts` | B01工具契约；B10持久final；P03 finish后只有一条业务消息 | 部分验证：触发上下文所有字段与end_turn不发群专项待补 |
| get_recent_messages含触发/运行期间消息、sentAt升序/isOwn/截断 | `automation/tool-execution.ts:recent` | B07新消息进入下一触发；B12数量/字节限制 | 部分验证：工具实际读取包含运行期间新消息及排序字段待专项断言 |

## B1–B4 与前端

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| B1 序列格式、连续步号、角色admin优先/member字典序 | `automation/sequences.ts:register/advance` | P04实际两步；B20有管理员时优先admin、两个member选首个账号 | 部分验证：角色优先/字典序已通过；非法步号输入组合待专项 |
| B1 无角色skipped有时间，限流顺延不跳过 | `automation/sequences.ts:advance/progress` | B09限流等待后推进；B20无在线member时skipped且sentAt有值；G02账号终态skipped | 自动通过：无角色跳过与限流顺延；跳过后下一步精确起算另见排期行 |
| B1 vars继承、stepVars覆盖、空字符串、来源原始步 | `automation/sequences.ts:resolveSteps` | B02三步继承和空字符串；P04已执行变量和step:2来源 | 自动通过：规则场景 |
| B1 全步骤预检422/stepIndex/key；不发送不留running且能重启 | `automation/sequences.ts:register` | B03第3步422/code/key=missing/stepIndex=3、run0/send0；P04第2步错误字段后并发成功 | 自动通过：第3步完整错误字段、无副作用及预检后重新启动 |
| B1 同群并发启动恰一201、一409 | 群事务锁、序列部分唯一索引 | B03、P04真实PG | 自动通过 |
| B1 第一步启动后延迟、后续按前一步确认sent/skip后起算 | `automation/sequences.ts:advance/progress` | P04发送时间差；B09发送确认后精确延迟10秒排期 | 部分验证：正常发送已过；跳过链待补 |
| B1 重启只重排最早过期步骤，不补发全部 | `automation/sequences.ts:ensureScheduler/rebaseExpired` | B09正常接管只重排当前步；B17先追赶已确认sent，再重排下一未调度步，enqueue=1 | 自动通过：B09/B17正常接管与已确认发送恢复；B27强制终止调度锁，旧事务回滚、零enqueue，新owner按完整延迟重排；不外推任意崩溃窗口 |
| B2 INVITE_NOT_READY/readyAfter、过期一次重申、ALREADY_MEMBER | `gateway/jobs.ts` | G16过期；G17 ready等待/ALREADY_MEMBER/两次promote | 自动通过：G16/G17受控网关分支；真实HTTP组合仍可追加 |
| B2 leave-all非群主失败继续其他人、群主保留、错误可见 | `gateway/jobs.ts` | P05留群成员与错误；G20远端/本地成员一致 | 自动通过：P05/G20核对失败成员与群主保留、其余成员继续、两侧成员一致 |
| B2 成功left/members=[]，与远端成员视角解释一致 | `gateway/jobs.ts`、`gateway/models.ts` | G21外部用户仍在远端；公开left members=[]、job留gatewayMembersAtCompletion | 自动通过：M07–M11真实HTTP保留重入成员、GET失败保留已知成功并阻止不安全群主退出，候选全套通过；服务账号退出不等于移除外部用户 |
| B3 refresh仅HttpOnly cookie、每次轮换、旧重放整会话失效 | `core/auth.ts` | H01 cookie不在body、旧refresh重放后新旧access和新refresh均401 | 自动通过 |
| B3 logout同access立即失效 | `core/auth.ts`、`core/realtime.ts` | H01 REST401；P09 WS4401断开；W03过期access先续期注销 | 自动通过 |
| B3 前端过期自动续期，多401只refresh一次 | `apps/web/src/api/client.ts` | W01–W05；开发者刷新页面恢复成功 | 部分验证：机制通过；真实浏览器并发401/过期续期请求数待验 |
| B4 浏览器断线期间变化重连3秒内出现且不重复 | `apps/web/src/state/live.tsx`、`hooks/useTimeline.ts` | P09服务端3秒重放；W06/W07合并 | 开发者浏览器通过：32bd438在隔离hidden IAB的59行（3旧+55新+1历史）场景，首次GET503后无新事件或手动刷新仍自动补齐；恢复→渲染1872ms，失败请求→渲染284ms，无重复。仅此两页/WS故障场景；用户待验 |
| 前端1 登录、viewer隐藏写按钮 | `pages/Login.tsx`、`state/auth.tsx`、各页面权限分支 | 开发者admin/viewer登录、刷新恢复及viewer写入口隐藏；H01/P12权限 | 开发者浏览器通过；用户待验 |
| 前端2 状态与三个合法操作按钮 | `pages/Accounts.tsx:legalActions` | 浏览器已连接4账号；CAS接口P05 | 部分验证：viewer无操作列已通过；离线/重连/释放与终态按钮仍待验 |
| 前端3 成员角色、加载更早/实时/自身状态、最近run/blocked | `pages/GroupDetail.tsx`、`components/Timeline.tsx`、`AgentRunList.tsx` | 浏览器4成员角色、manual queued→sent单行、开启Agent/外部触发通过 | 部分验证：加载更早与blocked醒目提示待验 |
| 前端4 每步kind/工具/参数/摘要/审计/错误/原始响应 | `pages/AgentRuns.tsx` | 浏览器正常3步及audit pass通过；B05错误数据 | 部分验证：协议错误/blocked详情浏览器待验 |
| 前端5 选序列→vars/stepVars→来源预检→启动→进度/错误字段 | `pages/Sequences.tsx`、`components/SequenceProgress.tsx` | 服务端B02/B03/P04；浏览器缺location显示step2/key，补stepVars预检来源、两步均sent；截图evidence/console-sequence.png | 开发者浏览器通过；用户待验 |

## S1–S8 典型场景汇总

| 场景 | 直接证据 | 结论 |
|---|---|---|
| S1 accepted→sent | P11 accepted时远端消息数0，随后sent；浏览器queued→sent | 自动通过；用户待验 |
| S2 重复事件 | P01、P03、P07 | 自动通过：单行/单run/单副作用断言 |
| S3 自身回流 | P01、P03、B07、W06 | 自动通过 |
| S4 限流 | P02、B09、G03 | 自动通过：真实请求间隔与序列顺延 |
| S5 504后同key重试 | P03/B04；P03第二次同key返回sent断言已进入最终套；B19/P14覆盖SEND_TIMEOUT后读取原发送 | 自动通过：一次审计、一条远端消息、第二次返回sent |
| S6 坏响应→未知工具→正常 | P03、B05 | 自动通过：完成/错误轨迹；逐步raw字段由B05断言 |
| S7 并发启动 | P04、B03 | 自动通过：一个201/一个409 |
| S8 第3步预检失败 | B03第3步422、code、key=missing、stepIndex=3且无run/send；P04另覆盖第2步并随后成功启动 | 自动通过：第3步完整错误字段与无副作用 |

## 已知限制与扩展

| 编号 | 边界 | 当前行为与证据 |
|---|---|---|
| L1 | send请求已到远端但响应前崩溃；无明确504不能适用2秒404安全重试判据 | 持久记录保留unknown，查询到成功才收敛；G08保守不重发，P10证明一个可确认成功场景。不声称全局任意崩溃恰好一次 |
| L2 | 创建群无幂等键，也无本次job结果查询 | 远端成功/本地未存groupId后保留running+recoveryNote，不重复create；G18为可复现写失败窗口 |
| L3 | kick后目标重新入群、或副作用已发但本地未记结果 | 缺少安全重放证据时暂停，B11/B26/P15；P13正常504可判定窗口已通过，不能外推重新入群窗口 |
| L4 | Agent服务维护runId会话，相同历史请求不保证幂等 | 未记录响应的inflight_turn暂停并推inconsistency；B08。既不虚报失败，也不能标为自动恢复正常结束 |
| L5 | 无法覆盖全部瞬间的崩溃注入 | 已测持久final、prepared send、调度接管和业务SIGKILL窗口；其余不能由一项测试外推 |
| L6 | 时间线新快照完整遍历、SSE全历史重放 | 正确性优先，成本随历史增长；新版59行两页含一次503恢复1872ms通过，任意大历史量仍未证明 |
| L7 | 已修复的序列调度锁失效 | 853629b修复旧调度事务在锁连接失效后仍可提交的问题；B27最终套通过，旧事务拒绝、消息/入队为0、接管完整重排延迟；当前统一演示已加载该产品修复 |
| L8 | 已修复的504延迟旧404时序 | d50fd7b按查询发起时刻判断否定证据并在事务内复核持久状态；G30修前重复发送、修后一条原发送。候选32bd438常规全套通过；当前统一演示已加载该产品修复 |
| C1/C2/C3 | 媒体归档/真实模型/完整Playwright | 未实现；首阶段保留接入边界。当前必要自动验证与开发者浏览器检查已独立开展 |

## 测试名称索引

下列 ID 仅用于本表定位，名称为测试源码中的原名。修改名称时同步此表。执行：最新集成工作树 `npm test` 包含后端与控制台；也可用 `npx tsx --test apps/web/tests/reliability.test.ts` 单独运行控制台；可以用 Node test name pattern 选定单项。测试创建隔离数据库或schema的权限按本地 PostgreSQL 配置提供。

复查记录使用R1–R11表示十一项缺陷；本表R01–R05专指连接层测试，两者以名称和文件区分。新增嵌套子测试的Node计数不等于顶层测试名称数量。

### 系统场景：`tests/integration/platform.test.ts`

| ID | 完整测试名 |
|---|---|
| P01 | platform: message dedup, own echo, delayed delivery and historical pagination |
| P02 | platform: explicit 504 confirmation retries at most once and account-wide rate limit queues |
| P03 | platform: Agent exactly-once key, bad responses, audit blocking and no self-trigger |
| P04 | platform: sequence preflight, variable inheritance and concurrent single running |
| P05 | platform: account CAS, terminal atomic effects and owner-last failed leave |
| P06 | platform: database write failure retains events, reports inconsistency and replays after outage |
| P07 | platform: two instances enforce one Agent and share durable event replay |
| P08 | platform: frozen pagination survives queued sentAt changes |
| P09 | platform: authenticated WebSocket replays missed events and logout closes the stream |
| P10 | platform: SIGKILL during remote send recovers by evidence without resending |
| P11 | platform: S1 distinguishes accepted from sent and unknown survives query outage |
| P12 | platform: schema lag refuses startup and viewer is denied all business write routes |
| P13 | platform: audited kick confirms 504 and propagates permission errors without account mutation |
| P14 | platform: Agent SEND_TIMEOUT repeats the same key without re-auditing or duplicating delivery |
| P15 | platform: Agent kick deadline cancels real HTTP confirmation without replaying an uncertain effect |

### 网关模块：`tests/integration/gateway.test.ts`

| ID | 完整测试名 |
|---|---|
| G01 | 真实PG：并发账号CAS只有一个成功，非法边优先于状态冲突 |
| G02 | 真实PG：终态后果原子提交；步骤写失败整笔回滚 |
| G03 | 限流期间所有来源共用账号队列且恢复保持顺序 |
| G04 | 503退避不能让同账号后续消息越过队首 |
| G05 | 504已落地查询收敛为sent，不重发；自身回流去重且不触发Agent |
| G06 | 504明确未落地只重试一次，第二次仍未落地最终failed |
| G07 | 真实时钟：两次504且均未落地，在5秒内确定失败并且只重发一次 |
| G08 | 崩溃发送意图恢复为unknown，没有已知504不得重发 |
| G09 | 第二实例启动不能把活跃worker的发送标记为恢复未知 |
| G10 | 504查询不可用期间保持unknown，恢复后确认不会重复发出 |
| G11 | 已sent补投和重复确认不会重写首次确认时间 |
| G12 | kick同步终态错误也执行成员清理与取消，群错误只改变群 |
| G13 | 真实PG双实例发送互斥，单个outbox只调用一次远端 |
| G14 | 群不可写原子停止序列并取消Agent，不改变账号 |
| G15 | 真实PG事件写失败后重放，乱序eventId与任意历史补投均保留 |
| G16 | 建群包括creator/admin，过期链接重申，promote仅一次 |
| G17 | 邀请ready时间前不join，ALREADY_MEMBER无需等待事件，可重试一次promote |
| G18 | 建群远端成功但本地写失败时记录待确认，禁止重复创建 |
| G19 | join事件超过10秒未到，任务失败且不提前promote |
| G20 | 非群主退出失败继续其他成员，群主不退出 |
| G21 | leave-all服务账号全部退出但保留外部用户，left公开视图为空并保存远端证据 |
| G22 | 时间线快照在历史补投和queued.sentAt改写时保持原始分页无重漏 |
| G23 | 账号完整36种状态组合严格遵循允许转移表，终态无出边 |
| G24 | 限流到期前已手动离线，不得被过期调度恢复为online |
| G25 | ACCOUNT_OFFLINE及SENDER_NOT_IN_GROUP只失败当前消息，账号和群不变 |
| G26 | 同步SESSION_EXPIRED与异步account_status都执行相同终态后果 |
| G27 | 异步message_failed按错误传播账号终态或群不可写，不能混淆范围 |
| G28 | 发送持锁连接丢失后新worker就地接管，旧worker不能写accepted或重发 |
| G29 | kick调用方预算贯穿HTTP请求、504收敛等待和成员查询，未知时不删除成员 |
| G30 | 真实HTTP：窗口内取得的404延迟返回后不得触发重发，后续查询确认原消息 |
| G31 | kick已确认删除等待群投影事务，旧成员快照不能覆盖删除结果 |

### 自动化模块：`tests/integration/automation.test.ts`

| ID | 完整测试名 |
|---|---|
| B01 | tool definitions have all required arguments; invalid protocols are rejected |
| B02 | sequence variables persist overrides and report the first unresolved step |
| B03 | PostgreSQL serializes concurrent sequence starts and failed preflight creates no run |
| B04 | multiple workers create one agent run and same send key is audited and enqueued once |
| B05 | bad JSON, unknown tool, duplicate tool id are recorded without corrupting history |
| B06 | inconclusive audit blocks without side effects; rejection does not reserve a send key |
| B07 | messages arriving during a run become one next trigger and own messages never trigger |
| B08 | interrupted remote turn is visibly paused and never replayed |
| B09 | sequence rate limit defers, sent event schedules next step, and restart only reschedules earliest step |
| B10 | persisted final and prepared send recover without replaying prior external work |
| B11 | kick policy and persisted uncertain kick cannot produce a second side effect |
| B12 | repeated reads stop within twelve steps and result bytes remain bounded |
| B13 | disabling Agent during its current step cancels after that step, without another turn |
| B14 | activity budget interrupts a late turn and discards the eventual response |
| B15 | activity budget expires during audit without authorizing the prepared tool |
| B16 | an accepted send whose account becomes terminal yields SEND_FAILED without a resend |
| B17 | restart catches up a committed send before rebasing the next unscheduled step |
| B18 | kick permission errors remain tool errors and a confirmed kick succeeds |
| B19 | SEND_TIMEOUT retries with the same key read the eventual send without re-auditing |
| B20 | sequence roles prefer admin, choose the first member, and skip unavailable roles with a timestamp |
| B21 | timing: the default twelve-second turn timeout discards the late response |
| B22 | timing: three five-second inconclusive audit attempts block without sending |
| B23 | timing: sixty seconds of activity ends the run even below the twelve-step cap |
| B24 | loss of the advisory-lock connection aborts a turn without saving a false protocol error |
| B25 | loss of a run lock during audit prevents old-worker effects and permits safe audit recovery |
| B26 | kick budget exhaustion ends the run while retaining an uncertain non-replayable effect |
| B27 | a stale scheduler transaction cannot enqueue after its ownership connection is lost |
| B28 | closing and recreating modules preserves activity while excluding actual downtime |
| B29 | invalid finish inputs return INVALID_INPUT and allow a later valid completion |
| B30 | completed invalid finish recovery honors cancellation and execution limits |
| B31 | a successful persisted finish completes recovery without another remote turn |
| B32 | inconclusive audit step and blocked run roll back together before recovery |
| B33 | persisted legacy audit-block window cannot resume another Agent turn |
| B34 | queued runs persist online activity across a real shutdown without counting downtime or a second clock |
| B35 | frequent activity samples retain subinterval time instead of losing rounded milliseconds |
| B36 | activity clock survives loss of its own PostgreSQL session and only bills once after takeover |
| B37 | a follower cannot execute against a stale activity base while the new clock owner initializes |
| B38 | an initialization follower takes over after the blocked clock owner connection is terminated |

### 成员并发与事件公平：`tests/integration/membership-reliability.test.ts`

| ID | 完整测试名 |
|---|---|
| M01 | a delayed member snapshot cannot overwrite a newer member removal from another event worker |
| M02 | member_joined rechecks terminal account state under the same lock as terminal cleanup |
| M03 | a delayed member snapshot cannot undo a successful leave job |
| M04 | member_joined cannot add a member after the group has atomically become left |
| M05 | ALREADY_MEMBER job reconciliation cannot reinsert an account after terminal cleanup |
| M06 | twenty persistent event failures cannot starve a later recoverable event |

### 迟到成功与成员重入：`tests/integration/member-rejoin.test.ts`

| ID | 完整测试名 |
|---|---|
| M07 | kick 200 arriving after a committed rejoin preserves current membership without kicking twice |
| M08 | leave 200 arriving after rejoin retains the member and prevents the creator from leaving |
| M09 | member refresh failure after confirmed kick remains success and converges through event retry |
| M10 | leave refresh failure preserves confirmed progress and prevents unsafe creator departure |
| M11 | leave completion reads current members after acquiring the group projection lock |

### 连接失效与远端解析：`tests/integration/core-reliability.test.ts`

| ID | 完整测试名 |
|---|---|
| R01 | checked-out advisory connection loss rejects safely, fences subsequent DB work, and releases capacity |
| R02 | advisory lock loss aborts an in-flight HTTP request and blocks later remote calls |
| R03 | transaction client loss during HTTP wait aborts safely and does not poison later transactions |
| R04 | cleanup on a disconnected advisory connection preserves the callback error |
| R05 | RemoteClient preserves HTTP errors for null, primitive, malformed nested envelopes and valid arrays |

### 事务事件顺序与已知结果重试：`tests/integration/transaction-events.test.ts`

| ID | 完整测试名 |
|---|---|
| T01 | terminal send and concurrent member removal acquire event ordering only after domain writes |
| T02 | retrying a local terminal-result transaction never repeats the remote send |
| T03 | outgoing FIFO follows commit order when an older transaction enqueues first but commits last |

### 会话、连接容量与控制台

| ID | 文件 | 完整测试名 |
|---|---|---|
| H01 | `tests/integration/auth.test.ts` | PostgreSQL sessions rotate, revoke on reuse, enforce viewer and logout |
| D01 | `tests/integration/database.test.ts` | PostgreSQL lock admission preserves connection capacity for nested transactions |
| W01 | `apps/web/tests/reliability.test.ts` | concurrent REST 401s and WS refresh share one token rotation |
| W02 | 同上 | a delayed old-token 401 uses the already refreshed token |
| W03 | 同上 | logout first renews expired access and then reaches the server |
| W04 | 同上 | revoked refresh clears the access token and reports the server error |
| W05 | 同上 | a login or logout cannot be overwritten by an older refresh response |
| W06 | 同上 | own-message return and sentAt correction keep one stable row |
| W07 | 同上 | old snapshot pagination cannot downgrade a row or lose backfilled history |
| W08 | 同上 | equal timestamps are ordered consistently by stable identity |
| W09 | `apps/web/tests/timeline-recovery.test.ts` | a failed snapshot retains consumed invalidations and retries without a new event |
| W10 | 同上 | events during a snapshot coalesce into one serial follow-up snapshot |
| W11 | 同上 | snapshot retries use capped backoff and reset their delay after recovery |
| W12 | 同上 | disposing a group clears retries and blocks late results from the old group |
| W13 | 同上 | an invalidation at snapshot completion cannot get stranded behind the finishing promise |

D01 在当前集成工作树中已执行，其文件随基础容量修复提交集成；本表不把容量测试外推为所有负载规模均安全。

## 本轮后续验证登记

最终82312b9常规套已覆盖B17–B38恢复/协议/审计/时钟、G23–G31状态/错误/失锁/旧404、M01–M11成员并发/重入、T01–T03事务锁/本地重试/提交FIFO，以及P13–P15真实HTTP链和W09–W13快照恢复。B21–B23长计时在产品源码相同的f52faec独立通过。上述已有执行证据的条目不再保留“测试待补”；仍未覆盖的细分断言按各行明确列出。

剩余验收与证据边界：旧404已修复且G30专项通过；R1–R10及同版本长计时/新版B4均有通过证据；新增R11及B38已进入82312b9最终全套，相同产品源码长计时通过；表内其他未覆盖细分分支与全面用户验收仍待完成，已确认单点见变更台账。上一轮统一演示记录9befc8a源码manifest及开发者关键流程复验；当前群资料版本7efdbf3见本批运行证据，按版本分别验收。长时序复现命令：`AUTOMATION_TIMING_TESTS=1 npx tsx --test --test-name-pattern="timing:" tests/integration/automation.test.ts`。

上一轮统一演示开发者浏览器补充：缺变量预检阻断→补stepVars→查看展开文本和来源→两步sent；Agent审计pass、3步final；viewer页面无写入口。证据：[运行清单](evidence/demo-verification.json)、[Agent](evidence/demo-agent.png)、[序列](evidence/demo-sequence.png)、[只读账号](evidence/demo-viewer.png)。这些不是用户人工验收结果。
