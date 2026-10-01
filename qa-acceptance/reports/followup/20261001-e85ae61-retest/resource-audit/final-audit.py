#!/usr/bin/env python3
"""Read-only final evidence/resource verification. Writes only this audit directory."""
import json,pathlib,hashlib,subprocess,datetime,collections,urllib.parse,io,tarfile
BASE=pathlib.Path(__file__).resolve().parent
QA=BASE.parents[3]
REPO=QA.parent
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
sha=lambda b:hashlib.sha256(b).hexdigest()
def j(p):return json.loads(p.read_text())
def call(args):
 t=now();r=subprocess.run(args,cwd=REPO,capture_output=True,text=True,timeout=25)
 return dict(argv=args,at=t,exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr)
D=['docker','--host','unix:///var/run/docker.sock']
runids=['2026-10-01T12-21-58.171Z-627cb313','2026-10-01T12-23-10.195Z-e84c34eb','2026-10-01T12-26-30.110Z-c5165321','2026-10-01T12-31-30.250Z-1384f257','2026-10-01T12-32-51.059Z-057b2c09','2026-10-01T12-34-40.057Z-b8ab8bd7','2026-10-01T12-46-08.250Z-9b50fc8a']
resources={
'4ad1f895d25ce9fe62a7a70de901441fa3d6cb2462701e8183b840427bcf8dc2':dict(run=runids[2],volume='c77ee5045a58d324b674a500ac43cd585aa98cccd9417bd347a6434e66fd4779',port=50944,evidence='stream-port-binding-20261001T122805.json'),
'b13bda83311d4eec935d44fc59ddc4dda05ffef411c4e8bccd97f8970e922c20':dict(run=runids[5],volume='9e85ab9fefb3724ea7c90e517c32446e88e1e23ab4d1700b71220d3ac98236e8',port=53747,evidence='watch-20261001T123406Z/003-start-plus-2s-b13bda83311d.json'),
'27720b9ddf038421e559e64da381dac50bb248ea9e37d670db9e7ceff73ec88f':dict(run=runids[5],volume='4a0ab3a00f51115df63b15e63f4301a7850dfcc664ae0f0047d8e3f66072c647',port=54027,evidence='watch-20261001T123406Z/007-start-plus-2s-27720b9ddf03.json'),
'266e710af88a1188e949e8e84d30a3eb37f49fc0c96e4add5f15f4e71c9014fd':dict(run=runids[6],volume='2cd68f18dd550f9cdceea601150580223ba7d19e037d3beb25d0c644750ccccb',port=56467,evidence='watch-20261001T123406Z/011-start-plus-2s-266e710af88a.json'),
'78fb4b7250273c5102d23ed0e2dbf601d5115a93207665fcc4b6a48ac78d52ed':dict(run=runids[6],volume='a334b6ccd4c83825c8a18f20e684b4b53523685c2ae147fd96c4d9add4b44870',port=56766,evidence='watch-20261001T123406Z/015-start-plus-2s-78fb4b725027.json')}
ports={x['port'] for x in resources.values()};records=[];all_events=[];gitTrees={};inventories=[]
for rid in runids:
 r=QA/'reports/preflight'/rid;m=j(r/'manifest.json');res=j(r/'results.json');ev=j(r/'events.json');runner=j(r/'runner-summary.json');tree=m['qaTree'];aft=res['metadata']['qaTreeAfter'];rev=m['qaRevision']
 if rev not in gitTrees:
  raw=subprocess.run(['git','archive',rev,'qa-acceptance'],cwd=REPO,capture_output=True,check=True).stdout
  with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
   gitTrees[rev]={x.name.removeprefix('qa-acceptance/'):sha(tar.extractfile(x).read()) for x in tar if x.isfile()}
 sourceMismatch=[f['path'] for f in tree['files'] if f['path'] in gitTrees[rev] and f.get('sha256')!=gitTrees[rev][f['path']]]
 localSource=[dict(path=f['path'],sha256=f.get('sha256'),currentFileSha256=sha((QA/f['path']).read_bytes()) if (QA/f['path']).is_file() else None,gitIgnore=call(['git','check-ignore','-v','qa-acceptance/'+f['path']])) for f in tree['files'] if f['path'] not in gitTrees[rev]]
 treeHash=sha(json.dumps(tree['files'],ensure_ascii=False,separators=(',',':')).encode())
 envs=[]
 for p in r.glob('artifacts/*/evidence/environment.json'):
  e=j(p);cleanup=j(p.parent/'cleanup.json');ports.add(e['apiPort'])
  for key in ['gateway','agent']:
   if e.get(key):ports.add(urllib.parse.urlparse(e[key]).port)
  envs.append(dict(evidence=str(p.relative_to(QA)),database=e['database'],apiPort=e['apiPort'],revision=e['revision'],cleanup=cleanup))
 # Browser frontend URLs, source evidence only. Do not connect.
 for p in r.glob('artifacts/*/evidence/*browser*.json'):
  try:d=j(p)
  except:continue
  def visit(o):
   if isinstance(o,dict):
    for k,v in o.items():
     if k.lower() in ['url','weburl','baseurl'] and isinstance(v,str) and v.startswith('http://127.0.0.1:'):
      po=urllib.parse.urlparse(v).port
      if po:ports.add(po)
     visit(v)
   elif isinstance(o,list):
    for v in o:visit(v)
  visit(d)
 inv=[];symlinks=[]
 for p in sorted(r.rglob('*')):
  if p.is_symlink():symlinks.append(str(p.relative_to(r)))
  elif p.is_file():inv.append(dict(path=str(p.relative_to(r)),bytes=p.stat().st_size,sha256=sha(p.read_bytes())))
 inventories.append(dict(runId=rid,files=inv,symlinks=symlinks))
 records.append(dict(runId=rid,phase=m['phase'],suite=m['suite']['id'],qaRevision=rev,sutRevision=m['sutRevision'],targetSha256=m['targetSha256'],startedAt=m['startedAt'],runner=runner,eventCount=len(ev),counts=dict(collections.Counter(x['status'] for x in ev)),allAttemptZero=all(x['attempt']==0 for x in ev),eventsMatchResultAttempts=ev==res['attempts'],integrity=res['integrity'],before=tree['sha256'],after=aft['sha256'],sourceListsEqual=tree==aft,independentDigest=treeHash,digestMatches=treeHash==tree['sha256'],sourceFileCount=len(tree['files']),sourceComparedToFixedGit=True,sourceGitMismatches=sourceMismatch,environments=envs,runFileCount=len(inv),symlinks=symlinks))
 records[-1]['localFilesOutsideGit']=localSource
 all_events += [dict(x,runId=rid) for x in ev]
checks=[]
for cid,d in resources.items():
 c=call(D+['inspect','--type','container','--format','{{json .Id}}',cid]);v=call(D+['volume','inspect','--format','{{json .Name}}',d['volume']]);checks.append(dict(container=cid,**d,containerCheck=c,volumeCheck=v,containerAbsent=c['exitCode']==1 and 'no such' in c['stderr'].lower(),volumeAbsent=v['exitCode']==1 and 'no such' in v['stderr'].lower(),sourceEvidenceSha256=sha((BASE/d['evidence']).read_bytes())))
controls=[]
for p in sorted(BASE.parent.glob('controller-*')):
 rd=j(p/'ready.json');life=[json.loads(x) for x in (p/'lifecycle.ndjson').read_text().splitlines()];log=[json.loads(x) for x in (p/'controller.log').read_text().splitlines()];pids=sorted({rd['runnerPid'],rd['guardianPid'],*[x['pid'] for x in log if 'pid' in x]});ports.add(rd['port']);registry=pathlib.Path(rd['registryDirectory'])
 controls.append(dict(path=str(p.relative_to(QA)),ready=rd,lifecycle=life,lifecycleSha256=sha((p/'lifecycle.ndjson').read_bytes()),registryPresent=registry.exists() or registry.is_symlink(),processCheck=call(['ps','-p',','.join(map(str,pids)),'-o','pid=,ppid=,pgid=,lstart=,command='])))
ports.discard(None)
portCheck=call(['lsof','-nP',*[f'-iTCP:{p}' for p in sorted(ports)],'-sTCP:LISTEN'])
watch=BASE/'watch-20261001T123406Z';wi=j(watch/'index.json');wm=[]
for f in wi['files']:
 p=watch/f['path']
 if p.is_symlink() or not p.is_file() or sha(p.read_bytes())!=f['sha256'] or p.stat().st_size!=f['bytes']:wm.append(f['path'])
watchProc=call(['pgrep','-fl',str(BASE/'watch.py')])
latest={}
for e in all_events:latest[(e['id'],e['project'])]=e
summary=dict(recordedAt=now(),noProductConnections=True,noResourceMutations=True,auditorScriptSha256=sha(pathlib.Path(__file__).read_bytes()),runs=records,firstRound=dict(executions=29,counts=dict(collections.Counter(x['status'] for x in all_events[:29]))),executionHistory=dict(count=len(all_events),counts=dict(collections.Counter(x['status'] for x in all_events))),latestUnique=dict(count=len(latest),counts=dict(collections.Counter(x['status'] for x in latest.values()))),exactResources=checks,controllers=controls,knownPorts=sorted(ports),knownPortCheck=portCheck,watcher=dict(index=wi,indexSha256=sha((watch/'index.json').read_bytes()),digestMismatches=wm,processCheck=watchProc),limitations=['All seven are developer-preflight follow-ups, not a new complete business acceptance. C1/C2 and new candidate intake are excluded.','Exact anonymous-volume absence is proved only for five containers observed alive with Mounts and exact run binding. Earlier smoke/backend/UI deleted containers lack captured Mounts; no full per-volume proof is claimed.','Port/process checks are point-in-time and process IDs can be reused; preserved controller stop lifecycle and registry identities are primary ownership evidence.','Per-case completedAt is runner start plus duration and can exclude worker fixture setup; raw timestamps and runner completion provide the enclosing timeline.','Historical Docker events may not be available; empty final query is not alone historical resource proof.'])
(BASE/'final-resource-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(BASE/'run-file-inventories.json').write_text(json.dumps(dict(recordedAt=now(),runs=inventories),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(path=str(BASE/'final-resource-audit.json'),runs=len(records),history=summary['executionHistory'],latestUnique=summary['latestUnique'],allSourceFixed=all(not x['sourceGitMismatches'] and x['sourceListsEqual'] and x['digestMatches'] for x in records),containerAbsent=sum(x['containerAbsent'] for x in checks),volumeAbsent=sum(x['volumeAbsent'] for x in checks),portCount=len(ports),portExit=portCheck['exitCode'],portsOutput=portCheck['stdout'],controllerProcesses=[x['processCheck'] for x in controls],registryPresent=[x['registryPresent'] for x in controls],watcherMismatches=wm,watcherProcess=watchProc),ensure_ascii=False))
