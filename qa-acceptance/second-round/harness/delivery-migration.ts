import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { SecondRoundEnvironment, actualListenerIdentity } from './environment.js';
import { MediaSourceProxy } from './media-source.js';
import { exec, isolatedEnv, OwnedProcess } from '../../harness/process.js';
import { availablePort } from '../../harness/network.js';
import { BlockedError, requireAuthorization, redact } from '../../harness/security.js';
import { assertOwnedBytes } from '../tests/media-provider.js';
import { eventually } from '../../harness/platform-client.js';
import type { DriverContext } from './driver-factories.js';

export const legacyRevision='fb1589df08f00c10e9e62801007b1698d4d0155a';
const checksums:Record<string,string>={
 '001_core.sql':'eabfdd3e50fa312558f14aeb2e3277bdb2ee186d0892a320c0643bed329bb06c',
 '002_automation.sql':'302e6d20b8aebfbed8431e852e1ef9e7c20c310bdaf11e89671f155cb49b09cb',
 '003_agent_activity.sql':'2d8fcc6b498b053614464e1bc49322899041ca74b404b44fbfb13b9440c45e6c',
 '004_message_event_order.sql':'5b7d6c9bcf202ad97276fececabe9e39c1422ebd9fbe25330158e7cac8339298',
 '005_group_metadata.sql':'bbb67a43a41aaaf172f6ba9469a5ad4cc47563447dabf9d3d2bbf0444f1ae003',
 '006_group_directory.sql':'760acc9148f851c1f6d75163655b65a0c15b7b7f929b4a57588c59ceecb9f533',
 '007_message_sent_observation.sql':'51117419e21aa060d15e7a38d8b5b49668d7ba5c9d2568d1bb5256090793706d',
 '008_message_sent_receipts.sql':'7bb4b8bd027ef2b7c5cdc21924aac3dc3d9635fe50547092daebc2a88584551c',
};
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function fixtureCommand(owner:OwnedProcess,outputDir:string,label:string,timeout=60000) {
 let primary:unknown;const failures:unknown[]=[];
 try {await owner.runOnce(timeout);}catch(error){primary=error;}
 try {await owner.stop();}catch(error){failures.push(error);}
 await writeFile(resolve(outputDir,`${label}-cleanup.json`),redact({failures:failures.map(String),exitOutcome:owner.exitOutcome})+'\n');
 if(failures.length)throw new AggregateError(primary?[primary,...failures]:failures,'Fixture command cleanup incomplete');
 if(primary)throw primary;
}

export function verifyLegacyLedger(rows:{version:number;name:string;checksum:string;checksum_origin?:string}[]) {
 assert.equal(rows.length,8);
 for(const [i,row] of rows.entries()) {assert.equal(row.version,i+1);assert.equal(row.checksum,checksums[row.name]);assert.ok(row.checksum);if(row.checksum_origin!==undefined)assert.equal(row.checksum_origin,'executed');}
}
/** Exported source is a fixture executable, not an imported test/oracle. Its
 * original lock/CLI produce the old checksummed ledger in the owned database. */
export async function prepareLegacyMigrationSource(context:DriverContext) {
 await requireAuthorization(context.target);
 const sourceRoot=resolve(context.runtimeDir,'legacy-source');await mkdir(sourceRoot,{recursive:true,mode:0o700});
 const archive=resolve(context.runtimeDir,'legacy-source.tar');
 const paths=['package.json','package-lock.json','tsconfig.json','scripts','apps','packages','db'];
 const listing=(await exec('git',['ls-tree','-r',legacyRevision,'--',...paths],{cwd:context.target.sut.cwd,maxBuffer:8*1024*1024})).stdout;
 assert.ok(listing.length);assert.ok(listing.split('\n').filter(Boolean).every(line=>/^100644 |^100755 /.test(line)),'exported old executable contains only tracked regular files');
 await exec('git',['archive','--format=tar',`--output=${archive}`,legacyRevision,'--',...paths],{cwd:context.target.sut.cwd,timeout:60000});
 await exec('tar',['-xf',archive,'-C',sourceRoot],{timeout:60000});
 assert.deepEqual((await readdir(resolve(sourceRoot,'db/migrations'))).filter(n=>n.endsWith('.sql')).sort(),Object.keys(checksums));
 for(const [file,hash] of Object.entries(checksums)) {
  assert.equal(sha(await readFile(resolve(sourceRoot,'db/migrations',file))),hash);
  assert.equal(sha(await readFile(resolve(context.target.sut.cwd,'db/migrations',file))),hash,'supported upgrade keeps historical SQL bytes');
 }
 const lock=await readFile(resolve(sourceRoot,'package-lock.json'));
 const installation=new OwnedProcess({command:'npm',args:['ci','--ignore-scripts','--no-audit','--no-fund']},sourceRoot,isolatedEnv({}),resolve(context.outputDir,'legacy-install.log'));
 await fixtureCommand(installation,context.outputDir,'legacy-install',300000);
 const facts={legacyRevision,sourceRoot,archive,archiveSha256:sha(await readFile(archive)),exportedPaths:paths,sourceManifest:listing,lockSha256:sha(lock),migrationChecksums:checksums,
  installation:{command:installation.command,exitOutcome:installation.exitOutcome},scope:'Pinned original CLI execution; no imported business helpers or developer tests; npm lifecycle scripts disabled'};
 await writeFile(resolve(context.outputDir,'legacy-source.json'),JSON.stringify(facts,null,2)+'\n');return facts;
}

/** Same QaEnvironment lifecycle, with only the first migration phase replaced
 * by original CLI -> independent fixture -> current CLI. All data is owned. */
export class DeliveryMigrationEnvironment extends SecondRoundEnvironment {
 private firstMigration=true;
 readonly legacyGroup=`qa-legacy-group-${randomUUID()}`;
 readonly legacyRun=`qa-legacy-running-${randomUUID()}`;
 readonly bytes=Buffer.from('QA independent schema8 media bytes \u0000 \u4e2d\u6587');
 readonly fixtureRows=[{id:'qa-legacy-downloadable',text:'Old downloadable media'},
  {id:'qa-legacy-expired',text:'Old expired media'}, {id:'qa-legacy-ordinary',text:'Ordinary old text'}];
 migrationFacts:Record<string,unknown>={};
 constructor(readonly context:DriverContext,readonly oldSource:string,readonly preserveLegacyRunning=false) {super(context.target,context.cluster,context.outputDir,context.runtimeDir);}
 async query(sql:string,args:unknown[]=[]) {
  const {cluster,database}=this.ownedStorage();if(!cluster.ownsDatabase(database))throw new BlockedError('Migration database ownership missing');
  const client=new Client({connectionString:cluster.url(database),application_name:'qa-independent-migration',connectionTimeoutMillis:2000,query_timeout:5000});
  await client.connect();try{return(await client.query(sql,args)).rows;}finally{await client.end();}
 }
 async snapshot() {return {
  ledger:await this.query('SELECT version,name,checksum,checksum_origin FROM schema_migrations ORDER BY version'),
  messages:await this.query('SELECT id,group_id,msg_id,text,metadata,is_own,sent_at FROM messages WHERE group_id=$1 ORDER BY id',[this.legacyGroup]),
  runs:await this.query('SELECT id,group_id,status,end_reason,inflight_turn,recovery_note,cancel_requested FROM agent_runs WHERE group_id=$1 ORDER BY id',[this.legacyGroup]),
 };}
 override async migrate() {
  if(!this.firstMigration)return super.migrate();
  this.firstMigration=false;
  const {database}=this.ownedStorage(),port=await availablePort();
  const env=await this.ownedDatabaseEnvironment(database,port);
  const oldMigration=new OwnedProcess({command:process.execPath,args:['--import','tsx','scripts/migrate.ts']},this.oldSource,env,resolve(this.outputDir,'legacy-migrate.log'));
  await fixtureCommand(oldMigration,this.outputDir,'legacy-migrate');
  verifyLegacyLedger((await this.snapshot()).ledger as Parameters<typeof verifyLegacyLedger>[0]);
  if(!this.mediaSource) {this.mediaSource=new MediaSourceProxy(this.gateway.url);await this.mediaSource.start();}
  const available=this.mediaSource.source({id:'legacy-good',bytes:this.bytes});
  const expired=this.mediaSource.source({id:'legacy-expired',bytes:Buffer.alloc(0),fault:'404'});
  await this.query('INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES($1,$2,$3,$4)',[this.legacyGroup,`qa-old-remote-${randomUUID()}`,'account-1',this.preserveLegacyRunning]);
  for(const [i,row] of this.fixtureRows.entries())await this.query('INSERT INTO messages(id,group_id,msg_id,is_own,text,metadata) VALUES($1,$2,$1,false,$3,$4::jsonb)',
   [row.id,this.legacyGroup,row.text,JSON.stringify(i===0?{mediaUrl:available.url}:i===1?{mediaUrl:expired.url}:{})]);
  // The optional durable in-flight legacy input is a synthetic pre-upgrade
  // interrupted run. Current product recovery, not fixture SQL, decides its
  // pause/cancellation result. It is not an actual new Agent trigger.
  await this.query('INSERT INTO agent_runs(id,group_id,inflight_turn) VALUES($1,$2,$3)',[this.legacyRun,this.legacyGroup,this.preserveLegacyRunning]);
  await this.query("INSERT INTO agent_runs(id,group_id,status,end_reason) VALUES($1,$2,'finished','final')",[this.legacyRun+'-terminal',this.legacyGroup]);
  const before=await this.snapshot();
  this.migrationFacts={sourceRevision:legacyRevision,currentRevision:this.config.sut.revision,database,before,
   fixtureMeaning:'Synthetic legacy data from supported schema contract; running fixture is never evidence of a real Agent invocation',preserveLegacyRunning:this.preserveLegacyRunning,syntheticInputFields:this.preserveLegacyRunning?['groups.agent_enabled=true','agent_runs.inflight_turn=true']:[]};
  await this.evidence('migration-before',this.migrationFacts);
  // Probe normal final application against actual version 8 and preserve its
  // own failure diagnostic. A random exit/timeout never becomes schema PASS.
  const probeEnv=await this.ownedDatabaseEnvironment(database,port);
  const probe=new OwnedProcess({command:process.execPath,args:['--import','tsx','apps/server/src/main.ts']},this.config.sut.cwd,probeEnv,resolve(this.outputDir,'old-schema-start.log'));
  await probe.start();
  const deadline=performance.now()+15000;let healthy=false,probeFailure:unknown;
  try {
   while(!probe.exitOutcome&&performance.now()<deadline) {
    try {const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(200)});if(response.ok)healthy=true;}catch{}
    if(healthy)break;await sleep(30);
   }
   const ownExit=probe.exitOutcome,log=await readFile(resolve(this.outputDir,'old-schema-start.log'),'utf8');
   assert.equal(healthy,false,'old schema must not serve healthy application');
   if(!ownExit||ownExit.signal!==null||ownExit.code===0||!/Schema mismatch: installed=8, required=9; run npm run db:migrate/.test(log))
    throw new BlockedError('Old-schema startup did not provide its own exact schema diagnostic and exit; arbitrary process failure is not enough');
   this.migrationFacts.oldSchemaRefusal={ownExit,log,healthy,port};
  } catch(error) {probeFailure=error;} finally {
   const failures:unknown[]=[];try {await probe.stop();}catch(error){failures.push(error);}
   await this.evidence('legacy-probe-cleanup',{failures:failures.map(String),exitOutcome:probe.exitOutcome});
   if(failures.length)throw new AggregateError(probeFailure?[probeFailure,...failures]:failures,'Old-schema probe cleanup incomplete');
  }
  if(probeFailure)throw probeFailure;
  assert.deepEqual(await this.snapshot(),before,'refused startup leaves old data and ledger intact');
  await super.migrate();
  const one=await this.snapshot();
  assert.deepEqual(one.ledger.slice(0,8),before.ledger);assert.equal(one.ledger.length,9);
  assert.equal(one.ledger[8]!.name,'009_media_files.sql');
  assert.equal(one.ledger[8]!.checksum,sha(await readFile(resolve(this.config.sut.cwd,'db/migrations/009_media_files.sql'))));
  assert.deepEqual(one.messages,before.messages);assert.deepEqual(one.runs,before.runs);
  const files=await this.query('SELECT id,group_id,msg_id,source_url,state,local_file_path FROM media_files ORDER BY msg_id');
  assert.equal(files.length,2);assert.ok(files.every(f=>f.state==='pending'&&f.local_file_path===null));
  const refs=await this.query('SELECT run_id,media_id FROM agent_media_references ORDER BY media_id');
  assert.equal(refs.length,2);assert.ok(refs.every(r=>r.run_id===this.legacyRun));
  await super.migrate();const twice=await this.snapshot();assert.deepEqual(twice,one);
  assert.deepEqual(await this.query('SELECT id,group_id,msg_id,source_url,state,local_file_path FROM media_files ORDER BY msg_id'),files);
  assert.deepEqual(await this.query('SELECT run_id,media_id FROM agent_media_references ORDER BY media_id'),refs);
  this.migrationFacts={...this.migrationFacts,after:one,repeated:twice,mediaTasks:files,conservativeReferences:refs};
  await this.evidence('migration-upgraded',this.migrationFacts);
 }
 async verifyRestart() {
  await this.api.login();
  const rows=await eventually(()=>this.query('SELECT msg_id,state,local_file_path FROM media_files WHERE group_id=$1 ORDER BY msg_id',[this.legacyGroup]),
   rows=>rows.length===2&&rows.some(r=>r.msg_id==='qa-legacy-downloadable'&&r.state==='ready')&&rows.some(r=>r.msg_id==='qa-legacy-expired'&&r.state==='unavailable'),{timeoutMs:20000});
  const downloaded=rows.find(r=>r.msg_id==='qa-legacy-downloadable')!;
  await assertOwnedBytes(downloaded.local_file_path,this.mediaDirectory,this.bytes);
  const before=await this.api.messages(this.legacyGroup);assert.equal(before.items.length,3);
  for(const item of this.fixtureRows)assert.equal(before.items.find(r=>r.msgId===item.id)?.text,item.text);
  assert.equal(before.items.find(r=>r.msgId==='qa-legacy-downloadable')?.localFilePath,downloaded.local_file_path);
  assert.ok(!before.items.find(r=>r.msgId==='qa-legacy-expired')?.localFilePath);
  assert.ok(!before.items.find(r=>r.msgId==='qa-legacy-ordinary')?.localFilePath);
  const db=this.ownedStorage().database,ids=await actualListenerIdentity(this.api.baseUrl),root=await realpath(this.mediaDirectory);
  // Documented safe restart boundary: completed migration and published real
  // file, then abrupt application exit. No claim of arbitrary fsync survival.
  await this.restart('SIGKILL');const next=await actualListenerIdentity(this.api.baseUrl);
  assert.notEqual(ids[0]!.pid,next[0]!.pid);assert.equal(this.ownedStorage().database,db);assert.equal(await realpath(this.mediaDirectory),root);
  await assertOwnedBytes(downloaded.local_file_path,this.mediaDirectory,this.bytes);
  const after=await this.api.messages(this.legacyGroup);
  assert.deepEqual(after.items.map(r=>({id:r.msgId,text:r.text,path:r.localFilePath})).sort((a,b)=>String(a.id).localeCompare(String(b.id))),before.items.map(r=>({id:r.msgId,text:r.text,path:r.localFilePath})).sort((a,b)=>String(a.id).localeCompare(String(b.id))));
  const facts={boundary:'migration committed and real media published, then owned SIGKILL and current normal startup',beforePids:ids,afterPids:next,database:db,mediaRoot:root,mediaSha256:sha(await readFile(downloaded.local_file_path)),before,after,sourceRequests:this.mediaSource!.snapshot(),limits:'No hardware/fsync mid-write claim; seeded running reference is a migration preservation fixture only'};
  await this.evidence('migration-media-restart',facts);return facts;
 }
}
