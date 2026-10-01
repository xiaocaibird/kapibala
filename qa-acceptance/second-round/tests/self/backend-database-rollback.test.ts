import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSingleSelectPatch } from '../../harness/backend-database-rollback.js';
import { exec, isolatedEnv } from '../../../harness/process.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const materials = resolve(root, 'docs/evidence/second-round-timeline-reproduction-20261002');
const sourceFile = 'apps/server/src/modules/gateway/index.ts';
const patch = (name: string) => readFile(resolve(materials, name), 'utf8');

test('delivered forward and reverse patches each alter exactly the one historical continuation SELECT', async () => {
  const reverse = assertSingleSelectPatch(await patch('to-original-query.patch'));
  const forward = assertSingleSelectPatch(await patch('to-optimized-query.patch'));
  assert.equal(reverse.added, forward.removed);
  assert.equal(reverse.removed, forward.added);
  assert.match(reverse.removed, /jsonb_path_query_array/);
  assert.match(reverse.added, /jsonb_agg\(items->position/);
});

test('rollback scope review rejects a second source line, second hunk or unrelated target', async () => {
  const valid = await patch('to-original-query.patch');
  for (const text of [
    valid + '-console.log("before");\n+console.log("after");\n',
    valid + '@@ -400,0 +400,0 @@\n',
    valid.replace('--- a/' + sourceFile, '--- a/apps/server/src/main.ts'),
    valid.replace('+++ b/' + sourceFile, '+++ b/apps/server/src/main.ts'),
  ]) assert.throws(() => assertSingleSelectPatch(text), assert.AssertionError);
});

test('patch and inverse operate on an owned static copy without discovering or modifying the parent repository', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'qa-db002-patch-self-'));
  try {
    await exec('git', ['init', '--quiet'], { cwd: temporary, env: isolatedEnv({}) });
    const staticOriginal = await readFile(resolve(root, sourceFile));
    // Parent sentinel has the same path. git apply must only touch the nested
    // copy, even though the nearest Git repository is the sentinel's parent.
    await mkdir(dirname(resolve(temporary, sourceFile)), { recursive: true });
    await writeFile(resolve(temporary, sourceFile), staticOriginal);
    const nested = resolve(temporary, 'copies', 'B');
    await mkdir(dirname(resolve(nested, sourceFile)), { recursive: true });
    await writeFile(resolve(nested, sourceFile), staticOriginal);
    const env = isolatedEnv({ GIT_CEILING_DIRECTORIES: resolve(temporary, 'copies') });
    const reverse = assertSingleSelectPatch(await patch('to-original-query.patch'));
    for (const name of ['to-original-query.patch', 'to-optimized-query.patch']) {
      const path = resolve(temporary, name); await writeFile(path, await patch(name));
      await exec('git', ['apply', '--check', path], { cwd: nested, env });
      await exec('git', ['apply', path], { cwd: nested, env });
      assert.deepEqual(await readFile(resolve(temporary, sourceFile)), staticOriginal);
      if (name === 'to-original-query.patch') {
        const changed = await readFile(resolve(nested, sourceFile), 'utf8');
        assert.ok(changed.split('\n').includes(reverse.added));
        assert.ok(!changed.split('\n').includes(reverse.removed));
      }
    }
    assert.deepEqual(await readFile(resolve(nested, sourceFile)), staticOriginal);
  } finally { await rm(temporary, { recursive: true }); }
});
