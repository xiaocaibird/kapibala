import { fileURLToPath } from 'node:url';
import { listRegistrations } from './catalog.js';
import { checkSuiteRegistrations, listSuites } from './suites.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const names = process.argv.slice(2);
  if (names.length > 1) throw new Error('用法：tsx harness/suites-check.ts [suite-id]');
  const [all, registrations] = await Promise.all([listSuites(root), listRegistrations(root)]);
  const selected = names.length ? all.filter((suite) => suite.id === names[0]) : all;
  if (!selected.length) throw new Error(`未知suite ${names[0]}`);
  const errors = selected.flatMap((suite) => checkSuiteRegistrations(suite, registrations));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    JSON.stringify(
      {
        productExecuted: false,
        purpose: '仅解析共享用例ID并核对Playwright --list；不启动fixture或产品',
        reportBoundary: '开发预跑结果不得转为正式验收；未执行用例继续NOT_RUN',
        suites: selected,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
