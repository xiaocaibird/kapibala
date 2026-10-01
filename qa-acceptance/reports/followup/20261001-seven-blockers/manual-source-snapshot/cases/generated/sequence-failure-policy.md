# sequence-failure-policy.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="BLK-SPEC-002"></a>

## BLK-SPEC-002 · 普通序列发送失败终止整run且重启后不发送后续步骤

- 需求：ADD-SEQ-FAIL-01、R-B1-07、R-B1-08、R-A2-12、R-A2-03、R-A2-04
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence-failure-policy.spec.ts

**准备状态：script-ready；责任方：QA**

1. QA-D6已记录用户批准的普通失败终止策略；脚本含六种同步故障位置/错误组合、两种重启检查，以及一个unknown确认后失败的组合场景
2. 仅完成准备期校验，产品仍NOT_RUN；原13项工程/夹具接入待办未随本裁定关闭

**前置条件**

1. 取得后续产品执行授权并冻结独立候选和环境
2. 用户已通过QA-D6确认普通发送失败使整条run failed、停止后续；不改变既有跳过/限流等待/群不可写规则
3. 至少三个在线群成员，后续member步骤可正常发送

**执行步骤**

1. 遍历两种错误和首/中/末步的六种组合；前序步骤真实落地，故障后的步骤使用仍合法的member角色
2. 在目标send请求已进入网关、尚未判定外部状态的request屏障，真实断开执行账号或把成员移出并将事件保留待补投
3. 释放屏障，确认网关真实返回409 ACCOUNT_OFFLINE或403 SENDER_NOT_IN_GROUP，逐次核对无后续/重复send、无错误落地
4. 等待run终态，核对failed步骤及准确消息failCode，既有成功步骤仍sent、群/账号状态不因这两种错误改变、活跃引用清空
5. 恢复网关连接/成员条件以免持续故障掩盖迟发，持续观察1500ms；中间失败场景保留DB/网关状态重启SUT再观察1500ms
6. 追加中间步504确认场景：before-response屏障下令外部发送账号离线、查询暂不可用，观测unknown期间run仍running且后续不发送；确认实际503请求后恢复查询，检查确认404、可选重发至多一次及最终failed，再恢复账号观测无续发

**预期结果**

1. run终态failed；失败步骤status=failed并关联原clientMsgId；失败消息deliveryStatus=failed、failCode为实际失败码、无伪造msgId；消息列表sentAt仍遵守原受理时间契约
2. 原要求明确的前序成功效果不重复且仍成功；同步失败及后续步骤没有实际消息，send账本仅含前序和一次失败请求；504分支单独检查同ID至多一次可选重发
3. 普通失败后不得继续派发后续，即使外部失败条件解除或SUT重启；activeSequenceRunId=null
4. 不规定后续未执行步骤的额外内部表示或预分配ID策略；只核对公开发送语义
5. SEQ-006/007/008/010继续验证既有跳过、限流等待、不可写stopped和终态跳过，QA-D6不覆盖这些规则
6. 504查询不可用时消息保持unknown、运行不提前failed或继续；恢复后按A2确认状态，再按QA-D6终止；实际failCode为NETWORK_TIMEOUT或可选重发实际返回的ACCOUNT_OFFLINE

**时序要求**

1. 所有步骤delaySeconds=0，让错误继续路径在有限观察中可执行
2. 15秒是终态取证预算而非新增业务SLA，观察不足BLOCKED；每次采样明确违约立即FAIL
3. 解除故障后及重启后各至少1500ms持续核对；不宣称证明无限期无迟发
4. 504查询不可用超过5秒仍unknown；恢复后2秒状态确定用上下界证据，跨阈值不能精确判定记BLOCKED，不延长原A2时限

**故障注入**

1. 对真实已派发send在网关request屏障处改变连接/成员事实
2. 仅中间失败的两个变体在run已failed后重启，保留外部与数据库状态
3. 中间步504/effect:none；查询503和外部离线在响应屏障设置；恢复查询后允许可选重发遇到真实离线错误

**取证**

1. 每个子场景命中屏障、状态改变、实际网关响应、请求/效果/事件账本
2. 公开run步骤、失败消息、账号/群状态和恢复后采样
3. QA-D6用户裁定来源、冻结候选/QA版本及进程边界

**清理**

1. finally释放本场景屏障并恢复临时网关连接/成员条件，清理失败不得掩盖首次断言失败
2. 只清理本轮持有资源，保留每个子场景的原始证据

**数据**

```json
{
  "errors": [
    "ACCOUNT_OFFLINE",
    "SENDER_NOT_IN_GROUP"
  ],
  "failedStepIndexes": [
    1,
    2,
    3
  ],
  "stepsPerRun": 3,
  "delaySeconds": 0,
  "restartVariants": "两种错误的中间步失败后恢复外部条件并重启",
  "decision": "requirements/sequence-failure-policy.md#qa-d6",
  "timeoutVariant": "中间步504不落地且保留前序成功，查询暂不可用；恢复后允许直接NETWORK_TIMEOUT failed，或同ID最多一次重发收到真实ACCOUNT_OFFLINE failed"
}
```
