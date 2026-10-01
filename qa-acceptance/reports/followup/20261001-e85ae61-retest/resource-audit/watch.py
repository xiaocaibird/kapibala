#!/usr/bin/env python3
"""Bounded read-only Docker evidence capture. Never mutates Docker or SUT."""
import datetime,json,pathlib,subprocess,selectors,time,hashlib
B=pathlib.Path(__file__).resolve().parent
now=datetime.datetime.now(datetime.timezone.utc);D=B/now.strftime('watch-%Y%m%dT%H%M%SZ');D.mkdir(exist_ok=False)
end=now+datetime.timedelta(minutes=15)
argv=['docker','--host','unix:///var/run/docker.sock','events','--since',now.isoformat(),'--until',end.isoformat(),'--filter','type=container','--filter','label=qa.owner','--format','{{json .}}']
(D/'observer.json').write_text(json.dumps({'startedAt':now.isoformat(),'deadline':end.isoformat(),'argv':argv,'scriptSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'noMutation':True,'noEnvRead':True,'stopFile':str(D/'STOP')},indent=2)+'\n')
proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1);sel=selectors.DefaultSelector();sel.register(proc.stdout,selectors.EVENT_READ);pending=[];counter=0
T='{"id":{{json .Id}},"name":{{json .Name}},"created":{{json .Created}},"owner":{{json (index .Config.Labels "qa.owner")}},"status":{{json .State.Status}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}}}'
def call(a):
 r=subprocess.run(a,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5);return {'argv':a,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def capture(cid,cause):
 global counter
 counter+=1;records=[];q=call(['docker','--host','unix:///var/run/docker.sock','inspect','--format',T,cid]);records.append(q)
 if q['exitCode']==0:
  m=json.loads(q['stdout']);pids=set()
  for ports in (m['ports'] or {}).values():
   for port in ports or []:
    v=call(['lsof','-nP','-iTCP:'+str(port['HostPort'])]);records.append(v)
    for line in v['stdout'].splitlines()[1:]:
     fs=line.split()
     if len(fs)>1 and fs[1].isdigit() and fs[0]=='node':pids.add(fs[1])
  seen=set()
  for _ in range(4):
   for pid in list(pids-seen):
    seen.add(pid);v=call(['ps','-p',pid,'-o','pid=,ppid=,pgid=,lstart=,command=']);records.append(v);f=v['stdout'].split()
    if len(f)>1 and f[1].isdigit() and f[1]!='1':pids.add(f[1])
 f=D/(str(counter).zfill(3)+'-'+cause+'-'+cid[:12]+'.json');f.write_text(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cause':cause,'container':cid,'attribution':'Unassigned until matched to exact suite CLI, run time and environment. qa.owner alone is insufficient.','records':records},ensure_ascii=False,indent=2)+'\n');print(f.name,flush=True)
try:
 with (D/'events.ndjson').open('a') as sink:
  while datetime.datetime.now(datetime.timezone.utc)<end and not (D/'STOP').exists():
   for key,_ in sel.select(timeout=.25):
    line=key.fileobj.readline()
    if not line:
     if proc.poll() is not None:break
     continue
    sink.write(line);sink.flush();e=json.loads(line);action=e.get('Action');cid=e.get('Actor',{}).get('ID')
    if action in ['create','start'] and cid:
     capture(cid,action)
     if action=='start':pending.extend([(time.monotonic()+2,cid,'start-plus-2s'),(time.monotonic()+5,cid,'start-plus-5s')])
   for item in list(pending):
    if time.monotonic()>=item[0]:pending.remove(item);capture(item[1],item[2])
   if proc.poll() is not None:break
finally:
 if proc.poll() is None:proc.terminate()
 try:proc.wait(timeout=3)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
 (D/'events.stderr').write_text(proc.stderr.read())
 files=[{'path':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(D.iterdir()) if f.is_file() and f.name!='index.json']
 (D/'index.json').write_text(json.dumps({'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'eventsExitCode':proc.returncode,'files':files,'onlyOwnedAuditReaderStopped':True},indent=2)+'\n')
 print('stopped '+str(D),flush=True)
