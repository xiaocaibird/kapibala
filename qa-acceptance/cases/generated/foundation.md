# foundation.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="BASE-001"></a>

## BASE-001 · 全新未迁移schema拒启

- 需求：R-A0-02
- 优先级：P1；方法：automated
- 自动化入口：tests/foundation/startup.spec.ts

**前置条件**

1. 后续产品验收已获得明确授权，候选版本及环境被冻结
2. 测试仅在QA创建的隔离资源上执行

**执行步骤**

1. 先确认相同候选命令在fixture迁移库健康；另创建本轮owned空数据库，保持命令与外部依赖不变观察启动
2. 保留健康对照、未就绪原因、进程运行状态与完整脱敏日志；不从任意非零退出推断schema拒启

**预期结果**

1. 空schema仍健康启动为FAIL；命令/环境/诊断归因不足为BLOCKED
2. 没有已批准schema拒启诊断契约时，退出只能形成拒启观察证据，原因需人工复核；不要求产品新增特定错误码
3. 本例不代替历史旧schema迁移/升级用例

**时序要求**

1. startupTimeoutMs只限定探针等待，不被当作原文未约定的拒启SLA

**故障注入**

1. 具体故障或操作见steps；无默认生产目标

**取证**

1. 当前版本/环境/授权manifest
2. 实际操作输出、公开状态与可复核证据

**清理**

1. 只清理由本次QA持有的资源，保留脱敏报告

**数据**

```json
{}
```

<a id="BASE-002"></a>

## BASE-002 · 交付声明与栈约束入口

- 需求：R-A0-06
- 优先级：P1；方法：automated
- 自动化入口：tests/foundation/startup.spec.ts

**前置条件**

1. 后续产品验收已获得明确授权，候选版本及环境被冻结
2. 测试仅在QA创建的隔离资源上执行

**执行步骤**

1. 仅发现冻结候选已跟踪的package.json和README；不硬编码apps/web等未规定布局
2. 核对TypeScript/Vite/React依赖声明；React经workspace/catalog/宽范围解析时保留版本证据缺口

**预期结果**

1. 启动说明与依赖声明存在；额外包布局不影响判断
2. React声明无法明确定位18系列时为BLOCKED待补锁文件/构建版本证据；依赖声明不等同运行事实

**时序要求**

1. 仅采用需求或已批准上线profile的时限；缺阈值为BLOCKED

**故障注入**

1. 具体故障或操作见steps；无默认生产目标

**取证**

1. 当前版本/环境/授权manifest
2. 实际操作输出、公开状态与可复核证据

**清理**

1. 只清理由本次QA持有的资源，保留脱敏报告

**数据**

```json
{}
```

<a id="API-001"></a>

## API-001 · 独立公开API结构契约

- 需求：R-A0-03、R-A0-06、R-A3-05、R-A5-14、R-B1-05
- 优先级：P1；方法：automated
- 自动化入口：tests/foundation/contracts.spec.ts

**前置条件**

1. 后续产品验收已获得明确授权，候选版本及环境被冻结
2. 测试仅在QA创建的隔离资源上执行

**执行步骤**

1. 依次调用health/login/accounts/groups/jobs/messages/sequence-runs/agent-runs
2. 校验独立JSON Schema必需字段、枚举、时间和错误结构

**预期结果**

1. 字段完整且类型正确；额外字段不影响合规
2. 原文未规定的schemaVersion具体值类型不擅自限制
3. invalid-input步骤允许保留任意原始JSON输入；不强迫错误输入为对象；时间必须是真实UTC日历时间

**时序要求**

1. 仅采用需求或已批准上线profile的时限；缺阈值为BLOCKED

**故障注入**

1. 仅缺少token触发错误响应

**取证**

1. 当前版本/环境/授权manifest
2. 实际操作输出、公开状态与可复核证据

**清理**

1. 只清理由本次QA持有的资源，保留脱敏报告

**数据**

```json
{}
```
