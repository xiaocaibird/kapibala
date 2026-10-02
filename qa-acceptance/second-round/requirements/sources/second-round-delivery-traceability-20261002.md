# 第二轮逐条交付追踪（研发交接，待 QA 核对）

2026-10-02。此表补 `SR-BE-DEL-001` 的研发交付缺项，提供逐条需求、实现、固定开发证据、独立 QA 原证据与责任去向。它不是 QA 报告、需求通过率或业务验收签字。只新增本文件，原文、首轮报告及 `qa-acceptance/` 均保持原样。

## 阅读入口与范围

先读固定批次，再查 73 条款表中的实现 I-/开发 D-入口；QA 列直接进入本批 case 原结果。112 case 索引逐项给出原始状态和待办归属，含未覆盖子项的 case 不能由部分 PASS 宣告完成。

范围依据是 [DEL-001 独立要求][DEL-CLAUSE] 与 [QA 条款→用例表][QA-TRACE]：第二轮 overlay 共 **73 条款、112 case**。既有原文 A0–A5/B/S 的逐条实现/开发映射继续使用 [研发原始矩阵](requirements-matrix.md#L71)，其独立 QA 条款→case 使用 [原目录](../qa-acceptance/requirements/traceability.md)，原始结论使用首轮固定报告；此处补第二轮变更与首轮遗留去向，不另造一套原目录或改写其统计。

原始来源 [原文](original-interview-question.md) SHA-256：`c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。[批准增强](product-enhancement-proposal.md)、[D047/D050/D051/D052](decisions.md#L128)、[当前执行分工](second-round-execution-20261002.md)共同限定范围。QA 目录中 SR-AUTH-01 的“仅准备”标题是历史层，当前实际执行由 D052 与本 run 的授权记录覆盖。

## 固定批次和版本，不合并结果

| 对象 | 精确来源与结论 |
|---|---|
| 独立 QA 本批 | `2026-10-01T22-25-01.466Z-7951d02e`；SUT / QA 均 `47423c165f74d8b8908297974f7df71bc53b470d`；2026-10-01T22:25:01.468Z 开始，汇总生成 22:37:49.814Z；自动重试 0。 |
| 本批原结论 | **80 PASS / 4 FAIL / 28 BLOCKED / 0 NOT_RUN，112 case，整体 FAIL**；产品运行类 75P/4F/27B，材料类 5P/0F/1B；productionReadiness=NOT_ASSESSED。各分母不能混算。 |
| 原证据入口 | [report][RUN-REPORT]；[results][RUN-RESULTS]；[manifest][RUN-MANIFEST]；[QA 报告哈希清单][RUN-HASHES]。 |
| 本批已含修复 | UI008 的保存/刷新修复与双模块观察入口已包含；UI008 本批 PASS 只来自它自己的 result，不借开发通过数判定。 |
| 新 main（本表截点） | `5d926c24dc4bd516c468edca808c5278410debef`；产品与 `495374b8ea57d6d7672a4d692890523919ecc3ec` 相同，之后仅补 DB002 材料。包含 cca7 新媒体引用/用量/出口观察；GRD003 候选 `c80ef0c` 经 cherry-pick 为 `bc977f3` 并入 495374b；**尚无该版本新 QA 批次**，474 结果不能继承为新源通过。 |
| 文档工作树 | 基于 `cca7fd2422f58b57b4156b620101929e5eb39a1c`，前一文档提交 `a89f69fc373bbbdf42aa97bd6742c012921194f2`；本文另读新 main 的 GRD003 报告和源码。版本前移由根集成维护，不在本文合 main。 |

QA 原始文件现位于独立 QA 工作树，以下 Q- 链接使用当时实际绝对路径，便于当前审阅；原运行相对路径为 `qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/`，这不表示该目录已经合入 main，也不是最终归档地址；QA 最终会自行映射到 `reports/acceptance/batches` 下的归档，根集成再同步入口。研发未复制、重生成或搬移这些资产；后续 QA 自行归档时保留 run、源提交及字节哈希。读不到本机路径时应向 QA 取同批原文件，不能改用别的 run。

| 固定文件 | SHA-256 |
|---|---|
| `manifest.json` | `fff11b308599389ca089b3430208568644675bc0319d5d4e1bbf4e45762576ba` |
| `results.json` | `b6481561f98c2d429c8a3ee1c531d92a8caca9909c469b48b35a10c5eb220bdc` |
| `report.md` | `0cb97c76dc38f6c82b1bcc8cabf093df7332070ea67b29f9f096ab122c088b25` |
| `report-hashes.json` | `d230935a0ee5716fac3f78901fb57ee01dafdc91916baf17ad599f6a448c58e6` |
| QA `requirements/catalog.json` | `11bffcd7102d60de8e6d7abaea0cacb5970f47709abf317c903bbd3168e2913b` |
| QA `requirements/traceability.md` | `8ad008a35a029f833859fc1af6572f403de25ffdad21f7c33fd34c6ebd655b42` |

## 实现入口 I（以新 main 495374b 只读行号为准）

I- 证明实现位置，不证明测试或业务通过；含新观察接口的文件与 474 不同。历史 QA 必须 checkout 474 重现，不能拿当前源码解释成当时已运行。

| 入口 | 精确职责 |
|---|---|
| [I-MEDIA][I-MEDIA]（48 行） | 配置、trustedMediaUrl、download、publish、cleanupExpired；见 48/71/281/429 行。 |
| [I-REF][I-REF]（111 行） | referenceMedia / withCurrentFiles；实际调用在 automation/agent.ts:286、tool-execution.ts:118，同事务登记。 |
| [I-MIG][I-MIG]（1 行） | 媒体表及旧 running run 保护迁移；旧库夹具来自历史 001–008 原 SQL，不能编辑历史迁移。 |
| [I-GEM][I-GEM]（39 行） | createGeminiAgent、turn/audit、会话继续与已完成响应复用；协议校验在 protocol.ts。 |
| [I-STORE][I-STORE]（33 行） | SessionStore；owner.lock 私有目录独占、pending/complete/failed 持久状态；安全停机不等于硬崩溃自动恢复。 |
| [I-PROVIDER][I-PROVIDER]（33 行） | GeminiProvider；真实输入/输出、取消、固定 Google URL、拒绝 redirect、用量 observation。 |
| [I-MAIN][I-MAIN]（1 行） | 显式独立模型服务入口、环境配置、会话目录；主后端通过 AGENT_URL 选择。 |
| [I-DRAFT][I-DRAFT]（159 行） | 提交身份/草稿修订绑定；ABA 编辑后不清新输入；失败或未知保留。 |
| [I-FORM][I-FORM]（4 行） | 统一表单关闭/丢弃/提交 guard；Sequences.tsx:635 独立模态生命周期，CreateGroup 和 GroupProfile 消费。 |
| [I-PRE][I-PRE]（197 行） | contextRevision、预检快照、晚响应保护、显式目标与初次默认分离；后端 automation/sequences.ts 保留运行规则。 |
| [I-KEY][I-KEY]（243 行） | 审计后首次 send；existing key 返回同消息；495374b 的 296/429 行区分重复状态读取与原 executing 恢复等待。474 此分支仍有已确认缺陷。 |
| [I-CANCEL][I-CANCEL]（30 行） | requestGroupAgentCancellation；gateway/index.ts:222 在群 CAS 的同一事务调用；事件写入仍在原事务。 |
| [I-GATE][I-GATE]（1 行） | 有限字面 SQL 门禁；scripts/verify-automation-guards.ts 固定源码错误副本实验，非任意 SQL 数据流证明。 |
| [I-TIME][I-TIME]（287 行） | 仅续页 jsonb_path_query_array 切片；完整快照、初次读取、游标与顺序语义保留。 |
| [I-NAV][I-NAV]（110 行） | 运行详情来源/权威 groupId；App.tsx、hooks/useRoute.ts 与 state/agentNavigationSession.ts 负责站内返回和登录边界。 |
| [I-ATTN][I-ATTN]（1 行） | 真实页面注意力及浏览器呈现；attention/pageAdapters.ts 绑定实体范围，不能用脚本焦点模拟代替真实跨窗口条件。 |
| [I-DIAG][I-DIAG]（32 行） | 白名单原因、真实 tick 关联、有限历史与 nextStep；app.ts:114 管理员诊断鉴权。 |
| [I-POL][I-POL]（515 行） | kickWithinBudget 派发前重读托管身份；isManagedTarget:894；原平台退群与未知效果处理保留。 |
| [I-LEAVE][I-LEAVE]（83 行） | gateway/jobs.ts 的 leaveAll / advanceLeave:477；gateway/index.ts:246 公开 leave-all 入口，独立群主最后及托管成员清理保留。 |
| [I-USG][I-USG]（99 行） | UsageJournal 有界队列、裁剪、私有文件、失败隔离；provider.ts 生成事实，app.ts 关联 request/attempt，main.ts 默认启用。 |
| [I-DEL][I-DEL]（1 行） | 独立安装、迁移、启动与资源路径；阶段/责任入口为第二轮执行总表，工程文档不能代替 QA 接入与人工核对。 |

## 开发证据 D（保持各自固定源）

每个 D- 链接的报告列出原始日志、命令、源码摘要及清理；它们只覆盖报告明示范围。旧开发报告的“待合 main/未 QA”等语句属于其历史截点，本表当前阶段以上述版本表为准。开发通过数不相加，不从单项开发通过推导当前整组合通过。

| 证据 | 固定来源、范围与限制 |
|---|---|
| [D-C1][D-C1]（38 行） | 主体 `9d0e81e0f86f41986bbd42bb006e751b2fadc8c6` / 释放补充 `5e3b5cecbe11e404c4d88a0189139bfb4ca37b47`；真实文件、PG、HTTP 与 SIGKILL；保留初次失败及后续固定源记录。 |
| [D-C2][D-C2]（76 行） | 实现 `ef167e6527db6e0464f385a0d7d30a6ed24f6850`；离线协议与当时独立真实调用分开，旧真实调用不是本轮授权或新 main 结果。 |
| [D-COMB][D-COMB]（3 行） | 固定源 `210df671942908fc1682cef6e29b7ba9563a2a31`：503 PASS / 0 FAIL / 9 SKIP；C1/C2 开发组合，非 QA。 |
| [D-UI][D-UI]（33 行） | 源 `7c3e22ff11e29d286ebd0311d818b5ae0e6ad7ed`；25 条浏览器开发场景与前端单测。导航会话补充 `f83b5d8c7ff4d875e76a011798ab1dd70e5bbf69` 单独记于同文，不合并计数。 |
| [D-BE][D-BE]（74 行） | 固定源 `d832573e7302b00e655da17f8dcce2acac96b4b8`：定向 37 PASS；关联 69 PASS / 3 SKIP；两个变异实验各检出一个指定业务断言失败。 |
| [D-MEAS][D-MEAS]（3 行） | 固定源 `544c4f9ce71b5dd893be286853a35df340072a7d`，旧基线 `ac5e8e639237070fb5c48751ce04a7645b4a19ab`；32 PASS，真实 1,000/10,000 数据与用量；旧新样本、SQL 比较和应用回滚证据不得互换。 |
| [D-SAVE][D-SAVE]（3 行） | 候选 `a99a6a80ffa5b887a74e0ef9414e85b9068db9eb`；真实 POST→PG→WS→GET、持有响应与 Escape 分开，修后 4/4；修前/修后脚本仅格式化但哈希不同，原证据已分开记录。 |
| [D-MM][D-MM]（59 行） | 候选 `4d308641703521c4c266f538cb7c894474710ed8`；双模块 2 PASS、相关 22 PASS。观察入口，不扩大诊断业务保证；474 已包含。 |
| [D-MR][D-MR]（65 行） | 候选 `f90d39240c784064cbe412adcca903f97a2e1d8c`：MR01–03 3 PASS；关联 31 PASS 的固定源另记。实际引用与清理事务/文件/未知结果重启；经 cca7 合入，474 未含。 |
| [D-USG][D-USG]（89 行） | 集成提交 `1e1ce57bf602da134455fe99ba7bff0885822e2d`；原验证以 verification.json 的逐文件 SHA-256 固定源码，非声称提交后重跑。141 次真实本机调用形成 activeBatch=1、queued=64、dropped=76，释放后 65 条落盘；474 未含。 |
| [D-EGR][D-EGR]（83 行） | 固定候选 `ea79f370f4ff6412688a24e31d0426f757887a02`：12 组，Node 24.21.0 / 内置 undici 7.29.1；HTTP 请求与物理 socket 分账，非任意 native 出口保证。tsx 有 3 次拒绝，退出有 active，SIGKILL 缺尾；474 未含。 |
| [D-KEY][D-KEY]（3 行） | 候选 `c80ef0c998b4c6ec8f0f5b2e15d2e9f4100098aa` 经 cherry-pick 为 `bc977f3` 并入 `495374b`；开发 before/after/回归由各 manifest 的源码摘要固定：新 7 PASS、相关 79 PASS / 3 SKIP。原 474 queued 失败保留，尚无本修复的新 QA。 |
| [D-INT][D-INT]（7 行） | 完整开发组合 `f639ee75c5559f3ee8923af5dcbb53e9b41b168c` 为 595 PASS / 14 SKIP；后续定向组合分开记录；不是 495374b 的新全套自测。 |
| [D-FIRST][D-FIRST]（32 行） | 历史开发源 `8e047aea842bfcec64802e4918b52b460b93c48b` 为 538 PASS / 9 SKIP；首轮 QA 版本及未闭环项见后文，不能据开发日志改 QA 状态。 |
| [D-DBREPLAY][D-DBREPLAY]（3 行） | 文档源 `f2ab722b603e3230c229ece7c07dfaa763db104b`，经根集成进入 `5d926c2`；固定 `cca7fd2` 的单 SELECT 正反补丁，核对旧 `ac5e8e6` 与优化 `544c4f9`。仅源码/补丁/语法检查，无新数据库、HTTP、benchmark 或 QA 执行。 |
| [D-AUTH][D-AUTH]（190 行） | D052 当前执行授权；D050/D051 是前序阶段。授权本身无运行 PASS。 |

## 73 条款逐条关联

“原依据”链接到 QA 冻结来源的实际行；完整多来源及优先级在 [catalog][QA-CATALOG]。每行保留 QA 原期望，I-/D- 可跨行复用；Q- 的 P/F/B 分别只表示该 case 在固定 474 批的 PASS/FAIL/BLOCKED。条款未另判状态；含 B/F 的原因与责任必须继续读下方 case 索引。

| 条款 / 期望 | 原依据 | 实现 | 开发自测 | 本批独立 QA | 责任去向 |
|---|---|---|---|---|---|
| `SR-C1-01` 媒体真实下载与路径<br>真实 message.mediaUrl 对应字节下载至本地，消息 localFilePath 指向该真实文件；状态字符串不替代字节证据。 | [冻结来源 L315][S-SR-C1-01] | [I-MEDIA][I-MEDIA] | [D-C1][D-C1]、[D-COMB][D-COMB]、[D-EGR][D-EGR] | [SR-C1-001 P][Q-SR-C1-001]、[SR-C1-002 P][Q-SR-C1-002]、[SR-C1-003 B][Q-SR-C1-003]、[SR-C1-007 P][Q-SR-C1-007]、[SR-C1-013 B][Q-SR-C1-013] | 研发交入口；QA接线复测；研发供窗口；QA接线 |
| `SR-C1-02` 可配保留期<br>保留天数可配置且默认30天；计时起点按冻结公开接入说明，不自行发明参数边界或调度SLA。 | [冻结来源 L315][S-SR-C1-02] | [I-MEDIA][I-MEDIA] | [D-C1][D-C1]、[D-COMB][D-COMB] | [SR-C1-005 P][Q-SR-C1-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-C1-03` 删除与记录一致<br>删除文件后不能留下指向已删文件的消息路径；并发读取/删除采用可观察一致性断言，不自造数据库字段。 | [冻结来源 L315][S-SR-C1-03] | [I-MEDIA][I-MEDIA] | [D-C1][D-C1]、[D-COMB][D-COMB] | [SR-C1-005 P][Q-SR-C1-005]、[SR-C1-006 P][Q-SR-C1-006]、[SR-C1-009 F][Q-SR-C1-009]、[SR-C1-010 P][Q-SR-C1-010]、[SR-C1-013 B][Q-SR-C1-013] | QA修正夹具后独立复测；研发供窗口；QA接线 |
| `SR-C1-04` 运行中引用保护<br>仍被运行中的 Agent run 使用的文件不删；保护成立和解除须有真实引用/运行状态证据。 | [冻结来源 L315][S-SR-C1-04] | [I-REF][I-REF]、[I-MIG][I-MIG] | [D-C1][D-C1]、[D-COMB][D-COMB]、[D-MR][D-MR] | [SR-C1-007 P][Q-SR-C1-007]、[SR-C1-008 B][Q-SR-C1-008]、[SR-C1-012 B][Q-SR-C1-012]、[SR-C1-014 B][Q-SR-C1-014]、[SR-C1-015 B][Q-SR-C1-015] | 研发已补；QA接线复测；研发供历史基线；QA复核迁移；研发已补；QA接线 |
| `SR-C1-05` 失败与恢复<br>缺源/过期/传输失败及重启下按原下载与恢复义务检查实际字节和记录，不把永久失败或未知伪造成功。 | [冻结来源 L315][S-SR-C1-05] | [I-MEDIA][I-MEDIA]、[I-REF][I-REF]、[I-MIG][I-MIG] | [D-C1][D-C1]、[D-COMB][D-COMB]、[D-MR][D-MR]、[D-EGR][D-EGR] | [SR-C1-003 B][Q-SR-C1-003]、[SR-C1-004 P][Q-SR-C1-004]、[SR-C1-009 F][Q-SR-C1-009]、[SR-C1-010 P][Q-SR-C1-010]、[SR-C1-012 B][Q-SR-C1-012]、[SR-C1-014 B][Q-SR-C1-014]、[SR-C1-015 B][Q-SR-C1-015] | 研发交入口；QA接线复测；QA修正夹具后独立复测；研发供历史基线；QA复核迁移；研发已补；QA接线 |
| `SR-C1-06` 重复并发一致性<br>重复媒体事件及并发处理不导致错误消息身份、错误字节或悬空路径；不额外要求下载网络请求恰好一次。 | [冻结来源 L315][S-SR-C1-06] | [I-MEDIA][I-MEDIA]、[I-REF][I-REF] | [D-C1][D-C1]、[D-COMB][D-COMB]、[D-MR][D-MR] | [SR-C1-002 P][Q-SR-C1-002]、[SR-C1-006 P][Q-SR-C1-006]、[SR-C1-008 B][Q-SR-C1-008] | 研发已补；QA接线复测 |
| `SR-C1-07` 媒体目录接入<br>显式私有持久绝对 MEDIA_DIR；同DB重启保留目录，同DB多实例必须共享同一物理目录。 | [冻结来源 L315][S-SR-C1-07] | [I-MEDIA][I-MEDIA]、[I-DEL][I-DEL] | [D-C1][D-C1]、[D-COMB][D-COMB]、[D-EGR][D-EGR] | [SR-C1-001 P][Q-SR-C1-001]、[SR-C1-002 P][Q-SR-C1-002]、[SR-C1-003 B][Q-SR-C1-003]、[SR-C1-011 P][Q-SR-C1-011]、[SR-BE-DEL-004 B][Q-SR-BE-DEL-004]、[SR-BE-DEL-005 B][Q-SR-BE-DEL-005] | 研发交入口；QA接线复测；研发/QA隔离入口复现归因；研发供机制；QA实际触发 |
| `SR-C1-08` 媒体迁移兼容<br>最终候选迁移、schema与历史消息兼容；历史009/schema9只是待核对接入基线，不固定未来最大schema。 | [冻结来源 L315][S-SR-C1-08] | [I-MIG][I-MIG] | [D-C1][D-C1]、[D-COMB][D-COMB] | [SR-C1-012 B][Q-SR-C1-012]、[SR-BE-DEL-004 B][Q-SR-BE-DEL-004]、[SR-BE-DEL-005 B][Q-SR-BE-DEL-005] | 研发供历史基线；QA复核迁移；研发/QA隔离入口复现归因；研发供机制；QA实际触发 |
| `SR-C2-01` 独立模型协议<br>独立服务保持原2.2 turn/audit协议，合法/非法输入输出按公开协议处理；独立替身不可偷偷增强协议保证。 | [冻结来源 L315][S-SR-C2-01] | [I-GEM][I-GEM]、[I-PROVIDER][I-PROVIDER] | [D-C2][D-C2]、[D-COMB][D-COMB] | [SR-C2-001 P][Q-SR-C2-001]、[SR-C2-006 P][Q-SR-C2-006] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-C2-02` 显式切换和默认隔离<br>后端仅显式AGENT_URL切换；默认隔离流程保持模拟服务，不因本机key存在自动读取或调用。 | [冻结来源 L315][S-SR-C2-02] | [I-MAIN][I-MAIN]、[I-DEL][I-DEL] | [D-C2][D-C2]、[D-COMB][D-COMB]、[D-USG][D-USG] | [SR-C2-002 P][Q-SR-C2-002]、[SR-BE-DEL-004 B][Q-SR-BE-DEL-004]、[SR-BE-USG-010 B][Q-SR-BE-USG-010] | 研发/QA隔离入口复现归因；研发已补；QA补完整子项 |
| `SR-C2-03` 会话历史与工具续接<br>同runId会话延续，真实tool_result续接和触发历史不丢失/错配；工具语义来自原2.2/A5。 | [冻结来源 L315][S-SR-C2-03] | [I-GEM][I-GEM]、[I-STORE][I-STORE] | [D-C2][D-C2]、[D-COMB][D-COMB] | [SR-C2-003 P][Q-SR-C2-003]、[SR-C2-005 P][Q-SR-C2-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-C2-04` 完成响应复用<br>重放已完成响应不能多推进一轮或产生新的模型推理；按可靠请求身份验证，不假设未公开的重放键。 | [冻结来源 L315][S-SR-C2-04] | [I-GEM][I-GEM]、[I-STORE][I-STORE] | [D-C2][D-C2]、[D-MEAS][D-MEAS] | [SR-C2-004 P][Q-SR-C2-004]、[SR-BE-USG-003 P][Q-SR-BE-USG-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-C2-05` 错误与未决恢复<br>模型错误、未决轮、重启/硬崩溃维持原恢复判据；死owner.lock需核验原进程及目录归属，不盲重发不确定远端请求，也不把暂停当全面恢复PASS。 | [冻结来源 L315][S-SR-C2-05] | [I-GEM][I-GEM]、[I-STORE][I-STORE]、[I-PROVIDER][I-PROVIDER] | [D-C2][D-C2]、[D-COMB][D-COMB]、[D-USG][D-USG] | [SR-C2-004 P][Q-SR-C2-004]、[SR-C2-005 P][Q-SR-C2-005]、[SR-C2-006 P][Q-SR-C2-006]、[SR-C2-007 P][Q-SR-C2-007]、[SR-C2-012 F][Q-SR-C2-012]、[SR-C2-019 B][Q-SR-C2-019]、[SR-BE-USG-008 B][Q-SR-BE-USG-008] | 研发说明边界；负责人最终判断；QA复测；研发/QA故障接线；研发已补；QA复测 |
| `SR-C2-06` 后端安全边界<br>实际工具、审计、权限、幂等、12步及真实活动预算仍由后端保证；适配器不得绕过，P1-04新保护同样适用。 | [冻结来源 L315][S-SR-C2-06] | [I-KEY][I-KEY]、[I-POL][I-POL] | [D-C2][D-C2]、[D-BE][D-BE]、[D-KEY][D-KEY] | [SR-C2-009 P][Q-SR-C2-009]、[SR-C2-010 B][Q-SR-C2-010]、[SR-C2-011 P][Q-SR-C2-011]、[SR-C2-012 F][Q-SR-C2-012]、[SR-C2-019 B][Q-SR-C2-019]、[SR-BE-GRD-001 P][Q-SR-BE-GRD-001]、[SR-BE-GRD-002 P][Q-SR-BE-GRD-002]、[SR-BE-GRD-003 F][Q-SR-BE-GRD-003]、[SR-BE-GRD-005 B][Q-SR-BE-GRD-005]、[SR-BE-POL-001 P][Q-SR-BE-POL-001]、[SR-BE-POL-005 B][Q-SR-BE-POL-005] | 研发/QA预算入口接线；研发说明边界；负责人最终判断；QA复测；研发/QA故障接线；研发已修入495374b；QA新源复测；研发/QA控制契约接线；研发/QA真实竞争观察 |
| `SR-C2-07` 会话目录与秘密<br>独占私有GEMINI_SESSION_DIR，凭据不进入源码/证据/公开响应；不读取用户密钥配置。 | [冻结来源 L315][S-SR-C2-07] | [I-STORE][I-STORE]、[I-MAIN][I-MAIN]、[I-USG][I-USG] | [D-C2][D-C2]、[D-MEAS][D-MEAS]、[D-USG][D-USG]、[D-EGR][D-EGR] | [SR-C2-007 P][Q-SR-C2-007]、[SR-C2-008 B][Q-SR-C2-008]、[SR-C2-015 B][Q-SR-C2-015]、[SR-C2-020 B][Q-SR-C2-020]、[SR-BE-DEL-004 B][Q-SR-BE-DEL-004]、[SR-BE-DEL-005 B][Q-SR-BE-DEL-005]、[SR-BE-USG-006 B][Q-SR-BE-USG-006]、[SR-BE-USG-010 B][Q-SR-BE-USG-010] | QA环境夹具；研发协助契约；研发已补；QA复测；研发已补；QA接线；研发/QA隔离入口复现归因；研发供机制；QA实际触发；QA隔离环境；研发说明安全条件；研发已补；QA补完整子项 |
| `SR-C2-08` 真实提供方证据分层<br>历史provider证据、当前离线协议结果、当前候选真实调用分列；替身通过不等于真实模型接入通过，新付费调用另需授权。 | [冻结来源 L315][S-SR-C2-08] | [I-PROVIDER][I-PROVIDER]、[I-MAIN][I-MAIN] | [D-C2][D-C2]、[D-USG][D-USG]、[D-EGR][D-EGR] | [SR-C2-002 P][Q-SR-C2-002]、[SR-C2-013 P][Q-SR-C2-013]、[SR-C2-017 B][Q-SR-C2-017]、[SR-C2-020 B][Q-SR-C2-020]、[SR-BE-DEL-003 P][Q-SR-BE-DEL-003] | 负责人有限授权；QA持条件执行；研发已补；QA接线 |
| `SR-P0-01-01` 首轮事实链<br>原要求及批准修改各有版本、开发自测、QA原始结果、残余、责任与去向；不把开发通过替换QA。 | [冻结来源 L48][S-SR-P0-01-01] | [I-DEL][I-DEL] | [D-FIRST][D-FIRST]、[D-INT][D-INT] | [SR-BE-DEL-001 B][Q-SR-BE-DEL-001] | 研发本表交付；QA人工逐条复核 |
| `SR-P0-01-02` 原结果和已决定限制<br>保留原时限/故障证据、FAIL/BLOCKED/未执行和已决定限制，第二轮启动不自动关闭第一轮缺陷或改统计。 | [冻结来源 L48][S-SR-P0-01-02] | [I-DEL][I-DEL] | [D-FIRST][D-FIRST]、[D-AUTH][D-AUTH] | [SR-BE-DEL-001 B][Q-SR-BE-DEL-001]、[SR-BE-DEL-002 P][Q-SR-BE-DEL-002] | 研发本表交付；QA人工逐条复核 |
| `SR-P0-01-03` 回归与真人边界<br>首轮结果作第二轮变更影响输入；明确待真人体验和上线评估，不重复算新增功能、不代签真人。 | [冻结来源 L48][S-SR-P0-01-03] | [I-DEL][I-DEL]、[I-ATTN][I-ATTN] | [D-FIRST][D-FIRST]、[D-AUTH][D-AUTH] | [SR-BE-DEL-002 P][Q-SR-BE-DEL-002] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-02-01` C1C2固定源独立验收<br>C1/C2各有最终组合源、独立用例、实际结果及限制；503项历史开发结果不替代当前执行。 | [冻结来源 L60][S-SR-P0-02-01] | [I-DEL][I-DEL]、[I-MEDIA][I-MEDIA]、[I-GEM][I-GEM] | [D-COMB][D-COMB]、[D-INT][D-INT] | [SR-BE-DEL-003 P][Q-SR-BE-DEL-003]、[SR-BE-DEL-006 P][Q-SR-BE-DEL-006] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-02-02` C3复用完整流程<br>复用既有QA登录→打开群→查看run步骤资产，验证固定候选真实呈现，不另造同名框架或借框架存在判PASS。 | [冻结来源 L60][S-SR-P0-02-02] | [I-DEL][I-DEL] | [D-FIRST][D-FIRST]、[D-COMB][D-COMB]、[D-INT][D-INT] | [SR-BE-DEL-006 P][Q-SR-BE-DEL-006] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-02-03` 隔离交付可复现<br>独立干净副本安装/配置/迁移/启动/health/核心入口及精确资源清理可复现；包含媒体/session目录、schema与显式Agent地址。 | [冻结来源 L60][S-SR-P0-02-03] | [I-DEL][I-DEL]、[I-MAIN][I-MAIN]、[I-MIG][I-MIG] | [D-COMB][D-COMB]、[D-INT][D-INT] | [SR-BE-DEL-004 B][Q-SR-BE-DEL-004]、[SR-BE-DEL-005 B][Q-SR-BE-DEL-005] | 研发/QA隔离入口复现归因；研发供机制；QA实际触发 |
| `SR-P0-02-04` 凭据与评估分层<br>默认无真实付费调用，凭据不进报告；演示升级、业务验收和上线评估分别记录。 | [冻结来源 L60][S-SR-P0-02-04] | [I-MAIN][I-MAIN]、[I-PROVIDER][I-PROVIDER] | [D-C2][D-C2]、[D-AUTH][D-AUTH] | [SR-BE-DEL-003 P][Q-SR-BE-DEL-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-01` 提交身份绑定<br>提交快照绑定群、账号/会话、文本和草稿修订，旧成功仅清理仍对应本次提交的草稿。 | [冻结来源 L72][S-SR-P0-03-01] | [I-DRAFT][I-DRAFT] | [D-UI][D-UI] | [SR-UI-001 P][Q-SR-UI-001]、[SR-UI-002 P][Q-SR-UI-002]、[SR-UI-003 P][Q-SR-UI-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-02` 编辑ABA保护<br>A等待成功时新B保留；A→B→A仍是新修订，不能只按字符串相等清空。 | [冻结来源 L72][S-SR-P0-03-02] | [I-DRAFT][I-DRAFT] | [D-UI][D-UI] | [SR-UI-002 P][Q-SR-UI-002]、[SR-UI-003 P][Q-SR-UI-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-03` 失败未知保留<br>失败保留可编辑输入；受理未知不能假作成功或新增自动重发保证。 | [冻结来源 L72][S-SR-P0-03-03] | [I-DRAFT][I-DRAFT] | [D-UI][D-UI] | [SR-UI-006 P][Q-SR-UI-006]、[SR-UI-007 P][Q-SR-UI-007] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-04` 跨群跨身份隔离<br>切群或身份变化后，旧请求回执不清新上下文草稿。 | [冻结来源 L72][S-SR-P0-03-04] | [I-DRAFT][I-DRAFT]、[I-FORM][I-FORM] | [D-UI][D-UI] | [SR-UI-004 P][Q-SR-UI-004]、[SR-UI-005 P][Q-SR-UI-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-05` 实际关闭入口一致<br>新建序列的×/Escape/取消/实际支持遮罩使用统一未保存保护；不要求原本不存在的关闭入口。 | [冻结来源 L72][S-SR-P0-03-05] | [I-FORM][I-FORM] | [D-UI][D-UI]、[D-SAVE][D-SAVE] | [SR-UI-008 P][Q-SR-UI-008] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-06` 保存快照保护<br>保存中关闭和编辑保护不令内容与已提交快照分叉。 | [冻结来源 L72][S-SR-P0-03-06] | [I-FORM][I-FORM] | [D-UI][D-UI]、[D-SAVE][D-SAVE] | [SR-UI-008 P][Q-SR-UI-008]、[SR-UI-009 P][Q-SR-UI-009] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-03-07` 已有表单回归<br>已有建群/编辑群未保存与保存中保护保持。 | [冻结来源 L72][S-SR-P0-03-07] | [I-FORM][I-FORM] | [D-UI][D-UI]、[D-SAVE][D-SAVE] | [SR-UI-010 P][Q-SR-UI-010] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-04-01` 预检修订失效<br>群/模板/变量等相关修改使旧预检失效，含A→B→A。 | [冻结来源 L83][S-SR-P0-04-01] | [I-PRE][I-PRE] | [D-UI][D-UI] | [SR-UI-011 P][Q-SR-UI-011]、[SR-UI-012 P][Q-SR-UI-012]、[SR-UI-013 P][Q-SR-UI-013]、[SR-UI-014 P][Q-SR-UI-014] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-04-02` 晚预检不能确认<br>旧请求晚返回不得恢复可确认状态或覆盖当前修订结果。 | [冻结来源 L83][S-SR-P0-04-02] | [I-PRE][I-PRE] | [D-UI][D-UI] | [SR-UI-011 P][Q-SR-UI-011]、[SR-UI-012 P][Q-SR-UI-012]、[SR-UI-013 P][Q-SR-UI-013]、[SR-UI-014 P][Q-SR-UI-014] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-04-03` 冻结目标摘要<br>确认页展示冻结群名和稳定ID、模板、最终文本、账号角色与相对等待规则，对应实际冻结载荷。 | [冻结来源 L83][S-SR-P0-04-03] | [I-PRE][I-PRE] | [D-UI][D-UI] | [SR-UI-015 P][Q-SR-UI-015] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-04-04` 显式目标失效<br>已有选择/URL指定群失效时要求重新选择，不静默落到首群。 | [冻结来源 L83][S-SR-P0-04-04] | [I-PRE][I-PRE] | [D-UI][D-UI] | [SR-UI-016 P][Q-SR-UI-016] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-04-05` 初次默认独立<br>首次默认选择与显式选择失效是不同情形；默认便利不覆盖失效保护。 | [冻结来源 L83][S-SR-P0-04-05] | [I-PRE][I-PRE] | [D-UI][D-UI] | [SR-UI-017 P][Q-SR-UI-017] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-04-06` 运行时原规则<br>服务端全量预检、冻结提交、角色缺失skipped、限流顺延、排期及运行时校验不变，预览不保证未来账号可用。 | [冻结来源 L83][S-SR-P0-04-06] | [I-PRE][I-PRE] | [D-UI][D-UI]、[D-INT][D-INT] | [SR-UI-018 B][Q-SR-UI-018] | QA适配与归因；研发按证据协助 |
| `SR-P0-05-01` 审计守卫回归<br>仅合法JSON且verdict恰为pass可产生send/kick副作用；fail/无明确结论沿用A5，审计重试不是新step。 | [冻结来源 L92][S-SR-P0-05-01] | [I-KEY][I-KEY]、[I-GATE][I-GATE] | [D-BE][D-BE] | [SR-BE-GRD-001 P][Q-SR-BE-GRD-001]、[SR-BE-GRD-002 P][Q-SR-BE-GRD-002]、[SR-BE-MUT-001 P][Q-SR-BE-MUT-001] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-05-02` 同key幂等回归<br>同run相同send key返回原消息当前状态，后续不再审计/发送；被AUDIT_REJECTED/POLICY_DENIED拒绝不占key。 | [冻结来源 L92][S-SR-P0-05-02] | [I-KEY][I-KEY]、[I-GATE][I-GATE] | [D-BE][D-BE]、[D-KEY][D-KEY] | [SR-BE-GRD-003 F][Q-SR-BE-GRD-003]、[SR-BE-GRD-004 P][Q-SR-BE-GRD-004]、[SR-BE-GRD-005 B][Q-SR-BE-GRD-005]、[SR-BE-MUT-002 P][Q-SR-BE-MUT-002] | 研发已修入495374b；QA新源复测；研发/QA控制契约接线 |
| `SR-P0-05-03` 两个有效检错实验<br>原实现业务断言PASS，两个指定错误副本各于对应真实业务断言FAIL；编译/DB/夹具/挂死不算检出，保留补丁源命令原件清理。 | [冻结来源 L92][S-SR-P0-05-03] | [I-GATE][I-GATE] | [D-BE][D-BE] | [SR-BE-MUT-001 P][Q-SR-BE-MUT-001]、[SR-BE-MUT-002 P][Q-SR-BE-MUT-002] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-05-04` 取消协作单入口<br>复用既有事务协作入口，保持调用方事务、CAS成功后取消、锁及事件顺序；不改成提交后异步。 | [冻结来源 L92][S-SR-P0-05-04] | [I-CANCEL][I-CANCEL]、[I-GATE][I-GATE] | [D-BE][D-BE] | [SR-BE-GRD-006 P][Q-SR-BE-GRD-006]、[SR-BE-GRD-007 P][Q-SR-BE-GRD-007]、[SR-BE-GRD-008 P][Q-SR-BE-GRD-008]、[SR-BE-MUT-003 P][Q-SR-BE-MUT-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-05-05` 取消原子性与当前步<br>关闭Agent的群变更与取消后果同事务回滚；当前step结束后取消，守卫/旧执行者竞态不放宽。 | [冻结来源 L92][S-SR-P0-05-05] | [I-CANCEL][I-CANCEL] | [D-BE][D-BE] | [SR-BE-GRD-006 P][Q-SR-BE-GRD-006]、[SR-BE-GRD-007 P][Q-SR-BE-GRD-007]、[SR-BE-GRD-008 P][Q-SR-BE-GRD-008] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P0-05-06` 有限静态门禁<br>列出涉及表/规则归属和跨模块写入，区分允许事务协作与重复直接写；受控违规会失败，纳入开发验证，声明非完整SQL所有权证明。 | [冻结来源 L92][S-SR-P0-05-06] | [I-GATE][I-GATE] | [D-BE][D-BE] | [SR-BE-MUT-003 P][Q-SR-BE-MUT-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-01-01` 真实两档数据<br>独立PG以1000/10000条代表消息测量并记录同毫秒/迟到分布、版本、索引及统计；规模是输入不是容量承诺。 | [冻结来源 L103][S-SR-P1-01-01] | [I-TIME][I-TIME] | [D-MEAS][D-MEAS] | [SR-BE-DB-001 P][Q-SR-BE-DB-001] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-01-02` 计划与API实测<br>真实SQL EXPLAIN ANALYZE BUFFERS/扫描返回行/buffers/DB耗时及实际首屏续页API响应量和时延；可得时记录进程内存，不伪称p95或页面速度。 | [冻结来源 L103][S-SR-P1-01-02] | [I-TIME][I-TIME] | [D-MEAS][D-MEAS] | [SR-BE-DB-001 P][Q-SR-BE-DB-001] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-01-03` 证据驱动局部优化<br>只有真实瓶颈证据支持才尝试一个可回滚索引/局部查询；保留不优化有效结论，不扩快照重写/大回填。 | [冻结来源 L103][S-SR-P1-01-03] | [I-TIME][I-TIME] | [D-MEAS][D-MEAS]、[D-DBREPLAY][D-DBREPLAY] | [SR-BE-DB-002 B][Q-SR-BE-DB-002]、[SR-BE-DB-005 P][Q-SR-BE-DB-005] | 研发已交回滚材料；QA独立复跑 |
| `SR-P1-01-04` 时间线语义保留<br>局部改变仍保留既有游标、首次固定集合/快照、同毫秒排序、迟到消息、出站确认改时间、去重不漏和实时合并。 | [冻结来源 L103][S-SR-P1-01-04] | [I-TIME][I-TIME] | [D-MEAS][D-MEAS] | [SR-BE-DB-003 P][Q-SR-BE-DB-003]、[SR-BE-DB-004 P][Q-SR-BE-DB-004]、[SR-BE-DB-005 P][Q-SR-BE-DB-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-02-01` 群来源返回<br>从群详情进入run详情可返回原群。 | [冻结来源 L112][S-SR-P1-02-01] | [I-NAV][I-NAV] | [D-UI][D-UI] | [SR-UI-019 P][Q-SR-UI-019] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-02-02` 列表来源返回<br>从run列表进入详情返回原列表并保留所选群。 | [冻结来源 L112][S-SR-P1-02-02] | [I-NAV][I-NAV] | [D-UI][D-UI] | [SR-UI-020 P][Q-SR-UI-020] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-02-03` 所属群与上下文<br>查看所属群是独立明确链接，标题及导航高亮表达同一来源上下文。 | [冻结来源 L112][S-SR-P1-02-03] | [I-NAV][I-NAV] | [D-UI][D-UI] | [SR-UI-021 F][Q-SR-UI-021] | QA独立归因；研发按证据处理 |
| `SR-P1-02-04` 站内兜底和历史<br>刷新/直达/无效来源使用站内兜底，前进后退符合两入口链路。 | [冻结来源 L112][S-SR-P1-02-04] | [I-NAV][I-NAV] | [D-UI][D-UI] | [SR-UI-022 P][Q-SR-UI-022]、[SR-UI-023 P][Q-SR-UI-023]、[SR-UI-026 P][Q-SR-UI-026]、[SR-UI-029 P][Q-SR-UI-029] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-02-05` 失败与身份变化<br>加载/失败页面可离开，身份变化和篡改来源安全；不机械history.back跳站外。 | [冻结来源 L112][S-SR-P1-02-05] | [I-NAV][I-NAV] | [D-UI][D-UI] | [SR-UI-022 P][Q-SR-UI-022]、[SR-UI-024 P][Q-SR-UI-024]、[SR-UI-026 P][Q-SR-UI-026]、[SR-UI-027 P][Q-SR-UI-027]、[SR-UI-028 P][Q-SR-UI-028]、[SR-UI-029 P][Q-SR-UI-029] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-02-06` 提醒实体范围<br>来源变化和返回不能错误清除另一个群/run提醒，清除按实际实体范围。 | [冻结来源 L112][S-SR-P1-02-06] | [I-ATTN][I-ATTN]、[I-NAV][I-NAV] | [D-UI][D-UI] | [SR-UI-025 B][Q-SR-UI-025] | QA真实浏览器条件；必要时真人 |
| `SR-P1-03-01` 稳定原因与下一步<br>现有管理员background诊断API说明最后真实后台失败的稳定原因类别、发生时间和安全下一步。 | [冻结来源 L119][S-SR-P1-03-01] | [I-DIAG][I-DIAG] | [D-BE][D-BE]、[D-MM][D-MM] | [SR-BE-DIA-001 P][Q-SR-BE-DIA-001]、[SR-BE-DIA-002 P][Q-SR-BE-DIA-002]、[SR-BE-DIA-005 P][Q-SR-BE-DIA-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-03-02` 真实关联<br>仅使用已有可靠实体关联；无可靠实体时说明模块，不编造群/消息归因。 | [冻结来源 L119][S-SR-P1-03-02] | [I-DIAG][I-DIAG] | [D-BE][D-BE]、[D-MM][D-MM] | [SR-BE-DIA-001 P][Q-SR-BE-DIA-001]、[SR-BE-DIA-004 B][Q-SR-BE-DIA-004] | QA技术复核；研发保留未知边界 |
| `SR-P1-03-03` 恢复和有限历史<br>真实恢复后更新当前状态，保留如实有限历史；不是新增任务中心。 | [冻结来源 L119][S-SR-P1-03-03] | [I-DIAG][I-DIAG] | [D-BE][D-BE]、[D-MM][D-MM] | [SR-BE-DIA-002 P][Q-SR-BE-DIA-002]、[SR-BE-DIA-005 P][Q-SR-BE-DIA-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-03-04` 权限与脱敏<br>admin可读、viewer不得获敏感信息；原始异常/连接串/凭据/消息正文不直接公开。 | [冻结来源 L119][S-SR-P1-03-04] | [I-DIAG][I-DIAG] | [D-BE][D-BE]、[D-MM][D-MM] | [SR-BE-DIA-003 P][Q-SR-BE-DIA-003]、[SR-BE-DIA-005 P][Q-SR-BE-DIA-005] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-03-05` 未知效果安全<br>未知远端效果仅建议核对已有事实，不建议未经证明的盲重发或虚构恢复成功。 | [冻结来源 L119][S-SR-P1-03-05] | [I-DIAG][I-DIAG] | [D-BE][D-BE] | [SR-BE-DIA-004 B][Q-SR-BE-DIA-004] | QA技术复核；研发保留未知边界 |
| `SR-P1-04-01` 保护当前托管目标<br>派发前当前群已确认平台托管目标不得被自动kick，即使开关/审计pass/执行者权限满足。 | [冻结来源 L128][S-SR-P1-04-01] | [I-POL][I-POL] | [D-BE][D-BE] | [SR-BE-POL-001 P][Q-SR-BE-POL-001]、[SR-BE-POL-002 P][Q-SR-BE-POL-002]、[SR-BE-POL-003 P][Q-SR-BE-POL-003]、[SR-BE-POL-007 P][Q-SR-BE-POL-007]、[SR-BE-POL-008 P][Q-SR-BE-POL-008] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-04-02` 使用最新目标事实<br>等待审计或容量后按实际派发前事实保护目标；保护依据目标身份而非执行账号在线状态。 | [冻结来源 L128][S-SR-P1-04-02] | [I-POL][I-POL] | [D-BE][D-BE] | [SR-BE-POL-002 P][Q-SR-BE-POL-002]、[SR-BE-POL-003 P][Q-SR-BE-POL-003]、[SR-BE-POL-007 P][Q-SR-BE-POL-007]、[SR-BE-POL-008 P][Q-SR-BE-POL-008] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-04-03` 保留外部目标原规则<br>普通外部目标继续原开关/审计/权限/预算/未知结果保护；不添加额外白名单或新工具。 | [冻结来源 L128][S-SR-P1-04-03] | [I-POL][I-POL] | [D-BE][D-BE] | [SR-BE-POL-004 P][Q-SR-BE-POL-004]、[SR-BE-POL-005 B][Q-SR-BE-POL-005] | 研发/QA真实竞争观察 |
| `SR-P1-04-04` 独立退群清理不变<br>独立leave-all清理托管成员职责不因自动kick限制受阻，群主最后及失败保留原规则。 | [冻结来源 L128][S-SR-P1-04-04] | [I-LEAVE][I-LEAVE] | [D-BE][D-BE] | [SR-BE-POL-006 P][Q-SR-BE-POL-006] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-04-05` 既有错误协议<br>拒绝按既有工具错误契约；当前公开交接指定POLICY_DENIED，不能新增对外错误码；策略同样适用于模拟及真实Agent。 | [冻结来源 L128][S-SR-P1-04-05] | [I-POL][I-POL] | [D-BE][D-BE] | [SR-BE-POL-001 P][Q-SR-BE-POL-001]、[SR-BE-POL-004 P][Q-SR-BE-POL-004]、[SR-BE-POL-007 P][Q-SR-BE-POL-007]、[SR-BE-POL-008 P][Q-SR-BE-POL-008] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-P1-05-01` 真实调用记录<br>留存真实可得或明确生成服务内request/attemptID、turn/audit用途、模型、耗时及结果，不伪造后端run/tool关联。 | [冻结来源 L137][S-SR-P1-05-01] | [I-PROVIDER][I-PROVIDER]、[I-USG][I-USG] | [D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-013 P][Q-SR-C2-013]、[SR-BE-USG-001 P][Q-SR-BE-USG-001]、[SR-BE-USG-002 P][Q-SR-BE-USG-002]、[SR-BE-USG-004 B][Q-SR-BE-USG-004]、[SR-BE-USG-007 P][Q-SR-BE-USG-007]、[SR-BE-USG-012 P][Q-SR-BE-USG-012] | 研发已补；QA复测 |
| `SR-P1-05-02` 真实用量与未知<br>只记录provider实际usage，缺失为未知，不推算未报告token；失败状态单列且不能虚构零消耗。 | [冻结来源 L137][S-SR-P1-05-02] | [I-PROVIDER][I-PROVIDER]、[I-USG][I-USG] | [D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-013 P][Q-SR-C2-013]、[SR-C2-015 B][Q-SR-C2-015]、[SR-C2-018 B][Q-SR-C2-018]、[SR-BE-USG-001 P][Q-SR-BE-USG-001]、[SR-BE-USG-002 P][Q-SR-BE-USG-002]、[SR-BE-USG-012 P][Q-SR-BE-USG-012]、[SR-BE-USG-013 P][Q-SR-BE-USG-013] | 研发已补；QA复测；研发已补；QA接线 |
| `SR-P1-05-03` 缓存不重复推理<br>复用已完成响应不记录为新的模型推理；可区分缓存读取和实际调用。 | [冻结来源 L137][S-SR-P1-05-03] | [I-GEM][I-GEM]、[I-USG][I-USG] | [D-C2][D-C2]、[D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-004 P][Q-SR-C2-004]、[SR-C2-013 P][Q-SR-C2-013]、[SR-BE-USG-003 P][Q-SR-BE-USG-003]、[SR-BE-USG-008 B][Q-SR-BE-USG-008] | 研发已补；QA复测 |
| `SR-P1-05-04` 有界存储与配置<br>配置关闭、有界队列/文件/保留、权限和关闭清理边界明确；具体参数按aa41冻结公开契约验证，不能由实现猜测。 | [冻结来源 L137][S-SR-P1-05-04] | [I-USG][I-USG]、[I-MAIN][I-MAIN] | [D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-014 P][Q-SR-C2-014]、[SR-C2-015 B][Q-SR-C2-015]、[SR-C2-016 B][Q-SR-C2-016]、[SR-C2-018 B][Q-SR-C2-018]、[SR-BE-USG-004 B][Q-SR-BE-USG-004]、[SR-BE-USG-005 P][Q-SR-BE-USG-005]、[SR-BE-USG-006 B][Q-SR-BE-USG-006]、[SR-BE-USG-008 B][Q-SR-BE-USG-008]、[SR-BE-USG-010 B][Q-SR-BE-USG-010]、[SR-BE-USG-011 B][Q-SR-BE-USG-011] | 研发已补；QA复测；研发已补；QA接线；QA隔离环境；研发说明安全条件；研发已补；QA补完整子项；QA矩阵；研发提供边界 |
| `SR-P1-05-05` 记录失败隔离<br>记录写入失败不阻塞主业务且可诊断；并发/积压/存储故障须有真实响应与诊断证据。 | [冻结来源 L137][S-SR-P1-05-05] | [I-USG][I-USG] | [D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-014 P][Q-SR-C2-014]、[SR-C2-016 B][Q-SR-C2-016]、[SR-BE-USG-005 P][Q-SR-BE-USG-005]、[SR-BE-USG-009 P][Q-SR-BE-USG-009] | 研发已补；QA复测 |
| `SR-P1-05-06` 允许字段与秘密<br>仅允许字段留存，不写正文、prompt、工具内容或凭据，不做计费/成本承诺/仪表盘。 | [冻结来源 L137][S-SR-P1-05-06] | [I-USG][I-USG]、[I-PROVIDER][I-PROVIDER] | [D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-013 P][Q-SR-C2-013]、[SR-C2-018 B][Q-SR-C2-018]、[SR-BE-USG-006 B][Q-SR-BE-USG-006]、[SR-BE-USG-007 P][Q-SR-BE-USG-007]、[SR-BE-USG-009 P][Q-SR-BE-USG-009]、[SR-BE-USG-011 B][Q-SR-BE-USG-011] | 研发已补；QA接线；QA隔离环境；研发说明安全条件；QA矩阵；研发提供边界 |
| `SR-P1-05-07` 调用结果分层<br>成功失败是模型服务调用和输出校验结果，不等于工具执行/审计授权成功；优先离线注入且不新增付费调用。 | [冻结来源 L137][S-SR-P1-05-07] | [I-PROVIDER][I-PROVIDER]、[I-USG][I-USG]、[I-KEY][I-KEY] | [D-MEAS][D-MEAS]、[D-USG][D-USG] | [SR-C2-009 P][Q-SR-C2-009]、[SR-C2-011 P][Q-SR-C2-011]、[SR-C2-013 P][Q-SR-C2-013]、[SR-C2-016 B][Q-SR-C2-016]、[SR-BE-USG-001 P][Q-SR-BE-USG-001]、[SR-BE-USG-002 P][Q-SR-BE-USG-002]、[SR-BE-USG-012 P][Q-SR-BE-USG-012]、[SR-BE-USG-013 P][Q-SR-BE-USG-013] | 研发已补；QA复测 |
| `SR-AUTH-01` 仅准备授权<br>本轮只准备资产/静态/QA工具自身测试；产品执行、真实模型、合main均未授权。 | [冻结来源 L159][S-SR-AUTH-01] | [I-DEL][I-DEL] | [D-AUTH][D-AUTH] | [SR-BE-DEL-003 P][Q-SR-BE-DEL-003] | D052 已授权执行；本轮费用/凭据及上线仍不含 |
| `SR-AUTH-02` 冻结与历史分离<br>最终SUT尚未冻结；新的QA资产独立overlay，第一轮scope/signature/候选计数/原始报告不重解释。 | [冻结来源 L159][S-SR-AUTH-02] | [I-DEL][I-DEL] | [D-AUTH][D-AUTH] | [SR-BE-DEL-003 P][Q-SR-BE-DEL-003] | QA：保留本批各 case 原结论；研发维护对应实现 |
| `SR-AUTH-03` QA独立维护<br>研发不修改QA目录或代填结果；公开需求与批准差异是oracle，工程实现仅解释接入。 | [冻结来源 L159][S-SR-AUTH-03] | [I-DEL][I-DEL] | [D-AUTH][D-AUTH] | [SR-BE-DEL-001 B][Q-SR-BE-DEL-001] | 研发本表交付；QA人工逐条复核 |
| `SR-AUTH-04` 人工与上线分离<br>真实IME/跨窗口及最终集中人工体验不由自动化签字；业务结论与上线准备度分开。 | [冻结来源 L159][S-SR-AUTH-04] | [I-DEL][I-DEL] | [D-AUTH][D-AUTH]、[D-FIRST][D-FIRST] | [SR-BE-DEL-002 P][Q-SR-BE-DEL-002] | 负责人/真人：首轮五秒与真人项留第二轮后；不阻断独立项 |

## 112 case 原证据与责任索引

下表只抄原 case 总状态，不改写 subvariant；“原始事实”保留实际 evidence 文件/目录入口（其余变体/截图/账本由 result 引用）。PASS 行不承担新版本背书；FAIL/BLOCKED 行的后续归因是工作去向，原状态保持。所有 case 均 attempt=1。

| case / 标题 | 474 原状态 | 原始事实入口 | 责任 / 下一步 |
|---|---|---|---|
| [SR-C1-001][Q-SR-C1-001] 真实附件下载、文本与私有绝对路径 | PASS | [原始证据目录][E-SR-C1-001-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-002][Q-SR-C1-002] 重复与双实例回放不改首次来源 | PASS | [原始证据目录][E-SR-C1-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-003][Q-SR-C1-003] 来源缺失、拒绝跳转、URL与大小边界 | BLOCKED | [error.json][E-SR-C1-003-0] | 研发交入口；QA接线复测：缺媒体错误/取消的完整公开观测；新双层出口 D-EGR 待绑定，不证明任意 native 网络无尝试。 |
| [SR-C1-004][Q-SR-C1-004] 暂时下载失败后原任务跨重启恢复 | PASS | [原始证据目录][E-SR-C1-004-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-005][Q-SR-C1-005] 默认30天和可配保留阈值两侧 | PASS | [原始证据目录][E-SR-C1-005-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-006][Q-SR-C1-006] 删除后旧分页游标和自身回声不复活路径 | PASS | [原始证据目录][E-SR-C1-006-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-007][Q-SR-C1-007] 触发、工具读取和未完成下载的活动引用 | PASS | [原始证据目录][E-SR-C1-007-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-008][Q-SR-C1-008] 引用登记与清理互斥的两个实际顺序 | BLOCKED | [error.json][E-SR-C1-008-0] | 研发已补；QA接线复测：原引用先于清理夹具未接；D-MR 提供实际事务阶段与精确租约，474 未执行。 |
| [SR-C1-009][Q-SR-C1-009] 下载/发布/删除四个崩溃窗口恢复 | FAIL | [error.json][E-SR-C1-009-0] | QA修正夹具后独立复测：原断言为应删文件仍存在；后续归因见[研发跟进](second-round-followup-20261002.md#L28)：需等 next_attempt_at 的真实重试时间，不把原 FAIL 擦成 PASS。 |
| [SR-C1-010][Q-SR-C1-010] 真实unlink失败不留旧路径、不阻塞其他删除 | PASS | [原始证据目录][E-SR-C1-010-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-011][Q-SR-C1-011] 持久目录重启、共享实例和错目录拒绝 | PASS | [原始证据目录][E-SR-C1-011-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C1-012][Q-SR-C1-012] 旧schema拒绝启动、可重复迁移及历史回填 | BLOCKED | [error.json][E-SR-C1-012-0] | 研发供历史基线；QA复核迁移：原旧库迁移入口未接；[媒体复现契约](qa-media-scenarios-20261002.md#L130)已给历史 001–008 夹具来源，须 QA 独立执行。 |
| [SR-C2-001][Q-SR-C2-001] 独立turn/audit四工具和合法schema协议 | PASS | [原始证据目录][E-SR-C2-001-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-002][Q-SR-C2-002] 默认mock与只改AGENT_URL的显式切换 | PASS | [原始证据目录][E-SR-C2-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-003][Q-SR-C2-003] 历史、tool_result/错误续接与run隔离 | PASS | [原始证据目录][E-SR-C2-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-004][Q-SR-C2-004] 已完成响应和正常重启后复用 | PASS | [原始证据目录][E-SR-C2-004-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-005][Q-SR-C2-005] 同run在途并发与历史分叉拒绝 | PASS | [原始证据目录][E-SR-C2-005-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-006][Q-SR-C2-006] 上游错误、截断、安全拒绝和非法输出 | PASS | [原始证据目录][E-SR-C2-006-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-007][Q-SR-C2-007] 未决轮和死owner.lock的安全行为与限制 | PASS | [原始证据目录][E-SR-C2-007-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-008][Q-SR-C2-008] session目录私有、独占与损坏状态 | BLOCKED | [error.json][E-SR-C2-008-0] | QA环境夹具；研发协助契约：foreign-owner 子场景缺实际隔离用户夹具；权限通过不外推不同 UID。 |
| [SR-C2-009][Q-SR-C2-009] 主后端权限/托管保护与同key审计发送复用 | PASS | [原始证据目录][E-SR-C2-009-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-010][Q-SR-C2-010] 独立服务下真实步数与活动预算耗尽 | BLOCKED | [error.json][E-SR-C2-010-0] | 研发/QA预算入口接线：真实 provider 与后端预算组合未接齐；离线模型通过不替代该组合。 |
| [SR-C2-011][Q-SR-C2-011] 审计fail/三次未知/明确pass的主后端后果 | PASS | [原始证据目录][E-SR-C2-011-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-012][Q-SR-C2-012] 模型在途硬崩溃后的原强恢复义务 | FAIL | [error.json][E-SR-C2-012-0] | 研发说明边界；负责人最终判断；QA复测：SIGKILL 后 owner.lock 阻止启动，原强恢复断言 FAIL；D047 既有说明不是验收豁免，不自动偷锁或写成恢复成功。 |
| [SR-C2-013][Q-SR-C2-013] 实际usage字段、缓存不计推理、未知和结果隔离 | PASS | [原始证据目录][E-SR-C2-013-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-014][Q-SR-C2-014] usage真实写失败隔离与容量裁剪 | PASS | [原始证据目录][E-SR-C2-014-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-C2-015][Q-SR-C2-015] usage启用差异、默认限额、零值、年龄与关闭 | BLOCKED | [error.json][E-SR-C2-015-0] | 研发已补；QA复测：main-true、factory-false/true 生命周期子场景未成立；D-USG 提供明确入口，474 未执行。 |
| [SR-C2-016][Q-SR-C2-016] usage有限队列与响应不等待磁盘 | BLOCKED | [error.json][E-SR-C2-016-0] | 研发已补；QA复测：队列持有/溢出入口原未接；D-USG 提供真实 writer 门、等待队列 64 与当前批独立观察；固定样本是 activeBatch=1，不冒充 activeBatch=64。 |
| [SR-C2-017][Q-SR-C2-017] 最终候选真实提供方最小新增证据 | BLOCKED | [error.json][E-SR-C2-017-0] | 负责人有限授权；QA持条件执行：缺本轮真实提供方调用/费用/凭据条件，不读取本机 Key 或调用；独立离线事项继续。 |
| [SR-C1-013][Q-SR-C1-013] 媒体通知不变新消息/提醒及页内更新 | BLOCKED | [error.json][E-SR-C1-013-0] | 研发供媒体事件契约；QA接线：实际 WS 的 message/changeKind=media、页面与提醒观察尚未绑定；核对消息身份不增加、未读/范围提醒不按新消息增长及路径更新，不由源码推定。 |
| [SR-C1-014][Q-SR-C1-014] 未知效果暂停中的running引用跨重启保留 | BLOCKED | [error.json][E-SR-C1-014-0] | 研发已补；QA接线：原未知结果跨重启媒体保护入口未接；D-MR 提供真实 running 引用、同库同目录重启与过期清理观察。保护文件不等于未知业务结果恢复完成，需 QA 独立账本。 |
| [SR-C1-015][Q-SR-C1-015] 文件打开/写入失败、部分文件与发布后收紧上限 | BLOCKED | [error.json][E-SR-C1-015-0] | 研发供 I/O 故障机制；QA接线：文件打开/写入失败、响应/文件描述符释放、部分文件及完整落盘后收紧上限窗口尚未绑定；按[媒体复现契约](qa-media-scenarios-20261002.md)与[C1 生命周期说明](c1-media-files.md#L66)独立核对有/无真实 running 引用时的路径、删除意图与终态清理。 |
| [SR-C2-018][Q-SR-C2-018] usage非法token/无效配置/临时文件精确清理 | BLOCKED | [error.json][E-SR-C2-018-0] | 研发已补；QA接线：用量精确故障/边界入口原未绑定；D-USG 提供持有阶段，不代替全部年龄/大小矩阵。 |
| [SR-C2-019][Q-SR-C2-019] 后端原turn超时/严格工具5秒/跨epoch关联回归 | BLOCKED | [error.json][E-SR-C2-019-0] | 研发/QA故障接线：未绑定真实派发故障窗口；需区分安全停止与最终完成，不新增外部结果查询。 |
| [SR-C2-020][Q-SR-C2-020] 提供方目的地址、凭据header与退出资源 | BLOCKED | [error.json][E-SR-C2-020-0] | 研发已补；QA接线：原缺实际 owned 进程出口/取消；D-USG 仅该 provider transport，D-EGR 仅已实测内置路径，二者不可称全进程任意出口保证。 |
| [SR-UI-001][Q-SR-UI-001] 原提交未改动的成功可清理原草稿 | PASS | [原始证据目录][E-SR-UI-001-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-002][Q-SR-UI-002] A提交后编辑B，旧成功保留B | PASS | [原始证据目录][E-SR-UI-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-003][Q-SR-UI-003] A提交后B再A，旧成功仍保留新A | PASS | [原始证据目录][E-SR-UI-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-004][Q-SR-UI-004] 换群后旧发送响应不清另一群输入 | PASS | [原始证据目录][E-SR-UI-004-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-005][Q-SR-UI-005] 换账号或会话后旧发送响应隔离 | PASS | [原始证据目录][E-SR-UI-005-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-006][Q-SR-UI-006] 失败回执保留等待期间编辑输入 | PASS | [原始证据目录][E-SR-UI-006-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-007][Q-SR-UI-007] 未知发送结果不清稿或盲重发 | PASS | [原始证据目录][E-SR-UI-007-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-008][Q-SR-UI-008] 新序列表单脏状态及保存中全部关闭入口 | PASS | [原始证据目录][E-SR-UI-008-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-009][Q-SR-UI-009] 保存快照与保存中编辑的实际记录一致 | PASS | [原始证据目录][E-SR-UI-009-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-010][Q-SR-UI-010] 建群和编辑群现有关闭保护回归 | PASS | [原始证据目录][E-SR-UI-010-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-011][Q-SR-UI-011] 群变化后旧预检晚到失效 | PASS | [原始证据目录][E-SR-UI-011-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-012][Q-SR-UI-012] 模板变化后旧预检晚到失效 | PASS | [原始证据目录][E-SR-UI-012-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-013][Q-SR-UI-013] 变量变化后旧预检晚到失效 | PASS | [原始证据目录][E-SR-UI-013-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-014][Q-SR-UI-014] 群模板变量ABA及响应乱序不能复活旧预检 | PASS | [原始证据目录][E-SR-UI-014-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-015][Q-SR-UI-015] 确认摘要绑定冻结目标与最终渲染内容 | PASS | [原始证据目录][E-SR-UI-015-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-016][Q-SR-UI-016] 显式选择和URL目标失效必须重选 | PASS | [原始证据目录][E-SR-UI-016-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-017][Q-SR-UI-017] 首次默认选择与显式目标失效区分 | PASS | [原始证据目录][E-SR-UI-017-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-018][Q-SR-UI-018] 运行时角色预检、限流顺延和排期回归 | BLOCKED | [error.json][E-SR-UI-018-0] | QA适配与归因；研发按证据协助：实际请求 404 NOT_FOUND；先核公开运行路由，尚不能据此认定运行时业务缺陷。 |
| [SR-UI-019][Q-SR-UI-019] 群详情进入运行详情返回原群 | PASS | [原始证据目录][E-SR-UI-019-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-020][Q-SR-UI-020] 运行列表进入详情返回保留群筛选 | PASS | [原始证据目录][E-SR-UI-020-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-021][Q-SR-UI-021] 查看所属群及来源标题高亮一致 | FAIL | [error.json][E-SR-UI-021-0] | QA独立归因；研发按证据处理：页面标题实际 Agent 运行，期望群组工作台；本表不擅定选择器或产品原因。 |
| [SR-UI-022][Q-SR-UI-022] 直接入口和非法来源安全站内兜底 | PASS | [原始证据目录][E-SR-UI-022-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-023][Q-SR-UI-023] 刷新与历史前后退保留合法来源 | PASS | [原始证据目录][E-SR-UI-023-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-024][Q-SR-UI-024] 加载失败和身份变化仍可离开详情 | PASS | [原始证据目录][E-SR-UI-024-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-025][Q-SR-UI-025] 来源导航和提醒确认不串实体 | BLOCKED | [error.json][E-SR-UI-025-0] | QA真实浏览器条件；必要时真人：未建立真实排他标签焦点；不伪造 visibility/focus 事件，不替代真人跨窗口体验。 |
| [SR-UI-026][Q-SR-UI-026] 退出换账号或同账号重登不接受旧history | PASS | [原始证据目录][E-SR-UI-026-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-027][Q-SR-UI-027] refresh401且Workspace未挂载仍可安全离开 | PASS | [原始证据目录][E-SR-UI-027-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-028][Q-SR-UI-028] login成功后me失败恢复 | PASS | [原始证据目录][E-SR-UI-028-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-UI-029][Q-SR-UI-029] 导航存储写失败有界降级 | PASS | [原始证据目录][E-SR-UI-029-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DEL-001][Q-SR-BE-DEL-001] 首轮签发事实与第二轮差异逐项可追踪 | BLOCKED | [delivery-evidence.json][E-SR-BE-DEL-001-0] | 研发本表交付；QA人工逐条复核：旧材料 hash/diff 子项 PASS，完整映射缺项 BLOCKED；本表待 QA 核对，不能自动解除。 |
| [SR-BE-DEL-002][Q-SR-BE-DEL-002] 既有决定、真人与上线结论不相互替代 | PASS | [delivery-evidence.json][E-SR-BE-DEL-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DEL-003][Q-SR-BE-DEL-003] 组合候选与授权准入不借历史结果放行 | PASS | [delivery-evidence.json][E-SR-BE-DEL-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DEL-004][Q-SR-BE-DEL-004] 干净副本按最终README可隔离安装迁移启动 | BLOCKED | [delivery-evidence.json][E-SR-BE-DEL-004-0] | 研发/QA隔离入口复现归因：QA 自有安装/迁移/API 已过；公开 README 入口 ready 前 exit 1，精确清理仍需独立证据。 |
| [SR-BE-DEL-005][Q-SR-BE-DEL-005] 升级重启保留数据且不会删除其他运行目录 | BLOCKED | [error.json][E-SR-BE-DEL-005-0] | 研发供机制；QA实际触发：缺 independently observed 故障窗口；D-MR/D-USG 及媒体场景可接，仍需真实进程/PG/文件事实。 |
| [SR-BE-DEL-006][Q-SR-BE-DEL-006] C3复用新候选完整登录到实际run步骤 | PASS | [原始证据目录][E-SR-BE-DEL-006-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-GRD-001][Q-SR-BE-GRD-001] send_message 审计非pass绝不实际派发 | PASS | [SR-BE-GRD-001-audit-pass-positive-control.json][E-SR-BE-GRD-001-0]；[SR-BE-GRD-001-fail.json][E-SR-BE-GRD-001-1]；另 4 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-GRD-002][Q-SR-BE-GRD-002] kick_user 审计非pass绝不实际派发 | PASS | [SR-BE-GRD-002-audit-pass-positive-control.json][E-SR-BE-GRD-002-0]；[SR-BE-GRD-002-fail.json][E-SR-BE-GRD-002-1]；另 4 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-GRD-003][Q-SR-BE-GRD-003] 同key在未确认和已确认状态复用原消息不重审重发 | FAIL | [原始变体 1][E-SR-BE-GRD-003-0]；[SR-BE-GRD-003-same-key-at-queued.json][E-SR-BE-GRD-003-1]；另 2 份见 result | 研发已修入495374b；QA新源复测：queued 变体 FAIL；sent 变体 PASS，accepted/unknown 为 fetch 阻塞，failed-live 缺夹具。D-KEY 修复不替其余子项补 PASS。 |
| [SR-BE-GRD-004][Q-SR-BE-GRD-004] 被拒调用不占send幂等key | PASS | [原始变体 1][E-SR-BE-GRD-004-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-GRD-005][Q-SR-BE-GRD-005] 幂等竞争与崩溃恢复不重复已有副作用 | BLOCKED | [SR-BE-GRD-005-same-key-crash-single-instance.json][E-SR-BE-GRD-005-0]；[SR-BE-GRD-005-same-key-crash-dual-instance.json][E-SR-BE-GRD-005-1] | 研发/QA控制契约接线：单实例控制器 HTTP 400，双实例无可绑定进程；未观察到 crash/竞争业务，不按失败产品归因。 |
| [SR-BE-GRD-006][Q-SR-BE-GRD-006] 关闭Agent在当前step结束后原子取消 | PASS | [原始变体 1][E-SR-BE-GRD-006-0]；[原始变体 2][E-SR-BE-GRD-006-1]；另 1 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-GRD-007][Q-SR-BE-GRD-007] 资料与取消事务失败不留半提交 | PASS | [原始变体 1][E-SR-BE-GRD-007-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-GRD-008][Q-SR-BE-GRD-008] CAS失败和旧执行者竞争不导致错误取消或额外效果 | PASS | [原始变体 1][E-SR-BE-GRD-008-0]；[原始变体 2][E-SR-BE-GRD-008-1]；另 1 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-MUT-001][Q-SR-BE-MUT-001] 审计守卫错误副本确由业务断言检出 | PASS | [delivery-evidence.json][E-SR-BE-MUT-001-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-MUT-002][Q-SR-BE-MUT-002] 同key守卫错误副本由重审或重复副作用断言检出 | PASS | [delivery-evidence.json][E-SR-BE-MUT-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-MUT-003][Q-SR-BE-MUT-003] 单事务入口与有限静态门禁交付可复核 | PASS | [delivery-evidence.json][E-SR-BE-MUT-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DB-001][Q-SR-BE-DB-001] 两档真实PG计划与API成本可复现 | PASS | [timeline-measurement-1000.json][E-SR-BE-DB-001-0]；[timeline-measurement-10000.json][E-SR-BE-DB-001-1] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DB-002][Q-SR-BE-DB-002] 一个局部优化或有依据的不优化结论 | BLOCKED | [timeline-measurement-1000.json][E-SR-BE-DB-002-0]；[timeline-measurement-10000.json][E-SR-BE-DB-002-1] | 研发已交回滚材料；QA独立复跑：SQL 比较已有；真实原/新版应用回滚复跑与最终优化 diff 未附。[精确复跑材料][D-DBREPLAY]已交付，只有补丁/静态校验，未将应用流程算已执行。 |
| [SR-BE-DB-003][Q-SR-BE-DB-003] 首次固定分页集合与同毫秒顺序不重复不遗漏 | PASS | [timeline-fixed-set.json][E-SR-BE-DB-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DB-004][Q-SR-BE-DB-004] 出站确认改时间与补投不破坏旧游标 | PASS | [timeline-confirmation.json][E-SR-BE-DB-004-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DB-005][Q-SR-BE-DB-005] 局部优化回滚和并发读取保持公开语义 | PASS | [timeline-fixed-set.json][E-SR-BE-DB-005-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DIA-001][Q-SR-BE-DIA-001] 真实tick失败形成可信原因时间和关联 | PASS | [原始变体 1][E-SR-BE-DIA-001-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DIA-002][Q-SR-BE-DIA-002] 真实恢复更新当前建议并保留一份最近失败 | PASS | [原始变体 1][E-SR-BE-DIA-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DIA-003][Q-SR-BE-DIA-003] 诊断admin/viewer权限和敏感信息隔离 | PASS | [原始变体 1][E-SR-BE-DIA-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-DIA-004][Q-SR-BE-DIA-004] 未知外部效果只建议核对不盲重发 | BLOCKED | [SR-BE-DIA-004-dispatched-no-effect-unknown-restart.json][E-SR-BE-DIA-004-0]；[SR-BE-DIA-004-dispatched-effect-unknown-restart.json][E-SR-BE-DIA-004-1] | QA技术复核；研发保留未知边界：窗口内缺终态事实及后续进程绑定；安全下一步语义/权威完成仍独立待判，no-replay 不等于业务完成。 |
| [SR-BE-DIA-005][Q-SR-BE-DIA-005] 并发失败与重启诊断不串来源或泄露 | PASS | [原始变体 1][E-SR-BE-DIA-005-0]；[原始变体 2][E-SR-BE-DIA-005-1]；另 1 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-001][Q-SR-BE-POL-001] 有权审计pass也不能kick当前托管目标 | PASS | [SR-BE-POL-001-creator.json][E-SR-BE-POL-001-0]；[SR-BE-POL-001-admin.json][E-SR-BE-POL-001-1]；另 3 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-002][Q-SR-BE-POL-002] 审计等待时目标成为托管身份派发前重查 | PASS | [原始变体 1][E-SR-BE-POL-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-003][Q-SR-BE-POL-003] 容量拒绝等待时目标身份变化仍零kick | PASS | [原始变体 1][E-SR-BE-POL-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-004][Q-SR-BE-POL-004] 普通外部目标原审计开关权限预算保持 | PASS | [SR-BE-POL-004-external-positive-control.json][E-SR-BE-POL-004-0]；[SR-BE-POL-004-external-switch-off.json][E-SR-BE-POL-004-1]；另 3 份见 result | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-005][Q-SR-BE-POL-005] 已派发外部kick的未知结果不被新政策误重放 | BLOCKED | [SR-BE-POL-005-dispatched-no-effect-unknown-restart.json][E-SR-BE-POL-005-0]；[SR-BE-POL-005-dispatched-effect-unknown-restart.json][E-SR-BE-POL-005-1] | 研发/QA真实竞争观察：未知派发重启变体未见要求的终态；第二实例竞争也无独立证据，不能由终态后不重放推导。 |
| [SR-BE-POL-006][Q-SR-BE-POL-006] leave-all仍可清托管成员且群主最后 | PASS | [SR-BE-POL-006-leave-success-owner-last.json][E-SR-BE-POL-006-0]；[SR-BE-POL-006-leave-partial-failure.json][E-SR-BE-POL-006-1] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-007][Q-SR-BE-POL-007] 保护在重启恢复和C2提议下保持同目标事实 | PASS | [backend-provider-recovery.json][E-SR-BE-POL-007-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-001][Q-SR-BE-USG-001] turn与audit真实调用记录和实际usage精确对应 | PASS | [原始证据目录][E-SR-BE-USG-001-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-002][Q-SR-BE-USG-002] HTTP错误坏输出和超时各自记录失败不虚构零消耗 | PASS | [原始证据目录][E-SR-BE-USG-002-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-003][Q-SR-BE-USG-003] 完成结果缓存复用不增加实际推理计数 | PASS | [原始证据目录][E-SR-BE-USG-003-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-004][Q-SR-BE-USG-004] 并发turn/audit下记录不串身份且有界 | BLOCKED | [error.json][E-SR-BE-USG-004-0] | 研发已补；QA复测：低负载样本不能证明 held writer 上界/溢出；D-USG 已有 activeBatch=1、queued=64 的开发样本，完整 64+64 容量目标仍须 QA 自行核对。 |
| [SR-BE-USG-005][Q-SR-BE-USG-005] 写入失败或慢存储不阻塞调用且可诊断 | PASS | [原始证据目录][E-SR-BE-USG-005-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-006][Q-SR-BE-USG-006] 关闭记录与权限清理不触及秘密或其他目录 | BLOCKED | [error.json][E-SR-BE-USG-006-0] | QA隔离环境；研发说明安全条件：main 开关/私有权限已测，停止 owner 的精确临时文件、foreign-owner、Key 文件隔离子项仍缺。 |
| [SR-BE-USG-007][Q-SR-BE-USG-007] 允许字段留存不泄露prompt工具正文和key | PASS | [原始证据目录][E-SR-BE-USG-007-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-008][Q-SR-BE-USG-008] 正常关闭与硬崩溃后记录真实性和缓存边界 | BLOCKED | [error.json][E-SR-BE-USG-008-0] | 研发已补；QA复测：完成缓存与 provider-pending 强杀已测，queued-usage-write 强杀窗口未绑定；D-USG 不改变硬退出可丢 telemetry。 |
| [SR-BE-USG-009][Q-SR-BE-USG-009] 用量写失败诊断自身不造成递归或信息泄漏 | PASS | [原始证据目录][E-SR-BE-USG-009-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-010][Q-SR-BE-USG-010] 正式入口与显式编程入口usage配置保持公开差异 | BLOCKED | [error.json][E-SR-BE-USG-010-0] | 研发已补；QA补完整子项：main 默认/false 已测；factory 缺省/显式 usage 与 Key 文件专属配置未完整绑定；D-USG 待复测。 |
| [SR-BE-USG-011][Q-SR-BE-USG-011] 记录数、UTF-8字节及年龄边界按启动与写入清理 | BLOCKED | [error.json][E-SR-BE-USG-011-0] | QA矩阵；研发提供边界：条数/UTF-8 样本已有；10000/16MiB 极值、非法配置、可信年龄矩阵仍缺，不由小样本外推。 |
| [SR-BE-USG-012][Q-SR-BE-USG-012] 成功HTTP真实用量与随后输出失败独立记录，非成功HTTP不取body用量 | PASS | [原始证据目录][E-SR-BE-USG-012-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-USG-013][Q-SR-BE-USG-013] 部分用量字段独立校验，零与未知不混淆且不补算总量 | PASS | [原始证据目录][E-SR-BE-USG-013-0] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |
| [SR-BE-POL-008][Q-SR-BE-POL-008] 派发前托管目标明确拒绝跨真实work截止仍正确保存并保持取消优先级 | PASS | [SR-BE-POL-008-no-cancel.json][E-SR-BE-POL-008-0]；[SR-BE-POL-008-cancel-requested.json][E-SR-BE-POL-008-1] | QA：该固定批次已 PASS；不追加推断或替新 main 签字。 |

## 首轮旧结论与既有决定，保持独立版本

本节是第二轮责任交接；原始全量、差异和补证的分母与结论仍分别保留于 [首轮交付总报告](../qa-acceptance/reports/acceptance/20261002-current-delivery/report.md)、[2716abd 全量](../qa-acceptance/reports/acceptance/20261001-2716abd-business/report.md)、[8e047ae 差异](../qa-acceptance/reports/followup/20261001-8e047-retest/report.md)及各补证。首轮旧版 116 条需求状态不由本表或第二轮 112 case 改写。

| 事项 | 原证据 / 版本 | 处理与责任 |
|---|---|---|
| 活动预算 AGENT-025 / CAP-003 | [8e047ae 差异报告](../qa-acceptance/reports/followup/20261001-8e047-retest/report.md)；历史实测活动约 48.175–48.181 / 45.004–45.011 秒 | 两个特定场景独立 PASS；研发保留完整活动/数据库提交边界，不外推所有故障。 |
| 五秒 AGENT-028 / INT-READ-001 | [首轮收尾 L50](first-acceptance-closeout-20261001.md#L50)与[后续观察复测](../qa-acceptance/reports/followup/20261002-first-round-observation-retest/report.md)；8e047ae 普通 5001.360–5001.471ms、持锁 5000.444–5000.530ms 原 FAIL | 按 D052 留第二轮后；原五秒标准不变，不提前截断或加容差造 PASS；负责人只对最终偏差/保证作决定。 |
| 安全阶段跨重启 INT-ACT-001 | [8e047ae 差异](../qa-acceptance/reports/followup/20261001-8e047-retest/report.md)，49.413–49.736 秒，原 3 步续至 7 步 | 该安全阶段 PASS；研发/QA 不把它作为任意外部副作用窗口的强恢复证据。 |
| UI-032 旧列表/提醒确认 | [2716abd 原全量](../qa-acceptance/reports/acceptance/20261001-2716abd-business/report.md) PASS | 没有在 8e047ae 差异中重跑；QA 保留原版本依据。 |
| 既有强恢复限制与接收窗口 | [收尾 L53](first-acceptance-closeout-20261001.md#L53)；BLK-EXT-004/REC-007/BLK-EXT-005 新版 FAIL，INT-MSG-007/BLK-EXT-002/003 旧 FAIL 未重跑，BLK-EXT-001 旧 BLOCKED 未重跑；[D039–D042](decisions.md#L69) | 既定 2–7 处理方向不重选、不新增外部协议、不盲重放；工程取舍不等于原文满足，偏差是否可接受仍由负责人单列。 |
| 状态文案与真人 | [收尾 L54–55](first-acceptance-closeout-20261001.md#L54)、[文案依据](qa-status-copy-review-20261001.md)；H18 有限认可和 UI038/039 独立结果分开 | MAN-IME-001 / MAN-FOCUS-001 留第二轮后真人；不由自动化代签，也不重造已认可的有限文案样例。 |
| 预算×已派发 kick | [原补证报告](../qa-acceptance/reports/followup/20261002-dispatched-kick-budget/report.md)：8e047ae 审定专项 7P/3B，原强恢复 FAIL 与预算证据 BLOCKED 分开 | 保留原历史数；[后续 kick 工作复测](../qa-acceptance/reports/followup/20261002-kick-work-retest/report.md) 是独立后续证据，不能覆盖原补证或证明运行中第二实例竞争。 |
| C1/C2/C3 与上线 | [D047](decisions.md#L128)、[C1/C2 交付](c1-c2-delivery-20261001.md)、[原全量报告](../qa-acceptance/reports/acceptance/20261001-2716abd-business/report.md) | 首轮含代码但排除 C1/C2 专项；本轮用 73 条款表独立追踪，C3 复用既有端到端资产。生产上线、演示切换及费用/真实凭据不随本次交接自动授权。 |

## 待 QA 核对与交付边界

1. 逐条核对 73 条款表与 QA catalog/traceability，确认实现和开发材料能够支撑相应技术说明；112 case 原状态/原变体只以该 run 为准。研发未读取断言后将其复制为新 QA 用例，也未补写 QA 结果。
2. DEL-001 原 driver 的类别 impactMap/hash/diff 只完成材料子项；此次新增完整表需 QA 人工核对后自行记录到新报告。旧 run/result 保留 BLOCKED，不要求修改历史 driver 结果来关闭缺项。
3. 在新固定 main 单独复测 GRD003、媒体引用/cleanup、用量/transport/出口观察相关缺口；这些新增能力只消除可接入材料缺口，不能预告全部阻塞已解除。UI021、公开启动、控制器 400、真实焦点等仍由各自原证据归因。
4. DB002 的[原/新版应用回滚材料][D-DBREPLAY]已由研发补齐，当前只验证补丁与语法，再由 QA 独立执行 HTTP/数据库流程；C2-012 owner.lock 与未知远端效果分别判断，安全拒绝不等于满足强恢复。真实提供方条件、首轮五秒/真人及业务偏差单列，不停其他独立事项。

本文件校对：catalog 73 个唯一 ID 与逐条表一一对应；traceability 所列关联恰好覆盖 results 的 112 个唯一 case，且每 case 的反向 requirements 一致；112 份 result 的状态/attempt 与汇总核对；所列附加原 evidence 路径均存在。文档生成仅解析只读 JSON/Markdown，没有导入或执行 QA 工程，也没有重跑产品。链接行号对应冻结 QA 来源或上述新 main，原始证据内容与状态未更改。

<!-- 引用定义：原始 QA 文件当前仅由独立 QA 工作树持有。 -->

[D-C1]: c1-media-files.md#L38
[D-C2]: c2-gemini-agent.md#L76
[D-COMB]: c1-c2-final-combination-20261001.md#L3
[D-UI]: final-enhancement-ui-20261002.md#L33
[D-BE]: final-enhancement-backend-20261002.md#L74
[D-MEAS]: final-enhancement-measurement-20261002.md#L3
[D-SAVE]: second-round-sequence-save-guard-20261002.md#L3
[D-MM]: qa-multimodule-observation-20261002.md#L59
[D-MR]: qa-media-reference-observation-20261002.md#L65
[D-USG]: qa-usage-observation-20261002.md#L89
[D-EGR]: qa-egress-observation-20261002.md#L83
[D-KEY]: agent-idempotency-status-fix-20261002.md#L3
[D-INT]: second-round-integration-20261002.md#L7
[D-FIRST]: first-acceptance-closeout-20261001.md#L32
[D-AUTH]: decisions.md#L190
[I-MEDIA]: ../apps/server/src/modules/media-files/index.ts#L48
[I-REF]: ../apps/server/src/modules/media-files/index.ts#L111
[I-MIG]: ../db/migrations/009_media_files.sql#L1
[I-GEM]: ../apps/gemini-agent/src/app.ts#L39
[I-STORE]: ../apps/gemini-agent/src/sessions.ts#L33
[I-PROVIDER]: ../apps/gemini-agent/src/provider.ts#L33
[I-MAIN]: ../apps/gemini-agent/src/main.ts#L1
[I-DRAFT]: ../apps/web/src/components/Timeline.tsx#L159
[I-FORM]: ../apps/web/src/hooks/useGroupFormGuard.ts#L4
[I-PRE]: ../apps/web/src/pages/Sequences.tsx#L197
[I-KEY]: ../apps/server/src/modules/automation/tool-execution.ts#L243
[I-CANCEL]: ../apps/server/src/modules/automation/lifecycle.ts#L30
[I-GATE]: ../scripts/check-automation-boundaries.ts#L1
[I-TIME]: ../apps/server/src/modules/gateway/index.ts#L287
[I-NAV]: ../apps/web/src/pages/AgentRuns.tsx#L110
[I-ATTN]: ../apps/web/src/attention/browser.ts#L1
[I-DIAG]: ../apps/server/src/core/module-progress.ts#L32
[I-POL]: ../apps/server/src/modules/automation/tool-execution.ts#L515
[I-USG]: ../apps/gemini-agent/src/usage.ts#L99
[I-DEL]: ../README.md#L1
[DEL-CLAUSE]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/cases/generated/enhancements-backend.md#L5
[QA-TRACE]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/traceability.md#L8
[RUN-REPORT]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/report.md
[RUN-RESULTS]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/results.json
[RUN-MANIFEST]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/manifest.json
[RUN-HASHES]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/report-hashes.json
[QA-CATALOG]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/catalog.json
[S-SR-C1-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-07]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C1-08]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-07]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-C2-08]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/original-interview-question.md#L315
[S-SR-P0-01-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L48
[S-SR-P0-01-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L48
[S-SR-P0-01-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L48
[S-SR-P0-02-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L60
[S-SR-P0-02-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L60
[S-SR-P0-02-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L60
[S-SR-P0-02-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L60
[S-SR-P0-03-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-03-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-03-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-03-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-03-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-03-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-03-07]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L72
[S-SR-P0-04-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L83
[S-SR-P0-04-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L83
[S-SR-P0-04-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L83
[S-SR-P0-04-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L83
[S-SR-P0-04-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L83
[S-SR-P0-04-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L83
[S-SR-P0-05-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L92
[S-SR-P0-05-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L92
[S-SR-P0-05-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L92
[S-SR-P0-05-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L92
[S-SR-P0-05-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L92
[S-SR-P0-05-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L92
[S-SR-P1-01-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L103
[S-SR-P1-01-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L103
[S-SR-P1-01-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L103
[S-SR-P1-01-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L103
[S-SR-P1-02-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L112
[S-SR-P1-02-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L112
[S-SR-P1-02-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L112
[S-SR-P1-02-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L112
[S-SR-P1-02-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L112
[S-SR-P1-02-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L112
[S-SR-P1-03-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L119
[S-SR-P1-03-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L119
[S-SR-P1-03-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L119
[S-SR-P1-03-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L119
[S-SR-P1-03-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L119
[S-SR-P1-04-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L128
[S-SR-P1-04-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L128
[S-SR-P1-04-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L128
[S-SR-P1-04-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L128
[S-SR-P1-04-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L128
[S-SR-P1-05-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-P1-05-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-P1-05-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-P1-05-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-P1-05-05]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-P1-05-06]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-P1-05-07]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/product-enhancement-proposal.md#L137
[S-SR-AUTH-01]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/decisions.md#L159
[S-SR-AUTH-02]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/decisions.md#L159
[S-SR-AUTH-03]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/decisions.md#L159
[S-SR-AUTH-04]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/requirements/sources/decisions.md#L159
[Q-SR-C1-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-001/result.json
[E-SR-C1-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-001
[Q-SR-C1-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-002/result.json
[E-SR-C1-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-002
[Q-SR-C1-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-003/result.json
[E-SR-C1-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-003/error.json
[Q-SR-C1-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-004/result.json
[E-SR-C1-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-004
[Q-SR-C1-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-005/result.json
[E-SR-C1-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-005
[Q-SR-C1-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-006/result.json
[E-SR-C1-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-006
[Q-SR-C1-007]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-007/result.json
[E-SR-C1-007-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-007
[Q-SR-C1-008]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-008/result.json
[E-SR-C1-008-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-008/error.json
[Q-SR-C1-009]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-009/result.json
[E-SR-C1-009-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-009/error.json
[Q-SR-C1-010]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-010/result.json
[E-SR-C1-010-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-010
[Q-SR-C1-011]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-011/result.json
[E-SR-C1-011-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-011
[Q-SR-C1-012]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-012/result.json
[E-SR-C1-012-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-012/error.json
[Q-SR-C2-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-001/result.json
[E-SR-C2-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-001
[Q-SR-C2-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-002/result.json
[E-SR-C2-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-002
[Q-SR-C2-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-003/result.json
[E-SR-C2-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-003
[Q-SR-C2-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-004/result.json
[E-SR-C2-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-004
[Q-SR-C2-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-005/result.json
[E-SR-C2-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-005
[Q-SR-C2-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-006/result.json
[E-SR-C2-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-006
[Q-SR-C2-007]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-007/result.json
[E-SR-C2-007-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-007
[Q-SR-C2-008]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-008/result.json
[E-SR-C2-008-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-008/error.json
[Q-SR-C2-009]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-009/result.json
[E-SR-C2-009-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-009
[Q-SR-C2-010]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-010/result.json
[E-SR-C2-010-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-010/error.json
[Q-SR-C2-011]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-011/result.json
[E-SR-C2-011-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-011
[Q-SR-C2-012]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-012/result.json
[E-SR-C2-012-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-012/error.json
[Q-SR-C2-013]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-013/result.json
[E-SR-C2-013-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-013
[Q-SR-C2-014]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-014/result.json
[E-SR-C2-014-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-014
[Q-SR-C2-015]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-015/result.json
[E-SR-C2-015-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-015/error.json
[Q-SR-C2-016]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-016/result.json
[E-SR-C2-016-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-016/error.json
[Q-SR-C2-017]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-017/result.json
[E-SR-C2-017-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-017/error.json
[Q-SR-C1-013]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-013/result.json
[E-SR-C1-013-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-013/error.json
[Q-SR-C1-014]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-014/result.json
[E-SR-C1-014-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-014/error.json
[Q-SR-C1-015]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-015/result.json
[E-SR-C1-015-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C1-015/error.json
[Q-SR-C2-018]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-018/result.json
[E-SR-C2-018-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-018/error.json
[Q-SR-C2-019]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-019/result.json
[E-SR-C2-019-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-019/error.json
[Q-SR-C2-020]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-020/result.json
[E-SR-C2-020-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-C2-020/error.json
[Q-SR-UI-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-001/result.json
[E-SR-UI-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-001
[Q-SR-UI-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-002/result.json
[E-SR-UI-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-002
[Q-SR-UI-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-003/result.json
[E-SR-UI-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-003
[Q-SR-UI-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-004/result.json
[E-SR-UI-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-004
[Q-SR-UI-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-005/result.json
[E-SR-UI-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-005
[Q-SR-UI-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-006/result.json
[E-SR-UI-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-006
[Q-SR-UI-007]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-007/result.json
[E-SR-UI-007-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-007
[Q-SR-UI-008]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-008/result.json
[E-SR-UI-008-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-008
[Q-SR-UI-009]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-009/result.json
[E-SR-UI-009-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-009
[Q-SR-UI-010]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-010/result.json
[E-SR-UI-010-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-010
[Q-SR-UI-011]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-011/result.json
[E-SR-UI-011-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-011
[Q-SR-UI-012]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-012/result.json
[E-SR-UI-012-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-012
[Q-SR-UI-013]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-013/result.json
[E-SR-UI-013-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-013
[Q-SR-UI-014]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-014/result.json
[E-SR-UI-014-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-014
[Q-SR-UI-015]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-015/result.json
[E-SR-UI-015-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-015
[Q-SR-UI-016]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-016/result.json
[E-SR-UI-016-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-016
[Q-SR-UI-017]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-017/result.json
[E-SR-UI-017-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-017
[Q-SR-UI-018]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-018/result.json
[E-SR-UI-018-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-018/error.json
[Q-SR-UI-019]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-019/result.json
[E-SR-UI-019-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-019
[Q-SR-UI-020]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-020/result.json
[E-SR-UI-020-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-020
[Q-SR-UI-021]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-021/result.json
[E-SR-UI-021-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-021/error.json
[Q-SR-UI-022]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-022/result.json
[E-SR-UI-022-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-022
[Q-SR-UI-023]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-023/result.json
[E-SR-UI-023-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-023
[Q-SR-UI-024]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-024/result.json
[E-SR-UI-024-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-024
[Q-SR-UI-025]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-025/result.json
[E-SR-UI-025-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-025/error.json
[Q-SR-UI-026]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-026/result.json
[E-SR-UI-026-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-026
[Q-SR-UI-027]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-027/result.json
[E-SR-UI-027-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-027
[Q-SR-UI-028]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-028/result.json
[E-SR-UI-028-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-028
[Q-SR-UI-029]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-029/result.json
[E-SR-UI-029-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-UI-029
[Q-SR-BE-DEL-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-001/result.json
[E-SR-BE-DEL-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-001/delivery-evidence.json
[Q-SR-BE-DEL-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-002/result.json
[E-SR-BE-DEL-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-002/delivery-evidence.json
[Q-SR-BE-DEL-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-003/result.json
[E-SR-BE-DEL-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-003/delivery-evidence.json
[Q-SR-BE-DEL-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-004/result.json
[E-SR-BE-DEL-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-004/delivery-evidence.json
[Q-SR-BE-DEL-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-005/result.json
[E-SR-BE-DEL-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-005/error.json
[Q-SR-BE-DEL-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-006/result.json
[E-SR-BE-DEL-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DEL-006
[Q-SR-BE-GRD-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-001/result.json
[E-SR-BE-GRD-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-001/SR-BE-GRD-001-audit-pass-positive-control.json
[E-SR-BE-GRD-001-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-001/SR-BE-GRD-001-fail.json
[Q-SR-BE-GRD-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-002/result.json
[E-SR-BE-GRD-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-002/SR-BE-GRD-002-audit-pass-positive-control.json
[E-SR-BE-GRD-002-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-002/SR-BE-GRD-002-fail.json
[Q-SR-BE-GRD-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-003/result.json
[E-SR-BE-GRD-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-003/SR-BE-GRD-003-sent-reuse-and-another-run-independent.json
[E-SR-BE-GRD-003-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-003/SR-BE-GRD-003-same-key-at-queued.json
[Q-SR-BE-GRD-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-004/result.json
[E-SR-BE-GRD-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-004/SR-BE-GRD-004-rejected-key-remains-available-then-reuses.json
[Q-SR-BE-GRD-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-005/result.json
[E-SR-BE-GRD-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-005/SR-BE-GRD-005-same-key-crash-single-instance.json
[E-SR-BE-GRD-005-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-005/SR-BE-GRD-005-same-key-crash-dual-instance.json
[Q-SR-BE-GRD-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-006/result.json
[E-SR-BE-GRD-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-006/SR-BE-GRD-006-current-audited-send-finishes-then-cancel.json
[E-SR-BE-GRD-006-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-006/SR-BE-GRD-006-current-step-cancel-capacity-and-profile.json
[Q-SR-BE-GRD-007]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-007/result.json
[E-SR-BE-GRD-007-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-007/SR-BE-GRD-007-actual-event-insert-fault-atomic-rollback-and-next-success.json
[Q-SR-BE-GRD-008]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-008/result.json
[E-SR-BE-GRD-008-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-008/SR-BE-GRD-008-stale-mixed-profile-cancel-transaction-has-no-effect.json
[E-SR-BE-GRD-008-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-GRD-008/SR-BE-GRD-008-simultaneous-CAS-with-real-lock-barrier.json
[Q-SR-BE-MUT-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-MUT-001/result.json
[E-SR-BE-MUT-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-MUT-001/delivery-evidence.json
[Q-SR-BE-MUT-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-MUT-002/result.json
[E-SR-BE-MUT-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-MUT-002/delivery-evidence.json
[Q-SR-BE-MUT-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-MUT-003/result.json
[E-SR-BE-MUT-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-MUT-003/delivery-evidence.json
[Q-SR-BE-DB-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-001/result.json
[E-SR-BE-DB-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-001/timeline-measurement-1000.json
[E-SR-BE-DB-001-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-001/timeline-measurement-10000.json
[Q-SR-BE-DB-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-002/result.json
[E-SR-BE-DB-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-002/timeline-measurement-1000.json
[E-SR-BE-DB-002-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-002/timeline-measurement-10000.json
[Q-SR-BE-DB-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-003/result.json
[E-SR-BE-DB-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-003/timeline-fixed-set.json
[Q-SR-BE-DB-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-004/result.json
[E-SR-BE-DB-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-004/timeline-confirmation.json
[Q-SR-BE-DB-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-005/result.json
[E-SR-BE-DB-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DB-005/timeline-fixed-set.json
[Q-SR-BE-DIA-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-001/result.json
[E-SR-BE-DIA-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-001/SR-BE-DIA-001-controlled-real-tick-failure-and-recovery.json
[Q-SR-BE-DIA-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-002/result.json
[E-SR-BE-DIA-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-002/SR-BE-DIA-002-controlled-real-tick-failure-and-recovery.json
[Q-SR-BE-DIA-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-003/result.json
[E-SR-BE-DIA-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-003/SR-BE-DIA-003-permissions-rotation-logout-and-disclosure.json
[Q-SR-BE-DIA-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-004/result.json
[E-SR-BE-DIA-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-004/SR-BE-DIA-004-dispatched-no-effect-unknown-restart.json
[E-SR-BE-DIA-004-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-004/SR-BE-DIA-004-dispatched-effect-unknown-restart.json
[Q-SR-BE-DIA-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-005/result.json
[E-SR-BE-DIA-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-005/SR-BE-DIA-005-controlled-real-tick-failure-and-recovery.json
[E-SR-BE-DIA-005-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-DIA-005/SR-BE-DIA-005-new-process-history-is-not-old-process-health.json
[Q-SR-BE-POL-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-001/result.json
[E-SR-BE-POL-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-001/SR-BE-POL-001-creator.json
[E-SR-BE-POL-001-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-001/SR-BE-POL-001-admin.json
[Q-SR-BE-POL-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-002/result.json
[E-SR-BE-POL-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-002/SR-BE-POL-002-identity-changes-during-actual-audit-wait.json
[Q-SR-BE-POL-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-003/result.json
[E-SR-BE-POL-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-003/SR-BE-POL-003-identity-changes-during-real-capacity-refusal.json
[Q-SR-BE-POL-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-004/result.json
[E-SR-BE-POL-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-004/SR-BE-POL-004-external-positive-control.json
[E-SR-BE-POL-004-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-004/SR-BE-POL-004-external-switch-off.json
[Q-SR-BE-POL-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-005/result.json
[E-SR-BE-POL-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-005/SR-BE-POL-005-dispatched-no-effect-unknown-restart.json
[E-SR-BE-POL-005-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-005/SR-BE-POL-005-dispatched-effect-unknown-restart.json
[Q-SR-BE-POL-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-006/result.json
[E-SR-BE-POL-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-006/SR-BE-POL-006-leave-success-owner-last.json
[E-SR-BE-POL-006-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-006/SR-BE-POL-006-leave-partial-failure.json
[Q-SR-BE-POL-007]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-007/result.json
[E-SR-BE-POL-007-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-007/backend-provider-recovery.json
[Q-SR-BE-USG-001]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-001/result.json
[E-SR-BE-USG-001-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-001
[Q-SR-BE-USG-002]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-002/result.json
[E-SR-BE-USG-002-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-002
[Q-SR-BE-USG-003]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-003/result.json
[E-SR-BE-USG-003-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-003
[Q-SR-BE-USG-004]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-004/result.json
[E-SR-BE-USG-004-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-004/error.json
[Q-SR-BE-USG-005]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-005/result.json
[E-SR-BE-USG-005-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-005
[Q-SR-BE-USG-006]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-006/result.json
[E-SR-BE-USG-006-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-006/error.json
[Q-SR-BE-USG-007]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-007/result.json
[E-SR-BE-USG-007-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-007
[Q-SR-BE-USG-008]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-008/result.json
[E-SR-BE-USG-008-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-008/error.json
[Q-SR-BE-USG-009]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-009/result.json
[E-SR-BE-USG-009-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-009
[Q-SR-BE-USG-010]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-010/result.json
[E-SR-BE-USG-010-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-010/error.json
[Q-SR-BE-USG-011]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-011/result.json
[E-SR-BE-USG-011-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-011/error.json
[Q-SR-BE-USG-012]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-012/result.json
[E-SR-BE-USG-012-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-012
[Q-SR-BE-USG-013]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-013/result.json
[E-SR-BE-USG-013-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-USG-013
[Q-SR-BE-POL-008]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-008/result.json
[E-SR-BE-POL-008-0]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-008/SR-BE-POL-008-no-cancel.json
[E-SR-BE-POL-008-1]: /Users/zcm/.codex/worktrees/qa-second-round-retest/kapibala/qa-acceptance/second-round/reports/runs/2026-10-01T22-25-01.466Z-7951d02e/cases/SR-BE-POL-008/SR-BE-POL-008-cancel-requested.json
[D-DBREPLAY]: second-round-timeline-reproduction-20261002.md#L3
[I-LEAVE]: ../apps/server/src/modules/gateway/jobs.ts#L83
