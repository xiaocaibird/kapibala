import json,pathlib,zipfile,hashlib,collections,datetime
root=pathlib.Path(__file__).resolve().parents[4]
run=root/'reports/preflight/2026-10-01T14-15-16.243Z-aa9bdaa2'
art=next((run/'artifacts').glob('*UI-017*'));out=pathlib.Path(__file__).parent
z=zipfile.ZipFile(art/'trace.zip')
trace=[json.loads(l) for l in z.read('1-trace.trace').decode().splitlines()]
after={x['callId']:x for x in trace if x['type']=='after'}
frames=[];actions=[]
for x in trace:
 if x.get('method')=='sendToPage':
  f=json.loads(x['params']['message']);frames.append({'callId':x['callId'],'startTime':x['startTime'],'forwardedAt':after.get(x['callId'],{}).get('endTime'),'type':f.get('type'),'seq':f.get('seq'),'startSeq':f.get('startSeq')})
 if x.get('method') in ['goto','click','expect']:
  actions.append({'callId':x['callId'],'method':x['method'],'startTime':x['startTime'],'endTime':after.get(x['callId'],{}).get('endTime'),'selector':x['params'].get('selector'),'expression':x['params'].get('expression'),'expectedNumber':x['params'].get('expectedNumber'),'url':x['params'].get('url')})
reads=[]
for l in z.read('1-trace.network').decode().splitlines():
 s=json.loads(l)['snapshot']
 if '/api/group-directory' not in s['request']['url']:continue
 f=s['response']['content']['_file'];body=json.loads(z.read(f));reads.append({'startedDateTime':s['startedDateTime'],'startTime':s['_monotonicTime'],'endTime':s['_monotonicTime']+s['time'],'status':s['response']['status'],'url':s['request']['url'],'bodyTracePath':f,'itemIds':[r['id']for r in body['items']],'itemNames':[r['name']for r in body['items']],'nextCursor':body['nextCursor']})
api=[json.loads(l) for l in (art/'evidence/api.ndjson').read_text().splitlines()]
m=json.loads((run/'manifest.json').read_text())
sourcePaths=[run/'manifest.json',art/'trace.zip',art/'error-context.md',art/'evidence/api.ndjson',art/'evidence/server.log',art/'evidence/ui-final.json']
facts={'runId':run.name,'caseId':'UI-017','rawStatus':'FAIL','phase':m['phase'],'sutRevision':m['sutRevision'],'qaRevision':m['qaRevision'],'qaTreeSha256':m['qaTree']['sha256'],'targetSha256':m['targetSha256'],'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reads':reads,'actions':actions,'forwardedWsFrames':frames,'frameCounts':dict(collections.Counter(f['type']for f in frames)),'checks':{'cursorResponse200Has3':reads[1]['status']==200 and len(reads[1]['itemIds'])==3,'firstAndCursorUnique23':len(set(reads[0]['itemIds']+reads[1]['itemIds']))==23,'laterHomepageBodiesSameFirstIds':all(r['itemIds']==reads[0]['itemIds']for r in reads[2:]),'replayedExactSeq1to167':[f['seq']for f in frames if f['seq'] is not None]==list(range(1,168)),'targetRenameNeverSent':not any('变化名称'in str(r.get('requestBody')) for r in api),'allDirectoryReads200':all(r['status']==200 for r in reads)},'evidence':[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}for p in sourcePaths],'classification':'QA_PREMISE_NOT_ESTABLISHED_FOR_TARGETED_INVALIDATION_AND_FAILURE_SCENARIO','productConclusion':'NOT_ESTABLISHED_BY_THIS_FAILURE; initial-sync pagination interaction remains a separate unadjudicated behavior, not silently exonerated','firstFailUnchanged':True,'productExecutionByReview':False}
assert all(facts['checks'].values())
(out/'ui017-trace-facts.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:facts[k] for k in ['qaRevision','qaTreeSha256','sutRevision','checks']},ensure_ascii=False))
