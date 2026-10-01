import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { BlockedError } from '../../harness/security.js';
import { SecondRoundEnvironment } from './environment.js';
import { MediaDatabaseFixtures } from './media-fixtures.js';
import { MediaObservation, type MediaLease } from './media-observation.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';
import type { DriverContext } from './driver-factories.js';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const tool=(id:string,name:string,input:Record<string,unknown>)=>({body:{stop_reason:'tool_use',content:[{type:'tool_use',id,name,input}]}});
async function query(env:SecondRoundEnvironment,sql:string,args:unknown[]=[]) {
  const {cluster,database}=env.ownedStorage();if(!cluster.ownsDatabase(database))throw new BlockedError('Media SQL witness requires owned database');
  const db=new Client({connectionString:cluster.url(database),query_timeout:3000});await db.connect();try{return(await db.query(sql,args)).rows;}finally{await db.end();}
}
async function until<T>(read:()=>Promise<T>,good:(v:T)=>boolean,label:string,ms=10000):Promise<T>{const end=performance.now()+ms;do{const value=await read();if(good(value))return value;await sleep(25);}while(performance.now()<end);throw new BlockedError(label+' not observed');}
async function readyMedia(env:SecondRoundEnvironment) {
  const {group}=await env.api.createGroup(),msgId=randomUUID(),bytes=Buffer.alloc(4097,0x72);
  const source=env.mediaSource!.source({id:msgId,bytes});
  env.gateway.emitMessage({groupId:group.gatewayGroupId,msgId,senderPlatformUserId:'qa-media-reference-external',text:'owned real media',mediaUrl:source.url});
  const ref={groupId:group.id,msgId},fixture=new MediaDatabaseFixtures(()=>env,`${env.config.sut.revision}:docs/qa-media-reference-observation-20261002.md`);
  const [row]=await until(()=>fixture.snapshot(ref),rows=>rows.length===1&&rows[0]?.state==='ready','actual published media');
  assert.equal(typeof row!.local_file_path,'string');assert.deepEqual(await readFile(String(row!.local_file_path)),bytes);
  return {group,ref,fixture,row:row!,bytes,path:String(row!.local_file_path)};
}
async function prepareHistory(env:SecondRoundEnvironment,group:{id:string;gatewayGroupId:string},afterName:string) {
  const toolUseId=randomUUID(),responseBarrier='qa-media-history-'+randomUUID();
  env.agent.enqueueTurns({...tool(toolUseId,'get_recent_messages',{limit:50}),barrier:{phase:'before-response',name:responseBarrier}},
    {body:{stop_reason:'end_turn',content:[{type:'text',text:'completed media reference'}]},barrier:{phase:'request',name:afterName}});
  await env.api.require(env.api.patch('/api/groups/'+group.id,{agentEnabled:true}));
  env.gateway.emitMessage({groupId:group.gatewayGroupId,msgId:randomUUID(),senderPlatformUserId:'qa-media-reference-external',text:'read current history'});
  const hit=await env.agent.barriers.waitFor(responseBarrier),runId=(hit.context as {body?:{runId?:string}}).body?.runId;
  if(!runId)throw new BlockedError('Real history request has no run identity');
  return {runId,toolUseId,responseBarrier};
}
async function race(env:SecondRoundEnvironment,first:'reference'|'cleanup') {
  const media=await readyMedia(env),afterName='qa-media-finish-'+randomUUID(),history=await prepareHistory(env,media.group,afterName);
  const observer=new MediaObservation(env);let primary:unknown;
  try {
    await observer.verify();
    const existing=await query(env,'SELECT * FROM agent_media_references WHERE media_id=$1',[media.row.id]);
    if(existing.length)throw new BlockedError('Race precondition requires no earlier real reference for this file');
    const common={...media.ref,mediaId:String(media.row.id)};
    const reference=await observer.arm({kind:'media-reference',...common,operation:{kind:'history',runId:history.runId,toolUseId:history.toolUseId}},first==='reference'?['reference-locked','reference-registered','reference-committed']:['reference-before-lock','reference-committed']);
    const cleanup=await observer.arm({kind:'media-cleanup',...common},first==='reference'?['cleanup-before-lock']:['cleanup-claimed']);
    // Both exact-file gates exist before the owned age fixture makes it eligible.
    await media.fixture.age(media.ref,31);
    if(first==='reference')await cleanup.wait('cleanup-before-lock');
    env.agent.barriers.release(history.responseBarrier);
    if(first==='reference') {
      const locked=await reference.wait('reference-locked'),refEvent=locked.events.find(e=>e.kind==='reference-locked')!;
      assert.ok((refEvent.selectedMediaIds as string[]).includes(String(media.row.id)));
      const cl=await cleanup.advance(),clEvent=cl.events.find(e=>e.kind==='cleanup-before-lock')!;
      const waits=await until(()=>query(env,'SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[clEvent.backendPid]),rows=>rows.some(r=>r.wait_event_type==='Lock'&&r.blockers.includes(refEvent.backendPid)),'actual same-row PostgreSQL lock contention',3000);
      await env.evidence('media-same-row-contention',{locked,cleanup:cl,waits});
      await reference.advance();const registered=await reference.wait('reference-registered');
      assert.equal((await query(env,'SELECT * FROM agent_media_references WHERE media_id=$1 AND run_id=$2',[media.row.id,history.runId])).length,0,'uncommitted reference must remain invisible to another connection');
      await reference.advance();const committed=await reference.wait('reference-committed');
      assert.equal((await query(env,'SELECT * FROM agent_media_references WHERE media_id=$1 AND run_id=$2',[media.row.id,history.runId])).length,1);
      const skipped=await cleanup.wait('cleanup-skipped');
      assert.equal((await env.api.agentRun(history.runId)).status,'running');
      assert.deepEqual(await readFile(media.path),media.bytes);
      assert.equal((await env.api.messages(media.group.id)).items.find(m=>m.msgId===media.ref.msgId)?.localFilePath,media.path);
      await env.evidence('media-reference-first',{registered,committed,skipped});
    } else {
      const before=await reference.wait('reference-before-lock'),claimed=await cleanup.wait('cleanup-claimed');
      const rows=await media.fixture.snapshot(media.ref);assert.equal(rows[0]?.state,'deleting');assert.equal(rows[0]?.local_file_path,null);assert.deepEqual(await readFile(media.path),media.bytes);
      await reference.advance();const committed=await reference.wait('reference-committed');
      const locked=committed.events.find(e=>e.kind==='reference-locked');assert.ok(locked&&Array.isArray(locked.selectedMediaIds));assert.ok(!(locked.selectedMediaIds as string[]).includes(String(media.row.id)));
      assert.equal((await query(env,'SELECT * FROM agent_media_references WHERE media_id=$1 AND run_id=$2',[media.row.id,history.runId])).length,0);
      const unchanged=await cleanup.snapshot();assert.equal(unchanged.state,'held');assert.equal(unchanged.expiresAt,claimed.expiresAt);assert.deepEqual(unchanged.events,claimed.events);
      assert.deepEqual(await readFile(media.path),media.bytes,'releasing reference must not release independent cleanup gate');
      await cleanup.advance();await cleanup.wait('cleanup-completed');
      assert.equal(await lstat(media.path).then(()=>true,(e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return false;throw e;}),false);
      assert.equal((await env.api.messages(media.group.id)).items.find(m=>m.msgId===media.ref.msgId)?.localFilePath,null);
      await env.evidence('media-cleanup-first',{before,claimed,committed,unchanged});
    }
    await observer.close();const nextRequest=await env.agent.barriers.waitFor(afterName);
    if(first==='cleanup')assert.ok(!JSON.stringify(nextRequest.context).includes(media.path),'Actual model history must not expose the unavailable old file path');
    await env.evidence('media-actual-tool-history-after-race',nextRequest);env.agent.barriers.release(afterName);
    await until(()=>env.api.agentRun(history.runId),run=>run.status!=='running','original history run completes');
  }catch(e){primary=e;throw e;}finally{
    if(primary)try{await env.kill('SIGKILL');}catch(error){await env.evidence('media-failure-stop-error',{error:String(error),primary:String(primary)});throw primary;}
    env.agent.barriers.release(history.responseBarrier);env.agent.barriers.release(afterName);
    try{await observer.close();await media.fixture.cleanup();}catch(e){if(primary)await env.evidence('media-secondary-cleanup-error',{error:String(e)});else throw e;}
  }
}
async function pausedReference(env:SecondRoundEnvironment) {
  const media=await readyMedia(env),target='qa-media-kick-'+randomUUID(),toolUseId=randomUUID(),kickToolId=randomUUID(),responseGate='qa-media-read-'+randomUUID(),kickGate='qa-media-kick-'+randomUUID();
  const observer=new MediaObservation(env);let primary:unknown;
  const controls:Awaited<ReturnType<typeof readyMedia>>[]=[];for(let index=0;index<2;index++)controls.push(await readyMedia(env));
  const observeRealCleanup=async(index:number)=>{const control=controls[index]!;await control.fixture.age(control.ref,31);await control.fixture.cycle('cleanup');const rows=await control.fixture.snapshot(control.ref);assert.equal(rows[0]?.state,'deleted');assert.equal(await lstat(control.path).then(()=>true,(e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return false;throw e;}),false);await env.evidence('media-unreferenced-control-'+index,{rows,path:control.path,absent:true});};
  try {
    env.gateway.setMembership(media.group.gatewayGroupId,target,true);
    await until(()=>env.api.group(media.group.id),g=>g.members.some(m=>m.platformUserId===target),'actual external member');
    await env.api.require(env.api.patch('/api/groups/'+media.group.id,{agentEnabled:true,autoKickEnabled:true}));
    env.agent.enqueueTurns({...tool(toolUseId,'get_recent_messages',{limit:50}),barrier:{phase:'before-response',name:responseGate}},tool(kickToolId,'kick_user',{platform_user_id:target,reason:'reference pause test'}));
    env.agent.enqueueAudits({body:{verdict:'pass',reason:'independent reference pause'}});
    env.gateway.enqueue('/groups/'+media.group.gatewayGroupId+'/kick',{status:503,code:'GATEWAY_UNAVAILABLE',effect:'apply',omitEvent:true,barrier:{phase:'before-response',name:kickGate}});
    env.gateway.emitMessage({groupId:media.group.gatewayGroupId,msgId:randomUUID(),senderPlatformUserId:'qa-media-reference-external',text:'read media then kick'});
    const hit=await env.agent.barriers.waitFor(responseGate),runId=(hit.context as {body?:{runId?:string}}).body?.runId;
    if(!runId)throw new BlockedError('Missing original actual media run');
    await observer.verify();const reference=await observer.arm({kind:'media-reference',...media.ref,mediaId:String(media.row.id),operation:{kind:'history',runId,toolUseId}},['reference-committed']);
    env.agent.barriers.release(responseGate);const committed=await reference.wait('reference-committed');
    assert.equal((await query(env,'SELECT * FROM agent_media_references WHERE media_id=$1 AND run_id=$2',[media.row.id,runId])).length,1);
    await observer.close();const kickHit=await env.gateway.barriers.waitFor(kickGate);
    const effects=()=>env.gateway.snapshot().effects.filter(e=>e.kind==='kick'&&e.groupId===media.group.gatewayGroupId&&e.platformUserId===target);
    assert.equal(effects().length,1,'real remote member removal must have landed before the response is withheld');
    await env.evidence('media-original-kick-effect',{kickToolId,kickHit,effects:effects(),group:env.gateway.snapshot().groups.find(g=>g.groupId===media.group.gatewayGroupId)});
    env.gateway.configure({unavailable:true});env.gateway.barriers.release(kickGate);
    const readState=()=>query(env,'SELECT id,status,recovery_note,history FROM agent_runs WHERE id=$1',[runId]);
    const paused=await until(readState,rows=>rows[0]?.status==='running'&&typeof rows[0]?.recovery_note==='string'&&rows[0].recovery_note.length>0,'real original run paused with unknown effect');
    const postCalls=()=>env.gateway.snapshot().requests.filter(r=>r.method==='POST'&&r.path==='/groups/'+media.group.gatewayGroupId+'/kick');
    assert.equal(postCalls().length,1);const beforeRun=await env.api.agentRun(runId);assert.equal(beforeRun.steps.filter(step=>step.toolUseId===kickToolId).length,1);await media.fixture.age(media.ref,31);await observeRealCleanup(0);
    assert.deepEqual(await readFile(media.path),media.bytes);const before=env.capacityControlTarget();
    await env.restart('SIGKILL');await env.api.login();const after=env.capacityControlTarget();assert.notEqual(after.pid,before.pid);
    await observeRealCleanup(1);const resumed=await readState();assert.equal(resumed[0]?.status,'running');assert.ok(resumed[0]?.recovery_note);
    assert.equal((await query(env,'SELECT * FROM agent_media_references WHERE media_id=$1 AND run_id=$2',[media.row.id,runId])).length,1);
    assert.deepEqual(await readFile(media.path),media.bytes);assert.equal(postCalls().length,1);assert.equal(effects().length,1);const afterRun=await env.api.agentRun(runId);assert.equal(afterRun.steps.filter(step=>step.toolUseId===kickToolId).length,1);
    await env.evidence('media-unknown-reference-survives',{committed,paused,resumed,kickToolId,beforeRun,afterRun,effects:effects(),beforePid:before.pid,afterPid:after.pid,kicks:postCalls(),completionClaim:false});
    await env.api.require(env.api.patch('/api/groups/'+media.group.id,{agentEnabled:false}));env.gateway.configure({unavailable:false});
    const terminal=await until(()=>env.api.agentRun(runId),r=>r.status!=='running','original referenced run reaches terminal after public cancellation and restored authority');
    await media.fixture.cycle('cleanup');assert.equal((await media.fixture.snapshot(media.ref))[0]?.state,'deleted');
    assert.equal(await lstat(media.path).then(()=>true,(e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return false;throw e;}),false);
    assert.equal(postCalls().length,1);await env.evidence('media-after-original-terminal',{terminal,rows:await media.fixture.snapshot(media.ref),kicks:postCalls()});
  }catch(e){primary=e;throw e;}finally{
    if(primary)try{await env.kill('SIGKILL');}catch(error){await env.evidence('media-failure-stop-error',{error:String(error),primary:String(primary)});throw primary;}
    env.gateway.configure({unavailable:false});env.gateway.barriers.release(kickGate);env.agent.barriers.release(responseGate);
    try{await observer.close();await media.fixture.cleanup();}catch(e){if(primary)await env.evidence('media-secondary-cleanup-error',{error:String(e)});else throw e;}
  }
}
export async function runMediaObservationCase(id:string,context:DriverContext):Promise<RoundResult> {
  const variants:VariantResult[]=[];
  for(const first of (id==='SR-C1-014'?['paused']:['reference','cleanup']) as ('reference'|'cleanup'|'paused')[]){
    const outputDir=resolve(context.outputDir,first),env=new SecondRoundEnvironment(context.target,context.cluster,outputDir,resolve(context.runtimeDir,first));
    let status:'PASS'|'FAIL'|'BLOCKED'='PASS',reason:string|undefined;const cleanupErrors:string[]=[];
    try{await env.initialize();await env.api.login();await env.ownership('c1-media-files');if(first==='paused')await pausedReference(env);else await race(env,first);}
    catch(error){status=classifyError(error);reason=String(error);await env.evidence('media-race-error',{message:reason,stack:(error as Error).stack});}
    finally{try{await env.close();}catch(error){cleanupErrors.push(String(error));}}
    if(cleanupErrors.length){if(status==='PASS')status='BLOCKED';reason=[reason,...cleanupErrors].filter(Boolean).join('; ');}
    variants.push({id:first+'-first',status,reason,evidence:[outputDir]});
  }
  return {caseId:id,status:combineVariants(variants,[]),variants};
}
