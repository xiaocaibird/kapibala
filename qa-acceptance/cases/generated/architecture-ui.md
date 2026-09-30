# architecture-ui.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="ARC-UI-001"></a>

## ARC-UI-001 · 序列定义额外字段明确拒绝而非静默剥离

- 需求：ENG-CONTRACT-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 分别输入根对象和步骤额外字段，提交浏览器创建表单

**预期结果**

1. 可见校验错误；两种情况均零POST，不静默剥离额外字段，网关零消息

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-002"></a>

## ARC-UI-002 · 非连续或重复步号在浏览器阻止提交

- 需求：ENG-CONTRACT-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 输入0起、2起、缺号及重复步号定义

**预期结果**

1. 可见校验错误且零POST/零消息

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-003"></a>

## ARC-UI-003 · 已登记序列尺寸边界在浏览器明确拒绝

- 需求：ENG-CONTRACT-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 分别输入名称201字符、201步、文本20001字符和604801秒

**预期结果**

1. 浏览器明确拒绝且零POST；这些数值是版本回归基准而非原需求硬指标

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-004"></a>

## ARC-UI-004 · vars和stepVars非法键值不发预检或启动请求

- 需求：ENG-CONTRACT-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 依次输入非法变量键/类型/长度、0或01步骤键及分步非法值；修正后预检

**预期结果**

1. 非法时显示输入错误且零预检/启动POST；修正后仅一次预检，空串仍沿用默认值且零发送

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-005"></a>

## ARC-UI-005 · 合法序列一次保存并保留公开输入行为

- 需求：ENG-CONTRACT-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 通过浏览器保存合法定义，使用公开GET核对返回id对应记录

**预期结果**

1. 恰好一次POST，名称trim、步骤内容一致；保存不启动或发送

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-006"></a>

## ARC-UI-006 · 序列写请求503失败不自动重放

- 需求：ENG-READ-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 只拦截浏览器序列POST返回503，等待完整退避观察窗后读取公开列表

**预期结果**

1. 可见错误且草稿保留；始终一次POST，服务端无该记录、网关无消息

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-007"></a>

## ARC-UI-007 · 无后续事件或轮询时两次503后自动呈现

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 预先创建序列，独立序列GET前两次503然后恢复真实服务；记录WS业务事件

**预期结果**

1. 无需新事件/轮询/用户操作即显示真实序列；三次读取后稳定，不以其他驱动冒充重试

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-008"></a>

## ARC-UI-008 · 权限403不形成资源请求风暴

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 目标序列GET持续403，观察完整窗口

**预期结果**

1. 显示错误，始终只有一次读取

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-009"></a>

## ARC-UI-009 · 429不无视限流进行通用重试

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 目标序列GET持续429，观察完整窗口

**预期结果**

1. 显示错误，始终只有一次读取

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-010"></a>

## ARC-UI-010 · 请求校验400不自动重试

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 目标序列GET持续400 VALIDATION_ERROR

**预期结果**

1. 显示错误，始终只有一次读取

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-011"></a>

## ARC-UI-011 · 成功HTTP的非法响应格式不按502临时错误重试

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 目标GET返回200但JSON不符合公开序列数组契约

**预期结果**

1. 显示响应错误，始终只有一次读取，不产生成功显示

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-012"></a>

## ARC-UI-012 · 持续暂时失败耗尽后停止自动读取

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 目标GET持续503，记录次数并在耗尽后继续观察

**预期结果**

1. 此候选已登记基准最多四次；耗尽后持续不追加读取，错误仍可见

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-013"></a>

## ARC-UI-013 · 切页取消旧读取及后续退避

- 需求：ENG-READ-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 保持目标GET未返回，通过真实导航离页，再释放503

**预期结果**

1. 新页面正常，旧请求不产生额外重试或旧错误提示

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-014"></a>

## ARC-UI-014 · 换身份期间旧读取迟到不能覆盖新会话

- 需求：ENG-READ-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 延迟真实旧GET响应，同一文档注销、增加公开序列、登录viewer、载入新快照，再释放旧响应

**预期结果**

1. 新快照中新增项仍在，旧结果不覆盖，viewer无创建入口；不通过整页重载规避代次问题

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-015"></a>

## ARC-UI-015 · 耗尽后显式同页刷新可开始新一轮

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 持续503到耗尽并保持无事件，然后恢复服务、点击真实同页刷新入口

**预期结果**

1. 新一轮一次成功，之后稳定；若无该可见入口则BLOCKED，禁止直接调用业务reload或冒用整页重载

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-016"></a>

## ARC-UI-016 · 错误后离页取消退避期间的后续读取

- 需求：ENG-READ-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 503错误出现后在预算耗尽前点击真实导航离页

**预期结果**

1. 离页后次数不再增长；若导航过慢未建立前提则BLOCKED而不伪报取消通过

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-017"></a>

## ARC-UI-017 · 在途读取期间多个实时失效合并且不能延长失败预算

- 需求：ENG-READ-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 保持首次GET未返回，公开API创建3个新序列并记录各返回ID；等待分别携带这3个sequenceId的公开事件后，再释放持续503

**预期结果**

1. 不同新序列ID各有相关实时事件证据；任意其他事件及重复帧不计数，无法关联则BLOCKED；最大同时读取数为1，已消费失效不扩大四次版本预算，后续稳定

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```

<a id="ARC-UI-018"></a>

## ARC-UI-018 · 网络失败及其他已登记暂时HTTP错误均可自动恢复

- 需求：ENG-READ-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/architecture.spec.ts

**前置条件**

1. 另获产品执行授权；独占候选进程、PG及独立协议桩
2. UI路由和选择器已通过公开可见界面确认；未适配则BLOCKED
3. 资源恢复测试通过可见navSequences/navAccounts在同一document内导航；登录初始WS重放稳定后建立基线，观察窗不得有业务事件、连接或认证变化

**执行步骤**

1. 逐项通过可见navAccounts/navSequences同文档切页；首读注入网络失败/408/500/502/504，后续转真实服务，全程记录WS基线

**预期结果**

1. 各项无需业务事件、连接重建或认证变化自动恢复且恰好两次读取；发生整页导航或WS外部驱动则BLOCKED，不以重载重放冒充自动重试

**时序要求**

1. 负向行为持续观察3000ms（输入各变体500ms）；完整记录请求时点；不要求精确调度毫秒值
2. 最多8秒等待回退完成是QA测试预算；不改写B4断线3秒指标

**故障注入**

1. 仅浏览器公开HTTP响应拦截/延迟/网络失败；真实REST和Gateway事实取证；不导入SUT helper、不伪造DOM业务事件

**取证**

1. HTTP时间/方法/路径/请求体和响应状态，WS业务事件seq/type/payload及连接/认证变化，页面异常
2. 最终截图、URL/title/可见错误和文本摘要，公开API及网关事实
3. 无法建立无事件、退避期间离页或可见刷新入口前提时明确BLOCKED

**清理**

1. finally释放所有等待及浏览器路由；fixture清理独占服务和数据库并保存脱敏证据

**数据**

```json
{
  "source": "tests/ui/architecture.spec.ts",
  "contractSource": "docs/decisions.md:D036；docs/architecture-reviews/2026-10-01-baseline.md:33–34,52",
  "regressionProfile": "docs/architecture-quality-closeout.md:19–20；最多四次读取、250/500/1000ms退避及输入数值限额属于版本实现参数，不是原始需求硬指标",
  "observationMs": 3000,
  "recoveryTimeoutMs": 8000
}
```
