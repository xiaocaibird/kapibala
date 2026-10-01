import { randomUUID, createHash } from 'node:crypto';
import { lstat, realpath, readFile, writeFile, chmod, rename, symlink, unlink } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { PreparationBlocked, type Evidence } from '../contracts/media-provider.js';

export async function installOwnedPrivateStateFault(root: string, path: string, kind: 'corrupt' | 'symlink' | 'wide-permissions' | 'foreign-owner'):
  Promise<{ evidence: Evidence; restore(): Promise<void> }> {
  if (kind === 'foreign-owner') throw new PreparationBlocked('Actual foreign-UID record fixture is not available without a distinct owned OS identity; no chmod substitute');
  const actualRoot = await realpath(root), actual = await realpath(path), rel = relative(actualRoot, actual), before = await lstat(path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || path !== actual || !before.isFile() || before.isSymbolicLink() ||
      before.uid !== process.getuid?.() || (before.mode & 0o777) !== 0o600 || before.size > 16 * 1024 * 1024)
    throw new PreparationBlocked('Private-state fault requires an owned private plain record');
  const original = await readFile(path), originalMode = before.mode & 0o7777;
  const backup = `${path}.qa-original-${randomUUID()}`;
  let installedInode = before.ino, installed = false, moved = false, restored = false;
  const restore = async () => {
    if (restored) return;
    if (kind === 'symlink' && moved) {
      if (installed) {
        const current = await lstat(path);
        if (!current.isSymbolicLink() || current.ino !== installedInode || current.uid !== before.uid)
          throw new PreparationBlocked('Private-state fault path changed; refuse to overwrite it');
        await unlink(path);
      }
      if (!installed) {
        try { await lstat(path); throw new PreparationBlocked('New record appeared before restoring backup; refuse to overwrite it'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      const saved = await lstat(backup);
      if (!saved.isFile() || saved.isSymbolicLink() || saved.ino !== before.ino || saved.uid !== before.uid)
        throw new PreparationBlocked('Private-state original backup changed');
      await rename(backup, path);
    } else if (installed) {
      const current = await lstat(path);
      if (!current.isFile() || current.isSymbolicLink() || current.ino !== before.ino || current.uid !== before.uid)
        throw new PreparationBlocked('Private-state original inode changed; refuse to overwrite it');
      if (kind === 'corrupt') await writeFile(path, original);
      await chmod(path, originalMode);
    }
    if (!(await readFile(path)).equals(original) || ((await lstat(path)).mode & 0o7777) !== originalMode)
      throw new PreparationBlocked('Private state did not restore exact bytes and permissions');
    restored = true;
  };
  try {
    if (kind === 'symlink') { await rename(path, backup); moved = true; await symlink(backup, path); installed = true; installedInode = (await lstat(path)).ino; }
    else if (kind === 'corrupt') { installed = true; await writeFile(path, '{QA deliberately invalid JSON'); }
    else { installed = true; await chmod(path, 0o666); }
    const after = await lstat(path);
    return { restore, evidence: { reference: `provider:actual-owned-state-fault:${randomUUID()}`, raw: { kind, path, root: actualRoot,
      original: { inode: before.ino, uid: before.uid, mode: originalMode, bytes: original.length, sha256: createHash('sha256').update(original).digest('hex') },
      after: { inode: after.ino, uid: after.uid, mode: after.mode & 0o7777, symbolicLink: after.isSymbolicLink(), bytes: after.size },
      ...(kind === 'symlink' ? { ownedBackup: backup } : {}) } } };
  } catch (error) { await restore(); throw error; }
}
