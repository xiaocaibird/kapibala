import { test, expect, qaRoot } from '../fixtures.js';
import { requireAuthorization, BlockedError } from '../../harness/security.js';
import { currentExecutionPlan, assertSelectedCase } from '../../harness/execution-plan.js';
import { OwnedDatabaseCluster } from '../../harness/database.js';
import {
  FixtureCandidate,
  loadArtifact,
  fingerprintOwnedStorage,
  directoryOrder,
  exactMicros,
  type LoadedArtifact,
} from '../../harness/fixture-artifacts.js';

const fixtureTest = test.extend<{
  fixtureArtifact: LoadedArtifact;
  fixtureCandidate: FixtureCandidate;
}>({
  fixtureArtifact: async ({ target }, use, info) => {
    await requireAuthorization(target);
    assertSelectedCase(await currentExecutionPlan(qaRoot), info.title, info.project.name);
    const kind = info.title.startsWith('[BLK-MIG-001]') ? 'legacy-schema' : 'directory-precision';
    await use(await loadArtifact(qaRoot, target, kind));
  },
  fixtureCandidate: async ({ target, fixtureArtifact }, use, info) => {
    await requireAuthorization(target);
    assertSelectedCase(await currentExecutionPlan(qaRoot), info.title, info.project.name);
    const cluster = new OwnedDatabaseCluster(target.database.image);
    const owned = new FixtureCandidate(target, cluster, info.outputPath('evidence'));
    try {
      await cluster.start();
      try {
        await owned.prepare(fixtureArtifact);
      } catch (error) {
        await owned.evidence('fixture-preparation-error', {
          error: String(error),
          productStarted: false,
        });
        throw new BlockedError(`真实夹具恢复/独立环境准备失败，产品尚未启动：${String(error)}`);
      }
      await use(owned);
    } finally {
      try {
        try {
          await owned.close();
        } finally {
          await cluster.close();
        }
      } finally {
        await info.attach('fixture-evidence-directory', {
          body: owned.output,
          contentType: 'text/plain',
        });
      }
    }
  },
});

fixtureTest(
  '[BLK-MIG-001] 历史schema明确拒启且结构与数据保持不变',
  async ({ fixtureCandidate: candidate, fixtureArtifact }) => {
    if (fixtureArtifact.manifest.kind !== 'legacy-schema') throw new Error('夹具kind内部不匹配');
    const before = await fingerprintOwnedStorage(
      candidate.target,
      candidate.cluster,
      candidate.database,
    );
    const rejection = await candidate.observeRejection();
    const after = await fingerprintOwnedStorage(
      candidate.target,
      candidate.cluster,
      candidate.database,
    );
    await candidate.evidence('legacy-schema-rejection', {
      before,
      after,
      rejection,
      dataGuarantee: '拒启尝试前后规范化pg_dump结构和数据相同；不宣称排除任何先写后回滚的瞬时操作',
    });
    expect(rejection.ready, '旧schema不能暴露可用健康端点').toBe(false);
    expect(after.schemaSha256).toBe(before.schemaSha256);
    expect(after.dataSha256).toBe(before.dataSha256);
    if (
      !rejection.exit ||
      rejection.exit.signal !== null ||
      !fixtureArtifact.manifest.expected.rejectionLogIncludes.every((expected) =>
        rejection.log.includes(expected),
      )
    )
      throw new BlockedError(
        '未同时观察到候选自行退出与审核过的明确schema拒启诊断；保留日志/退出/健康证据待归因，不能把依赖故障、外部终止或健康超时记作产品拒启结论',
      );
  },
);

fixtureTest(
  '[UI-037] 确定性微秒与同时间ID夹具双向跨页无遗漏重复',
  async ({ fixtureCandidate: candidate, fixtureArtifact }) => {
    if (fixtureArtifact.manifest.kind !== 'directory-precision')
      throw new Error('夹具kind内部不匹配');
    await candidate.start();
    await candidate.api.login();
    const { rows, query } = fixtureArtifact.manifest.expected;
    const evidence: unknown[] = [];
    for (const order of ['asc', 'desc'] as const) {
      const expected = directoryOrder(rows, order);
      const actual: Record<string, unknown>[] = [];
      const cursors = new Set<string>();
      const actualBoundaries: number[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const params = new URLSearchParams({
          q: query.q,
          order,
          pageSize: String(query.pageSize),
          ...(cursor ? { cursor } : {}),
        });
        const result = await candidate.api.get<{
          items: Record<string, unknown>[];
          nextCursor: string | null;
        }>(`/api/group-directory?${params}`);
        expect(result.status).toBe(200);
        expect(Array.isArray(result.body.items)).toBe(true);
        expect(result.body.items.length).toBeLessThanOrEqual(query.pageSize);
        evidence.push({ order, page: pages, inputCursor: cursor, body: result.body });
        actual.push(...result.body.items);
        cursor = result.body.nextCursor;
        expect(cursor === null || typeof cursor === 'string').toBe(true);
        if (cursor !== null) {
          expect(cursor.length).toBeGreaterThan(0);
          expect(cursors.has(cursor), '游标不能循环').toBe(false);
          expect(result.body.items.length, '非终页不能用空页无限续接').toBeGreaterThan(0);
          cursors.add(cursor);
          actualBoundaries.push(actual.length);
        }
        expect(++pages).toBeLessThanOrEqual(rows.length + 1);
      } while (cursor !== null);
      expect(actual.map((row) => row.id)).toEqual(expected.map((row) => row.id));
      expect(new Set(actual.map((row) => row.id)).size).toBe(rows.length);
      for (let i = 0; i < expected.length; i++)
        expect(actual[i]).toMatchObject(expected[i]!.public);
      let tieBoundary = false;
      let microBoundary = false;
      for (const index of actualBoundaries) {
        const before = expected[index - 1],
          after = expected[index];
        if (!before || !after) continue;
        const a = exactMicros(before.createdAtMicros),
          b = exactMicros(after.createdAtMicros);
        tieBoundary ||= a === b;
        microBoundary ||= a !== b && a / 1000n === b / 1000n;
      }
      // pageSize is a maximum, not an approved requirement to fill every page.
      if (!tieBoundary || !microBoundary)
        throw new BlockedError(
          `${order}实际分页未命中两种边界；需调整夹具，不能把普通遍历宣称微秒覆盖`,
        );
    }
    await candidate.evidence('directory-precision-pages', {
      query,
      expectedRows: rows,
      pages: evidence,
    });
    expect(candidate.gateway.snapshot().requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
    expect(candidate.agent.snapshot().turns).toHaveLength(0);
  },
);
