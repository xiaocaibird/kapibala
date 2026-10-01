"""Build a separate reviewed baseline; never mutate original run results."""
from pathlib import Path
from collections import Counter
import json,datetime,hashlib,sys,xml.etree.ElementTree as ET
B=Path(__file__).resolve().parent;Q=B.parents[2]
BASE='2026-10-01T06-54-18.519Z-a1e23916';PREMISE='2026-10-01T07-48-06.522Z-66d3a279'
final_window=sys.argv[1]
raw=json.loads((Q/'reports/runs'/BASE/'results.json').read_text())
manifest=json.loads((Q/'reports/runs'/BASE/'manifest.json').read_text())
rows={r['id']:{'id':r['id'],'rawStatus':r['status'],'reviewedStatus':r['status'],'baselineRevision':manifest['sutRevision'],'evidence':[f'reports/runs/{BASE}/results.json'],'reviewReason':'Original full-run record retained.'} for r in raw['businessAcceptance']['results']}
# Explicit public recoveryNote establishes refusal to resume; this is not timeout-as-FAIL.
for cid in ['BLK-EXT-002','BLK-EXT-003','BLK-EXT-004','BLK-EXT-005']:
 rows[cid].update(reviewedStatus='FAIL',reviewReason='公开recoveryNote明确暂停自动恢复，原强恢复要求未满足。原BLOCKED不改写。')
 rows[cid]['evidence'].append('reports/acceptance/20261001-business/triage-final-recovery.json')
retests=[]
rank={'PASS':0,'NOT_RUN':1,'BLOCKED':2,'FAIL':3}
expected_suites=[('qa-premise-retest-20261001',{'CAP-002','CAP-005','UI-011','UI-020','UI-021','UI-024','UI-025','UI-028','UI-029','UI-030','UI-031','UI-032','UI-033','UI-034','UI-035','ARC-UI-BLK-001'}),('qa-final-window-retest-20261001',{'CAP-005','UI-028','UI-030'})]
previous_end=None
for runid,(suite_id,expected_ids) in zip([PREMISE,final_window],expected_suites):
 d=Q/'reports/preflight'/runid;m=json.loads((d/'manifest.json').read_text());r=json.loads((d/'results.json').read_text());s=json.loads((d/'runner-summary.json').read_text())
 assert m['sutRevision']==manifest['sutRevision'] and not r['integrity'] and not s['runnerErrors']
 assert m['phase']=='developer-preflight' and m['suite']['id']==suite_id
 assert m['runId']==runid and set(m['suite']['caseIds'])==expected_ids
 expected={(cid,'system' if cid.startswith('CAP-') else 'chromium') for cid in expected_ids}
 assert {(c['id'],p) for c in m['suite']['cases'] for p in c['projects']}==expected
 assert len(r['attempts'])==len(expected) and {(i['id'],i['project']) for i in r['attempts']}==expected
 assert all(i.get('attempt',0)==0 and i['status'] in ['PASS','FAIL','BLOCKED'] and i.get('completedAt') for i in r['attempts'])
 assert s.get('completedAt') and s['runnerStatus'] in ['passed','failed']
 assert not r['preflight']['integrity'] and not r['preflight']['rejectedAttempts']
 for key in ['runId','phase','sutRevision','qaTree','targetSha256','suiteSha256','suite','executionApproval']:
  assert r['metadata'][key]==m[key],key
 assert r['metadata']['qaTreeAfter']['sha256']==m['qaTree']['sha256']
 if previous_end:assert m['startedAt']>previous_end,'Retest ordering invalid'
 previous_end=s['completedAt']
 retests.append({'runId':runid,'phase':m['phase'],'sutRevision':m['sutRevision'],'counts':dict(Counter(i['status'] for i in r['attempts'])),'resultsSha256':hashlib.sha256((d/'results.json').read_bytes()).hexdigest()})
 for cid in expected_ids:
  group=[i for i in r['attempts'] if i['id']==cid]
  status=max((i['status'] for i in group),key=rank.get)
  row=rows[cid];row['reviewedStatus']=status;row['reviewReason']='QA前提修正后在同一86ad版本另行冻结执行，原记录保留；仅补充证据，不把子集当新全量运行。';row['latestSameVersionRetest']=runid;row['evidence'].append(f'reports/preflight/{runid}/results.json')
assert len(rows)==254
req=[];rank={'PASS':0,'NOT_RUN':1,'BLOCKED':2,'FAIL':3}
for r in manifest['businessScope']['requirements']:
 ids=[c['id'] for c in manifest['businessScope']['cases'] if r['id'] in c['requirements']]
 req.append({'id':r['id'],'caseIds':ids,'status':max((rows[i]['reviewedStatus'] for i in ids),key=rank.get)})
out={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'Independent reviewed full baseline plus separately frozen same-version supplementary tests','baselineRevision':manifest['sutRevision'],'rawRunId':BASE,'rawCounts':raw['businessAcceptance']['counts'],'reviewedCounts':dict(Counter(r['reviewedStatus'] for r in rows.values())),'reviewedRequirementCounts':dict(Counter(r['status'] for r in req)),'retests':retests,'results':list(rows.values()),'requirements':req,'laterProductRepair':{'revision':'a6b14e73ec738b979b05510fdfac8c6fcbb09df7','caseId':'BLK-SPEC-006','state':'FIXED_IN_SCOPED_INDEPENDENT_RETEST','evidence':'reports/integration/20261001-utf16-retest-schema-correction/result-summary.md','scope':'7API+4Chromium；不改86ad结论，不构成a6b全量运行。'},'verdict':'FAIL','releaseAssessment':'NOT_IN_SCOPE'}
(B/'adjudicated-baseline.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
lines=['# 同版本复测及专业归因后的业务基线','','对象仍为86ad：完整原始执行+同版本独立子集补充。不是后来a6b产品版本的全量重跑。原始状态保持独立，后续资料修复另见主报告。','','| 用例 | 原始 | 审定 | 补充运行或归因 |','|---|---|---|---|']
for r in rows.values():
 lines.append(f'| {r["id"]} | {r["rawStatus"]} | {r["reviewedStatus"]} | {r.get("latestSameVersionRetest",r["reviewReason"])} |')
(B/'adjudicated-baseline.md').write_text('\n'.join(lines)+'\n')
root=ET.Element('testsuite',name='86ad-reviewed-business-baseline',tests=str(len(rows)),failures=str(out['reviewedCounts'].get('FAIL',0)),skipped=str(out['reviewedCounts'].get('BLOCKED',0)))
props=ET.SubElement(root,'properties');ET.SubElement(props,'property',name='sutRevision',value=manifest['sutRevision']);ET.SubElement(props,'property',name='type',value='reviewed evidence index; original JUnit unchanged')
for r in rows.values():
 t=ET.SubElement(root,'testcase',classname='business.reviewed',name=r['id']);status=r['reviewedStatus']
 if status=='FAIL':ET.SubElement(t,'failure',message=r['reviewReason']).text=json.dumps(r,ensure_ascii=False)
 elif status!='PASS':ET.SubElement(t,'skipped',message='BLOCKED: not a passing result').text=json.dumps(r,ensure_ascii=False)
 ET.SubElement(t,'system-out').text=json.dumps(r,ensure_ascii=False)
ET.indent(root);ET.ElementTree(root).write(B/'adjudicated-baseline.junit.xml',encoding='utf-8',xml_declaration=True)
print(json.dumps({k:out[k] for k in ['rawCounts','reviewedCounts','reviewedRequirementCounts','verdict']},ensure_ascii=False))
