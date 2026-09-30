import { readdir, readFile, lstat, readlink, mkdir, realpath } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { isWithin } from './security.js';
export async function snapshotQaTree(
  root: string,
): Promise<{
  sha256: string;
  files: { path: string; sha256?: string; symlink?: string }[];
  excluded: string[];
}> {
  const files: { path: string; sha256?: string; symlink?: string }[] = [];
  const visit = async (dir: string) => {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(dir, item.name),
        name = relative(root, path).replaceAll('\\', '/');
      if (
        [
          'node_modules',
          '.git',
          'reports',
          '.runtime',
          'test-results',
          'playwright-report',
        ].includes(name.split('/')[0]!)
      )
        continue;
      if (item.isSymbolicLink()) files.push({ path: name, symlink: await readlink(path) });
      else if (item.isDirectory()) await visit(path);
      else if (item.isFile())
        files.push({
          path: name,
          sha256: createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        });
    }
  };
  await visit(root);
  return {
    sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    files,
    excluded: [
      'node_modules (package-lock hash recorded)',
      'reports',
      '.runtime',
      'test-results',
      'playwright-report',
      '.git (revision and dirty state recorded)',
    ],
  };
}
export async function reportDirectory(root: string, path: string, create = false): Promise<string> {
  const base = await realpath(root),
    out = resolve(base, path),
    reports = resolve(base, 'reports');
  if (!isWithin(reports, out) || out === reports)
    throw new Error('报告只能位于专属reports的子目录');
  let current = base;
  for (const segment of relative(base, out).split(/[\\/]/)) {
    current = resolve(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error('报告目录不能经过符号链接或普通文件');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw e;
      await mkdir(current);
    }
  }
  return out;
}
