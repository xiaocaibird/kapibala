import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnedDatabaseCluster } from '../../harness/database.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerId = 'a'.repeat(64);

for (const scenario of ['owned', 'wrong-owner', 'wrong-id'] as const) {
  test(`database teardown ${scenario}: anonymous-volume cleanup remains bound to container ownership`, async (t) => {
    await mkdir(resolve(root, '.runtime'), { recursive: true });
    const dir = await mkdtemp(resolve(root, '.runtime/self-database-cleanup-'));
    const log = resolve(dir, 'docker-calls.jsonl');
    const state = resolve(dir, 'created-container.json');
    const previousPath = process.env.PATH;
    t.after(async () => {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(dir, { recursive: true, force: true });
    });
    // All Docker commands resolve to this fake executable. A simulated `start`
    // failure reaches real rollback/close logic before any PostgreSQL connection.
    await writeFile(
      resolve(dir, 'docker'),
      `#!${process.execPath}
import fs from 'node:fs';
const args = process.argv.slice(2);
const log = ${JSON.stringify(log)};
const state = ${JSON.stringify(state)};
fs.appendFileSync(log, JSON.stringify(args) + '\\n');
if (args[0] !== '--host' || args[1] !== 'unix:///var/run/docker.sock') {
  process.stderr.write('QA selftest: unexpected Docker target'); process.exit(2);
}
const action = args[2];
if (action === 'create') {
  const owner = args[args.indexOf('--label') + 1].slice('qa.owner='.length);
  fs.writeFileSync(state, JSON.stringify({ Id: ${JSON.stringify(containerId)}, Config: { Labels: { 'qa.owner': owner } } }));
  process.stdout.write(${JSON.stringify(containerId)} + '\\n');
} else if (action === 'start') {
  process.stderr.write('QA_TOOL_SELFTEST simulated startup failure before database connections');
  process.exit(1);
} else if (action === 'inspect') {
  const info = JSON.parse(fs.readFileSync(state, 'utf8'));
  if (${JSON.stringify(scenario)} === 'wrong-owner') info.Config.Labels['qa.owner'] = 'not-the-current-owner';
  if (${JSON.stringify(scenario)} === 'wrong-id') info.Id = ${JSON.stringify('b'.repeat(64))};
  process.stdout.write(JSON.stringify([info]));
} else if (action !== 'rm') {
  process.stderr.write('QA selftest: unexpected Docker command'); process.exit(2);
}
`,
      { mode: 0o755 },
    );
    // No fallback PATH: a broken fake cannot invoke the machine's actual Docker.
    process.env.PATH = dir;
    const cluster = new OwnedDatabaseCluster('postgres:17-alpine');
    await assert.rejects(cluster.start(), /QA_TOOL_SELFTEST simulated startup failure/);
    const calls = async () =>
      (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[]);
    if (scenario === 'owned') {
      assert.deepEqual(
        (await calls()).map((args) => args[2]),
        ['create', 'start', 'inspect', 'rm'],
      );
      assert.deepEqual((await calls()).at(-1), [
        '--host',
        'unix:///var/run/docker.sock',
        'rm',
        '--force',
        '--volumes',
        containerId,
      ]);
      const before = await calls();
      await cluster.close();
      assert.deepEqual(await calls(), before, 'successful teardown is idempotent');
    } else {
      assert.ok(
        (await calls()).every((args) => args[2] !== 'rm'),
        'mismatched container was not removed',
      );
      await assert.rejects(cluster.close(), /拒绝清理owner或ID不匹配的容器/);
      assert.ok(
        (await calls()).every((args) => args[2] !== 'rm'),
        'retry still refuses the unrelated container',
      );
    }
    assert.ok(
      (await calls()).every((args) => ['create', 'start', 'inspect', 'rm'].includes(args[2]!)),
      'never invokes global volume deletion/prune',
    );
  });
}
