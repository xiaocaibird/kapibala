#!/usr/bin/env python3
"""Issue a review from immutable batches; never modify the raw observations."""
import argparse, hashlib, json, subprocess, datetime, collections, tarfile
from report_composition import compatibility_status, compose_uid_case, archive_composition_issues, execution_gate_rows, execution_gate_suite
from pathlib import Path
import xml.etree.ElementTree as ET
p=argparse.ArgumentParser()
p.add_argument('--full',required=True);p.add_argument('--retest',action='append',default=[]);p.add_argument('--compatibility',action='append',default=[])
p.add_argument('--history',action='append',default=[]);p.add_argument('--supplement',action='append',default=[]);p.add_argument('--review',required=True);p.add_argument('--destination',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[3];out=Path(a.destination).resolve();review=json.loads(Path(a.review).read_text())
def read_batch(path):
 path=Path(path).resolve();d=json.loads((path/'results.json').read_text());m=d['manifest']
 assert m.get('completedAt'), 'Batch has not completed'
 assert m['autoRetries']==0
 for name,digest in json.loads((path/'report-hashes.json').read_text()).items():assert hashlib.sha256((path/name).read_bytes()).hexdigest()==digest
 idx=json.loads((path/'evidence-index.json').read_text());assert hashlib.sha256((path/idx['archive']).read_bytes()).hexdigest()==idx['sha256']
 return path,d,idx
def code_tree(revision):
 raw=subprocess.check_output(['git','ls-tree','-r',revision,'--','apps','packages','db','scripts','package.json','package-lock.json','tsconfig.json'],cwd=root)
 return hashlib.sha256(raw).hexdigest()
full=read_batch(a.full);reference=full[1]['manifest'];product_tree=code_tree(reference['sutRevision'])
assert reference['selection']=='all second-round cases';assert full[1]['counts']['NOT_RUN']==0
selected={r['id']:dict(r,executionRunId=reference['runId'],executionSutRevision=reference['sutRevision'],executionQaRevision=reference['qaRevision']) for r in full[1]['cases']}
batches=[full];histories={key:[{'runId':reference['runId'],'status':r['status']}] for key,r in selected.items()}
for path in a.retest:
 b=read_batch(path);m=b[1]['manifest'];assert code_tree(m['sutRevision'])==product_tree,'Different application source cannot inherit a current-version PASS'
 assert m['browserName']=='chromium','Compatibility samples never replace baseline coverage'
 for r in b[1]['cases']:
  if r['id'] not in m['selectedCaseIds']:continue
  assert r['id'] in selected and r['status']!='NOT_RUN'
  histories[r['id']].append({'runId':m['runId'],'status':r['status']})
  selected[r['id']]=dict(r,executionRunId=m['runId'],executionSutRevision=m['sutRevision'],executionQaRevision=m['qaRevision'])
 batches.append(b)
compat=[]
for path in a.compatibility:
 b=read_batch(path);m=b[1]['manifest'];assert code_tree(m['sutRevision'])==product_tree
 compat.append({'runId':m['runId'],'sutRevision':m['sutRevision'],'qaRevision':m['qaRevision'],'browser':m['browserName'],'results':[r for r in b[1]['cases'] if r['id'] in m['selectedCaseIds']]});batches.append(b)
supplements=[];composition_issues=[]
for path in a.supplement:
 b=read_batch(path);m=b[1]['manifest'];d=b[1]
 assert code_tree(m['sutRevision'])==product_tree,'Supplement source differs from the candidate'
 assert d['phase']=='SECOND_ROUND_LINUX_UID_SUPPLEMENT'
 assert m['secondRoundSha256']==reference['secondRoundSha256'],'Supplement requirement/scope hash differs'
 assert d['wholeCaseVerdicts']=={'SR-C2-008':'NOT_ASSESSED_BY_SUPPLEMENT','SR-BE-USG-006':'NOT_ASSESSED_BY_SUPPLEMENT'}
 supplements.append({'runId':m['runId'],'sutRevision':m['sutRevision'],'qaRevision':m['qaRevision'],'verdict':d['subObligationVerdict'],'subObligations':d['subObligations'],'archive':str(b[0]),'archiveSha256':b[2]['sha256'],'cleanupErrors':d['cleanupErrors'],'runnerErrors':m.get('runnerErrors',[])})
 if d['subObligationVerdict']!='PASS':continue
 for case_id in ['SR-C2-008','SR-BE-USG-006']:
  row=selected[case_id]
  if row['status']!='BLOCKED':continue
  base=next(x for x in batches if x[1]['manifest']['runId']==row['executionRunId'])
  suffix='provider-private-storage-subscenario-results.json' if case_id=='SR-C2-008' else 'usage-obligations-summary.json'
  host_issues=[]
  if row.get('cleanupErrors'):host_issues.append({'status':'BLOCKED','reason':'Host case cleanup errors: '+str(row['cleanupErrors'])})
  if row.get('uncoveredVariants'):host_issues.append({'status':'BLOCKED','reason':'Host uncovered variants: '+str(row['uncoveredVariants'])})
  try:
   with tarfile.open(base[0]/base[2]['archive'],'r:gz') as tar:
    case_members=[x for x in tar.getmembers() if x.name.startswith('run/cases/'+case_id+'/')]
    members=[x for x in case_members if x.name.endswith(suffix)]
    assert len(members)==1,'Missing/ambiguous prerequisite result ledger'
    artifacts={}
    for member in case_members:
     if member not in members and not (member.name.endswith('.json') and ('cleanup' in member.name.rsplit('/',1)[-1] or 'provider-offline-auth-validation' in member.name)):continue
     assert member.isfile(),'Composition evidence must be an archived regular file'
     raw=tar.extractfile(member).read()
     indexed=[e for e in base[2]['files'] if e['member']==member.name]
     assert len(indexed)==1 and hashlib.sha256(raw).hexdigest()==indexed[0]['sha256'],'Composition evidence index/hash mismatch: '+member.name
     artifacts[member.name]=json.loads(raw)
    host_issues.extend(archive_composition_issues(case_id,artifacts))
    evidence=artifacts[members[0].name]
   if case_id=='SR-BE-USG-006':
    assert evidence['sutRevision']==row['executionSutRevision'],'Usage prerequisite ledger belongs to another SUT'
    assert evidence['exactNames']==[r['name'] for r in evidence['obligations']],'Usage exact-name ledger differs from reported obligations'
    evidence=evidence['obligations']
    indexed_sources={entry['source'] for entry in base[2]['files'] if entry['member'].startswith('run/cases/'+case_id+'/')}
    assert all(item.get('evidence') and all(path in indexed_sources for path in item['evidence']) for item in evidence),'Usage obligation references missing or unrelated archived evidence'
   # No additional error may be replaced by a foreign-UID-only supplement.
   composed=compose_uid_case(row,evidence,d,host_issues)
  except (AssertionError,KeyError,ValueError) as refusal:
   supplements[-1].setdefault('compositionRefused',[]).append({'caseId':case_id,'reason':str(refusal) or 'Host prerequisites are not exactly all declared PASS obligations and the sole foreign UID gap','hostIssues':host_issues})
   composition_issues.extend(dict(issue,caseId=case_id,runId=row['executionRunId']) for issue in host_issues)
   continue
  composed['composition']['prerequisiteArchiveMember']=members[0].name
  selected[case_id]=composed
  histories[case_id].append({'runId':m['runId'],'status':'PASS','kind':'explicit sole-UID-subobligation composition','hostRawStatus':'BLOCKED'})
compatibility=compatibility_status(compat)
for key,note in review.get('caseReviews',{}).items():
 assert key in selected;row=selected[key];row['review']=note
 if note.get('classification')=='QA_PREMISE_ERROR':
  assert row['status']=='FAIL' and note.get('evidence') and note.get('reason')
  row['rawStatus']=row['status'];row['status']='BLOCKED';row['adjudication']='QA premise invalid; no product verdict and no invented PASS'
historical=[]
for path in a.history:
 b=read_batch(path);m=b[1]['manifest'];historical.append({'runId':m['runId'],'sutRevision':m['sutRevision'],'qaRevision':m['qaRevision'],'counts':b[1]['counts'],'archive':str(b[0]),'archiveSha256':b[2]['sha256'],'currentVerdictContribution':'NONE: retained earlier version/QA premise evidence only'})
rows=list(selected.values())
counts={s:sum(r['status']==s for r in rows) for s in ['PASS','FAIL','BLOCKED','NOT_RUN']}
for r in rows:r['retestHistory']=histories[r['id']]
requirements=json.loads((root/'qa-acceptance/second-round/requirements/catalog.json').read_text());coverage=[]
for r in requirements:
 cases=[c for c in rows if r['id'] in c['requirements']];assert cases,'Missing requirement trace'
 statuses={c['status'] for c in cases};status='FAIL' if 'FAIL' in statuses else 'BLOCKED' if statuses!={'PASS'} else 'PASS'
 coverage.append({'requirementId':r['id'],'title':r['title'],'status':status,'cases':[c['id'] for c in cases]})
verdict='FAIL' if counts['FAIL'] else 'BLOCKED' if counts['BLOCKED'] or counts['NOT_RUN'] else 'PASS'
if compatibility['status']=='FAIL' or any(b['verdict']=='FAIL' for b in supplements) or any(issue['status']=='FAIL' for issue in composition_issues):verdict='FAIL'
if (compatibility['status']!='PASS' or any(d['manifest'].get('runnerErrors') for _,d,_ in batches) or any(b['verdict']!='PASS' or b['cleanupErrors'] or b.get('runnerErrors') for b in supplements) or composition_issues) and verdict=='PASS':verdict='BLOCKED'
execution_errors={d['manifest']['runId']:d['manifest'].get('runnerErrors',[]) for _,d,_ in batches}
gates=execution_gate_rows(execution_errors,supplements,compatibility,composition_issues,verdict)
summary={'schemaVersion':1,'issuedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':verdict,'scope':'Current second-round business acceptance: C1/C2, five P0, five P1, affected original regressions',
 'reference':reference,'applicationSourceTreeSha256':product_tree,'sourceTreePaths':['apps','packages','db','scripts','package.json','package-lock.json','tsconfig.json'],
 'versionRule':'Full batch is primary. Targeted evidence replaces only its selected case and only with byte-identical application/lock source trees. Exact SUT/QA commits remain attached to every case.',
 'counts':counts,'total':len(rows),'recordedOutcomeRate':sum(counts[s] for s in ['PASS','FAIL','BLOCKED'])/len(rows),'resolvedConformityRate':(counts['PASS']+counts['FAIL'])/len(rows),'passRateOverAllCases':counts['PASS']/len(rows),
 'categoryCounts':{category:{s:sum(r['status']==s and r['evidenceCategory']==category for r in rows) for s in counts} for category in ['productRuntime','deliveryReview']},
 'executionErrors':execution_errors,'executionGates':gates,'compositionIssues':composition_issues,'productionReadiness':'NOT_ASSESSED','review':review,'requirements':coverage,'cases':rows,'compatibility':compat,'compatibilityAssessment':compatibility,'supplements':supplements,'historicalBatches':historical,
 'batches':[{'runId':d['manifest']['runId'],'sutRevision':d['manifest']['sutRevision'],'qaRevision':d['manifest']['qaRevision'],'archive':str(path),'archiveSha256':index['sha256'],'archiveBytes':index['bytes'],'fileCount':index['fileCount'],'counts':d['counts']} for path,d,index in batches]}
out.mkdir(parents=True,exist_ok=True)
(out/'results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(out/'defects.json').write_text(json.dumps(review.get('defects',[]),ensure_ascii=False,indent=2)+'\n')
(out/'requirement-coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')
def cell(v):return str(v or '').replace('|','／').replace('\n',' ')
def reason(r):return r.get('review',{}).get('reason') or r.get('reason') or '; '.join(r.get('uncoveredVariants',[])+[v.get('reason',v['status']) for v in r.get('variants',[]) if v['status']!='PASS']+r.get('cleanupErrors',[]))
lines=['# 第二轮正式业务验收报告','',f'**验收建议：{verdict}。当前版本不满足无条件通过条件。**' if verdict!='PASS' else '**本轮范围验收通过。**','',review['executiveSummary'],'',f"全量基准产品 `{reference['sutRevision']}`；QA `{reference['qaRevision']}`。",f"共 {len(rows)} 条：通过 {counts['PASS']}，失败 {counts['FAIL']}，阻塞 {counts['BLOCKED']}，未执行 {counts['NOT_RUN']}。逐例登记率 {summary['recordedOutcomeRate']:.1%}；有明确符合性结论的比例 {summary['resolvedConformityRate']:.1%}；总范围通过率 {summary['passRateOverAllCases']:.1%}。阻塞被登记不等于产品已测或已通过。",'',f"产品运行与交付材料分别统计：`{json.dumps(summary['categoryCounts'],ensure_ascii=False)}`。",'', '本报告覆盖本轮已批准的业务范围；原范围的历史报告、已批准处置和暂缓事项原样保留。上线准备度未评估，真实付费提供方与真人体验不得由离线/自动化结果替代。','', '## 关键发现','']
for d in review.get('defects',[]):lines.append(f"- **{d['id']} / {d['severity']} / {d['status']}**：{d['summary']}。复现及证据：{d['evidence']}。")
lines+=['','## 未解决事项与责任','']
for item in review.get('remaining',[]):lines.append(f"- **{item['owner']}**：{item['item']}。{item.get('nextAction','')}")
lines+=['','## 执行与证据','', '全部首次结果保留，自动重试为零。测试判定前提修正和研发修复均使用另一个版本绑定批次；未发生的窗口不计通过。下列包逐文件读取校验，内含请求、事件、实际副作用、日志、文件证据、截图/trace、逐子项结果和清理记录。','', '| 批次 | SUT / QA | 原始计数 | 归档 SHA256 |','|---|---|---|---|']
for b in summary['batches']:lines.append(f"| {b['runId']} | {b['sutRevision']} / {b['qaRevision']} | {cell(b['counts'])} | {b['archiveSha256']} |")
lines+=['','## 历史失败与复测批次','']
for b in historical:lines.append(f"- {b['runId']}：SUT `{b['sutRevision']}`；QA `{b['qaRevision']}`；原始 {b['counts']}；归档 SHA256 `{b['archiveSha256']}`。保留首次观察，不将旧版PASS移植到当前结论。")
lines+=['','## 浏览器兼容性','']
for b in compat:lines.append(f"- {b['browser']} / {b['runId']}："+'；'.join(f"{r['id']} {r['status']}" for r in b['results'])+'。仅这些流程的抽样结论。')
lines+=['',f"兼容性独立结论：{compatibility['status']}；计数 {compatibility['counts']}。缺少目标浏览器或流程不能视为通过。",'', '## 独立补证','']
for b in supplements:lines.append(f"- Linux UID / {b['runId']} / {b['verdict']} / archive SHA256 {b['archiveSha256']}。仅补对应文件归属子义务；原宿主结果不改，合证前逐项核对其它义务和产品源码一致。")
lines+=['','## 逐项结论','', '| 用例 | 标题 | 结果 | 当前证据批次 | 说明 |','|---|---|---|---|---|']
for r in rows:lines.append(f"| {r['id']} | {cell(r['title'])} | {r['status']} | {r['executionRunId']} | {cell(reason(r))} |")
lines+=['','完整需求→用例→原始结果见 [需求追踪](requirement-coverage.json) 和 [结构化报告](results.json)；缺陷复现与状态见 [缺陷表](defects.json)，CI 必须同时读取 [业务用例 JUnit](junit.xml)、[兼容性 JUnit](compatibility.junit.xml) 与 [执行／清理门禁 JUnit](gates.junit.xml)；独立门禁不增加业务用例数。', '',review['evidenceLimits'],'']
(out/'report.md').write_text('\n'.join(lines))
suite=ET.Element('testsuite',name='second-round-reviewed-acceptance',tests=str(len(rows)),failures=str(counts['FAIL']),errors=str(counts['BLOCKED']),skipped=str(counts['NOT_RUN']))
for r in rows:
 case=ET.SubElement(suite,'testcase',name=r['id']+' '+r['title'],time=str(r.get('durationMs',0)/1000))
 if r['status']!='PASS':ET.SubElement(case,{'FAIL':'failure','BLOCKED':'error','NOT_RUN':'skipped'}[r['status']],type=r['status'],message=reason(r))
 ET.SubElement(case,'system-out').text=json.dumps(r,ensure_ascii=False)
ET.ElementTree(suite).write(out/'junit.xml',encoding='UTF-8',xml_declaration=True)
compat_suite=ET.Element('testsuite',name='second-round-browser-compatibility',tests=str(len(compatibility['results'])),failures=str(compatibility['counts']['FAIL']),errors=str(compatibility['counts']['BLOCKED']),skipped=str(compatibility['counts']['NOT_RUN']))
for r in compatibility['results']:
 case=ET.SubElement(compat_suite,'testcase',name=r['browser']+' '+r['id'])
 if r['status']!='PASS':ET.SubElement(case,{'FAIL':'failure','BLOCKED':'error','NOT_RUN':'skipped'}[r['status']],type=r['status'],message=reason(r))
 ET.SubElement(case,'system-out').text=json.dumps(r,ensure_ascii=False)
ET.ElementTree(compat_suite).write(out/'compatibility.junit.xml',encoding='UTF-8',xml_declaration=True)
ET.ElementTree(execution_gate_suite(gates)).write(out/'gates.junit.xml',encoding='UTF-8',xml_declaration=True)
files=['gates.junit.xml','compatibility.junit.xml','report.md','results.json','defects.json','requirement-coverage.json','junit.xml'];(out/'report-hashes.json').write_text(json.dumps({name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in files},indent=2)+'\n')
assert len(ET.parse(out/'junit.xml').getroot().findall('testcase'))==len(rows)
print(json.dumps({'verdict':verdict,'counts':counts,'report':str(out/'report.md'),'gateCounts':{s:sum(g['status']==s for g in gates) for s in ['PASS','FAIL','BLOCKED','NOT_RUN']},'gatesJUnit':str(out/'gates.junit.xml')},ensure_ascii=False))
