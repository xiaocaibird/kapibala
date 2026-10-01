# 已派发 kick 预算专项：实际结果独立复核

**建议签发为独立补充 BLOCKED；原始 FAIL 保留，整体验收仍为 FAIL。** AI QA只读复核首轮原档，没有重新执行产品或代签真人。1条用例、1次执行、attempt=0，执行QA `60cd3dda`、产品 `8e047aea`。10项审定断言为7 PASS / 3 BLOCKED，仅表示各自事实，不是10条正式用例，也不是组合通过。

## 时限与首次失败归因

原始两条失败来自共享 `assertNoRecoveryPause` 的A5.8检查，预算比较尚未执行。本例无重启，不能写成两个新预算缺陷；原强恢复标准及以前已签FAIL不变。专项审定为BLOCKED，并未改成PASS。

同一实际应用PID `33699`、guardian `33698`、原run `da392c93-db91-4d45-bf6f-a4a4d321ca5c`、唯一epoch `6087de17-4363-4654-a905-bf5abdb1a1bc`；lifecycle sourceSeq 1–5完整无丢失。活动terminal为 `[59999,60008] ms`，includesUnsavedTail=true，但尾段 recovery-paused、continuous=false。全部可信活动下界最大59999，无超60000的安全下界；上界跨界也不能判符合。

起止包围几何差 `[59999.129208, 60007.215958] ms` 同样跨界，不用持久量59956补真值。创建至实际决定在线包络 `[60001.808250, 60007.374041] ms`包含暂停尾段，不能冒充连续活动超限。决定与外层COMMIT同attempt `acb44504-323e-4e2a-96ad-a4bea5d91bbd`、seq5→6；COMMIT晚 `[3.823209, 3.831917] ms`，仅证明配对和持久状态，不补造晚停止。

## 真实派发、交叉前提与取消归因

真实容量拒绝时callback未进入、remoteRequestCount=0；释放时活动 `[38213,38219] ms`。随后唯一POST #16、审计、turn、远端kick效果各一次；效果观测上界 `4.386875 ms`，远端两秒收敛保证未被破坏。504在活动 `[43146,43152] ms` 才放行并真实finish。

成员GET #17接收于父时钟48343.176125、关闭于63009.885042 ms，持续 `14666.708917 ms`，closed-before-finish=true。两次live应用校准交集将真实停止决定映射为 `[63014.393334,63045.845292] ms`；GET关闭早于决定下界 `4.508292 ms`。直接“已见决定仍pending”和映射交叉两种正证都未成立，故交叉BLOCKED。

关闭本身不证明预算主动abort；在途时长少于15000ms，也不能断言普通15秒超时。取消来源仍缺证，不新增取消SLA。cleanup释放屏障后账本的responseStatus200/completedAt没有对应finish，不能写成应用收到了成员200。

## 公开状态、有限无重放与归档

原 `api.ndjson` 第1118行返回原run failed/wall_clock、审计pass、isError=false/errorCode=null及unknown说明；第1116行群activeAgentRunId=null。未知没有被伪造成工具失败或成功。已发POST的原effect只发生一次，不按完成时点误报新增迟派发。

停止后实际有限观察11次，首个响应后至末次请求前至少 `1522.831916 ms`，没有新turn/审计/POST或第二个效果；不外推永久不重放或任意重启正常结束。

1411个归档成员逐项解压SHA核对通过；manifest/results/events/runner与交付原件逐字节一致，runnerErrors和integrity为空。cleanup.failures=[]；归档资源复核精确关联本例容器、匿名卷、两个控制器及进程端口并确认退出。本审阅没有重查活体或操作资源，不扩展到历史卷。

QA归因修订318cc329后仅工具7阶段、309自身测试通过，没有再次运行产品。已签254条全量及51条差量报告SHA未变。第二实例、任意重启、真人IME/焦点/完整UX、上线评估仍属未执行范围。

[结构化复核](actual-review.json)保留精确身份、十进制区间、API行号、原档成员及文件SHA。[当前专项报告](report.md)和[判定JSON](summary.json)的BLOCKED与7/3分项及审定JUnit一致，建议按这些限制签发；不建议产品无条件通过。
