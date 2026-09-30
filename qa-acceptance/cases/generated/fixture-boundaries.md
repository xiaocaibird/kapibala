# fixture-boundaries.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="BLK-MIG-001"></a>

## BLK-MIG-001 · 已有历史schema低于候选时明确拒启且不改变结构数据

- 需求：R-A0-02
- 优先级：P1；方法：automated
- 自动化入口：tests/system/fixture-boundaries.spec.ts

**准备状态：dependency-pending；责任方：QA与候选交付方**

1. 解析、恢复与断言已实现；真实版本化dump及独立manifest尚未提供
2. 制品双哈希和对应版本/出处需按contracts/fixture-artifacts.md准备；授权后仅导入本轮新建专属库

**前置条件**

1. 具体候选产品执行已获授权；仅本轮OwnedDatabaseCluster新建空库
2. 目标adapters.fixtureArtifacts绑定配置路径与SHA256，提供已审核不透明旧版custom archive、双哈希、源版本及明确schema拒启日志片段；未提供则runtime BLOCKED

**执行步骤**

1. 校验manifest/dump完整性、候选SHA和旧schema审核关系；仅恢复到新建空库，不执行候选迁移
2. 使用PG官方pg_dump对导入结果分别生成规范化结构及数据摘要
3. 启动已授权候选；记录健康端点是否可用、候选是否自行退出及明确schema拒启日志
4. 停止清理候选后再次导出结构和数据摘要，与启动前逐项比较

**预期结果**

1. 从未观察到可用健康端点，候选自身退出且具有明确审核schema拒启诊断；缺命令、未知退出原因或超时被QA杀死时BLOCKED待归因，不算通过；已观察健康可用或内容改变仍记FAIL
2. 拒启前后结构和数据摘要一致；这是最终可观察内容保留证据，不宣称排除所有瞬时写后回滚

**时序要求**

1. 使用候选已配置启动时限作为观察上限，必须看到自身退出；到期仍在运行不能冒充拒启

**故障注入**

1. 只使用真实不透明旧schema archive，不猜私表或导入产品迁移来生成预期

**取证**

1. 源制品与manifest哈希、审核来源和候选版本
2. 启动日志、健康/退出观察、前后结构/数据哈希及清理结果

**清理**

1. 始终停止本轮进程与协议桩，仅删除当前对象创建的fixture数据库，保留证据

**数据**

```json
{
  "config": "config/fixtures.example.json",
  "contract": "contracts/fixture-artifacts.md",
  "readiness": {
    "script": "implemented",
    "realArtifact": "not-provided",
    "sutExecuted": false
  },
  "projects": [
    "system"
  ]
}
```
