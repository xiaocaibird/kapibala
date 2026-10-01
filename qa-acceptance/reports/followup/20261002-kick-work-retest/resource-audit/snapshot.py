#!/usr/bin/env python3
"""One finite READ-ONLY resource snapshot for frozen 7d53 kick-work QA.

Usage: python3 snapshot.py --phase preflight|during-run|post-cleanup
         [--since <UTC ISO time>] [--run-id <exact run>] [--pid <actual runner PID> ...]
No HTTP/DB requests, Docker exec, signals, cleanup, or resource mutations.
Writes only a new snapshot JSON beside this script. Do not import QA/SUT modules.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
QA = HERE.parents[3]
REPORT = HERE.parent
RUNTIME = QA / '.runtime' / 'kick-work-20261002'
PIN = '7d53ee1f054961c9c997ff79dcb30e5a7e89ac46'
# Earliest possible new run after developer closeout; explicit --since is preferred.
DEFAULT_SINCE = '2026-10-01T19:45:27Z'
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
HOST_PID_KEYS = ['pid', 'ppid', 'pgid', 'appPid', 'applicationPid', 'ownerPid',
                 'runnerPid', 'guardianPid', 'executorPid', 'workerPid', 'qaProcessPid']
IDENTITY_KEYS = HOST_PID_KEYS + ['uid', 'appStarted', 'applicationStarted', 'ownerStarted',
    'runId', 'toolUseId', 'stepId', 'attemptId', 'clockDomain', 'revision', 'sut', 'qaRoot',
    'apiUrl', 'port', 'apiPort', 'source', 'kind', 'backendPid', 'caseContainerId',
    'caseContainerOwner', 'containerId', 'containerOwner', 'owner', 'ownerLabel']


def positive_pid(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def utc(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Explicit timezone required')
    return parsed.astimezone(dt.timezone.utc)


def read_json(path):
    try:
        raw = path.read_bytes()
        return json.loads(raw), hashlib.sha256(raw).hexdigest(), None
    except (OSError, ValueError) as error:
        return None, None, str(error)


def identity(value):
    # Never copy resource tokens, auth credentials, environment, or owner nonce.
    return {k: value[k] for k in IDENTITY_KEYS if isinstance(value, dict) and k in value
            and isinstance(value[k], (str, int, float, bool, type(None)))}


def target_identity(target):
    if not isinstance(target, dict): return None
    sut = target.get('sut', {})
    return {'sut': {k: sut[k] for k in ['cwd', 'revision', 'start', 'migrate', 'web'] if k in sut},
        'adapters': {kind: {k: value[k] for k in ['url', 'registryDirectory', 'contractReference'] if k in value}
            for kind, value in target.get('adapters', {}).items() if isinstance(value, dict)},
        'authorization': target.get('authorization') if isinstance(target.get('authorization'), str) else None}


def command(argv, timeout=10):
    start = dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        result = {'argv': argv, 'startedAt': start, 'exitCode': p.returncode,
                  'stdout': p.stdout, 'stderr': p.stderr}
    except (subprocess.TimeoutExpired, OSError) as error:
        result = {'argv': argv, 'startedAt': start, 'exitCode': None,
                  'error': str(error), 'stdout': '', 'stderr': ''}
    result['endedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['preflight', 'during-run', 'post-cleanup'], default='during-run')
    parser.add_argument('--since', default=DEFAULT_SINCE)
    parser.add_argument('--run-id', action='append', default=[])
    parser.add_argument('--pid', action='append', default=[], type=int)
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    since_time = utc(args.since)
    if since_time >= now or any(not positive_pid(p) for p in args.pid):
        parser.error('--since must be in the past; --pid must be positive')
    since = since_time.isoformat().replace('+00:00', 'Z')
    # Always in the past; Docker events cannot become a background/live watcher.
    until = now.replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    commands, read_errors, prepared, ready, registries = [], [], [], [], []
    pids, ports, known_ids, known_volumes = set(args.pid), set(), set(), set()
    facts, backend_facts, bindings, prior_processes = [], [], [], {}
    old_volumes, old_events = [], []

    def logged(argv):
        result = command(argv)
        commands.append(result)
        return result

    def port_from_url(value):
        try:
            u = urlparse(value)
            if u.hostname in ['127.0.0.1', 'localhost', '::1'] and u.port:
                ports.add(u.port)
        except (ValueError, TypeError, AttributeError): pass

    def collect(value, file, checksum, pointer=''):
        if isinstance(value, dict):
            selected = identity(value)
            if any(k in value for k in HOST_PID_KEYS + ['backendPid', 'containerId', 'caseContainerId']):
                record = {'file': str(file), 'sha256': checksum, 'jsonPointer': pointer or '/', 'identity': selected}
                facts.append(record)
                for key in HOST_PID_KEYS:
                    if positive_pid(value.get(key)): pids.add(value[key])
                if positive_pid(value.get('backendPid')):
                    backend_facts.append({**record, 'namespace': 'PostgreSQL backend PID; not a host PID probe or ownership claim'})
                cid = value.get('caseContainerId') or value.get('containerId')
                owner = value.get('caseContainerOwner') or value.get('containerOwner') or value.get('owner') or value.get('ownerLabel')
                if isinstance(cid, str) and re.fullmatch(r'[0-9a-f]{64}', cid):
                    known_ids.add(cid)
                    bindings.append({**record, 'containerId': cid, 'owner': owner,
                                     'association': 'reported exact identity; validate source chain and live labels independently'})
            for key in ['apiPort', 'port', 'httpPort', 'wsPort', 'hostPort']:
                v = value.get(key)
                if isinstance(v, int) and not isinstance(v, bool) and 0 < v < 65536: ports.add(v)
            for key in ['apiUrl', 'url', 'baseUrl', 'gateway', 'agent', 'wsUrl', 'httpUrl']:
                if isinstance(value.get(key), str): port_from_url(value[key])
            for key, item in value.items():
                # No Env/token data enter output; recursively inspect only for allowlisted identities.
                if key not in ['env', 'environment', 'authorization', 'approval', 'token', 'nonce', 'headers']:
                    collect(item, file, checksum, pointer + '/' + str(key).replace('~', '~0').replace('/', '~1'))
        elif isinstance(value, list):
            for n, item in enumerate(value): collect(item, file, checksum, pointer + '/' + str(n))
        elif isinstance(value, str):
            # This actual worker clock domain is emitted by QA, not an expected PID invented by this observer.
            match = re.fullmatch(r'qa-process-performance:(\d+)', value)
            if match and int(match.group(1)) > 0:
                pids.add(int(match.group(1)))
                facts.append({'file': str(file), 'sha256': checksum, 'jsonPointer': pointer,
                              'identity': {'workerPid': int(match.group(1)), 'clockDomain': value}})

    runs = []
    for category in ['preflight', 'runs']:
        for path in sorted((QA / 'reports' / category).glob('*/manifest.json')):
            manifest, checksum, error = read_json(path)
            if not manifest or manifest.get('sutRevision') != PIN: continue
            try:
                if utc(manifest.get('startedAt', '')) < since_time: continue
            except ValueError: continue
            if args.run_id and manifest.get('runId') not in args.run_id: continue
            runner, runner_sha, _ = read_json(path.parent / 'runner-summary.json')
            environments = []
            for e in sorted(path.parent.glob('artifacts/*/evidence/environment.json')):
                value, env_sha, _ = read_json(e)
                if not value: continue
                cleanup, cleanup_sha, _ = read_json(e.with_name('cleanup.json'))
                environments.append({'file': str(e), 'sha256': env_sha,
                    'revision': value.get('revision'), 'cwd': value.get('cwd'), 'apiPort': value.get('apiPort'),
                    'startedAt': value.get('startedAt'), 'database': value.get('database'),
                    'gateway': value.get('gateway'), 'agent': value.get('agent'),
                    'cleanup': cleanup, 'cleanupSha256': cleanup_sha})
            runs.append({'runId': manifest.get('runId'), 'manifest': str(path), 'manifestSha256': checksum,
                'phase': manifest.get('phase'), 'suite': manifest.get('suite', {}).get('id'),
                'startedAt': manifest.get('startedAt'), 'sutRevision': PIN,
                'targetSha256': manifest.get('targetSha256'), 'targetIdentity': target_identity(manifest.get('target')),
                'qaRevision': manifest.get('qaRevision'), 'runnerSummary': runner,
                'runnerSummarySha256': runner_sha, 'environments': environments})
            # Includes raw runner / case ownership records and lifecycle/activity provenance.
            for evidence in sorted(path.parent.rglob('*.json')):
                if 'source-snapshot' in evidence.parts or 'node_modules' in evidence.parts: continue
                value, sha, error = read_json(evidence)
                if error:
                    read_errors.append({'file': str(evidence), 'error': error})
                else: collect(value, evidence, sha)

    registry_paths = set()
    for target_file in sorted(RUNTIME.glob('**/target*.json')):
        target, checksum, error = read_json(target_file)
        if not isinstance(target, dict) or target.get('sut', {}).get('revision') != PIN: continue
        prep_file = target_file.with_name('preparation.json')
        prep, prep_sha, _ = read_json(prep_file)
        # A template without a preparation record is not a prepared execution target.
        if not isinstance(prep, dict) or prep.get('revision') != PIN: continue
        prepared.append({'targetFile': str(target_file), 'targetFileSha256': checksum,
            'targetIdentity': target_identity(target), 'preparationFile': str(prep_file),
            'preparationSha256': prep_sha, 'preparationIdentity': {
                k: prep[k] for k in ['kind', 'preparedAt', 'productStarted', 'revision', 'sut', 'targetSha256']
                if isinstance(prep, dict) and k in prep}})
        for value in target.get('adapters', {}).values():
            if not isinstance(value, dict): continue
            if isinstance(value.get('registryDirectory'), str): registry_paths.add(Path(value['registryDirectory']))
            port_from_url(value.get('url'))
        if isinstance(prep, dict): collect(prep.get('bindings', []), prep_file, prep_sha)

    for path in sorted((REPORT / 'controllers').glob('*/ready.json')):
        value, checksum, _ = read_json(path)
        if not value or value.get('revision') != PIN: continue
        ready.append({'file': str(path), 'sha256': checksum, 'value': {
            k: value[k] for k in ['component', 'url', 'port', 'registryDirectory', 'runnerPid',
                'guardianPid', 'sut', 'revision', 'evidenceDirectory', 'stopRequestedNoLaterThan'] if k in value}})
        collect(value, path, checksum)
        if isinstance(value.get('registryDirectory'), str): registry_paths.add(Path(value['registryDirectory']))

    for registry in sorted(registry_paths):
        item = {'path': str(registry), 'exists': registry.exists(), 'entries': [], 'ownerMarker': None}
        try:
            info = registry.lstat()
            item.update({'uid': info.st_uid, 'mode': oct(info.st_mode & 0o777),
                'dev': info.st_dev, 'ino': info.st_ino, 'symlink': registry.is_symlink()})
            if registry.is_symlink() or not registry.is_dir():
                item['readRefused'] = 'Registry is a symlink or not a directory'
            else:
                marker = registry / '.qa-lifecycle-owner.json'
                value, checksum, error = read_json(marker)
                item['ownerMarker'] = {'file': str(marker), 'sha256': checksum,
                    'identity': identity(value), 'error': error}
                if value: collect(value, marker, checksum)
                for entry in sorted(registry.glob('*.json')):
                    value, checksum, error = read_json(entry)
                    item['entries'].append({'file': str(entry), 'sha256': checksum,
                        'identity': identity(value), 'error': error})
                    if value: collect(value, entry, checksum)
        except OSError as error: item['error'] = str(error)
        registries.append(item)

    engine = logged(DOCKER + ['info', '--format', '{{.ID}}'])
    engine_id = engine['stdout'].strip() if engine['exitCode'] == 0 else None
    for previous in sorted(HERE.glob('snapshot-*.json')):
        old, _, _ = read_json(previous)
        if not old or old.get('sutRevision') != PIN: continue
        for observed in old.get('portObservations', []):
            if isinstance(observed.get('port'), int): ports.add(observed['port'])
        for probe in old.get('processes', []):
            argv = probe.get('argv', [])
            if len(argv) > 2 and argv[:2] == ['ps', '-p'] and str(argv[2]).isdigit():
                pids.add(int(argv[2]))
                if probe.get('exitCode') == 0 and probe.get('stdout', '').strip():
                    prior_processes.setdefault(str(argv[2]), []).append({'snapshot': previous.name,
                        'observedAt': probe.get('endedAt'), 'stdout': probe['stdout']})
        old_engine = old.get('dockerEngineId')
        if engine_id and old_engine == engine_id:
            old_events.extend(old.get('events', [])); old_volumes.extend(old.get('volumeEvents', []))
            for container in old.get('containers', []):
                if container.get('Id'): known_ids.add(container['Id'])
                for mount in container.get('Mounts', []):
                    if mount.get('Type') == 'volume' and mount.get('Name'): known_volumes.add(mount['Name'])
            known_ids.update(old.get('knownContainerIds', []))
            known_volumes.update(old.get('knownVolumeNames', []))

    events_probe = logged(DOCKER + ['events', '--since', since, '--until', until,
        '--filter', 'type=container', '--filter', 'label=qa.owner', '--format', '{{json .}}'])
    events = old_events[:]
    for line in events_probe['stdout'].splitlines():
        try: events.append(json.loads(line))
        except ValueError: pass
    events = list({json.dumps(e, sort_keys=True): e for e in events}.values())
    for event in events:
        cid = event.get('Actor', {}).get('ID')
        if cid: known_ids.add(cid)
    live = logged(DOCKER + ['ps', '-aq', '--no-trunc', '--filter', 'label=qa.owner'])
    known_ids.update(live['stdout'].split())
    containers, absence, inspect_errors = [], [], []
    for cid in sorted(known_ids):
        probe = command(DOCKER + ['inspect', cid])
        if probe['exitCode'] != 0:
            absence.append(probe); continue
        try: value = json.loads(probe['stdout'])[0]
        except (ValueError, IndexError) as error:
            inspect_errors.append({'containerId': cid, 'error': str(error)}); continue
        labels = value.get('Config', {}).get('Labels', {}) or {}
        # Successful raw inspect includes Env; keep only nonsecret allowlisted facts.
        if not labels.get('qa.owner'): continue
        try:
            if utc(value.get('Created', '')) < since_time: continue
        except ValueError: continue
        selected = {k: value.get(k) for k in ['Id', 'Name', 'Created', 'Mounts']}
        selected.update({'owner': labels.get('qa.owner'), 'image': value.get('Config', {}).get('Image'),
            'State': {k: value.get('State', {}).get(k) for k in ['Running', 'Status', 'Pid', 'StartedAt', 'FinishedAt']},
            'Ports': value.get('NetworkSettings', {}).get('Ports'), 'observedAt': probe['endedAt'],
            'inspectRequest': {k: probe[k] for k in ['argv', 'startedAt', 'endedAt', 'exitCode', 'stderr']},
            'attribution': 'qa.owner+creation-window candidate; exact run requires case ID/owner/ports/provenance chain'})
        containers.append(selected)
        for mount in selected.get('Mounts') or []:
            if mount.get('Type') == 'volume' and mount.get('Name'): known_volumes.add(mount['Name'])
        for mappings in (selected.get('Ports') or {}).values():
            for mapping in mappings or []:
                if str(mapping.get('HostPort', '')).isdigit(): ports.add(int(mapping['HostPort']))

    volume_probe = command(DOCKER + ['events', '--since', since, '--until', until,
        '--filter', 'type=volume', '--format', '{{json .}}'])
    volume_candidates = old_volumes[:]
    for line in volume_probe['stdout'].splitlines():
        try: volume_candidates.append(json.loads(line))
        except ValueError: pass
    # Only exact Mounts or historical mount/unmount container attributes link a volume.
    for event in volume_candidates:
        if event.get('Actor', {}).get('Attributes', {}).get('container') in known_ids:
            known_volumes.add(event['Actor']['ID'])
    volume_events = list({json.dumps(e, sort_keys=True): e for e in volume_candidates
                         if e.get('Actor', {}).get('ID') in known_volumes}.values())
    volumes = []
    for name in sorted(known_volumes):
        probe = command(DOCKER + ['volume', 'inspect', name])
        if probe['exitCode'] == 0:
            value = json.loads(probe['stdout'])[0]
            volumes.append({'name': name, 'present': True, 'observedAt': probe['endedAt'],
                'selected': {k: value.get(k) for k in ['Name', 'Driver', 'Mountpoint', 'CreatedAt', 'Scope']}})
        else:
            volumes.append({'name': name, 'present': False if 'no such volume' in probe['stderr'].lower() else None,
                            'probe': probe})

    listeners = []
    for port in sorted(ports):
        probe = logged(['lsof', '-n', '-P', '-iTCP:' + str(port)])
        listeners.append({'port': port, 'probe': probe})
        for line in probe['stdout'].splitlines()[1:]:
            fields = line.split()
            if len(fields) > 1 and fields[1].isdigit(): pids.add(int(fields[1]))
    # No argv/Env from unrelated processes: get only the host parent/group inventory.
    inventory = logged(['ps', '-axo', 'pid=,ppid=,pgid=,uid=,comm='])
    rows = []
    for line in inventory['stdout'].splitlines():
        match = re.match(r'\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)', line)
        if match:
            pid, ppid, pgid, uid, comm = match.groups()
            rows.append({'pid': int(pid), 'ppid': int(ppid), 'pgid': int(pgid), 'uid': int(uid), 'comm': comm})
    # An actual app's guardian is its captured parent/group; capture ancestry as candidates,
    # never claim an ancestor is owned without the recorded command/start/registry chain.
    excluded = {0, 1, os.getpid(), os.getppid()}
    for row in rows:
        if row['pid'] in pids and row['ppid'] not in excluded: pids.add(row['ppid'])
        if row['pid'] in pids and row['pgid'] not in excluded: pids.add(row['pgid'])
    changed = True
    while changed:
        additions = {row['pid'] for row in rows if row['ppid'] in pids and row['pid'] not in excluded} - pids
        changed = bool(additions); pids.update(additions)
    processes = [logged(['ps', '-p', str(pid), '-ww', '-o', 'pid=,ppid=,pgid=,uid=,lstart=,comm=,args='])
                 for pid in sorted(pids - excluded)]
    # Container State.Pid and backendPid are different namespaces on Docker Desktop.
    # They are retained as facts, not automatically probed as macOS host PIDs.
    payload = {'schemaVersion': 2, 'phase': args.phase, 'observedAt': now.isoformat(),
        'observerPid': os.getpid(), 'uid': os.getuid(),
        'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'sutRevision': PIN, 'qaRoot': str(QA), 'runtimeFolder': str(RUNTIME),
        'dockerEventWindow': {'since': since, 'until': until}, 'dockerEngineId': engine_id,
        'requestedRunIds': args.run_id, 'explicitRunnerPids': args.pid,
        'preparedTargets': prepared, 'runs': sorted(runs, key=lambda r: r['startedAt']),
        'controllers': ready, 'registries': registries, 'identityFacts': facts,
        'postgresBackendIdentityFacts': backend_facts, 'reportedContainerBindings': bindings,
        'containers': containers, 'containerAbsenceChecks': absence, 'containerInspectErrors': inspect_errors,
        'knownContainerIds': sorted(known_ids), 'knownVolumeNames': sorted(known_volumes),
        'volumes': volumes, 'events': events, 'volumeEvents': volume_events,
        'volumeEventQuery': {k: volume_probe[k] for k in ['argv', 'startedAt', 'endedAt', 'exitCode', 'stderr']},
        'portObservations': listeners, 'processes': processes, 'hostParentGroupInventory': rows,
        'priorProcessObservations': prior_processes, 'readErrors': read_errors, 'commands': commands,
        'limits': ['Read-only local probes only: no product/DB requests, Docker exec, signals, resource mutations or cleanup.',
            'qa.owner/time alone is a candidate; validate actual case container ID+owner and process/port/run chain.',
            'Shared Docker backend listeners are infrastructure, not test-owned leaks.',
            'Docker retention may omit events; no event is not proof of absence.',
            'A missed live Mounts/PG HostPort capture must stay an explicit gap; exact historical container mount events can support volume association.',
            'PostgreSQL backendPid and Docker Desktop State.Pid do not automatically identify host processes.',
            'PID/port numbers can be reused: compare start time, argv, group, parent and recorded ownership before cleanup conclusions.',
            'One point-in-time snapshot is neither an execution result nor a cleanup authority.']}
    destination = HERE / ('snapshot-' + now.strftime('%Y%m%dT%H%M%S.%fZ') + '-' + args.phase + '.json')
    with destination.open('x', encoding='utf-8') as out:
        out.write(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'file': str(destination), 'runs': len(runs), 'containersPresent': len(containers),
        'trackedVolumeCount': len(volumes), 'controllerCount': len(ready), 'processCount': len(processes),
        'preparedTargetCount': len(prepared)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
