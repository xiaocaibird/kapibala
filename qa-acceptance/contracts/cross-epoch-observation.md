# INT-ACT-001 独立跨 epoch 取证契约

本适配对应原 A5.2 的累计活动最多 60000ms、停机不计、恢复继续累计，以及 A5.8 原 run 恢复。它只覆盖已有安全阶段屏障，不替代任意崩溃/未知副作用恢复验收，不给硬崩溃尾差增加容忍。历史报告不变。本批只有 QA 工具自测，未执行产品。

工程字段来源为 `docs/qa-cross-epoch-evidence-20261001.md`、`docs/qa-final-boundaries-followup-20261001.md` 的候选 2716abdd，以及随后 docs-only 的启动空档澄清和 `docs/qa-epoch-http-provenance-20261001.md`。QA 不导入工程 epoch-evidence 或采用其聚合结论。

## 身份、时钟与来源

- `clockObservation` 可选，但跨 epoch 校准必须提供真实应用 `applicationPid`、`clockDomain`、`clockUnit=ms`、本次实时 `monotonicMs`。
- `snapshotProvenance` 可选，跨 epoch 必须 `source=live-bridge`。`applicationStarted` 原样保留 `ps` 的 lstart 第四捕获组（含内部空格），不解析日期。`retained-after-process-exit` 只留历史，不校准。
- `epochObservation={continuous,startSource}` 与 `lastSuccessfulSample={epochId,windowMs,persistedActiveMs}` 均保留原值。缺项不伪造默认值；旧候选普通读取兼容，新增聚合缺证 BLOCKED。
- 同一 QA worker 生成唯一 `parentClockDomain`，每次 `snapshotMeasured` 记录完整调用前后 `performance.now()` 窗口。窗口包括传输、解析、校验及原证据落盘，允许保守变宽，不推测对称延迟，不减去 IO。
- 两次 kill 前 live 必须同 app/启动身份/epoch/clock、读数前进、事件前缀不可变。偏移分别为 `[p0-c,p1-c]`，取交集；不相交记 BLOCKED。两个 app 单调时钟原点可以不同。
- 真实恢复段须不同 app PID、guardian、clock、epoch，同候选/run/group/资源 owner。新进程 `includesUnsavedTail=false` 始终不改成 true。初始零 epoch 的 unknown/unwitnessed 查询不作为活动；实际 acquisition 后所有事件必须连续同 epoch，任何 ownership 缺段不得隐藏。

## 安全故障与真实退出

保留原 7 秒只读 turn、17 秒后请求屏障、5 秒停机。屏障必须 held、continuationDurable、remoteInFlightCount=0，独立 Agent 账本证明所有已发 turn 已完成；自有库只读确认 run/history/只读工具结果已提交且 inflight_turn=false。不得为制造更大尾差额外添加开发样本里的 155ms 等待。

应用身份另由真实 `ps` 核 PID、启动串、UID、PGID 及受控 guardian。仅调用本 QaEnvironment.kill，不向任意 PID 发信号。发出 kill 前至真实同一 app 身份消失/替换的父时钟区间包围退出；guardian 先退出不足以确认。全部原始 ps、请求、kill/退出、UTC TTL 边界留证。只有租约 TTL 内确认退出才满足本次安全故障前提。

`ownedStorage()` 仅向当前用例拥有的 PostgreSQL 发 `BEGIN READ ONLY` 和固定参数查询。`agent_runs.active_ms/history/inflight_turn`、`agent_steps` 为版本化 schema 的窄白盒诊断，不作为公共业务 oracle。退出后与重启前账本、最终账本全部留原值；相等只证明本次读取无变化，差异可能有迟提交，不能盲目归成停机活动。不得访问演示/生产库。

## 区间与实际阶段

旧段从真实创建到已核实 app 退出。新段从真实 clock-acquisition 到同 run/app/clock 的 `agent-termination-decided.decisionWindowMs`；保留同 attempt `agent-terminal-committed` 和 activity-terminal `activityEndWindowMs` 分段诊断。晚 COMMIT、公开终态读取或 finish 窗口下界不得代替真实停止决定下界。

各段使用保守区间差后相加。最终缺停止决定时，新段安全下界取0、activity-terminal仅作保守上界并保留缺证；历史active样本可能含停止后的记账，不能凭它或更晚terminal下界证明迟决定。运行中采样只有被随后完整live生命周期证明尚未stop，才可用active checkpoint安全下界提前检查超限；真实stop已出现时始终采用decision终点，不继续累计记账时间。真实 stop 已见但 COMMIT 缺失时，stop 的安全下界仍可检查硬上限，COMMIT 缺口不能掩盖超限。任何已证停止后派发、恢复暂停、真实公开错误/网关多余副作用先 FAIL。

退出至首次启动调用之前才是明确没有应用的停机。首次启动调用至实际 clock-acquisition 之间没有独立 inactive 见证：上界全额保守计入，不能由工程时钟接管点自行扩大扣除范围。两段已证下界超 60000ms 足够 FAIL，不因启动空档或缺账本/COMMIT退成 BLOCKED；两段上界在限内也不能单独全 run PASS。

最后成功采样指已收到回执，不是最后实际 COMMIT。采样→退出单列区间；未保存尾段 `[0,U]` 的 0 是未知下界，不表示没有丢失或批准固定误差。所有原字段、请求窗口、实际归属和派生算式一并保存。

## 结论及边界

- 已证真实活动安全下界 > 60000：FAIL。
- 连续性、身份、实际停止/同 attempt COMMIT、尾段来源等义务齐全，且包含未知启动空档的保守全程上界 ≤ 60000，并且独立恢复/公开/零副作用断言通过：可证明本例上限符合。没有“必须跑满 60 秒”的附加下界。
- 跨界、缺实际 exit/live 校准、跨父时钟、身份漂移、缺完整段、只有缓存、恢复后补读重建起点：BLOCKED；不通过缩窄测量区间、扣除初始化或读取 persistedActiveMs 变为通过。
- 使用同主机稳定速率单调时钟，实验期间不得休眠/切换时钟源；不声称适用于跨机、掉电或任意多 owner。
- 85 秒诊断观察及 5 秒生命周期补证等待是 QA 资源预算，不新增产品 SLA。finally 只释放本轮租约，首个业务失败与清理失败分别保留。
