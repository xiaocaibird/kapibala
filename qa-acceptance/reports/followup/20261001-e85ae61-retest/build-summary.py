"""Read archived results only. Never executes the SUT or changes raw evidence.

Run from qa-acceptance. Derived outputs are intentionally reproducible.
"""
import collections
import json
import pathlib
import re
import xml.etree.ElementTree as ET

BASE = pathlib.Path(__file__).resolve().parent
QA = BASE.parents[2]
SUT = 'e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb'
OLD_QA = '105ed289e0fbed6306025cd3dc1889730b17a423'
NEW_QA = '526d814db45d15896f96563e7a2a8b8f75064f81'


def read(path):
    return json.loads(path.read_text())


def write(name, value):
    (BASE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def count(items):
    c = collections.Counter(x['status'] for x in items)
    return {s: c[s] for s in ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']}


catalog = {}
for p in (QA / 'cases').glob('*.json'):
    data = read(p)
    if isinstance(data, list):
        for c in data:
            if isinstance(c, dict) and 'id' in c:
                assert c['id'] not in catalog
                catalog[c['id']] = c

runs, history, latest = [], [], {}
for d in sorted((BASE / 'runs').iterdir()):
    m, r, runner = [read(d / p) for p in ['manifest.json', 'results.json', 'runner-summary.json']]
    events = read(d / 'events.json')
    assert m['sutRevision'] == SUT and m['qaRevision'] in [OLD_QA, NEW_QA]
    assert m['qaTree']['sha256'] == r['metadata']['qaTreeAfter']['sha256']
    assert not runner['runnerErrors']
    assert len(events) == len(m['suite']['caseIds'])
    assert set(x['id'] for x in events) == set(m['suite']['caseIds'])
    assert all(x.get('attempt') == 0 for x in events)
    # The original reporter adds this diagnostic for an all-blocked run.
    assert all(x == '执行器整体状态: failed' for x in r['integrity'])
    runs.append({
        'runId': d.name, 'suite': m['suite']['id'], 'phase': m['phase'],
        'sutRevision': SUT, 'qaRevision': m['qaRevision'],
        'qaTreeBeforeSha256': m['qaTree']['sha256'],
        'qaTreeAfterSha256': r['metadata']['qaTreeAfter']['sha256'],
        'targetSha256': m['targetSha256'], 'suiteSha256': m['suiteSha256'],
        'startedAt': m['startedAt'], 'completedAt': runner['completedAt'],
        'counts': count(events), 'runnerStatus': runner['runnerStatus'],
        'runnerErrors': runner['runnerErrors'], 'rawIntegrity': r['integrity'],
        'manifest': f'runs/{d.name}/manifest.json',
        'archiveIndex': f'runs/{d.name}/evidence-index.json',
    })
    for e in events:
        c = catalog[e['id']]
        relative = []
        for p in e.get('evidence', []):
            path = pathlib.Path(p)
            relative.append(path.relative_to(QA / 'reports' / 'preflight' / d.name).as_posix())
        item = {**e, 'reason': re.sub(r'\x1b\[[0-9;]*m', '', e.get('reason', '')),
                'title': c['title'], 'requirements': c['requirements'],
                'rawWholeCaseResult': next(v for v in r['results'] if v['id'] == e['id']),
                'automation': c.get('automation'), 'runId': d.name,
                'qaRevision': m['qaRevision'], 'sutRevision': SUT,
                'evidenceWithinRunArchive': relative}
        history.append(item)
        latest[(e['id'], e['project'])] = item

items = sorted(latest.values(), key=lambda x: (x['id'], x['project']))
assert len(history) == 32 and len(items) == 30
assert count(items) == {'PASS': 24, 'FAIL': 3, 'BLOCKED': 3, 'NOT_RUN': 0}
assert count(history[:29]) == {'PASS': 21, 'FAIL': 3, 'BLOCKED': 5, 'NOT_RUN': 0}
assert count(history[29:]) == {'PASS': 3, 'FAIL': 0, 'BLOCKED': 0, 'NOT_RUN': 0}
summary = {
    'formatVersion': 1, 'reportKind': 'independent-qa-focused-supplement',
    'candidate': SUT, 'productSourceCommit': '7a38ae2979b187a74757dfe4456f947e26ee27b7',
    'qaRevisions': [OLD_QA, NEW_QA], 'rawRunnerPhase': 'developer-preflight',
    'conclusions': {'focusedScope': 'FAIL', 'unconditionalAcceptance': False,
                    'fullBusinessSuiteOnThisCandidate': 'NOT_RUN', 'releaseReadiness': 'NOT_ASSESSED',
                    'nextC1C2Candidate': 'MATERIALS_RECEIVED_NOT_EXECUTED'},
    'metrics': {'plannedUniqueCaseProjectPairs': 30, 'observedUniqueCaseProjectPairs': 30,
                'distinctCaseIds': 30, 'executionRecords': 32, 'automaticRetries': 0,
                'firstExecution': count(history[:29]), 'correctionRetest': count(history[29:]),
                'latest': count(items), 'allExecutionHistory': count(history),
                'attemptedPercentOfSelected': 100, 'conclusivePercentOfSelected': 90,
                'passedPercentOfSelected': 80,
                'requirementIdsReferencedBySelectedCases': len({v for x in items for v in x['requirements']}),
                'requirementCoverageClaim': 'No full-requirement coverage percentage inferred from this subset'},
    'timeline': {'startedAt': runs[0]['startedAt'], 'completedAt': runs[-1]['completedAt'],
                 'clockNote': 'Use manifest/runner and raw events for timeline. Derived case completedAt may omit worker fixture time.'},
    'runs': runs, 'latestResults': items,
    'retests': [{'id': x['id'], 'project': x['project'],
                 'first': next(y for y in history if y['id'] == x['id']),
                 'retest': x, 'reason': 'QA observation correction; SUT unchanged'}
                for x in history[29:] if x['id'] != 'INT-STREAM-002'],
    'additionalRegression': 'INT-STREAM-002 tests the changed shared stream assertion helper',
    'history': history,
    'boundaries': [
        'No historical PASS imported into this candidate; old signed report remains unchanged.',
        'All 7 runs preserve developer-preflight phase. This supplement is not a new full business acceptance report.',
        'Two first runs retain raw integrity diagnostic 执行器整体状态: failed; both are all-BLOCKED, not missing tests or source drift.',
        'Three real-person manual obligations are not closed by automated Chromium checks.',
        'UI-008 Chromium PASS is one project result; its raw whole-case aggregate remains NOT_RUN because Firefox/WebKit were not selected.',
        'C1/C2 candidate 2cf74d2 and later main are excluded; no paid model calls executed.',
    ],
}
write('summary.json', summary)

details = {
 'AGENT-025': ('E85-F-01', 'S2', '完整活动超过严格60秒上限',
   '同一epoch完整活动[60011,60023]ms；已保存lifecycle事后复核从创建事务至实际终止决定[60011.182125,60016.268708]ms。',
   '单epoch持续工具/模型活动；通过受控等待建立实际活动，观察终止决定及公开终态。原测试在活动下界断言停止，后续lifecycle断言是事后分析。',
   'backend-postmortem/README.md'),
 'AGENT-028': ('E85-F-02', 'S2', '工具状态等待超过严格5秒上限',
   '第一次实际等待[5000.021624999999,5000.157999999999]ms；不加容差、不向下取整。',
   '首发延迟至SEND_TIMEOUT；恢复后同clientMsgId查询sent。已执行一次审计/发送/落地断言；第一次时间断言FAIL后，history和第二次时间仅事后复核。',
   'backend-postmortem/README.md'),
 'CAP-003': ('E85-F-03', 'S2', '容量场景活动超过严格60秒上限，QA-DEF-002仍复现',
   '受控活动区间[60004,60071]ms。公开HTTP独立区间[59915.466292,60171.70175]ms跨界，单独不足判FAIL；FAIL依据完整活动下界。',
   '按CAP-003建立真实工程容量拒绝与活动预算证据，观察原run终态；不得将调度延迟或公开轮询上界替代完整活动区间。',
   'runs/2026-10-01T12-34-40.057Z-b8ab8bd7/evidence-index.json'),
 'INT-ACT-001': ('E85-B-01', None, '重启前未保存尾段没有完整跨epoch证据',
   '旧epoch安全活动[21101,21109]ms，新epoch[38911,38919]ms，includesUnsavedTail=false；不能相加或仅凭持久化60013ms判FAIL/PASS。',
   '保留网关和数据库，kill真实活动进程并恢复同run；需要旧尾段和接管epoch完整关联的实际观测。',
   'runs/2026-10-01T12-23-10.195Z-e84c34eb/evidence-index.json'),
 'BLK-EXT-001': ('E85-B-02', None, '远端没有效果且无确定性查询结果的恢复缺口',
   '静默支路观察10010.733209ms/170样本，1发送、0落地、127次查询、无新派发，仍unknown；10秒不是产品时限，也不证明永久不恢复。',
   '一个支路远端落地并可见sent；另一支路远端无效果且普通查询404。需要协议提供权威结果/无效果判据，或负责人明确例外；不盲重试。',
   'backend-postmortem/README.md'),
 'UI-032': ('E85-B-03', None, '缺少只确认已呈现变化的公开独立操作',
   '实际加载23项多页目录并由一次元数据变化建立目录过期和提醒；独立确认入口匹配0，未完成清提示后旧游标仍不可用的验证。',
   '加载目录多页，后台变更元数据；寻找不刷新目录的公开相关确认操作。开发需提供对应操作/契约；QA不伪造按钮或内部已读状态。',
   'runs/2026-10-01T12-31-30.250Z-1384f257/evidence-index.json'),
}
findings = []
for x in items:
    if x['status'] == 'PASS':
        continue
    fid, severity, title, actual, steps, evidence = details[x['id']]
    c = catalog[x['id']]
    findings.append({'id': fid, 'caseId': x['id'], 'status': x['status'], 'severity': severity,
                     'title': title, 'actual': actual, 'reproduction': steps,
                     'sourceCaseSteps': c['steps'], 'expected': c['expected'],
                     'requirements': c['requirements'], 'sutRevision': SUT,
                     'qaRevision': x['qaRevision'], 'runId': x['runId'], 'evidence': evidence,
                     'owner': 'development/protocol integration',
                     'acceptedException': False})
write('findings.json', findings)

suite = ET.Element('testsuite', name='e85ae61-focused-supplement-latest', tests='30', failures='3', errors='0', skipped='3')
props = ET.SubElement(suite, 'properties')
for key, value in {'sutRevision': SUT, 'scope': 'focused supplement, not full business acceptance',
                   'executionRecords': '32', 'automaticRetries': '0',
                   'blockedEncoding': 'skipped means BLOCKED, never PASS'}.items():
    ET.SubElement(props, 'property', name=key, value=value)
for x in items:
    tc = ET.SubElement(suite, 'testcase', name=x['id'], classname=x['project'], time=str(x['durationMs'] / 1000))
    if x['status'] == 'FAIL':
        ET.SubElement(tc, 'failure', type='requirement-failure', message=x['reason']).text = x['reason']
    if x['status'] == 'BLOCKED':
        ET.SubElement(tc, 'skipped', message='BLOCKED: ' + x['reason']).text = x['reason']
    ET.SubElement(tc, 'system-out').text = json.dumps({k: x[k] for k in ['status', 'runId', 'qaRevision', 'requirements', 'evidenceWithinRunArchive']}, ensure_ascii=False)
ET.indent(suite)
ET.ElementTree(suite).write(BASE / 'junit.xml', encoding='utf-8', xml_declaration=True)

lines = ['# 本轮逐项结果', '', '仅本次固定 e85 候选的 30 项，未导入历史通过。首次结果及两项复测关联见 summary.json；完整执行史有 32 条。', '',
         '| 用例 | 项目 | 项目状态 | 原始整用例汇总 | 需求 | QA提交 | 本轮来源 |', '| --- | --- | --- | --- | --- | --- | --- |']
for x in items:
    lines.append(f"| {x['id']} {x['title']} | {x['project']} | {x['status']} | {x['rawWholeCaseResult']['status']} | {', '.join(x['requirements'])} | `{x['qaRevision'][:7]}` | [{x['runId']}](runs/{x['runId']}/events.json) |")
lines.extend(['', 'UI-008 仅 Chromium 项目通过；Firefox/WebKit 本轮未选取，所以该轮原始整用例汇总仍为 NOT_RUN。此表不关闭其跨浏览器义务。'])
(BASE / 'case-results.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'latest': count(items), 'historyRecords': len(history), 'unique': len(items), 'runCount': len(runs)}))
