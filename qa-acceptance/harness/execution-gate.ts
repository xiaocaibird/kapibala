import { currentExecutionPlan, validatePlanManifest } from './execution-plan.js';
import { reviewTargetChanges } from './change-review.js';
import { realpath, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BlockedError,
  isWithin,
  loadTarget,
  requireAuthorization,
  targetFingerprint,
} from './security.js';

/** Playwright listing does not invoke globalSetup; actual execution always does. */
export default async function executionGate(): Promise<void> {
  const root = fileURLToPath(new URL('../', import.meta.url));
  if (!process.env.QA_TARGET_CONFIG || !process.env.QA_RUN_DIRECTORY)
    throw new BlockedError('产品测试必须通过已授权的acceptance CLI创建运行清单；不使用默认目标');
  const target = await loadTarget(process.env.QA_TARGET_CONFIG, root);
  await requireAuthorization(target);
  await reviewTargetChanges(root, target);
  const plan = await currentExecutionPlan(root);
  const out = await realpath(process.env.QA_RUN_DIRECTORY);
  const allowed = await realpath(
    resolve(root, plan.phase === 'developer-preflight' ? 'reports/preflight' : 'reports/runs'),
  );
  if (!isWithin(allowed, out) || out === allowed)
    throw new BlockedError('运行证据目录与当前正式验收/开发预跑用途不一致');
  const manifest = JSON.parse(await readFile(resolve(out, 'manifest.json'), 'utf8'));
  validatePlanManifest(plan, manifest);
  if (manifest.targetSha256 !== targetFingerprint(target))
    throw new BlockedError('执行manifest未绑定当前目标配置');
}
