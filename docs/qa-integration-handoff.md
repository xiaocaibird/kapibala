# 开发自测完成与 QA 联调交接

本文保留初次交接时的固定候选和接入状态。后续容量接入、数据库夹具与研发复现问题见 [QA 工程接入交付补充](qa-engineering-intake-20261001.md)；独立 QA 执行结果以 `qa-acceptance/reports/` 为准。

2026-10-01。交接编号 `DEV-QA-20261001-01`。状态：开发自测和本地 main 集成完成，发起 QA 接入与联调准备；尚无本候选的独立 QA 产品执行结果。本文由开发维护，不复制或修改 QA 用例、断言及正式报告。

## 阶段与职责

本次负责人要求：开发完成自测后，按 `qa-acceptance/` 接入契约准备材料并向 QA 发起联调；QA 维护用例与断言，问题共同排查。联调、正式业务验收、上线评估分阶段处理。

本交接先供 QA 核对版本影响、接入与执行范围。QA 负责目标配置、真实页面定位、套件选择、授权绑定和独立结论。开发负责提供产品事实、版本化夹具来源及必要测试接入、定位和修复产品问题。不能把开发自测转为 QA PASS，不能用改断言代替修复。实际执行遵守 QA 现有入口及对应阶段授权；不代造授权文件，也不以本次交接启动正式验收或上线测试。

## 固定版本

| 材料 | 精确版本或摘要 | 说明 |
|---|---|---|
| 提交 QA 的候选 | `993f7588c1105894e0543554209a8c085423589f` | 已在本地 main；QA 应在独立、干净 SUT 工作树固定此 SHA，不能跟随浮动 main |
| 本次 main 集成前 | `84179bfb8ff27c61b72eba77d0ecbbc6ecf1cee9` | QA 最近交付资产所在版本 |
| QA 最近登记的产品影响评审基线 | `48adfd96f470532cc78c2d3c559414a09434eeff` | 来自 `requirements/change-reviews.json`；本次须由 QA 补影响评审，开发不修改该登记 |
| 完整开发回归的产品候选 | `2318a118f477c69e1049856c1f4126d8701ea17d` | 与提测候选的 apps、packages、db、tests、根依赖/TS 配置一致；后续合入 QA 资产、补验证脚本、证据及文档 |
| QA 目录树 | `8528f632e8d90be4b6c3cf1baab3f9c08b0ddd10` | 本次开发集成原样保留；执行时仍需 QA 独立计算文件/套件摘要 |
| 原始需求 SHA-256 | `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75` | 原文未修改 |

本文后续提交仅增加开发交接材料，提测 SHA 保持上述固定值。产品变更则必须另发候选、相关自测及影响说明，不暗中替换。

```sh
git diff --name-status 48adfd96f470532cc78c2d3c559414a09434eeff 993f7588c1105894e0543554209a8c085423589f -- apps packages db scripts package.json package-lock.json
git diff --exit-code 2318a118f477c69e1049856c1f4126d8701ea17d 993f7588c1105894e0543554209a8c085423589f -- apps packages db tests package.json package-lock.json tsconfig.json
git diff --exit-code 84179bfb8ff27c61b72eba77d0ecbbc6ecf1cee9 993f7588c1105894e0543554209a8c085423589f -- qa-acceptance docs/original-interview-question.md
```

## 开发自测证据

| 检查 | 结果 | 证据与限制 |
|---|---|---|
| 完整回归 | 416/416，失败、跳过、取消均 0 | [原始输出](evidence/core-final-regression.tap)；三个真实计时开关开启，114.523 秒。文件是原始 Node 默认 reporter 输出，扩展名不表示 TAP 格式 |
| 类型、生产构建、原文保护 | 全部退出 0 | [日志](evidence/core-final-build.log)；前后端类型与 Vite 构建 |
| 页面恢复 | 165 行、4 页，传输恢复至稳定 DOM 454.37ms，时钟误差界 1.68ms | [记录](evidence/core-reconnect-browser-2026-09-30T22-47-41-185Z.json)；真实 REST/WS/DOM，含重复、迟到历史和一次 503。网关事件经开发 helper 注入、后台关闭，不代表独立网关 SSE 全链路或任意容量时限 |
| 已批准表单补验 | 8/8，0 页面异常 | [报告](cr-browser-evidence-closeout.md)；放弃、遮罩、卸载后迟到结果、存储拒绝与真实 Chromium 配额耗尽；未覆盖真实 OS 输入法 |
| 证据完整性与清理 | 原始日志与初始失败留存，自有资源清理完成 | [机器索引](evidence/core-final-verification.json) 含源码树和证据哈希。开发专用 PG 已停止，不能供 QA 复用 |

复现开发回归时在独立库设置 `DATABASE_URL`，并开启 `AUTOMATION_TIMING_TESTS=1 CORE_AUTOMATION_TIMING_TESTS=1 SESSION_COOKIE_TIMING_TESTS=1` 后执行 `npm test`。开发命令不替代 QA 入口；各定向测试数存在交叉，不与 416 相加。

## 启动、迁移与隔离配置

当前可核实运行时为 Node `v24.21.0`、npm `12.1.0`；工程 engines 为 Node `>=24.21.0 <25`、npm `>=12.1.0 <13`。依赖锁已提交。QA 在自己固定候选的 SUT 目录准备依赖：`npm ci`，验证/构建为 `npm run build`。不在日常工作树安装或启动。

以下为开发确认的 `sut` 字段材料，供 QA 写入自己的完整目标配置；不是可直接执行的授权文件，也没有替 QA 确认 UI：

```json
{
  "revision": "993f7588c1105894e0543554209a8c085423589f",
  "start": {
    "command": "node",
    "args": ["--import", "tsx", "apps/server/src/main.ts"]
  },
  "migrate": {
    "command": "node",
    "args": ["--import", "tsx", "scripts/migrate.ts"]
  },
  "web": {
    "command": "npm",
    "args": ["exec", "--workspace", "apps/web", "--", "vite", "--host", "127.0.0.1", "--port", "{WEB_PORT}", "--strictPort"]
  },
  "env": { "AGENT_TURN_TIMEOUT_MS": "12000" },
  "startupTimeoutMs": 45000
}
```

- 数据库使用 QA 契约中的 `postgres:17-alpine`、独立随机数据库及 loopback 端口；`PORT`、`DATABASE_URL`、`GATEWAY_URL`、`AGENT_URL` 由 QA 环境注入。不要复制日常 `.env`，也不要启动产品自带模拟器。
- 后端使用无 watch 的真实 `main.ts`，包含启动迁移校验和正常后台模块；健康入口 `/api/health`。迁移到当前结构后 `schemaVersion=8`；旧结构必须拒启，不能在拒启实验前执行候选迁移。
- 新增 `008_message_sent_receipts.sql`。既有可靠接收时间保留；缺失历史时间保持未知，不用网关发送时间、迁移时刻或重放时刻补造。迁移完整历史与内容校验仍生效，新旧版本均须精确匹配。
- 初始化会产生 `account-1` 至 `account-6` 六个服务账号，初始未连接。QA 环境通过公开账号接口发现并向独立网关 seed；至少四个账号的测试前提可满足。控制台测试身份为 `admin/admin` 与 `viewer/viewer`，仅为既定本地测试身份，不表示生产身份方案已交付。
- `HttpOnly` 续期 Cookie 已存在。loopback HTTP 场景不要擅自设 `NODE_ENV=production`，该值会启用 Secure Cookie；若测试 HTTPS/生产配置，另冻结对应目标和证据。
- 前端默认 Vite 代理仍指向日常 3100。浏览器必须使用 QA `BrowserProxy` 返回的 `webUrl`，它将 `/api`、`/ws` 路由到本轮随机 API 端口；不能直接打开 Vite URL 或 5173 代替隔离入口。QA 路由/定位须按真实页面核对。
- 当前本地演示未随本批合并重启或迁移。旧服务可用性和版本不是本交接证明；不得以演示端口/数据库作为联调目标。

## 变更影响与必须保留的边界

详见[本轮收口](core-verification-closeout.md)、[决策记录 D039–D046](decisions.md)；以下供 QA 独立映射用例，不替 QA 给出裁定。

| 变更 | QA 应交叉核对的行为与反例 | 已知边界 / 来源 |
|---|---|---|
| A2 超时 | 504 到达即记时，数据库锁不能推迟计时；可查询明确未发送后判失败；取消可选自动重发；查询失败保持 unknown | 不新增外部能力。查询自身无响应耗时上界，任意慢查询下 5 秒/恢复 2 秒仍不能保证，见[时限收口](core-timeout-policy-closeout.md) |
| 成员事件隔离 | A 群锁阻塞时 B 群继续；受阻事件回滚/重试，去重与顺序不变 | 局部锁等待治理不等于任意远端延迟/积压都有全局上界 |
| D040 计量 | 模型、审计、工具等关键节点记账；所有权与停机排除保持，不能通过重启重置已存预算 | 硬崩溃最后未保存尾差仍存在，无固定误差上界；不是放宽原 60 秒定义 |
| D041 接收恢复 | 接收记录成功、业务事务失败或硬死后复用记录；重复事件不覆盖时间；旧记录不补造 | 保存前窗口与多实例全局物理首次观察仍未获保证 |
| D042 退群 | 托管账号退出、群主最后、失败保护；left 不可写且自动化停止；外部成员保留在 DB 和公开 members | 负责人已反复确认的原文语义冲突处理：明确偏离原 2.3 的 members=[]，兼顾 B2 只退出托管成员。不是原文被修改或 QA 自动放行 |
| D043 账号保存 | 已知远端成功后，原锁事务内 savepoint 有界重试本地写入；不能让旧动作覆盖后续意图 | 不重发外部操作。连接丢失、提交未知、永久错误不具备完整双系统恢复 |
| D044 资源 | 快照续页切片；WS 有界发送，慢消费者断开并按确认游标恢复；不丢历史或擅自使游标失效 | 初始全量读取、快照生命周期与整体容量风险仍在；传输减少不证明 DB 成本为常数 |
| D045 职责与观测 | 原事务内终态协作、当前生产事件类型、旧事件兼容；管理员诊断及 viewer 禁写 | 后台 tick 进展不是业务完成证明，也不是 QA 容量控制接口 |
| QA-D6 普通序列失败 | failed 终止且不续发；skipped、限流等待、unknown 和群不可写停止保持各自语义 | 已核对产品分支和开发关联测试；没有执行 QA 的 `sequence-failure-regression`，不能预填其结果 |

四类未知结果（发送、建群、移除成员、Agent 轮次）仍有原协议无法完全保证的恢复窗口。负责人决定本次不增加外部能力，建议另存；**这不等于原文强保证已经满足**。QA 应独立保留具体失败/证据不足/已批准偏离及其来源，不将有限测试通过泛化为任意崩溃可恢复。

## 接入依赖与分工

以 QA [原阻塞复核](../qa-acceptance/requirements/blocker-reassessment.md) 的 13 条为基线，不额外创造业务决定，也不把所有未跑用例默认称为就绪。

| 依赖 | 本交接实际准备状态 | 联调下一步与责任 |
|---|---|---|
| 候选、命令、证据与版本差异 | 已提供上述固定 SHA、启动材料及开发证据 | QA 独立完成本次影响评审；配置固定到候选，保持标准独立 |
| CAP-001..010 | 未交付真实容量控制器。已有互斥/容量返回、活动记账与后台诊断不满足完整控制契约 | 开发与 QA 对齐真实占用/释放、拒绝关联证据、CAP-009 提交前屏障、CAP-003 活动计时观察；QA 维护客户端/断言与绑定。不能用 fake controller 或强制返回错误冒充容量耗尽 |
| BLK-MIG-001 | 现有开发迁移测试与旧版本出处可追溯，**尚未制作 QA 要求的 pg-custom 历史库归档及双哈希 manifest** | 开发提供固定历史版本/生成材料，QA 审核 schema 关系与拒启诊断；在专属夹具库制作、封存和导入，不能复用演示库或伪造 archive |
| UI-037 | 已有开发微秒游标验证，**尚未制作 QA 契约的固定数据库归档及独立真值 manifest** | 按 QA 六条微秒/同时间 ID 台账生成合成数据；真值在生成前确定，由 QA 审核；不能从 SUT API 返回值反推预期 |
| ARC-UI-BLK-001 | 产品有账号资源读取与提醒机制；QA 实际消费者定位和纯刷新语义尚未联调确认 | QA 对真实可见页面适配；若无匹配可见入口，由 QA 评估等价消费者，不能为匹配模板添加业务按钮或降低断言 |

数据库制品必须遵循 [fixture-artifacts 契约](../qa-acceptance/contracts/fixture-artifacts.md)，由 QA 接入其目录并绑定配置/manifest/archive 哈希；此开发交接不向 QA 目录写占位制品或假审核记录。容量必须遵循 [capacity-observation 契约](../qa-acceptance/contracts/capacity-observation.md)，绑定实际候选进程、资源所有权、关联事件及自动回收，测试接入不能变更外部网关/Agent 业务协议。

### 夹具与容量的具体接入线索

- 历史库生产来源可选 `3d7e4f461238e752b2259e0a99dffa8521a00caa`：该提交仅有 001–007，七份 SQL 与候选一致，候选另有 008。应从该历史提交的迁移器创建全新纯合成库并导出，由 QA 审核版本关系与 `Schema mismatch:` 诊断的精确内容；此处提供出处，不声称已生产/审核归档。既有演示备份不满足本次合成夹具要求。
- 微秒制品按 QA 契约六行台账预先指定 ID、微秒时间、名称和公共字段，再创建固定 schema8 库。开发已有 `tests/integration/group-directory.test.ts` 的微秒边界素材可作实现定位线索，QA 真值仍来自独立台账。
- 容量计数是同一 `Database` 实例内的 `activeLocks`，开发现有测试通过该实例真实持槽。独立控制器另开 PG 连接或只持群锁，不能等价证明槽位耗尽。需绑定真正 SUT 实例的测试接入，不能把已存在的类型化容量返回冒充完整控制契约。
- CAP-009 还需要在容量拒绝后、ready 更新提交前保持窗口；CAP-003 需要活动计量的可审查区间。现有后台 tick 诊断不提供这两项，也不提供契约中的租约、TTL、关联拒绝事件。接入实现前两方先对齐控制边界与证据格式。

### 页面静态定位材料（待 QA 可见页面确认）

路由与模板一致：`/`、`/#/accounts`、`/#/groups`、`/#/groups/{id}`、`/#/agent-runs/{id}`、`/#/sequences`。模板属性不能直接视为实际 DOM；产品没有其占位 `data-qa-*`，名称与序列输入也不应假设有模板中的 `name=`。

| 项目 | 当前源码中的候选定位/文本 |
|---|---|
| 登录 | `input[autocomplete="username"]`、`input[type="password"]`、`button.login-submit`；按钮为“进入工作台” |
| 账号入口/行 | `nav a[href="#/accounts"]`、`tbody > tr` |
| 资源 observation 行 | `tbody > tr:has(strong:text-is("{id}"))` |
| 行内状态及明确操作 | `td:nth-child(3) .badge`；在线“在线”，断开“已离线” |
| 资源错误 | `.notice.error[role="alert"]:has(button:text-is("重试"))`，区别于操作错误 |
| 纯刷新 | `.page-header button:text-is("刷新")`，仅账号资源 reload，不是提醒条的“刷新并查看更新” |

来源为 `apps/web/src/pages/Accounts.tsx`、`apps/web/src/components/ui.tsx` 与登录页面；它们只是适配候选。账号页有五秒轮询及读取重试，目标故障组合需持续阻断 GET。真实焦点、旧状态、错误与成功呈现后清除的联合行为由 QA 实际验证后填写 reviewReference 和 adapterConfirmed，不能由开发静态阅读代填。

## 建议联调顺序与问题回传

1. QA 先完成当前候选的影响评审与启动/隔离配置核对，列出材料接受项、接入缺口和准确执行范围。
2. 按阶段授权后先接通 `developer-smoke` 已有 6 条 API/系统用例，证据落开发预跑/联调记录，不转为正式业务验收。该子集不依赖上述容量控制器、特殊归档或 UI；仍须 QA 核对其余目标配置前提。
3. 再适配架构/序列专项以及 UI/夹具/容量场景。未接入的条目如实记录 BLOCKED，不从覆盖分母删除，不以子集通过声称全量通过。
4. 问题回传至少含候选 SHA、QA 资产/套件摘要、用例 ID、触发条件、预期/实际、原始日志或独立效果账本、环境/清理状态。产品问题由开发修复并发新候选，适配/断言问题由 QA 独立判断维护；历史失败证据保留。
5. 联调稳定后再发正式业务验收候选与授权请求。上线 profile、负载目标、RPO/RTO、部署和安全证据依 [release-gates](../qa-acceptance/requirements/release-gates.md) 另行评估，本交接不填任意默认值。

本次交接不是“所有 QA 接入已完成”。已完成开发交付与证据整理；上述工程接入缺口将通过联调逐项闭合，不把准备进度混入业务验收结论。
