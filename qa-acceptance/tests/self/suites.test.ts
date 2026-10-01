import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  caseIdGrep,
  checkSuiteRegistrations,
  listSuites,
  resolveSuite,
  resolveSuiteDefinition,
  validateSuiteManifest,
} from '../../harness/suites.js';
import { readCatalog } from '../../harness/catalog.js';
import type { CaseDefinition } from '../../harness/types.js';

const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
const definition = (id: string, patch: Partial<CaseDefinition> = {}): CaseDefinition => ({
  id,
  title: id,
  requirements: ['SELF-REQ'],
  mode: 'automated',
  priority: 'P1',
  preconditions: ['selftest'],
  data: {},
  steps: ['selftest'],
  expected: ['selftest'],
  timing: [],
  faults: [],
  evidence: ['selftest'],
  cleanup: ['selftest'],
  automation: 'tests/api/self.spec.ts',
  ...patch,
});
const manifest = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  owner: 'QA',
  suites: [
    {
      id: 'self-suite',
      title: 'Self only',
      purpose: 'No SUT',
      caseIds: ['SELF-001'],
      projects: ['system'],
      riskBoundaries: ['No product claim'],
      ...patch,
    },
  ],
});

test('suite resolver preserves IDs and explicit projects without copying test assertions', () => {
  const resolved = resolveSuiteDefinition(manifest(), [definition('SELF-001')], 'self-suite');
  assert.deepEqual(resolved.caseIds, ['SELF-001']);
  assert.deepEqual(resolved.projects, ['system']);
  assert.deepEqual(resolved.cases, [
    {
      id: 'SELF-001',
      title: 'SELF-001',
      automation: 'tests/api/self.spec.ts',
      projects: ['system'],
    },
  ]);
  assert.equal('steps' in resolved.cases[0]!, false);
  assert.equal('expected' in resolved.cases[0]!, false);
});

test('unknown, duplicate, nonautomated and malformed suite references fail closed', () => {
  assert.throws(() => resolveSuiteDefinition(manifest(), [], 'self-suite'), /未知用例/);
  assert.throws(
    () => resolveSuiteDefinition(manifest(), [definition('SELF-001')], 'missing'),
    /未知suite/,
  );
  assert.throws(
    () => resolveSuiteDefinition(manifest({ caseIds: ['SELF-001', 'SELF-001'] }), [], 'self-suite'),
    /重复/,
  );
  assert.throws(
    () =>
      resolveSuiteDefinition(
        manifest(),
        [definition('SELF-001'), definition('SELF-001')],
        'self-suite',
      ),
    /重复ID/,
  );
  for (const mode of ['blocked', 'manual', 'candidate'] as const)
    assert.throws(
      () => resolveSuiteDefinition(manifest(), [definition('SELF-001', { mode })], 'self-suite'),
      /不可作为可执行子集/,
    );
  assert.throws(
    () =>
      resolveSuiteDefinition(
        manifest(),
        [definition('SELF-001', { automation: undefined })],
        'self-suite',
      ),
    /缺自动化入口/,
  );
  assert.throws(
    () => validateSuiteManifest(manifest({ expected: ['copied assertion'] })),
    /未支持字段/,
  );
  assert.throws(() => validateSuiteManifest({ ...manifest(), owner: 'developer' }), /owner=QA/);
  assert.throws(() => validateSuiteManifest(manifest({ caseIds: [] })), /非空/);
  assert.throws(() => validateSuiteManifest(manifest({ caseIds: ['SELF-001|OTHER'] })), /非法用例/);
  const duplicate = manifest();
  duplicate.suites.push({ ...duplicate.suites[0]! });
  assert.throws(() => validateSuiteManifest(duplicate), /重复suite/);
});

test('project selection cannot silently exclude a case or introduce an empty project', () => {
  for (const projects of [[], ['unknown'], ['manual'], ['system', 'system']])
    assert.throws(() =>
      resolveSuiteDefinition(manifest({ projects }), [definition('SELF-001')], 'self-suite'),
    );
  assert.throws(
    () =>
      resolveSuiteDefinition(
        manifest({ projects: ['chromium'] }),
        [definition('SELF-001')],
        'self-suite',
      ),
    /没有可执行/,
  );
  assert.throws(
    () =>
      resolveSuiteDefinition(
        manifest({ projects: ['system', 'chromium'] }),
        [definition('SELF-001')],
        'self-suite',
      ),
    /未选择任何/,
  );
  const ui = definition('SELF-002', {
    automation: 'tests/ui/self.spec.ts',
    data: { projects: ['chromium', 'firefox-smoke'] },
  });
  const resolved = resolveSuiteDefinition(
    manifest({ caseIds: ['SELF-001', 'SELF-002'], projects: ['system', 'chromium'] }),
    [definition('SELF-001'), ui],
    'self-suite',
  );
  assert.deepEqual(
    resolved.cases.map((c) => c.projects),
    [['system'], ['chromium']],
  );
});

test('grep selects whole literal ID tokens and escapes regex metacharacters', () => {
  const regexp = new RegExp(caseIdGrep(['SELF-001', 'A.+(1)|X']));
  assert.equal(regexp.test('[SELF-001] short'), true);
  assert.equal(regexp.test('system api/example.spec.ts [SELF-001] short'), true);
  assert.equal(regexp.test('[SELF-0010] prefix must not match'), false);
  assert.equal(regexp.test('[SELF-001]-suffix'), false);
  assert.equal(regexp.test('prefix[SELF-001] glued'), false);
  assert.equal(regexp.test('[A.+(1)|X] literal'), true);
  assert.equal(regexp.test('[AXXX1] regex expansion forbidden'), false);
  assert.equal(regexp.test('[X] alternation forbidden'), false);
  assert.throws(() => caseIdGrep([]), /非空/);
});

test('registration checker refuses missing, duplicate, mismatched and accidental grep hits', () => {
  const suite = resolveSuiteDefinition(manifest(), [definition('SELF-001')], 'self-suite');
  const registration = {
    id: 'SELF-001',
    project: 'system',
    file: 'tests/api/self.spec.ts',
    title: '[SELF-001] own',
  };
  assert.deepEqual(checkSuiteRegistrations(suite, [registration]), []);
  assert.match(checkSuiteRegistrations(suite, []).join(' '), /缺少注册/);
  assert.match(checkSuiteRegistrations(suite, [registration, registration]).join(' '), /重复注册/);
  assert.match(
    checkSuiteRegistrations(suite, [{ ...registration, file: 'tests/api/wrong.spec.ts' }]).join(
      ' ',
    ),
    /不一致/,
  );
  assert.match(
    checkSuiteRegistrations(suite, [
      registration,
      { ...registration, id: 'OTHER-001', title: '[OTHER-001] mentions [SELF-001] too' },
    ]).join(' '),
    /意外选中/,
  );
  assert.deepEqual(
    checkSuiteRegistrations(suite, [registration, { ...registration, project: 'chromium' }]),
    [],
  );
});

test('filesystem resolver reads only QA manifest and registry, not target or authorization', async (t) => {
  await mkdir(resolve(qaRoot, '.runtime'), { recursive: true });
  const dir = await mkdtemp(resolve(qaRoot, '.runtime/suites-self-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['sharing', 'cases', 'requirements']) await mkdir(resolve(dir, name));
  await writeFile(resolve(dir, 'sharing/suites.json'), JSON.stringify(manifest()));
  await writeFile(resolve(dir, 'cases/self.json'), JSON.stringify([definition('SELF-001')]));
  await writeFile(resolve(dir, 'requirements/catalog.json'), '[]');
  const resolved = await resolveSuite(dir, 'self-suite');
  assert.deepEqual(resolved.caseIds, ['SELF-001']);
  assert.equal((await listSuites(dir)).length, 1);
  await writeFile(resolve(dir, 'sharing/suites.json'), '{broken');
  await assert.rejects(resolveSuite(dir, 'self-suite'));
});

test('real shared manifests select only existing automation and keep smoke intentionally short', async () => {
  const suites = await listSuites(qaRoot);
  const { cases } = await readCatalog(qaRoot);
  assert.deepEqual(
    suites.map((suite) => suite.id),
    ['developer-smoke', 'architecture-regression', 'sequence-failure-regression', 'browser-adapter-regression', 'final-integration-smoke'],
  );
  const smoke = suites.find((suite) => suite.id === 'developer-smoke')!;
  assert.deepEqual(smoke.caseIds, [
    'AUTH-001',
    'AUTH-002',
    'AUTH-003',
    'AUTH-006',
    'MSG-001',
    'SEQ-001',
  ]);
  assert.deepEqual(smoke.projects, ['system']);
  assert.equal(
    smoke.caseIds.some((id) => /^(OPS|REC)-/.test(id) || id === 'AUTH-007'),
    false,
  );
  for (const suite of suites)
    assert.equal(
      suite.caseIds.every((id) => cases.find((c) => c.id === id)?.mode === 'automated'),
      true,
    );
  const architecture = suites.find((suite) => suite.id === 'architecture-regression')!;
  assert.equal(
    architecture.caseIds.some((id) => /^CAP-\d/.test(id)),
    false,
  );
  assert.deepEqual(architecture.projects, ['system', 'chromium']);
  const sequence = suites.find((suite) => suite.id === 'sequence-failure-regression')!;
  assert.deepEqual(sequence.caseIds, ['BLK-SPEC-002', 'SEQ-006', 'SEQ-007', 'SEQ-008', 'SEQ-010']);
  assert.deepEqual(sequence.projects, ['system']);
  const raw = JSON.parse(await readFile(resolve(qaRoot, 'sharing/suites.json'), 'utf8'));
  assert.equal(raw.owner, 'QA');
});
