import { fileURLToPath } from 'node:url';
import { checkCatalog, readCatalog } from './catalog.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const errors = await checkCatalog(root);
const c = await readCatalog(root);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `追踪检查通过：${c.requirements.length}项需求，${c.cases.length}条用例。该检查不执行产品。`,
  );
