"""Read-only postmortem: Decimal arithmetic on frozen evidence, no SUT access."""
from pathlib import Path
from decimal import Decimal as D
import hashlib,json
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
R1=ROOT/'reports/preflight/2026-10-01T14-20-03.813Z-b8814855'
R2=ROOT/'reports/preflight/2026-10-01T14-20-34.304Z-c2b3a488'
used={}
def read(p):
 p=Path(p);b=p.read_bytes();used[str(p.relative_to(ROOT))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 return json.loads(b,parse_float=D)
def pick(r,pat):
 ps=list(r.glob(pat));assert len(ps)==1,(pat,len(ps));return ps[0]
def span(start,end):return [end[0]-start[1],end[1]-start[0]]
def one(events,kind):
 v=[e for e in events if e['kind']==kind];assert len(v)==1,(kind,len(v));return v[0]
def identity(s):
 return {'binding':s['binding'],'correlation':s['correlation'],'provenance':s['snapshotProvenance']}
def full_lifecycle(s):
 es=s['events'];assert es[0]['kind']=='lifecycle-observation-attached';assert es[0]['droppedThroughSourceSeq']==0
 assert [e['seq']for e in es]==list(range(1,len(es)+1));assert s['snapshotProvenance']['source']=='live-bridge'
 assert all(e['applicationPid']==s['snapshotProvenance']['applicationPid']and e['instancePid']==s['binding']['pid']and e['correlation']==s['correlation']for e in es)
 return {'events':len(es),'attached':es[0],'localSequenceContiguous':True,'sourceHistoryDropped':0,'sourceNote':'sourceSeq is global and may have gaps because this stream is filtered; local seq is contiguous'}
res={'method':'Offline read-only Decimal interval derivation from original JSON number lexemes; decimal values serialized as strings, original bytes/hash preserved. No product or DB executed.','runs':[],'cases':{}}
for r in [R1,R2]:
 m=read(r/'manifest.json');results=read(r/'results.json');res['runs'].append({k:m[k]for k in ['runId','phase','startedAt','qaRevision','sutRevision','targetSha256','suiteSha256']}|{'suiteId':m['suite']['id'],'qaTreeSha256':m['qaTree']['sha256'],'selectedAttempts':[a for a in results['attempts']if a['id']in['AGENT-025','AGENT-028','CAP-003','INT-ACT-001']]})
 assert m['sutRevision']=='2716abdd2d43a779b6a0972a6323f895cf2b5b9c';assert m['qaRevision']=='04e41660aa49b07b1fd8df76e1f3aabfbc21a7f6'
# Actual stop and same-attempt COMMIT independently of later public terminal.
for cid,pat,activityKey in [('AGENT-025','*AGENT-025*/evidence/wall-clock-window.json','witness'),('CAP-003','*capacity-control*/evidence/capacity-active-budget.json','activity')]:
 p=pick(R2/'artifacts',pat);d=read(p);s=d['lifecycle'];es=s['events'];c=one(es,'agent-run-created');stop=one(es,'agent-termination-decided');commit=one(es,'agent-terminal-committed');check=full_lifecycle(s)
 assert stop['attemptId']==commit['attemptId'];assert stop['runId']==c['runId']==commit['runId'];assert stop['clockDomain']==c['clockDomain']==commit['clockDomain']
 decision=span(c['creationWindowMs'],stop['decisionWindowMs']);terminal=d[activityKey]['events'][-1]
 assert all(e.get('activityState')in['active','terminal']and e['includesUnsavedTail']is True and e['epochObservation']=={'continuous':True,'startSource':'run-creation'}and e['epochIds']==terminal['epochIds']for e in d[activityKey]['events'])
 assert not any(e['kind']=='agent-turn-dispatched'and e['monotonicMs'][0]>stop['decisionWindowMs'][1]for e in es)
 res['cases'][cid]={'rawStatus':'FAIL'if cid=='AGENT-025'else'BLOCKED','source':str(p.relative_to(ROOT)),'identity':identity(s),'lifecycleCompleteness':check,'creation':c,'actualStop':stop,'matchingCommit':commit,'decisionElapsedMs':decision,'commitAfterDecisionMs':span(stop['decisionWindowMs'],commit['monotonicMs']),'activityTerminal':terminal,'dispatchCount':sum(e['kind']=='agent-turn-dispatched'for e in es),'noDispatchAfterStopInCapturedHistory':True,'publicOnlyBounds':d.get('independentOnlineMs',d.get('independentOnline')),'capacitySampleOnly':d.get('capacitySampleOnly'),'activityEventCount':len(d[activityKey]['events'])}
 assert (decision[0]>60000)if cid=='AGENT-025'else(decision[0]<=60000<decision[1])
# Tool window: latest actual start to earliest ready is already >5s.
p=pick(R1/'artifacts','*AGENT-028*/evidence/send-timeout-window.json');d=read(p);s=d['lifecycle'];es=s['events'];check=full_lifecycle(s)
ks=['send-key-resolved','send-wait-started','send-wait-result-ready','send-tool-result-returned','send-tool-history-committed'];edges={k:one([e for e in es if e.get('toolUseId')=='send-timeout'],k)for k in ks}
assert len({edges[k]['attemptId']for k in ks})==1;assert len({edges[k]['clockDomain']for k in ks})==1
start=[edges[ks[0]]['monotonicMs'][0],edges[ks[1]]['monotonicMs'][1]];end=[edges[ks[2]]['monotonicMs'][0],edges[ks[3]]['monotonicMs'][1]];wait=span(start,end)
assert wait[0]>5000;assert all(edges[k]['errorCode']=='SEND_TIMEOUT'for k in ks[2:]);intervalp=p.parent/'send-timeout-actual-interval.json';interval=read(intervalp)
res['cases']['AGENT-028']={'rawStatus':'FAIL','source':str(p.relative_to(ROOT)),'intervalSource':str(intervalp.relative_to(ROOT)),'identity':identity(s),'lifecycleCompleteness':check,'events':edges,'startMs':start,'endMs':end,'elapsedMsDecimal':wait,'originalJsElapsed':interval['elapsed'],'commitAfterReturnMs':span(edges[ks[3]]['monotonicMs'],edges[ks[4]]['monotonicMs']),'boundary':'The lower endpoint ends at result-ready before result-returned/history-COMMIT; next turn/public GET is not the timing oracle.'}
# Two epochs: include actual exit envelope, never use retained cache to calibrate.
e=pick(R2/'artifacts','*integration-runtime*/evidence')
cp=pick(e,'activity-live-calibration-before-kill-*.json');cal=read(cp);kp=pick(e,'activity-kill-window-*.json');kill=read(kp);ex=kill['exited']
a,b=cal;assert a['parentClockDomain']==b['parentClockDomain']==ex['parentClockDomain'];assert a['parentWindowMs'][1]<=b['parentWindowMs'][0]
assert a['snapshot']['events']==b['snapshot']['events'][:len(a['snapshot']['events'])];assert a['snapshot']['snapshotProvenance']==b['snapshot']['snapshotProvenance']
for z in cal:assert z['snapshot']['snapshotProvenance']['source']=='live-bridge';assert z['snapshot']['state']=='held'
old=b['snapshot'];oe=old['events'][-1];assert any(v['kind']=='activity-safe-held'and v['remoteInFlightCount']==0 and v['continuationDurable']is True for v in old['events'])
assert ex['applicationPid']==old['clockObservation']['applicationPid'];assert ex['guardianPid']==old['binding']['pid'];assert ex['applicationStarted']==old['snapshotProvenance']['applicationStarted'];assert ex['exitObservation']=='owned-process-confirmed-absent'
assert ex['checks'][-1]['identity']is None and ex['checks'][-1]['pid']==ex['applicationPid'];assert ex['checks'][-1]['exitCode']==1
assert all(x['identity']['processGroupId']==ex['guardianPid']and x['identity']['uid']==501 and x['identity']['started']==ex['applicationStarted']for x in ex['checks'][:-1])
offs=[[z['parentWindowMs'][0]-z['snapshot']['clockObservation']['monotonicMs'],z['parentWindowMs'][1]-z['snapshot']['clockObservation']['monotonicMs']]for z in cal];off=[max(v[0]for v in offs),min(v[1]for v in offs)];assert off[0]<=off[1]
creation=[oe['creationOrEpochStartWindowMs'][0]+off[0],oe['creationOrEpochStartWindowMs'][1]+off[1]];oldSpan=span(creation,[ex['signalRequestedBeforeMs'],ex['processExitObservedAfterMs']])
# Read all measured outputs only to establish chronological last and first violating sample.
samples=[(p,read(p))for p in e.glob('activity-recovery-measured-*.json')];samples.sort(key=lambda z:z[1]['measured']['parentWindowMs'][1]);deriv=[]
for p,d in samples:
 m=d['measured'];s=m['snapshot'];life=d['lifecycleWitness'];full_lifecycle(life)
 assert m['parentClockDomain']==b['parentClockDomain'];assert s['correlation']==old['correlation'];assert s['binding']['revision']==old['binding']['revision'];assert s['snapshotProvenance']['source']=='live-bridge';assert s['snapshotProvenance']==life['snapshotProvenance']
 assert s['clockObservation']['applicationPid']!=ex['applicationPid'];assert s['binding']['pid']!=ex['guardianPid']
 ev=s['events'];first=next(x for x in ev if x.get('epochIds'));assert all(x['epochIds']==first['epochIds']and x['creationOrEpochStartWindowMs']==first['creationOrEpochStartWindowMs']and x['includesUnsavedTail']is False and x['epochObservation']=={'continuous':True,'startSource':'clock-acquisition'}and x['activityState']in['active','terminal']for x in ev)
 assert all(x['applicationPid']==s['clockObservation']['applicationPid']and x['instancePid']==s['binding']['pid']and x['clockDomain']==s['clockObservation']['clockDomain']and x['correlation']==s['correlation']for x in ev)
 stops=[x for x in life['events']if x['kind']=='agent-termination-decided'];assert len(stops)<=1
 if stops:
  st=stops[0];assert st['runId']==first['runId']and st['groupId']==first['groupId']and st['clockDomain']==s['clockObservation']['clockDomain'];lower=span(first['creationOrEpochStartWindowMs'],st['decisionWindowMs'])[0]
 else:
  assert ev[-1]['activityState']=='active';lower=max(x['observedEpochActiveMs'][0]for x in ev if x['activityState']=='active')
 deriv.append({'source':str(p.relative_to(ROOT)),'parentWindowMs':m['parentWindowMs'],'actualStopPresent':bool(stops),'oldSafeLowerMs':oldSpan[0],'recoveredSafeLowerMs':lower,'sumSafeLowerMs':oldSpan[0]+lower})
lastp,last=samples[-1];s=last['measured']['snapshot'];life=last['lifecycleWitness'];st=one(life['events'],'agent-termination-decided');co=one(life['events'],'agent-terminal-committed');assert st['attemptId']==co['attemptId'];first=s['events'][0];newSpan=span(first['creationOrEpochStartWindowMs'],st['decisionWindowMs']);assert deriv[-1]['sumSafeLowerMs']>60000;assert all(x['sumSafeLowerMs']<=60000 for x in deriv[:-1])
retainedp=pick(e,'activity-after-exit-retained-*.json');ret=read(retainedp);ackp=pick(e,'activity-ledger-acknowledged-comparison-*.json');ack=read(ackp)
res['cases']['INT-ACT-001']={'rawStatus':'FAIL','calibrationSource':str(cp.relative_to(ROOT)),'killSource':str(kp.relative_to(ROOT)),'lastMeasuredSource':str(lastp.relative_to(ROOT)),'calibrations':[{'parentClockDomain':z['parentClockDomain'],'parentWindowMs':z['parentWindowMs'],'applicationReading':z['snapshot']['clockObservation'],'provenance':z['snapshot']['snapshotProvenance'],'offsetMs':offs[i]}for i,z in enumerate(cal)],'offsetIntersectionMs':off,'oldIdentity':identity(old),'oldEpochId':oe['epochIds'][0],'oldCreationMs':oe['creationOrEpochStartWindowMs'],'oldCreationMappedToParentMs':creation,'actualExit':ex,'oldActivityToActualExitMs':oldSpan,'newIdentity':identity(s),'newEpochId':first['epochIds'][0],'newStartMs':first['creationOrEpochStartWindowMs'],'newLifecycleCompleteness':full_lifecycle(life),'actualStop':st,'actualMatchingCommit':co,'newActivityUntilActualStopMs':newSpan,'sumSafeLowerMs':deriv[-1]['sumSafeLowerMs'],'fullRunUpperMs':None,'fullChainPass':False,'reasonUpperNotDerived':'Early hard FAIL stopped final collection; startup gap is unknown, cannot silently exclude it or claim all-run upper/continuation PASS. COMMIT happens to be present in last live response and is recorded separately, not used as stop.','commitAfterDecisionMs':span(st['decisionWindowMs'],co['monotonicMs']),'sampleCount':len(samples),'precedingSample':deriv[-2],'firstOverrunSample':deriv[-1],'oldLastAcknowledgedSample':oe['lastSuccessfulSample'],'ledgerAcknowledgementDiagnostic':ack,'afterExitSnapshotProvenance':ret['snapshot']['snapshotProvenance'],'afterExitCacheUsedForCalibration':False,'rawFinalCollectorOutputExists':any(e.glob('activity-cross-epoch-final*.json'))}
# Audit recorded ownership and safe continuation prerequisites without contacting resources.
ids=[(p,read(p))for p in e.glob('application-owned-identity-*.json')]
beforeCrash=read(e/'activity-before-crash.json')
for name in ['activity-ledger-held-before-kill-*.json','activity-ledger-after-actual-exit-*.json','activity-ledger-before-restart-*.json','activity-downtime-ledger-comparison-*.json','activity-live-recovery-identity-*.json']:
 read(pick(e,name))
res['cases']['INT-ACT-001']['ownedIdentitySources']=[str(p.relative_to(ROOT))for p,v in ids]
res['cases']['INT-ACT-001']['safeBoundaryEvidenceSource']=str((e/'activity-before-crash.json').relative_to(ROOT))
res['sourceIndex']=used
(OUT/'backend-facts.json').write_text(json.dumps(res,ensure_ascii=False,indent=2,default=str)+'\n')
print(json.dumps({'cases':{k:{'rawStatus':v['rawStatus'],'decisiveMs':v.get('decisionElapsedMs',v.get('elapsedMsDecimal',v.get('sumSafeLowerMs')))}for k,v in res['cases'].items()},'indexedSources':len(used)},ensure_ascii=False,default=str))
