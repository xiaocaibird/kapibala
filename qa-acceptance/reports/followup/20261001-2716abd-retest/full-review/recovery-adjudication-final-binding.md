# 六项恢复审定：最终原始事件绑定

绑定时间：2026-10-01T15:07:01.868288+00:00。正式 run `2026-10-01T14-26-25.068Z-1e0cb38a` 已结束。

原审阅 JSON/MD 和 47 份原取证索引逐字节保持不变；本文件和 JSON 仅追加终版绑定。六项均只执行一次（attempt 0），最终 events 与 automation-original 中的同项事件完全相同，generated results 仍保持原始分类。

| 用例 | 原始 | 独立审定 |
|---|---|---|
| BLK-EXT-002 | BLOCKED | FAIL |
| BLK-EXT-003 | BLOCKED | FAIL |
| BLK-EXT-004 | BLOCKED | FAIL |
| BLK-EXT-005 | BLOCKED | FAIL |
| REC-007 | FAIL | FAIL |
| INT-MSG-007 | FAIL | FAIL |

四项 BLOCKED→FAIL 的完整故障链和公开暂停说明见先前审阅；REC-007 不以任意 30 秒探测预算作为恢复 SLA。INT-MSG-007 的真实排期偏离保持 FAIL。原始记录均未覆写。

runnerErrors=[]；integrity=[]。自动执行计数 {'PASS': 245, 'FAIL': 5, 'BLOCKED': 6}；录入人工后 254 条业务用例计数 PASS 240 / FAIL 5 / BLOCKED 9 / NOT_RUN 0（全目录额外 12 条未执行为候选和上线门禁，不计入业务分母）。这两个分母不同，不把项目执行次数当独立用例数。

SUT `2716abdd2d43a779b6a0972a6323f895cf2b5b9c`；QA `ec46f9b30fb2f5a312c92fc78463ddbfe200042f`；QA 源码指纹 `40b301c87542929beab4974f140879da2a698ac9498056cc2c3a3c5c1f52b0bd`。

最终 generated 报告及自动原件哈希保存在 [binding JSON](recovery-adjudication-final-binding.json)。此绑定不包含整轮其他失败的审定，也不为新候选或整轮签发 PASS。
