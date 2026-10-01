#!/usr/bin/env python3
"""Offline fixed-candidate delta report; reads archives/reviews, never runs a product.
Default output is DRAFT. Explicit --final requires the three authorized repeat runs,
independent UI/READ reviews and the final cleanup snapshot. Raw files are never edited.
"""
from pathlib import Path, PurePosixPath
from collections import Counter, defaultdict
from datetime import datetime, timezone
import argparse, hashlib, json, os, re, subprocess, sys, tarfile, xml.etree.ElementTree as ET
P=Path(__file__).resolve().parent; Q=P.parents[2]
PIN='8e047aea842bfcec64802e4918b52b460b93c48b'
FIRST=['2026-10-01T15-22-40.633Z-4281d669','2026-10-01T15-28-57.887Z-4fd13981','2026-10-01T15-29-58.209Z-a06abe2a']
RANK={'PASS':0,'NOT_RUN':1,'BLOCKED':2,'FAIL':3}
inputs={};archived_sources={}
def digest(b):return hashlib.sha256(b).hexdigest()
def load(p):
 p=Path(p);b=p.read_bytes();inputs[str(p.relative_to(Q))]={'sha256':digest(b),'bytes':len(b)};return json.loads(b)
def local_arg(value):
 p=Path(value);return p if p.is_absolute()else P/p

def counts(records,key='status'):
 c=Counter(x[key]for x in records);return {s:c[s]for s in RANK}
def worst(statuses):return max(statuses,key=RANK.__getitem__)
def link(label,path):return f'[{label}]({os.path.relpath(path,P)})'
def verify_review_sources(document):
 indexes=[document.get('sourceIndex',{})]
 for index in indexes:
  if isinstance(index,list):
   assert all(isinstance(x,dict)and 'path'in x and 'sha256'in x for x in index)
   assert len({x['path']for x in index})==len(index)
   index={x['path']:x for x in index}
  if not isinstance(index,dict):continue
  for name,entry in index.items():
   if not isinstance(entry,dict)or 'sha256'not in entry:continue
   candidate=Path(name)if Path(name).is_absolute()else Q/name
   if name.startswith('git:'):
    revision,gitpath=name[4:].split(':',1);assert re.fullmatch('[0-9a-f]{40}',revision)
    result=subprocess.run(['git','show',revision+':'+gitpath],cwd=Q.parent,capture_output=True);assert result.returncode==0,result.stderr.decode();actual=digest(result.stdout)
   elif candidate.is_file():actual=digest(candidate.read_bytes())
   elif str(candidate)in archived_sources:actual=archived_sources[str(candidate)]['sha256']
   else:raise AssertionError(f'Review source missing: {name}')
   assert actual==entry['sha256'],f'Review source changed: {name}'

def archive_check(directory):
 index=load(directory/'evidence-index.json');archive=directory/index['archive']['path'];actual=digest(archive.read_bytes());assert actual==index['archive']['sha256']
 assert archive.stat().st_size==index['archive']['bytes']
 expected={x['path']:x for x in index['files']};assert len(expected)==len(index['files'])
 seen={};case_cleanup=[]
 with tarfile.open(archive,'r:gz')as tar:
  for member in tar:
   if member.isdir():continue
   assert member.isfile(),f'Non-regular archive member: {member.name}'
   path=PurePosixPath(member.name);assert not path.is_absolute()and '..'not in path.parts
   assert path.parts[0]==index['archiveRoot'];rel=str(PurePosixPath(*path.parts[1:]));assert rel in expected and rel not in seen
   h=hashlib.sha256();size=0;stream=tar.extractfile(member);assert stream is not None
   cleanup_bytes=bytearray()if rel.endswith('/evidence/cleanup.json')else None
   while b:=stream.read(1024*1024):
    h.update(b);size+=len(b)
    if cleanup_bytes is not None:cleanup_bytes.extend(b)
   if cleanup_bytes is not None:
    record=json.loads(cleanup_bytes);assert record.get('completedAt')and record.get('failures')==[]
    case_cleanup.append({'path':rel,'completedAt':record['completedAt'],'failures':record['failures']})
   assert h.hexdigest()==expected[rel]['sha256']and size==expected[rel]['bytes'],rel
   seen[rel]={'sha256':h.hexdigest(),'bytes':size}
 assert seen.keys()==expected.keys()and len(seen)==index['verifiedDecompressedFiles']
 for name,entry in seen.items():archived_sources[str(Path(index['sourceDirectory'])/name)]=entry
 for name in ['manifest.json','events.json','results.json','runner-summary.json','playwright.json']:
  assert digest((directory/name).read_bytes())==seen[name]['sha256'],f'Archival metadata copy changed: {name}'
 return {'index':str((directory/'evidence-index.json').relative_to(Q)),'archive':str(archive.relative_to(Q)),'sha256':actual,'bytes':archive.stat().st_size,'independentlyVerifiedDecompressedFiles':len(seen),'sourceDirectory':index['sourceDirectory'],'allIndexedBytesMatched':True,'caseCleanup':case_cleanup}

def run_load(run_id):
 rd=P/'runs'/run_id;arc=archive_check(rd);m=load(rd/'manifest.json');r=load(rd/'results.json');ev=load(rd/'events.json');runner=load(rd/'runner-summary.json')
 assert m['runId']==run_id and m['sutRevision']==PIN and m['phase']=='developer-preflight'
 assert ev==r['attempts']and len({(x['id'],x['project'],x['attempt'])for x in ev})==len(ev)
 assert all(x['attempt']==0 and x['status']in RANK for x in ev)
 expected={(x['id'],project)for x in m['suite']['cases']for project in x['projects']}
 assert {(x['id'],x['project'])for x in ev}==expected,'Actual events must equal registered per-case project obligations'
 before=m['qaTree']['sha256'];after=r['metadata']['qaTreeAfter']['sha256'];assert before==after
 assert runner['runnerErrors']==r['metadata']['runnerErrors']==[]
 # A BLOCKED-only Playwright run can produce this reporter integrity label. Preserve it.
 assert all(x=='执行器整体状态: failed'for x in r['integrity']),r['integrity']
 assert r['metadata']['runnerStatus']==runner['runnerStatus']
 record={'runId':run_id,'phase':m['phase'],'suiteId':m['suite']['id'],'startedAt':m['startedAt'],'completedAt':runner['completedAt'],'qaRevision':m['qaRevision'],'qaDirtyState':m['qaDirtyState'],'sourceBeforeSha256':before,'sourceAfterSha256':after,'targetSha256':m['targetSha256'],'runnerStatus':runner['runnerStatus'],'runnerErrors':runner['runnerErrors'],'rawIntegrity':r['integrity'],'rawCounts':counts(ev),'obligations':len(ev),'archive':arc,'sourceAndArchiveChecksPassed':True,'agentTurnTimeoutMs':m.get('target',{}).get('sut',{}).get('env',{}).get('AGENT_TURN_TIMEOUT_MS')}
 history=[]
 titles={x['id']:x['title']for x in m['suite']['cases']}
 for event in ev:history.append({'executionKey':f"{run_id}/{event['project']}/{event['id']}/attempt-{event['attempt']}",'runId':run_id,'qaRevision':m['qaRevision'],'qaTreeSha256':before,'targetSha256':m['targetSha256'],'id':event['id'],'project':event['project'],'title':titles[event['id']],'raw':event,'reviewedStatus':event['status'],'reviewReason':'Original registered run result; no independent override.','reviewSources':[],'selectedAsLatest':False})
 return record,history

def apply_review(doc,path,history):
 verify_review_sources(doc);basis=doc['basis'];assert basis['sutRevision']==PIN
 rows=doc.get('cases')
 if rows is None and 'caseId'in doc:
  rows=[{k:doc[k]for k in ['caseId','project','rawStatus','reviewedStatus','reason','rawAttempt']if k in doc}]
 if rows is None:
  e=doc['rawEvent'];rows=[{'caseId':e['id'],'project':e['project'],'rawStatus':doc['rawStatus'],'reviewedStatus':doc['reviewedStatus'],'reason':doc.get('classification',''),'rawAttempt':e}]
 applied=[]
 for row in rows:
  runid=row.get('runId',basis['runId']);matches=[x for x in history if x['runId']==runid and x['id']==row['caseId']and x['project']==row['project']]
  assert len(matches)==1,(path,row.get('caseId'),runid);x=matches[0]
  assert x['raw']['status']==row['rawStatus']and row['reviewedStatus']in RANK
  if 'rawAttempt'in row:assert x['raw']==row['rawAttempt']
  if 'qaRevision'in basis:assert x['qaRevision']==basis['qaRevision']
  if 'targetSha256'in basis:assert x['targetSha256']==basis['targetSha256']
  if 'qaTreeSha256'in basis:assert x['qaTreeSha256']==basis['qaTreeSha256']
  if 'rawEvent'in doc and doc['rawEvent']['id']==row['caseId']:assert x['raw']==doc['rawEvent']
  if row['reviewedStatus']!=row['rawStatus']:assert row.get('reason'),'Changed status needs an explicit evidence reason'
  x['reviewedStatus']=row['reviewedStatus'];x['reviewReason']=row.get('reason',doc.get('classification','Independent evidence review'));x['reviewSources'].append(str(path.relative_to(Q)));x.setdefault('reviewDetails',[]).append({k:v for k,v in row.items()if k not in ['rawAttempt']});applied.append(x['executionKey'])
 return {'path':str(path.relative_to(Q)),'sha256':inputs[str(path.relative_to(Q))]['sha256'],'appliedExecutionKeys':applied,'scopeDetails':{k:doc[k]for k in ['classification','interpretation','notExecuted','remainingCorrelationGap','subscenarios','limitations','timing','sutRollbackProven','strictToolTiming','causalGaps','publicRecovery','scope']if k in doc}}

def main():
 script=Path(__file__).resolve();sb=script.read_bytes();inputs[str(script.relative_to(Q))]={'sha256':digest(sb),'bytes':len(sb)}
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--retest-run',action='append',default=[]);ap.add_argument('--ui-review',action='append',default=[]);ap.add_argument('--read-review');ap.add_argument('--cleanup-audit');ap.add_argument('--cleanup-review',default='resource-cleanup-review.json');ap.add_argument('--final',action='store_true');args=ap.parse_args()
 assert len(set(args.retest_run))==len(args.retest_run)and not set(args.retest_run)&set(FIRST)
 runs=[];history=[]
 for runid in FIRST+args.retest_run:
  record,rows=run_load(runid);runs.append(record);history.extend(rows)
 assert [r['obligations']for r in runs[:3]]==[43,15,1]
 assert counts([x['raw']for x in history if x['runId']in FIRST])=={'PASS':53,'NOT_RUN':0,'BLOCKED':4,'FAIL':2}
 replacement_keys=[]
 for runid in args.retest_run:
  rows=[x for x in history if x['runId']==runid];assert len(rows)==1
  key=(rows[0]['id'],rows[0]['project']);assert key in [('UI-039','chromium'),('INT-READ-001','system')]
  replacement_keys.append(key)
  previous=[x for x in history if x['runId']!=runid and (x['id'],x['project'])==key and x['raw']['completedAt']<rows[0]['raw']['startedAt']]
  assert previous,'A repeat needs a prior completed original execution'
  original=max(previous,key=lambda x:x['raw']['completedAt'])
  assert rows[0]['raw']['startedAt']>original['raw']['completedAt']and rows[0]['qaRevision']!=original['qaRevision']
  rows[0]['supersedesExecutionKey']=original['executionKey'];rows[0]['supersessionReason']='Explicitly authorized separate run after QA premise correction; same frozen SUT, original result retained.'
 assert Counter(replacement_keys)[('UI-039','chromium')]<=2 and Counter(replacement_keys)[('INT-READ-001','system')]<=1,'Only the three expressly authorized follow-up runs are in scope'
 review_index=[];read_details=None
 for path in [P/'review/recovery-adjudication-three-cases.json',P/'review/delivery-read-first-attempt-review.json']:
  review_index.append(apply_review(load(path),path,history))
 backend_path=P/'backend-review/backend-facts.json';backend=load(backend_path);verify_review_sources(backend)
 assert backend['run']['sutRevision']==PIN and backend['run']['runId']==FIRST[0]
 for cid,v in backend['cases'].items():
  match=next(x for x in history if x['runId']==FIRST[0]and x['id']==cid);assert match['raw']==v['rawAttempt']and match['reviewedStatus']==v['reviewStatus'];match['reviewSources'].append(str(backend_path.relative_to(Q)))
 extra_reviews=defaultdict(list)
 for kind,arguments in [('ui',args.ui_review),('read',[args.read_review]if args.read_review else[])]:
  for argument in arguments:
   path=local_arg(argument);doc=load(path)
   if kind=='read':read_details={'source':str(path.relative_to(Q)),'timing':[{k:t[k]for k in ['toolUseId','elapsedMsDecimal','timingStatus','requiredMaximumMs','historySameExecutionAttempt']if k in t}for t in doc.get('strictToolTiming',[])],'pg':{k:doc['pgFault'][k]for k in ['samples','samplesWithActualBlockedReader','distinctQueryInstances','distinctBackendPids','allSamplesConfirmOwnedExclusiveLock','attribution']if k in doc.get('pgFault',{})},'publicRecovery':{k:doc['publicRecovery'][k]for k in ['sameOriginalClientMsgId','auditCount','sendRequestCount','actualSendEffectCount','persistedToolHistoriesSameAttempt','qualification']if k in doc.get('publicRecovery',{})},'causalGaps':doc.get('causalGaps',[])}
   extra_reviews[kind].append(str(path.relative_to(Q)));review_index.append(apply_review(doc,path,history))
 byproject=defaultdict(list)
 for x in history:byproject[(x['id'],x['project'])].append(x)
 latest=[]
 for key,rows in sorted(byproject.items()):
  rows.sort(key=lambda x:x['raw']['completedAt']);selected=rows[-1];selected['selectedAsLatest']=True
  if len(rows)>1:assert selected.get('supersedesExecutionKey')==rows[-2]['executionKey']
  latest.append({'id':key[0],'project':key[1],'status':selected['reviewedStatus'],'rawStatus':selected['raw']['status'],'title':selected['title'],'selectedExecutionKey':selected['executionKey'],'selectedRunId':selected['runId'],'reason':selected['reviewReason'],'reviewSources':selected['reviewSources'],'reviewDetails':selected.get('reviewDetails',[]),'historyExecutionKeys':[x['executionKey']for x in rows]})
 bycase=defaultdict(list)
 for x in latest:bycase[x['id']].append(x)
 unique=[{'id':cid,'title':rows[0]['title'],'status':worst([x['status']for x in rows]),'projects':rows}for cid,rows in sorted(bycase.items())]
 assert len(unique)==51 and len(latest)==59
 cleanup=None
 if args.cleanup_audit:
  cp=local_arg(args.cleanup_audit);cleanup_doc=load(cp);assert cleanup_doc['phase']=='post-cleanup' and cleanup_doc['sutRevision']==PIN
  assert datetime.fromisoformat(cleanup_doc['observedAt'].replace('Z','+00:00'))>=max(datetime.fromisoformat(r['completedAt'].replace('Z','+00:00'))for r in runs),'Cleanup snapshot predates a selected run'
  crp=local_arg(args.cleanup_review);cr=load(crp)
  assert cr['sutRevision']==PIN and cr['snapshot']==str(cp.relative_to(Q))and cr['snapshotSha256']==digest(cp.read_bytes())
  assert {x['runId']for x in cleanup_doc['runs']}=={x['runId']for x in runs}and cr['runs']==len(runs)
  assert cleanup_doc['containers']==[]and len(cleanup_doc['containerAbsenceChecks'])==cr['independentlyMappedContainerAbsenceChecks']==2
  assert all(x['exitCode']==1 and 'no such object'in x['stderr'].lower()and x['stdout'].strip()=='[]'for x in cleanup_doc['containerAbsenceChecks'])
  assert len(cleanup_doc['volumes'])==cr['exactMappedVolumesAbsent']==2 and all(x['present']is False and x['probe']['exitCode']==1 and 'no such volume'in x['probe']['stderr'].lower()for x in cleanup_doc['volumes'])
  assert len(cleanup_doc['registries'])==cr['controllerRegistriesAbsent']==2 and all(x['exists']is False for x in cleanup_doc['registries'])
  assert sorted(x['port']for x in cleanup_doc['portObservations'])==sorted(cr['controllerPortsUnoccupied'])and all(x['probe']['exitCode']==1 and not x['probe']['stdout'].strip()and not x['probe']['stderr'].strip()for x in cleanup_doc['portObservations'])
  assert sum(len(x['archive']['caseCleanup'])for x in runs)==cr['caseEnvironmentsWithCompletedCleanup']==len(history)and cr['reportedCleanupFailures']==0
  assert cr['allAnonymousVolumesIndependentlyProvenRemoved']is False
  for controller in cr['controllers']:
   lp=Q/controller['directory']/'lifecycle.ndjson';lb=lp.read_bytes();inputs[str(lp.relative_to(Q))]={'sha256':digest(lb),'bytes':len(lb)};actual=[json.loads(line)for line in lb.decode().splitlines()]
   assert all(x in actual for x in controller['events'])and {'owned-controller-stopped','owned-registry-removed'}<={x['kind']for x in controller['events']}
  for controller in cleanup_doc['controllers']:
   for pid in [controller['value']['runnerPid'],controller['value']['guardianPid']]:
    ps=[x for x in cleanup_doc['processes']if x['argv'][:3]==['ps','-p',str(pid)]];assert len(ps)==1 and ps[0]['exitCode']==1 and not ps[0]['stdout'].strip()and not ps[0]['stderr'].strip()
  cleanup={'path':str(cp.relative_to(Q)),'observedAt':cleanup_doc['observedAt'],'phase':cleanup_doc['phase'],'reviewPath':str(crp.relative_to(Q)),'review':cr,'directSnapshotChecksPassed':True,'limits':cleanup_doc['limits'],'allAnonymousVolumesProvenRemoved':False,'specificLimitation':'First 8e runs did not capture live container Mounts; no retrospective exact anonymous-volume mapping or all-volume-removal claim.'}
 missing=[]
 if Counter(replacement_keys)!=Counter({('UI-039','chromium'):2,('INT-READ-001','system'):1}):missing.append('三次独立 QA 前提修正复测（UI两次、READ一次）尚未全部绑定。')
 if 'ui'not in extra_reviews:missing.append('UI 两种终态细分的独立审定未绑定。')
 if 'read'not in extra_reviews:missing.append('修正 OID 后 READ 工具/PG/ROLLBACK 因果证据审定未绑定。')
 for kind,cid,project in [('ui','UI-039','chromium'),('read','INT-READ-001','system')]:
  selection=next(x for x in latest if x['id']==cid and x['project']==project)
  applicable=[review for review in review_index if review['path']in extra_reviews[kind]]
  covered={key for review in applicable for key in review['appliedExecutionKeys']}
  for executed in history:
   if executed['runId']in args.retest_run and executed['id']==cid and executed['project']==project and executed['executionKey']not in covered:missing.append(f'{kind} 独立审定尚未绑定补复测 {executed["runId"]}，历史QA归因和最新结果均须保留。')
 if cleanup is None:missing.append('最终 post-cleanup 资源核查尚未绑定。')
 if args.final:assert not missing,'Final report dependencies incomplete: '+ '; '.join(missing)
 state='FINAL_DELTA_REPORT'if args.final else'DRAFT_NOT_SIGNED'
 version_binding=load(P/'main-product-version-binding.json');assert version_binding['fixedSut']==PIN and version_binding['productTreeUnchangedSinceCandidate']is True and version_binding['productDiffBytes']==0
 now=datetime.now(timezone.utc).isoformat();nonpasses=[x for x in unique if x['status']!='PASS']
 pending=[{'id':'GAP-BUDGET-AFTER-DISPATCH-KICK','kind':'QA_COVERAGE_STRENGTHENING_NOT_NEW_BUSINESS_RULE','status':'NOT_RUN','scope':'预算逼近上界 × 已派发 kick 的完整交叉窗口未实际执行；CAP003 容量拒绝与 CAP010 2秒收敛各自通过不可合成此组合已覆盖。','owner':'QA/工程接入','notInExecutedCounts':True},{'id':'MANUAL-FOLLOWUP','kind':'REAL_HUMAN_EVIDENCE','status':'NOT_RUN_IN_THIS_DELTA','cases':['MAN-IME-001','MAN-FOCUS-001','MAN-UX-001'],'scope':'不代签真人、不把自动化浏览器当真实IME/跨app焦点；H18四态有限接受及文案体验closed-by-user保留，不为本次差异报告重开。','notInExecutedCounts':True},{'id':'D039/D041','kind':'ENGINEERING_DIRECTION_ALREADY_DECIDED_ACCEPTANCE_DEVIATION_UNCHANGED','status':'NOT_A_NEW_PENDING_DIRECTION_DECISION','scope':'保守暂停工程方向已决定；原任意重启续跑标准未变，本次已观察暂停仍判FAIL。若要更改验收承诺，需单独明确决定。','notInExecutedCounts':True}]
 if read_details:
  pending.extend({'id':f'READ-CAUSAL-{i+1}','kind':'ENGINEERING_OBSERVATION_GAP_WITH_EXISTING_CASE_FAIL','status':gap['status'],'scope':gap['obligation']+'；'+gap['reason'],'notInExecutedCounts':True}for i,gap in enumerate(read_details['causalGaps']))
 summary={'formatVersion':1,'generator':{'script':str(script.relative_to(Q)),'sha256':digest(sb),'arguments':sys.argv[1:],'mode':'offline original-evidence review'},'state':state,'generatedAt':now,'scope':'Fixed-candidate independent delta retest, registered developer-preflight runs only; not a new full business acceptance.','sutRevision':PIN,'qaVersions':sorted({x['qaRevision']for x in runs}),'sourceFingerprints':sorted({x['sourceBeforeSha256']for x in runs}),'targetHashes':sorted({x['targetSha256']for x in runs}),'rawExecutionHistory':{'obligations':len(history),'counts':counts([x['raw']for x in history]),'automaticRetries':0,'originalFirstThreeRuns':{'obligations':59,'counts':{'PASS':53,'FAIL':2,'BLOCKED':4,'NOT_RUN':0}}},'reviewedExecutionHistory':{'obligations':len(history),'counts':counts(history,'reviewedStatus')},'latestReviewedObligations':{'count':len(latest),'counts':counts(latest)},'latestReviewedUniqueCases':{'count':len(unique),'counts':counts(unique),'aggregation':'Select latest explicitly authorized valid-premise repeat per (case,project), then worst status across required projects. Preserve all earlier execution records.'},'conclusion':{'deltaRecommendation':('NOT_ACCEPTED_WITH_FAILURES'if any(x['status']=='FAIL'for x in unique)else'INCOMPLETE_WITH_BLOCKERS'if nonpasses else'PASSED_EXECUTED_DELTA_ONLY')if args.final else'NOT_SIGNED_PENDING_FINAL_INPUTS','fullBusinessAcceptanceOn8e':'NOT_CLAIMED','historicalPassesImportedFrom2716OrOtherCandidates':0,'productionReadiness':'NOT_ASSESSED','baseline2716Report':'reports/acceptance/20261001-2716abd-business/report.md'},'runs':runs,'reviews':review_index,'mainProductVersionBinding':version_binding,'readBoundaryReview':read_details,'timingReview':{'source':str(backend_path.relative_to(Q)),'cases':{cid:{'status':v['reviewStatus'],'actualIntervalMs':v.get('decisionElapsedMs',v.get('elapsedMs',v.get('fullActiveMs')))}for cid,v in backend['cases'].items()}},'nonPassLatestCases':nonpasses,'pendingGaps':pending,'excluded':{'productionGates':7,'candidateC1C2Cases':5,'realHumanCasesNotSigned':3,'candidatePolicy':'30天/Gemini D047 已决定；本差异复测没有真模型费用，也不将候选用例计作通过。'},'cleanup':cleanup,'finalizationDependencies':missing,'rawRecordsUnchanged':True,'inputIndex':inputs}
 payload={'formatVersion':1,'state':state,'generatedAt':now,'sutRevision':PIN,'rawHistoryRetained':True,'executionHistory':history,'latestProjectObligations':latest,'latestUniqueCases':unique}
 # JUnit unit is the 59 latest (case,project) obligations; never collapse browser projects into PASS.
 root=ET.Element('testsuites',name='8e047 independent delta latest reviewed obligations',tests=str(len(latest)),failures=str(counts(latest)['FAIL']),errors='0',skipped=str(counts(latest)['BLOCKED']+counts(latest)['NOT_RUN']))
 suite=ET.SubElement(root,'testsuite',name='latest-reviewed-delta',tests=str(len(latest)),failures=str(counts(latest)['FAIL']),errors='0',skipped=str(counts(latest)['BLOCKED']+counts(latest)['NOT_RUN']))
 props=ET.SubElement(suite,'properties')
 for k,v in {'reportState':state,'sutRevision':PIN,'executionHistoryCount':len(history),'uniqueCases':len(unique),'fullBusinessAcceptance':'not-claimed','historyImportedPasses':0}.items():ET.SubElement(props,'property',name=k,value=str(v))
 for x in latest:
  selected=next(h for h in history if h['executionKey']==x['selectedExecutionKey']);node=ET.SubElement(suite,'testcase',classname=x['project'],name=f"[{x['id']}] {x['title']}",time=str(selected['raw'].get('durationMs',0)/1000))
  if x['status']=='FAIL':ET.SubElement(node,'failure',type='QA_REVIEWED_FAIL',message=x['reason']).text=json.dumps({'rawStatus':x['rawStatus'],'evidence':selected['raw'].get('evidence',[]),'reviews':x['reviewSources']},ensure_ascii=False)
  elif x['status']!='PASS':ET.SubElement(node,'skipped',type=x['status'],message=x['reason'])
  ET.SubElement(node,'system-out').text=json.dumps({'reportState':state,'selectedExecutionKey':x['selectedExecutionKey'],'preservedHistoryKeys':x['historyExecutionKeys']},ensure_ascii=False)
 ET.indent(root)
 report=render(summary,payload,backend)
 # Re-check immutable read inputs before publishing generated output.
 for record in runs:assert digest((Q/record['archive']['archive']).read_bytes())==record['archive']['sha256']
 for name,entry in inputs.items():assert digest((Q/name).read_bytes())==entry['sha256'],f'Input changed while generating: {name}'
 (P/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');(P/'latest-results.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');(P/'reviewed.junit.xml').write_bytes(ET.tostring(root,encoding='utf-8',xml_declaration=True)+b'\n');(P/'report.md').write_text(report)
 print(json.dumps({'state':state,'runs':len(runs),'rawHistory':summary['rawExecutionHistory'],'latestUnique':summary['latestReviewedUniqueCases'],'dependencies':missing},ensure_ascii=False))

def render(s,p,backend):
 interval=lambda values:'['+', '.join(map(str,values))+']'
 countsline=lambda d:'/'.join(f"{d[x]} {x}"for x in ['PASS','FAIL','BLOCKED'])
 lines=['# 8e047 固定候选差异复测报告','',f"状态：**{s['state']}**。生成时间：{s['generatedAt']}。",'', '本报告只覆盖本次注册增量子集。原 2716 全量正式验收另案保留；不导入任何历史 PASS，也不宣称 8e 全量业务或上线通过。', '',f"本次已绑定 {len(s['runs'])} 个 run，原始执行历史 {s['rawExecutionHistory']['obligations']} 条：{countsline(s['rawExecutionHistory']['counts'])}。独立审定后的历史为 {countsline(s['reviewedExecutionHistory']['counts'])}。",'',f"最新口径为 {s['latestReviewedObligations']['count']} 个 case×project 义务、{s['latestReviewedUniqueCases']['count']} 个独立用例；按合法单独复测选择各项目最新结果后，再跨项目取最差。当前最新独立用例：{countsline(s['latestReviewedUniqueCases']['counts'])}。统计仅限本次已登记差异范围。",'',f"固定 SUT：`{PIN}`。阶段均为 `developer-preflight`，获准差异复测的证据与其阶段标签同时保留。",'', '| Run / 注册子集 | QA 源码 / 目标摘要 | 原始结果 | 执行器与完整性 |','| --- | --- | --- | --- |']
 for r in s['runs']:
  lines.append(f"| {link(r['runId'],P/'runs'/r['runId']/'manifest.json')} / {r['suiteId']} | `{r['qaRevision'][:12]}` / `{r['targetSha256'][:12]}`（turn timeout={r['agentTurnTimeoutMs']} ms） | {r['obligations']}：{countsline(r['rawCounts'])} | runner={r['runnerStatus']}；runnerErrors={r['runnerErrors']}；integrity={r['rawIntegrity']} |")
 lines+=['','每个 run 的 QA 前后内容摘要一致、runnerErrors 逐项为空；表中的 `执行器整体状态: failed` 原样保留，不能概括为所有完整性字段为空。归档按 index 重新逐文件解压读取并复核 SHA-256 和字节数；完整 SHA、解压数量见 [summary.json](summary.json)。旧 raw events、错误上下文、报告没有被改成新结果。','', '## 确认的时序与恢复边界','', '| 用例 | 独立审定 | 本轮实际区间 ms |','| --- | --- | --- |']
 for cid,v in s['timingReview']['cases'].items():lines.append(f"| {cid} | {v['status']} | {interval(v['actualIntervalMs'])} |")
 lines+=['','[四项独立时序报告](backend-review/backend-review.md)核对真实停止决定、同 attempt 外层 COMMIT、完整活动真值及跨 epoch 的实际应用退出。INT-ACT-001 的保守上界包含未证非活动的启动间隙，旧缓存和持久计数未替代真值；已提交 3 步在原 run 中续接到 7 步。它只证明本次安全阶段崩溃场景，不证明所有锁、任意外部副作用窗口或全部未来运行。','', 'AGENT-028 的结果就绪下界已超过原 5000 ms 上限，不能用 COMMIT 排除或调度容差抹掉。BLK-EXT-004、BLK-EXT-005 的原 BLOCKED 经本轮明确公开 recoveryNote 与故障链审定为 FAIL，REC-007 保持 FAIL；依据是已证保守暂停不满足原续跑承诺，不是把 20/30 秒探测预算发明成产品 SLA。[恢复独立审定](review/recovery-adjudication-three-cases.md)保留每个原事件。','', '## QA 前提纠正与最新结果','', '原始前三 run 为 59 条义务：53 PASS / 2 FAIL / 4 BLOCKED。三次补复测（UI 两次、READ 一次）只更新对应 case/project 的最新审定，之前原始记录均可在 [latest-results.json](latest-results.json) 的 executionHistory 查回；不是自动重试，也没有把多次环境配置拼成一次事实。','', 'UI queue 首次补复测已建立 failed/cancelled 两种真实零步骤前提，但第二次页面循环重复登录，被已有会话重定向后 locator.fill 超时；raw FAIL 必须保留，独立审定证实为 QA 导航前提问题，标 BLOCKED，不能当产品 FAIL。该次 failed 的界面实证和 cancelled 未呈现分列；后续只移一次登录到循环前，不回写先前失败。', '', '首轮 INT-READ-001 的真实 ACCESS EXCLUSIVE 锁已经持有，但 QA 对 PostgreSQL OID JSON 字符串/数字类型比较过严，提前 BLOCKED。该轮未完成后续 reader/工具返回/恢复窗口，不能归为产品故障或产品通过。[首次归因](review/delivery-read-first-attempt-review.md)。修正 OID 后 READ 的真实工具等待、PG 关联及 ROLLBACK 证据按独立复核分别列示。','', 'UI-039 的 cancelled 与 failed 两种零步骤状态须分别建立真实可达前提；一种状态观察通过不能代替另一种。普通超时配置与 queue 专项的配置差异保留在各 run 的固定目标中，不能反推修改业务标准。']
 if s['readBoundaryReview']:
  rd=s['readBoundaryReview'];pr=rd['publicRecovery'];pg=rd['pg'];lines+=['','修正 OID 后的真实 READ 窗口中，'+str(pg.get('samples'))+' 次样本确认独占锁，'+str(pg.get('samplesWithActualBlockedReader'))+' 次捕获实际 blocked reader；'+str(pg.get('distinctQueryInstances'))+' 个查询实例并不能直接等同该工具的查询。', '', '| READ 实际工具 | 区间 ms | 原 5 秒判据 |','| --- | --- | --- |']
  for t in rd['timing']:lines.append(f"| {t['toolUseId']} | {interval(t['elapsedMsDecimal'])} | {t['timingStatus']} |")
  lines+=['',f"解锁后原消息 sent、同 key 读取已有结果，审计/发送请求/落地效果分别 {pr.get('auditCount')}/{pr.get('sendRequestCount')}/{pr.get('actualSendEffectCount')}；同 attempt history 已确认。原始记录没有实际503确认查询响应：虽然配置不可用，表锁阻塞了其它读取，不将该配置视作503分支已执行。",'', '工具→PG query/transaction 及产品串行 ROLLBACK 的唯一关联仍是 BLOCKED 子义务；该缺证不遮盖已证 5 秒 FAIL。case 汇总没有 BLOCKED 也不表示这些子义务已关闭。']
 ui_rows=[(h,d)for h in p['executionHistory']if h['id']=='UI-039'for d in h.get('reviewDetails',[])if d.get('subscenarios')]
 if ui_rows:
  lines+=['','| UI-039 执行 / 真实状态 | 后端零步骤前提 | UI 观察 | 独立审定 |','| --- | --- | --- | --- |']
  for h,d in ui_rows:
   for name,result in d['subscenarios'].items():lines.append(f"| {h['runId']} / {name} | {result.get('backendPremiseStatus','未单列')} | {result.get('uiStatus','未单列')} | {result.get('reviewedStatus','未单列')} |")
 for review in s['reviews']:
  if 'first-attempt'not in review['path']and'recovery-adjudication'not in review['path']:lines+=['',link('补复测独立审定',Q/review['path'])]
 lines+=['','| 最新非 PASS 用例 | 状态 | 分项目来源 |','| --- | --- | --- |']
 for c in s['nonPassLatestCases']:
  lines.append(f"| {c['id']} | {c['status']} | "+'<br>'.join(f"{x['project']}: {x['status']} @ {x['selectedRunId']}"for x in c['projects'])+' |')
 lines+=['', '完整最新逐项表见 [latest-results.json](latest-results.json)；[reviewed.junit.xml](reviewed.junit.xml)以 case×project 为单位，BLOCKED 输出 skipped 标明类型，绝不计 PASS。','', '## 尚未覆盖与不属于本轮的事项','']
 for gap in s['pendingGaps']:lines.append(f"- **{gap['id']} / {gap['status']}**：{gap['scope']}")
 lines+=['','7 条上线门禁、C1/C2 的 5 条候选用例排除于本次统计；3 条真人义务不代签。30 天/Gemini（D047）方向已决定，不重复列为待决定，本次没有真模型费用。增量通过不覆盖旧全量中未重跑的条目。','', '## 资源与归档','']
 if s['cleanup']:lines.append(f"最终资源证据：{link(s['cleanup']['observedAt'],Q/s['cleanup']['path'])}，以及 {link('具体清理复核',Q/s['cleanup']['reviewPath'])}。生成器重新检查了全部62份cleanup记录 failures=[]、两组controller lifecycle停止/registry移除事件、wrapper/guardian进程不存在、两个端口无绑定、两个精确关联容器及两个映射卷不存在。共享Docker基础进程保留。首轮 8e 缺少存活时 Mounts 映射，不能声称所有匿名卷已确认删除。")
 else:lines.append('最终控制器与精确资源收尾证据尚未绑定。当前不能签“全部清理”；首轮匿名卷缺少活体 Mounts 映射的限制将永久保留，不按名称前缀补删或补造。')
 lines+=['','| Run | 独立逐文件解压核对 | 归档 |','| --- | --- | --- |']
 for r in s['runs']:lines.append(f"| {r['runId']} | {r['archive']['independentlyVerifiedDecompressedFiles']} 文件，全部摘要/字节匹配 | {link('原字节归档',Q/r['archive']['archive'])} |")
 lines+=['','## 报告结论','',f"**{s['conclusion']['deltaRecommendation']}**。"]
 if s['finalizationDependencies']:lines+=['','本稿暂不签发，尚待：']+['- '+x for x in s['finalizationDependencies']]
 else:lines+=['','本差异复测仍有5个用例存在明确违约，不能无条件验收该增量范围。最新用例0 BLOCKED不表示READ因果补证、未执行组合场景或真人义务已经关闭。上线准备度未评估，最终上线决定不由这些子集通过替代。']
 lines+=['',f"主分支产品路径差异证明见 [main-product-version-binding.json](main-product-version-binding.json)：指定运行路径在 `8e047` 与记录的 `0fc63e4` 间无差异；该证明不扩大测试范围或把旧版全量 PASS 转移到新版。原正式基线：{link('2716 全量验收报告',Q/s['conclusion']['baseline2716Report'])}。本文件生成器仅离线读取原件，不连接或运行产品。",'']
 return '\n'.join(lines)

if __name__=='__main__':
 assert worst(['PASS','BLOCKED'])=='BLOCKED' and worst(['FAIL','BLOCKED','PASS'])=='FAIL'
 main()
