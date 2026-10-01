# QA 强恢复结论的工程核对

2026-10-01。QA 固定候选 `86ad4e7e63786f652c965308b032b98415bdd7ac`，运行 `2026-10-01T06-54-18.519Z-a1e23916`。本次接收 QA 的具体归因，核对公开结果、源码及既有交付边界；没有重新运行测试，不修改 QA 的原始结果、用例或报告。QA 最终报告路径待其统一交付。

## 原始运行与专业审定分别保留

| 用例 | QA 原始状态 / 本次审定 | 事实与工程结论 |
| --- | --- | --- |
| BLK-EXT-002 | BLOCKED / FAIL | 建群 job 明确记录结果未保存、没有本次创建查询接口、不自动重新建群。能够保留任务和避免再次建群，不等于原任务自动完成。 |
| BLK-EXT-003 | BLOCKED / FAIL | 提权 job 明确记录结果未知、不自动重试；不把有限等待超时当作唯一失败依据。 |
| BLK-EXT-004 | BLOCKED / FAIL | run 记录已派发 kick，当前成员变化不能证明重放安全。避免再次移除重入成员与自动完成要求是两个判断。 |
| BLK-EXT-005 | BLOCKED / FAIL | run 记录未保存的 Agent 轮次响应无法安全重放，恢复流程暂停。没有把“未执行的模型响应必须逐字相同”新增为验收条件；判定依据是当前明确暂停。 |
| REC-007 | FAIL / FAIL | 公开 run 中同样存在未知 kick 的恢复暂停说明，维持原 FAIL。 |
| BLK-EXT-001 | BLOCKED / BLOCKED | 据 QA 本轮归因，未收到明确 504 的落地/未落地分支仍缺充分真值，不将普通 404、两秒等待或其他恢复失败代替该项证据。 |
| INT-ACT-001 | BLOCKED / BLOCKED | 公开 API 可见同一 Agent run 从 running 到 failed/wall_clock，recoveryNote 始终为空；QA 报告完整活动尾段见证不足。不能将其他场景的 recovery-paused 归到此项，也不能因已到终态便推定严格预算通过。 |
| INT-ACCOUNT-001、INT-ACCOUNT-002、INT-DIAG-002 | QA 反馈实际 PASS | 分别对应账号原事务短暂保存失败与后续意图、持续保存失败回滚、模块诊断。此处仅接收 QA 的独立结果，不扩为所有账号故障、诊断或恢复场景通过。 |

前五项与现有安全策略和公开交付说明一致，工程对本次“未满足原始自动恢复保证”的归因没有事实异议。原始 BLOCKED 仍留在 QA 原运行，专业审定 FAIL 单独关联，不追改原记录，也不重复算作两个独立缺陷。

## 机制与已有问题关联

- 建群和提权分别进入 `GatewayJobs` 的 `create_dispatch`、`promote_dispatch` 恢复保护；写下说明后不会自动重新派发。见 [jobs.ts](../apps/server/src/modules/gateway/jobs.ts)。建群沿用 CG-04；提权作为同类结果未知窗口的具体子场景保留，不被“建群”概括遗漏。
- 遗留 executing kick 在 [tool-execution.ts](../apps/server/src/modules/automation/tool-execution.ts) 暂停，关联 CG-05；遗留 inflight turn 在 [agent.ts](../apps/server/src/modules/automation/agent.ts) 暂停，关联 CG-06。上述三个恢复文件在 QA 固定版本与工程复核基线 `0f4a9f3` 之间无变化。
- 带恢复说明的 run 被正常调度和活动计量排除，不能承诺再等到预算到期便会自动完成；取消编排也不等同正常续跑。REC-007 与 BLK-EXT-004 的具体成员前提不同，不把 REC-007 也描述为已经证明目标移除后重入。
- 与 [核心验证收口](core-verification-closeout.md)、[QA 接入交付](qa-integration-handoff.md) 和[外部能力补充建议](product-enhancement-proposal.md#external-capability-proposals) 关联：本次不新增外部能力的决定仍有效，但不等于原始强保证通过。CAP003 和 INT-MSG007 的独立时间问题继续见[时间边界复核](qa-timing-boundary-followup-20261001.md)，不与本批合并计数。

本次不为得到通过而盲目重发消息、重建群、重复提权或踢人，不从测试控制器补造产品结果，不放宽断言。上述事实说明当前实现不能自动恢复这些窗口；本记录不扩大为“任何原协议内替代设计都不可能”。若有新的可证明方案，应另行核对副作用、历史保留、调用次数和恢复边界。

## 证据与后续交接

[工程只读证据索引](evidence/qa-recovery-boundary-index-20261001.json) 保存四份恢复观察及 REC-007、INT-ACT-001 公开 API 记录的原路径、SHA-256、相关 job/run 身份和抽取结果；QA 原制品保持不动。BLK-EXT-001 的 BLOCKED 与三项 PASS 按本轮 QA 来信接收，最终报告到达后补齐其报告索引，不声称本次重新执行或完整复核了它们。

本批仅更新工程记录及索引，无产品代码、服务、数据库或 QA 资产变更。后续按 QA 的具体反馈协作，不设置定时跟进或主动轮询。
