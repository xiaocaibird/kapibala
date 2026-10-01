# 独立 QA 验收体系

本目录维护需求追踪、用例、独立协议桩、自动化脚本和报告工具。**2026-10-01 已按用户授权完成隔离联调、完整业务基线和补充复测，并签发报告：业务验收不通过，上线评估未执行。** 86ad同版本审定236 PASS /8 FAIL /10 BLOCKED；后续a6b资料修复11项独立复测通过、关闭1个缺陷。原13项工程接入已全部取证，仍有6个相对原要求未闭合的缺陷，其中5项工程处理方向已由负责人确认（不等于技术PASS），无崩溃60秒问题及10项证据阻塞另列。产品版本、QA版本及各轮范围在报告中分别记录。

## 阅读入口

- **[e85候选补充复测报告](reports/followup/20261001-e85ae61-retest/report.md)**：本轮30条唯一用例最新24 PASS / 3 FAIL / 3 BLOCKED，首次29条及修正后复测分别留档。两条严格60秒及一条严格5秒仍失败；不替代下方完整业务报告，不外推后续C1/C2候选或上线结论。

- [七项工程补证与三项真人体验](requirements/evidence-followup/README.md)：负责人已授权的后续接入；新候选、观测与正式人工运行分别绑定。[本次交付与体验收尾记录](reports/followup/20261001-seven-blockers/report.md)。准备和工具校验不改变原报告结论。

- **[已签发完整业务验收报告](reports/acceptance/20261001-business/report.md)**：[逐项审定](reports/acceptance/20261001-business/adjudicated-baseline.md)、[缺陷](reports/acceptance/20261001-business/defects.json)、[需决策与补证项](reports/acceptance/20261001-business/pending-decisions.json)。按报告绑定版本解读；后续固定候选补充复测单列，不覆盖原始结论。

- [工程接入候选接收记录](requirements/engineering-candidate-intake-20261001.md)：新候选0af6443的版本和证据核对；当时工程已交付与QA实际接入分别记录，后续修复/复测见正式报告。

- [下一轮专项准备与交接](requirements/next-integration-preparation-20261001.md)、[完整业务验收入口](sharing/business-acceptance.md)：风险组合补强及仍需真实工程接入的边界；上线评估继续单列。

- [首轮隔离联调报告](reports/integration/20261001-smoke.md)、[证据索引](reports/integration/20261001-smoke-evidence.json)：六条首轮通过、完整证据及资源清理；不构成正式验收。

- [开发交接接收与首轮联调](requirements/integration-intake-20261001.md)、[候选风险与剩余覆盖准备](requirements/integration-risk-review-20261001.md)：固定993f758；六条 system 冒烟已执行通过，当时原13项接入仍待完成；现已全部取证，见正式报告。

- [原24条设计阻塞复核](requirements/blocker-reassessment.md)：准备期历史快照：当时13条工程依赖与11条script-ready分开记录；不能作为当前接入/决策状态，当前以正式报告为准。
- [普通序列失败裁定](requirements/sequence-failure-policy.md)：用户已批准普通发送失败使整条运行failed、后续不发送；保留原跳过、限流等待、结果确认及群不可写停止规则。
- [共享用例与开发提测入口](sharing/README.md)：QA 维护一份标准，开发只读选取预跑，报告与正式验收隔离。
- [本轮方案影响评估](requirements/architecture-impact.md)、[横向风险覆盖复核](requirements/risk-coverage-review.md)、[跨职责交接流程](requirements/collaboration.md)。
- [需求基线与来源](requirements/baseline.json)、[逐项需求](requirements/catalog.json)、[需求—用例追踪](requirements/traceability.md)。
- [用例格式与分组](cases/README.md)，人工可阅读 `cases/generated/` 中各分组 Markdown；JSON 是维护源。
- [已确认与待澄清口径](requirements/clarifications.md)、[上线门禁](requirements/release-gates.md)。
- [独立外部协议桩](contracts/simulator.md)、[公开响应契约](contracts/public-api.ts)。
- [工具生成的准备快照](reports/preparation/acceptance.md)、[准备JSON](reports/preparation/results.json)：不代表最新产品测试结果。

范围为原始 A/B 与已明确批准的追加需求。C1 媒体、C2 真实模型只列候选；浏览器自动化为本次 QA 的交付方法。消息分页采用固定遍历集合及实时合并，leave-all 比较服务账号成员投影。未知语义保留阻塞，不能从当前实现反推预期。

## 独立性与执行阶段

用例与断言来源于需求、公开接口及已确认变更。测试不导入业务代码、业务类型、现有测试或现有模拟器。只读取启动清单等必要外部配置；Gateway 和 Agent 有独立事实账本，能核对真实外部消息数量、成员变化、请求次数和历史。

准备阶段允许：TypeScript 检查、用例追踪检查、用例注册清单、独立协议桩与报告器自测。它们不会进入 SUT fixture。`test:self` 只用本进程创建的模拟器／临时本地服务器，不运行产品或真实 PostgreSQL。

每次产品执行须核对有效的用户授权及冻结候选提交。本轮已获全权执行至报告的明确授权，授权及各轮绑定清单随原始报告留存。授权 JSON 只是记录和防误操作闸门，不会验证授权人身份，也不能替代你的实际授权。当前示例的 REQUIRED 字段无效，不能用来执行产品。

全部 QA 资产和运行报告留在本目录。产品源码和原始需求不因测试准备而改变。QA 分支独立提交，按明确授权合回 main；不自动推送。

## 准备期复核命令

在本目录执行，Node 24；依赖按独立锁文件安装：

```sh
npm ci --workspaces=false
npm run verify:tools
```

`verify:tools` 依次执行类型检查、QA 工具自身测试、用例注册检查、变更评审登记检查、共享子集登记检查、可读用例生成和准备报告生成，并将日志与摘要保存在 `reports/preparation/tooling/` 和 `tooling-verification.json`。也可以分别运行 `typecheck`、`test:self`、`check:catalog`、`check:impact`、`check:suites`、`render:cases`、`prepare:report`。

`check:catalog` 会使用 Playwright 的 `--list` 检查已注册用例与项目映射，**不执行测试 fixture**。`prepare:report` 只生成 NOT_RUN 状态清单，不能用于产品验收签署。依赖安装安全策略提示被禁用的 install scripts 时，先验证现有工具能否正常运行，不通过开启全部脚本绕过。

## 授权后的环境准备

1. 先完成变更影响评估并登记到 `requirements/change-reviews.json`。验收入口会比较候选与已评审版本；涉及产品、契约、启动或关键需求文档的未评审变化会在启动前记为 BLOCKED。检查通过仅表示变化已被审阅，不证明用例充分或产品通过。然后从开发完成的候选提交建立专用 SUT 工作树，保持产品文件干净。不要使用主演示 checkout、其 `.runtime`、数据库或用户浏览器。配置 `sut.cwd` 指向该独立目录，`sut.revision` 为完整 SHA。QA 脚本位于本目录，SUT 版本与 QA 版本分别记录。
2. 开发方提供可直接运行的依赖／构建、迁移和启动命令。配置中的默认命令仅来自 main 的启动清单；实际发布构建若不同，需使用候选自身的启动命令。不会自动安装到或重写产品工作树。启动命令和环境须由交付者确认；这里的资源归属检查不构成针对任意恶意产品代码的操作系统网络沙箱。
3. 在 `config/target.local.json` 中填写目标配置，至少提供四个初始服务账号以执行多成员选择场景。账号数量是测试数据前提，数量不足记 BLOCKED，不修改原文“数量自定”的约定。
4. 安装测试浏览器到 QA 临时目录，并确认本机 Docker、`lsof`、`ps` 可用。数据库用原工程声明的 PostgreSQL 17 镜像；专用容器随机 loopback 端口，不使用默认数据库连接。

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.runtime/browsers" npm exec playwright install chromium firefox webkit
```

5. 通过实际可见页面确认 `ui.routes` 与 `ui.selectors` 后设置 `adapterConfirmed=true`。这些是定位适配，不是对 DOM 属性、页面路由或 UI 库的产品要求。模板中的 `data-qa`/`data-testid` 只是占位定位方式；不要求开发为测试改业务代码。定位缺失先修适配，不降低业务断言。真实 OS 输入法、系统标签栏焦点和主观可读性另有人工用例。
   旧版本库和微秒分页还须按 [制品接入](contracts/fixture-artifacts.md) 提供独立期望及双哈希归档；容量专项须按 [容量接入](contracts/capacity-observation.md) 提供实际工程控制器。当前模板、解析器和客户端不等于这些外部依赖已经交付。
6. 涉及上线评估时填写批准的上线 profile 和指标；完整业务入口不要求虚填这些值。负载脚本的固定混合为账号／群／消息读取及发送各 25%，外部依赖为独立模拟器；报告只对这个拓扑与负载成立。不能拿本地模拟结果代替生产目标环境的容量证明。`durationSeconds`、`soakSeconds`、并发、p95、错误率、RPO／RTO 均不提供武断默认值。
7. 计算目标配置摘要，将后续真实授权记录到 `config/authorization.local.json`；目标、命令、环境或 UI 适配变化后重新记录对应摘要。

```sh
npm run hash:target -- --target config/target.local.json
```

复制示例仅是开始填写配置，不构成授权。真实 key／生产网关／真实 Agent URL 不属于本次模拟器验收路径；C2 与外部费用仍需另行明确。

## 开发预跑（共享标准）

`developer-smoke` 只用system，不要求安装浏览器、确认UI定位或填写上线profile。经登记确认仅含system的预跑无需browser-automation授权；它仍需独立启动、专属数据库、QA桩延迟/重复故障和自有进程清理权限。项目选择与摘要由入口复核，不能靠环境变量声明来缩小授权。

开发先完成自己的单元/集成测试，再按变更选择 QA 的短冒烟或相关回归。预跑需另行获得产品执行授权，不能以本次资产建设授权代替。已由 QA 执行一次授权的 developer-smoke 联调，结果见首轮报告；开发自己的预跑不由此代为完成。标准由 QA 维护，开发按入口读取；问题反馈与交接见 [共享说明](sharing/README.md) 和 [协作流程](requirements/collaboration.md)。

以下两步只读 QA 资产，不启动产品，可在准备期使用：

```sh
npm run check:suites -- developer-smoke
npm run hash:suite -- --suite developer-smoke
```

实际预跑沿用上面的独立 SUT、冻结配置及资源归属要求。取得对应执行授权后，填写 `config/preflight-authorization.local.json`（[示例](config/preflight-authorization.example.json)）；scope 为 `developer-preflight`，suiteId 与 suiteSha256 绑定具体子集，targetSha256 仍绑定完整目标配置。正式验收授权与预跑授权不互换，子集/配置变更须更新对应授权记录。授权文件只是防误操作记录，不是身份验证。

```sh
npm run preflight -- --suite developer-smoke --target config/target.local.json --authorization config/preflight-authorization.local.json
# 本轮变更回归使用 architecture-regression，并填写与它匹配的独立授权记录。
```

预跑仅引用既有用例和断言，不接收额外 grep 或任意命令。结果写入 `reports/preflight/<run-id>/`：冻结子集、所选项目、选择参数和摘要；未选用例在全量 JSON 中继续 NOT_RUN。退出码 0 仅表示该子集每个要求的用例/项目组合均通过且无完整性错误；缺项、阻塞、失败或执行器错误为非零。开发报告明确标为预跑，正式需求符合性与上线准备度不作通过结论，不能导入正式验收作为已执行证据。原完整验收入口始终完整执行；仅业务验收使用新的 `acceptance:business`，仍自动纳入全部业务必验项，详见[业务入口](sharing/business-acceptance.md)。报告再生成同样核对用途、冻结子集摘要和批准记录，须使用该运行对应的 QA 资产；不会因为改名、删去缺跑项目或覆盖执行器摘要而升级结论。

## 执行及取证

仅在取得对应完整范围执行授权后运行。业务与上线分开时使用：

```sh
npm run acceptance:business -- --target config/target.local.json --authorization .runtime/authorization.business.json
```

业务和上线门禁同时执行的原入口：

```sh
npm run acceptance -- --target config/target.local.json --authorization config/authorization.local.json
```

默认完整执行且不自动重试。系统用例、Chromium 完整 UI、Firefox/WebKit 的 `@compat` 冒烟分别登记。每个用例使用独立数据库、模拟器、候选进程；第二实例与故障注入使用同一用例持有的资源。应用重启保留数据库和外部服务事实；不通过重置模拟器掩盖副作用。

执行目录为 `reports/runs/<run-id>/`，保存：

- `manifest.json`：候选与 QA 版本、源码摘要、配置／授权摘要、时间及依赖锁哈希。
- `events.json`：每项目每次实际执行结果；`results.json`：按完整用例基线汇总。
- `acceptance.md`、`junit.xml`：阅读版和工具集成版结果；JUnit skipped 的解释以 JSON 中 BLOCKED／NOT_RUN 为准。
- `artifacts/`：脱敏 HTTP 记录、Gateway/Agent 请求与副作用账本、故障标记、服务日志、浏览器截图及失败 trace。
- 人工核验与复测记录：原自动化结果保留，不能手工把自动化失败改成通过。

终止或清理失败不掩盖原始结果。清理只针对本轮创建且仍能确认归属的资源；不要用按端口杀进程、删除默认库等命令补救。备份演练的临时数据库归档不会进入公开报告；报告保存校验值、恢复结果与时间证据。

## 人工结果与复测

人工用例必须记录实际步骤、实际结果、操作者、执行时间和当前 run 内的证据。按 [示例](config/manual-review.example.json)填写后导入：

```sh
npm run record:manual -- --run reports/runs/<run-id> --input path/to/review.json
npm run report -- --run reports/runs/<run-id>
```

业务待决项须有明确裁定；工程依赖须有实际接入证据，不能互相替代。原先自动化的用例必须用自动化复测。复测使用新 run 目录，记录关联缺陷与修改版本，不覆盖原报告；未重新执行的用例不得直接继承此前通过状态。

## 验收结论规则

`PASS`：当前版本实际执行，全部预期有证据。`FAIL`：明确需求被违反。`BLOCKED`：环境、契约、数据夹具或测量能力不足以判定。`NOT_RUN`：未执行或未完成要求的浏览器项目。候选项单独统计。

覆盖率、执行率、通过率分别计算。自动化全绿不表示人工、协议阻塞或上线门禁已完成；CLI 对不完整验收使用非零结果提示。报告分别给出需求符合性和上线准备度；全部必验项通过且无关键门禁缺证据，才能无条件通过。

强保证的缺口不藏在测试桩里：send 未取得明确504的崩溃窗口、建群无幂等操作ID、kick后再入群均有可执行反例与外部账本；明确违约记 FAIL，观察不足记 BLOCKED。Agent丢失且尚未执行的响应可以在重试时变化，原协议不要求逐字重放。有限故障窗口实验不能证明任意时刻数学上的恰好一次。

计时不擅自增加业务容差。无法准确观测创建、收讫或完成时刻时保存时间区间；区间跨越门槛则记录测量不足，不把轮询误差折算成放宽后的通过标准。

## 维护方式

新增需求先登记来源和验收口径，再追加用例与自动化。每个自动用例必须有 `[用例ID]` 测试标题，与 JSON 的 `automation`、浏览器项目一致。不要给失败加自动重试、删断言或静默 skip 来获得通过。修改后运行准备期复核命令，检查最终 diff 仅涉及本目录。

空 schema 拒启用例先验证已迁移的对照库可以正常启动；空库退出若无法从诊断证据确认由 schema 导致，则记 BLOCKED，需人工确认，不能把任意启动错误算作通过。非空旧版本 schema 另需受版本管理的历史夹具。

上线自动化只对批准的闭环负载、低速持续运行和静态样本备份恢复演练提供证据，不能替代生产容量、长期稳定性或持续复制证明。

候选 993f758 的六条 system 联调已执行通过，原始范围和证据见首轮报告。新增专项及浏览器端到端尚未试跑；后续按具体执行范围检查环境接入，适配问题、产品失败与需求阻塞分别记录。
