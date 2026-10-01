# Agent 发送等待：局部数据库超时与观察事实边界

2026-10-01。基线 `a6843fa4205e80c2c2c1adba3bbb5d515a739433`，产品及开发用例提交 `63c421205b91f57dc34d2caf6909be5f56f3bdd9`，独立分支 `agent/qa-delivery-bounded-read`。按 D048 的内部技术取舍授权完成局部修复，未修改原始需求、QA 资产、外部协议或演示环境；本分支不自行合 main、不 push。

**发送等待现在可在真实表锁仍被持有时结束本轮观察，不再等到锁释放才收敛。AGENT-028 严格五秒物理返回仍未满足，不因本次开发用例通过而关闭。**

## 实现与保证边界

`tool-execution.ts:359` 使用同一进程的单调时钟建立一次 `min(5000, remaining)` 截止点，不重置窗口。每轮观察通过新增的 `delivery-observation.ts` 取得连接，开启只读事务；每条实际 SELECT 前在事务内设置 `lock_timeout=min(50, remaining)ms`、`statement_timeout=min(100, remaining)ms`，且最小值为 1ms，避免以 0 意外禁用超时。50ms 与 100ms 是本轮开发侧的局部读取切片选择，不是新的业务时限或外部服务能力。

两条读取保持串行：先读取消息，及时的 `sent` 立即作为确定结果，跳过账号读取；其他状态才读取账号并沿用原判定。`MessagingService`、gateway 转发、`Messages.getMessage` 增加可选 `Queryable`，消息投影仍由 gateway 管理。

只有受控 SELECT 返回的 PostgreSQL `55P03 + canceling statement due to lock timeout` 或 `57014 + canceling statement due to statement timeout`，才被视作本轮没有取得新事实。不能只按错误码判断：用户取消也可使用 `57014`。配置阶段错误、其他 SQL 错误、外部取消、连接失败以及无法识别的本地化消息均继续传播。服务端已经应答取消后，必须串行等待 `ROLLBACK` 成功，清除事务和 `SET LOCAL` 设置，才能复用连接并继续原窗口；失败连接或清理失败销毁连接并传播错误。没有以 `Promise.race` 或客户端计时器遗弃在途查询。

每次读取前后及清理后检查所有权。**观察及时性在读取及回调结束时固定**：如果五秒内已经取得确定结果，随后成功清理稍晚返回不能把该事实改成 `SEND_TIMEOUT`；真正超期的读取不采纳。清理失败、连接失败、所有权丢失仍优先传播。无新事实则继续等待原窗口，到期只生成工具结果 `SEND_TIMEOUT`，不把持久消息状态改成失败。同 key 后续调用仍读取原消息，不重审、不重发。

这只限制 PostgreSQL 侧每条读取的等锁和执行时间。连接池获取、设置命令/网络传输、清理、事件循环停顿仍不具备物理硬上界；服务端计时从命令到达 PostgreSQL 开始，也不覆盖这些阶段。原文“5 秒后”不能以提前返回超时来规避，Node 定时器也不保证精确时刻回调。要在任意负载下声称 `<=5000ms`，仍缺少资源与运行时保证；这里没有给原标准增加容差。相关机制见 [PostgreSQL 17 超时说明](https://www.postgresql.org/docs/17/runtime-config-client.html) 与 [Node 24.21 定时器说明](https://nodejs.org/download/release/v24.21.0/docs/api/timers.html)。

## 定向验证结果

[最终定向原始日志](evidence/agent-delivery-observation-20261001/focused-final.tap)在固定提交执行，**21/21 通过，零跳过**。[关联日志](evidence/agent-delivery-observation-20261001/related-final.tap)包括新增只读观察检查和现有自动化、序列、跨群消费者，**22/22 通过，零跳过**。两组有 7 个重复用例，共 36 个不同用例。关联运行在提交前、代码与最终提交相同的源上执行。服务端 TypeScript 检查退出码为 0，见 [检查记录](evidence/agent-delivery-observation-20261001/manifest.json)。未重跑全仓回归或前端构建，最终整合由主任务执行。

| 场景 | 实际结果 | 结论边界 |
| --- | --- | --- |
| messages 锁，原 accepted/online | 5005.637042ms；返回时锁未释放 | 原窗口未缩短；严格五秒仍超限 |
| accounts 锁，原 accepted/online | 5003.628417ms；返回时锁未释放 | 32 次受控账号观察；之后同 key 恢复 |
| messages 锁，原 failed/online | 5004.187042ms；返回时锁未释放 | 未读到失败前不捏造失败；后续读取真实失败 |
| accounts 锁，原 accepted/suspended | 5011.218375ms；返回时锁未释放 | 33 次受控账号观察；之后返回真实账号终态 |
| sent 已确认，账号仍被锁 | 4.338416ms；账号查询 0；锁未释放 | 已知发送结果不受无关账号锁影响 |
| 本轮超时后解锁并确认发送 | 当前调用内取得 sent | 没有因为一次本地 SELECT 超时提前结束工具 |
| cancelled/failed/unknown 与同 key 恢复 | 分别保持原事实；后续均可读 sent | 无新审计、无新网关发送，映射仍唯一 |
| 服务端 statement timeout | 约 109.20ms 返回本轮 retry；同连接可复用 | 原 `pg_sleep(1)` 已被服务端取消，设置归零、无空闲未结束事务 |
| 真实 query cancel、连接终止、其他 SQL 错误 | 均向上抛出 | 不冒充本轮读取超时 |
| ROLLBACK 失败、清理期间丢失所有权 | 均向上抛出；未确认清理的连接丢弃 | 不产生假 SEND_TIMEOUT |
| 及时读取但成功清理晚返回 | sent/accepted/failed 均保留 | 宿主给定 100ms 窗口、真实 PG ROLLBACK 完成后受控延迟回传 150ms；只证及时性语义，不证完整五秒物理时限 |
| SELECT 结果晚于窗口交付 | 返回 retry，不交付迟到事实 | 真实 SQL 结果的客户端完成回传受控延迟，原截止点不移动 |

原四个表锁历史结果 5108–5123ms 继续保留在 [阶段准入报告](agent-stage-budget-followup-20261001.md)；其场景按 5100ms 释放锁，本次则确认返回时锁仍持有，因此不能将两批数字当作同条件性能基准。改善的核心证据是**不再依赖表锁先释放**，不是保证某个优化百分比。所有完整五秒测量尾差原样保留于 [派生观察表](evidence/agent-delivery-observation-20261001/observed.json)，不向下取整。

等待用例通过 `host.completeStep` 在内存收集工具结果，单独不证明真实 history 提交或整个运行的严格终态时限；关联用例覆盖现有持久化消费者，但也不替代独立 QA 验收。

首次新用例运行有一项准备数据失败：`failed` 消息漏填数据库约束要求的 `fail_code`，得到 `23514`，产品等待逻辑尚未执行；只修复该夹具，未放宽业务断言，保留 [原失败日志](evidence/agent-delivery-observation-20261001/delivery-initial-fixture-failure.tap)。随后复核发现及时结果被清理尾差覆盖的语义风险，已按上文修复并增加反例。未把任何一轮失败回填成通过。

固定源最终定向命令：

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 \
  DATABASE_URL='postgres://delivery_test@127.0.0.1:64961/postgres' \
  node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/integration/agent-delivery-deadline.test.ts \
  tests/integration/agent-delivery-observation.test.ts
```

关联文件为 `agent-delivery-observation.test.ts`、`core-automation-closeout.test.ts`、`core-automation-repair.test.ts`，同一独立数据库、串行文件执行。只使用本地测试模拟服务，未访问真实模型或读取密钥。

## 资源与交付

[资源记录](evidence/agent-delivery-observation-20261001/resources.json)登记本轮独有 PostgreSQL 17 容器、镜像、64961 回环端口和匿名卷。其认证仅为专属回环测试环境的无密码 trust，并非产品部署建议。[清理记录](evidence/agent-delivery-observation-20261001/cleanup.json)证明临时数据库与连接均为 0，容器和匿名卷已删除，临时依赖符号链接已移除，所指共享依赖保留。首次直接删除运行中容器被 Docker 拒绝，随后停止并删除该自有容器；如实记录该清理顺序。

原始日志、派生结果、资源和清理记录由 [SHA-256 清单](evidence/agent-delivery-observation-20261001/manifest.json)关联。无需新增用户技术审批；本修复只补齐可直接执行的局部读取控制。QA 原始五秒标准及既有未通过结论均保持，不能用本报告宣称严格五秒已经通过。
