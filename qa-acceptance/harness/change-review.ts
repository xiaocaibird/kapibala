import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { BlockedError, isWithin } from './security.js';
import type { TargetConfig } from './types.js';
const exec = promisify(execFile);
export interface ChangeReview {
  id: string;
  fromRevision: string;
  reviewedRevision: string;
  state: 'assets-prepared-not-executed';
  artifact: string;
  riskReview: string;
}
export function affectsAcceptance(path: string): boolean {
  // Default to review for unknown/new locations; only known QA and historical evidence are exempt.
  return !(
    path.startsWith('qa-acceptance/') ||
    path.startsWith('docs/evidence/') ||
    path.startsWith('docs/archives/')
  );
}
export async function readChangeReviews(root: string): Promise<ChangeReview[]> {
  const file = JSON.parse(
    await readFile(resolve(root, 'requirements/change-reviews.json'), 'utf8'),
  );
  if (file.version !== 1 || !Array.isArray(file.reviews) || !file.reviews.length)
    throw new Error('缺少QA变更影响评审登记');
  const ids = new Set<string>();
  const base = await realpath(root);
  for (const review of file.reviews as ChangeReview[]) {
    if (
      !review.id ||
      ids.has(review.id) ||
      review.state !== 'assets-prepared-not-executed' ||
      !/^[a-f0-9]{40}$/.test(review.fromRevision) ||
      !/^[a-f0-9]{40}$/.test(review.reviewedRevision)
    )
      throw new Error('变更影响评审字段无效或ID重复');
    ids.add(review.id);
    for (const path of [review.artifact, review.riskReview]) {
      if (typeof path !== 'string' || !path.startsWith('requirements/') || !path.endsWith('.md'))
        throw new Error('评审文档必须位于QA requirements');
      const actual = await realpath(resolve(base, path));
      if (!isWithin(base, actual) || !(await readFile(actual, 'utf8')).trim())
        throw new Error('评审文档缺失、为空或逃逸QA目录');
    }
  }
  return file.reviews as ChangeReview[];
}
/** Check before launching any SUT. Git reads only; no candidate module is executed. */
export async function reviewTargetChanges(
  root: string,
  target: Pick<TargetConfig, 'sut'>,
): Promise<Record<string, unknown>> {
  const reviews = await readChangeReviews(root);
  const unresolved: { reviewId: string; reason: string; paths?: string[] }[] = [];
  for (const review of [...reviews].reverse()) {
    try {
      await exec(
        'git',
        ['merge-base', '--is-ancestor', review.reviewedRevision, target.sut.revision],
        { cwd: target.sut.cwd },
      );
    } catch {
      unresolved.push({
        reviewId: review.id,
        reason: '候选不是已评审版本的后继，或缺少该历史提交',
      });
      continue;
    }
    const diff = await exec(
      'git',
      ['diff', '--name-only', '--no-renames', '-z', review.reviewedRevision, target.sut.revision],
      { cwd: target.sut.cwd },
    );
    const paths = diff.stdout.split('\0').filter(Boolean);
    const relevant = paths.filter(affectsAcceptance);
    if (relevant.length) {
      unresolved.push({
        reviewId: review.id,
        reason: '存在未评审的产品/契约/启动变更',
        paths: relevant,
      });
      continue;
    }
    const digest = async (path: string) =>
      createHash('sha256')
        .update(await readFile(resolve(root, path)))
        .digest('hex');
    return {
      ...review,
      artifactSha256: await digest(review.artifact),
      riskReviewSha256: await digest(review.riskReview),
      candidateRevision: target.sut.revision,
      changesOutsideAcceptanceScope: paths,
      conclusion: '已做变更影响评审；不代表场景充分性或产品通过',
    };
  }
  throw new BlockedError(
    `候选包含尚未完成QA影响评估的变化，需先更新评审与必要用例：${JSON.stringify(unresolved)}`,
  );
}
