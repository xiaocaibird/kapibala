from pathlib import Path
import sys,subprocess,datetime,json,os
root=Path.cwd();suite,target,authority=sys.argv[1:4]
folder=root/'reports/followup/20261002-kick-work-retest/executor-logs';folder.mkdir(parents=True,exist_ok=True)
name=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+suite
command=['node','--import','tsx','harness/cli.ts','preflight','--suite',suite,'--target',target,'--authorization',authority]
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (folder/(name+'.log')).open('x') as output:
 child=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
 start={'command':command,'startedAt':started,'executorPid':os.getpid(),'qaCliPid':child.pid}
 (folder/(name+'-start.json')).write_text(json.dumps(start,indent=2)+'\n')
 print(json.dumps(start),flush=True)
 for line in child.stdout:
  output.write(line);output.flush();print(line,end='',flush=True)
 code=child.wait()
(folder/(name+'.json')).write_text(json.dumps({'command':command,'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':code},indent=2)+'\n')
sys.exit(code)
