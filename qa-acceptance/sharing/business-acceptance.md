# 完整业务验收入口

本入口实现 INT-FLOW-01：业务验收和上线评估分开执行、分别下结论。它不是开发短冒烟，也不提供自由筛选的“业务通过”。新增入口当前仅通过 QA 工具自身校验，尚未执行产品。

## 范围与三种执行阶段

| 入口                               | 授权 scope            | 范围与通过条件                                                                                |
| ---------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `npm run preflight -- --suite …`   | `developer-preflight` | 仅所选共享子集；结论不能变为正式验收                                                          |
| `npm run acceptance:business -- …` | `all-business`        | 当前 catalog 中全部 `required` 业务需求对应的全部非候选用例；每条的全部项目及人工义务均需完成 |
| `npm run acceptance -- …`          | `all-required`        | 原完整入口保持不变；业务和关键上线门禁均满足才可能无条件通过                                  |

业务范围自动从当前需求与用例生成，不能传 `--suite`、`--grep` 或项目参数。release-only 用例和候选不由该入口执行；同时关联业务与上线需求的用例仍进入业务范围，不能借多范围映射丢掉业务义务。若这种用例混合了必须分开的上线操作，应由 QA 拆分用例后重新冻结基线。

`manual` 与尚未解决的 `blocked` 业务用例保留在分母。自动化完成后没有人工证据，或任一必需浏览器、工程夹具、明确业务要求未完成，业务结论仍为 `INCOMPLETE`。不能用 PASS 数量或者开发预跑结果替代。

## 准备与独立授权

按根 README 准备独立固定候选、依赖、专属资源及变更评审。UI 场景仍需真实定位适配，容量/夹具专项仍需相应接入。仅业务验收不要求为了跑测试而虚填 release profile；目标中的 release 值可保持未确认 null。

下面两条只读 QA 配置和基线，不启动产品：

```sh
npm run hash:business
npm run hash:target -- --target config/target.local.json
```

另行取得负责人对**完整业务验收**的真实授权后，记录到 QA 临时目录下的授权 JSON（例如 `.runtime/authorization.business.json`）。必需字段沿用现有授权结构：

- `version: 1`、真实 `approvedBy` / `approvalReference` / `approvedAt` / `expiresAt`。
- `scope: "all-business"`，`businessSha256` 为 `hash:business` 输出；不带 suiteId/suiteSha256。
- 完整 `sutRevision`、真实 `sutDirectory`、规范化 `targetSha256`。
- `allowedActions` 包含 `start-isolated-sut`、`create-owned-database`、`fault-injection`、`kill-owned-process`、`browser-automation`。

全业务摘要包含业务需求、用例完整定义、人工与自动项目、执行选择参数。新增业务用例、调整预期或项目后会改变摘要，旧授权不得直接复用。目标参数变化同样重新绑定。当前六条 system 冒烟的授权不支持这个入口；本文不是执行授权。

正式命令：

```sh
npm run acceptance:business -- --target config/target.local.json --authorization .runtime/authorization.business.json
```

执行清单 `phase=business-acceptance`；报告保存在 `reports/runs/<run-id>/`，与旧完整报告共用归档根但有独立 run ID 与明确用途，不覆盖或升级旧预跑/验收报告。CLI、global setup 与每次环境授权均核对全部业务摘要；fixture 还会拒绝越出完整业务范围的用例/项目。

## 人工证据与结果解释

同一 run 下使用已有 `record:manual` 入口登记业务人工结果，要求真实执行时间、证据文件和审核人。release-only 人工用例不能写入业务运行；自动用例也不能手工填通过。未解决的 blocked 用例通过仍须附既有规则要求的正式澄清证明。

报告 JSON 新增 `businessAcceptance`：业务结论、完整业务摘要、需求/用例/项目数、逐项状态、范围外尝试和完整性问题。阅读版和 JUnit 仅以全部业务用例为主体；JSON `results` 保留完整 catalog，未运行的上线项继续 `NOT_RUN`。主统计 `metrics.primaryScope=required`，上线未执行数量不进入业务完成率。

- `businessAcceptance.verdict=PASS` 只表示该版本的完整业务验收通过。
- `conclusions.functionality` 与业务结论一致；`conclusions.release` 在本阶段固定 `INCOMPLETE`。
- `conclusions.unconditionalPass` 在本阶段始终 false，不代表全门禁或上线获准。
- 缺执行/人工/项目、BLOCKED、runner 异常、资产漂移、范围篡改等阻止业务 PASS；观察到业务违约记 FAIL。
- 范围外事件不会作为业务结果计数，会进入完整性错误；不能偷偷混跑上线项再声称这是已授权的纯业务验收。

CLI 只有全部业务结果通过且报告完整时退出 0。首次自动化后尚缺人工通常非零；人工完成后用既有 `npm run report -- --run …` 再生成阅读版与 JSON，保留原始自动化及人工审计记录，不回写旧自动化通过。最终业务结论以该 run 的完整报告为准。

新的业务入口不改变旧 `all-required`/`developer-preflight` 的参数、报告语义或已有原始记录。旧完整验收仍需业务和上线都满足，不能用业务 PASS 绕过其上线门禁。
