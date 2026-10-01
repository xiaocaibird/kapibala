import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { Client } from 'pg';
import { exec } from '../../harness/process.js';
import { PreparationBlocked, type Json, type MessageRef } from '../contracts/media-provider.js';
import { SecondRoundEnvironment, actualListenerIdentity } from './environment.js';
import { MediaDatabaseFixtures } from './media-fixtures.js';
import { installOwnedUnlinkDenial } from './media-unlink.js';
import { probeImmutableOpenWrite } from './media-io-probe.js';
import type { DriverContext } from './driver-factories.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,label:string,ms=10000):Promise<T>{const deadline=performance.now()+ms;do{const value=await read();if(accept(value))return value;await sleep(25);}while(performance.now()<deadline);throw new PreparationBlocked(`${label} not established within finite observation window`);}
async function sql(env:SecondRoundEnvironment,text:string,args:unknown[]=[]){const owned=env.ownedStorage();if(!owned.cluster.ownsDatabase(owned.database))throw new PreparationBlocked('Media I/O SQL requires owned database');const db=new Client({connectionString:owned.cluster.url(owned.database),query_timeout:3000});await db.connect();try{return(await db.query(text,args)).rows;}finally{await db.end();}}
async function message(env:SecondRoundEnvironment,ref:MessageRef){return until(async()=>(await env.api.messages(ref.groupId)).items.find(m=>m.msgId===ref.msgId),Boolean,'actual message ingestion');}
async function noPublicPath(env:SecondRoundEnvironment,ref:MessageRef){const m=await message(env,ref);assert.equal(m!.localFilePath,null);return m;}
async function exists(path:string){try{await lstat(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
async function descriptors(env:SecondRoundEnvironment,path:string){
  const identities=await actualListenerIdentity(env.api.baseUrl),all=[];
  for(const identity of identities){const result=await exec('lsof',['-a','-p',String(identity.pid),'-Fn'],{timeout:3000});all.push({identity,paths:result.stdout.split('\n').filter(line=>line.startsWith('n')&&line.slice(1).startsWith(env.mediaDirectory+sep)).map(line=>line.slice(1))});}
  return {path,open:all.some(row=>row.paths.includes(path)),processes:all};
}
interface IoContext{env:SecondRoundEnvironment;fixture:MediaDatabaseFixtures;options:Record<string,Json>;restore:(action:()=>Promise<void>)=>void}
async function source(ctx:IoContext,bytes=Buffer.alloc(65536,0x6b)){
  const {group}=await ctx.env.api.createGroup(),msgId=randomUUID(),item=ctx.env.mediaSource!.source({id:msgId,bytes});
  return {group,ref:{groupId:group.id,msgId},item,bytes,emit:()=>ctx.env.gateway.emitMessage({groupId:group.gatewayGroupId,msgId,senderPlatformUserId:'qa-io-external',text:'media I/O sentinel',mediaUrl:item.url})};
}
async function completed(ctx:IoContext,item:Awaited<ReturnType<typeof source>>){
  const rows=await until(()=>ctx.fixture.snapshot(item.ref),rows=>rows.length===1&&rows[0]?.state==='ready'&&typeof rows[0].local_file_path==='string','real completed media');
  const path=String(rows[0]!.local_file_path);assert.deepEqual(await readFile(path),item.bytes);assert.equal((await message(ctx.env,item.ref))!.localFilePath,path);return path;
}
async function directoryDenial(ctx:IoContext){
  const path=await realpath(ctx.env.mediaDirectory),before=await lstat(path);if(!before.isDirectory()||before.isSymbolicLink()||before.uid!==process.getuid?.())throw new PreparationBlocked('Media directory is not owned');
  await chmod(path,0o500);let restored=false;
  const restore=async()=>{if(restored)return;const now=await lstat(path);assert.equal(now.ino,before.ino);assert.equal(now.uid,before.uid);await chmod(path,before.mode&0o7777);restored=true;};ctx.restore(restore);
  await ctx.env.evidence('media-io-directory-denial',{path,inode:before.ino,uid:before.uid,originalMode:before.mode&0o7777,installedMode:0o500});return restore;
}
async function openFailure(ctx:IoContext){
  const item=await source(ctx),partial=ctx.env.mediaSource!.holdPartial(item.ref.msgId,30000),later=ctx.env.mediaSource!.holdAfterRequests(item.ref.msgId,1,30000);ctx.restore(partial.release);ctx.restore(later.release);
  const restore=await directoryDenial(ctx);item.emit();await message(ctx.env,item.ref);await partial.reached();
  const rows=await until(()=>ctx.fixture.snapshot(item.ref),rows=>rows[0]?.state==='pending'&&typeof rows[0].last_error==='string'&&/EACCES.*open/.test(rows[0].last_error),'actual OS open EACCES');
  const row=rows[0]!;assert.equal(row.local_file_path,null);assert.equal(row.partial_name,null);const publicMessage=await noPublicPath(ctx.env,item.ref);
  const remote=await until(async()=>ctx.env.mediaSource!.snapshot().records.filter(r=>r.url===item.item.url),records=>!!records[0]?.closedAt,'source HTTP closed after failed open');assert.equal(remote[0]!.finishedAt,null,'source closed before withheld tail was sent');
  const fd=await descriptors(ctx.env,join(ctx.env.mediaDirectory,`media-${row.id}.bin`));assert.ok(fd.processes.every(p=>p.paths.every(path=>!path.includes(String(row.id)))),'no actual target file FD survives failed open');
  await ctx.env.evidence('media-open-failure-real-effects',{rows,publicMessage,remote,fd});
  await restore();await partial.release();await later.release();const path=await completed(ctx,item);await ctx.env.evidence('media-open-failure-recovered',{path,source:ctx.env.mediaSource!.snapshot(),rows:await ctx.fixture.snapshot(item.ref)});
}
async function writeFailure(ctx:IoContext){
  const osProbe=await probeImmutableOpenWrite(resolve(ctx.env.runtimeDirectory,'qa-probes'));await ctx.env.evidence('media-open-write-os-mechanism-probe',osProbe);
  if(!osProbe.denied)throw new PreparationBlocked('Actual QA-only OS probe shows immutable flag does not reject already-open descriptor writes; no safe deterministic product write-syscall failure fixture, no product failure inferred');
  const item=await source(ctx,Buffer.alloc(8*1024*1024,0x57)),partial=await ctx.fixture.hold('partial-written',item.ref),later=ctx.env.mediaSource!.holdAfterRequests(item.ref.msgId,1,30000);ctx.restore(partial.release);ctx.restore(later.release);
  item.emit();await partial.reached();const rows=await ctx.fixture.snapshot(item.ref),row=rows[0]!;
  if(typeof row.partial_name!=='string'||!/^media-[a-f0-9-]+\.[a-f0-9-]+\.part$/.test(row.partial_name))throw new PreparationBlocked('Actual owned partial file identity unavailable');
  const path=join(ctx.env.mediaDirectory,row.partial_name),before=await lstat(path),fdBefore=await descriptors(ctx.env,path);
  assert.ok(fdBefore.open,'original application has the actual partial file open');assert.ok(before.size>0&&before.size<item.bytes.length);await noPublicPath(ctx.env,item.ref);
  const denial=await installOwnedUnlinkDenial(ctx.env.mediaDirectory,path);ctx.restore(denial.restore);await partial.release();
  const fdAfter=await until(()=>descriptors(ctx.env,path),value=>!value.open,'original partial file descriptor release');
  const remote=await until(async()=>ctx.env.mediaSource!.snapshot().records.filter(r=>r.url===item.item.url),value=>!!value[0]?.closedAt,'actual source close after immutable-file I/O failure');
  const current=await lstat(path);assert.equal(current.ino,before.ino);assert.equal(current.size,before.size,'immutable partial file did not silently accept remaining bytes');await noPublicPath(ctx.env,item.ref);
  const log=await readFile(resolve(ctx.env.outputDir,'server.log'),'utf8');
  // The original catch path may report denied unlink instead of the first write.
  // Retain that limitation rather than turn a real I/O denial into invented syscall proof.
  const directWriteFailure=/EPERM[^\n]*\bwrite\b|"syscall"\s*:\s*"write"[^\n]*EPERM/.test(log);
  await ctx.env.evidence('media-opened-file-real-denial',{rows,denial:denial.evidence,before:{inode:before.ino,size:before.size},after:{inode:current.ino,size:current.size},fdBefore,fdAfter,remote,directWriteFailure,productErrorLines:log.split('\n').filter(line=>/EPERM|EACCES/.test(line))});
  await denial.restore();await later.release();const published=await completed(ctx,item);await ctx.env.evidence('media-write-denial-recovered',{published,rows:await ctx.fixture.snapshot(item.ref),source:ctx.env.mediaSource!.snapshot()});
  if(!directWriteFailure)throw new PreparationBlocked('Actual open-file immutable denial, closed FD/source and byte-perfect recovery observed; original error masks write with unlink, so exact product write-syscall failure is not independently established');
}
async function tightenedLimit(ctx:IoContext,pinned:boolean){
  // A separate unreferenced three-byte control survives the new four-byte limit.
  const control=await source(ctx,Buffer.from('ctl'));control.emit();const controlPath=await completed(ctx,control);
  const item=await source(ctx,Buffer.alloc(65536,0x74)),complete=await ctx.fixture.hold('complete-before-path-commit',item.ref),partial=ctx.env.mediaSource!.holdPartial(item.ref.msgId,30000);
  ctx.restore(complete.release);ctx.restore(partial.release);let runId:string|undefined;const kickGate=`qa-io-kick-${randomUUID()}`,target=`qa-io-target-${randomUUID()}`;
  if(pinned){
    ctx.env.gateway.setMembership(item.group.gatewayGroupId,target,true);await until(()=>ctx.env.api.group(item.group.id),g=>g.members.some(m=>m.platformUserId===target),'real target member');
    ctx.env.agent.enqueueTurns({body:{stop_reason:'tool_use',content:[{type:'tool_use',id:randomUUID(),name:'kick_user',input:{platform_user_id:target,reason:'hold genuine running media reference'}}]}});
    ctx.env.agent.enqueueAudits({body:{verdict:'pass',reason:'QA synthetic target'}});
    ctx.env.gateway.enqueue(`/groups/${item.group.gatewayGroupId}/kick`,{status:503,code:'GATEWAY_UNAVAILABLE',effect:'apply',omitEvent:true,barrier:{phase:'before-response',name:kickGate}});
    ctx.restore(async()=>{ctx.env.gateway.configure({unavailable:false});ctx.env.gateway.barriers.release(kickGate);});
    await ctx.env.api.require(ctx.env.api.patch(`/api/groups/${item.group.id}`,{agentEnabled:true,autoKickEnabled:true}));
  }
  item.emit();await partial.reached();await message(ctx.env,item.ref);
  if(pinned){
    await ctx.env.gateway.barriers.waitFor(kickGate);ctx.env.gateway.configure({unavailable:true});ctx.env.gateway.barriers.release(kickGate);
    const refs=await until(()=>sql(ctx.env,"SELECT r.id,r.status,r.recovery_note,p.media_id FROM agent_runs r JOIN agent_media_references p ON p.run_id=r.id JOIN media_files f ON f.id=p.media_id WHERE f.group_id=$1 AND f.msg_id=$2",[item.ref.groupId,item.ref.msgId]),rows=>rows.length===1&&rows[0].status==='running'&&typeof rows[0].recovery_note==='string'&&!!rows[0].recovery_note,'actual original run paused with committed media reference');
    runId=String(refs[0].id);await ctx.env.evidence('media-limit-real-running-pin',{refs,gateway:ctx.env.gateway.snapshot()});
  }
  await partial.release();await complete.reached();const before=await ctx.fixture.snapshot(item.ref),file=join(ctx.env.mediaDirectory,`media-${before[0]!.id}.bin`);assert.deepEqual(await readFile(file),item.bytes);await noPublicPath(ctx.env,item.ref);
  const beforeOwner=await ctx.env.ownership('c1-media-files');await ctx.env.kill('SIGKILL');await complete.release();
  let denial:Awaited<ReturnType<typeof installOwnedUnlinkDenial>>|undefined;
  if(!pinned){denial=await installOwnedUnlinkDenial(ctx.env.mediaDirectory,file);ctx.restore(denial.restore);}
  ctx.options.maxBytes=4;ctx.env.mediaSource!.setFault(item.item.url,'404');const count=ctx.env.mediaSource!.snapshot().records.filter(r=>r.url===item.item.url).length;
  await ctx.env.start();await ctx.env.api.login();const afterOwner=await ctx.env.ownership('c1-media-files');assert.notDeepEqual(afterOwner.applicationPids,beforeOwner.applicationPids);
  const deleting=await until(()=>ctx.fixture.snapshot(item.ref),rows=>rows[0]?.state==='deleting'&&rows[0]?.local_file_path===null,'real smaller-limit deletion intent');await noPublicPath(ctx.env,item.ref);assert.deepEqual(await readFile(file),item.bytes);
  assert.equal(ctx.env.mediaSource!.snapshot().records.filter(r=>r.url===item.item.url).length,count,'existing complete file is classified without downloading again');
  if(pinned){
    const run=await ctx.env.api.require(ctx.env.api.get<Record<string,unknown>>(`/api/agent-runs/${runId}`));assert.equal(run.status,'running');assert.ok(run.recoveryNote);const refs=await sql(ctx.env,'SELECT * FROM agent_media_references WHERE run_id=$1 AND media_id=$2',[runId,deleting[0]!.id]);assert.equal(refs.length,1);
    await ctx.fixture.age(control.ref,31);await until(()=>ctx.fixture.snapshot(control.ref),rows=>rows[0]?.state==='deleted','actual cleanup of unreferenced control');assert.equal(await exists(controlPath),false);assert.deepEqual(await readFile(file),item.bytes);
    await ctx.env.evidence('media-limit-running-pin-protection',{deleting,run,refs,control:await ctx.fixture.snapshot(control.ref),controlPath,oldPid:beforeOwner.applicationPids,newPid:afterOwner.applicationPids});
    await ctx.env.api.require(ctx.env.api.patch(`/api/groups/${item.group.id}`,{agentEnabled:false}));ctx.env.gateway.configure({unavailable:false});await until(()=>ctx.env.api.agentRun(runId!),run=>run.status!=='running','original pinned run reaches terminal through public cancellation');
    assert.equal(ctx.env.gateway.snapshot().requests.filter(r=>r.method==='POST'&&r.path===`/groups/${item.group.gatewayGroupId}/kick`).length,1,'unknown kick is not blindly resent');
  }else{
    const denied=await until(()=>ctx.fixture.snapshot(item.ref),rows=>typeof rows[0]?.last_error==='string'&&/EPERM/.test(rows[0].last_error),'real unlink attempt holds deletion intent');await ctx.env.evidence('media-limit-unpinned-delete-intent',{before,deleting,denied,denial:denial!.evidence});await denial!.restore();
  }
  await until(()=>ctx.fixture.snapshot(item.ref),rows=>rows[0]?.state==='deleted','real final media deletion');assert.equal(await exists(file),false);await noPublicPath(ctx.env,item.ref);await ctx.env.evidence('media-limit-final-cleanup',{pinned,runId,before,after:await ctx.fixture.snapshot(item.ref),fileAbsent:true,source:ctx.env.mediaSource!.snapshot(),effectiveConfiguration:{maxBytes:4}});
}
export async function runMediaIoCase(context:DriverContext):Promise<RoundResult>{
  const variants:VariantResult[]=[];
  for(const name of ['open-failure','opened-file-write-failure','tightened-no-reference','tightened-running-reference'] as const){
    const output=resolve(context.outputDir,name),options:Record<string,Json>={maxBytes:20*1024*1024},env=new SecondRoundEnvironment(context.target,context.cluster,output,resolve(context.runtimeDir,name),options),restore:(()=>Promise<void>)[]=[];
    const fixture=new MediaDatabaseFixtures(()=>env,`${context.target.sut.revision}:docs/qa-media-scenarios-20261002.md`);restore.push(()=>fixture.cleanup());
    let status:'PASS'|'FAIL'|'BLOCKED'='PASS',reason:string|undefined;const cleanupErrors:string[]=[];
    try{await env.initialize();await env.api.login();await env.ownership('c1-media-files');const ctx={env,fixture,options,restore:(action:()=>Promise<void>)=>{restore.push(action);}};
      if(name==='open-failure')await openFailure(ctx);else if(name==='opened-file-write-failure')await writeFailure(ctx);else await tightenedLimit(ctx,name==='tightened-running-reference');
    }catch(error){status=classifyError(error);reason=String(error);await env.evidence('media-io-error',{message:reason,stack:(error as Error).stack});}
    finally{
      try{await env.kill('SIGKILL');}catch(error){cleanupErrors.push(String(error));}
      for(const action of [...restore].reverse())try{await action();}catch(error){cleanupErrors.push(String(error));}
      try{await env.close();}catch(error){cleanupErrors.push(String(error));}
    }
    if(cleanupErrors.length){if(status==='PASS')status='BLOCKED';reason=[reason,...cleanupErrors].filter(Boolean).join('; ');}
    variants.push({id:name,status,reason,evidence:[output]});
  }
  return {caseId:'SR-C1-015',status:combineVariants(variants,[]),variants};
}
