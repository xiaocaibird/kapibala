# 8e047 候选：四项预算与时序独立证据审定

审定时间：2026-10-01T15:42:25.981823+00:00。四项审定与本轮首次原始结果一致：**3 PASS / 1 FAIL**。AGENT-028 的真实等待下界仍超出 5000 ms；其他三项在各自已触发场景内满足 60000 ms 上限。

本记录绑定 SUT `8e047aea842bfcec64802e4918b52b460b93c48b`、QA `02ea807faed44ebaed8a41741f4056de8e04e87a`、run `2026-10-01T15-22-40.633Z-4281d669`。本轮 manifest 的阶段是 **developer-preflight**，属于获准增量复测，不能写作另一份完整正式业务验收。没有继承开发自测、2716 旧值或其他 run 的 PASS；没有改动原始结果。2716 的原 FAIL/BLOCKED 历史仍保留，由后续总报告单独说明候选差异。

| 用例 | 原始状态 / 独立审定 | 原要求 | 本轮独立真值区间（ms） |
| --- | --- | --- | --- |
| AGENT-025 | PASS / PASS | 活动预算最多 60000 | [48174.876000, 48181.062333] |
| CAP-003 | PASS / PASS | 持续容量拒绝仍消耗原活动预算，最多 60000 | [45004.438208, 45010.991375] |
| INT-ACT-001 | PASS / PASS | 跨重启累计活动最多 60000，排除已证停机 | [49413.490876, 49736.093457] |
| AGENT-028 | FAIL / FAIL | 发送工具状态等待最多 5000 | [5001.359666, 5001.471375] |

四项均 `attempt=0`，[events.json](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/events.json) 与 [results.json](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/results.json) 逐条一致。QA 执行前后源码指纹均为 `750fb6a6395683331f9e4506bc9f62861dc49c00018fa493188f74e0d67f1dbb`；目标摘要 `f4b8af5af353520cbf776b42be407f97598c5f032fd4ff04219eb57f38557aab`；`runnerErrors=[]`、结果完整性错误为空。整个 system43 runner 为 failed，不能因本审定中三个 PASS 改写它的整体状态。

## 判据与算术

只读使用本轮原始 JSON 数字，以 Python Decimal 保留原始十进制；区间差采用 `[终点下界−起点上界, 终点上界−起点下界]`。大于上限的确定下界判 FAIL；上界不超过上限且完整前提成立，才支持该时序场景 PASS；跨界或缺失真值应 BLOCKED。没有容差，也没有把“最多 60 秒”改成“必须运行至 60 秒”。公开终态、持久计数和 COMMIT 都与实际停止决定分列。

[独立复算脚本](analyze-backend.py) 只读取文件；[详细事实与输入摘要](backend-facts.json) 保存 245 个原始输入的 SHA-256、身份、事件及计算。脚本完成时重新核对这些输入未变。Decimal 与原 runner 的二进制浮点尾数差异单列为诊断，未用于调整阈值。

## 单 epoch：真实终止决定与 COMMIT 分离

| 项目 | AGENT-025 | CAP-003 |
| --- | --- | --- |
| 实际 app PID / guardian | 84972 / 84971 | 88292 / 88291 |
| runId | `02816ba4-19f7-4d03-84cd-db6a6c771d1f` | `1df94282-e178-4518-8a1e-2c2efa629592` |
| app 时钟的创建边界（ms） | [1512.548167, 1518.713792] | [1514.103208, 1520.636167] |
| 实际停止决定（ms） | [49693.589792, 49693.6105] | [46525.074375, 46525.094583] |
| 外层 COMMIT 确认（ms） | [49701.189959, 49701.189959] | [46530.588542, 46530.588542] |
| COMMIT 在决定之后（ms） | [7.579459, 7.600167] | [5.493959, 5.514167] |
| 独立完整活动见证（ms） | [48174, 48189] | [45004, 45017] |

两个原 run 最终公开为 `failed / wall_clock`；工程生命周期的决定、COMMIT 具有相同 run/group/attempt/app/guardian/clock 身份，COMMIT 明确为 `outer-commit-confirmed`。两条活动流均从真实 run 创建开始、连续同 epoch，最终真实 terminal，`includesUnsavedTail=true`。本轮捕获的完整生命周期均没有停止决定之后的新 turn 派发；公开轮询延迟未算作决定超时。来源：[AGENT-025 原始证据](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-agent--AGENT-025-ru-085da-budget-including-slow-turns-system/evidence/wall-clock-window.json)、[CAP-003 原始证据](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-capacity-control--C-4b677-without-resetting-the-clock-system/evidence/capacity-active-budget.json)。

AGENT-025 的独立 Agent 桩记录了 6 次连续慢响应，约每次 8 秒；公开原 run 与这些请求 runId 一致。48 秒左右结束符合原最大预算，不新增最低时长。

CAP-003 实际触发 **722 次容量拒绝**，每次均有同 attempt 的 ready-persisted，`callbackEntered=false`、`remoteRequestCount=0`。对应租约最后有 DELETE 200 / released 的原始回包。容量流的持久计数区间 `[45012, 45090]` 只作诊断；本次 PASS 基于真实完整活动及停止决定。释放后额外保留 **1595.9604170000093 ms** 的有限观察，原 run 保持终态、Agent 总 turn 仍为 1、kick 请求/效果均为 0；它不证明无限未来不会迟发。见 [释放后原始观察](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-capacity-control--C-4b677-without-resetting-the-clock-system/evidence/capacity-post-release-qa-kick-capacity-budget.json)、[最终外部账本](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-capacity-control--C-4b677-without-resetting-the-clock-system/evidence/capacity-budget-final.json)。本窗口证明容量拒绝路径，不等同于所有实体锁、数据库锁或任意排队路径已验收。

## INT-ACT-001：完整跨 epoch 真值链

该原 run 为 `fd7237bd-ea82-403a-9e88-703902b96c46`，没有以重启新建 run 替代续跑。已核对全部 **218** 份恢复期 measured 快照与对应完整生命周期，历史前缀保持不变。公开原 run 的 **220** 次读取未出现 recoveryNote 暂停，最终 `failed / wall_clock`，群的 `activeAgentRunId=null`。

1. 旧 app `90984` / guardian `90983`，启动身份原串 `Thu Oct  1 23:26:37 2026`。两次 live-bridge 校准的父时钟区间产生交集偏移 `[101285.542875, 101290.309083]` ms。旧 epoch 为 `3c2af7f7-4e4c-4ac8-807d-619add0061e2`，从真实 run 创建开始连续观察；创建映射到 QA 父时钟为 `[102802.757375, 102814.910124]` ms，落在实际创建请求/响应包络内。
2. 第 3 个只读工具结果的外层提交已确认，`remoteInFlightCount=0`、`continuationDurable=true`。kill 前仍 held，实际 kill 完成早于租约 expiry。原始 ps 的 PID/PPID/PGID/UID/不透明 lstart 字符串逐项重新解析匹配，父时钟从 SIGKILL 发起前至**实际 app 身份消失**为 `[123980.315958, 123987.093875]` ms。最后是 app 的 ps exit=1 且 stdout/stderr 为空；guardian 结束没有被冒充成 app 退出。
3. 恢复 app `91548` / guardian `91547`，启动身份 `Thu Oct  1 23:27:05 2026`，新 epoch `ff7f0937-0307-468f-a4e5-c675f12038e3`。新快照来自 live-bridge；旧 `retained-after-process-exit` 缓存没有参与时钟校准。新段真实活动从 clock acquisition `[195.721667, 197.036833]` ms 开始；与旧段相同 run/group/API、不同 app/guardian/clock/epoch。
4. 新段工程见证诚实保留 `includesUnsavedTail=false`；并未把它单独当完整历史。旧段真实退出包络、新段 live 校准、启动前的 QA 时钟共同补足本次实验的保守总上界，原先未保存尾段没有被猜成零。

| 独立计算项 | 本轮区间（ms） | 边界含义 |
| --- | --- | --- |
| 旧段从创建至 app 实际退出 | [21165.405834, 21184.336500] | 含 kill 前未保存尾段以及退出观察外包络 |
| 重启命令调用窗 | [129025.763167, 129501.28925] | 使用调用前边界作为可能开始活动的最早时点 |
| 新段 clock acquisition 映射到父时钟 | [129305.917959, 129328.103708] | 来自真实 live 新 app 时钟 |
| 已证停机 | [5038.669292, 5045.447209] | 仅 app 已退出至重启命令调用前；此段排除 |
| 未证非活动的启动间隙 | [0, 302.340541] | 全额加进上界，没有自动扣除 |
| 新段至实际停止决定 | [28248.085042, 28249.416416] | 不是到 COMMIT 或公开响应 |
| **完整累计活动** | **[49413.490876, 49736.093457]** | 上界小于 60000，支持本场景 PASS |
| 最后确认持久采样至退出 | [87.863750, 100.746375] | 未保存部分只能取 `[0, 100.746375]`；0 下界不表示无丢失 |

总上界 = 旧段上界 + 新段上界 + 启动间隙上界 = `49736.093457` ms。新段停止决定 `[28445.121875, 28445.138083]` 与外层 COMMIT `[28449.00775, 28449.00775]` 属于同 attempt `9eed1bd9-224f-4bc9-9696-23b2e0d459bd`。COMMIT 滞后 `[3.869667, 3.885875]` ms 单列；activity terminal 的结束包络 `[28445.121875, 28449.04325]` 也只作终态阶段诊断。

账本在安全边界、真实退出后、重启前、终态分别读取。active_ms 为 `21084 → 21170 → 21170 → 49420`：退出后不低于已确认采样，退出后与重启前整条 run/steps 相同，停机期间无账本推进；终态计数是诊断，不替代上表真值。已提交的 3 条 history/step 完整保留为最终 7 条的前缀。桩记录 7 次请求均为同原 run，响应工具 ID 为 `activity-0` 至 `activity-6`，每次请求中前序工具历史恰好出现一次；恢复生命周期的派发序号从 4 接到 7，没有重放原 1–3。没有 send/kick 外部效果，没有已捕获停止决定之后的新 turn。

证据：[跨 epoch 全量原始收集](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-integration-runtime-5f6a1-time-without-tail-tolerance-system/evidence/activity-restart-raw-8b134d7a-bfc1-443d-82d3-2492ac5ba55c.json)、[原 runner 聚合](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-integration-runtime-5f6a1-time-without-tail-tolerance-system/evidence/activity-restart-budget-1fea2b69-d2cb-45e0-b4ae-54fce3f766ca.json)、[ps/校准/账本/全部恢复样本索引](backend-facts.json)。**只覆盖一次已提交只读步骤安全边界上的真实 app SIGKILL 与续跑**；未执行终态后的第二次重启，不证明任意正在发生的外部副作用窗口、所有未来运行或全部数据库锁情形。完整链条本次足以支持预算 PASS，不是强恢复性质的数学证明。

## AGENT-028：仍存在确定的 5 秒违约

run `703a2548-9142-498b-b466-c6a6a2e72213`、step `1`、toolUseId `send-timeout`、execution attempt `53d725fa-0e40-4bf5-ad38-7c5cf2cc3fe2` 的 key 解析、wait、结果就绪、物理返回、history 外层 COMMIT 身份全部相同。模型响应准备事件的 attempt 与工具实际 execution attempt 不混用。

| 边界 | app 单调时钟（ms） |
| --- | --- |
| 既有 key 已解析 | [1561.940333, 1561.940333] |
| 等待开始 | [1561.981917, 1561.981917] |
| SEND_TIMEOUT 结果已就绪 | [6563.341583, 6563.341583] |
| 工具物理返回 | [6563.411708, 6563.411708] |
| 同 attempt history 外层 COMMIT | [6571.09575, 6571.09575] |

保守开始包络 `[1561.940333, 1561.981917]` 与结果就绪至物理返回包络 `[6563.341583, 6563.411708]` 相减，仍得 **[5001.359666, 5001.471375] ms**。仅到结果就绪的下界已经超出 5000 ms **1.359666 ms**，不是把后续 `[7.684042, 7.684042]` ms 的 COMMIT 滞后或网络轮询算进去。无权添加调度容差，保留原 FAIL。该首次失败后的其余顺序断言不能因已存在工具结果而自动算通过。来源：[AGENT-028 原始证据](../../../preflight/2026-10-01T15-22-40.633Z-4281d669/artifacts/system-agent--AGENT-028-un-e7c9e-ame-key-still-cannot-resend-system/evidence/send-timeout-window.json)。

## 可关闭范围与剩余结论

本增量证据支持本候选的慢 turn 总预算、持续容量拒绝预算和一次安全边界跨 app 重启预算三个具体场景通过。AGENT-028 的原 5 秒要求仍未满足，需工程修复或明确的验收条款变更，QA 不自行放宽。完整业务报告、其他缺陷、人体验收、上线门禁均不由这四项替代；原报告状态由主报告按候选和执行范围分别保留。
