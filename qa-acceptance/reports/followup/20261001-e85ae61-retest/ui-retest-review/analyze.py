"""Independent in-memory review of saved ARC-UI-015 retest evidence only.

No HTTP, SUT, database or browser. Outputs are exclusive-create; pass a fresh
output directory when reproducing the review. No original reports are changed.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[4]
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
run = root / 'reports/preflight/2026-10-01T12-46-08.250Z-9b50fc8a'
artifact = run / 'artifacts/ui-architecture--ARC-UI-015-耗尽后显式同页刷新可开始新一轮-chromium'
inputs = {}


def read(path):
    data = path.read_bytes()
    inputs[path] = {'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    return data


def load(path):
    return json.loads(read(path))


manifest = load(run / 'manifest.json')
results = load(run / 'results.json')
playwright = load(run / 'playwright.json')
old = load(root / 'reports/preflight/2026-10-01T12-31-30.250Z-1384f257/results.json')
continuity = load(artifact / 'evidence/architecture-explicit-refresh-continuity.json')
browser = load(artifact / 'evidence/architecture-browser.json')
final = load(artifact / 'evidence/architecture-final.json')
cleanup = load(artifact / 'evidence/cleanup.json')
api = [json.loads(line) for line in read(artifact / 'evidence/api.ndjson').decode().splitlines()]
read(artifact / 'evidence/architecture-final.png')
qa_revision = '526d814db45d15896f96563e7a2a8b8f75064f81'
sut_revision = 'e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb'
assert manifest['qaRevision'] == qa_revision and manifest['sutRevision'] == sut_revision
assert next(item for item in results['results'] if item['id'] == 'ARC-UI-015')['status'] == 'PASS'
assert next(item for item in old['results'] if item['id'] == 'ARC-UI-015')['status'] == 'BLOCKED'


def specs(suite):
    yield from suite.get('specs', [])
    for child in suite.get('suites', []):
        yield from specs(child)


spec = next(item for item in specs(playwright) if '[ARC-UI-015]' in item['title'])
assert spec['ok'] and len(spec['tests']) == 1
execution = spec['tests'][0]
assert execution['projectName'] == 'chromium' and len(execution['results']) == 1
execution = execution['results'][0]
assert execution['status'] == 'passed' and execution['retry'] == 0 and execution['errors'] == []

source_hashes = []
for path in ('tests/ui/architecture.spec.ts', 'tests/ui/page-continuity.ts', 'playwright.config.ts'):
    frozen = subprocess.check_output(['git', '-C', str(root), 'show', qa_revision + ':qa-acceptance/' + path])
    current = (root / path).read_bytes()
    assert frozen == current, 'Review source differs from frozen QA: ' + path
    source_hashes.append({'path': path, 'sha256': hashlib.sha256(frozen).hexdigest(), 'revision': qa_revision})

assert continuity['refreshPremise'] == {'count': 1, 'visible': True, 'enabled': True}
reads = continuity['reads']
assert [item['attempt'] for item in reads] == [1, 2, 3, 4, 5]
assert [item['phase'] for item in reads] == ['exhaustion'] * 4 + ['explicit-refresh']
responses = [item for item in browser['http'] if item['method'] == 'RESPONSE GET']
assert [item['status'] for item in responses] == [503, 503, 503, 503, 200]
assert len([item for item in browser['http'] if item['method'] == 'GET']) == 5
action = continuity['actionEvidence']
sequence_id = action['expectedSequenceId']
seed = [item for item in api if item['method'] == 'POST' and item['url'].endswith('/api/sequences') and item['phase'] == 'response']
assert len(seed) == 1 and seed[0]['status'] == 200
assert json.loads(seed[0]['responseBody'])['id'] == sequence_id
assert action['beforeAttempts'] == 4 and action['afterAttempts'] == 5
assert action['response']['status'] == 200
assert any(item['id'] == sequence_id for item in action['response']['body'])

outcome = continuity['continuityOutcome']
assert outcome['outcome'] == 'completed' and outcome['boundaryErrors'] == []
assert 'primary' not in outcome and 'confirmedBusinessFailure' not in outcome
assertions = outcome['assertions']
assert all(item['continuityAfter'] is True and 'error' not in item for item in assertions)
labels = [item['label'] for item in assertions]
stable_count = labels.count('stable-request-count')
assert labels == ['refresh-response', 'sequence-presented'] + ['stable-request-count'] * stable_count + ['post-response-scope-settled']
assert stable_count > 1
checks = continuity['continuityChecks']
# Frozen code records one capture, two boundaries per check, an extra document
# check inside the final settled assertion, then the final action boundary.
assert len(checks) == 1 + 2 * len(assertions) + 1 + 1
for check in checks:
    assert check['sameDocument'] is True
    for key in ('url', 'navigations', 'socketChanges', 'staleScopeReady', 'scopeEstablished'):
        assert check['before'][key] == check['after'][key]
assert checks[-1]['after']['staleScopeReady'] == 0
stable_first = checks[1 + 2 * 2]['at']
stable_last = checks[2 + 2 * (1 + stable_count)]['at']
assert stable_last - stable_first >= browser['profile']['observationMs'] == 3000

sync = continuity['responseScopeSync']
assert sync['requestAt'] == reads[-1]['at'] and sync['requireReady'] is True
before = action['before']
markers = continuity['scopeMarkers'][before['scopeMarkers']:]
acks = continuity['scopeReplies'][before['scopeReady']:]
baseline = continuity['scopeReplies'][before['scopeReady'] - 1]
assert len(markers) == len(acks) == 1
marker, ack = markers[0], acks[0]
assert sync['requestAt'] < sync['responseAt'] < marker['at'] < ack['at']
assert marker['socketId'] == ack['socketId'] == baseline['socketId'] == 1
assert marker['requestId'] == ack['requestId']
assert sum(item['requestId'] == marker['requestId'] for item in continuity['scopeMarkers']) == 1
assert ack['startSeq'] == baseline['startSeq'] == 1
assert browser['socketChanges'] == browser['authentications'] == 1
assert browser['pageErrors'] == final['visibleErrors'] == cleanup['failures'] == []
assert len(browser['events']) == 1 and browser['events'][0]['payload']['sequenceId'] == sequence_id
assert browser['events'][0]['at'] < min(item['at'] for item in reads)
assert final['url'] == before['url']
assert 'QA恢复目标' in final['visibleText'] and '{event_1}' in final['visibleText']

analysis = {
    'kind': 'independent-read-only-retest-evidence-review',
    'reviewConclusion': 'stored evidence supports ARC-UI-015 PASS in this frozen Chromium run',
    'qaRevision': qa_revision, 'sutRevision': sut_revision, 'phase': manifest['phase'],
    'runId': manifest['runId'], 'firstRunStatusUnchanged': 'BLOCKED',
    'execution': {key: execution[key] for key in ('status', 'retry', 'duration', 'startTime', 'errors')},
    'clockDomain': 'QA worker performance.now milliseconds; no subtraction with wallclock or another process',
    'sequenceId': sequence_id, 'seedRequestId': seed[0]['qaRequestId'],
    'refreshPremise': continuity['refreshPremise'], 'reads': reads, 'responses': responses,
    'responseScopeSync': sync, 'matchingPostResponseMarker': marker, 'matchingPostResponseReady': ack,
    'scopeResponseToMarkerMs': marker['at'] - sync['responseAt'], 'markerToReadyMs': ack['at'] - marker['at'],
    'continuity': {'checks': len(checks), 'allSameDocument': True, 'before': before, 'after': checks[-1]['after'],
                   'authentications': browser['authentications'], 'socketChanges': browser['socketChanges'],
                   'businessEvents': browser['events'], 'businessEventsAfterFirstRead': []},
    'assertions': {'labels': dict(Counter(labels)), 'allSucceededWithContinuity': True,
                   'stableRequestCountFirstBoundaryMs': stable_first, 'stableRequestCountLastBoundaryMs': stable_last,
                   'stableRequestCountObservedSpanMs': stable_last - stable_first,
                   'last503ToActionBaselineMs': checks[0]['at'] - responses[3]['at'],
                   'successResponseToLastBoundaryMs': checks[-1]['at'] - sync['responseAt']},
    'cleanup': cleanup,
    'limits': ['This is a Chromium developer-preflight case, not a full acceptance or release decision.',
               'Document identity is stable; no claim that all DOM nodes or internal controllers stayed identical.',
               'RequestId/socket/watermark prove the control handshake association, not hidden product scope internals.',
               'The 3000ms stable window is the versioned QA observation profile, not a new unbounded guarantee.',
               'Passed cases retain raw JSON/screenshots, not a trace.zip, under retain-on-failure configuration.',
               'Original first-run BLOCKED is retained separately; no original evidence or results were overwritten.'],
    'sourceHashes': source_hashes, 'inputHashes': list(inputs.values()),
}
for path, record in inputs.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
output.mkdir(parents=True, exist_ok=True)
with (output / 'analysis.json').open('x') as handle:
    json.dump(analysis, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
with (output / 'analysis-script.sha256').open('x') as handle:
    handle.write(hashlib.sha256(Path(__file__).read_bytes()).hexdigest() + '  analyze.py\n')
print(json.dumps({'reviewConclusion': analysis['reviewConclusion'], 'stableSpanMs': stable_last - stable_first,
                  'inputsVerified': len(inputs), 'output': str(output)}, ensure_ascii=False))
