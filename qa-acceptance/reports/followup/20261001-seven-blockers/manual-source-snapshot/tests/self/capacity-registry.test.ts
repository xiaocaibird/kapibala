import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BlockedError,
  capacityRegistryEnvironment,
  loadTarget,
  targetFingerprint,
} from '../../harness/security.js';
import { isolatedEnv } from '../../harness/process.js';
import type { TargetConfig } from '../../harness/types.js';

const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
async function temporary(t: TestContext): Promise<string> {
  // Canonical /tmp is short enough for the real engineering socket path contract.
  const directory = await mkdtemp(join(await realpath('/tmp'), 'qa-cr-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function adapter(registryDirectory?: string): Pick<TargetConfig, 'adapters'> {
  return {
    adapters: {
      capacityControl: {
        url: 'http://127.0.0.1:39001',
        contractReference: 'SELFTEST ONLY - no controller or SUT started',
        ...(registryDirectory === undefined ? {} : { registryDirectory }),
      },
    },
  };
}

test('registry injection is opt-in, validates a real directory and never inherits host QA env', async (t) => {
  const directory = await temporary(t);
  const previous = process.env.QA_CAPACITY_REGISTRY_DIR;
  process.env.QA_CAPACITY_REGISTRY_DIR = '/host-must-not-be-inherited';
  t.after(() => {
    if (previous === undefined) delete process.env.QA_CAPACITY_REGISTRY_DIR;
    else process.env.QA_CAPACITY_REGISTRY_DIR = previous;
  });
  assert.deepEqual(await capacityRegistryEnvironment({}), {});
  assert.deepEqual(await capacityRegistryEnvironment(adapter()), {});
  assert.equal(
    isolatedEnv(await capacityRegistryEnvironment(adapter())).QA_CAPACITY_REGISTRY_DIR,
    undefined,
  );
  assert.deepEqual(await capacityRegistryEnvironment(adapter(directory)), {
    QA_CAPACITY_REGISTRY_DIR: directory,
  });
});

test('registry refuses missing, non-directory, noncanonical and symlink paths without creating them', async (t) => {
  const directory = await temporary(t);
  const file = join(directory, 'file');
  await writeFile(file, 'selftest');
  const link = join(directory, 'link');
  await symlink(directory, link);
  const nested = join(directory, 'nested');
  await mkdir(nested, { mode: 0o700 });
  for (const path of [
    'relative',
    directory + '/',
    directory + '/./nested',
    join(directory, 'missing'),
    file,
    link,
    join(link, 'nested'),
    directory + '\n',
  ])
    await assert.rejects(capacityRegistryEnvironment(adapter(path)), BlockedError, path);
  await assert.rejects(realpath(join(directory, 'missing')), { code: 'ENOENT' });
});

test('registry rechecks live ownership and exact mode instead of caching successful validation', async (t) => {
  const directory = await temporary(t);
  await capacityRegistryEnvironment(adapter(directory));
  for (const mode of [0o755, 0o750, 0o1700]) {
    await chmod(directory, mode);
    await assert.rejects(capacityRegistryEnvironment(adapter(directory)), BlockedError);
  }
  await chmod(directory, 0o700);
  await capacityRegistryEnvironment(adapter(directory));
  const unixProcess = process as NodeJS.Process & { getuid(): number };
  const uid = unixProcess.getuid();
  const mockedUid = t.mock.method(unixProcess, 'getuid', () => uid + 1);
  await assert.rejects(capacityRegistryEnvironment(adapter(directory)), BlockedError);
  mockedUid.mock.restore();
  await capacityRegistryEnvironment(adapter(directory));
});

test('registry measures UUID socket bytes, accepting 100 and refusing 101 including multibyte names', async (t) => {
  const directory = await temporary(t);
  const suffix = '/00000000-0000-0000-0000-000000000000.sock';
  const remaining = 100 - Buffer.byteLength(directory + '/' + suffix);
  assert.ok(remaining >= 3, 'selftest temporary prefix must fit the socket contract');
  const name = '界' + 'a'.repeat(remaining - 3);
  const exact = join(directory, name);
  await mkdir(exact, { mode: 0o700 });
  assert.equal(Buffer.byteLength(exact + suffix), 100);
  await capacityRegistryEnvironment(adapter(exact));
  const tooLong = exact + 'b';
  await mkdir(tooLong, { mode: 0o700 });
  assert.equal(Buffer.byteLength(tooLong + suffix), 101);
  await assert.rejects(capacityRegistryEnvironment(adapter(tooLong)), BlockedError);
});

test('target loading keeps the registry optional, fingerprints it and still rejects direct QA env', async (t) => {
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
  const withoutRegistry = targetFingerprint(config);
  config.adapters = adapter(directory).adapters;
  await writeFile(file, JSON.stringify(config));
  const loaded = await loadTarget(file, qaRoot);
  assert.notEqual(targetFingerprint(loaded), withoutRegistry);
  const original = targetFingerprint(loaded);
  const second = join(directory, 'second');
  await mkdir(second, { mode: 0o700 });
  loaded.adapters!.capacityControl!.registryDirectory = second;
  assert.notEqual(targetFingerprint(loaded), original);
  config.sut.env.QA_CAPACITY_REGISTRY_DIR = directory;
  await writeFile(file, JSON.stringify(config));
  await assert.rejects(loadTarget(file, qaRoot), /QA_CAPACITY_REGISTRY_DIR 必须由隔离环境控制/);
  delete config.sut.env.QA_CAPACITY_REGISTRY_DIR;
  await chmod(directory, 0o755);
  await writeFile(file, JSON.stringify(config));
  await assert.rejects(loadTarget(file, qaRoot), BlockedError);
});
