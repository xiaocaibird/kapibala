import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { prepareLegacyMigrationSource, DeliveryMigrationEnvironment } from './delivery-migration.js';
import { providerDriver, type DriverContext } from './driver-factories.js';
import { providerCompletedReuse } from '../tests/media-provider.js';
import { combineVariants, classifyError, type RoundResult, type VariantResult } from './result.js';
import { BlockedError, redact, requireAuthorization } from '../../harness/security.js';

export async function sentinelSnapshot(root:string):Promise<Record<string,unknown>> {
 const info=await lstat(root);assert.ok(info.isDirectory()&&!info.isSymbolicLink());
 const rows:Record<string,unknown>={};
 async function walk(path:string) {
  for(const name of (await readdir(path)).sort()) {
   const file=resolve(path,name),s=await lstat(file);assert.ok(!s.isSymbolicLink(),'sentinel must never follow another owner symlink');
   if(s.isDirectory())await walk(file);
   else {assert.ok(s.isFile());rows[relative(root,file)]={sha256:createHash('sha256').update(await readFile(file)).digest('hex'),size:s.size,mode:s.mode,uid:s.uid,ino:s.ino,mtimeMs:s.mtimeMs};}
  }
 }
 await walk(root);return {root,ino:info.ino,uid:info.uid,mode:info.mode,files:rows};
}
export async function ownedCleanupDirectory(parent:string,name:string) {
 assert.match(name,/^delivery-(?:owned|foreign)-[a-f0-9-]{36}$/);
 const path=resolve(parent,name);await mkdir(path,{mode:0o700});
 const canonical=await realpath(path),identity=await lstat(canonical),token=randomUUID();
 const marker=resolve(canonical,'.qa-delivery-owner.json');await writeFile(marker,JSON.stringify({token,canonical}),{mode:0o600});
 return {path:canonical,token,async remove(){
  const current=await lstat(path);
  if(current.isSymbolicLink()||!current.isDirectory()||current.ino!==identity.ino||current.dev!==identity.dev||current.uid!==identity.uid||await realpath(path)!==canonical)
   throw new BlockedError('Exact delivery cleanup directory ownership changed; retain resources');
  const raw=await lstat(marker);if(!raw.isFile()||raw.isSymbolicLink())throw new BlockedError('Delivery cleanup marker changed');
  assert.deepEqual(JSON.parse(await readFile(marker,'utf8')),{token,canonical});
  await rm(canonical,{recursive:true}); // A contained symbolic link is unlinked, never traversed.
 }};
}
function failure(error:unknown):'FAIL'|'BLOCKED' {
 if(error instanceof AggregateError) {if(error.errors.some(e=>failure(e)==='FAIL'))return 'FAIL';return 'BLOCKED';}
 return classifyError(error);
}
/** Whole delivery workflow uses real current processes. Each failed sub-flow
 * retains its evidence and independent later sub-flows still run. */
export async function runDeliveryRecoveryCase(context:DriverContext):Promise<RoundResult> {
 await requireAuthorization(context.target);await mkdir(context.runtimeDir,{recursive:true,mode:0o700});await mkdir(context.outputDir,{recursive:true});
 const variants:VariantResult[]=[],uncoveredVariants:string[]=[],cleanupErrors:string[]=[];
 const owned=await ownedCleanupDirectory(context.runtimeDir,`delivery-owned-${randomUUID()}`);
 const foreign=await ownedCleanupDirectory(context.runtimeDir,`delivery-foreign-${randomUUID()}`);
 await writeFile(resolve(foreign.path,'foreign-session.json'),JSON.stringify({owner:'qa-simulated-separate-run',bytes:randomUUID()}),{mode:0o600});
 await symlink(foreign.path,resolve(owned.path,'another-run-link'));
 const before=await sentinelSnapshot(foreign.path);
 const run=async(id:string,body:()=>Promise<unknown>,paths:string[])=>{
  try {const facts=await body();const path=resolve(context.outputDir,`${id}.json`);await writeFile(path,redact(facts)+'\n');variants.push({id,status:'PASS',evidence:[path,...paths]});}
  catch(error) {const path=resolve(context.outputDir,`${id}-error.json`);await writeFile(path,redact({error:String(error),stack:error instanceof Error?error.stack:undefined})+'\n');variants.push({id,status:failure(error),reason:String(error),evidence:[path,...paths]});}
 };
 let env:DeliveryMigrationEnvironment|undefined;
 try {
  const mediaOut=resolve(context.outputDir,'schema8-media');await mkdir(mediaOut,{recursive:true});
  const mediaContext={...context,outputDir:mediaOut,runtimeDir:resolve(owned.path,'media-upgrade')};await mkdir(mediaContext.runtimeDir,{mode:0o700});
  let upgraded=false;
  await run('actual-schema8-to9-migration-and-repeat',async()=>{
   const source=await prepareLegacyMigrationSource(mediaContext);
   env=new DeliveryMigrationEnvironment(mediaContext,source.sourceRoot);await env.initialize();await env.ownership('c1-media-files');upgraded=true;
   return {source,migration:env.migrationFacts};
  },[mediaOut]);
  if(upgraded&&env)await run('same-database-media-actual-bytes-and-kill-restart',()=>env!.verifyRestart(),[mediaOut]);
  else uncoveredVariants.push('Media/API restart requires successful actual old-schema upgrade; retained preceding failure, no fabricated media result.');
  // Close our actual environment before the unrelated provider component. No
  // shared state is reset inside either component's own restart proof.
  if(env) {try {await env.close();}catch(e){cleanupErrors.push(String(e));}env=undefined;}
  const providerOut=resolve(context.outputDir,'provider-session');await mkdir(providerOut,{recursive:true});
  await run('completed-provider-session-retained-across-restart',async()=>{
   await providerCompletedReuse(providerDriver({...context,outputDir:providerOut,runtimeDir:resolve(owned.path,'provider')}));
   return {scope:'Actual completed response reused before/after real provider process restart; original session files retained; actual upstream request count unchanged',evidenceDirectory:providerOut};
  },[providerOut]);
 } finally {
  if(env)try{await env.close();}catch(e){cleanupErrors.push(String(e));}
  // Any failed owned process shutdown prevents recursive file cleanup. Retain
  // the exact owner directory for recovery, and expose the cleanup blocker.
  try {cleanupErrors.push(...await deliveryCleanupFailures(context.outputDir));}
  catch(e) {cleanupErrors.push(`Cleanup evidence review failed; owned directories retained: ${String(e)}`);}
  if(!cleanupErrors.length)try{await owned.remove();}catch(e){cleanupErrors.push(String(e));}
  await run('exact-owned-cleanup-preserves-simulated-foreign-owner',async()=>{
   const after=await sentinelSnapshot(foreign.path);assert.deepEqual(after,before);
   if(cleanupErrors.length)throw new BlockedError('Foreign sentinel intact but owned resource cleanup incomplete');
   assert.equal(await lstat(owned.path).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false);
   const facts={before,after,ownedRemoved:owned.path,scope:'Independent foreign-directory fixture; no real foreign resources were touched'};
   await foreign.remove();return facts;
  },[]);
 }
 const result:RoundResult={caseId:'SR-BE-DEL-005',status:combineVariants(variants,[...uncoveredVariants,...cleanupErrors]),variants,uncoveredVariants,cleanupErrors};
 await writeFile(resolve(context.outputDir,'delivery-recovery-evidence.json'),redact(result)+'\n');return result;
}
export async function deliveryCleanupFailures(root:string):Promise<string[]> {
 const errors:string[]=[];
 for(const entry of await readdir(root,{withFileTypes:true})) {
  const path=resolve(root,entry.name);if(entry.isDirectory())errors.push(...await deliveryCleanupFailures(path));
  if(entry.isFile()&&/(?:cleanup-summary|cleanup)\.json$/.test(entry.name)) {
   const value=JSON.parse(await readFile(path,'utf8'));
   if(Array.isArray(value.failures))errors.push(...value.failures.map((e:unknown)=>`${path}: ${String(e)}`));
  }
 }
 return errors;
}
