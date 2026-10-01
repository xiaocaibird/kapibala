import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DeliveryMigrationEnvironment, prepareLegacyMigrationSource } from './delivery-migration.js';
import { ownedCleanupDirectory, deliveryCleanupFailures } from './delivery-recovery.js';
import { MediaDatabaseFixtures } from './media-fixtures.js';
import type { DriverContext } from './driver-factories.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';
import { requireAuthorization, redact, BlockedError } from '../../harness/security.js';
import { assertOwnedBytes } from '../tests/media-provider.js';
import { eventually } from '../../harness/platform-client.js';

export function classifyMigrationError(error:unknown):'FAIL'|'BLOCKED' {
 if(error instanceof AggregateError)return error.errors.some(e=>classifyMigrationError(e)==='FAIL')?'FAIL':'BLOCKED';
 return classifyError(error);
}

/** Independent C1-012. Legacy run rows are permissible upgrade inputs, not
 * evidence of a newly triggered Agent. Actual recovery/cancellation is observed. */
export async function runMediaMigrationCase(context:DriverContext):Promise<RoundResult> {
 await requireAuthorization(context.target);await mkdir(context.runtimeDir,{recursive:true,mode:0o700});await mkdir(context.outputDir,{recursive:true});
 const owned=await ownedCleanupDirectory(context.runtimeDir,`delivery-owned-${randomUUID()}`),runtimeDir=resolve(owned.path,'schema8');await mkdir(runtimeDir,{mode:0o700});
 const variants:VariantResult[]=[],cleanupErrors:string[]=[],uncoveredVariants:string[]=[];
 let env:DeliveryMigrationEnvironment|undefined;
 const variant=async(id:string,body:()=>Promise<unknown>)=>{
  const path=resolve(context.outputDir,`${id}.json`);
  try {await writeFile(path,redact(await body())+'\n');variants.push({id,status:'PASS',evidence:[path]});return true;}
  catch(error) {await writeFile(path,redact({error:String(error),stack:error instanceof Error?error.stack:undefined})+'\n');variants.push({id,status:classifyMigrationError(error),reason:String(error),evidence:[path]});return false;}
 };
 try {
  const initialized=await variant('actual-legacy-source-schema-upgrade-repeat-refusal',async()=>{
   const setup={...context,runtimeDir};const source=await prepareLegacyMigrationSource(setup);
   env=new DeliveryMigrationEnvironment(setup,source.sourceRoot,true);await env.initialize();await env.api.login();await env.ownership('c1-media-files');
   return {source,migration:env.migrationFacts};
  });
  if(initialized&&env) {
   const qa=env,fixture=new MediaDatabaseFixtures(()=>qa,`${qa.config.sut.revision}:docs/qa-media-scenarios-20261002.md`);
   let path:string|undefined;
   const ready=await variant('legacy-messages-available-expired-and-text',async()=>{
    await eventually(()=>fixture.snapshot(),rows=>rows.filter(r=>r.group_id===qa.legacyGroup).some(r=>r.msg_id==='qa-legacy-downloadable'&&r.state==='ready')&&rows.some(r=>r.msg_id==='qa-legacy-expired'&&r.state==='unavailable'),{timeoutMs:20000});
    const messages=await qa.api.messages(qa.legacyGroup);assert.equal(messages.items.length,3);
    for(const input of qa.fixtureRows)assert.equal(messages.items.find(row=>row.msgId===input.id)?.text,input.text);
    const downloaded=messages.items.find(row=>row.msgId==='qa-legacy-downloadable')!;path=downloaded.localFilePath??undefined;
    await assertOwnedBytes(path,qa.mediaDirectory,qa.bytes);
    assert.ok(!messages.items.find(row=>row.msgId==='qa-legacy-expired')?.localFilePath);
    assert.ok(!messages.items.find(row=>row.msgId==='qa-legacy-ordinary')?.localFilePath);
    const sources=qa.mediaSource!.snapshot();assert.ok(sources.records.some(r=>r.url.endsWith('/media/legacy-expired')&&r.responseStatus===404));
    return {messages,sources,actualFile:path,bytes:qa.bytes.toString('hex'),fixtureOnly:'historical running row is not a real Agent trigger'};
   });
   const ref={groupId:qa.legacyGroup,msgId:'qa-legacy-downloadable'};
   const protectedResult=ready&&await variant('old-running-reference-protects-expired-file',async()=>{
    const before=await qa.api.agentRun(qa.legacyRun);assert.equal(before.status,'running');
    const references=await qa.query('SELECT f.msg_id,p.run_id,r.status FROM media_files f JOIN agent_media_references p ON p.media_id=f.id JOIN agent_runs r ON r.id=p.run_id WHERE f.group_id=$1 ORDER BY f.msg_id',[qa.legacyGroup]);
    assert.equal(references.length,2);assert.ok(references.every(r=>r.run_id===qa.legacyRun&&r.status==='running'));
    // An unrelated genuinely downloaded file proves cleanup actually operated;
    // merely seeing protected bytes still present is not a cleanup cycle proof.
    const {group}=await qa.api.createGroup(),msgId=randomUUID(),bytes=Buffer.from('unreferenced cleanup positive control'),source=qa.mediaSource!.source({id:msgId,bytes});
    qa.gateway.emitMessage({groupId:group.gatewayGroupId,msgId,senderPlatformUserId:'qa-unreferenced-legacy-control',text:'cleanup control',mediaUrl:source.url});
    const control={groupId:group.id,msgId};
    const row=(await eventually(()=>fixture.snapshot(control),rows=>rows.length===1&&rows[0]?.state==='ready',{timeoutMs:15000}))[0]!;
    const controlPath=String(row.local_file_path);await assertOwnedBytes(controlPath,qa.mediaDirectory,bytes);
    const protectedAge=await fixture.age(ref,31),controlAge=await fixture.age(control,31);const cycle=await fixture.cycle('cleanup');
    assert.equal((await fixture.snapshot(control))[0]?.state,'deleted');assert.equal(await lstat(controlPath).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false);
    const after=await qa.api.agentRun(qa.legacyRun);assert.equal(after.status,'running');
    const message=(await qa.api.messages(qa.legacyGroup)).items.find(row=>row.msgId===ref.msgId)!;assert.equal(message.localFilePath,path);await assertOwnedBytes(path,qa.mediaDirectory,qa.bytes);
    return {before,after,references,protectedAge,controlAge,actualCleanup:cycle,controlDeleted:controlPath,protectedPath:message.localFilePath,agentWire:qa.agent.snapshot(),scope:'Seeded pre-upgrade interrupted run; protection and post-upgrade actual cleanup are observed, no new trigger claim'};
   });
   // Even if a preceding preservation assertion fails, attempt the independently
   // useful public termination and retain both results; never write run outcomes.
   if(ready)await variant('public-legacy-run-cancellation-then-actual-cleanup',async()=>{
    const before=await qa.api.agentRun(qa.legacyRun);
    await qa.api.require(qa.api.patch(`/api/groups/${qa.legacyGroup}`,{agentEnabled:false}));
    const after=await eventually(()=>qa.api.agentRun(qa.legacyRun),run=>run.status!=='running',{timeoutMs:15000});
    assert.equal(after.status,'cancelled');
    if(!protectedResult)await fixture.age(ref,31);
    const cycle=await fixture.cycle('cleanup');
    const rows=await fixture.snapshot(ref),messages=await qa.api.messages(qa.legacyGroup);assert.equal(rows[0]?.state,'deleted');
    assert.equal(messages.items.find(row=>row.msgId===ref.msgId)?.localFilePath,null);
    for(const input of qa.fixtureRows)assert.equal(messages.items.find(row=>row.msgId===input.id)?.text,input.text);
    assert.equal(await lstat(path!).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false);
    return {before,after,cycle,rows,messages,physicalFileAbsent:path,writesToRunOutcome:false};
   });
   else uncoveredVariants.push('Old media bytes were not established, so reference retention/terminal deletion prerequisites remain unavailable.');
  } else uncoveredVariants.push('Actual supported old-schema initialization failed; dependent media/reference assertions cannot be synthesized.');
 } finally {
  if(env)try{await env.close();}catch(e){cleanupErrors.push(String(e));}
  try{cleanupErrors.push(...await deliveryCleanupFailures(context.outputDir));}catch(e){cleanupErrors.push(String(e));}
  if(!cleanupErrors.length)try{await owned.remove();}catch(e){cleanupErrors.push(String(e));}
  const path=resolve(context.outputDir,'migration-case-cleanup.json');await writeFile(path,redact({cleanupErrors,ownedDirectory:owned.path})+'\n');
  variants.push({id:'owned-migration-process-database-and-directory-cleanup',status:cleanupErrors.length?'BLOCKED':'PASS',reason:cleanupErrors.join('; ')||undefined,evidence:[path]});
 }
 return {caseId:'SR-C1-012',status:combineVariants(variants,[...uncoveredVariants,...cleanupErrors]),variants,uncoveredVariants,cleanupErrors};
}
