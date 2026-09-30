import { createHash } from 'node:crypto';
import { resolveSuite, type ResolvedSuite } from './suites.js';
import { BlockedError, executionPurpose } from './security.js';

export interface ExecutionPlan {
  phase: 'execution' | 'developer-preflight';
  suite?: ResolvedSuite;
  suiteSha256?: string;
  playwrightArgs: string[];
}
export function suiteFingerprint(suite: ResolvedSuite): string {
  return createHash('sha256').update(JSON.stringify(suite)).digest('hex');
}
export async function executionPlan(
  root: string,
  phase: ExecutionPlan['phase'],
  suiteId?: string,
): Promise<ExecutionPlan> {
  if (phase === 'execution') {
    if (suiteId) throw new BlockedError('正式验收不接受子集选择');
    return { phase, playwrightArgs: ['test'] };
  }
  if (phase !== 'developer-preflight' || !suiteId)
    throw new BlockedError('开发预跑必须明确选择 QA 子集');
  const suite = await resolveSuite(root, suiteId);
  return {
    phase,
    suite,
    suiteSha256: suiteFingerprint(suite),
    playwrightArgs: ['test', '--grep', suite.grep, ...suite.projects.map((p) => `--project=${p}`)],
  };
}
export function validatePlanManifest(plan: ExecutionPlan, manifest: Record<string, unknown>): void {
  if (
    manifest.phase !== plan.phase ||
    JSON.stringify(manifest.playwrightArgs) !== JSON.stringify(plan.playwrightArgs)
  )
    throw new BlockedError('执行用途或选择参数与启动清单不一致');
  if (
    plan.phase === 'developer-preflight' &&
    (manifest.suiteSha256 !== plan.suiteSha256 ||
      JSON.stringify(manifest.suite) !== JSON.stringify(plan.suite))
  )
    throw new BlockedError('共享子集与冻结清单不一致，需重新记录授权和启动');
  const approval = manifest.executionApproval as
    { scope?: unknown; suiteId?: unknown; suiteSha256?: unknown } | undefined;
  if (
    plan.phase === 'developer-preflight' &&
    (!approval ||
      approval.scope !== 'developer-preflight' ||
      approval.suiteId !== plan.suite!.id ||
      approval.suiteSha256 !== plan.suiteSha256)
  )
    throw new BlockedError('预跑清单缺少与用途及子集绑定的批准记录');
  if (plan.phase === 'execution' && approval && approval.scope !== 'all-required')
    throw new BlockedError('开发预跑批准记录不能用于正式验收');
  if (
    plan.phase === 'execution' &&
    (manifest.suite !== undefined || manifest.suiteSha256 !== undefined)
  )
    throw new BlockedError('正式验收清单不可带开发子集');
}
export function assertSelectedCase(plan: ExecutionPlan, title: string, project: string): void {
  if (plan.phase !== 'developer-preflight') return;
  const id = /^\[([A-Z][A-Z0-9-]+)\]/.exec(title)?.[1];
  if (!plan.suite?.cases.some((c) => c.id === id && c.projects.includes(project)))
    throw new BlockedError('当前用例或浏览器项目不在已授权的开发子集内');
}
export async function currentExecutionPlan(root: string): Promise<ExecutionPlan> {
  const purpose = executionPurpose();
  const plan = await executionPlan(
    root,
    purpose.phase,
    purpose.phase === 'developer-preflight' ? purpose.suiteId : undefined,
  );
  if (purpose.phase === 'developer-preflight' && purpose.suiteSha256 !== plan.suiteSha256)
    throw new BlockedError('已授权共享子集的内容已改变');
  return plan;
}
