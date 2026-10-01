import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import type { ProviderObservationClient, ProviderSnapshot } from './provider-observation.js';
import { constants } from 'node:fs';
import { open, readFile, lstat, readdir, realpath, chmod, writeFile, link, symlink, rm } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { PreparationBlocked, type Evidence, type Json, type ProviderCall, type ProviderDriver, type UsageContract, type UsageRecord } from '../contracts/media-provider.js';
import { parseUsageJsonl, USAGE_FIELDS } from './backend-oracles.js';
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
export interface ProviderUsageHost {
  sessionDirectory: string; resourceRoot: string; options: Record<string, Json>;
  stopGracefully(): Promise<{ code: number | null; signal: string | null; evidence: Evidence }>;
  start(): Promise<Evidence>;
  logs(): Promise<string[]>;
  evidence?(name:string,value:unknown):Promise<void>;
  observation?: ProviderObservationClient; initialObservation?: ProviderSnapshot;
}
export class ProviderUsageFiles {
  private recoveredAfter: number | null = null;
  constructor(readonly host: () => ProviderUsageHost, readonly calls: () => Promise<ProviderCall[]>, readonly contractReference: string) {}
  contract(): UsageContract {
    const h = this.host(), options = h.options;
    const observed=h.initialObservation;
    if(!observed)throw new PreparationBlocked('Usage entry profile needs actual process observation');
    const entry=options.usageEntry==='factory'?'factory':'main';
    assert.equal(observed.usage.entry,entry);
    const supplied=entry==='main'||options.factoryUsageSupplied===true;
    const enabled=supplied&&(entry==='factory'||String(options.usageEnabled)!=='false');
    assert.equal(observed.usage.optionsSupplied,supplied);assert.equal(observed.usage.configuredEnabled,enabled);
    return { reference: this.contractReference, rawAllowedFields: [...USAGE_FIELDS], maximumRecords: Number(options.usageMaxRecords ?? 1000), maximumBytes: Number(options.usageMaxBytes ?? 2097152), maximumAgeDays: Number(options.usageMaxAgeDays ?? 30), enabled, entry, configurationEvidence: proof('provider:actual-usage-launch-config', {options,observed}) };
  }
  private observer(): ProviderObservationClient { const o=this.host().observation;if(!o)throw new PreparationBlocked('Actual usage observation is not connected');return o; }
  async usageObservation() { const snapshot=await this.observer().snapshot();return {snapshot,evidence:proof('provider:usage-observation',snapshot)}; }
  async holdUsageWrites(): ReturnType<ProviderDriver['holdUsageWrites']> { return this.observer().hold(); }
  async usageQueue(): ReturnType<ProviderDriver['usageQueue']> {
    const snapshot=await this.observer().snapshot(),u=snapshot.usage;
    if(!u.observationEnabled||u.queued===null||u.activeBatch===null||u.dropped===null)throw new PreparationBlocked('Actual queue counters unavailable');
    return {queued:u.queued,activeBatch:u.activeBatch,dropped:u.dropped,diagnosticCodes:u.diagnosticCodes,evidence:proof('provider:actual-usage-queue',snapshot)};
  }

  private async ownedRoot(allowAbsent = false) {
    const h = this.host(), root = await realpath(h.resourceRoot), sessions = await realpath(h.sessionDirectory), rel = relative(root, sessions);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new PreparationBlocked('Usage sessions directory is not owned');
    const dir = join(sessions, 'usage');
    try { const st = await lstat(dir); if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid?.()) throw new PreparationBlocked('Unsafe usage directory'); }
    catch (error) { if (!(allowAbsent && (error as NodeJS.ErrnoException).code === 'ENOENT')) throw error; }
    return dir;
  }
  async usage(): ReturnType<ProviderDriver['usage']> {
    const root = await this.ownedRoot(true), path = join(root, 'usage.jsonl'); let bytes: Buffer;
    try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.size > 16777216) throw new PreparationBlocked('Unsafe or out-of-contract usage file'); bytes = await readFile(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; bytes = Buffer.alloc(0); }
    const raw = parseUsageJsonl(bytes);
    const records = raw.map((row): UsageRecord => {
      const tokens = Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens'].filter((key) => row[key] !== null).map((key) => [key, row[key]]));
      return { serviceCallId: String(row.attemptId), requestId: String(row.requestId), attemptId: String(row.attemptId), runId: row.runId as string | null, stage: String(row.stage), errorCode: row.errorCode as string | null, observedAt: String(row.observedAt), purpose: row.purpose as 'turn' | 'audit', model: String(row.model), elapsedMs: Number(row.elapsedMs), outcome: String(row.outcome), usage: Object.keys(tokens).length ? tokens as Record<string, number> : null, raw: row as Json };
    });
    return { records, actualBytes: bytes.byteLength, evidence: proof('provider:actual-usage-file', { path, bytes: bytes.byteLength, records: raw, callIdNormalization: 'local attemptId; not upstream identity' }) };
  }
  async usageFiles(): ReturnType<ProviderDriver['usageFiles']> {
    const root = await this.ownedRoot(true); let files: string[];
    try { files = (await readdir(root)).map((name) => join(root, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; files = []; }
    return { root, files, evidence: proof('provider:usage-files', { root, files }) };
  }
  async settleUsage(): ReturnType<ProviderDriver['settleUsage']> {
    const host = this.host();let snapshot=await this.observer().snapshot();
    const deadline=performance.now()+10000;
    while(snapshot.usage.queued!==0||snapshot.usage.activeBatch!==0) {
      if(performance.now()>=deadline)throw new PreparationBlocked('Real writer did not settle in finite QA observation window');
      await new Promise(r=>setTimeout(r,25));snapshot=await this.observer().snapshot();
    }
    const stopped = await host.stopGracefully();
    if (stopped.code !== 0 || stopped.signal !== null) throw new PreparationBlocked('Usage drain lacks genuine graceful exit 0');
    const value=await this.usage(),calls=await this.calls();
    if(snapshot.usage.dropped===null)throw new PreparationBlocked('No actual dropped counter');
    const evidence=proof('provider:graceful-usage-drain',{stopped,snapshot,actualFile:value,actualInferenceCalls:calls.length,pendingAfterActualExit:0,accounting:'dropped is actual process counter, not inferred from file retention or previous processes'});
    await host.start();
    return {dropped:snapshot.usage.dropped,queued:0,activeBatch:0,evidence};
  }

  async installUsageAgeFixture(remainingMs:number):ReturnType<ProviderDriver['installUsageAgeFixture']>{
    if(!Number.isFinite(remainingMs)||remainingMs < -86400000||remainingMs>10000)throw new PreparationBlocked('Usage age input must be a bounded explicit fixture');
    const host=this.host(),stopped=await host.stopGracefully();assert.equal(stopped.code,0);assert.equal(stopped.signal,null);
    const root=await this.ownedRoot(),path=join(root,'usage.jsonl'),stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||stat.nlink!==1||(stat.mode&0o777)!==0o600)throw new PreparationBlocked('Age input requires stopped owned private single-link usage file');
    const original=await readFile(path),rows=parseUsageJsonl(original);if(!rows.length)throw new PreparationBlocked('Age input requires a genuinely generated prior record');
    const began=Date.now(),maximumAgeDays=Number(host.options.usageMaxAgeDays??30),observedAt=new Date(began-maximumAgeDays*86400000+remainingMs).toISOString(),oldestEligibleRecordId=String(rows[0]!.attemptId);
    const changed=rows.map((row,i)=>i===0?{...row,observedAt}:row),bytes=Buffer.from(changed.map(row=>JSON.stringify(row)).join('\n')+'\n');
    await host.evidence?.('usage-age-original-before-fixture',{path,stopped,originalRows:rows,originalSha256:createHash('sha256').update(original).digest('hex')});
    const file=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);try{const opened=await file.stat();assert.equal(opened.ino,stat.ino);assert.equal(opened.uid,stat.uid);await file.truncate(0);await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    assert.deepEqual(await readFile(path),bytes);
    const expiresAt=new Date(Date.parse(observedAt)+maximumAgeDays*86400000).toISOString();
    const evidence=proof('provider:explicit-stopped-private-usage-age-input',{path,oldestEligibleRecordId,observedAt,expiresAt,maximumAgeDays,remainingMs,fixtureInstalledAt:new Date().toISOString(),originalRows:rows,fixtureRows:changed,inode:stat.ino,uid:stat.uid,writes:['one usage record observedAt'],systemClockChanged:false,priorModelActuallyOccurredAtFixtureTime:false,layer:'persistent telemetry retention input, not model billing history'});
    await host.evidence?.('usage-age-fixture-installed',evidence);return {oldestEligibleRecordId,expiresAt,evidence};
  }
  async usageTemporaryCleanup(): ReturnType<ProviderDriver['usageTemporaryCleanup']> {
    const host=this.host(),root=await this.ownedRoot(),beforeUsage=await this.usage(),results:unknown[]=[],errors:unknown[]=[];
    for(const kind of ['safe','unrelated','wide','hardlink','symlink'] as const){
      const stopped=await host.stopGracefully();assert.equal(stopped.code,0);assert.equal(stopped.signal,null);
      const lock=join(host.sessionDirectory,'owner.lock');await assert.rejects(lstat(lock),{code:'ENOENT'});
      const primary=join(root,kind==='unrelated'?`qa-unrelated-${randomUUID()}.tmp`:`usage-${randomUUID()}.tmp`),sentinel=Buffer.from(`qa-private-temp-${randomUUID()}`);
      const secondary=join(root,`qa-link-source-${randomUUID()}.tmp`),owned=new Map<string,{ino:number;uid:number}>();
      const remember=async(path:string)=>{const st=await lstat(path);owned.set(path,{ino:st.ino,uid:st.uid});};
      let primaryError:unknown;
      try {
        if(kind==='hardlink'||kind==='symlink'){
          await writeFile(secondary,sentinel,{flag:'wx',mode:0o600});await remember(secondary);
          if(kind==='hardlink')await link(secondary,primary);else await symlink(secondary,primary);
        }else await writeFile(primary,sentinel,{flag:'wx',mode:0o600});
        await remember(primary);if(kind==='wide')await chmod(primary,0o644);
        const before=await lstat(primary);await host.start();
        let after:{exists:boolean;inode?:number;uid?:number;bytesSha256?:string};
        try{const st=await lstat(primary),bytes=await readFile(primary);after={exists:true,inode:st.ino,uid:st.uid,bytesSha256:createHash('sha256').update(bytes).digest('hex')};}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;after={exists:false};}
        const value={kind,stopped,primary,before:{inode:before.ino,uid:before.uid,mode:before.mode&0o777,nlink:before.nlink,symlink:before.isSymbolicLink()},after,sentinelSha256:createHash('sha256').update(sentinel).digest('hex'),observation:await this.observer().snapshot()};
        results.push(value);await host.evidence?.(`usage-temporary-cleanup-${kind}`,value);
        assert.equal(after.exists,kind!=='safe','only owned private single-link UUID temporary is eligible');
        if(after.exists){assert.equal(after.inode,before.ino);assert.equal(after.bytesSha256,value.sentinelSha256);}
        assert.deepEqual((await this.usage()).records,beforeUsage.records,'temporary cleanup preserves retained usage');assert.ok((await lstat(lock)).isFile());
      } catch(error) {primaryError=error;await host.evidence?.(`usage-temporary-${kind}-failure`,{error:String(error)});} finally {
        try {
        // Remove only the exact inodes QA created, with the writer stopped.
        await host.stopGracefully();
        for(const [path,prior] of owned){try{const st=await lstat(path);if(st.ino!==prior.ino||st.uid!==prior.uid)throw new PreparationBlocked('QA temp cleanup inode/owner changed');await rm(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
        await host.start();
        }catch(error){await host.evidence?.(`usage-temporary-${kind}-cleanup-failure`,{error:String(error)});if(!primaryError)primaryError=error;}
      }
      if(primaryError)errors.push(primaryError);
    }
    if(errors.length)throw errors.find(error=>!(error instanceof PreparationBlocked))??errors[0];
    return {evidence:proof('provider:actual-stopped-owner-temp-cleanup',{results,retainedRecords:beforeUsage.records})};
  }

  async usageWriteFault(): ReturnType<ProviderDriver['usageWriteFault']> {
    const dir = await this.ownedRoot(), before = await lstat(dir); let restored = false;
    await chmod(dir, 0o500);
    return { restore: async () => { if (!restored) { restored = true; await chmod(dir, before.mode & 0o777); this.recoveredAfter = Date.now(); } }, observed: async () => {
      const deadline = performance.now() + 5000;
      do { const lines = await this.host().logs(); if (lines.some((line) => /USAGE_WRITE_FAILED|USAGE_STORE_UNAVAILABLE/.test(line))) return proof('provider:actual-usage-write-fault', { dir, installedMode: '0500', originalMode: before.mode & 0o777, lines }); await new Promise((resolve) => setTimeout(resolve, 30)); } while (performance.now() < deadline);
      throw new PreparationBlocked('Owned directory fault did not cause an observed actual usage write failure');
    } };
  }
  async diagnostics(): ReturnType<ProviderDriver['diagnostics']> {
    const lines = await this.host().logs(), usage = await this.usage();
    const failureObserved = lines.some((line) => /USAGE_WRITE_FAILED|USAGE_STORE_UNAVAILABLE|USAGE_QUEUE_FULL/.test(line));
    const recovered = this.recoveredAfter !== null && usage.records.some((r) => Date.parse(r.observedAt) >= this.recoveredAfter!);
    const raw = { lines, recoveredAfter: this.recoveredAfter, recoveredObservedByActualRecord: recovered } as Json;
    return { failureObserved, recovered, raw, evidence: proof('provider:usage-diagnostics', raw) };
  }
}
