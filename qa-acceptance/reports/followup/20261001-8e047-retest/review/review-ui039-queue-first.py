#!/usr/bin/env python3
"""Read one immutable raw run and write a separate adjudication; no SUT requests."""
from pathlib import Path
import datetime, hashlib, json, subprocess, zipfile

review = Path(__file__).resolve().parent
qa = review.parents[3]
run = qa/'reports/preflight/2026-10-01T15-56-07.250Z-42ecefbf'
artifact = next(p for p in (run/'artifacts').iterdir() if p.is_dir() and 'UI-039' in p.name)
evidence = artifact/'evidence'
def read(path): return json.loads(path.read_text())
def relative(path): return str(path.relative_to(qa))
manifest = read(run/'manifest.json')
states = read(evidence/'ui039-per-state-results.json')
final = read(evidence/'ui039-public-queue-final.json')
first = read(evidence/'ui039-public-queue-first-proof.json')
copy = read(evidence/'ui039-failed-copy.json')
ui_final = read(evidence/'ui-final.json')
raw_cases = read(run/'results.json')
raw = next(c for c in raw_cases.get('cases', raw_cases.get('results',[])) if c['id']=='UI-039')
assert raw['status']=='FAIL' and 'locator.fill' in raw['reason']
assert final['readyStates']=={'failed':True,'cancelled':True}
assert final['waitingBeforeDisable']=={'failed':True,'cancelled':True}
assert final['targetEverDispatched']=={'failed':False,'cancelled':False}
assert final['blocked']==[] and final['observed']['complete']
assert first['firstProof']['complete']
assert len(first['firstProof']['last']['agent']['turns'])==4
assert len({x['body']['runId'] for x in first['firstProof']['last']['agent']['turns']})==4
assert all(x.get('completedAt') is None for x in first['firstProof']['last']['agent']['turns'])
assert states['outcomes']['failed']['status']=='PASS'
assert states['outcomes']['cancelled']['status']=='FAIL'
assert not (evidence/'ui039-cancelled-copy.json').exists()
assert '暂无步骤记录' in copy['visibleText'] and '正在等待第一步结果' not in copy['visibleText']
assert 'admin' in ui_final['visibleTextExcerpt'] and ui_final['pageErrors']==[]

trace_calls=[]; network=[]
with zipfile.ZipFile(artifact/'trace.zip') as archive:
    trace_rows=[]
    for name in ['test.trace','1-trace.trace']:
        rows=[json.loads(line) for line in archive.read(name).decode().splitlines()]
        trace_rows.extend((name,row) for row in rows)
    for name,row in trace_rows:
        if row.get('type')=='before' and row.get('method') in ['goto','fill','click']:
            params=row.get('params',{})
            trace_calls.append({'member':name,'type':'before','callId':row.get('callId'),
                'startTime':row.get('startTime'),'method':row.get('method'),
                'url':params.get('url'),'selector':params.get('selector')})
        elif row.get('type')=='after' and row.get('error'):
            trace_calls.append({'member':name,'type':'after','callId':row.get('callId'),
                'endTime':row.get('endTime'),'error':row['error']})
    for name in [n for n in archive.namelist() if n.endswith('.network')]:
        for line in archive.read(name).decode().splitlines():
            snapshot=json.loads(line).get('snapshot',{})
            request=snapshot.get('request',{}); url=request.get('url','')
            if '/api/auth/' in url or '/api/agent-runs/' in url:
                network.append({'member':name,'at':snapshot.get('startedDateTime'),'url':url,
                    'method':request.get('method'),'status':snapshot.get('response',{}).get('status')})
login_posts=[n for n in network if n['url'].endswith('/api/auth/login')]
assert len(login_posts)==1 and login_posts[0]['status']==200
last_refresh=[n for n in network if n['url'].endswith('/api/auth/refresh')][-1]
assert last_refresh['status']==200
gotohome=[c for c in trace_calls if c.get('method')=='goto' and c.get('url')==ui_final['url']]
fills=[c for c in trace_calls if c.get('method')=='fill' and c.get('selector')=='input[autocomplete="username"]']
assert len(gotohome)==2 and len(fills)==2 and fills[-1]['startTime']>gotohome[-1]['startTime']
assert any(c.get('error') and 'locator.fill' in c['error']['message'] for c in trace_calls)

api=[json.loads(line) for line in (evidence/'api.ndjson').read_text().splitlines()]
subscenarios={}
for role,target in final['bound']['targets'].items():
    actual=final['observed']['last']['targets'][role]['read']['value']
    assert actual['id']==target['runId'] and actual['groupId']==target['group']['id']
    assert actual['status']==role and actual['endReason']==('wall_clock' if role=='failed' else 'cancelled')
    assert actual['steps']==[]
    agents=states['agent']; gateway=states['gateway']; gid=actual['groupId']; gwid=target['group']['gatewayGroupId']
    counts={'modelCalls':sum(r['body'].get('runId')==actual['id'] for r in agents['turns']),
        'auditCalls':sum(r['body'].get('groupId')==gid for r in agents['audits']),
        'sendOrKickRequests':sum(r['method']=='POST' and r['path'] in [f'/groups/{gwid}/send',f'/groups/{gwid}/kick'] for r in gateway['requests']),
        'ownLandedMessages':sum(m['groupId']==gwid and m.get('accountId') is not None for m in gateway['messages'])}
    assert all(v==0 for v in counts.values())
    group_responses=[r for r in api if r.get('phase')=='response' and r.get('method')=='GET'
        and r.get('url','').endswith(f'/api/groups/{gid}') and r.get('status')==200]
    assert group_responses and json.loads(group_responses[-1]['responseBody'])['activeAgentRunId'] is None
    status='PASS' if role=='failed' else 'BLOCKED'
    subscenarios[role]={'rawStatus':states['outcomes'][role]['status'],'reviewedStatus':status,
        'backendPremiseStatus':'PASS','uiStatus':'PASS' if role=='failed' else 'NOT_RUN',
        'runId':actual['id'],'groupId':gid,'publicState':actual,'externalFacts':counts,
        'activeAgentRunId':None,'ready':True,
        'reason':'真实failed零步详情已显示失败/wall_clock/0步/暂无步骤，未显示等待第一步；查看后公开状态和零副作用复核完成。' if role=='failed'
            else '真实cancelled零步前提成立；第二次登录停在已认证工作台等待不存在的username，未进入该run详情，不能判断取消空态文案。',
        'evidence':[relative(evidence/'ui039-public-queue-final.json'),relative(evidence/'ui039-per-state-results.json'),
            relative(evidence/'ui039-failed-copy.json') if role=='failed' else relative(artifact/'trace.zip')],
        'rawReason':states['outcomes'][role].get('reason')}

selected=[run/'manifest.json',run/'results.json',run/'runner-summary.json',run/'playwright.json',
          evidence/'ui039-public-queue-first-proof.json',evidence/'ui039-public-queue-before-disable.json',
          evidence/'ui039-public-queue-final.json',evidence/'ui039-public-queue-samples.json',
          evidence/'ui039-per-state-results.json',evidence/'ui039-failed-copy.json',evidence/'ui-final.json',
          evidence/'api.ndjson',artifact/'trace.zip',artifact/'error-context.md',evidence/'ui-final.png']
source_index=[{'path':relative(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in selected]
dirty=manifest.get('qaDirtyState','').splitlines()
qa_source=subprocess.check_output(['git','-C',str(qa),'show',f"{manifest['qaRevision']}:qa-acceptance/tests/ui/console.spec.ts"])
source_index.append({'path':f"git:{manifest['qaRevision']}:qa-acceptance/tests/ui/console.spec.ts",'sha256':hashlib.sha256(qa_source).hexdigest(),'bytes':len(qa_source)})
assert b"for (const role of ['failed', 'cancelled'] as const)" in qa_source
report={'schemaVersion':1,'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'basis':{k:manifest[k] for k in ['runId','qaRevision','sutRevision','targetSha256','phase','startedAt']},
    'reviewType':'READ_ONLY_RAW_ADJUDICATION','rawUnchanged':True,
    'cases':[{'caseId':'UI-039','project':'chromium','rawStatus':'FAIL','reviewedStatus':'BLOCKED',
        'reason':'QA在同一已认证浏览器会话中逐状态重复login；第二次入口正常恢复admin工作台，测试等待不存在的username至120秒超时。取消空态页面尚未验证，不能记产品FAIL或整例PASS。',
        'attribution':'QA_NAVIGATION_ERROR','rawDefectId':raw.get('defectId'),
        'rawReason':raw['reason'],'durationMs':raw['durationMs'],'subscenarios':subscenarios}],
    'observedFacts':{'fourInitialRequests':4,'observationSamples':final['observed']['samples'],
        'observationElapsedMs':final['observed']['elapsedMs'],'initialWaiting':final['initialWaiting'],
        'readyStates':final['readyStates'],'targetEverDispatched':final['targetEverDispatched'],
        'firstLoginPost':login_posts[0],'secondHomeNavigation':gotohome[-1],
        'secondUsernameFill':fills[-1],'secondHomeRefresh':last_refresh,
        'cancelledCopyArtifactExists':False,'lastPageUrl':ui_final['url'],'lastPageIsAuthenticatedAdminWorkspace':True},
    'traceTimeline':trace_calls,'publicNetworkTimeline':network,
    'integrityNotes':{'rawPhase':manifest['phase'],'qaTreeSha256':manifest['qaTree']['sha256'],
        'qaDirtyEntryCount':len(dirty),'allDirtyEntriesAreUntrackedReportAssets':all(line.startswith('?? qa-acceptance/reports/') for line in dirty)},
    'sourceIndex':source_index,
    'limits':['本轮属于developer-preflight补证，未改成新的全量正式业务验收。','failed子场景PASS不能扩展成UI-039整例PASS，也不能补填cancelled页面未执行断言。','两个真实零步骤终态不证明严格60秒/5秒等其他专项通过。','最小纠正是同一浏览器只登录一次后分别导航两个真实run；须另冻结QA和新运行留证，旧raw FAIL保持。']}
(review/'ui039-queue-first-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
md=f'''# UI-039 公开排队补证首轮只读审定

**raw FAIL 保留；整例审定 BLOCKED，归因 QA 重复登录导航错误。**

- 原始 run：`{manifest['runId']}`；phase：`{manifest['phase']}`。
- SUT：`{manifest['sutRevision']}`；QA：`{manifest['qaRevision']}`。
- target SHA-256：`{manifest['targetSha256']}`；实际模型 timeout 配置 15000ms。

| 子场景 | 实际 runId | 公开状态/步骤 | UI 审定 |
|---|---|---|---|
| failed | `{subscenarios['failed']['runId']}` | failed / wall_clock / 0 | PASS：实际可见失败、wall_clock、0 / 12、暂无步骤记录，无等待第一步 |
| cancelled | `{subscenarios['cancelled']['runId']}` | cancelled / cancelled / 0 | BLOCKED：后端前提 PASS，页面未进入，不能判断文案 |

四个不同 holder 首请求已真实进入且尚无响应完成；两个目标此前均 running/steps=[]/零模型调用。{final['observed']['samples']} 次观察，约 {final['observed']['elapsedMs']:.6f}ms 后两个目标均为真实所需终态。最终完整独立账本核算两目标 model/audit/send/kick/own-message 均零，活动引用均已清空。这个持续时间只描述本轮造数，不替代活动预算断言。

第一次浏览器登录于 `2026-10-01T15:57:08.173Z` 返回 200，failed run 详情实际 GET 200，逐状态原始结果已记 failed PASS。随后脚本在 trace `61140.602ms` 再次 goto `/`；真实 refresh 200、me 200，页面恢复到已认证 admin 群组工作台。`61176.367ms` 开始等待不存在的 username，最终全例 120000ms 超时；raw duration `{raw['durationMs']}ms`。错误栈指向测试 login 的 username.fill，而非产品取消状态展示。`ui039-cancelled-copy.json` 不存在，未到取消详情。

依据是原始 trace、公开网络响应、页面快照与逐状态事实，不按源码猜测产品行为。源码只核对冻结 QA 的循环内重复 login 位置。允许已登录入口恢复工作台，不能反过来要求产品为了测试显示登录框。

最小后续修正：在两个状态循环前只登录一次，再分别从公开群入口进入真实 run。必须新 QA 版本另跑补证；不覆写本轮 FAIL、不把 failed 的通过扩充为整例通过、不伪补取消页面结果。归档 QA dirty 列表仅为未追踪报告资产的事实单独保留，原 phase 不变。

完整身份、逐状态字段、trace 时间线和原始文件哈希见 [JSON 审定](ui039-queue-first-review.json)。本记录仅写新 review 文件，没有编辑原始证据或启动产品。
'''
(review/'ui039-queue-first-review.md').write_text(md)
for item in source_index:
    if not item['path'].startswith('git:'):
        assert hashlib.sha256((qa/item['path']).read_bytes()).hexdigest()==item['sha256']
print(json.dumps({'reviewedStatus':'BLOCKED','failed':'PASS','cancelled':'BLOCKED','rawUnchanged':True},ensure_ascii=False))
