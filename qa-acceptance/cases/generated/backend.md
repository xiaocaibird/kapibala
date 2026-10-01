# backend.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="STATE-11"></a>

## STATE-11 · state transition idle to idle

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态idle；调用transition(expectedFrom=idle,to=idle)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为idle

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "idle",
  "to": "idle",
  "allowed": false
}
```

<a id="STATE-12"></a>

## STATE-12 · state transition idle to online

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态idle；调用transition(expectedFrom=idle,to=online)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=online且持久状态为online

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "idle",
  "to": "online",
  "allowed": true
}
```

<a id="STATE-13"></a>

## STATE-13 · state transition idle to rate_limited

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态idle；调用transition(expectedFrom=idle,to=rate_limited)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为idle

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "idle",
  "to": "rate_limited",
  "allowed": false
}
```

<a id="STATE-14"></a>

## STATE-14 · state transition idle to disconnected

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态idle；调用transition(expectedFrom=idle,to=disconnected)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为idle

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "idle",
  "to": "disconnected",
  "allowed": false
}
```

<a id="STATE-15"></a>

## STATE-15 · state transition idle to suspended

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态idle；调用transition(expectedFrom=idle,to=suspended)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=suspended且持久状态为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "idle",
  "to": "suspended",
  "allowed": true
}
```

<a id="STATE-16"></a>

## STATE-16 · state transition idle to session_expired

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态idle；调用transition(expectedFrom=idle,to=session_expired)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=session_expired且持久状态为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "idle",
  "to": "session_expired",
  "allowed": true
}
```

<a id="STATE-21"></a>

## STATE-21 · state transition online to idle

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态online；调用transition(expectedFrom=online,to=idle)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=idle且持久状态为idle

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "online",
  "to": "idle",
  "allowed": true
}
```

<a id="STATE-22"></a>

## STATE-22 · state transition online to online

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态online；调用transition(expectedFrom=online,to=online)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为online

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "online",
  "to": "online",
  "allowed": false
}
```

<a id="STATE-23"></a>

## STATE-23 · state transition online to rate_limited

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态online；调用transition(expectedFrom=online,to=rate_limited)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=rate_limited且持久状态为rate_limited

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "online",
  "to": "rate_limited",
  "allowed": true
}
```

<a id="STATE-24"></a>

## STATE-24 · state transition online to disconnected

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态online；调用transition(expectedFrom=online,to=disconnected)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=disconnected且持久状态为disconnected

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "online",
  "to": "disconnected",
  "allowed": true
}
```

<a id="STATE-25"></a>

## STATE-25 · state transition online to suspended

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态online；调用transition(expectedFrom=online,to=suspended)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=suspended且持久状态为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "online",
  "to": "suspended",
  "allowed": true
}
```

<a id="STATE-26"></a>

## STATE-26 · state transition online to session_expired

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态online；调用transition(expectedFrom=online,to=session_expired)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=session_expired且持久状态为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "online",
  "to": "session_expired",
  "allowed": true
}
```

<a id="STATE-31"></a>

## STATE-31 · state transition rate_limited to idle

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态rate_limited；调用transition(expectedFrom=rate_limited,to=idle)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为rate_limited

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "rate_limited",
  "to": "idle",
  "allowed": false
}
```

<a id="STATE-32"></a>

## STATE-32 · state transition rate_limited to online

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态rate_limited；调用transition(expectedFrom=rate_limited,to=online)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=online且持久状态为online

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "rate_limited",
  "to": "online",
  "allowed": true
}
```

<a id="STATE-33"></a>

## STATE-33 · state transition rate_limited to rate_limited

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态rate_limited；调用transition(expectedFrom=rate_limited,to=rate_limited)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为rate_limited

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "rate_limited",
  "to": "rate_limited",
  "allowed": false
}
```

<a id="STATE-34"></a>

## STATE-34 · state transition rate_limited to disconnected

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态rate_limited；调用transition(expectedFrom=rate_limited,to=disconnected)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=disconnected且持久状态为disconnected

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "rate_limited",
  "to": "disconnected",
  "allowed": true
}
```

<a id="STATE-35"></a>

## STATE-35 · state transition rate_limited to suspended

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态rate_limited；调用transition(expectedFrom=rate_limited,to=suspended)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=suspended且持久状态为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "rate_limited",
  "to": "suspended",
  "allowed": true
}
```

<a id="STATE-36"></a>

## STATE-36 · state transition rate_limited to session_expired

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态rate_limited；调用transition(expectedFrom=rate_limited,to=session_expired)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=session_expired且持久状态为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "rate_limited",
  "to": "session_expired",
  "allowed": true
}
```

<a id="STATE-41"></a>

## STATE-41 · state transition disconnected to idle

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态disconnected；调用transition(expectedFrom=disconnected,to=idle)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=idle且持久状态为idle

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "disconnected",
  "to": "idle",
  "allowed": true
}
```

<a id="STATE-42"></a>

## STATE-42 · state transition disconnected to online

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态disconnected；调用transition(expectedFrom=disconnected,to=online)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=online且持久状态为online

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "disconnected",
  "to": "online",
  "allowed": true
}
```

<a id="STATE-43"></a>

## STATE-43 · state transition disconnected to rate_limited

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态disconnected；调用transition(expectedFrom=disconnected,to=rate_limited)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为disconnected

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "disconnected",
  "to": "rate_limited",
  "allowed": false
}
```

<a id="STATE-44"></a>

## STATE-44 · state transition disconnected to disconnected

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态disconnected；调用transition(expectedFrom=disconnected,to=disconnected)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为disconnected

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "disconnected",
  "to": "disconnected",
  "allowed": false
}
```

<a id="STATE-45"></a>

## STATE-45 · state transition disconnected to suspended

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态disconnected；调用transition(expectedFrom=disconnected,to=suspended)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=suspended且持久状态为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "disconnected",
  "to": "suspended",
  "allowed": true
}
```

<a id="STATE-46"></a>

## STATE-46 · state transition disconnected to session_expired

- 需求：R-A1-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态disconnected；调用transition(expectedFrom=disconnected,to=session_expired)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回200/status=session_expired且持久状态为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "disconnected",
  "to": "session_expired",
  "allowed": true
}
```

<a id="STATE-51"></a>

## STATE-51 · state transition suspended to idle

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态suspended；调用transition(expectedFrom=suspended,to=idle)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "suspended",
  "to": "idle",
  "allowed": false
}
```

<a id="STATE-52"></a>

## STATE-52 · state transition suspended to online

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态suspended；调用transition(expectedFrom=suspended,to=online)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "suspended",
  "to": "online",
  "allowed": false
}
```

<a id="STATE-53"></a>

## STATE-53 · state transition suspended to rate_limited

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态suspended；调用transition(expectedFrom=suspended,to=rate_limited)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "suspended",
  "to": "rate_limited",
  "allowed": false
}
```

<a id="STATE-54"></a>

## STATE-54 · state transition suspended to disconnected

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态suspended；调用transition(expectedFrom=suspended,to=disconnected)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "suspended",
  "to": "disconnected",
  "allowed": false
}
```

<a id="STATE-55"></a>

## STATE-55 · state transition suspended to suspended

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态suspended；调用transition(expectedFrom=suspended,to=suspended)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "suspended",
  "to": "suspended",
  "allowed": false
}
```

<a id="STATE-56"></a>

## STATE-56 · state transition suspended to session_expired

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态suspended；调用transition(expectedFrom=suspended,to=session_expired)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为suspended

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "suspended",
  "to": "session_expired",
  "allowed": false
}
```

<a id="STATE-61"></a>

## STATE-61 · state transition session_expired to idle

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态session_expired；调用transition(expectedFrom=session_expired,to=idle)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "session_expired",
  "to": "idle",
  "allowed": false
}
```

<a id="STATE-62"></a>

## STATE-62 · state transition session_expired to online

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态session_expired；调用transition(expectedFrom=session_expired,to=online)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "session_expired",
  "to": "online",
  "allowed": false
}
```

<a id="STATE-63"></a>

## STATE-63 · state transition session_expired to rate_limited

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态session_expired；调用transition(expectedFrom=session_expired,to=rate_limited)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "session_expired",
  "to": "rate_limited",
  "allowed": false
}
```

<a id="STATE-64"></a>

## STATE-64 · state transition session_expired to disconnected

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态session_expired；调用transition(expectedFrom=session_expired,to=disconnected)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "session_expired",
  "to": "disconnected",
  "allowed": false
}
```

<a id="STATE-65"></a>

## STATE-65 · state transition session_expired to suspended

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态session_expired；调用transition(expectedFrom=session_expired,to=suspended)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "session_expired",
  "to": "suspended",
  "allowed": false
}
```

<a id="STATE-66"></a>

## STATE-66 · state transition session_expired to session_expired

- 需求：R-A1-01、R-A1-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 通过公开API准备状态session_expired；调用transition(expectedFrom=session_expired,to=session_expired)；再GET accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 返回409 ILLEGAL_TRANSITION，持久状态仍为session_expired

**时序要求**

1. 即时同步响应与随后读可见

**故障注入**

1. 无注入

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "expectedFrom": "session_expired",
  "to": "session_expired",
  "allowed": false
}
```

<a id="STATE-041"></a>

## STATE-041 · validation precedence and stale expectedFrom are explicit

- 需求：R-A1-03、R-A0-03
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 依次提交缺expectedFrom、不存在ID、非法边与过期expectedFrom
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 400 VALIDATION_ERROR；404 ACCOUNT_NOT_FOUND；先判ILLEGAL_TRANSITION，再判CAS_CONFLICT

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="STATE-042"></a>

## STATE-042 · concurrent compare-and-swap has one winner

- 需求：R-A1-03
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 对online账号同时提交expectedFrom=online的idle/disconnected两个目标
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 一个200、一个409 CAS_CONFLICT；数据库公开读状态等于获胜者

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="STATE-043"></a>

## STATE-043 · reconnect retains stable gateway identity

- 需求：R-A1-07、R-A1-08
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. connect→标记disconnected→重新connect
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 每次connect身份一致且重连返回online

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="STATE-044"></a>

## STATE-044 · repeated suspended events preserve processing and cannot reconnect

- 需求：R-A1-02、R-A1-04、R-A2-08
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 连续投递两次suspended终态事件；尝试重连；再投递一条正常消息
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 终态不可逆且成员移除；重复终态不终止事件消费；后续消息存在

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 网关重复终态事件

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "terminal": "suspended"
}
```

<a id="STATE-045"></a>

## STATE-045 · repeated session_expired events preserve processing and cannot reconnect

- 需求：R-A1-02、R-A1-04、R-A2-08
- 优先级：P0；方法：automated
- 自动化入口：tests/api/accounts.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 连续投递两次session_expired终态事件；尝试重连；再投递一条正常消息
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 终态不可逆且成员移除；重复终态不终止事件消费；后续消息存在

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 网关重复终态事件

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "terminal": "session_expired"
}
```

<a id="AUTH-001"></a>

## AUTH-001 · health, login and UTC account contract

- 需求：R-A0-04、R-A0-06
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 匿名读取health；admin登录后读取首次账号清单
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. health.ok=true且schemaVersion存在；初始账号idle、platformUserId与rateLimitedUntil均null

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AUTH-002"></a>

## AUTH-002 · protected reads reject missing and invalid credentials

- 需求：R-A0-03、R-A0-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 分别以无token、无效token读取accounts，再提交错误密码
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 受保护读取与错误密码均401 UNAUTHORIZED；错误包含非空requestId与message

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AUTH-003"></a>

## AUTH-003 · viewer cannot execute any original business write endpoint

- 需求：R-A0-05
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. admin建群后viewer逐一调用原始契约全部业务写端点
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 全部403 FORBIDDEN；群状态、成员和开关不变

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "endpoints": [
    "connect",
    "transition",
    "create-group",
    "patch-group",
    "send",
    "leave-all",
    "create-sequence",
    "start-sequence"
  ]
}
```

<a id="AUTH-004"></a>

## AUTH-004 · refresh token is cookie-only, HttpOnly and rotates

- 需求：R-B3-01、R-B3-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 读取login响应体与Set-Cookie，再使用cookie刷新
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. refresh token只在HttpOnly cookie；刷新轮换cookie；新access能读取accounts

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AUTH-005"></a>

## AUTH-005 · refresh replay revokes both new credentials immediately

- 需求：R-B3-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 保留旧cookie→刷新→重放旧cookie→尝试新access与新refresh
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 旧cookie重放401，整个会话被撤销，新access与refresh均立即401

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AUTH-006"></a>

## AUTH-006 · logout invalidates the existing access token immediately

- 需求：R-B3-03
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 登录后logout，使用同一access再次读accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. logout成功后旧access立即401 UNAUTHORIZED

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AUTH-007"></a>

## AUTH-007 · access token expires at fifteen minutes (real clock)

- 需求：R-A0-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/auth.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试

**执行步骤**

1. 登录后在真实899秒与901.5秒分别请求accounts
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 899秒仍有效，901.5秒已401；不修改应用时钟

**时序要求**

1. 真实等待899秒，再等2.5秒；总测试超时950秒

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-001"></a>

## GROUP-001 · creation validates members and online status before external effects

- 需求：R-A3-01
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 提交空成员、包含群主、未online账号三类建群请求
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 前两类400 VALIDATION_ERROR；离线422 ACCOUNT_NOT_ONLINE；外部create调用数0

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-002"></a>

## GROUP-002 · asynchronous creation materializes creator and event-confirmed roles

- 需求：R-A3-01、R-A3-02、R-A3-03、R-A3-04
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 创建含creator/admin/member的群并等待job完成
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 默认开关false；creator无joined事件也持久化；指定首成员admin；promote调用<=2

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-003"></a>

## GROUP-003 · accepted join without member_joined fails after ten seconds

- 需求：R-A3-03、R-A3-04、R-A3-05
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 配置join受理但永不真正入群；发起建群并等待失败
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 至少10秒后job failed，join:<id>/JOIN_TIMEOUT；成员未落库，promote调用0

**时序要求**

1. 入群等候边界10秒；用例40秒

**故障注入**

1. joinNeverCompletes=true

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-004"></a>

## GROUP-004 · invite readiness is respected without retry resetting the wait

- 需求：R-B2-01
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 邀请链接readyAfterMs=1500后建群
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 所有成功join在ready期后；job最终完成

**时序要求**

1. 成功join请求不得早于invite请求1500ms；不增加隐式容差

**故障注入**

1. INVITE_NOT_READY

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "readyAfterMs": 1500
}
```

<a id="GROUP-005"></a>

## GROUP-005 · expired invitation is refreshed once and joining succeeds

- 需求：R-B2-02
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 网关create完成后屏障暂停；首join注入INVITE_EXPIRED；恢复建群
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 重新申请一次邀请，总invite=2；job完成；群账号未被错误终态

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. create before-response屏障+首join410

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-006"></a>

## GROUP-006 · leave-all removes service accounts with creator strictly last

- 需求：R-B2-04
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 正常leave-all并对照网关leave顺序与两侧成员
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 每个服务账号一次leave、creator最后；job完成，群left且服务成员为空；本场景没有外部成员，因此公开members为空仍符合D042

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "membership": "仅托管服务账号，无外部成员"
}
```

<a id="GROUP-007"></a>

## GROUP-007 · failed noncreator leave preserves owner and continues remaining accounts

- 需求：R-B2-04、R-A3-05
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首个非群主leave返回500，其余leave正常；errors非空即failed不是处理完成证据，按公开job、实际leave请求和本地/网关成员一致观察后续处理
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. job failed且errors标失败账号；其余非群主继续；群主不退；失败账号两侧都保留

**时序要求**

1. 25秒仅为有限取证预算；每次观察立即检查群主保护和失败账号保留，未取得其余非群主处理及成员一致证据则BLOCKED；公开processing=false但遗漏账号为FAIL，不能把failed中间态当结束

**故障注入**

1. 非群主leave500，无副作用

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-008"></a>

## GROUP-008 · member rows wait for actual joined event before promotion

- 需求：R-A3-03、R-A3-04
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. join实际入群延迟1500ms，在join请求出现后立即观察成员与promote
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 实际joined前仅creator，无promote；随后job完成

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. join延迟

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "joinDelayMs": 1500
}
```

<a id="GROUP-009"></a>

## GROUP-009 · ALREADY_MEMBER confirms existing membership without waiting for another event

- 需求：R-B2-03
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 切断SSE传输，在create响应屏障内真实发布目标member_joined且保留历史，建立已宣布的既有成员事实；不给SUT递送该事件，放行create后允许join
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 收到ALREADY_MEMBER后直接完成promote，无二次join/等待事件

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 成员已真实入群且已产生历史joined；SSE传输暂不可用，ALREADY_MEMBER不新增joined；finally恢复SSE并定向释放屏障

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="GROUP-010"></a>

## GROUP-010 · leave-all preserves public external members and keeps left groups inactive

- 需求：R-B2-04、ADD-LEFT-MEMBERS-01
- 优先级：P1；方法：automated
- 自动化入口：tests/api/groups.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 创建含群主、管理员、普通成员的群并加入两名外部用户，等待公开成员已包含外部身份
2. 启动尚未到期的序列；开启Agent并用外部消息触发，将当前只读turn响应停在屏障
3. leave-all完成后释放当前turn响应，读取详情、目录、序列和Agent运行，并对照网关真实成员及请求账本
4. 在服务重启前和重启后各尝试手动发送及启动新序列，并投递外部消息；逐样本断言不可写、自动化不恢复、外部成员仍保留

**预期结果**

1. 托管服务账号全部退出，每个一次且群主最后；不kick外部成员，外部platformUserId在网关、公开详情和列表精确一致且不重复
2. 群保持left、托管成员投影为空；托管身份必须映射自身accountId，外部成员不可冒用托管accountId
3. 正在运行的Agent/序列结束且active指针清空；不要求D042未明确的新状态名或endReason，但没有后续turn、发送或新run
4. left后新发送与新序列得到带错误结构的4xx，网关无发送或踢人副作用；重启及后续外部消息不恢复自动化

**时序要求**

1. 序列排期3600秒以确保准备阶段尚未到期；此值仅为用例数据
2. 15秒是终止观察预算，未完整观察记BLOCKED而非自创产品SLA；重启前后各1500ms负向采样保留有限实验边界
3. Agent响应屏障须在10秒最短turn超时之前释放；若联调环境造成保持超过9秒，记前提不足，不把超时误判为停止规则失败

**故障注入**

1. 当前Agent只读turn响应屏障；SUT重启保留数据库、Gateway及Agent桩状态

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）
4. left-members-and-automation-terminal、left-remains-inactive-before-restart、left-remains-inactive-after-restart

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "decision": "requirements/left-members-decision.md#d042",
  "externalPlatformUserIds": [
    "external-stays-1",
    "external-stays-2"
  ],
  "sequenceDelaySeconds": 3600
}
```

<a id="MSG-001"></a>

## MSG-001 · accepted is observable until message_sent and own echo stays one row

- 需求：R-A2-01、R-A2-02、R-A2-06
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 延迟message_sent1500ms并重复投递；发送一条消息
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 事件前accepted，事件后sent；回流isOwn；单clientMsgId仅一行且等于网关msgId/sentAt

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "sendDelayMs": 1500,
  "eventDuplicates": 2
}
```

<a id="MSG-002"></a>

## MSG-002 · rate limiting blocks all account sends until deadline and preserves FIFO

- 需求：R-A2-09、R-A1-06
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首send限流2秒；在rate_limited期间顺序提交另外两条
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 三条保持queued；期限内无send；到期online且按原顺序落地

**时序要求**

1. retryAfter=2秒，请求账本验证截止前无send

**故障注入**

1. 429 RATE_LIMITED

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "texts": [
    "fifo-1",
    "fifo-2",
    "fifo-3"
  ]
}
```

<a id="MSG-003"></a>

## MSG-003 · terminal marking cancels queued sends and removes member atomically

- 需求：R-A1-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 限流60秒积压两条send后手动标记suspended
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. API返回后状态终态、成员已删、两条均cancelled/ACCOUNT_TERMINAL；网关未落地

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 限流后操作员终态

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-004"></a>

## MSG-004 · 504 that lands within two seconds is reconciled without resending

- 需求：R-A2-03
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send返回504但1500ms内实际落地
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 先unknown后5秒内sent；无重发且网关仅一条

**时序要求**

1. 504后5秒确认；外部落地1500ms
2. 使用业务时点的可观测上下界存证；区间越界为FAIL，跨验收门槛而不能确定为BLOCKED，不增加隐式容差

**故障注入**

1. 504结果未知但落地

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-005"></a>

## MSG-005 · absent 504 permits at most one retry after the two-second uncertainty window

- 需求：R-A2-03
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首次504不落地；若产品选择重发，该次仍504且不落地，不强制选择可选重发
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首个504后超过2秒且查询404才能确认未发；如选择重发则保持相同clientMsgId且至多一次；进入failed前必须有针对最后一次504的超过2秒404确认；总send为1或2，5秒内failed/NETWORK_TIMEOUT

**时序要求**

1. 2秒确认窗口与总5秒终结窗口
2. 使用业务时点的可观测上下界存证；区间越界为FAIL，跨验收门槛而不能确定为BLOCKED，不增加隐式容差

**故障注入**

1. 首发504不落地；可选重发仍504不落地

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-006"></a>

## MSG-006 · unavailable confirmation preserves unknown until recovery

- 需求：R-A2-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 504响应屏障后令网关全部503且不推确认，保持超过5秒，再恢复
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 503期间unknown不错误failed/重发；恢复2秒内sent，send仍一次

**时序要求**

1. 停用5100ms；恢复2秒内确认
2. 使用业务时点的可观测上下界存证；区间越界为FAIL，跨验收门槛而不能确定为BLOCKED，不增加隐式容差

**故障注入**

1. 504已落地+查询503+遗漏事件

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-007"></a>

## MSG-007 · synchronous ACCOUNT_SUSPENDED applies terminal consequences without relying on events

- 需求：R-A2-10、R-A1-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 不依赖状态事件，send同步返回ACCOUNT_SUSPENDED
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 账号suspended、成员移除，消息失败或取消且有failCode

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. ACCOUNT_SUSPENDED

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-008"></a>

## MSG-008 · synchronous SESSION_EXPIRED applies terminal consequences without relying on events

- 需求：R-A2-10、R-A1-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 不依赖状态事件，send同步返回SESSION_EXPIRED
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 账号session_expired、成员移除，消息失败或取消且有failCode

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. SESSION_EXPIRED

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-009"></a>

## MSG-009 · SENDER_NOT_IN_GROUP only fails that message

- 需求：R-A2-12
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send同步返回SENDER_NOT_IN_GROUP
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 仅此消息failed/SENDER_NOT_IN_GROUP；账号online、群active

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. SENDER_NOT_IN_GROUP

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-010"></a>

## MSG-010 · ACCOUNT_OFFLINE only fails that message

- 需求：R-A2-12
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send同步返回ACCOUNT_OFFLINE
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 仅此消息failed/ACCOUNT_OFFLINE；账号online、群active

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. ACCOUNT_OFFLINE

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-011"></a>

## MSG-011 · incoming duplicate and out-of-order historical messages are merged and sorted

- 需求：R-A2-05、R-A4-02
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 重复A事件、同毫秒B、新消息与跨多年历史补投交错
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 按(groupId,msgId)四行去重，按sentAt倒序，历史补投在末尾且不受1秒窗口限制

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-012"></a>

## MSG-012 · snapshot cursor traversal has no omission or duplicates under concurrent writes

- 需求：R-A4-01
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 预置83条含同毫秒消息；第一页limit13后同时增加新旧消息；遍历所有cursor
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首次固定83条恰好各一次，不混入遍历后到达消息；刷新能看新消息

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 翻页期间新消息和历史补投

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "baselineCount": 83,
  "pageSize": 13
}
```

<a id="MSG-013"></a>

## MSG-013 · manual send validates unavailable account and nonmember before enqueue

- 需求：R-A2-12
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 用非成员online账号发送，再用disconnected成员发送
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 分别409 ACCOUNT_NOT_IN_GROUP/ACCOUNT_UNAVAILABLE；无网关send

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-014"></a>

## MSG-014 · leaving rate_limited manually prevents stale timer resurrection

- 需求：R-A1-06、R-A1-08
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 限流后在计时到期前手动disconnected；等待计时过期
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 仍disconnected；已向网关disconnect；无定时器错误复活

**时序要求**

1. 等待限流2秒再额外200ms

**故障注入**

1. 限流与操作员离线竞争

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-015"></a>

## MSG-015 · asynchronous message_failed applies ACCOUNT_SUSPENDED consequences

- 需求：R-A2-02、R-A2-10、R-A1-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send先202，延迟后message_failed/ACCOUNT_SUSPENDED
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 先accepted后失败且failCode非空；无实际消息；账号终态或群unreachable按错误来源独立生效

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 异步message_failed

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-016"></a>

## MSG-016 · asynchronous message_failed applies GROUP_WRITE_FORBIDDEN consequences

- 需求：R-A2-02、R-A2-11
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send先202，延迟后message_failed/GROUP_WRITE_FORBIDDEN
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 先accepted后失败且failCode非空；无实际消息；账号终态或群unreachable按错误来源独立生效

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 异步message_failed

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-017"></a>

## MSG-017 · message echo arriving before confirmation still merges one own row

- 需求：R-A2-01、R-A2-05、R-A2-06
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 先推message回流，再推message_sent；各重复3次
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 只保留一条own/sent消息和一条网关实际发送

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="WS-001"></a>

## WS-001 · business events start after auth and have strictly increasing global seq

- 需求：R-A4-03、R-A4-04、R-A1-05
- 优先级：P1；方法：automated
- 自动化入口：tests/api/realtime.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. WS鉴权后变更状态并注入消息，收集帧
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 认证成功后才有事件；全局seq严格递增；status/message payload字段正确且状态已保存

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="WS-002"></a>

## WS-002 · unauthenticated and invalid-token sockets receive no business events

- 需求：R-A4-03
- 优先级：P1；方法：automated
- 自动化入口：tests/api/realtime.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 分别不认证与无效token连接WS；注入真实消息
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 无成功auth，也无带seq的业务帧；已认证REST能见该消息

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="WS-003"></a>

## WS-003 · account_terminal is published only after terminal state and cleanup

- 需求：R-A4-04、R-A1-04、R-A1-05
- 优先级：P1；方法：automated
- 自动化入口：tests/api/realtime.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. WS监听account_terminal；终态事件到达瞬间读取账号和成员
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 终态帧到达时账号已是session_expired且成员已删除

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-001"></a>

## AGENT-001 · four schema-complete tools and correct trigger context keep one run identity

- 需求：R-A5-02、R-A5-03、R-A5-14、R-A5-17
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 触发外部消息→get_recent→end_turn；检查每次turn请求
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 恰好四工具且required齐全；runId一致；上下文身份/策略/群正确；tool_result在user；summary存储不发群

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-002"></a>

## AGENT-002 · duplicate inbound and own echo never duplicate triggers

- 需求：R-A5-01、R-A2-06
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 重复同一入站事件3次，再手动发own消息产生回流
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 始终仅一个run/turn，自己消息不触发

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-003"></a>

## AGENT-003 · multi-instance active run excludes competitors and batches all pending messages

- 需求：R-A5-01、R-A5-02
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 启动第二实例，首run响应屏障暂停；期间投递两条乱序外部消息再释放
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 始终只有一个running；结束立即新run收齐两条并按sentAt排序；总run/turn均2

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 双实例竞争与运行期积压

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-004"></a>

## AGENT-004 · non-JSON produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回非JSON，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 非JSON

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-005"></a>

## AGENT-005 · fenced JSON produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回markdown围栏JSON，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. markdown围栏JSON

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-006"></a>

## AGENT-006 · multiple blocks produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回两个块，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 两个块

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-007"></a>

## AGENT-007 · stop reason mismatch produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回stop_reason与块类型矛盾，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. stop_reason与块类型矛盾

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-008"></a>

## AGENT-008 · non-2xx produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回HTTP503，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. HTTP503

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-009"></a>

## AGENT-009 · UNKNOWN_TOOL appends assistant tool use and error result

- 需求：R-A5-03、R-A5-04
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 调用未知工具后正常结束
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. assistant保留tool_use，再user错误tool_result/UNKNOWN_TOOL；无审计与副作用

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 未知工具

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-010"></a>

## AGENT-010 · INVALID_INPUT appends assistant tool use and error result

- 需求：R-A5-03、R-A5-04
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 调用send_message缺key且text为数字后正常结束
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. assistant保留tool_use，再user错误tool_result/INVALID_INPUT；无审计与副作用

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. send_message缺key且text为数字

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-011"></a>

## AGENT-011 · duplicate tool_use id is protocol error and has no repeated effect

- 需求：R-A5-04
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 合法read工具后用同tool_use.id调用send
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. protocol_error/DUPLICATE_TOOL_USE_ID，无第二个assistant块、审计或发送

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 重复tool_use.id

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-012"></a>

## AGENT-012 · three consecutive protocol errors fail and a legal response resets the count

- 需求：R-A5-04、R-A5-05
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 连续坏响应2次→合法read→连续坏响应3次
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 合法响应重置计数，第6步protocol_errors失败，绝不调第7轮

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-013"></a>

## AGENT-013 · repeated read loop cannot exceed twelve turns

- 需求：R-A5-05、R-A5-18
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 连续安排14次相同参数read但不同tool_use.id
2. 先确认首个合法read实际执行且tool_result返回历史、Agent至少实际返回两次相同入参的合法工具响应，避免协议错误直接终止冒充重复读场景
3. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 12步内合理结束，不请求第13轮；满12步则failed/budget_exhausted

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-014"></a>

## AGENT-014 · audit rejection blocks side effect and rejected key remains reusable

- 需求：R-A5-07、R-A5-10
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 同key先审计fail，随后再次调用并审计pass
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首次AUDIT_REJECTED无发送；key可重用；审计2次但只send1次；审计text/groupId完全匹配

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-015"></a>

## AGENT-015 · three inconclusive audit attempts block run without execution

- 需求：R-A5-07
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 审计依次HTTP500、非JSON、未知verdict
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 3次无明确结论后blocked/audit_blocked；只1个turn/步骤；零副作用

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 审计非确定结果3次

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-016"></a>

## AGENT-016 · idempotency retry returns current sent state without another audit or send

- 需求：R-A5-10、R-A5-16、R-A2-03
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首次send504在1.5秒落地；Agent等结果后同key再调
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 网关send及审计各1次；第二次返回当前sent；run正常完成

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 504已落地+同key重试

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-017"></a>

## AGENT-017 · kick denied by policy never calls external kick

- 需求：R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. autoKickEnabled=false时调用kick_user
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. POLICY_DENIED，无kick，外部成员保留

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-018"></a>

## AGENT-018 · permitted kick audits exact action and uses owner or promoted member

- 需求：R-A5-07、R-A5-08、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 开启autoKick并触发kick_user
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 审计文本为精确JSON.stringify动作；执行者为creator/admin；外部目标移除

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-019"></a>

## AGENT-019 · OWNER_LEFT is returned as tool error without changing group or accounts

- 需求：R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. kick网关返回OWNER_LEFT
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 同名错误tool_result；群active、账号状态不变

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. OWNER_LEFT

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-020"></a>

## AGENT-020 · NO_PERMISSION is returned as tool error without changing group or accounts

- 需求：R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. kick网关返回NO_PERMISSION
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 同名错误tool_result；群active、账号状态不变

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. NO_PERMISSION

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-021"></a>

## AGENT-021 · recent messages include new arrivals and obey text, count, byte and summary limits

- 需求：R-A5-12、R-A5-15
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 预置55条600中文字；run期间新增消息后请求limit100000
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 最多50条、每条<=500字、content<=8KB、truncated=true；包含触发与运行期新消息；升序；summary<=200字

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "count": 55,
  "textLength": 600,
  "requestedLimit": 100000
}
```

<a id="AGENT-022"></a>

## AGENT-022 · disabling agent lets current step complete then cancels

- 需求：R-A5-13
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 当前工具响应屏障暂停时关闭agentEnabled，再释放
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 当前步后cancelled/endReason=cancelled；不再请求下一轮；activeAgentRunId=null

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 运行中关闭开关

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-023"></a>

## AGENT-023 · finish tool stores summary and does not ask another turn

- 需求：R-A5-17
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. Agent返回finish工具，后面安排不可请求的额外turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. summary存储，finished/final，记录finish步；仅一个turn，不发群

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-024"></a>

## AGENT-024 · turn timeout records error and late response never sends a message

- 需求：R-A5-06、R-A5-04
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 发送工具响应拖延16秒，下一轮正常结束
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 10–15秒超时记TURN_TIMEOUT；16秒后迟到响应被丢弃，零审计/发送

**时序要求**

1. 单轮10–15秒；观察至16.5秒
2. 使用业务时点的可观测上下界存证；区间越界为FAIL，跨验收门槛而不能确定为BLOCKED，不增加隐式容差

**故障注入**

1. Agent迟到响应

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-025"></a>

## AGENT-025 · run stays within sixty-second active wall-clock budget including slow turns

- 需求：R-A5-06
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 每轮8秒、交替参数合法read持续运行
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 合法慢read推进后以failed/wall_clock结束且未超过原run创建起60秒活动上限；未到12步，不要求必须跑满60秒；终止后不再派发

**时序要求**

1. 记录run创建与最后running/首次terminal的独立单调时钟区间；触发前verify观测能力，取得真实runId后arm；只有工程从模块启动保留真实创建至终止且完整单epoch的activity-witness可判活动预算，不把订阅起点当创建
2. 完整活动/实际停止决定下界>60000为FAIL，上界<=60000证明最大预算；活动或决定区间跨60000、缺完整见证为BLOCKED；wall_clock但早于60秒本身不自动FAIL，不引入最低时长、容差或精确单点；预算后或真实终止决定后新turn仍为FAIL
3. 观测缺失仍检查公开终态、steps、active引用与网关/Agent副作用；65秒为诊断观察预算，无独立违约的未终态不能凭此判产品超时
4. 真实创建、连续同epoch活动、停止决定、同attempt终态COMMIT和公开终态分开取证；公开轮询下界及COMMIT延迟不冒充活动决定时间

**故障注入**

1. 慢Agent响应

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）
4. wall-clock-window保存独立计时区间、真实run/group与owner/epoch/attempt绑定的runtime快照、缺失原因；保存触发前网关全部mutation基线，缺配置或见证不覆盖已证明功能违约

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-026"></a>

## AGENT-026 · no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error

- 需求：R-A5-08
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 所有群内服务账号disconnected后触发send工具
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 普通tool_use错误NO_AVAILABLE_ACCOUNT；run能继续最终完成；零send

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-027"></a>

## AGENT-027 · raw protocol response truncates to two KiB and remains inspectable

- 需求：R-A5-12、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. Agent返回大于2KB的非法原始响应
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. rawResponse保留前缀且<=2048 UTF8字节；protocol_error仍可查询

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-028"></a>

## AGENT-028 · unknown send times out in five seconds and same key still cannot resend

- 需求：R-A5-10、R-A5-16
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send504后查询503超过5秒；工具超时；恢复后同key重试
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 5秒得到SEND_TIMEOUT；恢复后同key返回现状，审计/send各一次

**时序要求**

1. 5秒工具上限；网关恢复2秒内确认
2. 使用业务时点的可观测上下界存证；区间越界为FAIL，跨验收门槛而不能确定为BLOCKED，不增加隐式容差
3. 仅持续未决SEND_TIMEOUT支路保留5秒后判据；核实真实504接收、查询故障与事件控制且全等待段无明确结果，不能从故障开启/504抵达/下一turn重置或替代计时

**故障注入**

1. 504+503+同key重试

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-029"></a>

## AGENT-029 · kick timeout reconciles membership and never executes twice

- 需求：R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. kick504但1.5秒后落地，省略事件
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 通过成员列表确认成功；kick只一次且目标消失

**时序要求**

1. 2秒内成员收敛

**故障注入**

1. kick504已产生效果

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-030"></a>

## AGENT-030 · account becoming terminal during send returns SEND_FAILED and run continues

- 需求：R-A5-08、R-A5-16
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. send请求屏障暂停；执行账号变终态后释放
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 该步SEND_FAILED，run继续final；无群消息

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 账号执行中途终态

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-031"></a>

## AGENT-031 · group write error cancels current run after its step and stops future triggers

- 需求：R-A2-11、R-A5-13、R-A5-16
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. Agent发送遭GROUP_WRITE_FORBIDDEN，之后投递新外部消息
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 当前步GROUP_UNREACHABLE后run cancelled；群unreachable；不再创建run

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 群不可写

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-032"></a>

## AGENT-032 · twelve distinct turns exhaust budget without a thirteenth request

- 需求：R-A5-05
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷
4. 本例使用不同read参数且无其他合法结束原因的特定推进夹具；恰12步不泛化为所有run的最低步数要求

**执行步骤**

1. 13轮不同read参数避免重复调用策略提前结束
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 准确12步/turn后failed/budget_exhausted，无第13次请求

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-033"></a>

## AGENT-033 · audit retries resolve before informing agent and do not consume turn budget

- 需求：R-A5-07
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 审计500→缺verdict→pass，然后end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 审计3次只计1工具步，Agent只收到最终结果；run共2步/turn，send一次

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-001"></a>

## REC-001 · SSE reconnect recovers all retained events once including out-of-order delivery

- 需求：R-A2-08、R-A2-05
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 断SSE并503，保留10条事件后恢复；另以800ms乱序复投
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 断线及乱序事件全部且仅一次入时间线；有真实SSE重连

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. SSE断线、重复和<=1秒乱序

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-002"></a>

## REC-002 · hard process restart recovers events produced while stopped

- 需求：R-A2-08
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. SIGKILL后产生5条网关事件；恢复后再次重启
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 停机事件全部恢复且第二次重启无重复

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. SIGKILL与停机期事件

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-003"></a>

## REC-003 · database write outage loses no event and produces inconsistency notice

- 需求：R-A2-07
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. WS认证后先实际收到锚点消息和seq，再切断QA数据库代理→投递故障消息→恢复；记录真实close/error，以最后实际收到seq重建观察流，再发后续消息
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 数据库失败事件不丢失、有inconsistency通知、后续事件继续消费

**时序要求**

1. 15秒通知观察仅为取证预算；有确定协议违约则FAIL，缺相关通知或连接证据则BLOCKED，不将裸WS死连接超时或人为重连当作产品违反新SLA

**故障注入**

1. 数据库连接强制中断

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）
4. database-recovery-websocket保存所有连接认证/完整帧/实际close/errors/最后已收seq、重连原因及是否QA主动关闭；通知保留kind/ref/message与真实故障身份相关性

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-004"></a>

## REC-004 · crash after send effect before response never duplicates gateway delivery

- 需求：R-A2-01
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 网关send落地后、响应/事件前屏障SIGKILL，恢复同数据库
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 本地有且仅一条sent记录；远端同clientMsgId仅一次，不重发已有效副作用

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. send after-effect崩溃窗口

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-005"></a>

## REC-005 · sequence restart reschedules only earliest overdue step and spaces subsequent sends

- 需求：R-B1-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 3步各delay2秒，首步前停机3秒至过期再恢复
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 仅最早过期步重排为恢复+delay，后续仍间隔2秒，不能扎堆

**时序要求**

1. 停机3秒，三个实际排期各>=2秒

**故障注入**

1. 序列待发送期SIGKILL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-006"></a>

## REC-006 · agent restarts with same run id and reconciles already-sent tool effect

- 需求：R-A5-11、R-A2-01
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. Agent send已落地但返回前SIGKILL，保留外部与DB事实后重启
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 同runId恢复并final；发送工具不记失败；网关send仅一次

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. Agent send after-effect崩溃窗口

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-007"></a>

## REC-007 · agent restart after kick effect uses membership reconciliation without repeating kick

- 需求：R-A5-11、R-A5-09
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. Agent kick实际移除后返回前SIGKILL并重启
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 同run继续完成且kick步不失败；外部kick调用一次

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. Agent kick after-effect崩溃窗口

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="REC-008"></a>

## REC-008 · repeated migration preserves data and schema version

- 需求：R-A0-01
- 优先级：P0；方法：automated
- 自动化入口：tests/system/recovery.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 已有群和已发送消息，停服务重复migration2次再启动
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. schemaVersion、成员与消息完整不变；迁移可重复执行

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-001"></a>

## SEQ-001 · variables inherit latest nonempty override with original source

- 需求：R-B1-03、R-B1-05
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 4步序列，默认值与step2/3/4覆盖，其中step3空字符串
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 逐步解析正确，空字符串不覆盖；来源继承最初覆盖步，发送文本一致

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "vars": {
    "event": "A",
    "where": "room-1"
  },
  "stepVars": {
    "2": {
      "event": "B"
    },
    "3": {
      "event": "",
      "where": "room-3"
    },
    "4": {
      "event": "C"
    }
  }
}
```

<a id="SEQ-002"></a>

## SEQ-002 · all-step preflight rejects step three and leaves no running record or send

- 需求：R-B1-04
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 第3步变量在vars及stepVars均空；失败后补全再启动
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 422含stepIndex=3/key；零网关send、无active run；修正后正常启动完成

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-003"></a>

## SEQ-003 · simultaneous starts admit exactly one sequence run

- 需求：R-B1-06
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 同群同序列Promise.all并发启动两次
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 恰好201与409 SEQUENCE_ALREADY_RUNNING；active指向赢家，实际仅一次发送

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-004"></a>

## SEQ-004 · admin preferred and member selected lexicographically

- 需求：R-B1-01
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 至少4账号群中运行admin步骤与member步骤
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. admin角色优先管理员；member取accountId字典序最小在线普通成员

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "minimumSeedAccounts": 4
}
```

<a id="SEQ-005"></a>

## SEQ-005 · next delay begins at actual sent event, not acceptance

- 需求：R-B1-07
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 启动两步delay1秒的序列；首步真实202和落地，但暂不创建message_sent及回流事件，避免SSE重连提前重放
2. 真实落地后继续观察1500ms，每次读取都检查未收到确认的首步不为sent，且没有第二次发送
3. 记录QA递送下界后首次创建并推送message_sent；公开首步sent响应构成接收上界，再补相同身份回流
4. 核对两条真实副作用及最终finished；以接收区间和网关请求毫秒区间判断后续delay，保存完整证据

**预期结果**

1. 202受理、远端已落地及网关sentAt均不能代替message_sent接收；释放确认前不安排后续发送
2. 首步按启动后delay，第二步按message_sent接收后delay；没有额外发送，两步最终sent且run finished
3. 每次采样已经证明的提前发送直接FAIL；时间区间跨1000ms边界或观察未完成记BLOCKED，不用重试掩盖首次违反

**时序要求**

1. delay1000ms来自本用例的公开序列参数；1500ms只用于区分已落地与尚未递送，不是产品SLA
2. 启动由POST前后夹定，接收由首次递送前与公开sent响应夹定；网关毫秒戳按1ms区间处理，不增加隐式容差
3. 各阶段15秒仅为有限诊断预算；缺少完成或精确区间记BLOCKED，不创造新的业务完成时限

**故障注入**

1. 首步保留真实202与落地，受控延后确认/回流；不新增网关幂等或重放保证

**取证**

1. sequence-held-confirmation及sequence-confirmation-time-bounds：远端sentAt、确认事件、接收上下界、请求毫秒精度和逐阶段公开结果
2. 脱敏HTTP请求/响应与时间戳
3. 网关请求/实际副作用/事件历史与Agent原始协议记录
4. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{
  "stepDelayMs": 1000,
  "confirmationHoldMs": 1500,
  "observationBudgetMs": 15000,
  "boundary": "受控正常递送；接收记录保存前后窗口、多实例物理首次观察及重启复用另行取证"
}
```

<a id="SEQ-006"></a>

## SEQ-006 · unavailable member step is skipped with timestamp and progress continues

- 需求：R-B1-01、R-B1-08
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 无普通member的群执行member步后admin步
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步skipped有sentAt，第二步照常sent，进度最终finished

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-007"></a>

## SEQ-007 · rate-limited role waits rather than skips and preserves later delays

- 需求：R-B1-01、R-B1-07、R-A2-09
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 序列首发送遭2秒限流，随后member步delay1秒
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步不能skipped；限流后两步依序sent，后一条按实际发出后延迟

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 序列限流

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-008"></a>

## SEQ-008 · group write prohibition stops sequence while account remains online

- 需求：R-A2-11
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 序列首send返回GROUP_WRITE_FORBIDDEN
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 群unreachable、run stopped、activeSequenceRunId=null；账号online；后续步不发

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 群不可写

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-009"></a>

## SEQ-009 · placeholder grammar includes letters digits underscore and leaves other braces literal

- 需求：R-B1-02
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 文本含{A_1}/{0}/{bad-key}/{}，提供合法key值
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 合法字母数字下划线替换；不匹配语法的花括号原样保留

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 无注入；真实公开接口与隔离PostgreSQL

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="SEQ-010"></a>

## SEQ-010 · terminal account skips its queued sequence step and advances progress

- 需求：R-A1-04、R-B1-08
- 优先级：P1；方法：automated
- 自动化入口：tests/system/sequence.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 序列首步限流积压时发账号终态；第二步member可用
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步skipped且有时间戳、关联出站cancelled/ACCOUNT_TERMINAL；后续步继续sent

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 序列排队中账号终态

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-034"></a>

## AGENT-034 · missing stop reason produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回missing stop reason，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. missing stop reason

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-035"></a>

## AGENT-035 · zero content blocks produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回zero content blocks，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. zero content blocks

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="AGENT-036"></a>

## AGENT-036 · text surrounding JSON produces BAD_JSON history without assistant block

- 需求：R-A5-03、R-A5-04、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/system/agent.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 首turn返回text surrounding JSON，下一轮合法end_turn
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 首步protocol_error/BAD_JSON，toolUseId/name/input=null，有原始响应；历史仅追加user PROTOCOL_ERROR，不伪造assistant

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. text surrounding JSON

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```

<a id="MSG-018"></a>

## MSG-018 · terminal event removes account and cancels its queue across every group

- 需求：R-A1-04
- 优先级：P0；方法：automated
- 自动化入口：tests/api/messages.spec.ts

**前置条件**

1. 尚未对产品执行；执行前必须取得用户显式授权并冻结SUT/QA版本与配置
2. 每用例独立真实PostgreSQL数据库、进程、网关/Agent桩，默认不重试
3. 通过公开admin登录/连接/建群准备数据；测试所需种子不足记BLOCKED，不作为产品缺陷

**执行步骤**

1. 创建两个相同成员的新群；同一账号跨群排队两条消息；投递session_expired终态事件
2. 按automation中逐项断言读取公开REST/WS结果并对照独立外部事实账本

**预期结果**

1. 终态生效后该账号从全部群中移除；两群排队消息均cancelled/ACCOUNT_TERMINAL；网关零落地

**时序要求**

1. 轮询仅用于等待已约定异步结果；默认15秒诊断上限不替代原文时间边界

**故障注入**

1. 跨群共享账号限流与网关终态事件

**取证**

1. 脱敏HTTP请求/响应与时间戳
2. 网关请求/实际副作用/事件历史与Agent原始协议记录
3. 断言结果、进程日志和故障屏障/重启时间线（适用时）

**清理**

1. fixture仅清理本用例创建的进程、数据库、代理和测试桩；恢复数据库代理并释放所有屏障
2. 失败证据写入reports/<run-id>并保留，禁止删除其他运行资源

**数据**

```json
{}
```
