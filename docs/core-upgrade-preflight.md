# 核心修复交付前预检与备份副本演练

记录时间：2026-10-01 03:32:18–03:32:20（Asia/Shanghai）。预演代码：`b36334428e6c51264f81c55f7c766c6e21804c70`，独立分支 `agent/core-upgrade-preflight`。状态：**只读预检与副本升级通过；真实演示尚未升级，也未停止。** 负责人验收和实际切换不由本记录代替。

脱敏机器记录见 [core-upgrade-preflight.json](evidence/core-upgrade-preflight.json)。原始需求文件、应用代码和演示运行清单均未修改；本分支只提交本文及脱敏摘要。

## 真实演示的只读观察

| 项目 | 本次观察 |
|---|---|
| 演示目录与磁盘 HEAD | `/Users/zcm/Desktop/kapibala`，`9087630de475a91fc6244c39cd08c6bc4dadb278`；与本次预演候选不同 |
| 既有清单的源码声明 | 后端 `7e83191fdbbc905cf975b28f101d5fe5d5128662`；前端 `393d43e295febab5527164c64b04af94e7554376` |
| 进程 | supervisor `21643`、simulator `21646`、API `21647`、Vite `21648`；均于10月1日00:02:35启动，预演前后PID/父进程/启动时间不变 |
| PostgreSQL | `kapibala-postgres-1`，17.11，宿主 `127.0.0.1:55432`，数据库 `kapibala`，卷 `kapibala_platform_db` |
| 数据库账本 | 001–006六条，尚无checksum列；messages尚无`message_sent_observed_at` |
| HTTP | API `3100` 与前端代理 `5173` 的health返回 `{ok:true,schemaVersion:6}`；预演结束API仍为6 |
| 活跃工作 | running序列0、running建群/其他jobs 0、running Agent runs 0、queued/accepted/unknown outbox 0 |
| 模拟器文件 | `.runtime/gateway.json`、`.runtime/agent.json`；实际模拟器进程未设置路径覆盖变量，使用默认路径 |

源码身份沿用既有运行清单声明，本次独立核对了进程、启动时间与健康，没有声称重建了驻留进程实际加载源码的全部内容。上述“无running”是采样结果；不能保证之后无人启动新工作。

## 本地备份与恢复

备份保留在主目录的 Git 忽略路径：

```text
/Users/zcm/Desktop/kapibala/.runtime/backups/2026-10-01-core-upgrade-preflight-50332a7554c740989a3f03b4dca6b1ed
```

目录权限0700，备份文件0600。保存数据库自定义格式dump、两个模拟器JSON、旧运行清单、archive列表、复现脚本及完整本地结果；未将dump、模拟器内容、会话token或完整业务数据提交到Git或输出。摘要仅含计数和哈希。

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| `database.dump` | 67863 | `d711e53c5ec20a3e8f0472b320cabf04449192d1ff2fde7c69209a9e12013013` |
| `gateway.json` | 22395 | `c38a12c3996b48f3af59103cf0483f9c079661d9e474abb1b3b50304011a4736` |
| `agent.json` | 31975 | `3686d7aa05c7b620cc1b5c3d5fa83fb64f4b2f4ffbcf402c61931a9499edc0af` |

`pg_dump -Fc --no-owner --no-acl`成功，`pg_restore --list`实际读取通过。随后在**自有独立PG容器、随机宿主端口52174、UUID数据库**中执行`pg_restore --exit-on-error`；没有在演示PG服务中创建恢复数据库。副本18张表（17张业务表和ledger）的行数与整行哈希全部匹配观察窗口内演示数据。

备份窗口前后，18张表摘要与两个模拟器文件哈希相等；演练结束再读演示亦相等。但服务保持在线，PostgreSQL事务快照和两个JSON文件没有共同的原子快照机制，**这不是已停写的最终回退备份集**。本次证明文件可恢复及候选升级可行；实际切换前仍须在所有写入者停止后重新备份并登记哈希。

## 副本升级与验证结果

副本始终未启动网关/自动化模块，`background:false`、`modules:()=>[]`；远端URL显式设为本机不可用端口1。没有连接演示模拟器、恢复业务调度或发起外部副作用。

1. 在恢复的旧六版副本上执行真实CLI：

   ```sh
   DATABASE_URL=<副本> node --import tsx scripts/baseline-legacy.ts --source=git:fa1baa7d7524bf16f379c9c2837fa8cc9ef0bcac
   ```

   固定发布清单与独立参考库结构匹配，记录来源/核验时间/结构摘要；基线完成后版本仍为6。摘要为`8dcbd355bde9d283034612c00f5f819a209adb588cd3ea18f33cf0d43f0a16bd`。只证明本次schema与可信发布结构一致，不证明历史SQL执行字节。

2. 另行执行`DATABASE_URL=<副本> node --import tsx scripts/migrate.ts`，应用007，账本达到7。
3. 逐表比较原有列的规范化整行摘要。17张业务表原有数据不变；前六次ledger的version/name/**微秒精度applied_at**不变。业务schema只多一个可空观察时间列，ledger增加五个完整性/来源字段；已有列定义不变。
4. 15条历史消息的`message_sent_observed_at`全部NULL，未把历史updated_at、送达确认或当前时间伪写为收到message_sent的时刻。
5. 创建不含业务后台模块的应用，在随机端口52183实际监听；health返回`{ok:true,schemaVersion:7}`。这证明启动校验和基础HTTP可用，不替代完整生产模块恢复验证。
6. 再执行迁移，所有18张表的**完整现行行摘要**和列定义均未变，含新ledger元数据及第7条记录。

摘要算法在PostgreSQL内对每行`to_jsonb(row)::text`排序、以换行连接后计算SHA-256，并记录行数。升级前后业务对比仅去掉新增message观察列；ledger仅对前六条投影原始version/name/applied_at。没有用毫秒精度JavaScript Date近似比较旧迁移时间。

独立UUID恢复库和基线参考库已删除，参考库残留数0；自有临时PG容器已停止并自动移除。演示容器、卷、服务及两个模拟器文件保留。

## 实际切换前提与回退范围

这些是后续操作者的执行边界，本轮未执行切换：

- 再次确认running序列、jobs、Agent runs、待发送outbox和在途调用；尤其旧序列须在旧版自然完成，007会拒绝仍有running序列的库，不能通过伪改状态绕过。
- 停止演示写入入口及旧后台进程，确认没有非协作DDL连接，再取得数据库、gateway、agent及旧运行清单的同一停写窗口备份。此次在线备份不能被自动视作切换时的最新状态。
- 先显式六版基线化，再普通迁移到7，最后启动已集成候选。基线需要CREATEDB权限及迁移/表锁；锁或结构校验失败应保留证据并停止切换。若目标已提交但参考库清理失败，错误会明确`targetCommitted`，不能据非零退出猜测目标回滚。
- 若实际迁移后需要回退，应先停新服务，再恢复相互匹配的**旧应用版本、数据库快照、gateway状态、agent状态及运行配置/清单**。只有回退代码会因严格版本策略遇到新库；只恢复数据库而保留更新后的模拟器状态也可能造成确认/去重/副作用认知不一致。
- 本轮验证了备份的实际恢复，没有提供或验证反向SQL迁移。恢复旧快照会舍弃快照之后的新写入；本地数据回退也不能撤销持久化边界之外已经发生的外部副作用。

真实演示仍是旧六版；实际切换、完整业务模块启动检查及负责人验收由协调者继续处理。
