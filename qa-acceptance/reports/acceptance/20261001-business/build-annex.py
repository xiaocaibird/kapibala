"""Derive report annexes from immutable QA reports. No product access or status rewrite."""
from pathlib import Path
from collections import Counter
import json, hashlib, datetime, os
BASE=Path(__file__).resolve().parent
QA=BASE.parents[2]
RUN_ID='2026-10-01T06-54-18.519Z-a1e23916'
RUN=QA/'reports/runs'/RUN_ID
raw=json.loads((RUN/'results.json').read_text())
manifest=json.loads((RUN/'manifest.json').read_text())
summary=json.loads((RUN/'runner-summary.json').read_text())
assert not raw['integrity'], raw['integrity']
assert not summary['runnerErrors'], summary['runnerErrors']
assert manifest['sutRevision']=='86ad4e7e63786f652c965308b032b98415bdd7ac'
business=raw['businessAcceptance']
results=business['results']
cases={c['id']:c for c in manifest['businessScope']['cases']}
assert len(results)==len(cases)==254
assert len({r['id'] for r in results})==254
assert {r['id'] for r in results}==set(cases)
counts=dict(Counter(r['status'] for r in results))
for x in ['PASS','FAIL','BLOCKED','NOT_RUN']:counts.setdefault(x,0)
assert counts==business['counts']
attempts=[r for r in raw['attempts'] if r['id'] in cases]
obligations={(r['id'],r.get('project','system')) for r in attempts}
assert len(obligations)==262
assert len(attempts)==262, 'Unexpected retry or duplicate obligation; review manually'
assert all(r.get('attempt',0)==0 for r in attempts)
# Requirement pass needs ALL linked cases; a mapped requirement alone is not validated.
by_id={r['id']:r for r in results}
requirements=[]
rank={'PASS':0,'NOT_RUN':1,'BLOCKED':2,'FAIL':3}
for req in manifest['businessScope']['requirements']:
 ids=[c['id'] for c in cases.values() if req['id'] in c['requirements']]
 assert ids
 status=max((by_id[i]['status'] for i in ids),key=rank.get)
 requirements.append({**req,'caseIds':ids,'status':status})
assert len(requirements)==116

def clean(s):return str(s).replace('|','\\|').replace('\n',' ')
def link(p):
 p=Path(p)
 if not p.is_absolute():
  if (RUN/p).exists():p=RUN/p
  elif (QA/p).exists():p=QA/p
  else:raise FileNotFoundError(p)
 # Both originals remain accessible; copied same-run evidence is preferred.
 parts=p.parts
 if 'reports' in parts:
  q=QA/Path(*parts[parts.index('reports'):])
  if q.exists():p=q
 return '<'+os.path.relpath(p,BASE)+'>'

def evidence(r):
 return ' · '.join(f'[证据 {i+1}]({link(p)})' for i,p in enumerate(r.get('evidence',[])))

lines=['# 86ad完整业务基线原始逐项结果','','本表完全派生于冻结运行原始结果；不把失败归因或补充复测覆盖写回原始状态。',
 f'候选 `{manifest["sutRevision"]}`；运行 `{RUN_ID}`。','',
 '| 用例 | 优先级 | 状态 | 需求 | 诊断 / 原始证据 |','|---|---|---|---|---|']
for r in results:
 c=cases[r['id']]
 lines.append(f'| {r["id"]} {clean(c["title"])} | {c["priority"]} | {r["status"]} | {", ".join(c["requirements"])} | {clean(r.get("reason") or "断言通过")} {evidence(r)} |')
(BASE/'case-results.md').write_text('\n'.join(lines)+'\n')
lines=['# 需求至结果追踪','','116 项均有用例映射；只有关联的全部用例通过，该条需求才记为本次已验证。','','| 需求 | 本轮结论 | 用例 | 依据 |','|---|---|---|---|']
for r in requirements:
 lines.append(f'| {r["id"]} {clean(r["title"])} | {r["status"]} | {", ".join(r["caseIds"])} | {clean(r["source"])} |')
(BASE/'requirement-results.md').write_text('\n'.join(lines)+'\n')
metrics={
 'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'sutRevision':manifest['sutRevision'],'runId':RUN_ID,'runner':summary,
 'businessVerdict':business['verdict'],'caseCounts':counts,'requirementCounts':dict(Counter(r['status'] for r in requirements)),
 'requirements':116,'mappedRequirements':116,'cases':254,'projectObligations':262,
 'obligationCounts':dict(Counter(r['status'] for r in attempts)),
 'recordedRate':1,'completedCaseRate':(counts['PASS']+counts['FAIL'])/254,
 'passRateAllCases':counts['PASS']/254,'retryCount':0,
 'definitions':{'recordedRate':'已产生实际执行或阻塞记录的业务用例/254；不等于测试完成率','completedCaseRate':'(PASS+FAIL)/254；BLOCKED不算完成','passRateAllCases':'PASS/254；不排除阻塞缩小分母'},
 'results':results,'requirementResults':requirements,
 'sources':[{ 'path':str(p.relative_to(QA)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [RUN/'results.json',RUN/'manifest.json',RUN/'events.json',RUN/'manual-events.ndjson',RUN/'runner-summary.json']]
}
(BASE/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in metrics.items() if k not in ['results','requirementResults','sources']},ensure_ascii=False,indent=2))
