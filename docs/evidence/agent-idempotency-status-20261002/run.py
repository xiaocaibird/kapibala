from pathlib import Path
import subprocess, os, json, secrets, time, datetime, sys, hashlib, shutil

repo = Path.cwd()
out = repo / 'docs/evidence/agent-idempotency-status-20261002'
phase, *tests = sys.argv[1:]
assert phase in ['before', 'after', 'regression']
owner = 'agent-key-status-' + secrets.token_hex(8)
baseline = '47423c165f74d8b8908297974f7df71bc53b470d'
password = secrets.token_hex(24)
runtime = repo / '.runtime' / owner
runtime.mkdir(parents=True)
envfile = runtime / 'postgres.env'
envfile.write_text('POSTGRES_USER=keytest\nPOSTGRES_PASSWORD=' + password + '\nPOSTGRES_DB=postgres\n')
envfile.chmod(0o600)
manifest = {'phase': phase, 'baseRevision': subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip(),
            'owner': owner, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'realProviderUsed': False, 'sourceSha256': hashlib.sha256((repo/'apps/server/src/modules/automation/tool-execution.ts').read_bytes()).hexdigest()}
cid = None
try:
    cid = subprocess.check_output(['docker','run','-d','--name',owner,'--label','kapibala.owner='+owner,'--env-file',str(envfile),'-p','127.0.0.1::5432','postgres:17'], text=True).strip()
    envfile.unlink()
    info = json.loads(subprocess.check_output(['docker','inspect',cid], text=True))[0]
    port = info['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']
    manifest.update({'containerId':cid, 'volumeNames':[m['Name'] for m in info['Mounts'] if m['Type']=='volume'], 'hostPort':int(port)})
    for _ in range(100):
        if subprocess.run(['docker','exec',cid,'pg_isready','-U','keytest','-d','postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(.1)
    else:
        raise RuntimeError('owned postgres did not become ready')
    env = os.environ.copy()
    for key in list(env):
        if key.startswith('GEMINI_') or key in ['GOOGLE_API_KEY', 'RUN_GEMINI_LIVE_TEST']:
            env.pop(key)
    env['DATABASE_URL'] = 'postgres://keytest:'+password+'@127.0.0.1:'+port+'/postgres'
    target = repo
    if phase == 'before':
        target = runtime/'baseline-copy'
        target.mkdir()
        archive = subprocess.check_output(['git','archive',baseline,'apps','packages','db','scripts','tests','package.json','package-lock.json','tsconfig.json'])
        subprocess.run(['tar','-xf','-','-C',str(target)], input=archive, check=True)
        (target/'node_modules').symlink_to(repo/'node_modules', target_is_directory=True)
        shutil.copyfile(repo/'tests/integration/agent-idempotency-status.test.ts',target/'tests/integration/agent-idempotency-status.test.ts')
    manifest['sourceSha256'] = hashlib.sha256((target/'apps/server/src/modules/automation/tool-execution.ts').read_bytes()).hexdigest()
    command = ['node','--import','tsx','--test','--test-reporter=tap','--test-concurrency=1',*tests]
    with (out/(phase+'.tap')).open('w') as log:
        code = subprocess.run(command, cwd=target, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=240).returncode
    manifest.update({'command':command,'exitCode':code,'logSha256':hashlib.sha256((out/(phase+'.tap')).read_bytes()).hexdigest()})
finally:
    envfile.unlink(missing_ok=True)
    shutil.rmtree(runtime)
    if cid:
        check = subprocess.run(['docker','exec',cid,'psql','-U','keytest','-d','postgres','-At','-c',"SELECT datname FROM pg_database WHERE datname NOT IN ('template0','template1','postgres'); SELECT count(*) FROM pg_stat_activity WHERE datname IS NOT NULL AND pid<>pg_backend_pid();"], capture_output=True,text=True)
        manifest['databaseBeforeCleanup'] = {'exitCode':check.returncode,'output':check.stdout.strip()}
        info = json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
        assert info['Config']['Labels']['kapibala.owner'] == owner
        clean = subprocess.run(['docker','rm','-f','-v',cid], capture_output=True,text=True)
        manifest['cleanup'] = {'exitCode':clean.returncode,'containerAbsent':subprocess.run(['docker','inspect',cid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode != 0,
          'volumesAbsent':all(subprocess.run(['docker','volume','inspect',v],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode != 0 for v in manifest['volumeNames'])}
    manifest['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (out/(phase+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'phase':phase,'exitCode':manifest.get('exitCode'),'cleanup':manifest.get('cleanup')}),flush=True)
sys.exit(0 if manifest.get('exitCode') == (1 if phase == 'before' else 0) else 1)
