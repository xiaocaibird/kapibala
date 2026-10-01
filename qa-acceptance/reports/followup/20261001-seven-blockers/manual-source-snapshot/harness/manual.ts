import { readFile, realpath, stat, lstat, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { constants } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import type { CaseDefinition, CaseResult } from './types.js';
import { isWithin, redact } from './security.js';
import { executionPlan, validatePlanManifest } from './execution-plan.js';
import { fileURLToPath } from 'node:url';
export interface ManualReview {
  caseId: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  actual: string;
  reviewer: string;
  performedAt: string;
  evidence: string[];
  defectSeverity?: 'P0' | 'P1' | 'P2';
  clarificationResolution?: {
    reference: string;
    approvedBy: string;
    approvedAt: string;
    evidence: string[];
  };
}
const requiredText = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim() && !/REQUIRED|待填写/.test(value);
async function evidenceFiles(run: string, files: unknown): Promise<string[]> {
  if (!Array.isArray(files) || !files.length || !files.every(requiredText))
    throw new Error('人工执行必须提供非空证据文件数组');
  const base = await realpath(run);
  const checked: string[] = [];
  for (const item of files) {
    const file = await realpath(resolve(base, item));
    if (!isWithin(base, file) || file === base || !(await stat(file)).isFile())
      throw new Error('人工证据必须是本run内真实文件');
    checked.push(relative(base, file).replaceAll('\\', '/'));
  }
  return checked;
}
export async function recordManual(
  run: string,
  cases: CaseDefinition[],
  review: ManualReview,
  now = Date.now(),
): Promise<CaseResult> {
  const c = cases.find((c) => c.id === review.caseId);
  if (!c || !['manual', 'blocked'].includes(c.mode))
    throw new Error('只允许登记manual/blocked用例，不能手填自动化通过');
  if (
    !['PASS', 'FAIL', 'BLOCKED'].includes(review.status) ||
    !requiredText(review.actual) ||
    !requiredText(review.reviewer)
  )
    throw new Error('缺少真实人工状态/实际观察/执行人');
  const manifest = JSON.parse(await readFile(resolve(run, 'manifest.json'), 'utf8'));
  if (!['execution', 'business-acceptance'].includes(manifest.phase))
    throw new Error('仅正式验收可录入人工执行结果');
  if (manifest.phase === 'business-acceptance') {
    const plan = await executionPlan(
      fileURLToPath(new URL('../', import.meta.url)),
      manifest.phase,
    );
    validatePlanManifest(plan, manifest);
    if (!plan.businessScope!.cases.some((item) => item.id === c.id))
      throw new Error('人工用例不在完整业务验收范围内');
  }
  const at = Date.parse(review.performedAt),
    start = Date.parse(manifest.startedAt);
  if (!Number.isFinite(at) || !Number.isFinite(start) || at < start || at > now)
    throw new Error('performedAt必须属于本run开始后且不能是未来');
  if (review.defectSeverity !== undefined && !['P0', 'P1', 'P2'].includes(review.defectSeverity))
    throw new Error('defectSeverity无效');
  const evidence = await evidenceFiles(run, review.evidence);
  if (c.mode === 'blocked' && review.status === 'PASS') {
    const resolution = review.clarificationResolution;
    if (
      !resolution ||
      !requiredText(resolution.reference) ||
      !requiredText(resolution.approvedBy) ||
      !Number.isFinite(Date.parse(resolution.approvedAt)) ||
      Date.parse(resolution.approvedAt) > at
    )
      throw new Error('阻塞用例通过必须附正式clarificationResolution批准信息');
    resolution.evidence = await evidenceFiles(run, resolution.evidence);
  }
  const id = randomUUID();
  const entry = { ...review, evidence, recordedAt: new Date(now).toISOString(), auditId: id };
  const auditDir = resolve(run, 'manual');
  await mkdir(auditDir, { recursive: true });
  if ((await lstat(auditDir)).isSymbolicLink()) throw new Error('审计目录不能为符号链接');
  const auditPath = resolve(auditDir, `${id}.json`);
  // The original automated events are immutable here; every manual entry gets a separate audit file.
  const body = redact(entry);
  await writeFile(auditPath, body, { flag: 'wx' });
  await appendFile(
    resolve(run, 'manual-reviews.ndjson'),
    JSON.stringify({
      auditId: id,
      path: `manual/${id}.json`,
      sha256: createHash('sha256').update(body).digest('hex'),
    }) + '\n',
    { flag: constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW },
  );
  const result: CaseResult = {
    id: c.id,
    status: review.status,
    project: 'manual',
    manualReviewId: id,
    performedAt: review.performedAt,
    ...(review.defectSeverity ? { defectSeverity: review.defectSeverity } : {}),
    ...(review.clarificationResolution
      ? { clarificationResolution: review.clarificationResolution }
      : {}),
    reason: `人工执行 ${review.reviewer} @ ${review.performedAt}: ${review.actual}`,
    evidence: [...evidence, `manual/${id}.json`],
  };
  await appendFile(
    resolve(run, 'manual-events.ndjson'),
    JSON.stringify(JSON.parse(redact(result))) + '\n',
    { flag: constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW },
  );
  return result;
}
export async function readManualEvents(run: string): Promise<CaseResult[]> {
  try {
    return (await readFile(resolve(run, 'manual-events.ndjson'), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CaseResult);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}
