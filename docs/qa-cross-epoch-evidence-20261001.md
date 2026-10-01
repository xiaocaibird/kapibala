# 活动计量跨进程补证与接入说明

2026-10-01；实现基线 `92ddc1d`，工程观察增量源码 `b462a86`。本轮仅补充开发观察入口、证据聚合及验证，不修改自动化业务源码、60000ms / 5000ms 标准、独立 QA 用例或断言，也不增加外部服务能力。D040 的硬崩溃残余尾差决定保持不变。

## 结论范围

INT-ACT-001 历史报告缺少旧进程最终尾段与跨 epoch 关联，仍保留原来的 BLOCKED；不能从旧文件追溯出当时没有采集的实际退出时刻或时钟映射。本次提供重新取证的最小接入方式，最终独立 QA 状态由 QA 在固定候选版本上复测后决定。

新证据将三件事分开：

1. 当前进程是否从本次 ownership epoch 的真实起点持续观察到终态；
2. 旧进程最后收到成功回执的采样，距离真实 SIGKILL 退出有多长；
3. 两段已验证的活动窗口相加后，是否越过原 60000ms 上限。

开发证据管道测试通过只说明这些观测及拒绝条件正确，不代表原业务时限通过。恢复进程的 `includesUnsavedTail` 仍为 `false`，不会把全 run 的完整性伪装成单个新进程自己的事实。

## 对 QA 公开的最小增量契约

沿用 `scripts/qa-observation-server.ts`（或现有独立 runtime 入口）、`/qa/runtime/v1/leases/:id`、`qa-runtime-observation/1`、现有 mode/target/correlation/TTL。观察器仍在模块 recover 前注入。增量字段由服务端产生；客户端不能在严格请求 schema 中传入它们。

| 位置                     | 字段与含义                                                                                                                                            | 校验要求                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| activity snapshot 顶层   | `clockObservation={clockDomain, clockUnit:"ms", applicationPid, monotonicMs}`                                                                         | 每次真实 app snapshot 调用读取一次本进程 `performance.now()`；不是 event 的历史时间，也不是 guardian 的时间                                            |
| controller snapshot 顶层 | `snapshotProvenance={source, applicationPid, applicationStarted}`                                                                                     | `source=live-bridge` 仅表示本次从真实私有 bridge 成功取得；死亡后的缓存返回 `retained-after-process-exit`，原 clock 和 events 不变                     |
| activity event           | `lastSuccessfulSample={epochId, windowMs:[before,after], persistedActiveMs}`                                                                          | 指最后收到成功回执并通知观察器的原业务采样；SQL 可能已提交但进程来不及通知，因此它不能自称最后一次实际数据库提交                                       |
| activity event           | `epochObservation={continuous,startSource}`                                                                                                           | `run-creation` 仅由真实创建挂点建立；`clock-acquisition` 仅由真实接管重置挂点建立；补读行/中途才观察为 `unwitnessed`。clock/run 所有权丢失使连续性失效 |
| 既有字段                 | `epochIds / creationOrEpochStartWindowMs / activityEndWindowMs / applicationPid / clockDomain / includesUnsavedTail / observedEpochActiveMs / events` | 含义、不可变事件前缀和不完整标记保持不变                                                                                                               |

控制器判断 app 已退出后仍可返回历史快照，但缓存不能用于本次请求的时钟校准。bridge 断连、超时而原 app 仍活着时，返回错误，不以缓存伪报退出。进程身份使用现有受控 registration 的 app PID 与启动身份；`binding.pid` 仍为 guardian PID，二者不能混用。

`snapshotProvenance.applicationStarted` 的 JSON 类型为 **string**，保留 `processIdentity()` 执行 `ps -p <pid> -o ppid=,pgid=,uid=,lstart=` 后匹配出的 `lstart` 原文。它不是 ISO 日期或 Unix 毫秒，不应经 `Date.parse` 用于活动计时；用途是和 registration 的 `appStarted` 逐字比较，配合 PID、uid 和进程组校验身份。`live-bridge` 与 `retained-after-process-exit` 都使用同一注册字符串。直接应用 IPC 的 minute-profile 没经过 HTTP 控制器，因此没有此 provenance；不得为其补造该字段。

固定候选 `2716abd` 的[真实 HTTP 字段样例及取证](qa-epoch-http-provenance-20261001.md)已补齐，包含实时与 app 退出后保留的响应、原始响应头和 `ps` 输出；身份令牌已脱敏。这是序列化与传输证据，不是全程计时通过证明。

QA 若使用会剔除未知字段的 Zod schema，应由 QA 自己更新观察数据适配层，保留上述增量字段及原始响应；这不改变业务断言。没有收到这些字段的旧候选不能用默认值补造连续性或校准。原始样本、snapshot 请求前后窗口和 kill/exit 记录必须保留，不能只保存聚合结果。

## 重新取证步骤

1. 使用同一外部父进程及唯一 `parentClockDomain`，其 `performance.now()` 贯穿整个实验；保存被测提交、真实 app PID/启动身份、guardian 身份及所有权依据。
2. 沿用 INT-ACT-001 的 7 秒只读模型轮次、17 秒后准备安全屏障及 5 秒停机。屏障必须真实 held，`continuationDurable=true`、`remoteInFlightCount=0`；远端流水独立确认在途模型轮次已完成，数据库确认原 run 和只读工具结果已持久化。本次开发一分钟样本在 held 后额外保留 155ms 再取 kill 前快照，以暴露非零采样尾段；这段仍计活动时间，不能声称与 QA 原用例逐时间指令完全相同。
3. 在 kill 前发 GET：父进程先记录 `p0`，收到完整响应后记录 `p1`。只接受 `live-bridge`，保存其中的 app 单调读数 `c` 和时钟域。再读一次应仍为 live 且单调读数前进；不要将 kill 后的 retained 快照用于校准。
4. 在同一父时钟记录发出 SIGKILL 前的时刻，并记录**真实应用进程**退出被观察到的时刻，形成保守退出区间。若父进程直接拥有 app child，使用其 `exit` 事件；若 QA 杀的是 guardian 进程组，还须确认已绑定 app 身份消失或被替换，不能仅凭 guardian exit 宣称 app 已退出。保留核查方式和原始结果；确认杀进程发生在安全租约 TTL 内。
5. 退出后独立查询 `active_ms`；停机 5 秒后再次查询，验证账本未因停机前进。这是持久数据证据，不替代真实活动计时。
6. 启动新实例并保存父时钟启动窗口，在其仍活动时建立 observe lease。终态 snapshot 必须有真实 `clock-acquisition` 起点和连续观察标记、不同的 app/clock/epoch 身份、相同 group/run、真实终态窗口。若恢复先结束而观察器已释放其无租约记录，后补查询只会得到 `unwitnessed`，必须拒绝聚合。
7. 保存终态 live snapshot 的请求前后窗口，进行独立时钟映射及区间运算。核对无 recovery pause、无未观察到的 ownership 变化，以及无额外网关操作。再由 QA 按原标准下结论。

## 区间计算与假设

`scripts/qa-runtime-observation/epoch-evidence.ts` 是可复用的纯证据计算器，不改租约、运行、预算、账本或历史事件。每次校准的偏移区间为 `[p0-c,p1-c]`，从而把 app 本地边界 `[a,b]` 映射成 `[a+p0-c,b+p1-c]`。它不假定不同进程的 `performance.now()` 具有相同原点，也不假定请求和响应耗时对称。

计算器要求同主机、稳定速率的单调时钟、每段一个持续观察的 owner，期间没有系统休眠/时钟源切换。它不是异机时间同步方案，也不对任意掉电、主机失联、多个 owner 的片段自动补全。

旧活动段从实际创建窗口到外部退出窗口；新活动段使用同一新进程时钟中的真实接管起点和终态窗口。二者相加得到这两段已观察活动的区间。退出到新 epoch 接管之间原字段仍为 `excludedBetweenEpochsMs`；**该名称仅表示未纳入两段求和，不是已证明符合原文的停机扣除**。其中既有明确停机，也有启动/接管准备，不能整体默认不计活动，不能把它笼统写成精确的 5000ms 停机。

### QA 接入复核后的范围澄清

原文第 258 行要求“重启后从恢复时刻继续累计，停机时间不计”。当前材料没有启动/初始化整个区间的独立 `inactive` 见证。源码表明 `Agent.recover()` 首先等待 `ActivityClock.start()`，`Agent.tick()` 同样先等待该时钟才进行扫描与派发；时钟先获锁、重置计量基点并提交，再通知 `clockAcquired`。这是当前实现的顺序，不能用它自行把原文中的“恢复时刻”定义为最后的接管挂点，也不能把无模型请求当作无活动时间。

对原始一分钟样本的[只读区间拆分](evidence/qa-epoch-gap-clarification-20261001.json)显示：实际旧应用退出被确认后，至请求启动新应用前，明确无该应用进程的区间约 5004.32ms；请求启动到已记录接管挂点的区间约 `[188.92,190.70]ms`。后者包含初始化且没有整个区间均可排除的证明。派生记录保存原始文件哈希、父时钟边界与计算方式，不改写原始 JSON。

因此，已观察的两段活动**下界大于 60000ms 仍足以证明超限**；若两段上界未超过 60000ms，只能说这两段在内，不能推出完整 run 通过。计算器的 `budget60000="within-observed-interval"` 必须按字面理解，不能映射成业务 PASS。QA 分开保留明确停机和初始化/接管未知段；没有证据的部分继续不完整，无需增加业务假设或让负责人重复决定。若计算全程保守上界，可以将尚未证明可扣除的初始化段全部计入，只扣除明确无该应用的时段；这只是上界计算，不是宣称真实初始化均应计费，也不是改变原文计时起点。

`lastAcknowledgedSampleToExitMs` 给出最后已确认采样到退出的区间。`unsavedTailMs=[0, upper]` 是保守未知范围：0 仅表示期间可能另有已提交但未通知观察器的采样，**不表示未保存尾差已消失**。退出后的账本若大于最后已确认值，仍保留真实数值，不强行倒算精确尾差。D040 允许的残余误差与测试测量窗口是两件事；后者不能成为业务上限容差。

计算器拒绝跨 run/group、PID 或 clock 身份不符、同 epoch、父时钟不同、缓存校准、缺少已确认采样、重建起点、ownership gap、recovery pause、逆序/重叠边界等输入。它没有把返回 `activeElapsedMs` 或 `budget60000` 写回产品或 QA 原报告。

## 验证材料

[最终专项日志](evidence/qa-epoch-followup-20261001/focused.tap) 在 `b462a86` 上 **17/17 通过、无跳过**，包括真实 HTTP 字段透传/缓存来源/活进程断联、既有活动挂点、跨域区间和拒绝反例、短 SIGKILL、真实一分钟与恢复先结束后取证。该通过数是开发观察机制的自测，不是 QA 业务用例通过数。[共享控制器回归](evidence/qa-epoch-followup-20261001/controller-regression.tap) 在 `e6a90b4` 上 **11/11 通过**；此后改动仅加强活动段连续性，没有修改 controller。TypeScript 服务端/脚本/测试检查、限定文件格式检查和 diff 检查通过。

[一分钟原始证据](evidence/qa-epoch-followup-20261001/minute-profile.json) 保留父进程原始请求窗口、两侧完整 snapshot、逐次采样、实际 child exit 事件窗口、远端轮次流水和持久账本。以下区间向外取整到 0.01ms：

| 观测                              | 本次结果                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| 旧 epoch 活动                     | [21250.92, 21266.95]ms                                      |
| 新 epoch 活动                     | [38931.20, 38935.68]ms                                      |
| 两段相加                          | **[60182.13, 60202.63]ms，严格超过 60000ms**                |
| 最后收到成功回执的采样 → 实际退出 | [179.76, 191.26]ms                                          |
| 仍未能精确确定的未保存尾差        | [0, 191.26]ms；下界 0 是不确定性，不是零丢失结论            |
| 未纳入两段求和的退出 → 新 epoch 接管 | [5193.24, 5204.83]ms，含明确停机及未证明可扣除的初始化     |
| 退出后 / 重启前账本               | 两次均为 21076ms，停机未增加账本                            |
| 最终账本及真实终态                | 60009ms；failed / wall_clock；recoveryNote=null；无网关操作 |

这些数值证明本次受控样本的证据链能够给出明确区间，也表明严格时限仍未满足。它不能自动区分每一毫秒超限来自采样尾差还是其他收尾耗时，不能推断任意硬崩溃的固定误差上限。后续整合到新的产品时限修复后，QA 应针对新候选重新取证，不能把本分支较早产品基线上的结果改写成新版结果。

[清理记录](evidence/qa-epoch-followup-20261001/cleanup.json) 确认 UUID 测试库/连接均为 0、实际应用进程已退出、自有容器及卷和本工作树依赖软链接已移除。原始需求 SHA-256 保持 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。未写演示或独立 QA 目录。全部文件哈希与阶段见 [索引](evidence/qa-epoch-followup-20261001/index.json)。

旧观察文档及沿用测试日志中的“QA 不接受 includesUnsavedTail=false”文字属于历史阶段；后续联调已经允许保留不完整标记。本轮新增字段仍需 QA 自己适配保留，不能用那段旧文字代替当前接入核对。初稿记录以 `draft-` / `pre-pause-guard-` 前缀保留，仅用于解释复核过程；不能替代最终候选证据。

初稿 HTTP 断联注入尝试改名 Unix socket，但已有 keepalive 连接仍正常服务，实际返回 200。该开发测试的“应断连”前提不成立，已经改为明确 SIGSTOP 实际 app，使 bridge 超时后验证 app 仍存在，再 SIGCONT 恢复；未改产品状态或放宽业务断言。独立复核还指出“恢复先结束后 arm”可能重建近零段，最终实现新增 `epochObservation` 并用真实恢复负例拒绝此类聚合；恢复暂停会永久标记该段不连续，即使其他 lease 保留记录且新 lease 只看到后来终态，也不能遗漏该暂停。

本轮只使用自有 PostgreSQL 容器及 UUID 测试库、受控本地模型替身和显式观察入口；不触碰演示数据、真实模型或密钥。测试结束清理进程、UUID 数据库、容器和依赖软链接，具体资源身份另存清理记录。
