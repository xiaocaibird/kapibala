import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';
import {
  redact,
  targetFingerprint,
  validateAuthorization,
  loadTarget,
  requireAuthorization,
  BlockedError,
  isWithin,
} from '../../harness/security.js';
import { OwnedProcess, isolatedEnv, waitHttp } from '../../harness/process.js';
import { BrowserProxy, DatabaseProxy, requestPath } from '../../harness/network.js';
import { ownedDatabaseName, OwnedDatabaseCluster } from '../../harness/database.js';
import { aggregateResults, verdict, writeReport } from '../../harness/report.js';
import { caseProjects } from '../../harness/catalog.js';
import { PlatformClient } from '../../harness/platform-client.js';
import { recordManual, readManualEvents } from '../../harness/manual.js';
import { snapshotQaTree, reportDirectory } from '../../harness/provenance.js';
import type {
  TargetConfig,
  Authorization,
  CaseDefinition,
  CaseResult,
  Requirement,
} from '../../harness/types.js';
const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
async function temporary(t: { after(fn: () => Promise<void>): void }): Promise<string> {
  await mkdir(resolve(qaRoot, '.runtime'), { recursive: true });
  const dir = await mkdtemp(resolve(qaRoot, '.runtime/self-infra-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function config(): Promise<TargetConfig> {
  const c = JSON.parse(
    await readFile(resolve(qaRoot, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  c.sut.cwd = qaRoot;
  c.sut.revision = 'a'.repeat(40);
  return c;
}
function authorization(c: TargetConfig, now = Date.now()): Authorization {
  return {
    version: 1,
    approvedBy: 'selftest fictional reviewer',
    approvalReference: 'SELF TEST ONLY - no product authorization',
    approvedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    sutRevision: c.sut.revision,
    sutDirectory: c.sut.cwd,
    targetSha256: targetFingerprint(c),
    allowedActions: [
      'start-isolated-sut',
      'create-owned-database',
      'fault-injection',
      'kill-owned-process',
      'browser-automation',
    ],
    scope: 'all-required',
  };
}
function definition(id = 'SELF-001', patch: Partial<CaseDefinition> = {}): CaseDefinition {
  return {
    id,
    title: 'selftest only',
    requirements: ['R-SELF'],
    priority: 'P1',
    mode: 'automated',
    preconditions: ['dummy only'],
    data: {},
    steps: ['selftest'],
    expected: ['correct'],
    timing: [],
    faults: [],
    evidence: ['dummy'],
    cleanup: ['owned files'],
    automation: 'tests/system/self.spec.ts',
    ...patch,
  };
}
const result = (
  id: string,
  status: CaseResult['status'] = 'PASS',
  project = 'system',
): CaseResult => ({ id, status, project, evidence: ['dummy.txt'], durationMs: 1 });
const requirement = (id: string, scope: Requirement['scope'] = 'required'): Requirement => ({
  id,
  title: id,
  source: { path: 'selftest' },
  expectation: 'selftest only',
  scope,
});
async function dummyHttp(
  t: { after(fn: () => Promise<void>): void },
  handler: http.RequestListener,
): Promise<{ url: string; port: number }> {
  const server = http.createServer(handler);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as net.AddressInfo).port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((ok, bad) => server.close((e) => (e ? bad(e) : ok())));
  });
  return { url: `http://127.0.0.1:${port}`, port };
}

test('redaction covers headers, nested raw JSON, query secrets and database URLs', () => {
  const text = redact({
    headers: {
      cookie: 'dummy-cookie',
      'set-cookie': 'dummy-refresh',
      authorization: 'Bearer dummy-access',
    },
    responseBody: '{"accessToken":"dummy-body","refresh_token":"dummy-r"}',
    url: 'http://127.0.0.1/a?token=dummy-q&x=ok',
    database: 'postgres://qa:dummy-db@127.0.0.1:123/a',
    command: ['POSTGRES_PASSWORD=dummy-env'],
    ownerToken: 'dummy-owner',
    nested: '{"ownerToken":"dummy-nested-owner","QA_ACCEPTANCE_RESOURCE_TOKEN":"dummy-resource"}',
  });
  for (const secret of [
    'dummy-cookie',
    'dummy-refresh',
    'dummy-access',
    'dummy-body',
    'dummy-r',
    'dummy-q',
    'dummy-db',
    'dummy-env',
    'dummy-owner',
    'dummy-nested-owner',
    'dummy-resource',
  ])
    assert.ok(!text.includes(secret), secret);
  assert.match(text, /x=ok/);
  assert.doesNotThrow(() => JSON.parse(text));
});
test('authorization binds normalized full target and rejects mutation/expiry/missing actions', async () => {
  const c = await config(),
    a = authorization(c),
    now = Date.now();
  validateAuthorization(a, c);
  assert.equal(targetFingerprint(c), targetFingerprint(JSON.parse(JSON.stringify(c))));
  const changed = structuredClone(c);
  changed.sut.start.args.push('--unreviewed');
  assert.throws(() => validateAuthorization(a, changed), BlockedError);
  const headed = structuredClone(c);
  headed.ui.headless = false;
  assert.notEqual(targetFingerprint(headed), targetFingerprint(c));
  assert.throws(() => validateAuthorization(a, headed), BlockedError);
  for (const patch of [
    { approvedBy: ' ' },
    { approvalReference: 'REQUIRED' },
    { expiresAt: new Date(now - 1).toISOString() },
    { approvedAt: new Date(now + 10000).toISOString() },
    { allowedActions: [] },
    { sutDirectory: '/other' },
    { targetSha256: '' },
  ])
    assert.throws(() => validateAuthorization({ ...a, ...patch }, c, now), BlockedError);
});
test('missing authorization refuses before reading target git or connecting anywhere', async () => {
  const old = process.env.QA_EXECUTION_AUTHORIZATION;
  delete process.env.QA_EXECUTION_AUTHORIZATION;
  try {
    const c = await config();
    c.sut.cwd = '/does/not/exist';
    await assert.rejects(requireAuthorization(c), /尚未授权/);
  } finally {
    if (old === undefined) delete process.env.QA_EXECUTION_AUTHORIZATION;
    else process.env.QA_EXECUTION_AUTHORIZATION = old;
  }
});
test('target blocks injected database env, Node hooks, external routes and empty commands', async (t) => {
  const dir = await temporary(t),
    file = resolve(dir, 'target.json');
  for (const alter of [
    (c: TargetConfig) => {
      c.sut.env.PGHOST = 'example.test';
    },
    (c: TargetConfig) => {
      c.ui.routes.login = '//example.test';
    },
    (c: TargetConfig) => {
      (c.ui as unknown as Record<string, unknown>).headless = 'false';
    },
    (c: TargetConfig) => {
      c.sut.start.command = '';
    },
    (c: TargetConfig) => {
      c.sut.env.NODE_OPTIONS = '--import other.js';
    },
    (c: TargetConfig) => {
      c.sut.env.QA_ACCEPTANCE_RESOURCE_TOKEN = 'caller-controlled-ownership';
    },
  ]) {
    const c = await config();
    c.sut.cwd = dir;
    alter(c);
    await writeFile(file, JSON.stringify(c));
    await assert.rejects(loadTarget(file, qaRoot), BlockedError);
  }
});
test('capacity endpoint is loopback, versioned and bound by target authorization', async (t) => {
  const dir = await temporary(t);
  const file = resolve(dir, 'target.json');
  for (const url of [
    'not a URL',
    'http://example.test:9',
    'http://127.0.0.1',
    'http://user:pass@127.0.0.1:8',
    'http://127.0.0.1:8/other',
    'http://127.0.0.1:8/?secret=a',
  ]) {
    const c = await config();
    c.adapters = { capacityControl: { url, contractReference: 'test-only-contract' } };
    await writeFile(file, JSON.stringify(c));
    await assert.rejects(loadTarget(file, qaRoot), BlockedError);
  }
  const c = await config();
  c.adapters = {
    capacityControl: { url: 'http://127.0.0.1:39001/', contractReference: 'test-only-contract' },
  };
  await writeFile(file, JSON.stringify(c));
  const loaded = await loadTarget(file, qaRoot);
  const approval = authorization(loaded);
  loaded.adapters!.capacityControl!.url = 'http://127.0.0.1:39002/';
  assert.throws(() => validateAuthorization(approval, loaded), BlockedError);
});
test('preparation report distinguishes implemented scripts, missing integration and user decisions', async (t) => {
  const dir = await temporary(t);
  const entries = [
    definition('SELF-001', {
      preparation: { state: 'script-ready', owner: 'QA', details: ['script only'] },
    }),
    definition('SELF-002', {
      preparation: {
        state: 'dependency-pending',
        owner: 'engineering',
        details: ['controller absent'],
      },
    }),
    definition('SELF-003', {
      mode: 'blocked',
      automation: undefined,
      blocker: 'business policy',
      preparation: {
        state: 'decision-pending',
        owner: 'user',
        details: ['choose failed step policy'],
      },
    }),
  ];
  await writeReport(dir, [requirement('R-SELF')], entries, [], { phase: 'preparation' });
  const report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.metrics.automated, 2);
  assert.equal(report.metrics.blockedDesign, 1);
  assert.equal(report.metrics.preparationReadiness.trackedCases, 3);
  assert.equal(report.metrics.preparationReadiness.dependenciesPending, 1);
  assert.equal(report.metrics.preparationReadiness.decisionsPending, 1);
  assert.equal(report.metrics.preparationReadiness.scriptReady, 1);
  assert.equal(report.conclusions.unconditionalPass, false);
  assert.ok(report.results.every((result: { status: string }) => result.status === 'NOT_RUN'));
  const markdown = await readFile(resolve(dir, 'acceptance.md'), 'utf8');
  assert.match(markdown, /controller absent/);
  assert.match(markdown, /业务口径待决 1/);
});
test('process environment drops inherited DB and Node hook values', () => {
  const old = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://demo';
  try {
    const env = isolatedEnv({ PORT: '123' });
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.PORT, '123');
    assert.equal(env.NODE_OPTIONS, undefined);
  } finally {
    if (old === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = old;
  }
});
test('owned process drains output, reports exit failure, cleans missing command', async (t) => {
  const dir = await temporary(t);
  const ok = new OwnedProcess(
    { command: process.execPath, args: ['-e', 'console.log("own output")'] },
    dir,
    isolatedEnv({}),
    resolve(dir, 'ok.log'),
  );
  await ok.runOnce();
  await ok.stop();
  assert.match(await readFile(resolve(dir, 'ok.log'), 'utf8'), /own output/);
  const fail = new OwnedProcess(
    { command: process.execPath, args: ['-e', 'process.exit(7)'] },
    dir,
    isolatedEnv({}),
    resolve(dir, 'fail.log'),
  );
  await assert.rejects(fail.runOnce(), /命令失败\(7\)/);
  assert.deepEqual(fail.exitOutcome, { code: 7, signal: null });
  const outcome = fail.exitOutcome!;
  outcome.code = 0;
  assert.equal(fail.exitOutcome?.code, 7);
  const missing = new OwnedProcess(
    { command: resolve(dir, 'missing-command'), args: [] },
    dir,
    isolatedEnv({}),
    resolve(dir, 'missing.log'),
  );
  await assert.rejects(missing.start(), /ENOENT/);
  await missing.stop();
});
test('owned timeout kills only the guardian process group', async (t) => {
  const dir = await temporary(t);
  const p = new OwnedProcess(
    { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
    dir,
    isolatedEnv({}),
    resolve(dir, 'timeout.log'),
  );
  await assert.rejects(p.runOnce(40), /命令超时/);
  assert.equal(p.pid, undefined);
  await p.stop();
});
test('colliding unrelated listener receives no health request', async (t) => {
  let hits = 0;
  const server = await dummyHttp(t, (_q, r) => {
    hits++;
    r.end('ok');
  });
  const dir = await temporary(t);
  const owner = new OwnedProcess(
    { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
    dir,
    isolatedEnv({}),
    resolve(dir, 'owner.log'),
  );
  await owner.start();
  t.after(() => owner.stop());
  await assert.rejects(waitHttp(server.url, 500, owner), /非本轮|无法用lsof/);
  assert.equal(hits, 0);
});
test('health probes do not follow redirects', async (t) => {
  let redirected = 0;
  const foreign = await dummyHttp(t, (_q, r) => {
    redirected++;
    r.end('ok');
  });
  const local = await dummyHttp(t, (_q, r) => {
    r.writeHead(302, { location: foreign.url });
    r.end();
  });
  await assert.rejects(waitHttp(local.url, 200), /就绪超时/);
  assert.equal(redirected, 0);
  await assert.rejects(waitHttp('https://example.test', 100), /loopback/);
});
test('browser proxy separates API/web and denies unreviewed proxy paths', async (t) => {
  const api = await dummyHttp(t, (_q, r) => r.end('owned-api'));
  let webHits = 0;
  const web = await dummyHttp(t, (_q, r) => {
    webHits++;
    r.end('owned-web');
  });
  const proxy = new BrowserProxy(api.port, web.port);
  await proxy.start();
  t.after(() => proxy.close());
  assert.equal(await (await fetch(`${proxy.url}/api/health`)).text(), 'owned-api');
  assert.equal(await (await fetch(`${proxy.url}/%61pi/health`)).text(), 'owned-api');
  assert.equal(await (await fetch(`${proxy.url}/`)).text(), 'owned-web');
  assert.equal((await fetch(`${proxy.url}/unreviewed-proxy`)).status, 403);
  assert.equal(await (await fetch(`${proxy.url}/@react-refresh`)).text(), 'owned-web');
  assert.equal((await fetch(`${proxy.url}/@react-refresh/unreviewed-proxy`)).status, 403);
  assert.equal(webHits, 2);
  for (const path of [
    'http://example.test/',
    '//example.test',
    '/%2fexample.test',
    '/\\example.test',
  ])
    assert.throws(() => requestPath(path));
});
test('database proxy interrupts owned dummy TCP without a real database', async (t) => {
  const server = net.createServer((s) => s.pipe(s));
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const clients: net.Socket[] = [];
  t.after(async () => {
    for (const c of clients) c.destroy();
    await new Promise<void>((ok) => server.close(() => ok()));
  });
  const proxy = new DatabaseProxy((server.address() as net.AddressInfo).port);
  await proxy.start();
  t.after(() => proxy.close());
  const first = net.connect(proxy.port, '127.0.0.1');
  clients.push(first);
  await new Promise<void>((ok) => first.once('connect', ok));
  const echo = new Promise<string>((ok) => first.once('data', (b) => ok(b.toString())));
  first.write('owned');
  assert.equal(await echo, 'owned');
  const closed = new Promise<void>((ok) => first.once('close', () => ok()));
  proxy.interrupt();
  await closed;
  proxy.restore();
  const second = net.connect(proxy.port, '127.0.0.1');
  clients.push(second);
  await new Promise<void>((ok) => second.once('connect', ok));
  second.destroy();
  await proxy.close();
});
test('database name and ownership guards reject demo/default without starting Docker', async () => {
  assert.equal(ownedDatabaseName('kapibala'), false);
  assert.equal(ownedDatabaseName('qa_' + 'a'.repeat(24)), true);
  const cluster = new OwnedDatabaseCluster('postgres:17-alpine');
  assert.equal(cluster.ownsDatabase('qa_' + 'a'.repeat(24)), false);
  await assert.rejects(cluster.dropDatabase('kapibala'), /拒绝删除/);
  assert.throws(() => cluster.url(), /尚无/);
});
test('HTTP recorder inherits login/as and strips request/response credentials', async (t) => {
  const events: Record<string, unknown>[] = [];
  const server = await dummyHttp(t, (_q, r) => {
    r.setHeader('content-type', 'application/json');
    r.setHeader('set-cookie', 'refreshToken=dummy-cookie; HttpOnly');
    r.end(JSON.stringify({ accessToken: 'dummy-token', ok: true }));
  });
  const client = new PlatformClient(server.url, {
    recorder: async (e) => {
      events.push(e);
    },
  });
  await client.login();
  await client.get('/api/example?token=dummy-query');
  await client.as('viewer');
  assert.equal(events.length, 6);
  assert.equal(events[0]?.phase, 'request');
  assert.equal(events[1]?.phase, 'response');
  const text = JSON.stringify(events);
  for (const token of ['dummy-cookie', 'dummy-token', 'dummy-query'])
    assert.ok(!text.includes(token), token);
  assert.match(text, /REDACTED/);
  await assert.rejects(client.get('http://localhost:5173/api/groups'), /跨origin/);
  await assert.rejects(client.get('//127.0.0.1:5173/api/groups'), /跨origin/);
  assert.throws(() => new PlatformClient('http://localhost:5173'), /explicit loopback/);
});
test('unknown or empty project declarations cannot certify coverage', () => {
  assert.throws(() => caseProjects(definition('SELF', { data: { projects: [] } })));
  assert.throws(() => caseProjects(definition('SELF', { data: { projects: ['other'] } })));
  assert.deepEqual(caseProjects(definition('SELF', { mode: 'manual' })), ['manual']);
});
test('missing browser, unknown project and failed attempts never turn green', () => {
  const c = definition('SELF', { data: { projects: ['chromium', 'webkit-smoke'] } });
  assert.equal(aggregateResults([c], [result('SELF', 'PASS', 'chromium')])[0]?.status, 'NOT_RUN');
  assert.equal(
    aggregateResults(
      [c],
      [
        result('SELF', 'PASS', 'chromium'),
        result('SELF', 'PASS', 'webkit-smoke'),
        result('SELF', 'PASS', 'fake'),
      ],
    )[0]?.status,
    'BLOCKED',
  );
  assert.equal(
    aggregateResults(
      [c],
      [result('SELF', 'FAIL', 'chromium'), result('SELF', 'PASS', 'webkit-smoke')],
    )[0]?.status,
    'FAIL',
  );
  assert.equal(
    aggregateResults([definition()], [result('SELF-001', 'FAIL'), result('SELF-001', 'PASS')])[0]
      ?.status,
    'FAIL',
  );
});
test('duplicate results cannot replace missing required IDs', () => {
  assert.equal(
    verdict([definition('A'), definition('B')], [result('A'), result('A')]),
    'INCOMPLETE',
  );
  assert.equal(verdict([], []), 'INCOMPLETE');
});
test('preparation ignores all supplied product events', async (t) => {
  const dir = await temporary(t);
  await writeReport(dir, [requirement('R-SELF')], [definition()], [result('SELF-001')], {
    phase: 'preparation',
  });
  const report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.results[0].status, 'NOT_RUN');
  assert.equal(report.metrics.counts.PASS, 0);
  assert.equal(report.conclusions.unconditionalPass, false);
});
test('runner global errors and unknown failures prevent unconditional passing', async (t) => {
  const dir = await temporary(t),
    cases = [definition('A'), definition('B', { requirements: ['REL-SELF'] })],
    reqs = [requirement('R-SELF'), requirement('REL-SELF', 'release')];
  await writeReport(dir, reqs, cases, [result('A'), result('B')], {
    phase: 'execution',
    runnerStatus: 'failed',
  });
  let report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.conclusions.unconditionalPass, false);
  assert.equal(report.conclusions.functionality, 'INCOMPLETE');
  await writeReport(dir, reqs, cases, [result('A'), result('B'), result('UNKNOWN', 'FAIL')], {
    phase: 'execution',
  });
  report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.conclusions.functionality, 'INCOMPLETE');
  assert.equal(report.conclusions.release, 'INCOMPLETE');
  assert.equal(report.conclusions.unconditionalPass, false);
});
test('report writer rejects symlink file overwrite', async (t) => {
  const dir = await temporary(t),
    outside = resolve(dir, 'outside.txt');
  await writeFile(outside, 'keep');
  const out = resolve(dir, 'report');
  await mkdir(out);
  await symlink(outside, resolve(out, 'results.json'));
  await assert.rejects(
    writeReport(out, [requirement('R-SELF')], [definition()], [], { phase: 'preparation' }),
  );
  assert.equal(await readFile(outside, 'utf8'), 'keep');
});
test('QA tree hash covers authored files and excludes runtime outputs', async (t) => {
  const dir = await temporary(t);
  await writeFile(resolve(dir, 'asset.ts'), 'a');
  const before = await snapshotQaTree(dir);
  await mkdir(resolve(dir, '.runtime'));
  await writeFile(resolve(dir, '.runtime/temporary'), 'ignored');
  assert.equal((await snapshotQaTree(dir)).sha256, before.sha256);
  await writeFile(resolve(dir, 'asset.ts'), 'b');
  assert.notEqual((await snapshotQaTree(dir)).sha256, before.sha256);
});
test('report directory rejects traversal and symlink parents', async (t) => {
  const dir = await temporary(t);
  assert.equal(isWithin(dir, resolve(dir, '../other')), false);
  await assert.rejects(reportDirectory(dir, '../outside', true), /专属reports/);
  await mkdir(resolve(dir, 'real'));
  await symlink(resolve(dir, 'real'), resolve(dir, 'reports'));
  await assert.rejects(reportDirectory(dir, 'reports/run', true), /符号链接/);
});
test('manual review requires evidence, preserves automation, and appends audit', async (t) => {
  const dir = await temporary(t),
    now = Date.now();
  await writeFile(
    resolve(dir, 'manifest.json'),
    JSON.stringify({ phase: 'execution', startedAt: new Date(now - 10000).toISOString() }),
  );
  await writeFile(resolve(dir, 'events.json'), '[]');
  await writeFile(resolve(dir, 'proof.txt'), 'actual observation');
  const review = {
    caseId: 'M',
    status: 'PASS' as const,
    actual: 'observed by dummy reviewer',
    reviewer: 'selftest',
    performedAt: new Date(now - 1000).toISOString(),
    evidence: ['proof.txt'],
  };
  await assert.rejects(recordManual(dir, [definition('M')], review, now), /不能手填/);
  await assert.rejects(
    recordManual(dir, [definition('M', { mode: 'blocked' })], review, now),
    /clarificationResolution/,
  );
  await assert.rejects(
    recordManual(dir, [definition('M', { mode: 'manual' })], { ...review, evidence: [] }, now),
    /非空证据/,
  );
  const event = await recordManual(dir, [definition('M', { mode: 'manual' })], review, now);
  assert.equal(event.project, 'manual');
  assert.equal(await readFile(resolve(dir, 'events.json'), 'utf8'), '[]');
  assert.equal((await readManualEvents(dir)).length, 1);
});
test('blocked PASS requires dated resolution proof inside the same run', async (t) => {
  const dir = await temporary(t),
    now = Date.now();
  await writeFile(
    resolve(dir, 'manifest.json'),
    JSON.stringify({ phase: 'execution', startedAt: new Date(now - 10000).toISOString() }),
  );
  await writeFile(resolve(dir, 'proof.txt'), 'dummy resolution');
  const cases = [definition('M', { mode: 'blocked' })];
  const event = await recordManual(
    dir,
    cases,
    {
      caseId: 'M',
      status: 'PASS',
      actual: 'tested clarified condition',
      reviewer: 'selftest',
      performedAt: new Date(now - 1000).toISOString(),
      evidence: ['proof.txt'],
      clarificationResolution: {
        reference: 'SELFTEST ONLY',
        approvedBy: 'selftest',
        approvedAt: new Date(now - 2000).toISOString(),
        evidence: ['proof.txt'],
      },
    },
    now,
  );
  assert.equal(event.status, 'PASS');
  await assert.rejects(
    recordManual(
      dir,
      cases,
      {
        caseId: 'M',
        status: 'PASS',
        actual: 'x',
        reviewer: 'selftest',
        performedAt: new Date(now + 1000).toISOString(),
        evidence: ['proof.txt'],
      },
      now,
    ),
    /不能是未来/,
  );
});
test('uncovered required requirements and unaudited blocked PASS cannot certify release', async (t) => {
  const dir = await temporary(t),
    cases = [definition('A'), definition('B', { requirements: ['REL-SELF'] })];
  await writeReport(
    dir,
    [requirement('R-SELF'), requirement('MISSING'), requirement('REL-SELF', 'release')],
    cases,
    [result('A'), result('B')],
    { phase: 'execution' },
  );
  const report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.conclusions.unconditionalPass, false);
  assert.match(report.integrity.join(' '), /MISSING/);
  assert.equal(
    aggregateResults([definition('M', { mode: 'blocked' })], [result('M', 'PASS', 'manual')])[0]
      ?.status,
    'BLOCKED',
  );
});
test('required and release failures remain independent even when runner status is failed', async (t) => {
  const dir = await temporary(t),
    cases = [definition('FUNCTION'), definition('OPS', { requirements: ['REL-SELF'] })],
    reqs = [requirement('R-SELF'), requirement('REL-SELF', 'release')];
  await writeReport(dir, reqs, cases, [result('FUNCTION'), result('OPS', 'FAIL')], {
    phase: 'execution',
    runnerStatus: 'failed',
  });
  let report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.conclusions.functionality, 'PASS');
  assert.equal(report.conclusions.release, 'FAIL');
  assert.equal(report.conclusions.unconditionalPass, false);
  assert.equal(report.metrics.byScope.required.counts.PASS, 1);
  assert.equal(report.metrics.byScope.release.counts.FAIL, 1);
  assert.equal(report.metrics.passRateOfExecuted, 0.5);
  await writeReport(dir, reqs, cases, [result('FUNCTION', 'FAIL'), result('OPS')], {
    phase: 'execution',
    runnerStatus: 'failed',
  });
  report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.conclusions.functionality, 'FAIL');
  assert.equal(report.conclusions.release, 'PASS');
  assert.equal(report.conclusions.unconditionalPass, false);
});
test('structured defects preserve reproduction, expected/actual, explicit severity and real attempt times', async (t) => {
  const dir = await temporary(t),
    c = definition('FAILED', { priority: 'P0' }),
    at = '2026-10-01T01:00:00.000Z',
    end = '2026-10-01T01:00:01.000Z';
  await writeReport(
    dir,
    [requirement('R-SELF')],
    [c],
    [
      {
        ...result('FAILED', 'FAIL'),
        reason: 'Actual failed assertion',
        startedAt: at,
        completedAt: end,
      },
    ],
    { phase: 'execution' },
  );
  let report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.defects[0].severity, 'UNTRIAGED');
  assert.deepEqual(report.defects[0].steps, c.steps);
  assert.deepEqual(report.defects[0].expected, c.expected);
  assert.equal(report.defects[0].actual, 'Actual failed assertion');
  assert.deepEqual(report.defects[0].evidence, ['dummy.txt']);
  assert.equal(report.defects[0].attemptTimeline[0].startedAt, at);
  assert.equal(report.defects[0].attemptTimeline[0].completedAt, end);
  await writeReport(
    dir,
    [requirement('R-SELF')],
    [c],
    [
      {
        ...result('FAILED', 'FAIL'),
        reason: 'Reviewed observation',
        defectSeverity: 'P2',
        performedAt: at,
      },
    ],
    { phase: 'execution' },
  );
  report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.defects[0].severity, 'P2');
  assert.equal(report.defects[0].attemptTimeline[0].performedAt, at);
  assert.equal(report.defects[0].attemptTimeline[0].startedAt, undefined);
  await writeReport(dir, [requirement('R-SELF')], [c], [], { phase: 'preparation' });
  report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.deepEqual(report.defects, []);
  assert.deepEqual(report.attempts, []);
  assert.equal(report.metrics.passRateOfExecuted, null);
  assert.equal(report.metrics.byScope.required.counts.NOT_RUN, 1);
});
