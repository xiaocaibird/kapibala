# D042：退群后保留外部成员事实

本轮基于接收记录提交 `65b7b3da94c840a347164711d5fd279cc7e9614b`，在独立分支 `agent/core-left-members` 实施已最终确认的 D042。**这是对原文 2.3 `leave-all` 完成后 `members = []` 的明确偏离**，不是把原文重新解释为已有相同行为；原文文件没有修改。保留 B2“群里所有服务账号退群，群主最后退；非群主失败继续其他非群主，群主不退”的要求。

## 行为与边界

- `leave-all` 的执行名单仍只取本地托管服务账号，并保持群主最后。没有新增踢出外部用户或其他远端写入。
- 完成前仍在群行锁内查询当前远端成员；只要远端仍有已知托管账号，任务仍不能成功。成功后按该快照校准外部成员：删除本地过时记录，补充远端仍在群的外部成员。`status = left`，公开 `members` 与数据库都保留外部成员，`accountId = null`、`role = member`；任务的 `gatewayMembersAtCompletion` 继续保存完成时证据。
- left 群的后续成员事件在现有群锁、2 秒查询上限和失败重试机制内，以当前远端快照校准外部成员。重复或乱序事件不能覆盖当前事实。已知托管平台身份一律排除，包括在线、离线、终态账号；远端再次出现这些账号也不恢复本地托管成员或把群改回 active。
- 外部成员存在不赋予执行资格：left 仍拒绝发送、踢人、新序列；原有 Agent 取消与序列停止/恢复守卫保持不变。此项未修改 Agent、Sequence、state、accounts 或活动时钟实现。
- 以 accounts 当前已知的 `platform_user_id` 分类服务身份，沿用现有外部成员模型；远端成员接口不提供外部角色，因此没有猜测外部 creator/admin。

## 旧数据兼容

旧版本的成功退群可能已经清空本地外部成员。**同一已处理事件 ID 的历史重放会被现有 gateway_events 去重直接跳过，启动/重放不保证自动修复所有旧 left 群。** 本轮不批量回填、不增加启动全量远端扫描。

`gatewayMembersAtCompletion` 是当时快照，不证明现在仍在群。不能直接用它恢复当前公开成员，否则已经退群的人会被重新展示。兼容恢复使用已有能力获取新事实：

1. 任一新的成员事件到达，查询当前完整列表并校准所有外部成员。
2. 对旧 left 群再次请求既有 `leave-all`：本地已无托管成员时不重复发送 leave，直接读取当前列表并完成校准。当前远端仍有已知托管账号时，原有 `MEMBER_STILL_PRESENT` 守卫照常拒绝完成，不能谎报全部服务账号已退出。

没有新成员事件或显式刷新请求、或者成员查询不可用时，旧被清空的数据不声称已经恢复。历史完成快照始终保留原样作证据。

## 验证

使用独立可抛 PostgreSQL `127.0.0.1:64550`，各用例创建 UUID 数据库；公开 API 与远端成员/退出请求通过真实 HTTP，成员事件直接调用现有处理入口；数据库迁移/写入只发生在测试自建库。未访问演示、没有运行独立 QA 或全套测试。

| 专项                                                                                                                          | 结果 |
| ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| LM01：只退托管账号、群主最后；最终 API/DB 与远端外部成员一致，过时外部成员被删除、新外部成员被补齐                            | 通过 |
| LM02：新 handler 模拟恢复；left 的外部加入/离开/乱序/重复校准；在线及终态托管账号远端再入不复活；查询 503 保留状态并可重试    | 通过 |
| LM03：非群主失败继续其他账号，失败账号与群主仍为成员，群状态保持 active                                                       | 通过 |
| LM04：最终外部成员写入触发器故障导致整体回滚，新 Jobs 实例恢复后完成，不重复远端 leave                                        | 通过 |
| LM05：真实 HTTP 拒绝 left 发消息/新序列，kick 拒绝；现有 Agent/Sequence 恢复取消/停止；外部消息不触发新 Agent，零新增远端操作 | 通过 |
| LM06：旧 left 清空 + 已处理 ledger 重放不会恢复；新成员事件或再次 leave-all 按新远端快照恢复，历史任务快照不被复制为当前事实  | 通过 |

首轮专项 5/5（LM06 加入前）；最终专项 6/6。与既有 gateway、member-rejoin、membership-reliability、gateway-member-timeout、gateway-stream-repair、confirmation-receipt-hardening 组合 57/57。唯一修改的旧行为断言为 `gateway.test.ts` 中“远端保留 external、公开 members 却为空”的用例，现显式标记 D042 并断言公开外部成员；退出失败、重入、顺序及其他权限守卫用例保持原断言。

服务端 TypeScript、变更 TS 格式检查、`verify:original`、`git diff --check` 通过。原始 TAP：[首次](evidence/core-left-members-initial.tap)、[最终专项](evidence/core-left-members-focused.tap)、[组合回归](evidence/core-left-members-regression.tap)。其中保留了少量 `idle_connection_error: terminating connection due to administrator command` 诊断，测试没有失败；本轮未扩大到连接池关闭问题，也不以通过结果宣称该诊断已消失。独立报告不替代主线集成全套回归。

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres \
node --import tsx --test --test-reporter=tap tests/integration/core-left-members.test.ts
```
