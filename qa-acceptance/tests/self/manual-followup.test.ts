import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  readManualFollowupScope,
  manualScopeFingerprint,
  beginManualFollowup,
  recordManualFollowup,
  reportManualFollowup,
  type ManualFollowupReview,
} from '../../harness/manual-followup.js';
import {
  verifyLiveManualPreparation,
  selectManualFixtures,
} from '../../harness/manual-followup-live.js';
import { snapshotQaTree } from '../../harness/provenance.js';
import {
  executionPurpose,
  manualFollowupPurpose,
  validateAuthorization,
  targetFingerprint,
  requireAuthorization,
} from '../../harness/security.js';
import type { Authorization, TargetConfig } from '../../harness/types.js';
import { exec } from '../../harness/process.js';

const realRoot = fileURLToPath(new URL('../../', import.meta.url));
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const now = Date.now(),
  iso = (offset: number) => new Date(now + offset).toISOString();
test('one IME label selects all three real-resource-shaped rows; duplicate identities or ambiguous events block', () => {
  // Same shape as the prepared directory-search package: one label, three distinct groups.
  const ime = ['测试', '群资料', '空 格'].map((name, index) => ({
    label: 'IME',
    groupId: `synthetic-ime-group-${index}`,
    name,
  }));
  const fixtures = [
    { label: 'A', groupId: 'synthetic-state-group', name: '正常/异常样例' },
    ...ime,
  ];
  const events = fixtures.map((entry) => ({ kind: 'fixture-ready', ...entry }));
  assert.deepEqual(selectManualFixtures(['IME'], fixtures, events), ime);
  assert.equal(selectManualFixtures(['A', 'IME'], fixtures, events).length, 4);
  assert.throws(
    () => selectManualFixtures(['IME'], [...fixtures, ime[0]!], events),
    /groupId不得重复/,
  );
  assert.throws(() => selectManualFixtures(['IME'], fixtures, [...events, events[1]!]), /唯一对应/);
  assert.throws(() => selectManualFixtures(['IME'], fixtures, events.slice(0, -1)), /唯一对应/);
});
async function fixture(t: import('node:test').TestContext) {
  await mkdir(resolve(realRoot, '.runtime'), { recursive: true });
  const root = await mkdtemp(resolve(realRoot, '.runtime/manual-followup-self-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scope = await readManualFollowupScope(realRoot);
  await mkdir(resolve(root, 'requirements'));
  await mkdir(resolve(root, 'cases'));
  await writeFile(resolve(root, 'requirements/catalog.json'), JSON.stringify(scope.requirements));
  await writeFile(resolve(root, 'cases/manual.json'), JSON.stringify(scope.cases));
  const run = resolve(root, 'reports/manual-followup/self');
  await mkdir(resolve(run, 'evidence'), { recursive: true });
  await mkdir(resolve(run, 'reviews'));
  await writeFile(
    resolve(run, 'evidence/owned-environment.txt'),
    'SELFTEST ONLY synthetic environment witness; no product',
  );
  await writeFile(
    resolve(run, 'evidence/observation.txt'),
    'SELFTEST ONLY synthetic human transcript; no real observation',
  );
  const target = JSON.parse(
    await readFile(resolve(realRoot, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  target.sut.cwd = root;
  target.sut.revision = 'a'.repeat(40);
  const auth: Authorization = {
    version: 1,
    scope: 'manual-followup',
    approvedBy: 'selftest fictional user',
    approvalReference: 'SELFTEST ONLY NO REAL PRODUCT AUTHORITY',
    approvedAt: iso(-10000),
    expiresAt: iso(60000),
    sutDirectory: root,
    sutRevision: target.sut.revision,
    targetSha256: targetFingerprint(target),
    manualScopeSha256: manualScopeFingerprint(scope),
    allowedActions: ['record-manual-followup', 'observe-owned-environment'],
  };
  const manifest = {
    version: 1,
    phase: 'manual-followup',
    sessionId: 'self',
    startedAt: iso(-8000),
    scope,
    manualScopeSha256: manualScopeFingerprint(scope),
    originalSha256: 'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75',
    targetSha256: auth.targetSha256,
    sutRevision: auth.sutRevision,
    sutDirectory: root,
    qaRevision: 'a'.repeat(40),
    qaDirtyState: 'synthetic selftest',
    qaTree: await snapshotQaTree(root),
    dependencyLockSha256: 'a'.repeat(64),
    executionApproval: auth,
    approvalFileSha256: 'b'.repeat(64),
    completeBusinessAcceptance: false,
  };
  await writeFile(resolve(run, 'manifest.json'), JSON.stringify(manifest));
  const environment = await readFile(resolve(run, 'evidence/owned-environment.txt'));
  await writeFile(
    resolve(run, 'ready.json'),
    JSON.stringify({
      readyAt: iso(-6000),
      manifestSha256: digest(await readFile(resolve(run, 'manifest.json'))),
      liveBinding: { expiresAt: iso(60000) },
      evidence: [
        {
          path: 'evidence/owned-environment.txt',
          sha256: digest(environment),
          bytes: environment.length,
        },
      ],
    }),
  );
  const review = (id = 'MAN-IME-001' as ManualFollowupReview['caseId']): ManualFollowupReview => {
    const c = scope.cases.find((item) => item.id === id)!;
    return {
      caseId: id,
      status: 'PASS',
      actual: 'SELFTEST ONLY: every synthetic observation fulfilled',
      reviewer: 'selftest',
      startedAt: iso(-4000),
      performedAt: iso(-2000),
      operator: {
        id: 'fictional human',
        human: true,
        readImplementationExplanation: false,
        readExpectedAnswers: false,
        priorCoaching: false,
      },
      evidence: ['evidence/observation.txt'],
      steps: c.steps.map((_, index) => ({ index, status: 'PASS', actual: 'synthetic step' })),
      expectations: c.expected.map((_, index) => ({
        index,
        status: 'PASS',
        actual: 'synthetic expected observation',
      })),
    };
  };
  return { root, run, target, auth, manifest, review };
}
test('manual authority binds exact three and cannot be used by old startup entry or other execution scopes', async (t) => {
  const f = await fixture(t),
    purpose = manualFollowupPurpose({
      QA_EXECUTION_KIND: 'manual-followup',
      QA_EXECUTION_MANUAL_SHA256: f.auth.manualScopeSha256,
    });
  validateAuthorization(f.auth, f.target, now, purpose);
  assert.throws(() => validateAuthorization(f.auth, f.target, now, { phase: 'execution' }));
  assert.throws(() =>
    validateAuthorization({ ...f.auth, businessSha256: 'b'.repeat(64) }, f.target, now, purpose),
  );
  assert.throws(() =>
    validateAuthorization(
      { ...f.auth, allowedActions: ['record-manual-followup'] },
      f.target,
      now,
      purpose,
    ),
  );
  assert.throws(() =>
    executionPurpose({
      QA_EXECUTION_KIND: 'manual-followup',
      QA_EXECUTION_MANUAL_SHA256: f.auth.manualScopeSha256,
    }),
  );
  assert.throws(() =>
    manualFollowupPurpose({
      QA_EXECUTION_KIND: 'manual-followup',
      QA_EXECUTION_MANUAL_SHA256: f.auth.manualScopeSha256,
      QA_EXECUTION_BUSINESS_SHA256: 'a'.repeat(64),
    }),
  );
  const path = resolve(f.root, '.approval.json');
  await writeFile(path, JSON.stringify(f.auth));
  const env = { ...process.env };
  try {
    process.env.QA_EXECUTION_AUTHORIZATION = path;
    process.env.QA_EXECUTION_KIND = 'manual-followup';
    process.env.QA_EXECUTION_MANUAL_SHA256 = f.auth.manualScopeSha256;
    await assert.rejects(requireAuthorization(f.target), /不能借用/);
  } finally {
    process.env = env;
  }
});
test('record rejects old/preflight runs, pre-ready actions and pre-read UX; partial/not-human evidence never PASS', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    recordManualFollowup(f.root, f.run, { ...f.review(), startedAt: iso(-7000) }),
    /ready后/,
  );
  await assert.rejects(
    recordManualFollowup(f.root, f.run, {
      ...f.review('MAN-UX-001'),
      operator: { id: 'already coached', human: true, readExpectedAnswers: true },
    }),
    /UX已预读/,
  );
  await assert.rejects(recordManualFollowup(f.root, f.run, { ...f.review(), steps: [] }), /缺步骤/);
  await assert.rejects(
    recordManualFollowup(f.root, f.run, { ...f.review(), operator: { id: 'agent', human: false } }),
    /非真人/,
  );
  await writeFile(
    resolve(f.run, 'manifest.json'),
    JSON.stringify({ ...f.manifest, phase: 'developer-preflight' }),
  );
  await assert.rejects(recordManualFollowup(f.root, f.run, f.review()), /人工会话/);
});
test('three results begin NOT_RUN; explicit superseding retains first audit and never produces complete-business PASS', async (t) => {
  const f = await fixture(t);
  let report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.equal(
    report.results.every((r: { status: string }) => r.status === 'NOT_RUN'),
    true,
  );
  const first = await recordManualFollowup(f.root, f.run, {
    ...f.review(),
    status: 'FAIL',
    steps: [{ index: 0, status: 'FAIL', actual: 'synthetic first violation' }],
  });
  await assert.rejects(recordManualFollowup(f.root, f.run, f.review()), /supersedesReviewId/);
  await recordManualFollowup(f.root, f.run, { ...f.review(), supersedesReviewId: first });
  await recordManualFollowup(f.root, f.run, f.review('MAN-FOCUS-001'));
  await recordManualFollowup(f.root, f.run, f.review('MAN-UX-001'));
  report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.equal(report.allThreePassed, true);
  assert.equal(report.completeBusinessAcceptance, false);
  assert.equal(report.auditCount, 4);
  assert.equal(
    JSON.parse(await readFile(resolve(f.run, 'reviews', first + '.json'), 'utf8')).review.status,
    'FAIL',
  );
});
test('ready-evidence hash and symlink changes block record and invalidate report without rewriting raw PASS', async (t) => {
  const f = await fixture(t);
  await recordManualFollowup(f.root, f.run, f.review());
  await writeFile(resolve(f.run, 'evidence/owned-environment.txt'), 'changed environment proof');
  let report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.equal(report.results[0].status, 'PASS');
  assert.equal(report.results[0].effectiveStatus, 'BLOCKED');
  assert.equal(report.allThreePassed, false);
  await assert.rejects(recordManualFollowup(f.root, f.run, f.review('MAN-FOCUS-001')), /ready证据/);
  await rm(resolve(f.run, 'evidence/owned-environment.txt'));
  await symlink('observation.txt', resolve(f.run, 'evidence/owned-environment.txt'));
  await assert.rejects(recordManualFollowup(f.root, f.run, f.review('MAN-FOCUS-001')), /符号链接/);
  report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.match(report.integrityErrors.join('\n'), /符号链接/);
});
test('source changes invalidate effective results; malformed rehashed audit cannot be trusted by report', async (t) => {
  const f = await fixture(t);
  const id = await recordManualFollowup(f.root, f.run, f.review());
  await writeFile(resolve(f.root, 'changed-source.ts'), '// changed');
  let report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.equal(report.results[0].effectiveStatus, 'BLOCKED');
  await rm(resolve(f.root, 'changed-source.ts'));
  const path = resolve(f.run, 'reviews', `${id}.json`),
    audit = JSON.parse(await readFile(path, 'utf8'));
  audit.review.steps = [];
  await writeFile(path, JSON.stringify(audit));
  await writeFile(
    resolve(f.run, 'review-index.ndjson'),
    JSON.stringify({ id, sha256: digest(await readFile(path)) }) + '\n',
  );
  report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.match(report.integrityErrors.join('\n'), /缺步骤/);
  assert.equal(report.results[0].effectiveStatus, 'BLOCKED');
  audit.reviewId = '00000000-0000-0000-0000-000000000000';
  await writeFile(path, JSON.stringify(audit));
  await writeFile(
    resolve(f.run, 'review-index.ndjson'),
    JSON.stringify({ id, sha256: digest(await readFile(path)) }) + '\n',
  );
  await assert.rejects(reportManualFollowup(f.root, f.run), /审计ID/);
});
test('qualified UX cannot be inferred; BLOCKED remains BLOCKED and evidence must belong to new session', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    recordManualFollowup(f.root, f.run, { ...f.review(), evidence: ['../outside.txt'] }),
    /相对路径/,
  );
  await recordManualFollowup(f.root, f.run, {
    ...f.review('MAN-UX-001'),
    status: 'BLOCKED',
    operator: { id: 'real but already coached', human: true, readExpectedAnswers: true },
    actual: '已预读：仅保留体验反馈',
    steps: [],
    expectations: [],
  });
  const report = JSON.parse(await readFile(await reportManualFollowup(f.root, f.run), 'utf8'));
  assert.equal(report.results[2].effectiveStatus, 'BLOCKED');
  assert.equal(report.allThreePassed, false);
});
test('live binding refuses arbitrary ready JSON with no supported QA preparation, before touching any URL', async (t) => {
  const f = await fixture(t),
    raw = resolve(f.root, 'reports/manual-followup/pretend');
  await mkdir(raw);
  await writeFile(
    resolve(raw, 'environment-preparation.json'),
    JSON.stringify({ kind: 'other', apiUrl: 'http://127.0.0.1:5173' }),
  );
  await writeFile(resolve(raw, 'preparation-events.ndjson'), '{}\n');
  await writeFile(resolve(raw, 'fixtures.json'), '{}');
  await assert.rejects(
    verifyLiveManualPreparation(f.root, f.target, {
      rawPreparationDirectory: raw,
      fixtureLabels: ['A'],
    }),
    /environment-ready/,
  );
});

test('begin creates a fresh immutable session only after real dedicated Git/auth binding; it does not fabricate ready', async (t) => {
  const f = await fixture(t),
    primary = resolve(f.root, '.runtime/primary'),
    sut = resolve(f.root, '.runtime/candidate');
  await mkdir(resolve(primary, 'docs'), { recursive: true });
  await writeFile(
    resolve(primary, 'docs/original-interview-question.md'),
    await readFile(resolve(realRoot, '../docs/original-interview-question.md')),
  );
  await exec('git', ['init', '-q'], { cwd: primary });
  await exec('git', ['add', 'docs'], { cwd: primary });
  await exec(
    'git',
    [
      '-c',
      'user.name=QA selftest',
      '-c',
      'user.email=qa-selftest@invalid.local',
      'commit',
      '-qm',
      'synthetic fixture only',
    ],
    { cwd: primary },
  );
  await exec('git', ['worktree', 'add', '--detach', sut], { cwd: primary });
  f.target.sut.cwd = sut;
  f.target.sut.revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: sut })).stdout.trim();
  await writeFile(resolve(f.root, 'package-lock.json'), '{"selftest":true}');
  const auth = {
    ...f.auth,
    sutDirectory: sut,
    sutRevision: f.target.sut.revision,
    targetSha256: targetFingerprint(f.target),
  };
  const path = resolve(f.root, '.runtime/approval.json');
  await writeFile(path, JSON.stringify(auth));
  const env = { ...process.env };
  try {
    delete process.env.QA_EXECUTION_BUSINESS_SHA256;
    delete process.env.QA_EXECUTION_SUITE_ID;
    delete process.env.QA_EXECUTION_SUITE_SHA256;
    process.env.QA_EXECUTION_KIND = 'manual-followup';
    process.env.QA_EXECUTION_MANUAL_SHA256 = auth.manualScopeSha256;
    process.env.QA_EXECUTION_AUTHORIZATION = path;
    const run = await beginManualFollowup(f.root, f.target);
    const manifest = JSON.parse(await readFile(resolve(run, 'manifest.json'), 'utf8'));
    assert.equal(manifest.phase, 'manual-followup');
    assert.match(manifest.approvalFileSha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.executionApproval.scope, 'manual-followup');
    await assert.rejects(readFile(resolve(run, 'ready.json')), /ENOENT/);
    await assert.rejects(recordManualFollowup(f.root, run, f.review()), /ENOENT/);
    assert.notEqual(await beginManualFollowup(f.root, f.target), run);
  } finally {
    process.env = env;
  }
});
