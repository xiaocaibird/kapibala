"""Offline independent review of immutable QA evidence. No product imports or requests."""
import collections
import datetime
import hashlib
import json
import pathlib
import urllib.parse

OUT = pathlib.Path(__file__).resolve().parent
QA = OUT.parents[3]
RUN = QA / 'reports/preflight/2026-10-01T12-46-08.250Z-9b50fc8a'
OLD = QA / 'reports/preflight/2026-10-01T12-26-30.110Z-c5165321'
E1 = next(RUN.glob('artifacts/system-integration-streams-344*/evidence'))
E2 = next(RUN.glob('artifacts/system-integration-streams-a792*/evidence'))
read_files = set()
checks = []

def read(p):
    read_files.add(p)
    return p.read_bytes()

def js(p):
    return json.loads(read(p))

def nd(p):
    return [(i, json.loads(line)) for i, line in enumerate(read(p).decode().splitlines(), 1)]

def ck(label, condition):
    assert condition, label
    checks.append(label)

def ident(m):
    return 'client:' + m['clientMsgId'] if m.get('clientMsgId') else 'message:' + m['msgId']

def responses(e):
    result = []
    for line, row in nd(e / 'api.ndjson'):
        if row['phase'] == 'response' and '/messages?' in row['url']:
            ck(f'{e.parent.name}: HTTP response line {line} succeeded', row['status'] == 200)
            result.append({'line': line, 'query': urllib.parse.parse_qs(urllib.parse.urlparse(row['url']).query),
                           'startedAt': row['startedAt'], 'body': json.loads(row['responseBody'])})
    return result

def chain(rows, start):
    selected = [rows[start]]
    while selected[-1]['body'].get('nextCursor'):
        current = selected[-1]['body']['nextCursor']
        nxt = rows[start + len(selected)]
        ck('Actual continuation uses exact previous nextCursor', nxt['query'].get('before') == [current])
        selected.append(nxt)
    return selected, [m for page in selected for m in page['body']['items']]

manifest = js(RUN / 'manifest.json')
results = js(RUN / 'results.json')
runner = js(RUN / 'runner-summary.json')
ck('Runner ended successfully without errors', runner['runnerStatus'] == 'passed' and not runner['runnerErrors'])
ck('No integrity errors/rejected attempts', not results['integrity'] and not results['preflight']['integrity'] and not results['preflight']['rejectedAttempts'])
ck('Exact QA/SUT binding', manifest['qaRevision'] == '526d814db45d15896f96563e7a2a8b8f75064f81' and manifest['sutRevision'] == 'e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb')
for case in ['INT-STREAM-001', 'INT-STREAM-002']:
    attempts = [x for x in results['attempts'] if x['id'] == case]
    ck(case + ' exactly one first attempt PASS', len(attempts) == 1 and attempts[0]['attempt'] == 0 and attempts[0]['status'] == 'PASS')

r = js(E1 / 'real-reader-receipts.json')
after = js(E1 / 'real-reader-after-cleanup.json')
gw = js(E1 / 'external-facts.json')['gateway']
expected = dict(r['expected'])
ck('8208 expected unique message identities', len(expected) == len(r['expected']) == 8208)
ck('Gateway independent ledger complete and unique', len(gw['messages']) == 8209 and len({m['msgId'] for m in gw['messages']}) == 8209)
ledger = {m['msgId']: m for m in gw['messages']}
ck('Every expected hash equals independent gateway actual text', all(hashlib.sha256(ledger[k]['text'].encode()).hexdigest() == h for k, h in expected.items()))
ck('No gateway background errors', not gw['backgroundErrors'])
stream_frames = {}
for name in ['slow', 'healthy', 'replay']:
    reader = r[name]
    ck(name + ' no protocol/transport/resource errors', not reader['errors'] and not reader['protocolErrors'] and not reader['resourceErrors'])
    ck(name + ' payload accounting exact', reader['totals']['messages'] == len(reader['frames']) and reader['totals']['payloadBytes'] == sum(x['payloadBytes'] for x in reader['frames']) and reader['totals']['largestPayloadBytes'] == max(x['payloadBytes'] for x in reader['frames']))
    frames = [x for x in reader['frames'] if x['type'] == 'message' and x['seq'] > r['checkpoint']]
    ck(name + ' all identities known, unique, external same group, increasing seq', len({x['msgId'] for x in frames}) == len(frames) and all(x['msgId'] in expected and x['isOwn'] is False and x['groupId'] == r['healthy']['frames'][1]['groupId'] for x in frames) and all(a['seq'] < b['seq'] for a, b in zip(frames, frames[1:])))
    stream_frames[name] = frames
project = lambda fs: [(x['seq'], x['msgId'], x['groupId'], x['isOwn']) for x in fs]
ck('Healthy exact complete ordered 8208 workload', len(stream_frames['healthy']) == 8208 and {x['msgId'] for x in stream_frames['healthy']} == set(expected))
ck('Slow actual received prefix + replay equals entire healthy ordered receipt stream', project(stream_frames['slow'] + stream_frames['replay']) == project(stream_frames['healthy']))
ck('Actual cursor determines exact replay gap', r['slow']['lastReceivedSeq'] == 3467 and stream_frames['replay'][0]['seq'] == 3468 and stream_frames['replay'][-1]['seq'] == 8221 and len(stream_frames['replay']) == 4754)
ck('Replay actual auth uses final received cursor', [x['detail'] for x in r['replay']['transport'] if x['kind'] == 'auth-sent'] == [{'sinceSeq': 3467}])
pause = next(x for x in r['slow']['transport'] if x['kind'] == 'pause')
resume = next(x for x in r['slow']['transport'] if x['kind'] == 'resume')
ck('Real pause retained checkpoint until explicit resume', pause['lastReceivedSeq'] == resume['lastReceivedSeq'] == 13 and pause['receivedFrames'] == resume['receivedFrames'] == 2 and not any(x['readerPaused'] for x in r['slow']['frames']))
ck('Actual slow close precedes cleanup, not local termination', r['slow']['closed']['source'] == 'transport-ended' and r['slow']['closed']['code'] == 1006 and all(x['kind'] != 'local-terminate' for x in r['slow']['transport']) and r['slow']['closed'] == after['slow']['closed'])
ck('Healthy and replay have no pre-cleanup close', 'closed' not in r['healthy'] and 'closed' not in r['replay'])
ck('Healthy/replay cleanup closures remain separately attributed', all(after[n]['closed']['source'] == 'local-termination' and after[n]['closed']['localTermination'] == 'cleanup' for n in ['healthy', 'replay']))
attr = r['connectionAttribution']
log_bytes = read(E1 / 'server.log')
ck('Captured log prefix actual bytes match recorded SHA256', hashlib.sha256(log_bytes[:attr['source']['bytes']]).hexdigest() == attr['source']['sha256'])
log_lines = log_bytes.decode().splitlines()
for entry in attr['entries']:
    ck('Attribution line ' + str(entry['line']) + ' matches original log', json.loads(log_lines[entry['line']-1]) == entry['value'])
values = [x['value'] for x in attr['entries']]
conn = r['slow']['connection']
ck('Exact reciprocal TCP tuple, single server connection and PID across lifecycle', len({x['connectionId'] for x in values}) == len({x['pid'] for x in values}) == 1 and all(x['peerAddress'] == conn['localAddress'] and x['peerPort'] == conn['localPort'] and x['localAddress'] == conn['remoteAddress'] and x['localPort'] == conn['remotePort'] for x in values))
ck('Actual configured/auth/close-requested/terminate-requested/closed chain', [x.get('kind', x['component']) for x in values] == ['configured', 'realtime-auth', 'close-requested', 'terminate-requested', 'closed'])
ck('Send-timeout causal chain with original 1006 retained', all(x['trigger'] == 'send-timeout' for x in values[2:]) and values[2]['code'] == values[3]['code'] == 1013 and values[4]['code'] == 1006 and attr['verified'] is True and r['peerFramePolicyVerified'] is False)
ck('No server warning/error in final case log', not any(json.loads(s).get('level', 0) >= 40 for s in log_lines if s.startswith('{')))
pages = responses(E1)
hist_pages, history = chain(pages, 0)
ck('One complete 165-page public history traversal', len(hist_pages) == len(pages) == 165 and len(history) == 8209 and all(p['query']['limit'] == ['50'] for p in pages))
ck('Public history exact unique gateway identity/text/sentAt ledger', len({m['msgId'] for m in history}) == len(history) and {m['msgId'] for m in history} == set(ledger) and all(m['text'] == ledger[m['msgId']]['text'] and m['sentAt'] == ledger[m['msgId']]['sentAt'] for m in history))

f = js(E2 / 'frozen-page-size-change.json')
initial = js(E2 / 'same-cursor-before-confirmation.json')
gw2 = js(E2 / 'external-facts.json')['gateway']
pages2 = responses(E2)
first_index = next(i for i, p in enumerate(pages2) if p['body'] == initial['first'] and p['query']['limit'] == ['7'])
ref_pages, ref = chain(pages2, first_index)
ck('Same actual initial cursor establishes accepted snapshot before mutations', len(ref) == 59 and ref == initial['initialSnapshot'] and ref[-1] == initial['acceptedOwn'] and ref[-1]['deliveryStatus'] == 'accepted' and ref[-1]['msgId'] is None)
start = next(i for i in range(first_index+len(ref_pages), len(pages2)) if pages2[i]['query'].get('before') == [initial['first']['nextCursor']])
continuation = pages2[start:]
current = initial['first']['nextCursor']
collected = list(initial['first']['items'])
for i, page in enumerate(continuation):
    ck('Variable continuation cursor/limit ' + str(i), page['query']['before'] == [current] and page['query']['limit'] == [str(f['pageSizes'][i % len(f['pageSizes'])])] and len(page['body']['items']) <= int(page['query']['limit'][0]))
    collected.extend(page['body']['items'])
    current = page['body'].get('nextCursor')
ck('Variable-size continuation terminates exact 59 original records and order', current is None and len(collected) == 59 and collected == f['frozen'] == ref and [ident(m) for m in collected] == f['expectedOrder'] and len({ident(m) for m in collected}) == 59)
refresh_page_index = next(i for i,p in enumerate(pages2) if p['body']['items'] and p['body']['items'][0].get('msgId') == 'new-during-frozen')
refresh_pages, refreshed = chain(pages2, refresh_page_index)
ck('Refresh public API exact 61 snapshot', refreshed == f['refreshed'] and len(refreshed) == 61 and len({ident(m) for m in refreshed}) == 61)
ck('Refresh incorporates new and backfill in required ordering, preserving all old identities', [ident(m) for m in refreshed] == ['message:new-during-frozen'] + f['expectedOrder'] + ['message:backfill-during-frozen'])
ck('Own send confirmed only in refresh; original accepted contents immutable', f['frozen'][-1] == initial['acceptedOwn'] and refreshed[-2]['deliveryStatus'] == 'sent' and refreshed[-2]['id'] == initial['acceptedOwn']['id'] and refreshed[-2]['clientMsgId'] == initial['acceptedOwn']['clientMsgId'] and refreshed[-2]['msgId'] == f['landed']['msgId'] and refreshed[-2]['sentAt'] == f['landed']['sentAt'])
ledger2 = {m['msgId']: m for m in gw2['messages']}
ck('Refresh 61 exact independent gateway text/time ledger', len(ledger2) == 61 and {m['msgId'] for m in refreshed} == set(ledger2) and all(m['text'] == ledger2[m['msgId']]['text'] and m['sentAt'] == ledger2[m['msgId']]['sentAt'] for m in refreshed))
ck('Frozen 58 baseline texts/times intact', all((a['text'],a['sentAt']) == (b['text'],b['sentAt']) for a,b in zip(ref[:-1], reversed(f['baseline']))))
effects = [e for e in gw2['effects'] if e['kind'] == 'send']
mutations = [e for e in gw2['events'] if e['type'] == 'message_sent' or e['data'].get('msgId') in ['new-during-frozen','backfill-during-frozen']]
ck('One actual send side effect, three real confirmation/new/backfill events', len(effects) == 1 and effects[0]['clientMsgId'] == initial['acceptedOwn']['clientMsgId'] and len(mutations) == 3)
ck('Three changes occurred after original snapshot and before changed-size continuation', ref_pages[-1]['startedAt'] < min(x['recordedAt'] for x in mutations) and max(x['recordedAt'] for x in mutations) < continuation[0]['startedAt'])
for e in [E1,E2]:
    ck(e.parent.name + ' owned cleanup reported no failures', not js(e/'cleanup.json')['failures'])
old_results = js(OLD/'results.json')
old_manifest = js(OLD/'manifest.json')
old_case = next(x for x in old_results['preflight']['results'] if x['id'] == 'INT-STREAM-001')
ck('Original first execution still BLOCKED', old_case['status'] == 'BLOCKED')
old_receipts = js(next(OLD.glob('artifacts/system-integration-streams-344*/evidence/real-reader-receipts.json')))
ck('Original observed incomplete collection retained', len(old_receipts['expected']) == 2848 and len([x for x in old_receipts['healthy']['frames'] if x['type'] == 'message' and x['seq'] > old_receipts['checkpoint']]) == 1209)
prior_triage = js(OUT.parent/'stream-postmortem/triage.json')
for name, sha in prior_triage['rawEvidenceSha256'].items():
    ck('Original raw bytes unchanged from prior triage: ' + name, hashlib.sha256(read(QA/name)).hexdigest() == sha)
profile_hash = lambda m: next(x['sha256'] for x in m['qaTree']['files'] if x['path'] == 'config/slow-reader-profile.ts')
ck('Slow-reader profile/budgets byte-identical across first and correction runs', profile_hash(manifest) == profile_hash(old_manifest))
summary = {
 'reviewer':'Independent AI QA, offline evidence recalculation; no product actions',
 'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'runId':manifest['runId'],'phase':manifest['phase'],
 'qaRevision':manifest['qaRevision'],'qaSourceSha256':manifest['qaTree']['sha256'],
 'sutRevision':manifest['sutRevision'],'targetSha256':manifest['targetSha256'],
 'suiteId':manifest['suite']['id'],'suiteSha256':manifest['suiteSha256'],
 'reviewConclusion':'The raw evidence supports both selected stream PASS results; no full-business/release conclusion.',
 'stream001':{'workloadMessages':8208,'gatewayMessagesIncludingCheckpoint':8209,'healthyWorkloadFrames':len(stream_frames['healthy']),'slowWorkloadFrames':len(stream_frames['slow']),'checkpoint':13,'actualReplayCursor':3467,'replayWorkloadFrames':len(stream_frames['replay']),'finalSeq':8221,'frameAccounting':{n:r[n]['totals'] for n in stream_frames},'payloadBytesMeaning':'Application WebSocket payload only, not TCP/wire bytes','slowConnection':conn,'causalLogEntries':attr['entries'],'causalLogSource':attr['source'],'actualClientClose':r['slow']['closed'],'historyPages':len(hist_pages),'historyMessages':len(history),'phases':r['phases']},
 'stream002':{'baselineMessages':58,'initialAndFrozenMessages':59,'refreshedMessages':61,'sameCursorReferencePageLines':[p['line'] for p in ref_pages],'changedPageLimits':[int(p['query']['limit'][0]) for p in continuation],'changedPageResultSizes':[len(p['body']['items']) for p in continuation],'changedPageLines':[p['line'] for p in continuation],'refreshPageLines':[p['line'] for p in refresh_pages],'originalOwnRecord':initial['acceptedOwn'],'refreshedOwnRecord':refreshed[-2],'gatewayEffects':effects,'interleavedEvents':mutations,'queryRequestsBeforeSnapshot':len(initial['queryRequests'])},
 'originalFirstExecution':{'runId':old_manifest['runId'],'qaRevision':old_manifest['qaRevision'],'status':old_case['status'],'reason':old_case['reason'],'slowReaderProfileSha256':profile_hash(manifest),'unchanged':True},
 'checksPassed':len(checks),'checks':checks,
 'boundaries':['Only INT-STREAM-001/002 evidence reviewed; ARC-UI-015 is outside this review.','Registered developer-preflight subset, independently reviewed by QA; not a full business or release run.','Observed cause is send-timeout, not buffer high-water. Raw 1006 alone is not proof; no valid peer close frame was claimed.','Timing/resource limits are frozen QA bounds, not throughput/recovery SLA or a universal guarantee.','Cleanup JSON is a runner observation; independent Docker resource audit belongs to root/member_scope.','Original first BLOCKED and raw logs are unchanged; later PASS does not erase them.']}
summary['evidenceHashes']=[{'path':str(p.relative_to(QA)),'bytes':len(p.read_bytes()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(read_files)]
(OUT/'review.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'checksPassed':len(checks),'stream001':{'healthy':8208,'slow':len(stream_frames['slow']),'replay':len(stream_frames['replay']),'historyPages':len(hist_pages)},'stream002':{'frozen':59,'refresh':61,'limits':summary['stream002']['changedPageLimits']},'evidenceFiles':len(read_files)},ensure_ascii=False))
