# integration-runtime.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="INT-ACT-001"></a>

## INT-ACT-001 · 安全阶段重启累计活动预算、恢复归因与完整尾段真值

- 需求：R-A5-06、R-A5-11
- 优先级：P1；方法：automated
- 自动化入口：tests/system/integration-runtime.spec.ts

**准备状态：dependency-pending；责任方：工程提供真实观测与局部故障，QA接入验收**

1. QA客户端与四条操作/断言已实现，真实工程控制器尚未交付
2. 最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过
3. 新增安全阶段屏障和实际恢复状态见证是待工程接入条件，不声称纯预算已实测

**前置条件**

1. 仅取得对应产品执行授权后在冻结候选、QA版本和隔离环境运行；本次准备不执行产品
2. 真实PG、独立Gateway/Agent与QA专属进程；控制器核对实际应用归属guardian/PGID并读取资源token
3. 工程控制器未交付；缺配置/能力/真实窗口/时间真值/profile记BLOCKED，不以fake-controller替代
4. 额外activity-safe-boundary能力及真实hold-safe-activity-boundary未接入则BLOCKED；公开running不证明可安全崩溃

**执行步骤**

1. 建群开启Agent，外部消息触发不同入参的只读工具循环并记录创建区间
2. 绑定真实run，17秒后请求安全屏障；须确认响应及续跑状态已持久化、零外部在途且独立Agent均已响应，再保持屏障SIGKILL停机5秒
3. 保留DB/桩启动新SUT，以新pid重新验证绑定原run观测
4. 逐次读取公开run及真实活动状态到终态；在线/停机测量只给出活动上界，实际活动由完整epoch及未保存尾段见证判定

**预期结果**

1. 恢复同runId，最终failed/wall_clock且活跃指针清空，网关零发送
2. 活动下界>60000则证明超时FAIL；wall_clock但上界<60000则提前宣告FAIL；上界<=60000可证上限
3. 区间跨上限或缺未保存尾段真值记BLOCKED，不接受固定500ms/其他尾差容忍，不把persistedActiveMs冒充真值
4. 恢复暂停待人工/外部确认而无法自动续跑记原A5.8恢复FAIL，不能误归预算；缺实际活动见证BLOCKED；进程在线下界不能当活动下界
5. 只覆盖已证明安全阶段重启预算；在途未知结果及任意崩溃强恢复要求保留，不因本例改变预期

**时序要求**

1. 原60秒累计活动、停机不计规则不变
2. 85秒是终态诊断预算，未观察完整记BLOCKED，不是新业务SLA

**故障注入**

1. 真实安全阶段保持后SUT硬终止、5秒专属停机；不得修改时钟/补状态/清恢复标记/预置结果

**取证**

1. 旧/新实际归属、真实安全步骤持久/零在途证明、独立Agent完成账本、epoch/活动状态/终态
2. 创建/kill/start/最后running/首次terminal区间与独立Gateway账本

**清理**

1. finally仅按客户端UUID释放本轮故障租约、关闭本例WS；工程TTL独立兜底
2. 重启保留DB及外部桩；第一次业务失败与清理失败分别保留，不清理全局资源

**数据**

```json
{
  "risk": "INT-R02",
  "mode": "observe-activity",
  "downtimeMs": 5000,
  "turnDelayMs": 7000,
  "crashBoundaryMode": "hold-safe-activity-boundary",
  "boundaryRequestedAfterMs": 17000
}
```

<a id="INT-ACCOUNT-001"></a>

## INT-ACCOUNT-001 · 远端成功后的局部保存暂错在原事务恢复，新断开不被旧连接覆盖

- 需求：R-A1-03、R-A1-05、R-A1-07、R-A1-08、ENG-ACCOUNT-RECOVERY-01
- 优先级：P1；方法：automated
- 自动化入口：tests/system/integration-runtime.spec.ts

**准备状态：dependency-pending；责任方：工程提供真实观测与局部故障，QA接入验收**

1. QA客户端与四条操作/断言已实现，真实工程控制器尚未交付
2. 最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过
3. 真实后请求等待观测和原外层COMMIT边界仍需工程证明

**前置条件**

1. 仅取得对应产品执行授权后在冻结候选、QA版本和隔离环境运行；本次准备不执行产品
2. 真实PG、独立Gateway/Agent与QA专属进程；控制器核对实际应用归属guardian/PGID并读取资源token
3. 工程控制器未交付；缺配置/能力/真实窗口/时间真值/profile记BLOCKED，不以fake-controller替代
4. 需account-intent-wait能力及newer-account-intent-waiting真实因果观测

**执行步骤**

1. 选idle种子、布置局部保存暂错租约并建立认证WS
2. 公开connect，远端真实成功后让本地原事务保存失败一次并保持重试窗口
3. 核对connect外部一次、本地idle、无成功WS；发起新disconnect后必须见真实请求已到SUT且等待原事务，再复核本地/WS/Gateway
4. 等待事件及未过期屏障成立才放行原保存，确认原外层COMMIT、两请求成功、原事务/请求不变、最终disconnected并持续采样

**预期结果**

1. 原请求远端connect不重放、不另起事务盲写；新断开最终成立
2. 保存未提交前无成功状态WS；Gateway connect/disconnect各一次
3. 必须证明原局部savepoint内真实可恢复错误；提交是原外层COMMIT确认，不是RELEASE SAVEPOINT，不固定SQLSTATE或savepoint次数
4. 客户端Promise或仅HTTP接收不足以证明竞争；缺实际等待见证BLOCKED，不使用sleep推断

**时序要求**

1. 15秒为故障窗口观察预算，未触发记BLOCKED
2. 释放后1500ms负向取证不宣称无限期无迟发

**故障注入**

1. 远端成功后一次真实原事务局部保存错误；后续合法断开与保存竞争

**取证**

1. 原remote-success/局部失败/保持、新请求等待原事务、原外层COMMIT及独立请求/事务/尝试身份
2. 公开账号、WS、Gateway请求次数与最终状态

**清理**

1. finally仅按客户端UUID释放本轮故障租约、关闭本例WS；工程TTL独立兜底
2. 重启保留DB及外部桩；第一次业务失败与清理失败分别保留，不清理全局资源

**数据**

```json
{
  "risk": "INT-R04",
  "mode": "account-save-once"
}
```

<a id="INT-ACCOUNT-002"></a>

## INT-ACCOUNT-002 · 持续本地保存失败显式回滚，无虚假状态事件或远端自动重放

- 需求：R-A1-05、R-A1-07、ENG-ACCOUNT-RECOVERY-01
- 优先级：P1；方法：automated
- 自动化入口：tests/system/integration-runtime.spec.ts

**准备状态：dependency-pending；责任方：工程提供真实观测与局部故障，QA接入验收**

1. QA客户端与四条操作/断言已实现，真实工程控制器尚未交付
2. 最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过

**前置条件**

1. 仅取得对应产品执行授权后在冻结候选、QA版本和隔离环境运行；本次准备不执行产品
2. 真实PG、独立Gateway/Agent与QA专属进程；控制器核对实际应用归属guardian/PGID并读取资源token
3. 工程控制器未交付；缺配置/能力/真实窗口/时间真值/profile记BLOCKED，不以fake-controller替代

**执行步骤**

1. 选idle种子，在远端connect成功后持续注入该原事务的局部保存失败，建立WS
2. 公开connect显式错误，核对真实rollback、本地idle、没有成功WS及自动外部重放
3. 保持故障采样1500ms，释放后由QA显式新connect再disconnect
4. 继续采样最终disconnected和总connect两次，确认旧意图不复活

**预期结果**

1. 有限局部重试耗尽后真实rollback，不能假成功；错误响应符合公开结构
2. 回滚无虚假已提交状态WS；初次请求远端connect仅1次，第二次只来自QA显式新操作
3. 远端成功而本地回滚仍是跨系统差异，不写成原子提交或全面恢复满足

**时序要求**

1. 原请求和故障等待为有限诊断预算，不规定重试次数
2. 回滚后及新断开后各1500ms有限观察

**故障注入**

1. 只对本次connect原事务局部保存持续失败，不阻断读API/WS掩盖取证

**取证**

1. remote-success、保存失败、transaction-rolled-back真实关联
2. 脱敏错误及账号、WS无假成功、两次显式connect账本

**清理**

1. finally仅按客户端UUID释放本轮故障租约、关闭本例WS；工程TTL独立兜底
2. 重启保留DB及外部桩；第一次业务失败与清理失败分别保留，不清理全局资源

**数据**

```json
{
  "risk": "INT-R04",
  "mode": "account-save-persistent"
}
```

<a id="INT-DIAG-002"></a>

## INT-DIAG-002 · 真实tick失败、进行中保持与恢复诊断及错误样本脱敏

- 需求：ENG-DIAG-01
- 优先级：P1；方法：automated
- 自动化入口：tests/system/integration-runtime.spec.ts

**准备状态：dependency-pending；责任方：工程提供真实观测与局部故障，QA接入验收**

1. QA客户端与四条操作/断言已实现，真实工程控制器尚未交付
2. 最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过

**前置条件**

1. 仅取得对应产品执行授权后在冻结候选、QA版本和隔离环境运行；本次准备不执行产品
2. 真实PG、独立Gateway/Agent与QA专属进程；控制器核对实际应用归属guardian/PGID并读取资源token
3. 工程控制器未交付；缺配置/能力/真实窗口/时间真值/profile记BLOCKED，不以fake-controller替代

**执行步骤**

1. 验证实际进程能力与纯JSON pointer公开字段profile，用有限合成marker触发真实tick错误
2. 失败后在任何下一轮活动/诊断tick-start之前保持，验证真实tickBoundary，再检查failed、连续失败数和最近失败时间、错误不泄漏
3. advance进入真实下一轮并保持进行中，检查running、非负不减少持续时长、成功时间未提前改变
4. 再advance使原tick自然成功并保持后续入口，检查健康、清连续失败、保留失败时间、更新成功时间和tick计数

**预期结果**

1. 状态由真实执行路径产生，控制器不得直接覆盖诊断状态或计数
2. 错误正文marker、实际会话token/cookie及连接串/堆栈样本不泄漏
3. tick成功不等于业务完成、外部健康、容量可用或集群保证
4. module-before-next-held不得晚于活动计时/诊断running更新；不能暂停后改回failed伪造窗口

**时序要求**

1. 不发明tick周期/时限；两次进行中读取间隔150ms只便于观察

**故障注入**

1. 真实tick异常，失败后/运行中/成功后入口分阶段保持，TTL清理

**取证**

1. 真实module-failed/held/running/succeeded及attempt身份和错误marker
2. 三阶段公开诊断和时间/计数关系，秘密只记录泄漏布尔断言

**清理**

1. finally仅按客户端UUID释放本轮故障租约、关闭本例WS；工程TTL独立兜底
2. 重启保留DB及外部桩；第一次业务失败与清理失败分别保留，不清理全局资源

**数据**

```json
{
  "risk": "INT-R06",
  "mode": "module-fail-then-hold",
  "profile": "adapters.runtimeObservation.diagnostics"
}
```
