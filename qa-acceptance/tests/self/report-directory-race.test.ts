import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { reportDirectory } from '../../harness/provenance.js';

test('concurrent owned report writers share parents without accepting files or symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qa-report-directory-'));
  try {
    const paths = await Promise.all(
      Array.from({ length: 12 }, (_, i) => reportDirectory(root, `reports/shared/item-${i}`, true)),
    );
    assert.equal(new Set(paths).size, 12);
    await writeFile(join(root, 'reports', 'ordinary'), 'x');
    await assert.rejects(reportDirectory(root, 'reports/ordinary/child', true), /普通文件/);
    await symlink(join(root, 'reports', 'shared'), join(root, 'reports', 'linked'));
    await assert.rejects(reportDirectory(root, 'reports/linked/child', true), /符号链接/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
