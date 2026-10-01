# C1 / C2 合并验证

2026-10-01，分支 `agent/c1-c2-integration`，起点 `68d28d80acb059387af14dcb41a2be62f1d14e12`。保留原 `agent/c1-media-files` 分支，未合 main、未 push。没有修改原文、`qa-acceptance/`、导航、用户 `.env` 或演示资源。

## 来源与合并范围

| 原提交 | 本分支提交 | 内容 |
| --- | --- | --- |
| `9d0e81e` | `5df39f9` | C1 媒体管理主体 |
| `5e3b5ce` | `49f2e20` | 文件打开失败后的响应体释放 |
| `fc5f213` | `82afcdd` | C1 开发证据与清理 |
| `f9398fa` | `f2464d7` | 部分文件移除持久顺序、恢复文件被新限额拒绝后的删除 |
| `ef167e6` | `4cbcd47` | C2 独立 Gemini 服务 |
| `52b62c8` | `f5aac7e` | C2 离线及此前真实 Gemini 证据 |

唯一内容冲突是 `.env.example`，保留 C1、C2 两组配置；该文件是示例，不是用户的 `.env`。源码初次合并为 `f5aac7ef0ab1d597c668ca4fbe3b8d691b900450`。检查了相对起点的 [Agent 差异](evidence/c1-c2-integration-agent-delta.patch)：只增加事务内媒体 pin，没有移除模型、审计及工具派发前的剩余预算检查，没有把 pin 移出事务。

## 初跑发现与局部修复

[全套初跑](evidence/c1-c2-integration-full.tap)在上述 `f5aac7e` 上执行，文件并发限制为 2：**511 项，500 通过、2 失败、9 跳过**。原始失败日志保留。

1. `CR01` 开发迁移测试将“当前 schema 版本”写死为 8；C1 新增 009 后返回 9。仅改为与迁移清单末版比对，保留 008 原子回滚、旧时钟和未知历史收据的全部业务断言。[该文件重跑](evidence/c1-c2-integration-receipt-migration.tap) 6/6 通过。
2. `DC02` 实际容量持有数为 6，而场景应为 Agent 占 1、控制器占剩余 7。C1 媒体 worker 即使空库也每次申请共享执行槽，恰好在控制器占槽时进入，随后又退出。产品增加只读到期工作预检；没有候选就不申请执行槽，进入真实锁后仍重新读取任务。新反例验证空库、未来重试、未到期文件均不申请锁，到期下载及清理仍取得原真实锁。没有调整容量上限、控制器或其断言。

两项局部修复提交为 `0fd4b7de747c18aff3c4a1c6c92656c066a88928`。它只涉及媒体 worker 和两份开发测试；不是对 QA 断言的修改。

## 修后验证与边界

[最终定向合跑](evidence/c1-c2-integration-targeted-final.tap)以 `0fd4b7d` 为产品源，**54 项全部通过，0 失败/跳过**：

- C1 媒体专项 20 项，包括真实 SIGKILL、配置变更后删除、活动引用、并发及空轮询容量反例。
- C2 离线专项 14 项，使用注入供应方或本地模拟响应；入口测试只读取测试自行创建的合成凭据文件。
- Agent 容量及派发预算、确认收据、容量控制器开发回归，覆盖初跑两处失败及相关消费者。

[最终 build](evidence/c1-c2-integration-build-final.txt)、[原文校验](evidence/c1-c2-integration-original.txt)及 diff 检查通过。首轮[构建日志](evidence/c1-c2-integration-build.txt)亦保留。本轮没有在修复后再执行第二次完整 511 项回归，不能把两轮计数合成“全套零失败”。初跑的 9 个跳过项是 6 个显式长时间专项、可选实际一分钟观测、测量用途的真实 WS 阅读实验，以及真实 Gemini 专项；它们未计作通过。

执行命令的核心边界如下；完整命令范围由两份 TAP 中的用例名称保留：

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 DATABASE_URL='<本次专属 PostgreSQL>' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/*.test.ts apps/web/tests/*.test.ts

env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 DATABASE_URL='<本次专属 PostgreSQL>' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/media-files.test.ts tests/integration/qa-capacity-control.test.ts \
  tests/integration/agent-capacity.test.ts tests/integration/agent-dispatch-budget.test.ts \
  tests/integration/confirmation-receipt-hardening.test.ts \
  tests/integration/gemini-agent-protocol.test.ts tests/integration/gemini-agent-provider.test.ts \
  tests/integration/gemini-agent-main.test.ts
```

根任务在并行处理 `completeStep` adapter 的第五个 `executionAttemptId` 转发遗漏。本轮没有提前复制该修复，以上测试源均不含它；根任务后续承接时仍须确认该转发与 C1 事务内 pin 同时保留，并验证新增修复。本文不把尚未进入本分支的更改计作已验证。

## 真实 Gemini 既有证据与运行限制

本轮 **0 次新增真实 Gemini 调用**，显式关闭 live 测试并从测试进程环境移除既有 Key 和 Key 文件路径变量；本工作树没有 `.env`。保留的[此前真实 JSON](evidence/c2-gemini-live-final.json)来自 C2 独立工作线，不能称为本次合并版本的新真实验证。其记录的 5 个源码/测试 SHA-256 与合入文件逐一一致，核对结果见[来源记录](evidence/c1-c2-integration-source.json)。首次、第二次失败和最终成功的旧证据均随原提交保留。

C2 硬崩溃可能留下 `owner.lock` 和 pending 状态。仍需操作员确认原进程已退出及目录归属后处理残留锁；未决轮继续返回 `TURN_OUTCOME_UNCERTAIN`，不自动重发。该限制没有在本轮改变，详见 [C2 说明](c2-gemini-agent.md)。C1 同库多实例仍需共享同一物理媒体目录；这里只校验路径字符串，不声称已提供分布式文件存储。

## 自有资源与证据校验

使用新建专属 PostgreSQL 17 容器和匿名卷，真实 ID、归属标签、随机端口及清理核对见[清理记录](evidence/c1-c2-integration-cleanup.json)。删除前 UUID 测试数据库与连接均为零；日志中 37 个媒体临时目录全部不存在，Gemini 离线临时目录为空，容器及其匿名卷均已移除。未操作 QA、演示或其他用户资源。

证据与关键源码的 SHA-256 见[校验清单](evidence/c1-c2-integration-hashes.json)。这些是开发侧集成记录，不替代独立 QA 验收，也不改变此前公开的时间、未知远端效果及恢复边界。
