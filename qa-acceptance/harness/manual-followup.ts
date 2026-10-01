import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  realpath,
  appendFile,
  open,
  unlink,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readCatalog } from './catalog.js';
import { snapshotQaTree, reportDirectory } from './provenance.js';
import {
  requireAuthorization,
  targetFingerprint,
  isWithin,
  redact,
  BlockedError,
} from './security.js';
import { exec } from './process.js';
import type { TargetConfig, Authorization, CaseDefinition, Requirement } from './types.js';
import { verifyLiveManualPreparation, type LivePreparationInput } from './manual-followup-live.js';

export const manualCaseIds = ['MAN-IME-001', 'MAN-FOCUS-001', 'MAN-UX-001'] as const;
const originalSha256 = 'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const text = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim() && !/REQUIRED|REPLACE_WITH|待填写/.test(value);
const utc = () => new Date().toISOString();
const time = (value: string) => {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw new Error('必须是真实ISO时间');
  return at;
};
type Evidence = { path: string; sha256: string; bytes: number };
export interface ManualScope {
  kind: 'three-manual-business-followup';
  cases: CaseDefinition[];
  requirements: Requirement[];
}
export async function readManualFollowupScope(root: string): Promise<ManualScope> {
  const catalog = await readCatalog(root);
  const cases = manualCaseIds.map((id) => {
    const found = catalog.cases.filter((c) => c.id === id);
    if (found.length !== 1 || found[0]!.mode !== 'manual')
      throw new Error(`人工续测用例缺失或模式变化：${id}`);
    return found[0]!;
  });
  const ids = new Set(cases.flatMap((c) => c.requirements));
  const requirements = catalog.requirements
    .filter((r) => ids.has(r.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (requirements.length !== ids.size || requirements.some((r) => r.scope !== 'required'))
    throw new Error('人工续测需求缺失或超出业务范围');
  return { kind: 'three-manual-business-followup', cases, requirements };
}
export const manualScopeFingerprint = (scope: ManualScope): string => hash(JSON.stringify(scope));
interface Manifest {
  version: 1;
  phase: 'manual-followup';
  sessionId: string;
  startedAt: string;
  scope: ManualScope;
  manualScopeSha256: string;
  originalSha256: string;
  targetSha256: string;
  sutRevision: string;
  sutDirectory: string;
  qaRevision: string;
  qaDirtyState: string;
  qaTree: Awaited<ReturnType<typeof snapshotQaTree>>;
  dependencyLockSha256: string;
  executionApproval: Authorization;
  approvalFileSha256: string;
  completeBusinessAcceptance: false;
}
export interface ManualReady extends LivePreparationInput {
  verifiedBy: string;
  environment: { os: string; browser: string; browserVersion: string; inputMethod: string };
  evidence: string[];
}
export interface ManualFollowupReview {
  caseId: (typeof manualCaseIds)[number];
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  actual: string;
  reviewer: string;
  startedAt: string;
  performedAt: string;
  operator: {
    id: string;
    human: boolean;
    readImplementationExplanation?: boolean;
    readExpectedAnswers?: boolean;
    priorCoaching?: boolean;
  };
  evidence: string[];
  steps: { index: number; status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN'; actual: string }[];
  expectations: {
    index: number;
    status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
    actual: string;
  }[];
  supersedesReviewId?: string;
}
interface Audit {
  reviewId: string;
  recordedAt: string;
  manifestSha256: string;
  readySha256: string;
  review: ManualFollowupReview;
  evidence: Evidence[];
}

async function safeRun(root: string, input: string): Promise<string> {
  const run = await reportDirectory(root, input);
  if (!isWithin(resolve(await realpath(root), 'reports/manual-followup'), run))
    throw new Error('只能使用独立reports/manual-followup会话，禁止旧run/preflight');
  return run;
}
async function immutable(path: string, value: unknown) {
  await writeFile(path, redact(value) + '\n', { flag: 'wx', mode: 0o600 });
}
async function evidence(run: string, paths: string[]): Promise<Evidence[]> {
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length)
    throw new Error('需要非空、无重复真实证据');
  const result: Evidence[] = [];
  for (const item of paths) {
    if (
      !text(item) ||
      isAbsolute(item) ||
      item.split(/[\\/]/).includes('..') ||
      !/^(evidence|manual-input)\//.test(item)
    )
      throw new Error('证据必须是会话evidence/manual-input内相对路径');
    let current = run;
    for (const part of item.split('/')) {
      current = resolve(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('证据路径不得经过符号链接');
    }
    const file = await realpath(current),
      stat = await lstat(file);
    if (!isWithin(run, file) || !stat.isFile() || stat.size === 0)
      throw new Error('证据必须是本会话内非空真实文件');
    const bytes = await readFile(file);
    result.push({
      path: relative(run, file).replaceAll('\\', '/'),
      sha256: hash(bytes),
      bytes: bytes.length,
    });
  }
  return result;
}
async function manifest(root: string, input: string): Promise<{ run: string; value: Manifest }> {
  const run = await safeRun(root, input),
    value = await json<Manifest>(resolve(run, 'manifest.json'));
  if (
    value.version !== 1 ||
    value.phase !== 'manual-followup' ||
    value.originalSha256 !== originalSha256 ||
    value.completeBusinessAcceptance !== false ||
    JSON.stringify(value.scope?.cases.map((c) => c.id)) !== JSON.stringify(manualCaseIds) ||
    manualScopeFingerprint(value.scope) !== value.manualScopeSha256 ||
    value.executionApproval.scope !== 'manual-followup' ||
    value.executionApproval.manualScopeSha256 !== value.manualScopeSha256 ||
    value.executionApproval.targetSha256 !== value.targetSha256 ||
    value.executionApproval.sutRevision !== value.sutRevision ||
    value.executionApproval.sutDirectory !== value.sutDirectory
  )
    throw new Error('人工会话版本/固定范围/目标/批准绑定不一致');
  if (
    time(value.startedAt) < time(value.executionApproval.approvedAt) ||
    time(value.startedAt) >= time(value.executionApproval.expiresAt)
  )
    throw new Error('会话不在真实批准期间');
  return { run, value };
}
async function currentSource(root: string, m: Manifest) {
  if (
    manualScopeFingerprint(await readManualFollowupScope(root)) !== m.manualScopeSha256 ||
    (await snapshotQaTree(root)).sha256 !== m.qaTree.sha256
  )
    throw new BlockedError('QA源或三条人工范围已变化；禁止用新资产悄悄覆盖当前会话');
}

/** No SUT/browser launch. The existing safety gate verifies the dedicated frozen target. */
export async function beginManualFollowup(root: string, target: TargetConfig): Promise<string> {
  const scope = await readManualFollowupScope(root),
    scopeSha = manualScopeFingerprint(scope);
  if (
    process.env.QA_EXECUTION_KIND !== 'manual-followup' ||
    process.env.QA_EXECUTION_MANUAL_SHA256 !== scopeSha
  )
    throw new BlockedError('begin缺少固定人工用途与摘要');
  const approval = await requireAuthorization(target, 'manual-followup');
  const original = hash(
    await readFile(resolve(target.sut.cwd, 'docs/original-interview-question.md')),
  );
  if (original !== originalSha256) throw new BlockedError('原始需求发生变化');
  const startedAt = utc(),
    sessionId = `${startedAt.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const parent = await reportDirectory(root, 'reports/manual-followup', true);
  const run = resolve(parent, sessionId);
  await mkdir(run);
  await mkdir(resolve(run, 'evidence'));
  await mkdir(resolve(run, 'reviews'));
  const value: Manifest = {
    version: 1,
    phase: 'manual-followup',
    sessionId,
    startedAt,
    scope,
    manualScopeSha256: scopeSha,
    originalSha256: original,
    targetSha256: targetFingerprint(target),
    sutRevision: target.sut.revision,
    sutDirectory: target.sut.cwd,
    qaRevision: (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(),
    qaDirtyState: (
      await exec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })
    ).stdout,
    qaTree: await snapshotQaTree(root),
    dependencyLockSha256: hash(await readFile(resolve(root, 'package-lock.json'))),
    executionApproval: approval,
    approvalFileSha256: hash(await readFile(process.env.QA_EXECUTION_AUTHORIZATION!)),
    completeBusinessAcceptance: false,
  };
  await immutable(resolve(run, 'manifest.json'), value);
  return run;
}
export async function readyManualFollowup(
  root: string,
  input: string,
  target: TargetConfig,
  ready: ManualReady,
): Promise<void> {
  const { run, value: m } = await manifest(root, input);
  await currentSource(root, m);
  await requireAuthorization(target, 'manual-followup');
  if (targetFingerprint(target) !== m.targetSha256 || !text(ready.verifiedBy))
    throw new Error('ready目标/复核人缺失');
  if (
    !Object.values(ready.environment ?? {}).length ||
    !['os', 'browser', 'browserVersion', 'inputMethod'].every((key) =>
      text(ready.environment[key as keyof ManualReady['environment']]),
    )
  )
    throw new Error('缺少真实OS/浏览器/输入法环境');
  const files = await evidence(run, ready.evidence);
  const verified = await verifyLiveManualPreparation(root, target, ready).catch((error) => {
    throw error instanceof BlockedError
      ? error
      : new BlockedError(`无法建立真实环境归属：${String(error)}`);
  });
  for (const document of verified.documents) {
    const path = `evidence/raw-${document.name}`;
    await writeFile(resolve(run, path), document.content, { flag: 'wx', mode: 0o600 });
    files.push(...(await evidence(run, [path])));
  }
  await immutable(resolve(run, 'evidence/live-binding.json'), verified.witness);
  files.push(...(await evidence(run, ['evidence/live-binding.json'])));
  await currentSource(root, m);
  await requireAuthorization(target, 'manual-followup');
  await immutable(resolve(run, 'ready.json'), {
    version: 1,
    readyAt: utc(),
    manifestSha256: hash(await readFile(resolve(run, 'manifest.json'))),
    ready,
    liveBinding: verified.witness,
    evidence: files,
  });
}

async function indexedAudits(run: string): Promise<Audit[]> {
  let body = '';
  try {
    body = await readFile(resolve(run, 'review-index.ndjson'), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const result: Audit[] = [];
  for (const line of body.split('\n').filter(Boolean)) {
    const entry = JSON.parse(line) as { id: string; sha256: string };
    if (!/^[a-f0-9-]{36}$/.test(entry.id)) throw new Error('非法审计ID');
    const path = resolve(run, 'reviews', `${entry.id}.json`);
    if ((await lstat(path)).isSymbolicLink()) throw new Error('审计不接受符号链接');
    const content = await readFile(path);
    if (hash(content) !== entry.sha256) throw new Error('不可变审计摘要不符');
    const audit = JSON.parse(content.toString()) as Audit;
    if (
      audit.reviewId !== entry.id ||
      result.some((a) => a.reviewId === entry.id) ||
      audit.review.supersedesReviewId !==
        result.filter((a) => a.review.caseId === audit.review.caseId).at(-1)?.reviewId
    )
      throw new Error('审计ID/index/明确复测链不一致');
    result.push(audit);
  }
  return result;
}
function validateReview(review: ManualFollowupReview, m: Manifest, readyAt: string, now: number) {
  const c = m.scope.cases.find((item) => item.id === review.caseId);
  if (
    !c ||
    !['PASS', 'FAIL', 'BLOCKED'].includes(review.status) ||
    !text(review.actual) ||
    !text(review.reviewer) ||
    !text(review.operator?.id)
  )
    throw new Error('只允许三项真实人工观察，必须提供状态/原话摘要/操作者/复核人');
  const start = time(review.startedAt),
    done = time(review.performedAt);
  if (
    start < time(readyAt) ||
    done < start ||
    done > now ||
    done >= time(m.executionApproval.expiresAt)
  )
    throw new Error('真人动作必须在ready后、批准期内且不是未来；不倒录raw体验');
  if (review.status !== 'BLOCKED' && review.operator.human !== true)
    throw new Error('非真人观察不能判PASS/FAIL');
  if (
    review.caseId === 'MAN-UX-001' &&
    review.status !== 'BLOCKED' &&
    (review.operator.readImplementationExplanation !== false ||
      review.operator.readExpectedAnswers !== false ||
      review.operator.priorCoaching !== false)
  )
    throw new Error('UX已预读/被指导或资格未知只能记录BLOCKED与体验，不能独立验收');
  for (const [rows, size] of [
    [review.steps, c.steps.length],
    [review.expectations, c.expected.length],
  ] as const) {
    if (
      !Array.isArray(rows) ||
      new Set(rows.map((r) => r.index)).size !== rows.length ||
      rows.some(
        (r) =>
          !Number.isInteger(r.index) ||
          r.index < 0 ||
          r.index >= size ||
          !['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(r.status) ||
          !text(r.actual),
      )
    )
      throw new Error('逐步/逐预期记录格式错误');
    if (review.status === 'PASS' && (rows.length !== size || rows.some((r) => r.status !== 'PASS')))
      throw new Error('缺步骤/预期或有阻塞不能整项PASS');
  }
  if (
    review.status === 'FAIL' &&
    ![...review.steps, ...review.expectations].some((r) => r.status === 'FAIL')
  )
    throw new Error('FAIL必须定位真实违约步骤或预期');
}
export async function recordManualFollowup(
  root: string,
  input: string,
  review: ManualFollowupReview,
): Promise<string> {
  const { run, value: m } = await manifest(root, input);
  await currentSource(root, m);
  const readyPath = resolve(run, 'ready.json'),
    ready = await json<{
      readyAt: string;
      manifestSha256: string;
      evidence: Evidence[];
      liveBinding: { expiresAt: string };
    }>(readyPath);
  if (ready.manifestSha256 !== hash(await readFile(resolve(run, 'manifest.json'))))
    throw new Error('ready不是本会话绑定');
  validateReview(review, m, ready.readyAt, Date.now());
  if (time(review.performedAt) >= time(ready.liveBinding.expiresAt))
    throw new Error('真人动作已超真实环境租期，需重新准备与ready');
  const files = await evidence(run, review.evidence);
  for (const old of ready.evidence)
    if ((await evidence(run, [old.path]))[0]!.sha256 !== old.sha256)
      throw new Error('ready证据已改变');
  const lockPath = resolve(run, '.record.lock'),
    lock = await open(lockPath, 'wx', 0o600),
    identity = await lock.stat();
  let primary: unknown;
  try {
    const audits = await indexedAudits(run),
      previous = audits.filter((a) => a.review.caseId === review.caseId).at(-1);
    if (review.supersedesReviewId !== previous?.reviewId)
      throw new Error('重复记录必须明确supersedesReviewId，不得静默覆盖首次');
    const reviewId = randomUUID();
    const audit: Audit = {
      reviewId,
      recordedAt: utc(),
      manifestSha256: hash(await readFile(resolve(run, 'manifest.json'))),
      readySha256: hash(await readFile(readyPath)),
      review,
      evidence: files,
    };
    const path = resolve(run, 'reviews', `${reviewId}.json`);
    await immutable(path, audit);
    await appendFile(
      resolve(run, 'review-index.ndjson'),
      JSON.stringify({ id: reviewId, sha256: hash(await readFile(path)) }) + '\n',
      {
        flag: constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
        mode: 0o600,
      },
    );
    return reviewId;
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    try {
      await lock.close();
      const current = await lstat(lockPath);
      if (current.ino === identity.ino && current.dev === identity.dev && !current.isSymbolicLink())
        await unlink(lockPath);
    } catch (error) {
      if (!primary) throw error;
      console.error(`manual record secondary lock cleanup error: ${String(error)}`);
    }
  }
}
export async function reportManualFollowup(root: string, input: string): Promise<string> {
  const { run, value: m } = await manifest(root, input),
    audits = await indexedAudits(run);
  const integrityErrors: string[] = [];
  try {
    await currentSource(root, m);
  } catch (e) {
    integrityErrors.push(String(e));
  }
  let ready:
    { readyAt: string; evidence: Evidence[]; liveBinding: { expiresAt: string } } | undefined;
  try {
    ready = await json(resolve(run, 'ready.json'));
    for (const file of ready!.evidence)
      if ((await evidence(run, [file.path]))[0]!.sha256 !== file.sha256)
        integrityErrors.push(`ready:${file.path}:摘要改变`);
  } catch (error) {
    if (audits.length || (error as NodeJS.ErrnoException).code !== 'ENOENT')
      integrityErrors.push(`ready:${String(error)}`);
  }
  for (const audit of audits) {
    try {
      if (!ready) throw new Error('missing ready');
      validateReview(audit.review, m, ready.readyAt, time(audit.recordedAt));
      if (
        time(audit.recordedAt) > Date.now() ||
        time(audit.review.performedAt) >= time(ready.liveBinding.expiresAt)
      )
        throw new Error('审计在未来或动作超环境租期');
    } catch (e) {
      integrityErrors.push(`${audit.reviewId}:${String(e)}`);
    }
    if (
      audit.manifestSha256 !== hash(await readFile(resolve(run, 'manifest.json'))) ||
      audit.readySha256 !== hash(await readFile(resolve(run, 'ready.json')))
    )
      integrityErrors.push(`${audit.reviewId}:版本/ready摘要改变`);
    for (const file of audit.evidence) {
      try {
        const current = await evidence(run, [file.path]);
        if (current[0]!.sha256 !== file.sha256)
          integrityErrors.push(`${audit.reviewId}:${file.path}:摘要改变`);
      } catch (error) {
        integrityErrors.push(`${audit.reviewId}:${file.path}:${String(error)}`);
      }
    }
  }
  const results = manualCaseIds.map((id) => {
    const last = audits.filter((a) => a.review.caseId === id).at(-1);
    return last
      ? {
          caseId: id,
          status: last.review.status,
          effectiveStatus: integrityErrors.length ? 'BLOCKED' : last.review.status,
          reviewId: last.reviewId,
          actual: last.review.actual,
        }
      : { caseId: id, status: 'NOT_RUN', effectiveStatus: 'NOT_RUN', actual: '尚无正式真人记录' };
  });
  const report = {
    version: 1,
    phase: 'manual-followup',
    generatedAt: utc(),
    sessionId: m.sessionId,
    sutRevision: m.sutRevision,
    manualScopeSha256: m.manualScopeSha256,
    results,
    integrityErrors,
    allThreePassed: integrityErrors.length === 0 && results.every((r) => r.status === 'PASS'),
    completeBusinessAcceptance: false,
    releaseReadinessAssessed: false,
    priorReportsModified: false,
    auditCount: audits.length,
    boundary: '仅三条人工续测；raw体验不倒录，不能代替完整业务验收或上线结论',
  };
  const id = `report-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await immutable(resolve(run, `${id}.json`), report);
  await writeFile(
    resolve(run, `${id}.md`),
    `# 人工续测记录（仅三条）\n\n候选 ${m.sutRevision}；会话 ${m.sessionId}。\n\n| 用例 | 本次原始记录 | 有效结论 | 实际观察 |\n| --- | --- | --- | --- |\n${results.map((r) => `| ${r.caseId} | ${r.status} | ${r.effectiveStatus} | ${r.actual.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n')}\n\n完整业务验收结论：未由本报告给出。上线评估：未进行。证据完整性错误：${integrityErrors.length}。旧报告保持不变。\n${integrityErrors.map((e) => `\n- ${e}`).join('')}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  return resolve(run, `${id}.json`);
}
