import { test, expect } from '../fixtures.js';
import { completeCleanup, launchOwnedDatabase } from '../../harness/recovery-drill.js';
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
    let readinessError: unknown;
    try {
      await probe.ready();
    } catch (error) {
      readinessError = error;
    }
    if (readinessError instanceof BlockedError) throw readinessError;
    const running = probe.process.running;
    await probe.close(); // Flush process logs before preserving evidence.
    const log = await readFile(probe.process.log, 'utf8').catch(() => '');
    await qa.evidence('unmigrated-refusal', {
      database,
      control: control.body,
      readinessError: readinessError ? String(readinessError) : null,
      runningAfterProbe: running,
      log,
      requirement: 'R-A0-02',
      note: '对照只改变为本轮空数据库；原文无固定拒启诊断码。历史旧schema升级仍属于独立用例。',
    });
    if (!readinessError)
      expect(readinessError, '空schema仍正常提供健康服务，未拒绝启动').toBeTruthy();
    if (running)
      throw new BlockedError(
        '空schema进程仍存在但未就绪；没有已批准的拒启时限或诊断，不能仅凭健康超时判断正确拒启',
      );
    throw new BlockedError(
      '已观察空schema退出并保留与迁移库健康对照；缺少已批准的schema拒启诊断，退出原因仍需人工核实，不把通用崩溃算PASS',
    );
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
