import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { Client } from 'pg';
import { OwnedDatabaseCluster } from '../../harness/database.js';
import { exec, isolatedEnv } from '../../harness/process.js';
import { redact } from '../../harness/security.js';
import { validateFixtureManifest, assertPrecisionBoundaries } from '../../harness/fixture-artifacts.js';
const root=resolve(import.meta.dirname,'../..');
const sut='/Users/zcm/.codex/worktrees/qa-sut-evidence-retest/kapibala';
const revision='2716abdd2d43a779b6a0972a6323f895cf2b5b9c';
const out=resolve(root,'reports/followup/20261001-2716abd-retest',`fixture-schema9-${randomUUID()}`);
await mkdir(out,{recursive:false});
const rel=(p:string)=>relative(root,p);
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const save=async(name:string,value:unknown)=>writeFile(resolve(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const cluster=new OwnedDatabaseCluster('postgres:17-alpine');
const docker=(args:string[])=>exec('docker',['--host','unix:///var/run/docker.sock',...args],{env:isolatedEnv({}),timeout:30000,maxBuffer:4*1024*1024});
const dbs:string[]=[];
let resource:any;
let review:any={kind:'INDEPENDENT_QA_SCHEMA9_FIXTURE_PREPARATION',candidateRevision:revision,startedAt:new Date().toISOString(),reviewer:'Independent AI QA / intake_smoke_gate',authorizationReference:'Root delegated explicit user-authorized isolated DB/migration/export on 2026-10-01; no SUT or product cases',productExecution:'NOT_RUN',productVerdict:'NOT_ISSUED',out:rel(out)};
const oldConfig=JSON.parse(await readFile(resolve(root,'config/fixtures.integration-86ad4e7.json'),'utf8'));
const oldLegacy=JSON.parse(await readFile(resolve(root,'fixtures/20261001-86ad4e7/legacy-schema.json'),'utf8'));
const oldPrecision=JSON.parse(await readFile(resolve(root,'fixtures/20261001-86ad4e7/directory-precision.json'),'utf8'));
// Expected truth is frozen before creating resources or querying any database.
const ledgerBytes=await readFile(resolve(root,'reports/integration/20261001-fixture-intake/independent-ledger.json'));
assert.equal(sha(ledgerBytes),'c9c16632a99880691498286235c4479687ec1677082c5b313fc131034529fac5');
const ledger=JSON.parse(ledgerBytes.toString());
const oracle={version:1,frozenAt:new Date().toISOString(),candidateRevision:revision,source:'Preapproved QA six-row ledger, unchanged business data across official schema8→9 migration; never inferred from SQL/API output',parentLedgerSha256:sha(ledgerBytes),query:ledger.query,rows:ledger.rows,orderIds:ledger.orderIds,producerDefaults:ledger.producerDefaults};
assertPrecisionBoundaries(oracle.rows,2);
await save('independent-oracle.json',oracle);
await copyFile(new URL(import.meta.url),resolve(out,'preparation-script.ts'));
async function createDb(){const db=await cluster.createDatabase();dbs.push(db);return db;}
async function assertOwned(){const i=JSON.parse((await docker(['inspect',cluster.name])).stdout)[0];assert.equal(i.Id,resource.Id);assert.equal(i.Config.Labels['qa.owner'],cluster.owner);assert.equal(i.State.Running,true);return i;}
async function restore(db:string,path:string){assert(cluster.ownsDatabase(db));await assertOwned();const remote=`/tmp/${db}.dump`;await docker(['cp',path,`${resource.Id}:${remote}`]);const r=await docker(['exec',resource.Id,'pg_restore','--username=qa',`--dbname=${db}`,'--single-transaction','--exit-on-error','--no-owner','--no-privileges',remote]);await save(`restore-${db}.json`,{db,archive:rel(path),stdout:r.stdout,stderr:r.stderr});}
async function inspect(db:string,schema:number,rows:number){
 assert(cluster.ownsDatabase(db));await assertOwned();const client=new Client({connectionString:cluster.url(db),connectionTimeoutMillis:2000,query_timeout:5000});
 try {await client.connect();await client.query('BEGIN READ ONLY');
  const migrations=(await client.query('SELECT version,name,checksum FROM schema_migrations ORDER BY version')).rows;
  assert.equal(migrations.length,schema);assert.equal(migrations.at(-1).version,schema);
  for(const m of migrations)assert.equal(m.checksum,sha(await readFile(resolve(sut,'db/migrations',m.name))));
  const accounts=(await client.query('SELECT id,status FROM accounts ORDER BY id')).rows;assert.equal(accounts.length,6);assert(accounts.every(x=>x.status==='idle'));
  const groups=(await client.query(`SELECT id,name,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS micros,agent_enabled,auto_kick_enabled,status FROM groups ORDER BY id`)).rows;
  assert.equal(groups.length,rows);
  if(rows)assert.deepEqual(groups,oracle.rows.map((r:any)=>({id:r.id,name:r.public.name,micros:r.createdAtMicros,agent_enabled:false,auto_kick_enabled:false,status:'active'})));
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const counts:Record<string,number>={};for(const {tablename}of tables){assert(/^[a-z_]+$/.test(tablename));counts[tablename]=Number((await client.query(`SELECT count(*)::text AS n FROM "${tablename}"`)).rows[0].n);if(!['schema_migrations','accounts','groups'].includes(tablename))assert.equal(counts[tablename],0,`no pending or side-effect data: ${tablename}`);}
  await client.query('ROLLBACK');return{db,schema,migrations,accounts,groups,counts,noPendingWork:true};
 }finally{await client.end();}
}
const normalize=(s:string)=>s.replace(/^\\(?:un)?restrict .+$/gm,'');
async function snapshot(db:string,label:string){const result:any={};for(const kind of ['schema','data']){const r=await docker(['exec',resource.Id,'pg_dump','--username=qa',`--dbname=${db}`,`--${kind}-only`,'--no-owner','--no-privileges']);await writeFile(resolve(out,`${label}-${kind}.sql`),r.stdout,{flag:'wx'});result[kind]={sha256:sha(r.stdout),normalizedSha256:sha(normalize(r.stdout))};}return result;}
try{
 assert.equal((await exec('git',['rev-parse','HEAD'],{cwd:sut,env:isolatedEnv({})})).stdout.trim(),revision);
 assert.equal((await exec('git',['status','--porcelain'],{cwd:sut,env:isolatedEnv({})})).stdout.trim(),'');
 for(const manifest of [oldLegacy,oldPrecision]){const bytes=await readFile(resolve(root,manifest.dump.path));assert.equal(bytes.length,manifest.dump.bytes);assert.equal(sha(bytes),manifest.dump.sha256);}
 review.parents=[oldLegacy.dump,oldPrecision.dump];
 await cluster.start();
 const initial=JSON.parse((await docker(['inspect',cluster.name])).stdout)[0];
 assert.equal(initial.Config.Labels['qa.owner'],cluster.owner);
 resource={Id:initial.Id,Name:initial.Name,owner:cluster.owner,Created:initial.Created,Mounts:initial.Mounts,Ports:initial.NetworkSettings.Ports};
 await save('owned-resource.json',resource);
 const legacyDb=await createDb();await restore(legacyDb,resolve(root,oldLegacy.dump.path));
 review.legacy=await inspect(legacyDb,7,0);review.legacyDumps=await snapshot(legacyDb,'legacy-schema7');
 const precisionDb=await createDb();await restore(precisionDb,resolve(root,oldPrecision.dump.path));
 review.beforeMigration=await inspect(precisionDb,8,6);review.beforeDumps=await snapshot(precisionDb,'precision-schema8');
 const migration=await exec(process.execPath,['--import','tsx','scripts/migrate.ts'],{cwd:sut,env:isolatedEnv({DATABASE_URL:cluster.url(precisionDb)}),timeout:30000,maxBuffer:2*1024*1024});
 await save('official-migration.json',{sourceRevision:revision,command:['node','--import','tsx','scripts/migrate.ts'],exitCode:0,stdout:migration.stdout,stderr:migration.stderr,scope:'only owned restored fixture database; no app/server process'});
 review.afterMigration=await inspect(precisionDb,9,6);review.afterDumps=await snapshot(precisionDb,'precision-schema9');
 assert.deepEqual(review.beforeMigration.groups,review.afterMigration.groups);assert.deepEqual(review.beforeMigration.accounts,review.afterMigration.accounts);
 const precisionPath=resolve(out,'precision-schema9.dump');const remote='/tmp/precision-schema9-export.dump';
 await docker(['exec',resource.Id,'pg_dump','--username=qa',`--dbname=${precisionDb}`,'--format=custom','--no-owner','--no-privileges',`--file=${remote}`]);await docker(['cp',`${resource.Id}:${remote}`,precisionPath]);
 const bytes=await readFile(precisionPath);assert(bytes.subarray(0,5).equals(Buffer.from('PGDMP')));
 const replay=await createDb();await restore(replay,precisionPath);review.roundTrip=await inspect(replay,9,6);review.roundTripDumps=await snapshot(replay,'precision-schema9-roundtrip');
 assert.equal(review.roundTripDumps.schema.normalizedSha256,review.afterDumps.schema.normalizedSha256);assert.equal(review.roundTripDumps.data.normalizedSha256,review.afterDumps.data.normalizedSha256);
 const now=new Date().toISOString(),reference=rel(resolve(out,'review.json'));
 const legacy={...oldLegacy,artifactId:`legacy-schema7-qa-reviewed-2716abd-${cluster.owner}`,candidateRevision:revision,review:{reviewer:review.reviewer,reference,reviewedAt:now},expected:{schemaRelation:'older-than-candidate',rejectionLogIncludes:['Schema mismatch: installed=7, required=9']}};
 const precision={...oldPrecision,artifactId:`directory-schema9-qa-reviewed-2716abd-${cluster.owner}`,candidateRevision:revision,source:{producer:'Independent QA derivative from verified schema8 archive using candidate official scripts/migrate.ts; see full provenance review',revision,exportedAt:now,syntheticOnly:true,noPendingWork:true},review:{reviewer:review.reviewer,reference,reviewedAt:now},dump:{path:rel(precisionPath),sha256:sha(bytes),bytes:bytes.length,format:'pg-custom'},expected:{query:oracle.query,rows:oracle.rows}};
 validateFixtureManifest(legacy,revision);validateFixtureManifest(precision,revision);
 await save('legacy-schema.json',legacy);await save('directory-precision.json',precision);
 const config={...oldConfig,artifacts:{legacySchema:{manifest:rel(resolve(out,'legacy-schema.json')),sha256:sha(await readFile(resolve(out,'legacy-schema.json')))},directoryPrecision:{manifest:rel(resolve(out,'directory-precision.json')),sha256:sha(await readFile(resolve(out,'directory-precision.json')))}},observation:{...oldConfig.observation,candidateRevision:revision,reviewReference:reference},unmigratedSchema:{confirmed:true,candidateRevision:revision,reviewReference:reference,controlSchemaVersion:9,rejectionLogIncludes:['Schema mismatch: installed=0, required=9; run npm run db:migrate']}};
 await save('fixtures.integration-2716abd.json',config);
 const binding={fixtureArtifacts:{configPath:rel(resolve(out,'fixtures.integration-2716abd.json')),sha256:sha(await readFile(resolve(out,'fixtures.integration-2716abd.json')))}};
 await save('fixture-binding.integration-2716abd.json',binding);
 review.binding=binding;review.newArchive=precision.dump;review.expectedOracleSha256=sha(await readFile(resolve(out,'independent-oracle.json')));
 review.schemaDiagnosticBasis='Candidate migration checker unchanged SHA256 4e049ea6d5a3225ed309bb0b85447a8de79b0905435d0e5a52d6e497ea251068; 9 actual checksummed migrations. Legacy exact 7 and blank 0 imply versioned public diagnostic. No candidate startup/rejection claim made here.';
 review.uiMappingBasis='Accounts.tsx byte-identical 86ad→2716 SHA256 576293ca0b9d2ab33d9f9c1a048a7386f1d4012a735058ceb4524b067c424560. Reuses actual prior selector review; attention behavior changed elsewhere still requires new tests. No browser execution.';
 review.status='RESTORED_MIGRATED_EXPORTED_AND_ROUNDTRIP_REVIEWED';
}catch(error){review.status='PREPARATION_FAILED';review.error=redact(String(error));process.exitCode=1;}
finally{
 const cleanup:any={startedAt:new Date().toISOString(),resources:resource??null,databases:dbs};
 try{for(const db of dbs)if(cluster.ownsDatabase(db))await cluster.dropDatabase(db);await cluster.close();cleanup.containerRemoved=true;
 if(resource){try{await docker(['inspect',resource.Id]);throw new Error('container still exists');}catch(e){assert(/No such (?:object|container)/i.test(String(e)));}
 cleanup.volumes=[];for(const mount of resource.Mounts.filter((m:any)=>m.Type==='volume')){try{await docker(['volume','inspect',mount.Name]);throw new Error('owned volume still exists');}catch(e){assert(/no such volume/i.test(String(e)));cleanup.volumes.push({name:mount.Name,verifiedAbsent:true});}}}
 }catch(error){cleanup.error=redact(String(error));process.exitCode=1;}
 cleanup.completedAt=new Date().toISOString();await save('cleanup.json',cleanup);review.completedAt=new Date().toISOString();review.cleanup=rel(resolve(out,'cleanup.json'));await save('review.json',review);
 console.log(JSON.stringify({out:rel(out),status:review.status,exitCode:process.exitCode??0,binding:review.binding,cleanupError:cleanup.error??null}));
}
