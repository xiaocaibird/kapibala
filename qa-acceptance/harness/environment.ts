import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GatewaySimulator } from './gateway.js';
import { AgentSimulator } from './agent.js';
import { PlatformClient } from './platform-client.js';
import { OwnedDatabaseCluster } from './database.js';
import { availablePort, DatabaseProxy, BrowserProxy } from './network.js';
import { OwnedProcess, isolatedEnv, waitHttp } from './process.js';
import { redact, requireAuthorization } from './security.js';
import type { TargetConfig, Command } from './types.js';

export class QaEnvironment {
  readonly gateway = new GatewaySimulator();
  readonly agent = new AgentSimulator();
  api!: PlatformClient;
  webUrl = '';
  private readonly resourceToken = randomUUID();
  private database = '';
  private apiPort = 0;
  private webPort = 0;
  private proxy?: DatabaseProxy;
  private webProxy?: BrowserProxy;
  private server?: OwnedProcess;
  private second?: OwnedProcess;
  private web?: OwnedProcess;
  private startedAt = '';
  private disposed = false;
  private closing?: Promise<void>;
  private apiWrites = Promise.resolve();
  constructor(
    readonly config: TargetConfig,
    private readonly cluster: OwnedDatabaseCluster,
    readonly outputDir: string,
  ) {}
  private command(c: Command, port = this.apiPort): Command {
    return {
      command: c.command,
      args: c.args.map((x) =>
        x.replaceAll('{WEB_PORT}', String(this.webPort)).replaceAll('{API_PORT}', String(port)),
      ),
    };
  }
  private env(port = this.apiPort): NodeJS.ProcessEnv {
    return isolatedEnv({
      ...this.config.sut.env,
      QA_ACCEPTANCE_RESOURCE_TOKEN: this.resourceToken,
      PORT: String(port),
      DATABASE_URL: this.cluster.url(this.database, this.proxy!.port),
      GATEWAY_URL: this.gateway.url,
      AGENT_URL: this.agent.url,
    });
  }
  readonly recordHttp = async (entry: Record<string, unknown>): Promise<void> => {
    this.apiWrites = this.apiWrites.then(async () => {
      await mkdir(this.outputDir, { recursive: true });
      await appendFile(
        resolve(this.outputDir, 'api.ndjson'),
        JSON.stringify(JSON.parse(redact(entry))) + '\n',
      );
    });
    await this.apiWrites;
  };
  get allowedBrowserOrigins(): string[] {
    return [
      this.webUrl,
      `http://127.0.0.1:${this.webPort}`,
      `http://127.0.0.1:${this.apiPort}`,
    ].filter(Boolean);
  }
  ownedStorage(): { cluster: OwnedDatabaseCluster; database: string } {
    if (!this.cluster.ownsDatabase(this.database))
      throw new Error('当前用例没有已确认归属的数据库');
    return { cluster: this.cluster, database: this.database };
  }
  capacityControlTarget(): { apiUrl: string; revision: string; pid: number; ownerToken: string } {
    this.server?.assertRunning();
    if (!this.server?.pid) throw new Error('没有本轮可绑定的被测进程');
    return {
      apiUrl: this.api.baseUrl,
      revision: this.config.sut.revision,
      pid: this.server.pid,
      ownerToken: this.resourceToken,
    };
  }
  async initialize(): Promise<void> {
    if (this.disposed || this.database) throw new Error('环境不可重复初始化');
    await requireAuthorization(this.config);
    await mkdir(this.outputDir, { recursive: true });
    try {
      this.database = await this.cluster.createDatabase();
      this.proxy = new DatabaseProxy(this.cluster.port);
      await this.proxy.start();
      await this.gateway.start();
      await this.agent.start();
      this.apiPort = await availablePort();
      this.webPort = await availablePort();
      this.api = new PlatformClient(`http://127.0.0.1:${this.apiPort}`, {
        recorder: this.recordHttp,
      });
      await this.migrate();
      await this.start();
      const discovery = await new PlatformClient(this.api.baseUrl, {
        recorder: this.recordHttp,
      }).login();
      this.gateway.seedAccounts((await discovery.accounts()).map((account) => account.id));
      await discovery.post('/api/auth/logout');
      this.startedAt = new Date().toISOString();
      await this.evidence('environment', {
        revision: this.config.sut.revision,
        cwd: this.config.sut.cwd,
        apiPort: this.apiPort,
        database: this.database,
        databaseImage: this.cluster.image,
        gateway: this.gateway.url,
        agent: this.agent.url,
        startedAt: this.startedAt,
        commands: this.config.sut,
      });
    } catch (e) {
      try {
        await this.close();
      } catch (cleanup) {
        throw new AggregateError([e, cleanup], 'QA初始化及清理均失败');
      }
      throw e;
    }
  }
  async migrate(): Promise<void> {
    await requireAuthorization(this.config);
    await new OwnedProcess(
      this.command(this.config.sut.migrate),
      this.config.sut.cwd,
      this.env(),
      resolve(this.outputDir, 'migration.log'),
    ).runOnce();
  }
  async start(): Promise<void> {
    await requireAuthorization(this.config);
    if (this.server) throw new Error('服务已启动；须先停止');
    this.server = new OwnedProcess(
      this.command(this.config.sut.start),
      this.config.sut.cwd,
      this.env(),
      resolve(this.outputDir, 'server.log'),
    );
    await this.server.start();
    await waitHttp(
      `http://127.0.0.1:${this.apiPort}/api/health`,
      this.config.sut.startupTimeoutMs,
      this.server,
    );
  }
  async kill(): Promise<void> {
    await this.evidence(`kill-${Date.now()}`, {
      at: new Date().toISOString(),
      pid: this.server?.pid,
    });
    await this.server?.stop('SIGKILL');
    this.server = undefined;
  }
  async restart(): Promise<void> {
    await this.kill();
    await this.start();
  }
  async startSecondInstance(): Promise<PlatformClient> {
    await requireAuthorization(this.config);
    if (this.second) throw new Error('第二实例已启动');
    const port = await availablePort();
    this.second = new OwnedProcess(
      this.command(this.config.sut.start, port),
      this.config.sut.cwd,
      this.env(port),
      resolve(this.outputDir, 'server-2.log'),
    );
    await this.second.start();
    await waitHttp(
      `http://127.0.0.1:${port}/api/health`,
      this.config.sut.startupTimeoutMs,
      this.second,
    );
    return new PlatformClient(`http://127.0.0.1:${port}`, { recorder: this.recordHttp });
  }
  async stopSecondInstance(): Promise<void> {
    await this.second?.stop();
    this.second = undefined;
  }
  async interruptDatabase(): Promise<void> {
    this.proxy!.interrupt();
    await this.evidence(`database-outage-${Date.now()}`, { at: new Date().toISOString() });
  }
  async restoreDatabase(): Promise<void> {
    this.proxy!.restore();
    await this.evidence(`database-restored-${Date.now()}`, { at: new Date().toISOString() });
  }
  async startWeb(): Promise<string> {
    await requireAuthorization(this.config);
    if (this.webUrl) return this.webUrl;
    this.web = new OwnedProcess(
      this.command(this.config.sut.web),
      this.config.sut.cwd,
      this.env(),
      resolve(this.outputDir, 'web.log'),
    );
    await this.web.start();
    await waitHttp(`http://127.0.0.1:${this.webPort}`, this.config.sut.startupTimeoutMs, this.web);
    this.webProxy = new BrowserProxy(
      this.apiPort,
      this.webPort,
      Object.values(this.config.ui.routes),
    );
    await this.webProxy.start();
    this.webUrl = this.webProxy.url;
    return this.webUrl;
  }
  async evidence(name: string, value: unknown): Promise<void> {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('非法证据文件名');
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(resolve(this.outputDir, `${name}.json`), redact(value));
  }
  async close(): Promise<void> {
    if (this.disposed) return;
    if (this.closing) return this.closing;
    this.closing = this.closeResources();
    try {
      await this.closing;
      this.disposed = true;
    } finally {
      this.closing = undefined;
    }
  }
  private async closeResources(): Promise<void> {
    const failures: string[] = [];
    const attempt = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        failures.push(`${label}: ${String(e)}`);
      }
    };
    await attempt('snapshot', () =>
      this.evidence('external-facts', {
        gateway: this.gateway.snapshot(),
        agent: this.agent.snapshot(),
      }),
    );
    await attempt('browser proxy', async () => this.webProxy?.close());
    await attempt('web', async () => this.web?.stop());
    await attempt('second instance', () => this.stopSecondInstance());
    await attempt('server', async () => this.server?.stop());
    await attempt('gateway', () => this.gateway.close());
    await attempt('agent', () => this.agent.close());
    await attempt('db proxy', async () => this.proxy?.close());
    if (this.database)
      await attempt('database', async () => {
        await this.cluster.dropDatabase(this.database);
        this.database = '';
      });
    await attempt('HTTP evidence', () => this.apiWrites);
    await this.evidence('cleanup', { completedAt: new Date().toISOString(), failures });
    if (failures.length) throw new Error(`QA资源清理失败: ${failures.join('; ')}`);
  }
}
