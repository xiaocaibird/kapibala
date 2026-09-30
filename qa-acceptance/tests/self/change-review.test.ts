import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  affectsAcceptance,
  readChangeReviews,
  reviewTargetChanges,
} from '../../harness/change-review.js';
import type { TargetConfig } from '../../harness/types.js';
const exec = promisify(execFile);

test('变更范围区分产品/契约/环境与QA、历史证据，不把文件数当影响评审', () => {
  for (const path of [
    'apps/web/src/a.ts',
    'packages/contracts/a.ts',
    'db/migrations/1.sql',
    'scripts/start.ts',
    'package-lock.json',
    'tsconfig.json',
    'Dockerfile',
    'docker-compose.yml',
    'docs/decisions.md',
    'docs/architecture-reviews/review.md',
  ])
    assert.equal(affectsAcceptance(path), true, path);
  for (const path of [
    'qa-acceptance/tests/a.ts',
    'qa-acceptance/reports/a.json',
    'docs/evidence/historical.log',
    'docs/archives/old.md',
  ])
    assert.equal(affectsAcceptance(path), false, path);
});

test('实际Git差异闸门允许QA后继提交、拒绝同文件数的产品修改和早于评审的候选', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qa-change-review-'));
  const git = async (...args: string[]) => (await exec('git', args, { cwd: root })).stdout.trim();
  const commit = async (message: string) => {
    await git('add', '.');
    await git(
      '-c',
      'user.name=QA self-check',
      '-c',
      'user.email=qa-self-check@example.invalid',
      'commit',
      '-qm',
      message,
    );
    return git('rev-parse', 'HEAD');
  };
  try {
    await git('init', '-q');
    await mkdir(join(root, 'apps'), { recursive: true });
    await writeFile(join(root, 'apps/product.txt'), 'version one');
    const before = await commit('dummy initial tree');
    await writeFile(join(root, 'apps/product.txt'), 'reviewed version');
    const reviewed = await commit('dummy reviewed tree');
    const qa = join(root, 'qa-acceptance');
    await mkdir(join(qa, 'requirements'), { recursive: true });
    await writeFile(join(qa, 'requirements/impact.md'), '# Independently reviewed changes');
    await writeFile(join(qa, 'requirements/risks.md'), '# Partial coverage and blockers retained');
    await writeFile(
      join(qa, 'requirements/change-reviews.json'),
      JSON.stringify({
        version: 1,
        reviews: [
          {
            id: 'self-review',
            fromRevision: before,
            reviewedRevision: reviewed,
            state: 'assets-prepared-not-executed',
            artifact: 'requirements/impact.md',
            riskReview: 'requirements/risks.md',
          },
        ],
      }),
    );
    const qaOnly = await commit('dummy QA-only update');
    const target = (revision: string) =>
      ({ sut: { cwd: root, revision } }) as Pick<TargetConfig, 'sut'>;
    const result = await reviewTargetChanges(qa, target(qaOnly));
    assert.equal(result.candidateRevision, qaOnly);
    assert.equal(result.reviewedRevision, reviewed);
    assert.equal(typeof result.artifactSha256, 'string');
    await assert.rejects(reviewTargetChanges(qa, target(before)), /BLOCKED/);
    await writeFile(join(root, 'apps/product.txt'), 'unreviewed behavior, same filename count');
    const changed = await commit('dummy product modification');
    await assert.rejects(reviewTargetChanges(qa, target(changed)), /apps\/product.txt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('变更评审登记拒绝缺失/重复评审、伪执行状态和逃逸文档', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qa-review-metadata-'));
  try {
    await mkdir(join(root, 'requirements'));
    await writeFile(join(root, 'requirements/a.md'), 'review');
    const valid = {
      id: 'review',
      fromRevision: 'a'.repeat(40),
      reviewedRevision: 'b'.repeat(40),
      state: 'assets-prepared-not-executed',
      artifact: 'requirements/a.md',
      riskReview: 'requirements/a.md',
    };
    for (const reviews of [
      [],
      [valid, valid],
      [{ ...valid, state: 'product-passed' }],
      [{ ...valid, artifact: '../outside.md' }],
      [{ ...valid, riskReview: 'requirements/missing.md' }],
    ]) {
      await writeFile(
        join(root, 'requirements/change-reviews.json'),
        JSON.stringify({ version: 1, reviews }),
      );
      await assert.rejects(readChangeReviews(root));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
