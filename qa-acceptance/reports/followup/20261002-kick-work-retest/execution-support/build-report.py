"""Build the bounded first-round QA supplement from immutable completed inputs."""
from pathlib import Path
import json,hashlib,datetime,shutil,xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo
q=Path.cwd();r=q/'reports/followup/20261002-kick-work-retest';run=q/'reports/preflight/2026-10-01T20-05-52.805Z-2f02f728'
def load(p):return json.loads(p.read_text())
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
m=load(run/'manifest.json');events=load(run/'events.json');review=load(r/'run-independent-review.json');resource=load(r/'resource-audit/independent-review.json');wi=review['workCausalEvidence'];ix=load(r/'original-file-index.json');rix=load(r/'resource-observation-file-index.json')
assert m['sutRevision']=='7d53ee1f054961c9c997ff79dcb30e5a7e89ac46'
assert m['qaRevision']=='4f1af77add3b4ae32161b0581e2a913058c60909'
assert review['conclusion']['counts']=={'PASS':5,'FAIL':0,'BLOCKED':0}
assert len(events)==5 and all(x['attempt']==0 and x['status']=='PASS' for x in events)
assert wi['creationToCommitElapsedMs']==[58014.728959,58023.478584]
assert wi['maximumObservedActualActivityLowerMs']==58002
summary=load(run/'runner-summary.json');assert summary['runnerStatus']=='passed'
originals=[]
for rel,counts in [('reports/acceptance/20261002-current-delivery/report.md','2716 full254:240P/9F/5B;8e delta51:46P/5F/0B'),('reports/followup/20261002-dispatched-kick-budget/report.md','8e finite kick:BLOCKED'),('reports/followup/20261002-first-round-observation-retest/report.md','01f latest3:1P/2F/0B')]:
 p=q/rel;originals.append({'path':rel,'sha256':sha(p),'scope':counts,'immutable':True})
expected=['aa119fea808ee72d38eb21ef7f0022f3d7c36c69014dd204bb6d3bd5449d17c2','acfecfffa8e05140f6198aa4bb23f50a0090874fb09909908e359af53e444e9f','abea5db2561b7bac53ab12c16967893321d739580c9ea5aa669555a71eb6a07d']
assert [x['sha256'] for x in originals]==expected
prior=[
 {'id':'QA-01F-READ-001','severity':'P1','kind':'EXISTING_CONFIRMED_FAILURE_NOT_CLOSED','cases':['INT-READ-CAUSAL-001','AGENT-028','INT-READ-001'],'lastActualFailureSource':'01f (ordinary variants also8e)','facts':'Original actual tool/PG wait [5005.463667,5005.526083]ms >5000; genuine query/rollback/release facts present. No new 7d53 reproduction or PASS claimed.','currentDisposition':'NOT_RETESTED_ON_7D53; NO_CLOSURE','required':True},
 {'id':'QA8E-D02','severity':'P1','kind':'EXISTING_STRONG_RECOVERY_FAILURE','cases':['BLK-EXT-004','REC-007'],'lastActualFailureSource':'8e','facts':'Kick effect before durable result, including target rejoin: actual public recovery pause, no automatic original-run completion; no duplicate effect invented. Engineering direction decided; original guarantee unchanged.','currentDisposition':'NOT_RETESTED_ON_7D53; NO_CLOSURE','required':True},
 {'id':'QA8E-D03','severity':'P1','kind':'EXISTING_STRONG_RECOVERY_FAILURE','cases':['BLK-EXT-005'],'lastActualFailureSource':'8e','facts':'Unrecorded model response interruption leaves actual recovery-paused run; legal different response allowed, exact replay not required.','currentDisposition':'NOT_RETESTED_ON_7D53; NO_CLOSURE','required':True},
 {'id':'INT-MSG-007','kind':'EXISTING_HISTORICAL_FAILURE','lastActualFailureSource':'2716','facts':'Crash after first confirmation observed but before INSERT: original actual dispatch-time scheduling not preserved.','currentDisposition':'NOT_RETESTED_ON_7D53; NO_CLOSURE','required':True},
 {'id':'BLK-EXT-002','kind':'EXISTING_PROTOCOL_FAILURE','lastActualFailureSource':'2716','facts':'Create-group success reply lost: original group identity / extra remote group not guaranteed by current operation protocol.','currentDisposition':'NOT_RETESTED_ON_7D53; NO_CLOSURE','required':True},
 {'id':'BLK-EXT-003','kind':'EXISTING_PROTOCOL_FAILURE','lastActualFailureSource':'2716','facts':'Promote reply lost: role truth and maximum two original calls have historical failure; ordinary kick does not retest it.','currentDisposition':'NOT_RETESTED_ON_7D53; NO_CLOSURE','required':True},
 {'id':'BLK-EXT-001','kind':'EXISTING_REQUIRED_PROTOCOL_BLOCKER','lastActualFailureSource':'2716 BLOCKED','facts':'Silent no-response/no-effect send prefix lacks authoritative negative outcome. Finite waiting cannot manufacture negative terminal/liveness proof. Do not repeat D039 direction decision.','currentDisposition':'NOT_RETESTED_ON_7D53; BLOCKER_UNCLOSED','required':True},
 {'id':'MANUAL-FIRST-ROUND','kind':'EXISTING_REAL_HUMAN_EVIDENCE','cases':['MAN-IME-001','MAN-FOCUS-001','MAN-UX-001'],'facts':'Real IME, OS focus and missing operator evidence are still separate. H18 four-state wording acceptance stays closed-by-user; no reopening of its finite accepted examples.','currentDisposition':'NOT_RUN_IN_THIS_RETEST; HUMAN_SCOPE_REMAINS','required':True}
]
extra=[
 {'id':'GAP-RUNNING-SECOND-INSTANCE-COMPETITION','state':'NOT_RUN','kind':'EXISTING_EXTRA_CROSS_COVERAGE_NOT_NEW_DEFECT_OR_EXIT_GATE','facts':'Budget × dispatched kick × running second instance; generic AGENT003 on2716 remains priorPASS, not this three-factor PASS.'},
 {'id':'KICK-WORK-PROJECTION-FAULTS','state':'NOT_RUN','kind':'FINITE_IMPACT_BOUNDARY_NOT_NEW_PRODUCT_FAILURE','facts':'Known-success/explicit-refusal cross-work PG projection or repair; actual save failure/cancel-priority/pool-late/unknownCOMMIT combinations not automatically covered by ordinary success/refusal.'},
 {'id':'CO01-NATIVE-PG-REUSE','state':'NOT_RUN','kind':'FINITE_IMPACT_BOUNDARY_NOT_NEW_PRODUCT_FAILURE','facts':'Deterministic same PG connection deadline-wrapper release then native callback reuse: development before/after evidence exists; this QA sample does not force that trajectory.'}
]
now=datetime.datetime.now(datetime.timezone.utc);signed=now.isoformat();started=m['startedAt'];ended=summary['completedAt']
cases=[]
for c,e in zip(review['cases'],events):
 assert c['caseId']==e['id'];cases.append({**c,'durationMs':e['durationMs'],'attempt':0,'project':'system','startedAt':e['startedAt'],'completedAt':e['completedAt']})
results={'formatVersion':1,'reportKind':'INDEPENDENT_FIRST_ROUND_FINITE_RETEST','signedAt':signed,'signedAtBeijing':now.astimezone(ZoneInfo('Asia/Shanghai')).isoformat(),'sutRevision':m['sutRevision'],'productSourceRevision':'aea111aa5438db1773e2990dc2fd0d26ea52c5b9','executionQaRevision':m['qaRevision'],'qaDirtyStateAtExecution':m['qaDirtyState'],'qaTreeSha256':m['qaTree']['sha256'],'targetSha256':m['targetSha256'],'suiteSha256':m['suiteSha256'],'originalSha256':m['originalSha256'],'dependencyLockSha256':m['dependencyLockSha256'],'node':m['node'],'runId':m['runId'],'startedAt':started,'completedAt':ended,'nativePhase':m['phase'],'nativePhaseNote':'QA-controlled bounded independent retest uses existing developer-preflight subset runner; no native output upgraded to full formal acceptance.','productRuns':1,'productCaseInvocations':5,'explicitScenarios':6,'automaticRetries':0,'driverCorrectionProductReruns':0,'rawCounts':{'PASS':5,'FAIL':0,'BLOCKED':0},'independentCounts':review['conclusion']['counts'],'boundedConclusion':'PASS','businessConformity':'NOT_ACCEPTED_WITH_UNRESOLVED_FIRST_ROUND_ITEMS','unconditionalAcceptance':False,'fullCandidateSuiteRerun':False,'releaseReadiness':'NOT_ASSESSED','continuation':'PAUSED_AWAITING_HUMAN_DECISION_NO_AUTOMATIC_REPAIR_OR_RETEST','cases':cases,'workEvidence':wi,'closure':{'QA-01F-ACTIVITY-001':'CLOSED_BOUNDED_NORMAL_WORK_TRAJECTORY_ON_7D53; original01fFAIL immutable, not universal lock/crash guarantee','originalHardBudgetCase':'NOT_RETESTED; no untriggered hard PASS','actualGETCancellation':'PROVEN_DISTINCT_WORK_SOURCE','READ-CAUSAL-PG-CHAIN':'previous01f real query/rollback/release evidence retained, no new observer blocker fabricated;5000msFAIL unchanged'},'remainingRequiredFirstRound':prior,'extraUnexecutedBoundaries':extra,'secondRound':'PREPARATION_ONLY_NOT_EXECUTED_NOT_MERGED','C1C2':'development in main, independentQA not executed here','paidModelCalls':0,'historicalReportsImmutable':originals,'qaTooling':{'selfTests':361,'passed':361,'failed':0,'skipped':0,'catalogCases':274,'catalogRequirements':128,'finalFiveStaticChecks':'PASS','initialImpactRegistrationCheck':'FAIL because parallel review Markdown was not yet written; original retained; later impact/suites passed before product freeze','productStatusDerivedFromSelfChecks':False},'provenanceExceptions':{'dirty':'one own executor-start.json under reports; original manifest unchanged','sourceFiles':'277 frozen Git blobs match; one ignored unused smoke authority metadata byte-bound to original manifest and archived','ignoredInput':'input-provenance-review.json'},'coverage':{'selectedCaseDefinitions':5,'executedSelectedCases':5,'executionRate':1,'selectedPassRate':1,'entireCatalogTraceabilityOnly':{'requirements':128,'cases':274},'scope':'No whole-business execution/coverage/pass ratio from these five; no old-version PASS imports'},'newProductDefects':[],'cleanupReview':resource,'originalEvidence':{'index':'original-file-index.json','files':ix['originalFileCount'],'bytes':ix['originalByteCount'],'archive':ix['archive'],'archiveBytes':ix['archiveBytes'],'sha256':ix['archiveSha256']},'resourceOriginalEvidence':{'index':'resource-observation-file-index.json','files':rix['originalFileCount'],'bytes':rix['originalByteCount'],'archive':rix['archive'],'archiveBytes':rix['archiveBytes'],'sha256':rix['archiveSha256']},'qaToolingLimits':['Readonly resource snapshots repeatedly extracted the same lifecycle/transaction facts; 2,955,164,619 original bytes compressed and fully byte-checked. Fact count is not resource count.','One readonly snapshot used incorrect run-id filter, reports runs=0; retained as non-run candidate observation, not another product invocation.'],'independentReviews':[{'file':str(p.relative_to(r)),'sha256':sha(p)} for p in [r/'engineering-intake-review.json',r/'run-independent-review.json',r/'resource-audit/independent-review.json']]}
(r/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');(r/'pending-items.json').write_text(json.dumps({'requiredFirstRound':prior,'extraUnexecutedBoundaries':extra,'continuation':results['continuation'],'noNewDecisionAboutPreviouslyDecidedDirection':True},ensure_ascii=False,indent=2)+'\n')
rawout=r/'raw-run-summary';rawout.mkdir(exist_ok=True)
for name in ['manifest.json','events.json','results.json','runner-summary.json','playwright.json','playwright.junit.xml','junit.xml','acceptance.md']:shutil.copyfile(run/name,rawout/name)
root=ET.Element('testsuite',name='Independent bounded first-round kick-work retest',tests='5',failures='0',errors='0',skipped='0',timestamp=started)
props=ET.SubElement(root,'properties')
for k,v in [('sutRevision',m['sutRevision']),('qaRevision',m['qaRevision']),('runId',m['runId']),('scope','bounded five cases; no full candidate rerun'),('firstRoundBusinessAcceptance','NOT_ACCEPTED'),('productionReadiness','NOT_ASSESSED')]:ET.SubElement(props,'property',name=k,value=v)
for c in cases:ET.SubElement(root,'testcase',name=c['caseId'],classname='system',time=str(c['durationMs']/1000))
ET.indent(root);ET.ElementTree(root).write(r/'junit.xml',encoding='utf-8',xml_declaration=True)
rows='\n'.join(f"| {c['caseId']} | PASS | {c['durationMs']/1000:.3f}s |" for c in cases)
text=f'''# 首轮固定候选独立验收补充报告

**本次有限影响复测：5 PASS / 0 FAIL / 0 BLOCKED，单次执行、零重试。首轮整体业务验收仍未通过；新版本全量验收未重跑，上线评估未执行。** 按用户最新收尾要求，本报告签发后暂停，等待是否继续的决定，不再自动修复或补测。

本次闭合的是健康 PostgreSQL 下、真实容量延后后已派发 kick 的**正常 work 截止轨迹**：原确认 GET 在实际 work 源触发时仍 pending，随后真实取消，并在原60000ms内确认真实终态 COMMIT。它不承诺任意终态锁、崩溃、网络停顿仍能按时完成，不把旧原 hard 实验或强恢复要求签成通过。

## 固定来源与执行

| 项目 | 固定值 |
| --- | --- |
| 被测交付 | `{m['sutRevision']}` |
| 产品/研发测试源 | `aea111aa5438db1773e2990dc2fd0d26ea52c5b9`；apps/scripts/tests与交付一致 |
| 实际执行QA源 | `{m['qaRevision']}` |
| 原始需求SHA256 | `{m['originalSha256']}` |
| QA依赖锁SHA256 | `{m['dependencyLockSha256']}` |
| QA树SHA256 | `{m['qaTree']['sha256']}` |
| target / suite SHA256 | `{m['targetSha256']}` / `{m['suiteSha256']}` |
| run | `{m['runId']}` |
| 时间UTC | {started} 至 {ended} |
| 时间北京时间 | 2026-10-02 04:05:52 至04:07:11（原UTC精度保留于JSON） |
| 环境 | {m['node']}、真实PostgreSQL17、独立Gateway/Agent桩、单worker；无真实provider调用 |

原生执行器用途为 `developer-preflight`，用于QA受控的精确子集复测。原生报告/runner身份保持原样；本补充报告签署有限结果，不生成新版全量业务通过结论。5条用例包含CAP-008的两个明确错误变体，共6个显式场景。所选执行率/通过率均5/5；274条目录及128项追踪条款只是静态资产规模，不能算新版本全量实测覆盖。

**冻结例外如实披露：** 原manifest的 `qaDirtyState` 是唯一自有 `executor-start.json` 未跟踪记录，不能写成clean。该文件在reports中，为取得真实CLI/runner PID而在启动前生成，不进入QA树。独立核对277项Git源码字节与固定4f1一致；另1项既有ignored `developer-smoke` 本地授权元配置未被本轮使用，原hash及927字节原件另行归档。实际本轮授权绑定的是 `qa-first-round-kick-work`，见[配置例外核验](input-provenance-review.json)。没有代码或断言在运行中更改。

## 本次逐项结果

| 用例 | 独立结果 | 原始用时 |
| --- | --- | --- |
{rows}

- AGENT-017：POLICY_DENIED，零kick请求/效果，成员保留。
- AGENT-018：正常成功、精确动作审计、合格执行者、目标移除；独立终账本确认请求/审计/效果各一次。原脚本没有单独断言各次数，复核记录这个区别。
- CAP-008：OWNER_LEFT与NO_PERMISSION两个变体，容量真实拒绝后才放行；各一次请求/审计、零效果，原错误映射和群/账号不变。
- CAP-010：已派发504后真实成员效果和确认成功，容量压力不重置原意图、不重审计、不重复kick；只证明该收敛轨迹。
- INT-KICK-WORK-001：真实活动从零积累，没有注入active_ms；从唯一原POST504到唯一pending确认GET，actual work取消、真实暂停及终态落库、1500ms终态后有限不重放。

原始错误/后台错误/清理错误均为空，全部attempt=0，Playwright retries=0；未进行QA驱动修正后的第二次产品执行。详见[独立复核](run-independent-review.json)、[逐项JSON](results.json)及[JUnit](junit.xml)。

## 六十秒与取消的实际证据

本样本实际PID为54727，绑定原run/step/attempt及真实live start和同一单调时钟。原客户端确认GET `{wi['originalConfirmationClientRequestId']}` 与Gateway账本17通过唯一屏障关联。实际work源listener及同请求source触发时fetchPending=true，随后combined abort、fetch/request settled；work与caller别名同时保留，不声称唯一fetch根因。**原hard listener为0**，没有补造或将work改名。

实际pauseCause为 `kick-work-budget-exhausted`，真实暂停事务 `151ec8ed-5bf0-45d8-ba2f-0ccb5fbbaeb1` / PG133 的COMMIT已返回。终态 `failed/wall_clock` 的真实事务 `696673b6-9ea0-4b8b-8fa6-8e52931279f8` / PG133，有BEGIN、terminal UPDATE和COMMIT返回边界。创建至真实COMMIT的保守区间为 **[58014.728959,58023.478584]ms**，含暂停与落库尾段；实际活动下界最大58002ms。本有限场景满足原60000ms上限，没有加容差或要求最低时长。2000ms只作工程分配，不是物理收尾保证。

原POST/确认GET/审核/成员效果各一次，下一turn未派发。远端已移除不等于应用已确认，公开说明仍诚实保留未知及不重放意图；`failed/wall_clock`不代表远端踢人失败。较晚termination-decision跨GET的父进程映射仍为**BLOCKED diagnostic**，它不是本work listener正证，也不纳入五例BLOCKED计数；缺这条旧诊断不会冒充它通过。

QA-01F-ACTIVITY-001在本**正常work故障轨迹**上的修复复测闭合。01f原[60007,60016]ms FAIL和旧hard用例结果仍完整保留；本新样本不重签旧报告、不声明所有故障窗口都通过。

## 首轮仍需关闭的事项

| 分类 | 既有条目 | 本轮处理 |
| --- | --- | --- |
| 明确时间失败 | 原工具5000ms上限，QA-01F-READ-001及普通发送变体 | 原01f [5005.463667,5005.526083]ms FAIL保留；当前未获修复/复测闭环，不宣称7d53已重现或通过 |
| 持久化前崩溃与强恢复 | kick效果后/重新入群、模型未记录响应中断；BLK-EXT-004/005、REC-007 | 8e实际恢复暂停FAIL未关闭；保守工程方向已决定，原验收保证未变，本例无重启不能代签 |
| 历史未闭合FAIL | INT-MSG-007、BLK-EXT-002、BLK-EXT-003 | 首次确认INSERT前排期、建群丢响应及promote丢响应的2716失败仍需闭环；本轮未重测，不套用旧PASS |
| 既定协议阻塞 | BLK-EXT-001静默未落地分支 | 2716 BLOCKED保持；无响应/无效果的权威负结果不能由有限等待或日志制造，不重复要求D039决策 |
| 真人证据 | MAN-IME-001、MAN-FOCUS-001及MAN-UX-001缺失部分 | 本轮未执行。H18四态有限接受保持关闭，不重新要求其已接受样例 |

这张表是**既有未关闭首轮事项**，不是五例中新发现的产品缺陷；本轮新产品缺陷为0。前轮真正PG读取/回滚/释放链与限定保存故障恢复证据已闭合，不能因为严格5秒FAIL仍在而重新制造“尚未接上PG链”的阻塞。详细来源、分类与版本见[pending-items.json](pending-items.json)和历史报告。

以下仅是**额外未测边界**，不当新增产品缺陷或本五例的新关单条件：预算×已派发×运行中第二实例（原AGENT-003有限PASS不重开）、成功/明确拒绝跨work投影及保存失败/优先级组合、CO01同一真实PG连接wrapper释放后callback复用。研发对这些边界有证据，本QA未逼真触达者仍NOT_RUN。C1/C2和第二轮资产仍只按既有独立边界处理，未在此执行或合入第二轮；上线门禁另算。

## 清理与QA工具限制

五个专属用例环境的原cleanup均无错误。已捕获的实际共享专属PG容器及匿名卷通过owner、真实CID、live Mounts及mount/unmount事件绑定本run；HostPort61887有实际worker连接。post核查容器、卷均不存在，18个实际服务端口无连接/监听，两个controller所有已捕获进程树及自有registry均结束/删除。不会把port1模板占位或共享Docker基础设施当自有服务/泄漏。

**取证局限：** AGENT-017/018的短例在首次during快照前已结束，未独立捕获其实际app/guardian PID/start；CAP-010缺完整实际app的live start链。原cleanup和端口post核查仍在，但不写“每一个历时短进程都逐个独立核验”。详见[资源独立核验](resource-audit/independent-review.json)。

资源采样把重复生命周期/事务事实反复抽取，6份原快照累计2,955,164,619字节；这是QA采样工具膨胀，**不是几十万资源或资源泄漏**。全部原字节独立索引并压缩归档，不删除失败/限制字段。一次只读快照误传run-id，原件runs=0如实保留、不算另一产品执行；后续使用实际run-id核查。两项均是QA工具限制，不改产品结果、不为此重跑产品。

QA离线自测361/361通过，typecheck/catalog/impact/suites最终门禁通过。准备期首次impact检查发生在并行Markdown尚未写完时，原ENOENT失败留档；随后文档与两个门禁通过才冻结产品执行。自检不证明产品或需求全覆盖。

## 原件与版本报告

[产品及QA日志原件归档]({ix['archive']})：{ix['originalFileCount']}份 / {ix['originalByteCount']:,}原字节，归档{ix['archiveBytes']:,}字节，SHA256 `{ix['archiveSha256']}`。[逐文件索引](original-file-index.json)。

[资源快照原件归档]({rix['archive']})：6份 / {rix['originalByteCount']:,}原字节，归档{rix['archiveBytes']:,}字节，SHA256 `{rix['archiveSha256']}`。[逐文件索引](resource-observation-file-index.json)。大快照以归档交付，不在Git中放GB级重复JSON；每个member原名、字节数、SHA已重新读取核验。

[原生run清单与结果](raw-run-summary/manifest.json)、[工程intake](engineering-intake-review.json)及[独立QA复核](run-independent-review.json)单列。研发569 PASS/0 FAIL/11 SKIP仅为开发交付证据，11项跳过不算本轮QA通过。

| 历史固定来源 | 独立结果 | 保留方式 |
| --- | --- | --- |
| 2716完整业务 | 254条：240PASS /9FAIL /5BLOCKED | 原已签报告不变 |
| 8e差异修复 | 51条：46PASS /5FAIL /0BLOCKED | 不当新版全量PASS |
| 01f三项补证 | 最新1PASS /2FAIL；首次与修正单次记录均保留 | 原1559份归档不变 |
| 本次7d53有限补测 | 5PASS /0FAIL /0BLOCKED | 新run、新源与新归档，不拼接版本统计 |

[前次正式当前交付报告](../../acceptance/20261002-current-delivery/report.md)、[01f原报告](../20261002-first-round-observation-retest/report.md)、[旧原kick预算报告](../20261002-dispatched-kick-budget/report.md)均保留原SHA。运行结果与最终交付Git字节可用 `python3 execution-support/verify-delivery.py --git-revision HEAD`只读核验，不启动产品。

签发UTC：{signed}。QA建议：本有限work修复复测可接受；**首轮业务不予无条件通过，上线未评估。** 按最新用户要求在本报告收尾后暂停，等待是否继续的决定。
'''
(r/'report.md').write_text(text)
print(json.dumps({'report':str(r/'report.md'),'counts':results['independentCounts'],'firstRound':results['businessConformity'],'run':m['runId']}))
