#!/usr/bin/env python3
"""Post-run read-only evidence checks; writes only this new independent review."""
from pathlib import Path
import datetime, hashlib, json, subprocess

review = Path(__file__).resolve().parent
qa = review.parents[3]
run = qa / 'reports/preflight/2026-10-01T15-59-57.698Z-99a9ac63'
artifact = next(p for p in (run / 'artifacts').iterdir() if p.is_dir() and 'UI-039' in p.name)
evidence = artifact / 'evidence'
def read(p): return json.loads(p.read_text())
def relative(p): return str(p.relative_to(qa))
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()

manifest = read(run / 'manifest.json')
states = read(evidence / 'ui039-per-state-results.json')
final = read(evidence / 'ui039-public-queue-final.json')
first = read(evidence / 'ui039-public-queue-first-proof.json')
ui_final = read(evidence / 'ui-final.json')
runner = read(run / 'runner-summary.json')
cleanup = read(evidence / 'cleanup.json')
results = read(run / 'results.json')
raw = next(c for c in results.get('cases', results.get('results', [])) if c['id'] == 'UI-039')
assert manifest['qaRevision'] == '1edbcaf7daead815058137568f6aad91d5000db9'
assert manifest['sutRevision'] == '8e047aea842bfcec64802e4918b52b460b93c48b'
assert manifest['targetSha256'] == '1dd9aed24f3d4692aefc6b342fa1fd78794bea833ef0be85f26b3e7db3788a02'
assert str(manifest['target']['sut']['env']['AGENT_TURN_TIMEOUT_MS']) == '15000'
assert raw['status'] == 'PASS' and runner['runnerStatus'] == 'passed' and runner['runnerErrors'] == []
assert final['initialWaiting'] is True and final['observed']['complete'] is True
assert final['readyStates'] == final['waitingBeforeDisable'] == {'failed': True, 'cancelled': True}
assert final['targetEverDispatched'] == {'failed': False, 'cancelled': False}
assert final['blocked'] == states['blockers'] == [] and cleanup['failures'] == []
assert first['firstProof']['complete'] and len(first['holders']) == 4
turns = first['firstProof']['last']['agent']['turns']
assert len(turns) == 4 and len({t['body']['runId'] for t in turns}) == 4
assert all(t.get('completedAt') is None and t.get('responseStatus') is None for t in turns)
holders = []
for holder in first['holders']:
    turn = next(t for t in turns if t['body']['runId'] == holder['runId'])
    first_content = turn['body']['messages'][0]['content'][0]['text']
    assert json.loads(first_content)['groupId'] == holder['group']['id']
    count = sum(t['body']['runId'] == holder['runId'] for t in states['agent']['turns'])
    assert count == 3
    holders.append({'runId': holder['runId'], 'groupId': holder['group']['id'],
        'initialRequestId': turn['id'], 'initialRequestAt': turn['at'],
        'initialRequestPending': True, 'finalModelCalls': count})

api = [json.loads(line) for line in (evidence / 'api.ndjson').read_text().splitlines()]
subscenarios = {}
for role, target in final['bound']['targets'].items():
    copy = read(evidence / f'ui039-{role}-copy.json')
    actual = final['observed']['last']['targets'][role]['read']['value']
    assert actual == copy['actual'] and actual['id'] == target['runId']
    assert actual['groupId'] == target['group']['id'] and actual['status'] == role
    assert actual['endReason'] == ('wall_clock' if role == 'failed' else 'cancelled')
    assert actual['steps'] == [] and states['outcomes'][role]['status'] == 'PASS'
    text = copy['visibleText']
    assert actual['id'] in text and actual['endReason'] in text
    assert ('失败' if role == 'failed' else '已取消') in text
    assert '0 / 12' in text and '暂无步骤记录' in text and '正在等待第一步结果' not in text
    gid = actual['groupId']; gwid = target['group']['gatewayGroupId']
    agent = states['agent']; gateway = states['gateway']
    counts = {
        'modelCalls': sum(r['body'].get('runId') == actual['id'] for r in agent['turns']),
        'auditCalls': sum(r['body'].get('groupId') == gid for r in agent['audits']),
        'sendRequests': sum(r['method'] == 'POST' and r['path'] == f'/groups/{gwid}/send' for r in gateway['requests']),
        'kickRequests': sum(r['method'] == 'POST' and r['path'] == f'/groups/{gwid}/kick' for r in gateway['requests']),
        'ownLandedMessages': sum(m['groupId'] == gwid and m.get('accountId') is not None for m in gateway['messages'])}
    assert all(n == 0 for n in counts.values())
    cleared = []
    for row in api:
        if row.get('phase') == 'response' and row.get('method') == 'GET' and row.get('status') == 200 and row.get('url', '').endswith(f'/api/groups/{gid}'):
            if json.loads(row['responseBody'])['activeAgentRunId'] is None:
                cleared.append({k: row[k] for k in ['qaRequestId', 'startedAt', 'durationMs']})
    assert len(cleared) >= 2
    subscenarios[role] = {'rawStatus': 'PASS', 'reviewedStatus': 'PASS',
        'backendPremiseStatus': 'PASS', 'uiStatus': 'PASS', 'runId': actual['id'], 'groupId': gid,
        'publicState': actual, 'externalFacts': counts, 'activeAgentRunId': None,
        'activeReferenceClearedReads': cleared, 'ready': True,
        'visibleText': text, 'reason': '真实零步骤终态、独立外账本零目标派发及副作用、详情状态和无步骤文案、查看后终态及活动引用均已验证。',
        'evidence': [relative(evidence / f'ui039-{role}-copy.json'), relative(evidence / 'ui039-per-state-results.json'), relative(evidence / 'api.ndjson')]}
assert ui_final['url'].endswith('/' + subscenarios['cancelled']['runId']) and ui_final['pageErrors'] == []
assert '已取消' in ui_final['visibleTextExcerpt'] and '暂无步骤记录' in ui_final['visibleTextExcerpt']
assert not (artifact / 'trace.zip').exists()

selected = [run / 'manifest.json', run / 'results.json', run / 'runner-summary.json', run / 'playwright.json',
    evidence / 'ui039-public-queue-first-proof.json', evidence / 'ui039-public-queue-before-disable.json',
    evidence / 'ui039-public-queue-final.json', evidence / 'ui039-public-queue-samples.json',
    evidence / 'ui039-per-state-results.json', evidence / 'ui039-failed-copy.json', evidence / 'ui039-cancelled-copy.json',
    evidence / 'ui-final.json', evidence / 'ui-final.png', evidence / 'api.ndjson', evidence / 'cleanup.json',
    review / 'ui039-queue-first-review.json', review / 'ui039-queue-first-review.md']
index = [{'path': relative(p), 'sha256': digest(p), 'bytes': p.stat().st_size} for p in selected]
for source in ['tests/ui/console.spec.ts', 'playwright.config.ts']:
    content = subprocess.check_output(['git', '-C', str(qa), 'show', f"{manifest['qaRevision']}:qa-acceptance/{source}"])
    index.append({'path': f"git:{manifest['qaRevision']}:qa-acceptance/{source}",
        'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)})
    if source == 'playwright.config.ts': assert b"trace: 'retain-on-failure'" in content
diff = subprocess.check_output(['git', '-C', str(qa), 'diff', 'b076790de087406de12336bdfd385a569b014f83', manifest['qaRevision'], '--', 'tests/ui/console.spec.ts']).decode()
changed = [line for line in diff.splitlines() if line.startswith(('+', '-')) and not line.startswith(('+++', '---'))]
assert len(changed) == 2 and all('await login(page, qa)' in line for line in changed)
dirty = manifest.get('qaDirtyState', '').splitlines()
report = {'schemaVersion': 1, 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'basis': {k: manifest[k] for k in ['runId', 'qaRevision', 'sutRevision', 'targetSha256', 'phase', 'startedAt']},
    'reviewType': 'READ_ONLY_RAW_ADJUDICATION', 'rawUnchanged': True,
    'cases': [{'caseId': 'UI-039', 'project': 'chromium', 'rawStatus': 'PASS', 'reviewedStatus': 'PASS',
        'reason': '两个真实零步骤终态分别完成可见页面、独立账本和公开状态复核；本轮仅将登录移至循环前一次，原业务断言未变。',
        'durationMs': raw['durationMs'], 'subscenarios': subscenarios}],
    'observedFacts': {'holders': holders, 'observationSamples': final['observed']['samples'],
        'observationElapsedMs': final['observed']['elapsedMs'], 'initialWaiting': final['initialWaiting'],
        'readyStates': final['readyStates'], 'targetEverDispatched': final['targetEverDispatched'],
        'lastPageUrl': ui_final['url'], 'pageErrors': ui_final['pageErrors'], 'cleanup': cleanup,
        'runnerSummary': runner, 'configuredAgentTurnTimeoutMs': 15000, 'retainedTrace': False},
    'qaCorrectionDiff': diff,
    'history': {'priorRunId': '2026-10-01T15-56-07.250Z-42ecefbf', 'priorRawStatus': 'FAIL',
        'priorReviewedStatus': 'BLOCKED', 'priorReview': relative(review / 'ui039-queue-first-review.json'),
        'replacementOfRawEvidence': False},
    'integrityNotes': {'rawPhase': manifest['phase'], 'qaTreeSha256': manifest['qaTree']['sha256'],
        'qaDirtyEntryCount': len(dirty), 'allDirtyEntriesAreUntrackedReportAssets': all(line.startswith('?? qa-acceptance/reports/') for line in dirty)},
    'sourceIndex': index,
    'limits': ['本次developer-preflight Chromium单例补证不能表述成8e候选全量业务通过，也没有真人IME/焦点结论。',
        '四个真实holder只是本次可验证前提，不建立产品容量必须为4的新需求；约50.8秒采样时长不等同active预算见证或严格60秒/5秒专项。',
        'cleanup.json仅证明该运行记录的自有清理无失败；本复核未重新连接Docker或审计全机资源。',
        'PASS运行按retain-on-failure不保留trace.zip；页面依据逐状态真实可见文本、API证据、结果及最终取消页截图，不伪造网络trace。',
        '首轮raw FAIL及审定BLOCKED、原失败/取消细分均原样保留，本次新PASS是独立补证。']}
(review / 'ui039-queue-final-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
md = f'''# UI-039 公开排队最终补证只读审定

**raw PASS，独立审定 PASS；范围为该版本 Chromium 的 UI-039。首轮 raw FAIL／审定 BLOCKED 保留。**

- run：`{manifest['runId']}`；原始 phase：`{manifest['phase']}`。
- SUT：`{manifest['sutRevision']}`；QA：`{manifest['qaRevision']}`。
- target SHA-256：`{manifest['targetSha256']}`；模型请求 timeout 配置 15000ms。
- 原始耗时 {raw['durationMs']}ms；runner passed，runnerErrors 为空。

| 子场景 | 实际 runId | 公开状态 | 页面与复核 |
|---|---|---|---|
| failed | `{subscenarios['failed']['runId']}` | failed / wall_clock / 0 步 | PASS：失败、wall_clock、0 / 12、暂无步骤记录，无等待第一步 |
| cancelled | `{subscenarios['cancelled']['runId']}` | cancelled / cancelled / 0 步 | PASS：已取消、cancelled、0 / 12、暂无步骤记录，无等待第一步 |

四个不同 holder 首次模型请求均已真实进入、当时尚未完成，并与各自真实 groupId 绑定。最终外部账本各有三次 holder 模型请求。两个目标在禁用前均已公开呈现 running / steps=[] 且无模型派发，随后 {final['observed']['samples']} 次观察（{final['observed']['elapsedMs']:.6f}ms）取得两种真实终态。该时长描述造数观察，不替代活动预算证据。

独立重数最终 Agent/Gateway 账本：每个目标 model、audit、send、kick、own landed message 均为 0；外部触发消息未被误计为自有发信。API 在查看前后分别确认目标终态和 activeAgentRunId=null。两个详情均留有逐状态实际可见文本；最终取消页截图已人工核阅，页面状态、0 / 12 和“暂无步骤记录”可见，pageErrors 为空。

与首轮冻结 QA 的精确差异仅为把 login 从逐状态循环内移至循环前一次；产品版本、target 和业务断言没有改变。原首轮重复登录导致的 raw FAIL 与取消页未执行事实见 [首轮审定](ui039-queue-first-review.md)，本次不覆盖其结果。

清理日志于 `{cleanup['completedAt']}` 记录 failures=[]，仅支持本轮自有清理记录无失败；本复核没有重新连接 Docker 或宣称全机资源全部清除。PASS 运行配置为 retain-on-failure，因此没有 trace.zip；不将不存在的浏览器 trace 当证据。此 PASS 不外推为8e全量业务验收通过、不提供严格60秒/5秒或真人IME/焦点结论。

身份、完整页面文本、四个 holder 绑定、独立计数、精确 QA 修正 diff 和原始文件哈希见 [JSON 审定](ui039-queue-final-review.json)。仅写新 review 文件，没有编辑源码、旧报告、原始证据或执行产品。
'''
(review / 'ui039-queue-final-review.md').write_text(md)
for item in index:
    if not item['path'].startswith('git:'):
        assert digest(qa / item['path']) == item['sha256']
print(json.dumps({'reviewedStatus': 'PASS', 'failed': 'PASS', 'cancelled': 'PASS', 'rawUnchanged': True}, ensure_ascii=False))
