# ui.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="UI-001"></a>

## UI-001 · viewer登录后各页不提供业务写入口

- 需求：R-A6-01、R-A0-05
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. viewer登录
2. 依次打开账号、群目录、群详情

**预期结果**

1. 登录成功
2. 创建/编辑/连接/释放/启动按钮不可用且不泄露越权数据

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium",
    "firefox-smoke",
    "webkit-smoke"
  ]
}
```

<a id="UI-002"></a>

## UI-002 · 账号状态与合法操作实时更新

- 需求：R-A6-02、ADD-COPY-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 初始idle查看
2. API连接一个账号
3. 网关推终态

**预期结果**

1. 断开按钮只为online出现
2. 终态后消失
3. 状态可读

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-003"></a>

## UI-003 · 群角色及消息回流只显示一行

- 需求：R-A6-03、R-A4-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 打开已建群详情
2. 推重复外部消息
3. 发送自己的消息

**预期结果**

1. 显示群主和群管理员
2. 两类消息各只有一行

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium",
    "firefox-smoke",
    "webkit-smoke"
  ]
}
```

<a id="UI-004"></a>

## UI-004 · 页面显示accepted到sent

- 需求：R-A6-03、R-A2-02、R-A4-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 网关延迟落地
2. 手工发送
3. 观察同条消息

**预期结果**

1. 先受理后发送
2. 同一消息行不重复

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-005"></a>

## UI-005 · 历史分页和实时新增合并

- 需求：R-A4-01、R-A4-02、R-A6-03
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 注入65条历史消息
2. 加载更早
3. 同时注入新消息

**预期结果**

1. 历史全集每条恰好一行
2. 实时新消息可见

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-006"></a>

## UI-006 · 前端断线3秒内补齐

- 需求：R-B4-01
- 优先级：P0；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 页面离线
2. 网关注入两条消息
3. 恢复浏览器网络

**预期结果**

1. 恢复后3秒内两条消息可见且各一行

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium",
    "firefox-smoke",
    "webkit-smoke"
  ]
}
```

<a id="UI-007"></a>

## UI-007 · 审计阻断显示在群运行列表

- 需求：R-A6-03、R-A5-07
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. Agent请求发送
2. 审计三次无结论
3. 打开群详情

**预期结果**

1. run为blocked
2. 页面说明审计阻断
3. 醒目程度另有人工检查

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-008"></a>

## UI-008 · 登录至Agent步骤详情完整旅程

- 需求：R-B4-02、R-A5-14
- 优先级：P0；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. Agent依次坏响应、发送工具、结束
2. 登录
3. 进群点run
4. 展开原文

**预期结果**

1. 工具/输入/错误码/摘要及原始坏响应可查看

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium",
    "firefox-smoke",
    "webkit-smoke"
  ]
}
```

<a id="UI-009"></a>

## UI-009 · 序列预检变量继承与来源

- 需求：R-B1-03、R-B1-05
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 通过公开侧栏进入独立序列页面并选择本轮目标群；不假设群详情内嵌序列表单
2. 选择序列
3. 默认A室、第二步B室
4. 预检
5. 确认启动

**预期结果**

1. 弹窗显示最终值及default/step来源
2. 确认前零消息，之后进度和两次发送可见
3. 确认前持续观察1500ms，跨过首步1秒排期；sequence-runs POST次数和外部消息数都为0，确认后仅一次启动请求

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-010"></a>

## UI-010 · 序列预检错误定位

- 需求：R-B1-04
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 通过公开侧栏进入独立序列页面并选择本轮目标群；不假设群详情内嵌序列表单
2. 变量未填place
3. 点击预检

**预期结果**

1. 展示步骤1和place
2. 网关零消息
3. 在明确预检错误区域分别定位stepIndex与key；非法预检后1500ms内没有启动请求或外部消息

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-011"></a>

## UI-011 · 前端并发401单次续期

- 需求：R-B3-04
- 优先级：P0；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 拦截真实页面至少两个GET
2. 同时返回规定401
3. 观察refresh与重试

**预期结果**

1. 恰好一次refresh
2. 页面恢复
3. 不是通过原生fetch绕过应用续期逻辑

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-012"></a>

## UI-012 · 群资料纯文本呈现

- 需求：ADD-META-01、ADD-META-02、ADD-DIR-03
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 存入含HTML符号简介
2. 打开目录与详情

**预期结果**

1. 名称与简介可读，HTML不执行
2. 两行摘要另有专门用例

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-013"></a>

## UI-013 · 编辑表单dirty关闭保护

- 需求：ADD-FORM-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 无修改关闭
2. 修改后关闭并继续
3. 再次关闭并放弃

**预期结果**

1. 无修改直接关闭
2. 继续保留草稿
3. 放弃不写后台

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ],
  "visibilityContract": "断言对话框/提示不可见，不要求产品卸载隐藏DOM"
}
```

<a id="UI-014"></a>

## UI-014 · 提交中保护及失败保留草稿

- 需求：ADD-FORM-02
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 拦截保存请求暂停
2. 按Escape
3. 响应503

**预期结果**

1. 提交中表单保持
2. 错误后输入保留
3. 不重放写请求

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-015"></a>

## UI-015 · 冲突必须明确再次确认

- 需求：ADD-CONFLICT-04
- 优先级：P0；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 表单编辑
2. API竞争更新
3. 提交获得409
4. 明确确认后重试

**预期结果**

1. 草稿与服务器新版可核对
2. 确认前不覆盖
3. 确认后按新条件提交

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-016"></a>

## UI-016 · 搜索迟到响应隔离

- 需求：ADD-DIR-11
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 延迟old-query结果
2. 输入new-query
3. 新结果完成后释放旧结果

**预期结果**

1. 页面维持新条件和新结果
2. 输入焦点不被刷新抢走

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-017"></a>

## UI-017 · 多页过期和原子刷新

- 需求：ADD-DIR-08、ADD-ATT-05
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 建23群
2. 加载第二页
3. 改变群资料
4. 刷新503后再成功

**预期结果**

1. 过期后停止旧游标
2. 失败保留23项
3. 成功换首页20项

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 持续注入403只读失败，使该人工重试/失败保留场景不与自动退避竞态；暂时503的自动恢复由ARC-UI专项单独覆盖

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ],
  "visibilityContract": "断言对话框/提示不可见，不要求产品卸载隐藏DOM",
  "failureClass": "403 permanent read failure for deterministic manual recovery"
}
```

<a id="UI-018"></a>

## UI-018 · 组合筛选clear与reset

- 需求：ADD-DIR-12
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 搜索并选择升序/active/启用
2. 清关键词
3. 重置全部

**预期结果**

1. 清关键词保留其他条件
2. 重置恢复默认desc与全部筛选

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-019"></a>

## UI-019 · 首次错误与成功空结果区分

- 需求：ADD-DIR-10
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 首次目录响应503
2. 点击重试
3. 搜索不存在词

**预期结果**

1. 失败可重试
2. 成功空搜索展示空结果而非加载错误

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 持续注入403只读失败，使该人工重试/失败保留场景不与自动退避竞态；暂时503的自动恢复由ARC-UI专项单独覆盖

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ],
  "visibilityContract": "断言对话框/提示不可见，不要求产品卸载隐藏DOM",
  "failureClass": "403 permanent read failure for deterministic manual recovery"
}
```

<a id="UI-020"></a>

## UI-020 · 失焦提醒和呈现后确认

- 需求：ADD-ATT-01、ADD-ATT-02、ADD-ATT-03
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 真实浏览器切换标签
2. 先注入无关群再相关群消息
3. 聚焦
4. 操作已显示消息

**预期结果**

1. 无关不提醒
2. 相关标题变化
3. 仅聚焦不清除
4. 相关呈现及操作后确认

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-021"></a>

## UI-021 · 路由范围销毁

- 需求：ADD-ATT-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 离开群详情到账号页
2. 旧群再到消息

**预期结果**

1. 旧群内容和提醒不污染新页面

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```

<a id="UI-022"></a>

## UI-022 · 创建表单关闭保护

- 需求：ADD-FORM-01
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/console.spec.ts

**前置条件**

1. 后续产品执行已授权；至少3服务账号；独立PG和候选进程
2. 通过可见页面确认routes/selectors适配，adapterConfirmed=true；浏览器引擎已安装

**执行步骤**

1. 打开创建群
2. 填草稿
3. 关闭继续
4. 关闭放弃

**预期结果**

1. 继续保留草稿
2. 放弃未创建群

**时序要求**

1. UI-006严格验证恢复后3秒；其他等待上限仅防测试挂起，产品时限以需求为准

**故障注入**

1. 按脚本拦截真实网络错误或网关事件，不伪造成功业务数据

**取证**

1. 浏览器trace/关键截图、请求时序和断言
2. 公开API与Gateway/Agent事实账本、版本及清理manifest

**清理**

1. 关闭独立浏览器上下文；finally释放所有故障屏障；清理本用例独立资源

**数据**

```json
{
  "fixtures": "tests/ui/console.spec.ts内显式数据",
  "projects": [
    "chromium"
  ]
}
```
