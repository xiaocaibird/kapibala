#!/usr/bin/env python3
"""One finite READ-ONLY resource snapshot. No cleanup, signal, DB or product requests.
Run from any directory: python3 <this file> --phase during-run|post-cleanup
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
QA = HERE.parents[3]
REPORT = HERE.parent
PIN = '8e047aea842bfcec64802e4918b52b460b93c48b'
SINCE = '2026-10-01T15:22:00Z'
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['during-run', 'post-cleanup'], default='during-run')
args = parser.parse_args()
now = dt.datetime.now(dt.timezone.utc)
# Always in the past: docker events must not become a background/live watcher.
until = now.replace(microsecond=0).isoformat().replace('+00:00', 'Z')
commands = []

def command(argv, timeout=10):
    start = dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        result = {'argv': argv, 'startedAt': start, 'exitCode': p.returncode,
                  'stdout': p.stdout, 'stderr': p.stderr}
    except (subprocess.TimeoutExpired, OSError) as error:
        result = {'argv': argv, 'startedAt': start, 'exitCode': None, 'error': str(error), 'stdout': '', 'stderr': ''}
    result['endedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    return result

def logged(argv):
    result = command(argv)
    commands.append(result)
    return result

def read_json(path):
    try:
        raw = path.read_bytes()
        return json.loads(raw), hashlib.sha256(raw).hexdigest()
    except (OSError, ValueError):
        return None, None

def summaries():
    result = []
    for prefix in ['preflight', 'runs']:
        for p in (QA / 'reports' / prefix).glob('*/manifest.json'):
            v, sha = read_json(p)
            if not v or v.get('sutRevision') != PIN or v.get('startedAt', '') < SINCE:
                continue
            runner, runner_sha = read_json(p.parent / 'runner-summary.json')
            envs = []
            for e in p.parent.glob('artifacts/*/evidence/environment.json'):
                value, checksum = read_json(e)
                if not value:
                    continue
                cleanup, cleanup_sha = read_json(e.with_name('cleanup.json'))
                envs.append({'file': str(e), 'sha256': checksum,
                    'revision': value.get('revision'), 'apiPort': value.get('apiPort'),
                    'startedAt': value.get('startedAt'), 'database': value.get('database'),
                    'gateway': value.get('gateway'), 'agent': value.get('agent'),
                    'cleanup': cleanup, 'cleanupSha256': cleanup_sha})
            result.append({'runId': v['runId'], 'manifest': str(p), 'manifestSha256': sha,
                'phase': v.get('phase'), 'suite': v.get('suite', {}).get('id'),
                'startedAt': v.get('startedAt'), 'sutRevision': PIN,
                'targetSha256': v.get('targetSha256'), 'qaRevision': v.get('qaRevision'),
                'runnerSummary': runner, 'runnerSummarySha256': runner_sha, 'environments': envs})
    return sorted(result, key=lambda r: r['startedAt'])

runs = summaries()
ready, registries = [], []
pids, ports = set(), set()
for path in (REPORT / 'controllers').glob('*/ready.json'):
    v, sha = read_json(path)
    if not v or v.get('revision') != PIN:
        continue
    ready.append({'file': str(path), 'sha256': sha, 'value': v})
    pids.update([v['runnerPid'], v['guardianPid']])
    ports.add(v['port'])
    registry = Path(v['registryDirectory'])
    item = {'path': str(registry), 'exists': registry.exists(), 'entries': []}
    if registry.exists():
        stat = registry.lstat()
        item.update({'uid': stat.st_uid, 'mode': oct(stat.st_mode & 0o777), 'symlink': registry.is_symlink()})
        for entry in registry.glob('*.json'):
            value, checksum = read_json(entry)
            # Whitelist only nonsecret ownership data. Never write resource tokens/nonce.
            selected = {k: value[k] for k in ['pid','ppid','pgid','uid','appPid','appStarted','ownerPid',
                'ownerStarted','runnerPid','apiUrl','revision','sut','qaRoot'] if value and k in value}
            item['entries'].append({'file': entry.name, 'sha256': checksum, 'identity': selected})
            for key in ['pid','appPid','ownerPid','runnerPid']:
                if isinstance(selected.get(key), int): pids.add(selected[key])
    registries.append(item)

events_result = logged(DOCKER + ['events', '--since', SINCE, '--until', until,
    '--filter', 'type=container', '--filter', 'label=qa.owner', '--format', '{{json .}}'])
events = []
for line in events_result['stdout'].splitlines():
    try: events.append(json.loads(line))
    except ValueError: pass

known_ids, known_volumes = set(), set()
engine = logged(DOCKER + ['info', '--format', '{{.ID}}'])
manual_resources, manual_container_ids = [], {}
for path in (REPORT / 'manual-review').glob('readme-*-resources.json'):
    value, checksum = read_json(path)
    cleanup_path = path.with_name(path.name.replace('-resources.json', '-cleanup.json'))
    cleanup, cleanup_checksum = read_json(cleanup_path)
    if not value: continue
    same_engine = engine['exitCode'] == 0 and value.get('engineId') == engine['stdout'].strip()
    manual_resources.append({'file': str(path), 'sha256': checksum, 'resource': value,
        'cleanupFile': str(cleanup_path), 'cleanupSha256': cleanup_checksum, 'cleanup': cleanup,
        'sameDockerEngineIndependentlyChecked': same_engine})
    if same_engine:
        manual_container_ids[value['containerId']] = value['runId']
        known_ids.add(value['containerId'])
        known_volumes.add(value['volumeName'])
        pids.add(value['ownerPid'])
prior_process_observations = {}
prior_volume_events = []
for prior in HERE.glob('*.json'):
    old, _ = read_json(prior)
    if not old: continue
    # Keep exact earlier ps records for final PID+start comparison. A surviving
    # Docker desktop daemon/listener is shared infrastructure, never a leak by
    # numeric PID alone; the final review must retain its recorded role.
    for probe in old.get('processes', []):
        argv = probe.get('argv', [])
        if len(argv) > 2 and argv[:2] == ['ps', '-p'] and argv[2].isdigit():
            pids.add(int(argv[2]))
            if probe.get('exitCode') == 0 and probe.get('stdout', '').strip():
                prior_process_observations.setdefault(argv[2], []).append({
                    'snapshot': prior.name, 'observedAt': probe.get('endedAt'), 'stdout': probe['stdout']})
    for event in old.get('events', []) + old.get('volumeEvents', []):
        if event.get('Type') == 'container' and event.get('Actor', {}).get('Attributes', {}).get('qa.owner'):
            known_ids.add(event['Actor']['ID'])
        if event.get('Type') == 'volume': prior_volume_events.append(event)
    for container in old.get('containers', []):
        if container.get('Id'): known_ids.add(container['Id'])
        for mount in container.get('Mounts', []):
            if mount.get('Type') == 'volume' and mount.get('Name'): known_volumes.add(mount['Name'])
for event in events:
    if event.get('Actor', {}).get('ID'): known_ids.add(event['Actor']['ID'])
volume_result = command(DOCKER + ['events', '--since', SINCE, '--until', until,
    '--filter', 'type=volume', '--format', '{{json .}}'])
volume_candidates = prior_volume_events[:]
for line in volume_result['stdout'].splitlines():
    try: volume_candidates.append(json.loads(line))
    except ValueError: pass
# Historical mount/unmount events name the exact container; this can preserve a
# volume link even when the container has already disappeared. Never associate
# unrelated volume create/destroy merely because it happened at the same time.
for event in volume_candidates:
    if event.get('Actor', {}).get('Attributes', {}).get('container') in known_ids:
        known_volumes.add(event['Actor']['ID'])
volume_events = {json.dumps(event, sort_keys=True): event for event in volume_candidates
    if event.get('Actor', {}).get('ID') in known_volumes}
volume_events = list(volume_events.values())
live = logged(DOCKER + ['ps', '-aq', '--no-trunc', '--filter', 'label=qa.owner'])
known_ids.update(live['stdout'].split())
containers, absence = [], []
seen_container_ids = set()
for cid in sorted(known_ids):
    result = command(DOCKER + ['inspect', cid])
    if result['exitCode'] != 0:
        # No Env can appear in failed inspect output.
        absence.append(result)
        continue
    value = json.loads(result['stdout'])[0]
    if value['Id'] in seen_container_ids: continue
    seen_container_ids.add(value['Id'])
    labels = value.get('Config', {}).get('Labels', {}) or {}
    if (not labels.get('qa.owner') and value['Id'] not in manual_container_ids) or value.get('Created', '') < SINCE:
        continue
    selected = {k: value.get(k) for k in ['Id', 'Name', 'Created', 'Mounts']}
    selected.update({'owner': labels.get('qa.owner') or manual_container_ids[value['Id']], 'image': value['Config'].get('Image'),
        'State': {k: value['State'].get(k) for k in ['Running', 'Status', 'Pid', 'StartedAt', 'FinishedAt']},
        'Ports': value['NetworkSettings'].get('Ports'), 'observedAt': result['endedAt'],
        'attribution': 'qa.owner+creation-window candidate; run association additionally requires run chronology/ports; not generic cleanup authority'})
    containers.append(selected)
    for mount in selected['Mounts']:
        if mount.get('Type') == 'volume' and mount.get('Name'): known_volumes.add(mount['Name'])
    for mappings in (selected['Ports'] or {}).values():
        for mapping in mappings or []: ports.add(int(mapping['HostPort']))

volumes = []
for name in sorted(known_volumes):
    value = command(DOCKER + ['volume', 'inspect', name])
    if value['exitCode'] == 0:
        data = json.loads(value['stdout'])[0]
        volumes.append({'name': name, 'present': True,
            'selected': {k: data.get(k) for k in ['Name','Driver','Mountpoint','CreatedAt','Scope']},
            'observedAt': value['endedAt']})
    else:
        volumes.append({'name': name, 'present': False if 'no such volume' in value['stderr'].lower() else None,
            'probe': value})

for run in runs:
    if not run['runnerSummary']:
        for env in run['environments']:
            if not env['cleanup'] and isinstance(env['apiPort'], int): ports.add(env['apiPort'])
listeners = []
for port in sorted(ports):
    probe = logged(['lsof', '-n', '-P', '-iTCP:' + str(port)])
    listeners.append({'port': port, 'probe': probe})
    for row in probe['stdout'].splitlines()[1:]:
        fields = row.split()
        if len(fields) > 1 and fields[1].isdigit(): pids.add(int(fields[1]))
processes = []
for pid in sorted(pids):
    processes.append(logged(['ps', '-p', str(pid), '-o', 'pid=,ppid=,pgid=,uid=,lstart=,comm=']))

payload = {'schemaVersion': 1, 'phase': args.phase, 'observedAt': now.isoformat(),
    'observerPid': os.getpid(), 'uid': os.getuid(), 'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'sutRevision': PIN, 'dockerEventWindow': {'since': SINCE, 'until': until},
    'runs': runs, 'controllers': ready, 'registries': registries, 'containers': containers,
    'manualReproductionResourceEvidence': manual_resources,
    'containerAbsenceChecks': absence, 'volumes': volumes, 'events': events, 'volumeEvents': volume_events,
    'volumeEventQuery': {k: volume_result[k] for k in ['argv','startedAt','endedAt','exitCode','stderr']},
    'portObservations': listeners, 'processes': processes, 'priorProcessObservations': prior_process_observations,
    'commands': commands,
    'limits': ['No product/DB requests, signals, resource mutations or cleanup were performed.',
        'Docker events may be retention-limited; absence of an event is not proof of absence.',
        'A container gone before a live Mounts capture cannot yield a retrospectively exact anonymous-volume map.',
        'ps/lsof record point-in-time identity and reuse is possible; numeric PID/port alone is not ownership.',
        'qa.owner/time alone is a candidate association. Do not attribute concurrent unrelated QA resources without a run chain.']}
destination = HERE / ('snapshot-' + now.strftime('%Y%m%dT%H%M%S.%fZ') + '-' + args.phase + '.json')
destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'file': str(destination), 'runs': len(runs), 'containersPresent': len(containers),
    'trackedVolumeCount': len(volumes), 'controllerCount': len(ready), 'events': len(events)}, ensure_ascii=False))
