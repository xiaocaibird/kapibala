import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';
import { exec, isolatedEnv } from './process.js';
import { BlockedError, redact } from './security.js';

export function ownedDatabaseName(name: string): boolean {
  return /^qa_[a-f0-9]{24}$/.test(name);
}
export class OwnedDatabaseCluster {
  readonly owner = randomUUID();
  readonly name = `qa-acceptance-${this.owner}`;
  readonly password = randomUUID();
  port = 0;
  private attempted = false;
  private ready = false;
  private id = '';
  private databases = new Set<string>();
  constructor(readonly image: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(image)) throw new Error('非法隔离数据库镜像');
  }
  private docker(args: string[], timeout = 15000) {
    return exec('docker', ['--host', 'unix:///var/run/docker.sock', ...args], {
      timeout,
      env: isolatedEnv({}),
    });
  }
  url(database = 'postgres', port = this.port): string {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('数据库尚无已确认的独立端口');
    if (database !== 'postgres' && !ownedDatabaseName(database))
      throw new Error('拒绝生成非QA数据库地址');
    return `postgres://qa:${this.password}@127.0.0.1:${port}/${database}`;
  }
  private async inspect(): Promise<{
    Id: string;
    Config: { Labels: Record<string, string> };
    State: { Running: boolean };
    NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[]> };
  }> {
    return JSON.parse((await this.docker(['inspect', this.name])).stdout)[0];
  }
  private async assertOwned(): Promise<void> {
    if (!this.ready) throw new Error('隔离数据库未完成初始化');
    const info = await this.inspect();
    const ports = info.NetworkSettings.Ports['5432/tcp'];
    if (
      info.Id !== this.id ||
      info.Config.Labels['qa.owner'] !== this.owner ||
      !info.State.Running ||
      ports?.length !== 1 ||
      ports[0]?.HostIp !== '127.0.0.1' ||
      Number(ports[0]?.HostPort) !== this.port
    )
      throw new Error('隔离数据库所有权或端口已变化，禁止连接');
  }
  async start(): Promise<void> {
    if (this.attempted) throw new Error('数据库容器已经启动或尚未清理');
    this.attempted = true;
    try {
      const result = await this.docker(
        [
          'create',
          '--name',
          this.name,
          '--label',
          `qa.owner=${this.owner}`,
          '--publish',
          '127.0.0.1::5432',
          '--env',
          `POSTGRES_PASSWORD=${this.password}`,
          '--env',
          'POSTGRES_USER=qa',
          '--env',
          'POSTGRES_DB=postgres',
          this.image,
        ],
        120000,
      );
      this.id = result.stdout.trim();
      if (!/^[a-f0-9]{64}$/.test(this.id)) throw new Error('未取得独立容器ID');
      await this.docker(['start', this.id]);
      const info = await this.inspect();
      const ports = info.NetworkSettings.Ports['5432/tcp'];
      if (
        info.Id !== this.id ||
        info.Config.Labels['qa.owner'] !== this.owner ||
        ports?.length !== 1 ||
        ports[0]?.HostIp !== '127.0.0.1'
      )
        throw new Error('数据库必须绑定唯一loopback随机端口');
      this.port = Number(ports[0].HostPort);
      this.ready = true;
      await this.assertOwned();
      const until = performance.now() + 45000;
      while (performance.now() < until) {
        const client = new Client({
          connectionString: this.url(),
          connectionTimeoutMillis: 800,
          query_timeout: 1000,
        });
        try {
          await client.connect();
          await client.query('SELECT 1');
          return;
        } catch {
          await sleep(200);
        } finally {
          await client.end().catch(() => {});
        }
      }
      throw new Error('专用PostgreSQL启动超时');
    } catch (error) {
      let cleanup = '';
      try {
        await this.close();
      } catch (e) {
        cleanup = `；清理失败 ${redact(String(e))}`;
      }
      throw new BlockedError(
        `隔离数据库不可用（只使用本机unix Docker socket）: ${redact(error instanceof Error ? error.message : String(error))}${cleanup}`,
      );
    }
  }
  ownsDatabase(name: string): boolean {
    return this.ready && ownedDatabaseName(name) && this.databases.has(name);
  }
  async createDatabase(): Promise<string> {
    await this.assertOwned();
    const name = `qa_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const client = new Client({
      connectionString: this.url(),
      connectionTimeoutMillis: 2000,
      query_timeout: 15000,
    });
    // Register intent first: a lost CREATE response must not orphan an untracked database.
    this.databases.add(name);
    try {
      await client.connect();
      await client.query(`CREATE DATABASE "${name}"`);
      return name;
    } finally {
      await client.end().catch(() => {});
    }
  }
  async dropDatabase(name: string): Promise<void> {
    if (!ownedDatabaseName(name) || !this.databases.has(name))
      throw new Error('拒绝删除未由本对象创建的数据库');
    await this.assertOwned();
    const client = new Client({
      connectionString: this.url(),
      connectionTimeoutMillis: 2000,
      query_timeout: 15000,
    });
    try {
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      this.databases.delete(name);
    } finally {
      await client.end().catch(() => {});
    }
  }
  async close(): Promise<void> {
    if (!this.attempted) return;
    let info: Awaited<ReturnType<OwnedDatabaseCluster['inspect']>>;
    try {
      info = await this.inspect();
    } catch (e) {
      if (/No such (?:object|container)/i.test(String(e))) {
        this.attempted = false;
        this.ready = false;
        return;
      }
      throw e;
    }
    if (info.Config.Labels['qa.owner'] !== this.owner || (this.id && info.Id !== this.id))
      throw new Error('拒绝清理owner或ID不匹配的容器');
    // PostgreSQL images may create an anonymous data volume. Remove only volumes
    // attached to this verified owned container; Docker retains named volumes.
    await this.docker(['rm', '--force', '--volumes', info.Id]);
    this.attempted = false;
    this.ready = false;
    this.databases.clear();
    this.port = 0;
  }
}
