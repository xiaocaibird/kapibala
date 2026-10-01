// One-run QA lifecycle wrapper. It does not start a SUT or create a database.
import { randomUUID, createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { OwnedProcess, exec, isolatedEnv, ownedListener } from '../harness/process.js';
import { availablePort } from '../harness/network.js';
import { capacityRegistryEnvironment, redact } from '../harness/security.js';
import { reportDirectory } from '../harness/provenance.js';

const usage = 'node --import tsx .runtime/owned-message-controller.ts --sut <frozen-worktree> --revision <40-char-SHA> --evidence <reports/path> --approval-reference <user-authorization-reference> --kind <capacity|message|runtime>';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}
const options = new Map<string, string>();
const allowed = new Set(['--sut', '--revision', '--evidence', '--approval-reference', '--kind']);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!, value = args[i + 1];
  if (!allowed.has(key) || options.has(key) || !value || value.startsWith('--'))
    throw new Error(usage);
  options.set(key, value);
}
if (options.size !== allowed.size) throw new Error(usage);
const kind = options.get('--kind')!;
if (!['capacity', 'message', 'runtime'].includes(kind)) throw new Error('Unknown controller kind');
const entryName = kind === 'capacity' ? 'qa-capacity-controller.ts' : `qa-${kind}-observation-controller.ts`;
const registryVariable = `QA_${kind.toUpperCase()}_REGISTRY_DIR`;
const portVariable = `QA_${kind.toUpperCase()}_PORT`;
if (!/^[a-f0-9]{40}$/.test(options.get('--revision')!)) throw new Error('Fixed full revision required');
if (process.version !== 'v24.21.0') throw new Error('Use the candidate runtime Node v24.21.0');
const qaRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const sut = await realpath(options.get('--sut')!);
const revision = options.get('--revision')!;
const git = async (...gitArgs: string[]) => (await exec('git', gitArgs, {
  cwd: sut, env: isolatedEnv({}), timeout: 10_000,
})).stdout.trim();
if (await realpath(await git('rev-parse', '--show-toplevel')) !== sut)
  throw new Error('SUT must be a repository root');
if (await git('rev-parse', 'HEAD') !== revision) throw new Error('Frozen candidate revision mismatch');
const primary = (await git('worktree', 'list', '--porcelain', '-z')).split('\0')[0]!.replace(/^worktree /, '');
if (await realpath(primary) === sut) throw new Error('Do not use the primary checkout');
if (await git('status', '--porcelain', '--untracked-files=all')) throw new Error('Candidate must be clean');
const entry = join(sut, 'scripts', entryName);
const entryInfo = await lstat(entry);
if (!entryInfo.isFile() || entryInfo.isSymbolicLink()) throw new Error('Controller entry must be a regular frozen file');

const out = await reportDirectory(qaRoot, resolve(qaRoot, options.get('--evidence')!, `controller-${randomUUID()}`), true);
const ownScript = await readFile(fileURLToPath(import.meta.url), 'utf8');
await writeFile(join(out, 'lifecycle-script.ts'), ownScript, { flag: 'wx' });
const evidence = async (kind: string, data: Record<string, unknown> = {}) => appendFile(
  join(out, 'lifecycle.ndjson'),
  JSON.stringify(JSON.parse(redact({ at: new Date().toISOString(), kind, ...data }))) + '\n',
);
await evidence('authorized-start', {
  sut, revision, runnerPid: process.pid, approvalReference: options.get('--approval-reference'),
  node: process.version, scriptSha256: createHash('sha256').update(ownScript).digest('hex'),
});

let registry: string | undefined;
let registryIdentity: { dev: number; ino: number } | undefined;
let markerBody: string | undefined;
let controller: OwnedProcess | undefined;
let guardianPid: number | undefined;
let stopReason: string | undefined;
const signals = ['SIGINT', 'SIGTERM'] as const;
const handlers = signals.map((signal) => {
  const handler = () => { stopReason ??= signal; };
  process.on(signal, handler);
  return handler;
});
try {
  registry = await mkdtemp(join(await realpath('/tmp'), `qa-${kind.slice(0, 3)}-`));
  await chmod(registry, 0o700);
  const info = await lstat(registry);
  registryIdentity = { dev: info.dev, ino: info.ino };
  markerBody = JSON.stringify({ runnerPid: process.pid, qaRoot, sut, revision, nonce: randomUUID() });
  await writeFile(join(registry, '.qa-lifecycle-owner.json'), markerBody, { flag: 'wx', mode: 0o600 });
  await capacityRegistryEnvironment({ adapters: { capacityControl: {
    url: 'http://127.0.0.1:1', contractReference: 'qa-capacity-control/1', registryDirectory: registry,
  } } });
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  controller = new OwnedProcess(
    { command: process.execPath, args: ['--import', 'tsx', entry] },
    sut,
    isolatedEnv({ [registryVariable]: registry, [portVariable]: String(port) }),
    join(out, 'controller.log'),
  );
  await evidence('registry-created', { registry, registryIdentity, port });
  if (stopReason) throw new Error(`Stopped before controller launch: ${stopReason}`);
  await controller.start();
  guardianPid = controller.pid;
  await evidence('guardian-started', { guardianPid });
  let ready = false;
  const deadline = performance.now() + 30_000;
  while (!stopReason && performance.now() < deadline) {
    controller.assertRunning();
    if (await ownedListener(port, controller)) {
      // This engineering entry intentionally emits no readiness log. Confirm the
      // exact owned TCP listener responds to its versioned read-only route;
      // per-SUT identity/capabilities remain the test client's separate check.
      const response = await fetch(`${url}/qa/${kind}/v1/capabilities`, {
        redirect: 'manual', signal: AbortSignal.timeout(2_000),
      });
      const body = await response.json() as { error?: unknown };
      ready = response.status === 400 && typeof body.error === 'string';
      await evidence('owned-listener-http-probe', {
        status: response.status, versionedRoute: `/qa/${kind}/v1/capabilities`,
        missingTargetRejected: ready, boundSutVerified: false,
      });
      if (ready) break;
    }
    await sleep(100);
  }
  if (!ready) throw new Error('Owned message controller did not publish readiness');
  const result = { component: `qa-owned-${kind}-controller-ready`, url, port, registryDirectory: registry,
    runnerPid: process.pid, guardianPid, sut, revision, evidenceDirectory: out };
  await writeFile(join(out, 'ready.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  await evidence('ready', result);
  console.log(JSON.stringify(result));
  while (!stopReason) {
    controller.assertRunning();
    await sleep(250);
  }
  await evidence('stop-requested', { signal: stopReason, guardianPid });
} catch (error) {
  process.exitCode = 1;
  await evidence('lifecycle-error', { error: String(error) });
  console.error(redact(String(error)));
} finally {
  let stopped = false;
  try {
    await controller?.stop();
    stopped = true;
    await evidence('owned-controller-stopped', { guardianPid });
  } catch (error) {
    process.exitCode = 1;
    await evidence('stop-unconfirmed', { guardianPid, error: String(error) });
  }
  if (registry && registryIdentity && markerBody && stopped) {
    try {
      const info = await lstat(registry);
      if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid!() ||
          info.dev !== registryIdentity.dev || info.ino !== registryIdentity.ino ||
          await readFile(join(registry, '.qa-lifecycle-owner.json'), 'utf8') !== markerBody)
        throw new Error('Registry ownership changed; retain instead of deleting');
      // A still-live SUT owns its bridge socket. Preserve it even though this wrapper created the parent.
      for (const file of await readdir(registry)) {
        if (!/^[0-9a-f-]{36}\.json$/.test(file)) continue;
        const registration = JSON.parse(await readFile(join(registry, file), 'utf8'));
        if (!Number.isSafeInteger(registration.appPid) || registration.appPid <= 0)
          throw new Error('Unrecognized registration; retain registry');
        try {
          process.kill(registration.appPid, 0);
          throw new Error('A registered SUT is still alive; retain registry');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
      await rm(registry, { recursive: true, force: false });
      await evidence('owned-registry-removed', { registry, registryIdentity });
    } catch (error) {
      process.exitCode = 1;
      await evidence('registry-retained', { registry, error: String(error) });
    }
  }
  signals.forEach((signal, index) => process.off(signal, handlers[index]!));
  console.log(JSON.stringify({ component: `qa-owned-${kind}-controller-stopped`, evidenceDirectory: out,
    exitCode: process.exitCode ?? 0 }));
}
