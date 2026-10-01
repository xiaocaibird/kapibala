# spec-boundaries.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="BLK-SPEC-001"></a>

## BLK-SPEC-001 · 序列在线候选过滤与已入队限流消息的账号及顺序保持

- 需求：R-B1-01、R-A2-09
- 优先级：P1；方法：automated
- 自动化入口：tests/system/spec-boundaries.spec.ts

**准备状态：script-ready；责任方：QA**

1. 已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑
2. 尚未启动或测试SUT；scripts存在不等于实际通过

**前置条件**

1. 取得正式验收或包含本ID的开发预跑执行授权
2. 仅使用QA拥有的隔离环境，至少4个可连接服务账号

**执行步骤**

1. 建含creator/admin及两个member的群，手动将admin标为rate_limited后启动单步admin序列
2. 恢复admin；将字典序较小member标为rate_limited后启动member序列
3. 恢复成员；让下一次已选择admin的序列发送收到429，观察账号进入限流
4. 在等待期间以同一admin再入队一条消息，检查队列，再等待两条都完成

**预期结果**

1. 尚未选定执行者时，角色规则作用于online候选：第一场景使用creator，第二场景使用较大ID的在线member
2. 已选定且入队的消息遇429后不跳过、不换creator；等待期间后续同账号消息为queued，无提前网关send
3. 等待结束后原clientMsgId和账号重试，原消息先于后续消息发出，各恰好一次

**时序要求**

1. 429等待由本次外部响应的3秒控制；本用例主要断言入队身份和FIFO，精确限流到期边界由既有专项覆盖

**故障注入**

1. 前两场景仅手动状态；第三场景网关429且无远端发送效果

**取证**

1. 公开账号/序列/消息API请求响应
2. 网关发送请求、clientMsgId、真实消息账本与spec001-selection-and-queued-retry.json

**清理**

1. 仅由QA fixture清理本次拥有的进程、数据库和模拟器资源，保留证据

**数据**

```json
{
  "projects": [
    "system"
  ],
  "scenarios": [
    "admin限流而creator在线",
    "字典序较小member限流而较大member在线",
    "已选admin的发送收到429后有同账号后续消息入队"
  ],
  "retryAfterSeconds": 3,
  "oracleSources": [
    "docs/original-interview-question.md:156",
    "docs/original-interview-question.md:234",
    "docs/original-interview-question.md:288"
  ],
  "resolution": "requirements/spec-boundaries-resolution.md#spec001"
}
```

<a id="BLK-SPEC-003"></a>

## BLK-SPEC-003 · 手动状态遵守CAS和已提交事件，离线目标产生明确disconnect效果

- 需求：R-A1-01、R-A1-08
- 优先级：P1；方法：automated
- 自动化入口：tests/system/spec-boundaries.spec.ts

**准备状态：script-ready；责任方：QA**

1. 已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑
2. 尚未启动或测试SUT；scripts存在不等于实际通过

**前置条件**

1. 取得本用例执行授权
2. 已登录admin，QA群存在在线服务成员，WS已认证

**执行步骤**

1. 依次执行列明合法手动状态转换，每步等WS事件并立即回读持久状态
2. 目标为disconnected/idle时检查网关disconnect与外部离线事实，尝试平台发送
3. 以过时expectedFrom提交合法表边，再提交同状态非法边
4. 记录已提交事件及短观察窗内有无失败转换的虚假事件

**预期结果**

1. 合法表边200且平台状态及对应WS from/to一致；通知到达时公开状态已经提交
2. 标disconnected/idle触发网关disconnect；平台发送409 ACCOUNT_UNAVAILABLE且不调用网关send
3. 过时前态409 CAS_CONFLICT，同状态409 ILLEGAL_TRANSITION，状态保持且无虚假转换事件
4. 不把手动online必调connect或手动rate_limited固定恢复期限作为通过条件

**时序要求**

1. 每步在事件后回读状态；拒绝转换后观察300ms，仅证明该观察窗，不声称永远无迟到事件

**故障注入**

1. 过时expectedFrom与非法同状态请求；不注入网络故障

**取证**

1. WS帧与每帧到达后的状态观察
2. API状态、网关disconnect账本及spec003-manual-state-commits.json

**清理**

1. finally关闭本用例WS；QA fixture清理自有环境并保留证据

**数据**

```json
{
  "projects": [
    "system"
  ],
  "moves": [
    "online→rate_limited→online",
    "online→disconnected→online",
    "online→idle→online"
  ],
  "oracleSources": [
    "docs/original-interview-question.md:156",
    "docs/original-interview-question.md:208-220"
  ],
  "resolution": "requirements/spec-boundaries-resolution.md#spec003"
}
```

<a id="BLK-SPEC-004"></a>

## BLK-SPEC-004 · 混合协议错误累计三次，合法工具业务错误清零连续计数

- 需求：R-A5-04、R-A5-05
- 优先级：P1；方法：automated
- 自动化入口：tests/system/spec-boundaries.spec.ts

**准备状态：script-ready；责任方：QA**

1. 已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑
2. 尚未启动或测试SUT；scripts存在不等于实际通过

**前置条件**

1. 取得本用例执行授权
2. 独立Agent模拟器按runId绑定响应脚本，不能把未消费的结束哨兵用于下一run

**执行步骤**

1. 第一run按顺序给出坏JSON、未知工具、非法工具入参，另排一个不得被请求的结束响应
2. 检查run步骤、错误形式、发给Agent的完整历史和真实turn数量
3. 第二群所有服务成员离线，先返回两次协议错误，再返回schema合法的send_message使其得到NO_AVAILABLE_ACCOUNT
4. 继续两次协议错误及合法结束，检查该run正常结束

**预期结果**

1. 第一run仅3个turn/3步，failed/protocol_errors；未知工具和非法入参以tool_use错误步保存，坏JSON为protocol_error
2. 第二run第3步是普通业务错误，不算协议错误并重置连续计数；全部6步结束为finished/final
3. 无真实发送副作用；历史中的同一tool_result在后续全量历史请求中保持一致

**时序要求**

1. 只有正常短响应，不以人工加速或缩短产品预算实现协议错误测试

**故障注入**

1. 坏JSON、未知工具、字符串/缺字段入参；合法工具执行时全部账号离线

**取证**

1. 两个run详情和逐次Agent turn完整历史
2. 无网关send账本及spec004-protocol-counter.json

**清理**

1. 释放首轮QA响应屏障，fixture只清理自有资源，保留原始历史

**数据**

```json
{
  "projects": [
    "system"
  ],
  "mixedErrors": [
    "BAD_JSON",
    "UNKNOWN_TOOL",
    "INVALID_INPUT"
  ],
  "resetSequence": [
    "BAD_JSON",
    "UNKNOWN_TOOL",
    "NO_AVAILABLE_ACCOUNT",
    "BAD_JSON",
    "INVALID_INPUT",
    "final"
  ],
  "oracleSources": [
    "docs/original-interview-question.md:258-261"
  ],
  "resolution": "requirements/spec-boundaries-resolution.md#spec004"
}
```

<a id="BLK-SPEC-005"></a>

## BLK-SPEC-005 · 第三次未知审计与关闭Agent重叠时合法终态稳定且不产生副作用

- 需求：R-A5-07、R-A5-13
- 优先级：P1；方法：automated
- 自动化入口：tests/system/spec-boundaries.spec.ts

**准备状态：script-ready；责任方：QA**

1. 已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑
2. 尚未启动或测试SUT；scripts存在不等于实际通过

**前置条件**

1. 取得本用例执行授权
2. 只通过独立Agent HTTP响应屏障控制重叠，不修改产品时钟或内部状态

**执行步骤**

1. Agent请求发送工具，前两次审计无明确结论，第三次响应在QA屏障停住
2. 确认run仍running后关闭agentEnabled并从API确认开关已生效
3. 释放第三次未知审计响应并等待终态
4. 连续四次、每次间隔250ms复查完整run、turn/audit次数和外部副作用

**预期结果**

1. 终态只允许由已实际发生条件支持的blocked/audit_blocked或cancelled/cancelled；不要求两者固定优先级
2. 只一turn/一步，审计恰3次，无下一轮请求；activeAgentRunId归空
3. 没有合法审计pass时不发send/kick；终态、步骤及请求次数在记录的观察窗内保持稳定

**时序要求**

1. 屏障顺序建立可控重叠；1秒稳定窗是QA观察范围，不是新增产品终止SLA

**故障注入**

1. 连续三次无明确审计结论，并在第三响应挂起时关闭Agent

**取证**

1. 审计屏障命中、开关提交快照、审计请求/响应时间和最终run
2. 四次带时间的稳定性样本及spec005-controlled-overlap.json

**清理**

1. finally释放第三审计及首轮屏障，fixture清理自有资源并保留记录

**数据**

```json
{
  "projects": [
    "system"
  ],
  "auditResponses": [
    "500",
    "坏JSON",
    "verdict=unknown，响应前屏障"
  ],
  "allowedTerminalPairs": [
    "blocked/audit_blocked",
    "cancelled/cancelled"
  ],
  "stabilityObservationMs": 1000,
  "oracleSources": [
    "docs/original-interview-question.md:164",
    "docs/original-interview-question.md:260",
    "docs/original-interview-question.md:266"
  ],
  "resolution": "requirements/spec-boundaries-resolution.md#spec005",
  "excludedClaim": "不声称精确同时触发、固定终态优先级或60秒预算交错覆盖"
}
```

<a id="BLK-SPEC-006"></a>

## BLK-SPEC-006 · 资料版本化输入规则、工具公开schema一致性及明确字节上限

- 需求：ADD-META-04、R-A5-12、R-A5-15
- 优先级：P1；方法：automated
- 自动化入口：tests/system/spec-boundaries.spec.ts

**准备状态：script-ready；责任方：QA**

1. 已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑
2. 尚未启动或测试SUT；scripts存在不等于实际通过

**前置条件**

1. 取得本用例执行授权
2. 验收候选仍采用D024保留的资料输入profile；若批准变更profile，先由QA更新版本依据再执行

**执行步骤**

1. 验证名称/简介trim和80/500边界、空白、null拒绝、简介清空及省略字段保留，并按D024用emoji验证UTF-16边界
2. 注入51条短消息加触发消息，请求limit=100000，检查返回最近50条及升序，公开schema不得拒绝原文明确例子
3. 分别请求0/-1/1.5，按本轮实际公开input_schema检查接受/INVALID_INPUT是否一致，保存schema快照和结果；不固定其业务归一化算法
4. 验证ASCII500原文不变、CJK501按500字截断和truncated；emoji仅记录code point/UTF-16/UTF-8观察
5. 注入超8KB的多字节消息结果及超2KB的坏响应，检查有效JSON、字节上限、截断标记、原响应前缀与摘要200字上限

**预期结果**

1. D024本轮资料profile遵守trim、UTF-16阈值、400拒绝、局部更新及简介清空；不将这些阈值写成永久需求
2. limit=100000依原文成功截为50，不能靠服务端自报schema改写原始业务oracle
3. 0/-1/1.5只验证公开schema与实际接纳行为自洽，不假称原文规定其固定下限/取整/默认值
4. 明确ASCII/CJK文本边界及8KB/2KB/200字规则满足；emoji工具计量单列观察，不计严格字符规范通过

**时序要求**

1. 无额外性能SLA；所有数据先通过公开API确认可见再触发Agent

**故障注入**

1. 资料非法输入；工具schema边界；超长多字节内容及坏JSON响应

**取证**

1. 资料API请求响应与版本化profile来源
2. 每run的公开schema、tool_result、字节计量、原响应及spec006系列证据文件
3. emoji独立OBSERVATION_ONLY记录

**清理**

1. 首轮屏障均在finally释放；停止新增触发，fixture仅清理本次拥有资源并保留证据

**数据**

```json
{
  "projects": [
    "system"
  ],
  "profile": {
    "nameMaxUtf16Units": 80,
    "descriptionMaxUtf16Units": 500,
    "trim": true,
    "clearDescription": "空字符串或trim后空白转null",
    "patchNull": "拒绝"
  },
  "profileStatus": "D024明确本轮沿用的版本化契约，不是用户永久业务限制",
  "toolLimits": [
    100000,
    0,
    -1,
    1.5
  ],
  "oracleSources": [
    "docs/decisions.md:D024",
    "docs/group-directory-profile-proposal.md:68",
    "docs/original-interview-question.md:88",
    "docs/original-interview-question.md:120",
    "docs/original-interview-question.md:164",
    "docs/original-interview-question.md:265"
  ],
  "resolution": "requirements/spec-boundaries-resolution.md#spec006",
  "unicodeToolMeasurement": "emoji的工具文本计量仅OBSERVATION_ONLY；不混入严格通过结论"
}
```
