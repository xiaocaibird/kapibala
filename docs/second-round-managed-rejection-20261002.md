# 第二轮集成：托管目标拒绝跨 work cutoff 的最小修复

2026-10-02（北京时间）。这是固定组合候选 `f639ee75c5559f3ee8923af5dcbb53e9b41b168c` 的研发复现与修复记录，不是独立 QA 验收。工作分支为 `agent/second-round-managed-rejection-fix`；未操作 QA 目录、QA 环境或演示数据库。

## 问题与改动

真实路径为：审计通过、初次身份检查通过、容量准入后，保存 `dispatching` 意图的 SQL 等待 `agent_steps` 行锁；等待期间目标变成平台托管身份，且 kick work cutoff 已触发、总预算尚未到期。锁释放后最新身份检查抛出本地 `AppError/POLICY_DENIED`，真实 HTTP kick 尚未开始。

组合候选只在最后的工具错误映射中处理 `POLICY_DENIED`，没有把它纳入位于预算未知分支之前的明确拒绝处理，因此错误地留下“外部结果未知”的 `recovery_note`，步骤仍为 `executing`。已请求取消的同一场景也被提前按 `wall_clock` 结束。

本次仅把 **本地 `AppError/POLICY_DENIED`** 纳入已有明确拒绝处理，并保留 `POLICY_DENIED` 映射，沿用 `completeStep` 和 `settleAfterKick`。gateway 的 `beforeDispatch` 在真实 `gateway.request` 之前调用，当前该异常来自托管目标复核。`AppError` 与 `RemoteError` 是两个独立类型；远端解析仍可带任意 code，因此不把同名远端错误视作本地未派发证明。

没有修改 60 秒活动上限、15 秒首次 POST 时限、17 秒准入、2 秒收尾、所有权取消、已有远端未知结果处理或持久化失败处理。修复后无取消场景保存拒绝结果，再因剩余预算无法接纳下一模型轮而按 `wall_clock` 结束；取消场景保存当前步骤后按原优先级结束为 `cancelled`。

## 真实复现与验证

新增开发测试为 [`kick-managed-rejection-budget.test.ts`](../tests/integration/kick-managed-rejection-budget.test.ts)。用合法持久化工具步骤和 `active_ms=42600` 进入恢复路径，保留约 17.4 秒原总预算；使用真实 PostgreSQL 行锁以及 `pg_stat_activity` 等待事实。产品真实 work abort 事件到达后再等待 100 毫秒释放锁，不替换时钟、产品 timeout、HTTP 结果或完成逻辑。

同一测试原样执行，原始日志和源码均保存在[独立证据目录](evidence/second-round-managed-rejection-20261002/)：

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 无取消 | FAIL：0 POST，但有未知恢复说明；步骤 executing、无工具错误 | PASS：0 POST，步骤 complete、`POLICY_DENIED`，恢复说明 null；run failed/wall_clock |
| 已请求取消 | FAIL：0 POST，但有未知恢复说明；run failed/wall_clock | PASS：0 POST，步骤 complete、`POLICY_DENIED`，恢复说明 null；run cancelled/cancelled |

修复前 2 失败、修复后 2 通过，均无跳过。两次 after 中，锁释放分别晚于实际 work 信号 108.761 / 108.171 毫秒，terminal COMMIT 相对启动为 15538.230 / 15541.130 毫秒，均小于原剩余 17400 毫秒；hard budget 信号均未出现。两场景各保存一次工具结果及历史，1 次审计、0 模型轮、0 gateway 请求，完成后额外 tick 未发生派发。原始事实见 `before.txt.gz`（原日志无损压缩）、`after.tap`，提取值见 `boundary-summary.json`。

相关回归覆盖托管目标、真实容量等待、派发准入、取消优先级、明确成功/拒绝跨 work cutoff、保存失败传播和未知结果不重放：`related.tap` 为 31 通过、0 失败、1 个既有 opt-in 实验跳过。随后单独启用该完整初始运行实验，`initial-run-settlement.tap` 为 1 通过、0 失败、0 跳过：实际 1 次 POST、1 次确认 GET、1 次替身效果，真实未知结果保留不重放，创建至终态提交的保守上界 58020.214 毫秒，小于原 60000 毫秒。类型检查/边界检查及原始需求 SHA-256 校验分别见 `typecheck.txt`、`original.txt`。

## QA 独立故障窗口契约

以下公开说明故障位置、可控外部边界和所需事实；由 QA 独立维护自己的用例与断言，不导入 `AgentTools` 或直接调用私有方法。开发新增测试用既有执行观察器把持锁时机定位到真实 SQL，不能因此宣称已完成下面 HTTP 驱动路径的独立黑盒验证。

1. 在 QA 自有数据库与服务中，使用真实服务 HTTP 和独立 Agent/gateway 协议替身：`POST /agent/turn` 返回合法 `kick_user`，目标最初为普通外部身份；`POST /agent/audit` 可受控等待后返回 pass。群须可写、启用自动踢人、存在在线管理员。gateway 记录请求入站、请求体关联及实际效果账本，不能仅保存总调用数。
2. 在返回审计 pass 前安装本用例专属 SQL 故障门，**只阻塞意图从 `awaiting_admission` 变成 `dispatching` 的那一次 UPDATE**。可直接抢占已定位的真实 `agent_steps` 行锁；若 HTTP 场景下难以无竞争地抢锁，可在专属库装以下受限定的 SQL trigger，让该 UPDATE 等待另一连接持有的真实 gate 行锁。该方案不替换产品方法、返回值或时钟；本次开发测试实测的是直接 `agent_steps` 行锁，trigger 方案由 QA 独立接入核验。

```sql
-- 仅在本用例独占数据库安装；工具 id 由该用例的 Agent 替身返回。
CREATE SCHEMA qa_managed_fault;
CREATE TABLE qa_managed_fault.gate (id integer PRIMARY KEY);
INSERT INTO qa_managed_fault.gate VALUES (1);
CREATE FUNCTION qa_managed_fault.hold_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name = 'kick_user'
     AND NEW.tool_use_id = 'qa-managed-window'
     AND OLD.intent->>'dispatchState' = 'awaiting_admission'
     AND NEW.intent->>'dispatchState' = 'dispatching' THEN
    PERFORM id FROM qa_managed_fault.gate WHERE id = 1 FOR UPDATE;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_managed_dispatch_wait BEFORE UPDATE ON agent_steps
FOR EACH ROW EXECUTE FUNCTION qa_managed_fault.hold_dispatch();
-- 独立控制连接先执行并保持事务，再让审计 HTTP 返回 pass：
BEGIN;
SELECT * FROM qa_managed_fault.gate WHERE id = 1 FOR UPDATE;
-- 到下述放行条件后在这条控制连接 ROLLBACK。
```

3. 独立观察连接必须同时取得：本 run/ordinal 的 `state='executing'`、已提交 `intent.dispatchState='awaiting_admission'`、`audit_verdict='pass'`；以及 `pg_stat_activity` 中对应 `UPDATE agent_steps SET intent=…` 的真实 `wait_event_type='Lock'`、`pg_blocking_pids(pid)` 指向本用例控制连接。记录数据库身份、backend PID、run/tool/step、查询与捕获窗口。不能只根据“脚本已发出锁命令”认定产品已卡住。
4. 确认上述窗口后，在独立事务把一个本用例账号的 `accounts.platform_user_id` 更新为目标平台身份并提交；保留前后 SELECT 和提交事实。这样初次检查已经通过，而派发前复查将读取托管身份。取消分支通过管理员 `PATCH /api/groups/:id` 提交 `{ "agentEnabled": false }`，并核对响应与同库 `agent_runs.cancel_requested=true`；无取消分支保持启用。
5. 使用已交付的显式工程入口和 HTTP 观察契约 [`qa-runtime-observation`](qa-runtime-observation-adapter.md) / [生命周期观察](qa-backend-evidence-followup-20261001.md)：`PUT/GET /qa/runtime/v1/leases/:uuid`，`mode='observe-agent-lifecycle'`，关联真实 group/run，`toolUseId='all-run-steps'`。读取同 run/step/attempt 的真实 `kick-work-budget-signal-aborted`，保留 `budgetMs/workBudgetMs/settlementBudgetMs`、`signalObservedWindowMs`、clockDomain 和完整事件前缀。收到该事实后立即按本用例的小延迟释放真实 SQL 锁，保留控制连接 ROLLBACK 的请求/响应窗口；hard 信号不能已到期。跨进程单调时钟不能直接相减；因果顺序来自已收到真实 signal 事件后才发出解锁请求。没有信号事实或历史被截断时，只能记为窗口未证实，不能从已等待约 58 秒推定命中。
6. 通过管理员 `GET /api/agent-runs/:id` 和独立 SQL 观察终态：步骤 `complete / is_error=true / error_code=POLICY_DENIED`，对应工具结果和 history 各真实保存一次，`recovery_note IS NULL`。无取消分支为 `failed/wall_clock`；取消分支为 `cancelled/cancelled`。保留实际 `agent-step-save-transaction` 与 `agent-terminal-committed` 的 COMMIT returned 边界，结合既有同域活动见证判断原总预算，不把 HTTP 查询返回时刻当提交时刻。
7. 未派发的证据必须组合：已定位的实际派发前 SQL 等待、身份变化提交、真实 work cutoff、后续已提交 `POLICY_DENIED`、完整生命周期中无 `kick-post-dispatch`，以及 gateway 请求/效果账本无该关联操作。**0 HTTP 单独不能证明未派发**；`dispatching` 标记本身也不能证明 HTTP 已发生。若保存失败或进程中断，只剩该持久意图，仍按原恢复规则保守处理，不以控制器的内存观察授权重试。

普通外部目标应有配对的正向 HTTP 对照；QA 自行选择独立覆盖范围。清理时先释放控制连接事务，再移除本用例 trigger/function/schema 和对应观察租约；不清理共享模式、别的测试资源或整个会话目录。以上是工程故障注入契约，不新增生产 API；正常服务入口不会因环境变量自动安装观察器。

## 资源与证据边界

独立容器 `kapibala-managed-rejection-20261002`，PostgreSQL 17.11（`postgres:17` 固定镜像 ID 见 `environment.json`），监听 `127.0.0.1:63669`。数据目录用容器专属 tmpfs，没有外部卷。各测试通过既有 fixture 创建 UUID 临时数据库，逐例回收。资源最终清理结果见 `cleanup.json`。

`tool-execution-before.ts.txt` 来自固定候选，`tool-execution-after.ts.txt`、`fix.patch.txt` 和 `reproduction.test.ts.txt` 保存被测源；`commands.txt` 记录命令，`SHA256SUMS` 校验证据文件。具体提交以包含本记录的修复提交及其父提交为准，避免文档自引用提交号。

本次新增测试是原时限下的后段边界复现，不把已记账的 42.6 秒伪称为本轮现场运行，也不单独宣称整个 60 秒活动链证明。它不证明任意基础设施阻塞下必然完成，不闭合既有未知外部效果协议缺口；完整组合回归和第二轮独立 QA 仍按各自实际候选与证据记录。
