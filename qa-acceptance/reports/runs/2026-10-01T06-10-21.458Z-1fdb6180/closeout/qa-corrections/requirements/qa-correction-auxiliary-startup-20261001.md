# QA 辅助启动环境与空 schema 诊断修正

2026-10-01，独立 AI QA。此记录为 QA 工具修正及公开诊断适配审核，不是产品验收 PASS，不改写已有运行结果。

主环境已注入观察器 registry 和随机资源 token，但 `launchOwnedDatabase` 和 `FixtureCandidate` 的辅助进程此前缺失这些环境变量。使用显式观察入口时，BASE-001、BLK-MIG-001、UI-037 没有真正触达相应业务窗口。辅助启动现注入三个经验证的 registry 和自有 token；数据库必须属于当前 cluster，端口、数据库和外部桩地址由 QA 设置。旧运行不追认通过。

BASE-001 旧脚本无论空库为何退出最终都 BLOCKED。现在以所有者限定的拒启探针记录清理前的自行退出结果，再停止自有进程、刷完日志。QA清理信号不能成为产品自行拒启证据。

## 公开诊断适配审核

本记录确认 `config/fixtures.integration-0af6443-startup.json` 的 `unmigratedSchema`，只绑定 `0af644334b00eb13e2e56df33c70f22358a6a0f7`。旧配置及运行快照保留；使用新配置须另冻结其SHA和目标授权，后继版本不得自动继承。

- 原要求是未迁移schema拒绝启动，没有指定固定错误码、退出数字或版本标识类型。
- 候选公开交接 `docs/qa-integration-handoff.md` 明确迁移后health的 `schemaVersion=8`，并指向 `Schema mismatch:` 诊断的审核。
- 固定候选 `apps/server/src/core/migrations.ts` 静态确认空库无迁移ledger时的对外文字为 `Schema mismatch: installed=0, required=8; run npm run db:migrate`，`db/migrations` 为001至008。这只用于识别已有公开诊断，不导入业务代码，不凭源码推定实际拒启。
- 新配置保留原0af归档和页面绑定，只增加上述精确文字与迁移库对照版本；整体SHA受 `adapters.fixtureArtifacts` 和目标授权指纹约束。

只有本次实际同时观察到以下事实才PASS：相同候选/命令在迁移库探针前后健康且版本符合审核profile；新建空库未健康；候选在QA清理前自行退出且无终止信号；完整日志命中明确空schema诊断。空库健康为FAIL。缺profile、缺退出、外部信号、普通依赖/监督器/数据库连接崩溃、健康超时或对照不符均不能PASS；保留证据并BLOCKED待归因。

`startupTimeoutMs` 仍只是观察预算，不新增业务拒启SLA。本例不代替历史库拒启及结构/数据不变检查，不要求新增错误码。

## 工具自测边界

`tests/self/auxiliary-startup.test.ts` 只使用临时自有Git仓库、专属mock工作树、Node子进程及QA模拟器，没有产品导入/启动、PostgreSQL、Docker或浏览器。真实mock子进程核对三个registry、自有token摘要、数据库及端口；环境中伪造registry和额外秘密不能透传。临时授权只绑定mock仓库，测试后清理。

裁判覆盖明确拒启、泛化崩溃、外部信号、运行超时、错误对照、候选及配置哈希漂移。挂起mock被清理后仍保留清理前 `exit=undefined`。初次工具测试因mock夹具未启动QA模拟器失败，修正自测前置后复验；这不是产品失败。最终检查结果由本次工具输出记录，不预填产品结论。
