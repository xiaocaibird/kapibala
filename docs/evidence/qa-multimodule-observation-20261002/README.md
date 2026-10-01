# 同一实例多模块观察：开发证据

基线 `2c1826bdee0665b3c57f5714603a59931c7d05ca`，固定候选 `4d308641703521c4c266f538cb7c894474710ed8`。候选代码提交后真实启动 SUT，运行中的 sourceRevision 与原始记录相符；不绕过脏树保护。证据归档提交只修改文档和证据，不是另一次运行结果。

| 文件 | 结果 / 内容 |
| --- | --- |
| `before.tap.gz` | 原始基线输出，0 PASS / 2 FAIL / 0 SKIP，exit 1；两个第二模块 PUT 均真实收到 409 |
| `after.tap.gz` | 原始候选输出，2 PASS / 0 FAIL / 0 SKIP，exit 0；同进程双故障、分别恢复、DELETE/TTL/旧 UUID 隔离及拒绝错误绑定 |
| `regression.tap.gz` | 原始相关回归输出，22 PASS / 0 FAIL / 0 SKIP，exit 0 |
| `typecheck.txt` | 类型检查及架构边界检查，exit 0 |
| `original.txt` | 原题内容校验，exit 0 |
| `cleanup.json` | 所用 PostgreSQL 容器身份、实际版本/端口、删除前 UUID 数据库余留为零、容器删除后不存在、未创建命名卷 |
| `SHA256SUMS` / `TAP-SHA256SUMS` | 归档文件字节摘要 / 解压后原始 TAP 字节摘要 |

TAP 直接保存命令输出后无损 gzip；例如 `gzip -cd before.tap.gz` 可查看原始字节，未修剪失败日志中的空格或改写结果。fixture 的正常 evidence 输出已将 observedOwnerToken 替换为 `<redacted>`。失败基线测试和候选测试的行为断言相同；中途只有 event.correlation 的 TypeScript 类型断言与格式整理，不更改运行时行为。

## 执行

工作区 `/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala`，Node `v24.21.0`。预置独立 PostgreSQL 17，设置 `DATABASE_URL` 为本次自有容器 `127.0.0.1:53166` 的 postgres 数据库；连接用户名 `kapibala_multi`，仅使用临时测试密码。fixture 自建并清理 UUID 数据库，不在共享库运行。以下命令中的 DATABASE_URL 使用当前执行者自己的独立库，不能复制为演示库或 QA 库。

```sh
# 基线与候选均执行同一新增测试入口
node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/integration/qa-multimodule-observation.test.ts

# 固定候选的相关集成回归
node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/integration/qa-runtime-observation.test.ts \
  tests/integration/qa-activity-control.test.ts \
  tests/integration/qa-combined-observation.test.ts \
  tests/integration/core-resource-observability.test.ts

npm run typecheck
npm run verify:original
```

每个新增用例实际启动一个独立 guardian/application SUT，再通过独立 controller 的公开 HTTP 调用建立两个模块租约；不导入 RuntimeObservation 私有状态来伪造诊断结果。MM01 保留双失败、A running、A recovered、双 recovered 的公开响应及实际 applicationPid 归属，MM02 保留 A TTL 和旧 UUID DELETE 前后双模块状态。它们不通过两个 SUT 冒充同一进程的双模块。

生产默认不开控制、现有租约所有权校验和真实业务故障判定未改变。这是开发验证，QA 应依[公开接入文档](../../qa-multimodule-observation-20261002.md)维护自己的用例，并在负责人冻结的新 SUT 上独立验证；本证据不宣称 QA 用例已通过。
