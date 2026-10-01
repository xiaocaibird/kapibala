# 群目录状态与 Agent 开关筛选

状态：**已实现，列明定向检查及隔离浏览器场景通过；演示已启用，用户验收待进行。** 2026-09-30；基线`7990ddd`，独立分支`agent/group-directory-filters-release`，后端`0ad7cb7`、前端`b6d7743`。关联[CR-012](change-requests.md#cr-012-群目录状态与-agent-开关筛选)、[D027](decisions.md)。

## 授权与实际范围

根据协调线程转述，用户明确批准 PI-02 中的群状态和 Agent 自动回复开关筛选。群状态为全部／`active`／`unreachable`／`left`；Agent 开关为全部／开启／关闭。开关筛选读取群的`agentEnabled`设置，不表示是否有正在运行的 Agent，也不修改该设置。

本批只扩展现有目录搜索与分页，复用 F-GRP-07/08，不新增功能编号。不包括 Agent/序列运行态筛选、任务中心、PI-03–23或提醒；原始要求、旧群接口、建群及资料写入、权限、消息投递恢复保持原边界。旧分页的实现与验证保留在[既有方案](group-directory-profile-proposal.md)、[GD01–GD12](acceptance.md#group-directory-acceptance)，不把其通过结果挪作本轮筛选证据。

## 查询与页面约定

| 范围 | 本批约定 |
|---|---|
| 服务端请求 | `GET /api/group-directory`新增可选`status`（active／unreachable／left）及`agentEnabled`（true／false）；全部时省略对应参数，API不接受字面`all`。关键词、状态、开关共同筛选，再按既有创建时间及ID顺序分页 |
| 分页兼容 | canonical identity包括trim后的原大小写q、order、pageSize、status、agentEnabled；cursor绑定全部条件，不能跨条件续接。新增两个可选字段，旧无筛选v1 cursor仍兼容无筛选请求；严格字段/值校验、鉴权及微秒边界不变，编码不是授权凭证 |
| 条件操作 | “清除搜索”仅清q，保留筛选和排序；“重置条件”清q及两个筛选并回到desc。筛选、排序改变时清旧页/cursor/位置，取消旧请求并忽略迟到结果；不在已加载页上做假全量筛选 |
| 状态与返回 | 同标签本次登录内存保留完整条件、已加载页与位置；详情返回按稳定ID尽力恢复。整页刷新／换身份清空；无匹配、首次失败、加载更多失败分别显示。已加载数不伪装为匹配总数 |
| 更新与输入 | 沿用IME组合与延迟查询、单页有界刷新、多页整份过期／停止旧cursor、失败保留旧数据及有界首屏探测。轮询、刷新和实时失效都使用完整条件，不绕过筛选 |

后端把条件加入同一有界查询的分页前过滤；本批没有新增迁移、业务列或写操作。前端集中构造查询身份并用于请求、分页重置和位置恢复；这是已集成代码的审阅说明；实际验证只以下方列明范围为准，不代表用户已经验收。`active`／`unreachable`／`left`仍用既有群状态含义，不因查看筛选结果触发状态变更。

## 验证与验收记录

| 条目 | 操作与预期 | 开发验证 | 用户验收 |
|---|---|---|---|
| GF01 服务端全量筛选 | 分别检查3种状态、Agent true/false及组合；结果在分页前筛选，跨页不漏项／不重复，读权限沿用 | b6d7743目录PG11项通过，含完整集合交集先筛后分页；独立65群浏览器active+true首20续10共30，ID唯一且均匹配 | 待验 |
| GF02 cursor兼容与条件绑定 | 旧无筛v1仍可续页；q/order/pageSize/status/agentEnabled任一不匹配不能复用；非法值拒绝 | b6d7743真实PG旧v1兼容、完整条件绑定、非法输入及viewer读取通过；前端查询身份/URL组合通过 | 待验 |
| GF03 条件和竞争 | 改筛选清页/cursor/位置；clear仅q，reset全部并desc；取消及迟到隔离、IME不发组合中间词 | 前端自动覆盖取消/迟到/IME与完整条件；浏览器left+false+asc+q=“目录验收 65”为1，clear仅q仍保留其余条件，请求日志已核对；reset空q/全部/全部/desc回20；真实OS输入法未重做 | 待验 |
| GF04 返回、刷新与空态 | 详情返回保持完整条件和已加载页；刷新/失效/探测带全部条件；失败留旧，无匹配与初始失败不同 | 浏览器详情返回保留条件及30项；left+true显示无匹配0；加载更多503留20，随后单页自动轮询清错后再加载到30；QA改开关后整份stale留30，手动刷新503仍留30，恢复成功整体替换为20项且排除组60 | 待验 |
| GF05 身份和既有流程 | viewer可读筛选但不新增写入口；换身份/整页刷新清目录内存；原创建任务找回仍保留 | 本轮PG viewer读取/写拒绝通过，前端停止及新session边界通过；新演示viewer只读默认4群、active+false为1群且无创建入口；换身份浏览器和创建任务找回未在本批重新操作，不把旧批次证据记为本轮复验 | 待验 |
| GF06 构建与交付 | build/typecheck、定向回归、原文SHA；默认演示更新和资源清理单独记实际结果 | b6d7743 build含双方TS、SHA通过；定向65/65、0skip/0fail，2226.045083ms；非全套长回归。22:47:25统一b6d7743演示启用、schema6；QA浏览器/进程/数据库已清理 | 待验 |

集成HEAD `b6d7743`的`npm run build`含服务端/前端两项TS检查通过；定向测试共65项通过（前端46、PG目录11及metadata8），0跳过、0失败，2226.045083ms。测试显式使用postgres基库，每个PG fixture创建独立数据库；目录日志列明的11个数据库清理查询均为0，metadata采用独立helper但未逐名记录，不据此宣称已逐个核查19个库。该结果是定向回归，不是重新运行完整套件或长计时回归。

开发者浏览器使用独立65群QA数据库`group_filter_qa_7ab5030ccdb547bdb1eabaa42db3f51e`，API50685／UI50705；[筛选截图](evidence/group-directory-filters.png)记录实际界面，命令、结果与实际覆盖见[结构化验证](evidence/group-directory-filters-verification.json)。加载更多故障后的恢复实际经历自动单页轮询清除错误，再点击加载更多；不得改写为“点击重试成功”。QA API对组60关闭Agent后观察列表失效，不是在演示库执行该写入。现有flex布局检查正常，无CSS修改。

刷新恢复后整体替换为20项且排除组60。QA浏览器tab10已关闭、进程96324已停止（status=stopped、errors=[]），临时数据库删除查询为0。

main已从7990ddd ff到b6d7743，2026-09-30 22:47:25（北京时间）统一启动模拟器/API/Vite，父10600、模拟10602、API10603、Vite10604；schema6健康、控制台HTTP200，无新增迁移。[运行证据](evidence/group-directory-filters-rollout.json)记录备份`.runtime/backups/2026-09-30-before-group-filters`，PG归档66594字节且可列目录；停服前4类在途任务均为0。业务数据、4个群及两个模拟器文件保留。viewer只读冒烟前对照18表，其中17表哈希相同，仅auth_tokens变化；原154条token_hash均保留，1旧行仅used_at变化，重启恢复阶段新增2行，之后viewer登录又新增2行。这与正常认证生命周期相符，但没有观测到每次变化对应的具体浏览器，不宣称所有表或认证数据完全不变。

新IAB viewer只读看到默认4群，active+false为1群且无创建入口，未做业务写入；[演示截图](evidence/group-directory-filters-main.png)已保存，tab11关闭，用户Chrome未操作。当前入口及历史证据见[文档导航](README.md#代码与命令执行位置)。用户批准实施不等于用户已验收；本轮真实OS输入法操作、未列明浏览器细项继续保留未验状态。

原始需求SHA-256保持`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。
