# 媒体引用与清理的精确观察入口

本文件补充 [C1 已有媒体接入](qa-media-scenarios-20261002.md)，供 QA 独立接线；不是 QA 验收结果。只在显式 `scripts/qa-runtime-observation-server.ts` 或 combined `scripts/qa-observation-server.ts` 的 runtime registry 启用。普通 `main.ts` 不安装 observer；不增加业务状态、强制清理或未知结果恢复接口。必须使用自有数据库、MEDIA_DIR、Gateway/Agent 与真实 guardian，所有权启动要求沿用 [runtime 契约](qa-runtime-observation-adapter.md)。

## 能力与请求

向 controller 发 `GET /qa/runtime/v1/capabilities?apiUrl=<URL编码实际SUT地址>&revision=<实际完整提交>&pid=<实际guardian PID>`，确认绑定和 `media-reference-witness`。以下 JSON 的占位内容都必须替换为真实身份；`mediaId/groupId/msgId` 必须共同指向当前同一条媒体行。每个请求使用独立 UUID。

```json
{
  "protocol": "qa-runtime-observation/1",
  "target": {"apiUrl":"http://127.0.0.1:ACTUAL_PORT","revision":"ACTUAL_FULL_SHA","pid":12345},
  "ttlMs": 20000,
  "mode": "hold-media-reference",
  "correlation": {
    "kind":"media-reference","groupId":"ACTUAL_GROUP_ID","msgId":"ACTUAL_GATEWAY_MSG_ID","mediaId":"ACTUAL_MEDIA_UUID",
    "operation":{"kind":"history","runId":"ACTUAL_RUNNING_RUN_ID","toolUseId":"ACTUAL_TOOL_USE_ID"}
  },
  "holdAt":["reference-before-lock","reference-registered"]
}
```

上例用于真实 `get_recent_messages`：在自己的 Agent HTTP 回复发出前，已知真实 run 和将返回的精确 toolUseId，先建立租约再释放该合法模型回复。toolUseId 必须与该 run 中实际执行的调用匹配；不匹配不会命中，不能把未命中写成执行成功。触发引用用同一结构，将 operation 换成 `{"kind":"trigger","messageId":"ACTUAL_MESSAGES_ROW_ID"}`，要求该非自有消息已经持久化、属于同一 group/msg、尚未分配 run。可用原真实 PG `agent_pending` 表锁暂缓调度扫描，待媒体消息落库后建立精确租约再解除该锁；不是“任意下一个 run”。

```json
{
  "protocol": "qa-runtime-observation/1",
  "target": {"apiUrl":"http://127.0.0.1:ACTUAL_PORT","revision":"ACTUAL_FULL_SHA","pid":12345},
  "ttlMs": 20000,
  "mode": "hold-media-cleanup",
  "correlation": {"kind":"media-cleanup","groupId":"ACTUAL_GROUP_ID","msgId":"ACTUAL_GATEWAY_MSG_ID","mediaId":"ACTUAL_MEDIA_UUID"},
  "holdAt":["cleanup-before-lock","cleanup-claimed"]
}
```

清理操作身份是不可复用的持久 mediaId 的删除生命周期；首次真实清理尝试匹配后固定 operationId，后续重试不会重新命中这个租约。建立租约不会启动清理，仍须真实保留期/年龄 fixture 及原后台调度形成候选。只有完全同 target、同 group/msg/media 的一对 reference + cleanup 可共存；同模式重复、其他文件混合或更改 UUID 正文被拒绝。

共同字段 `target/ttlMs/correlation/holdAt` 必填，TTL 为 5000–120000ms。`PUT /qa/runtime/v1/leases/:uuid` 建立，`GET` 读取，`POST /qa/runtime/v1/leases/:uuid/advance` 无正文仅释放当前已命中的门（未命中返回 409），`DELETE` 无正文解除该 UUID。重放同一 PUT 不延 TTL；未知 UUID 404。旧 UUID 不能解除另一租约或新进程。

## 真实阶段与边界

| 事件 | 发生位置与可停等性 |
| --- | --- |
| `reference-before-lock` | 真实引用事务内，尚未执行媒体 SELECT FOR UPDATE；可 hold |
| `reference-locked` | SELECT 已返回，`selectedMediaIds` 为实际选中行，锁仍在原事务；可 hold |
| `reference-registered` | 对选中行的引用 INSERT 已返回，仍未提交；可 hold；另一连接不应将它当作已持久引用 |
| `reference-committed` | 原调用方的真实外层事务已成功返回后；可 hold，不能回滚或重新执行已提交业务 |
| `cleanup-before-lock` | 原清理候选进入真实 claim 事务，但尚未 SELECT FOR UPDATE；可 hold |
| `cleanup-claimed` | 原 claim 事务已成功提交 deleting/清公开路径之后，物理 unlink 之前；可 hold |
| `cleanup-skipped` | 原 claim 事务返回 false 且提交成功，保留原引用检查判断；仅记录 |
| `cleanup-completed` | 原删除文件及 deleted 更新真实返回后；仅记录 |

每条事件包含绑定、精确 correlation、由该进程生成的 operationId、单调时钟、实际 PG backendPid/transactionId。transactionIdentityScope 明确这些 PG 身份属于原引用事务或原 cleanup claim 事务；提交后的事件保留该因果身份，不能据此称后续 deleted 更新也使用同一连接。引用事件还含真实 runId/触发消息或 toolUseId。该观察从本次命中开始，不补造前进程历史。

首次匹配后租约只跟随该 operationId。advance/DELETE/TTL/控制退出只解除相应等待，不执行 INSERT、COMMIT、unlink 或重做调用；业务继续原语句，异常仍经原事务回滚/连接清理。release 后不再追加阶段；因此缺少 committed 事件只表示未观察到，不能证明提交失败。停等服从现有 operation signal、数据库 deadline 与独立 TTL，不增加原活动预算。reference-committed 和 cleanup-claimed 的观察发生于真实提交之后，没有以观察回调回滚已提交结果的机制。正常入口无 observer，不增加这些停等和身份查询。

## 两个方向及跨重启取证

引用先取得锁：先精确 arm 两租约，老化 ready 文件并让 cleanup 停在 before-lock，再释放已知 Agent history 回复，让 reference 停在 locked。advance/TTL 解除 cleanup 后，它应在真实 PG 行锁等待该引用事务；核对事件 backendPid 与 pg_blocking_pids。推进 reference 至 registered、核对另一连接尚不可见引用，再推进到真实 committed。原清理重新检查 running 引用后应保留文件；不是凭等待时长推断保护成立。

清理先认领：reference 停在 before-lock，再让实际清理停在 claimed。另一连接应看到 deleting、公开路径空，而物理文件仍存在。推进 reference 后其 selectedMediaIds 不应包含已认领文件；引用提交不能复活该资源。独立解除 cleanup 后由原代码完成物理删除。比较两个租约的事件前缀、expiresAt 和文件事实，证明 A 解除/过期不释放 B。

未知结果跨重启沿用真实 Agent 工具与 Gateway 错误路径：先由真实触发或 history 引用完成提交，真实派发 kick 后由独立 Gateway 返回无法证明结果的错误，观察 run 仍 running 且 recoveryNote 非空，以及执行 intent。老化后仍应受 running 引用保护；记录旧进程退出并在同库同 MEDIA_DIR 重启，核对同 run/引用/文件、未新增派发账本。只读 SQL 与公开 run/message API 交叉核对，不插入 running/pin 行冒充真实路径。最后若经公开取消结束运行，再观察正常清理。现有 unknown effect 语义和外部协议均不扩大。

开发固定候选、自测原始记录与资源清理将在真实进程验证完成后附录，不预填通过。
