"""Read saved ARC-UI-015 evidence only; never connect to a browser or product.

Default output is this new postmortem directory. Reruns need a fresh output
directory argument; exclusive writes preserve the first analysis and raw run.
"""
from pathlib import Path
import hashlib
import io
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[4]
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
run = root / 'reports/preflight/2026-10-01T12-31-30.250Z-1384f257'
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
continuity = load(artifact / 'evidence/architecture-explicit-refresh-continuity.json')
browser = load(artifact / 'evidence/architecture-browser.json')
final = load(artifact / 'evidence/architecture-final.json')
read(artifact / 'evidence/architecture-final.png')
result = next(item for item in results['results'] if item['id'] == 'ARC-UI-015')
assert result['status'] == 'BLOCKED'
assert manifest['qaRevision'] == '105ed289e0fbed6306025cd3dc1889730b17a423'
assert manifest['sutRevision'] == 'e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb'

frames = []
network = []
with zipfile.ZipFile(io.BytesIO(read(artifact / 'trace.zip'))) as trace:
    for line_number, raw in enumerate(trace.read('1-trace.trace').decode().splitlines(), 1):
        entry = json.loads(raw)
        if entry.get('type') != 'before' or entry.get('class') != 'WebSocketRoute' or entry.get('method') not in ('sendToServer', 'sendToPage'):
            continue
        message = json.loads(entry['params']['message'])
        # Do not copy auth credentials from raw trace into this derived report.
        if message.get('type') not in ('scope_marker', 'scope_ready'):
            continue
        frames.append({'traceLine': line_number, 'at': entry['startTime'], 'direction': entry['method'], 'frame': message})
    for line_number, raw in enumerate(trace.read('1-trace.network').decode().splitlines(), 1):
        entry = json.loads(raw)['snapshot']
        network.append({'traceLine': line_number, 'resourceType': entry['_resourceType'],
                        'url': entry['request']['url'], 'method': entry['request']['method'],
                        'status': entry['response']['status'], 'at': entry['_monotonicTime'],
                        'durationMs': entry['time']})

success = [item for item in network if item['url'].endswith('/api/sequences') and item['status'] == 200]
assert len(success) == 1
request = success[0]
marker, ready = frames[-2:]
assert marker['frame']['type'] == 'scope_marker'
assert ready['frame']['type'] == 'scope_ready'
assert marker['frame']['requestId'] == ready['frame']['requestId']
assert request['at'] + request['durationMs'] < marker['at'] < ready['at']
assert ready['frame']['startSeq'] == frames[-3]['frame']['startSeq'] == 1
checks = continuity['continuityChecks']
for check in checks:
    assert check['sameDocument'] is True
    for key in ('url', 'navigations', 'socketChanges', 'scopeEstablished'):
        assert check['before'][key] == check['after'][key]
assert checks[-1]['before']['scopeReady'] == 2 and checks[-1]['after']['scopeReady'] == 3
assert browser['authentications'] == browser['socketChanges'] == 1
assert len([item for item in network if item['resourceType'] == 'document']) == 1
assert len([item for item in network if item['resourceType'] == 'websocket']) == 1
assert len(continuity['reads']) == 5
assert continuity['actionEvidence']['response']['status'] == 200
assert continuity['actionEvidence']['expectedSequenceId'] == continuity['actionEvidence']['response']['body'][0]['id']
assert all(event['at'] < continuity['reads'][-1]['at'] for event in browser['events'])

analysis = {
    'kind': 'postmortem-read-only-stored-evidence',
    'originalStatusUnchanged': result['status'],
    'qaRevision': manifest['qaRevision'], 'sutRevision': manifest['sutRevision'],
    'classification': 'QA continuity premise conflated a post-success control handshake with a cause of recovery',
    'traceClock': {'domain': 'Playwright trace monotonic milliseconds; not subtracted from worker timestamps',
                   'successfulRead': request, 'estimatedReadCompleteAt': request['at'] + request['durationMs'],
                   'marker': marker, 'ready': ready, 'allScopeFrames': frames},
    'workerClock': {'domain': 'QA worker performance.now; within artifact only',
                    'explicitGetAt': continuity['reads'][-1]['at'],
                    'responseObservedAt': next(item['at'] for item in browser['http'] if item.get('status') == 200),
                    'scopeReadyObservedAt': continuity['continuity'][-1]['at']},
    'publicContinuity': {'checks': checks, 'authentications': browser['authentications'],
                         'socketChanges': browser['socketChanges'], 'documentNetworkRequests': 1,
                         'scopeReadyCountBefore': 2, 'scopeReadyCountAfter': 3,
                         'businessEventsAfterExplicitGet': []},
    'partialObservedBehavior': {'reads': continuity['reads'], 'response': continuity['actionEvidence']['response'],
                                'expectedSequenceId': continuity['actionEvidence']['expectedSequenceId'],
                                'finalUrl': final['url'], 'finalTitle': final['title'], 'visibleErrors': final['visibleErrors']},
    'notExecutedInOriginalCase': ['sequence-presented assertion', 'post-success 3000ms stable-request-count window'],
    'limits': ['No observation of product-internal controller identity is claimed.',
               'Scope frames bind requestId and watermark, not the selected business resource ID.',
               'Final screenshot/text corroborate display but do not retroactively execute the stopped assertions.',
               'Original BLOCKED and all raw evidence remain unchanged; corrected source needs a new frozen run.'],
    'inputHashes': list(inputs.values()),
}
for path, record in inputs.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
out.mkdir(parents=True, exist_ok=True)
with (out / 'analysis.json').open('x') as handle:
    json.dump(analysis, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
with (out / 'analysis-script.sha256').open('x') as handle:
    handle.write(hashlib.sha256(Path(__file__).read_bytes()).hexdigest() + '  analyze.py\n')
print(json.dumps({'written': str(out), 'originalStatusUnchanged': result['status'], 'inputsVerified': len(inputs)}, ensure_ascii=False))
