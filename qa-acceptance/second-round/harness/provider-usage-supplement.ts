import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { requireAuthorization, redact } from '../../harness/security.js';
import { isolatedEnv, OwnedProcess, ownedListener, waitHttp } from '../../harness/process.js';
import { C2_CAPABILITIES as P, PreparationBlocked, type ProviderDriver, type UsageRecord } from '../contracts/media-provider.js';
import type { DriverContext } from './driver-factories.js';
import { actualListenerIdentity } from './environment.js';
import { readProviderEgress } from './provider-egress.js';
import { decodeProviderWire } from './provider-wire.js';
import { assertUsageRecord, parseUsageJsonl } from './backend-oracles.js';
import { withOwnedDriver, turnRequest } from '../tests/media-provider.js';
const digest=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function absent(path:string){try{await lstat(path);return false;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return true;throw e;}}

/** These are explicitly synthetic key-file canaries, never the user's .env. */
export function keyFileFixture(foreignSession:string, enabledInFile=false){
  assert.ok(isAbsolute(foreignSession)&&!/[\r\n]/.test(foreignSession));
  return ['GEMINI_API_KEY=qa-offline-synthetic-key',`GEMINI_USAGE_ENABLED=${enabledInFile}`,'GEMINI_USAGE_MAX_RECORDS=0','GEMINI_USAGE_MAX_BYTES=0','GEMINI_USAGE_MAX_AGE_DAYS=0','GEMINI_MODEL=not-a-valid-model','GEMINI_AGENT_PORT=not-a-port',`GEMINI_SESSION_DIR=${foreignSession}`,''].join('\n');
}
/** A real production main startup, with zero valid generation requests. The
 * existing HTTP entry matrix separately exercises valid offline inference.
 * This narrow supplement proves the actual dotenv key-only isolation branch. */
export async function runUsageKeyFileIsolation(context:DriverContext):Promise<void>{
  const errors:unknown[]=[];
  for(const enabled of [true,false]){
    await requireAuthorization(context.target);
    const root=resolve(context.runtimeDir,`key-file-${randomUUID()}`),out=resolve(context.outputDir,`key-file-${enabled}-${randomUUID()}`);
    await mkdir(context.runtimeDir,{recursive:true,mode:0o700});
    await mkdir(root,{recursive:false,mode:0o700});await mkdir(out,{recursive:true,mode:0o700});
    const canonical=await realpath(root),parent=await realpath(context.runtimeDir),rel=relative(parent,canonical);
    if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new PreparationBlocked('Key fixture is not in this run owned runtime');
    const sessions=join(root,'sessions'),foreign=join(root,'key-file-session-sentinel'),keyFile=join(root,'synthetic.env'),ledger=join(out,'egress.ndjson'),log=join(out,'main.log');
    await mkdir(sessions,{mode:0o700});await mkdir(foreign,{mode:0o700});
    const sentinel=join(foreign,'sentinel.txt'),sentinelBytes=Buffer.from(`QA-owned-foreign-configuration-${randomUUID()}`);await writeFile(sentinel,sentinelBytes,{flag:'wx',mode:0o600});
    const keyBytes=Buffer.from(keyFileFixture(foreign,!enabled));await writeFile(keyFile,keyBytes,{flag:'wx',mode:0o600});const keyStat=await lstat(keyFile);
    const env=isolatedEnv({GEMINI_ENV_FILE:keyFile,GEMINI_SESSION_DIR:sessions,GEMINI_AGENT_PORT:'0',...(enabled?{}:{GEMINI_USAGE_ENABLED:'false'}),QA_EGRESS_OBSERVATION:'true',QA_EGRESS_MODE:'strict',QA_EGRESS_LEDGER_PATH:ledger,QA_EGRESS_ALLOWED_ENDPOINTS:'[]'});
    assert.equal(env.GEMINI_API_KEY,undefined);assert.equal(env.GOOGLE_API_KEY,undefined);assert.equal(env.GEMINI_USAGE_MAX_RECORDS,undefined);
    const owner=new OwnedProcess({command:process.execPath,args:['--import','./scripts/qa-egress-observation.mjs','--import','tsx','apps/gemini-agent/src/main.ts']},context.target.sut.cwd,env,log);
    let primary:unknown;let ready:Record<string,unknown>|undefined;let identities:Awaited<ReturnType<typeof actualListenerIdentity>>=[];
    try{
      await owner.start();const until=performance.now()+context.target.sut.startupTimeoutMs;
      while(performance.now()<until){owner.assertRunning();const text=await readFile(log,'utf8').catch(e=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return '';throw e;});for(const line of text.split('\n'))try{const r=JSON.parse(line);if(r.event==='gemini-agent-ready')ready=r;}catch{}if(ready)break;await sleep(25);}
      if(!ready||typeof ready.address!=='string')throw new PreparationBlocked('Actual production main ready was not observed');
      const url=new URL(ready.address);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.ok(url.port);assert.equal(ready.model,'gemini-3.1-flash-lite');
      if(!await ownedListener(Number(url.port),owner))throw new PreparationBlocked('Actual main listener is not owned');
      identities=await actualListenerIdentity(url.origin);await waitHttp(url.origin+'/health',context.target.sut.startupTimeoutMs,owner);
      // An invalid public request exercises the service without buying generation.
      const reply=await fetch(url.origin+'/agent/turn',{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(3000)});
      assert.equal(reply.status,400);const response=await reply.text();
      const usagePath=join(sessions,'usage','usage.jsonl');
      if(enabled){const st=await lstat(usagePath);assert.ok(st.isFile()&&!st.isSymbolicLink());assert.equal(st.uid,process.getuid?.());assert.equal(st.mode&0o777,0o600);assert.equal(st.nlink,1);assert.deepEqual(parseUsageJsonl(await readFile(usagePath)),[]);assert.equal((await lstat(join(sessions,'usage'))).mode&0o777,0o700);}
      else assert.equal(await absent(join(sessions,'usage')),true,'explicit process false keeps usage absent');
      assert.deepEqual(await readFile(sentinel),sentinelBytes);assert.deepEqual(await readFile(keyFile),keyBytes);assert.equal((await lstat(keyFile)).ino,keyStat.ino);assert.equal(await absent(join(foreign,'owner.lock')),true);
      await writeFile(join(out,'key-file-result.json'),redact({enabled,ready,identities,reply:{status:reply.status,body:response},source:'actual apps/gemini-agent/src/main.ts process',keyFile:{path:keyFile,inode:keyStat.ino,uid:keyStat.uid,mode:keyStat.mode&0o777,sha256:digest(keyBytes),source:'QA-created synthetic key only'},foreignSentinelSha256:digest(sentinelBytes),actualValidGenerationRequests:0,scope:'key-file configuration isolation; no actual provider generation in this variant'}));
    }catch(e){primary=e;}finally{
      try{await owner.stop('SIGTERM');const exit=owner.exitOutcome;if(!exit||exit.code!==0||exit.signal!==null)throw new PreparationBlocked('Production main has no observed graceful exit 0');
        const preloadSha256=digest(await readFile(resolve(context.target.sut.cwd,'scripts/qa-egress-observation.mjs')));
        const egress=await readProviderEgress([{path:ledger,preloadSha256,endpoints:[],pids:identities.map(i=>i.pid),exit}],true);
        const outgoing=egress.ledgers.flatMap(l=>l.rows).filter(row=>row.event==='http-request-created'||row.event==='socket-connect-call'&&(row.target as {kind?:string}|undefined)?.kind==='tcp');assert.deepEqual(outgoing,[],'no generation or outbound TCP request was attempted');
        assert.equal(await absent(join(sessions,'owner.lock')),true);await writeFile(join(out,'key-file-cleanup.json'),redact({exit,egress,actualValidGenerationRequests:0,ownedRuntimePreservedForManifestCleanup:root}));
      }catch(e){await writeFile(join(out,'key-file-cleanup-error.json'),redact({error:String(e),primary:primary?String(primary):null}));primary??=e;}
    }
    if(primary){errors.push(primary);await writeFile(join(out,'key-file-error.json'),redact({error:String(primary)}));}
  }
  if(errors.length)throw errors.find(e=>e instanceof assert.AssertionError)??errors[0];
}

export function jsonlBytes(rows:readonly UsageRecord[]){return rows.reduce((total,row)=>total+Buffer.byteLength(JSON.stringify(row.raw)+'\n'),0);}
/** Independent stable suffix oracle for actual generated records. It never
 * constructs fake persisted history or infers provider billing. */
export function retainedSuffix(rows:readonly UsageRecord[],records:number,bytes:number){
  assert.ok(Number.isInteger(records)&&records>0&&Number.isInteger(bytes)&&bytes>0);let start=Math.max(0,rows.length-records),size=jsonlBytes(rows.slice(start));
  while(size>bytes&&start<rows.length){size-=jsonlBytes([rows[start]!]);start++;}return rows.slice(start);
}
export function capacityRunId(index:number){assert.ok(Number.isSafeInteger(index)&&index>=0&&index<=10000);return '测'.repeat(496)+`-qa-${String(index).padStart(12,'0')}`;}
async function drainCurrent(d:ProviderDriver){
  const deadline=performance.now()+30000;
  do{const seen=await d.usageObservation(),u=seen.snapshot.usage;
    if(u.dropped!==0)throw new PreparationBlocked('Actual telemetry queue dropped records; a loss-free retention-capacity prerequisite was not established');
    assert.equal(u.writeFailures,0,'capacity test requires actual successful writes');assert.ok(!u.diagnosticCodes.includes('USAGE_RECORD_INVALID'),'actual generated records must satisfy the public schema');
    if(u.queued===0&&u.activeBatch===0)return seen;
    await sleep(40);
  }while(performance.now()<deadline);throw new PreparationBlocked('Capacity writer did not settle within finite QA observation window');
}
async function assertFile(d:ProviderDriver){const value=await d.usage();assert.equal(jsonlBytes(value.records),value.actualBytes,'UTF-8 JSONL byte count uses actual generated records');assert.equal(new Set(value.records.map(r=>r.attemptId)).size,value.records.length);return value;}
async function actualRequests(d:ProviderDriver,mode:'records'|'bytes',first:number,count:number){
  // <=32 requests cannot exceed the documented 64 waiting slots when prior
  // batch is fully drained. Every response is observed; no retries.
  assert.ok(count>0&&count<=32);for(let i=0;i<count;i++)await d.enqueue({purpose:mode==='records'?'audit':'turn',proposal:mode==='records'?{kind:'audit',verdict:'pass',reason:'QA synthetic bounded usage'}:{kind:'text',text:'QA synthetic bounded usage'},actualUsage:{inputTokens:7,outputTokens:3,totalTokens:10}});
  const replies=await Promise.allSettled(Array.from({length:count},(_,i)=>mode==='records'?d.exchange('/agent/audit',{groupId:`qa-capacity-${first+i}`,text:'independent offline capacity sample'}):d.exchange('/agent/turn',{...turnRequest(),runId:capacityRunId(first+i)})));
  for(const reply of replies){if(reply.status==='rejected')throw reply.reason;assert.equal(reply.value.status,200);}
  return drainCurrent(d);
}
/** Real loopback generation volume. Each configured maximum has its own new
 * service + directory; the helper cannot inject history. Total calls <=20035. */
export async function runUsageCapacitySupplement(driver:ProviderDriver):Promise<void>{
  const errors:unknown[]=[];
  for(const [name,mode,maxBytes] of [['record-maximum','records',16777216],['byte-maximum','bytes',16777216],['byte-minimum','bytes',4096]] as const)try{
    await withOwnedDriver(driver,[P.protocol,P.upstream,P.usage],'usage-capacity-'+name,async d=>{
      const maxRecords=10000;let actualCalls=0;
      assert.equal(d.usageContract?.maximumRecords,maxRecords);assert.equal(d.usageContract?.maximumBytes,maxBytes);
      if(mode==='records'){
        while(actualCalls<maxRecords){const count=Math.min(32,maxRecords-actualCalls);await actualRequests(d,mode,actualCalls,count);actualCalls+=count;}
        const at=await assertFile(d);assert.equal(at.records.length,maxRecords);assert.ok(at.actualBytes<maxBytes,'record cap must be reached before byte cap');
        await actualRequests(d,mode,actualCalls++,1);const after=await assertFile(d),priorIds=new Set(at.records.map(r=>r.attemptId)),newRows=after.records.filter(r=>!priorIds.has(r.attemptId));assert.equal(newRows.length,1);
        assert.deepEqual(after.records,retainedSuffix([...at.records,newRows[0]!],maxRecords,maxBytes));
        await d.evidence('actual-record-cap-boundary',{actualCalls,beforeCount:at.records.length,afterCount:after.records.length,beforeBytes:at.actualBytes,afterBytes:after.actualBytes,evictedAttempt:at.records[0]!.attemptId,newAttempt:newRows[0]!.attemptId,syntheticHistoryRows:0});
      }else{
        let at=await assertFile(d);const requestBudget=maxBytes===4096?32:maxRecords;
        while(actualCalls<requestBudget&&at.records.length===actualCalls){const count=Math.min(32,requestBudget-actualCalls);await actualRequests(d,mode,actualCalls,count);actualCalls+=count;at=await assertFile(d);}
        if(actualCalls===at.records.length)throw new PreparationBlocked('Allowed 512-character multibyte runId did not reach configured byte cap within actual call budget; no byte-boundary claim');
        assert.ok(actualCalls<=maxRecords&&at.records.length<maxRecords,'byte limit must act before count limit');assert.ok(at.actualBytes<=maxBytes);assert.ok(at.actualBytes>maxBytes-4096,'actual retained bytes are within one public maximum-size row of cap');
        const before=at;await actualRequests(d,mode,actualCalls++,1);const after=await assertFile(d),priorIds=new Set(before.records.map(r=>r.attemptId)),newRows=after.records.filter(r=>!priorIds.has(r.attemptId));assert.equal(newRows.length,1);
        assert.ok(before.actualBytes+jsonlBytes(newRows)>maxBytes,'actual new row must cross byte limit');assert.deepEqual(after.records,retainedSuffix([...before.records,newRows[0]!],maxRecords,maxBytes));
        await d.evidence('actual-byte-cap-boundary',{actualCalls,beforeCount:before.records.length,afterCount:after.records.length,beforeBytes:before.actualBytes,afterBytes:after.actualBytes,newRowBytes:jsonlBytes(newRows),sampleRunIdChars:capacityRunId(0).length,sampleRunIdUtf8Bytes:Buffer.byteLength(capacityRunId(0)),syntheticHistoryRows:0});
      }
      const calls=await d.calls();assert.equal(calls.length,actualCalls,'every emitted request made exactly one actual loopback generation');
      const final=await assertFile(d);for(const row of final.records)assertUsageRecord(row.raw,{purpose:mode==='records'?'audit':'turn',runId:row.runId,model:'gemini-3.1-flash-lite',outcome:'success',tokens:{inputTokens:7,outputTokens:3,totalTokens:10}});
      if(mode==='bytes'){const actualIds=new Set(calls.map(c=>decodeProviderWire(`/v1beta/models/${c.model}:generateContent`,c.rawWire).payload.runId));assert.equal(actualIds.size,calls.length);const submitted=new Set(Array.from({length:actualCalls},(_,i)=>capacityRunId(i)));for(const row of final.records)assert.ok(submitted.has(row.runId!));}
      const stopped=await d.stopProvider('SIGTERM');assert.equal(stopped.exit.code,0);assert.equal(stopped.exit.signal,null);assert.equal((await d.restart('SIGTERM')).started,true);assert.deepEqual((await assertFile(d)).records,final.records,'maximum retained file survives actual startup unchanged');
      await d.evidence('actual-capacity-completion',{mode,actualCalls,retainedCount:final.records.length,retainedBytes:final.actualBytes,actualPaidProviderCalls:0,allRequests:'QA-owned loopback HTTP',syntheticHistoryRows:0,source:'public service requests, real provider parser and real writer'});
    },{usageMaxRecords:10000,usageMaxBytes:maxBytes});
  }catch(error){errors.push(error);await driver.evidence('usage-capacity-'+name+'-result',{error:String(error),status:error instanceof assert.AssertionError?'FAIL':'BLOCKED'});}
  if(errors.length)throw errors.find(e=>e instanceof assert.AssertionError)??errors[0];
}
