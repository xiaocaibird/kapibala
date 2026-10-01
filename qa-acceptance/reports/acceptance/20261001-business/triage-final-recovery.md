# 最终候选恢复场景分诊

复核 2026-10-01T07:22:41.646Z；候选 `86ad4e7e63786f652c965308b032b98415bdd7ac`；正式run `2026-10-01T06-54-18.519Z-a1e23916`。仅只读既有证据，未改源码、配置或结果，未新跑产品；完整自动运行已结束，完整验收汇总另行生成。

## INT-MSG-007：保留 FAIL，明确排期原点后移

最终报告严重度 S2（原初始建议标签P1已在JSON保留）。原始错误为“后步排期确定偏离原首次接收时间区间，不能用重放时刻代替”。依据原B1排期及任意时刻重启总则，本次是已有公开违约证据，不是缺少观测依据的 BLOCKED。

| 实际事实 | UTC/值 |
|---|---|
| QA首次接收独立区间 | 07:17:59.330–07:17:59.497 |
| 工程实际接收见证 | 07:17:59.474，落在独立区间内 |
| 暂停窗口 | receipt-insert-not-issued；receiptPresentAtProbe=false |
| 原进程 / 重启进程 | 8224 / 8530 |
| 真实强杀 | 07:18:01.024 |
| 重启完成上界 | 07:18:01.503 |
| 重放递送上界 | 07:18:01.823，早于原后步最早到期 |
| 后步原应排期区间（+20秒） | 07:18:19.330–07:18:19.497 |
| 恢复后公开后步排期 | **07:18:21.802** |
| 确定后移至少 | **2305ms** |
| 恢复后首步sentAt | 07:18:01.802，与重放后的观察相符 |

runId `2970735d-d090-4b28-99eb-6825a7286615`，clientMsgId `d645296c-5815-4508-b31e-ce5ae1c8b5b9`。恢复前首步accepted、后步排期null；重启后真实公开GET返回首步sent和上述后步排期。时间比较没有依赖控制器单方时钟：使用QA递送/读回区间，且区间完全早于重放，原期内恢复前提成立。

D041已披露首次物理接收时间尚未保存即崩溃的窗口，并明确不得把重放时刻冒充原时刻。它解释了失败原因，没有将该窗口从严格验收排除，也没有提供时间容差。产品失去了事实不等于QA没有观察该事实；此处有正向排期偏移证据，应保留FAIL。

范围限制：只证明单实例这次公开排期错误，未声称多实例全局最早接收；此测试在首个FAIL后退出，没有等待第二步实际晚发，不能把未执行后续步骤写成通过或失败。首步send账本仍为一次，不追加重复效果缺陷。清理failures为空。

关联 INT-MSG-008 已提交窗口的恢复快照保留 receiptObservedAt=07:18:05.406Z，首步sentAt与其相等，后步07:18:25.406Z在独立区间+20秒内；该路径不能消除007提交前窗口的失败。主任务通知001..006及008通过，本次不重复运行或把它们当007通过依据。

证据：[原始错误](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-integration-message-64129--original-scheduling-origin-system/error-context.md)、[强杀前窗口](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-integration-message-64129--original-scheduling-origin-system/evidence/receipt-window-before-kill.json)、[恢复公开排期](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-integration-message-64129--original-scheduling-origin-system/evidence/receipt-window-after-restart.json)、[API原始记录](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-integration-message-64129--original-scheduling-origin-system/evidence/api.ndjson)、[清理](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/artifacts/system-integration-message-64129--original-scheduling-origin-system/evidence/cleanup.json)。JSON附原始路径与SHA-256，原始文件保持不变。



## 恢复与运行观测追加复核

复核时间：2026-10-01T07:32:53.828Z。保留原始运行状态，另列依据既有证据的审定结果；这是 11 条子集，不是整轮统计。

| 用例 | 原始状态 | 审定 | 依据与限制 |
|---|---|---|---|
| INT-MSG-007 | FAIL | FAIL | 后步公开排期比原接收区间至少晚2305ms，见上文 |
| INT-ACT-001 | BLOCKED | BLOCKED | 安全阶段真实续跑并正常 wall_clock 终止，但跨 epoch 活动完整见证不足；无 recovery-paused |
| INT-ACCOUNT-001 | PASS | PASS | 同原事务局部恢复、真实新请求等待、外层 COMMIT 确认；新 disconnect 没有被旧意图覆盖 |
| INT-ACCOUNT-002 | PASS | PASS | 原事务有限重试后回滚，失败未伪报成功；后续 connect 是明确新操作 |
| INT-DIAG-002 | PASS | PASS | 真实 failed → running → idle，失败数/时间/持续时长/成功时间符合实际生命周期 |
| BLK-EXT-001 | BLOCKED | BLOCKED | 未收到504的在途 send，落地分支收敛；不落地分支有限观察仍 unknown，未见独立违约 |
| BLK-EXT-002 | BLOCKED | FAIL | 远端群已创建，本地 groupId 丢失；公开明确不自动重建，原创建流程没有恢复 |
| BLK-EXT-003 | BLOCKED | FAIL | 远端已提权，仅1次 promote；公开明确未知结果不自动重试，原 job 安全暂停 |
| BLK-EXT-004 | BLOCKED | FAIL | 旧 kick 生效后重新入群，没有重复移除；原 run 明确未知结果暂停，不满足正常续跑 |
| BLK-EXT-005 | BLOCKED | FAIL | 已持久 send 只有1次；第二轮模型响应未记即崩溃，原 run 明确无法安全重放并暂停 |
| REC-007 | FAIL | FAIL | kick 实际已生效，原 run 未正常续跑；判定依据公开暂停，不是30秒超时 |

子集原始：PASS 3 / FAIL 2 / BLOCKED 6；审定：PASS 3 / FAIL 6 / BLOCKED 2。原始异常全部保留，未修改执行器输出。

### 活动预算的证据范围

INT-ACT-001 原 run `98d6a007-da35-4f95-aef2-d3576dd86e8a` 在 07:19:27.463Z 命中真实只读结果外层提交后的安全屏障：continuationDurable=true、remoteInFlightCount=0、活动区间[21100,21105]ms。紧邻强杀仍held，强杀完成07:19:27.495Z，早于07:21:13.542Z租约到期。新owner PID14302（旧13137）接管后468条见证仅active/terminal，未出现恢复暂停；07:20:11.765Z公开原run为failed/wall_clock、recoveryNote=null，active指针清空，网关无send。

终态见证只包含新epoch，includesUnsavedTail=false且无全run activeElapsedMs，无法证明旧尾段/多epoch累计。persistedActiveMs=60011、observedEpochActiveMs=[38920,38927]原样保留为局部诊断；不以持久采样或未固定附加字段拼接完整真值，不引入容差，不虚报60秒符合或恢复暂停。严格预算仍BLOCKED。

### 已证明的事务与诊断路径

ACCOUNT001原transactionId `c431dbf2-3e1d-49ca-bde8-131f3cf36c70`：07:20:14.083局部错误与保持，14.130新disconnect请求实际等待同事务，14.201 outer-commit-confirmed，14.213远端disconnect。connect/disconnect各1次；WS依次online、disconnected。保持阶段有独立requestId和真实等待因果；约1500ms内未见旧意图覆盖，不外推任意时长。

ACCOUNT002同原事务实际3次错误后07:20:16.767外层回滚，HTTP500；公开仍idle，无这次失败请求的成功状态WS，仅一致性提醒。约1500ms后QA明确新connect（18.283请求，18.287远端），再disconnect，最终disconnected。两个connect不构成自动重放，远端成功/本地失败仍是已知跨系统差异，本例PASS不等于原子提交。

DIAG002 gateway真实失败20.729Z；下一tick开始前保持20.831Z；20.883Z放行至running；两次公开持续时长3.489667→160.991209ms；21.052Z自然成功，状态idle、失败数1→0、lastFailedAt保留、lastSucceededAt此时才更新。这里只证明本次有限诊断与秘密样本。

### 明确安全暂停与单纯有限观察分开

BLK-EXT-002公开：建群请求已开始但没有保存结果，网关没有查询本次创建结果接口，**不自动重新建群**；355个响应从07:21:14.398至34.398Z均保留此说明。远端只有一次create、一个群，本地groupId=null。

BLK-EXT-003公开：提升管理员请求已开始但没有保存结果，网关没有查询管理员角色接口，结果未知时**不自动重试**；353个响应从07:21:37.497至57.499Z一致。实际admin角色存在、promote仅1次。第二次promote窗口未触达，不能登记为已验。

BLK-EXT-004与REC-007公开：`A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.` 前者343个响应、后者527个响应；各自只有一次kick、步骤isError=false。前者重入用户仍在群，后者被移除用户不在群。两个场景都没有重复副作用，但正常续跑义务没有满足。

BLK-EXT-005公开：`An Agent turn was sent before interruption; the protocol cannot safely replay an unrecorded response.` 342个响应保留此说明；已持久send只有一次，模型请求总数仍2，未进入恢复后的下一轮。此例不要求逐字重放丢失响应，合法新响应仍允许。

以上与最终候选公开交付说明中的“保守暂停不等于完成恢复”对应。依据原A3和重启总则、原A5.8审定FAIL，原因是已经明确的停止自动恢复，**不以20/30秒观察时长证明永久停滞，也不创造恢复SLA**。归因应登记为现有外部协议缺少结果确认/安全重放判据下的强恢复未满足，不应建议盲重试；D039本轮不新增外部能力不构成接受原需求偏差。最终严重度S1，原始BLOCKED与审定FAIL并列留痕。

BLK-EXT-001不同：两个可见前缀均没有504；落地分支70ms后sent，不落地分支约10秒仍unknown。未见重复send、伪造sent/failed或明确暂停诊断。QA私有effect:none不构成应用可用的未投递证明，维持BLOCKED。

### 取证与边界

JSON逐项保存console对应行（console已结束，最终全文SHA已补入JSON）、公开API、工程见证、独立外部副作用账本、强杀窗口和清理文件SHA-256。相关用例清理failures均为空。冻结QA/候选与原始文件未改，未新执行产品。INT-STREAM由主任务另行复核；本报告不代填其他用例。


## 最终原始状态核对

2026-10-01T07:45:32.055Z：runner已于2026-10-01T07:32:54.100Z结束（runnerStatus=failed、runnerErrors=[]），6项人工记录已录入。11条分诊的rawStatus与最终results.json逐一相符，审定结论无变化，原始事件未改写。最终console SHA-256：`532f9df56cb381093e712ad318f55ec59d89b49c9226c797a36b13afaf9a7e45`。结果、runner、事件、manifest和console的终版哈希均在JSON中。

QA身份补充：实际执行为 f63b3e3b2b4f6e84b145dc03e724c0da03a4acdc 基点+dirty；195份冻结资产匹配c529f31076f9c645b5b1b04a2184e641c81b031b，另1份执行本地授权。完整196文件tree SHA为 `fb50f282f910d462545601e835db8fb10288c9c40718a4d5e0d0659f720fcb11`。后续QA纠正复测不会回填或抹除这一轮证据。
