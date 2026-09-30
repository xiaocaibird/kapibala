# 分批验收与运行说明

> 代码入口与命令均相对于项目根目录。运行位置、当前演示版本和证据边界见[文档入口](README.md)。

本清单用于体验、核对行为并理解关键设计。群资料扩展按 `2d67500` 的143项登记、140通过、3跳过结果交付；原基础功能历史验证仍单独保留。当前运行版本见下方群资料升级记录。**用户全面人工验收尚未完成**；已反馈的账号状态和一次建群成功见[单点观察记录](change-requests.md#用户单点观察记录)。下表的开发者检查记录不能代替人工确认。每次实际验收同时记录`git rev-parse HEAD`与运行manifest，当前版本重新勾选；修复影响已验项目时重新执行对应批次。


## 功能总览与建议路线

第一次体验依次执行批次一至四，约35–45分钟：登录与账号 → 建群与消息 → Agent步骤 → 序列预检 → viewer只读。随后按批次五、六检查故障和断线；底层并发、事务、重启由批次七的可执行命令复现，不要求阅读源码。时间为操作预算，实际以验收记录为准。

| 范围 | 可验收能力 | 入口 | 当前状态 |
|---|---|---|---|
| A0/B3 | 登录、权限、续期、注销、迁移与拒启 | 批次一/四/七 | 常规125项、同产品源码独立长计时3项通过；用户待验 |
| A1/A3/B2 | 账号状态、异步建群、成员角色、群主最后退出 | 批次一/五/七 | 正常账号建群已浏览器通过；异常自动证据见矩阵；用户待验 |
| A2/A4/B4 | 统一可靠发送、去重、历史分页、实时恢复 | 批次二/五/六/七 | 消息单行与服务器补齐已有通过记录；旧404修复通过；新版浏览器59行+503恢复1872ms通过 |
| A5/页面4 | 自动触发、完整工具步骤、审计、恢复与预算 | 批次二/五/七 | 正常3步浏览器通过；协议不可判定窗口保守暂停 |
| B1/页面5 | 变量继承、来源预检、定时运行、并发互斥 | 批次三/七 | 两步浏览器运行通过；调度失锁修复已集成验证；用户待验 |
| C1/C2/C3 | 媒体归档、真实模型、完整Playwright | 未启用 | 未实现，独立于基础验收 |

上一轮基础测试提交 `82312b905016cc3cca577aca267d795250d5d3a4` 已通过构建和原文校验。历史日志名 `.runtime/release-isolated-verification.log`（原路径后续复用，旧结果与哈希见release-verification.json）记录 **128项登记、125通过、3跳过、0失败，112.206秒**；使用额外的临时base数据库，结束后已删除，测试夹具另建独立临时库或schema。计数包括嵌套子测试；R1–R11及B38初始化owner终止接管均进入常规回归。跳过的3项已在产品源码相同的`f52faec`独立3/3通过：12秒turn、3×5秒审计、60秒活动预算，测试分别耗时13.614/16.485/60.032秒，总94.470秒。当时后续提交只改测试和文档，没有重复相同的长等待；本次群资料扩展未修改计时引擎，因此未重复这些长等待。具体断言和边界见[可靠性复查](reliability-review.md)与[需求矩阵](requirements-matrix.md)。

新版B4在`32bd438`的独立实例通过：一次时间线503后，无手动刷新、无新消息触发地显示全部59行，WS恢复至渲染1872ms，失败请求至渲染284ms。[发布测试清单](evidence/release-verification.json)记录最终常规测试与独立长计时各自的源码和日志哈希；历次结果见矩阵，[浏览器数据](evidence/browser-reconnect-retry.json)记录场景边界。

R11活动时钟初始化竞态已由`f52faec`修复。新增数据库初始化栅栏使follower等待owner的基点重设事务提交；真实PG屏障测试修前以`wall_clock`失败，修后通过，已进入最终常规回归。**用户全面人工验收尚未完成**；当前统一演示的新版运行及开发者关键流程已复验通过，详情见下节。

## 当前群资料版本与验收

2026-09-30 20:57:22从main的 `7efdbf3` 启动，产品源码与验证提交 `2d67500` 一致；父58240、模拟58241、API58242、Vite58243，health schemaVersion=5。[本批运行证据](evidence/group-metadata-rollout.json)及main `.runtime/runtime-manifest.json`记录真实版本。

名称、简介和创建时间已可用：管理员在创建表单填写可选资料，在群详情“编辑资料”修改；简介留空保存可清除，旧群无名称仍回退网关ID。名称80、简介500上限及名称不可清空属于实现建议；创建时间继续数据库既有值，较新群在前的方向待确认。[变更台账](change-requests.md)维护全部新要求和验收步骤。

迁移前已备份至 `.runtime/backups/2026-09-30-before-group-metadata`；PG归档可列目录、模拟器两文件哈希相同，迁移两次后17表既有字段与行全部一致。4个旧群及用户最新消息均保留；用户已确认其“你好，我是用户4”刷新保留、仅该群一次且发送者正确，这只覆盖该条正常手动消息。更新后独立viewer页面也核对了一条sent消息；未自动操作用户Chrome页。

本批构建与类型检查、原文SHA通过；独立base完整测试143登记/140通过/3计时跳过/0失败，111.872秒。独立浏览器通过创建、改名、多行简介、清空、刷新持久、日期跨日显示和viewer只读，见[验证证据](evidence/group-metadata-verification.json)；不代替新资料功能的用户验收。

## 历史统一演示记录（19:57:51，已由本批替换）

| 对象 | 该次已知信息 | 证据与边界 |
|---|---|---|
| 源码与目录 | 原始目录`/Users/zcm/Desktop/kapibala`的main；启动源码`9befc8a580eb5dc034ed5771d3f3dfc3e756eb76` | manifest保存apps/db/packages/scripts树哈希，产品源码与`f52faec`完全一致；后续测试和文档提交不改变已加载产品源码 |
| 进程与健康 | 2026-09-30 19:57:51北京时间启动；父6107、模拟6109、API6110、Vite6111 | health为ok、schemaVersion=4；旧42fe演示已停止 |
| 备份与升级 | 原PostgreSQL容器`kapibala-postgres-1`及卷`kapibala_platform_db`保留；更新前备份到main的`.runtime/backups/2026-09-30-before-unified-demo` | PG dump归档目录验证通过；gateway.json/agent.json复制前后SHA相同；本次迁移前后17张表规范化JSON全一致 |
| 旧验收群 | 仍为4成员、5消息、1个Agent运行、1个序列运行 | 旧业务记录保留；此次启动不回删此前测试会话或迁移历史 |
| 新建复验群 | `4e1fa8c5-ea29-40a6-b432-1490d4dfaa5b` | 开发者为新版复验主动新增并保留，可供用户继续查看；不会冒充旧群 |
| 浏览器与后台 | admin登录、异步建群及角色、手动sent、Agent审计pass且3步final、序列缺变量拦截/覆盖来源/两步sent、viewer只读均通过 | 原Chrome账号页刷新后仍登录且4账号online；检查结束时pending jobs/Agent/sequence/outgoing均为0。属于开发者检查；用户单点观察另记，完整人工验收未完成 |

运行、备份与数据保留的结构化证据见[demo-verification.json](evidence/demo-verification.json)；该次截图见[Agent](evidence/demo-agent.png)、[序列](evidence/demo-sequence.png)、[viewer](evidence/demo-viewer.png)。该次结果保留为历史证据，当前版本按本批记录重新验收；已有开发者“通过”不会自动填入用户验收栏。

历史运行边界：18:46启动的旧父进程73373及后端73376/模拟73375/Vite73377来自42fe工作树。旧后端`34d9af2`仅为时间推断，旧前端源码与`a8aac5f`一致；当时没有运行manifest。D015解除冻结后已统一替换，不能继续把该历史进程组当成当前版本。

**测试隔离历史与纠正：**冻结阶段旧`auth.test.ts`直接连接默认`kapibala`库并执行两次迁移、创建自身测试会话，提前加入003/004（schema 4）；业务行未被删除。不能声称冻结期间演示数据完全未变。`9befc8a`已将auth/core/database测试改为专用临时库，初始化失败也会清理；7项针对性检查通过。原数据和测试会话保留，完整隔离基库复跑已通过并另列于需求矩阵。

B4断线专项来自独立实例：旧前端场景125ms通过；`32bd438`同规模加一次503的场景1872ms通过。此类故障专项和当前正常流程复验分别保留各自版本、场景与时限，不扩大到任意历史量或完整系统断网。

## 最短入口

服务已启动时直接打开 [控制台](http://127.0.0.1:5173)。管理员 `admin / admin`，只读账号 `viewer / viewer`。

当前演示已经运行。服务未运行时，默认从原始目录的main启动：

```sh
cd /Users/zcm/Desktop/kapibala
nvm use
npm ci
docker compose up -d --wait
npm run db:migrate
npm run dev
```

控制台 5173、业务 API 3100、模拟网关 3101、模拟 Agent 3102；默认仅本机访问。PostgreSQL 端口 55432。详情见 [代码分支与运行位置](README.md#代码与命令执行位置)、[模拟故障配置](simulator.md)。服务停止用 Ctrl-C；`docker compose stop` 保留数据库卷。验收期间不要删除数据库卷或 `.runtime` 状态目录。

原文完整性与基础检查：

```sh
npm run verify:original
npm run build
npm test
npx tsx --test apps/web/tests/reliability.test.ts
```

当前真实PG测试使用隔离schema/数据库；旧auth/core/database默认库遗漏已由9befc8a修正，不把此前全套结果追溯解释为完全隔离。最新集成工作树的 `npm test` 包含后端与控制台机制测试；也可单独执行控制台命令。不能把构建通过当成业务或浏览器验收通过。条款与精确测试名见 [需求矩阵](requirements-matrix.md)。

## 批次一：登录、账号与群（约 10 分钟）

本表保留基础验收范围。2026-09-30新增的群名称、创建时间、简介及排序要求集中在[CR-001–CR-005](change-requests.md)；其验收步骤和状态单独维护；本批已上线，用户验收仍逐项待确认。用户仅反馈账号1–4在线、5和6待连接、成功创建一个群，仍测试更多建群 case；该反馈不替代本表其余检查。

| 步骤 | 操作 | 预期结果 | 已有开发者证据 / 用户状态 |
|---|---|---|---|
| 1 | 用 admin 登录，刷新页面 | 恢复管理员会话，右上显示实时同步；access token 不写入浏览器持久存储 | 开发者浏览器通过；用户待验 |
| 2 | 进入服务账号，连接至少4个账号 | 账号在线，平台身份有值；终态账号不出现重连入口 | 开发者4账号连接通过；用户仅观察1–4在线、5和6待连接（UO-001）；状态与终态边界待验 |
| 3 | 在一个在线账号执行“标记离线→重连”；再试“释放账号” | 只出现当前状态合法的按钮，状态回写；重连后身份保持 | 开发者完整操作链待验；用户待验 |
| 4 | 创建群：一群主、一管理员、至少两成员 | 返回后台任务；完成后群里角色分别creator/admin/member/member；两个自动化设置默认关闭 | 开发者已核对4成员角色；用户报告一次建群成功（UO-002），仍测试更多 case（UO-003）；本行其余断言待用户验 |
| 5 | 保留此群用于后续批次 | 基础版本标题为 `gatewayGroupId`，名称展示变更见CR-001；URL中的长ID是本地群ID，两者用途不同 | 用户待验 |

若已有在线账号/群，可以直接使用，避免重复建立无意义数据。任务失败时保留 jobId 和 errors，不反复点击创建来掩盖失败。

理解检查：账号“在线”表示可发起平台操作；“accepted”只代表网关受理；群成员由入群事件确认，不能将 join 的202当成已入群。

## 批次二：消息与 Agent（约 10–15 分钟）

1. 进入群详情，以一个在线服务账号发送 `消息验收-1`。应立即看到自己的单行消息，从 queued 经 accepted 到 sent；网关回流后仍只有一行。正常延迟较短，若要观察 accepted，先使用下方延迟配置。
2. 开启“Agent自动应答”。复制群详情中的网关群ID（若标题已显示名称，勿把名称当作ID），替换下面命令里的示例值，在终端注入一条外部消息。
3. 群中应出现外部消息、一个Agent运行、一次自动回复；自动回复不触发第二个run。进入运行详情，核对工具名、入参、结果、audit pass，以及finish/final结束信息。end_turn/finish摘要不作为额外群消息发送。
4. 保留群ID、runId、消息clientMsgId，作为故障复验的关联入口。

```sh
curl -s http://127.0.0.1:3101/__control/config \
  -H 'Content-Type: application/json' \
  -d '{"sendDelayMs":1500,"sendResponseDelayMs":100}'

curl -s http://127.0.0.1:3101/__control/message \
  -H 'Content-Type: application/json' \
  -d '{"groupId":"替换为群详情中的网关群ID","senderPlatformUserId":"external-demo","text":"请回复这条验收消息"}'
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
| 504未落地 | 下一次sendFaults=[NETWORK_TIMEOUT_NO_EFFECT] | 确认无结果后同clientMsgId仅重发一次；第二次失败路径见G06/G07 | P02/G07既有场景通过；G30延迟旧404修后无重发；候选全套通过 |
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

P09证明服务端按sinceSeq在三秒内补发。另一次隔离hidden IAB实测（源码21be48c、旧前端）在125ms显示全部59行，含55条断线期间新消息和1条2000年的历史补投，无重复；[数据](evidence/browser-reconnect.json)与[截图](evidence/console-reconnect.png)记录其范围。该场景只断开WS传输，API和网关保持可用；不代表完整操作系统断网或任意历史量。新版32bd438在相同59行规模中，额外令首次时间线GET返回503，随后没有新消息事件或手动刷新仍自动补齐，耗时1872ms（其中失败请求后284ms）；见[新版数据](evidence/browser-reconnect-retry.json)与[截图](evidence/console-reconnect-retry.png)。


## 批次七：界面外的自动验收

前置：完成冷启动中的依赖、数据库启动与迁移；在上述实施工作树根目录使用相同Node/npm版本。以下命令需在专用测试数据库连接下执行，当前版本正常结束后清理测试资源，认证/连接/容量三个测试文件额外覆盖初始化失败清理；不要求改源码或手动杀死正在体验的开发服务。每项保存命令输出和退出码，预期exit 0、对应测试pass。用户人工执行与理解确认均待验。

| 要求 | 可执行命令 | 预期/证据 | 当前状态与复验 |
|---|---|---|---|
| A0/B3迁移、轮换、重放撤销、注销 | `npx tsx --test tests/integration/auth.test.ts` | H01所有断言pass | 已自动通过；用户待验 |
| A0已有数据从001+002升级003+004且幂等 | `npm run db:migrate`（仅在计划升级的独立环境执行） | [迁移证据](evidence/migration-upgrade.json)：消息、run、events既有列不变，active_ms=12345，新增时钟列/事件索引，二次执行不变 | 专项独立旧库升级通过；另有旧auth测试提前迁移演示库的遗漏，见D016 |
| A0旧schema拒启、viewer全部8类业务写接口 | `npx tsx --test --test-name-pattern="schema lag" tests/integration/platform.test.ts` | P12启动拒绝且全部写请求403/FORBIDDEN | 已自动通过；用户待验 |
| A1账号CAS/终态原子后果、A2错误/限流/504、A3/B2邀请/退出、A4快照 | `npx tsx --test tests/integration/gateway.test.ts` | G01–G31，含36种转移、旧404时序、成员投影删除、错误作用域、发送失锁与kick取消；失败注入不遗留半提交 | 候选版本31项通过；用户待验 |
| A5.1–12、B1变量/角色/排期/并发/恢复 | `npx tsx --test tests/integration/automation.test.ts` | 正常、协议错误、blocked、预算、工具幂等、序列互斥/继承各断言pass；长计时默认skip | B01–B36按名称索引，常规43项通过（含子测试）；3项长计时另运行；用户待验 |
| A5真实12秒turn/15秒审计/60秒预算 | `AUTOMATION_TIMING_TESTS=1 npx tsx --test --test-name-pattern="timing:" tests/integration/automation.test.ts` | 3项实际等待测试pass，迟到响应不生效 | B21–B23在32bd438已独立3/3通过（真实等待）；用户待验 |
| A2受理窗口、查询不可用恢复2秒 | `npx tsx --test --test-name-pattern="S1 distinguishes" tests/integration/platform.test.ts` | accepted时远端消息0；查询503时unknown；恢复<2秒sent | 已自动通过；用户待验 |
| S1–S8、DB写失败/多实例/断线与业务SIGKILL | `npx tsx --test tests/integration/platform.test.ts` | P01–P15通过；远端调用、持久状态与事件联合断言 | 最终15项集成通过；用户待验 |
| A4/B4服务端WS重放与注销断流 | `npx tsx --test --test-name-pattern="authenticated WebSocket" tests/integration/platform.test.ts` | auth先到、seq不重复、3秒内补发、注销4401 | 已自动通过；浏览器渲染3秒另按批次六验 |
| B3并发续期、A4稳定身份与旧分页 | `npx tsx --test apps/web/tests/reliability.test.ts` | W01–W08受控fetch/合并机制通过 | 已通过，不能代替真实PG/浏览器 |
| Agent kick真实HTTP截止 | `npx tsx --test --test-name-pattern="Agent kick deadline" tests/integration/platform.test.ts` | P15预算到期停止等待，未知效果保持不可重放，第二实例不重复kick | 候选常规套已通过（7.58秒）；用户待验 |
| 持锁连接/事务连接丢失、HTTP中止与错误解析 | `npx tsx --test tests/integration/core-reliability.test.ts` | R01–R05失锁后禁止后续DB/远端写、容量恢复、保留原错 | 本轮5项集成通过；序列调度器另由B27验证 |
| 成员并发及事件重试公平 | `npx tsx --test tests/integration/membership-reliability.test.ts` | M01–M06：终态/left成员不复活、迟到快照不覆盖删除、21号事件不被前20个失败饿死 | 修前失败、修后候选全套通过；用户待验 |
| 迟到kick/leave成功与成员重入 | `npx tsx --test tests/integration/member-rejoin.test.ts` | M07–M11：旧200不能删除已重新入群成员，GET失败不丢已知成功，也不重复kick/leave | 五项真实HTTP场景已进入候选全套通过；用户待验 |
| 事务事件锁与已知结果重试 | `npx tsx --test tests/integration/transaction-events.test.ts` | 终态结果与成员删除并行不死锁；本地事务重试不重复远端发送；FIFO按提交顺序 | T01–T03与核心5项合计8/8，候选全套通过；用户待验 |
| 时间线失败自动恢复 | `npx tsx --test apps/web/tests/timeline-recovery.test.ts` | W09–W13：无新事件仍补齐、退避封顶、卸载清理、完成边界不丢失 | 5项协调器与新版503后自动恢复浏览器场景通过；用户待验 |
| 数据库锁容量 | `npx tsx --test tests/integration/database.test.ts` | D01锁持有者不耗尽嵌套事务连接 | 已通过；不外推任意负载 |

已补齐全36种状态转移、离线后的限流到期、消息错误作用域和Agent关键计时；浏览器断线超过50条、全部端点字段等尚未完整验证的细分场景在需求矩阵单独列出。最终套通过只覆盖其中实际断言的场景，后续源码改动仍应复验。协议缺口L1–L4不能靠重跑测试消除，需要理解与确认保守处理行为。

## 关键设计理解与排查

| 主题 | 应能说明的机制 | 证据与排查入口 |
|---|---|---|
| 账号终态 | 状态、成员、排队消息和序列步骤在同一事务改变；无终态出边 | `gateway/state.ts`、account_terminal、G02 |
| unknown发送 | 只有明确504具备2秒404判定；任意响应前崩溃不具备同样安全重试依据 | clientMsgId、dispatch_state、recoveryNote、P10/L1 |
| 事件重放 | 全历史持久去重解决乱序与补投；重试失败项排队尾；最大eventId不能作为无遗漏证明 | gateway_events、events、G15/P06/M06 |
| 历史成功与当前成员 | kick/leave成功不能证明响应到达时仍未入群；群锁下重新读取成员，GET失败保留成功与一致性提示 | M07–M11、membership_refresh_failed |
| 消息分页 | 固定快照成员，内部id稳定；旧分页不能覆盖最新sent状态 | snapshot游标、P08/W07 |
| Agent运行 | 群行事务+唯一约束+运行锁；单一活动时钟同时累计执行和排队运行；审计先于副作用 | runId、agent_steps、activity_updated_at、P07/B10/B34–B36 |
| Agent未知恢复 | 未记录的turn/kick结果缺乏安全重放证据，保留running+说明并提醒 | recoveryNote、inconsistency、B08/B11 |
| 序列排期 | 前一步确认sent/skip后才安排下一步；限流顺延；接管只重排最早逾期步骤 | scheduledAt/sentAt、B09/P04 |
| 会话 | refresh一次性轮换；旧token重放撤销整会话；前端共享单飞续期 | auth_sessions/auth_tokens、H01/W01 |

限制说明见 [需求矩阵](requirements-matrix.md) L1–L8 和 [工程要求](engineering-requirements.md)。C组扩展尚未实施，不应占用上述基础验收与修复窗口。

## 验收记录格式

| 批次/条目 | 版本与时间 | 操作人 | 关联ID/证据 | 实际结果 | 人工结论 | 后续复验 |
|---|---|---|---|---|---|---|
| 待填写 | 待填写 | 用户 | 截图、requestId/jobId/clientMsgId/runId或测试输出 | 待执行 | 待验收 | 若修复影响本项，填写新版本 |

发现差异时记录预期、实际、操作顺序与ID，保留失败状态。开发者复测通过后仍由用户确认业务行为与设计理解，不能自动替代其验收结论。
