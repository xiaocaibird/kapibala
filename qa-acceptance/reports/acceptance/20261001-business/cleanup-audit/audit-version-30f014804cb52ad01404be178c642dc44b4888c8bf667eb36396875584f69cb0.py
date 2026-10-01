#!/usr/bin/env python3
"""Read-only resource audit. No signals, SQL, HTTP, mutation, or Docker cleanup commands."""
import argparse, collections, datetime, hashlib, json, os, pathlib, re, stat, subprocess, sys
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
FROZEN = pathlib.Path('/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance')
QA_ROOTS = [pathlib.Path('/Users/zcm/.codex/worktrees') / name / 'kapibala/qa-acceptance' for name in
            ['qa-business-execution', 'qa-business-final', 'qa-focused-retest', 'qa-premise-retest']]
CONTROLLERS = FROZEN / 'reports/integration/20261001-final-candidate/controllers'
DELIVERY = ROOT / 'reports/integration/20261001-final-delivery-reproduction/receiver-result.json'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
CID = re.compile(r'^[0-9a-f]{64}$')

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
def read(p): return json.loads(p.read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def source(p): return {'path': str(p), 'sha256': digest(p)}
def execute(argv):
    # Every caller below has a fixed read-only executable and command. Never use a shell.
    env = {k: os.environ[k] for k in ['PATH', 'HOME', 'TMPDIR', 'LANG'] if k in os.environ}
    return subprocess.run(argv, text=True, capture_output=True, timeout=15, env=env)
def docker(*args):
    assert args[0] in ['ps', 'inspect', 'volume', 'info']
    if args[0] == 'volume': assert args[1] in ['inspect', 'ls']
    return execute(['docker', '--host', 'unix:///var/run/docker.sock', *args])
def inspect(pid):
    if not isinstance(pid, int) or pid <= 0: return {'present': False, 'invalidPid': True}
    r = execute(['ps', '-p', str(pid), '-o', 'pid=,ppid=,pgid=,lstart=,command='])
    if r.returncode == 1 and not r.stdout.strip(): return {'pid': pid, 'present': False}
    if r.returncode: return {'pid': pid, 'error': 'ps failed', 'code': r.returncode}
    a = r.stdout.strip().split(None, 8)
    if len(a) != 9: return {'pid': pid, 'error': 'Unrecognized ps record'}
    command = a[8]
    return {'pid': int(a[0]), 'ppid': int(a[1]), 'pgid': int(a[2]), 'started': ' '.join(a[3:8]),
            'present': True, 'commandSha256': hashlib.sha256(command.encode()).hexdigest(),
            'commandMatchesOwnedController': 'qa-' in command and ('controller' in command),
            'commandMatchesSutObservation': 'scripts/qa-observation-server.ts' in command or 'scripts/qa-runtime-observation-server.ts' in command}
def container_identity(info):
    owner = (info.get('Config', {}).get('Labels') or {}).get('qa.owner', '')
    return bool(CID.fullmatch(info.get('Id', '')) and UUID.fullmatch(owner) and
                info.get('Name') == '/qa-acceptance-' + owner)
def same_registry(actual, expected, marker, ready):
    return (actual['directory'] and not actual['symlink'] and actual['uid'] == os.getuid()
            and actual['dev'] == expected['dev'] and actual['ino'] == expected['ino']
            and marker.get('runnerPid') == ready['runnerPid'] and marker.get('sut') == ready['sut']
            and marker.get('revision') == ready['revision'] and marker.get('qaRoot') == str(FROZEN))

def selftest():
    owner = '00000000-0000-4000-8000-000000000001'
    obj = {'Id': 'a'*64, 'Name': '/qa-acceptance-'+owner, 'Config': {'Labels': {'qa.owner': owner}}}
    assert container_identity(obj)
    assert not container_identity({**obj, 'Id': 'a'*12})
    assert not container_identity({**obj, 'Name': '/qa-acceptance-foreign'})
    assert not container_identity({**obj, 'Config': {'Labels': {'qa.owner': 'foreign'}}})
    ready = {'runnerPid': 42, 'sut': '/owned', 'revision': 'b'*40}
    marker = {**ready, 'qaRoot': str(FROZEN)}
    actual = {'directory': True, 'symlink': False, 'uid': os.getuid(), 'dev': 1, 'ino': 2}
    assert same_registry(actual, {'dev': 1, 'ino': 2}, marker, ready)
    assert not same_registry({**actual, 'symlink': True}, {'dev': 1, 'ino': 2}, marker, ready)
    assert not same_registry(actual, {'dev': 1, 'ino': 3}, marker, ready)
    assert not same_registry(actual, {'dev': 1, 'ino': 2}, {**marker, 'runnerPid': 99}, ready)
    print('8 pure ownership-boundary checks PASS; no resources queried or changed')

def collect(phase):
    out = {'schemaVersion': 1, 'startedAt': now(), 'auditorPid': os.getpid(), 'phase': phase,
           'readOnly': True, 'mutationCommands': [], 'httpOrSqlRequests': [], 'scriptSha256': digest(pathlib.Path(__file__)),
           'runs': [], 'controllers': [], 'docker': {'containers': [], 'capturedVolumes': []}, 'errors': [],
           'scopeBoundary': 'No authority to delete follows from a prefix or qa.owner alone. Historical unlabelled volumes without creation/mount evidence remain unowned.'}
    script_file = pathlib.Path(__file__)
    archive = HERE / ('audit-version-' + digest(script_file) + '.py')
    if not archive.exists(): archive.write_bytes(script_file.read_bytes())
    out['scriptArchive'] = source(archive)
    seen_runs = set()
    for qa in QA_ROOTS:
        for kind in ['runs', 'preflight']:
            for manifest in sorted((qa/'reports'/kind).glob('*/manifest.json')):
                m = read(manifest); key = (m.get('phase'), m.get('runId'))
                if key in seen_runs: continue
                seen_runs.add(key); r = manifest.parent; summary = r/'runner-summary.json'
                envs = list((r/'artifacts').glob('*/evidence/environment.json'))
                clean = list((r/'artifacts').glob('*/evidence/cleanup.json'))
                fixture = list((r/'artifacts').glob('*/evidence/fixture-cleanup.json'))
                missing = [str(e.parent/'cleanup.json') for e in envs if not (e.parent/'cleanup.json').exists()]
                failed = [{'path': str(f), 'failures': read(f).get('failures')} for f in clean+fixture if read(f).get('failures')]
                out['runs'].append({'manifest': source(manifest), 'runId': m.get('runId'), 'phase': m.get('phase'),
                   'runner': read(summary) if summary.exists() else {'state': 'NOT_FINALIZED_KEEP_RESOURCES'},
                   'runnerEvidence': source(summary) if summary.exists() else None,
                   'environmentCount': len(envs), 'cleanupCount': len(clean), 'fixtureCleanupCount': len(fixture),
                   'cleanupFailures': failed, 'environmentMissingCleanup': missing,
                   'cleanupEvidence': [source(p) for p in clean+fixture],
                   'meaning': 'Per-case cleanup does not itself prove worker PostgreSQL container/volume exit; inspect Docker separately.'})
    for f in sorted(CONTROLLERS.glob('*/ready.json')):
        ready = read(f); lp = f.parent/'lifecycle.ndjson'; lifecycle = [json.loads(l) for l in lp.read_text().splitlines() if l]
        creation = next(v for v in lifecycle if v['kind'] == 'registry-created')
        item = {'ready': ready, 'readyEvidence': source(f), 'lifecycleEvidence': source(lp),
                'lifecycleKinds': [v['kind'] for v in lifecycle], 'registryExpectedIdentity': creation['registryIdentity'],
                'runnerProcess': inspect(ready['runnerPid']), 'guardianProcess': inspect(ready['guardianPid'])}
        registry = pathlib.Path(ready['registryDirectory']); registrations = []
        if registry.exists() or registry.is_symlink():
            st = registry.lstat(); actual = {'directory': stat.S_ISDIR(st.st_mode), 'symlink': stat.S_ISLNK(st.st_mode),
                'uid': st.st_uid, 'dev': st.st_dev, 'ino': st.st_ino, 'mode': oct(stat.S_IMODE(st.st_mode))}
            item['registry'] = {'present': True, **actual}
            marker = registry/'.qa-lifecycle-owner.json'
            if not actual['symlink'] and actual['directory'] and marker.is_file() and not marker.is_symlink():
                body = read(marker); item['registry']['markerSha256'] = digest(marker)
                item['registry']['identityMatchesCreation'] = same_registry(actual, creation['registryIdentity'], body, ready)
                # Never publish nonce or observedOwnerToken. Do not traverse symlink registration files.
                for p in sorted(registry.glob('*.json')):
                    if not UUID.fullmatch(p.stem) or p.is_symlink(): continue
                    v=read(p); proc=inspect(v.get('appPid')); b=v.get('binding', {})
                    registrations.append({'file': str(p), 'sha256': digest(p), 'appPid': v.get('appPid'),
                        'appStarted': v.get('appStarted'), 'guardianStarted': v.get('guardianStarted'),
                        'guardianPid': b.get('pid'), 'apiUrl': b.get('apiUrl'), 'revision': b.get('revision'),
                        'process': proc, 'exactOriginalProcessStillPresent': proc.get('present') is True and proc.get('started') == v.get('appStarted')})
            else: item['registry']['identityMatchesCreation'] = False
        else: item['registry'] = {'present': False}
        item['registrations'] = registrations
        listener = execute(['lsof', '-n', '-P', f'-iTCP:{ready["port"]}', '-sTCP:LISTEN', '-t'])
        item['listenerPids'] = sorted({int(v) for v in listener.stdout.split() if v.isdigit()})
        item['listenerProbeCode'] = listener.returncode
        if listener.returncode not in [0, 1]: item['listenerProbeError'] = 'Cannot establish listener absence'
        item['action'] = 'KEEP: root controls original lifecycle wrapper; this audit never signals or deletes'
        out['controllers'].append(item)
    engine = docker('info', '--format', '{{.ID}}')
    out['docker']['engineId'] = engine.stdout.strip() if engine.returncode == 0 else None
    if engine.returncode: out['errors'].append({'component': 'docker-engine-id', 'error': 'Engine identity unavailable'})
    # Candidate process inventory uses exact workspace/browser paths only and never publishes command text.
    scoped_paths = [str(p) for p in QA_ROOTS] + [
        '/Users/zcm/.codex/worktrees/qa-sut-remediation/kapibala',
        '/Users/zcm/.codex/worktrees/qa-sut-integration/kapibala',
        '/Users/zcm/.codex/worktrees/qa-profile-retest/kapibala',
        '/Users/zcm/.codex/worktrees/qa-delivery-reproduction/kapibala',
        str(ROOT / '.runtime/browsers')]
    ps = execute(['ps', '-axo', 'pid=,ppid=,pgid=,lstart=,command='])
    candidates = []
    if ps.returncode: out['errors'].append({'component': 'scoped-processes', 'error': 'Process inventory unavailable'})
    else:
        for line in ps.stdout.splitlines():
            pieces = line.strip().split(None, 8)
            if len(pieces) != 9: continue
            matched = [p for p in scoped_paths if p in pieces[8]]
            if matched and int(pieces[0]) != os.getpid():
                candidates.append({'pid': int(pieces[0]), 'ppid': int(pieces[1]), 'pgid': int(pieces[2]),
                    'started': ' '.join(pieces[3:8]), 'matchingWorkspacePaths': matched,
                    'commandSha256': hashlib.sha256(pieces[8].encode()).hexdigest(),
                    'meaning': 'Candidate only: command path alone does not authorize killing a PID; correlate owner/start time/PGID.'})
    out['scopedProcessCandidates'] = candidates
    d=docker('ps','-a','--filter','label=qa.owner','--format','{{.ID}}')
    if d.returncode: out['errors'].append({'component':'docker-list','code':d.returncode,'error':'Local Docker inventory unavailable; absence NOT established'})
    else:
        for short in d.stdout.split():
            result=docker('inspect',short)
            if result.returncode: out['errors'].append({'component':'docker-inspect','id':short,'error':'Container changed during read; no absence conclusion'}); continue
            info=json.loads(result.stdout)[0]; ports=info.get('NetworkSettings',{}).get('Ports',{}).get('5432/tcp')
            item={'id':info['Id'],'name':info['Name'],'createdAt':info['Created'],'running':info['State']['Running'],
                  'owner':(info.get('Config',{}).get('Labels')or{}).get('qa.owner'),'ports':ports,
                  'image':info['Config']['Image'],'identityShapeValid':container_identity(info),
                  'attribution':'QA_LABELLED_BUT_NOT_BOUND_TO_RUN_BY_LABEL_ALONE','action':'KEEP_UNTIL_ACTIVE_RUN_COMPLETED_AND_OWNER_PROVEN',
                  'mounts':[{'type':v.get('Type'),'name':v.get('Name'),'destination':v.get('Destination')}for v in info.get('Mounts',[])]}
            out['docker']['containers'].append(item)
            for mount in info.get('Mounts',[]):
                if mount.get('Type')!='volume': continue
                v=docker('volume','inspect',mount['Name'])
                if v.returncode: out['errors'].append({'component':'volume-inspect','name':mount['Name'],'error':'Volume absence not established'});continue
                value=json.loads(v.stdout)[0]
                out['docker']['capturedVolumes'].append({'name':value['Name'],'createdAt':value.get('CreatedAt'),'driver':value['Driver'],
                    'parentContainerId':info['Id'],'parentOwner':item['owner'],'labels':value.get('Labels'),
                    'meaning':'Exact attached-volume snapshot only; do not delete separately until parent ownership and all current attachments are verified.'})
    # Earlier captured mounts can be checked after Docker removes their parent container; absence is queried by exact name only.
    volumes={v['name']:v for prior in HERE.glob('audit-*.json') for v in read(prior).get('docker',{}).get('capturedVolumes',[])}
    prior=[]
    for name,v in volumes.items():
        result=docker('volume','inspect',name)
        prior.append({'name':name,'parentContainerId':v['parentContainerId'],'present':result.returncode==0,
                      'absentConfirmed':result.returncode!=0 and 'no such volume' in result.stderr.lower(),
                      'code':result.returncode})
    out['docker']['previouslyCapturedVolumeChecks']=prior
    if DELIVERY.exists():
        ownership=read(DELIVERY)['ownership']; cid=ownership['containerId']; volume=ownership['volumeName']; a=docker('inspect',cid);b=docker('volume','inspect',volume)
        out['deliveryReproduction']={'source':source(DELIVERY),'runId':ownership['runId'],'originalEngineId':ownership['engineId'],'engineIdentityMatches':ownership['engineId']==out['docker']['engineId'],'containerId':cid,'volume':volume,
            'containerAbsentConfirmed':a.returncode!=0 and 'no such object' in a.stderr.lower(),
            'volumeAbsentConfirmed':b.returncode!=0 and 'no such volume' in b.stderr.lower(),
            'directoryAbsent':not pathlib.Path(ownership['directory']).exists(),
            'priorCleanupEvidence':source(DELIVERY.parent/'cleanup-verification.json')}
    out['completedAt']=now();out['result']='READ_ONLY_SNAPSHOT_NO_DELETION'
    out['requiresFinalReview'] = ['A finalized runner and case cleanup records are necessary but not enough to attribute every historical Docker volume.',
        'Active QA containers/controller listeners during retest are expected; do not mark them leaks or remove them.',
        'Root must stop original controller wrappers after all dependent retests, then rerun with post-controller-stop.',
        'Unproven PID reuse, unmatched registry, unlabelled volume or foreign listener must be retained, never deleted by this script.']
    return out

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase',choices=['in-progress','post-run','post-controller-stop'],default='in-progress')
    parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    if args.self_test: selftest();sys.exit(0)
    snapshot=collect(args.phase);stamp=snapshot['startedAt'].replace(':','-').replace('.','-');output=HERE/f'audit-{stamp}.json'
    with output.open('x')as f:json.dump(snapshot,f,ensure_ascii=False,indent=2);f.write('\n')
    print(json.dumps({'result':snapshot['result'],'phase':args.phase,'path':str(output),'controllers':len(snapshot['controllers']),
                      'qaLabelledContainers':len(snapshot['docker']['containers']),'errors':snapshot['errors']},ensure_ascii=False))
