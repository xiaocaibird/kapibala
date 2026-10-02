import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readProviderEgress, type ProviderEgressBinding } from './provider-egress.js';
import { ProviderObservationClient, OBSERVATION_PROTOCOL, type ProviderSnapshot } from './provider-observation.js';
import { QaEnvironment } from '../../harness/environment.js';
import type { OwnedDatabaseCluster } from '../../harness/database.js';
import type { Command, TargetConfig } from '../../harness/types.js';
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
  readonly egressLedgers: string[] = [];
  readonly egressBindings = new Map<string, { endpoints: {host:string;port:number}[]; preloadSha256:string; pids?:number[] }>();
  protected override async applicationLaunch(command: Command, env: NodeJS.ProcessEnv) {
    if (this.mediaOptions.egress !== true) return { command, env };
    const directory = resolve(this.outputDir, 'egress'); await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = resolve(directory, `${randomUUID()}.ndjson`); this.egressLedgers.push(path);
    const endpoints = [env.GATEWAY_URL, env.AGENT_URL, env.DATABASE_URL].map(value => { if (!value) throw new Error('Missing owned endpoint for egress'); const u = new URL(value); if (!['127.0.0.1','::1'].includes(u.hostname) || !u.port) throw new Error('Non-owned egress endpoint'); return { host: u.hostname, port: Number(u.port) }; });
    this.egressBindings.set(path,{endpoints,preloadSha256:createHash('sha256').update(await readFile(resolve(this.config.sut.cwd,'scripts/qa-egress-observation.mjs'))).digest('hex')});
    if (command.command !== process.execPath) throw new Error('Egress preload requires the exact reviewed Node executable');
    return { command: { command: command.command, args: ['--import','./scripts/qa-egress-observation.mjs', ...command.args] }, env: { ...env, QA_EGRESS_OBSERVATION:'true', QA_EGRESS_MODE:'strict', QA_EGRESS_LEDGER_PATH:path, QA_EGRESS_ALLOWED_ENDPOINTS:JSON.stringify(endpoints) } };
  }
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
      ...(this.mediaOptions.maxBytes === undefined ? {} : { MEDIA_MAX_BYTES:String(this.mediaOptions.maxBytes) }),
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
    if (this.mediaOptions.egress === true) { const path=this.egressLedgers.at(-1)!; const identity=await actualListenerIdentity(this.api.baseUrl); this.egressBindings.get(path)!.pids=identity.map(v=>v.pid); await this.evidence("egress-owned-binding",{path,identity,expected:this.egressBindings.get(path)}); }
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
  private observationSerial = 0;
  readonly providerEgressBindings:ProviderEgressBinding[]=[];
  private readonly observationToken = randomBytes(32).toString('hex');
  observation?: ProviderObservationClient;
  initialObservation?: ProviderSnapshot;
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
  async start(options: { usageEnabled?: boolean; factoryUsageSupplied?: boolean } = {}) {
    await requireAuthorization(this.target);
    if(this.process) throw new Error('Provider already owned');
    Object.assign(this.options, options);
    await mkdir(this.runtimeDirectory,{recursive:true,mode:0o700});
    await mkdir(this.sessionDirectory,{recursive:true,mode:0o700});
    const log=resolve(this.outputDirectory,`provider-${++this.generation}.log`);
    const env: Record<string,string>={QA_GEMINI_OFFLINE:'true',QA_GEMINI_PROVIDER_URL:this.providerOrigin,
      QA_GEMINI_SESSION_DIR:this.sessionDirectory, QA_GEMINI_USAGE_ENTRY:String(this.options.usageEntry??'main'),
      QA_GEMINI_USAGE_OBSERVATION:'true', QA_GEMINI_TRANSPORT_OBSERVATION:'true', QA_ACCEPTANCE_RESOURCE_TOKEN:this.observationToken,
      ...(this.options.usageEntry==='factory'?{QA_GEMINI_FACTORY_USAGE:String(this.options.factoryUsageSupplied===true)}:{})};
    for (const [key, variable] of Object.entries({usageEnabled:'GEMINI_USAGE_ENABLED',usageMaxRecords:'GEMINI_USAGE_MAX_RECORDS',usageMaxBytes:'GEMINI_USAGE_MAX_BYTES',usageMaxAgeDays:'GEMINI_USAGE_MAX_AGE_DAYS'})) {
      const value=key==='usageEnabled' && options.usageEnabled!==undefined ? options.usageEnabled : this.options[key];
      if(value!==undefined) env[variable]=String(value);
    }
    const args=['--import','tsx','scripts/qa-gemini-agent.ts'];
    let egress:ProviderEgressBinding|undefined;
    if(this.options.transportEgress===true){
      const path=resolve(this.outputDirectory,`provider-egress-${this.generation}.ndjson`),endpoints=[{host:'127.0.0.1',port:Number(new URL(this.providerOrigin).port)}];
      const preloadSha256=createHash('sha256').update(await readFile(resolve(this.target.sut.cwd,'scripts/qa-egress-observation.mjs'))).digest('hex');
      Object.assign(env,{QA_EGRESS_OBSERVATION:'true',QA_EGRESS_MODE:'strict',QA_EGRESS_LEDGER_PATH:path,QA_EGRESS_ALLOWED_ENDPOINTS:JSON.stringify(endpoints)});
      args.unshift('--import','./scripts/qa-egress-observation.mjs');egress={path,preloadSha256,endpoints,pids:[]};this.providerEgressBindings.push(egress);
    }
    this.process=new OwnedProcess({command:process.execPath,args},
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
      if(egress)egress.pids=this.identities.map(i=>i.pid);
      const descriptor=ready.observation as Record<string,unknown>|undefined;
      if(!descriptor || descriptor.protocol!==OBSERVATION_PROTOCOL || descriptor.basePath!=='/qa/usage/v1' || typeof descriptor.instanceId!=='string' || descriptor.usageEnabled!==true || descriptor.transportEnabled!==true) throw new Error('Delivered observation descriptor missing or incompatible');
      this.observation=new ProviderObservationClient(this.address,this.observationToken,descriptor.instanceId,this.identities.map(i=>i.pid),async(name,value)=>{await writeFile(resolve(this.outputDirectory,`${++this.observationSerial}-${name}-generation-${this.generation}.json`),redact(value));});
      this.initialObservation=await this.observation.snapshot();
      await writeFile(resolve(this.outputDirectory,`provider-identity-${this.generation}.json`),redact({ready,identities:this.identities,guardianPid:this.process.pid}));
    } catch(error) {
      try { await this.process.stop(); this.process=undefined; }
      catch(cleanup) { throw new AggregateError([error,cleanup],'Provider startup failed and owned cleanup remains incomplete'); }
      throw error;
    }
  }
  async stop(mode: 'SIGTERM'|'SIGKILL'='SIGTERM') {
    if(this.process) {
      const owner=this.process;
      try { if(mode==='SIGKILL') await owner.killApplication(); }
      finally { await owner.stop('SIGTERM'); this.lastStopOutcome=owner.exitOutcome; this.process=undefined;const binding=this.providerEgressBindings.at(-1);if(binding&&this.lastStopOutcome)binding.exit=this.lastStopOutcome; }
    }
    return this.lastStopOutcome;
  }
  async egress(requireExit=false){return readProviderEgress(this.providerEgressBindings,requireExit);}
  async restart(mode:'SIGTERM'|'SIGKILL',options?:{usageEnabled?:boolean;factoryUsageSupplied?:boolean}) {
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
