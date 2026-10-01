#!/usr/bin/env python3
"""Read-only Docker snapshots, scoped evidence only; never stops/deletes resources."""
import datetime, hashlib, json, pathlib, subprocess
QA = pathlib.Path(__file__).resolve().parents[4]
BASE = pathlib.Path(__file__).resolve().parent
SINCE = '2026-10-01T12:21:58Z'
now = datetime.datetime.now(datetime.timezone.utc)
UNTIL = now.replace(microsecond=0).isoformat().replace('+00:00','Z')
OUT = BASE / now.strftime('capture-%Y%m%dT%H%M%S.%fZ')
OUT.mkdir(exist_ok=False)
PREFIX = ['docker', '--host', 'unix:///var/run/docker.sock']
def call(name, args):
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    r=subprocess.run(PREFIX+args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=25)
    for suffix,text in [('stdout',r.stdout),('stderr',r.stderr)]:
        (OUT/(name+'.'+suffix)).write_text(text)
    item={'command':PREFIX+args,'startedAt':start,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':r.returncode}
    (OUT/(name+'.command.json')).write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n')
    return r
info=call('daemon-time',['info','--format','{{json .SystemTime}}'])
events=call('events',['events','--since',SINCE,'--until',UNTIL,'--filter','type=container','--filter','label=qa.owner','--format','{{json .}}'])
listing=call('containers',['ps','--all','--no-trunc','--filter','label=qa.owner','--format','{{json .}}'])
records=[]
if listing.returncode==0:
    for line in listing.stdout.splitlines():
        row=json.loads(line); cid=row['ID']
        # Explicit template excludes Config.Env and all credential values.
        template='{"id":{{json .Id}},"name":{{json .Name}},"created":{{json .Created}},"owner":{{json (index .Config.Labels "qa.owner")}},"state":{"status":{{json .State.Status}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"startedAt":{{json .State.StartedAt}},"finishedAt":{{json .State.FinishedAt}}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}}}'
        item=call('inspect-'+cid[:12],['inspect','--format',template,cid])
        if item.returncode==0: records.append(json.loads(item.stdout))
observed=[]
for manifest in sorted((QA/'reports/preflight').glob('*/manifest.json')):
    m=json.loads(manifest.read_text())
    if m.get('sutRevision')!='e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb' or datetime.datetime.fromisoformat(m.get('startedAt','1970-01-01T00:00:00Z').replace('Z','+00:00')) < datetime.datetime.fromisoformat(SINCE.replace('Z','+00:00')): continue
    envs=[]
    for f in sorted((manifest.parent/'artifacts').glob('*/evidence/environment.json')):
        e=json.loads(f.read_text())
        envs.append({'path':str(f.relative_to(QA)), 'database':e.get('database'),'apiPort':e.get('apiPort'),'startedAt':e.get('startedAt'),'gateway':e.get('gateway'),'agent':e.get('agent'),'revision':e.get('revision')})
    observed.append({'runId':m['runId'],'suiteId':m.get('suite',{}).get('id'),'startedAt':m['startedAt'],'runnerFinished':(manifest.parent/'runner-summary.json').exists(),'environments':envs})
summary={'capturedAt':now.isoformat(),'captureScriptSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'eventWindow':{'since':SINCE,'until':UNTIL},'qaRoot':str(QA),'purpose':'Read-only resource evidence, no cleanup','observedRuns':observed,'currentQaLabelContainers':records,'attributionBoundary':'qa.owner label alone is not this-batch ownership proof. Candidate owner/container/ports/time must be matched to runner-owned evidence; concurrent other tasks remain unassigned. Deleted containers have no recoverable Mounts here; no anonymous-volume mapping invented.','dockerEventCount':len(events.stdout.splitlines()) if events.returncode==0 else None}
(OUT/'snapshot.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
files=[]
for f in sorted(OUT.iterdir()):
    if f.is_file(): files.append({'path':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(OUT/'index.json').write_text(json.dumps({'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'directory':str(OUT),'eventCount':summary['dockerEventCount'],'currentContainerCount':len(records),'runCount':len(observed),'until':UNTIL}))
