# Agent 时间边界：迟到读取修复与严格上限复核

2026-10-01，基线 `92ddc1db983e8454ee363a4b75998df8998b904a`，独立分支 `agent/qa-strict-deadline-followup`。产品修复依次为 `007cfac5ef69b2aa7c304c9f2653ccb21230a52e`、`9d701a4e2e86a6f0544b63f47a2d3ba4670141f2`；测试后 `136a34b31cccccdb6bd8d0d1b1c781c0887142b6` 只格式化一处条件换行，生成的 JavaScript [逐字一致](evidence/strict-deadline-format-equivalence.json)，未把它冒称为重新执行全套。只改 Agent 工具等待及新增开发定向测试；未改原文、QA 资产、观察器、witness、通用 DB、活动计量或外部协议，未合 main、未 push。

**确定的迟到观察及多余读取问题已修；AGENT-025 / CAP-003 严格 60000ms 与 AGENT-028 严格 5000ms 尚未闭合，不标 PASS。**

## 修复的真实行为

`apps/server/src/modules/automation/tool-execution.ts:354` 的 `waitForDelivery` 保留原 `Date.now() + min(5000, remaining)` 起点和预算。原代码每轮等待消息查询和账号查询完成后，直接采用返回值，即使查询已跨过期限也能返回 `accepted` / `sent`。

- 每轮开始、消息读取后、账号读取后均使用同一个原 deadline。过期消息观察不再启动账号查询，过期账号观察不再用于本次工具结果；返回 `SEND_TIMEOUT`，不改消息或账号的持久事实。
- 期限内已经读到 `sent` 时立即返回。原逻辑本已规定 `sent` 不受账号随后终态影响，却仍做账号查询；该查询没有决定作用，可能把已知成功拖到超时。本次删除这段无关等待，`accepted` 仍需账号检查。
- 保持串行 await，不另起竞速 Promise 或遗留后台查询。DB / 所有权异常原样逃逸，不转成超时，不完成步骤。未给查询增加取消能力，因此已经在途的 DB 读取仍可能超过五秒。

两个真实表锁反例在[修前](evidence/strict-deadline-delivery-before.tap)分别等待 **5115.42 / 5121.52ms** 后错误返回 `accepted`，消息读取超期后还发起账号查询。修后返回超时并保留真实阻塞耗时。独立复核发现的“及时 sent + 账号表锁”[修前反例](evidence/strict-deadline-sent-before.tap)等待 **256.22ms**、查询账号 1 次；最终固定源返回约 **5.13ms**、账号查询 0 次，返回时真实账号锁仍持有。该性能数字只描述本次反例，不作为任何环境的时限保证。

## 定向测试及其证据边界

新增 `tests/integration/agent-delivery-deadline.test.ts` 7 例，使用真实 PostgreSQL `ACCESS EXCLUSIVE` 表锁、实际 `Messages.getMessage`、实际 `AgentTools.executeStep`、原五秒预算，无假时钟：

1. 迟到消息 `accepted`、迟到账号 `online` 均返回超时，后续同 key 能读到 `accepted`。
2. 迟到消息 `failed`、迟到账号 `suspended` 均先返回超时，持久事实不改，后续同 key 返回 `SEND_FAILED`。
3. 零剩余的 delivery 等待不读消息或账号；`executeStep` 入口解析已有 key 的一次查询仍保留，不把它描述成整个工具零查询。
4. 阻塞读取期间所有权 signal 中断，返回同一个原异常对象，既不转 `SEND_TIMEOUT` 也不完成 step。
5. 及时 `sent` 无须等待账号锁，即使账号已经 suspended 也保持真实已发送结论。

这些新测试的 `host.completeStep` 是内存结果收集，**不声称它们验证了真实 history 提交或完整 Agent 恢复**。最终合跑另外包含既有真实生命周期、history 同 attempt 和同 key 恢复测试。同 key 的迟到读取反例同时检查无额外审计或发送；它们未新增模拟网关的远端幂等能力。

最终固定源 `9d701a4` 的[关联合跑](evidence/strict-deadline-final-fixed.tap)：**89 项，86 通过、0 失败、3 跳过**，107488.405166ms。其中两条真实一分钟用例是 measurement-only，测试通过仅代表观察流程成立，严格上限结果见下一节。3 个跳过项为既有显式长时间测试，未计作通过。[构建](evidence/strict-deadline-build.log)、[最终类型检查](evidence/strict-deadline-final-typecheck.log)、[原文校验](evidence/strict-deadline-original.log)均成功。

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 BACKEND_EVIDENCE_MINUTE=1 DATABASE_URL='<自有隔离 PostgreSQL>' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/agent-delivery-deadline.test.ts \
  tests/integration/agent-dispatch-budget.test.ts \
  tests/integration/kick-dispatch-budget.test.ts \
  tests/integration/agent-capacity.test.ts tests/integration/automation.test.ts \
  tests/integration/core-automation-repair.test.ts \
  tests/integration/qa-backend-lifecycle.test.ts \
  tests/integration/qa-capacity-control.test.ts \
  tests/integration/qa-agent-minute-evidence.test.ts
```

历史执行原样保留：[首次关联](evidence/strict-deadline-related-after.tap) 75 项中 70 通过、2 失败、3 跳过；其中一处是未提交源码被受控入口拒绝，另一处是容量用例期望 ready、实际 executing。后者不能归因为源码保护。固定 `007cfac` 后[同范围合跑](evidence/strict-deadline-related-final.tap)为 72 通过、0 失败、3 跳过，[容量单跑](evidence/strict-deadline-capacity-recheck.tap) 4/4 通过。另将原始 `92ddc1d` 用 `git archive` 解出到专用临时目录，原容量测试不改，连续三轮各 4/4 通过，见[来源记录](evidence/strict-deadline-capacity-baseline-source.json)及其日志。因此只确认一次未复现的状态断言失败，**没有证实它在固定旧基线同样失败，也没有改原断言**。最终源上的容量测试再次通过不抹掉该观察。开发测试首次类型检查的两处隐式 any 诊断也保留在 initial-typecheck 日志，修正后检查通过。

## 严格时间结论与具体取舍

只读复核 e85 QA 报告及归档字节：AGENT-025 完整活动 `[60011,60023]ms`，创建至实际终止决定 `[60011.182125,60016.268708]ms`；AGENT-028 首次实际等待 `[5000.021625,5000.158]ms`；CAP-003 活动 `[60004,60071]ms`。这些下界违反严格上限，无事实异议。相关归档成员 SHA-256 与 QA 已保存分析一致，[输入索引](evidence/strict-deadline-qa-source.json)保留精确来源。未把普通终态正确或零重复发送当作时间通过。

最终 `9d701a4` 新的[真实一分钟测量](evidence/strict-deadline-minute-analysis.json)同样保留失败：

| 路径 | 活动区间 | 其他真实证据 | 严格 60000ms |
| --- | --- | --- | --- |
| 8 次真实本地 HTTP 模型往返 | `[60002,60014]ms` | 创建至决定 `[60003.017542,60009.628875]ms`；持久活动 60012ms | FAIL |
| DC06 真实容量拒绝 | `[60003,60078]ms` | 独立在线 `[60002.663792,60018.422958]ms`；持久活动 60003ms；未发出 kick | FAIL |

四种强制跨五秒的 DB 读取在修后仍实际等待约 5108–5121ms；本次修的是迟到结果和额外查询，**没有声称解决五秒物理返回上界**。原文第 121 行“5 秒后”才返回 `SEND_TIMEOUT` 的含义保持；不通过提前计时或提前超时消除尾差。

原文第 258 行规定 60 秒上限，第 164 行规定 `wall_clock → failed`，没有“必须跑满 60 秒”这一额外下限。根协调反馈 QA 已确认其下限判断属于误约束；这不回填旧执行结果，也不消除真实决定/派发超过上限的失败。[先前可行性报告](cap003-budget-feasibility-20261001.md)中“不得在真实耗尽前结束”是当时采用的评估条件，不应再当作原文新增的下限。本批仍不擅自改变既有结束原因含义。

源码中终止仍经过 `agent.ts:321` 的真实决定、活动检查点、group 锁、终态 UPDATE、事件及 COMMIT；模型超时后还要保存本次协议步骤/history。Node 调度和数据库锁/提交没有本工程可证明的最坏耗时界。删除必要步骤、截断 `active_ms`、移动观察边界、随意预留若干毫秒都不能证明严格上限。

根任务本轮选择继续交付确定修复，不实施新的阶段准入语义。可选的最小行为变化是：剩余不足下一阶段已有配置上限（模型 10–15 秒、审计 5 秒）时，停止继续业务、如实记账结束。这不是任取 10ms 安全余量，但可能使通常 8 秒的模型循环在约 48/56 秒停止，而且 `wall_clock` 将需要明确表示“预算不足以容纳下一完整阶段”，不能假称实际预算已经用尽；现有协议没有独立的该类结束原因。即使选择它，终态锁和调度仍无硬上界。该选项及行为影响交根统一待决记录，本批未采用、未扩大外部协议。

## 资源、来源与清理

专属 PostgreSQL 17 容器 `kapibala-strict-deadline-20261001`、匿名卷及端口 62221 的创建身份见[归属记录](evidence/strict-deadline-owned-resources.json)。每例由 `temporaryDatabase` 新建 UUID 库。无真实模型调用，测试显式移除真实 Key / Key 文件变量，未读凭据、未触碰演示或用户数据。

[清理记录](evidence/strict-deadline-cleanup.json)确认删除前测试数据库与连接为零，12 个日志 guardian PID 均已退出，自有旧基线临时目录已移除；按完整容器 ID、标签和卷名核验后删除了该容器及唯一匿名卷。fixture 的控制器临时目录清理已执行，但其目录路径未在日志中公开，故不声称有逐路径独立销毁证明。临时依赖软链接仅 unlink，不删除共享依赖目录。

完整测试源、输入和证据摘要见[来源及哈希清单](evidence/strict-deadline-manifest.json)。原文 SHA-256 仍是 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。本报告是开发修复和测量结果，不替代独立 QA 验收。
