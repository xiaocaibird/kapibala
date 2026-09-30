import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exactMicros,
  directoryOrder,
  assertPrecisionBoundaries,
  validateFixtureManifest,
  normalizeDump,
  loadArtifact,
  loadObservation,
  loadFixtureConfiguration,
  type DirectoryRow,
} from '../../harness/fixture-artifacts.js';
import {
  targetFingerprint,
  validateAuthorization,
  validateFixtureArtifactBinding,
} from '../../harness/security.js';
import type { Authorization, TargetConfig } from '../../harness/types.js';

const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
const candidate = 'a'.repeat(40),
  source = 'b'.repeat(40);
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const archive = Buffer.from('PGDMPthis-is-only-a-validator-fixture-never-restored');
const rows: DirectoryRow[] = ['000001', '000002', '000002', '000003', '000004', '000004'].map(
  (fraction, index) => ({
    id: `id-${index}`,
    createdAtMicros: `2026-10-01T00:00:00.${fraction}Z`,
    public: {
      id: `id-${index}`,
      name: `qa-precision-${index}`,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  }),
);
function manifest(kind: 'legacy-schema' | 'directory-precision' = 'directory-precision') {
  return {
    version: 1,
    artifactId: 'self-only',
    candidateRevision: candidate,
    source: {
      producer: 'QA dummy artifact',
      revision: source,
      exportedAt: '2026-10-01T00:00:00Z',
      syntheticOnly: true,
      noPendingWork: true,
    },
    review: {
      reviewer: 'QA selftest',
      reference: 'selftest:never-run-sut',
      reviewedAt: '2026-10-01T00:01:00Z',
    },
    dump: {
      path: 'archive.dump',
      sha256: sha(archive),
      bytes: archive.length,
      format: 'pg-custom',
    },
    kind,
    expected:
      kind === 'legacy-schema'
        ? {
            schemaRelation: 'older-than-candidate',
            rejectionLogIncludes: ['schema version is outdated'],
          }
        : { query: { q: 'qa-precision-', pageSize: 2 }, rows },
  };
}
async function directory(t: { after(fn: () => Promise<void>): void }) {
  await mkdir(resolve(qaRoot, '.runtime'), { recursive: true });
  const path = await mkdtemp(resolve(qaRoot, '.runtime/fixture-self-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function configured(t: { after(fn: () => Promise<void>): void }, value = manifest()) {
  const root = await directory(t),
    previous = process.env.QA_FIXTURE_CONFIG;
  delete process.env.QA_FIXTURE_CONFIG;
  t.after(async () => {
    if (previous === undefined) delete process.env.QA_FIXTURE_CONFIG;
    else process.env.QA_FIXTURE_CONFIG = previous;
  });
  const raw = JSON.stringify(value);
  await writeFile(resolve(root, 'manifest.json'), raw);
  await writeFile(resolve(root, 'archive.dump'), archive);
  await writeFile(
    resolve(root, 'config.json'),
    JSON.stringify({
      version: 1,
      artifacts: {
        legacySchema: null,
        directoryPrecision: { manifest: 'manifest.json', sha256: sha(raw) },
      },
      observation: null,
    }),
  );
  const target = JSON.parse(
    await readFile(resolve(qaRoot, 'config/target.example.json'), 'utf8'),
  ) as TargetConfig;
  target.sut.revision = candidate;
  target.sut.cwd = root;
  await bindConfiguration(root, target);
  return { root, target };
}
async function bindConfiguration(root: string, target: TargetConfig) {
  target.adapters = {
    ...target.adapters,
    fixtureArtifacts: {
      configPath: 'config.json',
      sha256: sha(await readFile(resolve(root, 'config.json'))),
    },
  };
}
function authorization(target: TargetConfig): Authorization {
  return {
    version: 1,
    approvedBy: 'QA selftest only',
    approvalReference: 'self:never-launch-sut',
    approvedAt: '2026-10-01T00:00:00Z',
    expiresAt: '2026-10-02T00:00:00Z',
    sutRevision: target.sut.revision,
    sutDirectory: target.sut.cwd,
    targetSha256: targetFingerprint(target),
    allowedActions: [
      'start-isolated-sut',
      'create-owned-database',
      'fault-injection',
      'kill-owned-process',
      'browser-automation',
    ],
    scope: 'all-required',
  };
}

test('precision oracle retains microseconds and always sorts exact timestamp ties by id ascending', () => {
  assert.equal(
    exactMicros('2026-10-01T00:00:00.000002Z') - exactMicros('2026-10-01T00:00:00.000001Z'),
    1n,
  );
  assert.deepEqual(
    directoryOrder([...rows].reverse(), 'asc').map((r) => r.id),
    ['id-0', 'id-1', 'id-2', 'id-3', 'id-4', 'id-5'],
  );
  assert.deepEqual(
    directoryOrder(rows, 'desc').map((r) => r.id),
    ['id-4', 'id-5', 'id-3', 'id-1', 'id-2', 'id-0'],
  );
  assertPrecisionBoundaries(rows, 2);
});
test('precision fixture must hit both boundary classes in both directions', () => {
  assert.throws(() => assertPrecisionBoundaries(rows, 50), /跨页/);
  assert.throws(
    () =>
      assertPrecisionBoundaries(
        rows.map((r, i) => ({ ...r, createdAtMicros: `2026-10-01T00:00:0${i}.000000Z` })),
        2,
      ),
    /跨页/,
  );
  assert.throws(() => exactMicros('2026-10-01T00:00:00.001Z'), /六位/);
  assert.throws(() => exactMicros('2026-02-30T00:00:00.000001Z'), /日历/);
});
test('reviewed schema/data manifest binds target and preserves independently specified public projection', () => {
  const value = validateFixtureManifest(manifest(), candidate);
  assert.equal(value.kind, 'directory-precision');
  assert.equal(validateFixtureManifest(manifest('legacy-schema'), candidate).kind, 'legacy-schema');
  assert.throws(() => validateFixtureManifest(manifest(), 'c'.repeat(40)), /候选版本/);
  assert.throws(
    () =>
      validateFixtureManifest(
        { ...manifest(), source: { ...manifest().source, syntheticOnly: false } },
        candidate,
      ),
    /合成数据/,
  );
  assert.throws(
    () =>
      validateFixtureManifest(
        { ...manifest(), review: { ...manifest().review, reference: '' } },
        candidate,
      ),
    /实际值/,
  );
});
test('empty or generic startup failures are not accepted as schema rejection markers', () => {
  for (const expected of [
    { schemaRelation: 'older-than-candidate', rejectionLogIncludes: [] },
    { schemaRelation: 'older-than-candidate', rejectionLogIncludes: ['MODULE_NOT_FOUND'] },
    { schemaRelation: 'current', rejectionLogIncludes: ['schema version is outdated'] },
  ])
    assert.throws(() =>
      validateFixtureManifest({ ...manifest('legacy-schema'), expected }, candidate),
    );
});
test('invalid archive size, format, duplicate IDs and deficient precision fixtures fail closed', () => {
  for (const dump of [
    { ...manifest().dump, bytes: 0 },
    { ...manifest().dump, format: 'plain' },
    { ...manifest().dump, sha256: 'wrong' },
  ])
    assert.throws(() => validateFixtureManifest({ ...manifest(), dump }, candidate));
  assert.throws(
    () =>
      validateFixtureManifest(
        {
          ...manifest(),
          expected: { query: { q: 'qa-', pageSize: 2 }, rows: [rows[0], rows[0], rows[1]] },
        },
        candidate,
      ),
    /重复/,
  );
});
test('dump normalization removes only volatile guard tokens and preserves real schema/data text', () => {
  const a =
    '\\restrict aaa123\n-- stored comment\nCOPY t (v) FROM stdin;\n\\\\restrict data123\n\\.\n\\unrestrict aaa123\n';
  const b = a.replaceAll('aaa123', 'bbb456');
  assert.equal(normalizeDump(a), normalizeDump(b));
  assert.notEqual(normalizeDump(a), normalizeDump(a.replace('stored comment', 'changed comment')));
  assert.notEqual(normalizeDump(a), normalizeDump(a.replace('data123', 'changed-data')));
});
test('loader validates configuration/manifest/archive hashes without starting processes or databases', async (t) => {
  const { root, target } = await configured(t);
  const result = await loadArtifact(root, target, 'directory-precision');
  assert.equal(result.archiveSha256, sha(archive));
  assert.equal(result.manifest.kind, 'directory-precision');
  await writeFile(resolve(root, 'archive.dump'), Buffer.from('PGDMPmodified'));
  await assert.rejects(loadArtifact(root, target, 'directory-precision'), /哈希不匹配/);
});
test('manifest mutation and missing real fixture never become ready', async (t) => {
  const { root, target } = await configured(t);
  await assert.rejects(loadArtifact(root, target, 'legacy-schema'), /真实制品未提供/);
  await writeFile(resolve(root, 'manifest.json'), '{}');
  await assert.rejects(loadArtifact(root, target, 'directory-precision'), /manifest哈希/);
});
test('archive path traversal and symlinks are rejected', async (t) => {
  const value = manifest();
  value.dump.path = '../outside.dump';
  const { root, target } = await configured(t, value);
  await assert.rejects(loadArtifact(root, target, 'directory-precision'), /穿越/);
  value.dump.path = 'linked.dump';
  const raw = JSON.stringify(value);
  await writeFile(resolve(root, 'manifest.json'), raw);
  const config = JSON.parse(await readFile(resolve(root, 'config.json'), 'utf8'));
  config.artifacts.directoryPrecision.sha256 = sha(raw);
  await writeFile(resolve(root, 'config.json'), JSON.stringify(config));
  await bindConfiguration(root, target);
  await symlink(resolve(root, 'archive.dump'), resolve(root, 'linked.dump'));
  await assert.rejects(loadArtifact(root, target, 'directory-precision'), /符号链接/);
});
test('UI consumer adaptation must be reviewed for exact candidate and distinguish old/new state', async (t) => {
  const { root, target } = await configured(t);
  await assert.rejects(loadObservation(root, target), /尚未确认/);
  const observation = {
    confirmed: true,
    candidateRevision: candidate,
    reviewReference: 'QA visible adapter review',
    rowSelector: '[data-account="{id}"]',
    stateSelector: '.status',
    errorSelector: '.error',
    refreshSelector: '.retry',
    acknowledgeSelector: '.status',
    stateText: { online: 'online', disconnected: 'disconnected' },
  };
  const config = {
    version: 1,
    artifacts: { legacySchema: null, directoryPrecision: null },
    observation,
  };
  await writeFile(resolve(root, 'config.json'), JSON.stringify(config));
  await bindConfiguration(root, target);
  assert.equal((await loadObservation(root, target)).confirmed, true);
  await assert.rejects(
    loadObservation(root, { ...target, sut: { ...target.sut, revision: source } }),
    /尚未确认/,
  );
  config.observation.stateText.disconnected = 'online';
  await writeFile(resolve(root, 'config.json'), JSON.stringify(config));
  await bindConfiguration(root, target);
  await assert.rejects(loadObservation(root, target), /可区别/);
});
test('fixture configuration changes invalidate both loaders and cannot reuse prior authorization', async (t) => {
  const { root, target } = await configured(t);
  const approved = authorization(target);
  const now = Date.parse('2026-10-01T01:00:00Z');
  validateAuthorization(approved, target, now);
  const config = JSON.parse(await readFile(resolve(root, 'config.json'), 'utf8'));
  config.observation = { rowSelector: '[changed-visible-selector]' };
  await writeFile(resolve(root, 'config.json'), JSON.stringify(config));
  await assert.rejects(
    loadArtifact(root, target, 'directory-precision'),
    /配置哈希与已授权目标不符/,
  );
  await assert.rejects(loadObservation(root, target), /配置哈希与已授权目标不符/);
  await bindConfiguration(root, target);
  assert.throws(() => validateAuthorization(approved, target, now), /完整目标配置/);
  validateAuthorization(authorization(target), target, now);
});
test('fixture selection cannot use an unbound environment override or missing target binding', async (t) => {
  const { root, target } = await configured(t);
  process.env.QA_FIXTURE_CONFIG = 'config.json';
  await assert.rejects(loadFixtureConfiguration(root, target), /环境变量覆盖/);
  delete process.env.QA_FIXTURE_CONFIG;
  await assert.rejects(loadFixtureConfiguration(root, { ...target, adapters: {} }), /未绑定/);
  const approved = authorization(target);
  const changedPath = structuredClone(target);
  changedPath.adapters!.fixtureArtifacts!.configPath = 'another.json';
  assert.throws(
    () => validateAuthorization(approved, changedPath, Date.parse('2026-10-01T01:00:00Z')),
    /完整目标配置/,
  );
});
test('fixture target bindings reject malformed hashes and escaping paths', () => {
  validateFixtureArtifactBinding({
    configPath: 'config/fixtures.local.json',
    sha256: 'a'.repeat(64),
  });
  for (const configPath of ['', '../outside.json', '/tmp/outside.json', 'a/../outside.json'])
    assert.throws(() => validateFixtureArtifactBinding({ configPath, sha256: 'a'.repeat(64) }));
  assert.throws(() => validateFixtureArtifactBinding({ configPath: 'config.json', sha256: 'bad' }));
});
