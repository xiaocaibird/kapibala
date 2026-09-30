import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  TestError,
} from '@playwright/test/reporter';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseResult } from './types.js';
import { readCatalog } from './catalog.js';
import { writeReport } from './report.js';
import { redact } from './security.js';
import { snapshotQaTree } from './provenance.js';

export default class QaReporter implements Reporter {
  private results: CaseResult[] = [];
  private errors: string[] = [];
  onError(error: TestError): void {
    this.errors.push(redact(error.message ?? error.value ?? 'unknown runner error'));
  }
  onTestEnd(test: TestCase, result: TestResult): void {
    const match = test.title.match(/^\[([A-Z][A-Z0-9-]+)\]/);
    if (!match) this.errors.push(`未登记用例ID: ${test.title}`);
    const reason = result.errors.map((e) => e.message ?? String(e)).join('\n');
    const blocked = result.errors.some(
      (e) =>
        /^(?:BlockedError: )?\[BLOCKED\]/.test(e.message ?? '') ||
        /^BlockedError: \[BLOCKED\]/m.test(e.stack ?? ''),
    );
    this.results.push({
      id: match?.[1] ?? `UNREGISTERED-${this.results.length + 1}`,
      status:
        result.status === 'passed'
          ? 'PASS'
          : blocked
            ? 'BLOCKED'
            : result.status === 'skipped'
              ? 'NOT_RUN'
              : 'FAIL',
      reason: redact(reason) || undefined,
      durationMs: result.duration,
      attempt: result.retry,
      ...(result.status !== 'skipped'
        ? {
            startedAt: result.startTime.toISOString(),
            completedAt: new Date(result.startTime.getTime() + result.duration).toISOString(),
          }
        : {}),
      project: test.parent.project()?.name ?? 'UNKNOWN_PROJECT',
      evidence: result.attachments
        .map((a) => a.path ?? (a.name === 'qa-evidence-directory' ? a.body?.toString() : undefined))
        .filter((x): x is string => !!x),
    });
  }
  async onEnd(result: FullResult): Promise<void> {
    const out = process.env.QA_RUN_DIRECTORY;
    if (!out) return;
    await mkdir(out, { recursive: true });
    await writeFile(resolve(out, 'events.json'), redact(this.results));
    const root = fileURLToPath(new URL('../', import.meta.url));
    const catalog = await readCatalog(root);
    let metadata: Record<string, unknown> = { phase: 'execution' };
    try {
      metadata = JSON.parse(await readFile(resolve(out, 'manifest.json'), 'utf8'));
    } catch (e) {
      this.errors.push(`缺少或损坏manifest: ${String(e)}`);
    }
    const qaTreeAfter = await snapshotQaTree(root);
    const before = metadata.qaTree as { sha256?: string } | undefined;
    if (!before?.sha256 || before.sha256 !== qaTreeAfter.sha256)
      this.errors.push('QA资产树与运行开始时不一致或缺少树指纹');
    const complete = {
      ...metadata,
      qaTreeAfter,
      runnerStatus: result.status,
      runnerErrors: this.errors,
    };
    await writeFile(
      resolve(out, 'runner-summary.json'),
      redact({
        runnerStatus: result.status,
        runnerErrors: this.errors,
        completedAt: new Date().toISOString(),
      }),
    );
    await writeReport(out, catalog.requirements, catalog.cases, this.results, complete);
  }
}
