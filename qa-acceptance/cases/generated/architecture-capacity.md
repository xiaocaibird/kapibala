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
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 建立可观察且可保持的容量占用；让目标 run 的 kick 完成审计后尝试准入
2. 必须获得关联目标 run/toolUseId 的 capacity_unavailable，确认与 entity lock busy 不同；同时查看网关零请求/零效果
3. 在预算内至少观察两次明确容量拒绝，检查未伪造工具错误、未新建步骤/额外审计；释放指定占用者
4. 等待目标原 run 完成，关联唯一 audit、kick 请求、实际移除和公开工具结果

**预期结果**

1. 容量拒绝期间不报成员被处理或 SEND_TIMEOUT/SEND_FAILED，不增加工具步数、不调用远端
2. 释放后同 runId/toolUseId，audit 一次、kick 一次且真实效果一次；原 run finished/final

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-002"></a>

## CAP-002 · 容量等待期间关闭 Agent 的取消边界

- 需求：ENG-ADMISSION-01、R-A5-13
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 确证目标 kick 在零远端容量拒绝后等待，保留唯一审计与步骤身份
2. PATCH agentEnabled=false 并确认；保持容量不足观察取消决定，再释放容量
3. 检查原 run 的取消终态、activeAgentRunId、后续 turn 与远端账本

**预期结果**

1. 外部取消在容量等待中仍生效，未派发的拒绝尝试不能在取消后重新成为 kick
2. run cancelled/endReason=cancelled、活动引用清空；取消后不发新 turn/新 kick，审计不重复

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-003"></a>

## CAP-003 · 持续容量拒绝计入原 60 秒活动预算

- 需求：ENG-ADMISSION-01、R-A5-05、R-A5-06
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-004"></a>

## CAP-004 · 容量等待期间关闭踢人政策再次检查

- 需求：ENG-ADMISSION-01、R-A5-07、R-A5-09
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-005"></a>

## CAP-005 · 容量等待期间群变不可写阻止迟发踢人

- 需求：ENG-ADMISSION-01、R-A1-04、R-A5-13
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 确证 kick 因容量拒绝且零远端，保留占用者
2. 用公开发送与网关 GROUP_WRITE_FORBIDDEN 产生已确认 unreachable 群快照和事件
3. 释放占用者后检查 run 取消、活动引用以及 kick 账本

**预期结果**

1. 群不可写后不派发 kick；原 run 按外部取消规则收敛 cancelled，引用清空
2. 不会将群错误冒充容量超时，不增加审计次数

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-006"></a>

## CAP-006 · 容量等待期间执行账号终态/离线/离群后重新选择

- 需求：ENG-ADMISSION-01、R-A1-04、R-A5-08
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 确证 kick 已审计并因容量拒绝等待
2. 分别在独立夹具中让原候选账号离线、终态、离群；保留替代在线 admin 或移除全部可用管理账号
3. 确认公开快照反映变更，再释放容量，检查实际 byAccountId 和错误

**预期结果**

1. 有合法替代账号时只从当前 online 群内 creator/admin 选择，绝不复用失效的候选
2. 无合格候选返回 NO_AVAILABLE_ACCOUNT；如已实际执行中转终态则按原 SEND_FAILED 场景另判，不能混淆时点
3. 零重复审计/步骤/副作用；所有变体均须有确定容量拒绝证据

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-007"></a>

## CAP-007 · 容量等待期间目标成员退出或退出后重新加入

- 需求：ENG-ADMISSION-01、R-A5-09、R-A5-11
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。此外原协议未明确未派发 kick 的目标自行退出/重入时的工具结果，须在执行前确认，不能按当前实现倒推。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 确证目标 kick 在未派发容量拒绝处等待，记录目标成员身份与事件序号
2. 分别注入目标 member_left，以及 member_left 后 member_joined；等待对应公开可见状态
3. 释放容量并按确认的目标成员语义判定工具结果、实际请求与最终成员

**预期结果**

1. 不能把新的成员状态当作已经执行 kick 的证据，不能盲目重放旧未知结果
2. 同一逻辑动作不得因重复事件而多次 kick/audit；具体目标已离群时的工具返回与重入语义需先裁定

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-008"></a>

## CAP-008 · 真实同一实体锁竞争与容量不足保持不同判定

- 需求：ENG-ADMISSION-01、R-A5-09
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。同群单活跃 run 使两条公开 Agent kick 无法直接竞争；需先说明合法可达入口及外部错误映射，禁止伪造手动 kick API。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 取得外部可验证的充足本地容量以及同一群同一目标被另一合法执行持有的证据
2. 通过确认的可达入口触发目标 kick 准入，取得 lock_busy 而非 capacity_unavailable 诊断
3. 分别释放实体持有者和容量持有者，确认两种原因的结果不混同

**预期结果**

1. 实体冲突不伪装成容量延期；容量不足不伪装成成员处理中/发送超时
2. 冲突尝试不产生额外远端副作用；具体公开工具错误沿原已确认契约，不硬绑定内部错误字符串

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-009"></a>

## CAP-009 · 容量已拒绝但 ready 持久化之前崩溃的恢复

- 需求：ENG-ADMISSION-01、R-A5-11
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。缺少拒绝后但 ready 尚未保存的可控外部边界；关联 CL-01/CG-05 强恢复限制，审计或网关屏障不能替代。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 在已确证零远端容量拒绝之后、恢复就绪状态持久化之前，用外部控制契约停住同一工具尝试
2. 记录窗口证据后 SIGKILL 被测实例；保持数据库、Agent 与网关事实，释放占用并重启
3. 追踪原 runId/toolUseId 恢复、审计与真实副作用直到终态

**预期结果**

1. 保留原 A5 任意时刻重启后正常继续完成与不重复副作用要求，不以 paused/人工恢复降低标准
2. 如窗口得到确证而原 run 永久暂停，则按明确恢复要求 FAIL；无法控制窗口则 BLOCKED
3. 有限故障点通过不表述为任意崩溃时间的数学证明

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```

<a id="CAP-010"></a>

## CAP-010 · 已派发且效果未知的 kick 不得因为后续容量压力重置重放

- 需求：ENG-ADMISSION-01、R-A5-09、R-A5-11
- 优先级：P0；方法：blocked
- 自动化入口：按下面步骤人工执行或先解决阻塞
- 阻塞：缺少经过确认、关联 runId/toolUseId 的容量/实体拒绝诊断与确定性占用释放控制；当前公开 API 和网关屏障不能证明容量拒绝。见 contracts/capacity-observation.md。本组合额外要求确定性容量压力；普通 504 和崩溃恢复仍分别执行既有 AGENT-029/REC-007，不能复用其通过来关闭本组合。

**前置条件**

1. 本阶段仅建设测试资产；未来用户明确授权并冻结 SUT/QA 版本后才可执行
2. 每用例专用 PostgreSQL、进程、网关与 Agent 桩；至少三个可连接的服务账号作为夹具前提
3. 先取得 contracts/capacity-observation.md 所列经过确认的外部准入诊断和占用/释放控制；不得仅以零请求或固定并发数推测命中

**执行步骤**

1. 让 kick 请求已到网关并出现真实未知结果/504，独立保留已落地和未落地两种合法轨迹
2. 此后建立并确证容量压力，按已确认协议开放成员收敛查询或重启恢复
3. 比较步骤身份、审计次数、远端请求/效果与最终成员；与纯零远端容量拒绝轨迹并列

**预期结果**

1. 只有确定未派发的容量拒绝可以安全延期，已发出的未知结果不能退回 ready 盲重放
2. 原强恢复要求、AGENT-029、REC-007 与 BLK-EXT-004 的边界保持，不用容量修复宣称未知效果问题已解决

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
  "observationContract": "contracts/capacity-observation.md",
  "productResults": "NOT_RUN",
  "capacityThreshold": "执行环境参数，非产品硬指标",
  "internalPollingInterval": "不作为验收要求"
}
```
