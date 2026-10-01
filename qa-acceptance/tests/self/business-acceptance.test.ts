import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBusinessScope, businessFingerprint } from '../../harness/business-scope.js';
import {
  executionPlan,
  currentExecutionPlan,
  assertSelectedCase,
  validatePlanManifest,
} from '../../harness/execution-plan.js';
import {
  executionPurpose,
  validateAuthorization,
  targetFingerprint,
  BlockedError,
} from '../../harness/security.js';
import { writeReport } from '../../harness/report.js';
import { recordManual } from '../../harness/manual.js';
import { readCatalog, caseProjects, listRegistrations } from '../../harness/catalog.js';
import type {
  Authorization,
  CaseDefinition,
  CaseResult,
  Requirement,
  TargetConfig,
} from '../../harness/types.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
const requirement = (id: string, scope: Requirement['scope']): Requirement => ({
  id,
  scope,
  title: id,
  source: {},
  expectation: id,
});
const requirements = [
  requirement('R-BUS', 'required'),
  requirement('R-REL', 'release'),
  requirement('R-CAND', 'candidate'),
];
const define = (id: string, patch: Partial<CaseDefinition> = {}): CaseDefinition => ({
  id,
  title: id,
  requirements: ['R-BUS'],
  priority: 'P1',
  mode: 'automated',
  preconditions: ['Synthetic QA selftest'],
  data: {},
  steps: ['No product execution'],
  expected: ['Honest report'],
  timing: [],
  faults: [],
  evidence: ['selftest.txt'],
  cleanup: ['Remove temporary files'],
  automation: 'tests/api/self.spec.ts',
  ...patch,
});
const cases = [
  define('SYS-001'),
  define('UI-001', {
    automation: 'tests/ui/self.spec.ts',
    data: { projects: ['chromium', 'firefox-smoke', 'webkit-smoke'] },
  }),
  define('MAN-001', { mode: 'manual', automation: undefined }),
  define('OPS-001', { requirements: ['R-REL'] }),
  define('OPS-MAN-001', { requirements: ['R-REL'], mode: 'manual', automation: undefined }),
  define('CAND-001', { requirements: ['R-CAND'], mode: 'candidate', automation: undefined }),
];
const scope = () => resolveBusinessScope(requirements, cases);
function manifest() {
  const businessScope = scope(),
    businessSha256 = businessFingerprint(businessScope);
  return {
    phase: 'business-acceptance',
    businessScope,
    businessSha256,
    playwrightArgs: businessScope.playwrightArgs,
    executionApproval: { scope: 'all-business', businessSha256 },
    runnerStatus: 'passed',
  };
}
const result = (
  id: string,
  project: string,
  status: CaseResult['status'] = 'PASS',
): CaseResult => ({
  id,
  project,
  status,
  evidence: ['selftest.txt'],
  durationMs: 1,
  ...(project === 'manual' ? { manualReviewId: 'selftest-audit' } : {}),
});
const businessPass = () =>
  scope().cases.flatMap((c) => caseProjects(c).map((p) => result(c.id, p)));
async function directory(t: { after(fn: () => Promise<void>): void }) {
  await mkdir(resolve(root, '.runtime'), { recursive: true });
  const dir = await mkdtemp(resolve(root, '.runtime/self-business-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('business scope includes every business case/project and manual obligation, excludes only release-only/candidates', () => {
  const all = scope();
  assert.deepEqual(
    all.cases.map((c) => c.id),
    ['MAN-001', 'SYS-001', 'UI-001'],
  );
  assert.deepEqual(all.projects, ['chromium', 'firefox-smoke', 'manual', 'system', 'webkit-smoke']);
  const matcher = new RegExp(all.playwrightArgs[2]!);
  for (const c of cases)
    assert.equal(matcher.test(`[${c.id}] example`), ['SYS-001', 'UI-001'].includes(c.id));
  assert.ok(!all.playwrightArgs.includes('--project=manual'));
  assert.throws(
    () => resolveBusinessScope([...requirements, requirement('R-MISSING', 'required')], cases),
    /无验收用例/,
  );
  const changed = resolveBusinessScope(requirements, [...cases, define('SYS-002')]);
  assert.notEqual(businessFingerprint(all), businessFingerprint(changed));
  assert.equal(
    businessFingerprint(all),
    businessFingerprint(
      resolveBusinessScope(requirements, [
        ...cases,
        define('OPS-002', { requirements: ['R-REL'] }),
      ]),
    ),
  );
  const mixed = resolveBusinessScope(requirements, [
    ...cases,
    define('MIXED-001', { requirements: ['R-BUS', 'R-REL'] }),
  ]);
  assert.ok(
    mixed.cases.some((c) => c.id === 'MIXED-001'),
    'shared business obligations are never silently dropped',
  );
});

test('business plans reject subsets, stale scope/project snapshots, and foreign approvals', async () => {
  const plan = await executionPlan(root, 'business-acceptance');
  const catalog = await readCatalog(root);
  assert.deepEqual(plan.businessScope, resolveBusinessScope(catalog.requirements, catalog.cases));
  await assert.rejects(executionPlan(root, 'business-acceptance', 'developer-smoke'), /不接受子集/);
  const frozen = {
    ...plan,
    executionApproval: { scope: 'all-business', businessSha256: plan.businessSha256 },
  };
  validatePlanManifest(plan, frozen);
  for (const patch of [
    { businessScope: { ...plan.businessScope, cases: plan.businessScope!.cases.slice(1) } },
    { playwrightArgs: ['test', '--grep', 'AUTH-001'] },
    { businessSha256: '0'.repeat(64) },
    { suite: { id: 'developer-smoke' } },
    { executionApproval: { scope: 'all-required', businessSha256: plan.businessSha256 } },
    { executionApproval: { scope: 'all-business' } },
  ])
    assert.throws(() => validatePlanManifest(plan, { ...frozen, ...patch }), BlockedError);
  assertSelectedCase(plan, '[AUTH-001] health', 'system');
  assert.throws(() => assertSelectedCase(plan, '[OPS-001] release', 'system'), BlockedError);
  assert.throws(() => assertSelectedCase(plan, '[AUTH-001] health', 'chromium'), BlockedError);
  const full = await executionPlan(root, 'execution');
  assert.deepEqual(full.playwrightArgs, ['test']);
  assert.throws(
    () => validatePlanManifest(full, { ...full, businessScope: plan.businessScope }),
    BlockedError,
  );
});

test('business authorization is separately bound and cannot be repurposed from smoke or all-required', async () => {
  const config = JSON.parse(
    await readFile(resolve(root, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  config.sut.cwd = root;
  config.sut.revision = 'a'.repeat(40);
  const now = Date.now(),
    hash = businessFingerprint(scope());
  const purpose = { phase: 'business-acceptance' as const, businessSha256: hash };
  const a: Authorization = {
    version: 1,
    scope: 'all-business',
    businessSha256: hash,
    approvedBy: 'fictional QA selftest',
    approvalReference: 'SELFTEST ONLY NO PRODUCT EXECUTION',
    approvedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 10000).toISOString(),
    sutRevision: config.sut.revision,
    sutDirectory: config.sut.cwd,
    targetSha256: targetFingerprint(config),
    allowedActions: [
      'start-isolated-sut',
      'create-owned-database',
      'fault-injection',
      'kill-owned-process',
      'browser-automation',
    ],
  };
  validateAuthorization(a, config, now, purpose);
  for (const patch of [
    { scope: 'all-required' },
    { scope: 'developer-preflight' },
    { businessSha256: undefined },
    { suiteId: 'developer-smoke' },
    { businessSha256: 'b'.repeat(64) },
  ])
    assert.throws(
      () => validateAuthorization({ ...a, ...patch } as Authorization, config, now, purpose),
      BlockedError,
    );
  assert.throws(() => validateAuthorization(a, config, now), BlockedError);
  assert.throws(
    () =>
      validateAuthorization(
        { ...a, allowedActions: a.allowedActions.filter((x) => x !== 'browser-automation') },
        config,
        now,
        purpose,
        ['system'],
      ),
    BlockedError,
  );
  assert.deepEqual(
    executionPurpose({
      QA_EXECUTION_KIND: 'business-acceptance',
      QA_EXECUTION_BUSINESS_SHA256: hash,
    }),
    purpose,
  );
  for (const env of [
    { QA_EXECUTION_KIND: 'business-acceptance' },
    {
      QA_EXECUTION_KIND: 'business-acceptance',
      QA_EXECUTION_BUSINESS_SHA256: hash,
      QA_EXECUTION_SUITE_ID: 'developer-smoke',
    },
    { QA_EXECUTION_KIND: 'execution', QA_EXECUTION_BUSINESS_SHA256: hash },
  ])
    assert.throws(() => executionPurpose(env), BlockedError);
});

test('business selection matches every registered required automation project and revalidates the full digest', async (t) => {
  const plan = await executionPlan(root, 'business-acceptance');
  const expected = plan
    .businessScope!.cases.filter((c) => c.mode === 'automated')
    .flatMap((c) => caseProjects(c).map((p) => `${c.id}:${p}`))
    .sort();
  const pattern = new RegExp(plan.playwrightArgs[2]!);
  const projects = plan.playwrightArgs
    .filter((x) => x.startsWith('--project='))
    .map((x) => x.slice('--project='.length));
  const actual = (await listRegistrations(root))
    .filter((r) => projects.includes(r.project) && pattern.test(r.title))
    .map((r) => `${r.id}:${r.project}`)
    .sort();
  assert.deepEqual(actual, expected, 'Playwright --list only; no fixture or product execution');
  const keys = [
    'QA_EXECUTION_KIND',
    'QA_EXECUTION_SUITE_ID',
    'QA_EXECUTION_SUITE_SHA256',
    'QA_EXECUTION_BUSINESS_SHA256',
  ];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys)
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
  });
  delete process.env.QA_EXECUTION_SUITE_ID;
  delete process.env.QA_EXECUTION_SUITE_SHA256;
  process.env.QA_EXECUTION_KIND = 'business-acceptance';
  process.env.QA_EXECUTION_BUSINESS_SHA256 = plan.businessSha256;
  assert.equal((await currentExecutionPlan(root)).businessSha256, plan.businessSha256);
  process.env.QA_EXECUTION_BUSINESS_SHA256 = '0'.repeat(64);
  await assert.rejects(currentExecutionPlan(root), /完整业务验收基线已改变/);
});

test('business report passes independently of unexecuted release, but missing manual/browser or blocked business never passes', async (t) => {
  const dir = await directory(t);
  async function report(events: CaseResult[], extra: Record<string, unknown> = {}) {
    await writeReport(dir, requirements, cases, events, { ...manifest(), ...extra });
    return JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  }
  const full = await report(businessPass());
  assert.equal(full.businessAcceptance.verdict, 'PASS');
  assert.equal(full.metrics.requiredCases, 3);
  assert.equal(full.metrics.manual, 1);
  assert.equal(full.metrics.executionRate, 1);
  assert.equal(full.conclusions.functionality, 'PASS');
  assert.equal(full.conclusions.release, 'INCOMPLETE');
  assert.equal(full.conclusions.unconditionalPass, false);
  assert.equal(full.results.find((r: CaseResult) => r.id === 'OPS-001').status, 'NOT_RUN');
  const junit = await readFile(resolve(dir, 'junit.xml'), 'utf8');
  assert.match(junit, /business-acceptance:all-business/);
  assert.ok(!junit.includes('OPS-001'));
  assert.ok(!(await readFile(resolve(dir, 'acceptance.md'), 'utf8')).includes('|OPS-001 '));
  for (const events of [
    businessPass().filter((r) => r.project !== 'manual'),
    businessPass().filter((r) => r.project !== 'webkit-smoke'),
    businessPass().map((r) => (r.id === 'SYS-001' ? { ...r, status: 'BLOCKED' as const } : r)),
  ])
    assert.equal((await report(events)).businessAcceptance.verdict, 'INCOMPLETE');
  const failed = await report(
    businessPass().map((r) => (r.id === 'SYS-001' ? { ...r, status: 'FAIL' as const } : r)),
    { runnerStatus: 'failed' },
  );
  assert.equal(failed.businessAcceptance.verdict, 'FAIL');
  assert.equal(failed.conclusions.release, 'INCOMPLETE');
  for (const extra of [
    { businessScope: { ...scope(), cases: scope().cases.slice(1) } },
    { runnerStatus: undefined },
    { runnerErrors: ['worker cleanup failed'] },
  ])
    assert.equal((await report(businessPass(), extra)).businessAcceptance.verdict, 'INCOMPLETE');
  const stray = await report([...businessPass(), result('OPS-001', 'system', 'FAIL')]);
  assert.equal(stray.businessAcceptance.verdict, 'INCOMPLETE');
  assert.equal(stray.businessAcceptance.rejectedAttempts.length, 1);
  assert.equal(
    stray.metrics.counts.FAIL,
    0,
    'release failures are not relabelled business defects',
  );
  await writeReport(
    dir,
    requirements,
    cases,
    [...businessPass(), result('OPS-001', 'system'), result('OPS-MAN-001', 'manual')],
    { phase: 'execution', runnerStatus: 'passed' },
  );
  assert.equal(
    JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8')).conclusions.unconditionalPass,
    true,
    'original all-required meaning is retained',
  );
});

test('audited business manual results are accepted, release manual entries are rejected before writing', async (t) => {
  const dir = await directory(t),
    plan = await executionPlan(root, 'business-acceptance');
  const catalog = await readCatalog(root),
    now = Date.now();
  await writeFile(
    resolve(dir, 'manifest.json'),
    JSON.stringify({
      ...plan,
      startedAt: new Date(now - 1000).toISOString(),
      executionApproval: { scope: 'all-business', businessSha256: plan.businessSha256 },
    }),
  );
  await writeFile(resolve(dir, 'selftest.txt'), 'Synthetic manual evidence, not a product result');
  const businessManual = plan.businessScope!.cases.find((c) => c.mode === 'manual')!;
  const releaseManual = catalog.cases.find(
    (c) => c.mode === 'manual' && !plan.businessScope!.cases.some((b) => b.id === c.id),
  )!;
  const review = {
    caseId: businessManual.id,
    status: 'PASS' as const,
    actual: 'Synthetic QA helper check only',
    reviewer: 'selftest',
    performedAt: new Date(now).toISOString(),
    evidence: ['selftest.txt'],
  };
  const accepted = await recordManual(dir, catalog.cases, review, now);
  assert.ok(accepted.manualReviewId);
  await assert.rejects(
    recordManual(dir, catalog.cases, { ...review, caseId: releaseManual.id }, now),
    /不在完整业务/,
  );
  assert.equal(
    (await readFile(resolve(dir, 'manual-events.ndjson'), 'utf8')).trim().split('\n').length,
    1,
  );
});

test('business CLI hashes without launch and rejects suite selection or missing authorization', async () => {
  const call = (args: string[]) =>
    exec(
      process.execPath,
      [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'harness/cli.ts', ...args],
      { cwd: root, timeout: 10000 },
    );
  assert.equal(
    (await call(['hash-business'])).stdout.trim(),
    (await executionPlan(root, 'business-acceptance')).businessSha256,
  );
  for (const args of [
    ['business'],
    ['business', '--suite', 'developer-smoke'],
    ['business', '--grep', 'AUTH'],
    ['hash-business', '--suite', 'developer-smoke'],
  ])
    await assert.rejects(call(args));
});
