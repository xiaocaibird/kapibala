import { mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { CaseDefinition, CaseResult, Requirement, ResultStatus } from './types.js';
import { redact } from './security.js';
import { caseProjects } from './catalog.js';
import { resolveSuiteDefinition, type ResolvedSuite } from './suites.js';
import { suiteFingerprint } from './execution-plan.js';

const rank: Record<ResultStatus, number> = { FAIL: 4, BLOCKED: 3, NOT_RUN: 2, PASS: 1 };
export function aggregateResults(cases: CaseDefinition[], events: CaseResult[]): CaseResult[] {
  return cases.map((c) => {
    const results = events.filter((r) => r.id === c.id);
    if (!results.length)
      return { id: c.id, status: 'NOT_RUN', reason: c.blocker ?? '尚未执行', evidence: [] };
    let projects: string[];
    try {
      projects = caseProjects(c);
    } catch (e) {
      return { id: c.id, status: 'BLOCKED', reason: String(e), evidence: [] };
    }
    const invalid = results.some(
      (r) =>
        !Object.hasOwn(rank, r.status) ||
        !projects.includes(r.project ?? 'system') ||
        !Array.isArray(r.evidence) ||
        !r.evidence.every((x) => typeof x === 'string') ||
        (r.durationMs !== undefined && (!Number.isFinite(r.durationMs) || r.durationMs < 0)),
    );
    if (invalid)
      return {
        id: c.id,
        status: results.some((r) => r.status === 'FAIL') ? 'FAIL' : 'BLOCKED',
        reason: '结果包含未知状态/项目或无效证据、耗时，不能作为通过证据',
        evidence: [],
      };
    if (
      results.some(
        (r) =>
          r.status === 'PASS' &&
          ['manual', 'blocked'].includes(c.mode) &&
          (!r.manualReviewId ||
            !r.evidence.length ||
            (c.mode === 'blocked' &&
              (!r.clarificationResolution?.reference ||
                !r.clarificationResolution.approvedBy ||
                !r.clarificationResolution.evidence?.length))),
      )
    )
      return {
        id: c.id,
        status: 'BLOCKED',
        reason: '人工/阻塞通过缺少审计ID、执行证据或正式澄清批准',
        evidence: [],
      };
    const represented = new Set(results.map((r) => r.project ?? 'system'));
    const missing = projects.filter((p) => !represented.has(p));
    const worst = results.reduce((a, b) => (rank[a.status] >= rank[b.status] ? a : b));
    const status = worst.status === 'PASS' && missing.length ? 'NOT_RUN' : worst.status;
    return {
      id: c.id,
      status,
      reason: missing.length
        ? `缺少项目执行: ${missing.join(', ')}; ${worst.reason ?? ''}`
        : worst.reason,
      durationMs: results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0),
      evidence: [...new Set(results.flatMap((r) => r.evidence))],
      ...(status === 'FAIL' ? { defectId: `DEF-${c.id}` } : {}),
    };
  });
}
export function verdict(
  required: CaseDefinition[],
  results: CaseResult[],
): 'PASS' | 'FAIL' | 'INCOMPLETE' {
  const ids = new Set(required.map((c) => c.id));
  const relevant = results.filter((r) => ids.has(r.id));
  if (relevant.some((r) => r.status === 'FAIL')) return 'FAIL';
  return ids.size > 0 &&
    ids.size === required.length &&
    [...ids].every((id) => {
      const matches = relevant.filter((r) => r.id === id);
      return matches.length === 1 && matches[0]?.status === 'PASS';
    })
    ? 'PASS'
    : 'INCOMPLETE';
}

const xml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const cell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');

function checkedSuite(metadata: Record<string, unknown>, cases: CaseDefinition[]): ResolvedSuite {
  const snapshot = metadata.suite;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new Error('缺少完整suite快照');
  const supplied = snapshot as Record<string, unknown>;
  const suite = resolveSuiteDefinition(
    {
      schemaVersion: 1,
      owner: 'QA',
      suites: [
        {
          id: supplied.id,
          title: supplied.title,
          purpose: supplied.purpose,
          caseIds: supplied.caseIds,
          projects: supplied.projects,
          riskBoundaries: supplied.riskBoundaries,
        },
      ],
    },
    cases,
    typeof supplied.id === 'string' ? supplied.id : '',
  );
  if (!isDeepStrictEqual(snapshot, suite))
    throw new Error('suite快照与当前catalog解析结果不一致（含grep、用例文件、名称或项目）');
  const fingerprint = suiteFingerprint(suite);
  if (metadata.suiteSha256 !== fingerprint)
    throw new Error('suiteSha256缺失或与完整suite快照不一致');
  const approval = metadata.executionApproval;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval))
    throw new Error('缺少开发预跑executionApproval安全记录');
  const approved = approval as Record<string, unknown>;
  if (
    approved.scope !== 'developer-preflight' ||
    approved.suiteId !== suite.id ||
    approved.suiteSha256 !== fingerprint
  )
    throw new Error('executionApproval的scope/suiteId/suiteSha256与预跑快照不一致');
  return suite;
}

export async function writeReport(
  root: string,
  requirements: Requirement[],
  cases: CaseDefinition[],
  events: CaseResult[],
  metadata: Record<string, unknown>,
): Promise<void> {
  await mkdir(root, { recursive: true });
  const integrity: string[] = [];
  const developerPreflight = metadata.phase === 'developer-preflight';
  if (
    typeof metadata.phase !== 'string' ||
    !['preparation', 'execution', 'developer-preflight'].includes(metadata.phase)
  )
    integrity.push(`缺失或未知报告阶段: ${String(metadata.phase)}`);
  if (metadata.phase === 'execution') {
    if (metadata.suite !== undefined || metadata.suiteSha256 !== undefined)
      integrity.push('正式验收报告不可携带开发子集suite或suiteSha256');
    if (metadata.executionApproval !== undefined) {
      const approval = metadata.executionApproval;
      if (
        !approval ||
        typeof approval !== 'object' ||
        Array.isArray(approval) ||
        (approval as Record<string, unknown>).scope !== 'all-required' ||
        (approval as Record<string, unknown>).suiteId !== undefined ||
        (approval as Record<string, unknown>).suiteSha256 !== undefined
      )
        integrity.push('正式验收executionApproval必须是无子集的all-required范围');
    }
  }
  if (metadata.phase === 'preparation' && events.length)
    integrity.push('准备报告忽略所有传入执行结果，产品用例保持NOT_RUN');
  const attempts = metadata.phase === 'preparation' ? [] : events;
  let suite: ResolvedSuite | undefined;
  let admittedAttempts = attempts;
  const rejectedAttempts: CaseResult[] = [];
  if (developerPreflight) {
    try {
      suite = checkedSuite(metadata, cases);
    } catch (error) {
      integrity.push(`开发预跑suite无效: ${String(error)}`);
    }
    const selectedPairs = new Set(
      suite?.cases.flatMap((c) => c.projects.map((project) => `${c.id}:${project}`)) ?? [],
    );
    admittedAttempts = attempts.filter((attempt) => {
      if (
        typeof attempt.project === 'string' &&
        selectedPairs.has(`${attempt.id}:${attempt.project}`)
      )
        return true;
      rejectedAttempts.push(attempt);
      integrity.push(`开发预跑包含非子集用例或项目: ${attempt.id}:${String(attempt.project)}`);
      return false;
    });
  }
  for (const event of attempts)
    if (!cases.some((c) => c.id === event.id))
      integrity.push(`未知用例结果: ${event.id} (${event.status})`);
  const knownCaseFailure = admittedAttempts.some(
    (event) => event.status === 'FAIL' && cases.some((c) => c.id === event.id),
  );
  if (
    developerPreflight &&
    (typeof metadata.runnerStatus !== 'string' ||
      !['passed', 'failed'].includes(metadata.runnerStatus))
  )
    integrity.push('开发预跑缺少有效执行器最终状态passed/failed，不能仅凭suite和事件宣称通过');
  if (
    metadata.runnerStatus &&
    metadata.runnerStatus !== 'passed' &&
    !(metadata.runnerStatus === 'failed' && knownCaseFailure)
  )
    integrity.push(`执行器整体状态: ${String(metadata.runnerStatus)}`);
  if (Array.isArray(metadata.runnerErrors) && metadata.runnerErrors.length)
    integrity.push('存在用例之外的执行器错误');
  if (new Set(cases.map((c) => c.id)).size !== cases.length) integrity.push('用例ID重复');
  if (new Set(requirements.map((r) => r.id)).size !== requirements.length)
    integrity.push('需求ID重复');
  for (const r of requirements)
    if (
      r.scope !== 'candidate' &&
      !cases.some((c) => c.mode !== 'candidate' && c.requirements.includes(r.id))
    )
      integrity.push(`必验需求无用例: ${r.id}`);
  for (const c of cases)
    for (const id of c.requirements)
      if (!requirements.some((r) => r.id === id)) integrity.push(`用例${c.id}引用未知需求${id}`);
  const results = aggregateResults(cases, admittedAttempts);
  const scope = (kind: string) =>
    cases.filter(
      (c) =>
        (kind === 'candidate' ? c.mode === 'candidate' : c.mode !== 'candidate') &&
        c.requirements.some((id) => requirements.find((r) => r.id === id)?.scope === kind),
    );
  const rawFunctionality = verdict(scope('required'), results),
    rawRelease = verdict(scope('release'), results);
  const functionality =
      developerPreflight || (rawFunctionality === 'PASS' && integrity.length)
        ? 'INCOMPLETE'
        : rawFunctionality,
    release =
      developerPreflight || (rawRelease === 'PASS' && integrity.length) ? 'INCOMPLETE' : rawRelease;
  const selectedCases =
    suite?.cases.map((selected) => {
      const original = cases.find((c) => c.id === selected.id)!;
      return { ...original, data: { ...original.data, projects: selected.projects } };
    }) ?? [];
  const selectedResults = aggregateResults(selectedCases, admittedAttempts);
  const projectResults = selectedCases.flatMap((c) =>
    caseProjects(c).map((project) => ({
      ...aggregateResults(
        [{ ...c, data: { ...c.data, projects: [project] } }],
        admittedAttempts.filter((attempt) => attempt.id === c.id && attempt.project === project),
      )[0]!,
      project,
    })),
  );
  const selectedVerdict = verdict(selectedCases, selectedResults);
  const preflight = developerPreflight
    ? {
        suiteId: suite?.id ?? null,
        verdict:
          selectedVerdict === 'FAIL'
            ? 'FAIL'
            : suite && selectedVerdict === 'PASS' && !integrity.length
              ? 'PASS'
              : 'INCOMPLETE',
        selectedCaseCount: selectedCases.length,
        selectedProjectCount: suite?.projects.length ?? 0,
        selectedCaseProjectCount: projectResults.length,
        counts: Object.fromEntries(
          ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map((status) => [
            status,
            selectedResults.filter((r) => r.status === status).length,
          ]),
        ),
        projects: suite?.projects ?? [],
        results: selectedResults,
        projectResults,
        attempts: admittedAttempts,
        rejectedAttempts,
        integrity,
        riskBoundaries: suite?.riskBoundaries ?? [],
        countingNote:
          'selectedProjectCount为项目数；selectedCaseProjectCount为所选用例与项目的应执行组合数。所有attempt取最差结果，未选范围不因此通过。',
        authority: '开发预跑，仅对该子集有效，不是正式QA验收或发布结论。',
      }
    : undefined;
  const total = cases.filter((c) => c.mode !== 'candidate').length;
  const counts = Object.fromEntries(
    ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map((s) => [
      s,
      results.filter(
        (r) => r.status === s && cases.find((c) => c.id === r.id)?.mode !== 'candidate',
      ).length,
    ]),
  );
  const scopeMetrics = (kind: string) => {
    const selected = scope(kind),
      selectedIds = new Set(selected.map((c) => c.id));
    const scopedCounts = Object.fromEntries(
      ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map((status) => [
        status,
        results.filter((r) => selectedIds.has(r.id) && r.status === status).length,
      ]),
    );
    const completed = (scopedCounts.PASS ?? 0) + (scopedCounts.FAIL ?? 0);
    return {
      caseCount: selected.length,
      counts: scopedCounts,
      completedCases: completed,
      executionRate: selected.length ? completed / selected.length : 0,
      passRateOfExecuted: completed ? (scopedCounts.PASS ?? 0) / completed : null,
    };
  };
  const completed = (counts.PASS ?? 0) + (counts.FAIL ?? 0);
  const defects = results
    .filter((r) => r.status === 'FAIL')
    .map((r) => {
      const c = cases.find((c) => c.id === r.id)!;
      const failedAttempts = admittedAttempts.filter((a) => a.id === r.id && a.status === 'FAIL');
      const severity =
        failedAttempts.filter((a) => a.defectSeverity).at(-1)?.defectSeverity ?? 'UNTRIAGED';
      return {
        id: r.defectId ?? `DEF-${r.id}`,
        caseId: r.id,
        title: c.title,
        requirements: c.requirements,
        severity,
        preconditions: c.preconditions,
        data: c.data,
        steps: c.steps,
        expected: c.expected,
        actual:
          failedAttempts
            .map((a) => a.reason)
            .filter(Boolean)
            .join('\n') ||
          r.reason ||
          '执行器报告失败，未提供实际现象；需补充证据',
        evidence: r.evidence,
        attemptTimeline: failedAttempts.map((a) => ({
          project: a.project,
          attempt: a.attempt,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          performedAt: a.performedAt,
          durationMs: a.durationMs,
          actual: a.reason,
          evidence: a.evidence,
        })),
      };
    });
  const mapping = requirements.map((r) => ({
    id: r.id,
    title: r.title,
    scope: r.scope,
    cases: cases.filter((c) => c.requirements.includes(r.id)).map((c) => c.id),
  }));
  const report = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata,
    ...(preflight ? { preflight } : {}),
    conclusions: {
      functionality,
      release,
      unconditionalPass:
        metadata.phase === 'execution' &&
        !integrity.length &&
        functionality === 'PASS' &&
        release === 'PASS',
    },
    metrics: {
      requirements: requirements.length,
      requirementsWithCases: mapping.filter((m) => m.cases.length).length,
      requiredCases: total,
      automated: cases.filter((c) => c.mode === 'automated').length,
      manual: cases.filter((c) => c.mode === 'manual').length,
      blockedDesign: cases.filter((c) => c.mode === 'blocked').length,
      candidate: cases.filter((c) => c.mode === 'candidate').length,
      counts,
      executionRate: total ? completed / total : 0,
      passRateOfRequired: total ? (counts.PASS ?? 0) / total : 0,
      passRateOfExecuted: completed ? (counts.PASS ?? 0) / completed : null,
      byScope: {
        required: scopeMetrics('required'),
        release: scopeMetrics('release'),
        candidate: scopeMetrics('candidate'),
      },
      scopeCountingNote:
        '映射多种scope的用例分别计入相应scope，分项不能直接相加。执行通过率分母只含PASS与FAIL，尚无已执行结果时为null。',
    },
    integrity,
    mapping,
    results,
    defects,
    attempts,
  };
  await writeFile(resolve(root, 'results.json'), redact(report), {
    flag: constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW,
  });
  const header = preflight
    ? `# 开发预跑报告\n\n子集：**${cell(preflight.suiteId ?? '无有效suite')}**；预跑结论：**${preflight.verdict}**。\n\n这是开发预跑，不是正式 QA 验收。正式需求符合性及上线准备度均为 **INCOMPLETE**，不能据此宣称正式验收或无条件通过。\n\n`
    : `# 独立 QA 验收报告\n\n需求符合性：**${functionality}**；上线准备度：**${release}**。\n\n${metadata.phase === 'preparation' ? '本报告是准备状态清单，未启动或连接被测系统，不能用于宣称产品验收通过。' : '仅对所记录版本、环境、用例和证据成立；有限故障实验不证明任意时刻绝对保证。'}\n\n`;
  const preflightText = preflight
    ? `所选 ${preflight.selectedCaseCount} 条用例、${preflight.selectedProjectCount} 个项目，共 ${preflight.selectedCaseProjectCount} 个用例/项目组合。未选项保持 NOT_RUN；仅完成Chromium不等于完成该用例要求的所有浏览器。JSON保留全部attempt及被拒绝的越界结果。\n\n## 预跑项目结果\n\n|用例|项目|结果|说明|\n|---|---|---|---|\n${preflight.projectResults.map((r) => `|${cell(r.id)}|${cell(r.project)}|${r.status}|${cell(r.reason ?? '')}|`).join('\n')}\n\n${preflight.riskBoundaries.map((risk) => `- ${cell(risk)}`).join('\n')}\n\n以下是完整catalog的观测清单，不能转用为正式验收结果。\n\n`
    : '';
  const text =
    header +
    preflightText +
    `- 范围内用例：${total}；通过 ${counts.PASS}，失败 ${counts.FAIL}，阻塞 ${counts.BLOCKED}，未执行 ${counts.NOT_RUN}。\n- 自动化 ${report.metrics.automated}，人工 ${report.metrics.manual}，设计阻塞 ${report.metrics.blockedDesign}，候选 ${report.metrics.candidate}。\n- 有用例覆盖、实际执行和通过率分别统计；跳过、缺少浏览器项目、缺少环境均不作通过。JSON另列required/release/candidate各范围计数及已执行通过率；多范围用例分别计数，不可直接相加。\n\n## 版本、环境与授权\n\n\x60\x60\x60json\n${redact(metadata)}\n\x60\x60\x60\n\n## 逐项结果\n\n|用例|需求|结果|说明|证据|\n|---|---|---|---|---|\n` +
    cases
      .map((c) => {
        const r = results.find((r) => r.id === c.id)!;
        return `|${c.id} ${cell(c.title)}|${c.requirements.join(', ')}|${r.status}|${cell(r.reason ?? '')}|${r.evidence.map((e) => `[证据](${e})`).join(' ')}|`;
      })
      .join('\n') +
    '\n\n## 缺陷与复测\n\n' +
    (defects.length
      ? defects
          .map(
            (d) =>
              `- ${d.id}：${cell(d.actual)}；严重级别 ${d.severity}，未分诊项待结合业务影响评定，不从用例优先级推断。JSON保存复现前提、步骤、预期、实际、证据及真实执行时间线。`,
          )
          .join('\n')
      : '本轮没有产品失败结果记录；这不表示没有缺陷。') +
    '\n\n## 报告完整性\n\n' +
    (integrity.length
      ? integrity.map((x) => `- ${cell(x)}`).join('\n')
      : '未发现未知用例或执行器完整性异常。') +
    '\n\n## 风险、例外与最终决定\n\n需求澄清、协议缺口及上线待定指标见 requirements/clarifications.md、requirements/release-gates.md。未执行或阻塞的必验项阻止无条件通过。例外需记录批准人、原要求、替代保证、剩余风险、有效版本和复测范围；本报告不自动接受例外。最终上线决定及人工签署单独填写。\n';
  await writeFile(resolve(root, 'acceptance.md'), text, {
    flag: constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW,
  });
  const junitResults = preflight ? preflight.projectResults : results;
  const junitIntegrity = integrity.length
    ? `<testcase classname="report-integrity" name="${preflight ? 'PREFLIGHT-INTEGRITY' : 'REPORT-INTEGRITY'}" time="0"><error message="${xml(integrity.join('; '))}"/></testcase>`
    : '';
  const junitName = preflight
    ? `developer-preflight:${preflight.suiteId ?? 'invalid-suite'}`
    : 'independent-qa';
  await writeFile(
    resolve(root, 'junit.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(junitName)}" tests="${junitResults.length + (junitIntegrity ? 1 : 0)}" failures="${junitResults.filter((r) => r.status === 'FAIL').length}" errors="${junitIntegrity ? 1 : 0}" skipped="${junitResults.filter((r) => r.status === 'BLOCKED' || r.status === 'NOT_RUN').length}">${junitResults.map((r) => `<testcase name="${xml(preflight ? `${r.id} [${r.project}]` : r.id)}" time="${(r.durationMs ?? 0) / 1000}">${r.status === 'PASS' ? '' : r.status === 'FAIL' ? `<failure message="${xml(r.reason ?? 'failed')}"/>` : `<skipped message="${xml(`${r.status}: ${r.reason ?? ''}`)}"/>`}</testcase>`).join('')}${junitIntegrity}</testsuite>\n`,
    { flag: constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW },
  );
}
