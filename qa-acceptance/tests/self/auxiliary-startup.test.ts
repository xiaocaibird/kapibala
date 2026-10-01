import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { QaEnvironment } from '../../harness/environment.js';
import {
  FixtureCandidate,
  loadUnmigratedSchema,
  assessUnmigratedSchema,
  type UnmigratedSchemaFixture,
} from '../../harness/fixture-artifacts.js';
import { launchOwnedDatabase, observeOwnedStartupRejection } from '../../harness/recovery-drill.js';
import { exec, OwnedProcess, isolatedEnv } from '../../harness/process.js';
import { availablePort } from '../../harness/network.js';
import { PlatformClient } from '../../harness/platform-client.js';
import { targetFingerprint } from '../../harness/security.js';
import type { OwnedDatabaseCluster } from '../../harness/database.js';
import type { TargetConfig } from '../../harness/types.js';
const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const database = `qa_${'a'.repeat(24)}`;
const marker = 'Schema mismatch: installed=0, required=8; run npm run db:migrate';
const control = { ok: true, schemaVersion: 8 };
const profile: UnmigratedSchemaFixture = {
  confirmed: true,
  candidateRevision: 'a'.repeat(40),
  reviewReference: 'self:synthetic-public-diagnostic',
  controlSchemaVersion: 8,
  rejectionLogIncludes: [marker],
};
const nodeChild = `const fs=require('node:fs');
const keys=['DATABASE_URL','PORT','GATEWAY_URL','AGENT_URL','QA_CAPACITY_REGISTRY_DIR','QA_RUNTIME_REGISTRY_DIR','QA_MESSAGE_REGISTRY_DIR'];
const out=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
out.tokenIsUuid=/^[a-f0-9-]{36}$/.test(process.env.QA_ACCEPTANCE_RESOURCE_TOKEN||'');
out.tokenSha=require('node:crypto').createHash('sha256').update(process.env.QA_ACCEPTANCE_RESOURCE_TOKEN||'').digest('hex');
out.portArgument=process.argv[2];out.ambientSecret=process.env.QA_AMBIENT_SELF_SECRET;
fs.writeFileSync(process.env.QA_SELF_REPORT,JSON.stringify(out));
if(process.env.QA_SELF_MODE==='serve') require('node:http').createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,schemaVersion:8}));}).listen(Number(process.env.PORT),'127.0.0.1');
else {console.error(${JSON.stringify(marker)});process.exit(17);}`;
async function mockWorkspace(t: { after(fn: () => Promise<void>): void }, mode = 'reject') {
  // Self-owned mock repository and child; no product modules or DB/service connections.
  const root = await realpath(await mkdtemp('/tmp/qaa-')),
    saved = { ...process.env };
  for (const k of [
    'QA_EXECUTION_AUTHORIZATION',
    'QA_EXECUTION_KIND',
    'QA_EXECUTION_SUITE_ID',
    'QA_EXECUTION_SUITE_SHA256',
    'QA_EXECUTION_BUSINESS_SHA256',
    'QA_FIXTURE_CONFIG',
  ])
    delete process.env[k];
  t.after(async () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    await rm(root, { recursive: true, force: true });
  });
  process.env.QA_MESSAGE_REGISTRY_DIR = '/untrusted-ambient-registry';
  process.env.QA_AMBIENT_SELF_SECRET = 'must-not-reach-child';
  const primary = resolve(root, 'primary'),
    sut = resolve(root, 'sut');
  await mkdir(primary);
  await writeFile(resolve(primary, 'child.cjs'), nodeChild);
  await exec('git', ['init', '-q'], { cwd: primary });
  await exec('git', ['add', 'child.cjs'], { cwd: primary });
  await exec(
    'git',
    [
      '-c',
      'user.name=QA self test',
      '-c',
      'user.email=qa-self@invalid',
      'commit',
      '-qm',
      'owned mock child only',
    ],
    { cwd: primary },
  );
  await exec('git', ['worktree', 'add', '--detach', '-q', sut, 'HEAD'], { cwd: primary });
  const revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: sut })).stdout.trim();
  const dirs = {
    capacity: resolve(root, 'c'),
    runtime: resolve(root, 'r'),
    message: resolve(root, 'm'),
  };
  for (const dir of Object.values(dirs)) await mkdir(dir, { mode: 0o700 });
  const report = resolve(root, 'child-output.json');
  const target = JSON.parse(
    await readFile(resolve(qaRoot, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  target.sut = {
    ...target.sut,
    cwd: sut,
    revision,
    start: { command: process.execPath, args: ['child.cjs', '{API_PORT}'] },
    env: { QA_SELF_REPORT: report, QA_SELF_MODE: mode },
    startupTimeoutMs: 3000,
  };
  target.adapters = {
    capacityControl: {
      url: 'http://127.0.0.1:32001',
      contractReference: 'self:mock-only',
      registryDirectory: dirs.capacity,
    },
    runtimeObservation: {
      url: 'http://127.0.0.1:32002',
      contractReference: 'self:mock-only',
      registryDirectory: dirs.runtime,
    },
    messageObservation: {
      url: 'http://127.0.0.1:32003',
      contractReference: 'self:mock-only',
      registryDirectory: dirs.message,
    },
  };
  const auth = resolve(root, 'self-only-authorization.json');
  await writeFile(
    auth,
    JSON.stringify({
      version: 1,
      approvedBy: 'QA tooling self-test; mock child only',
      approvalReference: 'self:no-product-no-database',
      approvedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      sutDirectory: sut,
      sutRevision: revision,
      targetSha256: targetFingerprint(target),
      scope: 'all-required',
      allowedActions: [
        'start-isolated-sut',
        'create-owned-database',
        'fault-injection',
        'kill-owned-process',
        'browser-automation',
      ],
    }),
  );
  process.env.QA_EXECUTION_AUTHORIZATION = auth;
  const dropped: string[] = [];
  const cluster = {
    ownsDatabase: (name: string) => name === database,
    url: (name: string) => {
      assert.equal(name, database);
      return `postgres://qa:synthetic-password@127.0.0.1:32004/${name}`;
    },
    dropDatabase: async (name: string) => {
      assert.equal(name, database);
      dropped.push(name);
    },
  } as unknown as OwnedDatabaseCluster;
  return { root, target, cluster, dirs, report, dropped };
}
function verifyChild(
  value: Record<string, unknown>,
  dirs: { capacity: string; runtime: string; message: string },
) {
  assert.equal(value.QA_CAPACITY_REGISTRY_DIR, dirs.capacity);
  assert.equal(value.QA_RUNTIME_REGISTRY_DIR, dirs.runtime);
  assert.equal(value.QA_MESSAGE_REGISTRY_DIR, dirs.message);
  assert.equal(value.DATABASE_URL, `postgres://qa:synthetic-password@127.0.0.1:32004/${database}`);
  assert.equal(value.portArgument, value.PORT);
  assert.equal(value.tokenIsUuid, true);
  assert.match(String(value.tokenSha), /^[a-f0-9]{64}$/);
  assert.equal(value.ambientSecret, undefined);
  assert.match(String(value.GATEWAY_URL), /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(String(value.AGENT_URL), /^http:\/\/127\.0\.0\.1:\d+$/);
}
test('owned DB probe delivers all three registries, its token and isolated DB/port to real mock child', async (t) => {
  const f = await mockWorkspace(t),
    qa = new QaEnvironment(f.target, f.cluster, resolve(f.root, 'evidence'));
  Reflect.set(qa, 'database', database); // Simulated fixture storage; no DB is created/contacted.
  await qa.gateway.start();
  await qa.agent.start();
  t.after(async () => {
    await qa.gateway.close();
    await qa.agent.close();
  });
  await assert.rejects(qa.ownedDatabaseEnvironment('production', 32005), /未持有/);
  const authorization = process.env.QA_EXECUTION_AUTHORIZATION;
  delete process.env.QA_EXECUTION_AUTHORIZATION;
  await assert.rejects(qa.ownedDatabaseEnvironment(database, 32005), /尚未授权/);
  process.env.QA_EXECUTION_AUTHORIZATION = authorization;
  const probe = await launchOwnedDatabase(qa, database);
  try {
    const observed = await observeOwnedStartupRejection(probe.process, probe.api.baseUrl, 3000);
    assert.deepEqual(observed.exit, { code: 17, signal: null });
    assert.equal(observed.ready, false);
    assert.ok(observed.log.includes(marker));
    const child = JSON.parse(await readFile(f.report, 'utf8'));
    verifyChild(child, f.dirs);
    const env = await qa.ownedDatabaseEnvironment(database, Number(child.PORT));
    assert.equal(child.tokenSha, hash(env.QA_ACCEPTANCE_RESOURCE_TOKEN!));
  } finally {
    await probe.close();
  }
});
for (const mode of ['reject', 'serve'])
  test(`fixture ${mode} launches real mock child with observers and own token`, async (t) => {
    const f = await mockWorkspace(t, mode),
      candidate = new FixtureCandidate(f.target, f.cluster, resolve(f.root, 'evidence'));
    candidate.database = database;
    const port = await availablePort();
    Reflect.set(candidate, 'port', port);
    candidate.api = new PlatformClient(`http://127.0.0.1:${port}`);
    try {
      candidate.database = 'foreign-database';
      await assert.rejects(candidate.start(), /未持有/);
      candidate.database = database;
      await candidate.gateway.start();
      await candidate.agent.start();
      if (mode === 'reject') {
        const observed = await candidate.observeRejection();
        assert.equal(observed.ready, false);
        assert.deepEqual(observed.exit, { code: 17, signal: null });
        assert.ok(observed.log.includes(marker));
      } else {
        await candidate.start();
        assert.equal((await candidate.api.get('/api/health')).status, 200);
      }
      verifyChild(JSON.parse(await readFile(f.report, 'utf8')), f.dirs);
    } finally {
      await candidate.close();
    }
    assert.deepEqual(f.dropped, [database]);
  });
test('schema assessment distinguishes explicit refusal from crashes, external kills, timeouts and wrong controls', () => {
  const valid = { ready: false, exit: { code: 17, signal: null }, log: marker };
  assert.equal(assessUnmigratedSchema(profile, control, control, valid).status, 'PASS');
  for (const observation of [
    { ...valid, log: 'MODULE_NOT_FOUND schema-controller.ts' },
    { ...valid, log: 'ECONNREFUSED database' },
    { ...valid, log: marker.replace('installed=0', 'installed=7') },
    { ...valid, exit: undefined },
    { ...valid, exit: { code: null, signal: 'SIGTERM' as const } },
    { ...valid, exit: { code: null, signal: null } },
  ])
    assert.equal(assessUnmigratedSchema(profile, control, control, observation).status, 'BLOCKED');
  assert.equal(
    assessUnmigratedSchema(profile, control, { ok: true, schemaVersion: 7 }, valid).status,
    'BLOCKED',
  );
  assert.equal(
    assessUnmigratedSchema(profile, { ok: false, schemaVersion: 8 }, control, valid).status,
    'BLOCKED',
  );
  assert.equal(
    assessUnmigratedSchema(profile, control, control, { ...valid, ready: true }).status,
    'FAIL',
  );
});
test('live mock timeout cannot borrow cleanup SIGTERM as a spontaneous schema refusal', async (t) => {
  const root = await realpath(await mkdtemp('/tmp/qao-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await availablePort();
  const child = new OwnedProcess(
    {
      command: process.execPath,
      args: ['-e', `console.error(${JSON.stringify(marker)});setInterval(()=>{},1000);`],
    },
    root,
    isolatedEnv({}),
    resolve(root, 'out.log'),
  );
  try {
    await child.start();
    const observed = await observeOwnedStartupRejection(child, `http://127.0.0.1:${port}`, 150);
    assert.equal(observed.exit, undefined);
    assert.equal(assessUnmigratedSchema(profile, control, control, observed).status, 'BLOCKED');
  } finally {
    await child.stop();
  }
});
test('schema profile requires exact candidate, reviewed markers and bound bytes, while old fixtures remain optional', async (t) => {
  const root = await realpath(await mkdtemp('/tmp/qap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = JSON.parse(
    await readFile(resolve(qaRoot, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  target.sut.revision = profile.candidateRevision;
  async function bind(value: unknown) {
    const text = JSON.stringify({
      version: 1,
      artifacts: { legacySchema: null, directoryPrecision: null },
      observation: null,
      unmigratedSchema: value,
    });
    await writeFile(resolve(root, 'fixtures.json'), text);
    target.adapters = { fixtureArtifacts: { configPath: 'fixtures.json', sha256: hash(text) } };
  }
  await bind(undefined);
  await assert.rejects(loadUnmigratedSchema(root, target), /尚未审核/);
  await bind(profile);
  assert.equal((await loadUnmigratedSchema(root, target)).controlSchemaVersion, 8);
  await writeFile(resolve(root, 'fixtures.json'), '{}');
  await assert.rejects(loadUnmigratedSchema(root, target), /哈希/);
  for (const invalid of [
    { ...profile, candidateRevision: 'b'.repeat(40) },
    { ...profile, confirmed: false },
    { ...profile, rejectionLogIncludes: [] },
    { ...profile, rejectionLogIncludes: ['MODULE_NOT_FOUND'] },
    { ...profile, rejectionLogIncludes: ['schema\nmessage'] },
    { ...profile, reviewReference: '' },
    { ...profile, controlSchemaVersion: null },
  ]) {
    await bind(invalid);
    await assert.rejects(loadUnmigratedSchema(root, target));
  }
});
