# 8e047 固定候选差异复测报告

状态：**FINAL_DELTA_REPORT**。生成时间：2026-10-01T16:12:43.185063+00:00。

本报告只覆盖本次注册增量子集。原 2716 全量正式验收另案保留；不导入任何历史 PASS，也不宣称 8e 全量业务或上线通过。

本次已绑定 6 个 run，原始执行历史 62 条：54 PASS/4 FAIL/4 BLOCKED。独立审定后的历史为 54 PASS/5 FAIL/3 BLOCKED。

最新口径为 59 个 case×project 义务、51 个独立用例；按合法单独复测选择各项目最新结果后，再跨项目取最差。当前最新独立用例：46 PASS/5 FAIL/0 BLOCKED。统计仅限本次已登记差异范围。

固定 SUT：`8e047aea842bfcec64802e4918b52b460b93c48b`。阶段均为 `developer-preflight`，获准差异复测的证据与其阶段标签同时保留。

| Run / 注册子集 | QA 源码 / 目标摘要 | 原始结果 | 执行器与完整性 |
| --- | --- | --- | --- |
| [2026-10-01T15-22-40.633Z-4281d669](runs/2026-10-01T15-22-40.633Z-4281d669/manifest.json) / qa-8e047-system-retest | `02ea807faed4` / `f4b8af5af353`（turn timeout=12000 ms） | 43：39 PASS/2 FAIL/2 BLOCKED | runner=failed；runnerErrors=[]；integrity=[] |
| [2026-10-01T15-28-57.887Z-4fd13981](runs/2026-10-01T15-28-57.887Z-4fd13981/manifest.json) / qa-8e047-ui-retest | `02ea807faed4` / `f4b8af5af353`（turn timeout=12000 ms） | 15：14 PASS/0 FAIL/1 BLOCKED | runner=failed；runnerErrors=[]；integrity=['执行器整体状态: failed'] |
| [2026-10-01T15-29-58.209Z-a06abe2a](runs/2026-10-01T15-29-58.209Z-a06abe2a/manifest.json) / qa-8e047-read-boundary | `02ea807faed4` / `f4b8af5af353`（turn timeout=12000 ms） | 1：0 PASS/0 FAIL/1 BLOCKED | runner=failed；runnerErrors=[]；integrity=['执行器整体状态: failed'] |
| [2026-10-01T15-56-07.250Z-42ecefbf](runs/2026-10-01T15-56-07.250Z-42ecefbf/manifest.json) / qa-8e047-zero-step-queue-retest | `b076790de087` / `1dd9aed24f3d`（turn timeout=15000 ms） | 1：0 PASS/1 FAIL/0 BLOCKED | runner=failed；runnerErrors=[]；integrity=[] |
| [2026-10-01T15-58-10.937Z-4ed62619](runs/2026-10-01T15-58-10.937Z-4ed62619/manifest.json) / qa-8e047-read-boundary | `b076790de087` / `f4b8af5af353`（turn timeout=12000 ms） | 1：0 PASS/1 FAIL/0 BLOCKED | runner=failed；runnerErrors=[]；integrity=[] |
| [2026-10-01T15-59-57.698Z-99a9ac63](runs/2026-10-01T15-59-57.698Z-99a9ac63/manifest.json) / qa-8e047-zero-step-queue-retest | `1edbcaf7daea` / `1dd9aed24f3d`（turn timeout=15000 ms） | 1：1 PASS/0 FAIL/0 BLOCKED | runner=passed；runnerErrors=[]；integrity=[] |

每个 run 的 QA 前后内容摘要一致、runnerErrors 逐项为空；表中的 `执行器整体状态: failed` 原样保留，不能概括为所有完整性字段为空。归档按 index 重新逐文件解压读取并复核 SHA-256 和字节数；完整 SHA、解压数量见 [summary.json](summary.json)。旧 raw events、错误上下文、报告没有被改成新结果。

## 确认的时序与恢复边界

| 用例 | 独立审定 | 本轮实际区间 ms |
| --- | --- | --- |
| AGENT-025 | PASS | [48174.876000, 48181.062333] |
| CAP-003 | PASS | [45004.438208, 45010.991375] |
| AGENT-028 | FAIL | [5001.359666, 5001.471375] |
| INT-ACT-001 | PASS | [49413.490876, 49736.093457] |

[四项独立时序报告](backend-review/backend-review.md)核对真实停止决定、同 attempt 外层 COMMIT、完整活动真值及跨 epoch 的实际应用退出。INT-ACT-001 的保守上界包含未证非活动的启动间隙，旧缓存和持久计数未替代真值；已提交 3 步在原 run 中续接到 7 步。它只证明本次安全阶段崩溃场景，不证明所有锁、任意外部副作用窗口或全部未来运行。

AGENT-028 的结果就绪下界已超过原 5000 ms 上限，不能用 COMMIT 排除或调度容差抹掉。BLK-EXT-004、BLK-EXT-005 的原 BLOCKED 经本轮明确公开 recoveryNote 与故障链审定为 FAIL，REC-007 保持 FAIL；依据是已证保守暂停不满足原续跑承诺，不是把 20/30 秒探测预算发明成产品 SLA。[恢复独立审定](review/recovery-adjudication-three-cases.md)保留每个原事件。

## QA 前提纠正与最新结果

原始前三 run 为 59 条义务：53 PASS / 2 FAIL / 4 BLOCKED。三次补复测（UI 两次、READ 一次）只更新对应 case/project 的最新审定，之前原始记录均可在 [latest-results.json](latest-results.json) 的 executionHistory 查回；不是自动重试，也没有把多次环境配置拼成一次事实。

UI queue 首次补复测已建立 failed/cancelled 两种真实零步骤前提，但第二次页面循环重复登录，被已有会话重定向后 locator.fill 超时；raw FAIL 必须保留，独立审定证实为 QA 导航前提问题，标 BLOCKED，不能当产品 FAIL。该次 failed 的界面实证和 cancelled 未呈现分列；后续只移一次登录到循环前，不回写先前失败。

首轮 INT-READ-001 的真实 ACCESS EXCLUSIVE 锁已经持有，但 QA 对 PostgreSQL OID JSON 字符串/数字类型比较过严，提前 BLOCKED。该轮未完成后续 reader/工具返回/恢复窗口，不能归为产品故障或产品通过。[首次归因](review/delivery-read-first-attempt-review.md)。修正 OID 后 READ 的真实工具等待、PG 关联及 ROLLBACK 证据按独立复核分别列示。

UI-039 的 cancelled 与 failed 两种零步骤状态须分别建立真实可达前提；一种状态观察通过不能代替另一种。普通超时配置与 queue 专项的配置差异保留在各 run 的固定目标中，不能反推修改业务标准。

修正 OID 后的真实 READ 窗口中，197 次样本确认独占锁，195 次捕获实际 blocked reader；34 个查询实例并不能直接等同该工具的查询。

| READ 实际工具 | 区间 ms | 原 5 秒判据 |
| --- | --- | --- |
| read-lock-send | [5000.443875, 5000.529792] | FAIL |
| read-lock-reuse | [1.792125, 1.848125] | PASS |

解锁后原消息 sent、同 key 读取已有结果，审计/发送请求/落地效果分别 1/1/1；同 attempt history 已确认。原始记录没有实际503确认查询响应：虽然配置不可用，表锁阻塞了其它读取，不将该配置视作503分支已执行。

工具→PG query/transaction 及产品串行 ROLLBACK 的唯一关联仍是 BLOCKED 子义务；该缺证不遮盖已证 5 秒 FAIL。case 汇总没有 BLOCKED 也不表示这些子义务已关闭。

| UI-039 执行 / 真实状态 | 后端零步骤前提 | UI 观察 | 独立审定 |
| --- | --- | --- | --- |
| 2026-10-01T15-56-07.250Z-42ecefbf / failed | PASS | PASS | PASS |
| 2026-10-01T15-56-07.250Z-42ecefbf / cancelled | PASS | NOT_RUN | BLOCKED |
| 2026-10-01T15-59-57.698Z-99a9ac63 / failed | PASS | PASS | PASS |
| 2026-10-01T15-59-57.698Z-99a9ac63 / cancelled | PASS | PASS | PASS |

[补复测独立审定](review/ui039-queue-first-review.json)

[补复测独立审定](review/ui039-queue-final-review.json)

[补复测独立审定](review/delivery-read-corrected-attempt-review.json)

| 最新非 PASS 用例 | 状态 | 分项目来源 |
| --- | --- | --- |
| AGENT-028 | FAIL | system: FAIL @ 2026-10-01T15-22-40.633Z-4281d669 |
| BLK-EXT-004 | FAIL | system: FAIL @ 2026-10-01T15-22-40.633Z-4281d669 |
| BLK-EXT-005 | FAIL | system: FAIL @ 2026-10-01T15-22-40.633Z-4281d669 |
| INT-READ-001 | FAIL | system: FAIL @ 2026-10-01T15-58-10.937Z-4ed62619 |
| REC-007 | FAIL | system: FAIL @ 2026-10-01T15-22-40.633Z-4281d669 |

完整最新逐项表见 [latest-results.json](latest-results.json)；[reviewed.junit.xml](reviewed.junit.xml)以 case×project 为单位，BLOCKED 输出 skipped 标明类型，绝不计 PASS。

## 尚未覆盖与不属于本轮的事项

- **GAP-BUDGET-AFTER-DISPATCH-KICK / NOT_RUN**：预算逼近上界 × 已派发 kick 的完整交叉窗口未实际执行；CAP003 容量拒绝与 CAP010 2秒收敛各自通过不可合成此组合已覆盖。
- **MANUAL-FOLLOWUP / NOT_RUN_IN_THIS_DELTA**：不代签真人、不把自动化浏览器当真实IME/跨app焦点；H18四态有限接受及文案体验closed-by-user保留，不为本次差异报告重开。
- **D039/D041 / NOT_A_NEW_PENDING_DIRECTION_DECISION**：保守暂停工程方向已决定；原任意重启续跑标准未变，本次已观察暂停仍判FAIL。若要更改验收承诺，需单独明确决定。
- **READ-CAUSAL-1 / BLOCKED**：exact tool-to-PG-query/transaction attribution, server cancellation and serial SUT ROLLBACK；PG真实锁链已取证但公开tool-wait未关联backend PID/backend_start/query attempt；不能唯一归属waitForDelivery，也不能确认其服务端取消与串行ROLLBACK。缺口须以真实只读观测契约补齐，不能伪造事件

7 条上线门禁、C1/C2 的 5 条候选用例排除于本次统计；3 条真人义务不代签。30 天/Gemini（D047）方向已决定，不重复列为待决定，本次没有真模型费用。增量通过不覆盖旧全量中未重跑的条目。

## 资源与归档

最终资源证据：[2026-10-01T16:02:10.396514+00:00](resource-audit/snapshot-20261001T160210.396514Z-post-cleanup.json)，以及 [具体清理复核](resource-cleanup-review.json)。生成器重新检查了全部62份cleanup记录 failures=[]、两组controller lifecycle停止/registry移除事件、wrapper/guardian进程不存在、两个端口无绑定、两个精确关联容器及两个映射卷不存在。共享Docker基础进程保留。首轮 8e 缺少存活时 Mounts 映射，不能声称所有匿名卷已确认删除。

| Run | 独立逐文件解压核对 | 归档 |
| --- | --- | --- |
| 2026-10-01T15-22-40.633Z-4281d669 | 1612 文件，全部摘要/字节匹配 | [原字节归档](runs/2026-10-01T15-22-40.633Z-4281d669/evidence.tar.gz) |
| 2026-10-01T15-28-57.887Z-4fd13981 | 184 文件，全部摘要/字节匹配 | [原字节归档](runs/2026-10-01T15-28-57.887Z-4fd13981/evidence.tar.gz) |
| 2026-10-01T15-29-58.209Z-a06abe2a | 23 文件，全部摘要/字节匹配 | [原字节归档](runs/2026-10-01T15-29-58.209Z-a06abe2a/evidence.tar.gz) |
| 2026-10-01T15-56-07.250Z-42ecefbf | 30 文件，全部摘要/字节匹配 | [原字节归档](runs/2026-10-01T15-56-07.250Z-42ecefbf/evidence.tar.gz) |
| 2026-10-01T15-58-10.937Z-4ed62619 | 225 文件，全部摘要/字节匹配 | [原字节归档](runs/2026-10-01T15-58-10.937Z-4ed62619/evidence.tar.gz) |
| 2026-10-01T15-59-57.698Z-99a9ac63 | 27 文件，全部摘要/字节匹配 | [原字节归档](runs/2026-10-01T15-59-57.698Z-99a9ac63/evidence.tar.gz) |

## 报告结论

**NOT_ACCEPTED_WITH_FAILURES**。

本差异复测仍有5个用例存在明确违约，不能无条件验收该增量范围。最新用例0 BLOCKED不表示READ因果补证、未执行组合场景或真人义务已经关闭。上线准备度未评估，最终上线决定不由这些子集通过替代。

主分支产品路径差异证明见 [main-product-version-binding.json](main-product-version-binding.json)：指定运行路径在 `8e047` 与记录的 `0fc63e4` 间无差异；该证明不扩大测试范围或把旧版全量 PASS 转移到新版。原正式基线：[2716 全量验收报告](../../acceptance/20261001-2716abd-business/report.md)。本文件生成器仅离线读取原件，不连接或运行产品。
