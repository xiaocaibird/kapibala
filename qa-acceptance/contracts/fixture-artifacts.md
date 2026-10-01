# 历史库、微秒游标与资源提醒夹具

当前三条用例已有实际脚本和断言：`BLK-MIG-001`、`UI-037`、`ARC-UI-BLK-001`。这些专项尚未启动产品、数据库或浏览器。2026-10-01已收到真实历史库和微秒数据归档，完成[哈希、来源和台账静态核验](../reports/integration/20261001-fixture-intake/qa-readonly-review.json)；最终候选绑定、独立内容审核/恢复和可见页面定位仍未完成。`automated` 表示存在执行入口，不代表夹具已经就绪或验收通过。

后续适用候选已固定为 `0af644334b00eb13e2e56df33c70f22358a6a0f7`，详见[工程接收记录](../requirements/engineering-candidate-intake-20261001.md)。候选已确定；待完成内容审核后才写入最终manifest并计算绑定摘要，历史preparation继续保持原来的null字段。

依据分别为原需求 R-A0-02、已批准目录变更 ADD-DIR-05，以及 ENG-READ-02 / ADD-ATT-03。数据与页面接入是工程测试准备事项，不是新增业务要求。缺接入时报告运行时 BLOCKED，不能用随机创建数据、导入业务 helper 或任意进程退出补成 PASS。

## 制品格式与独立预期

BASE-001 的空库诊断也可通过同一个已绑定配置文件提供可选 `unmigratedSchema`：`{confirmed:true,candidateRevision,reviewReference,controlSchemaVersion,rejectionLogIncludes}`。必须固定本轮候选，reviewReference记录对既有公开诊断的实际审核；日志片段应明确识别空schema，不接受通用崩溃。此字段不修改业务要求，旧配置仍兼容；缺省时BASE-001保留独立拒启观察并BLOCKED。正式判断同时要求同命令迁移库前后健康及审核版本匹配、空库无健康、清理前自行退出且无终止信号、明确诊断匹配；任意非零退出不得单独算通过。示例与修正依据见[辅助启动修正记录](../requirements/qa-correction-auxiliary-startup-20261001.md)。历史库、空库的诊断不可混用。

从 `config/fixtures.example.json` 复制一份到 QA 目录内。完成真实制品和页面适配后，计算配置文件的 SHA-256，将 `config/fixture-binding.example.json` 中的 `fixtureArtifacts` 项填入本轮目标配置的 `adapters`。该绑定是可选项；不使用夹具的用例无需填写，缺失时仅本节三项用例 BLOCKED。所有制品路径均相对 **qa-acceptance 根目录**；拒绝绝对路径、`..` 越界和文件符号链接。配置和 manifest 限 1 MiB，archive 限 64 MiB，均为夹具安全界限，不是产品容量指标。

配置路径与完整内容哈希进入 `targetFingerprint`，随后按正常流程冻结目标并取得执行授权。三个入口先校验实际配置哈希，再读取 manifest 或页面定位；artifact 继续验证 manifest/archive 的嵌套哈希。任何配置、制品、定位改动都需要更新哈希链并重新冻结、授权。`QA_FIXTURE_CONFIG` 已停用；即使值与绑定路径相同也会明确拒绝，不能用环境变量覆盖冻结配置。制品与页面取证都保留实际配置哈希；不从 manifest 自报的 candidateRevision 代替目标授权。

配置中的 `artifacts.legacySchema` 和 `artifacts.directoryPrecision` 分别填写 `{ "manifest": "fixtures/<name>.json", "sha256": "<manifest文件SHA256>" }`；不使用的条目保留 null。不能把示例定位或占位哈希视为已确认值。

两个 manifest 共用以下结构，尖括号内容必须填写实际值：

```json
{
  "version": 1,
  "artifactId": "<唯一制品名>",
  "kind": "directory-precision",
  "candidateRevision": "<获准候选完整40位SHA>",
  "source": {
    "producer": "<实际制作人或制作工具及版本>",
    "revision": "<制作此数据库的完整代码SHA>",
    "exportedAt": "2026-10-01T00:00:00Z",
    "syntheticOnly": true,
    "noPendingWork": true
  },
  "review": {
    "reviewer": "<制品审核人>",
    "reference": "<审核记录位置与版本>",
    "reviewedAt": "2026-10-01T00:01:00Z"
  },
  "dump": {
    "path": "fixtures/precision.dump",
    "sha256": "<archive实际SHA256>",
    "bytes": 12345,
    "format": "pg-custom"
  },
  "expected": {
    "query": { "q": "qa-precision-", "pageSize": 2 },
    "rows": []
  }
}
```

`source` 声明数据库仅含合成数据、没有待执行 run/outbox/audit 等工作；微秒夹具还应没有会在启动后触发写操作的活跃账号。两种制品都使用已知测试用户 `admin/admin`。manifest 的预期来源是**制作前定义的夹具台账及其审核**，不能从被测 API 返回值、排序结果或业务私表查询反向生成答案。

历史库使用 `kind: "legacy-schema"`，`source.revision` 必须区别于候选，审核须确认该 schema 确实低于候选。其 `expected` 替换为：

```json
{
  "schemaRelation": "older-than-candidate",
  "rejectionLogIncludes": ["<经审核的公开schema/迁移版本拒启日志片段>"]
}
```

日志片段必须能识别版本拒绝，不能填写 `MODULE_NOT_FOUND`、普通启动失败或一段任意文字。无需规定退出码必须为特定数字。审核记录要说明源版本、schema 关系和诊断来源；只改 manifest 声明不能造出历史库。

微秒夹具 `rows` 为每条记录提供 `id`、`createdAtMicros`、`public`。前者是恰好六位小数的 UTC 独立真值，后者是 API 应返回的公共字段投影，必须含相同 id 和合法 createdAt。公共 JSON 时间允许原接口既定精度；排序预期始终使用独立微秒真值，不借 JavaScript 毫秒截断来推断数据库排序。

下面是六条数据的**制作规格**，尚不是已存在的数据库记录。可以使用生产者实际可创建的安全 ASCII ID 替换 `id-0..5`，但必须保持同时间记录 ID 的已知升序关系，并同步独立台账：

| ID   | createdAtMicros             | 目录搜索名称   |
| ---- | --------------------------- | -------------- |
| id-0 | 2026-10-01T00:00:00.000001Z | qa-precision-0 |
| id-1 | 2026-10-01T00:00:00.000002Z | qa-precision-1 |
| id-2 | 2026-10-01T00:00:00.000002Z | qa-precision-2 |
| id-3 | 2026-10-01T00:00:00.000003Z | qa-precision-3 |
| id-4 | 2026-10-01T00:00:00.000004Z | qa-precision-4 |
| id-5 | 2026-10-01T00:00:00.000004Z | qa-precision-5 |

例如第一条为 `{ "id": "id-0", "createdAtMicros": "2026-10-01T00:00:00.000001Z", "public": { "id": "id-0", "name": "qa-precision-0", "createdAt": "2026-10-01T00:00:00.000Z" } }`。生产者须按获准的公开字段定义填写真实期望；示例不会替代审核。搜索前缀只能匹配这些记录，测试期间数据不变化。pageSize=2 时，正向和反向遍历都分别跨过同时间 ID 边界与同毫秒不同微秒边界。解析器会拒绝未同时命中这些边界的数据规格。

## 制作、封存与接入命令

本节命令是后续获得执行授权后的操作配方，当前未运行。制作人先在独立、可销毁的夹具源库中，用对应历史版本初始化旧 schema，或按上述已审核台账创建微秒数据。QA 不猜测私表结构，也不提供针对未知私表的 INSERT；工程方可以交付固定版本的夹具生成命令及制作台账，审核后复用。生成器不是预期 oracle。

只对明确属于夹具的源容器导出，不能指向开发者日常库或线上库。先核对该容器 ID、所有权与数据库名；下面变量必须是已审核的专属源实例。整个导出只读，不运行候选迁移：

```sh
# 从 qa-acceptance 根目录运行；变量由获准的夹具制作记录提供。
mkdir -p fixtures
docker --host unix:///var/run/docker.sock inspect "$QA_FIXTURE_SOURCE_CONTAINER"
docker --host unix:///var/run/docker.sock exec "$QA_FIXTURE_SOURCE_CONTAINER" \
  pg_dump --username=qa --dbname="$QA_FIXTURE_SOURCE_DATABASE" \
  --format=custom --no-owner --no-privileges > fixtures/precision.dump
```

旧库同样导出为 `fixtures/legacy.dump`。对整个 archive 及制作台账审核后，将审核信息填入 manifest。可以用以下命令封存**已经填好的** manifest 的 archive 摘要并打印最终 manifest 摘要，不连接任何服务：

```sh
node --input-type=module - fixtures/precision.json <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = process.argv[2];
const value = JSON.parse(readFileSync(file, 'utf8'));
const archive = readFileSync(value.dump.path);
const hash = (b) => createHash('sha256').update(b).digest('hex');
value.dump.sha256 = hash(archive);
value.dump.bytes = archive.length;
writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify({ manifest: file, sha256: hash(readFileSync(file)) }));
NODE
```

将打印的引用写入对应配置项。最终接入必须走正常 `preflight` / `acceptance` 及用例选择、候选授权流程；不能直接调用 helper 跳过授权。自测里的 `PGDMP...` 文本只用于验证解析器，不是可恢复的 archive，绝不能拿它作为本节制品。

## 恢复与实际验收流程

`tests/system/fixture-boundaries.spec.ts` 在每例先验证候选授权和用例选择，再核对配置、manifest 与 archive；之后才创建专属 PostgreSQL 容器和新的随机 `qa_*` 数据库。恢复前检查当前对象确实拥有数据库、容器 owner 与 loopback 端口吻合、库无业务对象。已校验的内存字节先写到专属临时文件，再复制入容器，避免校验路径后读取其他内容。只运行 PostgreSQL 官方 `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`；不执行任意配置 SQL，不迁移导入后的数据库，不覆盖已有库。

恢复不兼容或独立环境准备失败时，产品尚未启动，保留错误并记 BLOCKED；不能把不完整的夹具当成功能失败。

- `BLK-MIG-001`：分别对导入后的结构和数据做官方 `pg_dump` 摘要；启动候选，观察健康端点与真实进程退出，要求未观察到健康可用、候选自行退出、诊断包含审核过的 schema 拒绝片段。再比较结构/数据摘要。实际观察到健康可用或持久化内容改变记 FAIL；没有自行退出或缺明确诊断时，保留证据并记 BLOCKED 待归因，不能把缺依赖、外部终止或健康超时当作已知产品故障或正确拒启。摘要仅规范化 PostgreSQL 的随机 `\\restrict` 包装 token，不删除真实注释、COPY 数据或业务内容。它证明拒启前后持久化内容相同，不宣称排除了全部瞬时写后回滚。
- `UI-037`：名称保留原编号，执行层明确为 system / 公共目录 REST。登录后以夹具 q/pageSize 正反向遍历真实 cursor；独立 BigInt 微秒排序、同时间 ID 升序，逐项对比完整 ID 序列和公开字段。检查循环 cursor、空非终页、过多页、漏项/重复，并验证没有网关写请求或 Agent turn。普通随机分页测试不能代替此边界。

证据包含候选和来源版本、审核引用、配置/manifest/archive 哈希、API 原始响应、启动日志、结构/数据摘要、清理结果。无论失败还是成功，只清理本用例创建的进程、协议桩、数据库和容器，保留证据。

## 账号资源失败与提醒确认

`ARC-UI-BLK-001` 使用公共账号列表作为另一通用资源消费者。自动前置夹具先验证执行授权、用例选择、配置哈希和已确认定位，再进入该例的 `qa` 产品初始化。基础 UI 适配仍使用目标配置；此处 `observation` 额外定位必须通过真实可见页面确认并绑定当前候选 SHA：

- `rowSelector` 包含 `{id}`，只定位本轮账号；`stateSelector` 和 `acknowledgeSelector` 相对该行。
- `errorSelector` 是该资源的可见错误区域。
- `refreshSelector` 必须是同文档、仅重读账号资源的可见刷新/重试入口，不能是整页重载、跳页，或兼具“查看并确认”语义的操作；后者可合法在成功定位后确认，因此不能用于本场景。
- `stateText` 填写在线与断开状态的真实可见文字，`reviewReference` 留存定位和刷新语义的审核。示例的 `data-qa-*` 只是模板，不声明产品存在这些属性。

实际脚本先经公共 API 连接独立账号、浏览器呈现 online；真实标签失焦后持续使浏览器账号 GET 返回 503，同时经公开 transition 完成 online→disconnected，并从独立 API 客户端确认新状态。脚本检查失败读取、旧状态、标题/favicon 像素字节提醒，再分别验证聚焦、点击错误、点击旧状态不能确认未呈现变化；恢复读取，真实新值成功呈现后，明确操作才可清除。整个过程不访问产品内部 snapshot，也不伪造 focus、visibility 或资源 hook。

若真实界面没有可复现该行为的独立错误/旧数据/纯刷新入口，应提供另一个经审核的可见消费入口并调整此用例，不能把新定位当作业务必须新增的控件，也不能靠整页重载、随机延迟、隐藏内部状态操作宣称覆盖。当前定位未确认，因此仍列作运行接入未就绪。
