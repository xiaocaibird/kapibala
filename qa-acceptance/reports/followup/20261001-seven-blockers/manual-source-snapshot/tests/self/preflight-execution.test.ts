import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  executionPlan,
  validatePlanManifest,
  assertSelectedCase,
  suiteFingerprint,
} from '../../harness/execution-plan.js';
import {
  executionPurpose,
  validateAuthorization,
  targetFingerprint,
  BlockedError,
} from '../../harness/security.js';
import type { Authorization, TargetConfig } from '../../harness/types.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);

test('preflight purpose fails closed for missing selection and formal scope cannot inherit subset', () => {
  assert.deepEqual(executionPurpose({}), { phase: 'execution' });
  const env = {
    QA_EXECUTION_KIND: 'developer-preflight',
    QA_EXECUTION_SUITE_ID: 'developer-smoke',
    QA_EXECUTION_SUITE_SHA256: 'a'.repeat(64),
  };
  assert.equal(executionPurpose(env).phase, 'developer-preflight');
  for (const change of [
    { QA_EXECUTION_KIND: 'unknown' },
    { QA_EXECUTION_SUITE_ID: '' },
    { QA_EXECUTION_SUITE_SHA256: '' },
    { QA_EXECUTION_SUITE_SHA256: 'not-a-digest' },
    { QA_EXECUTION_KIND: 'execution' },
  ])
    assert.throws(() => executionPurpose({ ...env, ...change }), BlockedError);
});

test('preflight and acceptance authorization are distinct and bind a selected suite digest', async () => {
  const target = JSON.parse(
    await readFile(resolve(root, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  target.sut.cwd = root;
  target.sut.revision = 'a'.repeat(40);
  const now = Date.now();
  const auth: Authorization = {
    version: 1,
    scope: 'all-required',
    approvedBy: 'fictional tool selftest',
    approvalReference: 'SELF TEST ONLY, NOT PRODUCT AUTHORIZATION',
    approvedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 1000).toISOString(),
    sutRevision: target.sut.revision,
    sutDirectory: target.sut.cwd,
    targetSha256: targetFingerprint(target),
    allowedActions: [
      'start-isolated-sut',
      'create-owned-database',
      'fault-injection',
      'kill-owned-process',
      'browser-automation',
    ],
  };
  const purpose = {
    phase: 'developer-preflight' as const,
    suiteId: 'developer-smoke',
    suiteSha256: 'b'.repeat(64),
  };
  const preflight = {
    ...auth,
    scope: 'developer-preflight' as const,
    suiteId: purpose.suiteId,
    suiteSha256: purpose.suiteSha256,
  };
  validateAuthorization(auth, target, now);
  assert.throws(
    () => validateAuthorization({ ...auth, suiteId: 'developer-smoke' }, target, now),
    BlockedError,
  );
  validateAuthorization(preflight, target, now, purpose);
  assert.throws(() => validateAuthorization(auth, target, now, purpose), BlockedError);
  assert.throws(() => validateAuthorization(preflight, target, now), BlockedError);
  for (const patch of [
    { suiteId: 'architecture-regression' },
    { suiteSha256: 'c'.repeat(64) },
    { suiteId: undefined },
    { suiteSha256: undefined },
    { targetSha256: 'd'.repeat(64) },
  ])
    assert.throws(
      () => validateAuthorization({ ...preflight, ...patch }, target, now, purpose),
      BlockedError,
    );
});

test('execution plan passes exact grep and projects as separate argv and full acceptance is unfiltered', async () => {
  const plan = await executionPlan(root, 'developer-preflight', 'developer-smoke');
  assert.deepEqual(plan.playwrightArgs, ['test', '--grep', plan.suite!.grep, '--project=system']);
  assert.equal(plan.suite!.caseIds.length, 6);
  assert.equal(plan.suiteSha256, suiteFingerprint(plan.suite!));
  assert.notEqual(
    plan.suiteSha256,
    suiteFingerprint({ ...plan.suite!, caseIds: [...plan.suite!.caseIds].reverse() }),
  );
  assert.deepEqual(await executionPlan(root, 'execution'), {
    phase: 'execution',
    playwrightArgs: ['test'],
  });
  await assert.rejects(executionPlan(root, 'execution', 'developer-smoke'), BlockedError);
  await assert.rejects(executionPlan(root, 'developer-preflight'), BlockedError);
  await assert.rejects(executionPlan(root, 'developer-preflight', 'unknown'), /未知/);
});

test('manifest and per-case checks reject purpose, selection and project tampering before SUT initialization', async () => {
  const plan = await executionPlan(root, 'developer-preflight', 'developer-smoke');
  const manifest = {
    ...plan,
    executionApproval: {
      scope: 'developer-preflight',
      suiteId: plan.suite!.id,
      suiteSha256: plan.suiteSha256,
    },
  };
  validatePlanManifest(plan, manifest);
  for (const patch of [
    { phase: 'execution' },
    { playwrightArgs: ['test'] },
    { suiteSha256: '0'.repeat(64) },
    { suite: { ...plan.suite, caseIds: ['OTHER'] } },
  ])
    assert.throws(() => validatePlanManifest(plan, { ...manifest, ...patch }), BlockedError);
  assertSelectedCase(plan, '[AUTH-001] exact title', 'system');
  for (const [title, project] of [
    ['[AUTH-0010] accidental prefix', 'system'],
    ['[AUTH-001] exact title', 'chromium'],
    ['[OPS-001] outside', 'system'],
    ['missing ID', 'system'],
  ])
    assert.throws(() => assertSelectedCase(plan, title!, project!), BlockedError);
  for (const executionApproval of [
    undefined,
    {},
    { scope: 'all-required' },
    { scope: 'developer-preflight', suiteId: 'other', suiteSha256: plan.suiteSha256 },
  ])
    assert.throws(
      () => validatePlanManifest(plan, { ...manifest, executionApproval }),
      BlockedError,
    );
  const full = await executionPlan(root, 'execution');
  assert.throws(() => validatePlanManifest(full, { ...full, suite: plan.suite }), BlockedError);
});

test('CLI static hash works without a target and missing authorization never starts product tests', async () => {
  const env = { ...process.env };
  for (const key of [
    'QA_TARGET_CONFIG',
    'QA_EXECUTION_AUTHORIZATION',
    'QA_RUN_DIRECTORY',
    'QA_EXECUTION_KIND',
    'QA_EXECUTION_SUITE_ID',
    'QA_EXECUTION_SUITE_SHA256',
    'QA_EXECUTION_BUSINESS_SHA256',
  ])
    delete env[key];
  const command = resolve(root, 'node_modules/tsx/dist/cli.mjs');
  const call = (args: string[]) =>
    exec(process.execPath, [command, 'harness/cli.ts', ...args], {
      cwd: root,
      env,
      timeout: 10000,
    });
  const { stdout } = await call(['hash-suite', '--suite', 'developer-smoke']);
  assert.equal(
    stdout.trim(),
    (await executionPlan(root, 'developer-preflight', 'developer-smoke')).suiteSha256,
  );
  for (const args of [['preflight', '--suite', 'developer-smoke'], ['run']]) {
    await assert.rejects(call(args), (e: unknown) => {
      assert.match(String((e as { stderr: string }).stderr), /必须提供 --target/);
      return true;
    });
  }
  await assert.rejects(
    call(['preflight', '--suite', 'developer-smoke', '--grep', 'AUTH']),
    (e: unknown) => {
      assert.match(String((e as { stderr: string }).stderr), /执行参数无效/);
      return true;
    },
  );
  await assert.rejects(call(['run', '--suite', 'developer-smoke']), (e: unknown) => {
    assert.match(String((e as { stderr: string }).stderr), /正式验收不接受子集/);
    return true;
  });
});

test('report regeneration binds manifest scope and never lets runner summary overwrite the frozen plan', async (t) => {
  const dir = await mkdtemp(resolve(root, 'reports/preparation/self-regenerate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const plan = await executionPlan(root, 'developer-preflight', 'developer-smoke');
  const manifest = {
    ...plan,
    executionApproval: {
      scope: 'developer-preflight',
      suiteId: plan.suite!.id,
      suiteSha256: plan.suiteSha256,
    },
  };
  await writeFile(resolve(dir, 'events.json'), '[]');
  await writeFile(
    resolve(dir, 'runner-summary.json'),
    JSON.stringify({
      runnerStatus: 'passed',
      runnerErrors: [],
      phase: 'execution',
      suite: null,
      suiteSha256: null,
      executionApproval: { scope: 'all-required' },
    }),
  );
  const call = () =>
    exec(
      process.execPath,
      [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'harness/cli.ts', 'report', '--run', dir],
      { cwd: root, timeout: 10000 },
    );
  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(manifest));
  await call();
  const report = JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8'));
  assert.equal(report.metadata.phase, 'developer-preflight');
  assert.equal(report.preflight.suiteId, 'developer-smoke');
  assert.equal(report.preflight.verdict, 'INCOMPLETE');
  assert.equal(report.conclusions.unconditionalPass, false);
  for (const patch of [
    { phase: 'execution' },
    { phase: undefined },
    { suiteSha256: '0'.repeat(64) },
    { executionApproval: { scope: 'all-required' } },
  ]) {
    await writeFile(resolve(dir, 'manifest.json'), JSON.stringify({ ...manifest, ...patch }));
    await assert.rejects(call());
  }
});
