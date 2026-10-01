# first-round-observation-followup.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="INT-KICK-OBSERVATION-001"></a>

## INT-KICK-OBSERVATION-001 · 固定新观测下原kick预算信号与唯一确认GET因果及活动边界

- 需求：R-A5-06、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/dispatched-kick-observation-followup.spec.ts

**准备状态：script-ready；责任方：QA**

1. 新候选观测字段独立接收，运行另冻源/配置/授权；旧报告原判和分母不变
2. 活动区间跨界与暂停完整性仍按原门槛，不因CROSS/CANCEL通过升级ACTIVITY

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
5. 同一原GET实际预算source listener、combined abort、fetch pending及拒绝与真实预算signal按run/tool/step/attempt/request/PID/start/domain匹配，直接pending正证或两份真实live校准严格跨界；后续终态决定独立保留，不能倒写原事件时间。
6. 收集实际终止决定与同attempt外层COMMIT、公开failed/wall_clock，三个时间各自保留；两份校准须同真实app PID/start/clockDomain、单调前进且偏移区间相容，不能用退出缓存或墙钟相减替代
7. 核原真实kick/效果/审计各一次、原工具不伪造错误、未知结果有诚实说明；保持有限1500ms终态后观察，原run不重启、不新增turn或kick，活动引用清空
8. 先固定测试期全部证据与判定；清理时若响应仍pending或run仍在运行，先停止本例自有SUT再释放屏障，清理产生的记录不得倒填产品结果

**预期结果**

1. 严格最大60000ms，无最低60秒要求；任何可信实际活动下界超限先记FAIL；只有完整连续active/terminal单epoch才把创建至实际停止决定区间用于预算判定，不能把含暂停的在线段当活动时间；跨界或缺完整性为BLOCKED，不用REST终态/COMMIT时间替代决定
2. 含recovery-paused或continuous=false时，先保留已证实际活动下界/迟派发等独立FAIL，再将本专项预算完整性记BLOCKED；knownStrongRecoveryObservation原样保留暂停。共享A5.8强恢复检查及历史FAIL不改，本例没有执行重启恢复，不能把该观察误标新预算FAIL或豁免原强恢复义务
3. 必须真实命中已派发POST504、已落地一次效果、同一次确认GET未返回跨越真实决定；未派发、成员读取归属不清、错过活动窗口或确认提前普通超时均不能充当组合覆盖
4. 不能因结果未获确认而虚构kick失败，也不能重审计或重复派发；真实效果由QA外账本确认，不把QA知道的效果作为新增远端结果保证传给SUT
5. 原GET真实budget源reason对象匹配与fetch/request拒绝证明取消来源；deadline/operation/kick-lock触发分别保留，scope别名不算独立根因；缺事实或多因不可分BLOCKED，不能凭错误名猜。
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

<a id="INT-READ-CAUSAL-001"></a>

## INT-READ-CAUSAL-001 · 真实表锁下原工具读取回滚与恢复保存因果

- 需求：R-A5-10、R-A5-16
- 优先级：P0；方法：automated
- 自动化入口：tests/system/delivery-read-causal-followup.spec.ts

**准备状态：script-ready；责任方：QA**

1. 真实PG/query/transaction原始身份已接入，独立步骤待冻结执行
2. 不继承开发样例或旧PASS，严格5秒优先FAIL，副作用与保存回滚分别取证

**前置条件**

1. 固定产品/QA/目标授权指纹，真实自有PostgreSQL和tool-wait-witness；只向QaEnvironment注册的本例数据库加锁
2. 再次核容器ID、随机owner、唯一回环端口、数据库名/角色和表OID；schema仅定位故障，不决定消息业务结果
3. 真实原工具send-wait-started已出现且未交还；目标504发送已实际派发，后续查询503且无消息事件；锁前错过窗口只BLOCKED

**执行步骤**

1. 通过公开接口登录/建群/开启Agent；独立网关504真实落地但隐去事件，持有真实响应屏障并观察原run/tool/key/clientMsgId
2. 实际send-wait-started后在本例自有数据库单独连接BEGIN并持有messages ACCESS EXCLUSIVE；释放网关504响应，持续返回503，禁止用客户端包装延迟伪造数据库超时
3. 独立连接读取pg_stat_activity、pg_locks、pg_blocking_pids，保留原SQL、backend_start、query_start、xact_start、真实等待关系和本例locker持锁；读取候选不是自动认定waitForDelivery
4. 锁仍持有时采集真实工具交还及原5秒上下界；记录相同backend/query身份在交还后仍阻塞、idle transaction、退出或复用等诊断，不伪造SUT ROLLBACK事件
5. QA自有locker执行实际ROLLBACK后恢复网关；从公开历史观察同clientMsgId真实sent，再放行同key工具；验证原run持久步骤/实际history同attempt、审计与send各一次，独立落地一次
6. 所有已观察产品违约优先FAIL；缺特定工具与PG query的唯一关联、取消/串行ROLLBACK窗口仅BLOCKED，并保留已完成恢复断言

**预期结果**

1. 真实工具等待下界>5000ms为FAIL；上界<=5000且其余条件满足才能证明上限，跨界BLOCKED；持续未决不得提前SEND_TIMEOUT
2. 读不到新事实不能写成消息发送失败；释放后原clientMsgId历史唯一且最终sent；同key重用不新增审计/发送/真实副作用，真实工具历史与原执行attempt对应
3. 服务端取消及ROLLBACK清理必须关联实际查询；单个idle连接、客户端先返回或迟到query消失都不足以证明，不将QA locker的ROLLBACK冒充产品ROLLBACK
4. 真实本轮query/PID/start/锁链、SELECT SQLSTATE、ROLLBACK returned与release匹配；真实Agent保存独立transactionAttemptId及域UPDATE/COMMIT或ROLLBACK确认。缺事实BLOCKED，不从源码填空。

**时序要求**

1. 严格产品工具等待上限5000ms，由已有原进程tool-wait见证判定；不从加锁或下一turn重设计时
2. 1500ms夹具锁获取、12000ms夹具持锁安全TTL、8000ms锁内观察、10000ms恢复采样均为QA资源预算，不新增产品SLA；超预算缺前提BLOCKED但已证明产品FAIL不被覆盖
3. 开发声明50/100ms PG切片仅作实现背景，不作为新的业务验收阈值；不伪造ROLLBACK回调尾差

**故障注入**

1. 仅在已确认归属数据库的独立连接持有真实ACCESS EXCLUSIVE表锁；不改业务行
2. 真实504效果+503确认不可用，保持原协议最多2秒副作用落地能力；无发送事件，避免提前确定结果

**取证**

1. 容器归属/端口和数据库身份、故障表OID、本例locker身份、每次实际pg_stat_activity及pg_locks/pg_blocking_pids原记录
2. 原tool-wait完整raw流、tool结果和history同attempt关联、HTTP公开消息与run步骤、独立网关/Agent请求及实际效果
3. 严格计时区间、原故障屏障、归属缺口、已得违约、QA locker实际释放与自有连接退出记录

**清理**

1. finally实际ROLLBACK本例locker，关闭两个自有PG连接；PG连接自设安全TTL兜底；不取消/终止任意产品或他人PG backend
2. 恢复本例网关、释放本例Agent/网关屏障及本例观察租约；额外清理失败留证，不覆盖已发生产品FAIL

**数据**

```json
{
  "projects": [
    "system"
  ],
  "tableFaultLocator": "public.messages",
  "lockMode": "ACCESS EXCLUSIVE",
  "toolId": "read-lock-send",
  "reuseToolId": "read-lock-reuse",
  "idempotencyKey": "read-lock-same-key",
  "requiredMaximumMs": 5000,
  "pgSampleIntervalMs": 20,
  "lockedObservationBudgetMs": 8000,
  "recoveryObservationBudgetMs": 10000,
  "fixtureLockAcquisitionMs": 1500,
  "fixtureIdleTransactionTtlMs": 12000
}
```

<a id="INT-READ-SAVE-ROLLBACK-001"></a>

## INT-READ-SAVE-ROLLBACK-001 · 真实远端消息后原Agent保存事务失败回滚

- 需求：R-A5-10、R-A5-16
- 优先级：P0；方法：automated
- 自动化入口：tests/system/delivery-read-causal-followup.spec.ts

**准备状态：script-ready；责任方：QA**

1. 真实PG/query/transaction原始身份已接入，独立步骤待冻结执行
2. 不继承开发样例或旧PASS，严格5秒优先FAIL，副作用与保存回滚分别取证

**前置条件**

1. 固定产品/QA/目标授权指纹，真实自有PostgreSQL和tool-wait-witness；DDL仅作用于QaEnvironment登记的本例专用数据库
2. 再次核容器ID、随机owner、唯一回环端口、数据库名/角色与agent_runs/agent_steps故障定位字段；结构仅定位故障，不倒推业务结果
3. 公开流程产生唯一真实run，首个模型响应屏障阻止原工具开始；只针对该run与该tool_result的history UPDATE安装P0001触发器，无预置accepted消息/key/步骤/history
4. 真实POST 200的before-response屏障中，消息已实际落地一次且原step未保存；先采集真实step/history/公开基线，窗口未命中记BLOCKED

**执行步骤**

1. 公开登录/建群/启用Agent并触发真实run；首个模型响应屏障中绑定runtime租约及实际run，安装仅拒绝本例原tool_result的history UPDATE触发器
2. 放行真实模型；真实审计pass、POST 200消息落地后在发送响应屏障记录原step/history/公开未保存基线及run/tool/step/attempt/clientMsgId/clock身份，随后放行原响应
3. 保留原严格5秒工具结果判定，再匹配原保存UPDATE、P0001及同transactionAttempt真实ROLLBACK returned；独立只读投影和公开历史验证无半提交、无COMMIT、无下一模型turn，审计/send/落地各一次
4. 固定首次故障证据，关闭旧观察lease、杀死仅本例自有SUT；移除本例trigger/function，保留全部数据库/网关/Agent状态并重启自有SUT
5. 绑定新进程lease，以实际不同attempt/clock和独立保存事务验证原step同key、同clientMsgId复用sent；新attempt真实COMMIT、持久tool_result唯一且无新增审计/send/效果
6. 放行最后模型响应屏障并观察原run完成；后续完整强恢复、所有故障时点不从这一个有限实验推导通过；保留首次FAIL/BLOCKED并完整清理

**预期结果**

1. 真实原保存UPDATE失败必须有同transactionAttempt真实ROLLBACK returned；只有called不能判回滚，读取事务与保存事务分列
2. 原step/result/history无半提交，无原COMMIT成功事实和下一turn；未保存的结果不对外显示已提交，不伪装远端发送失败
3. 原工具仍按严格5000ms独立判定；可信下界超限FAIL，跨界或缺实际事件BLOCKED；真实回滚不改变时限结论
4. 原远端审计/send/消息副作用实际各一次；保持全部外部及数据库状态重启后，同step/key/clientMsgId复用sent、新attempt/clock独立COMMIT、持久tool_result唯一、原run完成
5. 已证FAIL优先于缺因果/清理异常；故障未命中BLOCKED，无静默重跑；不能由本例有限恢复证明任意重启强保证

**时序要求**

1. 严格产品工具等待上限5000ms，由原进程tool-wait见证判定；不从故障安装、加锁或新进程重设计时
2. 1500ms夹具lock_timeout、2000ms夹具statement_timeout、8000ms故障观察、12000ms恢复与10000ms完成观察、90000ms用例总时长均QA资源预算，不新增产品SLA；超预算缺前提BLOCKED，已证FAIL不被覆盖
3. 原失败执行、新进程恢复attempt及每个真实保存事务分列，禁止跨进程相减或拼造原事务COMMIT

**故障注入**

1. 仅本例已确认归属PG中、指定真实run的原tool_result history UPDATE触发P0001；不修改业务记录
2. 固定首次失败后仅杀本例自有SUT；移除本例故障后保留DB/网关/Agent状态重启，属于一次设计场景而非重试用例

**取证**

1. 本例容器/端口/数据库/角色身份与DDL随机名、实际run限定，故障安装/移除时刻和无预置声明
2. 原真实step/history与公开基线、POST响应屏障和真实审计/send/效果账本；原生命周期、actual UPDATE/P0001/ROLLBACK returned、独立回滚后投影及公开结果
3. 重启前后真实app/attempt/clock/lease，新attempt原step/key/clientMsgId、真实保存COMMIT与持久唯一tool_result；原首轮失败和恢复证据保持分列
4. 每条本地claim、缺证/已证违约、最终有限观察与trigger/function/lease/PG连接清理记录

**清理**

1. finally复核本例数据库容器身份，仅删除本例随机trigger/function；关闭本例PG连接，不取消任意产品或他人PG backend
2. 释放本例模型/发送屏障及两轮本例观察lease；QaEnvironment停止自有SUT并回收专属DB，清理异常不覆盖已发生FAIL

**数据**

```json
{
  "projects": [
    "system"
  ],
  "toolId": "read-causal-save-fault",
  "idempotencyKey": "read-causal-same-key",
  "gatewayFault": "真实POST 200成功且effect:apply、omitEvent，响应屏障只阻断真实响应",
  "databaseFault": "public.agent_runs.history针对本例run及原tool_result的BEFORE UPDATE触发器返回P0001；function/trigger随机专属名",
  "requiredMaximumMs": 5000,
  "failureObservationBudgetMs": 8000,
  "restartRecoveryObservationBudgetMs": 12000,
  "completionObservationBudgetMs": 10000,
  "fixtureLockAcquisitionMs": 1500,
  "fixtureStatementBudgetMs": 2000,
  "testTimeoutMs": 90000
}
```
