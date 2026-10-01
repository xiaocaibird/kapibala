import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, readFile, writeFile, lstat, unlink, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shortDeliveryTemporaryAlias } from '../../harness/delivery-isolated.js';
import { BlockedError } from '../../../harness/security.js';

test('short TMPDIR permits real IPC in a deep QA directory and removes only its alias', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qa-long-tmp-self-')));
  const deep = join(root, 'qa-acceptance', '.runtime', 'second-round-readme', 'readme-delivery-11111111-1111-4111-8111-111111111111');
  await mkdir(deep, { recursive: true, mode: 0o700 });
  const alias = await shortDeliveryTemporaryAlias(deep);
  const server = createServer();
  try {
    await mkdir(join(alias.path, 'tsx-501'));
    const socket = join(alias.path, 'tsx-501', '123456.pipe');
    assert.ok(Buffer.byteLength(socket) < 104, 'Unix IPC path fits macOS limit');
    await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(socket, done); });
    await writeFile(join(alias.path, 'sentinel'), 'owned bytes');
    assert.equal(await readFile(join(deep, 'sentinel'), 'utf8'), 'owned bytes');
    await new Promise<void>((done, fail) => server.close(e => e ? fail(e) : done()));
    await alias.close();
    await assert.rejects(lstat(alias.path), { code: 'ENOENT' });
    assert.equal(await readFile(join(deep, 'sentinel'), 'utf8'), 'owned bytes');
  } finally {
    if (server.listening) await new Promise<void>(done => server.close(() => done()));
    await unlink(alias.path).catch(e => { if(e.code !== 'ENOENT') throw e; });
    await rm(root, { recursive: true, force: true });
  }
});

test('short TMPDIR cleanup refuses a replaced symlink and preserves its target', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qa-tmp-owner-self-')));
  const own = join(root,'own'), foreign = join(root,'foreign');
  await mkdir(own); await mkdir(foreign); await writeFile(join(foreign,'sentinel'),'unchanged');
  const alias = await shortDeliveryTemporaryAlias(own);
  try {
    await unlink(alias.path); await symlink(foreign, alias.path);
    await assert.rejects(alias.close(), BlockedError);
    assert.equal(await readFile(join(foreign,'sentinel'),'utf8'),'unchanged');
    assert.equal((await lstat(alias.path)).isSymbolicLink(),true);
  } finally { await unlink(alias.path); await rm(root,{recursive:true,force:true}); }
});
