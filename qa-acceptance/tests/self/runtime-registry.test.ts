// Preparation-only coverage of QA configuration. No engineering candidate or SUT is started.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BlockedError,
  capacityRegistryEnvironment,
  runtimeRegistryEnvironment,
  loadTarget,
  targetFingerprint,
} from '../../harness/security.js';
import { isolatedEnv } from '../../harness/process.js';
import type { TargetConfig } from '../../harness/types.js';

const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
async function temporary(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(await realpath('/tmp'), 'qa-rr-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function adapter(registryDirectory?: string): Pick<TargetConfig, 'adapters'> {
  return {
    adapters: {
      runtimeObservation: {
        url: 'http://127.0.0.1:39002',
        contractReference: 'SELFTEST ONLY - runtime candidate integration pending',
        ...(registryDirectory === undefined ? {} : { registryDirectory }),
      },
    },
  };
}

test('runtime registry is optional, isolated from host env and independent of capacity injection', async (t) => {
  const runtime = await temporary(t);
  const capacity = await temporary(t);
  const previous = process.env.QA_RUNTIME_REGISTRY_DIR;
  process.env.QA_RUNTIME_REGISTRY_DIR = '/host-must-not-be-inherited';
  t.after(() => {
    if (previous === undefined) delete process.env.QA_RUNTIME_REGISTRY_DIR;
    else process.env.QA_RUNTIME_REGISTRY_DIR = previous;
  });
  assert.deepEqual(await runtimeRegistryEnvironment({}), {});
  assert.deepEqual(await runtimeRegistryEnvironment(adapter()), {});
  assert.equal(
    isolatedEnv(await runtimeRegistryEnvironment(adapter())).QA_RUNTIME_REGISTRY_DIR,
    undefined,
  );
  const target = adapter(runtime);
  target.adapters!.capacityControl = {
    url: 'http://127.0.0.1:39001',
    contractReference: 'SELFTEST ONLY',
    registryDirectory: capacity,
  };
  assert.deepEqual(await runtimeRegistryEnvironment(target), { QA_RUNTIME_REGISTRY_DIR: runtime });
  assert.deepEqual(await capacityRegistryEnvironment(target), { QA_CAPACITY_REGISTRY_DIR: capacity });
  const env = isolatedEnv({
    ...(await capacityRegistryEnvironment(target)),
    ...(await runtimeRegistryEnvironment(target)),
  });
  assert.equal(env.QA_RUNTIME_REGISTRY_DIR, runtime);
  assert.equal(env.QA_CAPACITY_REGISTRY_DIR, capacity);
});

test('runtime registry rejects absent filesystem entries, files, aliases and control characters', async (t) => {
  const directory = await temporary(t);
  const file = join(directory, 'file');
  await writeFile(file, 'selftest');
  const link = join(directory, 'alias');
  await symlink(directory, link);
  await mkdir(join(directory, 'nested'), { mode: 0o700 });
  for (const path of [
    'relative', directory + '/', directory + '/./nested', join(directory, 'missing'),
    file, link, join(link, 'nested'), directory + '\n', directory + '\0',
  ])
    await assert.rejects(runtimeRegistryEnvironment(adapter(path)), BlockedError, path);
  await assert.rejects(realpath(join(directory, 'missing')), { code: 'ENOENT' });
});

test('runtime registry rechecks exact permissions and owner before every injection', async (t) => {
  const directory = await temporary(t);
  await runtimeRegistryEnvironment(adapter(directory));
  for (const mode of [0o755, 0o750, 0o1700]) {
    await chmod(directory, mode);
    await assert.rejects(runtimeRegistryEnvironment(adapter(directory)), BlockedError);
  }
  await chmod(directory, 0o700);
  const unixProcess = process as NodeJS.Process & { getuid(): number };
  const uid = unixProcess.getuid();
  const mockedUid = t.mock.method(unixProcess, 'getuid', () => uid + 1);
  await assert.rejects(runtimeRegistryEnvironment(adapter(directory)), BlockedError);
  mockedUid.mock.restore();
  await runtimeRegistryEnvironment(adapter(directory));
});

test('runtime registry enforces the 100-byte UUID socket path limit including multibyte names', async (t) => {
  const directory = await temporary(t);
  const suffix = '/00000000-0000-0000-0000-000000000000.sock';
  const remaining = 100 - Buffer.byteLength(directory + '/' + suffix);
  assert.ok(remaining >= 3);
  const exact = join(directory, '界' + 'a'.repeat(remaining - 3));
  await mkdir(exact, { mode: 0o700 });
  assert.equal(Buffer.byteLength(exact + suffix), 100);
  await runtimeRegistryEnvironment(adapter(exact));
  const tooLong = exact + 'b';
  await mkdir(tooLong, { mode: 0o700 });
  await assert.rejects(runtimeRegistryEnvironment(adapter(tooLong)), BlockedError);
});

test('target loading fingerprints optional runtime registry and keeps the QA env prohibition', async (t) => {
  const directory = await temporary(t);
  const file = join(directory, 'target.json');
  const config = JSON.parse(
    await readFile(join(qaRoot, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  config.sut.cwd = directory;
  config.sut.revision = 'a'.repeat(40);
  config.adapters = adapter().adapters;
  await writeFile(file, JSON.stringify(config));
  await loadTarget(file, qaRoot);
  const before = targetFingerprint(config);
  config.adapters = adapter(directory).adapters;
  await writeFile(file, JSON.stringify(config));
  const loaded = await loadTarget(file, qaRoot);
  assert.notEqual(targetFingerprint(loaded), before);
  const bound = targetFingerprint(loaded);
  const second = join(directory, 'second');
  await mkdir(second, { mode: 0o700 });
  loaded.adapters!.runtimeObservation!.registryDirectory = second;
  assert.notEqual(targetFingerprint(loaded), bound);
  config.sut.env.QA_RUNTIME_REGISTRY_DIR = directory;
  await writeFile(file, JSON.stringify(config));
  await assert.rejects(loadTarget(file, qaRoot), /QA_RUNTIME_REGISTRY_DIR 必须由隔离环境控制/);
  delete config.sut.env.QA_RUNTIME_REGISTRY_DIR;
  await chmod(directory, 0o755);
  await writeFile(file, JSON.stringify(config));
  await assert.rejects(loadTarget(file, qaRoot), BlockedError);
});
