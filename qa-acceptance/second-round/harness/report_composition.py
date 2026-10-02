"""Fail-closed composition of independently frozen QA observations."""
import copy, json
import xml.etree.ElementTree as ET

COMPATIBILITY_CASES = {'SR-UI-001','SR-UI-008','SR-UI-019','SR-BE-DEL-006'}
UID_VARIANTS = {'linux-owned-positive-control','SR-C2-008-foreign-uid-record','SR-BE-USG-006-safe-temp-positive-control','SR-BE-USG-006-foreign-uid-preservation'}

def compatibility_status(batches):
    rows=[]
    for browser in ['firefox','webkit']:
        for case in sorted(COMPATIBILITY_CASES):
            matches=[(b,r) for b in batches if b['browser']==browser for r in b['results'] if r['id']==case]
            if not matches:
                rows.append({'browser':browser,'id':case,'status':'NOT_RUN','reason':'Required compatibility smoke has no actual evidence'})
            else:
                b,r=matches[-1]
                rows.append(dict(r,browser=browser,executionRunId=b['runId'],history=[{'runId':x['runId'],'status':y['status']} for x,y in matches]))
    status='FAIL' if any(r['status']=='FAIL' for r in rows) else 'BLOCKED' if any(r['status']!='PASS' for r in rows) else 'PASS'
    return {'status':status,'results':rows,'counts':{s:sum(r['status']==s for r in rows) for s in ['PASS','FAIL','BLOCKED','NOT_RUN']}}

def compose_uid_case(case, prerequisite_rows, supplement, host_issues=()):
    """Only the one proved-missing UID obligation may be completed. Raw stays unchanged."""
    assert not case.get('cleanupErrors'), 'Host case still has cleanup errors'
    assert not case.get('uncoveredVariants'), 'Host case still has uncovered variants'
    assert not host_issues, 'Host archive has explicit cleanup/authentication failure: '+json.dumps(host_issues,ensure_ascii=False)
    assert supplement['subObligationVerdict']=='PASS', 'UID supplement has not passed'
    assert not supplement['cleanupErrors'] and not supplement['manifest'].get('runnerErrors')
    rows=supplement['subObligations']
    assert {r['id'] for r in rows}==UID_VARIANTS and len(rows)==4
    assert all(r['status']=='PASS' and r['evidence'] for r in rows)
    assert case['status']=='BLOCKED' and case['id'] in {'SR-C2-008','SR-BE-USG-006'}
    if case['id']=='SR-C2-008':
        expected={'competing-owner','corrupt','symlink','wide-permissions','foreign-owner'}
        key='variant';missing='foreign-owner'
        assert case['reason'].endswith('Private storage subscenarios lack actual fixtures: foreign-owner')
    else:
        expected={'SR-BE-USG-006-true','SR-BE-USG-006-false','entry-or-private-temp','key-file-import','foreign-uid-proof'}
        key='name';missing='foreign-uid-proof'
        assert 'Foreign UID evidence runs in a separately frozen Linux supplement' in case['reason']
        assert all(r.get('evidence') for r in prerequisite_rows), 'Usage obligation ledger has a row without evidence'
    assert len(prerequisite_rows)==len(expected) and {r[key] for r in prerequisite_rows}==expected
    assert all(r['status']==('BLOCKED' if r[key]==missing else 'PASS') for r in prerequisite_rows)
    result=copy.deepcopy(case)
    result['rawStatus']='BLOCKED';result['rawReason']=result['reason'];result['status']='PASS'
    result['reason']='All other declared sub-obligations passed in the frozen host batch; the sole foreign UID gap passed in the separately frozen Linux supplement. This is composed cross-platform evidence, not a Darwin foreign-UID execution.'
    result['composition']={'supplementRunId':supplement['manifest']['runId'],'sutRevision':supplement['manifest']['sutRevision'],'qaRevision':supplement['manifest']['qaRevision'],'prerequisiteRows':prerequisite_rows,'supplementVariants':rows,'hostResultUnchanged':True,'platformLimit':'Darwin original variants plus actual Linux UID 10001/10002. No claim of Darwin foreign UID behavior.'}
    return result


def archive_composition_issues(case_id, artifacts):
    """Inspect only verified JSON evidence from this host case, never siblings.
    Cleanup errors can be secondary to the deliberately missing UID fixture and
    therefore absent from the top-level case/runner error arrays.
    """
    issues=[]
    prefix='run/cases/'+case_id+'/'
    def cleanup_reasons(value):
        found=[]
        if isinstance(value,dict):
            for key,child in value.items():
                if key in {'error','errors','failures','cleanupErrors'} and child:
                    found.append(key+'='+json.dumps(child,ensure_ascii=False))
                elif key=='status' and isinstance(child,str) and child in {'FAIL','BLOCKED','NOT_RUN','failed'}:
                    found.append('status='+str(child))
                elif key in {'verified','absent'} and child is False:
                    found.append(key+'=false')
                if isinstance(child,(dict,list)):found.extend(cleanup_reasons(child))
        elif isinstance(value,list):
            for child in value:found.extend(cleanup_reasons(child))
        return found
    for member,value in artifacts.items():
        if not member.startswith(prefix):continue
        name=member.rsplit('/',1)[-1]
        if 'provider-offline-auth-validation' in name:
            mismatch=isinstance(value,dict) and (value.get('status')=='FAIL' or
                (isinstance(value.get('actualRequests'),int) and isinstance(value.get('matchedRequests'),int) and value['matchedRequests']!=value['actualRequests']))
            if mismatch:issues.append({'member':member,'status':'FAIL','reason':'Actual offline authentication validation failed'})
        if 'cleanup' in name:
            reasons=cleanup_reasons(value)
            if 'secondary-cleanup-error' in name or 'secondary-fixture-cleanup' in name:
                reasons.insert(0,'Secondary cleanup exception evidence exists')
            if reasons:issues.append({'member':member,'status':'BLOCKED','reason':'; '.join(dict.fromkeys(reasons))})
    return issues


def execution_gate_rows(execution_errors, supplements, compatibility, composition_issues, verdict):
    """Independent gates; these never inflate the business-case count."""
    rows=[{'id':'reviewed-acceptance-verdict','status':verdict,'reason':'Authoritative reviewed outcome; business, compatibility and execution gates must all pass'},
          {'id':'required-browser-compatibility','status':compatibility['status'],'reason':'All eight required Firefox/WebKit case samples must have current-candidate PASS evidence'}]
    for run_id,errors in execution_errors.items():
        rows.append({'id':'execution-cleanup/'+run_id,'status':'BLOCKED' if errors else 'PASS','reason':'; '.join(map(str,errors)) or 'No recorded runner or global cleanup error','runId':run_id})
    for supplement in supplements:
        errors=[*supplement.get('cleanupErrors',[]),*supplement.get('runnerErrors',[])]
        status='FAIL' if supplement['verdict']=='FAIL' else 'BLOCKED' if errors or supplement['verdict']!='PASS' else 'PASS'
        rows.append({'id':'supplement-cleanup/'+supplement['runId'],'status':status,'reason':'; '.join(map(str,errors)) or 'UID supplement verdict '+supplement['verdict'],'runId':supplement['runId']})
    for index,issue in enumerate(composition_issues):
        rows.append({'id':'host-evidence-gate/'+str(index),'status':issue['status'],'reason':issue['reason'],'caseId':issue['caseId'],'runId':issue['runId'],'member':issue.get('member')})
    return rows


def execution_gate_suite(rows):
    assert rows and all(r['status'] in {'PASS','FAIL','BLOCKED','NOT_RUN'} for r in rows)
    counts={status:sum(r['status']==status for r in rows) for status in ['PASS','FAIL','BLOCKED','NOT_RUN']}
    suite=ET.Element('testsuite',name='second-round-execution-and-cleanup-gates',tests=str(len(rows)),failures=str(counts['FAIL']),errors=str(counts['BLOCKED']),skipped=str(counts['NOT_RUN']))
    for row in rows:
        case=ET.SubElement(suite,'testcase',name=row['id'])
        if row['status']!='PASS':ET.SubElement(case,{'FAIL':'failure','BLOCKED':'error','NOT_RUN':'skipped'}[row['status']],type=row['status'],message=row['reason'])
        ET.SubElement(case,'system-out').text=json.dumps(row,ensure_ascii=False)
    return suite
