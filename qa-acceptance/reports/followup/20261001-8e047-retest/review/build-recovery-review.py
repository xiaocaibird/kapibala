"""Record an independently reviewed case-specific evidence chain. Local files only.
New --batch label required; never overwrites a previous review or raw evidence.
This is not a generic classifier for future candidates or arbitrary note strings.
"""
from pathlib import Path
import json,re,hashlib,datetime,sys,argparse
from urllib.parse import urlparse
P=argparse.ArgumentParser();P.add_argument('--batch',required=True);args=P.parse_args();assert re.fullmatch(r'[a-z0-9-]+',args.batch)
OUT=Path(__file__).resolve().parent;Q=OUT.parents[3];R=Q/'reports/preflight/2026-10-01T15-22-40.633Z-4281d669';destination=OUT/f'recovery-adjudication-{args.batch}.json';assert not destination.exists()
I={}
def readbytes(p):
 b=p.read_bytes();I[str(p.relative_to(Q))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)};return b
def read(p):return json.loads(readbytes(p))
def pick(e,p):
 v=list(e.glob(p));assert len(v)==1,(p,len(v));return v[0]
def ms(t):return int(datetime.datetime.fromisoformat(t.replace('Z','+00:00')).timestamp()*1000)
M=read(R/'manifest.json');assert M['runId']==R.name and M['phase']=='developer-preflight';assert M['sutRevision']=='8e047aea842bfcec64802e4918b52b460b93c48b';assert M['qaRevision']=='02ea807faed44ebaed8a41741f4056de8e04e87a';assert M['qaTree']['sha256']=='750fb6a6395683331f9e4506bc9f62861dc49c00018fa493188f74e0d67f1dbb';assert M['targetSha256']=='f4b8af5af353520cbf776b42be407f97598c5f032fd4ff04219eb57f38557aab'
runner=read(R/'runner-summary.json');result=read(R/'results.json');assert runner['completedAt'] and not runner['runnerErrors'] and not result['integrity']
for key in ['runId','phase','qaRevision','sutRevision','targetSha256']:assert result['metadata'][key]==M[key]
for path in ['tests/system/protocol-boundaries.spec.ts','tests/system/recovery.spec.ts','tests/system/delivery-read-boundaries.spec.ts','tests/support/delivery-read-observation.ts','cases/delivery-read-boundaries.json','harness/reporter.ts','harness/lifecycle-observation.ts']:
 data=readbytes(OUT/'frozen-qa-source'/path); frozen=next(x for x in M['qaTree']['files']if x['path']==path);assert hashlib.sha256(data).hexdigest()==frozen['sha256']
N={'BLK-EXT-002':'建群请求已开始但没有保存结果；网关没有查询本次创建结果的接口，不自动重新建群。','BLK-EXT-003':'提升管理员请求已开始但没有保存结果；网关没有查询管理员角色的接口，结果未知时不自动重试。','BLK-EXT-004':'A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.','BLK-EXT-005':'An Agent turn was sent before interruption; the protocol cannot safely replay an unrecorded response.','REC-007':'A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.'}
IDS=['BLK-EXT-004','BLK-EXT-005','REC-007'];dirs={}
for p in(R/'artifacts').glob('*/error-context.md'):
 text=p.read_text();m=re.search(r'^- Name:.*?\[([^]]+)\]',text,re.M)
 if m and m[1]in IDS:dirs[m[1]]=p.parent
out={'reviewer':'独立 AI QA 证据审阅；非研发自测、非真人手工验收','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'basis':{k:M[k]for k in['runId','phase','sutRevision','qaRevision','targetSha256']}|{'qaTreeSha256':M['qaTree']['sha256']},'rawRecordsUnchanged':True,'runFinalIntegrityPending':not(R/'runner-summary.json').exists(),'scope':'Only three specified recovery cases in this fixed 8e047 registered developer-preflight subset. Completed raw events and current case artifacts only. Not a complete business acceptance or new product run.','cases':[]}
for cid in IDS:
 if cid not in dirs or not(dirs[cid]/'evidence/cleanup.json').exists():out['cases'].append({'caseId':cid,'rawStatus':None,'reviewedStatus':None,'state':'AWAITING_COMPLETED_CASE_ARTIFACTS'});continue
 d=dirs[cid];e=d/'evidence';error=readbytes(d/'error-context.md').decode();reason=re.search(r'# Error details\s*```\s*(.*?)\s*```',error,re.S)[1];rawStatus='BLOCKED'if reason.startswith('BlockedError: [BLOCKED]')else'FAIL';env=read(e/'environment.json');clean=read(e/'cleanup.json');assert env['revision']==M['sutRevision'];assert not clean['failures'];kill=read(pick(e,'kill-*.json'));assert ms(kill['at'])<ms(clean['completedAt'])
 row={'caseId':cid,'project':'system','rawStatus':rawStatus,'rawReason':reason,'rawStatusSource':str((d/'error-context.md').relative_to(Q)),'rawStatusBinding':'Per-case error artifact plus pinned reporter classification; bind to final events.json separately.','reviewedStatus':'FAIL','state':'INDEPENDENT_CASE_REVIEW_COMPLETED','environment':{k:env[k]for k in['revision','cwd','apiPort','database','startedAt']},'kill':kill,'cleanup':clean,'evidenceDirectory':str(e.relative_to(Q)),'engineeringDirectionConfirmed':True,'acceptanceStandardChanged':False,'deviationAcceptedByThisReview':False}
 # This reviewer input only extracts public API observations; headers/tokens omitted.
 api=[]
 for no,line in enumerate(readbytes(e/'api.ndjson').decode().splitlines(),1):
  v=json.loads(line)
  if v.get('phase')!='response'or v.get('status')!=200 or v.get('method')!='GET':continue
  path=urlparse(v['url']).path
  if not any(path.startswith(s)for s in['/api/jobs/','/api/agent-runs/','/api/sequence-runs/']):continue
  b=json.loads(v['responseBody'])if isinstance(v['responseBody'],str)else v['responseBody'];api.append({'line':no,'qaRequestId':v['qaRequestId'],'startedAt':v['startedAt'],'path':path,'body':b})
 if cid=='BLK-EXT-004':
  crash=read(e/'kick-applied-then-rejoined.json');recovery=read(e/'kick-rejoin-resumed.json');final=read(e/'kick-rejoin-final-ledger.json');resource=crash['extra']['id'];g=crash['gateway'];gf=final['gateway'];req=[x for x in g['requests']if x['path'].endswith('/kick')];assert len(req)==1 and req[0]['responseClosedBeforeFinish']is True;target=req[0]['body']['targetPlatformUserId'];ev=[x for x in g['events']if x['data'].get('platformUserId')==target];left=next(x for x in ev if x['type']=='member_left');rejoin=next(x for x in ev if x['type']=='member_joined'and x['eventId']>left['eventId']);assert left['recordedAt']<rejoin['recordedAt'];assert len([x for x in gf['requests']if x['path'].endswith('/kick')])==1;assert any(x['platformUserId']==target for x in gf['groups'][0]['members']);assert len([x for x in gf['effects']if x['kind']=='kick'])==1
  row['faultChain']={'resourceId':resource,'actualKick':next(x for x in g['effects']if x['kind']=='kick'),'request':req[0],'oldMemberLeft':left,'subsequentRejoin':rejoin,'finalKickCallCount':1,'rejoinedTargetStillPresent':True,'observations':recovery['extra']['samples']}
 elif cid=='BLK-EXT-005':
  crash=read(e/'lost-model-response-at-crash.json');recovery=read(e/'lost-model-response-resumed.json');final=read(e/'lost-model-response-final-ledger.json');resource=crash['extra']['id'];persisted=crash['extra']['persisted'];lost=crash['agent']['turns'][-1];assert 'completedAt'not in lost;assert lost['body']['runId']==resource;assert persisted in [c for m in lost['body']['messages']for c in m['content']];gf=final['gateway'];effects=[x for x in gf['effects']if x['kind']=='send'];assert len(effects)==1;assert len([x for x in gf['requests']if x['path'].endswith('/send')])==1;assert len(final['agent']['turns'])==2
  row['faultChain']={'resourceId':resource,'persistedPriorToolResult':persisted,'lostResponseRequest':{k:lost[k]for k in['id','at','path']},'lostResponseCompletedAtCrash':False,'barrier':[{'name':x['name'],'hits':x['hits'],'at':x['at']}for x in crash['agent']['barriers']],'actualSendEffects':effects,'finalSendCallCount':1,'finalTurnCount':2,'observations':recovery['extra']['samples'],'notRequired':'Identical lost unexecuted model response is not an acceptance requirement.'}
 elif cid=='REC-007':
  final=read(e/'external-facts.json');g=final['gateway'];req=[x for x in g['requests']if x['path'].endswith('/kick')];assert len(req)==1;target=req[0]['body']['targetPlatformUserId'];assert target=='recover-kick-target';assert req[0]['responseClosedBeforeFinish']is True;effects=[x for x in g['effects']if x['kind']=='kick'];assert len(effects)==1;assert not any(x['platformUserId']==target for x in g['groups'][0]['members']);assert any(x['name']=='kick-landed'for x in g['barriers']);resources={v['body']['id']for v in api if v['body'].get('recoveryNote')==N[cid]};assert len(resources)==1;resource=next(iter(resources));row['faultChain']={'resourceId':resource,'actualKick':effects[0],'request':req[0],'targetAbsent':True,'finalKickCallCount':1,'barriers':[{'name':x['name'],'at':x['at'],'hits':x['hits']}for x in g['barriers']]}
 if True:
  matching=[x for x in api if x['body'].get('id')==resource and x['body'].get('recoveryNote')==N[cid]and x['startedAt']>kill['at']];assert len(matching)>1;assert all(x['body']['status']=='running'for x in matching);relevant=[x for x in api if x['body'].get('id')==resource and x['startedAt']>kill['at']];assert not any(x['body']['status']=='finished'for x in relevant);row['publicNoteEvidence']={'source':str((e/'api.ndjson').relative_to(Q)),'matchingResponseCount':len(matching),'first':matching[0],'last':matching[-1],'exactNote':N[cid]};row['decision']='D039';row['requirements']=['原总则192任意重启','原A5.8/264同run续跑、效果不重复不记失败'];row['reason']='本次完整故障链和同资源真实公开recoveryNote，与本次8e047固定版本公开恢复说明共同证实保守暂停、不自动完成原任务；有限20/30秒不是失败依据。不要求盲重放，未观测重复效果不得写成已发生。'
 row['rawEventsConfirmed']=False
 if(R/'events.json').exists():
  events=read(R/'events.json');ev=[x for x in events if x['id']==cid];assert len(ev)==1 and ev[0]['attempt']==0 and ev[0]['status']==rawStatus;row['rawEventsConfirmed']=True;row['rawAttempt']=ev[0]
 out['cases'].append(row)
# Rehash every completed input immediately; detect concurrent mutation rather than accepting it.
for p,h in I.items():assert hashlib.sha256((Q/p).read_bytes()).hexdigest()==h['sha256'],p
out['runner']=runner;out['integrity']=result['integrity'];out['sourceIndex']=I;destination.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'file':str(destination.relative_to(Q)),'cases':[{k:r.get(k)for k in['caseId','rawStatus','reviewedStatus','state']}for r in out['cases']]},ensure_ascii=False))
