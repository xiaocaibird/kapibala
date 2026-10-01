# dispatched-kick-budget.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="INT-KICK-BUDGET-001"></a>

## INT-KICK-BUDGET-001 · 从零真实活动预算与已派发kick的504未决确认交叉

- 需求：R-A5-06、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/dispatched-kick-budget.spec.ts

**准备状态：script-ready；责任方：QA**

1. QA源60cd3dda117b9b38906902458175cd81bd42212a已单次执行，run2026-10-01T16-42-20.128Z-67fb4dd4原始FAIL/证据不改；本次仅纠正预算专项与强恢复的判定范围，工具校验后尚未对产品复跑
2. 本例通过也仅支持已实际发生的单实例交叉窗口；原已签报告及未执行快照保留，不继承开发自测或历史PASS

**前置条件**

1. 固定授权/产品/QA/目标指纹，独占数据库及单实例；capacity与runtime控制器分别证明绑定同一本例真实应用进程，不写业务数据库或活动时钟
2. 现有activity-witness及agent-lifecycle-witness具有从原run真实创建开始的完整连续单epoch证据；持久active_ms仅诊断
3. D039已批准未知效果优先安全保留；不改变原60秒最大活动预算，不以安全暂停关闭A5.8强恢复历史FAIL
4. 全新独立群和外部目标，无并发成员事件/其他成员读取生产者；若确认GET不能按真实请求ID唯一归属则BLOCKED

**执行步骤**

1. 公开登录/建群/启用Agent与踢人，真实触发一个原run；在短audit before-response屏障内绑定同run的两类runtime见证与容量控制，随后立即放行真实pass审计
2. 主动采集真实admission-refused，确认回调未进入、零外部请求及零效果；在原run活动达到38–40秒内释放容量，不长时间保持audit、不写active_ms、不重置run
3. 首次kick使用before-response屏障；核真实POST ID、真实效果唯一、外部成员实际缺席与准备504，屏障仅阻响应；在原run真实活动43–44秒窗口内放行真实HTTP504
4. 仅在首次POST已真实到达后，为该群members安装method GET屏障；按基线请求ID和屏障context.id验证唯一504后确认GET，保持真实响应未返回，并保留原请求close/finish账本
5. 持续独立读取activity/lifecycle/公开run，验证同一GET仍pending跨越真实budget决定；若轮询未直接抓住，使用504放行前和终态后的两份真实live时钟包络，将同attempt实际决定映射到QA父时钟，严格要求真实GET接收早于决定下界且真实close晚于决定上界；不可分或身份漂移仍BLOCKED
6. 收集实际终止决定与同attempt外层COMMIT、公开failed/wall_clock，三个时间各自保留；两份校准须同真实app PID/start/clockDomain、单调前进且偏移区间相容，不能用退出缓存或墙钟相减替代
7. 核原真实kick/效果/审计各一次、原工具不伪造错误、未知结果有诚实说明；保持有限1500ms终态后观察，原run不重启、不新增turn或kick，活动引用清空
8. 先固定测试期全部证据与判定；清理时若响应仍pending或run仍在运行，先停止本例自有SUT再释放屏障，清理产生的记录不得倒填产品结果

**预期结果**

1. 严格最大60000ms，无最低60秒要求；任何可信实际活动下界超限先记FAIL；只有完整连续active/terminal单epoch才把创建至实际停止决定区间用于预算判定，不能把含暂停的在线段当活动时间；跨界或缺完整性为BLOCKED，不用REST终态/COMMIT时间替代决定
2. 含recovery-paused或continuous=false时，先保留已证实际活动下界/迟派发等独立FAIL，再将本专项预算完整性记BLOCKED；knownStrongRecoveryObservation原样保留暂停。共享A5.8强恢复检查及历史FAIL不改，本例没有执行重启恢复，不能把该观察误标新预算FAIL或豁免原强恢复义务
3. 必须真实命中已派发POST504、已落地一次效果、同一次确认GET未返回跨越真实决定；未派发、成员读取归属不清、错过活动窗口或确认提前普通超时均不能充当组合覆盖
4. 不能因结果未获确认而虚构kick失败，也不能重审计或重复派发；真实效果由QA外账本确认，不把QA知道的效果作为新增远端结果保证传给SUT
5. responseClosedBeforeFinish只证明对端在QA释放前关闭；缺取消来源事件作为细项BLOCKED记录，不无根据声明abort原因，也不抹已得到的活动/无重放结论
6. 真实预算/重复请求等已证违约优先FAIL，不被未命中前提、其他缺证据或清理错误覆盖；单实例未知说明不等于任意重启强恢复已通过
7. 二实例运行中竞争、跨重启、所有未来不重放均NOT_RUN；不得由本例或开发的终态后第二实例样例推导通过

**时序要求**

1. 38–40秒和43–44秒仅构造实验前提；未命中如实BLOCKED，禁止静默重试到通过
2. 90000ms诊断、120000ms总用例/控制器安全TTL和1500ms后观察均为QA资源预算，不是产品SLA或延长原60000ms
3. 真实活动/决定由同原进程时钟的独立工程区间判定；公开终态轮询仅诊断，GET peer-close不自动证明预算取消的因果

**故障注入**

1. 原run真实容量准入拒绝后释放；首次POST真实到达并落地后才保持504响应，不以未派发模拟已派发
2. 成员状态实际收敛不延迟；仅保持精确原群的确认GET响应，禁止伪造服务端tool_result/状态/时钟/SQL或取消回调

**取证**

1. 控制器真实进程/版本/token归属、真实拒绝attempt、原run创建/连续epoch/全部raw活动与生命周期、实际decision与同attemptCOMMIT
2. 各阶段QA观察包围时间、公开run完整采样、首次POST与精确确认GET ID/实际504发送/响应准备及close/finish、独立网关真实效果与成员状态；2秒内效果观察上界证明未破坏远端收敛前提
3. Gateway真实父单调时钟接收/关闭/完成账本及clockDomain、两份原样snapshotMeasured、实际app PID/start/clock来源、offset交集与decision映射区间；这些字段仅QA账本，不发wire、不改变桩行为
4. 原Agent/audit请求、未知说明、有限后观察与清理前后分离快照；已得FAIL、场景BLOCKED、knownStrongRecoveryObservation、取消原因细项与二实例NOT_RUN分别记录

**清理**

1. 仅停止本例QaEnvironment拥有的SUT；必要时在放行仍pending响应前停止，避免清理创造确认成功
2. finally释放本例audit/POST/GET屏障及capacity/runtime租约，保留原始FAIL和全部次级取证/清理错误；不关闭共享控制器或他人资源

**数据**

```json
{
  "projects": [
    "system"
  ],
  "requiredMaximumMs": 60000,
  "capacityReleaseActivityWindowMs": [
    38000,
    40000
  ],
  "postResponseReleaseActivityWindowMs": [
    43000,
    44000
  ],
  "diagnosticBudgetMs": 90000,
  "testTimeoutMs": 120000,
  "controllerLeaseTtlMs": 120000,
  "finitePostTerminalObservationMs": 1500,
  "gatewayFault": "真实POST返回504 NETWORK_TIMEOUT，effect:apply且omitEvent；成员真实效果先落地，延迟的是读取响应"
}
```
