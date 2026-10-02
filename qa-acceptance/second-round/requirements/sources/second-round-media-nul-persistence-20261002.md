# C1：含 NUL 媒体来源的消息持久化修复

2026-10-02。固定开发提交 **`6fd14f8f2ea019fd25e8ff64683fd68d2ad698e6`**，基线 `771e44e2db4b539daf65e0041059a4d45394f3b8`。本项只处理媒体来源字符串含 U+0000 时整条消息无法保存的问题，不改变外部协议、下载许可范围或首次来源去重规则。QA 第四批复测由 QA 独立执行，本报告不代签通过。

## 原因与修前事实

来源校验已经拒绝原始控制字符，但接收事件先把来源写入 PostgreSQL `jsonb` / `text`，尚未到下载校验就会失败。真实 PostgreSQL 17 与 SSE 复现表明：原始 NUL 来源对应的事件、消息、媒体行全部回滚；重试两次仍不能保存，合法前后消息正常进入。独立 SQL 探针返回 `22021`（text 的 0x00）及 `22P05`（jsonb 不支持 `\u0000`）。不能把“没有下载”误写成消息处理已成功。

原件保存在 [before-stdout.json](evidence/media-nul-persistence-20261002/before-stdout.json)、[before-reproduce.mts](evidence/media-nul-persistence-20261002/before-reproduce.mts) 与对应运行、环境、清理记录中。该复现脚本退出 0 表示完成故障观察，**不代表产品通过**。`before-verification.json` 证明所测 gateway、media 与迁移源码字节等同基线；`before-SHA256SUMS` 保留原始证据校验。

## 实现与记录格式

1. 对原始含 NUL 的 `mediaUrl`，在事件和消息 JSON 中保留明确的 `rejectedMediaSource` 见证：`reason=UNTRUSTED_MEDIA_URL`、`encoding=json-string`、`value=JSON.stringify(原始来源)`。字段保存的是可逆编码，不把非法来源改造成合法下载地址。
2. `media_files.source_url` 使用固定不可下载占位值 `untrusted-media-source:raw-nul`，直接记录 `unavailable`、`UNTRUSTED_MEDIA_URL`、`attempts=0`，文件路径为空。没有代码把该占位值解码后重新下载。
3. 正常来源继续保存原 `mediaUrl`。字面占位字符串、字面 `\\u0000` 与 `%00` 不等于原始 NUL；按各自原有校验处理。外部事件不能伪造内部见证字段。
4. 同一消息首次来源继续有效：非法先到、后到合法来源不会改写为可下载；合法先到、后到非法来源也不会覆盖已有文件、正文或身份。已有事件重复与事务失败重试仍走原路径。

无新增迁移。仅修改 gateway 事件保存、媒体登记两个产品文件，增加一个开发集成测试。原始需求文档未修改。

## 固定提交开发验证

| 验证 | 结果 | 实际覆盖与限制 |
|---|---|---|
| `media-nul-source.test.ts` | 1 PASS | 真实 loopback SSE → 真实 GatewayEvents → PostgreSQL；3 个真实 worker 子进程处理文件。正文、身份、可逆见证、零非法下载、重复事件、两方向同消息首来源、正常前后附件均有断言；临时 SQL trigger 产生真实持久化失败，解除后验证原重试恢复和再次重试无变化 |
| `media-source-url.test.ts` | 3 PASS | 保留上一项 17 类非法原始来源、合法相对形式及真实 worker 出口证据 |
| `media-files.test.ts` | 20 PASS | 既有下载、大小/重定向/超时、去重、清理、引用保护与真实 worker 崩溃恢复 |
| 上述组合 | **24 PASS / 0 FAIL / 0 SKIP**，约 46.55 秒 | 固定同一提交、串行测试文件；不是全项目回归或独立 QA 验收 |
| `npm run typecheck` | 退出 0 | 类型检查及职责边界检查 |
| `npm run verify:original` | 退出 0 | 原文 SHA-256 仍为 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75` |

NUL 测试实际 HTTP 附件请求仅有 `/media/ok-start` 和 `/media/ok-end`，两个文件字节均为来源返回内容，目录最终仅两份文件。含 NUL 的首事件及其重复事件都可保存；故障注入后的新增 NUL 消息只在解除故障后保存。没有把解析器截掉非法事件或直接注入数据库当作成功证据。

测试通过真实 SSE 接收，但仍是开发夹具创建真实模块，而非标准完整应用 main。后台下载使用真实既有 worker 子进程。未据此宣称覆盖任意外部出口或关闭其他恢复限制。

[after-media.tap](evidence/media-nul-persistence-20261002/after-media.tap) 是未经改写的完整输出；[after-media-run.json](evidence/media-nul-persistence-20261002/after-media-run.json) 记录命令、源提交、起止时间与退出码；[verification.json](evidence/media-nul-persistence-20261002/verification.json) 记录产品、测试及原文哈希，均与固定提交一致。

接手自测后的第一次执行遗漏专用 PG 连接密码，测试在数据库连接初始化失败，runner 留有句柄；只终止该次自有 runner 与子进程。原日志、退出码保存在 `setup-auth-failure.*`，原因及 PID 在 `setup-connection-failure.json`。随后从 owner 已核对的专用容器读取连接配置后重新执行，未改产品或断言。此项是环境配置失败，未算入 24 项通过，也未覆盖原日志。

复跑命令（连接参数由执行者自有隔离 PostgreSQL 提供，测试创建/删除 UUID 数据库）：

```sh
DATABASE_URL='<owned isolated PostgreSQL connection>' \
  node --import tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/integration/media-nul-source.test.ts \
  tests/integration/media-source-url.test.ts \
  tests/integration/media-files.test.ts
npm run typecheck
npm run verify:original
```

## 资源清理与交付边界

本次复用交接时已创建的专用 PG，完整容器 ID `9aafa0653c2622014fe43777cf113da8b08266591e1c39ae291515107b69424c`，owner `8f16069a-dbbd-4141-a5c2-cd6c2a87342f`，loopback 端口 `55843`。停止前再次核对 owner 与端口，确认无其他活动客户端，仅按该完整 ID 清理容器和其唯一匿名卷；容器、卷与从最终测试输出提取的 25 个目录均确认不存在，见 [cleanup.json](evidence/media-nul-persistence-20261002/cleanup.json)。

接手时已有一个 UUID 测试库 `kapibala_test_3086be3178674bf69652d40de13b751a`，最终通过组创建的数据库均自行清理；该先前残留库随这一个自有容器销毁，单独列明，不将其误写为清理前库数为零。修前复现的另一容器、卷和目录已由原工作线清理，原清理证据保留。

未读模型 Key、未修改 QA 目录或 main、未变更演示环境。交付源码与文档供负责人集成，QA 在最终固定候选独立复测。本次若仍不通过，按用户最新边界保留结论并出报告，不自行开启更多修复循环。

本报告与目录内证据通过 [SHA256SUMS](evidence/media-nul-persistence-20261002/SHA256SUMS) 校验；该索引不自引用。
