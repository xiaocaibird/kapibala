# 2716abd 剩余边界独立复测接收

固定 SUT `2716abdd2d43a779b6a0972a6323f895cf2b5b9c`，独占工作树 `/Users/zcm/.codex/worktrees/qa-sut-evidence-retest/kapibala`。QA 准备分支 `agent/qa-2716-boundaries-retest`，起始 `48fc949`，已含独立判据修正 `f6eb630`。SUT 不跟随后来 main；实际 QA 源摘要、target、授权、运行与清理逐轮归档。

依据 [固定工程交接](../../../docs/qa-final-boundaries-followup-20261001.md)、[跨 epoch 原始协议](../../../docs/qa-cross-epoch-evidence-20261001.md)和[QA 判据更正](static-closeout-contract-20261001.md)。从 e85 到本候选的产品变化主要是 send 工具原 deadline 前后检查、拒绝迟到结果和已 sent 及时返回；累计 60 秒算法和原需求未改。新增的是独立观察字段，不是产品新流程。工程 515 PASS / 9 SKIP、分钟取证管道通过及其真实超限数字只作交接，不能导入 QA PASS。

## 独立范围与执行次序

1. 正常入口现有 `developer-smoke` 六条。
2. 组合入口冒烟：AGENT-001、CAP-001、INT-ACCOUNT-001、INT-DIAG-002，另生产 Chromium UI-001。
3. send 关联：AGENT-016、AGENT-028、AGENT-030、REC-006。现有用例不保证命中数据库查询实际跨 deadline 的内部窗口，不能凭普通 504 声称独立覆盖该新分支。
4. 严格计时：AGENT-025、CAP-003、INT-ACT-001；capacity/runtime 同实例绑定，计时单 worker、零重试，完整实际下界超限保留 FAIL，跨界缺证保留 BLOCKED。
5. 控制器共享回归：INT-ACCOUNT-002、CAP-009。UI 主线与人工修复关联自动化去重主线加 UI-001、ARC-UI-015 合为 12 条 Chromium，UI-008 再补 Firefox/WebKit 两项目；见 [UI 接入说明](final-boundaries-ui-intake-20261001.md)。ARC-UI-015 同页读取恢复也独立复验。

每组按共享登记入口执行，失败或阻塞不停止其他独立组。33 个用例×项目的补充复测之后，依据持续授权再执行固定候选完整 all-business 基线，独立签发当前版本正式业务报告；不会把子集或旧版 PASS 拼成新版全量 PASS。原完整报告与 e85 首次/复测原字节保留，上线评估仍排除。正式人工 IME/FOCUS 不由浏览器自动化替代，四态有限反馈阶段已经关闭，不再要求重做样例。

## 跨 epoch 独立取证

真实 HTTP 读取按 QA 父进程单调时钟包围，校准只接受 live-bridge；退出缓存不作为校准。实际 app PID、ps 启动身份、PGID/UID、guardian/run/group/epoch 分别核对。applicationStarted 是原样 ps lstart 字符串，不解析为时限时间。强杀保持网关/Agent/数据库，确认真实 app 身份消失，不能只等待 guardian 退出。

旧创建至实际退出、新接管至真实终止各段独立算上下界；新进程 `includesUnsavedTail=false` 保留。已观察两段下界超 60000 已足以 FAIL，不被初始化缺证遮盖。退出到重新启动之前可确证没有 app 的时段独立记录；启动至接管间隙未被证明 inactive，不能整段当停机扣掉。预算上界需要将这种未知段保守计入，或如实 BLOCKED。持久 active_ms、最后收到采样通知与不可确定尾差分别保存，不补造最后实际提交或精确零丢失。

停止决定、同 attempt COMMIT、公开终态分别留证；不把迟提交等同迟决定。合法活动下界/真实派发超原上限保持 FAIL，无附加 60 秒最低时长，无舍入或容差。5 秒持续未决 SEND_TIMEOUT 保留原条件，不从故障开启、504、下一 turn 重置计时。

## 资源、授权与结果

沿用用户“从现在开始一直执行到出报告”“问题记进最终报告、不停止其他测试”的持续授权；无需再请重复批准。每次新 target/suite 指纹重新绑定，限定本候选、独占 SUT 与自有数据库/进程/浏览器/故障租约，C1/C2 与上线评估不纳入本批。

构建与原始需求校验已在固定工作树完成，记录位于 `reports/followup/20261001-2716abd-retest/build-preparation.json`；这不是产品测试结果。组合控制器各使用不同自有 0700 registry，完整版本/API/owner 核对后才布置故障；全部清理只作用于本轮资源。首次结果、后续复测、具体缺陷及仍未接通的故障分支单列，缺证不能算通过。
