# architecture-observation.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="ARC-UI-BLK-001"></a>

## ARC-UI-BLK-001 · 通用资源读取失败不能提交成功快照或提前确认未呈现提醒

- 需求：ENG-READ-02、ADD-ATT-03
- 优先级：P1；方法：automated
- 自动化入口：tests/ui/observation-boundaries.spec.ts

**准备状态：dependency-pending；责任方：QA**

1. 账号通用读取失败与提醒确认脚本已实现
2. 尚需授权后确认候选真实页面定位及消费者关联，adapterConfirmed当前不代表已确认

**前置条件**

1. 后续获准的隔离浏览器环境；本轮尚不执行产品
2. 目标adapters.fixtureArtifacts绑定配置路径与SHA256；observation定位需经可见页面确认并绑定候选SHA；未提供时runtime BLOCKED，不宣称接入ready

**执行步骤**

1. 公开API使独立账号online；浏览器成功呈现旧状态并记录安静标题/favicon
2. 真实标签失焦，保持浏览器GET /api/accounts持续503；通过公开transition把目标账号改为disconnected，并从API确认新事实
3. 验证失败请求已发生、界面仍呈现online；仅聚焦、点击错误、点击旧状态分别不能清除标题/favicon提醒
4. 恢复真实GET并经已确认可见刷新入口成功呈现disconnected；明确操作新状态后提示恢复；保留HTTP、页面与状态证据

**预期结果**

1. 旧值不作为已呈现新版本；焦点、错误和旧值操作不确认失败读取后的变化
2. 只在真实新状态成功呈现并明确操作后清除；不调用产品helper、不伪造焦点或私有快照

**时序要求**

1. 真实取证成功版本及提醒变化，不从一次HTTP失败推断已触发消费者逻辑

**故障注入**

1. 独立浏览器拦截目标只读请求失败，保留新事件与页面版本证据

**取证**

1. 页面成功版本/相关更新及HTTP时间线、截图、标题/favicon变化
2. 说明被验资源确实由目标公开页面消费且参与提醒确认

**清理**

1. 解除本用例路由与屏障，关闭独立浏览器上下文；只清理本轮资源

**数据**

```json
{
  "source": "已批准AR-09失败不提交成功快照；既有ADD-ATT-03只确认已呈现内容",
  "existingCoverage": "UI-029仅证明消息时间线失败，不能直接证明其他通用资源消费者",
  "readiness": {
    "script": "implemented",
    "uiAdapter": "not-provided",
    "sutExecuted": false
  },
  "config": "config/fixtures.example.json",
  "consumer": "公开账号列表 GET /api/accounts；确定账号online→disconnected"
}
```
