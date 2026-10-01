# 消息确认与超时窗口工程接入

2026-10-01。协议 `qa-message-observation/1`。用于隔离联调；默认 `apps/server/src/main.ts` 不加载该控制器，不增加网关/Agent 业务能力。源码批次的固定 SHA 和完整回归由总交接另行列出，QA 执行结果不由本文替代。

## 启动和归属

控制器常驻进程与 SUT guardian 分离。分别从固定提交工作树运行：

```sh
# QA 创建并审核短、规范绝对路径、0700、自有目录；macOS 使用 /private/tmp/…
QA_MESSAGE_REGISTRY_DIR=/private/tmp/kap-msg-<owned-id> QA_MESSAGE_PORT=<owned-port> \
  node --import tsx scripts/qa-message-observation-controller.ts

# SUT 启动器按其接入规则设置独占 DATABASE_URL、PORT、GATEWAY_URL、AGENT_URL，
# 从受控配置注入下列两项，再执行：
# QA_MESSAGE_REGISTRY_DIR 同上，QA_ACCEPTANCE_RESOURCE_TOKEN 为实际实例随机 token
node --import tsx scripts/qa-message-observation-server.ts
```

HTTP 只监听 `127.0.0.1`，SUT/控制器之间使用自有目录内的 `0600` Unix socket。HTTP target 为 `{apiUrl,revision,pid}`；pid 为实际 guardian/进程组拥有者。控制器验证实际应用的 UID、进程组、祖先链、启动身份、监听端口、完整提交和 live socket 注册。请求不发送 ownerToken；响应 `binding.observedOwnerToken` 来自实际 SUT 环境，QA 与自身随机 token 比较。下例用 `<redacted>`，实际响应才有真实值，归档必须脱敏。

新的规范受控配置建议为 `adapters.messageObservation={url,registryDirectory,contractReference}`。由 QA 维护配置/schema，不应使用 `sut.env` 绕过其 `QA_*` 隔离。当前只支持绑定实例窗口，不证明整个数据库所有写入者都被控制。

## HTTP 与字段

所有 body 使用严格 schema，禁止任意 SQL、文件路径、业务预期、时间戳或回调。无重定向，失败返回非 2xx。

- `GET /qa/message/v1/capabilities?apiUrl=...&revision=<40位SHA>&pid=<guardian>` 返回下例 capabilities。
- `PUT /qa/message/v1/leases/<UUID>` 请求为 `{protocol,target,mode,correlation,ttlMs}`，TTL 5000–120000ms。
- `mode` 为三个能力名之一。timeout 的 correlation 仅 `{clientMsgId}`；两种 receipt 为 `{clientMsgId,msgId,eventId}`，eventId 为事件 ID 的字符串表示。
- `GET /qa/message/v1/leases/<UUID>` 返回快照。
- `POST /qa/message/v1/leases/<UUID>/advance` **无正文**，只释放已命中的门；未命中返回 409。已 released 再调用保持幂等。
- `DELETE /qa/message/v1/leases/<UUID>` **无正文**，允许清理 armed/held，返回 released，保留历史。同 UUID 同请求不延长 TTL；不同参数返回 409。

```json
{
  "protocol": "qa-message-observation/1",
  "binding": {
    "apiUrl": "http://127.0.0.1:53521",
    "revision": "c3e2f4bd7e2affd316018db6a7d466f07b69d4fe",
    "pid": 2058,
    "observedOwnerToken": "<redacted>"
  },
  "capabilities": [
    "timeout-observed-before-local-save",
    "receipt-before-commit",
    "receipt-committed-before-business"
  ]
}
```

以下为实际开发 MO02 结果摘录（该历史提交早于最新提前 advance 校验，字段形状相同）。PUT 尚未命中时 state=armed、events=[]；命中后 GET 如下。advance/DELETE 后只改 state=released，原 events 和 expiresAt 保留，不能以 release 当业务已处理证据。

```json
{
  "protocol": "qa-message-observation/1",
  "leaseId": "2204f8bd-bbd7-4969-828b-7414374717f2",
  "state": "held",
  "expiresAt": "2026-10-01T06:04:54.752Z",
  "binding": {
    "apiUrl": "http://127.0.0.1:53521",
    "revision": "c3e2f4bd7e2affd316018db6a7d466f07b69d4fe",
    "pid": 2058,
    "observedOwnerToken": "<redacted>"
  },
  "correlation": {
    "clientMsgId": "client-a",
    "msgId": "remote-a",
    "eventId": "701"
  },
  "events": [
    {
      "seq": 1,
      "at": "2026-10-01T06:04:44.758Z",
      "kind": "window-held",
      "phase": "receipt-committed-before-business",
      "attemptId": "76777ce3-3a90-4ce0-883a-ffba487ea6a3",
      "clientMsgId": "client-a",
      "msgId": "remote-a",
      "eventId": "701",
      "observedAt": "2026-10-01T06:04:44.755Z",
      "receiptObservedAt": "2026-10-01T06:04:44.755Z",
      "instancePid": 2058,
      "databaseIdentity": "1a7a5b7e450a949b283e8a8291e3005d054838596ada3688be62117aafb85c78",
      "localBoundary": "receipt-autocommit-confirmed-business-not-started",
      "receiptPresentAtProbe": true,
      "coverage": {
        "scope": "bound-instance",
        "allDatabaseWritersProven": false
      }
    }
  ]
}
```

`attemptId` 在真实处理调用独立生成，不从 leaseId 推导；`at` 为实际挂点证据完成时间。`observedAt` 为产品当时捕获并使用的原始本地观察时间：本进程同确认身份的本地重试保留初值。`receiptObservedAt` 为实际读回的持久接收时间，历史未知为 null。timeout 无 msgId/eventId、receiptObservedAt 为 null，可带真实 groupId。`databaseIdentity` 是每个窗口实际查询到的数据库名、服务器地址/端口、PG 启动时刻的 SHA-256，不含连接密码、不缓存跨 PG 重启身份。

这里不提供名为 `commitWitness` 的自报布尔值；提交证据使用 `localBoundary` 的明确阶段及源码挂点，结合 QA 独立数据库/公开读回：

| phase                              | localBoundary                                     | 工程挂点 / 证据上限                                                                                                                       |
| ---------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| timeout-observed-before-local-save | 504-recognized-local-result-save-not-started      | 实际 RemoteError 504/NETWORK_TIMEOUT 被识别、接收时间已采集，尚未开始 persistRemoteResult；保持后不会重置该时间                           |
| receipt-before-commit              | receipt-insert-not-issued                         | 原 process 已捕获观察时刻，但本次 recordConfirmationReceipt 尚未调用。探测已存在该 receipt 时返回 window-unavailable 并释放，不冒称未提交 |
| receipt-committed-before-business  | receipt-autocommit-confirmed-business-not-started | 独立 autocommit INSERT/已提交 winner 读取已确认返回，业务事务尚未开始。SQL 发出但结果未知不会经过此挂点                                   |

控制器时间不是独立 oracle。QA 仍需保存网关发送/响应、公开 HTTP、kill/restart 的自己的时钟区间；控制器未提供全局最早物理接收时间或跨主机时钟同步误差证明。`receiptPresentAtProbe=false` 只是该查询快照，不表示其他实例此后不可能提交。多实例全局未提交要求仍需另证，不能由本能力关闭。

## 开发验证与剩余边界

- MO01：正常生产入口即使设置 QA 环境也没有 bridge。
- MO02：真正 receipt autocommit 后、业务前 SIGKILL；重启/不同 eventId 重放不重置已持久时间，公开消息实际完成，旧租约只清理旧实例。
- MO03：INSERT 前 SIGKILL 确实丢失未持久观察时刻；原始风险保留，该检查通过只说明控制器暴露了风险。
- MO04：真实 HTTP 504 后保持本地保存，放行后持久 timeout_at 仍等于最初捕获时间。
- MO05：健康 PG 下实际 held TTL 放行、UUID 幂等、错误实例拒绝、提前 advance 拒绝和清理历史保持。

首轮 2/5 的失败为开发夹具仅识别无 query 的 `/events`，未识别真实重放请求；修正后 5/5。原始两轮日志和资源索引保留在 `docs/evidence/qa-message-observation-*`，最终集成回归另列。接收记录保存前的原始物理时间丢失属于已知边界，不能用此控制器补写。

TTL 由 SUT 门和独立控制器同时持有，回收操作只针对本租约。TTL/DELETE 可结束门及等待取证的延续，但底层已经开始的 PostgreSQL 只读查询不能依赖现有 Database 公共接口强制取消；数据库永久挂起时不保证原业务请求按时完成。控制器/主机重启后的未观测历史仍不承诺恢复；旧实例退出通过真实进程死亡/启动身份核验，不依据一次 ps 出错判断。归档、实际执行及 PASS/FAIL/BLOCKED 由 QA 独立维护。
