# 最终组合候选独立 QA 接收与影响评审

2026-10-01。固定比较 `003952188a3413152d73ae77bd1cb77ed7d66d2b → 86ad4e7e63786f652c965308b032b98415bdd7ac`。本次只读候选、公开工程接入文件与不可变 Git 证据，未启动产品、控制器、PostgreSQL 或浏览器。**材料已接收，可冻结新目标并执行；本候选产品验收仍未运行，不继承历史 QA 或研发 PASS。**

## 固定对象与证据

| 对象 | 核验结果 |
|---|---|
| 最终候选 | `86ad4e7e63786f652c965308b032b98415bdd7ac`；接收时 main 精确一致、工作树干净 |
| 最终执行源码 | `8c92b3491ade262b2f81e3257d3809be02223529`；到86ad的18个差异文件全部位于docs，包括交付日志及边界说明 |
| 研发全套回归 | 实际 `64afe925886d994b360d9327b5951e7371bfa4d3`，458/458，失败/取消/跳过均0；含测量流程，不代表严格60秒通过 |
| 后续研发定向回归 | 实际 `e783c6f9ce994216f6a8f1eac765ca75ad2f9829`，56/56，失败/取消/跳过均0；包含控制器顺序、真实强杀及相关观察差异，不与458累加 |
| 最终研发交付检查 | 实际8c92的build、原文校验、`dev:isolated -- --smoke`退出0；并非在86ad重新执行458项 |
| 原始要求 | SHA256 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`，未改变 |
| 未变对象 | 相对003，Web、packages、db迁移、package-lock、tsconfig、普通生产main、QA子树及原文对象精确不变 |
| 证据实物 | 三份研发索引共10份日志的字节数和SHA256全匹配；21份来源材料保存固定Git版本/哈希及本地副本 |

机器记录与逐项日志核验：[review.json](../reports/integration/20261001-remediation-final-intake/review.json)。源码文件列表：[candidate-name-status.txt](../reports/integration/20261001-remediation-final-intake/candidate-name-status.txt)。研发清理记录只作为其执行来源保留，本次未连接或重复清理其资源。

## 需求与接入影响

没有识别新增业务页面、流程、外部协议或放宽验收要求。新增的是既有活动预算/恢复要求的工程观察与安全崩溃窗口、控制器顺序保护及独占交付入口。QA不将内部字段或开发自测结论转换为新业务标准。

| 变化 | 公开交付契约与现有QA一致性 | 必需验证范围 |
|---|---|---|
| activity-witness | `qa-runtime-observation/1`、observe-activity、同group/run/all-run-steps、guardian/PGID身份及实际进程token来源与客户端一致；独立性能时钟区间不等同持久采样 | INT-ACT-001；结合公开run、Agent响应账本和时序证据，不能只信控制器自报 |
| activity-safe-boundary | 合法只读工具结果/history原外层事务提交后、下一轮外部调用前保持，实际stepId、continuationDurable=true、remoteInFlightCount=0；同run observe+safe可并存 | 原17秒后请求屏障、真实held/未过TTL才kill、5秒停机、同库续跑；不扩大成任意在途恢复已经证明 |
| 完整性字段 | 完整新run单epoch可给完整区间；跨强杀或缺边界明确false，只给当前observedEpochActiveMs、persistedActiveMs、incompleteReason；不能还原旧尾段或伪造旧epoch | 缺完整总量/epoch关联仍BLOCKED预算；实际recovery-paused独立FAIL；严格60000不加容差 |
| 控制器生命周期 | GET/advance/DELETE按同租约顺序处理、旧租约不随端口追新实例、独立TTL、历史仅追加；允许精确observe/safe组合 | 原客户端不可重写历史/延寿/复活检查保持；实际绑定、并发与释放仍待本候选联调 |
| 账号与模块 | 原事务局部真实错误、真实后请求锁等待、外层COMMIT确认、下一tick-start前保持及管理员诊断profile保持既有口径 | INT-ACCOUNT-001/002、INT-DIAG-002原用例不变；不能以RELEASE SAVEPOINT、Promise或直接写诊断冒充 |
| README独占入口 | 新`npm run dev:isolated`从根安装后创建自身随机PG/卷/DB/状态路径，真实随机API/WS代理、两角色、manifest所有权与精确清理 | MAN-DELIVERY-001/002重新取证；默认demo依赖这一旧障碍已有新配方，但未独立复现前不能自动PASS |

## 本轮 QA 客户端兼容修正

候选 `docs/qa-activity-witness-20261001.md:38` 保留了旧 QA 校验限制。接收时QA开发树已修正并将随新测试版本冻结；不修改首轮冻结树，也不要求研发伪造字段配合旧校验。

1. `includesUnsavedTail=false` 时允许 `activeElapsedMs` 缺省/null；如果提供非null区间，仍须有效、非负、有序。true必须有有效完整区间。
2. `epochIds` 始终必须是字符串数组；false可以空，真实表示尚未看到时钟所有权段。true必须非空。空列表、局部采样和假定进程在线都不能让预算通过。
3. 全快照先检查明确的恢复暂停；较早unknown/不完整事件不能遮盖后续recovery-paused。合法不完整事件继续有限观察公开身份、终态、发送副作用及恢复状态。无独立违约且仍缺完整证据才BLOCKED预算。
4. 重启最终预算仍要求原epoch与新接管epoch的完整关联，以及不含停机的全run区间。新helper诚实只知新epoch，因此本候选不能仅凭安全续跑自测关闭跨崩溃完整计量缺口。

修正文件为 `harness/runtime-observation.ts`、`tests/system/integration-runtime.spec.ts`、`tests/self/runtime-observation.test.ts` 与对应契约。仅调整合法不完整证据的解析和判定先后，不改case业务预期、时限或产品状态。QA工具验证结果由本次检查单独记录，非产品结论。

## 新目标冻结要求

- SUT完整SHA绑定86ad；采用交付的`node --import tsx scripts/qa-observation-server.ts`，由QA自己的guardian启动，仍以各公开协议/真实owner核对。
- capacity/message/runtime各registry必须是本用户拥有的0700规范短绝对目录、互不别名重合；控制器URL使用本次动态回环端口，诊断profile引用候选公开文档。
- Web源码未变支持复用已核验的DOM定位来源，但需要新的候选绑定及修正版适配器。依据首轮实际取消请求证据，正式业务浏览器改为生产build+preview，记录构建hash；不对重试次数加1。README的dev:isolated仍是独占开发复现入口，不冒充生产网页验收装配。
- 新run独立冻结QA源码、target、业务摘要及授权。旧0af、ffdc、003结果与本候选分开，重测不得覆盖首轮工具错误。Agent schema dialect、UI导航/日期/过期定位、同快照分页前提等QA修正也必须纳入新快照。

## 仍然保留的结论边界

- **严格60秒未闭合。** 研发最新测量记录持久60002ms、控制器区间[60002,60076]，不能以研发测试进程退出0改写成预算PASS；QA仍按原上限独立测量。
- **任意强杀与未知副作用仍有边界。** 完整活动尾段无法重构；未知外部结果可能暂停。已真实观察违反原强恢复要求则FAIL，缺证据则BLOCKED，不通过安全窗口试验泛化全部场景。
- **消息物理接收和全局写入者等既有协议限制不变。** 本批观察入口没有新增网关/Agent幂等或查询能力。
- **隔离配方不是上线结论。** 研发macOS清理/启动样本不能代表Linux、断电或永久数据库挂起。文档明确启动PG query/migrate缺超时取消时SIGINT清理可能等待；本次没有动态复现这一边界。上线门禁另行判断。

`change-reviews.json` 新增独立最终批次登记。状态 `assets-prepared-not-executed` 表示影响评审/客户端准备，既不代表全部接入动态通过，也不把本候选产品条目从NOT_RUN改为PASS。

本次QA工具校验：typecheck通过；runtime selftests **16/16**；影响登记检查通过（6条）；针对86ad的只读reviewTargetChanges已选中最终登记、无未评审变化；限定diff检查通过。详见[qa-checks.json](../reports/integration/20261001-remediation-final-intake/qa-checks.json)。
