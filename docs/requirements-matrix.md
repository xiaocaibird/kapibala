# 需求实现与验证矩阵

本表按原始需求逐项记录实现入口、验证断言和限制。原始需求文件 SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`，保持字节不变。

## 证据口径与版本

源码审查基线为 `3b15955`，补充读取 `90ae48e` 及本轮集成工作树，记录时间 2026-09-30 晚间（北京时间）。测试名称与路径见文末索引；后续修订需更新版本及受影响条目。**全部用户人工验收仍待进行**；开发者浏览器检查、自动验证均不等于用户已验收。

- **自动通过**：已实际执行且断言覆盖本行描述的场景，不扩大到未测分支。
- **部分验证**：已有实现和部分证据，列出的分支或时限仍待验证。
- **未验证**：已实现或已有测试源码，但尚无对应执行证据。
- **协议限制**：原协议缺少可判定证据，系统保守暂停；不能声称原始的任意崩溃自动完成保证已全部满足。
- **待修复**：有明确失败或已确认缺陷；修复后须复验。当前表不以“未验证”冒充失败。
- **未实现**：未进入当前范围的扩展。

已确认的本轮执行证据：完整 `npm test` **60/60 通过，约77秒**，包含 P01–P12 系统场景、G01–G22 网关模块、B01–B16 自动化模块、H01 会话、D01 数据库容量、W01–W08 控制台机制。执行时HEAD记录为 `e8985cc`，同时包含当时集成工作树新增的P11/P12、D01及测试命令更新；不要把HEAD单独视为完整测试树。之后 `90ae48e` 新增 B17–B23 和恢复修订：模块执行者报告快速20项及实际计时3项通过，集成后的最终全套复跑仍待确认。

P 系列使用真实 PostgreSQL、真实业务模块、本地 HTTP/SSE 模拟服务；其中 P09 使用真实 WebSocket，P10 对独立业务服务进程执行 SIGKILL。G 系列使用真实 PostgreSQL 与受控网关适配器；B 系列使用真实 PostgreSQL 和 HTTP Agent，但发送适配器受控。W 系列是受控 fetch / 纯合并逻辑检查。模块测试不替代跨模块和浏览器证据；P09 的三秒断言只覆盖服务端重放，不能直接证明浏览器完成渲染的时限。

## A0 基础与统一契约

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 迁移可重复执行 | `scripts/migrate.ts` | H01 连续调用 migrate 两次后正常启动 | 自动通过 |
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
| 允许转移表、非法边/同状态、404、expectedFrom 必填 | `gateway/accounts.ts`、`gateway/index.ts` | G01 覆盖非法同状态优先于 CAS；API 运行时 schema | 部分验证：全表枚举及 400/404 尚无完整执行证据 |
| CAS 并发至多一成功、不后写覆盖 | `gateway/accounts.ts` | P05 两个合法竞争操作恰好一个 200、一个 409；G01 | 自动通过：此并发场景 |
| suspended/session_expired 无出边，重复终态静默 | `gateway/accounts.ts`、`gateway/state.ts` | G02 重复 suspended 仅一条 terminal 事件；状态规则无终态出边 | 部分验证：G02通过；两个终态全出边枚举仍待补 |
| 终态成员移除、queued cancelled、failCode、序列 skipped 原子性 | `gateway/state.ts` | P05 确认成员删除；G02 通过数据库触发器失败注入核对整笔回滚及 skipped | 自动通过：G02状态/成员/消息/步骤同事务回滚及成功后果 |
| 所有来源终态后果一致、提交后事件 | `gateway/state.ts`、`gateway/events.ts`、`gateway/messages.ts`、`core/db.ts:emit` | G12 kick 同步错误；P05 手动操作；G02 事务事件 | 部分验证：send/message_failed/account_status 与两个终态来源矩阵未完整覆盖 |
| 限流自动恢复；已手动离线不恢复；刷新截止不算转移 | `gateway/accounts.ts:releaseRateLimits`、`gateway/messages.ts` | P02 真实等待限流恢复；G03 队列顺序 | 部分验证：已离线时截止到期的反例待补 |
| 标记 disconnected/idle 调 disconnect | `gateway/accounts.ts` | P05 执行合法转移；对应实现调用网关 | 部分验证：远端请求与状态联合断言待补 |

## A2 网关与可靠发送

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 三种发送共用持久出站、稳定 id、queued 起可见 | `core/messaging.ts`、`gateway/messages.ts` | P01/P03/P04 实际手动/Agent/序列发送；W06 稳定 id；浏览器已观察 queued→sent 单行 | 自动通过：P11明确accepted时远端消息数为0，随后sent |
| 多实例同一 outbox 不重复调用网关 | `gateway/messages.ts`、`core/db.ts:withLock` | G13 双 worker；P10 硬终止后按远端查询证据恢复且只 send 一次 | 部分验证：P10 可判定崩溃场景已过；任意未知窗口见限制 L1 |
| 明确 504 后 unknown，确认后收敛，不确认不重发，最多一次重发 | `gateway/messages.ts` | P02 覆盖已落地/未落地再发；G06/G07 两次均未落地失败且真实时钟 ≤5s | 自动通过：P02不重复；G07真实时钟两次504最终失败≤5秒 |
| by-client-id 503 保持 unknown，恢复后两秒内确认 | `gateway/messages.ts` | G10查询恢复不重复；P11真实查询503期间unknown，恢复后<2秒sent | 自动通过：上述恢复场景 |
| 入站按 (groupId,msgId) 去重，同毫秒稳定排序、任意历史补投 | `gateway/events.ts`、`gateway/models.ts` | P01/P08；W08 同时间稳定 id 排序；G15 乱序 eventId | 自动通过：重复、乱序与历史补投测试场景；浏览器历史分页待验 |
| 自己回流一行 isOwn=true、不触发 Agent | `gateway/events.ts`、`automation/agent.ts:scan` | P01 单行 isOwn；P03/P07 运行数与副作用数；B07/W06 | 自动通过 |
| 数据库写失败不丢事件、不阻塞其他事件、inconsistency | `gateway/events.ts` | P06 注入单条写失败，其他消息成功，撤除故障后补齐且只有一条 | 自动通过：局部写失败；完整数据库进程停机时长及告警延迟未覆盖 |
| 服务/SSE 停机期间事件恢复不漏 | `gateway/events.ts` | P06 断流并 503 后恢复；P10 业务重启查询收敛 | 部分验证：断流补齐已过；业务停机期间多个外部历史事件专项待补 |
| RATE_LIMITED 账号全局暂停、队首顺序、序列顺延 | `gateway/messages.ts`、`automation/sequences.ts` | P02 请求时间差 ≥1.95s；G03/G04 手动+Agent/503队首；B09 序列限流顺延 | 自动通过：已测限流与序列场景；跨全部来源同一瞬间竞争待扩展 |
| ACCOUNT_SUSPENDED / SESSION_EXPIRED | `gateway/state.ts`、`gateway/messages.ts` | 统一 changeAccount；G12 suspended；B16 accepted 后账号终态 | 部分验证：两个错误在同步发送/异步失败的完整映射待补 |
| GROUP_WRITE_FORBIDDEN 仅影响群、序列 stopped、Agent 当前步后取消 | `gateway/state.ts`、`automation/agent.ts` | G14 原子停止/请求取消且账号不变；B13 当前步后取消 | 部分验证：两个模块断言已存在，真实远端错误跨模块终态链需补证据 |
| SENDER_NOT_IN_GROUP / ACCOUNT_OFFLINE 仅消息 failed | `gateway/messages.ts` | 对应错误分支实现 | 未验证：两类错误及账号/群不变断言待补 |
| NOT_MEMBER_YET ≤2 次 promote；入群超过 10s 失败 | `gateway/jobs.ts` | G17 一次重试计数2；G19 调整持久时间触发 JOIN_TIMEOUT 且无提前 promote | 自动通过：G17/G19对应分支；G19是持久时钟推进断言，非实际等待10秒 |
| kick OWNER_LEFT/NO_PERMISSION 不改账号群，504 查询成员确认 | `gateway/messages.ts:kick`、`automation/tool-execution.ts` | 正常权限映射与2秒查询实现；B11 是策略/未知恢复，不是远端成功链 | 未验证：真实HTTP kick成功、504、权限错误专项待补；重新入群歧义见 L3 |

## A3 建群、A4 时间线与实时事件

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| 建群输入：全员 online、成员非空、不含群主 | `gateway/index.ts`、`gateway/jobs.ts` | 页面只选在线且分离群主；后端校验存在 | 未验证：422/400 反例组合待补 |
| 异步 create→invite→join事件→promote；creator无需事件入表 | `gateway/jobs.ts`、`gateway/events.ts` | P01 成员角色 creator/admin/member/member；G16；浏览器已完成4成员建群 | 自动通过：正常流程；异常邀请见 B2 |
| 新群 agentEnabled/autoKickEnabled=false；任务 errors 非空即 failed | `gateway/jobs.ts`、`gateway/models.ts` | P05 失败退出 errors；G19 JOIN_TIMEOUT；数据库默认设置 | 部分验证：所有 step 名称与新群两个默认值专项待补 |
| 群详情及仅 running 的 activeRunId | `gateway/models.ts` | 前端真实读取当前运行和成员；查询仅筛 running | 部分验证：所有终态 activeRunId 归零待专项断言 |
| 游标分页：新消息、历史补投、queued.sentAt 改写不重漏 | `gateway/index.ts` 快照；`apps/web/src/hooks/useTimeline.ts` | P01/P08；G22；W06/W07；快照内固定成员，后续更新以新快照合并 | 自动通过：后端快照与前端合并机制；浏览器“加载更早+重连”联合待验 |
| WS 先认证再推，seq 单调、已提交事件、sinceSeq 补齐去重 | `core/realtime.ts`、`core/db.ts:emit`、`apps/web/src/state/live.tsx` | P09 auth先到、所有seq>游标且唯一、注销断开；事务锁保证分配与提交顺序 | 部分验证：真实WS补齐已过；并发事务提交乱序/全事件类型字段专项待补 |

## A5 Agent（逐条）

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| A5.1 非自身消息触发；同群单 running；期间消息聚合下一 run | `automation/agent.ts:scan/startNext/finish`、`002_automation.sql` | B04/B07；P07 双实例、重复事件、两个run触发数1+2、每run3轮 | 自动通过 |
| A5.2 完整历史循环、12步、连续3协议错、合法响应清零 | `automation/agent.ts:run/turn/protocolError` | B05 连续3错误；B12 恰12轮；P03 错误后合法工具完成 | 自动通过：这些断言；“合法后重置再累计”反例序列待补 |
| A5.2 60秒活动预算、停机不计、等待容量计入 | `automation/agent.ts:run/persistTime` | B14/B15 注入59930ms后迟到turn/audit被丢弃；3b15955补计执行容量等待 | 部分验证：截止边界已过；多群排队和重启停机累计时钟专项待补，硬终止最多少计一心跳周期 |
| A5.2 每turn 10–15秒可配，超时计协议错、迟到丢弃 | `automation/agent.ts:constructor/turn` | 默认12秒、配置夹在10–15秒；B14迟到响应不生效 | 部分验证：真实12秒超时（区别于剩余预算缩短）及配置边界待补 |
| A5.3 工具未知/入参错历史形状；坏JSON/重复ID/超时不追加assistant | `automation/protocol.ts`、`agent.ts:turn/protocolError` | B01/B05；P03 坏JSON→未知工具→正常完成 | 部分验证：核心错误已过；非2xx、前后文字、缺字段、类型不一致及INVALID_INPUT历史形状尚未全矩阵断言 |
| A5.4 send/kick执行前审计；明确pass才允许；fail拒绝 | `automation/tool-execution.ts:audit/send/kick` | B06 fail后同key可重试；P03 send审计pass实际发出 | 部分验证：send已过；kick审计文本/合法成功流程待补 |
| A5.4 不确定最多3次，不计步，3次blocked/no side effect/通知 | `automation/tool-execution.ts:audit` | P03 500、坏JSON、maybe后blocked且远端消息数不增；B06审计次数3；B15迟到pass不授权 | 自动通过：上述错误组合；缺verdict和完整三次超时组合待补 |
| A5.5 仅online群成员；kick需creator/admin；无账号业务错误 | `automation/tool-execution.ts:account/delivery` | SQL角色/状态过滤；B16 accepted后账号终态为SEND_FAILED且无重发 | 部分验证：B16已通过；无账号及更多执行中状态变化分支待补 |
| A5.6 kick须autoKickEnabled | `automation/tool-execution.ts:kick` | B11关闭时POLICY_DENIED，零审计、零kick | 自动通过：关闭策略场景；审计期间关闭的竞态待补 |
| A5.7 run+key相同不重复发送/审计，读取当前状态；拒绝不占key | `agent_send_keys`、`tool-execution.ts:send` | P03 504后同key最终一条消息、一次审计；B04/B06 | 自动通过：已测场景；SEND_TIMEOUT后同key再次调用的完整5秒窗口待补 |
| A5.8 持久会话/步骤/审计/工具恢复，同runId不重复副作用 | `automation/agent.ts`、`tool-execution.ts`、`002_automation.sql` | B10已保存final/已入队send恢复；B08/B11未知turn/kick暂停；P10业务send硬终止恢复 | 部分验证 + 协议限制 L1/L3/L4；不能声明任意崩溃自动正常结束 |
| A5.9 tool_result≤8KB，摘要≤200字，rawResponse≤2KB | `automation/protocol.ts`、`tool-execution.ts:recent` | B01字节上限；B12 55条长消息、limit100000、12步均≤8192 bytes | 部分验证：结果限制已过；每条≤500字、摘要200/原文2048字节专项断言待补 |
| A5.10 群不可写或关闭Agent，在当前步后cancelled | `gateway/state.ts`、`gateway/index.ts`、`automation/agent.ts` | B13已开始步骤完成后cancelled且无下一turn；G14群状态取消标记 | 部分验证：关闭场景通过；群不可写的真实跨模块链待补 |
| A5.11 同参重复get_recent_messages在12步内合理结束 | `automation/agent.ts:run` | B12 12次读取后budget_exhausted | 自动通过 |
| A5.12 步骤API可见，kind/tool/input/result/audit/error/raw | `automation/agent.ts:register`、`apps/web/src/pages/AgentRuns.tsx` | B04 API3步；B05错误kind/raw；浏览器已查看3步及audit pass | 部分验证：正常详情通过；blocked/协议错误原文浏览器待验 |
| 工具协议：恰好4工具、required全入参；finish/end_turn只写摘要 | `automation/protocol.ts`、`agent.ts` | B01工具契约；B10持久final；P03 finish后只有一条业务消息 | 部分验证：触发上下文所有字段与end_turn不发群专项待补 |
| get_recent_messages含触发/运行期间消息、sentAt升序/isOwn/截断 | `automation/tool-execution.ts:recent` | B07新消息进入下一触发；B12数量/字节限制 | 部分验证：工具实际读取包含运行期间新消息及排序字段待专项断言 |

## B1–B4 与前端

| 要求 | 实现入口 | 场景、证据 | 状态与剩余验证 |
|---|---|---|---|
| B1 序列格式、连续步号、角色admin优先/member字典序 | `automation/sequences.ts:register/advance` | P04实际两步；输入schema与SQL排序实现 | 部分验证：角色优先/字典序专项待补 |
| B1 无角色skipped有时间，限流顺延不跳过 | `automation/sequences.ts:advance/progress` | B09限流等待后推进；G02账号终态skipped | 部分验证：无匹配角色的skipped及下一步起算专项待补 |
| B1 vars继承、stepVars覆盖、空字符串、来源原始步 | `automation/sequences.ts:resolveSteps` | B02三步继承和空字符串；P04已执行变量和step:2来源 | 自动通过：规则场景 |
| B1 全步骤预检422/stepIndex/key；不发送不留running且能重启 | `automation/sequences.ts:register` | B03第3步缺变量、run0/send0；P04预检失败后并发成功 | 自动通过 |
| B1 同群并发启动恰一201、一409 | 群事务锁、序列部分唯一索引 | B03、P04真实PG | 自动通过 |
| B1 第一步启动后延迟、后续按前一步确认sent/skip后起算 | `automation/sequences.ts:advance/progress` | P04发送时间差；B09发送确认后精确延迟10秒排期 | 部分验证：正常发送已过；跳过链待补 |
| B1 重启只重排最早过期步骤，不补发全部 | `automation/sequences.ts:ensureScheduler/rebaseExpired` | B09第二实例不重排、旧调度器关闭后新实例重排当前一步 | 自动通过：模块调度器接管；真实进程重启连续多步待补 |
| B2 INVITE_NOT_READY/readyAfter、过期一次重申、ALREADY_MEMBER | `gateway/jobs.ts` | G16过期；G17 ready等待/ALREADY_MEMBER/两次promote | 自动通过：G16/G17受控网关分支；真实HTTP组合仍可追加 |
| B2 leave-all非群主失败继续其他人、群主保留、错误可见 | `gateway/jobs.ts` | P05留群成员与错误；G20远端/本地成员一致 | 自动通过：P05/G20核对失败成员与群主保留、其余成员继续、两侧成员一致 |
| B2 成功left/members=[]，与远端成员视角解释一致 | `gateway/jobs.ts`、`gateway/models.ts` | G21外部用户仍在远端；公开left members=[]、job留gatewayMembersAtCompletion | 自动通过：G21；全部服务账号退出不等于移除外部用户 |
| B3 refresh仅HttpOnly cookie、每次轮换、旧重放整会话失效 | `core/auth.ts` | H01 cookie不在body、旧refresh重放后新旧access和新refresh均401 | 自动通过 |
| B3 logout同access立即失效 | `core/auth.ts`、`core/realtime.ts` | H01 REST401；P09 WS4401断开；W03过期access先续期注销 | 自动通过 |
| B3 前端过期自动续期，多401只refresh一次 | `apps/web/src/api/client.ts` | W01–W05；开发者刷新页面恢复成功 | 部分验证：机制通过；真实浏览器并发401/过期续期请求数待验 |
| B4 浏览器断线期间变化重连3秒内出现且不重复 | `apps/web/src/state/live.tsx`、`hooks/useTimeline.ts` | P09服务端3秒重放；W06/W07合并 | 部分验证：浏览器重连到渲染计时、断线>50条/历史补投尚待验 |
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
| S5 504后同key重试 | P03、B04 | 自动通过：一条远端消息、一次审计、run finished；第二步返回sent字段专项待补 |
| S6 坏响应→未知工具→正常 | P03、B05 | 自动通过：完成/错误轨迹；逐步raw字段由B05断言 |
| S7 并发启动 | P04、B03 | 自动通过：一个201/一个409 |
| S8 第3步预检失败 | B03、P04 | 自动通过：stepIndex3、无run、无send，之后可启动；key字段由变量解析断言 |

## 已知限制与扩展

| 编号 | 边界 | 当前行为与证据 |
|---|---|---|
| L1 | send请求已到远端但响应前崩溃；无明确504不能适用2秒404安全重试判据 | 持久记录保留unknown，查询到成功才收敛；G08保守不重发，P10证明一个可确认成功场景。不声称全局任意崩溃恰好一次 |
| L2 | 创建群无幂等键，也无本次job结果查询 | 远端成功/本地未存groupId后保留running+recoveryNote，不重复create；G18为可复现写失败窗口 |
| L3 | kick后目标重新入群、或副作用已发但本地未记结果 | 缺少能证明安全重放的证据时暂停，B11；正常504可判定窗口仍应单独测试 |
| L4 | Agent服务维护runId会话，相同历史请求不保证幂等 | 未记录响应的inflight_turn暂停并推inconsistency；B08。既不虚报失败，也不能标为自动恢复正常结束 |
| L5 | 无法覆盖全部瞬间的崩溃注入 | 已测持久final、prepared send、调度接管和业务SIGKILL窗口；其余不能由一项测试外推 |
| L6 | 时间线新快照完整遍历、SSE全历史重放 | 正确性优先，成本随历史增长；大历史量下浏览器三秒目标待容量验证 |
| C1/C2/C3 | 媒体归档/真实模型/完整Playwright | 未实现；首阶段保留接入边界。当前必要自动验证与开发者浏览器检查已独立开展 |

## 测试名称索引

下列 ID 仅用于本表定位，名称为测试源码中的原名。修改名称时同步此表。执行：最新集成工作树 `npm test` 包含后端与控制台；也可用 `npx tsx --test apps/web/tests/reliability.test.ts` 单独运行控制台；可以用 Node test name pattern 选定单项。测试创建隔离数据库或schema的权限按本地 PostgreSQL 配置提供。

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

D01 在当前集成工作树中已执行，其文件随基础容量修复提交集成；本表不把容量测试外推为所有负载规模均安全。

## 本轮后续验证登记

`90ae48e` 新增B17–B20对应恢复后已确认发送的下一步重排、kick权限映射与成功、SEND_TIMEOUT同key重试、角色优先与skipped时间戳；B21–B23为真实12秒turn、3×5秒审计、60秒活动预算。模块执行者已报告通过，但合入后的最终全套复跑尚待确认，因此上表相关“待补”在当前版本仍保留集成复验要求。长时序命令：`AUTOMATION_TIMING_TESTS=1 npx tsx --test --test-name-pattern="timing:" tests/integration/automation.test.ts`。

开发者浏览器补充：序列缺location报step2/key→补stepVars→预检来源→两步sent；viewer登录后序列无新建/启动、accounts无操作列、group无发送/设置开关/退群。证据：[序列](evidence/console-sequence.png)、[只读账号](evidence/console-viewer.png)。这些不是用户人工验收结果。
