from pathlib import Path
import json,datetime,hashlib,shutil,xml.etree.ElementTree as ET
q=Path.cwd();o=q/'reports/followup/20261002-first-round-observation-retest';r=q/'reports/preflight/2026-10-01T18-39-27.933Z-15f16ec6'
m=json.loads((r/'manifest.json').read_text());runner=json.loads((r/'runner-summary.json').read_text())
archive=json.loads((o/'original-file-index.json').read_text())
latest=json.loads((o/'tooling/post-run-correction/checks.json').read_text())
if len(latest)!=5 or any(c['exitCode'] for c in latest):raise RuntimeError('QA checks not complete')
selflog=(o/'tooling/post-run-correction/test-self.log').read_text(); import re
selfcount=int(re.search(r'ℹ tests (\d+)',selflog)[1]);selfpass=int(re.search(r'ℹ pass (\d+)',selflog)[1])
if selfcount!=selfpass or 'ℹ fail 0' not in selflog:raise RuntimeError('QA self checks not passing')
refs={}
for p in r.glob('artifacts/*/evidence/*.json'):
 if p.name in ['dispatched-kick-observation-final.json','delivery-read-causal-save-rollback.json','delivery-read-causal-raw-database-observation.json']:refs[p.name]=str(p.relative_to(q))
kick=json.loads((o/'kick-independent-adjudication-final.json').read_text());save=json.loads((o/'save-independent-adjudication.json').read_text())
assert kick['claims']['KB-CROSS']['status']=='PASS' and kick['claims']['KB-CANCEL']['status']=='PASS' and kick['claims']['KB-ACTIVITY']['status']=='FAIL'
assert save['caseStatus']=='BLOCKED'
cases=[{'id':'INT-KICK-OBSERVATION-001','requirements':['R-A5-06','R-A5-09'],'rawStatus':'FAIL','reviewedStatus':'FAIL','reason':'Continuous original activity prefix [60007,60016]ms exceeds strict 60000ms; original CROSS/CANCEL proved from same raw run','evidence':refs['dispatched-kick-observation-final.json'],'defect':'QA-01F-ACTIVITY-001'},
{'id':'INT-READ-CAUSAL-001','requirements':['R-A5-10','R-A5-16'],'rawStatus':'FAIL','reviewedStatus':'FAIL','reason':'Original send wait [5005.463667,5005.526083]ms exceeds strict 5000ms; real read causal cleanup and history COMMIT independently pass','evidence':refs['delivery-read-causal-raw-database-observation.json'],'defect':'QA-01F-READ-001'},
{'id':'INT-READ-SAVE-ROLLBACK-001','requirements':['R-A5-10','R-A5-16'],'rawStatus':'FAIL','reviewedStatus':'BLOCKED','reason':'QA driver asserted asynchronous mock effect too early and wrongly required a new-process prepared event; real rollback/no-half-save/recovery-COMMIT separately proved, whole-case not promoted to PASS','evidence':refs['delivery-read-causal-save-rollback.json'],'qaIssues':['QA-DRIVER-ASYNC-EFFECT','QA-DRIVER-RESUMED-PREPARED']}]
defects=[{'id':'QA-01F-READ-001','severity':'P1','requirement':'R-A5-16','case':'INT-READ-CAUSAL-001','status':'OPEN','expectedMaximumMs':5000,'observedMs':[5005.463667,5005.526083],'reproduction':'Publicly trigger original send, actual Gateway 504 with applied effect and omitted event; hold owned messages ACCESS EXCLUSIVE lock, actual confirmation unavailable, observe same process original wait source events. Release owned lock only after first actual result; continue same-key recovery.','impact':'Original maximum tool wait is violated under real database contention; later cleanup and recovery do not erase first failure.'},
{'id':'QA-01F-ACTIVITY-001','severity':'P1','requirement':'R-A5-06','case':'INT-KICK-OBSERVATION-001','status':'OPEN','expectedMaximumMs':60000,'observedMs':[60007,60016],'reproduction':'One real run: proven actual capacity refusal, release at38–40s; real kick POST504 applied once, release response at43–44s; hold unique confirmation GET. Preserve actual continuous activity prefix and original budget abort events.','impact':'Original continuous measured activity already exceeds maximum before recovery pause; unknown-outcome pause cannot turn this prefix violation into BLOCKED.'}]
result={'formatVersion':1,'reportKind':'INDEPENDENT_FIRST_ROUND_ACCEPTANCE_SUPPLEMENT','signedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sutRevision':m['sutRevision'],'productSourceRevision':'70dd1eeb83e64b72f250a0b83b63c933feaa4b23','executionQaRevision':m['qaRevision'],'qaDirtyStateAtExecution':m['qaDirtyState'],'qaTreeSha256':m['qaTree']['sha256'],'targetSha256':m['targetSha256'],'suiteSha256':m['suiteSha256'],'originalSha256':m['originalSha256'],'dependencyLockSha256':m['dependencyLockSha256'],'node':m['node'],'runId':m['runId'],'startedAt':m['startedAt'],'completedAt':runner['completedAt'],'nativePhase':'developer-preflight','nativePhaseNote':'QA-controlled exact subset used the existing preflight runner; native report is retained and does not become whole-business acceptance','attemptsPerCase':1,'automaticRetries':0,'sutRestartWithinDesignedSaveScenario':1,'additionalSutRetestAfterQaCorrection':0,'rawCounts':{'PASS':0,'FAIL':3,'BLOCKED':0},'independentCounts':{'PASS':0,'FAIL':2,'BLOCKED':1},'cases':cases,'productDefects':defects,'businessRecommendation':'FAIL_NOT_ACCEPTED','releaseReadiness':'NOT_ASSESSED','fullCandidateSuiteRerun':False,'historicalReportsImmutable':[{'path':'reports/acceptance/20261002-current-delivery/report.md','sha256':'aa119fea808ee72d38eb21ef7f0022f3d7c36c69014dd204bb6d3bd5449d17c2','counts':'254 full on2716:240P/9F/5B;8e delta51 unique:46P/5F. Version-specific only.'},{'path':'reports/followup/20261002-dispatched-kick-budget/report.md','sha256':'acfecfffa8e05140f6198aa4bb23f50a0090874fb09909908e359af53e444e9f','status':'Old8e activity[59999,60008] remains BLOCKED; not replaced by new FAIL sample.'}],'localEvidenceReview':{'kick':kick['claims'],'saveOriginalMs':save['originalWindowMs'],'saveResumedMs':save['recoveredWindowMs'],'saveRollback':save['originalRollback'],'saveRecoveryCommit':save['recoveredCommit'],'readActualCausalChains':14,'readOriginalCommit':'9ff3a3ff-5821-437d-853d-472cde40ce6d','finiteKickObservationLowerMs':1599.972958,'arbitraryRecovery':'NOT_RUN','secondInstance':'NOT_RUN'},'qaTooling':{'executionFreezeSelfTests':334,'correctedSelfTests':selfcount,'finalChecks':latest,'correctedScriptsProductTested':False,'rawResultsPreserved':True},'cleanup':json.loads((o/'resource-audit/independent-review.json').read_text()),'evidenceArchive':{k:v for k,v in archive.items() if k!='files'},'pendingScope':{'C1C2AndSecondRound':'PREPARATION_ONLY_NO_EXECUTION_NO_MAIN_MERGE','secondRoundQaCommit':'28b3b3199013681fb5266cc409c7161f8726eb17','realPaidProviderCalls':'NOT_AUTHORIZED_NOT_RUN','wholeObserverExceptions':'Not fully isolated; retained engineering risk, no invented current product failure','remainingFirstRoundStrongRecoveryFailures':'Historical failures not closed by this finite sample; no full reacceptance on01f'},'nextActions':['Engineering reasonable fixes for two strict maxima, new candidate frozen before independent retest','Use corrected QA drivers on next candidate with explicit new run; preserve first raw record','Save whole-case BLOCKED needs new valid-driver execution; actual local PASS facts do not substitute','Second-round and release scope remain separate; no threshold waiver made by QA']}
for old in result['historicalReportsImmutable']:
 if hashlib.sha256((q/old['path']).read_bytes()).hexdigest()!=old['sha256']:raise RuntimeError('Old report changed')
(o/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
raw=o/'raw-run-summary';raw.mkdir(exist_ok=True)
for name in ['manifest.json','runner-summary.json','playwright.json','playwright.junit.xml','junit.xml']:
 shutil.copyfile(r/name,raw/name)
xml=ET.Element('testsuite',{'name':'01f-independent-first-round-observation-review','tests':'3','failures':'2','errors':'1','skipped':'0'})
for c in cases:
 e=ET.SubElement(xml,'testcase',{'classname':'QA.business-observation-supplement','name':c['id']})
 tag='failure' if c['reviewedStatus']=='FAIL' else 'error'
 ET.SubElement(e,tag,{'type':c['reviewedStatus'],'message':c['reason']}).text=c['reason']
 ET.SubElement(e,'system-out').text='Original raw status='+c['rawStatus']+'; original bytes archived, no silent retry.'
ET.indent(xml);ET.ElementTree(xml).write(o/'junit.xml',encoding='utf-8',xml_declaration=True)
report=f"""# 第一轮固定候选独立验收补充报告

**业务验收建议：不通过（FAIL）。上线准备度：本轮未评估。** 这份报告绑定交付 `01f2c1a`；存在两项原要求下的时限违约，以及一个QA驱动原因造成的整例阻塞。没有降低原5000／60000毫秒标准，也没有把局部恢复通过写成全部业务验收通过。

## 版本、范围与执行

| 项目 | 固定事实 |
|---|---|
| 被测交付 | `{m['sutRevision']}` |
| 产品源 | `70dd1eeb83e64b72f250a0b83b63c933feaa4b23`，至交付仅文档变更 |
| 实际执行QA源 | `{m['qaRevision']}`；执行时Git干净 |
| run | `{m['runId']}` |
| 时间 | `{m['startedAt']}` 至 `{runner['completedAt']}`（UTC；北京时间2026-10-02 02:39–02:40） |
| 目标指纹 | `{m['targetSha256']}` |
| 子集指纹 | `{m['suiteSha256']}` |
| 执行 | 3／3选定用例执行，1次／例，自动重试0次；保存场景内设计的保留状态重启1次 |
| 独立复核 | 3／3结论复核；2 FAIL、1 BLOCKED、0 PASS |

执行器原生阶段为 `developer-preflight`，原始输出保留“开发预跑、不构成正式验收”标记。此次由QA独立控制环境、故障和证据，并给出本补充报告的验收建议；它仍是固定三例补证，不代表该候选全量业务用例重新通过。原始机器结果 **3 FAIL** 保留；独立归类为 **2产品FAIL／1 QA驱动BLOCKED**，两套结果同时提供。

原始需求SHA `{m['originalSha256']}`。实际 Node `{m['node']}`，真实PostgreSQL、独立Gateway／Agent桩、动态端口、专属数据库；无浏览器／真人输入法／真实付费模型执行。开发归档15份原件仅核哈希与固定版本，开发PASS未继承为QA通过。

## 用例与需求追踪

| 用例／来源 | 独立结论 | 主要判定 |
|---|---|---|
| INT-KICK-OBSERVATION-001／R-A5-06、09，A5.2／A5.6 | **FAIL** | 实际连续活动前缀 `[60007,60016]ms` 超过60000；原确认GET取消与预算来源小项通过 |
| INT-READ-CAUSAL-001／R-A5-10、16，A5.7／2.2 | **FAIL** | 原工具等待 `[5005.463667,5005.526083]ms` 超过5000；真实锁链与回滚、保存、同key恢复通过 |
| INT-READ-SAVE-ROLLBACK-001／R-A5-10、16 | **BLOCKED** | QA过早断言异步副作用，以及跨进程prepared适配错误；真实回滚与恢复事实单列，不能升级整例PASS |

优先级仅影响顺序。本轮三个case的本地取证小项不能加入历史254条全量分母，也不代表R-A5-06／10／16的全部其他场景都重新验证。逐项机器结论、实际来源文件见 [results.json](results.json)。

## 已确认产品缺陷

**QA-01F-READ-001，P1，OPEN。** 原要求2.2的send_message最多等待5秒。公开流程产生原run／工具和真实消息；Gateway真实504已落地一次、事件隐去，专属messages表被独立locker持有真实ACCESS EXCLUSIVE锁，确认持续503。同一原执行进程72920的实际source8／9至548／549形成等待区间 `[5005.463667,5005.526083]ms`。三个失败断言均是这一项违约，计一个缺陷。实际14个PG样本分别闭合原SELECT／55P03／同read ROLLBACK returned／release；原Agent保存事务 `9ff3a3ff…` 真实COMMIT返回，同key再用sent且audit／POST／效果各一次。这些后续通过不抹去首次严格时限FAIL。

**QA-01F-ACTIVITY-001，P1，OPEN。** 原A5.2最多累计活动60秒。容量实际拒绝后于38–40秒释放，真实kick POST504在43–44秒放行，精确确认GET保持未返回。活动seq700仍为active、continuous=true、includesUnsavedTail=true，原区间 `[60007,60016]ms`；随后seq701／702暂停／终态为 `[60008,60021]ms`。因此已证超限前缀成立，不因后续continuous=false改成缺证；新SQL事务包络不裁剪活动区间。创建最大1551.952167至实际暂停最小61560.027167的保守差为60008.075ms，独立支持这一结论。

复现使用已登记 `qa-01f-first-round-observation` 的对应case及受控屏障，具体夹具、操作、取证和清理要求见 [用例](../../../cases/first-round-observation-followup.json)。后续合理修复由研发处理；本报告不接受未经确认的时限放宽，修复版本须另冻版本和新run。

## 组合取证与QA问题

原预算source11 `[61545.9125,61545.918792]` 之后，同原确认GET的预算source12 `[61546.068209,61546.071709]` 直接记录fetchPending=true，**KB-CROSS通过**。同GET真实combined abort、fetch rejected、request rejected依次闭合，reason匹配caller／activity-budget，deadline／operation／kick-lock截至settled未触发，**KB-CANCEL通过**。两个别名不当成两个独立根因，也不声称唯一底层传输失败根因。实际终态decision与独立outer COMMIT返回闭合；POST16、GET17、kick效果／audit／turn各1。终态后9次采样保守覆盖1599.972958ms，仅证明有限窗口无重复。较晚终态跨界仍BLOCKED：GET关闭62984.088早于较晚decision映射下界62999.163417，两种边界未混合。

原包装错误访问不存在的lifecycle顶层clockObservation，使raw CROSS／CANCEL记录为BLOCKED；实际PID／start在live provenance、事件及同run活动校准中已有记录。独立PASS来自**同一次原字节复核**，未重跑、未补造事件。活动通道没有lifecycle的monotonicMs，活动checkpoint也可能尚无停止终点；QA现已按两种实际协议分别校验，原下界FAIL优先。早期分析适配记录及最终分析均保留。

保存场景中，唯一send#15在18:39:31.765到达，200响应31.777完成，真实消息31.815异步落地，符合桩的正常50ms安排。before-response屏障控制HTTP响应，原驱动在实际落地前断言必须等于1，造成raw错误FAIL。这是**QA问题**，不是产品副作用丢失。原真实history保存31.859以P0001失败，事务 `cdcd4086…`／PG64实际ROLLBACK返回；真实step／history与基线完全相同，无半提交、无下一turn。

保留DB／Gateway／Agent重启后，新进程72492、新attempt `deb88461…` 与原进程72334分列；同run／step／key／clientMsgId复用sent，独立事务 `1d2dd9df…`／PG74实际COMMIT，持久tool_result唯一、原run finished、audit／send／效果仍各1。原工具等待 `[112.089125,112.161208]ms`、恢复 `[4.749791,4.785958]ms` 均满足5秒。原通用completion helper错误要求恢复进程重新产生prepared，而工具来源是原进程已提交的持久step。各真实子事实通过可单列，**整例仍BLOCKED**；修正版未产品试跑，不把修代码或本地复核变成整例通过。

QA修正仍由QA维护，研发只读使用。最终5项QA自身检查通过，自测 **{selfcount}／{selfpass} PASS，0 FAIL／SKIP**；这证明QA工具的校验结果，不能证明产品已通过。产品执行期间的实际QA源仍为3ed9a17；后续修正另有源码提交，原run不改写。

## 清理与证据完整性

三条case的cleanup.failures均为空。同一Docker engine下，本run三容器、三卷，4个实际应用及4个guardian、6个controller进程、2个registry均已按归属核验退出／移除；13个已识别端口后置无连接／监听。首worker72278已补独立ps检查，另两worker也已退出。共享Docker backend不记泄漏。

首PG容器在最早live inspect前已删，其卷由本case实际containerId／owner／数据库和精确Docker mount／unmount事件关联；**没有捕获首PG HostPort，也未声称该未知端口单独lsof复查**。资源结论只覆盖本run，不外推所有历史资源。[资源复核](resource-audit/independent-review.json) 保留这项取证限制。

原件 {archive['originalFileCount']} 份，共 {archive['originalByteCount']} 字节，逐文件SHA和归档内字节复核通过。见 [原件索引](original-file-index.json)、[原件包](original-evidence.tar.gz)、[独立JUnit](junit.xml)、[原始执行摘要](raw-run-summary/manifest.json)。执行器原始JUnit与独立JUnit并存，BLOCKED用error明确表示，不能作为PASS／静默跳过。

## 与历史验收及后续范围的关系

[第一轮总报告](../../acceptance/20261002-current-delivery/report.md) 原全量254条：240P／9F／5B；8e差异51条：46P／5F，均是各自版本事实，历史强恢复FAIL不被本例有限恢复关闭。原[8e预算补充报告](../20261002-dispatched-kick-budget/report.md) 的 `[59999,60008]ms` 保持BLOCKED，与本次新样本FAIL分列；两份旧报告SHA未变。

01f仅执行本次三例，没有宣称全量候选重新通过。任意恢复、运行中双实例、所有未来无重复、完整真人体验均不从有限样本外推；整个observer通道全面异常隔离仍未证明。当前业务不满足无条件通过门槛，建议修复两条时限违约并在新固定候选复测，同时用已修正驱动重新完成保存整例。

C1／C2和第二轮增强仍**只准备、不执行、不合main**，准备QA提交28b3b31保留；真实付费provider未授权未调用。上线专项／容量指标／RPO-RTO等另算，不能用本轮或历史功能通过代替上线结论。无需QA自行裁定业务例外；任何阈值或范围变更仍须明确记录最终决定。
"""
(o/'report.md').write_text(report)
print(json.dumps({'report':str(o/'report.md'),'cases':3,'independent':'2FAIL/1BLOCKED','qaSelf':selfcount,'archiveFiles':archive['originalFileCount']},ensure_ascii=False))
