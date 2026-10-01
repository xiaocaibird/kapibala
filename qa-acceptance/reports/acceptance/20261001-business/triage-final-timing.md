# 最终候选计时与容量异常独立归因

固定候选 `86ad4e7e63786f652c965308b032b98415bdd7ac`，运行 `2026-10-01T06-54-18.519Z-a1e23916`。只读核对冻结证据，没有运行产品或修改冻结QA/SUT。原机器结果保留；本表是归因补充，不能直接回填PASS。后续容量异常待实际完成再追加。

| 用例 | 原机器结果 | QA归因 | 产品严重度 | 核心依据 |
| --- | --- | --- | --- | --- |
| AGENT-025 | BLOCKED | BLOCKED / measurement-insufficient | 不登记产品缺陷 | 公开创建/终态区间为[60000,60138]ms，下界恰等于上限；不能证明严格超限，也不能证明未超过。 |
| AGENT-028 | BLOCKED | BLOCKED / measurement-insufficient | 不登记产品缺陷 | 下一turn携带SEND_TIMEOUT只给工具结果已存在的上界，5025–5101ms还含工具结果保存/下一轮调度/网络，缺结果产生的下界；不能据此认定五秒返回违约。 |
| CAP-002 | FAIL | BLOCKED / qa-timeout-classification-too-strong | 不登记产品缺陷 | 真实容量拒绝后关闭agent成功，30秒内仍running；原文规定当前步结束后取消但没有30秒取消SLA。普通Error不能独立证明永久不取消或迟发。 |
| CAP-003 | FAIL | FAIL / product-requirement-violation | S2 | 本例无重启；关联真实终态活动下界60010ms已经超过原60000ms预算。独立单调区间相交不矛盾，明确超限不是仅采样跨界。 |
| CAP-005 | FAIL | BLOCKED / qa-invalid-prerequisite | 不登记产品缺陷 | QA把creator suspended错当群unreachable。原要求仅移除终态账号及其队列后果；群主离开导致kick OWNER_LEFT而不自动改变群状态。实际没有GROUP_WRITE_FORBIDDEN。 |

## AGENT-025

失败位置：`tests/system/agent.spec.ts:105 (called at 802)`。依据：`docs/original-interview-question.md:258`、`cases/backend.json:AGENT-025`。

公开创建/终态区间为[60000,60138]ms，下界恰等于上限；不能证明严格超限，也不能证明未超过。

事实：`{"runId":"f8df8f7c-c384-4646-bb12-9a761faa70a1","timingIntervalMs":[60000,60138],"creationIntervalUtcEpochMs":[1790838827049,1790838827121],"terminalIntervalUtcEpochMs":[1790838887121,1790838887187],"finalStatus":"failed","endReason":"wall_clock","steps":8,"turnRequests":8,"lastTurnAt":"2026-10-01T07:14:43.306Z","audits":0,"gatewaySendRequests":0}`。

证据目录：[AGENT-025 artifacts](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-agent--AGENT-025-ru-6b311-budget-including-slow-turns-system)。重点文件：`evidence/wall-clock-window.json`、`evidence/api.ndjson:2174`、`evidence/api.ndjson:2176`、`evidence/external-facts.json`、`error-context.md`。

未证明的部分：原活动预算精确终止时刻；不能用不同CAP-003运行的时间替换本例区间。

后续最小处理：后续若需关闭本例计时阻塞，绑定同一run的真实活动生命周期见证，仍保留严格60000ms，不靠提高轮询频率或容差改PASS。

清理记录：`failures=[]`；这不补足因前置异常未运行的释放后断言。

## AGENT-028

失败位置：`tests/system/agent.spec.ts:905-909`。依据：`docs/original-interview-question.md:121`、`docs/original-interview-question.md:181`、`docs/original-interview-question.md:225`、`docs/original-interview-question.md:263`。

下一turn携带SEND_TIMEOUT只给工具结果已存在的上界，5025–5101ms还含工具结果保存/下一轮调度/网络，缺结果产生的下界；不能据此认定五秒返回违约。

事实：`{"runId":"0b52a9d4-75e8-4fed-a696-179cdcece02c","startBoundsUtcEpochMs":[1790838893881,1790838893957],"nextTurnObservedAtUtcEpochMs":1790838898982,"observationMinusPossibleStartMs":[5025,5101],"toolResultCode":"SEND_TIMEOUT","byClient503Count":49,"byClient200At":"2026-10-01T07:14:59.017Z","sameKeyResult":"sent","gatewaySendRequests":1,"gatewayActualMessagesForKey":1,"audits":1,"finalStatus":"finished","endReason":"final"}`。

证据目录：[AGENT-028 artifacts](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-agent--AGENT-028-un-e7c9e-ame-key-still-cannot-resend-system)。重点文件：`evidence/send-timeout-window.json`、`evidence/external-facts.json`、`evidence/api.ndjson:78`、`error-context.md`。

未证明的部分：send_message内部开始等待/返回结果的精确时刻；五秒上限不能记PASS。

后续最小处理：如补充工程观测，需真实工具等待开始/结果形成边界，不能把收到下一turn等同工具结果产生。保留本例已成立的SEND_TIMEOUT、查询恢复、一次审计/一次发送及同key现状返回证据。

清理记录：`failures=[]`；这不补足因前置异常未运行的释放后断言。

## CAP-002

失败位置：`tests/system/capacity-control.spec.ts:224 -> terminal:44-52 (30000ms default)`。依据：`docs/original-interview-question.md:266`、`requirements/catalog.json:ENG-ADMISSION-01`。

真实容量拒绝后关闭agent成功，30秒内仍running；原文规定当前步结束后取消但没有30秒取消SLA。普通Error不能独立证明永久不取消或迟发。

事实：`{"runId":"62bc7cff-0c87-42be-9a4f-ed96166e2435","disablePatchAt":"2026-10-01T07:15:18.700Z","disablePatchStatus":200,"agentEnabled":false,"lastRunReadAt":"2026-10-01T07:15:48.703Z","lastRunStatus":"running","recoveryNote":null,"turnRequests":1,"audits":1,"gatewayKickRequests":0,"gatewayKickEffects":0,"lastRefusalAt":"2026-10-01T07:15:48.717Z","lastRefusalCallbackEntered":false,"lastRefusalRemoteRequestCount":0,"leaseCleanupStatus":200,"leaseCleanupState":"released"}`。

证据目录：[CAP-002 artifacts](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-capacity-control--C-6c71d-deferred-kick-after-release-system)。重点文件：`evidence/capacity-refusal.json`、`evidence/api.ndjson:76`、`evidence/api.ndjson:1146`、`evidence/capacity-http-ed04d741-3642-4788-a788-e8d18caa3fb0.json`、`evidence/external-facts.json`、`error-context.md`。

未证明的部分：取消终态未形成；测试正常路径中的释放后1500ms持续无kick和引用清空断言未执行。finally释放成功不补足这些断言。

后续最小处理：后续QA版本区分观察预算耗尽与硬违约，并在释放后继续有限观察取消及迟发，保留原run身份、原预算和零未授权副作用标准；不能给研发新增30秒硬时限。

清理记录：`failures=[]`；这不补足因前置异常未运行的释放后断言。

## CAP-003

失败位置：`tests/system/capacity-control.spec.ts:330`。依据：`docs/original-interview-question.md:258`、`contracts/capacity-observation.md:18`、`requirements/clarifications.md:CL-03`。

本例无重启；关联真实终态活动下界60010ms已经超过原60000ms预算。独立单调区间相交不矛盾，明确超限不是仅采样跨界。

事实：`{"runId":"b812b9e7-5aba-4d52-a67c-c165be446c8d","terminalAt":"2026-10-01T07:16:53.065Z","terminalEventSeq":1844,"activeElapsedMs":[60010,60112],"independentElapsedBoundsMs":[59861.22225,60159.588500000005],"finalStatus":"failed","endReason":"wall_clock","turnRequests":1,"audits":1,"gatewayKickRequests":0,"gatewayKickEffects":0,"leaseCleanupStatus":200,"leaseCleanupState":"released"}`。

证据目录：[CAP-003 artifacts](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-capacity-control--C-4b677-without-resetting-the-clock-system)。重点文件：`evidence/capacity-active-budget.json`、`evidence/capacity-refusal.json`、`evidence/external-facts.json`、`evidence/capacity-http-461b0b11-6455-494d-a667-ecb8ebe130e1.json`、`error-context.md`。

未证明的部分：未观察到预算后真实kick；不能升级叙述为已产生预算外副作用。正常释放后有限无迟发分支因前述FAIL未执行。

后续最小处理：向研发报告严格活动预算违约并保留真实区间；修复后在新固定版本重测，不能裁剪活动值、补计时容差或以CAP001通过关闭。

清理记录：`failures=[]`；这不补足因前置异常未运行的释放后断言。

## CAP-005

失败位置：`tests/system/capacity-control.spec.ts:363-367; cases/architecture-capacity.json:435`。依据：`docs/original-interview-question.md:44`、`docs/original-interview-question.md:52`、`docs/original-interview-question.md:64`、`docs/original-interview-question.md:218`、`docs/original-interview-question.md:237`、`docs/original-interview-question.md:241`、`docs/original-interview-question.md:266`。

QA把creator suspended错当群unreachable。原要求仅移除终态账号及其队列后果；群主离开导致kick OWNER_LEFT而不自动改变群状态。实际没有GROUP_WRITE_FORBIDDEN。

事实：`{"runId":"4ed4f7e6-d6ea-4059-a86f-ff4724cc38aa","groupId":"7f28e50a-97f2-4e75-9030-35c188ecd8fc","terminalAccountEventAt":"2026-10-01T07:16:58.709Z","accountStatusEventId":5,"memberLeftEventId":6,"gatewayWritable":true,"remainingManagedMemberIds":["account-2","account-3"],"publicGroupStatus":"active","lastGroupReadAt":"2026-10-01T07:17:13.706Z","gatewaySendRequests":0,"gatewayKickRequests":0,"audits":1}`。

证据目录：[CAP-005 artifacts](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-capacity-control--C-5c31e-cancels-without-a-late-kick-system)。重点文件：`evidence/external-facts.json`、`evidence/api.ndjson:596`、`evidence/capacity-refusal.json`、`error-context.md`。

未证明的部分：群不可写前提从未建立；取消、主动释放后的无迟发及终态引用断言未执行。

后续最小处理：在新QA版本使用真实群不可写故障并通过受支持的发送/事件路径让SUT实际收到GROUP_WRITE_FORBIDDEN，确认对应消息身份和群状态后检验容量中的取消；不能修改产品让群主终态强制群不可写。

清理记录：`failures=[]`；这不补足因前置异常未运行的释放后断言。

各项为P0验收范围，优先级不等于产品缺陷严重度。AGENT-025/028的计量缺口不得通过隐含容差关闭；CAP-003明确超限不得被两条计量阻塞或CAP-002/005的QA问题冲淡。参见[强保证判定规则](strong-guarantee-rules.md)。

最终报告统一用S1/S2表示严重度；初始P1建议已保留在JSON的initialSuggestedSeverity，验收用例P0优先级不变。补充复测另表记录，不覆盖以上原始事实。
