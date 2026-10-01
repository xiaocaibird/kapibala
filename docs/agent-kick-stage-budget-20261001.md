# Agent 首次 kick POST 准入预算

2026-10-01。基线 `f43fb9990c0e540f42fafc4a6b5ffc29f637a954`（模型阶段修复 `d093304` 已在其中），产品及测试固定源 `59865eea62007809f87a7971ad19c01d7c1ef028`，独立分支 `agent/qa-kick-stage-budget`。本次按根协调的 D048 授权扩展内部阶段准入，不修改原文、QA 资产、观察器、witness、外部协议或活动计量，不合 main、不 push。模型阶段的历史失败、单次 61 秒终态锁反例及清理记录仍保留在[前批报告](agent-stage-budget-followup-20261001.md)，未重复该锁实验。

## 实现范围与语义

`core/messaging.ts` 导出的 `KICK_POST_TIMEOUT_MS=15000` 同时用于网关真实首次 `/kick` POST 超时和 Agent 首次派发准入。准备事务完成后，以及现有同步派发 guard 每次执行时，如果真实剩余活动预算不足 15000ms，则结束 run 为 `failed/wall_clock`，不再等待容量或首次派发。请求体序列化后的 guard 继续由真实 RemoteClient 执行。没有任取终态安全余量，也不预扣 15 秒活动。

门槛放在既有政策、审计和准备事务账号检查之后，未改这些检查的先后。`awaiting_admission` 仍证明没有首次 HTTP；已经提交 `dispatching` 后在 fetch 前拒绝，当前进程虽知道未派发，仍保留该持久状态，避免终态提交失败后重启误重放。已派发后的超时、未知效果、确认查询与成员刷新不接收首次准入门槛，其既有恢复处理不变。审计 pass 与 assistant tool_use 历史保留，不伪造 `kicked:false`、失败 tool_result 或新的模型轮次。

`wall_clock` 此处也表示“预算不足以容纳下一个必要远端阶段的完整现有超时窗口”，不只表示已经消耗满 60000ms。与原文明定的模型 10–15 秒不同，kick 的 15 秒是本实现已有的首 POST 配置；它是明确的内部准入策略，**不是原文另加的工具超时要求，也不是整个 kick 完成预算**。后续 unknown 确认、成员读取分别还有自己的 15 秒，确认前还有 2100ms 等待；没有把整个链硬编码为一个预留值。

该策略会更早结束已记录、尚未完成的当前工具。既有 run 循环先处理 pending step，完成后才检查取消；本次保持此顺序。因此容量一直不可用且工具尚未完成时，即使已收到 `cancel_requested`，仍可能以 `failed/wall_clock` 结束并留下未完成步骤；不声称取消优先或工具已完成。若本地政策、账号或群状态先得出明确错误，仍完成相应错误工具结果，并按原循环继续或取消。

## 反例、定向测试与证据角色

[修前反例](evidence/kick-stage-before.tap)不是初始不足预算：真实 PG 中预存合法工具/history 及 43800ms 既有活动，开始执行时约有 16200ms；审计真实返回一次 pass，同时七个真实 advisory lock 持有者使 `tryWithLock` 容量不足。首次真实 `LockCapacityUnavailableError` 在执行开始约 54.32ms 到达，随后等待 2498.28ms、实际拒绝 44 次，run 仍 running，持久活动 46302ms、零 kick。[来源](evidence/kick-stage-before-source.json)记录基线与开发测试 SHA。预存历史是恢复夹具，不能冒称来自这次实时模型调用。

产品修后同一开发反例确实先拒绝并持续等待，再跨越首请求准入门槛：固定源最终运行中首次拒绝约 53.33ms、共 21 次、拒绝间等待 1121.26ms；1245.26ms 后观察到 failed/wall_clock，持久活动 45030ms、零模型、一次审计、零 kick。没有改初始活动来直接绕开容量拒绝，也未改 QA 标准。

补充真实 PostgreSQL / 本地 HTTP 回归覆盖：

- 准备事务真实 `pg_sleep` 跨过 15 秒剩余门槛后不进入容量准入；同步阻塞跨门槛及原 60 秒 deadline 定时器已触发时不 fetch。
- `dispatching` 提交后本地 guard 拒绝且终态 UPDATE 故障，替换 Agent 仍暂停该未知持久 intent，不重放。
- 首 POST 已确认、剩余降至 15 秒以下时仍实际 GET members 并记录真实 `{kicked:true}`；首次 POST 返回真实 504 后实际进入确认 GET，原 run deadline 到达仍保留未知效果，零重复 POST。
- 低于 15 秒时 `POLICY_DENIED`、`NO_AVAILABLE_ACCOUNT`、`GROUP_UNREACHABLE` 各自保留；政策/账号错误后仍足够新的 12 秒模型，则继续并真实 final。当前工具完成后的取消和未完成时预算结束分别验证。
- 常规容量释放后完成、一次审计、一次派发；成员政策在等待中变化会重新检查，历史不丢失。

旧的 59xxx 活动值派发测试会被正确的新门槛提前阻止，不能继续冒称测试了在途请求。因此这些测试的前置活动改为约 44xxx，并保留真实耗时跨阶段门槛或完整 deadline；在途未知测试仍真的发出一次 POST 和确认 GET。`automation.test.ts` 的接口级未知效果测试也改为实际可准入的 44000ms 起始活动并真实等到原截止；该接口桩不冒称真实网关证据，实际 HTTP 路径另由上述测试覆盖。

[首次关联合跑](evidence/kick-stage-focused-initial.tap) 16 项中 14 通过、2 失败，原样保留。两处是新增测试错误预期“低于 kick 15 秒就不能再调模型”；实际尚余约 14.5 秒，足够配置 12 秒模型，在政策或账号工具错误后继续至 final 正确。修正测试预期为 finished/final、一轮真实模型；没有更改产品去符合错误预期。

最终固定源 [关联合跑](evidence/kick-stage-final-fixed.tap)：**93 项，90 通过、0 失败、3 跳过**，102485.466291ms，退出码 0。[构建](evidence/kick-stage-build.log)、[类型检查](evidence/kick-stage-typecheck.log)、[原文校验](evidence/kick-stage-original.log)均成功。三个跳过是既有显式可选长模型/审计测试，不计作通过。这不是全仓回归；根正在另一固定组合源执行全套，结果另记。

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 \
  DATABASE_URL='postgres://kapibala:kapibala@127.0.0.1:55496/kapibala' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/agent-capacity.test.ts \
  tests/integration/kick-dispatch-budget.test.ts \
  tests/integration/agent-dispatch-budget.test.ts \
  tests/integration/agent-delivery-deadline.test.ts \
  tests/integration/automation.test.ts \
  tests/integration/core-automation-repair.test.ts \
  tests/integration/qa-capacity-control.test.ts \
  tests/integration/qa-backend-lifecycle.test.ts
```

上面的短例是从**持久活动 43800ms** 恢复后真实再等约 1.2 秒跨门槛，不代表从零实际等过 45 秒。最终合跑同时执行了原有 DC06 真正持续在线容量等待：从零活动创建 run，真实占用容量并保持至预算终止，观察实际耗时約 **45.05 秒**。终态 failed/wall_clock，持久活动 **45053ms**，容量观察器完整区间 **`[45053,45112]ms`**，独立从创建到最后运行/终态观察区间 **`[45047.172083,45063.542708]ms`**；持有租约仍 held，kick 零次、审计一次，释放容量后再等 1500ms 仍零 kick。没有把 43800ms 预存值冒充实时等待，也没有为凑满一分钟继续运行。DC06 原名包含 uninterrupted budget，其测量角色仍为 measurement-only；这些具体上界低于 60000ms，但不替独立 QA 判定全部验收通过。

[派生分析](evidence/kick-stage-analysis.json)保留两种证据的原始诊断；短例与从零持续在线例分开，不拼接成一次执行。容量控制器、断言及采样定义都没有修改。

## 剩余边界

纯容量不可用时通常在累计活动约 45 秒决定结束；这不是 45 秒硬界。准备 SQL、容量拒绝后的状态写入、终态锁/COMMIT 及 Node 调度没有本工程可证明的最坏耗时界。已有在途副作用也不能仅凭时间过去改写为失败；本次没有新增远端查询能力或取消通用 SQL。

五秒等待仍保留原起点与“5 秒后”超时，不能通过提前返回消除尾差；已启动 SQL 的真实锁等待仍可能跨五秒。前批单次真实 61 秒终态锁反例继续适用，未重跑或删掉。已准备审计阶段没有在本批新增准入门槛，迟到 intent 仍可能造成超过 60 秒但零迟到审计派发。**本次不声明 AGENT-025 / CAP-003 在任意负载下严格 60 秒、或 AGENT-028 五秒物理返回上界全部通过。**

## 资源与清理

本次新建专属 PostgreSQL 17-alpine 容器 `kapibala-kick-stage-20261001`，完整 ID `007a978e921bf42f6644b06380a6bbd52438030c47dfaf80075fd49ad7473bbf`，端口 55496，标签 owner=cap009-repair/task=kick-stage；[资源记录](evidence/kick-stage-resources.json)保留镜像与匿名卷。各用例使用独立临时库，日志共记录 56 个库名。测试完成后确认临时库和连接为零、六个记录的 guardian PID 均已退出，再按完整自有 ID 删除容器和匿名卷，二次确认不存在，见[清理记录](evidence/kick-stage-cleanup.json)。测试目录清理回调已完成，但没有独立逐路径清理记录，不夸大为逐目录核验。

依赖软链已移除；未读取模型密钥，命令显式移除三个模型凭据环境项，未调用真实付费模型，未碰演示环境或用户数据。[来源](evidence/kick-stage-final-source.json)记录固定测试源、产品文件 SHA-256 和完整命令；[证据 SHA-256](evidence/kick-stage-sha256.json)覆盖原始失败/成功日志、派生分析与资源清理记录。
