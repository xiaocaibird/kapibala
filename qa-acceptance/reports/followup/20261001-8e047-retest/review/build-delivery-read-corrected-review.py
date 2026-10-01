"""Fixed-run independent file review. No services/SQL/network calls; no raw writes."""
from pathlib import Path
from decimal import Decimal
from collections import Counter
from urllib.parse import urlparse
import json, hashlib, datetime, subprocess
Q=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
R=Q/'reports/preflight/2026-10-01T15-58-10.937Z-4ed62619'
E=next((R/'artifacts').glob('*/evidence'))
INDEX={}
def data(p):
 b=p.read_bytes();INDEX[str(p.relative_to(Q))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)};return b
def read(p):return json.loads(data(p))
def dec(v):return Decimal(str(v))
def bounds(v):return [str(x)for x in v]
M=read(R/'manifest.json');EV=read(R/'events.json');RESULT=read(R/'results.json');RUNNER=read(R/'runner-summary.json')
assert M['sutRevision']=='8e047aea842bfcec64802e4918b52b460b93c48b'
assert M['qaRevision']=='b076790de087406de12336bdfd385a569b014f83'
assert M['qaTree']['sha256']=='3f3a11385b0f8008fc604b543e4ce89a6b687a391f63aa2f4b19c5c5588301bd'
assert len(EV)==1 and EV[0]['id']=='INT-READ-001' and EV[0]['project']=='system' and EV[0]['attempt']==0 and EV[0]['status']=='FAIL'
assert RUNNER['completedAt'] and not RUNNER['runnerErrors'] and not RESULT['integrity']
for k in ['runId','phase','sutRevision','qaRevision','targetSha256']:assert RESULT['metadata'][k]==M[k]
RAW=read(E/'delivery-read-raw-database-observation.json');BEFORE=read(E/'delivery-read-before-lock.json');WAIT=read(E/'delivery-read-while-locked.json');SENT=read(E/'delivery-read-after-unlock-messages.json');PUBLIC=read(E/'delivery-read-final-public-run.json');FINAL=read(E/'delivery-read-final-tool-witness.json');FACTS=read(E/'external-facts.json');CLEAN=read(E/'cleanup.json');ENV=read(E/'environment.json')
assert ENV['revision']==M['sutRevision'] and ENV['database']==RAW['database']
assert not RAW['pgErrors'] and not CLEAN['failures'] and all(x['endCompleted']for x in RAW['qaClientCleanup'])
assert RAW['qaLockerRollback']['afterMs']>RAW['qaLockerRollback']['beforeMs']>RAW['lockHeld']['parentMs']
c=RAW['correlation'];owner=RAW['lockOwner'];container=RAW['container']
assert container['labels']['qa.owner']==RAW['clusterOwner'] and container['name']=='qa-acceptance-'+RAW['clusterOwner']
assert container['network']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(container['port'])}]
assert c['runId']==FINAL['correlation']['runId']==PUBLIC['last']['id']
assert c['groupId']==FINAL['correlation']['groupId']==PUBLIC['last']['groupId']
assert BEFORE['events']==FINAL['events'][:len(BEFORE['events'])]
assert WAIT['complete'] and RAW['afterToolReturn']['actuallyReturned'] and WAIT['last']['events']==FINAL['events'][:len(WAIT['last']['events'])]
events=FINAL['events']; attached=events[0]
assert attached['historyScope']=='this-process-only' and attached['droppedThroughSourceSeq']==0 and not attached['includesPriorProcessHistory']
assert attached['resourceId']==c['runId']; clock=attached['clockDomain'];app=attached['applicationPid']
assert all(x['clockDomain']==clock and x['applicationPid']==app for x in events)
assert all(events[i]['sourceSeq']<events[i+1]['sourceSeq'] for i in range(1,len(events)-1))
assert len({x['seq']for x in events})==len(events)
intervals=[]
for tool,reused,code in [('read-lock-send',False,'SEND_TIMEOUT'),('read-lock-reuse',True,None)]:
 es=[x for x in events if x.get('toolUseId')==tool]
 def one(kind):
  v=[x for x in es if x['kind']==kind];assert len(v)==1;return v[0]
 enter=one('send-tool-entered');key=one('send-key-resolved');start=one('send-wait-started');ready=one('send-wait-result-ready');returned=one('send-tool-result-returned');history=one('send-tool-history-committed');prepared=one('send-tool-prepared')
 assert all(x['attemptId']==enter['attemptId'] and x['stepId']==enter['stepId'] and x['runId']==c['runId'] for x in [key,start,ready,returned,history])
 assert all(x['clientMsgId']==c['clientMsgId'] and x['idempotencyKey']=='read-lock-same-key' for x in [key,start,ready,returned])
 assert key['keyReused']==reused and returned['errorCode']==ready['errorCode']==history['errorCode']==code
 assert prepared['seq']<enter['seq']<key['seq']<start['seq']<ready['seq']<returned['seq']<history['seq']
 assert returned['result']==history['result']
 s=[dec(key['monotonicMs'][0]),dec(start['monotonicMs'][1])];t=[dec(ready['monotonicMs'][0]),dec(returned['monotonicMs'][1])];elapsed=[t[0]-s[1],t[1]-s[0]]
 if not reused:assert elapsed[0]>5000 and enter['attemptId']==c['attemptId']
 else:assert elapsed[1]<5000 and returned['result']=={'clientMsgId':c['clientMsgId'],'deliveryStatus':'sent'}
 intervals.append({'toolUseId':tool,'attemptId':enter['attemptId'],'stepId':enter['stepId'],'keyReused':reused,'clockDomain':clock,'applicationPid':app,'startMsDecimal':bounds(s),'endMsDecimal':bounds(t),'elapsedMsDecimal':bounds(elapsed),'result':returned['result'],'errorCode':code,'requiredMaximumMs':5000,'timingStatus':'FAIL'if elapsed[0]>5000 else'PASS','historyCommitMsDecimal':bounds([dec(v)for v in history['monotonicMs']]),'returnToHistoryMsDecimal':bounds([dec(history['monotonicMs'][0])-t[1],dec(history['monotonicMs'][1])-t[0]]),'historySameExecutionAttempt':True,'sourceEvents':{'keyResolved':key,'waitStarted':start,'ready':ready,'returned':returned,'history':history},'historyCommitNotUsedAsToolReturn':True})
# Verify real held lock on EVERY independent PG sample. Schema locates fault only.
seen={};blockedSamples=0
for sample in RAW['samples']:
 locker=[x for x in sample['activities']if x['pid']==owner['lockerPid']];assert len(locker)==1;locker=locker[0]
 assert sample['database']==owner['database']==RAW['database'] and locker['backend_start']==owner['lockerStart']
 assert any(x['relation']==owner['relationOid'] and x['mode']=='AccessExclusiveLock' and x['granted'] for x in locker['relation_locks'])
 actual=[]
 for x in sample['activities']:
  if x['pid']==owner['lockerPid'] or x['state']!='active' or x['wait_event_type']!='Lock' or owner['lockerPid']not in x['blockers']:continue
  if not any(l['relation']==owner['relationOid'] and l['mode']=='AccessShareLock' and not l['granted'] for l in x['relation_locks']):continue
  if not x['query'].lstrip().upper().startswith('SELECT')or 'messages'not in x['query']:continue
  assert x['datname']==RAW['database'];actual.append(x);seen[(x['pid'],x['backend_start'],x['query_start'])]=x
 if actual:blockedSamples+=1
assert len(seen)==34 and len(RAW['samples'])==197
assert set(seen)=={(x['candidate']['pid'],x['candidate']['backend_start'],x['candidate']['query_start'])for x in RAW['afterToolReturn']['candidates']}
last=RAW['samples'][-1];idle=next(x for x in last['activities']if x['pid']==68)
assert idle['state']=='idle' and idle['xact_start']is None and not idle['relation_locks']
assert SENT['complete'] and PUBLIC['complete'] and PUBLIC['last']['status']=='finished' and PUBLIC['last']['endReason']=='final'
original=[x for x in SENT['last']['items']if x.get('clientMsgId')==c['clientMsgId']];assert len(original)==1 and original[0]['deliveryStatus']=='sent' and original[0]['text']=='independent QA delivery read under real PG lock'
g=FACTS['gateway'];a=FACTS['agent'];sends=[x for x in g['requests']if x['path'].endswith('/send')];effects=[x for x in g['effects']if x['kind']=='send'];messages=[x for x in g['messages']if x.get('clientMsgId')==c['clientMsgId']]
assert len(sends)==len(effects)==len(messages)==len(a['audits'])==1
assert sends[0]['body']['clientMsgId']==effects[0]['clientMsgId']==c['clientMsgId'] and sends[0]['responseStatus']==504
assert len(a['turns'])==3
assert PUBLIC['last']['steps'][0]['errorCode']=='SEND_TIMEOUT' and PUBLIC['last']['steps'][0]['isError']is True
assert PUBLIC['last']['steps'][1]['errorCode']is None and PUBLIC['last']['steps'][1]['isError']is False
assert all('实际工具状态等待下界超过原始5000ms上限'in x['error']for x in RAW['assertions']) and len(RAW['assertions'])==3
assert len(RAW['missing'])==1 and '未关联backend' in RAW['missing'][0]
# Bound original records incl transport and trace. Never regenerate their report.
for p in sorted((R/'artifacts').rglob('*')):
 if p.is_file():data(p)
for n in ['acceptance.md','junit.xml','playwright.json','playwright.junit.xml']:data(R/n)
sourceBindings=[]
for n in ['tests/system/delivery-read-boundaries.spec.ts','tests/support/delivery-read-observation.ts','harness/lifecycle-observation.ts','harness/runtime-observation.ts','cases/delivery-read-boundaries.json']:
 b=subprocess.check_output(['git','-C',str(Q),'show',M['qaRevision']+':qa-acceptance/'+n]);f=next(x for x in M['qaTree']['files']if x['path']==n);assert hashlib.sha256(b).hexdigest()==f['sha256'];sourceBindings.append({'path':n,'qaRevision':M['qaRevision'],'sha256':f['sha256'],'bytes':len(b)})
basis={k:M[k]for k in ['runId','phase','sutRevision','qaRevision','targetSha256']}|{'qaTreeSha256':M['qaTree']['sha256']}
summary={'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'Independent AI QA, completed raw artifacts only','basis':basis,'caseId':'INT-READ-001','project':'system','rawStatus':'FAIL','reviewedStatus':'FAIL','reason':'同原工具/进程时钟的等待区间为[5000.443875,5000.529792]ms，安全下界严格超过原5000ms；真实锁内发生，未把history COMMIT或下一turn计入工具返回。后续PG查询/ROLLBACK归属缺证不覆盖已证硬FAIL。','rawEvent':EV[0],'runner':RUNNER,'rawIntegrity':RESULT['integrity'],'originalRawPreserved':True,'previousAttempt':{'runId':'2026-10-01T15-29-58.209Z-a06abe2a','qaRevision':'02ea807faed44ebaed8a41741f4056de8e04e87a','rawStatus':'BLOCKED','cause':'QA OID numeric/string diagnostic comparison','review':'reports/followup/20261001-8e047-retest/review/delivery-read-first-attempt-review.json','notOverwritten':True},'correlation':c,'strictToolTiming':intervals,'pgFault':{'container':container,'database':RAW['database'],'lockOwner':owner,'lockHeld':RAW['lockHeld'],'qaLockerRollback':RAW['qaLockerRollback'],'samples':len(RAW['samples']),'samplesWithActualBlockedReader':blockedSamples,'distinctQueryInstances':len(seen),'distinctBackendPids':sorted({x[0]for x in seen}),'queryInstancesPerBackend':dict(Counter(str(x[0])for x in seen)),'allSamplesConfirmOwnedExclusiveLock':True,'firstSampleWindowMs':[RAW['samples'][0]['beforeMs'],RAW['samples'][0]['afterMs']],'lastSampleWindowMs':[last['beforeMs'],last['afterMs']],'lastObservedCandidates':RAW['afterToolReturn'],'lastBackend68':idle,'attribution':'query text/PG identity proves a real table-read wait; no supplied mapping to the tool query execution attempt, so backend68 is a candidate, not a proved tool-query identity. Backend71/72 remain blocked readers, not proved abandoned waitForDelivery queries.'},'publicRecovery':{'sentObservation':SENT,'finalRun':PUBLIC,'sameOriginalClientMsgId':True,'auditCount':len(a['audits']),'sendRequestCount':len(sends),'actualSendEffectCount':len(effects),'persistedToolHistoriesSameAttempt':True,'originalSend':sends[0],'actualSendEffect':effects[0],'confirmationQueries':[x for x in g['requests']if '/messages/by-client-id/'in x['path']],'qualification':'No actual 503 confirmation-query response is recorded before release; unavailable was configured, but table lock blocked other readers. Do not claim a 503 query branch was exercised.'},'causalGaps':[{'status':'BLOCKED','obligation':'exact tool-to-PG-query/transaction attribution, server cancellation and serial SUT ROLLBACK','reason':RAW['missing'][0],'claimedPass':False,'idleSampleIsNotCompleteRollbackProof':True}],'cleanup':{'qaClientEnd':RAW['qaClientCleanup'],'pgErrors':RAW['pgErrors'],'fixtureCleanup':CLEAN,'qaLockerRollbackObserved':True,'sutRollbackProven':False,'containerVolumeDeletionIndependentlyReobservedByThisReview':False,'qualification':'File-only review confirms QA locker rollback/end and fixture cleanup failure list; no new Docker or PG request made. The idle-in-transaction locker is QA-owned, not a SUT leak.'},'distinctProductViolationCountInThisCase':1,'repeatObservationsOfSameViolation':RAW['assertions'],'scope':'Independent registered singleton retest, not new whole-business acceptance or release readiness','frozenSourceBindings':sourceBindings,'sourceIndex':INDEX}
for rel,expected in INDEX.items():
 b=(Q/rel).read_bytes();assert {'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}==expected,rel
p=OUT/'delivery-read-corrected-attempt-review.json';assert not p.exists();p.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'file':str(p.relative_to(Q)),'sourceFiles':len(INDEX),'status':summary['reviewedStatus'],'timing':[x['elapsedMsDecimal']for x in intervals],'pgBlockedSamples':blockedSamples},ensure_ascii=False))
