"""Offline evidence review; never contacts the SUT, database, controller or process table."""
from pathlib import Path
from decimal import Decimal as D
from datetime import datetime, timezone
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
RUN=ROOT/'reports/preflight/2026-10-01T15-22-40.633Z-4281d669'
PIN='8e047aea842bfcec64802e4918b52b460b93c48b'
used={}
def raw(p):
 p=Path(p);b=p.read_bytes();used[str(p.relative_to(ROOT))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)};return b

def read(p):return json.loads(raw(p),parse_float=D)
def pick(root,pattern):
 ps=list(root.glob(pattern));assert len(ps)==1,(pattern,len(ps));return ps[0]
def span(start,end):return [end[0]-start[1],end[1]-start[0]]
def one(es,kind):
 rows=[e for e in es if e['kind']==kind];assert len(rows)==1,(kind,len(rows));return rows[0]
def identity(s):return {k:s[k]for k in ['binding','correlation','snapshotProvenance']}
def same_resource(a,b):
 assert all(a['correlation'][k]==b['correlation'][k]for k in ['runId','groupId'])
 assert a['binding']==b['binding'] and a['snapshotProvenance']==b['snapshotProvenance']
def lifecycle(s):
 es=s['events'];assert es[0]['kind']=='lifecycle-observation-attached' and es[0]['droppedThroughSourceSeq']==0
 assert es[0]['historyScope']=='this-process-only'
 assert [x['seq']for x in es]==list(range(1,len(es)+1))
 assert s['binding']['revision']==PIN and s['snapshotProvenance']['source']=='live-bridge'
 domain=es[0]['clockDomain'];assert all(x['clockDomain']==domain and x['clockUnit']=='ms'and x['applicationPid']==s['snapshotProvenance']['applicationPid'] and x['instancePid']==s['binding']['pid'] and x['correlation']==s['correlation']for x in es)
 assert all(x.get('runId',s['correlation']['runId'])==s['correlation']['runId']and x.get('groupId',s['correlation']['groupId'])==s['correlation']['groupId']for x in es)
 sources=[x['sourceSeq']for x in es if 'sourceSeq'in x];assert sources==sorted(set(sources))
 return {'localEvents':len(es),'localSequenceContiguous':True,'droppedThroughSourceSeq':0,'sourceSequencesIncreasing':True,'sourceSequenceGaps':'global source stream filtered by resource; gaps do not imply truncation','attachment':es[0]}
def activity(s,start_source,complete):
 es=s['events'];f=es[0];assert s['snapshotProvenance']['source']=='live-bridge' and s['binding']['revision']==PIN
 assert [x['seq']for x in es]==list(range(1,len(es)+1))
 for x in es:
  assert x['epochIds']==f['epochIds'] and len(x['epochIds'])==1
  assert x['creationOrEpochStartWindowMs']==f['creationOrEpochStartWindowMs']
  assert x['includesUnsavedTail'] is complete and x['epochObservation']=={'continuous':True,'startSource':start_source}
  assert x['activityState']in ['active','terminal'] and x['clockDomain']==f['clockDomain'] and x['clockUnit']=='ms'
  assert x['applicationPid']==s['snapshotProvenance']['applicationPid'] and x['instancePid']==s['binding']['pid']
  assert x['correlation']==s['correlation'] and x['runId']==s['correlation']['runId'] and x['groupId']==s['correlation']['groupId']
 return {'events':len(es),'epochId':f['epochIds'][0],'continuous':True,'startSource':start_source,'includesUnsavedTail':complete,'startMs':f['creationOrEpochStartWindowMs'],'last':es[-1]}
def stop_pair(s):
 es=s['events'];stop=one(es,'agent-termination-decided');commit=one(es,'agent-terminal-committed')
 for key in ['runId','groupId','attemptId','clockDomain','applicationPid','instancePid','status','reason']:assert stop[key]==commit[key],key
 assert commit['commitBoundary']=='outer-commit-confirmed' and stop['seq']<commit['seq']
 late=[e for e in es if e['kind']=='agent-turn-dispatched'and e['monotonicMs'][0]>stop['decisionWindowMs'][1]]
 assert not late,'new dispatch after hard stop'
 return stop,commit

def timing_status(bounds,maximum):
 return 'FAIL'if bounds[0]>maximum else ('WITHIN_BOUND'if bounds[1]<=maximum else'BLOCKED')

m=read(RUN/'manifest.json');results=read(RUN/'results.json');events=read(RUN/'events.json');runner=read(RUN/'runner-summary.json')
assert m['sutRevision']==PIN and m['qaRevision']=='02ea807faed44ebaed8a41741f4056de8e04e87a'
assert m['phase']=='developer-preflight' and not results['integrity'] and not runner['runnerErrors']
assert m['qaTree']['sha256']==results['metadata']['qaTreeAfter']['sha256']
res={'reviewedAt':datetime.now(timezone.utc).isoformat(),'method':'Offline independent Decimal arithmetic from this run original JSON lexemes; no tolerance; no SUT/controller/DB calls. Reused generic interval/identity checks, never prior candidate values/results. This is a developer-preflight subset, not new full-business acceptance.','run':{k:m[k]for k in ['runId','phase','startedAt','qaRevision','sutRevision','targetSha256']}|{'qaTreeBeforeSha256':m['qaTree']['sha256'],'qaTreeAfterSha256':results['metadata']['qaTreeAfter']['sha256'],'runnerErrors':runner['runnerErrors'],'integrity':results['integrity']},'cases':{}}
for cid,pattern,akey in [('AGENT-025','*AGENT-025*/evidence/wall-clock-window.json','witness'),('CAP-003','*capacity-control*/evidence/capacity-active-budget.json','activity')]:
 p=pick(RUN/'artifacts',pattern);d=read(p);s=d['lifecycle'];lc=lifecycle(s);a=activity(d[akey],'run-creation',True);same_resource(s,d[akey]);created=one(s['events'],'agent-run-created');stop,commit=stop_pair(s)
 assert created['clockDomain']==stop['clockDomain'] and created['runId']==stop['runId']
 assert a['last']['activityState']=='terminal' and stop['status']=='failed' and stop['reason']=='wall_clock'
 bounds=span(created['creationWindowMs'],stop['decisionWindowMs']);abounds=a['last']['activeElapsedMs'];assert timing_status(abounds,60000)=='WITHIN_BOUND'
 v={'reviewStatus':'PASS' if timing_status(bounds,60000)=='WITHIN_BOUND'else timing_status(bounds,60000),'requiredMaximumMs':60000,'source':str(p.relative_to(ROOT)),'identity':identity(s),'lifecycleCompleteness':lc,'creation':created,'actualStop':stop,'matchingCommit':commit,'decisionElapsedMs':bounds,'commitAfterDecisionMs':span(stop['decisionWindowMs'],commit['monotonicMs']),'activity':a,'activityReportedBounds':abounds,'dispatchCount':sum(x['kind']=='agent-turn-dispatched'for x in s['events']),'noDispatchAfterStopInCapturedHistory':True,'publicObservationOnly':{k:d[k]for k in ['start','end','monotonicStart','monotonicEnd','independentOnlineMs','publicTerminalObserved','status','endReason','independentOnline']if k in d},'capacityPersistedDiagnosticOnly':d.get('capacitySampleOnly'),'missingReportedByRunner':d.get('missing')}
 facts=read(p.parent/'external-facts.json');assert not facts['agent']['backgroundErrors'] and not facts['gateway']['backgroundErrors']
 v['externalTurns']=[{'id':x['id'],'at':x['at'],'completedAt':x.get('completedAt'),'runId':x['body']['runId']}for x in facts['agent']['turns']]
 assert all(x['runId']==stop['runId']for x in v['externalTurns'])
 assert all(x['kind']not in ['send','kick']for x in facts['gateway']['effects'])
 v['noSendOrKickEffectInCapturedExternalFacts']=True
 if cid=='AGENT-025':
  assert d['publicTerminalObserved'] and d['status']=='failed' and d['endReason']=='wall_clock';assert len(v['externalTurns'])==v['dispatchCount']
 else:
  candidates=[(q,json.loads(q.read_bytes()))for q in p.parent.glob('capacity-http-*.json')]
  cp,_=max(candidates,key=lambda x:(len(x[1].get('response',{}).get('events',[])), x[1].get('response',{}).get('state')=='released'))
  cs=read(cp)['response'];assert cs['binding']==s['binding'] and all(cs['correlation'][k]==s['correlation'][k]for k in ['runId','groupId'])
  refused=[x for x in cs['events']if x['kind']=='admission-refused'];persisted=[x for x in cs['events']if x['kind']=='ready-persisted']
  assert refused and all(x['reason']=='capacity' and x['callbackEntered'] is False and x['remoteRequestCount']==0 for x in refused)
  assert [x['attemptId']for x in refused]==[x['attemptId']for x in persisted]
  assert len(v['externalTurns'])==1 and cs['state']=='released'
  assert d['publicSamples'][-1]['status']=='failed' and d['publicSamples'][-1]['endReason']=='wall_clock'
  final=read(p.parent/'capacity-budget-final.json');assert final['runs'][0]['id']==stop['runId'] and final['runs'][0]['status']=='failed' and final['runs'][0]['endReason']=='wall_clock' and not final['runs'][0]['recoveryNote']
  assert len(final['agent']['turns'])==1 and not any(q['path'].endswith('/kick')for q in final['gateway']['requests']) and not any(q['kind']=='kick'for q in final['gateway']['effects'])
  postpath=pick(p.parent,'capacity-post-release-*');post=read(postpath);assert post['elapsedMs']>=post['observationMs']==1500 and all(x['status']=='failed' and x['endReason']=='wall_clock'for x in post['samples'])
  v['releaseFollowup']={'postReleaseSource':str(postpath.relative_to(ROOT)),'postReleaseObservation':post,'source':str((p.parent/'capacity-budget-final.json').relative_to(ROOT)),'observedAt':final['at'],'runId':final['runs'][0]['id'],'status':'failed','endReason':'wall_clock','capturedKickRequests':0,'capturedKickEffects':0,'capturedTurns':1}
  v['actualCapacityRefusal']={'source':str(cp.relative_to(ROOT)),'refusals':len(refused),'readyPersisted':len(persisted),'first':refused[0],'last':refused[-1],'finalState':cs['state'],'externalTurnCountThroughCleanup':1,'events':[x for x in cs['events']if x['kind']not in ['admission-refused','ready-persisted']]}
 res['cases'][cid]=v

p=pick(RUN/'artifacts','*AGENT-028*/evidence/send-timeout-window.json');d=read(p);s=d['lifecycle'];lc=lifecycle(s);ks=['send-key-resolved','send-wait-started','send-wait-result-ready','send-tool-result-returned','send-tool-history-committed'];edges={k:one([e for e in s['events']if e.get('toolUseId')=='send-timeout'],k)for k in ks}
for key in ['runId','groupId','stepId','toolUseId','attemptId','clockDomain','applicationPid','instancePid']:assert len({edges[k][key]for k in ks})==1,key
assert all(edges[k]['clientMsgId']==d['clientMsgId']for k in ks[:-1]);assert all(edges[k]['idempotencyKey']=='timeout'for k in ks[:-1]);assert all(edges[k]['errorCode']=='SEND_TIMEOUT'for k in ks[2:]);assert edges[ks[-1]]['commitBoundary']=='outer-commit-confirmed'
assert [edges[k]['seq']for k in ks]==sorted(edges[k]['seq']for k in ks)
start=[edges[ks[0]]['monotonicMs'][0],edges[ks[1]]['monotonicMs'][1]];end=[edges[ks[2]]['monotonicMs'][0],edges[ks[3]]['monotonicMs'][1]];bounds=span(start,end)
res['cases']['AGENT-028']={'reviewStatus':timing_status(bounds,5000),'requiredMaximumMs':5000,'source':str(p.relative_to(ROOT)),'identity':identity(s),'lifecycleCompleteness':lc,'events':edges,'actualWaitStartEnvelopeMs':start,'readyToPhysicalReturnEnvelopeMs':end,'elapsedMs':bounds,'excessAlreadyAtReadyLowerMs':bounds[0]-5000,'historyCommitAfterPhysicalReturnMs':span(edges[ks[3]]['monotonicMs'],edges[ks[4]]['monotonicMs']),'originalRunnerInterval':read(p.parent/'send-timeout-actual-interval.json'),'boundary':'Lower bound ends at result-ready before physical return and history COMMIT; no COMMIT/public lag is charged to manufacture this failure.'}

# Full cross-epoch collector: independently validate original process truth and recompute both bounds.
e=pick(RUN/'artifacts','*/evidence/activity-restart-raw-*.json').parent;rp=pick(e,'activity-restart-raw-*.json');r=read(rp);bp=pick(e,'activity-restart-budget-*');original=read(bp)
cal=read(pick(e,'activity-live-calibration-before-kill-*'));assert r['beforeKill']==cal;a,b=cal;old=b['snapshot'];oa=activity(old,'run-creation',True);k=read(pick(e,'activity-kill-window-*'));ex=r['exited'];assert ex==k['exited']
assert a['parentClockDomain']==b['parentClockDomain']==ex['parentClockDomain']==r['parentClockDomain'];assert a['parentWindowMs'][1]<=b['parentWindowMs'][0]
same_resource(a['snapshot'],old);assert a['snapshot']['clockObservation']['monotonicMs']<old['clockObservation']['monotonicMs'];assert a['snapshot']['events']==old['events'][:len(a['snapshot']['events'])]
assert old['state']=='held' and k['safetyBeforeKill']==old
safe=one(old['events'],'activity-safe-held');assert safe['remoteInFlightCount']==0 and safe['continuationDurable'] is True and safe['safeBoundary']=='read-tool-result-outer-commit-confirmed-before-next-dispatch'
expiry=D(str(datetime.fromisoformat(old['expiresAt'].replace('Z','+00:00')).timestamp()))*1000;assert D(k['killAfterUtc'])<expiry
assert ex['applicationPid']==old['clockObservation']['applicationPid']==old['snapshotProvenance']['applicationPid'] and ex['guardianPid']==old['binding']['pid'];assert ex['applicationStarted']==old['snapshotProvenance']['applicationStarted'];assert ex['signal']=='SIGKILL' and ex['exitObservation']=='owned-process-confirmed-absent'
owned=[(p,read(p))for p in e.glob('application-owned-identity-*.json')];oid=next(x for p,x in owned if x['applicationPid']==ex['applicationPid']);assert oid['applicationStarted']==ex['applicationStarted'] and oid['guardianPid']==ex['guardianPid']
for check in ex['checks']:
 assert check['args']==['-p',str(check['pid']),'-o','ppid=,pgid=,uid=,lstart=']
 if check['identity'] is None:continue
 match=re.fullmatch(r'\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*',check['stdout']);assert match
 ident=check['identity'];assert [int(match[i])for i in [1,2,3]]==[ident['parentPid'],ident['processGroupId'],ident['uid']];assert match[4]==ident['started'];assert ident['processGroupId']==ex['guardianPid'] and ident['uid']==oid['uid']
 if check['pid']==ex['applicationPid']:assert ident['started']==ex['applicationStarted'] and ident['parentPid']==ex['guardianPid']
 else:assert check['pid']==ex['guardianPid'] and ident['started']==oid['guardianStarted']
lastcheck=ex['checks'][-1];assert lastcheck['pid']==ex['applicationPid'] and lastcheck['identity'] is None and lastcheck['exitCode']==1 and not lastcheck['stdout'].strip() and not lastcheck['stderr'].strip();assert lastcheck['requestWindowMs'][1]==ex['processExitObservedAfterMs']
assert max(x['requestWindowMs'][1]for x in ex['checks'][:-1])<=ex['signalRequestedBeforeMs']<lastcheck['requestWindowMs'][0]
offs=[[z['parentWindowMs'][0]-z['snapshot']['clockObservation']['monotonicMs'],z['parentWindowMs'][1]-z['snapshot']['clockObservation']['monotonicMs']]for z in cal];off=[max(z[0]for z in offs),min(z[1]for z in offs)];assert off[0]<=off[1]
created=[oa['startMs'][0]+off[0],oa['startMs'][1]+off[1]];assert r['create'][0]<=created[0]<=created[1]<=r['create'][1];exitwindow=[ex['signalRequestedBeforeMs'],ex['processExitObservedAfterMs']];oldspan=span(created,exitwindow)
# Verify every measured recovery prefix, not only the final collector's status.
samples=[(p,read(p))for p in e.glob('activity-recovery-measured-*.json')];samples.sort(key=lambda z:z[1]['measured']['parentWindowMs'][1]);prior=None
for p,d in samples:
 measured=d['measured'];s=measured['snapshot'];life=d['lifecycleWitness'];ac=activity(s,'clock-acquisition',False);lifecycle(life);same_resource(s,life)
 assert measured['parentClockDomain']==r['parentClockDomain'] and s['correlation']==old['correlation']
 assert s['binding']['apiUrl']==old['binding']['apiUrl'] and s['snapshotProvenance']['applicationPid']!=ex['applicationPid'] and s['binding']['pid']!=ex['guardianPid']
 assert ac['epochId']!=oa['epochId'] and s['clockObservation']['clockDomain']!=old['clockObservation']['clockDomain']
 if prior:
  assert prior['measured']['snapshot']['events']==s['events'][:len(prior['measured']['snapshot']['events'])]
  assert prior['lifecycleWitness']['events']==life['events'][:len(prior['lifecycleWitness']['events'])]
  assert prior['measured']['parentWindowMs'][1]<=measured['parentWindowMs'][0]
 prior=d
new=r['afterRecovery'];ns=new['snapshot'];na=activity(ns,'clock-acquisition',False);assert new['parentClockDomain']==r['parentClockDomain'];same_resource(ns,prior['measured']['snapshot'])
assert prior['measured']['snapshot']['events']==ns['events'][:len(prior['measured']['snapshot']['events'])]
ls={**prior['lifecycleWitness'],'events':r['recoveredLifecycle']};lifecycle(ls);assert prior['lifecycleWitness']['events']==ls['events'][:len(prior['lifecycleWitness']['events'])];stop,commit=stop_pair(ls)
assert stop['status']=='failed' and stop['reason']=='wall_clock' and na['last']['activityState']=='terminal'
newspan=span(na['startMs'],stop['decisionWindowMs']);noff=[x-ns['clockObservation']['monotonicMs']for x in new['parentWindowMs']];newstart=[na['startMs'][0]+noff[0],na['startMs'][1]+noff[1]]
assert ex['processExitObservedAfterMs']<r['startupWindowMs'][0]<=r['startupWindowMs'][1]<new['parentWindowMs'][0]
startupgap=[D(0),max(D(0),newstart[1]-r['startupWindowMs'][0])];downtime=span(exitwindow,[r['startupWindowMs'][0],r['startupWindowMs'][0]])
full=[oldspan[0]+newspan[0],oldspan[1]+newspan[1]+startupgap[1]]
assert timing_status(full,60000)=='WITHIN_BOUND'
# Decimal versus JS binary-float representation: retain differences, never apply as acceptance tolerance.
comparisons={key:{'independent':val,'runner':original[key],'difference':[val[i]-original[key][i]for i in range(2)]}for key,val in {'oldOffsetMs':off,'newOffsetMs':noff,'creationParentMs':created,'exitWindowMs':exitwindow,'newStartParentMs':newstart,'oldActiveMs':oldspan,'newActiveMs':newspan,'provenDowntimeMs':downtime,'startupGapMs':startupgap,'fullActiveMs':full}.items()}
recovered=next(x for p,x in owned if x['applicationPid']==ns['snapshotProvenance']['applicationPid']);assert recovered['applicationStarted']==ns['snapshotProvenance']['applicationStarted'] and recovered['guardianPid']==ns['binding']['pid'] and recovered['uid']==oid['uid']
ret=read(pick(e,'activity-after-exit-retained-*'));assert ret['snapshot']['snapshotProvenance']['source']=='retained-after-process-exit'
ledger_names={'beforeLedger':'activity-ledger-held-before-kill-*','afterExitLedger':'activity-ledger-after-actual-exit-*','beforeRestartLedger':'activity-ledger-before-restart-*','finalLedger':'activity-ledger-terminal-*'}
for key,pattern in ledger_names.items():assert r[key]==read(pick(e,pattern))
bl,al,rl,fl=[r[k]for k in ledger_names]
assert all(x['parentClockDomain']==r['parentClockDomain'] and x['database']==bl['database']and len(x['run'])==1 and x['run'][0]['id']==old['correlation']['runId']and x['run'][0]['group_id']==old['correlation']['groupId']for x in [bl,al,rl,fl])
assert bl['run'][0]['inflight_turn'] is False and al['run']==rl['run'] and al['steps']==rl['steps'];assert al['windowMs'][0]>exitwindow[1] and rl['windowMs'][1]<r['startupWindowMs'][0]
ack=read(pick(e,'activity-ledger-acknowledged-comparison-*'));assert D(ack['actualAfterExit'])>=D(ack['acknowledged'])==D(oa['last']['lastSuccessfulSample']['persistedActiveMs'])
assert D(al['run'][0]['active_ms'])==D(ack['actualAfterExit']) and bl['run'][0]['history']==al['run'][0]['history']
assert fl['run'][0]['status']=='failed' and fl['run'][0]['end_reason']=='wall_clock' and fl['run'][0]['inflight_turn'] is False
assert fl['steps'][:len(bl['steps'])]==bl['steps'] and fl['run'][0]['history'][:len(bl['run'][0]['history'])]==bl['run'][0]['history']
assert len({x['tool_use_id']for x in fl['steps']})==len(fl['steps'])==7 and all(x['state']=='complete' and x['name']=='get_recent_messages'for x in fl['steps'])
facts=read(e/'external-facts.json');turns=facts['agent']['turns'];assert len(turns)==7 and not facts['agent']['backgroundErrors'] and not facts['gateway']['backgroundErrors']
turn_summary=[]
for i,t in enumerate(turns):
 assert t['body']['runId']==old['correlation']['runId'] and t['responseStatus']==200
 answer=json.loads(t['rawResponse']);tool=answer['content'][0];assert tool['id']==f'activity-{i}' and tool['name']=='get_recent_messages' and tool['input']['limit']==i+1
 history=t['body']['messages'];uses=[b['id']for m in history for b in m['content']if b.get('type')=='tool_use'];answers=[b['tool_use_id']for m in history for b in m['content']if b.get('type')=='tool_result'];assert uses==answers==[f'activity-{j}'for j in range(i)]
 turn_summary.append({'requestId':t['id'],'runId':t['body']['runId'],'at':t['at'],'completedAt':t['completedAt'],'toolUseId':tool['id'],'priorToolIds':uses})
assert all(datetime.fromisoformat(x['completedAt'].replace('Z','+00:00')).timestamp()*1000<k['killBeforeUtc']for x in turn_summary[:3])
assert [x['ordinal']for x in ls['events']if x['kind']=='agent-turn-dispatched']==[4,5,6,7]
assert all(x['kind']not in ['send','kick']for x in facts['gateway']['effects'])
api=[json.loads(x)for x in raw(e/'api.ndjson').decode().splitlines()];responses=[]
for x in api:
 if x.get('phase')=='response' and x.get('status')==200 and isinstance(x.get('responseBody'),str):
  try: body=json.loads(x['responseBody'])
  except ValueError:continue
  responses.append((x,body))
runs=[(x,b)for x,b in responses if isinstance(b,dict)and b.get('id')==old['correlation']['runId']]
assert runs and all(not b.get('recoveryNote')for x,b in runs);assert runs[-1][1]['status']=='failed' and runs[-1][1]['endReason']=='wall_clock'
groups=[(x,b)for x,b in responses if isinstance(b,dict)and b.get('id')==old['correlation']['groupId']];assert groups[-1][1]['activeAgentRunId'] is None
ackwindow=[oa['last']['lastSuccessfulSample']['windowMs'][0]+off[0],oa['last']['lastSuccessfulSample']['windowMs'][1]+off[1]];tail=span(ackwindow,exitwindow)
res['cases']['INT-ACT-001']={'reviewStatus':'PASS','requiredMaximumMs':60000,'fullCollectorSource':str(rp.relative_to(ROOT)),'runnerAggregateSource':str(bp.relative_to(ROOT)),'parentClockDomain':r['parentClockDomain'],'oldIdentity':identity(old),'newIdentity':identity(ns),'oldEpochId':oa['epochId'],'newEpochId':na['epochId'],'oldCalibrationInputs':[{'parentWindowMs':x['parentWindowMs'],'clockObservation':x['snapshot']['clockObservation'],'offsetMs':offs[i]}for i,x in enumerate(cal)],'oldOffsetIntersectionMs':off,'oldCreationMs':oa['startMs'],'creationParentMs':created,'safeBoundary':safe,'safeHeldThroughKill':True,'leaseExpiresAt':old['expiresAt'],'killAfterUtc':k['killAfterUtc'],'actualExit':ex,'exitWindowMs':exitwindow,'oldActiveMs':oldspan,'newCalibration':{'parentWindowMs':new['parentWindowMs'],'clockObservation':ns['clockObservation'],'offsetMs':noff},'newAcquisitionMs':na['startMs'],'newStartParentMs':newstart,'newActiveMs':newspan,'actualStop':stop,'matchingCommit':commit,'commitAfterDecisionMs':span(stop['decisionWindowMs'],commit['monotonicMs']),'activityTerminalEndMsDiagnostic':na['last']['activityEndWindowMs'],'newEpochCompleteness':na['last']['epochObservation'],'newEpochIncludesPriorUnsavedTail':na['last']['includesUnsavedTail'],'startupWindowMs':r['startupWindowMs'],'startupGapMs':startupgap,'provenDowntimeMs':downtime,'fullActiveMs':full,'tailSinceLastAckMs':tail,'unsavedTailMs':[0,tail[1]],'allRecoverySnapshotsImmutablePrefix':True,'recoverySnapshotCount':len(samples),'newLifecycle':lifecycle(ls),'retainedSnapshotUsedForCalibration':False,'ledger':{'beforeActiveMs':bl['run'][0]['active_ms'],'afterExitActiveMs':al['run'][0]['active_ms'],'beforeRestartActiveMs':rl['run'][0]['active_ms'],'finalActiveMsDiagnostic':fl['run'][0]['active_ms'],'beforeSteps':len(bl['steps']),'finalSteps':len(fl['steps']),'downtimeUnchanged':True,'postExitCoversLastAck':True,'sameRunHistoryPrefixPreserved':True,'uniqueCompletedReadToolIds':[x['tool_use_id']for x in fl['steps']],'postExitWindow':al['windowMs'],'beforeRestartWindow':rl['windowMs']},'externalTurns':turn_summary,'publicRunReads':len(runs),'finalPublicRun':runs[-1][1],'finalPublicGroup':groups[-1][1],'noPausedRecoveryObserved':True,'noNewDispatchAfterActualStopInCapturedHistory':True,'noGatewaySendOrKickEffects':True,'independentVsRunnerArithmetic':comparisons,'scopeLimit':'One safe committed read-tool boundary, one real app SIGKILL and restart, this original run only. Not arbitrary in-flight side effect crash recovery; not all DB locks or every future 60s execution; no second post-terminal restart tested. Unsaved tail lower 0 is no assertion of zero loss. Entire startup gap conservatively included in upper.'}
for cid,v in res['cases'].items():
 official=[x for x in events if x['id']==cid];attempts=[x for x in results['attempts']if x['id']==cid];assert len(official)==1 and official==attempts and official[0]['attempt']==0
 assert official[0]['status']==v['reviewStatus'];v['rawAttempt']=official[0]
res['sourceIndex']=used
# Ensure no raw input changed while reviewing; source files are never written.
for p,entry in used.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==entry['sha256'],p
res['sourceCount']=len(used);res['inputsUnchangedAtReviewEnd']=True
(OUT/'backend-facts.json').write_text(json.dumps(res,ensure_ascii=False,indent=2,default=str)+'\n')
print(json.dumps({'sourceCount':len(used),'sourceFingerprint':res['run']['qaTreeBeforeSha256'],'results':{cid:{'status':x['reviewStatus'],'ms':x.get('decisionElapsedMs',x.get('elapsedMs',x.get('fullActiveMs')))}for cid,x in res['cases'].items()}},default=str))
