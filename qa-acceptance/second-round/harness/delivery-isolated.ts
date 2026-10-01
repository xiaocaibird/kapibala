import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat, readdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { OwnedProcess, exec, isolatedEnv, ownedListener } from '../../harness/process.js';
import { PlatformClient } from '../../harness/platform-client.js';
import { BlockedError, redact } from '../../harness/security.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { secondRoundRoot } from './scope.js';

// Independently reviewed public command: random loopback ports; UUID Docker
// names and run/owner labels; exact manifest cleanup; no compose/down/prune.
const reviewedScriptSha256 = 'ac868241c41087013ceff48123f6454325f1997fa40b63f3a284149a13b2ca86';
interface Manifest {
  runId: string; ownerToken: string; ownerPid: number; ownerStarted: string;
  directory: string; containerName: string; containerId?: string; volumeName: string;
  engineArgs: string[]; engineId: string; revision: string;
  urls?: { api: string; web: string; gateway: string; agent: string };
  gatewayState: string; agentState: string;
}
export function isolatedEvents(log: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of log.split('\n')) {
    try { const value = JSON.parse(line); if (value && typeof value === 'object' && typeof value.event === 'string') events.push(value); }
    catch { /* npm's plain progress lines are not JSON events. */ }
  }
  return events;
}
export function validateDeliveryManifest(m: Manifest, path: string, runtimeRoot: string): void {
  assert.match(m.runId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.match(m.ownerToken, /^[a-f0-9]{64}$/);
  assert.equal(m.directory, resolve(runtimeRoot, `kapibala-local-${m.runId}`));
  assert.equal(path, resolve(m.directory, 'manifest.json'));
  assert.equal(m.containerName, `kapibala-local-${m.runId}`);
  assert.equal(m.volumeName, `${m.containerName}-data`);
  assert.equal(m.gatewayState, resolve(m.directory, 'gateway.json'));
  assert.equal(m.agentState, resolve(m.directory, 'agent.json'));
  assert.ok(Number.isSafeInteger(m.ownerPid) && m.ownerPid > 0 && m.ownerStarted);
  assert.equal(m.engineArgs.length, 2);
  assert.ok(['--host', '--context'].includes(m.engineArgs[0]!) && m.engineArgs[1]);
  for (const url of Object.values(m.urls ?? {})) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'http:'); assert.equal(parsed.hostname, '127.0.0.1'); assert.ok(parsed.port);
  }
}

/** Recovery is confined to this invocation's freshly created private TMPDIR.
 * A missing/bad manifest is retained and reported, never guessed or removed. */
export async function discoverDeliveryManifests(runtimeRoot: string, revision: string) {
  const manifests: { manifest: Manifest; path: string }[] = [];
  const unresolved: { path: string; reason: string }[] = [];
  const rootInfo = await lstat(runtimeRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || rootInfo.uid !== process.getuid?.() || (rootInfo.mode & 0o077) !== 0 || await realpath(runtimeRoot) !== runtimeRoot)
    throw new BlockedError('Cannot prove the current delivery TMPDIR identity; no recovery deletion permitted');
  for (const name of await readdir(runtimeRoot)) {
    if (!/^kapibala-local-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(name)) continue;
    const directory = resolve(runtimeRoot, name), path = resolve(directory, 'manifest.json');
    try {
      const dirInfo = await lstat(directory);
      assert.ok(dirInfo.isDirectory() && !dirInfo.isSymbolicLink());
      assert.equal(dirInfo.uid, process.getuid?.()); assert.equal(dirInfo.mode & 0o077, 0);
      assert.equal(await realpath(directory), directory);
      const fileInfo = await lstat(path);
      assert.ok(fileInfo.isFile() && !fileInfo.isSymbolicLink());
      assert.equal(fileInfo.uid, process.getuid?.()); assert.equal(fileInfo.mode & 0o077, 0);
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      assert.equal(manifest.version, 1); assert.equal(manifest.revision, revision);
      validateDeliveryManifest(manifest, path, runtimeRoot);
      manifests.push({ manifest, path });
    } catch (error) { unresolved.push({ path, reason: String(error) }); }
  }
  return { manifests, unresolved };
}

/** Invoke the final README entry as a public subprocess; no product module or
 * developer assertion is imported. QA observes actual HTTP and ownership. */
export async function readmeIsolatedDelivery(input: { sutDirectory: string; outputDir: string; revision: string; qa: QaEnvironment }) {
  const { sutDirectory, outputDir, revision, qa } = input;
  const source = await readFile(resolve(sutDirectory, 'scripts/isolated-dev.ts'));
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  if (sourceSha256 !== reviewedScriptSha256) throw new BlockedError('Public isolated entry changed after resource-safety review; review its exact cleanup before execution');
  const packageJson = JSON.parse(await readFile(resolve(sutDirectory, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['dev:isolated'], 'tsx scripts/isolated-dev.ts');
  const runtimeRoot = resolve(secondRoundRoot, '..', '.runtime', 'second-round-readme', `readme-delivery-${randomUUID()}`);
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(runtimeRoot), log = resolve(outputDir, 'readme-isolated.log');
  const owned = new OwnedProcess({ command: 'npm', args: ['run', 'dev:isolated'] }, sutDirectory, isolatedEnv({ TMPDIR: canonicalRoot }), log);
  let manifest: Manifest | undefined, manifestPath: string | undefined, primary: unknown;
  const evidencePath = resolve(outputDir, 'readme-isolated-evidence.json');
  const facts: Record<string, unknown> = { command: owned.command, sourceSha256, startedAt: new Date().toISOString(), evidenceLayer: 'current public README command plus independent QA HTTP and resource checks' };
  const readEvents = async () => isolatedEvents(await readFile(log, 'utf8').catch(() => ''));
  const runDocker = async (owner: Manifest, args: string[]) => (await exec('docker', [...owner.engineArgs, ...args], { env: isolatedEnv({}), timeout: 30_000 })).stdout.trim();
  const docker = async (args: string[]) => runDocker(manifest!, args);
  try {
    await owned.start();
    const deadline = performance.now() + 180_000;
    let ready = false;
    while (!ready && performance.now() < deadline) {
      const events = await readEvents(), preparing = events.find(e => e.event === 'isolated-preparing');
      if (preparing && typeof preparing.manifest === 'string') {
        const candidatePath = preparing.manifest;
        // Restrict any read before trusting fields from the product's manifest.
        if (dirname(dirname(candidatePath)) !== canonicalRoot || basename(candidatePath) !== 'manifest.json')
          throw new BlockedError('Public delivery manifest escaped this QA-owned temporary root');
        const info = await lstat(candidatePath);
        assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(info.uid, process.getuid?.()); assert.equal(info.mode & 0o077, 0);
        const candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as Manifest;
        validateDeliveryManifest(candidate, candidatePath, canonicalRoot);
        manifest = candidate; manifestPath = candidatePath;
      }
      ready = events.some(e => e.event === 'isolated-ready');
      if (!ready && owned.exitOutcome) throw new BlockedError(`Public isolated startup exited before ready: ${JSON.stringify(owned.exitOutcome)}`);
      if (!ready) await delay(40);
    }
    if (!ready || !manifest?.urls) throw new BlockedError('Public isolated entry did not establish its actual owned endpoints within the observation bound');
    assert.equal(manifest.revision, revision);
    const identity = (await exec('ps', ['-p', String(manifest.ownerPid), '-o', 'pgid=,lstart='], { timeout: 2000 })).stdout.trim();
    assert.equal(Number(identity.split(/\s+/)[0]), owned.pid);
    assert.equal(identity.split(/\s+/).slice(1).join(' '), manifest.ownerStarted.split(/\s+/).join(' '));
    for (const url of Object.values(manifest.urls)) assert.equal(await ownedListener(Number(new URL(url).port), owned), true);
    const container = JSON.parse(await docker(['container', 'inspect', '--format', '{{json .Config.Labels}}', manifest.containerName]));
    const volume = JSON.parse(await docker(['volume', 'inspect', '--format', '{{json .Labels}}', manifest.volumeName]));
    for (const labels of [container, volume]) { assert.equal(labels['kapibala.local.run'], manifest.runId); assert.equal(labels['kapibala.local.owner'], manifest.ownerToken); }
    const api = new PlatformClient(manifest.urls.api, { recorder: entry => qa.recordHttp({ ...entry, source: 'public-readme-entry' }) });
    const proxy = new PlatformClient(manifest.urls.web, { recorder: entry => qa.recordHttp({ ...entry, source: 'public-readme-proxy' }) });
    const health = await api.require(api.get('/api/health'), 200), proxyHealth = await proxy.require(proxy.get('/api/health'), 200);
    assert.deepEqual(proxyHealth, health);
    const page = await fetch(manifest.urls.web, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
    assert.equal(page.status, 200); assert.match(await page.text(), /<div id="root">/);
    await api.login(); const accounts = await api.accounts(); assert.equal(accounts.length, 6);
    const group = await api.createGroup(1);
    const viewer = await proxy.as('viewer');
    assert.equal((await viewer.post('/api/accounts/account-1/connect', {})).status, 403);
    facts.observed = { health, proxyHealth, accountCount: accounts.length, group: group.group, viewerWriteStatus: 403, revision };
    facts.ownership = { runId: manifest.runId, ownerPid: manifest.ownerPid, ownerStarted: manifest.ownerStarted, processGroup: owned.pid, containerName: manifest.containerName, containerId: manifest.containerId, volumeName: manifest.volumeName, engineId: manifest.engineId, urls: manifest.urls, directory: manifest.directory };
  } catch (error) { primary = error; facts.error = String(error); }
  finally {
    const errors: unknown[] = [];
    try {
      try {
        // Signal the identity-checked public owner, leaving its npm/tsx parents
        // alive to await successful cleanup and propagate the real exit code.
        if (owned.pid && !owned.exitOutcome) {
          if (manifest) {
            const identity=(await exec('ps',['-p',String(manifest.ownerPid),'-o','pgid=,lstart='],{timeout:2000})).stdout.trim();
            assert.equal(Number(identity.split(/\s+/)[0]),owned.pid);
            assert.equal(identity.split(/\s+/).slice(1).join(' '),manifest.ownerStarted.split(/\s+/).join(' '));
            process.kill(manifest.ownerPid,'SIGTERM');
          } else process.kill(-owned.pid,'SIGTERM');
          const until = performance.now() + 20_000;
          while (!owned.exitOutcome && performance.now() < until) await delay(40);
        }
      } catch(error) { errors.push(error); }
      finally { try { await owned.stop(); } catch(error) { errors.push(error); } }
      const discovered = await discoverDeliveryManifests(canonicalRoot, revision);
      facts.recoveryDiscovery = { manifestPaths: discovered.manifests.map(item => item.path), unresolved: discovered.unresolved };
      for (const item of discovered.unresolved) errors.push(new BlockedError(`Unproven delivery resource ownership retained at ${item.path}: ${item.reason}`));
      const candidates = new Map(discovered.manifests.map(item => [item.path, item.manifest]));
      if (manifest && manifestPath && !candidates.has(manifestPath) && !discovered.unresolved.some(item => item.path === manifestPath)) candidates.set(manifestPath, manifest);
      const cleanupRecords: Record<string, unknown>[] = [];
      for (const [path, owner] of candidates) {
        try {
          const invoke = (args: string[]) => runDocker(owner, args);
          if (await invoke(['info', '--format', '{{.ID}}']) !== owner.engineId) throw new BlockedError('Delivery Docker daemon identity changed; resources retained');
          // Before invoking the public cleanup, independently bind any existing
          // exact resources to the private manifest. A changed owner is retained.
          const containers = (await invoke(['ps', '-a', '--format', '{{.Names}}'])).split('\n');
          const volumes = (await invoke(['volume', 'ls', '--format', '{{.Name}}'])).split('\n');
          for (const [kind, name, exists] of [['container', owner.containerName, containers.includes(owner.containerName)], ['volume', owner.volumeName, volumes.includes(owner.volumeName)]] as const) {
            if (!exists) continue;
            const format = kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}';
            const labels = JSON.parse(await invoke([kind, 'inspect', '--format', format, name]));
            if (labels?.['kapibala.local.run'] !== owner.runId || labels?.['kapibala.local.owner'] !== owner.ownerToken)
              throw new BlockedError(`Delivery ${kind} identity changed; retained ${name}`);
            if (kind === 'container' && owner.containerId && await invoke(['container', 'inspect', '--format', '{{.Id}}', name]) !== owner.containerId)
              throw new BlockedError(`Delivery container ID changed; retained ${name}`);
          }
          const exists = await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
          if (exists) {
            // Public recovery also checks dead owner, canonical directory,
            // daemon and labels; this invocation never kills a PID from a file.
            const cleanup = new OwnedProcess({ command: 'npm', args: ['run', 'dev:isolated', '--', 'cleanup', path] }, sutDirectory, isolatedEnv({ TMPDIR: canonicalRoot }), resolve(outputDir, `readme-recovery-${owner.runId}.log`));
            await cleanup.runOnce(90_000); facts.recoveryCleanupUsed = true;
          }
          assert.ok(!(await invoke(['ps', '-a', '--format', '{{.Names}}'])).split('\n').includes(owner.containerName));
          assert.ok(!(await invoke(['volume', 'ls', '--format', '{{.Name}}'])).split('\n').includes(owner.volumeName));
          assert.equal(await lstat(owner.directory).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false);
          cleanupRecords.push({ runId: owner.runId, containerAbsent: true, volumeAbsent: true, directoryAbsent: true });
        } catch (error) { errors.push(error); cleanupRecords.push({ runId: owner.runId, incomplete: true, error: String(error) }); }
      }
      facts.cleanup = { resources: cleanupRecords, completedAt: new Date().toISOString(), unresolved: discovered.unresolved };
      facts.exitOutcome = owned.exitOutcome; facts.events = await readEvents();
      if (!primary) {
        assert.equal(owned.exitOutcome?.code, 0, 'README normal shutdown must complete, not merely recover leaked resources');
        assert.ok((facts.events as Record<string, unknown>[]).some(e => e.event === 'isolated-cleaned'));
      }
    } catch (error) { errors.push(error); }
    facts.cleanupErrors = errors.map(String);
    await writeFile(evidencePath, redact(facts) + '\n');
    if (errors.length) throw new AggregateError(primary ? [primary, ...errors] : errors, 'Public README delivery/cleanup evidence incomplete');
  }
  if (primary) throw primary;
  return { evidencePath, facts };
}
