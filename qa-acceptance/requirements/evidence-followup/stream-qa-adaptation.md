# INT-STREAM-001 的 QA 接收与阶段补强

2026-10-01；初始补强基于 QA 开发树 `fb1589df08f00c10e9e62801007b1698d4d0155a`，本次另接收研发预交接 `68d28d80acb059387af14dcb41a2be62f1d14e12` 的公开连接日志契约。后者不是最终执行候选。承接 [三项补证要求](ui-stream-requirements-20261001.md)，本次只改 QA 工具、该用例及其有限负载 profile。没有运行产品、数据库或浏览器，没有修改旧冻结 QA、SUT 或报告。

## 已完成

- [ReceiptSocket](../../harness/receipt-socket.ts)保存每条完整实际接收的 WS 应用消息 payload 字节、墙钟和单调时间、当时的真实 reader pause/WS readyState，另记 open、auth 发送游标、pause、resume、本端 terminate、error、close 的顺序账本。字节不含 WS/TCP 头，不用消息正文大小推算网络流量；不记录令牌或完整消息正文。
- 关闭区分 `peer-close-frame`、未知来源的 `transport-ended`、QA 的 `local-termination`。本端终止再区分清理、资源上限及非法协议；`1006` 自身不当作慢读策略证明。原 peer-frame 精确 code/reason 映射路径保留；新连接日志归因是独立结果，绝不重写真实关闭码或 source。
- 分别限制记录数、累计实际应用 payload、单条接收 payload；保留最多一条解析完成的超预算帧，用于先检查已观察的重复/陌生身份等违约，不能先被资源 BLOCKED 遮盖。WS 接收器直接拒绝的超大 payload 是 QA 限额；非法 JSON、序号、UTF-8 等是已观察协议错误。每次专项采样先扫健康端、慢端及回放端的协议和身份，再处理 QA 限额。
- [专项](../../tests/system/integration-streams.spec.ts)将有限分批注入、健康端排空、公开历史、暂停观察、恢复读取与真实关闭、实际缺口回放分开记录。注入时间耗尽只停止新增，已注入身份必须全部保留并由健康端与历史接口完整核对；任何阶段实际身份/顺序/内容/回放违约仍优先 FAIL。
- `real-reader-receipts` 保留清理前事实；`real-reader-after-cleanup`另存本端终止/关闭结果。`finalizeReceipts`先尝试所有自有连接清理，再尝试清理后取证；已有首次 FAIL/BLOCKED 不被次要证据或清理错误替换，次要错误另记。

## 真实暂停不等于关闭过程中禁止所有接收回调

交叉复核发现锁定的 `ws 8.22.0` 在 `socketOnClose` 中先进入 CLOSING，再把暂停 socket 的已缓冲字节交给 receiver，可能在 close 通知前产生完整 message 回调。这些是客户端真实收到的数据，不是产品重复派发或 QA 主动 resume。

已移除暂停期无条件要求 seq/帧数永远等于初值的错误断言。现在保留最初 checkpoint、实际 pause 和没有 QA resume 的证据，允许 CLOSING/CLOSED 时的自动排空；实际已收 seq 正常推进，重连从排空后的最终实际游标开始，绝不丢帧或回退游标。若仍在 OPEN 时出现未解释的新增接收，记 QA 暂停前提 BLOCKED；帧本身若有重复、乱序等违约仍先 FAIL。

这条纠正由真实 QA 自有 WebSocket/TCP 自测验证：在 reader 保持暂停、无 resume 时重置自有 peer TCP，实际观察到 closing 状态下的 buffered frame 和推进后的 seq；另验证 paused + 正常 peer close 后恢复读取。没有访问产品内部状态或调用产品发送器。

## 公开日志的最小接入

研发公开说明 `docs/stream-evidence-followup-20261001.md@68d28d80acb059387af14dcb41a2be62f1d14e12` 给出真实 `connectionId`、服务 PID、TCP 双端地址/端口及 `configured → realtime-auth → close-requested → terminate-requested → closed` 来源。只读核对该候选：10 份证据文件均匹配清单；最终实验 gzip 解压 SHA-256 为 `a540631d7a1dc755e36e6839004a4bdf260e9f4af3d35f8194a56ca1fe96884a`；JSON 内三个相关源码 SHA-256 均匹配候选。这里只确认材料与适配依据，不把开发实验作为 QA PASS。

[连接日志适配器](../../harness/stream-close-observation.ts)独立解析本例 `qa.outputDir/server.log`，不导入研发测试或产品发送器，不访问新控制接口。ReceiptSocket 在真实 open 时保存 QA 自有 Node socket 的 TCP tuple，关闭后仍保留原值；日志中的 peer 端必须与 QA local 端对应，local 端与 QA remote 端对应。只做 IPv4 映射地址的等价归一化；无中继控制/猜测，中继不匹配即 BLOCKED。

关联必须唯一，且同一服务 PID、connectionId 和完整 tuple 从配置、认证到实际关闭都一致。认证记录还核对真实 auth 请求的 sinceSeq。只接受公开慢读原因 `send-timeout` 或有实际超水位数值的 `buffer-high-water`，不接受 application、send-error、pending-overflow 或只有 configured 阈值的记录。真实异常关闭 1006 必须再具备同一原因的 terminate-requested 和真实 closed，且没有 QA 本端 terminate；正常完成 close handshake 时不要求未发生的 terminate。产品必须在实际暂停读取的窗口内发起关闭。

`OwnedProcess.pid` 是 QA guardian PID，公开日志 pid 是其实际子进程；本适配不将两者强行相等。来源绑定为本例独占的 OwnedProcess 输出文件、已校验归属的 loopback API 与 reader 实际 tuple，再在日志链内要求同一实际 PID。只有同 PID 的单调时间比较顺序；不跨进程相减，也不要求 Node 定时器观测恰好达到 5000.000ms。关闭原因、实际 payload 和完整接收各有独立证据，发送尝试/回调次数不代替客户端已收。

适配只读取有限日志前缀，保留 path、捕获字节数、SHA-256、未完成尾行字节及原始 JSON 行号/字段。最终 server.log 可能因清理继续增长，捕获 SHA 指该字节前缀，不假称最终全文件 hash。缺失、重复、错配、乱序、不同默认实参、日志限额或未完成尾行均不产生通过。

## 有限配置与判定边界

[负载配置](../../config/slow-reader-profile.ts)随 QA 源指纹冻结：最多 8208 条，每条保留唯一身份及 128B ASCII 填充正文，每批 32 条/50ms，注入正文总上限 2MiB、注入预算 120 秒。这里没有声称“128B 正文就是 WS 帧尺寸”；公开 WS 事件不含正文，因此去掉原先无助于 WS 压力的 8KiB 填充。

健康端排空 120 秒，暂停观察与恢复后关闭观察各 8 秒，回放 30 秒，历史 60 秒/170 页（每页 50），迟到重复观察 1 秒，日志落盘观察 3 秒，准备清理 45 秒；总用例预算 395 秒。每连接最多 20000 帧、64MiB 实际应用 payload、单条 16MiB，日志前缀上限 32MiB。配置自校验保证消息、认证/checkpoint、历史遍历和字节预算相容。不存在未命中后自动无界加压，也没有改变产品水位/发送回调。

这些都是 QA 实验和资源边界，不是新的产品吞吐、物理关闭时限或内存 SLA。8208 条也不保证任何机器都产生背压；旧端排空后没有真实缺口仍为 BLOCKED，本次没有伪造缺口或让接收账本跳过数据。

健康完整集合、公开历史正文、旧连接实际接收前缀、实际 cursor 重连与非空缺口回放的所有预期保持不变。全部外部断言执行后，才处理日志是否足以归因；等待日志期间继续核对所有原协议/身份/回放断言，任何实际违约优先 FAIL。`peerFramePolicyVerified` 与 `connectionAttribution.verified` 分开保存，二者都不能替代 `closureAndReplayVerified`。仍无原因时保留已完成证据再 BLOCKED，不因日志缺失遮盖先发生的 FAIL。

当前 peerClosePolicy 仍为 null；serverLogPolicy 绑定上述公开契约和正常连接实参 1MiB/5000ms/1000ms。正式运行前仍需冻结最终候选与相应 QA/target/授权摘要；正常入口需保留 logger。专用装配若关闭 logger，适配不会猜测或按开发自测结果补填。

## 自身验证

执行范围仅 QA 自有回环 WebSocket/HTTP/TCP peer 和本地函数，不连接 SUT、PostgreSQL、浏览器或外部服务。

```sh
npm run typecheck
node --import tsx --test tests/self/receipt-socket.test.ts tests/self/receipt-transport-observation.test.ts tests/self/recovery-ws-prerequisites.test.ts tests/self/slow-reader-profile.test.ts tests/self/stream-close-observation.test.ts
```

覆盖真实 UTF-8 字节/接收时刻、暂停与关闭自动排空、peer close/未知断流/本端清理区别、非法帧优先级、记录数/字节/单帧上限、保留超预算重复帧、所有自有清理及后置取证、有限注入停止/末批与最后边界错误、profile 资源一致性。新增真实 TCP 两端互证、1006 完整关闭链、正常 peer handshake、真实超水位、错配/复用 tuple、错 PID/connectionId、配置和认证不符、缺失/重复/乱序、非慢读原因、本端 cleanup、日志前缀 hash 和未完成尾行等自测。首次类型检查发现自测 fixture 的 unknown 数字比较，已显式转换后修正；不是产品失败。修正后类型检查通过，所列五个自测文件共 28/28 通过、0 失败/跳过；这些通过只证明 QA 工具，不替代产品验收。

本轮只改上述接收账本、独立日志适配器、INT-STREAM-001 接入、负载配置、专属自测与本文；INT-STREAM-002、用例 JSON/生成版、suite/package、产品和旧报告不改。协调者统一同步用例文字和 render。
