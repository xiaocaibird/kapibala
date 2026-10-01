# 首轮固定候选独立验收补充报告

**本次有限影响复测：5 PASS / 0 FAIL / 0 BLOCKED，单次执行、零重试。首轮整体业务验收仍未通过；新版本全量验收未重跑，上线评估未执行。** 按用户最新收尾要求，本报告签发后暂停，等待是否继续的决定，不再自动修复或补测。

本次闭合的是健康 PostgreSQL 下、真实容量延后后已派发 kick 的**正常 work 截止轨迹**：原确认 GET 在实际 work 源触发时仍 pending，随后真实取消，并在原60000ms内确认真实终态 COMMIT。它不承诺任意终态锁、崩溃、网络停顿仍能按时完成，不把旧原 hard 实验或强恢复要求签成通过。

## 固定来源与执行

| 项目 | 固定值 |
| --- | --- |
| 被测交付 | `7d53ee1f054961c9c997ff79dcb30e5a7e89ac46` |
| 产品/研发测试源 | `aea111aa5438db1773e2990dc2fd0d26ea52c5b9`；apps/scripts/tests与交付一致 |
| 实际执行QA源 | `4f1af77add3b4ae32161b0581e2a913058c60909` |
| 原始需求SHA256 | `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75` |
| QA依赖锁SHA256 | `7462a4670d1e4036156d1639ebfeaa0cd4276bc918d1b805b3677d862c2cb883` |
| QA树SHA256 | `8180ad4e40ab5264a39a118dc412a7fa42c4e4fa7328b326858dc20a7bb25b84` |
| target / suite SHA256 | `b33a78d766ec8b34b98ba1c0f731c9cd7d8973f1c5ce091cef276f59fd9e0451` / `19e34491f9d77f7384b0294672537cd65672b4638bab2f4137b78c087dda3575` |
| run | `2026-10-01T20-05-52.805Z-2f02f728` |
| 时间UTC | 2026-10-01T20:05:52.858Z 至 2026-10-01T20:07:11.910Z |
| 时间北京时间 | 2026-10-02 04:05:52 至04:07:11（原UTC精度保留于JSON） |
| 环境 | v24.21.0、真实PostgreSQL17、独立Gateway/Agent桩、单worker；无真实provider调用 |

原生执行器用途为 `developer-preflight`，用于QA受控的精确子集复测。原生报告/runner身份保持原样；本补充报告签署有限结果，不生成新版全量业务通过结论。5条用例包含CAP-008的两个明确错误变体，共6个显式场景。所选执行率/通过率均5/5；274条目录及128项追踪条款只是静态资产规模，不能算新版本全量实测覆盖。

**冻结例外如实披露：** 原manifest的 `qaDirtyState` 是唯一自有 `executor-start.json` 未跟踪记录，不能写成clean。该文件在reports中，为取得真实CLI/runner PID而在启动前生成，不进入QA树。独立核对277项Git源码字节与固定4f1一致；另1项既有ignored `developer-smoke` 本地授权元配置未被本轮使用，原hash及927字节原件另行归档。实际本轮授权绑定的是 `qa-first-round-kick-work`，见[配置例外核验](input-provenance-review.json)。没有代码或断言在运行中更改。

## 本次逐项结果

| 用例 | 独立结果 | 原始用时 |
| --- | --- | --- |
| AGENT-017 | PASS | 1.961s |
| AGENT-018 | PASS | 3.008s |
| CAP-008 | PASS | 5.729s |
| CAP-010 | PASS | 4.342s |
| INT-KICK-WORK-001 | PASS | 62.148s |

- AGENT-017：POLICY_DENIED，零kick请求/效果，成员保留。
- AGENT-018：正常成功、精确动作审计、合格执行者、目标移除；独立终账本确认请求/审计/效果各一次。原脚本没有单独断言各次数，复核记录这个区别。
- CAP-008：OWNER_LEFT与NO_PERMISSION两个变体，容量真实拒绝后才放行；各一次请求/审计、零效果，原错误映射和群/账号不变。
- CAP-010：已派发504后真实成员效果和确认成功，容量压力不重置原意图、不重审计、不重复kick；只证明该收敛轨迹。
- INT-KICK-WORK-001：真实活动从零积累，没有注入active_ms；从唯一原POST504到唯一pending确认GET，actual work取消、真实暂停及终态落库、1500ms终态后有限不重放。

原始错误/后台错误/清理错误均为空，全部attempt=0，Playwright retries=0；未进行QA驱动修正后的第二次产品执行。详见[独立复核](run-independent-review.json)、[逐项JSON](results.json)及[JUnit](junit.xml)。

## 六十秒与取消的实际证据

本样本实际PID为54727，绑定原run/step/attempt及真实live start和同一单调时钟。原客户端确认GET `5e8ecdea-de19-4dad-85b7-811215b782f4` 与Gateway账本17通过唯一屏障关联。实际work源listener及同请求source触发时fetchPending=true，随后combined abort、fetch/request settled；work与caller别名同时保留，不声称唯一fetch根因。**原hard listener为0**，没有补造或将work改名。

实际pauseCause为 `kick-work-budget-exhausted`，真实暂停事务 `151ec8ed-5bf0-45d8-ba2f-0ccb5fbbaeb1` / PG133 的COMMIT已返回。终态 `failed/wall_clock` 的真实事务 `696673b6-9ea0-4b8b-8fa6-8e52931279f8` / PG133，有BEGIN、terminal UPDATE和COMMIT返回边界。创建至真实COMMIT的保守区间为 **[58014.728959,58023.478584]ms**，含暂停与落库尾段；实际活动下界最大58002ms。本有限场景满足原60000ms上限，没有加容差或要求最低时长。2000ms只作工程分配，不是物理收尾保证。

原POST/确认GET/审核/成员效果各一次，下一turn未派发。远端已移除不等于应用已确认，公开说明仍诚实保留未知及不重放意图；`failed/wall_clock`不代表远端踢人失败。较晚termination-decision跨GET的父进程映射仍为**BLOCKED diagnostic**，它不是本work listener正证，也不纳入五例BLOCKED计数；缺这条旧诊断不会冒充它通过。

QA-01F-ACTIVITY-001在本**正常work故障轨迹**上的修复复测闭合。01f原[60007,60016]ms FAIL和旧hard用例结果仍完整保留；本新样本不重签旧报告、不声明所有故障窗口都通过。

## 首轮仍需关闭的事项

| 分类 | 既有条目 | 本轮处理 |
| --- | --- | --- |
| 明确时间失败 | 原工具5000ms上限，QA-01F-READ-001及普通发送变体 | 原01f [5005.463667,5005.526083]ms FAIL保留；当前未获修复/复测闭环，不宣称7d53已重现或通过 |
| 持久化前崩溃与强恢复 | kick效果后/重新入群、模型未记录响应中断；BLK-EXT-004/005、REC-007 | 8e实际恢复暂停FAIL未关闭；保守工程方向已决定，原验收保证未变，本例无重启不能代签 |
| 历史未闭合FAIL | INT-MSG-007、BLK-EXT-002、BLK-EXT-003 | 首次确认INSERT前排期、建群丢响应及promote丢响应的2716失败仍需闭环；本轮未重测，不套用旧PASS |
| 既定协议阻塞 | BLK-EXT-001静默未落地分支 | 2716 BLOCKED保持；无响应/无效果的权威负结果不能由有限等待或日志制造，不重复要求D039决策 |
| 真人证据 | MAN-IME-001、MAN-FOCUS-001及MAN-UX-001缺失部分 | 本轮未执行。H18四态有限接受保持关闭，不重新要求其已接受样例 |

这张表是**既有未关闭首轮事项**，不是五例中新发现的产品缺陷；本轮新产品缺陷为0。前轮真正PG读取/回滚/释放链与限定保存故障恢复证据已闭合，不能因为严格5秒FAIL仍在而重新制造“尚未接上PG链”的阻塞。详细来源、分类与版本见[pending-items.json](pending-items.json)和历史报告。

以下仅是**额外未测边界**，不当新增产品缺陷或本五例的新关单条件：预算×已派发×运行中第二实例（原AGENT-003有限PASS不重开）、成功/明确拒绝跨work投影及保存失败/优先级组合、CO01同一真实PG连接wrapper释放后callback复用。研发对这些边界有证据，本QA未逼真触达者仍NOT_RUN。C1/C2和第二轮资产仍只按既有独立边界处理，未在此执行或合入第二轮；上线门禁另算。

## 清理与QA工具限制

五个专属用例环境的原cleanup均无错误。已捕获的实际共享专属PG容器及匿名卷通过owner、真实CID、live Mounts及mount/unmount事件绑定本run；HostPort61887有实际worker连接。post核查容器、卷均不存在，18个实际服务端口无连接/监听，两个controller所有已捕获进程树及自有registry均结束/删除。不会把port1模板占位或共享Docker基础设施当自有服务/泄漏。

**取证局限：** AGENT-017/018的短例在首次during快照前已结束，未独立捕获其实际app/guardian PID/start；CAP-010缺完整实际app的live start链。原cleanup和端口post核查仍在，但不写“每一个历时短进程都逐个独立核验”。详见[资源独立核验](resource-audit/independent-review.json)。

资源采样把重复生命周期/事务事实反复抽取，6份原快照累计2,955,164,619字节；这是QA采样工具膨胀，**不是几十万资源或资源泄漏**。全部原字节独立索引并压缩归档，不删除失败/限制字段。一次只读快照误传run-id，原件runs=0如实保留、不算另一产品执行；后续使用实际run-id核查。两项均是QA工具限制，不改产品结果、不为此重跑产品。

QA离线自测361/361通过，typecheck/catalog/impact/suites最终门禁通过。准备期首次impact检查发生在并行Markdown尚未写完时，原ENOENT失败留档；随后文档与两个门禁通过才冻结产品执行。自检不证明产品或需求全覆盖。

## 原件与版本报告

[产品及QA日志原件归档](original-evidence.tar.gz)：1311份 / 598,357,642原字节，归档13,056,541字节，SHA256 `0ee1251bc86071e0d04a74b88d2f1fe021825322f18a2e5965be569a9f33d656`。[逐文件索引](original-file-index.json)。

[资源快照原件归档](resource-observation-originals.tar.gz)：6份 / 2,955,164,619原字节，归档32,633,529字节，SHA256 `78422929e2f7bfdfa5bb95e6c748c7d52987c022e2da9f569a6215b969793573`。[逐文件索引](resource-observation-file-index.json)。大快照以归档交付，不在Git中放GB级重复JSON；每个member原名、字节数、SHA已重新读取核验。

[原生run清单与结果](raw-run-summary/manifest.json)、[工程intake](engineering-intake-review.json)及[独立QA复核](run-independent-review.json)单列。研发569 PASS/0 FAIL/11 SKIP仅为开发交付证据，11项跳过不算本轮QA通过。

| 历史固定来源 | 独立结果 | 保留方式 |
| --- | --- | --- |
| 2716完整业务 | 254条：240PASS /9FAIL /5BLOCKED | 原已签报告不变 |
| 8e差异修复 | 51条：46PASS /5FAIL /0BLOCKED | 不当新版全量PASS |
| 01f三项补证 | 最新1PASS /2FAIL；首次与修正单次记录均保留 | 原1559份归档不变 |
| 本次7d53有限补测 | 5PASS /0FAIL /0BLOCKED | 新run、新源与新归档，不拼接版本统计 |

[前次正式当前交付报告](../../acceptance/20261002-current-delivery/report.md)、[01f原报告](../20261002-first-round-observation-retest/report.md)、[旧原kick预算报告](../20261002-dispatched-kick-budget/report.md)均保留原SHA。运行结果与最终交付Git字节可用 `python3 execution-support/verify-delivery.py --git-revision HEAD`只读核验，不启动产品。

签发UTC：2026-10-01T20:24:47.979913+00:00。QA建议：本有限work修复复测可接受；**首轮业务不予无条件通过，上线未评估。** 按最新用户要求在本报告收尾后暂停，等待是否继续的决定。
