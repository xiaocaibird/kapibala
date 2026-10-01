# 后续草稿：活动预算 × 已派发 kick

状态：具体场景计划，未登记正式用例、未执行产品。它与 CAP-003 的“容量拒绝且尚未派发”是不同的风险窗口。保持原 60 秒上限、不倒填 active_ms、不盲重踢，不把已知外部成功写成失败。

1. 从公开创建的真实 run 起连续执行实际 get_recent_messages 工具及有限 Agent 响应延迟，靠已交付 activity/lifecycle 原时钟见证接近真实预算；不靠写 persisted active_ms 快进，不预设必须运行到 60 秒。
2. 返回合法 kick_user，保持 autoKickEnabled 和权限不变。必须实际命中网关 kick after-effect/before-response 屏障，并用独立成员账本确认目标已离群；记录原 run/step/tool/audit 和唯一 gateway request。只有“没有 kick”不能证明该窗口命中。
3. 在已有 kick HTTP 在途的状态下保持响应越过本 run 的剩余预算，真实观察 stop decision 和完整活动包络；实际发送/效果允许先于 deadline，不能把晚收到确认等同晚派发。若提前阶段准入拒绝导致无真实派发，本场景 BLOCKED，保留原 CAP 场景结果。
4. 释放原响应后读取公开原 run/history，核对已有成功事实不会写成 tool failed/isError，不重新审计/派发/重复踢，不出现停止后新 turn；原活动/停止决定若安全下界>60000仍 FAIL，跨线 BLOCKED。COMMIT/REST 可见时间只作单独证据，不替代实际 decision。
5. 可另做真实 504 已落地后查询成员确认的变体，遵守上游 2 秒收敛；无法确定的硬崩溃窗口仍按 D039 原强保证差异单独报告，不能推荐盲重试。

当前接入缺口：已有 tool-wait 只含 send 事件；一般 Agent 生命周期可确定决定和 turn，但并不关联 kick 子阶段请求/结果/历史的实际 attempt。独立网关证明外部派发和效果，不能单独证明何时持久判定工具失败。需要公开真实 kick execution attempt、dispatch、response/confirmation、tool result 和同 attempt history COMMIT；或等价受审只读日志。预算准入可能合法提前拒绝，因此还需可命中真实已派发边界而不改原活动时钟的准备策略。先确认这些观测，不导入产品 kick 实现拼假回调。
