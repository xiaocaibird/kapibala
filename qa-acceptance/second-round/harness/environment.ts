import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { QaEnvironment } from '../../harness/environment.js';
import type { OwnedDatabaseCluster } from '../../harness/database.js';
import type { TargetConfig } from '../../harness/types.js';
import { requireAuthorization, redact, isWithin } from '../../harness/security.js';
import { exec, isolatedEnv, OwnedProcess, waitHttp } from '../../harness/process.js';
import { MediaSourceProxy } from './media-source.js';
import type { Json, Ownership } from '../contracts/media-provider.js';

export async function actualListenerIdentity(url: string) {
  const port = Number(new URL(url).port);
  const pids = (await exec('lsof', ['-n', '-P', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {timeout:2000})).stdout.trim().split(/\s+/).map(Number);
  if (!pids.length || pids.some(p => !Number.isSafeInteger(p) || p <= 0)) throw new Error('No actual owned service listener');
  return Promise.all([...new Set(pids)].map(async pid => ({pid,
    process: (await exec('ps', ['-o', 'pid=,ppid=,pgid=,lstart=,command=', '-p', String(pid)], {timeout:2000})).stdout.trim(),
  })));
}

/** Separate resources per case; app restart never resets Gateway or database. */
export class SecondRoundEnvironment extends QaEnvironment {
  readonly mediaDirectory: string;
  mediaSource?: MediaSourceProxy;
  externalAgentUrl?: string;
  constructor(config: TargetConfig, cluster: OwnedDatabaseCluster, output: string,
    readonly runtimeDirectory: string, readonly mediaOptions: Record<string, Json> = {}) {
    super(config, cluster, output);
    this.mediaDirectory = resolve(runtimeDirectory, 'media');
  }
  protected override externalServiceUrls() {
    return { gateway: this.mediaSource?.url || this.gateway.url,
      agent: this.externalAgentUrl || this.agent.url };
  }
  protected override resourceEnvironment() {
    return { MEDIA_DIR: this.mediaDirectory,
      ...(this.mediaOptions.retentionDays === undefined ? {} : { MEDIA_RETENTION_DAYS:String(this.mediaOptions.retentionDays) }),
      // Only polling cadence changes; it is recorded and does not change file age.
      MEDIA_CLEANUP_INTERVAL_MS: '1000' };
  }
  override async initialize() {
    await requireAuthorization(this.config);
    await mkdir(this.runtimeDirectory, {recursive:true, mode:0o700});
    await mkdir(this.mediaDirectory, {mode:0o700});
    return super.initialize();
  }
  override async start() {
    if (!this.mediaSource) {
      this.mediaSource = new MediaSourceProxy(this.gateway.url);
      await this.mediaSource.start();
    }
    await super.start();
  }
  async ownership(contract: 'c1-media-files' | 'c2-gemini-agent'): Promise<Ownership> {
    const identity = await actualListenerIdentity(this.api.baseUrl);
    const raw = { identity, mediaDirectory:await realpath(this.mediaDirectory),
      apiUrl:this.api.baseUrl, gatewayUrl:this.mediaSource?.url, agentUrl:this.externalAgentUrl ?? this.agent.url,
      database:this.ownedStorage().database, revision:this.config.sut.revision };
    await this.evidence('owned-live-identity',raw);
    return { sessionId:this.ownedStorage().database, sutRevision:this.config.sut.revision,
      contractReference:`${this.config.sut.revision}:docs/${contract}.md`, reviewedSourceContracts:[contract],
      resourceRoot:this.runtimeDirectory, applicationPids:identity.map(i=>i.pid),
      endpoints:[this.api.baseUrl, this.mediaSource!.url, this.externalAgentUrl ?? this.agent.url],
      evidence:{reference:resolve(this.outputDir,'owned-live-identity.json'),raw:raw as unknown as Json} };
  }
  override async close() {
    const errors: unknown[] = [];
    try { await super.close(); } catch(e) { errors.push(e); }
    if (this.mediaSource) {
      try { await this.evidence('media-source-ledger',this.mediaSource.snapshot()); } catch(e) { errors.push(e); }
      try { await this.mediaSource.close(); this.mediaSource=undefined; } catch(e) { errors.push(e); }
    }
    if(errors.length) throw new AggregateError(errors,'Second-round owned cleanup failed');
  }
}

/** Runs the delivered real service with its explicit loopback-only transport. */
export class OwnedOfflineProvider {
  readonly sessionId = randomUUID();
  readonly sessionDirectory: string;
  readonly logPath: string;
  private process?: OwnedProcess;
  private generation = 0;
  address = '';
  identities: Awaited<ReturnType<typeof actualListenerIdentity>> = [];
  lastStopOutcome?: { code: number | null; signal: NodeJS.Signals | null };
  constructor(readonly target: TargetConfig, readonly runtimeDirectory: string,
    readonly outputDirectory: string, readonly providerOrigin: string,
    readonly options: Record<string, Json> = {}) {
    this.sessionDirectory=resolve(runtimeDirectory,'sessions');
    this.logPath=resolve(outputDirectory,'provider.log');
    const u=new URL(providerOrigin);
    if(u.protocol!=='http:' || u.hostname!=='127.0.0.1' || !u.port || u.pathname!=='/' || u.search || u.hash || u.username || u.password)
      throw new Error('Offline provider requires an explicit loopback origin');
  }
  async start(options: { usageEnabled?: boolean } = {}) {
    await requireAuthorization(this.target);
    if(this.process) throw new Error('Provider already owned');
    await mkdir(this.runtimeDirectory,{recursive:true,mode:0o700});
    await mkdir(this.sessionDirectory,{recursive:true,mode:0o700});
    const log=resolve(this.outputDirectory,`provider-${++this.generation}.log`);
    const env: Record<string,string>={QA_GEMINI_OFFLINE:'true',QA_GEMINI_PROVIDER_URL:this.providerOrigin,
      QA_GEMINI_SESSION_DIR:this.sessionDirectory};
    for (const [key, variable] of Object.entries({usageEnabled:'GEMINI_USAGE_ENABLED',usageMaxRecords:'GEMINI_USAGE_MAX_RECORDS',usageMaxBytes:'GEMINI_USAGE_MAX_BYTES',usageMaxAgeDays:'GEMINI_USAGE_MAX_AGE_DAYS'})) {
      const value=key==='usageEnabled' && options.usageEnabled!==undefined ? options.usageEnabled : this.options[key];
      if(value!==undefined) env[variable]=String(value);
    }
    this.process=new OwnedProcess({command:process.execPath,args:['--import','tsx','scripts/qa-gemini-agent.ts']},
      this.target.sut.cwd, isolatedEnv(env),log);
    try {
      await this.process.start();
      const until=performance.now()+this.target.sut.startupTimeoutMs;
      let ready: Record<string,unknown>|undefined;
      while(performance.now()<until) {
        this.process.assertRunning();
        let lines:string[]=[]; try {lines=(await readFile(log,'utf8')).split('\n');} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
        for(const line of lines) {try {const row=JSON.parse(line); if(row.event==='qa-gemini-agent-ready') ready=row;} catch {}}
        if(ready) break;
        await new Promise(r=>setTimeout(r,40));
      }
      if(!ready || ready.offline!==true || ready.providerOrigin!==this.providerOrigin ||
        ready.providerTransport!=='loopback-http' || !['synthetic','[REDACTED]'].includes(String(ready.credentialSource)) ||
        ready.sessionDirectory!==this.sessionDirectory || typeof ready.address!=='string')
        throw new Error('Delivered offline entry ready facts incomplete or differ from owned binding');
      this.address=ready.address;
      await waitHttp(`${this.address}/health`,this.target.sut.startupTimeoutMs,this.process);
      this.identities=await actualListenerIdentity(this.address);
      await writeFile(resolve(this.outputDirectory,`provider-identity-${this.generation}.json`),redact({ready,identities:this.identities,guardianPid:this.process.pid}));
    } catch(error) {
      try { await this.process.stop(); this.process=undefined; }
      catch(cleanup) { throw new AggregateError([error,cleanup],'Provider startup failed and owned cleanup remains incomplete'); }
      throw error;
    }
  }
  async stop(mode: 'SIGTERM'|'SIGKILL'='SIGTERM') {
    if(this.process) { await this.process.stop(mode); this.lastStopOutcome=this.process.exitOutcome; this.process=undefined; }
    return this.lastStopOutcome;
  }
  async restart(mode:'SIGTERM'|'SIGKILL',options?:{usageEnabled:boolean}) {
    const beforePid=this.identities[0]?.pid;
    await this.stop(mode);
    try {await this.start(options);return {started:true,beforePid,afterPid:this.identities[0]?.pid};}
    catch(e) {return {started:false,beforePid,error:redact(String(e))};}
  }
  ownership(): Ownership {
    if(!this.identities.length) throw new Error('Provider has no actual listener identity');
    return {sessionId:this.sessionId,sutRevision:this.target.sut.revision,
      contractReference:`${this.target.sut.revision}:docs/qa-offline-model-entry-20261002.md`,
      reviewedSourceContracts:['c2-gemini-agent'],resourceRoot:this.runtimeDirectory,
      applicationPids:this.identities.map(i=>i.pid),endpoints:[this.address,this.providerOrigin],
      evidence:{reference:resolve(this.outputDirectory,`provider-identity-${this.generation}.json`),raw:this.identities as unknown as Json}};
  }
}
