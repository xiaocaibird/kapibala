# 跨进程活动计时场景修订与执行证据

本次仅修订开发侧跨进程测量用例，不修改产品活动预算、观察器计算器、QA 用例或 QA 断言。测试提交为 `d76af74587139f43f82003b12b3d4b4570068d23`，基于模型阶段准入改进 `bc5d210`。原始输出和校验值归档于 [证据索引](evidence/qa-epoch-measurement-profile-20261001/index.json)。

## 修前失败与原因

整合回归在 `bc5d210` 产品上失败于 `tests/integration/qa-epoch-process.test.ts:267` 的开发断言：长场景要求 `combined.activeElapsedMs[0] > 59000`。[原始失败摘录](evidence/qa-epoch-measurement-profile-20261001/baseline-failure-excerpt.tap) 保留原日志第 3346–3368 行；完整来源文件的 SHA-256 与摘录范围记录在索引中。

日志中的 `54826.850959ms` 是**该测试用例的总耗时**，包含环境准备、停机等待及恢复等过程，不是实际活动区间。失败发生在长场景证据序列化之前，该段日志未输出长场景活动上下界；本记录不推算或补造修前活动值。

模型阶段准入会在剩余预算不足以覆盖下一次配置调用窗口时结束运行，因而不必用满 60 秒。当前 [QA 运行观测契约](../qa-acceptance/contracts/runtime-observation.md)“活动预算：INT-ACT-001”明确原要求没有最低运行时长，`wall_clock` 且活动上界小于 60000 本身不判失败；它仍要求单独核对结束原因、终止后不再派发及完整活动证据。开发用例原来的 59000ms 下界是测量场景附加约束，不是产品要求。

## 修订内容

保留每轮 7 秒的真实本地只读模型替身、运行 17 秒后请求安全屏障、真实 SIGKILL、实际子进程退出、5 秒停机、同库同 run 恢复、两段独立 epoch、采样到退出尾段和晚订阅拒绝检查。没有缩短产品 60000ms 上限或将它加上容差。

长场景改为证明足够的跨进程实际工作：两段各至少完成两轮真实请求，总观测活动下界大于 `4 × 7000 = 28000ms`，两段各自的下界大于 7000ms。28000ms 是此开发测量场景的覆盖要求，不是新的业务最低运行时长。另核对新子进程的实际 PID、前后 PID 不同，以及所有模型请求仍属于原 run。

JSON 保留原 `combined.budget60000` 计算分类，新增 `measurementProfile` 标明 `requiresNearBudgetExhaustion=false`、`fullRunBudgetAcceptance=not-asserted`、`unobservedEpochGapProvenInactive=false`。为了兼容既有归档入口，长场景文件名仍为 `minute-profile.json`；该名称不表示已观测活动必须达到一分钟。

## 修后执行

Node.js 24.21.0，在自有 PostgreSQL 容器和三个 UUID 临时数据库运行：

```sh
DATABASE_URL=<本次自有隔离库> \
EPOCH_EVIDENCE_DIRECTORY=.runtime/qa-epoch-measurement-profile-20261001 \
node --import tsx --test --test-reporter=tap \
  tests/integration/qa-epoch-process.test.ts \
  tests/integration/qa-epoch-evidence.test.ts
```

[定向日志](evidence/qa-epoch-measurement-profile-20261001/focused.tap) 共 **5 项通过，0 失败，0 跳过**：跨域区间计算、缓存/缺采样/断层/错 PID 拒绝、真实短 SIGKILL、真实长 SIGKILL、恢复已结束后才订阅的拒绝。服务端/脚本 TypeScript 检查、限定文件格式检查和 diff 检查也通过。

| 长场景原始测量             | 结果                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| 用例总耗时                 | 54976.366375ms                                                            |
| 实际应用 PID               | 旧 37215；新 37795                                                        |
| 已完成真实模型轮次         | 旧 epoch 3 次；新 epoch 4 次                                              |
| 旧 epoch 活动区间          | [21287.086750, 21305.174958]ms                                            |
| 新 epoch 活动区间          | [28135.387542, 28142.448500]ms                                            |
| 两段已观测活动相加         | [49422.474292, 49447.623458]ms                                            |
| 最后确认采样至实际退出     | [191.416375, 205.409083]ms，表中上界向外取整                              |
| 未保存尾差的不确定区间     | [0, 205.409083]ms；下界 0 不表示无丢失                                    |
| 未计入两段的退出至接管区间 | [5205.770916, 5220.039667]ms，表中向外取整                                |
| 退出后 / 重启前持久账本    | 均为 21100ms                                                              |
| 终态持久账本及结果         | 49240ms；同一 run 为 failed / wall_clock；recoveryNote=null；0 次网关操作 |

[长场景原始 JSON](evidence/qa-epoch-measurement-profile-20261001/minute-profile.json) 与 [短场景原始 JSON](evidence/qa-epoch-measurement-profile-20261001/short-profile.json) 保留未取整原值、时钟校准窗口、原始 snapshot、父进程 kill/exit 窗口、轮次流水、实际进程及 epoch 关联。两个文件的 `sourceRevision` 均为本次测试提交。

`within-observed-interval` 只说明两段已观测活动的上界未超过原 60000ms。退出到新 epoch 接管之间包含停机和初始化，未获得整个初始化区间可按原要求扣除的活动状态证据；本次不将这段全部改称停机，不据此宣布完整 run 的预算或 INT-ACT-001 通过。旧超限结果、旧 BLOCKED 及 D040 尾差边界不回填。

## UI 文案只读核对

在候选 `d76af74` 的 `apps/web/src` 全文检索 `wall_clock`、`60秒`、`60000`、`60_000`、预算、耗尽、用满、用尽、超时，未发现把该结束原因硬编码解释成“已用满 60 秒”的文案。

当前 `apps/web/src/components/ui.tsx:103` 将 failed 显示为“失败”；运行详情 `apps/web/src/pages/AgentRuns.tsx:174`、列表 `apps/web/src/components/AgentRunList.tsx:83` 原样显示 endReason，因此 `wall_clock` 未被转换成“实际运行恰好 60 秒”。本次不修改 UI，不把动态模型摘要或任意远端错误文本纳入固定文案保证。

## 归档与清理

四份运行产物按字节复制，索引记录每份文件的 SHA-256、大小及与 `.runtime` 源文件相同的校验结果。原始 JSON 的四个 `observedOwnerToken` 已在生成时写为 `<redacted>`；检查未发现未脱敏凭据字段、数据库连接串、Bearer 或 Gemini Key 模式。没有复制环境变量、密钥文件或真实模型数据。

[清理记录](evidence/qa-epoch-measurement-profile-20261001/cleanup.json) 确认临时数据库与连接数均为 0、自有容器及卷已移除、应用子进程无残留、临时依赖符号链接已移除。本次未操作演示环境或 QA 资产。
