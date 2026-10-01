# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: foundation/startup.spec.ts >> [BASE-001] 全新未迁移数据库拒绝正常启动
- Location: tests/foundation/startup.spec.ts:8:1

# Error details

```
BlockedError: [BLOCKED] 已观察空schema退出并保留与迁移库健康对照；缺少已批准的schema拒启诊断，退出原因仍需人工核实，不把通用崩溃算PASS
```

# Test source

```ts
  1   | import { test, expect } from '../fixtures.js';
  2   | import { completeCleanup, launchOwnedDatabase } from '../../harness/recovery-drill.js';
  3   | import { readFile } from 'node:fs/promises';
  4   | import { resolve } from 'node:path';
  5   | import { BlockedError } from '../../harness/security.js';
  6   | import { exec } from '../../harness/process.js';
  7   | 
  8   | test('[BASE-001] 全新未迁移数据库拒绝正常启动', async ({ qa }) => {
  9   |   // The fixture already proved the same candidate command healthy on its migrated database.
  10  |   const control = await qa.api.get<{ ok: boolean; schemaVersion: unknown }>('/api/health');
  11  |   expect(control.status).toBe(200);
  12  |   expect(control.body.ok).toBe(true);
  13  |   const { cluster } = qa.ownedStorage();
  14  |   let database: string | undefined,
  15  |     probe: Awaited<ReturnType<typeof launchOwnedDatabase>> | undefined;
  16  |   try {
  17  |     database = await cluster.createDatabase();
  18  |     try {
  19  |       probe = await launchOwnedDatabase(qa, database);
  20  |     } catch (error) {
  21  |       await qa.evidence('unmigrated-start-error', {
  22  |         database,
  23  |         control: control.body,
  24  |         error: String(error),
  25  |       });
  26  |       throw new BlockedError(
  27  |         '空schema探针未能启动，尚不能排除命令/依赖/监督器错误；不能将任意启动失败当成schema拒启',
  28  |       );
  29  |     }
  30  |     let readinessError: unknown;
  31  |     try {
  32  |       await probe.ready();
  33  |     } catch (error) {
  34  |       readinessError = error;
  35  |     }
  36  |     if (readinessError instanceof BlockedError) throw readinessError;
  37  |     const running = probe.process.running;
  38  |     await probe.close(); // Flush process logs before preserving evidence.
  39  |     const log = await readFile(probe.process.log, 'utf8').catch(() => '');
  40  |     await qa.evidence('unmigrated-refusal', {
  41  |       database,
  42  |       control: control.body,
  43  |       readinessError: readinessError ? String(readinessError) : null,
  44  |       runningAfterProbe: running,
  45  |       log,
  46  |       requirement: 'R-A0-02',
  47  |       note: '对照只改变为本轮空数据库；原文无固定拒启诊断码。历史旧schema升级仍属于独立用例。',
  48  |     });
  49  |     if (!readinessError)
  50  |       expect(readinessError, '空schema仍正常提供健康服务，未拒绝启动').toBeTruthy();
  51  |     if (running)
  52  |       throw new BlockedError(
  53  |         '空schema进程仍存在但未就绪；没有已批准的拒启时限或诊断，不能仅凭健康超时判断正确拒启',
  54  |       );
> 55  |     throw new BlockedError(
      |           ^ BlockedError: [BLOCKED] 已观察空schema退出并保留与迁移库健康对照；缺少已批准的schema拒启诊断，退出原因仍需人工核实，不把通用崩溃算PASS
  56  |       '已观察空schema退出并保留与迁移库健康对照；缺少已批准的schema拒启诊断，退出原因仍需人工核实，不把通用崩溃算PASS',
  57  |     );
  58  |   } finally {
  59  |     await completeCleanup([
  60  |       async () => probe?.close(),
  61  |       async () => {
  62  |         if (database) await cluster.dropDatabase(database);
  63  |       },
  64  |     ]);
  65  |   }
  66  | });
  67  | 
  68  | test('[BASE-002] 交付说明和技术依赖声明可定位', async ({ qa }) => {
  69  |   const root = qa.config.sut.cwd;
  70  |   const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  71  |   expect(readme.trim().length).toBeGreaterThan(0);
  72  |   // Package layout is unconstrained; inspect tracked dependency declarations, never business source.
  73  |   const files = (
  74  |     await exec('git', ['ls-files', '-z', '--', 'package.json', '**/package.json'], { cwd: root })
  75  |   ).stdout
  76  |     .split('\0')
  77  |     .filter(
  78  |       (file) => file && !file.startsWith('qa-acceptance/') && !file.includes('/node_modules/'),
  79  |     );
  80  |   const manifests = await Promise.all(
  81  |     files.map(async (file) => ({
  82  |       file,
  83  |       manifest: JSON.parse(await readFile(resolve(root, file), 'utf8')) as {
  84  |         name?: string;
  85  |         dependencies?: Record<string, string>;
  86  |         devDependencies?: Record<string, string>;
  87  |       },
  88  |     })),
  89  |   );
  90  |   const declared = (name: string) =>
  91  |     manifests.flatMap(({ file, manifest }) => {
  92  |       const version = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  93  |       return version ? [{ file, version }] : [];
  94  |     });
  95  |   expect(readme).toMatch(/npm|node|docker|pnpm|yarn|启动|运行/i);
  96  |   expect(declared('typescript').length).toBeGreaterThan(0);
  97  |   expect(declared('vite').length).toBeGreaterThan(0);
  98  |   expect(declared('react').length).toBeGreaterThan(0);
  99  |   const react = declared('react');
  100 |   await qa.evidence('manifest-and-delivery', {
  101 |     declarationFiles: files,
  102 |     typescript: declared('typescript'),
  103 |     vite: declared('vite'),
  104 |     react,
  105 |     limitation: '仅核依赖声明和运行说明；声明不证明产物实际使用的React版本或技术栈运行正确',
  106 |   });
  107 |   if (!react.some((item) => /^(?:\^|~)?18(?:\.|$)/.test(item.version)))
  108 |     throw new BlockedError(
  109 |       'React声明未直接固定18系列（可能经workspace/catalog/宽范围解析）；需已冻结锁文件或构建产物版本证据，不猜包布局或实际版本',
  110 |     );
  111 | });
  112 | 
```