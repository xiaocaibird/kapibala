// Independent receiver execution of the published README. No application imports.
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile, lstat, realpath } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const out = dirname(fileURLToPath(import.meta.url));
const qa = resolve(out, '../../../..');
const execute = promisify(execFile);
const prep = JSON.parse(await readFile(resolve(out, 'readme-preparation.json'), 'utf8'));
const formalRun = process.argv[2];
assert(formalRun, 'Pass the existing formal all-business run directory');
const manifest = JSON.parse(await readFile(resolve(formalRun, 'manifest.json'), 'utf8'));
assert.equal(manifest.phase, 'business-acceptance');
assert.equal(manifest.sutRevision, prep.sutRevision);
assert.equal(manifest.qaRevision, 'ec46f9b30fb2f5a312c92fc78463ddbfe200042f');
assert(Date.parse(manifest.startedAt) <= Date.now());
assert.equal((await execute('git', ['rev-parse', 'HEAD'], { cwd: prep.cloneDirectory })).stdout.trim(), prep.sutRevision);
for (const [file, hash] of Object.entries(prep.hashes))
  assert.equal(createHash('sha256').update(await readFile(resolve(prep.cloneDirectory, file))).digest('hex'), hash);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/^(QA_|GEMINI_|DATABASE_URL$|GATEWAY_URL$|AGENT_URL$|PORT$)/.test(k)));
const dockerEnv = { ...env }; delete dockerEnv.DOCKER_HOST; delete dockerEnv.DOCKER_CONTEXT;
const safe = (text) => text.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[REDACTED_DATABASE_URL]')
  .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/("(?:accessToken|refreshToken|password|ownerToken)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
const result = { sutRevision: prep.sutRevision, qaRevision: manifest.qaRevision, formalRunId: manifest.runId,
  formalStartedAt: manifest.startedAt, startedAt: new Date().toISOString(), status: 'RUNNING',
  productImports: false, readmeCommands: [], browser: [], operations: [] };
const save = (name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2) + '\n');
const dock = async (m, args) => (await execute('docker', [...m.engineArgs, ...args], { env: dockerEnv, timeout: 30000 })).stdout.trim();
async function ownManifest(event) {
  const s = await lstat(event.manifest);
  assert(!s.isSymbolicLink() && s.isFile() && s.uid === process.getuid() && (s.mode & 0o777) === 0o600);
  assert.equal(await realpath(event.manifest), event.manifest);
  const m = JSON.parse(await readFile(event.manifest, 'utf8'));
  assert.equal(m.runId, event.runId); assert.equal(m.ownerPid, event.ownerPid);
  assert.equal(m.revision, prep.sutRevision);
  assert.equal((await execute('ps', ['-p', String(m.ownerPid), '-o', 'lstart='])).stdout.trim(), m.ownerStarted);
  assert.equal(Number((await execute('ps', ['-p', String(m.ownerPid), '-o', 'uid='])).stdout.trim()), process.getuid());
  assert((await execute('ps', ['-p', String(m.ownerPid), '-o', 'command='])).stdout.includes('isolated-dev.ts'));
  for (const value of Object.values(event.urls ?? {})) {
    const u = new URL(value); assert.equal(u.hostname, '127.0.0.1'); assert(u.port);
  }
  return m; // Private fields remain in process memory only.
}
async function capture(m, stage) {
  const c = JSON.parse(await dock(m, ['container', 'inspect', m.containerName]))[0];
  const v = JSON.parse(await dock(m, ['volume', 'inspect', m.volumeName]))[0];
  for (const labels of [c.Config.Labels, v.Labels]) {
    assert.equal(labels['kapibala.local.run'], m.runId);
    assert.equal(labels['kapibala.local.owner'], m.ownerToken);
  }
  assert.equal(c.Id, m.containerId); assert.equal(await dock(m, ['info', '--format', '{{.ID}}']), m.engineId);
  const item = { stage, observedAt: new Date().toISOString(), runId: m.runId,
    ownerPid: m.ownerPid, ownerStarted: m.ownerStarted, uid: process.getuid(),
    ownerTokenSha256: createHash('sha256').update(m.ownerToken).digest('hex'),
    engineId: m.engineId, engineArgs: m.engineArgs, containerId: c.Id, containerName: m.containerName,
    volumeName: m.volumeName, mounts: c.Mounts, ports: c.NetworkSettings.Ports,
    manifestMode: '0600', privateManifestArchived: false };
  await save(stage + '-resources.json', item);
}
async function verifyAbsent(m, stage) {
  assert.equal(await dock(m, ['info', '--format', '{{.ID}}']), m.engineId);
  const containers = (await dock(m, ['ps', '-a', '--format', '{{.Names}}'])).split('\n');
  const volumes = (await dock(m, ['volume', 'ls', '--format', '{{.Name}}'])).split('\n');
  assert(!containers.includes(m.containerName)); assert(!volumes.includes(m.volumeName));
  let directoryAbsent = false;
  try { await lstat(m.directory); } catch (e) { if (e.code === 'ENOENT') directoryAbsent = true; else throw e; }
  assert(directoryAbsent);
  await save(stage + '-cleanup.json', { checkedAt: new Date().toISOString(), runId: m.runId,
    containerName: m.containerName, containerAbsent: true, volumeName: m.volumeName,
    volumeAbsent: true, directoryAbsent: true, exactOwnedNamesOnly: true });
}
async function start(stage, smoke) {
  const args = ['run', 'dev:isolated', ...(smoke ? ['--', '--smoke'] : [])];
  const state = { stage, command: ['npm', ...args], startedAt: new Date().toISOString(), events: [], lines: [],
    ready: undefined, preparing: undefined, privateManifest: undefined, captureError: undefined };
  result.readmeCommands.push(state);
  active = state;
  const child = spawn('npm', args, { cwd: prep.cloneDirectory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  state.npmPid = child.pid;
  const operations = [];
  let buffer = '';
  const read = (chunk) => {
    buffer += chunk.toString();
    for (;;) {
      const p = buffer.indexOf('\n'); if (p < 0) break;
      const line = buffer.slice(0, p); buffer = buffer.slice(p + 1);
      state.lines.push(safe(line));
      try {
        const event = JSON.parse(line); if (!event.event) continue;
        state.events.push(event);
        if (event.event === 'isolated-preparing') state.preparing = event;
        if (event.event === 'isolated-ready') {
          state.ready = event;
          operations.push((async () => {
            state.privateManifest = await ownManifest(event);
            await capture(state.privateManifest, stage);
          })().catch(e => { state.captureError = safe(String(e)); }));
        }
      } catch {}
    }
  };
  child.stdout.on('data', read); child.stderr.on('data', read);
  state.exited = new Promise((ok, reject) => { child.once('error', reject); child.once('exit', (code, signal) => { state.exit = { code, signal }; ok(); }); });
  const end = Date.now() + 180000;
  while (!state.ready && !state.exit && Date.now() < end) await delay(50);
  assert(state.ready, 'README startup did not reach ready inside diagnostic observation window');
  await Promise.all(operations); assert(!state.captureError, state.captureError);
  return state;
}
async function finish(state, stop) {
  if (stop && !state.exit) {
    const m = await ownManifest(state.ready ?? state.preparing);
    state.privateManifest ??= m;
    process.kill(m.ownerPid, 'SIGINT'); // Only the actual owner we just revalidated.
    result.operations.push({ action: 'SIGINT', ownerPid: m.ownerPid, ownerStarted: m.ownerStarted, at: new Date().toISOString() });
  }
  await Promise.race([state.exited, delay(60000, undefined, { ref: false }).then(() => { throw new Error('Owned README cleanup still pending after diagnostic wait'); })]);
  state.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, state.stage + '.log'), state.lines.join('\n') + '\n');
  assert.equal(state.exit.code, 0);
  assert(state.events.some(e => e.event === 'isolated-cleaned' && e.runId === (state.ready ?? state.preparing).runId));
  await verifyAbsent(state.privateManifest, state.stage);
}
let active;
let browser;
try {
  active = await start('readme-smoke', true);
  await finish(active, false);
  assert(active.events.some(e => e.event === 'isolated-smoke-passed'));
  active = await start('readme-ui', false);
  const { chromium } = createRequire(resolve(qa, 'package.json'))('@playwright/test');
  browser = await chromium.launch({ headless: true });
  for (const role of ['admin', 'viewer']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], responses = [];
    page.on('pageerror', e => errors.push(safe(e.message)));
    page.on('response', r => { if (new URL(r.url()).pathname.startsWith('/api/')) responses.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    await page.goto(active.ready.urls.web);
    await page.locator('input[autocomplete="username"]').fill(role);
    await page.locator('input[type="password"]').fill(role);
    await page.locator('button.login-submit').click();
    await page.locator('nav a[href="#/accounts"]').waitFor();
    await page.locator('nav a[href="#/accounts"]').click();
    await page.getByRole('heading', { name: '服务账号', exact: true }).waitFor();
    await page.getByText('account-1', { exact: true }).first().waitFor();
    const accountText = await page.locator('main').innerText();
    await page.screenshot({ path: resolve(out, role + '-accounts.png'), fullPage: true });
    await page.locator('nav a[href="#/groups"]').click();
    await page.getByRole('heading', { name: '群组工作台', exact: true }).waitFor();
    await page.getByRole('heading', { name: '从第一个群组开始', exact: true }).waitFor();
    const groupText = await page.locator('main').innerText();
    await page.screenshot({ path: resolve(out, role + '-groups.png'), fullPage: true });
    assert.equal(errors.length, 0);
    assert(responses.some(r => r.path === '/api/auth/login' && r.status === 200));
    assert(responses.some(r => r.path === '/api/accounts' && r.status === 200));
    assert(responses.some(r => r.path === '/api/group-directory' && r.status === 200));
    result.browser.push({ role, isolatedContext: true, publicNavigation: true, accountText, groupText, responses, pageErrors: errors });
    await context.close();
  }
  await browser.close(); browser = undefined;
  await finish(active, true); active = undefined;
  result.status = 'PASS';
} catch (e) {
  result.status = 'REVIEW_REQUIRED'; result.error = safe(e.stack ?? String(e));
  if (browser) await browser.close().catch(() => {});
  if (active && !active.exit) await finish(active, true).catch(e => { result.cleanupError = safe(String(e)); });
} finally {
  result.finishedAt = new Date().toISOString();
  result.readmeCommands = result.readmeCommands.map(({ privateManifest, exited, lines, ...publicState }) => publicState);
  await save('readme-execution.json', result);
  console.log(JSON.stringify({ status: result.status, error: result.error, cleanupError: result.cleanupError, productStarts: result.readmeCommands.length }));
}
if (result.status !== 'PASS') process.exitCode = 1;
