"""Offline evidence review; never contacts the SUT, database, controller or process table."""
from pathlib import Path
from decimal import Decimal as D
from datetime import datetime, timezone
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
RUN=ROOT/'reports/runs/2026-10-01T14-26-25.068Z-1e0cb38a'
PIN='2716abdd2d43a779b6a0972a6323f895cf2b5b9c'
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

m=read(RUN/'manifest.json');assert m['sutRevision']==PIN and m['qaRevision']=='ec46f9b30fb2f5a312c92fc78463ddbfe200042f'
res={'reviewedAt':datetime.now(timezone.utc).isoformat(),'method':'Independent offline Decimal interval arithmetic on original JSON numeric lexemes. String decimal output preserves arithmetic; sourceIndex hashes identify raw inputs. No SUT/controller/DB calls or raw edits. No tolerance, no new minimum 60-second requirement. Timing verdict is not whole-case PASS.', 'run':{k:m[k]for k in ['runId','phase','startedAt','qaRevision','sutRevision','targetSha256']}|{'qaTreeSha256':m['qaTree']['sha256']},'cases':{}}
for cid,pattern,akey in [('AGENT-025','*AGENT-025*/evidence/wall-clock-window.json','witness'),('CAP-003','*capacity-control*/evidence/capacity-active-budget.json','activity')]:
 p=pick(RUN/'artifacts',pattern);d=read(p);s=d['lifecycle'];lc=lifecycle(s);a=activity(d[akey],'run-creation',True);same_resource(s,d[akey]);created=one(s['events'],'agent-run-created');stop,commit=stop_pair(s)
 assert created['clockDomain']==stop['clockDomain'] and created['runId']==stop['runId']
 bounds=span(created['creationWindowMs'],stop['decisionWindowMs'])
 res['cases'][cid]={'timingVerdict':timing_status(bounds,60000),'requiredMaximumMs':60000,'source':str(p.relative_to(ROOT)),'identity':identity(s),'lifecycleCompleteness':lc,'creation':created,'actualStop':stop,'matchingCommit':commit,'decisionElapsedMs':bounds,'commitAfterDecisionMs':span(stop['decisionWindowMs'],commit['monotonicMs']),'activity':a,'activityReportedBounds':a['last'].get('activeElapsedMs'),'activityReportedVerdict':timing_status(a['last']['activeElapsedMs'],60000),'dispatchCount':sum(x['kind']=='agent-turn-dispatched'for x in s['events']),'noDispatchAfterStopInCapturedHistory':True,'publicObservationOnly':{k:d[k]for k in ['start','end','monotonicStart','monotonicEnd','independentOnlineMs','publicTerminalObserved','status','endReason','independentOnline','publicSamples']if k in d},'capacityPersistedDiagnosticOnly':d.get('capacitySampleOnly'),'missingReportedByRunner':d.get('missing')}
 # Read original error text as provisional runner outcome; not instructions.
 err=raw(p.parent.parent/'error-context.md').decode();res['cases'][cid]['rawErrorExcerpt']=err.split('# Error details\n\n',1)[1].split('# Test source',1)[0].strip()

p=pick(RUN/'artifacts','*AGENT-028*/evidence/send-timeout-window.json');d=read(p);s=d['lifecycle'];lc=lifecycle(s);ks=['send-key-resolved','send-wait-started','send-wait-result-ready','send-tool-result-returned','send-tool-history-committed'];edges={k:one([e for e in s['events']if e.get('toolUseId')=='send-timeout'],k)for k in ks}
for key in ['runId','groupId','stepId','toolUseId','attemptId','clockDomain','applicationPid','instancePid']:assert len({edges[k][key]for k in ks})==1,key
assert all(edges[k]['clientMsgId']==d['clientMsgId']for k in ks[:-1]);assert all(edges[k]['idempotencyKey']=='timeout'for k in ks[:-1]);assert all(edges[k]['errorCode']=='SEND_TIMEOUT'for k in ks[2:]);assert edges[ks[-1]]['commitBoundary']=='outer-commit-confirmed'
assert [edges[k]['seq']for k in ks]==sorted(edges[k]['seq']for k in ks)
start=[edges[ks[0]]['monotonicMs'][0],edges[ks[1]]['monotonicMs'][1]];end=[edges[ks[2]]['monotonicMs'][0],edges[ks[3]]['monotonicMs'][1]];bounds=span(start,end)
res['cases']['AGENT-028']={'timingVerdict':timing_status(bounds,5000),'requiredMaximumMs':5000,'source':str(p.relative_to(ROOT)),'identity':identity(s),'lifecycleCompleteness':lc,'events':edges,'actualWaitStartEnvelopeMs':start,'readyToPhysicalReturnEnvelopeMs':end,'elapsedMs':bounds,'physicalReturnAfterLatestStartMs':edges[ks[3]]['monotonicMs'][0]-start[1],'historyCommitAfterPhysicalReturnMs':span(edges[ks[3]]['monotonicMs'],edges[ks[4]]['monotonicMs']),'originalRunnerInterval':read(p.parent/'send-timeout-actual-interval.json'),'boundary':'Lower bound already ends at result-ready before physical return and history COMMIT. COMMIT/public observation is not used to manufacture timeout overrun.'}
err=raw(p.parent.parent/'error-context.md').decode();res['cases']['AGENT-028']['rawErrorExcerpt']=err.split('# Error details\n\n',1)[1].split('# Test source',1)[0].strip()

e=pick(RUN/'artifacts','*/evidence/activity-before-crash.json').parent
cp=pick(e,'activity-live-calibration-before-kill-*.json');cal=read(cp);a,b=cal;kp=pick(e,'activity-kill-window-*.json');k=read(kp);ex=k['exited'];old=b['snapshot'];oa=activity(old,'run-creation',True)
assert a['parentClockDomain']==b['parentClockDomain']==ex['parentClockDomain'];assert a['parentWindowMs'][1]<=b['parentWindowMs'][0]
same_resource(a['snapshot'],old);assert a['snapshot']['clockObservation']['monotonicMs']<old['clockObservation']['monotonicMs'];assert a['snapshot']['events']==old['events'][:len(a['snapshot']['events'])]
assert old['state']=='held' and k['safetyBeforeKill']==old
safe=one([x for x in old['events']if x['kind']=='activity-safe-held'],'activity-safe-held');assert safe['remoteInFlightCount']==0 and safe['continuationDurable'] is True and safe['safeBoundary']=='read-tool-result-outer-commit-confirmed-before-next-dispatch'
expiry=D(str(datetime.fromisoformat(old['expiresAt'].replace('Z','+00:00')).timestamp()))*1000;assert D(k['killAfterUtc'])<expiry
assert ex['applicationPid']==old['clockObservation']['applicationPid']==old['snapshotProvenance']['applicationPid'] and ex['guardianPid']==old['binding']['pid'];assert ex['applicationStarted']==old['snapshotProvenance']['applicationStarted'];assert ex['signal']=='SIGKILL' and ex['exitObservation']=='owned-process-confirmed-absent'
owned=[(p,read(p))for p in e.glob('application-owned-identity-*.json')];oid=next(x for p,x in owned if x['applicationPid']==ex['applicationPid']);assert oid['applicationStarted']==ex['applicationStarted'] and oid['guardianPid']==ex['guardianPid']
# Reparse original ps output, preserving internal spaces in lstart; do not confuse guardian with app.
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
created=[oa['startMs'][0]+off[0],oa['startMs'][1]+off[1]];oldspan=span(created,[ex['signalRequestedBeforeMs'],ex['processExitObservedAfterMs']])
samples=[(p,read(p))for p in e.glob('activity-recovery-measured-*.json')];samples.sort(key=lambda z:z[1]['measured']['parentWindowMs'][1]);deriv=[];prior=None
for p,d in samples:
 measured=d['measured'];s=measured['snapshot'];life=d['lifecycleWitness'];ac=activity(s,'clock-acquisition',False);lc=lifecycle(life);same_resource(s,life)
 assert measured['parentClockDomain']==b['parentClockDomain'] and s['correlation']==old['correlation'];assert s['binding']['apiUrl']==old['binding']['apiUrl'];assert s['snapshotProvenance']['applicationPid']!=ex['applicationPid'] and s['binding']['pid']!=ex['guardianPid'];assert ac['epochId']!=oa['epochId'] and s['clockObservation']['clockDomain']!=old['clockObservation']['clockDomain']
 if prior:
  assert prior['measured']['snapshot']['events']==s['events'][:len(prior['measured']['snapshot']['events'])]
  assert prior['lifecycleWitness']['events']==life['events'][:len(prior['lifecycleWitness']['events'])]
  assert prior['measured']['parentWindowMs'][1]<=measured['parentWindowMs'][0]
 stops=[x for x in life['events']if x['kind']=='agent-termination-decided'];assert len(stops)<=1
 if stops:
  st=stops[0];assert st['clockDomain']==s['clockObservation']['clockDomain'];lower=span(ac['startMs'],st['decisionWindowMs'])[0];mode='actual-stop-decision'
 else:
  # The runner read complete live lifecycle immediately after this live activity snapshot.
  # This proves no stop existed at that read; do not use a terminal bookkeeping sample.
  assert ac['last']['activityState']=='active';lower=max(x['observedEpochActiveMs'][0]for x in s['events']if x['activityState']=='active');mode='active-checkpoint-with-subsequent-complete-live-no-stop-history'
 deriv.append({'source':str(p.relative_to(ROOT)),'parentWindowMs':measured['parentWindowMs'],'mode':mode,'oldSafeLowerMs':oldspan[0],'newSafeLowerMs':lower,'totalSafeLowerMs':oldspan[0]+lower});prior=d
lastp,last=samples[-1];s=last['measured']['snapshot'];life=last['lifecycleWitness'];ac=activity(s,'clock-acquisition',False);stop,commit=stop_pair(life);newspan=span(ac['startMs'],stop['decisionWindowMs']);totallower=oldspan[0]+newspan[0]
recovered=next(x for p,x in owned if x['applicationPid']==s['snapshotProvenance']['applicationPid']);assert recovered['applicationStarted']==s['snapshotProvenance']['applicationStarted'] and recovered['guardianPid']==s['binding']['pid'] and recovered['uid']==oid['uid']
retp=pick(e,'activity-after-exit-retained-*.json');ret=read(retp);assert ret['snapshot']['snapshotProvenance']['source']=='retained-after-process-exit'
ledgers={name:read(pick(e,pattern))for name,pattern in [('held','activity-ledger-held-before-kill-*'),('afterExit','activity-ledger-after-actual-exit-*'),('beforeRestart','activity-ledger-before-restart-*')]};assert ledgers['afterExit']['run']==ledgers['beforeRestart']['run'] and ledgers['afterExit']['steps']==ledgers['beforeRestart']['steps'];assert ledgers['held']['run'][0]['inflight_turn'] is False
ack=read(pick(e,'activity-ledger-acknowledged-comparison-*'));assert D(ack['actualAfterExit'])>=D(ack['acknowledged'])==D(oa['last']['lastSuccessfulSample']['persistedActiveMs'])
res['cases']['INT-ACT-001']={'timingVerdict':'FAIL'if totallower>60000 else'BLOCKED','requiredMaximumMs':60000,'calibrationSource':str(cp.relative_to(ROOT)),'killSource':str(kp.relative_to(ROOT)),'lastMeasuredSource':str(lastp.relative_to(ROOT)),'calibrations':[{'parentWindowMs':z['parentWindowMs'],'applicationClock':z['snapshot']['clockObservation'],'source':z['snapshot']['snapshotProvenance']['source'],'offsetMs':offs[i]}for i,z in enumerate(cal)],'parentClockDomain':b['parentClockDomain'],'offsetIntersectionMs':off,'oldIdentity':identity(old),'oldEpochId':oa['epochId'],'oldCreationMs':oa['startMs'],'oldCreationMappedToParentMs':created,'safeBoundary':safe,'safeLeaseExpiresAt':old['expiresAt'],'killAfterUtc':k['killAfterUtc'],'actualExit':ex,'oldActivityUntilActualExitMs':oldspan,'newIdentity':identity(s),'newEpochId':ac['epochId'],'newAcquisitionMs':ac['startMs'],'newLifecycleCompleteness':lifecycle(life),'actualStop':stop,'matchingCommit':commit,'newActivityUntilActualStopMs':newspan,'twoSegmentSumSafeLowerMs':totallower,'twoSegmentOnlyUpperMs':oldspan[1]+newspan[1],'fullRunUpperMs':None,'fullChainPass':False,'upperLimit':'Final collector not reached after decisive lower-bound failure. The displayed two-segment upper excludes unknown startup gap and is not a full-run upper. Missing gap cannot subtract the proven lower. Retained clock and persisted active_ms never fill the gap.','commitAfterDecisionMs':span(stop['decisionWindowMs'],commit['monotonicMs']),'activityEndWindowMsDiagnostic':ac['last'].get('activityEndWindowMs'),'newPersistedActiveMsDiagnostic':ac['last'].get('persistedActiveMs'),'sampleCount':len(samples),'firstOverrunSample':next((x for x in deriv if x['totalSafeLowerMs']>60000),None),'precedingSample':deriv[-2] if len(deriv)>1 else None,'allSampleDerivations':deriv,'afterExitRetainedSource':str(retp.relative_to(ROOT)),'afterExitCacheUsedForCalibration':False,'ledgerDiagnostic':{'acknowledged':ack,'unchangedDuringDowntime':True,'postExitReadWindowMs':ledgers['afterExit']['windowMs'],'preRestartReadWindowMs':ledgers['beforeRestart']['windowMs'],'inflightTurnAtHold':False,'note':'Persisted diagnostic establishes durable safe boundary and no change during stopped interval; not timing truth.'},'ownedIdentitySources':[str(p.relative_to(ROOT))for p,x in owned],'rawFinalCollectorOutputExists':any(e.glob('activity-cross-epoch-final*.json'))}
err=raw(e.parent/'error-context.md').decode();res['cases']['INT-ACT-001']['rawErrorExcerpt']=err.split('# Error details\n\n',1)[1].split('# Test source',1)[0].strip()
# Official reporter status may appear later; never manufacture a raw status from this review.
if (RUN/'results.json').exists():
 result=read(RUN/'results.json');res['officialStatusAvailable']=True
 for cid,v in res['cases'].items():v['rawAttempts']=[x for x in result['attempts']if x['id']==cid];assert len(v['rawAttempts'])==1
else:
 res['officialStatusAvailable']=False
 for v in res['cases'].values():v['rawAttempts']=None
# Corroborate final reporter attempt identities, without replacing the first record.
events=read(RUN/'events.json');summary=read(RUN/'runner-summary.json')
assert summary['runnerErrors']==[]
for cid,v in res['cases'].items():
 official=[x for x in events if x['id']==cid];assert len(official)==1 and official==v['rawAttempts']
 assert official[0]['attempt']==0 and official[0]['status']==v['timingVerdict']
 v['officialRawStatusVerified']=official[0]['status']
res['runnerSummary']=summary
capdir=pick(RUN/'artifacts','*/evidence/capacity-active-budget.json').parent
candidates=[(p,json.loads(p.read_bytes()))for p in capdir.glob('capacity-http-*.json')]
capfile,_=max(candidates,key=lambda x:len(x[1].get('response',{}).get('events',[])))
cs=read(capfile)['response'];cv=res['cases']['CAP-003'];assert cs['binding']==cv['identity']['binding']
assert all(cs['correlation'][key]==cv['identity']['correlation'][key]for key in ['runId','groupId'])
refused=[x for x in cs['events']if x['kind']=='admission-refused'];persisted=[x for x in cs['events']if x['kind']=='ready-persisted']
assert refused and all(x['reason']=='capacity' and x['callbackEntered'] is False and x['remoteRequestCount']==0 for x in refused)
assert [x['attemptId']for x in refused]==[x['attemptId']for x in persisted]
cv['actualRefusalWitness']={'source':str(capfile.relative_to(ROOT)),'refusals':len(refused),'matchingReadyPersisted':len(persisted),'firstRefusal':refused[0],'lastRefusal':refused[-1],'stateAtCleanup':cs['state'],'note':'Real refusal/ready evidence proves the condition was reached. Persistence-only run-terminal bounds are not a stop decision oracle.'}
res['sourceIndex']=used
(OUT/'backend-facts.json').write_text(json.dumps(res,ensure_ascii=False,indent=2,default=str)+'\n')
print(json.dumps({'officialStatusAvailable':res['officialStatusAvailable'],'caseTiming':{cid:{'verdict':v['timingVerdict'],'decisiveMs':v.get('decisionElapsedMs',v.get('elapsedMs',v.get('twoSegmentSumSafeLowerMs'))),'commitLag':v.get('commitAfterDecisionMs',v.get('historyCommitAfterPhysicalReturnMs'))}for cid,v in res['cases'].items()},'sourceCount':len(used)},default=str))
