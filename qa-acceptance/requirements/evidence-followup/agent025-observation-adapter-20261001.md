# AGENT-025 单 epoch 活动观测准备

本次只修改 QA 开发树的 AGENT-025、对应案例说明及工具自测；没有运行产品，没有修改冻结执行树、旧报告或 AGENT-028。原 A5.2 的 60 秒上限和慢 turn 场景保持不变。这是后续补证入口准备，不是旧 BLOCKED 已关闭。

依据为 [原 A5](../../../docs/original-interview-question.md)、[现有运行观测契约](../../contracts/runtime-observation.md) 和已交付的 [工程 activity-witness 说明](../../../docs/qa-activity-witness-20261001.md)。使用现有 `activity-witness`、`observe-activity` 和 `all-run-steps` 关联，没有扩充公共控制器协议或猜测新字段。

1. 触发前验证能力及真实 API、版本、guardian PID 和 owner 绑定。当前协议的 arm 必须带真实 runId，因此 **创建后取得实际 runId 才订阅**，不是创建前 arm。工程交付说明要求观察器在模块 recover 前安装，从模块启动保留真实创建事务、连续时钟 epoch 及终止边界；晚订阅不得把订阅时刻当 run 创建。QA 不生成假的 creation 事件。
2. 保留 12 个每轮 8 秒、交替参数的合法只读工具计划；通过公开 API 记录原 run 身份、steps 和终态。触发前保存独立网关全部副作用及非 GET 请求基线；终态/有限观察后核对零新增 mutation、零审计，以及原有预算后不得开始新 turn 的约束。成功公开终态还必须清空群 active 引用。
3. 缺配置、控制器不可用或见证不足时仍完成上述可观察断言。明确的功能违约、完整活动下界超过 60000、真实停止决定之后仍派发新 turn，均保持 FAIL。缺少完整活动或后续 COMMIT 不能把已证明的停止后派发遮成 BLOCKED。
4. 使用已验证 owner/run 的追加事件历史，要求真实 terminal、完整单 epoch 与 `includesUnsavedTail=true`。完整活动上界不超过 60000 才能证明最大预算；跨 60000 为 BLOCKED，接受 `[59999,60000]` 的一侧证明，不要求精确单点，不增加容差。60 秒只有上限，不要求至少运行到 60 秒；原说明的提前耗尽附加判据已在[本次契约更正](static-closeout-contract-20261001.md)删除。多个所有权段或丢失起止边界不能用最近一次持久采样补齐。真实停止决定、同 attempt COMMIT 和公开终态分别取证，不以提交延迟判实际决定延迟。
5. 独立 `performance.now()` 区间只提供在线上界，不代替活动真值。公开 terminal 已出现时，上界保留在该读取完成；尚 running 时，上界覆盖后续 witness 读取完成，避免拿更早的公开读取上界误判更晚的真实活动采样。65 秒为有限诊断预算；没有明确违约时，未观察到终态仍为 BLOCKED。清理只释放本例租约，清理失败不能覆盖首个业务失败。

要关闭本项，工程仍须在实际候选和隔离联调中交付可验证的真实创建至终止绑定、连续单 epoch 与完整活动区间；能力声明及 QA 自测通过不等于这些事实已经出现。真实区间可能仍跨界而留下 BLOCKED，也可能以超过上限的完整下界形成 FAIL。本次不会承诺下一次执行一定 PASS。
