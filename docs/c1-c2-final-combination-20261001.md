# C1 / C2 最终组合回归

2026-10-01，开发分支 `agent/c1-c2-integration`。最终固定测试源是 `210df671942908fc1682cef6e29b7ba9563a2a31`，同时包含 C1、C2、空媒体轮询容量修复 `0fd4b7d`，以及根任务 `7a38ae2979b187a74757dfe4456f947e26ee27b7` 的本地 cherry-pick。后者恢复 `completeStep` adapter 第五个 `executionAttemptId` 参数转发，相关生命周期回归也随提交纳入。

## 结果与证据边界

[最终全套原始 TAP](evidence/c1-c2-final-combination-full.tap)：**512 项，503 通过，0 失败，9 跳过**，213373.79225 ms，进程退出码 0。使用真实隔离 PostgreSQL，测试文件并发为 2。范围包括全部 `tests/integration/*.test.ts` 和 `apps/web/tests/*.test.ts`，覆盖 C1 20 项、C2 离线 14 项，以及 Agent、消息、预算、容量控制器和生命周期观测消费者。

9 个跳过项仍为 6 个显式长时间专项、可选实际一分钟观测、测量用途的真实 WS 阅读实验，以及真实 Gemini 专项；它们未计作通过。[全套构建](evidence/c1-c2-final-combination-build.txt)完成服务端/前端类型检查与前端生产构建，退出码 0。[原文校验](evidence/c1-c2-final-combination-original.txt)通过，原文 SHA-256 仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 DATABASE_URL='<本轮专属 PostgreSQL>' \
  node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/*.test.ts apps/web/tests/*.test.ts

npm run build
npm run verify:original
```

[首轮验证记录](c1-c2-integration-20261001.md)及其原始 **511 项 / 500 通过 / 2 失败 / 9 跳过**日志不变。首轮发现迁移测试硬编码旧末版，以及空媒体轮询占用共享执行槽；二者由 `0fd4b7d` 修复。该记录中的“尚未纳入 adapter / 尚未再次全套回归”准确描述当时检查点；本篇记录之后完成的最终组合，未覆盖或改写旧失败、旧定向通过及旧清理证据。

相对根 adapter 提交的 [Agent 与工具差异](evidence/c1-c2-final-combination-agent-delta.patch)仅增加媒体引用接入。run 创建时的 pin 保留在原 scheduling transaction 内，`get_recent_messages` 的读取和 pin 保留在同一事务内。adapter 第五参数、模型及审计派发前重新读取剩余预算的检查均保留。

本轮 **0 次新增真实 Gemini 调用**。测试进程移除真实 Key / Key 文件路径变量并设置 `GEMINI_LIVE_TESTS=0`；工作树没有 `.env`。C2 离线入口测试只创建和读取自己的合成凭据。此前独立 C2 真实调用的[既有证据](evidence/c2-gemini-live-final.json)保持原样，其中 5 个源码/测试 SHA-256 均与本组合一致，逐项比对见[来源记录](evidence/c1-c2-final-combination-source.json)。这不是当前组合的新真实调用验证。

## 集成顺序与产品树核对

根候选 `e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb` 已有 `7a38ae2`，因此应依次承接以下提交，再承接本篇最终证据提交；**不要再挑 `210df67`**：

```text
5df39f938ee30a271a089d1bffb1acae0ae60054
49f2e20280a575006ba30dd2bac758dde33d3a6a
82afcdda47235adf796ea334ddef312a12305978
f2464d7d004978abbf7611f189ac7dde5afaef10
4cbcd47342fdff14d0599ac2f7816e9f0ec1eaaf
f5aac7ef0ab1d597c668ca4fbe3b8d691b900450
0fd4b7de747c18aff3c4a1c6c92656c066a88928
af17d74b02c4bedc325d7711a9981791a144d4ce
```

最终产品树指纹为 `c80b10472da0252dc287c6aa97a67c6c409d75bb7e883e02f7e09cdca861797b`。计算对象是以下命令完整标准输出（包括最后一个换行），共 226 条 Git blob 记录；来源 JSON 逐条保存。根集成后应核对相同指纹，以确认最终产品和测试文件与本轮源相同；文档历史不在该指纹范围。

```sh
git ls-tree -r <candidate-commit> apps db packages scripts tests \
  package.json package-lock.json tsconfig.json .env.example | shasum -a 256
```

## 清理与现有限制

本轮另建专属 PostgreSQL 17 容器 `kapibala-c1-c2-final-20261001`、匿名卷和随机本地端口，与首轮已清理资源分开。删除前 UUID 测试数据库及会话为零；日志中 19 个媒体临时目录均已不存在，Gemini 离线临时目录为空。按完整容器 ID 和归属标签核验后，容器及匿名卷均已删除。完整 ID、卷名、端口、163 个日志数据库名和路径核验见[本轮清理记录](evidence/c1-c2-final-combination-cleanup.json)。未触碰演示、QA、用户数据库、`.env`、原文或 `qa-acceptance/`。

C1 同库实例仍要求共享同一物理媒体目录；路径字符串校验不是分布式存储保证。文件恢复测试涵盖进程硬崩溃，不声称验证了整机掉电。C2 硬崩溃残留 `owner.lock` 仍需操作员确认旧进程已退出及目录归属后处理，未决轮保持 `TURN_OUTCOME_UNCERTAIN`，不自动重复远端调用。这些既有边界未扩大。

本篇及本轮证据 SHA-256 见[校验清单](evidence/c1-c2-final-combination-hashes.json)。这是开发侧最终组合验证，不替代独立 QA 验收。本分支未合 main、未 push；集成交由根任务执行。
