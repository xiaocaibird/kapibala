import { test, expect, qaRoot } from '../fixtures.js';
import {
  completeCleanup,
  launchOwnedDatabase,
  observeOwnedStartupRejection,
} from '../../harness/recovery-drill.js';
import { loadUnmigratedSchema, assessUnmigratedSchema } from '../../harness/fixture-artifacts.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BlockedError } from '../../harness/security.js';
import { exec } from '../../harness/process.js';

test('[BASE-001] 全新未迁移数据库拒绝正常启动', async ({ qa }) => {
  // The fixture already proved the same candidate command healthy on its migrated database.
  const control = await qa.api.get<{ ok: boolean; schemaVersion: unknown }>('/api/health');
  expect(control.status).toBe(200);
  expect(control.body.ok).toBe(true);
  const { cluster } = qa.ownedStorage();
  let database: string | undefined,
    probe: Awaited<ReturnType<typeof launchOwnedDatabase>> | undefined;
  try {
    database = await cluster.createDatabase();
    try {
      probe = await launchOwnedDatabase(qa, database);
    } catch (error) {
      await qa.evidence('unmigrated-start-error', {
        database,
        control: control.body,
        error: String(error),
      });
      throw new BlockedError(
        '空schema探针未能启动，尚不能排除命令/依赖/监督器错误；不能将任意启动失败当成schema拒启',
      );
    }
    const observation = await observeOwnedStartupRejection(
      probe.process,
      probe.api.baseUrl,
      qa.config.sut.startupTimeoutMs,
    );
    // Preserve independent refusal evidence even when the reviewed mapping is absent.
    await qa.evidence('unmigrated-refusal', {
      database,
      controlBefore: control.body,
      observation,
      requirement: 'R-A0-02',
      note: '仅改变为本轮空数据库和独立端口；清理信号不计入自行退出证据。',
    });
    expect(observation.ready, '空schema仍提供可用健康端点，未拒绝启动').toBe(false);
    const profile = await loadUnmigratedSchema(qaRoot, qa.config);
    const controlAfter = await qa.api.get<{ ok: boolean; schemaVersion: unknown }>('/api/health');
    const assessment = assessUnmigratedSchema(
      profile,
      control.body,
      { ...controlAfter.body, ok: controlAfter.status === 200 && controlAfter.body.ok },
      observation,
    );
    await qa.evidence('unmigrated-assessment', {
      profile,
      controlBefore: control.body,
      controlAfter,
      observation,
      assessment,
    });
    if (assessment.status === 'BLOCKED') throw new BlockedError(assessment.reason);
    expect(assessment.status, assessment.reason).toBe('PASS');
  } finally {
    await completeCleanup([
      async () => probe?.close(),
      async () => {
        if (database) await cluster.dropDatabase(database);
      },
    ]);
  }
});

test('[BASE-002] 交付说明和技术依赖声明可定位', async ({ qa }) => {
  const root = qa.config.sut.cwd;
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  expect(readme.trim().length).toBeGreaterThan(0);
  // Package layout is unconstrained; inspect tracked dependency declarations, never business source.
  const files = (
    await exec('git', ['ls-files', '-z', '--', 'package.json', '**/package.json'], { cwd: root })
  ).stdout
    .split('\0')
    .filter(
      (file) => file && !file.startsWith('qa-acceptance/') && !file.includes('/node_modules/'),
    );
  const manifests = await Promise.all(
    files.map(async (file) => ({
      file,
      manifest: JSON.parse(await readFile(resolve(root, file), 'utf8')) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      },
    })),
  );
  const declared = (name: string) =>
    manifests.flatMap(({ file, manifest }) => {
      const version = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
      return version ? [{ file, version }] : [];
    });
  expect(readme).toMatch(/npm|node|docker|pnpm|yarn|启动|运行/i);
  expect(declared('typescript').length).toBeGreaterThan(0);
  expect(declared('vite').length).toBeGreaterThan(0);
  expect(declared('react').length).toBeGreaterThan(0);
  const react = declared('react');
  await qa.evidence('manifest-and-delivery', {
    declarationFiles: files,
    typescript: declared('typescript'),
    vite: declared('vite'),
    react,
    limitation: '仅核依赖声明和运行说明；声明不证明产物实际使用的React版本或技术栈运行正确',
  });
  if (!react.some((item) => /^(?:\^|~)?18(?:\.|$)/.test(item.version)))
    throw new BlockedError(
      'React声明未直接固定18系列（可能经workspace/catalog/宽范围解析）；需已冻结锁文件或构建产物版本证据，不猜包布局或实际版本',
    );
});
