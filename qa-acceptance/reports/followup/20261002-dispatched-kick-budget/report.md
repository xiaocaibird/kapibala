# 独立补充验收报告：原活动预算 × 已派发 kick

**结论：本次专项 BLOCKED；整体验收仍为 FAIL，上线准备度未评估。** 实际执行一条用例一次、零自动重试；本专项10项审定断言中7 PASS、3 BLOCKED（不另计为10条正式用例或全量义务）。这些断言通过仅限表中具体事实，不能把组合场景记通过。已签全量和差异报告的结果、计数及原件保持不变。

## 冻结范围与时间

产品 `8e047aea842bfcec64802e4918b52b460b93c48b`，实际执行 QA `60cd3dda117b9b38906902458175cd81bd42212a`；run `2026-10-01T16-42-20.128Z-67fb4dd4`。执行器保留 `developer-preflight` 原标签，QA 在此独立审定补证，不借改名升级为新版全量验收。

原运行 UTC 2026-10-01 16:42:20 至16:43:25，对应北京时间 **2026-10-02 00:42:20 至00:43:25**。真实隔离 PostgreSQL、单应用实例、独立网关/Agent；未写入活动计数、未改产品、未改外部协议、未调用付费真实模型。

目标 SHA256 `4ac2ac1d38208333653a6e5aadaecc46c6a0cf7c49ce92b082fe276d42bfd998`；子集 SHA256 `5d4a5ef7763424458ca420a49f36d6f0f8b39f8ad588b6f41ab4544924c55b73`。源冻结、授权绑定、命令、环境、原始结果和证据见[原运行归档](runs/2026-10-01T16-42-20.128Z-67fb4dd4/manifest.json)与[文件哈希索引](runs/2026-10-01T16-42-20.128Z-67fb4dd4/evidence-index.json)。

## 逐项判定

| 断言 | 结果 | 证据与边界 |
|---|---|---|
| SCOPE | PASS | 固定版本、单实例、新建原run、真实时间、零SQL活动计数注入；仅一次执行、attempt=0。 |
| CAPACITY | PASS | 真实准入拒绝且callbackEntered=false/remoteRequestCount=0；38–40秒活动窗口释放前零kick请求/效果。 |
| POST-EFFECT | PASS | 唯一kick POST #16实际收到并落地一次；效果观察保守上界4.386875ms；真实HTTP504已完成。 |
| CONFIRMATION-CROSS | BLOCKED | 唯一确认GET #17关闭早于实际预算决定映射下界4.508292ms，未建立仍在途跨决定的正证。 |
| ACTIVE-BUDGET | BLOCKED | 包含未保存尾段的活动区间[59999,60008]ms跨严格60000ms，且尾段暂停/continuous=false；不可判通过或活动超限。 |
| DECISION-COMMIT | PASS | 真实failed/wall_clock决定与同attempt外层COMMIT配对；仅证明决定和持久状态存在，不替代活动预算符合性。 |
| PUBLIC-UNKNOWN | PASS | 公开终态failed/wall_clock；原step审计pass、isError=false/errorCode=null、unknown说明诚实保留，群activeAgentRunId为空。 |
| FINITE-NO-REPLAY | PASS | 一次审计、一次turn、一次POST/副作用；实际stop后未见新turn，有限1500ms观察中未见重放；不外推永久保证。 |
| TRANSPORT-CAUSE | BLOCKED | GET关闭且未finish为实际传输事实；缺原请求取消来源，不能声明由预算主动取消，亦不新增取消SLA。 |
| CLEANUP | PASS | 自有进程/控制器/注册目录/端口退出，实际Mounts精确映射容器及匿名卷消失，cleanup.failures=[]。 |

## 首次失败归因与时序

原始执行 **FAIL** 原样保留：[原 JSON](runs/2026-10-01T16-42-20.128Z-67fb4dd4/results.json)、[原 JUnit](runs/2026-10-01T16-42-20.128Z-67fb4dd4/junit.xml)、[Playwright 原输出](runs/2026-10-01T16-42-20.128Z-67fb4dd4/playwright.junit.xml)。两个失败信息均来自共享 `assertNoRecoveryPause` 的原 A5.8 强恢复检查，发生在预算判断之前，不能称为两个新预算缺陷。该原强恢复要求及历史 FAIL 没有豁免或改签。

本专项未重启，原活动末段包含 `recovery-paused`，`continuous=false`；实际活动 `[59999,60008]ms` 下界未超过60000、上界跨界。真实创建到决定的同进程在线包络 `['60001.808250', '60007.374041']`ms只供诊断，包含暂停段，不能冒充连续活动超限。预算既不通过，也没有被本次证明失败。

真实成员确认 GET #17 未返回，父域关闭时间 `63009.885042ms`；真实终止决定映射包络 `[63014.393334,63045.845292]ms`。关闭早于决定下界 `4.508292ms`，两种正证都未成立。不得靠墙钟、poll点、close事件或未知的abort原因推导仍在途跨决定；取消原因细项也保留 BLOCKED。

QA 判定范围修正提交 `318cc3290ef31b73bdee015fc132163e48ff6298` 将本专项预算完整性与强恢复观察分开，共享强恢复检查未改；**修正后只执行工具校验，没有再次运行产品**。首次 source、所有原结果、失败及证据均保留。本报告由独立 AI QA 审定为 BLOCKED，修正源也不能被表述为产品复测通过。

## 清理与证据完整性

专属容器的实际 Mounts 与匿名卷已在运行时捕获；同 Docker engine 的结束快照证实精确容器/卷不存在。两控制器、registry、自有应用/guardian/worker与相应端口已退出，原 `cleanup.failures=[]`。共享 Docker daemon仍作为基础设施保留。详见[独立资源复核](resource-review/final-resource-review.md)。结论只覆盖本run，不追溯宣称全部历史匿名卷已被证明清理。

压缩包保留 **1411 个原字节文件**，归档时和报告生成时均逐项解压验证哈希；[独立实际结果复核](actual-review.md)与[判定 JSON](summary.json)、[审定 JUnit](reviewed.junit.xml)同时交付。审定 JUnit 的skipped明确表示BLOCKED，不表示未执行或通过；原失败 XML同时保留。

## 剩余事项与总体建议

[剩余事项](pending-items.json)记录交叉正证、真实活动精度/连续性及取消来源细项；未提出新业务时限或尾差容忍。运行中第二实例竞争、任意重启恢复属于本次未执行范围；本次没有新增真人IME/系统焦点证据。第二轮C1/C2及批准P0/P1另立准备分支，未启动其产品测试。

[已签当前交付验收报告](../../acceptance/20261002-current-delivery/report.md)仍为业务 FAIL。它的2716全量254条与8e差异51条统计不因本补充被重写；本次独立新增1 BLOCKED，不合并成新版全量通过。不建议无条件验收通过；产品修复、标准差异接受与正式上线决定继续分开记录。
