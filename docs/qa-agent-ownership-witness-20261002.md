# Agent 运行锁的只读观察

本次仅补同一运行的真实锁尝试、回调取得及返回结果。实现候选为 `d6fd22c0956ddd8296ceaf71f87070fec98e85c4`；最终固定开发验证源为 `c01e82f5d1651fdcedbe4d694debe5bcdf9b08b7`，后者仅补既有开发测试的 capabilities 期望，产品代码相同。基线为 `c0d98958a3b4fcb5d5529de2b3e3e816f5e23af5`。开发验证不代表独立 QA 结论，也不关闭未知外部效果的强恢复要求。

## 接入

沿用[运行观察入口、guardian 身份与清理协议](qa-runtime-observation-adapter.md#入口与身份)，普通应用入口不启用 witness。工程 SUT 可使用 `scripts/qa-runtime-observation-server.ts` 或既有组合入口 `scripts/qa-observation-server.ts`；runtime 控制器仍为 `scripts/qa-runtime-observation-controller.ts`，不新增控制服务或业务接口。

```sh
node --import tsx scripts/qa-runtime-observation-server.ts
node --import tsx scripts/qa-runtime-observation-controller.ts
```

上述为两个独立进程，须由运行者分别提供已有契约要求的隔离数据库、owned 回环远端、registry、资源标识、端口及 guardian。Node 要求仍为 `24.21.0` 系列项目范围；本次实际运行 Node `v24.21.0` / 内置 undici `7.29.1`。当前实例的 `GET /qa/runtime/v1/capabilities?apiUrl=...&revision=...&pid=...` 增加 `agent-run-lock-witness`。

用真实 target 对每个实例分别 `PUT /qa/runtime/v1/leases/:uuid`，请求形状如下（示意值必须换为独立运行实际身份）：

```json
{
  "protocol": "qa-runtime-observation/1",
  "target": {
    "apiUrl": "http://127.0.0.1:3100",
    "revision": "完整固定提交",
    "pid": 12345
  },
  "mode": "observe-agent-lifecycle",
  "correlation": {
    "kind": "tool-wait",
    "groupId": "实际群组",
    "runId": "实际运行",
    "toolUseId": "all-run-steps"
  },
  "ttlMs": 120000
}
```

`GET /qa/runtime/v1/leases/:uuid` 读取真实观察；DELETE 或 TTL 仅结束观察，不释放产品锁，不改变运行。此模式不支持 advance，也不能要求它触发 tick、竞争或重试。

## 事件与边界

| 事件                       | 实际来源                                                   | 字段含义                                                                                       |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `agent-run-lock-attempted` | 当前 tick 即将调用实际 `db.tryWithLock`                    | `callbackEntered=false`；一次调用一个新 `attemptId`                                            |
| `agent-run-lock-acquired`  | `tryWithLock` 取得 PG advisory lock 后，真正进入受保护回调 | 同一 `attemptId`，`callbackEntered=true`                                                       |
| `agent-run-lock-result`    | 真实锁 API 返回或抛错                                      | `lockStatus=executed/lock_busy/capacity_unavailable/error`；`callbackEntered` 保留实际进入情况 |

每条包含 `groupId`、`runId`、`lockKey=agent:<runId>`、`purpose=run/paused-cancellation`。`lock_busy` 是实际 PG 锁拒绝；`capacity_unavailable` 是本实例既有 8 个锁额度已用完，尚未尝试 PG 锁。这两种拒绝均无 acquired 且 `callbackEntered=false`。`executed` 仅说明锁回调及锁 API 收尾正常返回，不表示业务运行或远端效果成功完成。`error` 保留原异常传播，事件不记录异常文本；取得锁之后也可能 error，不承诺该时点已释放物理连接。

`instanceId` 是该 witness 生命周期的随机 UUID，**不同于 bridge registry 的 instanceId**。`applicationPid` 是实际应用进程；`instancePid` 沿协议为 guardian PID。`clockDomain`、`monotonicMs`、`sourceSeq` 来自应用 witness；`seq` 是租约内序号。不能直接比较不同 clockDomain 的单调数值，不能用序号或时间换算虚构跨进程先后。

现有每进程 ring 保存实际事实，按 group/run 回放到新租约。因此可以晚挂 lease：primary 获锁仍在回调中时读到 attempted → acquired，尚无 result；secondary 在挂 lease 之前的 attempted → result(lock_busy) 也可回放，保留真实 attemptId/sourceSeq。租约第一条 attached 是订阅事实，不是锁事件；不要用它的排列位置推断原事件时刻。最多保留 20,000 条进程事实，检查 `droppedThroughSourceSeq`；不含前一进程历史，SIGKILL 可缺结果尾部。observer 自身异常会被新锁挂点隔离，缺事件不能推导没有尝试。

正常无 observer 时仍调用原 `db.withLock`。启用时调用的 `tryWithLock` 正是原 `withLock` 内部方法；锁上限、锁键、回调、running Map 上限、预算、异常传播、锁 finally 均沿用。原有运行列表查询顺带读取 group_id，没有新增业务查询。取消暂停运行仍走原分支，观察 purpose 用于区分。

## 竞争采集的必要时序

独立 QA 自行安排既有远端 before-response 门、实例启动、租约和断言。第一实例仍持有该运行锁时，第二实例必须实际 tick 到同一可运行 run；分别核对真实 PID/witness 身份不同、同 run/group/lockKey、primary acquired 尚无 result、secondary 同一次 attempt 的 lock_busy 且无 acquired。只观察第二进程启动、tick 成功或零 HTTP，均不足证明锁竞争。

`status='running' AND recovery_note IS NULL` 的原选择条件保持。若先释放未知效果门并等到 recovery_note 已提交，随后才启动第二实例，该运行不再进入普通锁尝试；无事件是“未观察到尝试”，不能改写成拒绝。此时序差异须由 QA 调整独立场景；观察入口不恢复未知运行、不盲重试，也不将强恢复失败改成通过。

## 开发验证

[证据索引](evidence/qa-agent-ownership-20261002/index.json) 固定源码、文件哈希、命令及清理。TAP 原始输出按批分别保留，仅导出归档时脱敏旧回归输出的 3 个隔离 ownership token 值；原始与导出哈希分开记录，事件内容、版本及失败记录不改写。最终固定源 `c01e82f` 的 18 项均通过，0 跳过：新增 4 项以及原 lock admission、backend lifecycle、runtime observation、combined observation 的 14 项。新增覆盖：

1. 两个真实 Node 子进程共用隔离 PG，调用真实 Agent.tick；第一实例实际 HTTP turn 持有期间，第二实例同 run 拒绝。两个实例都在事件发生后挂 lease，验证原 ring 回放；释放后第一运行结束，第二实例可执行新的合格运行。
2. 真实 worker 用原 db 锁 API 占满 8 个名额；同 run 得到 capacity_unavailable。释放容量后，以独立 PG session 持有精确运行键，再次 tick 得到 lock_busy；释放 PG 锁后，同 run 再 tick 得到 acquired/executed，仅此后实际请求模型 HTTP。
3. 新锁事件 observer 抛错时，实际回调和最终业务结果保持。
4. recovery_note 暂停运行不伪造尝试；显式取消走原锁路径并保留未知记录。

开发子进程 fixture 使用真实 app/Agent/PG/HTTP、`background:false` 加显式 tick，不冒充标准自动调度下的完整 QA 场景。既有回归另实际启动标准工程入口、guardian 和独立控制器。固定 `d6fd22c` 的前一次组合结果为 17 通过/1 失败：RT02 的精确 capabilities 数组少新能力项，在业务断言之前停止；原件保留。只更新该开发测试期望后，固定 `c01e82f` 全部 18 项通过。没有修改 QA 资产。

`npm run typecheck` 与原文 hash 校验均通过。测试结束时随机测试库为 0；观察记录涉及的 37 个进程 PID 均已退出，专用容器及其匿名卷已精确删除并复查不存在，见 [cleanup.json](evidence/qa-agent-ownership-20261002/cleanup.json)。这仅是本次开发资源的清理事实。
