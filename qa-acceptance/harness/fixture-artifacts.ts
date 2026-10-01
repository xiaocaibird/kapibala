import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, lstat, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { Client } from 'pg';
import {
  BlockedError,
  isWithin,
  redact,
  requireAuthorization,
  validateFixtureArtifactBinding,
  capacityRegistryEnvironment,
  runtimeRegistryEnvironment,
  messageRegistryEnvironment,
} from './security.js';
import { exec, isolatedEnv, OwnedProcess, waitHttp } from './process.js';
import {
  observeOwnedStartupRejection,
  type StartupRejectionObservation,
} from './recovery-drill.js';
import { availablePort } from './network.js';
import { GatewaySimulator } from './gateway.js';
import { AgentSimulator } from './agent.js';
import { PlatformClient } from './platform-client.js';
import type { OwnedDatabaseCluster } from './database.js';
import type { TargetConfig } from './types.js';

export interface DirectoryRow {
  id: string;
  /** Independent fixture truth, including all six fractional digits; never inferred from API. */
  createdAtMicros: string;
  public: Record<string, unknown>;
}
interface ArtifactBase {
  version: 1;
  artifactId: string;
  candidateRevision: string;
  source: {
    producer: string;
    revision: string;
    exportedAt: string;
    syntheticOnly: true;
    noPendingWork: true;
  };
  review: { reviewer: string; reference: string; reviewedAt: string };
  dump: { path: string; sha256: string; bytes: number; format: 'pg-custom' };
}
export type FixtureManifest = ArtifactBase &
  (
    | {
        kind: 'legacy-schema';
        expected: { schemaRelation: 'older-than-candidate'; rejectionLogIncludes: string[] };
      }
    | {
        kind: 'directory-precision';
        expected: { query: { q: string; pageSize: number }; rows: DirectoryRow[] };
      }
  );
export interface ObservationFixture {
  confirmed: boolean;
  candidateRevision: string;
  reviewReference: string;
  rowSelector: string;
  stateSelector: string;
  errorSelector: string;
  refreshSelector: string;
  acknowledgeSelector: string;
  stateText: { online: string; disconnected: string };
}
export interface FixtureConfiguration {
  version: 1;
  artifacts: {
    legacySchema: { manifest: string; sha256: string } | null;
    directoryPrecision: { manifest: string; sha256: string } | null;
  };
  observation: ObservationFixture | null;
  /** Optional public diagnostic mapping; exact target and configuration SHA are mandatory. */
  unmigratedSchema?: UnmigratedSchemaFixture | null;
}
export interface UnmigratedSchemaFixture {
  confirmed: true;
  candidateRevision: string;
  reviewReference: string;
  controlSchemaVersion: string | number;
  rejectionLogIncludes: string[];
}
export interface LoadedArtifact {
  manifest: FixtureManifest;
  manifestPath: string;
  manifestSha256: string;
  archivePath: string;
  archiveSha256: string;
  configurationSha256: string;
}
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name}必须为对象`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, name: string): string => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    /REPLACE_|REQUIRED|待填写/.test(value) ||
    value.includes('\0')
  )
    throw new Error(`${name}缺少实际值`);
  return value;
};
const sha = (value: unknown, name: string, length = 64): string => {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value))
    throw new Error(`${name}哈希格式无效`);
  return value;
};
function timestamp(value: unknown, name: string): string {
  const result = text(value, name);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${name}时间无效`);
  return result;
}
export function exactMicros(value: string): bigint {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/.exec(value);
  if (!match) throw new Error('createdAtMicros必须为六位小数UTC时间');
  const seconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(seconds) || new Date(seconds).toISOString().slice(0, 19) !== match[1])
    throw new Error('createdAtMicros日历值无效');
  return BigInt(seconds) * 1000n + BigInt(match[2]!);
}
export function directoryOrder(rows: DirectoryRow[], order: 'asc' | 'desc'): DirectoryRow[] {
  return [...rows].sort((a, b) => {
    const at = exactMicros(a.createdAtMicros),
      bt = exactMicros(b.createdAtMicros);
    if (at !== bt) return (at < bt ? -1 : 1) * (order === 'asc' ? 1 : -1);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
export function assertPrecisionBoundaries(rows: DirectoryRow[], pageSize: number): void {
  for (const order of ['asc', 'desc'] as const) {
    const sorted = directoryOrder(rows, order);
    let tie = false,
      micro = false;
    for (let i = pageSize; i < sorted.length; i += pageSize) {
      const a = exactMicros(sorted[i - 1]!.createdAtMicros),
        b = exactMicros(sorted[i]!.createdAtMicros);
      tie ||= a === b;
      micro ||= a !== b && a / 1000n === b / 1000n;
    }
    if (!tie || !micro)
      throw new Error(`${order}夹具必须分别有同时间ID边界和同毫秒不同微秒边界跨页`);
  }
}
export function validateFixtureManifest(
  input: unknown,
  candidateRevision: string,
): FixtureManifest {
  const value = object(input, 'manifest');
  if (value.version !== 1 || !['legacy-schema', 'directory-precision'].includes(String(value.kind)))
    throw new Error('fixture版本或kind无效');
  text(value.artifactId, 'artifactId');
  if (sha(value.candidateRevision, 'candidateRevision', 40) !== candidateRevision)
    throw new Error('fixture未冻结到本轮候选版本');
  const source = object(value.source, 'source'),
    review = object(value.review, 'review'),
    dump = object(value.dump, 'dump');
  text(source.producer, 'source.producer');
  sha(source.revision, 'source.revision', 40);
  timestamp(source.exportedAt, 'source.exportedAt');
  if (source.syntheticOnly !== true || source.noPendingWork !== true)
    throw new Error('仅接收明确声明合成数据且无待运行任务的夹具');
  text(review.reviewer, 'review.reviewer');
  text(review.reference, 'review.reference');
  if (
    Date.parse(timestamp(review.reviewedAt, 'review.reviewedAt')) <
    Date.parse(String(source.exportedAt))
  )
    throw new Error('fixture审核不能早于导出');
  if (dump.format !== 'pg-custom')
    throw new Error('只接受pg_dump custom archive；不执行手写SQL脚本');
  text(dump.path, 'dump.path');
  sha(dump.sha256, 'dump.sha256');
  if (
    !Number.isInteger(dump.bytes) ||
    Number(dump.bytes) < 5 ||
    Number(dump.bytes) > 64 * 1024 * 1024
  )
    throw new Error('fixture archive必须为5字节至64MiB');
  const expected = object(value.expected, 'expected');
  if (value.kind === 'legacy-schema') {
    if (source.revision === candidateRevision || expected.schemaRelation !== 'older-than-candidate')
      throw new Error('旧schema夹具必须来自不同版本且经审核确认低于候选');
    if (
      !Array.isArray(expected.rejectionLogIncludes) ||
      !expected.rejectionLogIncludes.length ||
      !expected.rejectionLogIncludes.every((x) => typeof x === 'string' && x.trim().length >= 8) ||
      !expected.rejectionLogIncludes.some((x) =>
        /schema|migration|迁移|数据库版本/i.test(String(x)),
      )
    )
      throw new Error('需要明确的公开schema拒启日志片段，不能用任意进程退出代替拒启');
  } else {
    const query = object(expected.query, 'expected.query');
    text(query.q, 'expected.query.q');
    if (
      !Number.isInteger(query.pageSize) ||
      Number(query.pageSize) < 1 ||
      Number(query.pageSize) > 50
    )
      throw new Error('fixture pageSize必须为1至50');
    if (!Array.isArray(expected.rows) || expected.rows.length < 3 || expected.rows.length > 500)
      throw new Error('precision rows必须为3至500条确定记录');
    const ids = new Set<string>();
    for (const row of expected.rows) {
      const r = object(row, 'row');
      const id = text(r.id, 'row.id');
      if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id))
        throw new Error('fixture ID重复或不支持安全ASCII比较');
      ids.add(id);
      exactMicros(text(r.createdAtMicros, 'row.createdAtMicros'));
      const projection = object(r.public, 'row.public');
      if (projection.id !== id) throw new Error('公开期望必须明确包含相同id');
      timestamp(projection.createdAt, 'row.public.createdAt');
    }
    assertPrecisionBoundaries(expected.rows as DirectoryRow[], Number(query.pageSize));
  }
  return value as unknown as FixtureManifest;
}
async function confinedFile(root: string, relativePath: string): Promise<string> {
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..'))
    throw new Error('fixture路径必须在QA根内且不可穿越');
  const path = resolve(root, relativePath),
    info = await lstat(path),
    actual = await realpath(path);
  if (info.isSymbolicLink() || !info.isFile() || !isWithin(await realpath(root), actual))
    throw new Error('fixture必须是QA根内的普通文件，不接受符号链接');
  return actual;
}
async function boundedRead(path: string, maximum: number): Promise<Buffer> {
  if ((await lstat(path)).size > maximum) throw new Error('fixture文件超过允许大小');
  const bytes = await readFile(path);
  if (bytes.length > maximum) throw new Error('fixture文件在读取时超出允许大小');
  return bytes;
}
export async function loadFixtureConfiguration(
  root: string,
  target: TargetConfig,
): Promise<{ value: FixtureConfiguration; sha256: string }> {
  try {
    if (process.env.QA_FIXTURE_CONFIG !== undefined)
      throw new Error('QA_FIXTURE_CONFIG已停用；不接受未绑定授权的环境变量覆盖');
    const binding = target.adapters?.fixtureArtifacts;
    if (!binding)
      throw new Error('目标配置未绑定adapters.fixtureArtifacts；真实fixture/定位尚未接入');
    validateFixtureArtifactBinding(binding);
    const file = await confinedFile(root, binding.configPath),
      bytes = await boundedRead(file, 1024 * 1024);
    if (hash(bytes) !== binding.sha256)
      throw new Error('fixture配置哈希与已授权目标不符；配置/定位变更后须重新冻结并授权');
    const value = object(JSON.parse(bytes.toString()), 'fixture配置');
    if (value.version !== 1) throw new Error('fixture配置version必须为1');
    object(value.artifacts, 'artifacts');
    return { value: value as unknown as FixtureConfiguration, sha256: hash(bytes) };
  } catch (error) {
    throw new BlockedError(`fixture接入未就绪：${String(error)}`);
  }
}
export async function loadArtifact(
  root: string,
  target: TargetConfig,
  kind: FixtureManifest['kind'],
): Promise<LoadedArtifact> {
  try {
    const config = await loadFixtureConfiguration(root, target);
    const reference =
      config.value.artifacts[kind === 'legacy-schema' ? 'legacySchema' : 'directoryPrecision'];
    if (!reference) throw new Error(`${kind}真实制品未提供；适配器存在不等于夹具已就绪`);
    const manifestPath = await confinedFile(root, text(reference.manifest, 'manifest path'));
    const bytes = await boundedRead(manifestPath, 1024 * 1024);
    if (hash(bytes) !== sha(reference.sha256, 'manifest sha256'))
      throw new Error('manifest哈希或大小不符');
    const manifest = validateFixtureManifest(JSON.parse(bytes.toString()), target.sut.revision);
    if (manifest.kind !== kind) throw new Error('fixture kind不匹配');
    const archivePath = await confinedFile(root, manifest.dump.path),
      dump = await boundedRead(archivePath, 64 * 1024 * 1024);
    if (
      dump.length !== manifest.dump.bytes ||
      dump.subarray(0, 5).toString() !== 'PGDMP' ||
      hash(dump) !== manifest.dump.sha256
    )
      throw new Error('archive magic、长度或哈希不匹配');
    return {
      manifest,
      manifestPath,
      manifestSha256: hash(bytes),
      archivePath,
      archiveSha256: hash(dump),
      configurationSha256: config.sha256,
    };
  } catch (error) {
    throw new BlockedError(`fixture接入未就绪：${String(error)}`);
  }
}
export async function loadUnmigratedSchema(
  root: string,
  target: TargetConfig,
): Promise<UnmigratedSchemaFixture & { configurationSha256: string }> {
  const { value, sha256 } = await loadFixtureConfiguration(root, target);
  const profile = value.unmigratedSchema;
  if (!profile || profile.confirmed !== true || profile.candidateRevision !== target.sut.revision)
    throw new BlockedError('空schema公开拒启诊断尚未审核绑定到本候选');
  try {
    text(profile.reviewReference, 'unmigratedSchema.reviewReference');
    if (
      !(typeof profile.controlSchemaVersion === 'string' && profile.controlSchemaVersion.trim()) &&
      !(
        typeof profile.controlSchemaVersion === 'number' &&
        Number.isFinite(profile.controlSchemaVersion)
      )
    )
      throw new Error('迁移库健康schemaVersion必须为审核过的实际版本标识');
    if (
      !Array.isArray(profile.rejectionLogIncludes) ||
      !profile.rejectionLogIncludes.length ||
      !profile.rejectionLogIncludes.every(
        (marker) =>
          typeof marker === 'string' && marker.trim().length >= 8 && !/[\r\n\0]/.test(marker),
      ) ||
      !profile.rejectionLogIncludes.some((marker) =>
        /schema|migration|迁移|数据库版本/i.test(marker),
      )
    )
      throw new Error('必须提供审核过的明确schema拒启诊断，不能使用通用崩溃文本');
  } catch (error) {
    throw new BlockedError(`空schema诊断适配无效：${String(error)}`);
  }
  return { ...profile, configurationSha256: sha256 };
}

export function assessUnmigratedSchema(
  profile: UnmigratedSchemaFixture,
  controlBefore: { ok: unknown; schemaVersion: unknown },
  controlAfter: { ok: unknown; schemaVersion: unknown },
  observation: StartupRejectionObservation,
): { status: 'PASS' | 'FAIL' | 'BLOCKED'; reason: string } {
  if (observation.ready)
    return { status: 'FAIL', reason: '空schema仍提供可用健康端点，未拒绝启动' };
  if (
    [controlBefore, controlAfter].some(
      (control) => control.ok !== true || control.schemaVersion !== profile.controlSchemaVersion,
    )
  )
    return { status: 'BLOCKED', reason: '相同候选迁移库前后健康对照与审核版本不符，无法归因' };
  if (!observation.exit || observation.exit.code === null || observation.exit.signal !== null)
    return {
      status: 'BLOCKED',
      reason: '未观察到候选自行退出；健康超时或外部终止不能证明schema拒启',
    };
  if (!profile.rejectionLogIncludes.every((marker) => observation.log.includes(marker)))
    return {
      status: 'BLOCKED',
      reason: '退出日志未命中审核过的空schema拒启诊断，不能将任意崩溃算通过',
    };
  return {
    status: 'PASS',
    reason: '同候选迁移库前后健康，空库未健康且自行退出，明确schema诊断匹配',
  };
}
export async function loadObservation(
  root: string,
  target: TargetConfig,
): Promise<ObservationFixture & { configurationSha256: string; configurationPath: string }> {
  const { value, sha256 } = await loadFixtureConfiguration(root, target);
  const x = value.observation;
  if (!x || x.confirmed !== true || x.candidateRevision !== target.sut.revision)
    throw new BlockedError(
      '通用资源提醒的可见页面适配尚未确认到本候选；脚本已实现，运行接入未就绪',
    );
  try {
    text(x.reviewReference, 'observation.reviewReference');
    for (const key of [
      'rowSelector',
      'stateSelector',
      'errorSelector',
      'refreshSelector',
      'acknowledgeSelector',
    ] as const)
      text(x[key], key);
    if (!x.rowSelector.includes('{id}')) throw new Error('rowSelector必须限定当前账号{id}');
    text(x.stateText.online, 'online display');
    text(x.stateText.disconnected, 'disconnected display');
    if (x.stateText.online === x.stateText.disconnected) throw new Error('新旧状态显示必须可区别');
    return {
      ...x,
      configurationSha256: sha256,
      configurationPath: target.adapters!.fixtureArtifacts!.configPath,
    };
  } catch (error) {
    throw new BlockedError(`通用资源提醒定位无效：${String(error)}`);
  }
}

async function docker(args: string[], timeout = 60000): Promise<string> {
  const result = await exec('docker', ['--host', 'unix:///var/run/docker.sock', ...args], {
    timeout,
    env: isolatedEnv({}),
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}
async function ownedContainer(cluster: OwnedDatabaseCluster, database: string): Promise<string> {
  if (!cluster.ownsDatabase(database)) throw new Error('拒绝连接非当前cluster新建数据库');
  const value = JSON.parse(await docker(['inspect', cluster.name]))[0] as {
    Id: string;
    Config: { Labels: Record<string, string> };
    State: { Running: boolean };
    NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[]> };
  };
  const port = value.NetworkSettings.Ports['5432/tcp'];
  if (
    !/^[a-f0-9]{64}$/.test(value.Id) ||
    value.Config.Labels['qa.owner'] !== cluster.owner ||
    !value.State.Running ||
    port?.length !== 1 ||
    port[0]!.HostIp !== '127.0.0.1' ||
    Number(port[0]!.HostPort) !== cluster.port
  )
    throw new Error('fixture容器所有权或loopback端口发生变化');
  return value.Id;
}
export function normalizeDump(value: string): string {
  // PG17+ random psql guard tokens are transport wrappers, not schema/data.
  // Do not drop comments or COPY lines: they may contain actual user data.
  return value.replace(/^\\(un)?restrict [A-Za-z0-9]+\r?$/gm, '\\$1restrict QA_FIXED_GUARD');
}
export async function restoreOwnedArchive(
  target: TargetConfig,
  cluster: OwnedDatabaseCluster,
  database: string,
  artifact: LoadedArtifact,
): Promise<void> {
  await requireAuthorization(target);
  const id = await ownedContainer(cluster, database);
  const current = await boundedRead(artifact.archivePath, 64 * 1024 * 1024);
  if (hash(current) !== artifact.archiveSha256) throw new Error('archive在校验后改变，停止恢复');
  const client = new Client({
    connectionString: cluster.url(database),
    connectionTimeoutMillis: 2000,
    query_timeout: 3000,
  });
  try {
    await client.connect();
    const existing = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'",
    );
    if (existing.rows[0]?.count !== '0')
      throw new Error('只允许恢复到全新空库，不清理或覆盖已有表');
  } finally {
    await client.end();
  }
  const staged = `/tmp/qa-fixture-${randomUUID()}.dump`;
  // Copy the bytes just verified, not a mutable pathname that could change before docker cp.
  const local = await mkdtemp(resolve(dirname(artifact.archivePath), '.restore-'));
  const sealed = resolve(local, 'verified.dump');
  try {
    await writeFile(sealed, current, { flag: 'wx', mode: 0o600 });
    await docker(['cp', sealed, `${id}:${staged}`]);
    if ((await ownedContainer(cluster, database)) !== id) throw new Error('恢复前容器身份改变');
    await docker([
      'exec',
      id,
      'pg_restore',
      '--username=qa',
      `--dbname=${database}`,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '--single-transaction',
      staged,
    ]);
  } finally {
    try {
      await docker(['exec', id, 'rm', '-f', staged]);
    } finally {
      await rm(local, { recursive: true, force: true });
    }
  }
}
export interface StorageFingerprint {
  schemaSha256: string;
  dataSha256: string;
  schemaBytes: number;
  dataBytes: number;
}
export async function fingerprintOwnedStorage(
  target: TargetConfig,
  cluster: OwnedDatabaseCluster,
  database: string,
): Promise<StorageFingerprint> {
  await requireAuthorization(target);
  const id = await ownedContainer(cluster, database);
  const args = [
    'exec',
    id,
    'pg_dump',
    '--username=qa',
    `--dbname=${database}`,
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--quote-all-identifiers',
  ];
  const schema = normalizeDump(await docker([...args, '--schema-only']));
  const data = normalizeDump(await docker([...args, '--data-only']));
  return {
    schemaSha256: hash(schema),
    dataSha256: hash(data),
    schemaBytes: Buffer.byteLength(schema),
    dataBytes: Buffer.byteLength(data),
  };
}

/** Owns only a fresh fixture database and fresh process/ports, with no migrations on imported data. */
export class FixtureCandidate {
  readonly gateway = new GatewaySimulator();
  readonly agent = new AgentSimulator();
  api!: PlatformClient;
  database = '';
  private port = 0;
  private process?: OwnedProcess;
  private readonly resourceToken = randomUUID();
  constructor(
    readonly target: TargetConfig,
    readonly cluster: OwnedDatabaseCluster,
    readonly output: string,
  ) {}
  async prepare(artifact: LoadedArtifact): Promise<void> {
    await requireAuthorization(this.target);
    await mkdir(this.output, { recursive: true });
    // A silent candidate exit is missing diagnostic evidence, not an ENOENT test failure.
    await writeFile(resolve(this.output, 'fixture-server.log'), '', { flag: 'wx' });
    this.database = await this.cluster.createDatabase();
    await restoreOwnedArchive(this.target, this.cluster, this.database, artifact);
    await this.gateway.start();
    await this.agent.start();
    this.port = await availablePort();
    this.api = new PlatformClient(`http://127.0.0.1:${this.port}`, {
      recorder: async (entry) => {
        const { appendFile } = await import('node:fs/promises');
        await appendFile(
          resolve(this.output, 'fixture-api.ndjson'),
          JSON.stringify(JSON.parse(redact(entry))) + '\n',
        );
      },
    });
    await this.evidence('fixture-source', {
      ...artifact,
      ready: true,
      meaning: '制品已验证并仅恢复到本轮新库，不表示产品测试通过',
    });
  }
  private async command(): Promise<OwnedProcess> {
    if (!this.cluster.ownsDatabase(this.database))
      throw new Error('拒绝为未持有的夹具数据库启动候选');
    const env = isolatedEnv({
      ...this.target.sut.env,
      ...(await capacityRegistryEnvironment(this.target)),
      ...(await runtimeRegistryEnvironment(this.target)),
      ...(await messageRegistryEnvironment(this.target)),
      QA_ACCEPTANCE_RESOURCE_TOKEN: this.resourceToken,
      PORT: String(this.port),
      DATABASE_URL: this.cluster.url(this.database),
      GATEWAY_URL: this.gateway.url,
      AGENT_URL: this.agent.url,
    });
    return new OwnedProcess(
      {
        command: this.target.sut.start.command,
        args: this.target.sut.start.args.map((x) => x.replaceAll('{API_PORT}', String(this.port))),
      },
      this.target.sut.cwd,
      env,
      resolve(this.output, 'fixture-server.log'),
    );
  }
  async start(): Promise<void> {
    await requireAuthorization(this.target);
    if (this.process) throw new Error('fixture候选已启动');
    this.process = await this.command();
    await this.process.start();
    await waitHttp(
      `${this.api.baseUrl}/api/health`,
      this.target.sut.startupTimeoutMs,
      this.process,
    );
  }
  async observeRejection(): Promise<StartupRejectionObservation> {
    await requireAuthorization(this.target);
    if (this.process) throw new Error('fixture候选已启动');
    this.process = await this.command();
    try {
      await this.process.start();
    } catch (error) {
      throw new BlockedError(`候选命令无法启动，不是schema拒启证据：${String(error)}`);
    }
    const result = await observeOwnedStartupRejection(
      this.process,
      this.api.baseUrl,
      this.target.sut.startupTimeoutMs,
    );
    this.process = undefined;
    return result;
  }
  async evidence(name: string, value: unknown): Promise<void> {
    await mkdir(this.output, { recursive: true });
    await writeFile(resolve(this.output, `${name}.json`), redact(value));
  }
  async close(): Promise<void> {
    const failures: string[] = [];
    for (const [label, fn] of [
      ['process', async () => this.process?.stop()],
      ['gateway', async () => this.gateway.close()],
      ['agent', async () => this.agent.close()],
      [
        'database',
        async () => {
          if (this.database) await this.cluster.dropDatabase(this.database);
        },
      ],
    ] as const)
      try {
        await fn();
      } catch (error) {
        failures.push(`${label}: ${String(error)}`);
      }
    await this.evidence('fixture-cleanup', { failures });
    if (failures.length) throw new Error(`夹具环境清理失败: ${failures.join('; ')}`);
  }
}
