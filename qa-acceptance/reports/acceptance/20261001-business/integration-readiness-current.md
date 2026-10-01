# 当前工程／夹具接入复核

更新 2026-10-01T07:45:32.055Z。候选 `86ad4e7e63786f652c965308b032b98415bdd7ac`；正式运行 `2026-10-01T06-54-18.519Z-a1e23916` 已于 2026-10-01T07:32:54.100Z 结束，6项人工结果已录入。仅只读现有证据，本次未执行产品。

QA执行checkout为Git基点 `f63b3e3b2b4f6e84b145dc03e724c0da03a4acdc` **加dirty工作树**。196文件整体SHA `fb50f282f910d462545601e835db8fb10288c9c40718a4d5e0d0659f720fcb11`；其中195份QA资产逐字节匹配 `c529f31076f9c645b5b1b04a2184e641c81b031b`，另1份为执行本地 `config/preflight-authorization.local.json`。不能把基点f63当成实际测试内容，也不能声称全部196文件都提交在c529。

**原13项的材料/配置已全部到位；实际故障控制或制品恢复有12/13项直接证据，剩余1项只到达真实页面，失焦前提仍需补复测。** 不能概括为13项都已验证。业务结果原始9 PASS / 3 FAIL / 1 BLOCKED；独立归因后是9项PASS、CAP003产品FAIL，以及CAP002/005/ARC-UI-BLK001三项QA纠正待复测。

## 逐项实际命中与结果

| 原待办 | 真实接入事实 | 原始结果 | 当前归因/下一步 |
|---|---|---|---|
| CAP-001 | 本例独立绑定92574；真实held、2次关联capacity拒绝，callback未进入/远端0；释放后同step一次审计和kick，正常结束。 | PASS | 有限场景PASS |
| CAP-002 | 本例独立绑定93005；真实held及515次关联capacity拒绝已发生。原脚本保持占用时等待30秒终态，违反当前步完成后取消的前提；控制器接入成立，业务取消结论须修正QA后重测。 | FAIL | QA前提已纠正，等待独立16项子集；原始状态保留 |
| CAP-003 | 本例独立绑定93839；持续真实拒绝921次并采得run-terminal活动区间[60010,60112]ms，独立公开界[59861.22225,60159.5885]相交；明确下界超过60000，产品FAIL，非缺控制器。 | FAIL | 原60000ms预算明确超限FAIL，不是接入缺失 |
| CAP-004 | 本例独立held/2次拒绝后关闭autoKick，释放后真实POLICY_DENIED、零kick，原run正常结束。 | PASS | 有限场景PASS |
| CAP-005 | 本例真实held及262次拒绝已发生；原注入creator suspended不等同群不可写，公开群仍active且网关writable=true。控制器接入成立，须改为真实GROUP_WRITE_FORBIDDEN前提重测。 | FAIL | QA前提已纠正，等待独立16项子集；原始状态保留 |
| CAP-006 | 两个独立lease均有真实拒绝，各3次：creator-remains与no-qualified-actor。在线/群成员/管理员资格变化后分别选剩余creator或NO_AVAILABLE_ACCOUNT，原始用例PASS。 | PASS | 有限场景PASS |
| CAP-007 | leave/rejoin两个独立lease均各2次真实拒绝；目标离开或重入后按同一platformUserId完成检查，原始用例PASS。 | PASS | 有限场景PASS |
| CAP-008 | OWNER_LEFT与NO_PERMISSION两分支各自held并真实拒绝2/3次；释放后由真实网关请求返回既定业务错误，原始用例PASS。 | PASS | 有限场景PASS |
| CAP-009 | 本例真实capacity-refused → before-ready-held，当前attempt尚无ready-persisted；强杀完成07:17:33.134Z早于租约07:19:02.988Z，原run/step恢复且不重审，PASS。 | PASS | 有限场景PASS |
| CAP-010 | 本例在kick真实派发后占用剩余容量，held贯穿终态；此场景不要求让已在途操作再触发admission-refused。真实504后成员效果收敛，同kick不回退重放，PASS。 | PASS | 有限场景PASS |
| BLK-MIG-001 | 正式run再次恢复真实schema7归档；候选明确拒绝启动，前后结构/数据指纹保持，PASS。 | PASS | 有限场景PASS |
| UI-037 | 正式run再次恢复微秒/同时间ID归档；独立6行清单、双向pageSize2跨页匹配，system项目PASS，非浏览器视觉验证。 | PASS | 有限场景PASS |
| ARC-UI-BLK-001 | 正式浏览器已登录并按真实row/state适配确认account-1在线；配置制品已绑定。但焦点仿真使真实失焦前提失败，requests=[]，尚未触发online→disconnected的失败快照/提醒确认组合。 | BLOCKED | QA前提已纠正，等待独立16项子集；原始状态保留 |

CAP001..010不是从一个成功例推断：JSON逐条绑定本用例的实际pid、leaseId、group/run/tool身份、事件种类和原始文件SHA。006/007/008分别保留两个分支。CAP009有ready保存前的真实hold及TTL内kill；CAP010场景是“先派发、后占用剩余容量”，其held不被伪写成新的admission-refused。CAP003活动区间由本例真实终态给出，控制器能够取证正是发现产品FAIL的基础。

ARC-UI-BLK001实际登入账号页、命中行/状态并显示online，但 `resource-observation-final.requests=[]`：还没开始该条失败读取/提醒确认组合。自有空白页已证实Playwright默认焦点仿真及其修正；这是工具验证，不是产品PASS，刷新/错误/确认完整路径仍待补复测。

CAP002旧脚本在held期间等终态，误造30秒取消SLA；CAP005把creator终态错误等同群不可写。真实容量拒绝均已触发，因此应登记QA场景纠正，不退回“缺工程控制器”。修正后的产品结果未预填。

## 原13项之外的专项与人证据

| 接入分区 | 本轮事实 | 剩余边界 |
|---|---|---|
| INT-R01 | 公开消息/独立网关与504已识别挂点均有本轮取证，六例PASS。 | 有限窗口不证明任意外部在途请求恢复。 |
| INT-R02 | 真实safe hold、TTL内强杀、同run恢复、terminal已观测；无recovery-paused。 | 跨epoch includesUnsavedTail=false，严格60000ms累计预算尚无完整真值。 |
| INT-R03 | 007保存前强杀公开排期至少后移2305ms，FAIL；008真实提交后恢复复用原接收时间PASS。 | 产品已丢失的首次时间不能变成QA缺接入；007原要求未满足。 |
| INT-R04 | 暂错原事务恢复/后请求真实等待，以及持续错原事务回滚、无虚假成功WS、显式新操作均完成。 | 不是跨系统原子提交；远端成功/本地回滚差异仍记录。 |
| INT-R05 | 001已暂停TCP读取，但有限负载未得到完整健康消费者集合，未进入已证实缺口重放，BLOCKED；002同冻结快照分页PASS。 | 不将未触发关闭的负载视为产品吞吐FAIL或完整慢端恢复PASS。 |
| INT-R06 | 真实失败/开始前保持/running保持/自然成功，公开诊断按实际变化。 | 仅gateway模块与有限秘密样本，不证明全部监控告警。 |

交付/文档三项 MAN-DELIVERY001、MAN-DELIVERY002、DOC-MAN001均已在正式run登记PASS：独立npm ci、README启动、schema8、双身份REST/WS及Chromium最小流程与精确清理，不采用研发自测结果。MAN-IME001、MAN-FOCUS001、MAN-UX001已登记BLOCKED；“人工6项已录入”不等于6项通过。系统输入法、真实系统应用/窗口焦点及标签栏呈现、未读实现说明的操作者理解仍需真实证据。

外部强恢复专项已接入并实际运行，不再统称待办。INT-MSG007排期偏移为明确FAIL；BLK-EXT002..005明确安全暂停审定强恢复FAIL而raw BLOCKED保留；BLK-EXT001与INT-ACT001维持证据不足BLOCKED。上线容量/性能/持续运行、RPO/RTO、发布回滚、生产身份与监控仍另行评估，不混入业务13项。

## 证据与归档

最终15组合冒烟15 PASS、重试0的历史记录保留；正式结果使用本轮逐例证据，不以冒烟代填。fixture重绑定review此前归档缺口已补齐，原字节SHA `f659340f3c774fdbbf5306df81f7625a8cd0017aa817f55884d530e697a9057a`；该review为Git对象/既有证据兼容性重绑定，restoredAgain=false，实际恢复另由正式BLK-MIG001/UI037证明。

完整控制账本、逐项证据及哈希见 [JSON](/Users/zcm/.codex/worktrees/independent-qa-acceptance/kapibala/qa-acceptance/reports/acceptance/20261001-business/integration-readiness-current.json)；原始最终结果见 [results.json](/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/runs/2026-10-01T06-54-18.519Z-a1e23916/results.json)。当前统计不回写冻结preparationReadiness历史文本，不改原事件，不预先使用16项补复测结论；后续子集由主任务单独附注。

## 后续独立补复测附注（2026-10-01T08:04:55.854Z）

原文以上为 07:45 时点的完整正式运行结论，保持历史事实。现已只读核对两次独立补复测：16 项批次 CAP-002、ARC-UI-BLK-001 PASS；末轮三项批次 CAP-005 PASS。原 13 项实际控制/夹具接入证据由 12/13 补齐为 **13/13，工程接入待办 0，当前有效业务结果 12 PASS / 1 FAIL（CAP-003）**。旧 FAIL/BLOCKED 不覆盖；CAP-005 真实 accepted、失败历史、容量拒绝、公开 unreachable、释放后零 kick 均逐项有证据。详见 [末轮复核](review-last-window.md) 与 JSON 的 postCorrectionRetestAddendum。其他协议、人工证据阻塞和产品 FAIL 仍保留，不能据此宣称业务全部通过或可上线。
