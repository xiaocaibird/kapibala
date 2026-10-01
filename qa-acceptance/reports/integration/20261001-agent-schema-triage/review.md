# Agent schema 共因分诊与 QA 修正

取证截至 2026-10-01T06:36:22.355896+00:00；原始 run `2026-10-01T06-10-21.458Z-1fdb6180` 仍在执行，以下是本次只读快照，不冒充最终全量结果。

## 结论

此批 TOOLS_INVALID 是 QA 桩 dialect 接入错误。原始需求 2.1（docs/original-interview-question.md:88）要求合法 JSON Schema，未限定 draft-07；公开请求声明 2020-12。默认 Ajv 校验抛 `no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`，QA catch 返回 false，统一回 400。脚本计划、延时、审计和屏障均未消费。原产品按连续三次 BAD_JSON 失败与这些记录一致；这些下游失败不能归为产品未执行原脚本要求。

同一份已脱敏真实 turn 请求，离线只回放至新建本地 QA Agent 桩：修正前复现不支持元 schema；修正后 HTTP 200 并消费指定脚本；人为破坏 minimum 类型后仍 HTTP 400，且不消耗计划。完整证据见 `offline-replay-proof.json`。未启动或连接 SUT/数据库。

## 修正范围

- harness/agent.ts：声明的 draft-07/2019-09/2020-12 各由相应本地元 schema 校验；无声明保持既有 draft-07。没有删 $schema、没有联网抓任意 schema、没有放过畸形声明。
- tests/self/simulators.test.ts：四类 dialect 的合法/非法、未消费计划、未知声明拒绝回归。
- contracts/simulator.md：明确能力边界；未知 dialect 的拒绝单独评估 QA 接入能力，不能仅凭拒绝认定产品 schema 非法。

typecheck PASS；simulator selftests 23/23 PASS；diff --check PASS。冻结运行源码、配置、结果全部未修改。

## 已观察的影响范围

当前已有 55 个产物目录记录到本共因；完整逐项路径、请求数、原始错误和原始状态见 `affected-cases-observed.json`。

| Case | 首轮原始状态 | TOOLS_INVALID / turns |
|---|---|---|
| GROUP-010 | FAIL | 3 / 3 |
| EXT-009 | FAIL | 3 / 3 |
| API-001 | PASS | 3 / 3 |
| AGENT-001 | FAIL | 3 / 3 |
| AGENT-002 | FAIL | 3 / 3 |
| AGENT-003 | FAIL | 3 / 3 |
| AGENT-004 | FAIL | 3 / 3 |
| AGENT-005 | FAIL | 3 / 3 |
| AGENT-006 | FAIL | 3 / 3 |
| AGENT-007 | FAIL | 3 / 3 |
| AGENT-008 | FAIL | 3 / 3 |
| AGENT-009 | FAIL | 3 / 3 |
| AGENT-010 | FAIL | 3 / 3 |
| AGENT-011 | FAIL | 3 / 3 |
| AGENT-012 | FAIL | 3 / 3 |
| AGENT-013 | PASS | 3 / 3 |
| AGENT-014 | FAIL | 3 / 3 |
| AGENT-015 | FAIL | 3 / 3 |
| AGENT-016 | FAIL | 3 / 3 |
| AGENT-017 | FAIL | 3 / 3 |
| AGENT-018 | FAIL | 3 / 3 |
| AGENT-019 | FAIL | 3 / 3 |
| AGENT-020 | FAIL | 3 / 3 |
| AGENT-021 | FAIL | 3 / 3 |
| AGENT-022 | FAIL | 3 / 3 |
| AGENT-023 | FAIL | 3 / 3 |
| AGENT-024 | FAIL | 3 / 3 |
| AGENT-025 | FAIL | 3 / 3 |
| AGENT-026 | FAIL | 3 / 3 |
| AGENT-027 | FAIL | 3 / 3 |
| AGENT-028 | FAIL | 3 / 3 |
| AGENT-029 | FAIL | 3 / 3 |
| AGENT-030 | FAIL | 3 / 3 |
| AGENT-031 | FAIL | 3 / 3 |
| AGENT-032 | FAIL | 3 / 3 |
| AGENT-033 | FAIL | 3 / 3 |
| AGENT-034 | FAIL | 3 / 3 |
| AGENT-035 | FAIL | 3 / 3 |
| AGENT-036 | FAIL | 3 / 3 |
| CAP-REG-004 | FAIL | 3 / 3 |
| CAP-REG-002 | FAIL | 3 / 3 |
| CAP-REG-001 | FAIL | 3 / 3 |
| CAP-REG-003 | FAIL | 3 / 3 |
| CAP-006 | FAIL | 3 / 3 |
| CAP-010 | FAIL | 3 / 3 |
| CAP-008 | FAIL | 3 / 3 |
| CAP-009 | FAIL | 3 / 3 |
| CAP-003 | FAIL | 3 / 3 |
| CAP-005 | FAIL | 3 / 3 |
| CAP-002 | FAIL | 3 / 3 |
| CAP-001 | FAIL | 3 / 3 |
| CAP-004 | FAIL | 3 / 3 |
| CAP-007 | FAIL | 3 / 3 |
| BLK-EXT-004 | FAIL | 3 / 3 |
| BLK-EXT-005 | FAIL | 3 / 3 |

原始 PASS 中受此输入污染的条目：API-001, AGENT-013。AGENT-013 原来只断言不超过 12 步，因此 3 次协议错误也能表面通过，并未验证重复读工具的场景；应撤销其有效场景证据资格并显式重测。开发树现已补上实际 get_recent_messages 工具步骤、tool_result 历史及第二个合法同参响应的前提断言；保留重复调用处置自由及原 <=12 断言。冻结首轮结果不改写。API-001 首轮格式断言本身仍有观测，但 Agent 分支仅产生 protocol_error，不能代表正常工具步骤结构覆盖；开发树现安排合法 read→final，并检查成功 tool_use/final 步骤后采结构契约。

## 重测建议

先用 AGENT-001 + AGENT-023 确认正常工具/结束协议；再完整 AGENT-001..036（包含原 PASS 的 013）及受影响 GROUP-010、EXT-009、API-001、CAP-001..010、CAP-REG-001..004、BLK-EXT-004/005。后续仍会依赖同桩的 REC-006/007、INT-ACT-001、Agent 相关时序与 UI-007/008/034 也不能沿用旧环境结论。主任务已计划新冻结 QA/候选后整轮重新执行，这能同时覆盖运行尚未到达的相关条目；不要运行中换桩或静默重试覆盖原始首轮结果。

本报告未发现能从这些 TOOLS_INVALID 下游错误独立确认的产品缺陷；修复桩后仍需真实验收，不把修正 QA 工具等同于产品通过。

## 目标场景前提补强

经主任务明确授权，开发树补充 `tests/system/agent.spec.ts` 的 AGENT-013，以及 `tests/foundation/contracts.spec.ts` 的 API-001；同步 `cases/backend.json`、`cases/foundation.json` 及两份对应 generated 阅读版。两例既有业务预期与最大步数规则保持不变，只保证实际进入原目标场景。

AGENT-013 允许产品按自己的策略处理第二次同参读取，不要求第二次一定成功或固定终止原因；但必须证明第一次读成功、有 tool_result 历史，并且桩确实返回第二个合法同参工具请求。API-001 显式采集成功工具步骤及 final，不能让 unrelated protocol_error 替代其结构样本。

校验：typecheck PASS；check:catalog PASS（128 项需求、266 用例）；目标 diff --check PASS。未执行产品，后续以新冻结 QA 的独立运行生成结论。
