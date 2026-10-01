import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReport } from '../../harness/report.js';
import { resolveSuiteDefinition, type ResolvedSuite } from '../../harness/suites.js';
import { suiteFingerprint } from '../../harness/execution-plan.js';
import type { CaseDefinition, CaseResult, Requirement } from '../../harness/types.js';

const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
const definition = (id: string, patch: Partial<CaseDefinition> = {}): CaseDefinition => ({
  id,
  title: `Self ${id}`,
  requirements: ['R-SELF'],
  priority: 'P1',
  mode: 'automated',
  preconditions: ['Only report fixtures'],
  data: {},
  steps: ['Synthetic result input'],
  expected: ['Honest report'],
  timing: [],
  faults: [],
  evidence: ['dummy'],
  cleanup: ['Owned temp directory'],
  automation: 'tests/api/self.spec.ts',
  ...patch,
});
const cases = [
  definition('SYS-001'),
  definition('UI-001', {
    automation: 'tests/ui/self.spec.ts',
    data: { projects: ['chromium', 'firefox-smoke', 'webkit-smoke'] },
  }),
  definition('OPS-001', { requirements: ['REL-SELF'] }),
];
const requirements: Requirement[] = [
  {
    id: 'R-SELF',
    title: 'Self functional',
    source: {},
    expectation: 'Self only',
    scope: 'required',
  },
  { id: 'REL-SELF', title: 'Self release', source: {}, expectation: 'Self only', scope: 'release' },
];
const result = (
  id: string,
  project: string,
  status: CaseResult['status'] = 'PASS',
  patch: Partial<CaseResult> = {},
): CaseResult => ({
  id,
  project,
  status,
  evidence: ['dummy.txt'],
  durationMs: 1,
  ...patch,
});
const suite = (caseIds = ['UI-001'], projects = ['chromium']) =>
  resolveSuiteDefinition(
    {
      schemaVersion: 1,
      owner: 'QA',
      suites: [
        {
          id: 'self-preflight',
          title: 'Self preflight',
          purpose: 'Report isolation only',
          caseIds,
          projects,
          riskBoundaries: ['Does not execute product or certify acceptance'],
        },
      ],
    },
    cases,
    'self-preflight',
  );

async function directory(t: { after(fn: () => Promise<void>): void }): Promise<string> {
  await mkdir(resolve(qaRoot, '.runtime'), { recursive: true });
  const dir = await mkdtemp(resolve(qaRoot, '.runtime/preflight-report-self-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function output(
  dir: string,
  events: CaseResult[],
  metadata: Record<string, unknown> = {},
  definitions: CaseDefinition[] = cases,
) {
  const phase = Object.hasOwn(metadata, 'phase') ? metadata.phase : 'developer-preflight';
  const defaults: Record<string, unknown> = { phase, runnerStatus: 'passed' };
  if (phase === 'developer-preflight') {
    const selected = Object.hasOwn(metadata, 'suite') ? metadata.suite : suite();
    const snapshotForHash =
      selected && typeof selected === 'object' && !Array.isArray(selected)
        ? (selected as ResolvedSuite)
        : suite();
    defaults.suite = selected;
    defaults.suiteSha256 = suiteFingerprint(snapshotForHash);
    defaults.executionApproval = {
      scope: 'developer-preflight',
      suiteId: snapshotForHash.id,
      suiteSha256: defaults.suiteSha256,
    };
  }
  await writeReport(dir, requirements, definitions, events, { ...defaults, ...metadata });
  return {
    report: JSON.parse(await readFile(resolve(dir, 'results.json'), 'utf8')),
    markdown: await readFile(resolve(dir, 'acceptance.md'), 'utf8'),
    junit: await readFile(resolve(dir, 'junit.xml'), 'utf8'),
  };
}

function notOfficial(report: any): void {
  assert.equal(report.conclusions.functionality, 'INCOMPLETE');
  assert.equal(report.conclusions.release, 'INCOMPLETE');
  assert.equal(report.conclusions.unconditionalPass, false);
}

test('JUnit removes terminal styling and XML-illegal text without changing the raw failed result', async (t) => {
  const dir = await directory(t);
  const illegal = '\u0000\u0008\u000b\u000c\u001b\u001f\ud800\u0001\udfff\ufffe\uffff';
  const reason =
    '\u001b[31m中文 😀 <expected> & "actual"\u001b[0m ' +
    '\u001b]8;;https://example.invalid\u001b\\visible link\u001b]8;;\u001b\\' +
    illegal;
  const { report, junit } = await output(dir, [result('UI-001', 'chromium', 'FAIL', { reason })]);
  assert.ok(
    junit.includes(
      '<failure message="中文 😀 &lt;expected&gt; &amp; &quot;actual&quot; visible link"/>',
    ),
    'terminal escape bytes and illegal XML characters must not reach the failure attribute',
  );
  assert.match(junit, /failures="1"/);
  assert.equal(report.preflight.results[0].status, 'FAIL');
  assert.equal(report.preflight.results[0].reason, reason, 'JSON keeps the original diagnostic');
});

test('JUnit preserves legal XML Unicode boundaries and sanitizes skipped and integrity messages', async (t) => {
  const dir = await directory(t);
  // Legal XML 1.0 characters at each range boundary, including astral pairs.
  const legal = '\t\n\r \ud7ff\ue000\ufffd\u{10000}\u{10ffff}中文😀';
  const reason = `\u001b[2m${legal}\u001b[22m\u0001`;
  const runnerError = '\u001b[31m清理 <failed> & "quoted" 😀\u001b[0m\u0002';
  const { report, junit } = await output(
    dir,
    [result('UI-001', 'chromium', 'BLOCKED', { reason })],
    { runnerStatus: runnerError },
  );
  assert.ok(junit.includes(`<skipped message="BLOCKED: ${legal}"/>`));
  assert.ok(junit.includes('清理 &lt;failed&gt; &amp; &quot;quoted&quot; 😀'));
  assert.ok(!junit.includes('\u001b') && !junit.includes('\u0001') && !junit.includes('\u0002'));
  assert.match(junit, /errors="1"/);
  assert.equal(report.preflight.results[0].status, 'BLOCKED');
  assert.equal(report.preflight.results[0].reason, reason);
});

test('Chromium-only preflight passes its selected project while full browser case remains NOT_RUN', async (t) => {
  const dir = await directory(t);
  const { report, markdown, junit } = await output(dir, [result('UI-001', 'chromium')]);
  assert.equal(report.preflight.verdict, 'PASS');
  assert.equal(report.preflight.selectedCaseCount, 1);
  assert.equal(report.preflight.selectedProjectCount, 1);
  assert.equal(report.preflight.selectedCaseProjectCount, 1);
  assert.equal(report.preflight.results[0].status, 'PASS');
  assert.equal(report.preflight.projectResults[0].project, 'chromium');
  assert.equal(report.results.length, cases.length);
  assert.ok(report.results.every((r: CaseResult) => r.status === 'NOT_RUN'));
  assert.equal(report.metrics.counts.PASS, 0);
  notOfficial(report);
  assert.match(markdown, /^# 开发预跑报告/);
  assert.match(markdown, /不是正式 QA 验收/);
  assert.match(markdown, /未选项保持 NOT_RUN/);
  assert.match(junit, /name="developer-preflight:self-preflight"/);
  assert.match(junit, /name="UI-001 \[chromium\]"/);
  assert.doesNotMatch(junit, /name="independent-qa"/);
});

test('even all catalog projects passing in preflight cannot certify formal functionality or release', async (t) => {
  const dir = await directory(t);
  const selected = suite(
    cases.map((c) => c.id),
    ['system', 'chromium', 'firefox-smoke', 'webkit-smoke'],
  );
  const events = selected.cases.flatMap((c) => c.projects.map((project) => result(c.id, project)));
  const { report } = await output(dir, events, { suite: selected, runnerStatus: 'passed' });
  assert.equal(report.preflight.verdict, 'PASS');
  assert.equal(report.preflight.selectedCaseCount, 3);
  assert.equal(report.preflight.selectedProjectCount, 4);
  assert.equal(report.preflight.selectedCaseProjectCount, 5);
  assert.ok(report.results.every((r: CaseResult) => r.status === 'PASS'));
  notOfficial(report);
});

test('every selected case/project pair must be present and blocked execution is incomplete', async (t) => {
  const dir = await directory(t);
  let out = await output(dir, [result('UI-001', 'chromium')], {
    suite: suite(['UI-001'], ['chromium', 'webkit-smoke']),
  });
  assert.equal(out.report.preflight.verdict, 'INCOMPLETE');
  assert.equal(
    out.report.preflight.projectResults.find((r: CaseResult) => r.project === 'webkit-smoke')
      .status,
    'NOT_RUN',
  );
  out = await output(dir, [
    result('UI-001', 'chromium', 'BLOCKED', { reason: 'Self missing browser' }),
  ]);
  assert.equal(out.report.preflight.verdict, 'INCOMPLETE');
  assert.equal(out.report.preflight.results[0].status, 'BLOCKED');
  notOfficial(out.report);
});

test('earlier failure survives a later pass and all attempts remain auditable', async (t) => {
  const dir = await directory(t);
  const events = [
    result('UI-001', 'chromium', 'FAIL', {
      attempt: 0,
      reason: 'First assertion failed',
      startedAt: '2026-10-01T01:00:00.000Z',
    }),
    result('UI-001', 'chromium', 'PASS', { attempt: 1, startedAt: '2026-10-01T01:00:01.000Z' }),
  ];
  const { report, junit } = await output(dir, events, { runnerStatus: 'passed' });
  assert.equal(report.preflight.verdict, 'FAIL');
  assert.equal(report.preflight.results[0].status, 'FAIL');
  assert.equal(report.preflight.projectResults[0].status, 'FAIL');
  assert.deepEqual(report.preflight.attempts, events);
  assert.deepEqual(report.attempts, events);
  assert.equal(report.defects[0].severity, 'UNTRIAGED');
  assert.equal(report.defects[0].actual, 'First assertion failed');
  assert.match(junit, /failures="1"/);
  notOfficial(report);
});

test('unknown, unselected or undeclared-project events are rejected and never populate unselected results', async (t) => {
  const dir = await directory(t);
  const invalid = [
    result('UNKNOWN-001', 'chromium'),
    result('SYS-001', 'system'),
    result('SYS-001', 'system', 'FAIL'),
    result('UI-001', 'firefox-smoke'),
    result('UI-001', 'invented-project'),
    result('UI-001', 'chromium', 'PASS', { project: undefined }),
  ];
  for (const rejected of invalid) {
    const { report, junit } = await output(dir, [result('UI-001', 'chromium'), rejected]);
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.equal(report.preflight.rejectedAttempts.length, 1);
    assert.equal(report.preflight.attempts.length, 1);
    assert.equal(report.attempts.length, 2);
    assert.equal(report.results.find((r: CaseResult) => r.id === 'SYS-001').status, 'NOT_RUN');
    assert.match(report.integrity.join(' '), /非子集用例或项目/);
    assert.match(junit, /errors="1"/);
    assert.match(junit, /PREFLIGHT-INTEGRITY/);
    notOfficial(report);
  }
});

test('runner errors or invalid selected result evidence cannot produce preflight PASS', async (t) => {
  const dir = await directory(t);
  for (const metadata of [
    { runnerStatus: undefined },
    { runnerStatus: null },
    { runnerStatus: '' },
    { runnerStatus: 'unknown' },
    { runnerStatus: 'failed' },
    { runnerStatus: 'interrupted' },
    { runnerErrors: ['Self global error'] },
  ]) {
    const { report } = await output(dir, [result('UI-001', 'chromium')], metadata);
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.ok(report.integrity.length);
  }
  for (const event of [
    result('UI-001', 'chromium', 'PASS', { durationMs: -1 }),
    { ...result('UI-001', 'chromium'), status: 'unknown' } as unknown as CaseResult,
    { ...result('UI-001', 'chromium'), evidence: [false] } as unknown as CaseResult,
  ]) {
    const { report } = await output(dir, [event]);
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.equal(report.preflight.results[0].status, 'BLOCKED');
  }
});

test('missing, malformed or mismatched suite snapshots fail closed against current catalog', async (t) => {
  const dir = await directory(t);
  const original = suite();
  const snapshots: unknown[] = [
    undefined,
    null,
    'self-preflight',
    {},
    { ...original, caseIds: [] },
    { ...original, caseIds: ['UI-001', 'UI-001'] },
    { ...original, caseIds: ['UNKNOWN-001'] },
    { ...original, projects: ['fake'] },
    { ...original, projects: ['manual'] },
    { ...original, projects: ['system'] },
    { ...original, grep: '.*' },
    { ...original, cases: [] },
    { ...original, cases: [{ ...original.cases[0], title: 'Stale title' }] },
    { ...original, cases: [{ ...original.cases[0], automation: 'tests/api/other.spec.ts' }] },
    { ...original, cases: [{ ...original.cases[0], projects: ['webkit-smoke'] }] },
    { ...original, addedField: true },
  ];
  for (const snapshot of snapshots) {
    const { report, junit } = await output(dir, [result('UI-001', 'chromium')], {
      suite: snapshot,
    });
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.equal(report.preflight.selectedCaseCount, 0);
    assert.ok(report.results.every((r: CaseResult) => r.status === 'NOT_RUN'));
    assert.match(report.integrity.join(' '), /suite无效/);
    assert.match(junit, /invalid-suite/);
    assert.match(junit, /errors="1"/);
    notOfficial(report);
  }
  for (const mode of ['manual', 'blocked', 'candidate'] as const) {
    const changed = cases.map((c) => (c.id === 'UI-001' ? { ...c, mode } : c));
    const { report } = await output(dir, [result('UI-001', 'chromium')], {}, changed);
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.match(report.integrity.join(' '), /不可作为可执行子集/);
  }
});

test('formal and preparation report semantics remain separate from preflight', async (t) => {
  const dir = await directory(t);
  const selected = suite(
    cases.map((c) => c.id),
    ['system', 'chromium', 'firefox-smoke', 'webkit-smoke'],
  );
  const events = selected.cases.flatMap((c) => c.projects.map((project) => result(c.id, project)));
  let out = await output(dir, events, { phase: 'execution', suite: undefined });
  assert.equal(out.report.preflight, undefined);
  assert.equal(out.report.conclusions.functionality, 'PASS');
  assert.equal(out.report.conclusions.release, 'PASS');
  assert.equal(out.report.conclusions.unconditionalPass, true);
  assert.match(out.junit, /name="independent-qa"/);
  out = await output(dir, events, {
    phase: 'execution',
    executionApproval: { scope: 'all-required' },
  });
  assert.equal(out.report.conclusions.unconditionalPass, true);
  out = await output(dir, events, { phase: 'preparation' });
  assert.equal(out.report.preflight, undefined);
  assert.ok(out.report.results.every((r: CaseResult) => r.status === 'NOT_RUN'));
  assert.deepEqual(out.report.attempts, []);
  assert.equal(out.report.conclusions.unconditionalPass, false);
});

test('missing or unknown phase and formal execution carrying a subset cannot certify acceptance', async (t) => {
  const dir = await directory(t);
  const selected = suite(
    cases.map((c) => c.id),
    ['system', 'chromium', 'firefox-smoke', 'webkit-smoke'],
  );
  const events = selected.cases.flatMap((c) => c.projects.map((project) => result(c.id, project)));
  const metadataCases: Record<string, unknown>[] = [
    { phase: undefined },
    { phase: null },
    { phase: '' },
    { phase: 'unknown' },
    { phase: 'developer_preflight' },
    { phase: 'execution', suite: selected },
    { phase: 'execution', suite: null },
    { phase: 'execution', suiteSha256: suiteFingerprint(selected) },
    { phase: 'execution', suiteSha256: null },
    {
      phase: 'execution',
      executionApproval: {
        scope: 'developer-preflight',
        suiteId: selected.id,
        suiteSha256: suiteFingerprint(selected),
      },
    },
    { phase: 'execution', executionApproval: { scope: 'all-required', suiteId: selected.id } },
    { phase: 'execution', executionApproval: { scope: 'unknown' } },
  ];
  for (const metadata of metadataCases) {
    const { report, junit } = await output(dir, events, metadata);
    notOfficial(report);
    assert.ok(report.integrity.length);
    assert.match(junit, /errors="1"/);
    assert.match(junit, /REPORT-INTEGRITY/);
  }
});

test('self-consistent reduced suite cannot replace the frozen fingerprint or approved scope', async (t) => {
  const dir = await directory(t);
  const broad = suite(['UI-001'], ['chromium', 'webkit-smoke']);
  const reduced = suite(['UI-001'], ['chromium']);
  const approval = {
    scope: 'developer-preflight',
    suiteId: broad.id,
    suiteSha256: suiteFingerprint(broad),
  };
  let out = await output(dir, [result('UI-001', 'chromium')], {
    suite: reduced,
    suiteSha256: suiteFingerprint(broad),
    executionApproval: approval,
  });
  assert.equal(out.report.preflight.verdict, 'INCOMPLETE');
  assert.match(out.report.integrity.join(' '), /suiteSha256缺失或/);
  assert.equal(out.report.preflight.selectedCaseCount, 0);
  out = await output(dir, [result('UI-001', 'chromium')], {
    suite: reduced,
    suiteSha256: suiteFingerprint(reduced),
    executionApproval: approval,
  });
  assert.equal(out.report.preflight.verdict, 'INCOMPLETE');
  assert.match(out.report.integrity.join(' '), /executionApproval/);
  assert.ok(out.report.results.every((r: CaseResult) => r.status === 'NOT_RUN'));
  notOfficial(out.report);
});

test('preflight requires matching hash and safe execution approval record', async (t) => {
  const dir = await directory(t);
  const selected = suite();
  const fingerprint = suiteFingerprint(selected);
  const valid = { scope: 'developer-preflight', suiteId: selected.id, suiteSha256: fingerprint };
  const invalidApprovals: unknown[] = [
    undefined,
    null,
    [],
    'REDACTED',
    {},
    { ...valid, scope: 'all-required' },
    { ...valid, scope: undefined },
    { ...valid, suiteId: 'different-suite' },
    { ...valid, suiteId: undefined },
    { ...valid, suiteSha256: '0'.repeat(64) },
    { ...valid, suiteSha256: undefined },
  ];
  for (const approval of invalidApprovals) {
    const { report } = await output(dir, [result('UI-001', 'chromium')], {
      executionApproval: approval,
    });
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.match(report.integrity.join(' '), /executionApproval/);
    assert.equal(report.preflight.selectedCaseCount, 0);
    notOfficial(report);
  }
  for (const hash of [undefined, null, '', '0'.repeat(64)]) {
    const { report } = await output(dir, [result('UI-001', 'chromium')], { suiteSha256: hash });
    assert.equal(report.preflight.verdict, 'INCOMPLETE');
    assert.match(report.integrity.join(' '), /suiteSha256/);
  }
});
