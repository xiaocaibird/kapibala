# architecture-capacity.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="CAP-REG-001"></a>

## CAP-REG-001 · 不同群同名目标的重叠 kick 保持各自审计、步骤和副作用唯一

- 需求：R-A5-01、R-A5-07、R-A5-08、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity.spec.ts

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提

**执行步骤**

1. 通过公开 API 建两群，各加入同名外部目标；依次触发各一条 kick 工具并停在各自 audit 响应前
2. 确认每群仅一条 audit 且没有 kick；为两个网关 kick 安排 request 屏障，然后同时释放两个 audit
3. 等待两个 kick 都到达请求屏障，保存重叠证据后立即释放；未形成重叠则 BLOCKED
4. 读取两个原 run 终态、步骤以及独立成员/副作用账本

**预期结果**

1. 各群各一条 run、同一 toolUseId 仅一步、一次合规 audit、一次合法执行账号 kick 和一次实际移除
2. 两条 run 都 finished/final，无伪造的 SEND_TIMEOUT/SEND_FAILED；同名目标的群身份不混淆
3. 该用例仅证明本轮跨群并发回归，不证明本地容量拒绝或真实同实体锁竞争

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 按步骤使用独立协议桩屏障，禁止读取业务私表或导入业务实现

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本

**清理**

1. finally 释放本例 Agent/网关屏障；fixture 仅销毁本轮专属进程、数据库和模拟器
2. 保留报告与故障证据，不清理其他运行资源

**数据**

```json
{
  "parallelGroups": 2,
  "sameExternalTargetAcrossGroups": true,
  "coverageBoundary": "仅公开请求重叠，不能关闭 CAP-001..010"
}
```

<a id="CAP-REG-002"></a>

## CAP-REG-002 · 审计等待期间关闭 autoKick 后不得继续派发

- 需求：R-A5-07、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity.spec.ts

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提

**执行步骤**

1. 启用 autoKick、准备外部目标并触发 kick，停在 audit 合法 pass 的响应前
2. PATCH autoKickEnabled=false 并 GET 确认；保存尚无 kick 的独立账本
3. 释放审计，读取原 run 与目标成员

**预期结果**

1. 同一步返回 POLICY_DENIED，run 继续至 finished/final；只有一次 audit、零 kick、零实际移除
2. 目标仍为成员，activeAgentRunId 清空；这不是容量等待中政策变更的分支证据

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 按步骤使用独立协议桩屏障，禁止读取业务私表或导入业务实现

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本

**清理**

1. finally 释放本例 Agent/网关屏障；fixture 仅销毁本轮专属进程、数据库和模拟器
2. 保留报告与故障证据，不清理其他运行资源

**数据**

```json
{}
```

<a id="CAP-REG-003"></a>

## CAP-REG-003 · 审计等待后重新检查执行账号在线状态

- 需求：R-A5-07、R-A5-08
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity.spec.ts

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提

**执行步骤**

1. 准备合法 kick 并停在 audit 响应前
2. 通过公开 CAS transition 依次将所有群服务账号从 online 改为 disconnected，GET 确认群仍 active
3. 释放 audit 并读取同一 run/toolUseId

**预期结果**

1. 只返回 NO_AVAILABLE_ACCOUNT，不选择已离线的先前候选、不发 kick
2. 一次 audit；目标仍在群且无移除副作用；run 正常接收后续 end_turn 结束

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 按步骤使用独立协议桩屏障，禁止读取业务私表或导入业务实现

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本

**清理**

1. finally 释放本例 Agent/网关屏障；fixture 仅销毁本轮专属进程、数据库和模拟器
2. 保留报告与故障证据，不清理其他运行资源

**数据**

```json
{}
```

<a id="CAP-REG-004"></a>

## CAP-REG-004 · 审计等待后成员身份和管理员角色均重新检查

- 需求：R-A5-07、R-A5-08
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity.spec.ts

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提

**执行步骤**

1. 建含 creator/admin/member 三种角色的群并停在 kick audit 响应前
2. 通过公开状态转移让 creator 离线；网关注入 admin 离群，等待公开群快照已移除该成员
3. 验证被移除 admin 账号仍 online、普通 member 也 online 且角色没变；释放 audit

**预期结果**

1. 在线但不在群的 admin 与在线普通 member 均不可踢人，原步骤 NO_AVAILABLE_ACCOUNT
2. 一次 audit、零 kick、零真实移除；目标仍在，原 run finished/final

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 按步骤使用独立协议桩屏障，禁止读取业务私表或导入业务实现

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本

**清理**

1. finally 释放本例 Agent/网关屏障；fixture 仅销毁本轮专属进程、数据库和模拟器
2. 保留报告与故障证据，不清理其他运行资源

**数据**

```json
{}
```

<a id="CAP-001"></a>

## CAP-001 · 确证容量拒绝后零远端且释放后同一步只审计/踢人一次

- 需求：ENG-ADMISSION-01、R-A5-05、R-A5-07、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 建立可观察且可保持的容量占用；让目标 run 的 kick 完成审计后尝试准入
2. 必须获得关联目标 run/toolUseId 的 capacity_unavailable，确认与 entity lock busy 不同；同时查看网关零请求/零效果
3. 至少取得一次确证容量拒绝；持续核对未伪造工具错误、未新建步骤/额外审计，再释放指定占用者；若实际发生多次尝试仍核对审计唯一，不强迫内部轮询策略
4. 等待目标原 run 完成，关联唯一 audit、kick 请求、实际移除和公开工具结果

**预期结果**

1. 容量拒绝期间不报成员被处理或 SEND_TIMEOUT/SEND_FAILED，不增加工具步数、不调用远端
2. 释放后同 runId/toolUseId，audit 一次、kick 一次且真实效果一次；原 run finished/final

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-002"></a>

## CAP-002 · 容量等待期间关闭 Agent 的取消边界

- 需求：ENG-ADMISSION-01、R-A5-13
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 确证目标 kick 在零远端容量拒绝后等待，保留唯一审计与步骤身份
2. PATCH agentEnabled=false 并确认；保持容量不足观察取消决定，再释放容量
3. 检查原 run 的取消终态、activeAgentRunId、后续 turn 与远端账本

**预期结果**

1. 外部取消在容量等待中仍生效，未派发的拒绝尝试不能在取消后重新成为 kick
2. run cancelled/endReason=cancelled、活动引用清空；取消后不发新 turn/新 kick，审计不重复

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED
2. 释放后至少1500ms持续采样稳定终态、清空活跃引用、唯一审计及零迟发效果；有限观察不证明无限期无迟发

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-003"></a>

## CAP-003 · 持续容量拒绝计入原 60 秒活动预算

- 需求：ENG-ADMISSION-01、R-A5-05、R-A5-06
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 冻结权威活动计时起点；保持目标 kick 一直被容量拒绝而非 Agent 网络超时
2. 记录每次拒绝、活动耗时、最后 running 与首次终态时间区间，持续到原活动预算耗尽
3. 到期后释放容量并确认不会迟发 kick 或继续请求 turn

**预期结果**

1. waiting 消耗原 run 的 60 秒活动预算，不随重试或 ready 恢复而归零；终态 failed/wall_clock
2. 预算耗尽前后均无远端 kick；没有审计/工具步骤膨胀
3. 测量区间跨预算边界则 BLOCKED 复核，不擅加容差或借用脚本启动时刻当业务起点

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED
2. 释放后至少1500ms持续采样稳定终态、清空活跃引用、唯一审计及零迟发效果；有限观察不证明无限期无迟发

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过
6. QA独立performance.now创建/公开终态区间与控制器活动时间交叉证据；不能用自报60000冒充精确实测

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用",
    "CAP-003需要原run活动预算决定的权威区间；采样跨60秒时仍BLOCKED，不虚构容差"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-004"></a>

## CAP-004 · 容量等待期间关闭踢人政策再次检查

- 需求：ENG-ADMISSION-01、R-A5-07、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 让已通过一次审计的目标 kick 获得明确容量拒绝
2. 公开 PATCH autoKickEnabled=false 并确认，再释放容量
3. 追踪相同 run/toolUseId 的结果和网关实际事实

**预期结果**

1. 原步骤 POLICY_DENIED，零 kick/零移除；run 可以继续结束
2. 保留已有 audit 与步骤，不因延期重复审计

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-005"></a>

## CAP-005 · 容量等待期间群变不可写阻止迟发踢人

- 需求：ENG-ADMISSION-01、R-A1-04、R-A5-13
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 确证 kick 因容量拒绝且零远端，保留占用者
2. 网关注入creator账号suspended，等待公开群状态unreachable；保持容量占用时检查取消，不需另启动一次发送来碰运气
3. 释放占用者后检查 run 取消、活动引用以及 kick 账本

**预期结果**

1. 群不可写后不派发 kick；原 run 按外部取消规则收敛 cancelled，引用清空
2. 不会将群错误冒充容量超时，不增加审计次数

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED
2. 释放后至少1500ms持续采样稳定终态、清空活跃引用、唯一审计及零迟发效果；有限观察不证明无限期无迟发

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-006"></a>

## CAP-006 · 容量等待后在线、成员与管理员资格复核

- 需求：ENG-ADMISSION-01、R-A1-04、R-A5-08
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 独立夹具分别构造两种变体；每次在真实容量拒绝后改变执行资格
2. 变体一只让admin离线，creator仍online；变体二让creator/admin都离线并移除admin，普通member仍online
3. 公开API确认新状态，再释放容量；读取原run/step、实际byAccountId与网关副作用

**预期结果**

1. 仅creator合格时由当前creator执行一次kick；无合格管理账号时NO_AVAILABLE_ACCOUNT且零kick
2. 已有审计与工具身份不重复；普通online成员不能替代admin；账号终态导致群不可写的组合由CAP-005及原终态矩阵覆盖

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-007"></a>

## CAP-007 · 容量等待中目标退出或重新加入后按同一用户身份完成移除且不重复

- 需求：ENG-ADMISSION-01、R-A5-09、R-A5-11
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 确证原kick未派发且因真实容量不足等待；分别在两次新run中注入目标退出、退出后重入并重复事件
2. 在释放容量前核对独立网关真实成员状态；外部成员无需出现在只列服务账号的DTO
3. 释放容量，读取同一run/toolUseId、传回Agent的tool_result、审计及真实成员/副作用

**预期结果**

1. 工具仍以原platform_user_id为目标，返回既定{kicked:true}且最后网关目标不在成员中
2. 同run/toolUseId仅一步、audit一次、kick和真实效果最多一次；目标本来已退出时允许无需再次远端移除
3. 不自创成员加入代次或人工业务裁定；已派发未知效果后重入是另外的恢复轨迹，不能用本例替代

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1",
  "scopeCorrection": "原QA登记误加目标离群/重入必须额外业务裁定；原工具按platform_user_id执行，本轮移除该人为门禁，保留原返回与副作用不变量"
}
```

<a id="CAP-008"></a>

## CAP-008 · 容量延期后真实网关群主或权限错误仍按原业务契约返回

- 需求：ENG-ADMISSION-01、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 在每个独立group/run中确证零远端容量拒绝，保留已有审计/步骤
2. 分别安排外部网关OWNER_LEFT和NO_PERMISSION错误，再释放容量
3. 检查同一run/toolUseId的具体工具错误、网关调用数、目标成员，以及账号/群状态

**预期结果**

1. 容量延期不能吞掉或伪造后续真实网关错误；返回原OWNER_LEFT/NO_PERMISSION
2. 每变体一次audit、一次kick请求、零实际移除；错误不直接改变本地账号/群状态
3. 本例不宣称证明内部lock_busy分支；不可达私有锁竞争不作为独立功能门禁。后续出现合法入口时由工程影响评估再纳入

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1",
  "scopeCorrection": "原CAP-008要求通过公开单活跃run制造内部同实体锁竞争并无可达入口依据；此QA附加要求撤回，重写为原文明确可达业务错误，不声称原内部场景已通过"
}
```

<a id="CAP-009"></a>

## CAP-009 · 容量已拒绝但 ready 持久化之前崩溃的恢复

- 需求：ENG-ADMISSION-01、R-A5-11
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 在已确证零远端容量拒绝之后、恢复就绪状态持久化之前，用外部控制契约停住同一工具尝试
2. 记录窗口证据后 SIGKILL 被测实例；保持数据库、Agent 与网关事实，释放占用并重启
3. 追踪原 runId/toolUseId 恢复、审计与真实副作用直到终态
4. 紧邻杀进程前核对租约held且未到期、窗口未进入ready；进程终止完成时如已过期，场景未确证记BLOCKED

**预期结果**

1. 保留原 A5 任意时刻重启后正常继续完成与不重复副作用要求，不以 paused/人工恢复降低标准
2. 如窗口得到确证而原 run 永久暂停，则按明确恢复要求 FAIL；无法控制窗口则 BLOCKED
3. 有限故障点通过不表述为任意崩溃时间的数学证明

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用",
    "工程需提供已拒绝但ready尚未持久的专属暂停屏障；普通网关/审计屏障不能替代"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```

<a id="CAP-010"></a>

## CAP-010 · 已派发且2秒内收敛的504踢人遇容量压力不退回重放

- 需求：ENG-ADMISSION-01、R-A5-09、R-A5-11
- 优先级：P0；方法：automated
- 自动化入口：tests/system/capacity-control.spec.ts

**准备状态：dependency-pending；责任方：工程提供观测/控制接入，QA绑定与验收**

1. 工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行
2. 仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md
3. 控制器自测与开发回归不能关闭QA依赖或产品结果

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 目标配置冻结 adapters.capacityControl.url/contractReference，工程控制器已按contracts/capacity-observation.md接入；先验证当前QA进程ownerToken归属，再建立真实容量占用和零远端拒绝证据；缺能力运行时BLOCKED

**执行步骤**

1. 合法kick通过审计并到达网关request屏障；这时请求已派发，不能再当零远端拒绝
2. 控制器在该专属实例建立真实容量占用；释放网关，返回504且1500ms后移除目标，不推成员事件
3. 保持容量压力直到原run按成员查询收敛完成，再释放占用；检查请求/审计/效果次数
4. 收敛采样的每次公开读取前后与终态时均核对容量租约held且未过期；压力消失记前提不足，不能PASS

**预期结果**

1. 同run/toolUseId finished/final且工具成功，只有一次audit/一次kick/一次移除
2. 已派发504不能因后续容量不足复位成安全重试；网关2秒收敛保证保持
3. 仅覆盖明确504有限收敛组合；任意未知副作用或未知效果后重入的原BLK-EXT-004/REC-007边界不因此闭合

**时序要求**

1. 屏障仅控制故障顺序；辅助轮询/等待上限不是产品 SLA，未建立所需时序则 BLOCKED

**故障注入**

1. 外部控制器必须操纵真实准入容量；禁止以返回假错误代替容量耗尽；仅本例专属进程和租约受控

**取证**

1. 公开 API 请求/响应与 runId、toolUseId
2. Agent turn/audit 原始请求与时间戳
3. 网关请求、实际效果、成员、事件及屏障完整账本
4. 控制器协议、归属校验、租约/期限、单调诊断事件及逐次请求；敏感ownerToken脱敏
5. 脚本可执行登记与工程控制器接入状态分别记录；没有接入不意味着产品验收通过

**清理**

1. finally先释放本例Agent/网关屏障，再DELETE本adapter创建的随机leaseId；创建响应丢失也按已知leaseId清理，失败保存证据，工程控制器TTL兜底释放
2. controller释放失败不得覆盖已观察到的产品FAIL；fixture仅清理本例进程、数据库、模拟器，保留全部证据

**数据**

```json
{
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求",
  "scriptReadiness": "implemented-not-product-executed",
  "integrationStatus": "pending-engineering-control-adapter",
  "pendingDependencies": [
    "独立目标控制器尚未交付/接入；不是业务需求待裁定",
    "需关联实例、runId、toolUseId的真实容量拒绝诊断与可释放占用"
  ],
  "configPath": "adapters.capacityControl",
  "controlProtocol": "qa-capacity-control/1"
}
```
