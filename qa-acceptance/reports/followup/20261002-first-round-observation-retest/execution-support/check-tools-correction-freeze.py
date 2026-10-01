from pathlib import Path
import subprocess, datetime, json, hashlib, os, sys
root=Path.cwd()
folder=root/'reports/followup/20261002-first-round-observation-retest/tooling/correction-execution-freeze'
folder.mkdir(parents=True,exist_ok=True)
checks=[]
env=dict(os.environ)
for k in list(env):
 if k.startswith('QA_'): env.pop(k)
for name in ['typecheck','test:self','check:catalog','check:impact','check:suites']:
 path=folder/(name.replace(':','-')+'.log')
 started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with path.open('x') as output:
  result=subprocess.run(['npm','run',name],stdout=output,stderr=subprocess.STDOUT,env=env)
 raw=path.read_bytes()
 check={'name':name,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'file':path.name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'sutConnected':False}
 checks.append(check)
 (folder/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 print(json.dumps(check),flush=True)
 if result.returncode: sys.exit(result.returncode)
