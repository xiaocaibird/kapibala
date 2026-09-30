# 分批验收与运行说明

本清单用于体验、核对行为并理解关键设计。当前验收入口按本轮集成版本提供；源码已包含 `90ae48e` 的后续修订。**用户人工验收全部待进行**；下表的开发者检查记录仅是已有证据，不能代替人工确认。每次实际验收记录 `git rev-parse HEAD`，修复影响已验项目时重新执行对应批次。


## 功能总览与建议路线

第一次体验依次执行批次一至四，约35–45分钟：登录与账号 → 建群与消息 → Agent步骤 → 序列预检 → viewer只读。随后按批次五、六检查故障和断线；底层并发、事务、重启由批次七的可执行命令复现，不要求阅读源码。时间为操作预算，实际以验收记录为准。

| 范围 | 可验收能力 | 入口 | 当前状态 |
|---|---|---|---|
| A0/B3 | 登录、权限、续期、注销、迁移与拒启 | 批次一/四/七 | 60项全套测试已有通过记录；用户待验 |
| A1/A3/B2 | 账号状态、异步建群、成员角色、群主最后退出 | 批次一/五/七 | 正常账号建群已浏览器通过；异常自动证据见矩阵；用户待验 |
| A2/A4/B4 | 统一可靠发送、去重、历史分页、实时恢复 | 批次二/五/六/七 | 消息单行与服务器补齐已通过；浏览器3秒计时待验 |
| A5/页面4 | 自动触发、完整工具步骤、审计、恢复与预算 | 批次二/五/七 | 正常3步浏览器通过；协议不可判定窗口保守暂停 |
| B1/页面5 | 变量继承、来源预检、定时运行、并发互斥 | 批次三/七 | 两步浏览器运行通过；用户待验 |
| C1/C2/C3 | 媒体归档、真实模型、完整Playwright | 未启用 | 未实现，独立于基础验收 |

本轮完整测试执行时HEAD为 `e8985cc`，同时包含集成工作树新增的测试和命令更新，结果60/60、约77秒。之后 `90ae48e` 的补充实现/测试已有模块通过记录，集成最终复跑仍待确认。不能把这次60项结果直接套用到所有后续改动。

## 最短入口

服务已启动时直接打开 [控制台](http://127.0.0.1:5173)。管理员 `admin / admin`，只读账号 `viewer / viewer`。

冷启动在项目根目录执行：

```sh
nvm use
npm ci
docker compose up -d --wait
npm run db:migrate
npm run dev
```

控制台 5173、业务 API 3100、模拟网关 3101、模拟 Agent 3102；默认仅本机访问。PostgreSQL 端口 55432。详情见 [README](../README.md)、[模拟故障配置](simulator.md)。服务停止用 Ctrl-C；`docker compose stop` 保留数据库卷。验收期间不要删除数据库卷或 `.runtime` 状态目录。

原文完整性与基础检查：

```sh
npm run verify:original
npm run build
npm test
npx tsx --test apps/web/tests/reliability.test.ts
```

真实 PG 测试会创建隔离 schema/数据库。最新集成工作树的 `npm test` 包含后端与控制台机制测试；也可单独执行控制台命令。不能把构建通过当成业务或浏览器验收通过。条款与精确测试名见 [需求矩阵](requirements-matrix.md)。

## 批次一：登录、账号与群（约 10 分钟）

| 步骤 | 操作 | 预期结果 | 已有开发者证据 / 用户状态 |
|---|---|---|---|
| 1 | 用 admin 登录，刷新页面 | 恢复管理员会话，右上显示实时同步；access token 不写入浏览器持久存储 | 开发者浏览器通过；用户待验 |
| 2 | 进入服务账号，连接至少4个账号 | 账号在线，平台身份有值；终态账号不出现重连入口 | 4账号连接已通过；终态界面待开发者检查；用户待验 |
| 3 | 在一个在线账号执行“标记离线→重连”；再试“释放账号” | 只出现当前状态合法的按钮，状态回写；重连后身份保持 | 开发者完整操作链待验；用户待验 |
| 4 | 创建群：一群主、一管理员、至少两成员 | 返回后台任务；完成后群里角色分别creator/admin/member/member；两个自动化设置默认关闭 | 开发者浏览器已创建4成员群并核对角色；用户待验 |
| 5 | 保留此群用于后续批次 | 群详情标题为 `gatewayGroupId`；URL中的长ID是本地群ID，两者用途不同 | 用户待验 |

若已有在线账号/群，可以直接使用，避免重复建立无意义数据。任务失败时保留 jobId 和 errors，不反复点击创建来掩盖失败。

理解检查：账号“在线”表示可发起平台操作；“accepted”只代表网关受理；群成员由入群事件确认，不能将 join 的202当成已入群。

## 批次二：消息与 Agent（约 10–15 分钟）

1. 进入群详情，以一个在线服务账号发送 `消息验收-1`。应立即看到自己的单行消息，从 queued 经 accepted 到 sent；网关回流后仍只有一行。正常延迟较短，若要观察 accepted，先使用下方延迟配置。
2. 开启“Agent自动应答”。复制群标题中的网关群ID，替换下面命令里的示例值，在终端注入一条外部消息。
3. 群中应出现外部消息、一个Agent运行、一次自动回复；自动回复不触发第二个run。进入运行详情，核对工具名、入参、结果、audit pass，以及finish/final结束信息。end_turn/finish摘要不作为额外群消息发送。
4. 保留群ID、runId、消息clientMsgId，作为故障复验的关联入口。

```sh
curl -s http://127.0.0.1:3101/__control/config \
  -H 'Content-Type: application/json' \
  -d '{"sendDelayMs":1500,"sendResponseDelayMs":100}'

curl -s http://127.0.0.1:3101/__control/message \
  -H 'Content-Type: application/json' \
  -d '{"groupId":"替换为群标题中的网关群ID","senderPlatformUserId":"external-demo","text":"请回复这条验收消息"}'
```

开发者已通过：manual queued→sent单行、开启Agent、外部消息触发、3步详情及audit pass。P11另已通过正常accepted窗口的独立断言。用户待验。

理解检查：手动、Agent与序列共用持久发送队列。Agent发送先审计，同run同key复用已有消息。未知结果既不冒充成功，也不盲目重发。

## 批次三：序列预检与运行（约 10 分钟）

在“定时序列”选择批次一的群。管理员可创建以下短序列：

```json
{
  "name": "活动通知验收",
  "steps": [
    { "index": 1, "accountRole": "admin", "text": "{event} 将于 {time} 开始", "delaySeconds": 2 },
    { "index": 2, "accountRole": "member", "text": "{event} 资料位于 {location}", "delaySeconds": 1 },
    { "index": 3, "accountRole": "admin", "text": "{event} 由 {owner} 负责", "delaySeconds": 1 }
  ]
}
```

默认变量：

```json
{"event":"发布沟通","time":"20:00","location":"默认资料区"}
```

第一次使用以下分步变量，点击预检：

```json
{"2":{"event":"第二场","location":"共享盘/第二季度"}}
```

预期缺失第3步的 `owner`，显示 `UNRESOLVED_PLACEHOLDER`、stepIndex=3、key=owner；不出现running记录，也不发送任何一步。随后补齐：

```json
{"2":{"event":"第二场","location":"共享盘/第二季度"},"3":{"event":"","owner":"值班同事"}}
```

预检弹窗应显示：

| 步骤 | 最终消息 | 关键来源 |
|---|---|---|
| 1 | 发布沟通 将于 20:00 开始 | event/time 来自 default |
| 2 | 第二场 资料位于 共享盘/第二季度 | event/location 来自 step:2 |
| 3 | 第二场 由 值班同事 负责 | event 继续来自 step:2；owner 来自 step:3；空字符串不清空event |

确认启动后核对逐步进度、scheduledAt、sentAt、clientMsgId。第2/3步应在前一步确认发出后再计时。返回群时间线核对每步一行。角色admin优先管理员；member使用普通成员。已有running时不能再启动同群序列，服务端并发测试的精确201/409证据见矩阵。

本批服务端预检/继承/并发已有自动验证；开发者浏览器已通过缺location显示step2/key、补stepVars后来源预检、确认启动后两步均sent。证据：[序列运行截图](evidence/console-sequence.png)。本页三步继承示例仍需按步骤人工验收。

## 批次四：只读权限与会话（约 5–10 分钟）

1. 退出admin，使用viewer登录。账号页无连接/离线/释放按钮；群页无创建、发送、设置开关、退群按钮；序列页无新建、预检启动写入口。列表和运行详情仍可读取。
2. 刷新页面，应恢复viewer身份。返回运行详情仍显示真实数据。
3. 注销后返回登录页。之前access token立即无效，WS会关闭；本项已有H01/P09接口证据，浏览器验收只记录实际观察到的页面结果。
4. 真实access过期后的并发请求应只触发一次refresh，可用浏览器Network面板结合受控会话失效场景验证；普通刷新只证明cookie恢复，不能替代这个检查。

服务端拒绝viewer写操作由统一鉴权层保障。不要只用“按钮没有显示”证明权限安全。开发者viewer已登录核对序列无新建/启动、accounts无操作列、group无发送/开关/退群，证据：[只读视图截图](evidence/console-viewer.png)。全部用户步骤仍待验；真实浏览器过期并发续期专项仍待验。

## 批次五：可复现故障与恢复

下列操作仅影响本地模拟服务。一次只启用一个场景，记录时刻和关联ID，完成后恢复配置。不会修改原始需求或改变外部业务协议。

| 场景 | 操作 | 预期结果与证据 | 当前验证范围 |
|---|---|---|---|
| 重复/乱序 | 设置duplicateEvents=true、outOfOrder=true，再发外部消息 | 单行时间线、单次Agent触发；成员与状态最终正确 | P01/P03/P07自动通过；用户待验 |
| 限流 | 下一次sendFaults=[RATE_LIMITED]，同账号连续发两条 | rate_limited期间排队，无提前远端send；恢复后按原顺序发送 | P02/B09通过；浏览器用户待验 |
| 504已落地 | 下一次sendFaults=[NETWORK_TIMEOUT] | unknown后按查询/事件收敛sent，远端只有一条 | P02/P03通过；用户待验 |
| 504未落地 | 下一次sendFaults=[NETWORK_TIMEOUT_NO_EFFECT] | 确认无结果后同clientMsgId仅重发一次；第二次失败路径见G06/G07 | P02单次重试通过；G07真实时钟两次504失败≤5秒已通过 |
| 查询503 | 设置queryUnavailable=true，同时触发504 | 查询不可用期间保留unknown；恢复queryUnavailable=false后确认 | G10与P11恢复后<2秒均通过；用户待验 |
| 历史补投 | 注入同一msgId、旧sentAt；同时操作加载更早 | 原快照页不重漏，新快照补齐历史；稳定内部id防止自己的消息多行 | P01/P08/W06/W07通过；浏览器联合场景待验 |
| 审计不确定 | 下方三个审计错误脚本 | run blocked，醒目提示；待发内容未进入网关 | P03/B06通过；浏览器提示待验 |
| 关闭Agent | 慢turn执行中关闭开关 | 当前步完成后cancelled，不进入下一轮 | B13通过；浏览器待验 |
| 退群失败 | leaveFailures指定一个非群主，再退群 | 其他非群主继续退，群主保留，失败成员仍在两侧成员视图中 | P05及G20，按矩阵记录；用户待验 |
| 业务重启 | 保持模拟器/数据库运行，按测试执行指定SIGKILL窗口 | 有远端证据的发送恢复为sent且仅发送一次；无判据窗口保留unknown/待确认 | P10已通过，不外推全部崩溃窗口 |

限流/重复配置示例：

```sh
curl -s http://127.0.0.1:3101/__control/config \
  -H 'Content-Type: application/json' \
  -d '{"duplicateEvents":true,"outOfOrder":true,"sendFaults":["RATE_LIMITED"]}'
```

审计阻塞示例（随后注入一条外部消息）：

```sh
curl -s http://127.0.0.1:3102/__control/config \
  -H 'Content-Type: application/json' \
  -d '{"turnScript":[{"body":{"stop_reason":"tool_use","content":[{"type":"tool_use","id":"audit-probe","name":"send_message","input":{"text":"此内容应被审计阻塞","idempotency_key":"audit-probe"}}]}}],"auditScript":[{"status":500,"body":{}},{"raw":"invalid JSON"},{"body":{"verdict":"maybe"}}]}'
```

完成场景后恢复常用默认值：

```sh
curl -s http://127.0.0.1:3101/__control/config \
  -H 'Content-Type: application/json' \
  -d '{"duplicateEvents":false,"outOfOrder":false,"sendDelayMs":250,"sendResponseDelayMs":0,"sendFaults":[],"queryUnavailable":false,"unavailable":false,"leaveFailures":[],"joinNever":[],"kickFaults":[],"inviteReadyMs":0,"expireInviteOnce":false,"promoteNotMemberOnce":false}'

curl -s http://127.0.0.1:3102/__control/config \
  -H 'Content-Type: application/json' \
  -d '{"turnScript":[],"auditScript":[],"turnDelayMs":0,"auditDelayMs":0}'
```

查询本地故障证据：网关 [请求、消息与事件](http://127.0.0.1:3101/__control)，Agent [turn/audit调用记录](http://127.0.0.1:3102/__control)。这些仅用于验收取证，业务恢复不得依赖控制面中原协议没有的查询能力。

## 批次六：浏览器断线补齐与分页

1. 打开已有多条消息的群，记下当前消息标识及时间。
2. 只将此浏览器标签页设为离线；在终端向模拟网关注入新消息，包含一条很早的sentAt，必要时超过50条以跨页。
3. 恢复标签页网络，记录恢复时刻。页面应显示连接恢复过程，随后补齐期间消息；测量从网络恢复到可见的时间，目标≤3秒且没有重复行。
4. 在新消息写入时加载更早，核对稳定消息id和数量。实时完整快照核对后历史可能已全部载入，此时不再出现“加载更早”。
5. 对照原快照语义：分页固定的是一次读取的成员集合；新补投和状态变化在后续快照合并中展示，不被悄悄塞入旧快照游标。

P09只证明服务端按sinceSeq在三秒内补发；本批浏览器渲染、重新查询与大历史量耗时仍待实测。未实测不记通过。


## 批次七：界面外的自动验收

前置：完成冷启动中的依赖、数据库启动与迁移；在项目根目录使用相同Node/npm版本。以下命令会创建隔离测试数据，正常结束后清理；不要求改源码或手动杀死正在体验的开发服务。每项保存命令输出和退出码，预期exit 0、对应测试pass。用户人工执行与理解确认均待验。

| 要求 | 可执行命令 | 预期/证据 | 当前状态与复验 |
|---|---|---|---|
| A0/B3迁移、轮换、重放撤销、注销 | `npx tsx --test tests/integration/auth.test.ts` | H01所有断言pass | 已自动通过；用户待验 |
| A0旧schema拒启、viewer全部8类业务写接口 | `npx tsx --test --test-name-pattern="schema lag" tests/integration/platform.test.ts` | P12启动拒绝且全部写请求403/FORBIDDEN | 已自动通过；用户待验 |
| A1账号CAS/终态原子后果、A2错误/限流/504、A3/B2邀请/退出、A4快照 | `npx tsx --test tests/integration/gateway.test.ts` | G01–G22通过；失败注入不遗留半提交；5秒重试边界成立 | 本轮22项已通过；后续变更需复验 |
| A5.1–12、B1变量/角色/排期/并发/恢复 | `npx tsx --test tests/integration/automation.test.ts` | 正常、协议错误、blocked、预算、工具幂等、序列互斥/继承各断言pass；长计时默认skip | 原B01–B16集成通过；新增B17–B20模块通过、最终集成复验待确认 |
| A5真实12秒turn/15秒审计/60秒预算 | `AUTOMATION_TIMING_TESTS=1 npx tsx --test --test-name-pattern="timing:" tests/integration/automation.test.ts` | 3项实际等待测试pass，迟到响应不生效 | 模块执行者报告3项通过；集成复验待确认 |
| A2受理窗口、查询不可用恢复2秒 | `npx tsx --test --test-name-pattern="S1 distinguishes" tests/integration/platform.test.ts` | accepted时远端消息0；查询503时unknown；恢复<2秒sent | 已自动通过；用户待验 |
| S1–S8、DB写失败/多实例/断线与业务SIGKILL | `npx tsx --test tests/integration/platform.test.ts` | P01–P12通过；远端调用、持久状态与事件联合断言 | 本轮12项已通过；用户待验 |
| A4/B4服务端WS重放与注销断流 | `npx tsx --test --test-name-pattern="authenticated WebSocket" tests/integration/platform.test.ts` | auth先到、seq不重复、3秒内补发、注销4401 | 已自动通过；浏览器渲染3秒另按批次六验 |
| B3并发续期、A4稳定身份与旧分页 | `npx tsx --test apps/web/tests/reliability.test.ts` | W01–W08受控fetch/合并机制通过 | 已通过，不能代替真实PG/浏览器 |
| 数据库锁容量 | `npx tsx --test tests/integration/database.test.ts` | D01锁持有者不耗尽嵌套事务连接 | 已通过；不外推任意负载 |

尚未有完整执行证据的细分场景（例如全状态转移枚举、特定错误来源矩阵、浏览器断线超过50条）在需求矩阵单独列出。新补测试的存在不等于已经集成通过。协议缺口L1–L4不能靠重跑测试消除，需要理解与确认保守处理行为。

## 关键设计理解与排查

| 主题 | 应能说明的机制 | 证据与排查入口 |
|---|---|---|
| 账号终态 | 状态、成员、排队消息和序列步骤在同一事务改变；无终态出边 | `gateway/state.ts`、account_terminal、G02 |
| unknown发送 | 只有明确504具备2秒404判定；任意响应前崩溃不具备同样安全重试依据 | clientMsgId、dispatch_state、recoveryNote、P10/L1 |
| 事件重放 | 全历史持久去重解决乱序与补投；最大eventId不能直接作为无遗漏证明 | gateway_events、events、G15/P06 |
| 消息分页 | 固定快照成员，内部id稳定；旧分页不能覆盖最新sent状态 | snapshot游标、P08/W07 |
| Agent运行 | 群行事务+数据库唯一约束+运行锁；待处理消息聚合；完整历史和审计先于副作用 | runId、agent_steps、agent_send_keys、P07/B10 |
| Agent未知恢复 | 未记录的turn/kick结果缺乏安全重放证据，保留running+说明并提醒 | recoveryNote、inconsistency、B08/B11 |
| 序列排期 | 前一步确认sent/skip后才安排下一步；限流顺延；接管只重排最早逾期步骤 | scheduledAt/sentAt、B09/P04 |
| 会话 | refresh一次性轮换；旧token重放撤销整会话；前端共享单飞续期 | auth_sessions/auth_tokens、H01/W01 |

限制说明见 [需求矩阵](requirements-matrix.md) L1–L6 和 [工程要求](engineering-requirements.md)。C组扩展尚未实施，不应占用上述基础验收与修复窗口。

## 验收记录格式

| 批次/条目 | 版本与时间 | 操作人 | 关联ID/证据 | 实际结果 | 人工结论 | 后续复验 |
|---|---|---|---|---|---|---|
| 待填写 | 待填写 | 用户 | 截图、requestId/jobId/clientMsgId/runId或测试输出 | 待执行 | 待验收 | 若修复影响本项，填写新版本 |

发现差异时记录预期、实际、操作顺序与ID，保留失败状态。开发者复测通过后仍由用户确认业务行为与设计理解，不能自动替代其验收结论。
