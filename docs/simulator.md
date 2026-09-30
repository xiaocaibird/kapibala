# 模拟服务与故障复现

> 代码入口与命令均相对于项目根目录。运行位置、当前演示版本和证据边界见[文档入口](README.md)。

网关与 Agent 独立监听 3101 / 3102，业务服务只依赖原协议。辅助 `/__control` 接口仅属于本地测试控制平面，不是业务协议扩展；未来真实 Agent 可以只替换 AGENT_URL。

网关 `GET /__control` 返回模拟成员、消息、完整事件与请求日志；`POST /__control/config` 局部设置：

| 字段 | 示例 | 效果 |
|---|---|---|
| duplicateEvents / outOfOrder | true | 实时重复推送 / 奇数事件延迟700ms |
| sendDelayMs / sendResponseDelayMs | 1500 / 1000 | 消息发出与202响应相互独立 |
| sendFaults | ["RATE_LIMITED"] | 下一次send限流2秒；期间再send重置等待 |
| sendFaults | ["NETWORK_TIMEOUT"] | 返回504，1500ms后落地 |
| sendFaults | ["NETWORK_TIMEOUT_NO_EFFECT"] | 返回504且不落地 |
| queryUnavailable | true | by-client-id返回503 |
| unavailable | true | 业务端点整体503，控制面仍可恢复 |
| inviteReadyMs / expireInviteOnce | 1000 / true | 邀请延迟可用 / 下一次join链接过期 |
| joinNever / leaveFailures | ["account-3"] | 对指定账号不发入群事件 / 退群失败 |
| promoteNotMemberOnce | true | 下一次promote返回NOT_MEMBER_YET |
| kickFaults | ["NETWORK_TIMEOUT"] | 504后1500ms移除目标；NO_EFFECT变体不移除 |

```sh
curl -s http://127.0.0.1:3101/__control/config -H 'Content-Type: application/json' -d '{"duplicateEvents":true,"sendFaults":["NETWORK_TIMEOUT"]}'
```

`POST /__control/message {groupId,senderPlatformUserId?,text,sentAt?,msgId?}` 产生外部入站消息；groupId 使用网关群 ID。传旧 sentAt 可验证任意历史补投。`POST /__control/account-status {accountId,status}` 触发终态及成员离群。`POST /__control/member {groupId,platformUserId,joined}` 改变外部成员。`POST /__control/disconnect-events {}` 断开所有 SSE。`POST /__control/replay {eventId}` 用新 eventId 补投原内容。

Agent `GET /__control` 提供 turn/audit 调用证据。`POST /__control/config` 设置 `turnScript`（每个run按轮次选择）或 `auditScript`（每次审计消费一项），条目形状 `{status?,raw?,body?,delayMs?}`。`raw` 用于坏 JSON；`body` 为合法协议对象。`turnDelayMs/auditDelayMs` 可配置延迟。默认流程读取最近消息、发送一条回复、finish；文本包含 `[reject]` 时审计 fail。

```json
{"turnScript":[{"raw":"not JSON"},{"body":{"stop_reason":"tool_use","content":[{"type":"tool_use","id":"unknown-1","name":"missing_tool","input":{}}]}},{"body":{"stop_reason":"end_turn","content":[{"type":"text","text":"完成"}]}}]}
```

模拟器持久保存已完成状态和全事件；演示默认时序为 send 250ms、join 200ms、kick 1秒。定时待执行动作目前在模拟器进程内；因此业务服务重启验证保持模拟器运行，不能把模拟器进程重启等同外部平台恢复保证。Agent 默认脚本按runId计轮次，重放相同历史不保证幂等。原协议不可判定窗口仍保守处理，不利用模拟器日志替业务系统偷偷完成协议外确认。
