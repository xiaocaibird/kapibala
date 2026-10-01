# 2716abd 正式业务 run：恢复类结果审定准备

本文件只登记判定路径与后续核查条件，**尚未对这六项给出新版审定结论**。准备时没有原始已完成 attempt；见 [preparation-snapshot.json](preparation-snapshot.json)。不修改冻结 QA、events.json、results.json 或旧报告，不以旧版本的 recoveryNote、失败或通过代替当前候选的证据。

固定正式运行 `2026-10-01T14-26-25.068Z-1e0cb38a`，phase `business-acceptance`；SUT `2716abdd2d43a779b6a0972a6323f895cf2b5b9c`；QA `ec46f9b30fb2f5a312c92fc78463ddbfe200042f`，源树 `40b301c87542929beab4974f140879da2a698ac9498056cc2c3a3c5c1f52b0bd`；target `6ccd4df091116eea6ee0324771526dde531bb834d5e3264bc76c5e9f706a028e`。本基线与之前专项的 QA 04e4166 不混用。十份相关源码/用例文件逐一与本次 manifest 的文件哈希匹配；决策及公开恢复说明按 SUT 2716 固定版本取出核对，见 [policy-source-index.json](policy-source-index.json)。

## 1. 已确认的工程方向与未改变的验收要求

原需求第 192 行规定所有行为在任意时刻重启前后成立；第 264 行 A5.8 要求同 runId 从中断处继续并正常结束，已生效工具不重复、不记失败。A3 建群步骤与角色、promote 总调用上限仍有效。B1 要按实际收到 message_sent 的时刻安排下一步。

- **D039（decisions.md:69–75）**：负责人已确认本次不新增网关/Agent 外部能力，不能通过修改桩添加幂等、确定性模型重放或新结果查询来制造保证；安全保守处理和风险记录是已确定的工程方向。该方向不等于原自动恢复要求已满足，也未批准新增人工处置功能。无需负责人重新选择同一工程方向。本审定不要求研发盲目重建、重提权、重踢或重放未知效果。
- **D041（decisions.md:89–93）**：采用最小可靠接收记录，保存事件和首次本地观察时间并在恢复中复用；保存前硬崩溃窗口如实保留。不能把普通断连、数据库失败、一般重启归为豁免，也不能把网关 sentAt 或重放时间当成丢失的首次接收时间。方向已确认，原技术不符合与偏差接受是两回事。
- 既有决定及历史 QA 文档只作决策来源，不作为当前候选已执行证据。工程方向已批准不应写成“所有方向待授权”；只有要修改验收标准或主张按偏差通过时，才需要相应独立接受记录。

## 2. 当前冻结自动化的原始分类路径

| 用例 | 实际前提与硬断言 | 当前 raw BLOCKED/FAIL 路径 | 后续人工审阅重点 |
|---|---|---|---|
| BLK-EXT-002 | create 已真实生成一个远端群、响应仍未到 SUT 时杀实例；保留外部群、恢复同 job。每次观察 create 副作用必须恰一；完成时原群身份及 creator/admin 正确。 | `protocol-boundaries.spec.ts:107–122`：20s 无终态显式 BLOCKED；额外真实群/错误终态/身份角色错误 FAIL。未直接判断 recoveryNote。 | 同 job 的公开说明是否明确不自动重建/恢复，且当前确未完成。仅重发 HTTP 次数不独立判失败；“单意图不额外建群”是既有 A3 一致性解释，不能伪称原文提供 create 幂等键。 |
| BLK-EXT-003 | 首次 promote 已生效但响应丢失；恢复若实际重试到第二次窗口才再崩溃。调用≤2、真实角色 admin、原群和 job 完成。 | `protocol-boundaries.spec.ts:170–198`：第一阶段无下一调用/终态，或第二阶段无终态，显式 BLOCKED；次数、角色和完成结果违约 FAIL。未直接判断 recoveryNote。 | 公开说明是否明确停止自动提权恢复。未进入第二窗口不得声称双次响应丢失已测；无需第二次调用也能正确完成应可通过。 |
| BLK-EXT-004 | kick 真实生效，SUT 停机后旧 member_left 已产生，再真实重入；重启同 run。逐样本核对 kick 请求恰一、重入者仍在群、旧工具不记错误。 | `protocol-boundaries.spec.ts:436–468`：20s 原 run 无终态显式 BLOCKED；重踢、错误历史、run 身份或终态错误 FAIL。未直接判断 recoveryNote。 | 当前成员存在不能证明旧 kick 未执行。若公开暂停符合固定协议说明且完整命中上述故障链，可审定原自动恢复不符合；不能说已重复踢人，除非外部账本实际证明。 |
| BLK-EXT-005 | 先完成 send 并持久化工具结果；下一模型响应在到达 SUT 前丢失，重启允许不同合法响应。同 run、历史保留、≤12 步、原 send 不重发不记失败并正常完成。 | `protocol-boundaries.spec.ts:525–561`：20s 无终态显式 BLOCKED；历史、run、步数、外部效果或明确终态违约 FAIL。未直接判断 recoveryNote。 | 不要求未执行模型响应逐字重放；新合法 end_turn、再次 POST 本身不失败。应核对公开说明是否拒绝继续原 run，而不是仅缺少同一模型文本。 |
| REC-007 | kick 已实际移除，响应前崩溃、omitEvent；重启后同 run 正常完成、旧 kick 步不失败、远端调用一次。 | `recovery.spec.ts:453–457` 使用 `waitFor` 30s；`platform-client.ts:94–110` 超时抛普通 Error，`reporter.ts:27–41` 会记 raw FAIL，而非 BLOCKED。完成后错误状态/步骤/次数也 FAIL。 | **raw 超时 F 不等于已证明产品违约**。必须从同 run 公共 response 核查明确暂停、错误终态或外部重复等。仅有限等待不足时应单独审定证据不足，并保留原 raw FAIL 与测试分类局限。 |
| INT-MSG-007 | 单绑定实例实际首次观察消息、INSERT 尚未发出且 receipt 不存在；保持后硬杀；原后步最早到期前恢复和重放。 | `integration-message-boundaries.spec.ts:151–271`：窗口/身份未成立、原期内恢复失败、区间重叠或有限等待无结果 BLOCKED。`message-observation.ts:141–148` 确定偏离首收+20s 的排期直接 FAIL；明确重复/提前/错误终态也 FAIL。 | 不能仅因有 D041 或假设保存前不可恢复而判失败；要拿到真实原 receipt 区间、公开 scheduledAt 和恢复未跨原期限。与首收区间确定不相交才证实漂移；B 不因旧版偏移数值升级 F。 |

`observe` 在每次 read 后先运行 invariant，再判断 complete 或取证预算，因此已观察到的明确副作用/状态违约不会被该次正常预算到期改写为 B。除此之外，在后续观测前就缺环境/身份的情形仍只能按实际证据判断，不能认为所有 B 都已经验证了全部硬断言。

## 3. 允许透明审定 raw B → reviewed F 的证据门槛

对 BLK-EXT-002/003/004/005，只有下面的事实链完整时，才可由独立 QA 在单独审定记录中说明原自动恢复要求不符合：

1. 本次 manifest、QA 源前后、SUT、target、唯一首次 attempt、case/project 均绑定一致；runner 与报告完整性问题另列，不能被业务结论遮住。
2. 本次受控故障窗口实际命中，远端效果/未执行模型响应与指定 job/run 对应，实例真实中断并重启，外部桩及数据库状态保留。没有把私有远端 ID 或补造结果输入 SUT。
3. 本次 `/api/jobs/:id` 或 `/api/agent-runs/:id` **HTTP 200 的真实公开响应**包含 recoveryNote；保存 requestId、原始 api.ndjson 行号、时间、路径和资源 ID。应审阅故障后多个响应和最终事实，而非从日志片段、源码或旧报告推断。
4. 说明的具体语义与 2716 固定公开恢复说明相符，确实是未保存结果导致的**不再自动继续/派发**，而非普通暂态、信息提示或已经恢复完成但遗留说明。仅“字符串非空”不成立自动 FAIL 规则。
5. 同一资源没有本次已证实的正常自动恢复完成事实。若证据矛盾、note 含义不明确或错误归属，保留 BLOCKED/待证据，不猜永久停滞。

此时 F 的理由是公开产品状态明确拒绝履行原恢复义务，**不是“超过20秒所以永久不恢复”**。公开声明和当前状态能证明该恢复分支不符合，不需要伪造无限时间实验。实际没有发生重复副作用时要明确记录这一边界；不为了恢复而要求盲重试。

REC-007 采用同一证据标准，但可能是 raw F → reviewed F（修正解释为明确暂停），或在只有有限超时证据时 raw F → reviewed B。任何调整都在派生审定层，原异常、原状态、原版本与证据原字节保留。不能按 case ID 固定覆写新版结果；旧 `build-adjudication.py` 的历史四项映射不能无条件用于此次候选。

INT-MSG-007 按原收时间区间独立判定：receipt `[L,U]`，延迟 `20000ms`，公开排期毫秒单元 `[S,S+1]`。若 `S+1 < L+20000` 或 `S > U+20000`，明确偏离，FAIL；相交但未能完整包围时 BLOCKED。应先验证 receipt-before-commit 本地边界为 `receipt-insert-not-issued`、`receiptPresentAtProbe=false`、真实绑定且单实例，并验证 restart/replay 上界早于原最早到期。只写 D041 已确认工程处理、极端保存前窗口仍披露；不据此把原技术 FAIL 转 PASS。

## 4. 审定记录与执行入口

每项后续记录至少包括 `caseId/project/attempt/runId`、`sutRevision/qaRevision/qaTreeSha256/targetSha256`、`rawStatus/rawReason`、`reviewedStatus`、原需求条款、故障前提和真实资源身份、证据路径/行号/hash、逐项推理、反证或缺口、AI QA 审阅者身份及审阅时间。原 raw B/F 保留；技术符合性、工程处理方向已确认、验收偏差是否另行接受分别表示。无条件通过仍不能含必验 FAIL/BLOCKED/NOT_RUN。

只读扫描器 [inspect-recovery-evidence.py](inspect-recovery-evidence.py) 精确绑定本 run/version/target。它仅读取本 run 的已完成 attempt、API 与证据索引，输出供 reviewer 使用的输入，`reviewedStatus` 始终为空；不按 recoveryNote 关键词自动判决，不写原报告。未有 events/attempt 时输出 `AWAITING_RAW_COMPLETED_ATTEMPT`。在完整运行尚未结束、reporter 未写 events 时，不把已存在但未绑定完成记录的目录误称最终证据。

```sh
python3 reports/followup/20261001-2716abd-retest/full-review/inspect-recovery-evidence.py \
  > reports/followup/20261001-2716abd-retest/full-review/completed-run-review-input.json
```

后续只读复核产生的新事实应另写审阅结果，不覆盖此准备快照或原证据。当前仅准备、零新版审定结论、零产品执行。
