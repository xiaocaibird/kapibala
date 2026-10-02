# 第二轮正式业务验收报告

**验收建议：FAIL。当前版本不满足无条件通过条件。**

本轮已批准的112条业务用例及原定Linux UID、有头Chromium、Firefox/WebKit补证均已完成登记。最终建议不通过：103 PASS、4 FAIL、5 BLOCKED；8条跨浏览器冒烟全部通过。4条失败对应3类既有未豁免差距：Agent硬崩溃锁恢复、未知kick原任务自动完成，以及已暂缓讨论的严格5秒边界。5条阻塞中，3条属于QA测试前提错误导致未完成有效验收，另2条分别缺少真实write失败夹具和真实模型调用许可。没有把这些阻塞算通过。所有产品执行已结束，按负责人最后指令先交付报告，不启动第五轮修复／复测。

全量基准产品 `0be8575f326f709fe674e20033843d950385043d`；QA `0be8575f326f709fe674e20033843d950385043d`。
共 112 条：通过 103，失败 4，阻塞 5，未执行 0。逐例登记率 100.0%；有明确符合性结论的比例 95.5%；总范围通过率 92.0%。阻塞被登记不等于产品已测或已通过。

产品运行与交付材料分别统计：`{"productRuntime": {"PASS": 97, "FAIL": 4, "BLOCKED": 5, "NOT_RUN": 0}, "deliveryReview": {"PASS": 6, "FAIL": 0, "BLOCKED": 0, "NOT_RUN": 0}}`。

本报告覆盖本轮已批准的业务范围；原范围的历史报告、已批准处置和暂缓事项原样保留。上线准备度未评估，真实付费提供方与真人体验不得由离线/自动化结果替代。

详细版本边界、原始结果到审定结果、修复复测、时间线和资源回收见[最终复核说明](review-notes.md)；完整新旧需求关系见[最终需求追踪](final-traceability.md)。

## 关键发现

- **SR-D-001 / S1 / OPEN_EXISTING_NO_WAIVER**：独立 Agent 在模型请求在途时硬崩溃后，遗留 owner.lock 使正常重启报 SESSION_DIRECTORY_LOCKED，必须人工处理；不满足原自动恢复要求。复现及证据：第四批 run/cases/SR-C2-012/variant-1/provider-2.log、2-strong-recovery-service-restart.json、run/cases/SR-C2-012/result.json（见对应证据归档）。
- **SR-D-002 / S1 / OPEN_EXISTING_NO_WAIVER**：已派发 kick 的真实结果未知时，原 run 在重启后安全暂停，自动完成的强恢复保证仍不成立。复现及证据：第四批 run/cases/SR-BE-DIA-004/ 与 run/cases/SR-BE-POL-005/ 下两个 dispatched-*-unknown-restart-<UUID>/variant-observation.json、逐变体original-budget-and-completion.json；POL005 facts.secondObservation.witness包含实际双实例PID/attempt/key/result。。
- **SR-QA-001 / S2 / BLOCKED_QA_PREMISE**：媒体保留期零天变体未证明下载和清理已完成，导致过早断言旧路径；本次该义务缺少有效结论。复现及证据：见 caseReviews.SR-C1-005 的归档成员及实际时间线。
- **SR-D-003 / S2 / OPEN_OWNER_DISCUSSION_DEFERRED**：严格工具状态等待实测 5000.265833 毫秒，超过原 5000 毫秒上限；不自行加容差。复现及证据：第四批 run/cases/SR-C2-019/SR-C2-019-original-five-second-wait-and-confirmed-key-reuse.json 及关联原始生命周期/外部请求账本。
- **SR-QA-002 / S2 / BLOCKED_QA_PREMISE**：用量容量造数并发32超过公开4个在途请求限制，因预期错误未能建立最大记录/字节边界。复现及证据：见caseReviews.SR-BE-USG-011，实际请求响应、wire与usage-obligations-summary均保留。
- **SR-QA-003 / S2 / BLOCKED_QA_PREMISE**：跨实体提醒脚本错误要求不存在且非必需的摘要弹层，导致后续导航与另一实体确认尚未验收。复现及证据：见caseReviews.SR-UI-025，headed批次eda667c0 trace@1056/1060和双页最终截图/日志。

## 未解决事项与责任

- **负责人：已决定第二轮后讨论**：严格5秒的硬上限及真人IME/系统焦点签字，沿原暂缓处置保留；本轮工具时钟实际超限不自动豁免。报告后结合实际误差与业务目标决定是否变更要求；未变更前原FAIL仍成立。
- **负责人／研发**：Agent owner.lock与未知kick原run暂停均是现有强恢复要求的明确差距，安全保护通过不代表自动完成通过。先阅读本报告再决定工程或需求路径；本次不启动第五轮产品修复／复测。
- **QA**：C1-005零天保留期场景前提不足，尚不能证明完整文件实际删除终态。记录脚本问题和原始FAIL，评审BLOCKED；后续授权后修正前提并独立复测。
- **QA／工程夹具**：C1-015已打开描述符的write失败未能通过当前Darwin文件标记稳定触发；打开失败与上限收紧两分支通过。需要能证明命中真实write系统调用失败的隔离夹具后才能补证，不以随机断网/手工改状态代替。
- **负责人**：C2-017真实模型调用没有本轮收费授权、安全凭据引用、模型与事前调用/费用限额。保持BLOCKED且零真实收费调用；未来若要完成该要求需单独提供边界，离线PASS不能替代。
- **独立上线评估**：本次范围不包含生产部署、真实容量SLA、长稳、备份恢复/回滚和告警上线门禁。本报告不作上线批准；上线评估另行定义并执行。
- **QA**：USG011容量测试以32并发超过公开4个在途限制，未建立10000条/16MiB/4096bytes真实边界。原FAIL留档、评审BLOCKED；需要后续授权后以契约允许的并发实际生成记录并重新验证。
- **QA**：UI025跨实体提醒只完成A确认/B保留阶段，脚本错误等待摘要弹层，后续返回与B自身确认缺证据。原FAIL留档、评审BLOCKED；后续授权后修正用例控制流程再测，不修改需求预期。

## 执行与证据

全部首次结果保留，自动重试为零。测试判定前提修正和研发修复均使用另一个版本绑定批次；未发生的窗口不计通过。下列包逐文件读取校验，内含请求、事件、实际副作用、日志、文件证据、截图/trace、逐子项结果和清理记录。

| 批次 | SUT / QA | 原始计数 | 归档 SHA256 |
|---|---|---|---|
| 2026-10-02T00-12-11.076Z-760cef1e | 0be8575f326f709fe674e20033843d950385043d / 0be8575f326f709fe674e20033843d950385043d | {'PASS': 100, 'FAIL': 6, 'BLOCKED': 6, 'NOT_RUN': 0} | a2c84729355598a07f733e4e5c77e75c6732fadf60c3b9da577361f6d61dc7fa |
| 2026-10-02T00-32-29.999Z-eda667c0 | 0be8575f326f709fe674e20033843d950385043d / 0be8575f326f709fe674e20033843d950385043d | {'PASS': 1, 'FAIL': 1, 'BLOCKED': 0, 'NOT_RUN': 110} | f77df35c99e8617e6fe5a09b586f92182c151871d7d9bebad1374df2ec9ebc7f |
| 2026-10-02T00-33-44.268Z-5fc3dbb6 | 0be8575f326f709fe674e20033843d950385043d / 0be8575f326f709fe674e20033843d950385043d | {'PASS': 4, 'FAIL': 0, 'BLOCKED': 0, 'NOT_RUN': 108} | bf827f495fc649e9bdcd7f69e8f2ff23dca2be9fda87fbaa1ab91d74e11d007b |
| 2026-10-02T00-34-28.420Z-4a0f4a5b | 0be8575f326f709fe674e20033843d950385043d / 0be8575f326f709fe674e20033843d950385043d | {'PASS': 4, 'FAIL': 0, 'BLOCKED': 0, 'NOT_RUN': 108} | f81aee2a89f20e4f94803c3c1a8a78e13a5dd172e5e3a25dc4df3d400ca593c2 |

## 历史失败与复测批次

- 2026-10-01T21-48-07.275Z-4e425702：SUT `5906d8d6b230699fec4a51302677a79c409cac46`；QA `87f5aea2519554616301f403643020b46e1d8a09`；原始 {'PASS': 52, 'FAIL': 10, 'BLOCKED': 50, 'NOT_RUN': 0}；归档 SHA256 `6d22e9aa9475e3a87d3f2f3d544a4c4ffccb280c96f7eca0d32cc5b77315a1ec`。保留首次观察，不将旧版PASS移植到当前结论。
- 2026-10-01T22-25-01.466Z-7951d02e：SUT `47423c165f74d8b8908297974f7df71bc53b470d`；QA `47423c165f74d8b8908297974f7df71bc53b470d`；原始 {'PASS': 80, 'FAIL': 4, 'BLOCKED': 28, 'NOT_RUN': 0}；归档 SHA256 `7f909435c494cc90c6d30228ae6bce1701cd300d7112593567971ed7f74aa799`。保留首次观察，不将旧版PASS移植到当前结论。
- 2026-10-01T23-12-22.471Z-739fbbec：SUT `ed50ca14ae3f4140d7f020f282b313b137920209`；QA `ed50ca14ae3f4140d7f020f282b313b137920209`；原始 {'PASS': 96, 'FAIL': 6, 'BLOCKED': 10, 'NOT_RUN': 0}；归档 SHA256 `965b6739ead7a93ee574afd47444dc5848992950f786b4694e15d297aceefcd2`。保留首次观察，不将旧版PASS移植到当前结论。

## 浏览器兼容性

- firefox / 2026-10-02T00-33-44.268Z-5fc3dbb6：SR-UI-001 PASS；SR-UI-008 PASS；SR-UI-019 PASS；SR-BE-DEL-006 PASS。仅这些流程的抽样结论。
- webkit / 2026-10-02T00-34-28.420Z-4a0f4a5b：SR-UI-001 PASS；SR-UI-008 PASS；SR-UI-019 PASS；SR-BE-DEL-006 PASS。仅这些流程的抽样结论。

兼容性独立结论：PASS；计数 {'PASS': 8, 'FAIL': 0, 'BLOCKED': 0, 'NOT_RUN': 0}。缺少目标浏览器或流程不能视为通过。

## 独立补证

- Linux UID / 2026-10-02T00-31-13.776Z-b7d07e73 / PASS / archive SHA256 75326d7736b9bcae49f9715f74cff414af00b21bade2ebf487054a3f68dc439f。仅补对应文件归属子义务；原宿主结果不改，合证前逐项核对其它义务和产品源码一致。

## 逐项结论

| 用例 | 标题 | 结果 | 当前证据批次 | 说明 |
|---|---|---|---|---|
| SR-C1-001 | 真实附件下载、文本与私有绝对路径 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-002 | 重复与双实例回放不改首次来源 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-003 | 来源缺失、拒绝跳转、URL与大小边界 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-004 | 暂时下载失败后原任务跨重启恢复 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-005 | 默认30天和可配保留阈值两侧 | BLOCKED | 2026-10-02T00-12-11.076Z-760cef1e | 原始 FAIL 保留，评审为 BLOCKED。variant-3 的清理夹具返回时任务仍 downloading、downloaded_at/local_file_path 均 null；随后源 GET 完成，API 返回刚发布的路径。测试没有先证明完整下载和真实清理已完成便断言路径为 null，现有证据不足以判定删除后残留，也不能判定该保留期变体通过。本批不修脚本、不追加复测。 |
| SR-C1-006 | 删除后旧分页游标和自身回声不复活路径 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-007 | 触发、工具读取和未完成下载的活动引用 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-008 | 引用登记与清理互斥的两个实际顺序 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-009 | 下载/发布/删除四个崩溃窗口恢复 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-010 | 真实unlink失败不留旧路径、不阻塞其他删除 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-011 | 持久目录重启、共享实例和错目录拒绝 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-012 | 旧schema拒绝启动、可重复迁移及历史回填 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-001 | 独立turn/audit四工具和合法schema协议 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-002 | 默认mock与只改AGENT_URL的显式切换 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-003 | 历史、tool_result/错误续接与run隔离 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-004 | 已完成响应和正常重启后复用 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-005 | 同run在途并发与历史分叉拒绝 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-006 | 上游错误、截断、安全拒绝和非法输出 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-007 | 未决轮和死owner.lock的安全行为与限制 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-008 | session目录私有、独占与损坏状态 | PASS | 2026-10-02T00-12-11.076Z-760cef1e | All other declared sub-obligations passed in the frozen host batch; the sole foreign UID gap passed in the separately frozen Linux supplement. This is composed cross-platform evidence, not a Darwin foreign-UID execution. |
| SR-C2-009 | 主后端权限/托管保护与同key审计发送复用 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-010 | 独立服务下真实步数与活动预算耗尽 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-011 | 审计fail/三次未知/明确pass的主后端后果 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-012 | 模型在途硬崩溃后的原强恢复义务 | FAIL | 2026-10-02T00-12-11.076Z-760cef1e | AssertionError [ERR_ASSERTION]: 原强恢复不豁免硬崩溃后必须人工清owner.lock才能继续  false !== true  |
| SR-C2-013 | 实际usage字段、缓存不计推理、未知和结果隔离 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-014 | usage真实写失败隔离与容量裁剪 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-015 | usage启用差异、默认限额、零值、年龄与关闭 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-016 | usage有限队列与响应不等待磁盘 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-017 | 最终候选真实提供方最小新增证据 | BLOCKED | 2026-10-02T00-12-11.076Z-760cef1e | PreparationBlocked: [BLOCKED] 真实提供方缺本轮有限收费授权/凭据引用/模型/调用与费用上限；不读取本机Key、不调用 |
| SR-C1-013 | 媒体通知不变新消息/提醒及页内更新 | PASS | 2026-10-02T00-32-29.999Z-eda667c0 |  |
| SR-C1-014 | 未知效果暂停中的running引用跨重启保留 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C1-015 | 文件打开/写入失败、部分文件与发布后收紧上限 | BLOCKED | 2026-10-02T00-12-11.076Z-760cef1e | PreparationBlocked: [BLOCKED] Actual QA-only OS probe shows immutable flag does not reject already-open descriptor writes; no safe deterministic product write-syscall failure fixture, no product failure inferred |
| SR-C2-018 | usage非法token/无效配置/临时文件精确清理 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-C2-019 | 后端原turn超时/严格工具5秒/跨epoch关联回归 | FAIL | 2026-10-02T00-12-11.076Z-760cef1e | AssertionError [ERR_ASSERTION]: 实际工具状态等待下界超过原始5000ms上限 |
| SR-C2-020 | 提供方目的地址、凭据header与退出资源 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-001 | 原提交未改动的成功可清理原草稿 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-002 | A提交后编辑B，旧成功保留B | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-003 | A提交后B再A，旧成功仍保留新A | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-004 | 换群后旧发送响应不清另一群输入 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-005 | 换账号或会话后旧发送响应隔离 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-006 | 失败回执保留等待期间编辑输入 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-007 | 未知发送结果不清稿或盲重发 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-008 | 新序列表单脏状态及保存中全部关闭入口 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-009 | 保存快照与保存中编辑的实际记录一致 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-010 | 建群和编辑群现有关闭保护回归 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-011 | 群变化后旧预检晚到失效 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-012 | 模板变化后旧预检晚到失效 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-013 | 变量变化后旧预检晚到失效 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-014 | 群模板变量ABA及响应乱序不能复活旧预检 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-015 | 确认摘要绑定冻结目标与最终渲染内容 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-016 | 显式选择和URL目标失效必须重选 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-017 | 首次默认选择与显式目标失效区分 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-018 | 运行时角色预检、限流顺延和排期回归 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-019 | 群详情进入运行详情返回原群 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-020 | 运行列表进入详情返回保留群筛选 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-021 | 查看所属群及来源标题高亮一致 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-022 | 直接入口和非法来源安全站内兜底 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-023 | 刷新与历史前后退保留合法来源 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-024 | 加载失败和身份变化仍可离开详情 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-025 | 来源导航和提醒确认不串实体 | BLOCKED | 2026-10-02T00-32-29.999Z-eda667c0 | 有头补证原始 FAIL 保留，评审 BLOCKED。真实同admin、排他焦点及A/B实体各自更新成立；A点击实际“刷新并查看更新”后只A清除提醒，B仍保留提醒。脚本随后错误要求额外.attention-summary弹层，而已冻结需求仅要求实体范围确认及返回不串。未继续执行A返回、B自身确认/返回，故不能由局部正确观察判整例PASS，也不足以认定产品违约。 |
| SR-UI-026 | 退出换账号或同账号重登不接受旧history | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-027 | refresh401且Workspace未挂载仍可安全离开 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-028 | login成功后me失败恢复 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-UI-029 | 导航存储写失败有界降级 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DEL-001 | 首轮签发事实与第二轮差异逐项可追踪 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DEL-002 | 既有决定、真人与上线结论不相互替代 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DEL-003 | 组合候选与授权准入不借历史结果放行 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DEL-004 | 干净副本按最终README可隔离安装迁移启动 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DEL-005 | 升级重启保留数据且不会删除其他运行目录 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DEL-006 | C3复用新候选完整登录到实际run步骤 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-001 | send_message 审计非pass绝不实际派发 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-002 | kick_user 审计非pass绝不实际派发 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-003 | 同key在未确认和已确认状态复用原消息不重审重发 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-004 | 被拒调用不占send幂等key | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-005 | 幂等竞争与崩溃恢复不重复已有副作用 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-006 | 关闭Agent在当前step结束后原子取消 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-007 | 资料与取消事务失败不留半提交 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-GRD-008 | CAS失败和旧执行者竞争不导致错误取消或额外效果 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-MUT-001 | 审计守卫错误副本确由业务断言检出 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-MUT-002 | 同key守卫错误副本由重审或重复副作用断言检出 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-MUT-003 | 单事务入口与有限静态门禁交付可复核 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DB-001 | 两档真实PG计划与API成本可复现 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DB-002 | 一个局部优化或有依据的不优化结论 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DB-003 | 首次固定分页集合与同毫秒顺序不重复不遗漏 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DB-004 | 出站确认改时间与补投不破坏旧游标 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DB-005 | 局部优化回滚和并发读取保持公开语义 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DIA-001 | 真实tick失败形成可信原因时间和关联 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DIA-002 | 真实恢复更新当前建议并保留一份最近失败 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DIA-003 | 诊断admin/viewer权限和敏感信息隔离 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-DIA-004 | 未知外部效果只建议核对不盲重发 | FAIL | 2026-10-02T00-12-11.076Z-760cef1e | 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成; 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成 |
| SR-BE-DIA-005 | 并发失败与重启诊断不串来源或泄露 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-001 | 有权审计pass也不能kick当前托管目标 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-002 | 审计等待时目标成为托管身份派发前重查 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-003 | 容量拒绝等待时目标身份变化仍零kick | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-004 | 普通外部目标原审计开关权限预算保持 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-005 | 已派发外部kick的未知结果不被新政策误重放 | FAIL | 2026-10-02T00-12-11.076Z-760cef1e | 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成; 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成 |
| SR-BE-POL-006 | leave-all仍可清托管成员且群主最后 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-007 | 保护在重启恢复和C2提议下保持同目标事实 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-001 | turn与audit真实调用记录和实际usage精确对应 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-002 | HTTP错误坏输出和超时各自记录失败不虚构零消耗 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-003 | 完成结果缓存复用不增加实际推理计数 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-004 | 并发turn/audit下记录不串身份且有界 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-005 | 写入失败或慢存储不阻塞调用且可诊断 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-006 | 关闭记录与权限清理不触及秘密或其他目录 | PASS | 2026-10-02T00-12-11.076Z-760cef1e | All other declared sub-obligations passed in the frozen host batch; the sole foreign UID gap passed in the separately frozen Linux supplement. This is composed cross-platform evidence, not a Darwin foreign-UID execution. |
| SR-BE-USG-007 | 允许字段留存不泄露prompt工具正文和key | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-008 | 正常关闭与硬崩溃后记录真实性和缓存边界 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-009 | 用量写失败诊断自身不造成递归或信息泄漏 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-010 | 正式入口与显式编程入口usage配置保持公开差异 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-011 | 记录数、UTF-8字节及年龄边界按启动与写入清理 | BLOCKED | 2026-10-02T00-12-11.076Z-760cef1e | 原始 FAIL 保留，评审 BLOCKED。公开契约最多4个在途模型请求、超量返回429；QA容量造数以32并发且一律要求200，实际收到AGENT_BUSY。variant20的64次HTTP仅36次200/28次429，variant21与22各32次HTTP仅4次200/28次429，真实上游调用数吻合；三容量边界断言均未到达。records1/2、配置与年龄子项通过不能补足容量义务。未证明容量违规，也不计容量通过；本批不修脚本或补跑。 |
| SR-BE-USG-012 | 成功HTTP真实用量与随后输出失败独立记录，非成功HTTP不取body用量 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-USG-013 | 部分用量字段独立校验，零与未知不混淆且不补算总量 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |
| SR-BE-POL-008 | 派发前托管目标明确拒绝跨真实work截止仍正确保存并保持取消优先级 | PASS | 2026-10-02T00-12-11.076Z-760cef1e |  |

完整需求→用例→原始结果见 [需求追踪](requirement-coverage.json) 和 [结构化报告](results.json)；缺陷复现与状态见 [缺陷表](defects.json)，CI 必须同时读取 [业务用例 JUnit](junit.xml)、[兼容性 JUnit](compatibility.junit.xml) 与 [执行／清理门禁 JUnit](gates.junit.xml)；独立门禁不增加业务用例数。

本报告只对本轮明确批准的 C1/C2、五项 P0、五项 P1 及受影响原功能作版本绑定判定。原128条要求保留追踪和历史，不把历史版本PASS移植为当前全量PASS。实际故障窗口、原始首次结果、人工和真实供应商边界分别保留。有限执行不证明任意故障下的全面保证。上线准备度未评估。
