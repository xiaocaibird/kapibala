import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { QaEnvironment } from '../../harness/environment.js';
import { PlatformClient } from '../../harness/platform-client.js';
import { availablePort } from '../../harness/network.js';
import { exec, isolatedEnv, OwnedProcess, waitHttp } from '../../harness/process.js';
import { BlockedError, requireAuthorization, redact } from '../../harness/security.js';
import { SecondRoundEnvironment, actualListenerIdentity } from './environment.js';
import { ownedCleanupDirectory } from './delivery-recovery.js';
import { observeBackend } from './backend-boundaries.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';

const sourceFile = 'apps/server/src/modules/gateway/index.ts';
const materialRelative = 'docs/evidence/second-round-timeline-reproduction-20261002';
const reviewed = {
  productRevision: 'cca7fd2422f58b57b4156b620101929e5eb39a1c',
  optimizationRevision: '544c4f9ce71b5dd893be286853a35df340072a7d',
  preOptimizationRevision: 'ac5e8e639237070fb5c48751ce04a7645b4a19ab',
  optimizedSha: '6796745e10cc6ac1846187b4233ec7a18d6960d7bfbef7ca68ca88a379ee4c7c',
  originalSha: 'b17db37b266eef6583de2cd562fe5cc6abce4ecfba733c5aab41a6da3a5d8c35',
  patches: { 'to-original-query.patch': '3b767fddc9d1914bc0b587175cc72e6a39ce7741319701941d870a1722380430',
    'to-optimized-query.patch': '407c84dff6364d8e4c5643b5178023bc8ee54e8014ceb2270774c6b32cf19e17' },
};
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function assertSingleSelectPatch(text: string) {
  const lines = text.split('\n'), headers = lines.filter(line => /^(---|\+\+\+) /.test(line));
  assert.deepEqual(headers, ['--- a/' + sourceFile, '+++ b/' + sourceFile]);
  assert.equal(lines.filter(line => line.startsWith('@@ ')).length, 1);
  const removed = lines.filter(line => line.startsWith('-') && !line.startsWith('---'));
  const added = lines.filter(line => line.startsWith('+') && !line.startsWith('+++'));
  assert.equal(removed.length, 1); assert.equal(added.length, 1);
  for (const line of [...removed, ...added]) assert.match(line, /^[-+]\s+"SELECT jsonb_array_length\(items\).* FROM timeline_snapshots WHERE id=\$1 AND group_id=\$2",$/);
  return { removed: removed[0]!.slice(1), added: added[0]!.slice(1), addedLines: 1, removedLines: 1, file: sourceFile };
}
interface Page { items: Record<string, unknown>[]; snapshotId: string; nextCursor: string | null }
interface SourceApp { name: string; root: string; process: OwnedProcess; api: PlatformClient; port: number; sourceSha256: string; identity: Awaited<ReturnType<typeof actualListenerIdentity>> }

/** Real normal-main application rollback. Parent owns and closes the database
 * and external services. Only this helper's source copies/processes are removed. */
export async function runDatabaseApplicationRollback(qa: QaEnvironment): Promise<RoundResult> {
  const caseId = 'SR-BE-DB-002', id = 'normal-main-same-db-query-rollback-and-restoration';
  const evidencePath = resolve(qa.outputDir, 'database-application-rollback.json');
  const variants: VariantResult[] = [], cleanupErrors: string[] = [], facts: Record<string, unknown> = { startedAt: new Date().toISOString(), entry: 'apps/server/src/main.ts', backgroundEnabled: true };
  let primary: unknown, owned: Awaited<ReturnType<typeof ownedCleanupDirectory>> | undefined, db: Client | undefined;
  const live = new Set<SourceApp>(), stages: unknown[] = []; facts.stages = stages;
  const save = () => writeFile(evidencePath, redact(facts) + '\n');
  try {
    await requireAuthorization(qa.config);
    if (!(qa instanceof SecondRoundEnvironment)) throw new BlockedError('DB002 requires the current owned second-round resource environment');
    const material = resolve(qa.config.sut.cwd, materialRelative);
    const manifest = JSON.parse(await readFile(resolve(material, 'manifest.json'), 'utf8'));
    for (const key of ['productRevision', 'optimizationRevision', 'preOptimizationRevision'] as const) assert.equal(manifest[key], reviewed[key]);
    assert.equal(manifest.file, sourceFile); assert.equal(manifest.sourceSha256.product, reviewed.optimizedSha);
    assert.equal(manifest.sourceSha256.controlledOriginalQueryVariant, reviewed.originalSha);
    const currentSource = await readFile(resolve(qa.config.sut.cwd, sourceFile));
    if (sha(currentSource) !== reviewed.optimizedSha) throw new BlockedError('Frozen candidate gateway changed from reviewed one-SELECT rollback base; independent delta review required');
    const sourceAt = async (revision: string) => (await exec('git', ['show', revision + ':' + sourceFile], { cwd: qa.config.sut.cwd, maxBuffer: 8 * 1024 * 1024 })).stdout;
    const baselineSource = await sourceAt(reviewed.productRevision), oldSource = await sourceAt(reviewed.preOptimizationRevision), optimizationSource = await sourceAt(reviewed.optimizationRevision);
    assert.equal(sha(baselineSource), reviewed.optimizedSha);
    assert.equal(sha(oldSource), manifest.sourceSha256.preOptimizationCommitFile);
    assert.equal(sha(optimizationSource), manifest.sourceSha256.optimizationCommitFile);
    const patches: Record<string, string> = {}, diffs: Record<string, ReturnType<typeof assertSingleSelectPatch>> = {};
    for (const [name, expected] of Object.entries(reviewed.patches)) {
      const text = await readFile(resolve(material, name), 'utf8'); assert.equal(sha(text), expected); assert.equal(manifest.patches[name], expected);
      const diff = assertSingleSelectPatch(text); patches[name] = text; diffs[name] = diff;
      await writeFile(resolve(qa.outputDir, name), text, { mode: 0o600 });
    }
    assert.equal(diffs['to-original-query.patch']!.added, diffs['to-optimized-query.patch']!.removed);
    assert.equal(diffs['to-original-query.patch']!.removed, diffs['to-optimized-query.patch']!.added);
    assert.ok(oldSource.split('\n').includes(diffs['to-original-query.patch']!.added));
    assert.ok(optimizationSource.split('\n').includes(diffs['to-original-query.patch']!.removed));
    facts.sources = { candidateRevision: qa.config.sut.revision, archiveBase: qa.config.sut.revision, manifest,
      currentGatewaySha256: sha(currentSource), patches: reviewed.patches, diffs,
      scope: 'Both complete application copies use the frozen candidate; B changes only the independently checked historical continuation SELECT. This is not a full old-application rollback.' };
    owned = await ownedCleanupDirectory(qa.runtimeDirectory, 'delivery-owned-' + randomUUID());
    const archive = resolve(owned.path, 'candidate.tar'), paths = ['package.json', 'package-lock.json', 'tsconfig.json', 'scripts', 'apps', 'packages', 'db'];
    const listing = (await exec('git', ['ls-tree', '-r', qa.config.sut.revision, '--', ...paths], { cwd: qa.config.sut.cwd, maxBuffer: 8 * 1024 * 1024 })).stdout;
    assert.ok(listing.split('\n').filter(Boolean).every(line => /^100644 |^100755 /.test(line)), 'Candidate export must contain only tracked regular files');
    await exec('git', ['archive', '--format=tar', '--output=' + archive, qa.config.sut.revision, '--', ...paths], { cwd: qa.config.sut.cwd, timeout: 60_000 });
    facts.archive = { revision: qa.config.sut.revision, sha256: sha(await readFile(archive)), paths, sourceManifest: listing };
    const roots: Record<string, string> = {};
    for (const name of ['A', 'B']) {
      const root = resolve(owned.path, name); roots[name] = root; await mkdir(root, { mode: 0o700 });
      await exec('tar', ['-xf', archive, '-C', root], { timeout: 60_000 });
      assert.equal(sha(await readFile(resolve(root, sourceFile))), reviewed.optimizedSha);
      const install = new OwnedProcess({ command: 'npm', args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'] }, root, isolatedEnv({}), resolve(qa.outputDir, 'database-app-install-' + name + '.log'));
      try { await install.runOnce(300_000); } finally { await install.stop(); }
      stages.push({ stage: 'dependency-install', name, command: install.command, exitOutcome: install.exitOutcome, lockSha256: sha(await readFile(resolve(root, 'package-lock.json'))) });
    }
    await qa.api.login();
    const measured = (await qa.api.createGroup(1)).group, control = (await qa.api.createGroup(1)).group;
    const storage = qa.ownedStorage(); assert.ok(storage.cluster.ownsDatabase(storage.database));
    db = new Client({ connectionString: storage.cluster.url(storage.database), application_name: 'qa-db002-rollback', connectionTimeoutMillis: 5000, query_timeout: 10000 }); await db.connect();
    const prefix = 'db002-' + randomUUID();
    const inserted = await db.query(`INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at,delivery_status,dispatch_state)
      SELECT $1||'-'||g||'-'||lpad(n::text,6,'0'),g,$1||'-'||g||'-remote-'||n,'qa-db002-fixture',false,
        'DB002 synthetic '||n,'2026-01-01'::timestamptz+(n/3)*interval '1 millisecond','sent','done'
      FROM unnest($2::text[]) g CROSS JOIN generate_series(1,120) n`, [prefix, [measured.id, control.id]]);
    assert.equal(inserted.rowCount, 240); await db.query('ANALYZE messages');
    facts.fixture = { database: storage.database, identity: (await db.query('SELECT current_database() AS database,version()')).rows,
      measuredGroup: measured.id, controlGroup: control.id, prefix, insertedRows: inserted.rowCount, countPerGroup: 120,
      meaning: 'Input-only synthetic rows; no fake gateway side effect, run, delivery transition or derived snapshot.' };
    await qa.kill('SIGTERM'); // The parent app cannot be mistaken for one of A/B.
    const start = async (name: string, expectedSource: string): Promise<SourceApp> => {
      const root = roots[name]!, sourceSha256 = sha(await readFile(resolve(root, sourceFile))); assert.equal(sourceSha256, expectedSource);
      const port = await availablePort(), env = await qa.ownedDatabaseEnvironment(storage.database, port);
      const process = new OwnedProcess({ command: processExecPath(), args: ['--import', 'tsx', 'apps/server/src/main.ts'] }, root, env, resolve(qa.outputDir, `database-app-${name}-${stages.length}.log`));
      const app: SourceApp = { name, root, process, port, sourceSha256, api: new PlatformClient('http://127.0.0.1:' + port, { recorder: entry => qa.recordHttp({ ...entry, databaseApplication: name, sourceSha256 }) }), identity: [] };
      live.add(app); await process.start(); await waitHttp(app.api.baseUrl + '/api/health', qa.config.sut.startupTimeoutMs, process);
      await app.api.login(); app.identity = await actualListenerIdentity(app.api.baseUrl);
      const health = await app.api.require(app.api.get('/api/health'));
      const diagnostics = await observeBackend(() => app.api.require(app.api.get<Record<string, unknown>>('/api/diagnostics/background')), value => {
        const modules = value.modules as Record<string, unknown>[] | undefined;
        return value.backgroundEnabled === true && !!modules && ['gateway', 'automation'].every(name => modules.some(module => module.name === name && Number(module.successfulTicks) > 0 && Number(module.consecutiveFailures) === 0));
      }, 15000, 'normal main actual gateway and automation successful ticks');
      stages.push({ stage: 'started', name, sourceSha256, guardianPid: process.pid, identity: app.identity, url: app.api.baseUrl, health, diagnostics, database: storage.database, command: process.command }); await save(); return app;
    };
    const stop = async (app: SourceApp) => {
      await app.process.stop('SIGTERM');
      let listeners = ''; try { listeners = (await exec('lsof', ['-n', '-P', `-iTCP:${app.port}`, '-sTCP:LISTEN', '-t'], { timeout: 2000 })).stdout.trim(); }
      catch (error) { if ((error as { code?: number }).code !== 1) throw error; }
      if (listeners) throw new BlockedError('Stopped application port still has a listener; no replacement or port probing permitted');
      assert.ok(app.process.exitOutcome, 'owned application exit must be observed'); live.delete(app);
      stages.push({ stage: 'stopped', name: app.name, identity: app.identity, exitOutcome: app.process.exitOutcome, listenerAbsent: true }); await save();
    };
    const a = await start('A', reviewed.optimizedSha); let b = await start('B', reviewed.optimizedSha);
    assert.ok(b.identity.every(identity => !a.identity.some(other => other.pid === identity.pid)));
    const get = async (app: SourceApp, cursor?: string, limit = 50) => app.api.require(app.api.get<Page>(`/api/groups/${measured.id}/messages?limit=${limit}` + (cursor ? '&before=' + encodeURIComponent(cursor) : '')), 200);
    const seeds = await Promise.all([get(a), get(b)]); assert.notEqual(seeds[0]!.snapshotId, seeds[1]!.snapshotId);
    for (const seed of seeds) { assert.ok(seed.snapshotId && seed.nextCursor); const decoded = JSON.parse(Buffer.from(seed.nextCursor!, 'base64url').toString()); assert.equal(decoded.snapshotId, seed.snapshotId); }
    const snapshotIds = seeds.map(seed => seed.snapshotId);
    const sqlSnapshots = async () => (await db!.query('SELECT id,group_id,jsonb_array_length(items) AS item_count,md5(items::text) AS content_digest FROM timeline_snapshots WHERE id=ANY($1::text[]) ORDER BY id', [snapshotIds])).rows;
    const beforeSql = await sqlSnapshots(); assert.equal(beforeSql.length, 2); assert.ok(beforeSql.every(row => row.item_count === 120));
    const expectedIds = new Set(Array.from({ length: 120 }, (_, i) => `${prefix}-${measured.id}-remote-${i + 1}`));
    const baseline = new Map<string, Page[]>();
    const replay = async (stage: string, first: boolean) => {
      const observations: unknown[] = [];
      for (const seed of seeds) for (const limit of [1, 37, 50, 100]) {
        let cursor: string | null = Buffer.from(JSON.stringify({ snapshotId: seed.snapshotId, offset: 0 })).toString('base64url');
        const pages: Page[] = [], used = new Set<string>();
        while (cursor) {
          assert.ok(!used.has(cursor) && used.size < 121); used.add(cursor);
          const left = await get(a, cursor, limit), right = await get(b, cursor, limit);
          assert.deepEqual(right, left, 'Same original snapshot/cursor must return every identical API field across actual applications');
          assert.equal(left.snapshotId, seed.snapshotId); pages.push(left); cursor = left.nextCursor;
        }
        const items = pages.flatMap(page => page.items); assert.equal(items.length, 120);
        assert.equal(new Set(items.map(item => item.msgId)).size, 120);
        assert.deepEqual(new Set(items.map(item => item.msgId)), expectedIds);
        const key = seed.snapshotId + ':' + limit;
        if (first) baseline.set(key, pages); else assert.deepEqual(pages, baseline.get(key), 'Actual rollback/restoration must preserve the original full pages and cursors');
        if (limit === 50) assert.deepEqual(pages[0], seed, 'Offset-zero cursor reads the original first page, without creating a new snapshot');
        observations.push({ snapshotId: seed.snapshotId, limit, pages });
      }
      const snapshots = await sqlSnapshots(); assert.deepEqual(snapshots, beforeSql, 'Same persisted snapshot contents must survive all application versions');
      const count = (await db!.query('SELECT count(*)::int AS count FROM timeline_snapshots WHERE group_id=$1', [measured.id])).rows[0]; assert.equal(count.count, 2, 'Replays must not silently create replacement snapshots');
      stages.push({ stage, a: a.api.baseUrl, b: b.api.baseUrl, sourceA: a.sourceSha256, sourceB: b.sourceSha256, snapshots, observations }); await save();
    };
    facts.originalSnapshots = { seeds, beforeSql }; await replay('optimized-pair', true);
    const apply = async (name: keyof typeof reviewed.patches, expected: string) => {
      const patch = resolve(qa.outputDir, name), gitEnv = isolatedEnv({ GIT_CEILING_DIRECTORIES: await realpath(owned!.path) });
      await exec('git', ['apply', '--check', patch], { cwd: roots.B, env: gitEnv });
      await exec('git', ['apply', patch], { cwd: roots.B, env: gitEnv });
      assert.equal(sha(await readFile(resolve(roots.B!, sourceFile))), expected);
      stages.push({ stage: 'single-select-patch-applied', patch: name, patchSha256: sha(patches[name]!), sourceSha256: expected }); await save();
    };
    await stop(b); await apply('to-original-query.patch', reviewed.originalSha); b = await start('B', reviewed.originalSha); await replay('old-select-application', false);
    await stop(b); await apply('to-optimized-query.patch', reviewed.optimizedSha); b = await start('B', reviewed.optimizedSha);
    assert.deepEqual(await readFile(resolve(roots.A!, sourceFile)), await readFile(resolve(roots.B!, sourceFile)));
    await replay('restored-optimized-application', false); await stop(b); await stop(a);
    facts.finishedAt = new Date().toISOString(); facts.scope = 'Normal main query rollback only; existing two-scale SQL measurements remain separate, no new performance SLA or production rollback guarantee.';
  } catch (error) { primary = error; facts.error = String(error); }
  finally {
    for (const app of live) try { await app.process.stop(); } catch (error) { cleanupErrors.push(String(error)); }
    if (db) try { await db.end(); } catch (error) { cleanupErrors.push(String(error)); }
    if (owned && !cleanupErrors.length) try { await owned.remove(); } catch (error) { cleanupErrors.push(String(error)); }
    facts.cleanup = { failures: cleanupErrors, parentDatabaseAndExternalServices: 'retained for parent exact-owner cleanup', copiedSourcesRemoved: !!owned && !cleanupErrors.length };
    await save();
  }
  variants.push({ id, status: primary ? classifyError(primary) : cleanupErrors.length ? 'BLOCKED' : 'PASS', evidence: [evidencePath], ...(primary ? { reason: String(primary) } : {}) });
  return { caseId, variants, cleanupErrors, status: combineVariants(variants, cleanupErrors) };
}
const processExecPath = () => process.execPath;
