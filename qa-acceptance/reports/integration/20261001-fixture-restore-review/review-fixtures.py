#!/usr/bin/env python3
"""Authorized QA fixture review: official PG17 restore, no application execution.

Only a newly created, labeled, network-isolated container is mutated. This is an
artifact review, not a product acceptance runner. Final manifests are written
only after content checks AND owned-resource cleanup succeed.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import traceback
import uuid

HERE = Path(__file__).resolve().parent
QA = HERE.parents[2]
REPO = QA.parent
SOURCE = Path('/Users/zcm/.codex/worktrees/architecture-contract-resource/kapibala/.runtime/qa-fixtures/5d1885e76871460bb0c146fd4cc90032')
CANDIDATE = '0af644334b00eb13e2e56df33c70f22358a6a0f7'
IMAGE = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
TOKEN = uuid.uuid4().hex
OWNER = 'independent-qa-fixture-review-' + TOKEN
NAME = 'qa-fixture-review-' + TOKEN
RUN = HERE / TOKEN
RUN.mkdir()
(RUN / 'review-script.py').write_bytes(Path(__file__).read_bytes())
ENV = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR', 'LANG'] if key in os.environ}
ENV.update({'LC_ALL': 'C', 'LANG': 'C'})
CONTAINER = ''
DATABASES = []
VOLUMES = []


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def call(args, timeout=30, ok=True):
    r = subprocess.run(args, cwd=REPO if args[0] == 'git' else QA, env=ENV, capture_output=True, timeout=timeout)
    if ok and r.returncode != 0:
        raise RuntimeError(f'{args[0]} {args[1:4]} failed ({r.returncode}): {r.stderr.decode(errors="replace")}')
    return r


def docker(*args, timeout=30, ok=True):
    return call(['docker', '--host', 'unix:///var/run/docker.sock', *args], timeout, ok)


def owned():
    value = json.loads(docker('inspect', NAME).stdout)[0]
    assert value['Id'] == CONTAINER, 'container identity changed'
    assert value['Config']['Labels']['qa.owner'] == OWNER, 'container ownership changed'
    assert value['HostConfig']['NetworkMode'] == 'none', 'review container must have no external network'
    assert not value['HostConfig']['Binds'], 'host bind mounts forbidden'
    assert not value['HostConfig']['PortBindings'], 'published ports forbidden'
    return value


def pg(database, program, *args):
    assert database == 'postgres' or database in DATABASES
    owned()
    return docker('exec', CONTAINER, program, '--username=qa', f'--dbname={database}', *args)


def query(database, sql):
    return pg(database, 'psql', '--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command', sql).stdout.decode().strip()


def rows(database, sql):
    return json.loads(query(database, f"SELECT COALESCE(json_agg(r),'[]'::json) FROM ({sql}) r"))


def fingerprint(database, stem):
    result = {}
    for section in ['schema', 'data']:
        value = pg(database, 'pg_dump', f'--{section}-only', '--no-owner', '--no-privileges').stdout
        (RUN / f'{stem}-{section}.sql').write_bytes(value)
        normalized = re.sub(rb'^\\(?:un)?restrict .*$', b'', value, flags=re.M)
        result[section] = sha(normalized)
    return result


report = {
    'version': 1, 'phase': 'independent-fixture-artifact-review',
    'reviewer': 'independent QA / intake_smoke_gate', 'owner': OWNER,
    'candidateRevision': CANDIDATE, 'qaRevision': call(['git', 'rev-parse', 'HEAD']).stdout.decode().strip(),
    'reviewScriptSha256': sha(Path(__file__).read_bytes()), 'startedAt': now(),
    'authorizationBasis': 'User authorized continuing isolated integration, all smoke and formal business acceptance; root delegated owned PG17 fixture restoration and final binding.',
    'applicationStarted': False, 'productAcceptanceResult': 'NOT_RUN',
    'sourceDirectory': str(SOURCE), 'artifacts': [], 'cleanup': {'completed': False}, 'status': 'RUNNING',
}
error = None
try:
    ledger_bytes = (SOURCE / 'independent-ledger.json').read_bytes()
    ledger = json.loads(ledger_bytes)
    producer = json.loads((SOURCE / 'producer-verification.json').read_bytes())
    assert sha(ledger_bytes) == producer['ledgerSha256']
    report['ledgerSha256'] = sha(ledger_bytes)
    (RUN / 'independent-ledger.json').write_bytes(ledger_bytes)
    (RUN / 'producer-verification.json').write_bytes((SOURCE / 'producer-verification.json').read_bytes())
    assert producer['candidateRevision'] is None
    generator_bytes = call(['git', 'show', 'fa6bd5f:scripts/prepare-qa-database-fixtures.mjs']).stdout
    assert sha(generator_bytes) == producer['generatorSha256']
    report['producerProvenance'] = {
        'reportedRunHead': producer['generatorRevision'], 'actualScriptCommittedAs': 'fa6bd5f',
        'actualScriptSha256': sha(generator_bytes),
        'qualification': 'The producer ran with a then-uncommitted TCP-readiness fix; actual script bytes match fa6bd5f. Later guard changes were not used to generate these archives.',
    }
    assert ledger['query'] == {'q': 'qa-precision-', 'pageSize': 2}
    assert [r['id'] for r in ledger['rows']] == [f'qa-precision-group-{i}' for i in range(6)]
    assert [r['createdAtMicros'] for r in ledger['rows']] == [f'2026-10-01T00:00:00.00000{i}Z' for i in [1, 2, 2, 3, 4, 4]]
    for i, row in enumerate(ledger['rows']):
        assert row['public'] == {'id': row['id'], 'name': f'qa-precision-{i}', 'createdAt': '2026-10-01T00:00:00.000Z'}
    for direction in ['asc', 'desc']:
        expected = sorted(ledger['rows'], key=lambda r: (int(r['createdAtMicros'][20:26]) * (1 if direction == 'asc' else -1), r['id']))
        assert ledger['orderIds'][direction] == [r['id'] for r in expected]
        boundaries = [(expected[i-1]['createdAtMicros'], expected[i]['createdAtMicros']) for i in [2, 4]]
        assert any(a == b for a, b in boundaries)
        assert any(a != b and a[:23] == b[:23] for a, b in boundaries)
    source8 = producer['sourceRevision']
    assert call(['git', 'diff', source8, CANDIDATE, '--', 'db']).stdout == b'', 'candidate schema changed since fixture source'
    report['candidateSchemaCompatibility'] = {'sourceRevision': source8, 'candidateRevision': CANDIDATE, 'databaseTreeDiffEmpty': True}
    prepared = []
    for kind, filename, schema in [('legacy-schema', 'legacy.dump', 7), ('directory-precision', 'precision.dump', 8)]:
        prep_path = SOURCE / f'{kind}.preparation.json'
        assert not prep_path.is_symlink()
        prep_bytes = prep_path.read_bytes()
        prep = json.loads(prep_bytes)
        assert prep['candidateRevision'] is None and prep['review'] is None
        assert prep['source']['syntheticOnly'] is True and prep['source']['noPendingWork'] is True
        assert prep['producerMetadata']['ledgerSha256'] == sha(ledger_bytes)
        path = SOURCE / filename
        assert not path.is_symlink() and path.is_file()
        data = path.read_bytes()
        assert 5 <= len(data) <= 64 * 1024 * 1024 and data[:5] == b'PGDMP'
        assert sha(data) == prep['dump']['sha256'] and len(data) == prep['dump']['bytes']
        assert prep['source']['revision'] != CANDIDATE
        prod = next(a for a in producer['artifacts'] if a['kind'] == kind)
        assert prod['archive']['sha256'] == sha(data) and prod['archive']['bytes'] == len(data)
        assert prod['preparation']['sha256'] == sha(prep_bytes)
        assert prod['sourceRevision'] == prep['source']['revision']
        source_files = call(['git', 'ls-tree', '--full-tree', '-r', '--name-only', prep['source']['revision'], 'db/migrations']).stdout.decode().splitlines()
        assert len(source_files) == schema, f'Expected {schema} migration files, got {source_files}'
        migrations = [{'version': int(Path(f).name[:3]), 'name': Path(f).name,
                       'checksum': sha(call(['git', 'show', f"{prep['source']['revision']}:{f}"]).stdout)} for f in source_files]
        assert migrations == prod['installed']
        if kind == 'directory-precision':
            assert prep['expected'] == {'query': ledger['query'], 'rows': ledger['rows']}
        else:
            assert prep['expected']['rejectionLogIncludes'] == ['Schema mismatch: installed=7, required=8']
        (RUN / filename).write_bytes(data)
        (RUN / prep_path.name).write_bytes(prep_bytes)
        prepared.append((kind, filename, schema, prep, prod, migrations))

    password = uuid.uuid4().hex
    CONTAINER = docker('create', '--name', NAME, '--label', f'qa.owner={OWNER}', '--label', 'qa.purpose=fixture-artifact-review',
                       '--network', 'none', '--env', 'POSTGRES_USER=qa', '--env', f'POSTGRES_PASSWORD={password}', '--env', 'POSTGRES_DB=postgres', IMAGE).stdout.decode().strip()
    assert re.fullmatch('[a-f0-9]{64}', CONTAINER)
    info = owned()
    assert len(info['Mounts']) == 1
    for mount in info['Mounts']:
        assert mount['Type'] == 'volume' and mount['Destination'] == '/var/lib/postgresql/data'
        assert re.fullmatch('[a-f0-9]{64}', mount['Name']), 'only generated anonymous volumes allowed'
        VOLUMES.append(mount['Name'])
    report['container'] = {'id': CONTAINER, 'name': NAME, 'owner': OWNER, 'image': IMAGE, 'imageId': info['Image'], 'createdAt': info['Created'], 'networkMode': 'none', 'publishedPorts': [], 'anonymousVolumes': VOLUMES}
    docker('start', CONTAINER)
    deadline = time.monotonic() + 45
    while True:
        ready = docker('exec', CONTAINER, 'pg_isready', '-h', '127.0.0.1', '-U', 'qa', '-d', 'postgres', ok=False)
        if ready.returncode == 0 and query('postgres', 'SELECT 1') == '1':
            break
        assert time.monotonic() < deadline, 'PostgreSQL TCP readiness timeout'
        time.sleep(0.2)
    report['postgresqlVersion'] = query('postgres', 'SHOW server_version')
    assert report['postgresqlVersion'].startswith('17.')
    base_tables = {'accounts', 'agent_pending', 'agent_runs', 'agent_send_keys', 'agent_steps', 'auth_sessions', 'auth_tokens', 'events', 'gateway_events', 'groups', 'jobs', 'members', 'messages', 'schema_migrations', 'sequence_runs', 'sequence_steps', 'sequences', 'timeline_snapshots'}
    for kind, filename, schema, prep, prod, migrations in prepared:
        database = f'qa_fixture_{schema}_{TOKEN}'
        DATABASES.append(database)
        query('postgres', f'CREATE DATABASE "{database}"')
        assert query(database, "SELECT count(*) FROM pg_tables WHERE schemaname='public'") == '0'
        owned()
        docker('cp', str(RUN / filename), f'{CONTAINER}:/tmp/{filename}')
        toc = docker('exec', CONTAINER, 'pg_restore', '--list', f'/tmp/{filename}').stdout
        (RUN / f'{kind}-archive-toc.txt').write_bytes(toc)
        restored = pg(database, 'pg_restore', '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', f'/tmp/{filename}')
        (RUN / f'{kind}-restore.log').write_bytes(restored.stdout + restored.stderr)
        installed = rows(database, 'SELECT version,name,checksum FROM schema_migrations ORDER BY version')
        assert installed == migrations
        tables = rows(database, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
        expected_tables = base_tables | ({'message_sent_receipts'} if schema == 8 else set())
        assert {r['tablename'] for r in tables} == expected_tables
        counts = {t: int(query(database, f'SELECT count(*) FROM "{t}"')) for t in sorted(expected_tables)}
        assert counts['accounts'] == 6 and counts['groups'] == (6 if schema == 8 else 0) and counts['schema_migrations'] == schema
        assert all(n == 0 for t, n in counts.items() if t not in {'accounts', 'groups', 'schema_migrations'})
        accounts = rows(database, 'SELECT * FROM accounts ORDER BY id')
        assert [a['id'] for a in accounts] == [f'account-{i}' for i in range(1, 7)]
        assert all(a['status'] == 'idle' and a['platform_user_id'] is None and a['rate_limited_until'] is None for a in accounts)
        groups = rows(database, 'SELECT *,to_char(created_at AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS micros FROM groups ORDER BY id')
        if schema == 8:
            for i, (actual, expected) in enumerate(zip(groups, ledger['rows'], strict=True)):
                assert actual['id'] == expected['id'] and actual['name'] == expected['public']['name'] and actual['micros'] == expected['createdAtMicros']
                assert actual['gateway_group_id'] == f'qa-precision-gateway-{i}' and actual['creator_account_id'] == 'account-1'
                assert actual['status'] == 'active' and actual['description'] is None
                assert actual['agent_enabled'] is False and actual['auto_kick_enabled'] is False
        object_checks = {
            'nonSystemSchemas': rows(database, "SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname"),
            'extensions': rows(database, 'SELECT extname FROM pg_extension ORDER BY extname'),
            'userFunctions': int(query(database, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")),
            'userTriggers': int(query(database, 'SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal')),
            'eventTriggers': int(query(database, 'SELECT count(*) FROM pg_event_trigger')),
            'foreignServers': int(query(database, 'SELECT count(*) FROM pg_foreign_server')),
        }
        assert object_checks == {'nonSystemSchemas': [{'nspname': 'public'}], 'extensions': [{'extname': 'plpgsql'}], 'userFunctions': 0, 'userTriggers': 0, 'eventTriggers': 0, 'foreignServers': 0}
        actual_fingerprint = fingerprint(database, kind)
        assert actual_fingerprint == prod['fingerprint'], 'restored bytes do not match source schema/data digest'
        evidence = {'kind': kind, 'sourceRevision': prep['source']['revision'], 'schemaVersion': schema,
                    'archiveSha256': prep['dump']['sha256'], 'archiveBytes': prep['dump']['bytes'],
                    'restoredDatabase': database, 'restoreExitCode': restored.returncode, 'installedMigrations': installed,
                    'rowCounts': counts, 'accounts': accounts, 'groups': groups, 'objectChecks': object_checks,
                    'fingerprint': actual_fingerprint, 'matchesProducerFingerprint': True,
                    'independentLedgerMatched': schema == 8, 'noPendingWorkConfirmed': True,
                    'syntheticAccountsOnly': True, 'applicationStarted': False}
        report['artifacts'].append(evidence)
        print(f'{kind}: restored schema {schema}, all rows and object checks verified', flush=True)
    report['contentReviewCompletedAt'] = now()
except BaseException as exc:
    error = exc
    report['error'] = f'{type(exc).__name__}: {exc}'
    report['traceback'] = traceback.format_exc()
finally:
    cleanup_errors = []
    if CONTAINER:
        try:
            info = owned()
            for database in DATABASES:
                assert re.fullmatch(r'qa_fixture_[78]_[a-f0-9]{32}', database)
                query('postgres', f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)')
            report['cleanup']['remainingOwnedDatabases'] = rows('postgres', f"SELECT datname FROM pg_database WHERE datname IN ({','.join(repr(d) for d in DATABASES) or repr('')})")
            report['cleanup']['remainingOwnedSessions'] = rows('postgres', f"SELECT datname,pid FROM pg_stat_activity WHERE datname IN ({','.join(repr(d) for d in DATABASES) or repr('')})")
            assert not report['cleanup']['remainingOwnedDatabases'] and not report['cleanup']['remainingOwnedSessions'], 'owned database/session remains'
        except BaseException as exc:
            cleanup_errors.append(f'database cleanup: {exc}')
        try:
            info = owned()
            report['cleanup']['verifiedBeforeRemove'] = {'id': info['Id'], 'owner': info['Config']['Labels']['qa.owner'], 'createdAt': info['Created'], 'anonymousVolumes': VOLUMES}
            docker('rm', '--force', '--volumes', CONTAINER)
            absent = docker('inspect', CONTAINER, ok=False)
            report['cleanup']['containerAbsenceEvidence'] = {'exitCode': absent.returncode, 'stdout': absent.stdout.decode(), 'stderr': absent.stderr.decode()}
            assert absent.returncode != 0 and b'no such object' in absent.stderr.lower(), 'container absence not confirmed'
            report['cleanup']['containerRemoved'] = True
            remaining = []
            for volume in VOLUMES:
                result = docker('volume', 'inspect', volume, ok=False)
                if result.returncode == 0:
                    remaining.append(volume)
                else:
                    assert b'no such volume' in result.stderr.lower()
            report['cleanup']['remainingOwnedVolumes'] = remaining
            assert not remaining, 'owned volume remains'
        except BaseException as exc:
            cleanup_errors.append(f'container cleanup: {exc}')
            report['cleanup']['traceback'] = traceback.format_exc()
    else:
        report['cleanup']['noResourcesCreated'] = True
    report['cleanup']['errors'] = cleanup_errors
    report['cleanup']['completed'] = not cleanup_errors
    report['finishedAt'] = now()
    report['status'] = 'REVIEWED' if error is None and not cleanup_errors else 'BLOCKED'
    write_json(RUN / 'review.json', report)

if report['status'] != 'REVIEWED':
    raise SystemExit(json.dumps({'status': report['status'], 'report': str(RUN / 'review.json'), 'error': report.get('error'), 'cleanupErrors': report['cleanup']['errors']}))

fixture_dir = QA / 'fixtures' / '20261001-0af6443'
fixture_dir.mkdir(parents=True, exist_ok=True)
reference = str((RUN / 'review.json').relative_to(QA))
bindings = {}
for kind, filename, schema, prep, prod, migrations in prepared:
    destination = fixture_dir / filename
    destination.write_bytes((RUN / filename).read_bytes())
    manifest = {key: prep[key] for key in ['version', 'artifactId', 'kind', 'source', 'dump', 'expected']}
    manifest['artifactId'] += '-qa-reviewed-0af6443'
    manifest['candidateRevision'] = CANDIDATE
    manifest['source']['producer'] += '@fa6bd5f;sha256=' + report['producerProvenance']['actualScriptSha256']
    manifest['review'] = {'reviewer': report['reviewer'], 'reference': reference, 'reviewedAt': report['finishedAt']}
    manifest['dump']['path'] = str(destination.relative_to(QA))
    manifest_path = fixture_dir / f'{kind}.json'
    write_json(manifest_path, manifest)
    bindings['legacySchema' if schema == 7 else 'directoryPrecision'] = {'manifest': str(manifest_path.relative_to(QA)), 'sha256': sha(manifest_path.read_bytes())}
configuration = {'version': 1, 'artifacts': bindings, 'observation': None}
config_path = QA / 'config' / 'fixtures.integration-0af6443.json'
write_json(config_path, configuration)
binding = {'fixtureArtifacts': {'configPath': str(config_path.relative_to(QA)), 'sha256': sha(config_path.read_bytes())}}
write_json(QA / 'config' / 'fixture-binding.integration-0af6443.json', binding)
write_json(HERE / 'latest-review.json', {'review': reference, 'status': 'REVIEWED', 'candidateRevision': CANDIDATE, **binding})
print(json.dumps({'status': 'REVIEWED', 'review': reference, **binding}, ensure_ascii=False), flush=True)
