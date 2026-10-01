from pathlib import Path
import os, json, subprocess, signal, datetime
root=Path.cwd();report=root/'reports/followup/20261002-first-round-observation-retest'
prior=list((report/'resource-audit').glob('snapshot-*.json'))
results=[]
for p in [report/'controllers/controller-39aa1fc2-7202-48a8-b188-25c4309712be/ready.json']:
 v=json.loads(p.read_text());pid=v['runnerPid']
 raw=subprocess.run(['ps','-p',str(pid),'-o','pid=,ppid=,pgid=,uid=,lstart=,comm='],capture_output=True,text=True)
 args=subprocess.run(['ps','-p',str(pid),'-o','args='],capture_output=True,text=True)
 match=False
 for s in prior:
  old=json.loads(s.read_text())
  for probe in old.get('processes',[]):
   if probe.get('argv')==['ps','-p',str(pid),'-o','pid=,ppid=,pgid=,uid=,lstart=,comm='] and probe.get('exitCode')==0 and probe.get('stdout','').strip()==raw.stdout.strip():match=True
 marker=Path(v['registryDirectory'])/'.qa-lifecycle-owner.json'
 owner=json.loads(marker.read_text())
 kind='capacity' if 'capacity' in v['component'] else 'runtime'
 identity=(raw.returncode==0 and args.returncode==0 and match and raw.stdout.split()[3]==str(os.getuid()) and f'owned-{kind}-controller.ts' in args.stdout and '--revision '+v['revision'] in args.stdout and '--sut '+v['sut'] in args.stdout and owner.get('runnerPid')==pid and owner.get('sut')==v['sut'] and owner.get('revision')==v['revision'] and owner.get('qaRoot')==str(root))
 item={'readyFile':str(p.relative_to(root)),'runnerPid':pid,'ps':raw.stdout,'args':args.stdout,'sameHistoricalProcessIdentity':match,'ownershipValidated':identity,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 results.append(item)
 if not identity:raise RuntimeError('Controller ownership validation failed; no signal')
 os.kill(pid,signal.SIGTERM);item['signal']='SIGTERM'
(report/'controllers'/'stop-correction-request.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'signalledOwnedWrappers':[r['runnerPid'] for r in results]}))
