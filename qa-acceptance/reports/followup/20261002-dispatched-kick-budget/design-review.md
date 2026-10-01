# 已派发 kick × 活动预算：独立设计复核

固定候选 `8e047aea842bfcec64802e4918b52b460b93c48b`。本记录仅核对现有 QA 协议和批准原文；没有执行产品、数据库或浏览器，也没有更改用例、实现或旧报告。新增用例源码完成后另做窄范围复核，以下不是测试结果。

| 风险 | 现有接口事实与最小要求 |
|---|---|
| 派发与效果 | Gateway `request` 屏障前已入账真实 HTTP 请求，不能叫“未派发”。504 路径的效果为异步任务，`before-response` 到达本身不能证明已移除。核对唯一 POST 的群、执行账号、目标、request.id，另取恰一次真实 kick effect 和目标缺席的成员快照。 |
| 2秒收敛 | 原网关504保证2秒内成员收敛。本例可先证明实际移除再释放504，保持合法外部事实；压住后续成员响应不等于外部成员还未收敛。不能通过造晚于2秒的效果扩大故障。 |
| 43–44秒命中 | 先容量拒绝累积38–40秒，再在43–44秒附近发出504，只是试验安排。若确认GET单次15秒超时，它可能在约58–59秒先关闭，未必触及60秒预算取消。不能仅凭断连判命中；实际窗口未命中应BLOCKED，合法较早wall_clock也不是新FAIL。 |
| GET归因 | 按目标群 `/groups/:id/members` + `method:GET` 配置下一屏障，在arm前保存请求ID基线，通过barrier context.id识别具体请求。确保该GET在对应POST504送出后发生，排除准备期请求与其他同群生产者。现有lifecycle没有kick-query专属attempt事件，不能假造该关联；多个合理来源时保持BLOCKED。Gateway finish只证明写完，不证明SUT已处理。 |
| GET快照 | `route()`在before-response前已读取members形成数组；释放不会重新读取。若要用其内容证明确认时点，保存请求时成员账本，不把后来变更当作这个响应。屏障未放行或请求已取消时，准备好的200不等于SUT收到200。 |
| 预算 | 使用已有完整activity与lifecycle双流，同run/group/epoch/PID/domain以及实际停止决定、同attempt COMMIT。SQL持久active_ms、QA等待时间、配置deadline、首次API终态时间都不能替代真实活动。完整下界>60000即FAIL，跨界/缺证BLOCKED，不加容差。 |
| 结论优先 | 缺观测不能让零重放/审计/已发生效果的检查提前停止。确定重踢、错误工具结果或硬时限超限优先FAIL；随后BLOCKED、清理异常不得覆盖。未知结果保全只证明安全部分，不能称强恢复正常完成。 |
| finally | 先保存判定时刻的公共状态、独立账本和租约。仍在途时可先停止本例自有SUT，再释放屏障，或依环境server→gateway关闭顺序。不要在finally把确认200发给仍运行SUT后再把新增成功倒填为测试PASS；清理后的事实单独留证。 |
| 范围 | 第二实例未启动就是该组合NOT_RUN；不能以单实例不重放覆盖双实例竞争或接管。此次也不能关闭任意未知副作用不可恢复的全部协议限制。 |

原依据：[A5](../../../../docs/original-interview-question.md)、[网关桩协议](../../../contracts/simulator.md)、[运行观测](../../../contracts/runtime-observation.md)、[容量观测](../../../contracts/capacity-observation.md)。精确文件哈希及逐项接口位置见[JSON](design-review.json)。

## 首次源码WIP窄读（待作者修正后复核）

- `real-capacity-refusal`读取capacityLease.latest，但sample未snapshot该lease：首次held快照后无法看到新增refusal，会稳定形成QA前提BLOCKED，已发作者修正。
- 确认屏障被观察时activity达到45秒，不等于GET实际开始也在45秒之后。`windowClosedBeforeTerminal`若仅基于一次采样中的running/noDecision，可能漏掉相邻采样间的先关闭后决定。必须能排除15秒普通HTTP超时，才能把关闭归因原预算；当前若缺同域真实起止包围，应保留原因BLOCKED，不能因为两个字段同时已出现便判PASS。

## 最终源码窄范围复核

**静态复核完成，未发现新的冻结阻断；不是产品通过结论。**

上述两处WIP问题均已修正：每轮主动刷新capacity lease；lifecycle实际返回同run的termination-decided之后，再同步核对同一GET独立账本尚无finish/close，才记录正向跨界证据。若两者在采样间均已发生、没有该正向样本，组合仍BLOCKED。45秒仅为实验前提，不再假定GET真实起点或内部取消原因。

最终代码仍独立累计明确FAIL、缺证和次级清理错误；完整60000ms判据、恰一次审计/POST/效果、不伪造工具失败、活动引用清空和1500ms有限后观察没有放宽。runtime只读租约先清理；仍在运行或仍有pending请求时先停止本例自有SUT，再释放audit/网关/容量屏障，清理后事实不倒填验收。

取消来源细项保持BLOCKED诊断，不据此新增必须提供abortReason的产品义务；本例第二实例、重启和任意未知恢复继续NOT_RUN。GET仍pending的证据是独立网关真实未记录finish/close，不声称观测到客户端内部abort原因。实际窗口能否命中及真实上限是否满足尚待新冻结运行。最终两文件哈希已保存于JSON；审阅者没有改源码或执行产品。

## 单调时钟补充后的末轮复核

新增Gateway的接收、准备响应、finish、close时间来自同一QA worker的`performance.now()`，只进入独立账本，不发送给产品或改变桩效果。备选跨界证明使用504释放前与终态后的两份真实live `snapshotMeasured`：同实际app PID、原样启动串、时钟域、真实前进且偏移区间交集非空；实际同attempt决定须位于两次校准间。只有真实GET接收严格早于映射决定下界、实际close严格晚于决定上界且未finish，才补足正向跨界。区间不可分仍BLOCKED，不猜abort原因。

审计唯一断言已限制在真实唯一pass进入容量拒绝后，短QA接线导致合法超时重试只记前提不足。首次实际效果的父时钟观察上界不超过2秒作为更保守的夹具证明，错过记BLOCKED，不拿它当新的产品响应SLA。以上新增行已窄审，未发现新的冻结阻断；仍未运行产品。原审阅版本哈希保留在JSON的reviewedSourceRevisions，sourceIndex更新为末轮实际文件。

末轮额外核对：next-turn唯一断言限定于确认GET唯一且未响应的真实未知窗口；若另外的成员读取已合法揭示成功，作为夹具前提BLOCKED，不把合法下一轮误记FAIL。实际停止后的派发与重复POST/效果仍单独判FAIL。此段与最终spec哈希`92737c36c27661c4a10c283a0b21114264b8dd2e92b73f664fdb59c0ee278758`一致。
