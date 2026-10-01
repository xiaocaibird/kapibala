# 后端四项补证：真实生命周期、局部等待修复与未闭合边界

2026-10-01。产品/观测固定版本 `22d770bafcf7b2e2f64e42deb1c4189da81baaf6`，基线 `07717d1ee8774a0950b2fd64bfe9341172d57bc0`。本批没有修改 `qa-acceptance`、原始需求、外部协议或默认模拟器，没有执行独立 QA 验收。QA 新要求来源及 SHA-256 见 [索引](evidence/qa-backend-followup-20261001/index.json)。

| 项目        | 本批实际补充                                                                                                          | 本批结论与边界                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENT-025   | 原 run 创建事务/INSERT 窗口、实际终止决定、终态提交、每次 turn 派发；与同域 activity witness 关联                     | 真实 8 秒只读 turn 的一分钟样本得到完整活动区间 **[60005,60017]ms**；终止决定本身也超过 60000。不能宣称通过。                                      |
| AGENT-028   | 合法工具进入、审计、key 与原消息关联、等待进入、实际结果交还、history 提交、下一 turn；单独修复最后一轮无条件睡 100ms | 固定修前版本等待返回区间 **[5093.516458,5093.642791]ms**；修后 **[5000.746750,5000.849417]ms**。已消除可避免的轮询尾巴，仍未证明严格 5000ms 上限。 |
| INT-ACT-001 | 原活动事件显式附进程 clockDomain、真实 group/run、起止窗口；复测原安全屏障与强杀恢复                                  | 新进程继续诚实返回 `includesUnsavedTail=false`；没有新增可跨 SIGKILL 保存旧 epoch 尾段的可信观测源，本批不能关闭跨 epoch 计量。                    |
| BLK-EXT-001 | 原 dispatch attempt、实际 HTTP 接收、重启接管、每次查询与持久决定                                                     | 未收到原响应的同一 dispatch 重启后仍自动查询；普通 404 保持 unknown。正向查询能收敛，静默无效果/无终结信号分支仍缺协议否定保证。                   |

上述数字是本批工程样本事实，不重写旧 QA 的 BLOCKED 或将开发测试计数当作业务 PASS。完整一分钟下界已超限，应由下一轮独立 QA 按其裁判接入；不能用更晚的 REST 读取或日志开销解释掉这个真实决定时刻。

## 接入与字段

复用 `scripts/qa-runtime-observation-controller.ts`、原 guardian/token/revision/API 归属校验、独占租约、TTL 和重启重新绑定。显式 `scripts/qa-runtime-observation-server.ts` 及组合 `scripts/qa-observation-server.ts` 在模块恢复前安装同一个 `LifecycleWitness`；正常 `apps/server/src/main.ts` 不安装它。HTTP 仍为 `qa-runtime-observation/1` 的原 capabilities/leases 路径，不增加生产 API。

新增 capabilities：`tool-wait-witness`、`agent-lifecycle-witness`、`message-recovery-witness`。请求仍含原 `protocol,target,ttlMs`，以下 mode/correlation 是本批交付的新字段，QA 需要先审阅和扩展客户端，不能假称旧客户端已支持。

```json
{
  "protocol": "qa-runtime-observation/1",
  "target": {
    "apiUrl": "http://127.0.0.1:PORT",
    "revision": "FULL_40_CHAR_REVISION",
    "pid": 12345
  },
  "mode": "observe-tool-wait",
  "ttlMs": 80000,
  "correlation": {
    "kind": "tool-wait",
    "groupId": "ACTUAL_GROUP",
    "runId": "ACTUAL_RUN",
    "toolUseId": "all-run-steps"
  }
}
```

`observe-agent-lifecycle` 是同一 run 事件流的另一入口，沿用上述 `kind:tool-wait` 与 `all-run-steps` selector；它包含创建、turn 和终态，可与同 run 的 `observe-activity` 及 safe-boundary 租约并存。`observe-message-recovery` 使用 `{kind:"message-recovery",groupId,clientMsgId:<UUID>}`。两者都只读，没有屏障；`advance` 返回 409。不可借同端口切换实例，原 controller 仍要求完整真实 binding。

establish 查询真实 run/group 或 message/group，并从当前数据库/模式/服务启动身份计算 `databaseIdentity`。`lifecycle-observation-attached` 是接入元信息，含真实查询得到的 `resourceId`，其 `attemptId` 是本次接入观察尝试；它不代表任何业务动作。其他事件的真实 `runId/groupId/stepId/toolUseId/clientMsgId` 来自产品路径，`correlation` 仅为租约 selector，不能替代这些字段。`instancePid` 沿用 guardian PID；`applicationPid` 为实际应用子进程。

业务事件追加 `seq`，另保留进程流 `sourceSeq`；晚订阅会按原 sourceSeq 回放先前已发生的事件，因此回放事件的 `at` 可以早于首条 attached 元信息。已返回的事件前缀不改写，snapshot 深拷贝。释放/TTL 停止纯读订阅，保留既有历史；缺少结束事件只表示观察窗口不完整，不能推断业务没有结束。已释放租约不会跟随端口绑定新进程。

进程回放缓冲最多保留 20,000 条；`droppedThroughSourceSeq>0` 明示已有历史被截断，此时不得假定完整覆盖。**该上限不约束租约快照或已释放租约的总内存**，隔离观察进程应按批次关闭清理。`historyScope:this-process-only`、`includesPriorProcessHistory:false` 明确不继承旧进程历史；相同消息/step 身份可关联旧新原始文件，但不能直接相减两个 clockDomain。

## 挂点与时钟解释

所有单调读数使用当前 Node 进程 `performance.now()`，单位毫秒，保留返回的小数；`clockDomain=process-performance:<applicationPid>:<randomUUID>` 在该进程内由 activity/lifecycle 两个 observer 共用。`monotonicMs:[p,p]` 是一次时钟读数，不宣称对应业务边界的零误差；实际业务区间需用以下包围点。UTC `at` 仅作跨账本关联，不把两个进程的单调读数直接相减，也未提供跨进程物理校准误差保证。任何测量不截到 5000/60000，不扣所谓日志成本。

| 原始事件                                                                 | 真实来源及如何使用                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-run-created`                                                      | [agent.ts](../apps/server/src/modules/automation/agent.ts) `startNext` 的原外层事务确认提交后才发布。`creationWindowMs` 包围整个事务；`creationInsertWindowMs` 包围实际 INSERT 请求/返回；`transactionBeginAcknowledgedByMs` 是已 BEGIN 且已 SET LOCAL 后的回调进入读数。后者不是 INSERT 或提交。三者同时保留，不挑最晚起点缩短预算。 |
| `agent-turn-dispatched / agent-turn-response-received`                   | 原 `fetch(/agent/turn)` 前、实际响应正文读取后。同一个真实 turn 尝试 UUID，stepId 为 run/ordinal。派发事件是应用进入 fetch 的边界，远端收到请求仍由独立 Agent 账本验证。                                                                                                                                                              |
| `agent-termination-decided / agent-terminal-committed`                   | `finish` 已选择 status/reason、进入终止流程的 `decisionWindowMs`；对应原终态外层 COMMIT 返回后分别记录。相同 attemptId。决定若随后提交失败并不等于已持久终态；必须配对并核对后续事件。三次审计无结论的 `audit_blocked` 原事务路径也覆盖。                                                                                             |
| `send-tool-prepared / send-tool-entered`                                 | 模型合法 send_message 已持久化；之后真实工具执行通过 schema 校验并进入 send 路径。审计/排队/历史保存之前的时间均可见，不把下一次模型请求收到作为工具起点。                                                                                                                                                                            |
| `send-audit-started / send-audit-completed`                              | 原 audit 调用/返回，包含真实审计等待及其账本/结论保存。返回已有审计结论同样是真实路径；不是把审计时段从 60 秒活动预算中减去。                                                                                                                                                                                                         |
| `send-key-resolved / send-wait-started`                                  | 前者在原 key 读取或新消息/key 外层提交之后、调用 delivery 之前；后者在 delivery 进入后。二者包围本次消息状态等待函数的进入边界。含实际 clientMsgId、run/step/tool、执行 attemptId、idempotencyKey、keyReused。                                                                                                                        |
| `send-wait-result-ready / send-tool-result-returned`                     | 真实状态循环已经返回实际 outcome 后、delivery 尚未 resolve 前；随后调用者已 `await delivery()` 得到该 outcome。二者包围结果交还边界。错误码与结果来自真实返回值，不是预先写 timeout。                                                                                                                                                 |
| `send-tool-history-committed`                                            | 实际结果、history 在原外层事务提交之后；与 send 执行 attemptId 相同，能与之后 turn 派发分开。                                                                                                                                                                                                                                         |
| `message-send/query-dispatch / response-headers / response-body`         | [remote.ts](../apps/server/src/core/remote.ts) 原 fetch 前、实际 HTTP 响应 headers 取得后、正文读取后。只有真实接收才有 responseStatus；连接中断、准备响应、私有账本不会生成接收事件。                                                                                                                                                |
| `message-recovery-adopted`                                               | [messages.ts](../apps/server/src/modules/gateway/messages.ts) 持有真实账号锁，将崩溃遗留 sending 记录转为 uncertain 的原事务提交后；attemptId=`<原消息行id>:<已持久dispatch次数>`，重启可关联同一原请求。`originalResponseReceipt:not-durably-recorded` 不能解释为远端未执行，也不虚称历史上绝对未收到。                              |
| `message-recovery-query-started / query-inconclusive / result-committed` | 每次实际自动确认查询使用新 queryAttemptId；真实普通 404/503 后为 automatic-query-pending；合法正向查询或现有已知超时否定判断真正落库后才有 terminal。`recordedTimeoutAvailable` 只是是否存在产品持久 timeout 输入，不是独立协议保证。该路径没有新增人工暂停。                                                                         |

工具等待函数进入的保守包围 `S=[send-key-resolved,send-wait-started]`，结果交还 `E=[send-wait-result-ready,send-tool-result-returned]`，差值为 `[E.lower-S.upper,E.upper-S.lower]`。索引保留未经截断的小数与原始端点。若 QA 对原文“等待消息状态”的业务起点仍认为包含更早阶段，必须保留 prepared/entered/审计阶段的更宽候选起点，不能只取较晚的内部函数名来规避要求。本批两份样本连最晚状态等待起点的下界也超过 5000ms。

`message-recovery-result-committed` 当前覆盖 dispatch 返回/查询确认路径；通过 `message_sent` 或 echo 直接确认 sent 的路径沿用已有 receipt 观测、公开状态与外部事件账本，不假称此流枚举了所有消息终态。查询异常事件发生在负向条件审查前，若随后已有合法否定完成提交，则后续 result-committed 才是该次持久结论。

## 局部修复与仍未满足的严格时限

独立提交 `89de0aa` 只将 [tool-execution.ts](../apps/server/src/modules/automation/tool-execution.ts) 原状态循环的无条件 `sleep(100)` 改为 `sleep(min(100, deadline-Date.now()))`，剩余不大于零则不睡。原始 deadline 仍在消息状态等待开始建立，未在查询/重试/504后重新计时，5000 与 60000 均未修改。数据库查询用时已包含在同一窗口中。

修后仍存在数据库读取跨 deadline、事件循环晚调度、最终状态/history/终态提交晚完成的现实边界；本批样本也实际保留了小于 1ms 的剩余越界。它只能证明消除了可避免的最后一轮额外等待，不保证严格上限。未加入提前冒称超时、理想定时器、产品时钟暂停或任何容差。

一分钟实际 run `0d813684-966c-4e36-b9a0-e87e213ec53b` 8 次外部 turn 后结束：创建事务窗口到终止决定 **[60005.274708,60011.498084]ms**，INSERT 窗口到决定 **[60007.514792,60008.213292]ms**；决定之后约 **[4.698041,4.714583]ms** 才确认终态 COMMIT。原 activity 保守区间仍为 [60005,60017]ms，不用更窄诊断替换它。

## 缺失与跨重启样例

[结构化样例](evidence/qa-backend-followup-20261001/samples.json) 包含修前/后完整 tool 流、真实 guardian 强杀前原请求无响应的事件流、新进程的自动 404 查询、后续另一条合法正向查询分支，以及一分钟生命周期和首末 activity。完整分钟所有 checkpoint 保留在原始 [minute.log](evidence/qa-backend-followup-20261001/minute.log)，没有为缩小区间删点。

强杀自测的原请求在独立 HTTP 服务中保持未返回，重启后同一 clientMsgId/dispatch attempt 自动查询，3 次真实 404 时仍 unknown、未重发；随后原请求才获准实际产生一条效果，正向查询提交 sent。后半段是收到正当结果后的独立延续，不把它当静默永无效果分支已经通过。旧/新 clockDomain 不同，新流没有制造旧 dispatch 事件。该短自测证明挂点和身份，**不是 QA 的全部时长或恢复 SLA**。

INT-ACT-001 原 safe-boundary 真实 SIGKILL/同库恢复回归仍为不完整尾段，新旧 epoch 不机械相加。此前 [活动交付文档](qa-activity-witness-20261001.md) 和旧测试日志中“QA 不接受 false 格式”的说明已是历史状态；当前 QA 契约明确接受 false 并继续检查恢复义务，本批不能再归因成 QA schema 问题。

## 验证与清理

[audit-terminal.log](evidence/qa-backend-followup-20261001/audit-terminal.log) 另补 1/1 真实审计无结论终止与晚订阅测试，验证共同 attemptId。固定 `22d770b` 的 [final.log](evidence/qa-backend-followup-20261001/final.log) 为 34/34 开发机制与回归测试；[minute.log](evidence/qa-backend-followup-20261001/minute.log) 另有 1/1 真实分钟挂点检查。这些测试验证事件因果、状态/幂等、安全屏障、真实控制器归属、强杀重新绑定及现有 timeout 行为，**没有用放宽的 5000/60000 断言把业务超限判通过**。[typecheck.log](evidence/qa-backend-followup-20261001/typecheck.log) 为空表示 `tsc --noEmit` exit 0；[format.log](evidence/qa-backend-followup-20261001/format.log) 为限定文件格式检查。原固定版本的 integrated/regression 与更早未提交的 first 日志原样保留，索引区分其版本和证据性质，不把次数相加成独立 QA 场景数量。

开发命令在本工作树执行，数据库仅使用本批容器 `kapibala-backend-evidence-dev-20261001` 的 `127.0.0.1:64562`。测试 fixture 每例新建 UUID 数据库，并在 finally/after 删除；postgres 仅用于创建/删除本批 UUID 数据库，迁移与业务写入均在这些隔离数据库内。

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64562/postgres node_modules/.bin/tsx --test tests/integration/qa-backend-lifecycle.test.ts tests/integration/qa-runtime-observation.test.ts tests/integration/qa-activity-control.test.ts tests/integration/qa-activity-witness.test.ts tests/integration/core-timeout-boundaries.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64562/postgres BACKEND_EVIDENCE_MINUTE=1 node_modules/.bin/tsx --test tests/integration/qa-agent-minute-evidence.test.ts
```

启动正式独立 QA 新 run 时继续使用原已批准 guardian/runtime launcher 配置和新完整 revision；必须从真实进程观察 token。请求不含 SQL、业务预期、结果、客户端时间或 ownerToken。QA 审阅并接入新增字段后再绑定新 run，保持旧证据不变。最后的数据库/连接、测试进程及本批容器清理见 [cleanup.json](evidence/qa-backend-followup-20261001/cleanup.json)。
