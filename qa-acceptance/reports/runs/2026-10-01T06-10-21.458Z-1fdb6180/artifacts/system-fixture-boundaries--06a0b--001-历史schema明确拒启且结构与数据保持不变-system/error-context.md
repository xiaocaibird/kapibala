# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/fixture-boundaries.spec.ts >> [BLK-MIG-001] 历史schema明确拒启且结构与数据保持不变
- Location: tests/system/fixture-boundaries.spec.ts:58:1

# Error details

```
BlockedError: [BLOCKED] 未同时观察到候选自行退出与审核过的明确schema拒启诊断；保留日志/退出/健康证据待归因，不能把依赖故障、外部终止或健康超时记作产品拒启结论
```

# Test source

```ts
  1   | import { test, expect, qaRoot } from '../fixtures.js';
  2   | import { requireAuthorization, BlockedError } from '../../harness/security.js';
  3   | import { currentExecutionPlan, assertSelectedCase } from '../../harness/execution-plan.js';
  4   | import { OwnedDatabaseCluster } from '../../harness/database.js';
  5   | import {
  6   |   FixtureCandidate,
  7   |   loadArtifact,
  8   |   fingerprintOwnedStorage,
  9   |   directoryOrder,
  10  |   exactMicros,
  11  |   type LoadedArtifact,
  12  | } from '../../harness/fixture-artifacts.js';
  13  | 
  14  | const fixtureTest = test.extend<{
  15  |   fixtureArtifact: LoadedArtifact;
  16  |   fixtureCandidate: FixtureCandidate;
  17  | }>({
  18  |   fixtureArtifact: async ({ target }, use, info) => {
  19  |     await requireAuthorization(target);
  20  |     assertSelectedCase(await currentExecutionPlan(qaRoot), info.title, info.project.name);
  21  |     const kind = info.title.startsWith('[BLK-MIG-001]') ? 'legacy-schema' : 'directory-precision';
  22  |     await use(await loadArtifact(qaRoot, target, kind));
  23  |   },
  24  |   fixtureCandidate: async ({ target, fixtureArtifact }, use, info) => {
  25  |     await requireAuthorization(target);
  26  |     assertSelectedCase(await currentExecutionPlan(qaRoot), info.title, info.project.name);
  27  |     const cluster = new OwnedDatabaseCluster(target.database.image);
  28  |     const owned = new FixtureCandidate(target, cluster, info.outputPath('evidence'));
  29  |     try {
  30  |       await cluster.start();
  31  |       try {
  32  |         await owned.prepare(fixtureArtifact);
  33  |       } catch (error) {
  34  |         await owned.evidence('fixture-preparation-error', {
  35  |           error: String(error),
  36  |           productStarted: false,
  37  |         });
  38  |         throw new BlockedError(`真实夹具恢复/独立环境准备失败，产品尚未启动：${String(error)}`);
  39  |       }
  40  |       await use(owned);
  41  |     } finally {
  42  |       try {
  43  |         try {
  44  |           await owned.close();
  45  |         } finally {
  46  |           await cluster.close();
  47  |         }
  48  |       } finally {
  49  |         await info.attach('fixture-evidence-directory', {
  50  |           body: owned.output,
  51  |           contentType: 'text/plain',
  52  |         });
  53  |       }
  54  |     }
  55  |   },
  56  | });
  57  | 
  58  | fixtureTest(
  59  |   '[BLK-MIG-001] 历史schema明确拒启且结构与数据保持不变',
  60  |   async ({ fixtureCandidate: candidate, fixtureArtifact }) => {
  61  |     if (fixtureArtifact.manifest.kind !== 'legacy-schema') throw new Error('夹具kind内部不匹配');
  62  |     const before = await fingerprintOwnedStorage(
  63  |       candidate.target,
  64  |       candidate.cluster,
  65  |       candidate.database,
  66  |     );
  67  |     const rejection = await candidate.observeRejection();
  68  |     const after = await fingerprintOwnedStorage(
  69  |       candidate.target,
  70  |       candidate.cluster,
  71  |       candidate.database,
  72  |     );
  73  |     await candidate.evidence('legacy-schema-rejection', {
  74  |       before,
  75  |       after,
  76  |       rejection,
  77  |       dataGuarantee: '拒启尝试前后规范化pg_dump结构和数据相同；不宣称排除任何先写后回滚的瞬时操作',
  78  |     });
  79  |     expect(rejection.ready, '旧schema不能暴露可用健康端点').toBe(false);
  80  |     expect(after.schemaSha256).toBe(before.schemaSha256);
  81  |     expect(after.dataSha256).toBe(before.dataSha256);
  82  |     if (
  83  |       !rejection.exit ||
  84  |       rejection.exit.signal !== null ||
  85  |       !fixtureArtifact.manifest.expected.rejectionLogIncludes.every((expected) =>
  86  |         rejection.log.includes(expected),
  87  |       )
  88  |     )
> 89  |       throw new BlockedError(
      |             ^ BlockedError: [BLOCKED] 未同时观察到候选自行退出与审核过的明确schema拒启诊断；保留日志/退出/健康证据待归因，不能把依赖故障、外部终止或健康超时记作产品拒启结论
  90  |         '未同时观察到候选自行退出与审核过的明确schema拒启诊断；保留日志/退出/健康证据待归因，不能把依赖故障、外部终止或健康超时记作产品拒启结论',
  91  |       );
  92  |   },
  93  | );
  94  | 
  95  | fixtureTest(
  96  |   '[UI-037] 确定性微秒与同时间ID夹具双向跨页无遗漏重复',
  97  |   async ({ fixtureCandidate: candidate, fixtureArtifact }) => {
  98  |     if (fixtureArtifact.manifest.kind !== 'directory-precision')
  99  |       throw new Error('夹具kind内部不匹配');
  100 |     await candidate.start();
  101 |     await candidate.api.login();
  102 |     const { rows, query } = fixtureArtifact.manifest.expected;
  103 |     const evidence: unknown[] = [];
  104 |     for (const order of ['asc', 'desc'] as const) {
  105 |       const expected = directoryOrder(rows, order);
  106 |       const actual: Record<string, unknown>[] = [];
  107 |       const cursors = new Set<string>();
  108 |       const actualBoundaries: number[] = [];
  109 |       let cursor: string | null = null;
  110 |       let pages = 0;
  111 |       do {
  112 |         const params = new URLSearchParams({
  113 |           q: query.q,
  114 |           order,
  115 |           pageSize: String(query.pageSize),
  116 |           ...(cursor ? { cursor } : {}),
  117 |         });
  118 |         const result = await candidate.api.get<{
  119 |           items: Record<string, unknown>[];
  120 |           nextCursor: string | null;
  121 |         }>(`/api/group-directory?${params}`);
  122 |         expect(result.status).toBe(200);
  123 |         expect(Array.isArray(result.body.items)).toBe(true);
  124 |         expect(result.body.items.length).toBeLessThanOrEqual(query.pageSize);
  125 |         evidence.push({ order, page: pages, inputCursor: cursor, body: result.body });
  126 |         actual.push(...result.body.items);
  127 |         cursor = result.body.nextCursor;
  128 |         expect(cursor === null || typeof cursor === 'string').toBe(true);
  129 |         if (cursor !== null) {
  130 |           expect(cursor.length).toBeGreaterThan(0);
  131 |           expect(cursors.has(cursor), '游标不能循环').toBe(false);
  132 |           expect(result.body.items.length, '非终页不能用空页无限续接').toBeGreaterThan(0);
  133 |           cursors.add(cursor);
  134 |           actualBoundaries.push(actual.length);
  135 |         }
  136 |         expect(++pages).toBeLessThanOrEqual(rows.length + 1);
  137 |       } while (cursor !== null);
  138 |       expect(actual.map((row) => row.id)).toEqual(expected.map((row) => row.id));
  139 |       expect(new Set(actual.map((row) => row.id)).size).toBe(rows.length);
  140 |       for (let i = 0; i < expected.length; i++)
  141 |         expect(actual[i]).toMatchObject(expected[i]!.public);
  142 |       let tieBoundary = false;
  143 |       let microBoundary = false;
  144 |       for (const index of actualBoundaries) {
  145 |         const before = expected[index - 1],
  146 |           after = expected[index];
  147 |         if (!before || !after) continue;
  148 |         const a = exactMicros(before.createdAtMicros),
  149 |           b = exactMicros(after.createdAtMicros);
  150 |         tieBoundary ||= a === b;
  151 |         microBoundary ||= a !== b && a / 1000n === b / 1000n;
  152 |       }
  153 |       // pageSize is a maximum, not an approved requirement to fill every page.
  154 |       if (!tieBoundary || !microBoundary)
  155 |         throw new BlockedError(
  156 |           `${order}实际分页未命中两种边界；需调整夹具，不能把普通遍历宣称微秒覆盖`,
  157 |         );
  158 |     }
  159 |     await candidate.evidence('directory-precision-pages', {
  160 |       query,
  161 |       expectedRows: rows,
  162 |       pages: evidence,
  163 |     });
  164 |     expect(candidate.gateway.snapshot().requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
  165 |     expect(candidate.agent.snapshot().turns).toHaveLength(0);
  166 |   },
  167 | );
  168 | 
```