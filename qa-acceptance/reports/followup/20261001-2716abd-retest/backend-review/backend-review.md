# 2716abd 后端四项独立只读归因

结论：本次 AGENT-025、AGENT-028、INT-ACT-001 为已证实的严格时限 **FAIL**；CAP-003 为 **BLOCKED**，真实区间跨界，不能改记 FAIL 或 PASS。只复核既有首次运行证据，未执行新产品测试，未改 QA 源、原结果或历史缺陷。这里是定向复测的证据审阅，不是 2716abd 全量业务验收。

依据为原需求第 121 行的工具等待最多 5 秒、第 258 行的创建起累计活动最多 60 秒及停机不计；采用已经修正的 QA 判定契约，不增加“必须跑满 60 秒”下限，也不引入尾差容忍。实际停止决定、终态 COMMIT、公开可见、测试总耗时分别记录，不互相替代。

- `2026-10-01T14-20-03.813Z-b8814855`：`developer-preflight/qa-2716-send-regression`；suite SHA `808a0cf2a1a546e9d7c59d6b76dece8fe349b0c03b58187327f2622113a82f13`。 [manifest](../../../preflight/2026-10-01T14-20-03.813Z-b8814855/manifest.json)

- `2026-10-01T14-20-34.304Z-c2b3a488`：`developer-preflight/qa-2716-budget-retest`；suite SHA `1a4b6f0eea63b4a461b92cb1748d9f9bc9cbf8d83625a3e6273186d9f15f39de`。 [manifest](../../../preflight/2026-10-01T14-20-34.304Z-c2b3a488/manifest.json)


共同 SUT `2716abdd2d43a779b6a0972a6323f895cf2b5b9c`，QA `04e41660aa49b07b1fd8df76e1f3aabfbc21a7f6`；QA 源树 SHA `96770ee390b8929ab9ddfaf19d64abc05b403594b66f0b5b35f9e0ffb11bf06f`，target SHA `f1be952997603f443162f5b2ddbf0c9466902a2c99cace103dc7e148e8aaf985`。全部本次目标首次 attempt=0，原始状态来自各 run 的 results.json，未继承旧运行状态。


| 用例 | 本次原结果 | 独立复算的决定性范围（毫秒） | 判定 |
|---|---|---|---|
| AGENT-025 | FAIL | 创建→实际停止决定 [60004.723209, 60012.326041] | 下界已超过 60000 |
| AGENT-028 | FAIL | 实际状态等待 [5000.417458, 5000.547916] | 下界已超过 5000 |
| CAP-003 | BLOCKED | 创建→实际停止决定 [59998.138542, 60004.017416] | 跨 60000；完整 activity 也为 [59998, 60011] |
| INT-ACT-001 | FAIL | 两段到实际停止的安全下界 60017.756667 | 未计未知启动空档已经超限；不生成全程上界 |

数值以原始 JSON 十进制词法作 Decimal 复算。AGENT-028 原 JS 输出上界为 5000.5479159999995，Decimal 值 5000.547916；这是表示差异，没有四舍五入下界以改变结论。


## AGENT-025：实际停止决定晚于上限

实际创建包围 `[1532.258209,1539.843875]`，实际 `wall_clock` 停止决定 `[61544.567084,61544.58425]`。最有利于实现的下界仍为 `61544.567084−1539.843875=60004.723209`。同 attempt `2ce3fd54-405b-4d26-90f3-66bae6ae8ba7` 的 COMMIT 为 `61549.51775`，仅单独记录其晚于决定 `[4.93350,4.950666]`，没有把该延迟计入停止判定。

独立活动流 728 条，同一连续创建 epoch，终态完整活动 `[60004,60018]`，与真实停止结论一致。生命周期 19 条，有 attached、未丢历史、真实 creation、8 次 turn 派发、7 次响应及同 attempt 停止/COMMIT；已捕获历史内无停止后 turn。公开终态的父进程区间 `[59931.986042,60168.286833]` 自身跨界，不用其作精确决定裁判。夹具配置慢 turn 8000 ms，本例未运行到 12 步；本结论不声称验证了独立步数上限。

[原始 wall-clock-window](../../../preflight/2026-10-01T14-20-34.304Z-c2b3a488/artifacts/system-agent--AGENT-025-ru-085da-budget-including-slow-turns-system/evidence/wall-clock-window.json)

## AGENT-028：超限发生在返回/提交前

同一工具 attempt `0439657d-eed1-4ba8-bcfc-8ec9b4f7e03c`、step `:1`、key `timeout`、消息 `65aef8c8-7119-4e1d-bece-b72a10dded5d`：key 已解析 `1484.740084`；实际等待开始 `1484.795792`；结果 ready `6485.21325`；工具返回 `6485.288`。因此最短等待 `6485.21325−1484.795792=5000.417458`，在结果 ready 阶段即超限。ready/returned 均为 `SEND_TIMEOUT`。

工具历史 COMMIT 为 `6493.7675`，比真实返回晚 `8.4795`；此延迟和后续模型请求均未用于 5 秒判定。生命周期附着时读取本进程保留历史，droppedThroughSourceSeq=0；sourceSeq 是全局过滤序列，不要求连续，局部 seq 连续。后续同 key 已返回 sent 的观察不能抵销首次等待超限；本项首个断言失败之后尚未执行的检查不宣称通过。

[原始工具生命周期](../../../preflight/2026-10-01T14-20-03.813Z-b8814855/artifacts/system-agent--AGENT-028-un-e7c9e-ame-key-still-cannot-resend-system/evidence/send-timeout-window.json)；[原运行计算区间](../../../preflight/2026-10-01T14-20-03.813Z-b8814855/artifacts/system-agent--AGENT-028-un-e7c9e-ame-key-still-cannot-resend-system/evidence/send-timeout-actual-interval.json)

## CAP-003：只有跨界，不存在足够的硬 FAIL 证据

创建包围 `[1526.4585,1532.320833]`；实际停止决定 `[61530.459375,61530.475916]`。独立复算 `[59998.138542,60004.017416]`。同 attempt `557d549b-f4eb-46c5-bc27-da39d6af04c4` COMMIT 为 `61537.290875`，比决定晚 `[6.814959,6.831500]`；不能用它收紧或替代真实停止区间。

完整 activity 流 713 条、连续单 epoch，真实 activity 区间 `[59998,60011]` 同样跨界。capacity 诊断采样 `[60005,60015]` 来自持久采样加观察尾段，仅作诊断，不能将本轮 B 升级 F。生命周期 6 条含真实 creation、1 次派发/响应、实际停止和 COMMIT。本轮 B 不删除旧版本原 FAIL，也不表示该缺陷已关闭。后续候选需交付足够清晰的真实边界；任何预留调度余量是工程选择，不能由 QA 添加 SLA 容差。

[原始 capacity-active-budget](../../../preflight/2026-10-01T14-20-34.304Z-c2b3a488/artifacts/system-capacity-control--C-4b677-without-resetting-the-clock-system/evidence/capacity-active-budget.json)

## INT-ACT-001：真实退出、两次 live 校准及新 epoch 实际停止

原 app/guardian 为 `93524/93523`，新 app/guardian 为 `94405/94404`；均绑定同一 run `4c054f06-5eb0-480c-b8bd-c4d36805d71e`、group `c604a745-bab4-4ab2-a311-267feba23b28` 及 2716abd。旧 epoch `f61d2dac-28d7-4768-8483-933dcdbd9c96`，新 epoch `2075a538-2add-4738-80de-e2ad246ece6d`，应用单调时钟域不同。父时钟域 `qa-parent:93468:9049d5b4-50f1-4c98-97b9-3aeb47d584d9` 不变。

旧进程在 safe-held 屏障，实际只读工具结果和续跑已持久化，无远端在途副作用。两次真正 live 读的父包围分别为 `[24068.624375,24079.731291]`、`[24079.733666,24084.516375]`，app 单调读数分别 `22699.810333`、`22706.010667`。两次时钟读数前进，来源 `live-bridge`，opaque ps 开始字符串、app 身份与历史一致。各偏移区间 `[1368.814042,1379.920958]`、`[1373.722999,1378.505708]`，交集 `[1373.722999,1378.505708]`；未假设网络延迟对称。

旧创建包围 `[1528.761583,1537.0925]` 映射到父域 `[2902.484582,2915.598208]`。SIGKILL 请求前 `24109.20625`，真实 app 消失确认后 `24117.595958`。实际 ps 在 kill 前核对 app 的父 PID/PGID/UID/opaque lstart；kill 后 app PID 本身返回空、退出码 1，不能仅以 guardian 退出代替。旧活动至真实退出范围 `[21193.608042,21215.111376]`。退出后快照明确标记 `retained-after-process-exit`，完全没有用于校准。最后成功采样 `21166` 与独立退出后账本 `21185` 的关系被记录；持久值不拿来倒算完整活动或忽略未保存尾段。

共审查 287 份 recovery measured 文件，按父时钟窗口排序。最后一份 `c4a998fe…` 的 parent 包围 `[68298.618625,68333.261125]`，包含 472 条完整连续新 epoch 活动以及随后读取的 14 条 live 生命周期；附着历史未丢弃，均为同一真实新 app/clock/run。新活动起点 `[204.631083,206.175416]`，来源为实际 clock-acquisition，`includesUnsavedTail=false` 如实保留，不能据此声称旧尾段已被实现完整继承。

**原始最后 live 文件实际已经包含停止与 COMMIT。** 实际停止 `[39030.324041,39030.337333]`；对应同 attempt `08e1ce08-fba2-4ca9-9f94-e3483d29ad66` COMMIT 为 `39034.932666`。预算只用停止，恢复段 `[38824.148625,38825.706250]`；不用更晚 activity-terminal/COMMIT 充作执行继续。因此 `21193.608042 + 38824.148625 = 60017.756667` 的安全下界已经超限。上一份实时样本还没有停止决定，已证明下界为 `59878.608042`；最后这一份是首份被本检查判超限的样本。

硬 FAIL 在 liveLower 阶段结束测试，最终 collector 输出不存在；虽然最后 live 响应中恰好已有同 attempt COMMIT，也不能冒称完成了整个最终收集流程。未知启动空档没有独立 inactive 证明，本审阅没有默扣、没有虚构全 run 上界、没有给跨重启全链 PASS。两段已证下界超限不需要靠终态公开时间或完整上界才成立。源代码级丢失原因未在本次只读任务中证实，交研发定位；不能将诊断 `active_ms` 差直接当作精确丢失量。

[两次 live 校准](../../../preflight/2026-10-01T14-20-34.304Z-c2b3a488/artifacts/system-integration-runtime-5f6a1-time-without-tail-tolerance-system/evidence/activity-live-calibration-before-kill-b7754948-401c-4cb2-83bb-8b4a4c8aafd0.json)；[真实退出](../../../preflight/2026-10-01T14-20-34.304Z-c2b3a488/artifacts/system-integration-runtime-5f6a1-time-without-tail-tolerance-system/evidence/activity-kill-window-e5d4069c-4b1f-4899-9ef8-b0a883dcc698.json)；[最后 measured 及生命周期](../../../preflight/2026-10-01T14-20-34.304Z-c2b3a488/artifacts/system-integration-runtime-5f6a1-time-without-tail-tolerance-system/evidence/activity-recovery-measured-c4a998fe-4a23-409b-9cdc-ea65e6965fc3.json)

## 交付和后续边界

完整身份、原始边界事件、逐文件 SHA-256/字节数和 Decimal 算式见 [backend-facts.json](backend-facts.json)。[analyze-backend.py](analyze-backend.py) 仅离线读取原证据；成功执行了身份、序列、校准相容、真实退出、same-attempt COMMIT、287 份 live 历史及首次超限关系校验，无网络、数据库或产品启动。

研发定位应分别面向工具 ready 之前的等待上限、真实 run 停止决定及两 epoch 真实活动累计；不以压缩提交/公开延迟替代这些阶段的修正。不为通过修改 5000/60000 原要求。本轮 F/B 和旧历史全部保留，新候选的验证必须另冻结版本并新运行，不能把本报告当作修复通过。
