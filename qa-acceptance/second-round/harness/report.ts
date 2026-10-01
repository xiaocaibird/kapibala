import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { secondRoundCases, secondRoundRoot, type SecondRoundCase } from './scope.js';
import { validateResult, type RoundResult, type Status } from './result.js';

const escapeXml = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, c =>
  ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
const resultReason = (r: RoundResult) => r.reason ?? [...(r.uncoveredVariants ?? []), ...(r.variants ?? []).filter(v=>v.status!=='PASS').map(v=>`${v.id}: ${v.reason ?? v.status}`), ...(r.cleanupErrors ?? [])].join('；');
const cell = (s: unknown) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
export function latestResults(cases: SecondRoundCase[], results: RoundResult[]) {
  const ids = new Set(cases.map(c => c.id));
  const latest = new Map<string, RoundResult>();
  for (const result of results) {
    if (!ids.has(result.caseId)) throw new Error(`Unregistered result: ${result.caseId}`);
    validateResult(result);
    // A single fixed-version report never replaces its first observed result.
    if (latest.has(result.caseId)) throw new Error(`Duplicate execution needs a distinct retest report: ${result.caseId}`);
    latest.set(result.caseId, result);
  }
  return cases.map(c => ({ ...c, result: latest.get(c.id) ?? {
    caseId: c.id, status: 'NOT_RUN' as Status, variants: [], reason: '未执行；无当前版本证据',
  } }));
}
export async function writeSecondRoundReport(directory: string, manifest: Record<string, unknown>, results: RoundResult[]) {
  const cases = await secondRoundCases();
  const rows = latestResults(cases, results);
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 0 };
  for (const row of rows) counts[row.result.status]++;
  const reviewOnly=new Set(['SR-BE-DEL-001','SR-BE-DEL-002','SR-BE-DEL-003','SR-BE-MUT-001','SR-BE-MUT-002','SR-BE-MUT-003']);
  const categoryCounts={productRuntime:{PASS:0,FAIL:0,BLOCKED:0,NOT_RUN:0},deliveryReview:{PASS:0,FAIL:0,BLOCKED:0,NOT_RUN:0}};
  for(const row of rows) categoryCounts[reviewOnly.has(row.id)?'deliveryReview':'productRuntime'][row.result.status]++;
  const errors = (manifest.runnerErrors ?? []) as string[];
  const verdict = counts.FAIL ? 'FAIL' : counts.BLOCKED || counts.NOT_RUN || errors.length ? 'BLOCKED' : 'PASS';
  const scope = JSON.parse(await readFile(resolve(secondRoundRoot, 'config/execution-scope.json'), 'utf8'));
  const report = {
    schemaVersion: 1, phase: 'SECOND_ROUND_ACCEPTANCE', generatedAt: new Date().toISOString(),
    manifest, counts, categoryCounts, total: rows.length, assessmentRate: results.length / rows.length,
    resolvedOutcomeRate: (counts.PASS + counts.FAIL) / rows.length,
    passRateOverAllCases: counts.PASS / rows.length, verdict,
    conclusionLimits: ['这是固定版本第二轮范围内的独立结果，不改写首轮报告。',
      '首轮已知差异、真人待确认、真实provider及上线评估分别登记。',
      '自动重试为零；工具错误不自动算产品缺陷，部分子项通过不算整例通过。'],
    productionReadiness: 'NOT_ASSESSED', firstRoundDisposition: scope.firstRoundDisposition,
    cases: rows.map(({ result, ...c }) => ({ id: c.id, title: c.title, requirements: c.requirements,
      mode: c.mode, priority: c.priority, evidenceCategory:reviewOnly.has(c.id)?'deliveryReview':'productRuntime', ...result })),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = ['# 第二轮独立验收报告', '',
    `**本轮结论：${verdict}。上线准备度：未评估。**`, '',
    `固定产品：\`${manifest.sutRevision ?? '未冻结'}\`；QA：\`${manifest.qaRevision ?? '未冻结'}\`。`,
    `共 ${rows.length} 条：通过 ${counts.PASS}，失败 ${counts.FAIL}，阻塞 ${counts.BLOCKED}，未执行 ${counts.NOT_RUN}。`, '',
    `产品运行类：通过 ${categoryCounts.productRuntime.PASS}，失败 ${categoryCounts.productRuntime.FAIL}，阻塞 ${categoryCounts.productRuntime.BLOCKED}，未执行 ${categoryCounts.productRuntime.NOT_RUN}；交付材料核查：通过 ${categoryCounts.deliveryReview.PASS}，失败 ${categoryCounts.deliveryReview.FAIL}，阻塞 ${categoryCounts.deliveryReview.BLOCKED}，未执行 ${categoryCounts.deliveryReview.NOT_RUN}。`, '',
    '范围为 C1/C2、五项 P0、五项 P1 与受影响原功能。自动重试为零；研发日志仅作交付材料核查，不能替代产品实测。', '',
    '首轮五秒解释和真实 IME/焦点确认按负责人决定暂缓；已决定的工程处置及外部协议限制保留原始结论。第二轮发现的真实新增回归另列。付费 provider 缺许可时保留阻塞，独立离线用例继续执行。', '',
    '| 用例 | 标题 | 结果 | 说明 |', '|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${cell(r.title)} | ${r.result.status} | ${cell(resultReason(r.result))} |`), '',
    '逐项步骤与预期见同版本 cases/；原始事件、子项证据和清理异常见 results.json、events.ndjson 及 cases/ 证据目录。未命中故障窗口不得据此宣称恢复通过；有限执行不构成穷尽性证明。', '',
    ...(errors.length ? ['执行器/清理问题：', '', ...errors.map(e => `- ${e}`), ''] : []),
    '只有本轮所有必验项实际通过且未留阻塞/未执行，才能给出本轮无条件通过建议；最终产品上线决定仍由负责人作出。', '',
  ];
  await writeFile(resolve(directory, 'report.md'), lines.join('\n'));
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="second-round-independent" tests="${rows.length}" failures="${counts.FAIL}" errors="${counts.BLOCKED}" skipped="${counts.NOT_RUN}">`];
  for (const {id,title,result} of rows) {
    xml.push(`<testcase name="${escapeXml(id + ' ' + title)}" time="${(result.durationMs ?? 0)/1000}">`);
    const reason = resultReason(result);
    if (result.status === 'FAIL') xml.push(`<failure message="${escapeXml(reason)}"/>`);
    if (result.status === 'BLOCKED') xml.push(`<error type="BLOCKED" message="${escapeXml(reason)}"/>`);
    if (result.status === 'NOT_RUN') xml.push('<skipped type="NOT_RUN"/>');
    xml.push(`<system-out>${escapeXml(JSON.stringify(result))}</system-out>`, '</testcase>');
  }
  xml.push('</testsuite>');
  await writeFile(resolve(directory, 'junit.xml'), xml.join('\n') + '\n');
  const hashes: Record<string,string> = {};
  for (const file of ['report.md', 'results.json', 'junit.xml'])
    hashes[file] = createHash('sha256').update(await readFile(resolve(directory, file))).digest('hex');
  await writeFile(resolve(directory, 'report-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
  return report;
}
