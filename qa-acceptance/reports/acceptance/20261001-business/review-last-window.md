# 原 13 项接入末轮只读复核

复核时间：2026-10-01T08:04:55.854Z。仅检查已结束运行的原始证据，没有新执行产品或修改冻结资产。候选始终为 `86ad4e7e63786f652c965308b032b98415bdd7ac`。

**原 13 项工程/夹具接入均已有逐项实际证据，接入待办为 0；有效业务结果为 12 PASS、CAP-003 仍 FAIL。** “接入完成”不等于“业务全通过”。原完整运行及中间复测的 FAIL/BLOCKED 原样保留；下面是独立补复测结论，不回填旧事件。

## 批次与源冻结

| 独立批次 | 实际范围 | 源文件树 SHA-256 | 文件数 | 冻结证据 |
| --- | --- | --- | --- | --- |
| `2026-10-01T07-48-06.522Z-66d3a279` | 16 组合；其中 CAP-002、ARC-UI-BLK-001 PASS，CAP-005 BLOCKED | `e1cb1318cc16c2d93992d9c891eb4a4f78861247ee19c9829c45a2d1b0db90a9` | 207 | source-before 与 source-after 完全一致，旧 source.tar.gz 保留 |
| `2026-10-01T07-58-48.233Z-e1e5e205` | CAP-005/UI-028/UI-030 三组合 PASS | `70d89f8391f6c5975deff5cc124c667f8b9a95166227555b5798c0e1521e976c` | 208 | source-before 与 source-after 完全一致，单独 source.tar.gz 保留 |

两轮均使用 attempt 0；后轮 `NOT_RUN` 的未选用例不能覆盖前轮有效结果。同一个 qa-premise-retest 目录被复用，版本应引用各自归档源树，不应只看当前目录或 Git 基点。完整正式运行原 QA 基点 f63 + dirty、实际 c529 内容绑定仍按主报告原记录。

## CAP-005：完整前提与结果

1. 绑定真实 API `127.0.0.1:54015`，进程组所有者 PID 86509；group `4e5fdc12-3026-412c-af7e-4d3549cf82a0`、run `0b65ca6d-615b-4a57-8784-6c1b0e3492ea`、tool `qa-kick-capacity-unreachable` 一致关联。
2. `clientMsgId=7227bef3-f70e-4c4f-80a6-61597213c0ae` 对应真实网关 `/send` 在 `07:58:51.589Z` 返回 202；公开消息先实际呈现 accepted。
3. 网关将真实 `message_failed/GROUP_WRITE_FORBIDDEN` 记入历史 eventId 5（`07:58:51.641Z`）。此时 SSE 断连用于延迟该已有失败事实的送达，未向数据库或页面直接写状态。
4. `capacity-held` 在 `07:58:51.783Z` 建立；释放前完整控制账本共 5 次同 run/tool 的 `admission-refused(reason=capacity)`，每次 callbackEntered=false、remoteRequestCount=0。这是容量耗尽命中证据，不以“没发请求”反推。
5. SSE 于 `07:58:52.045Z` 真实重连后，公共 REST 观测到同 clientMsgId 消息 failed、failCode=GROUP_WRITE_FORBIDDEN，群 unreachable；目标工具得到 GROUP_UNREACHABLE，原 run cancelled。
6. 控制器 DELETE 返回 state=released。随后 1528.247ms 的实际观察中，kick 请求 0、落地副作用 0，Agent turn 仍为 1，原 run 保持 cancelled。该有限观察证明本用例，不扩展成无限时间保证。

原正式运行 creator suspended 的错误前提及 16 项中间轮“未建立真实失败历史”的 BLOCKED 仍保留。末轮通过来自真实受理、已有失败历史回放、真实容量拒绝及公开不可写状态的完整链条。快照 `kicks[].group` 是早期场景描述；其旧 active 值不作为最终 REST 群状态。

## ARC-UI-BLK-001 与 CAP-002

ARC-UI-BLK-001 于 16 项批次真实通过：移除 Playwright 自带焦点仿真后，以两个原生 tab 验证排他焦点；账号从 online 变为 disconnected 时，页面读取在 `07:50:55.509/.763、56.266、57.269Z` 实际收到四次 503，`07:50:59.386Z` 收到 200。失败期间仍显示旧值，聚焦/点击错误/点击旧值均不清除标题与图标提醒；同文档刷新后实际呈现新值，再点击新值才确认，pageerror=[]。不再只是 adapter 可定位或 requests=[]。

CAP-002 同轮真实容量拒绝成立；取消请求后释放容量，允许原已审计当前 step 完成一次 kick，然后 run cancelled。独立账本为请求/副作用各 1、turn 1，之后约 1554.629ms 有限持续窗口无后续工作。原 30 秒 held 期间等终态的错误前提不复用。

## 关闭范围

原 13 项的 10 项已有有效结论保持，CAP-002/CAP-005/ARC-UI-BLK-001 三项 QA 纠正待复测已关闭，形成 12 PASS + CAP-003 预算下界大于 60000ms 的产品 FAIL。不能把该产品问题改称“工程控制未接入”。

本附注不消除 INT-ACT-001 跨 epoch 不完整活动证据、INT-STREAM-001 未证实的背压恢复前提、BLK-EXT-001 协议信息缺口及三项真实人工观察的阻塞，也不替代其他明确产品 FAIL 或上线评估。原始统计和逐例时间线不重写。具体 JSON 事实、证据路径和 SHA 见 integration-readiness-current.json 的 postCorrectionRetestAddendum。
