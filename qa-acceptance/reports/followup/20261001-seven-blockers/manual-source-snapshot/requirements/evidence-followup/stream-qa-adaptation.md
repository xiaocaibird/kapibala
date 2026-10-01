# INT-STREAM-001 的 QA 接收与阶段补强

2026-10-01；基于 QA 开发树 `fb1589df08f00c10e9e62801007b1698d4d0155a`。承接 [三项补证要求](ui-stream-requirements-20261001.md)，本次只改 QA 工具、该用例及其有限负载 profile。没有运行产品、数据库或浏览器，没有修改旧冻结 QA、SUT 或报告。

## 已完成

- [ReceiptSocket](../../harness/receipt-socket.ts)保存每条完整实际接收的 WS 应用消息 payload 字节、墙钟和单调时间、当时的真实 reader pause/WS readyState，另记 open、auth 发送游标、pause、resume、本端 terminate、error、close 的顺序账本。字节不含 WS/TCP 头，不用消息正文大小推算网络流量；不记录令牌或完整消息正文。
- 关闭区分 `peer-close-frame`、未知来源的 `transport-ended`、QA 的 `local-termination`。本端终止再区分清理、资源上限及非法协议；`1006` 不当作慢读策略关闭。close reason 是实际观察值，只有已交付、经核对的公开精确 code/reason 映射才参与策略判定。
- 分别限制记录数、累计实际应用 payload、单条接收 payload；保留最多一条解析完成的超预算帧，用于先检查已观察的重复/陌生身份等违约，不能先被资源 BLOCKED 遮盖。WS 接收器直接拒绝的超大 payload 是 QA 限额；非法 JSON、序号、UTF-8 等是已观察协议错误。每次专项采样先扫健康端、慢端及回放端的协议和身份，再处理 QA 限额。
- [专项](../../tests/system/integration-streams.spec.ts)将有限分批注入、健康端排空、公开历史、暂停观察、恢复读取与真实关闭、实际缺口回放分开记录。注入时间耗尽只停止新增，已注入身份必须全部保留并由健康端与历史接口完整核对；任何阶段实际身份/顺序/内容/回放违约仍优先 FAIL。
- `real-reader-receipts` 保留清理前事实；`real-reader-after-cleanup`另存本端终止/关闭结果。`finalizeReceipts`先尝试所有自有连接清理，再尝试清理后取证；已有首次 FAIL/BLOCKED 不被次要证据或清理错误替换，次要错误另记。

## 真实暂停不等于关闭过程中禁止所有接收回调

交叉复核发现锁定的 `ws 8.22.0` 在 `socketOnClose` 中先进入 CLOSING，再把暂停 socket 的已缓冲字节交给 receiver，可能在 close 通知前产生完整 message 回调。这些是客户端真实收到的数据，不是产品重复派发或 QA 主动 resume。

已移除暂停期无条件要求 seq/帧数永远等于初值的错误断言。现在保留最初 checkpoint、实际 pause 和没有 QA resume 的证据，允许 CLOSING/CLOSED 时的自动排空；实际已收 seq 正常推进，重连从排空后的最终实际游标开始，绝不丢帧或回退游标。若仍在 OPEN 时出现未解释的新增接收，记 QA 暂停前提 BLOCKED；帧本身若有重复、乱序等违约仍先 FAIL。

这条纠正由真实 QA 自有 WebSocket/TCP 自测验证：在 reader 保持暂停、无 resume 时重置自有 peer TCP，实际观察到 closing 状态下的 buffered frame 和推进后的 seq；另验证 paused + 正常 peer close 后恢复读取。没有访问产品内部状态或调用产品发送器。

## 有限配置与当前工程缺口

[负载配置](../../config/slow-reader-profile.ts)随 QA 源指纹冻结：最多 2048 条、每批 32 条/50ms、正文最多 18MiB；注入预算 45 秒，独立健康端排空 120 秒；暂停观察与恢复后关闭观察各 8 秒、回放 15 秒、历史 30 秒/60 页、迟到重复观察 1 秒，准备清理另保留 45 秒，总用例预算 272 秒。接收账本最多 8192 帧、累计 64MiB 应用 payload、单条 16MiB。配置自校验确保消息/认证/checkpoint、历史页数和字节上限一致。

这些数值是 QA 实验边界，不是生产吞吐、关闭时限或内存 SLA。默认 2048 条可能仍不足以造成真实背压；本补强不承诺消除旧 BLOCKED。超大合法产品帧因 QA 限额未观察完整时仍记 BLOCKED，不据此要求产品截断内容。

`peerClosePolicy` 当前明确为 `null`，没有编造工程 code/reason。即使已验证真实关闭、健康全集和非空缺口回放，也先保存 `closureAndReplayVerified=true`，最后因 `slowPolicyVerified=false` 记 BLOCKED，不提前退出而丢掉独立回放证据。

还需工程交付：指定候选的合法负载/运行配置及公开的慢读关闭 code/reason 语义来源。QA 核对后可绑定 `contractReference`、精确 `code`、精确 `reason`，重新冻结 QA 源及 target。若原因只能通过逐连接只读诊断关联，需要另交连接身份、真实原因/时间和来源定义，再实现审阅过的适配器；当前代码没有假装支持该能力。绝不通过改 SUT 水位/回调、主动断开产品连接、直接造数据库事件来填入通过。

## 自身验证

执行范围仅 QA 自有回环 WebSocket/HTTP/TCP peer 和本地函数，不连接 SUT、PostgreSQL、浏览器或外部服务。

```sh
npm run typecheck
node --import tsx --test tests/self/receipt-socket.test.ts tests/self/receipt-transport-observation.test.ts tests/self/recovery-ws-prerequisites.test.ts tests/self/slow-reader-profile.test.ts
```

覆盖真实 UTF-8 字节/接收时刻、暂停与关闭自动排空、peer close/未知断流/本端清理区别、非法帧优先级、记录数/字节/单帧上限、保留超预算重复帧、所有自有清理及后置取证、有限注入停止/末批与最后边界错误、profile 资源一致性。类型检查首次指出 HTTP upgrade 参数声明为 Duplex，已通过真实 `Socket` 类型判定收窄修正；不是产品失败。修正后类型检查通过，所列四个自测文件共 21/21 通过、0 失败/跳过；这些通过只证明 QA 工具，不替代产品验收。

用例 JSON 仅同步 `INT-STREAM-001` 的阶段、预算和证据说明；`INT-STREAM-002` 内容不改。生成版用例由协调者统一 render 校验，旧报告不重生成。
