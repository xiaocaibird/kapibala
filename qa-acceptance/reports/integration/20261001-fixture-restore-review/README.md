# 两份 PostgreSQL 夹具独立恢复审核

2026-10-01。用户授权继续隔离联调及正式业务验收后，QA 独立恢复并审查了研发交付的两份归档。最终结论为 **制品审核完成、可接入固定候选**；本记录不是 `BLK-MIG-001`、`UI-037` 或任何产品验收用例的通过结论。

- 候选：`0af644334b00eb13e2e56df33c70f22358a6a0f7`。
- 成功审核：[原始结构化记录](89d4babeb7894a989528a777a3588418/review.json)，含执行时 QA 版本、脚本摘要、真实 PostgreSQL 版本、完整迁移校验值、数据、归档摘要和资源清理证据。
- 原始独立预期：[制作前台账副本](89d4babeb7894a989528a777a3588418/independent-ledger.json)。实际数据库查询仅核对制品，未用来反向生成未来 API 验收的预期。
- 最终配置：[fixtures.integration-0af6443.json](../../../config/fixtures.integration-0af6443.json)；目标接入片段：[fixture-binding.integration-0af6443.json](../../../config/fixture-binding.integration-0af6443.json)。配置摘要 `0bb67af0076509f218292cc72e500e191dfb2f8eeda3fdd9d3202a2f8c76c10a`。
- 原有 QA `loadArtifact` 已对两份最终配置、manifest、归档及候选绑定执行真实校验：[校验记录](binding-validation.json)。未启动应用、浏览器或协议桩。

## 实际核验

| 对象 | 独立核验结果 |
| --- | --- |
| 来源与候选 | 旧库来源 `3d7e4f4` 有 7 份迁移；微秒库来源 `4c035b8` 有 8 份迁移。每份文件 SHA256 与恢复出的 `schema_migrations` 逐项相同。候选与微秒库来源的完整 `db/` Git 树无差异。 |
| 官方恢复 | PostgreSQL 17.11，固定镜像摘要；新建空库使用官方 `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`，退出码均为 0；没有对恢复库执行迁移。 |
| 结构与全量数据 | 恢复后的官方 schema-only/data-only dump 摘要与研发导出源记录完全相同，只规范化 PostgreSQL 的随机 restrict/unrestrict 包装 token。原始 SQL 和归档目录均保存在成功审核目录。 |
| 合成账号 | 两库均为 `account-1..6`，全部 idle，platform_user_id/rate_limited_until 均为 null。 |
| 无待执行工作 | schema7 除迁移记录及 6 个账号外无业务记录；schema8 再含 6 个指定群。jobs、messages、members、Agent/序列运行与步骤、send keys、事件、会话/token、快照等所有其他业务表为空，schema8 receipts 也为空。 |
| 微秒数据 | 6 群 ID、名称和微秒精度分别与预置台账逐项相同；时间为 1/2/2/3/4/4 微秒，正反向 pageSize=2 均跨越完全同时间及同毫秒不同微秒边界。群 active，agent/autoKick 均关闭，description 为 null，creator 为 account-1。 |
| 非预期对象 | 仅 public 用户 schema、plpgsql 扩展；无 public 函数、用户触发器、事件触发器及 foreign server。业务表集合严格匹配已审核版本。 |
| 隔离及清理 | 新容器带本次唯一 owner；network=none，无发布端口及宿主 bind mount。清理前核对相同容器 ID/owner，删除本次数据库后确认无残留库/会话；`docker rm --force --volumes` 后确认相同容器及匿名卷均不存在。 |

两份最终 manifest 的 review 是本次真实审核记录，候选绑定均为上述 SHA。研发原始 preparation 文件未修改，仍保留 `candidateRevision=null`、`review=null`。正式 manifest 和归档存放于 `fixtures/20261001-0af6443/`。

## 首次问题及重试保留

没有把重试后的成功伪装成首次成功：

1. [473a5e…](473a5e58e2154a09a3a687bf0795d68b/review.json)：QA 审查脚本从 QA 子目录查询 Git 文件树时未指定 full-tree，错误得到空迁移列表，准备阶段停止。此时没有创建容器、数据库或卷。修正为从仓库根执行 Git 并明确 full-tree。
2. [643457…](643457054808480d94ea05fc759d4946/review.json)：两库恢复及内容核验均完成，但清理判断对 Docker 的 `no such object` 大小写处理不兼容，记录为 BLOCKED。容器和卷实际已删除；保留原结果，另留[只读复核](643457054808480d94ea05fc759d4946/cleanup-followup.json)确认二者均不存在。修正判断并增加原始诊断取证后重做独立恢复审核。
3. [89d4ba…](89d4babeb7894a989528a777a3588418/review.json)：修正后完整恢复、内容审核及清理全部完成。执行脚本精确快照保存在该目录的 `review-script.py`；根目录 `review-fixtures.py` 为当前审查配方。

上述问题属于 QA 审查工具；没有启动产品，未形成或覆盖任何产品失败/通过结果。再次运行配方会创建新的隔离资源并重写最终绑定，因此必须在相应执行授权范围内进行，随后重新冻结目标摘要。

## 剩余边界

制品审查确认归档在静态恢复时无待执行工作。候选实际启动后是否正确拒绝旧 schema、目录公开字段/排序是否正确以及是否确无外部写入，仍须由正式用例运行判定。公开诊断片段的来源是研发旧库拒启原始记录，并非本次重新启动候选所得。

资源提醒页面的 `observation` 仍为 null，本次未审查页面定位。后续如合入页面审核结果，会改变 fixture 配置字节和摘要，必须重算绑定并重新冻结目标；已有数据库 manifest 无需因纯页面定位变化重新制造。
