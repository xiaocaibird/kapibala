import { spawn } from 'node:child_process';
import { constants, createReadStream } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { QaEnvironment } from './environment.js';
import { OwnedProcess, exec, isolatedEnv, waitHttp } from './process.js';
import { availablePort } from './network.js';
import { PlatformClient } from './platform-client.js';
import { ownedDatabaseName } from './database.js';
import { redact } from './security.js';
import type { Command } from './types.js';

const dockerHost = ['--host', 'unix:///var/run/docker.sock'];
interface Owner {
  owner: string;
  port: number;
  ownsDatabase: (database: string) => boolean;
}
interface ContainerInspection {
  Id: string;
  Config: { Labels: Record<string, string> };
  State: { Running: boolean };
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[]> };
}

/** Pure preflight: bind immutable container identity, loopback port and an owned DB. */
export function databaseToolCommand(
  owner: Owner,
  inspected: ContainerInspection,
  database: string,
  operation: 'dump' | 'restore',
): Command {
  const ports = inspected.NetworkSettings.Ports['5432/tcp'];
  if (
    !ownedDatabaseName(database) ||
    !owner.ownsDatabase(database) ||
    !/^[a-f0-9]{64}$/.test(inspected.Id) ||
    inspected.Config.Labels['qa.owner'] !== owner.owner ||
    !inspected.State.Running ||
    ports?.length !== 1 ||
    ports[0]?.HostIp !== '127.0.0.1' ||
    Number(ports[0]?.HostPort) !== owner.port
  )
    throw new Error('拒绝对归属、容器ID、端口或名称不符的数据库进行备份/恢复');
  // Explicit Unix socket prevents PGHOST/PGSERVICE in the image from redirecting tools remotely.
  const common = ['--host=/var/run/postgresql', '--port=5432', '--username=qa', '--no-password'];
  const tool =
    operation === 'dump'
      ? ['pg_dump', ...common, '--format=custom', '--dbname', database]
      : ['pg_restore', ...common, '--exit-on-error', '--dbname', database];
  return {
    command: 'docker',
    args: [
      ...dockerHost,
      'exec',
      ...(operation === 'restore' ? ['-i'] : []),
      inspected.Id,
      ...tool,
    ],
  };
}

/** Generic streaming helper; self tests use only owned temporary files and Node children. */
export async function transferProcess(
  command: Command,
  file: string,
  direction: 'in' | 'out',
  timeoutMs = 60_000,
): Promise<void> {
  // Open first: missing input/output collision cannot leave a spawned process behind.
  const handle = await open(
    file,
    direction === 'in'
      ? constants.O_RDONLY | constants.O_NOFOLLOW
      : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  const stream = direction === 'in' ? handle.createReadStream() : handle.createWriteStream();
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(command.command, command.args, {
      env: isolatedEnv({}),
      stdio: [
        direction === 'in' ? 'pipe' : 'ignore',
        direction === 'out' ? 'pipe' : 'ignore',
        'pipe',
      ],
    });
  } catch (error) {
    stream.destroy();
    await handle.close().catch(() => {});
    throw error;
  }
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr = (stderr + String(chunk)).slice(-65_536);
  });
  const closed = new Promise<void>((done, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) =>
      code === 0
        ? done()
        : reject(new Error(`QA数据库工具失败(${code ?? signal}): ${redact(stderr)}`)),
    );
  });
  const io =
    direction === 'in'
      ? pipeline(stream as ReturnType<typeof handle.createReadStream>, child.stdin!)
      : pipeline(child.stdout!, stream as ReturnType<typeof handle.createWriteStream>);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([closed, io]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('QA备份/恢复命令超时')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    stream.destroy();
    child.stdin?.destroy();
    child.stdout?.destroy();
    await Promise.allSettled([closed, io]);
    await handle.close().catch(() => {});
  }
}

async function ownedBackupPath(qa: QaEnvironment, path: string, input: boolean): Promise<string> {
  const file = resolve(path);
  if (dirname(file) !== resolve(qa.outputDir))
    throw new Error('备份文件必须直接位于本用例证据目录');
  await realpath(qa.outputDir); // Fixture must already own/create this directory.
  if (input) {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('恢复输入必须为本用例普通备份文件');
  }
  return file;
}
async function databaseCommand(
  qa: QaEnvironment,
  database: string,
  path: string,
  operation: 'dump' | 'restore',
): Promise<void> {
  const { cluster } = qa.ownedStorage();
  if (!cluster.ownsDatabase(database)) throw new Error('拒绝对非本轮数据库进行备份/恢复');
  const file = await ownedBackupPath(qa, path, operation === 'restore');
  const inspected = JSON.parse(
    (
      await exec('docker', [...dockerHost, 'inspect', cluster.name], {
        env: isolatedEnv({}),
        timeout: 15_000,
        maxBuffer: 1_048_576,
      })
    ).stdout,
  )[0] as ContainerInspection;
  await transferProcess(
    databaseToolCommand(cluster, inspected, database, operation),
    file,
    operation === 'dump' ? 'out' : 'in',
  );
}
export async function dumpOwnedDatabase(
  qa: QaEnvironment,
  path: string,
): Promise<{
  sha256: string;
  recoveryPointEarliestAt: string;
  recoveryPointLatestAt: string;
  finishedAt: string;
}> {
  const { database } = qa.ownedStorage();
  const recoveryPointEarliestAt = new Date().toISOString();
  await databaseCommand(qa, database, path, 'dump');
  const finishedAt = new Date().toISOString();
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  // pg_dump does not expose its exact snapshot creation timestamp. Keep an interval.
  return {
    sha256: hash.digest('hex'),
    recoveryPointEarliestAt,
    recoveryPointLatestAt: finishedAt,
    finishedAt,
  };
}

export async function restoreOwnedDatabase(qa: QaEnvironment, path: string): Promise<string> {
  const { cluster } = qa.ownedStorage();
  await ownedBackupPath(qa, path, true);
  const database = await cluster.createDatabase();
  try {
    await databaseCommand(qa, database, path, 'restore');
    return database;
  } catch (error) {
    try {
      await cluster.dropDatabase(database);
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], '恢复失败且独立数据库清理失败');
    }
    throw error;
  }
}
export async function launchOwnedDatabase(
  qa: QaEnvironment,
  database: string,
): Promise<{
  api: PlatformClient;
  process: OwnedProcess;
  close: () => Promise<void>;
  ready: () => Promise<void>;
}> {
  const { cluster } = qa.ownedStorage();
  if (!cluster.ownsDatabase(database)) throw new Error('拒绝启动未持有的数据库');
  const port = await availablePort();
  const command = {
    command: qa.config.sut.start.command,
    args: qa.config.sut.start.args.map((value) => value.replaceAll('{API_PORT}', String(port))),
  };
  const process = new OwnedProcess(
    command,
    qa.config.sut.cwd,
    isolatedEnv({
      ...qa.config.sut.env,
      PORT: String(port),
      DATABASE_URL: cluster.url(database),
      GATEWAY_URL: qa.gateway.url,
      AGENT_URL: qa.agent.url,
    }),
    resolve(qa.outputDir, `drill-${database}.log`),
  );
  try {
    await process.start();
  } catch (error) {
    try {
      await process.stop();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], '探针启动失败且清理失败');
    }
    throw error;
  }
  const api = new PlatformClient(`http://127.0.0.1:${port}`);
  return {
    api,
    process,
    close: () => process.stop(),
    ready: () => waitHttp(`${api.baseUrl}/api/health`, qa.config.sut.startupTimeoutMs, process),
  };
}

/** Every cleanup is attempted even if another resource cannot be released. */
export async function completeCleanup(actions: (() => Promise<unknown>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const action of actions)
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  if (errors.length) throw new AggregateError(errors, '备份/启动演练清理不完整');
}
