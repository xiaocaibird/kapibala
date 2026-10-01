> 当前阶段：已获得第二轮实际执行授权，见 `config/execution-scope.json` 和 `requirements/current-execution.md`。以下旧准备期说明保留其历史含义；不得用它覆盖后续真实授权。当前共 112 条，旧准备报告的 111 条是当时快照。

实际入口（在 QA 根目录运行；必须指定干净独立 SUT 和完整提交）：

```sh
PLAYWRIGHT_BROWSERS_PATH=/absolute/owned/browser-cache node --import tsx second-round/harness/runner.ts --sut /absolute/isolated/sut --revision FULL_COMMIT_SHA
```

入口冻结授权、完整范围和目标摘要，先执行冒烟子集，再执行其余用例；首次失败不自动重试。结果写入 `second-round/reports/runs/<run-id>/`；每轮保留 MD/JSON/JUnit、逐例原始证据和资源清理。真实付费模型与生产评估不在本入口范围。`--cases ID1,ID2` 仅用于独立复测批次，报告其余项保持 NOT_RUN，不替代全量结果。 `--browser chromium|firefox|webkit` 为不同引擎分别创建绑定目标和证据的批次；`--headed` 使用实际有头浏览器观察自动焦点行为，不能代替真人 IME／系统焦点签字。

# 第二轮独立 QA 准备

本目录只在 `agent/qa-second-round-preparation` 分支准备。范围为原 C1/C2 与 D050 批准的全部五项 P0、五项 P1；D051 只授权提前准备。所有产品结果为 **NOT_RUN**，第二轮产品执行、真实模型调用与合入 main 均未获授权。开发候选是材料输入，不能自动成为正式被测版本。

第一轮报告及冻结源继续保留。第二轮采用独立 overlay，不改变原全局目录中的候选范围，也不重写旧通过率、缺陷或签发结果。

## 阅读入口

- [来源和条款](requirements/README.md)、[冻结基线](requirements/baseline.json)、[原子条款](requirements/catalog.json)、[追踪矩阵](requirements/traceability.md)。原始需求与批准差异分别标识；实际公开接口补充用于定位和取证，不自动豁免批准要求。
- 用例维护源：[媒体及模型](cases/c1-c2.json)、[前端流程](cases/enhancements-ui.json)、[后台和交付](cases/enhancements-backend.json)。可读版位于 `cases/generated/`。每条包含前提、数据、操作、故障时点、预期、时间、证据和清理。
- [计划冒烟子集](config/smoke-selection.json)引用同一份正式用例，区分交接预检、离线业务冒烟与完整验收；不是产品执行入口。
- [准备报告](reports/preparation/report.md)、[JSON](reports/preparation/summary.json)、[NOT_RUN JUnit](reports/preparation/not-run.junit.xml)、[独立设计复核](reports/preparation/review.md)。准备自测通过只证明 QA 资产，不产生产品通过结论。
- [公开契约映射](requirements/contract-mappings.json)、[接入缺口](requirements/integration-gaps.md)、[依赖状态](requirements/dependencies.json)、[窄语义差异](requirements/contract-conflicts.json)。合同材料可得与实际驱动完成分开登记。

## 自动化及适配状态

`tests/ui-flows.ts`、`tests/media-provider.ts` 包含独立操作与断言，使用 `contracts/` 中的操作驱动。驱动必须通过真实公开页面、协议、文件及外部账本取得事实；不能返回“通过”标记、读取业务私有状态或替换工具结果。产品操作不在模块导入时运行。

这些接口尚未接为真实工程/Playwright/媒体/provider 连接器，**不能称第二轮自动化执行已 ready**。`automated-driver` 表示已写独立动作和断言；`manualCoverage` 标明函数尚未实现的子义务。手工及既有回归条目仍提供完整步骤，不以入口引用继承历史 PASS。完整执行须在最终候选与许可到位后完成驱动绑定及逐条选择核对。

未来适配必须验证候选、QA、配置与资源归属，为每次调用和请求等待设置有限诊断预算，缺前提记 BLOCKED，不引入新业务 SLA。实际响应屏障必须绑定真实请求；迟到、错误与未知的计划保留原副作用事实。断言失败不能被清理错误覆盖，外层 fixture 负责异常或崩溃后的自有资源回收。不得通过删未知 owner.lock、盲重发或重置数据制造恢复通过。

媒体默认 30 天及活跃引用保护不变；服务端路径不扩成浏览器下载或模型附件功能。模型离线替身、服务自身协议和真实 provider 验证分别统计；缺失用量为未知，真实 0 与缺失不同。失败用量的来源差异已按 5a53cc8 文档窄澄清独立核对：调用结果与用量已知性分开；成功 HTTP 中已取得的合法用量不因后续输出校验失败丢弃，非成功 HTTP 路径当前仍未知。旧快照和差异记录保留。P1 查询规模只用于测量，不是新增生产性能 SLA。

## 准备期命令

在 `qa-acceptance/` 使用 Node 24 及原独立锁文件：

```sh
npm ci --workspaces=false --ignore-scripts
npm run typecheck -- --project second-round/tsconfig.json
node --import tsx --test second-round/tests/self/*.test.ts
python3 second-round/harness/prepare.py
```

以上只运行静态验证与 QA 自有替身/断言的自测，不启动或连接 SUT、业务数据库、用户浏览器或真实模型。`prepare.py` 核对冻结 Git 原字节、条款与用例双向映射、真实导出入口、依赖和分支边界，并生成全 NOT_RUN 清单。缺项直接失败，未接驱动不会静默跳过成 PASS。

本阶段不提供可自动启动第二轮产品的命令。后续审阅、执行授权和候选冻结到位后，再核对实际连接器、短冒烟子集、全量业务及差异回归和证据输出。上线评估仍单列；真人 IME/系统焦点不由自动化代签。
