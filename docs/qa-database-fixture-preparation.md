# 开发侧 QA 数据库制品准备

2026-10-01。按既有 `qa-acceptance/contracts/fixture-artifacts.md` 为 `BLK-MIG-001`、`UI-037` 准备两个真实 PostgreSQL custom archive。只新增开发侧生产者、独立台账和自测证据；没有修改或执行 QA 资产、产品代码、生产 schema 或演示环境。**制品已生成并通过开发恢复校验；最终候选绑定和 QA 制品审核尚待完成。**

## 来源和独立台账

- 旧库固定来自 `3d7e4f461238e752b2259e0a99dffa8521a00caa` 的正式 `scripts/migrate.ts` 和该版本迁移器，真实执行 001–007，非删除当前第8条账本来伪造旧库。
- 微秒库来自 `4c035b8c24e95f33182b4248ee676fcd184f74a5` 的正式迁移器，执行 001–008。最终 QA `candidateRevision` 可与此 `source.revision` 不同；主线固定候选后，须核对其 schema/公开契约与该来源兼容，不能只改声明充当校验。
- [独立台账](../scripts/fixtures/qa-directory-ledger.json)在生成数据库之前定义。QA 已接受六行 ID/微秒规格及最小公共投影；这是台账规格确认，不是制品审核完成。期望不从 API、排序结果或业务私表查询反向生成。

查询固定 `q=qa-precision-`、`pageSize=2`，分别使用 `order=asc/desc`。六行 ID 为 `qa-precision-group-0..5`，名称为 `qa-precision-0..5`，UTC 时间依次为 `2026-10-01T00:00:00.000001Z`、`.000002Z`、`.000002Z`、`.000003Z`、`.000004Z`、`.000004Z`。升序 ID 后缀为 `0,1,2,3,4,5`，降序为 `4,5,3,1,2,0`，同时间 ID 始终升序。

每行 `public` 只声明 `id/name/createdAt`，公共时间均为 `2026-10-01T00:00:00.000Z`。六位微秒独立真值另外保留，不用公共毫秒值推导排序。生成器元数据单独声明 `creatorAccountId=account-1`、`gatewayGroupId=qa-precision-gateway-{index}`、active、关闭 Agent/autoKick、空简介/成员/活动run。六个预置账号均 idle，平台身份和限流时间为空。其余业务表包括消息、jobs、Agent/序列运行与步骤、事件、receipt、认证会话和 token 全空。

## 实物与哈希准备

开发 staging：

```text
/Users/zcm/.codex/worktrees/architecture-contract-resource/kapibala/.runtime/qa-fixtures/5d1885e76871460bb0c146fd4cc90032
```

| 文件 | 字节/用途 | SHA-256 |
|---|---|---|
| `legacy.dump` | 37,924；schema7 custom archive | `24f49db6ecfb7cf54e614d6d00a3e9f77e7ade2f5dfd040ba31bb7550990cb4f` |
| `precision.dump` | 39,173；schema8 custom archive | `0554319ab7ad4483f0a03fcb78416168267a0cd46ecf77b3a204cdea7e23ea38` |
| `legacy-schema.preparation.json` | 待审核/绑定的准备材料 | `249ce685bba3fa5cdae3921fa2b0c9e8476cb42c8106385e55c08c3253529f80` |
| `directory-precision.preparation.json` | 待审核/绑定的准备材料 | `8eed61aafe20e4abf49a64843472821cfc57497d754c65f9444f9a9e38d6e30d` |
| `independent-ledger.json` | 制作前定义的预期及生成设置 | `c9c16632a99880691498286235c4479687ec1677082c5b313fc131034529fac5` |

准备材料中 `candidateRevision=null`、`review=null`，并含明确 pending 状态和 producer metadata；**它们不是满足 QA 解析器的最终 manifest**。上表准备材料摘要也不是最终 manifest 摘要。QA 收到实物后审查来源、台账、无 pending、内容和 archive 哈希，按实际审核事实形成契约允许的 manifest，填最终获准候选及真实审核人/引用，再计算 manifest→配置→目标指纹的哈希链。制品和定位变更需按既有 QA 流程重新冻结/授权；本任务不代填审核，也不复制到 QA `fixtures/`。

归档和原始迁移、恢复日志仅保存在忽略的 `.runtime` staging；Git 只提交脚本、台账及无 token/业务敏感数据的验证摘要。归档字节包含真实迁移时间等生成记录，重复生成应保证相同逻辑规格，不承诺每次 custom archive 字节哈希相同。

## 开发恢复验证

[生成器](../scripts/prepare-qa-database-fixtures.mjs)归档固定源码的 server/packages/db/迁移入口到临时目录，不导入或运行 QA helper。使用本机已安装依赖和独立 `postgres:17-alpine` 容器，实际版本 **17.11**；容器 owner、完整 ID、镜像内容 ID、随机 loopback 端口 **55971** 和匿名卷名均在[机器记录](evidence/qa-database-fixtures-verification.json)中。

每种制品分别使用新源库及新空恢复库，共四个 UUID 数据库。真实 `pg_dump --format=custom --no-owner --no-privileges` 导出，真实 `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges` 从已导出字节恢复；不对恢复库运行迁移。完整 schema-only/data-only dump 摘要在导出前后以及恢复后一致，规范化仅去掉 PostgreSQL 随机 `\restrict/\unrestrict` token 行。

| 检查 | 结果与范围 |
|---|---|
| 来源及安全数据 | 正式迁移账本分别完整为7/8，记录每份迁移名称及checksum；六账号均 idle；旧库无群，微秒库恰好六群；其余业务表全空。源库与恢复库计数一致。 |
| 微秒真值 | 入库后使用 PostgreSQL 六位微秒文本与预定义台账比较一致；这一步只校验写入，没有生成预期。 |
| 旧库拒启 | 对恢复后的 schema7 执行候选真实 `main.ts`，自行退出1、signal=null，无监听日志，包含 `Schema mismatch: installed=7, required=8`；前后完整结构/数据摘要一致。[原始诊断](evidence/qa-database-fixtures-rejection.log)。未用缺模块或外部强制终止充当正确拒启。 |
| 目录公开接口 | schema8恢复库启动隔离 HTTP（后台关闭、外部URL不可用），真实 `admin/admin` 登录成功；asc/desc各3页，每页2条，完整ID顺序及三字段投影与预定义台账一致，无循环cursor或遗漏。原始公开响应保存在 staging；认证token不输出。 |
| 清理 | 关闭 app/pool，只删除本次四库；复核库和会话均0；核对owner/容器ID后 `docker rm --force --volumes`，容器和匿名卷均0，临时代码目录移除。归档仍保留。 |

这不是 QA 正式执行，也没有证明全部公共字段、后台写操作零发生或瞬时写后回滚不存在。目录验证使用关闭后台的真实 API；档案在启动测试前即已导出，测试登录只影响恢复验证库，不会把会话/token写回制品。旧库验证记录实际进程和持久内容，不替代 QA 用例自身的健康探测与完整判定。

staging 内两个 `*-migration.log` 各20字节，两个 `*-restore.log` 都为0字节（成功执行时原始 stdout/stderr 为空），`legacy-candidate-rejection.log` 为2036字节。后者保存真实生产入口 stdout+stderr，而非从摘要重建；恢复是否成功还由退出码及恢复后的完整摘要/数据检查共同证明，不宣称空文件含有逐条 verbose 恢复日志。

首次尝试在容器初始化期间误把 `pg_isready` 默认 Unix socket 临时服务当作最终就绪，首个 TCP 查询因初始化服务重启而断开；尚未创建制品或业务库。原始[失败摘要](evidence/qa-database-fixtures-first-failure.json)保留，自有容器和匿名卷已移除；其中清理阶段 admin 查询也失败，不宣称该次数据库查询清理检查通过。修订为显式 TCP `127.0.0.1` 就绪后完整重跑通过。

成功运行时 Git HEAD 为 `1cbaa79`，但实际脚本已含尚未提交的两行 TCP 就绪修订，所以不能把该提交单独称为本次完整执行代码。报告另记录实际 `generatorSha256=6c4d06fe01d9e3acefc88ffdfa75b3163d16365be042ebc44dbe4e0a8c4d7c03`；该内容随后原样提交为 `fa6bd5f`。归档与原始验证报告未因提交而改写。

只读复核未发现本次制品阻塞，另指出生成器失败处理可以加强。后续代码补了 SIGTERM 后500ms的 SIGKILL 兜底、完整 stdout/stderr close 观察、清理结果必须为空/已删除才允许通过、独立关闭 admin pool，以及含空格路径的 URL 转换。新增[3项定向检查](../scripts/fixtures/producer-guards.test.mjs)全部通过：真实子进程自然退出、忽略SIGTERM后被SIGKILL且不能冒充自然拒启、任一清理残留或缺证据均拒绝通过；见[原始输出](evidence/qa-database-fixtures-guards.tap)。这些检查不连接Docker或数据库，也没有重生成现有归档；制品执行身份仍为上段的脚本内容，不倒写成后续生成器已完整跑过。

## 复现

在仓库根目录、Node 24 和既有依赖可用时运行：

```sh
node --import tsx scripts/prepare-qa-database-fixtures.mjs
```

脚本自建专属 PG17 容器与随机 loopback 端口，不使用环境中的 `DATABASE_URL`，不借用64550、55432或其他现有数据库；固定Docker socket，所有副作用限定带独立owner的资源。完成或失败均留自有 staging 记录并清理自身容器/卷。若改变源版本、独立台账或最终候选，按新材料重新审核，不能沿用旧审核或旧哈希。
