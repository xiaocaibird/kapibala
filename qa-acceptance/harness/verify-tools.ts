import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { redact } from './security.js';
const root = fileURLToPath(new URL('../', import.meta.url));
if (
  JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).name !==
  'kapibala-independent-qa'
)
  throw new Error('必须在独立QA包执行');
const out = resolve(root, 'reports/preparation/tooling');
await mkdir(out, { recursive: true });
const environment = { ...process.env };
delete environment.QA_TARGET_CONFIG;
delete environment.QA_EXECUTION_AUTHORIZATION;
delete environment.QA_RUN_DIRECTORY;
const stages: Record<string, unknown>[] = [];
for (const script of [
  'typecheck',
  'test:self',
  'check:catalog',
  'check:impact',
  'render:cases',
  'prepare:report',
]) {
  const at = new Date();
  const begin = performance.now();
  let log = '';
  const child = spawn('npm', ['run', script], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => (log += String(c)));
  child.stderr.on('data', (c) => (log += String(c)));
  const code = await new Promise<number>((ok, bad) => {
    child.once('error', bad);
    child.once('exit', (code) => ok(code ?? 1));
  });
  const file = `${script.replaceAll(':', '-')}.log`;
  const clean = redact(log);
  await writeFile(resolve(out, file), clean);
  stages.push({
    script,
    exitCode: code,
    startedAt: at.toISOString(),
    durationMs: Math.round(performance.now() - begin),
    log: `tooling/${file}`,
    sha256: createHash('sha256').update(clean).digest('hex'),
  });
  console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${script}`);
  if (code !== 0) {
    process.exitCode = 1;
    console.error(clean);
    break;
  }
}
await writeFile(
  resolve(root, 'reports/preparation/tooling-verification.json'),
  JSON.stringify(
    {
      phase: 'QA_TOOLS_ONLY',
      productTestsExecuted: 0,
      productSystemsStarted: 0,
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Shanghai',
      node: process.version,
      stages,
    },
    null,
    2,
  ) + '\n',
);
