import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readCatalog, checkCatalog } from './catalog.js';
import { writeReport } from './report.js';
import { loadTarget, requireAuthorization, redact, targetFingerprint } from './security.js';
import { snapshotQaTree, reportDirectory } from './provenance.js';
import { recordManual, readManualEvents, type ManualReview } from './manual.js';
import { exec } from './process.js';
import type { CaseResult } from './types.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const [action, ...args] = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
async function regenerate(out: string): Promise<void> {
  const catalog = await readCatalog(root);
  const events = JSON.parse(await readFile(resolve(out, 'events.json'), 'utf8')) as CaseResult[];
  if (!Array.isArray(events)) throw new Error('events必须为执行结果数组');
  const manifest = JSON.parse(await readFile(resolve(out, 'manifest.json'), 'utf8'));
  let runner: Record<string, unknown>;
  try {
    runner = JSON.parse(await readFile(resolve(out, 'runner-summary.json'), 'utf8'));
  } catch {
    runner = { runnerStatus: 'unknown', runnerErrors: ['缺少runner-summary，不能恢复成完整通过'] };
  }
  await writeReport(
    out,
    catalog.requirements,
    catalog.cases,
    [...events, ...(await readManualEvents(out))],
    { ...manifest, ...runner },
  );
}
if (action === 'hash-target') {
  const path = option('--target');
  if (!path) throw new Error('需要 --target config/target.local.json');
  const target = await loadTarget(resolve(root, path), root);
  console.log(targetFingerprint(target));
} else if (action === 'prepare') {
  const catalog = await readCatalog(root);
  const out = await reportDirectory(root, 'reports/preparation', true);
  await writeReport(out, catalog.requirements, catalog.cases, [], {
    phase: 'preparation',
    sutExecutionAuthorized: false,
    productTestsExecuted: 0,
    qaTree: await snapshotQaTree(root),
    baseline: JSON.parse(await readFile(resolve(root, 'requirements/baseline.json'), 'utf8')),
  });
  console.log('已生成准备状态报告；全部产品用例 NOT_RUN。');
} else if (action === 'report') {
  const path = option('--run');
  if (!path) throw new Error('需要 --run reports/runs/<id>');
  await regenerate(await reportDirectory(root, path));
} else if (action === 'record-manual') {
  const path = option('--run'),
    input = option('--input');
  if (!path || !input) throw new Error('需要 --run 与 --input review.json');
  const out = await reportDirectory(root, path);
  const catalog = await readCatalog(root);
  await recordManual(
    out,
    catalog.cases,
    JSON.parse(await readFile(resolve(root, input), 'utf8')) as ManualReview,
  );
  await regenerate(out);
  console.log('已追加人工审计记录，原自动化events未修改。');
} else if (action === 'run') {
  const targetPath = option('--target'),
    authPath = option('--authorization');
  if (!targetPath || !authPath)
    throw new Error('产品验收尚未执行：必须提供 --target 与后续批准的 --authorization');
  process.env.QA_EXECUTION_AUTHORIZATION = resolve(root, authPath);
  process.env.QA_TARGET_CONFIG = resolve(root, targetPath);
  const target = await loadTarget(process.env.QA_TARGET_CONFIG, root);
  const authorization = await requireAuthorization(target);
  const errors = await checkCatalog(root);
  if (errors.length) throw new Error(errors.join('\n'));
  const baseline = JSON.parse(await readFile(resolve(root, 'requirements/baseline.json'), 'utf8'));
  const hash = createHash('sha256')
    .update(await readFile(resolve(target.sut.cwd, 'docs/original-interview-question.md')))
    .digest('hex');
  if (hash !== 'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75')
    throw new Error('原始需求校验值变化，停止执行');
  const runId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const out = await reportDirectory(root, `reports/runs/${runId}`, true);
  process.env.QA_RUN_DIRECTORY = out;
  const qaRevision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  const qaDirtyState = (
    await exec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })
  ).stdout;
  const qaTree = await snapshotQaTree(root),
    lock = await readFile(resolve(root, 'package-lock.json'));
  await writeFile(
    resolve(out, 'manifest.json'),
    redact({
      runId,
      phase: 'execution',
      startedAt: new Date().toISOString(),
      baseline,
      qaRevision,
      qaDirtyState,
      qaTree,
      sutRevision: target.sut.revision,
      targetSha256: targetFingerprint(target),
      target,
      authorization,
      originalSha256: hash,
      dependencyLockSha256: createHash('sha256').update(lock).digest('hex'),
      node: process.version,
      timezone: 'Asia/Shanghai',
    }),
    { flag: 'wx' },
  );
  const child = spawn(
    process.execPath,
    [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test'],
    { cwd: root, env: process.env, stdio: 'inherit' },
  );
  const relay = (signal: NodeJS.Signals) => {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  };
  const onInt = () => relay('SIGINT'),
    onTerm = () => relay('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  try {
    process.exitCode = await new Promise<number>((ok, bad) => {
      child.once('error', bad);
      child.once('exit', (code) => ok(code ?? 1));
    });
  } finally {
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
  try {
    const summary = JSON.parse(await readFile(resolve(out, 'results.json'), 'utf8'));
    if (!summary.conclusions.unconditionalPass && process.exitCode === 0) process.exitCode = 2;
  } catch {
    process.exitCode = process.exitCode || 2;
    console.error('执行器未生成完整报告，不能判通过');
  }
  console.log(`验收证据: ${out}`);
} else
  throw new Error(
    '用法: prepare | hash-target --target <file> | report --run <dir> | record-manual --run <dir> --input <review.json> | run --target <file> --authorization <file>',
  );
