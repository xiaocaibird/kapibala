# 同版本审定派生脚本独立复核

审阅时间：2026-10-01T08:01:10.749722+00:00；对象：`build-adjudication.py`，SHA-256 `4031f32388c3420abf83932ca6bbe0b8e71dcd1036a3049a0434e6e1e577927a`。审阅者：独立 AI QA。仅只读脚本与已完成冻结报告，没有执行派生脚本、没有启动产品或修改其他报告；本文件是唯一写入。

**结论：修订后的脚本口径可用于本次86ad同版本审定索引。** 不把a6b通过回填86ad，不覆盖原始run记录；需要主任务取得末3项真实完成报告后才实际生成。此意见不是预先认定末轮通过。

## 版本与结果边界

- 全量基线固定为 `2026-10-01T06-54-18.519Z-a1e23916`，其254条业务用例是唯一分母。每行rawStatus和原始rawCounts独立保留，所有写入只针对reviewedStatus或派生字段。
- BLK-EXT-002/003/004/005由原BLOCKED审定FAIL，依据公开recoveryNote明确暂停，引用既有证据归因；没有以有限观察超时本身证明永久停滞。
- 16项和末3项前提修订子集必须与全量基线有相同sutRevision。每次独立冻结执行的结果按case取最差状态后，再按真实时间顺序进入同版本审定；原run和每轮补充证据路径仍然保留。它们被明确描述为“完整原始执行+同版本补充”，没有声称在一个新QA冻结版本重跑254项。
- a6b14e73只进入laterProductRepair，关联7API+4Chromium的已实测修复结果；**86ad的BLK-SPEC-006仍是FAIL**。可以关闭后来修复版本的具体缺陷，不因此生成a6b全量验收通过结论。
- 要求级状态从254条审定行重新映射，全部关联case取最差状态。上线评估单列NOT_IN_SCOPE，业务通过不换算为上线通过。
- 脚本只写本目录 `adjudicated-baseline.json`、`.md`、`.junit.xml` 三个派生文件。所有reports/runs及reports/preflight输入均只读，原始JSON、事件和JUnit没有写入操作。派生JUnit标注reviewed evidence index及86ad版本。

## 首轮审阅意见与更新复核

| 首轮发现 | 更新后核对 |
| --- | --- |
| 逐attempt覆盖case可能使跨project最后一个PASS遮盖FAIL | 已按case最差聚合；此外本轮case-project集合明确约束每case单project |
| 缺末轮执行完整性校验，错误子集或少一项仍保留254行而不被发现 | 已硬约束16项与3项suite ID、caseId集合、预期system/chromium组合及实际attempt集合；长度相等且集合匹配保证无缺失/重复 |
| 未要求真实完成记录 | 已要求runner-summary完成时间及passed/failed终态，每条attempt完成时间、attempt=0且状态是PASS/FAIL/BLOCKED |
| 原始report和manifest身份可能不一致 | 已比较runId、phase、SUT、QA树、target/suite摘要、suite定义和executionApproval，且校验qaTreeAfter等于起始QA树摘要 |
| 子集自己的异常可能未计入 | 已检查runnerErrors、全局integrity、preflight.integrity及rejectedAttempts为空 |
| 只按参数顺序覆盖，更早run也可能成为latest | 已要求末轮startedAt晚于前轮completedAt |

当前修订脚本AST解析通过。对已完成16项真实run的metadata/manifest关键字段与qaTreeAfter匹配条件进行了只读验证，均通过。未执行脚本的写报告部分，也未拿模拟的末轮结果填充派生输出。

## 当前数据与适用范围

此前独立核对完整原始基线：254用例为222PASS/8FAIL/24BLOCKED/0NOT_RUN；262义务为230PASS/8FAIL/24BLOCKED；116要求为80PASS/18FAIL/18BLOCKED。原始文件与冻结execution树逐字节一致。

16项原始子集为12PASS/2FAIL/2BLOCKED、16项首次attempt、16份cleanup均无failures。QA源 `e1cb1318cc16c2d93992d9c891eb4a4f78861247ee19c9829c45a2d1b0db90a9` 保持不变。UI028/030原始FAIL及CAP005/032的BLOCKED不能被后续报告删除。末轮 `2026-10-01T07-58-48.233Z-e1e5e205` 的真实完成结果由主任务另行接收后派生。

主报告应同时保留纯原始统计和这份同版本审定索引；不要将不同SUT上的通过合并为某个“最终版本全量通过率”。脚本hardcoded FAIL适用于本次已经证实且未修复的86ad缺陷，不是供以后版本通用复用的裁决器。

非阻断建议：Counter可显式补齐四个状态零值键，方便机器读取。JUnit skipped属性只统计BLOCKED，而分支会给任何非PASS/FAIL生成skipped；本轮基线无NOT_RUN且复测门禁不允许NOT_RUN，实际不会不一致。若以后泛化该脚本，应同时完善零键与skipped计数，而非直接复用一次性统计假设。
