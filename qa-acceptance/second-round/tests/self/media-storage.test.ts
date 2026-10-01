import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, unlink, rm, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installOwnedUnlinkDenial } from '../../harness/media-unlink.js';

test('owned single-file OS denial prevents its unlink while an ordinary control still deletes', async () => {
  const base = resolve('.runtime/second-round-self'); await mkdir(base, { recursive: true });
  const root = await realpath(await mkdtemp(resolve(base, 'unlink-denial-')));
  const target = resolve(root, 'target.bin'), control = resolve(root, 'control.bin');
  await writeFile(target, 'unaltered target', { mode: 0o600 }); await writeFile(control, 'independent control', { mode: 0o600 });
  let fault: Awaited<ReturnType<typeof installOwnedUnlinkDenial>> | undefined;
  try {
    fault = await installOwnedUnlinkDenial(root, target);
    await assert.rejects(unlink(target), (error: NodeJS.ErrnoException) => error.code === 'EPERM');
    await unlink(control); assert.equal(await readFile(target, 'utf8'), 'unaltered target');
    await fault.restore(); await fault.restore(); await unlink(target);
  } finally { await fault?.restore(); await rm(root, { recursive: true, force: true }); }
});

test('private-state fixtures alter only owned records and restore exact bytes, inode and permissions', async () => {
  const { installOwnedPrivateStateFault } = await import('../../harness/provider-storage.js');
  const { lstat } = await import('node:fs/promises');
  const base = resolve('.runtime/second-round-self'); await mkdir(base, { recursive: true });
  const root = await realpath(await mkdtemp(resolve(base, 'private-fault-'))), path = resolve(root, `${'a'.repeat(64)}.json`);
  const original = '{"session":"owned QA fixture only"}'; await writeFile(path, original, { mode: 0o600 });
  const inode = (await lstat(path)).ino;
  try {
    for (const kind of ['corrupt', 'symlink', 'wide-permissions'] as const) {
      const fault = await installOwnedPrivateStateFault(root, path, kind);
      try {
        if (kind === 'corrupt') { const actual = await readFile(path, 'utf8'); assert.throws(() => JSON.parse(actual)); assert.notEqual(actual, original); }
        if (kind === 'symlink') assert.equal((await lstat(path)).isSymbolicLink(), true);
        if (kind === 'wide-permissions') assert.equal((await lstat(path)).mode & 0o777, 0o666);
      } finally { await fault.restore(); }
      assert.equal(await readFile(path, 'utf8'), original); assert.equal((await lstat(path)).ino, inode); assert.equal((await lstat(path)).mode & 0o777, 0o600);
    }
    await assert.rejects(installOwnedPrivateStateFault(root, path, 'foreign-owner'), /distinct owned OS identity/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
