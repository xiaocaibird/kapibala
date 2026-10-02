# 最终增强前端开发交付记录

日期：2026-10-02（北京时间）。范围：V3 的 P0-03、P0-04、P1-02。**本文保留原开发阶段的实现、自测和当时交付限制；后续D052已授权并完成合main、独立QA执行，不能将下文历史“未合main”理解为当前状态。** D053的一次定向复验已结束，跨实体提醒仍BLOCKED且追加复测已停止，最新结果见[遗留处置](second-round-disposition-20261002.md)。全面人工验收及演示切换没有由开发记录代签。

## 固定版本与改动

基线 `ac5e8e639237070fb5c48751ce04a7645b4a19ab`，工作分支 `agent/final-enhancement-ui`。首批验证源为 **`7c3e22ff11e29d286ebd0311d818b5ae0e6ad7ed`**；验证开始时工作树干净。后续登录生命周期修补及新的固定源见文末；本节原记录保留。首批产品和测试提交顺序如下，报告及证据追加提交不改变产品源：

1. `9cf036f5786d8368ee0393f64a916b2e4574ec3b`：草稿、创建表单、预检保护与来源导航；开发验证入口。
2. `ac31dae9f5adbde366f39a53bc5761a0ab169cb0`：截图核对后，将冻结目标摘要按现有 notice 样式纵向排列。
3. `747e52272b0395150d5d58eb4cd8e267b81b2b55`：详情加载或失败时保留来源群；成功读取后以真实 run.groupId 覆盖 URL 提示。
4. `7c3e22ff11e29d286ebd0311d818b5ae0e6ad7ed`：浏览器返回检查等待真实群列表数据呈现，避免在空的加载中选择框上过早断言。

### 输入与创建表单

- `Timeline` 在提交时记录草稿修订号、群、发送身份及登录会话。成功仅清理同一次且未再编辑的草稿；A→B→A 仍视为新草稿。发送失败保留文本，换群、换发送身份或会话失效后旧结果不清除新上下文。同步 pending 守卫阻止同一 tick 重入。
- 新建序列复用现有表单守卫和放弃修改提示。×、Escape、取消走同一入口；保存期间禁用编辑并阻止关闭。现有 Modal 没有点击遮罩关闭行为，本次未添加该能力。预检确认窗已有的保存中关闭保护继续保留。
- 不增加跨页面、跨登录或跨设备草稿；没有把未知受理结果变成安全重发，也没有新增通用幂等协议。

### 预检上下文与冻结目标

- 保留原来冻结 groupId/payload 启动的行为。新增修订检查，使切群、切模板、变量编辑、群/模板相关资料更新、角色或目标失效后的旧响应不能恢复可确认状态；A→B→A 同样失效。
- URL 指定的群视为显式目标。初次默认选择一旦形成也会保留；目标或模板从列表消失后不会回落首项，明确要求重新选择。变量草稿保留并提示重新预检。
- 确认窗展示冻结群名及稳定 ID、模板名及 ID、角色、每步相对等待和最终文本。服务端预检、启动时校验、权限、角色缺失时 skipped、限流和排期未改。角色快照不保证未来账号可用。

### 两类 Agent 详情来源

- 从群详情进入，保留群工作台标题/高亮并返回原群；从 Agent 列表进入，返回列表且保留选群。“查看所属群”另列链接。
- 来源只接受 groups / agent-runs。group 仅为站内返回提示，所有 ID 均编码；读取到运行后真实 run.groupId 优先。加载/失败也有返回入口，直接深链、非法编码或无效来源可回到站内列表。忽略任意 returnTo，不使用机械 history.back。
- 登录会话失效时清除 Agent 来源/选群参数。浏览器前进后退和刷新保留正常来源；没有新增跨设备状态存储。
- 运行详情的 attention scopeKey、事件过滤与实际 run 实体不变，只调整展示标题；不扩大清提醒范围。没有重写全站路由或修改序列 URL 行为。

## 验证结果与证据分层

| 验证 | 固定版本/输入 | 实际结果 |
|---|---|---|
| 修前保护反例 | ac5e8e6 原生产构建 | 6 FAIL：A 清 B、A→B→A、脏表单 ×、预检切群、预检 A→B→A、失效显式 URL 回落 |
| 修前导航反例 | 同一 ac5e8e6 原生产构建 | 2 FAIL：群来源返回、列表来源返回 |
| 最终浏览器开发验证 | 7c3e22f 生产构建 + 真实 REST + 独占 PG | **25 PASS / 0 FAIL**；0 pageerror；含真实消息受理写入和真实序列启动 |
| 全前端开发测试 | 7c3e22f，`tsx --test apps/web/tests/*.test.ts` | **130 PASS / 0 FAIL / 1 SKIP**，共 131；跳过的是既有真实 20 秒刷新超时测试，本轮未宣称覆盖 |
| 全套构建 | 7c3e22f，`npm run build` | 通过，包含根及前端类型检查、生产构建 |
| 原始要求完整性 | `npm run verify:original` | 通过；SHA-256 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`；之后无原文改动 |

浏览器验证程序位于 [verify-final-enhancement.mjs](../apps/web/tests/verify-final-enhancement.mjs)。消息/预检/创建的延迟由浏览器运输层暂停**真实 API 响应**构造，未替换响应正文。群、账号、模板及导航用运行记录来自独占测试库的开发夹具；记录中的导航终态不是声称由真实模型执行生成。后台调度关闭，不依赖远端网关或真实模型，不产生真实模型费用。该验证是开发侧受控浏览器/API 集成，不是独立 QA 结论或真人操作证据。

25 项包括：7 项发送保护，5 项创建/关闭保护，8 项预检/目标/真实启动，5 项导航。预检角色变化案例证明旧确认关闭、无匹配角色仍可重新预检，没有通过 UI 改写原服务端 skipped 规则。导航覆盖两入口、前进后退、刷新、失败/加载返回、非法编码、外部来源忽略、来源群篡改后以真实运行纠正、退出后改以 viewer 登录。

完整原始输出、各轮源/构建文件 hash、清理结果与最终截图存于 [证据目录](evidence/final-ui-20261002/)，全部文件摘要见 [sha256.json](evidence/final-ui-20261002/sha256.json)。主要文件：

- [修前保护](evidence/final-ui-20261002/before-browser.json)，SHA-256 `4387ac4b228d23884d6e0f166d773cc2f3f6402167c80e002be66ec4e6dc754c`。
- [修前导航](evidence/final-ui-20261002/before-navigation.json)，SHA-256 `e352b9b9786888286294d44f926b3731044c7ec4e1253a69951cd8841d2c6d46`。
- [最终浏览器](evidence/final-ui-20261002/verified-browser.json)，SHA-256 `04973917b3f209133c76bc917cba279e3c55818c34123fff3166d19e37fbfb23`。
- [最终前端测试](evidence/final-ui-20261002/verified-frontend.tap)，SHA-256 `638fc53952ac5d3bf63fd9f9731471a1e682a9f4825ebd4bcabb2ee447e0e13e`。
- [冻结目标截图](evidence/final-ui-20261002/verified-browser.json.frozen-preview.png)、[群来源详情截图](evidence/final-ui-20261002/verified-browser.json.group-origin-detail.png)。工程侧已查看实际截图；不代签真人 IME、焦点或体验验收。

修前构建在改产品前生成并保存到 `.runtime/final-enhancement-ui-20261002/baseline-dist`，其资源名/hash保存在报告中。首轮修前报告里的 sourceFiles/sourceStatus 描述执行脚本时正在编辑的工作树，**不是该旧构建的源码声明**；实际页面使用上述独立保存的 ac5e8e6 构建。修前导航报告另明确记录 buildSourceHead。

中间失败不覆盖：`after-browser-1.json` 为 17 PASS / 7 FAIL，原因包括宽泛选择器同时匹配侧栏与详情链接、将既有创建返回 200 错写成 201、失败后群变不可写时输入框暂不呈现，以及将 Empty 文本当作 heading。修正夹具后 `after-browser-2.json` 为 24 PASS。`final-747-browser.json` 为 23 PASS / 2 FAIL，断言早于返回列表数据到达；补等到真实运行行呈现后，固定 7c3e22f 的 25 项全通过。没有为这些夹具失败降低产品断言。

## 资源所有权与清理

- 自有容器 `kapibala-final-ui-20261002`，标签 `kapibala.owner=final-enhancement-ui-20261002`，PostgreSQL 16 Alpine，端口仅 `127.0.0.1:64602`。
- 自有匿名卷 `d8af14d2abf146081af4443aece0d55fc8971ca64c34b4a443a47f8e7cec3b71`。每次程序建不同 UUID 数据库，报告记录实际名字；清理先关闭浏览器、Vite、API，再关闭并删除该次数据库。
- 最终检查该专属 PG 无剩余 `kapibala_test_%` 库；随后删除上述容器及匿名卷，逐项 inspect 确认不存在。[cleanup.json](evidence/final-ui-20261002/cleanup.json)，SHA-256 `d2f3adb906dfec48ef2db06cf916b379dee885f943f56f9db1df39b2b5714667`。
- 某些原始输出包含关闭阶段的 PG idle connection termination 或 WebSocket ECONNRESET，原样保留；最终程序退出 0、清理步骤全成功、独占数据库无残留。没有据此宣称运行日志完全无诊断信息。
- 未使用演示数据库、固定服务端口或现有 QA 进程；Playwright 仅复用已安装的包，未修改 QA 文件。没有读取模型 Key。独占资源已清理，`.runtime` 原始文件继续保留作为本地开发证据。

## 后续复验入口与限制

待用户 review 和后续明确指示后，可从群详情的消息输入、新建序列弹窗、序列预检和两个 Agent 详情入口复验。可复用上述开发程序，但独立 QA 自行维护用例和判断；本记录没有启动新一轮 QA 执行。

开发重跑需新建自有、一次性 PostgreSQL 服务（该脚本固定要求端口 64602），设置显式 DATABASE_URL、PLAYWRIGHT_MODULE 和 UI_EVIDENCE_PATH，先 `npm run build`，再 `npx tsx apps/web/tests/verify-final-enhancement.mjs`。远端地址可设为 `http://127.0.0.1:1`，后台关闭；程序只创建并清理 UUID 测试库。DATABASE_URL 不得指向演示或 QA 服务。

剩余边界：未进行真人系统输入法/焦点验收；未证明受理未知后可以安全重发；未新增持久草稿、全站导航重构、模板编辑/归档、媒体下载或后台政策；未把本轮开发测试当作整个系统完整回归、正式验收或上线结论。首轮已经在进行的收尾与这些新增项分开记录。

## 追加：来源上下文绑定本次登录

独立复核指出：首批清理仅在 Workspace 挂载时修改当前 hash，旧历史仍可在下一次登录时重新带入 from/group；会话过期刷新时 Workspace 尚未挂载也有遗漏。这是浏览上下文继承问题，不是权限越界判断。

追加产品及测试提交 **`f83b5d8c7ff4d875e76a011798ab1dd70e5bbf69`**，接在 `ba66904d1d8ac0abcd91871017740ba21da82ee4` 后。没有修改认证接口、服务端权限或跨标签机制：

- 来源提示绑定前端本次登录的随机 context，存于 sessionStorage 并关联实际 `/me` 的用户名/角色；它不是凭据。只有实际身份确认成功后才能恢复同一有效登录的 context。
- 显式登录开始立即废弃旧 context，避免 login 已成功但 `/me` 失败后刷新又恢复旧标识。登录成功后建立新标识；同账号重新登录也属于新生命周期。
- 失效监听移到 AuthProvider，保持先注册再发起 refresh；实际 refresh 401 时，即使 Workspace 从未挂载也会清理。当前地址使用 replaceState，不添加新的历史项。
- 路由仅在 context 匹配时接受 from/group；过往历史、过期或篡改参数整组忽略，run 深链仍可读取。有效会话的正常刷新、后退/前进和原群返回保留，真实 run.groupId 继续优先。
- 导航存储写入失败时不让该故障阻断认证，来源提示保守失效。Agent 列表选群同时更新本地状态，仍能查看另一群，不能仅依赖地址参数。

### 追加验证，分母不混用

| 阶段 | 结果与实际边界 |
|---|---|
| 首批 `7c3e22f` 原构建追加反例 | **3 FAIL**：退出后 viewer 后退恢复群来源、恢复列表选群、refresh 实际 401 后重新登录继承来源 |
| 登录隔离初版工作树 | **30 PASS**：保留原 25 项，加上述跨登录及同身份重登、login 200 + `/me` 传输失败等；属于未提交工作树，源文件 hash 原样记录 |
| 独立复核发现的存储降级反例 | 新导航键 setItem 抛 QuotaExceededError 时无法展示另一群运行，**修前 1 FAIL／修后 1 PASS** |
| 固定 `f83b5d8` 导航影响复验 | **11 PASS / 0 FAIL**；真实 React、REST、独占 PG，0 pageerror，所有程序清理成功 |
| 固定 `f83b5d8` 全前端与构建 | **134 PASS / 0 FAIL / 1 个既有 SKIP**，共 135；根类型检查、生产构建、原文 hash 校验通过 |

固定 11 项含同一有效会话正常刷新/返回、两来源、失败/加载、换账号后退、同账号重登后退/前进、过期刷新、篡改 context、显式 login 返回真实 200 但 `/me` 真实运输失败后刷新，以及导航存储写入失败时本页选群。账号过期使用专属库撤销真实 auth_session，浏览器记录实际 refresh 401；没有替换认证响应。`/me` 的受控运输中断使用浏览器 abort，并等待实际 requestfailed。存储故障是浏览器开发注入，不能等同真人隐私配置验证。

独立只读复核已再次核对 `f83b5d8`：确认 localChoice 降级修复和登录上下文校验，限定范围未发现新的具体阻塞；该复核没有改文件或另跑测试。

本节只重跑受影响导航；没有把历史 30 项工作树 PASS 或旧 25 项固定源 PASS 拼成新源完整浏览器回归。原证据目录及根侧 `be3a53c` 组合回归保持独立。

追加原始证据见 [final-ui-session-20261002](evidence/final-ui-session-20261002/)，摘要见 [sha256.json](evidence/final-ui-session-20261002/sha256.json)：

- [固定导航结果](evidence/final-ui-session-20261002/final.json)：`192091918468d882981e630a09b094944eff31b6cc808b5e6320018f8d190445`。
- [原构建三条失败](evidence/final-ui-session-20261002/before.json)：`4dcb990112897ff26edbc398f7bd5d94853a6ca4cc2acbb332d6724cf129cb81`。
- [存储降级精确反例](evidence/final-ui-session-20261002/storage-before-targeted.json)：`66d956f2e433013260f68cd3f4d6eef051b8ca7ccc7abfa834fb5d1ffd88e791`；对应修后记录为 `storage-after-targeted.json`。
- [固定前端测试](evidence/final-ui-session-20261002/final-frontend.tap)：`7565616937497a3ee17e5c2fbbde9625afd9f761cc47689b5dafe4659fec5abb`。

存储反例使用保存的初版工作树生产构建，其 buildSourceHead 明确标成 `ba66904-plus-uncommitted-session-patch`，不是固定 Git SHA。该构建与最终产品的差别是 AgentRuns 尚未同步本地选群；`after.json` 的各产品文件 hash 可与最终产品核对，AgentRuns 对应旧 `ba66904` 文件。报告里的 sourceFiles 描述脚本执行时的工作树，不冒充历史构建源。

`storage-before.json` / `storage-after.json` 另保留一轮过宽故障注入：完全拒绝 sessionStorage getter，页面在列表出现前就进入现有其他路径的错误处理，未到达待测选群条件。这两次不能计作本项修前/修后结论。后续改为只让新导航键写入抛配额错误，才形成精确反例。本次未修复或宣称支持浏览器全面禁止存储的所有既有路径；sessionStorage 还可能随带 opener 的新页面复制，本次不声明跨标签独立或同步保证。

### 追加资源清理

新增专属容器 `kapibala-final-ui-session-20261002`，owner 标签 `final-ui-session-20261002`，仅绑定 `127.0.0.1:64602`。匿名卷 `7fb4e601e2207508fe4873ddc3bb420f24cfd48e189bbe7950ef5a7635e3851d`。各运行的 UUID 库已删除，最终检查无剩余测试库，再移除容器及卷并 inspect 确认不存在。[cleanup.json](evidence/final-ui-session-20261002/cleanup.json) SHA-256：`3cead4648a2138bb843aed90c41e61e901338bdcf9fef3eb176dfd7a6d310f83`。

仍未合 main，未启动本轮实际 QA 执行，未操作演示或旧 QA 资源。开发结果先交 review；后续合入与实际提测按用户的新指示进行。
