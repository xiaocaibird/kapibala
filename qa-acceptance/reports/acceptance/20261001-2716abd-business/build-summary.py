"""Offline derivation; never executes SUT or edits original execution records."""
from pathlib import Path
import json,collections,hashlib,xml.etree.ElementTree as ET,re
BASE=Path(__file__).resolve().parent; QA=BASE.parents[2]
RUN=QA/'reports/runs/2026-10-01T14-26-25.068Z-1e0cb38a'
def read(p):return json.loads(p.read_text())
def write(name,v):(BASE/name).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def count(v):
 c=collections.Counter(x['status'] for x in v);return {s:c[s] for s in ['PASS','FAIL','BLOCKED','NOT_RUN']}
m=read(RUN/'manifest.json');runner=read(RUN/'runner-summary.json');r=read(RUN/'results.json');original=read(RUN/'automation-original/results.json')
assert m['phase']=='business-acceptance' and m['sutRevision']=='2716abdd2d43a779b6a0972a6323f895cf2b5b9c'
assert m['qaTree']['sha256']==original['metadata']['qaTreeAfter']['sha256']
assert not runner['runnerErrors'] and runner['completedAt']
assert r['businessAcceptance']['businessSha256']==m['businessSha256']
assert len(m['businessScope']['cases'])==254 and len(m['businessScope']['requirements'])==116
assert len(read(RUN/'events.json'))==256
assert all(x.get('attempt')==0 for x in read(RUN/'events.json'))
caseDefs={c['id']:c for c in m['businessScope']['cases']}; results=r['businessAcceptance']['results']
assert set(x['id'] for x in results)==set(caseDefs)
assert all(x['status']!='NOT_RUN' for x in results)
manual=[json.loads(x) for x in (RUN/'manual-events.ndjson').read_text().splitlines() if x]
assert len(manual)==6 and len(set(x['id'] for x in manual))==6
summary={'formatVersion':1,'reportKind':'independent-qa-full-business-acceptance','candidate':m['sutRevision'],'qaRevision':m['qaRevision'],'qaTreeBeforeSha256':m['qaTree']['sha256'],'qaTreeAfterSha256':original['metadata']['qaTreeAfter']['sha256'],'businessSha256':m['businessSha256'],'targetSha256':m['targetSha256'],'originalRequirementSha256':m['originalSha256'],'dependencyLockSha256':m['dependencyLockSha256'],'startedAt':m['startedAt'],'completedAt':runner['completedAt'],'conclusions':{'businessConformity':r['businessAcceptance']['verdict'],'unconditionalAcceptance':False,'releaseReadiness':'NOT_ASSESSED','C1C2':'MATERIALS_RECEIVED_NOT_EXECUTED'},'metrics':{'requirementCount':116,'caseCount':254,'automatedCaseCount':248,'manualCaseCount':6,'automatedCaseProjectPairs':256,'totalCaseProjectPairs':262,'caseCounts':count(results),'obligationCounts':count([*read(RUN/'events.json'),*manual]),'automaticRetries':0,'attemptRecordRatePercent':100,'definiteExecutionRatePercent':100*(sum(x['status'] in ['PASS','FAIL'] for x in results))/254,'casePassRatePercent':100*(sum(x['status']=='PASS' for x in results))/254},'integrity':r['integrity'],'runnerErrors':runner['runnerErrors'],'results':[dict(x,title=caseDefs[x['id']]['title'],requirements=caseDefs[x['id']]['requirements'],automation=caseDefs[x['id']].get('automation')) for x in results],'excluded':'7 release gates and 5 candidate cases; no old-version PASS imported','rawRun':str(RUN),'automaticOriginal':'automation-original/results.json','manualAudit':'manual-reviews.ndjson'}
write('summary.json',summary)
rank={'FAIL':4,'BLOCKED':3,'NOT_RUN':2,'PASS':1}; byId={x['id']:x for x in results};reqs=[]
for req in m['businessScope']['requirements']:
 cases=[c['id'] for c in m['businessScope']['cases'] if req['id'] in c['requirements']];status=max((byId[c]['status'] for c in cases),key=rank.get);reqs.append({'id':req['id'],'title':req['title'],'status':status,'cases':cases,'source':req['source']})
write('requirement-results.json',reqs)
lines=['# 当前候选逐项业务结果','','固定2716、完整正式business入口；所有项目取最差，BLOCKED不算通过。','','| 用例 | 结果 | 需求 | 来源 |','| --- | --- | --- | --- |']
for x in summary['results']:lines.append('| '+x['id']+' '+x['title'].replace('|','\\|')+' | '+x['status']+' | '+', '.join(x['requirements'])+' | '+(x.get('automation') or 'manual audit')+' |')
(BASE/'case-results.md').write_text('\n'.join(lines)+'\n')
lines=['# 需求到用例与结果','','| 需求 | 结果 | 用例 |','| --- | --- | --- |']
for x in reqs:lines.append('| '+x['id']+' '+x['title'].replace('|','\\|')+' | '+x['status']+' | '+', '.join(x['cases'])+' |')
(BASE/'requirement-results.md').write_text('\n'.join(lines)+'\n')
ET.parse(RUN/'junit.xml')
print(json.dumps({'caseCounts':summary['metrics']['caseCounts'],'obligationCounts':summary['metrics']['obligationCounts'],'requirements':count(reqs),'runnerErrors':runner['runnerErrors'],'integrity':r['integrity']}))
