import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executionPlan } from '../../harness/execution-plan.js';
import {
  assertAuthorizedAction,
  BlockedError,
  requireAuthorization,
  targetFingerprint,
  validateAuthorization,
} from '../../harness/security.js';
import type { Authorization, ExecutionPurpose, TargetConfig } from '../../harness/types.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
const systemActions = [
  'start-isolated-sut',
  'create-owned-database',
  'fault-injection',
  'kill-owned-process',
];
async function target(): Promise<TargetConfig> {
  const config = JSON.parse(
    await readFile(resolve(root, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  config.sut.cwd = root;
  config.sut.revision = 'a'.repeat(40);
  return config;
}
function approval(config: TargetConfig, purpose: ExecutionPurpose): Authorization {
  const now = Date.now();
  return {
    version: 1,
    scope: purpose.phase === 'execution' ? 'all-required' : 'developer-preflight',
    approvedBy: 'fictional QA tool selftest',
    approvalReference: 'SELF TEST ONLY; no product execution authorized',
    approvedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    sutRevision: config.sut.revision,
    sutDirectory: config.sut.cwd,
    targetSha256: targetFingerprint(config),
    allowedActions: [...systemActions],
    ...(purpose.phase === 'developer-preflight'
      ? { suiteId: purpose.suiteId, suiteSha256: purpose.suiteSha256 }
      : {}),
  };
}

test('only verified system-only preflight can omit browser permission; other actions remain required', async () => {
  const config = await target();
  const purpose: ExecutionPurpose = {
    phase: 'developer-preflight',
    suiteId: 'developer-smoke',
    suiteSha256: 'b'.repeat(64),
  };
  const auth = approval(config, purpose);
  validateAuthorization(auth, config, Date.now(), purpose, ['system']);
  for (const action of systemActions)
    assert.throws(
      () =>
        validateAuthorization(
          { ...auth, allowedActions: systemActions.filter((value) => value !== action) },
          config,
          Date.now(),
          purpose,
          ['system'],
        ),
      new RegExp(`授权范围缺少 ${action}`),
    );
  for (const projects of [
    undefined,
    [],
    ['unknown'],
    ['system', 'unknown'],
    ['system', 'system'],
    ['chromium'],
    ['system', 'chromium'],
    ['firefox-smoke'],
    ['webkit-smoke'],
  ])
    assert.throws(
      () => validateAuthorization(auth, config, Date.now(), purpose, projects),
      /授权范围缺少 browser-automation/,
    );
  const formal: ExecutionPurpose = { phase: 'execution' };
  assert.throws(
    () => validateAuthorization(approval(config, formal), config, Date.now(), formal, ['system']),
    /授权范围缺少 browser-automation/,
  );
  const full = { ...auth, allowedActions: [...systemActions, 'browser-automation'] };
  validateAuthorization(full, config, Date.now(), purpose, ['system', 'chromium']);
  // This is also the browser fixture's final guard before inspecting/launching a browser.
  assert.throws(() => assertAuthorizedAction(auth, 'browser-automation'), BlockedError);
  assertAuthorizedAction(full, 'browser-automation');
});

test('repeated fixture authorization resolves the real suite and rejects stale digest or unapproved browser project', async (t) => {
  await mkdir(resolve(root, '.runtime'), { recursive: true });
  const dir = await mkdtemp(resolve(root, '.runtime/self-project-authorization-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const primary = resolve(dir, 'primary'),
    sut = resolve(dir, 'candidate');
  await mkdir(primary);
  // A synthetic empty Git repository exercises ownership/version checks without
  // invoking any product code, database, HTTP endpoint, or browser.
  await exec('git', ['init', '-q'], { cwd: primary });
  await writeFile(resolve(primary, 'selftest.txt'), 'QA tool fixture only\n');
  await exec('git', ['add', 'selftest.txt'], { cwd: primary });
  await exec(
    'git',
    [
      '-c',
      'user.name=QA Tool Selftest',
      '-c',
      'user.email=qa-selftest@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'synthetic fixture',
    ],
    { cwd: primary },
  );
  await exec('git', ['worktree', 'add', '--detach', sut, 'HEAD'], { cwd: primary });
  const config = await target();
  config.sut.cwd = await realpath(sut);
  config.sut.revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: sut })).stdout.trim();
  const file = resolve(dir, 'selftest-authorization.json');
  const keys = [
    'QA_EXECUTION_KIND',
    'QA_EXECUTION_SUITE_ID',
    'QA_EXECUTION_SUITE_SHA256',
    'QA_EXECUTION_BUSINESS_SHA256',
    'QA_EXECUTION_AUTHORIZATION',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  delete process.env.QA_EXECUTION_BUSINESS_SHA256;
  t.after(() => {
    for (const key of keys)
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
  });
  async function select(suiteId: string): Promise<Authorization> {
    const plan = await executionPlan(root, 'developer-preflight', suiteId);
    const purpose: ExecutionPurpose = {
      phase: 'developer-preflight',
      suiteId,
      suiteSha256: plan.suiteSha256!,
    };
    process.env.QA_EXECUTION_KIND = purpose.phase;
    process.env.QA_EXECUTION_SUITE_ID = suiteId;
    process.env.QA_EXECUTION_SUITE_SHA256 = purpose.suiteSha256;
    process.env.QA_EXECUTION_AUTHORIZATION = file;
    const auth = approval(config, purpose);
    await writeFile(file, JSON.stringify(auth));
    return auth;
  }
  await select('developer-smoke');
  assert.deepEqual((await requireAuthorization(config)).allowedActions, systemActions);
  const oldDigest = process.env.QA_EXECUTION_SUITE_SHA256;
  process.env.QA_EXECUTION_SUITE_SHA256 = '0'.repeat(64);
  await assert.rejects(requireAuthorization(config), /共享子集的内容已改变/);
  process.env.QA_EXECUTION_SUITE_SHA256 = oldDigest;
  assert.deepEqual((await requireAuthorization(config)).allowedActions, systemActions);
  const browserAuth = await select('architecture-regression');
  await assert.rejects(requireAuthorization(config), /授权范围缺少 browser-automation/);
  await writeFile(
    file,
    JSON.stringify({
      ...browserAuth,
      allowedActions: [...systemActions, 'browser-automation'],
    }),
  );
  assert.ok((await requireAuthorization(config)).allowedActions.includes('browser-automation'));
});
