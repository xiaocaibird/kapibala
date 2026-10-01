from pathlib import Path
import subprocess,os,json,secrets,time,datetime,hashlib
repo=Path.cwd(); out=repo/'.runtime/second-round-regression';out.mkdir(exist_ok=True,parents=True)
owner='second-round-regression-'+secrets.token_hex(5)
source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
password=secrets.token_hex(24)
envfile=out/'postgres.env';envfile.write_text('POSTGRES_USER=round2\nPOSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=postgres\n');envfile.chmod(0o600)
manifest={'purpose':'developer integrated regression before main handoff','source':source,'owner':owner,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'realProviderUsed':False,'results':[]}
cid=None
try:
 cid=subprocess.check_output(['docker','run','-d','--name',owner,'--label','kapibala.owner='+owner,'--env-file',str(envfile),'-p','127.0.0.1::5432','postgres:17'],text=True).strip();envfile.unlink()
 info=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
 port=info['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']
 manifest.update({'containerId':cid,'volumeNames':[m['Name'] for m in info['Mounts'] if m['Type']=='volume'],'hostPort':int(port)})
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 for _ in range(100):
  if subprocess.run(['docker','exec',cid,'pg_isready','-U','round2','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('isolated postgres not ready')
 testenv=os.environ.copy();testenv['DATABASE_URL']='postgres://round2:'+password+'@127.0.0.1:'+port+'/postgres'
 # Do not inherit opt-in provider credentials or expensive experimental flags.
 for k in list(testenv):
  if k.startswith('GEMINI_') or k in ['GOOGLE_API_KEY','RUN_GEMINI_LIVE_TEST']:testenv.pop(k,None)
 tests=sorted(str(p.relative_to(repo)) for pat in ['tests/integration/*.test.ts','apps/web/tests/*.test.ts'] for p in repo.glob(pat))
 commands=[('regression',['node_modules/.bin/tsx','--test','--test-concurrency=1',*tests]),('build',['npm','run','build']),('original',['npm','run','verify:original']),('boundaries',['npm','run','verify:automation-boundaries'])]
 pkg=json.loads((repo/'package.json').read_text());commands=[x for x in commands if x[0]!='boundaries' or 'verify:automation-boundaries' in pkg['scripts']]
 for name,cmd in commands:
  start=time.monotonic()
  with (out/(name+'.log')).open('w') as f:rc=subprocess.run(cmd,env=testenv,stdout=f,stderr=subprocess.STDOUT).returncode
  result={'name':name,'command':cmd if name!='regression' else ['node_modules/.bin/tsx','--test','--test-concurrency=1','tests/integration/*.test.ts','apps/web/tests/*.test.ts'],'exitCode':rc,'durationMs':round((time.monotonic()-start)*1000),'log':name+'.log'}
  manifest['results'].append(result);(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(result),flush=True)
finally:
 envfile.unlink(missing_ok=True)
 if cid:
  before=subprocess.run(['docker','exec',cid,'psql','-U','round2','-d','postgres','-At','-c',"SELECT datname FROM pg_database WHERE datname NOT IN ('template0','template1','postgres'); SELECT count(*) FROM pg_stat_activity WHERE datname IS NOT NULL AND pid<>pg_backend_pid();"],capture_output=True,text=True)
  manifest['databaseBeforeCleanup']={'exitCode':before.returncode,'output':before.stdout.strip()}
  info=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
  if info['Config']['Labels'].get('kapibala.owner')!=owner:raise RuntimeError('owner mismatch')
  clean=subprocess.run(['docker','rm','-f','-v',cid],capture_output=True,text=True)
  manifest['cleanup']={'exitCode':clean.returncode,'containerAbsent':subprocess.run(['docker','inspect',cid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0,'volumesAbsent':all(subprocess.run(['docker','volume','inspect',v],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0 for v in manifest['volumeNames'])}
 manifest['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 for p in sorted(out.glob('*.log')):manifest.setdefault('logHashes',{})[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'done':True,'source':source,'results':manifest['results'],'cleanup':manifest.get('cleanup')}),flush=True)
