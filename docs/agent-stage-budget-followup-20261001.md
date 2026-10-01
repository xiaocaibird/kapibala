# Agent 模型阶段准入：实现、定向证据与剩余时限边界

2026-10-01。基线 `f2ae3b16b432eb5755341a260d8e92c8527374a7`，产品及开发测试固定源 `d09330434065ecda3aaf72755160efa31ee26ee6`，分支 `agent/qa-deadline-stage-budget`。原 `agent/qa-strict-deadline-followup` 分支及证据保留。本次不改原文、QA 资产、观察器、witness、外部协议、活动计量或通用数据库层；未合 main、未 push。根后续集成不作为本报告已执行源。

**模型循环不足完整配置时间仍派发的问题已修；普通受控模型循环已在 60 秒内停止。CAP-003、AGENT-025 的任意负载严格上界，以及 AGENT-028 的五秒物理返回上界，仍不声明通过。**

## 契约解释与实现

原文 A5.2 第 258 行规定从 run 创建起累计 60 秒上限，同时规定每轮 `/agent/turn` 超时配置为 10–15 秒。第 164 行规定 `wall_clock → failed`；原文没有必须用满 60 秒的下限。此前 QA 下限误约束的澄清及旧失败均保留于 [上一批报告](strict-deadline-followup-20261001.md)，不回填旧结果。

`agent.ts:494` 在模型前活动检查点完成后，以及持久化 `inflight_turn` 和序列化请求之后，均用真实剩余预算与现有 `turnTimeoutMs` 比较。剩余不足该轮完整配置窗口时不派发，按既有终态路径结束；已派发模型仍使用完整配置超时，不再把 10–15 秒任意裁成剩余的不足一轮时间。前一轮已完成的 assistant、工具结果、步骤和 history 保留；未开始的新一轮不伪造 `TURN_TIMEOUT` 或步骤。不预付时间，不截断 `active_ms`。

这里明确扩展 `wall_clock` 的公开解释为：**累计活动上限已经耗尽，或真实剩余预算不足以准入下一完整配置的模型轮次**。因此它不再只表示实际已经消耗满 60000ms。未增加新的结束原因或协议字段。此策略是基于既有阶段配置的准入选择，不是任取若干毫秒的终态安全余量；也不承诺配置超时在 Node 调度下是物理硬实时上界。

## 固定版本验证

[修前反例](evidence/stage-budget-before.tap) 在基线产品上执行三个新准入测试：4 项中 3 失败、1 跳过，均观察到剩余不足配置窗口仍发出模型请求。最终固定源的 [合跑日志](evidence/stage-budget-final-focused.tap) 为 **79 项，76 通过、0 失败、3 跳过**，118001.278958ms。构建、类型检查、原文校验均成功。三个跳过项是既有可选长测试：默认 12 秒模型、连续三次五秒审计、旧一分钟模型循环；不计作通过。本次另外真实执行了配置 10 秒与 15 秒超时、实际 8 秒模型循环及一次终态锁反例。

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 AGENT_TERMINAL_LOCK_EXPERIMENT=1 \
  BACKEND_EVIDENCE_MINUTE=1 CORE_AUTOMATION_TIMING_TESTS=1 \
  DATABASE_URL='postgres://kapibala:kapibala@127.0.0.1:61448/kapibala' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/agent-stage-admission.test.ts \
  tests/integration/agent-dispatch-budget.test.ts \
  tests/integration/kick-dispatch-budget.test.ts \
  tests/integration/agent-capacity.test.ts \
  tests/integration/agent-delivery-deadline.test.ts \
  tests/integration/automation.test.ts \
  tests/integration/core-automation-timing.test.ts \
  tests/integration/qa-agent-minute-evidence.test.ts \
  tests/integration/qa-backend-lifecycle.test.ts
```

三个准入反例用真实 PG 持久活动分别为 50500 / 48500 / 45500ms，配置分别 10000 / 12000 / 15000ms；最终记录 50519 / 48518 / 45531ms，请求数均为零，状态 failed/wall_clock，零虚构步骤。另以真实 `pg_sleep` 延迟模型 intent 写入，初始余量 12200ms 在写入后不足 12000ms：实际 395.40ms 后结束、持久活动 48173ms、请求数零，证明第二次派发前检查有效。

[首次关联运行](evidence/stage-budget-related-initial.tap) 65 项中 58 通过、3 失败、4 跳过，保留原始结果。失败来自旧测试假定：70ms 剩余仍启动模型，以及两个时钟所有权测试仅剩 1 秒却依赖新模型启动。前者改为验证拒绝不足预算模型；后两者保留原所有权/初始化/停机计量断言，仅把起始持久活动调至 47000ms，使合法 12 秒模型可准入。短预算审计/kick 测试改用真实已保存的 ready 工具/history 恢复夹具，继续验证工具阶段，避免借不合法的新模型请求进入阶段；不冒称这些预存历史来自当次真实模型。

## 有改善的常规路径与未满足条件

[派生分析](evidence/stage-budget-analysis.json) 可由原 TAP 的诊断恢复；原 TAP 不改写。真实本地 HTTP 8 秒模型与读工具循环本轮发出 6 次请求：完整活动区间 `[48125,48136]ms`，创建至终止决定 `[48125.696833,48131.839875]ms`，终态被观察到 `[48129.718833,48135.847583]ms`，持久活动 48132ms。结果 failed/wall_clock，已完成工具结果保留，没有虚构第七轮超时。**这一受控路径低于 60000ms；不是独立 QA 验收，也不是任意负载保证。** 原 witness 测试仍标 measurement-only，严格时间判断来自所列原始区间。

只做了一次真实终态锁实验：实际模型立即返回 final，真实决定区间相对创建仅 `[51.673,57.756292]ms`。保持 group 行锁直到创建区间上界后 61000ms，并在释放前读到 run 仍 running、真实 final 步骤/history 已保存。解锁后状态 finished/final、一次模型、零审计/网关，持久活动 60595ms，没有裁剪。原诊断 `commitElapsedMs=[61015.776125,61021.839584]` 实际含义是本地收到提交完成 lifecycle 回调的观察区间，**不是 PostgreSQL COMMIT 的精确物理时刻界**。锁持有与释放前仍 running 的事实直接证明终态存储被拖过上限。测试 PASS 代表反例成立，`strictCommit60000Result=FAIL` 保留，不称严格上限通过。

五秒等待复跑的四个真实表锁分别得到 5110.27 / 5121.11 / 5108.20 / 5122.67ms 后 `SEND_TIMEOUT`；过期读取没有改写真实消息/账号状态，后续同 key 仍能读到当前事实。及时 sent 的账号锁反例为 6.28ms、账号查询零、结果返回时锁仍持有。七个专门等待测试以 `host.completeStep` 内存收集结果，**本身不证明真实 history 提交或完整 Agent 恢复**；关联生命周期消费者另测持久历史。本次没有给在途 SQL 增加取消机制，也不遗弃后台查询，所以依然不能保证锁等待时五秒内物理返回。原文“5 秒后”不通过提前返回超时规避。

其他实际尾差也原样保留：配置 10/15 秒模型超时分别观察为 10010.08 / 15010.43ms；已准备审计的延迟 intent 反例实际活动 60176ms、零审计派发；kick 的迟到写入/序列化测试也保留超过 60 秒但零迟到派发的记录。模型准入没有解决这些阶段。已有远端副作用的未知结果不改写为失败，不删必须的历史或终态。单纯缩小下一阶段窗口不能为 Node 停顿、数据库锁/提交、已派发多阶段工具提供最坏界；通用 DB 取消/硬实时设施不在本局部修复中。

## 资源与证据完整性

使用新建专属 PostgreSQL 17 容器 `kapibala-stage-budget-20261002`（名称不表示执行日期；实际 UTC 创建为 2026-10-01）、端口 61448、匿名卷，标签 owner=cap009-repair/task=stage-budget。[资源记录](evidence/stage-budget-resources.json)保存完整 ID、镜像与卷名。[清理记录](evidence/stage-budget-cleanup.json)确认临时库与连接为零、两名已记录 guardian 已退出、按完整自有 ID 删除容器及卷并确认不存在。测试夹具清理回调已执行，但临时目录没有逐路径登记，不能声称有独立逐目录清理证明。

未读取密钥，命令显式移除三个模型凭据环境项，未调用真实付费模型，未启动或修改演示环境。复用依赖的临时符号链接在交付时移除。[SHA-256 清单](evidence/stage-budget-sha256.json)涵盖原始日志、派生分析和资源记录；构建及原文日志均保留，原文 SHA-256 为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。
