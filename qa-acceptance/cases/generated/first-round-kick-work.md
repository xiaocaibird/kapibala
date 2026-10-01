# first-round-kick-work.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="INT-KICK-WORK-001"></a>

## INT-KICK-WORK-001 · 独立work截止取消原确认GET并在原总预算保守上界内真实提交终态

- 需求：R-A5-06、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/dispatched-kick-observation-followup.spec.ts

**准备状态：script-ready；责任方：QA / 工程正式固定源交接**

1. 工程正式固定源7d53ee1（产品aea111a）已接收并独立核验原件；真实操作与独立断言已注册，产品本轮尚未执行
2. 需固定QA源与绑定独立目标/子集后执行一次有限复测；若不通过，按新人工收尾要求保留结果、清理、出报告并暂停，不修正后产品重跑
3. 旧01f 2FAIL/1PASS及其原始记录保留；二轮仅准备，不执行、不合main

**前置条件**

1. 工程正式交接7d53ee1（产品aea111a）及原件独立核验完成；执行还需独立QA源、环境和本子集指纹冻结，不继承研发PASS
2. 独立QA源与目标/子集指纹绑定、原同run真实live PID/start/单调时钟、完整未截断生命周期；专属SUT/数据库和Gateway/Agent账本
3. 新增kick-work-budget listener能力已正式披露；work与activity-budget是两个独立signal，不要求未触发的hard补事件
4. 真实容量拒绝及既有原POST504/唯一确认GET屏障，活动从零真实积累，不写active_ms、不使用缩短产品预算的fixture

**执行步骤**

1. 沿用公开建群/真实audit pass、Agent触发和容量控制，在原活动38–40秒窗口释放真实拒绝；实际首次POST须出现，不拿提前准入拒绝替代已派发
2. 真实POST已落地唯一成员效果，43–44秒放行原504；只绑定原群唯一确认GET，保持其真实响应未返回；完整HTTP请求身份与外账本关联
3. 收集distinct kick-work-budget-signal-aborted，预算及work/settlement字段和source/signalSource原样保留，检查同request在work源listener时fetchPending；原hard未触发无需补事件
4. 同GET真实source→combined abort→fetch/request rejected与reason对象匹配；保留所有其他实际来源，别名不当独立根因，不从peer-close或TimeoutError猜因果
5. 核实际未知说明、原kick意图不虚构成功/失败、真实pauseCause为kick-work-budget-exhausted；未确认结果不得派发新turn/重复审计/kick
6. 独立绑定原创建包络、同run真实终止决定、同真实PG事务BEGIN/terminal UPDATE/COMMIT returned及外层确认；求原创建下界至COMMIT上界的保守区间
7. 公开failed/wall_clock、原成员效果及audit/POST各一次、活动引用清空；终态后有限1500ms继续观察，无重放；保留全部原始样本与清理错误

**预期结果**

1. 原活动严格60000无新容差、无最低运行时长；任何已证实际活动下界超限或停止后新派发先FAIL，缺COMMIT等不抹去违约
2. 原创建到实际outer COMMIT上界≤60000是包含暂停/尾段的保守充分上界；仅上界跨线BLOCKED，不能将暂停后的提交尾差当原实际活动下界FAIL，不新增COMMIT业务SLA
3. work源kind/身份/字段独立，原hard不需要同时发生；禁止把work改名为activity-budget维持旧KB-CROSS；旧hard未命中不能转成其PASS
4. 原POST实际504、同确认GET真实pending和取消链全部命中；丢字段/跨进程/来源不明/精度跨界BLOCKED，真实违反既有安全/时间要求FAIL
5. 未知效果诚实保留原意图和唯一效果，暂停原因匹配实际work来源；不因安全暂停豁免旧强恢复FAIL，也不声明本例任意重启保证
6. 只对实际场景结论；真实成功/明确拒绝后的投影另列有界待准备，PG可能先取消投影，不要求那些场景必须出现work listener

**时序要求**

1. 38–40秒与43–44秒仅受控前置窗口；90秒诊断/120秒测试TTL/1500ms终态后观察均不是产品SLA
2. 2000ms内部配置不保证物理收尾；17s首次准入不可套给后续只读GET；原POST15s不按实现降低
3. 本轮固定交接后仅一次冻结有限执行；零自动重试，未命中保留首次记录并出报告，不修正后产品重跑

**故障注入**

1. 原run真实容量准入拒绝后释放；首次POST真实到达并落地后才保持504响应，不以未派发模拟已派发
2. 成员状态实际收敛不延迟；仅保持精确原群的确认GET响应，禁止伪造服务端tool_result/状态/时钟/SQL或取消回调

**取证**

1. 真实创建/活动/生命周期/原POST504与GET ID、原预算source及全部remote字段、真实live PID/start/clock/sourceSeq
2. 真实pause转换来源、同事务BEGIN/terminal UPDATE/COMMIT returned、公开终态/步骤及外账本；纳秒只作原始辅助记录
3. 保守creation-to-COMMIT区间与活动下界分开；旧01f报告/原raw不重签，正式新run版本/QA/目标/子集冻结与清理归属

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
  "gatewayFault": "真实POST返回504 NETWORK_TIMEOUT，effect:apply且omitEvent；成员真实效果先落地，延迟的是读取响应",
  "originalMaximumMs": 60000,
  "selectedBudgetSource": "kick-work-budget",
  "selectedSignalKind": "kick-work-budget-signal-aborted",
  "expectedPauseCause": "kick-work-budget-exhausted",
  "engineeringSettlementAllocationMs": 2000,
  "firstPostEngineeringAdmissionMs": 17000,
  "productExecutionStatus": "NOT_RUN"
}
```
