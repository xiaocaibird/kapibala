# 媒体引用与清理观察：开发证据

基于 `9006f60108a405895ed2aec644cb8de56f5acb03`，所有真实 SUT 都在提交代码后启动，保留 sourceRevision 脏树保护。后续文档归档提交不改变被测实现，不代表又跑过一遍。公开消费方式见[接入契约](../../qa-media-reference-observation-20261002.md)。

| 归档 | 实际被测提交 | 结果 |
| --- | --- | --- |
| `initial.tap.gz` | `de12173909a5fef5f0cbaa34688adf147d310538` | 0 PASS / 3 FAIL。MR01/02 执行完业务断言及输出后在清理 hook 失败；MR03 未建立窗口，PUT 因真实表锁阻塞身份查询而 503 |
| `second.tap.gz` | `7695fc2933f15498468b596b544adffd93caa3eb` | 3 PASS / 0 FAIL / 0 SKIP，exit 0 |
| `final.tap.gz` | `1036cc933ee81242003e2808fba48df63ac48985` | 3 PASS / 0 FAIL / 0 SKIP，exit 0；新增真实 HTTP 完成响应账本与持久 intent 前后相等断言 |
| `committed-hold.tap.gz` | `f90d39240c784064cbe412adcca903f97a2e1d8c` | 3 PASS / 0 FAIL / 0 SKIP，exit 0；另核对提交后停等的可见引用/run 以及下一动作尚未派发 |
| `regression.tap.gz` | `7695fc2933f15498468b596b544adffd93caa3eb` | 31 PASS / 0 FAIL / 0 SKIP，原媒体/consumer、runtime、多模块、combined 回归 |
| `typecheck.txt` / `typecheck-final.txt` | `7695fc2` / `f90d392` | 均 exit 0，含架构边界、server 和 web 类型 |
| `original.txt` | `7695fc2` | exit 0，原题 SHA `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75` |
| `cleanup.json` | 验证结束后 | 自有容器实际版本/端口、数据库零遗留、已删除容器、无命名卷、记录媒体目录已清理 |

初轮失败的明确归因：新测试显式 kill 后，原 runtime fixture 的重复 cleanup 只检查 exitCode，未识别 signalCode，重复向已退出进程组发送 SIGKILL；修正 fixture 的已退出判定。MR03 起初用 ACCESS EXCLUSIVE 锁住 agent_pending，连只读身份校验也被阻塞；换为 SHARE 锁继续真实阻断 INSERT，同时允许身份 SELECT。`7695fc2` 仅修 fixture/接线文档；没有改业务断言、延长业务预算或伪造 HTTP。原始失败完整保留，不能当作修复了生产缺陷。

新增观察实现与生产接缝在后三轮及 regression 中相同；`1036cc9`、`f90d392` 只强化开发测试。观察租约不插入引用、不修改 run、intent 或媒体结果；状态变化来自真实 SUT 的 Agent/Gateway/后台模块。用例明确记录年龄 fixture、实际 HTTP 503、原工具持久 executing/dispatching 意图和新的进程身份。未知 kick 不被改写成成功或失败；公开禁用 Agent 只结束编排并允许原保留期清理。

## 命令与资源

工作区 `/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala`，Node `v24.21.0`，独立 PostgreSQL 17.11。所有测试显式 DATABASE_URL 指向自有临时容器 `127.0.0.1:62403`，用户名 `kapibala_media`；密码仅用于本次临时测试环境，容器已删除。fixture 为每例自建、清理 UUID 数据库。复跑者须填自己的独立资源，不能使用演示或 QA 数据库。

```sh
# 每轮定向验证：显式设置自己的 DATABASE_URL 后
node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/integration/qa-media-reference-observation.test.ts

# 相关原用例回归
node_modules/.bin/tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/integration/media-files.test.ts \
  tests/integration/qa-runtime-observation.test.ts \
  tests/integration/qa-multimodule-observation.test.ts \
  tests/integration/qa-combined-observation.test.ts

npm run typecheck
npm run verify:original
```

所有 TAP 是原始 stdout/stderr 直接落盘后无损 gzip，未删失败空行或修剪断言。fixture 自身将 owner token 替换为 `<redacted>`。`gzip -cd initial.tap.gz` 可恢复原始内容；`SHA256SUMS` 核对归档字节，`TAP-SHA256SUMS` 核对解压后原始 TAP。证据全部 Git 跟踪，不依赖被忽略的散落 .tap/.log。

本轮没有尝试主机掉电、任意文件系统损坏或延长真实活动时限；不替代 QA 的独立夹具和验收。普通 main 不暴露这些观察控制；未改外部协议、QA 工程或真实演示资源。
