# 局部工程质量改进与验证

日期：2026-10-01（北京时间）。来源为[架构基线复核](architecture-reviews/2026-10-01-baseline.md)。用户明确要求按结论整理文档、执行优化；随后将收尾调整为自测后先交待评审分支，用户 review 并明确同意后才合回 main。

## 范围与状态

本批以 `cc5d3d2` 为集成起点，评审分支为 **`agent/architecture-quality-review`**。用户已完成本轮 review 并明确同意合并；**2026-10-01 已通过 fast-forward 合入 main（`3d7e4f4`），功能人工验收仍待进行**。各任务分支和提交保留。独立 QA 资产和原始需求不改；本批改变既有实现的局部行为，不改变外部服务协议。

| 项目 | 保证与反例 | 状态 |
|---|---|---|
| AR-04 执行容量 | 容量不足与实体锁冲突分开；未调用远端的 Agent 步骤可安全延期。验证槽位耗尽、释放后推进、取消和预算，不重放未知远端效果 | 已实现；定向及整合自动验证通过，用户已同意合并 |
| AR-08 共享请求契约 | 序列定义及变量限制使用同一 schema；保留服务端严格校验和有效输入行为，前端不静默接受/剥离不合法字段 | 已实现；自动与浏览器验证通过，用户已同意合并 |
| AR-09 读取失败恢复 | 没有后续事件或轮询时暂时失败仍可恢复；退避有界，永久错误不反复请求，旧代次不覆盖新页面 | 已实现；自动与浏览器验证通过，用户已同意合并 |
| AR-10 测试资源 | 重点旧夹具提前登记清理、复用正式迁移；初始化失败和重复清理都可回收资源，保留原业务断言 | 已实现；清理竞态反例及关联回归通过，用户已同意合并 |

## 关键机制与审查入口

1. **执行准入**：`Database.tryWithLock` 返回 `executed`、`capacity_unavailable` 或 `lock_busy`。原 `withLock` 包装继续供后台任务延期使用。只有确定未进入回调、未发远端请求的容量拒绝才延期；真实实体占用保持原业务错误。Agent 保留已有审计结果及工具步骤，每次最多等 50ms，并继续检查活动预算、取消与操作政策。它不重放已发出的 kick 或未知外部结果。
2. **请求契约**：[共享 schema](../packages/contracts/src/sequence-requests.ts)由服务端和两个序列 JSON 表单复用。名称 1–200（trim），步骤 1–200 且序号从 1 连续，文本 1–20000、延迟 0–604800，变量键与步骤键分别按现有服务端规则校验；对象严格拒绝额外字段。合法值、默认值、路由和运行 DTO 保持。
3. **读取恢复**：[resourceLoader](../apps/web/src/hooks/resourceLoader.ts)将请求、退避和失效通知集中到同一单飞控制器。网络错误及 408/500/502/503/504 最多追加 3 次读取，间隔 250/500/1000ms；鉴权、校验、响应格式、会话改变和 429 不自动重试。取消或切页终止旧等待，结果提交前及退避后核对会话代次；失败不生成成功快照。预算耗尽后允许新的显式刷新、事件或轮询再次发起一轮有界读取。该策略仅用于读请求。
4. **测试装配**：[temporaryDatabase](../tests/support/temporary-database.ts)在 CREATE 前登记清理，使用 UUID 库和正式迁移入口。重复 close 共用 Promise；个别清理失败仍继续回收其他资源，聚合错误明确失败。platform/gateway/automation 重点夹具同步登记服务、目录与环境变量恢复，不以删业务断言换通过。

## 版本与提交

| 内容 | 分支 / 提交 |
|---|---|
| 架构系列、原始/质量/增强关联与范围决定 | `agent/architecture-review-records`：`090a3cd` |
| 历史 A0 证据链接恢复 | `9f2a591`：从历史提交原样恢复到 docs/archives；不当作新实验，归档测试不加入当前测试发现 |
| 容量语义及 Agent 延期 | `agent/architecture-runtime-boundaries`：`4d1f57e` |
| 共享序列请求 / 读取恢复 | `agent/architecture-contract-resource`：`8f6b15b` / `17a4a96` |
| 重点夹具回收 | `agent/architecture-test-fixtures`：`5a35306` |
| 观察连接关闭竞态 | `agent/architecture-runtime-boundaries`：`c9fac1e`，仅一个测试夹具 |
| 整合验证 | 初次 `e45fc4a`；夹具修后全套 `0972229`；浏览器 `a17db82`。后两版产品源与构建版一致 |

建议先看上述四项产品/测试改动，再看文档及历史归档。可用 `git diff cc5d3d2..agent/architecture-quality-review -- apps packages tests scripts` 查看实现范围；文档单独对比 `-- docs`。历史归档占据较多新增行，不能把它算为本轮新增功能或测试通过数。

## 验证证据

完整元数据见[验证记录](evidence/architecture-quality-verification.json)。版本、范围及失败记录分别保留，不累加各套件计数。

| 检查 | 实际结果 / 依据 |
|---|---|
| 容量误报修前反例 | 旧产品代码、8 个槽位占满、零 kick 请求，却持久化 SEND_FAILED/SEND_TIMEOUT；[专项记录](evidence/architecture-runtime-verification.json) |
| 定向验证 | 新容量/Agent 准入 6 项、既有 Agent 6 项；前端完整 124 项；请求契约与 PG 7 项；夹具故障注入 5 项及 helper 消费者 28 项。专项不与整套相加 |
| 集成全套 | 夹具修后 `0972229`：**361/361，0 失败、0 跳过**，116.839 秒；开启三组真实计时开关，[最终日志](evidence/architecture-quality-final-tests.log)。初次 `e45fc4a` 的 361/361、113.127 秒[日志](evidence/architecture-quality-full-tests.log)保留，不累加计数 |
| 类型与构建 | `npm run build` 退出 0，含两端 TS 与生产 Vite；[日志](evidence/architecture-quality-build.log) |
| 独立浏览器 | `a17db82`、产品与 `e45fc4a` 相同：**7/7**，页面异常 0、清理错误 0。生产构建、UUID 库、随机端口、后台工作关闭、等待 WS 握手稳定后注入；[结果](evidence/architecture-resource-browser.json)、[截图](evidence/architecture-resource-browser.png) |
| 间歇失败及夹具修复 | 保留原 16/17 [失败日志](evidence/architecture-runtime-repeated-failure.log)。受控关闭延迟复现同类 57P01，改专用观察 Client 并等待实际关闭后通过，重复 5 次及两轮 17/17 通过；[时序与证据边界](evidence/architecture-observer-shutdown.json)、[探针及原始输出归档](evidence/architecture-observer-shutdown-evidence.tar.gz) |
| 原始需求 | SHA-256 仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75` |

浏览器七项分别为：两次 503 后自动呈现、403 不自动重试、暂时失败最多四次请求、离页取消重试、额外字段阻止 POST、步号不连续阻止 POST、合法定义一次保存。没有新事件或序列轮询作为成功前提。首轮脚本在四项通过后因文本框精确 label 定位超时，修正为实际可访问文本框名称后重跑；[失败记录](evidence/architecture-resource-browser-initial-failure.json)保留，不归为产品缺陷。

连接收尾调查中，自然观察 30 次未失败，但均存在 pool.end 先返回的时间窗口；30ms 关闭延迟注入稳定复现同类未处理错误。修复后实际连接关闭先于 DROP，不吞错误。此前失败现场没有时序记录，不能断言所有可能成因均已排除；业务 Database 池在清理附近仍有已处理的 idle_connection_error 日志，本批不宣称消除所有关闭日志。

## Review 时重点判断

| 项目 | 重点判断 | 证据 |
|---|---|---|
| AR-04 | 延期前是否确实零远端调用；延期是否重复审计；取消/预算是否仍生效 | 修前反例、agent-capacity 与 lock-admission 测试、工具状态转换 |
| AR-08 | 前后端是否复用同一严格规则；合法定义是否仍可保存；变量与步号边界是否一致 | sequence-requests、sequence-request-contracts、浏览器后三项 |
| AR-09 | 没有新事件也能恢复；永久错误与耗尽有界；切页或换身份不能应用旧结果 | resource-recovery、浏览器前四项；身份边界为自动测试，未声称新做跨标签实验 |
| AR-10 | 初始化中途失败能否清理；重复关闭是否安全；错误是否被保留 | temporary-database/platform 故障注入及观察连接关闭时序 |

用户已 review 同意，代码已合 main。本次仅执行合并与记录，没有统一重启本地服务：后端仍是原启动进程；Vite 读取 main 源码，前端可能热更新。不要把本次代码合并当作前后端已统一切换的运行验收；后续统一重启并复验后另记运行证据。

## 验证与交付规则

本批定向与集成验证使用专用临时 PostgreSQL 容器（端口 50033）和隔离数据库，没有在演示库（55432）注入故障。最终核查临时业务库、额外 schema、活动连接均为空；浏览器和随机端口服务已关闭，测试容器已停止。自测结束时 main 为 `cc5d3d2` 且干净；本次用户同意后已合至 `3d7e4f4`，无冲突、工作区干净，未执行迁移或重启服务。原始文件哈希保持不变。

可以在独立集成分支合入子分支做回归；未经本轮 review 同意，不合 main、不切换现有演示。后续获准合并前检查工作区及并行变更，保留其他任务提交。本批不运行独立 QA 的整套验收、不代替其结论。代码完成与运行版本分别说明，未经用户验收不填写人工通过。

## 仍需另行评估

未知外部效果的强恢复、事件接收与应用解耦、全历史快照和回放水位、生产身份、WS 背压与诊断体系、跨模块事务重构、多标签认证仍按[基线边界](architecture-reviews/2026-10-01-baseline.md)及既有 CG/PI 记录。它们不被本批四项局部改动自动关闭。

持续容量耗尽仍消耗既有活动预算；容量拒绝后、步骤恢复 ready 前进程硬中断，仍可能保守暂停，不声称关闭 CG-05。新读取重试也不证明任意页面在任意规模下满足 B4 的 3 秒显示时限。当前通过结果只覆盖列明的用例和环境。

## Review 后合并记录

用户明确表示本轮 review 无大问题并要求合回 main，满足 D036 的合并门槛。合并前核对主工作区与候选工作区干净、main 为候选祖先；实际执行 `git merge --ff-only agent/architecture-quality-review`，从 `cc5d3d2` 前进到 `3d7e4f4`。产品树与已构建及全测来源一致，不重复宣称新跑测试。合并的版本与保护检查见[结构化记录](evidence/architecture-quality-main-integration.json)；此前自测记录保留当时“尚未合并”的历史事实。
