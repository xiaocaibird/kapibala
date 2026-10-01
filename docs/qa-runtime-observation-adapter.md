# 隔离运行观测接入：账号事务与模块生命周期

本工程接入对应 `qa-acceptance/contracts/runtime-observation.md` 的 `qa-runtime-observation/1`。账号与模块的首次开发验证基线为 `d614eba0305d23786c8d2d4fbeae9767e65ebb3d`；下文 27 项结果保留该次版本，不代表最新候选全量测试。**开发证据不是 QA 独立验收结论。** 最新组合入口、固定版本及结果见[最终接入交付](qa-remediation-final-20261001.md)。

账号及模块能力为 `account-local-save`、`account-intent-wait`、`module-tick`；第二轮接入新增 `module-tick-independent`，允许同一已核实实例的不同模块分别持有独立租约，见[多模块契约](qa-multimodule-observation-20261002.md)。活动与生命周期观察能力以当前 capabilities 响应为准；活动挂点、完整性条件与跨重启不完整证据见[活动见证说明](qa-activity-witness-20261001.md)。不能把持久采样量或单个进程在线时间冒充跨重启完整活动时间；相关业务要求仍由 QA 独立判定。

## 入口与身份

普通 `apps/server/src/main.ts` 不导入这些脚本，仅提供环境变量不会打开控制器。工程 SUT 显式使用 `scripts/qa-runtime-observation-server.ts`，独立控制器使用 `scripts/qa-runtime-observation-controller.ts`。两者只能监听回环地址。不得将本入口用于演示数据或正式服务。

SUT 必需环境：`DATABASE_URL`（隔离数据库）、`PORT`、`GATEWAY_URL`、`AGENT_URL`、`QA_ACCEPTANCE_RESOURCE_TOKEN`、`QA_RUNTIME_REGISTRY_DIR`。控制器必需 `QA_RUNTIME_REGISTRY_DIR`、`QA_RUNTIME_PORT`。Node 版本沿用项目要求，在工程仓库工作目录执行：

```sh
node --import tsx scripts/qa-runtime-observation-server.ts
node --import tsx scripts/qa-runtime-observation-controller.ts
```

由隔离运行者分别提供完整环境和 guardian 进程组；上述两条是不同进程。SUT 启动前要求 server/packages/scripts/db 配置等相关源码已提交，注册实际完整 HEAD。控制器位于 `/qa/runtime/v1`；注册目录应为当前用户所有、权限 0700 的短绝对路径（Unix socket 完整路径不超过 100 字节），注册文件和 socket 为 0600。

共享传输复用既有 ownership 检查：真实 API 监听子进程、guardian/PGID、启动时间、完整提交、端口和从实际进程读取的资源 token 均须匹配。请求不包含 token，响应 binding 是工程进程观测结果。`instancePid` 保持协议定义的 guardian PID，不伪装成应用子进程 PID。

## 可验证机制

| 能力/模式                 | 实际挂点与证据                                                                                                                                                                                                                          | 保证边界                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `account-save-once`       | 下一次指定账号的真实公开 connect，在远端成功响应解析后记录 `remote-success`；账号写入的原 savepoint 内执行固定 PostgreSQL `RAISE EXCEPTION`，SQLSTATE `55P03`；原 `withSavepoint` 完成回滚后才记录 `local-save-failed` 并保持原重试入口 | 错误及回滚真实发生；原账号行锁仍持有，沿用原事务有限重试，不重连远端，不另启补偿事务。SQL 内容不接收外部参数                   |
| `account-intent-wait`     | 独立新 HTTP 请求由 Fastify 生成不同 requestId；执行原 SELECT FOR UPDATE 时，查询 `pg_blocking_pids` 确认其实际会话正被原 connect 会话阻塞，且原门仍保持                                                                                 | 只在新请求为同账号 `online → disconnected` 且实际阻塞仍成立时发布等待事件；不能把发出请求、创建 Promise 或路由到达等同于锁等待 |
| `local-save-committed`    | 显式工程 Database 子类观察原 `Database.transaction` 的 COMMIT 成功返回；此后才发布 `outer-commit-confirmed`                                                                                                                             | RELEASE SAVEPOINT 不发布提交；COMMIT 结果未知不发布成功。测试 wrapper 在 PoolClient.release 前复原，不污染下一次借用           |
| `account-save-persistent` | 同一原 savepoint 路径持续注入固定可恢复 SQL 错误，沿用产品既有三次有限尝试；原外层 ROLLBACK 成功返回后记录 `transaction-rolled-back`                                                                                                    | 远端仍仅调用一次；不会把诊断事件保存的新事务或显式后续重连冒充原事务恢复。远端成功/本地失败差异仍保留                          |
| `module-fail-then-hold`   | 在真实调度 tick 执行包装层抛出带 marker 的错误，走原 scheduler catch/ModuleProgress.finish(false)；下一次 beforeTick 位于 activity.start 之前；放行后在真实 running 阶段保持，第二次放行执行原 module.tick，原 finish(true) 后发布成功  | 不改写诊断字段。业务 tick 再失败只记录失败，不制造成功。成功后后续入口保持直到 DELETE/TTL；后续 tick 使用独立 attemptId        |

`requestId` 来自实际 HTTP 请求；`transactionId` 为绑定到实际 PoolClient/原事务生命周期的 opaque UUID；`attemptId` 绑定到真实账号请求或模块 tick。测试意图 UUID 只用于选目标，不充当已发生证据。事件时间由工程观察时刻产生；不允许调用者提交预期业务状态、时间、SQL 或代码。

## 租约、TTL 与退出

- 每个 UUID 固定绑定请求及实例，重放不续期；修改请求返回 409。默认每个应用实例只允许一个未释放租约；明确兼容的例外为既有同一 group/run 的活动/生命周期观察组合，以及 `module-tick-independent` 声明的不同模块 `module-fail-then-hold` 组合。相同模块或账号/模块混合仍拒绝；不同模块的数量不另设正好两个的上限，每个已注册模块最多一个活动租约。不同 UUID 的历史、TTL 与清理保持隔离；同一租约的读取、推进、释放顺序化，迟到读取不得把已解除的门改回 held。
- TTL 为 5–120 秒。SUT 内部计时器和独立控制器均触发本租约释放，DELETE 幂等。advance 仅释放已经命中的当前门；未命中时无事发生，已完成模块生命周期保持门不因多余 advance 解除。
- 释放表示取消本租约未来注入和解除本租约的 JavaScript 门，**不代表业务事务、SQL、网络请求已取消或结束**。例如 TTL 放行原账号重试后，真正 COMMIT 仍可追加到已 released 的历史。失效数据库连接或永久占用资源不是本入口的终止保证。
- 停止顺序为 runtime.close 释放门、bridge.close、app.close 等待真实调度收尾、db.close。进程死亡后独立控制器保留已经观察到的事件前缀；不伪补最后未读到的事件。控制器本身重启不提供持久历史恢复保证。
- 旧租约始终指向原实例私有 socket，不按 API 端口追随新实例。同端口重启后旧 binding 不能用于新操作，旧 DELETE 不释放新租约。新实例须重新核对身份。

## 诊断 profile

管理员原接口 `/api/diagnostics/background` 没有增加或改写字段；`/api/health` 语义保持原样。以下静态 profile 与已实测公开响应对应：

```json
{
  "module": "gateway",
  "modulesPointer": "/modules",
  "namePointer": "/name",
  "statePointer": "/status",
  "consecutiveFailuresPointer": "/consecutiveFailures",
  "lastFailureAtPointer": "/lastFailedAt",
  "lastSuccessAtPointer": "/lastSucceededAt",
  "currentDurationMsPointer": "/runningForMs",
  "tickCountPointer": "/ticks",
  "states": { "failed": "failed", "running": "running", "healthy": "idle" }
}
```

实际失败/运行/成功的完整公开响应样本保存在开发证据 RT04 中。故障 marker 不出现在公开诊断中；该有限样本检查不等于任意秘密均不泄露的证明。idle 仅指调度 tick 已完成，不等同业务完成或全局健康。

## 开发验证与限制

2026-10-01，独立 PostgreSQL 17 容器、每项随机 UUID 数据库和独立 guardian/API 进程：

| 检查                                                                                         | 结果      |
| -------------------------------------------------------------------------------------------- | --------- |
| RT01 普通 main 忽略观测环境、无桥接注册                                                      | 通过      |
| RT02 真身份拒绝、一次 SQL 错误、真实新意图等待、同原事务提交、公开状态与 WS                  | 通过      |
| RT03 持续 SQL 错误耗尽既有有限重试、真实回滚、无自动远端重放、显式新请求恢复                 | 通过      |
| RT04 真实 failed → 启动前保持 → running → idle，失败时间保留、成功时间不提前更新、解除后继续 | 通过      |
| RT05 UUID 不可变、并存冲突、请求体校验、TTL 后真实提交仍可记录、同端口重启及旧历史隔离       | 通过      |
| RT06 原业务 tick 在放行后失败不得标成成功（直接 hook 负向检查，无启动服务）                  | 通过      |
| 既有账号远端边界和资源/后台诊断定向回归                                                      | 21 项通过 |

合计 27/27，0 跳过。执行命令：

```sh
node --import tsx --test tests/integration/qa-runtime-observation.test.ts tests/integration/account-remote-boundary.test.ts tests/integration/core-resource-observability.test.ts
```

执行前必须显式提供专用隔离 `DATABASE_URL`。证据在 [开发执行日志](evidence/qa-runtime-observation-development.txt)，包含实测提交、随机数据库名、事件身份与生命周期；资源 token 已脱敏。`npx tsc --noEmit` 通过；原始需求 hash 校验通过。本批未运行、修改 QA 用例，也没有把开发结果填入 QA 验收结论。

初次尝试的旧端口 64550 已停用，连接被拒绝，未进入产品验证；随后改用独占容器和随机回环端口。测试整理时发现并修正了 WS 认证字段和事件名引用，最终断言核对真实 `account_status_changed`，不使用不存在的事件名证明“没有通知”。开发负向检查另覆盖真实 tick 放行后仍失败，不把这种失败报告为成功。

测试后核实专用服务上剩余随机测试库为 0，并精确删除本批容器及匿名卷，二者均复查不存在。之后仅统一显式入口配置名称为 `QA_RUNTIME_REGISTRY_DIR` / `QA_RUNTIME_PORT`；重新类型检查，并实际启动独立控制器验证新变量和请求校验后关闭。该配置核对不重复计算为产品自测或 QA 验收。
