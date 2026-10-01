import { lstat, realpath } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { exec } from '../../harness/process.js';
import { PreparationBlocked, type Evidence } from '../contracts/media-provider.js';

/** Real per-file OS denial. Directory chmod would wrongly obstruct controls too. */
export async function installOwnedUnlinkDenial(root: string, path: string): Promise<{ evidence: Evidence; restore(): Promise<void> }> {
  if (process.platform !== 'darwin') throw new PreparationBlocked('Per-file unlink denial currently requires the reviewed Darwin user-immutable flag');
  const actualRoot = await realpath(root), actual = await realpath(path), rel = relative(actualRoot, actual), before = await lstat(path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || actual !== path || before.isSymbolicLink() || !before.isFile() || before.uid !== process.getuid?.())
    throw new PreparationBlocked('Unlink denial target is not an owned plain media file');
  const flags = async () => Number((await exec('/usr/bin/stat', ['-f', '%f', path], { timeout: 2000 })).stdout.trim());
  const originalFlags = await flags();
  if (originalFlags !== 0) throw new PreparationBlocked('Refuse to alter a file with pre-existing filesystem flags');
  await exec('/usr/bin/chflags', ['uchg', path], { timeout: 2000 });
  let restored = false;
  const restore = async () => {
    if (restored) return;
    const current = await lstat(path);
    if (current.ino !== before.ino || current.uid !== before.uid || current.isSymbolicLink()) throw new PreparationBlocked('Unlink-denial target was replaced; refuse to change flags');
    await exec('/usr/bin/chflags', ['nouchg', path], { timeout: 2000 });
    if (await flags() !== originalFlags) throw new PreparationBlocked('Unlink-denial filesystem flags did not restore');
    restored = true;
  };
  try {
    const actualFlags = await flags();
    if (!Number.isSafeInteger(actualFlags) || actualFlags <= 0) throw new PreparationBlocked('OS did not install an observable immutable file flag');
    return { restore, evidence: { reference: `media:os-unlink-denial:${before.ino}`, raw: { path, root: actualRoot, inode: before.ino,
      uid: before.uid, originalFlags, actualFlags, mechanism: 'Darwin user-immutable file flag', claimedError: 'EPERM to be observed from actual product unlink',
      directoryPermissionsChanged: false, fileBytesChanged: false } } };
  } catch (error) { await restore(); throw error; }
}
