import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox, webkit, type Browser } from '@playwright/test';
import { exec, isolatedEnv, OwnedProcess } from '../../harness/process.js';
import { loadTarget, requireAuthorization, targetFingerprint, redact, BlockedError } from '../../harness/security.js';
import { OwnedDatabaseCluster } from '../../harness/database.js';
import type { TargetConfig } from '../../harness/types.js';
import { secondRoundCases, secondRoundFingerprint, secondRoundRoot } from './scope.js';
import { OwnedControllers } from './controllers.js';
import { SecondRoundEnvironment } from './environment.js';
import { runProviderTransportCase } from './provider-transport-cases.js';
import { runProviderRegressionCase } from './backend-provider-regressions.js';
import { runMediaIoCase } from './media-io-cases.js';
import { runMediaMigrationCase } from './media-migration-case.js';
import { runProviderBudgetCase } from './backend-provider-budgets.js';
import { runMediaUiCase } from './media-ui.js';
import { runMediaObservationCase } from './media-observation-cases.js';
import { mediaDriver, providerDriver, providerEnvironment } from './driver-factories.js';
import { runUiCase } from './ui-runner.js';
import { runBackendCase, BACKEND_EXECUTABLE_IDS } from '../tests/backend-flows.js';
import { runTimelineCase } from './timeline-driver.js';
import { runDeliveryCase } from './delivery-driver.js';
import { runDeliveryRecoveryCase } from './delivery-recovery.js';
import { runUsageCase, providerUsageConfiguration } from './provider-usage-cases.js';
import * as operations from '../tests/media-provider.js';
import { classifyError, combineVariants, type RoundResult } from './result.js';
import { writeSecondRoundReport } from './report.js';

// Only this explicit, separately authorized entry can execute second-round cases.
// One fixed batch preserves its first outcome. A correction requires another run directory.
const args=process.argv.slice(2), value=(name:string)=>args[args.indexOf(name)+1];
if(!args.includes('--sut')||!args.includes('--revision'))throw new Error('Required --sut ABSOLUTE --revision FULL_SHA');
const sut=await realpath(value('--sut')),revision=value('--revision');
assert.match(revision,/^[a-f0-9]{40}$/);
const browserName=args.includes('--browser')?value('--browser'):'chromium';
assert.ok(['chromium','firefox','webkit'].includes(browserName),'supported independent browser engine required');
const qaRoot=resolve(secondRoundRoot,'..'),workspace=resolve(qaRoot,'..');
const git=async(cwd:string,...a:string[])=>(await exec('git',a,{cwd,maxBuffer:8*1024*1024})).stdout.trim();
assert.notEqual(sut,workspace,'QA and SUT checkouts are separate');
assert.equal(await git(sut,'rev-parse','HEAD'),revision);
assert.equal(await git(sut,'status','--porcelain','--untracked-files=all'),'');
const qaDirty=(await git(workspace,'status','--porcelain','--untracked-files=all')).split('\n').filter(Boolean).filter(line=>!line.startsWith('?? qa-acceptance/second-round/reports/runs/'));
assert.deepEqual(qaDirty,[],'freeze all QA source, including untracked drivers, before execution');
const qaRevision=await git(workspace,'rev-parse','HEAD'),scope=JSON.parse(await readFile(resolve(secondRoundRoot,'config/execution-scope.json'),'utf8'));
assert.equal(scope.authorization.executionAuthorized,true);assert.equal(scope.authorization.realProviderAuthorized,false);
const runId=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`;
const out=resolve(secondRoundRoot,'reports/runs',runId),runtime=resolve(qaRoot,'.runtime/second-round',runId);
await mkdir(out,{recursive:true});await mkdir(runtime,{recursive:true,mode:0o700});
const fingerprint=await secondRoundFingerprint(),cases=await secondRoundCases();
const manifest:Record<string,unknown>={runId,sutRevision:revision,qaRevision,secondRoundSha256:fingerprint,
  startedAt:new Date().toISOString(),sutDirectory:sut,qaDirectory:qaRoot,authority:scope.authorization,finalExecutionBoundary:scope.finalExecutionBoundary,
  autoRetries:0,browserName,node:process.version,productionReadiness:'NOT_ASSESSED',runnerErrors:[],
  originalRequirementSha256:createHash('sha256').update(await readFile(resolve(sut,'docs/original-interview-question.md'))).digest('hex')};
const saveManifest=()=>writeFile(resolve(out,'manifest.json'),redact(manifest)+'\n');
const event=async(v:unknown)=>{await appendFile(resolve(out,'events.ndjson'),JSON.stringify({at:new Date().toISOString(),...v as object})+'\n');};
const results:RoundResult[]=[];let controllers:OwnedControllers|undefined,cluster:OwnedDatabaseCluster|undefined,browser:Browser|undefined;
let ownedDatabaseResource:{id:string;volumes:string[]} | undefined;
const errors=manifest.runnerErrors as string[];
console.log(JSON.stringify({event:'run-created',runId,out,revision,qaRevision}));
try {
  for(const [key,command] of [['installation',{command:'npm',args:['ci']}],['build',{command:'npm',args:['run','build']}]] as const) {
    const log=resolve(out,`${key}.log`),processOwner=new OwnedProcess({command:command.command,args:[...command.args]},sut,isolatedEnv({}),log);
    const start=new Date().toISOString();await processOwner.runOnce(600000);
    manifest[key]={exitCode:0,evidence:log,command,startedAt:start,completedAt:new Date().toISOString()};await saveManifest();
  }
  await mkdir(resolve(out,'controllers'));
  controllers=new OwnedControllers(sut,revision,resolve(out,'controllers'));
  const adapters=await controllers.start();
  const target=JSON.parse(await readFile(resolve(qaRoot,'config/target.example.json'),'utf8')) as TargetConfig;
  target.sut.cwd=sut;target.sut.revision=revision;
  target.sut.start={command:process.execPath,args:['--import','tsx','scripts/qa-observation-server.ts']};
  target.sut.env={};target.sut.startupTimeoutMs=60000;
  (target.ui as typeof target.ui & {browserName:string}).browserName=browserName;
  target.ui.adapterConfirmed=true;target.ui.headless=!args.includes('--headed');target.adapters=adapters;
  const targetPath=resolve(runtime,'target.json');await writeFile(targetPath,JSON.stringify(target,null,2));
  const validated=await loadTarget(targetPath,qaRoot);
  const authorization={version:1,scope:'second-round',approvedBy:'Project owner (verified direct user messages)',
    approvalReference:`thread:${scope.authorization.sourceThreadId}/message:${scope.authorization.humanApprovalMessageId}`,
    approvedAt:scope.authorization.approvedAt,expiresAt:new Date(Date.now()+24*3600000).toISOString(),
    sutRevision:revision,sutDirectory:sut,targetSha256:targetFingerprint(validated),secondRoundSha256:fingerprint,
    allowedActions:['start-isolated-sut','create-owned-database','fault-injection','kill-owned-process','browser-automation']};
  const authPath=resolve(runtime,'authorization.json');await writeFile(authPath,JSON.stringify(authorization,null,2),{mode:0o600});
  for(const name of ['QA_EXECUTION_SUITE_ID','QA_EXECUTION_SUITE_SHA256','QA_EXECUTION_BUSINESS_SHA256','QA_EXECUTION_MANUAL_SHA256'])delete process.env[name];
  process.env.QA_EXECUTION_KIND='second-round';process.env.QA_EXECUTION_SECOND_ROUND_SHA256=fingerprint;process.env.QA_EXECUTION_AUTHORIZATION=authPath;
  await requireAuthorization(validated);
  await writeFile(resolve(out,'target.json'),JSON.stringify(validated,null,2));await writeFile(resolve(out,'authorization.json'),JSON.stringify(authorization,null,2));
  manifest.targetSha256=authorization.targetSha256;await saveManifest();
  cluster=new OwnedDatabaseCluster(validated.database.image);await cluster.start();
  const dbInfo=JSON.parse((await exec('docker',['--host','unix:///var/run/docker.sock','inspect',cluster.name])).stdout)[0];
  assert.equal(dbInfo.Config.Labels['qa.owner'],cluster.owner);
  ownedDatabaseResource={id:dbInfo.Id,volumes:dbInfo.Mounts.filter((m:{Type:string})=>m.Type==='volume').map((m:{Name:string})=>m.Name)};
  await writeFile(resolve(out,'database-owner.json'),JSON.stringify({name:cluster.name,owner:cluster.owner,port:cluster.port,image:cluster.image,...ownedDatabaseResource},null,2));
  const smoke=JSON.parse(await readFile(resolve(secondRoundRoot,'config/smoke-selection.json'),'utf8'));
  const smokeIds=new Set<string>(smoke.groups.flatMap((g:{cases:{id:string}[]})=>g.cases.map(c=>c.id)));
  const selected=args.includes('--cases')?new Set(value('--cases').split(',')):undefined;
  if(selected)for(const id of selected)assert.ok(cases.some(c=>c.id===id),`Unknown selected case ${id}`);
  const ordered=[...cases.filter(c=>smokeIds.has(c.id)),...cases.filter(c=>!smokeIds.has(c.id))].filter(c=>!selected||selected.has(c.id));
  manifest.selectedCaseIds=ordered.map(c=>c.id);manifest.selection=selected?'explicit fixed retest batch':'all second-round cases';await saveManifest();
  for(const c of ordered) {
    const dir=resolve(out,'cases',c.id),rt=resolve(runtime,c.id);await mkdir(dir,{recursive:true});
    const startedAt=new Date().toISOString(),start=performance.now();let qa:SecondRoundEnvironment|undefined,result:RoundResult|undefined;
    const cleanupErrors:string[]=[];
    await event({event:'case-start',caseId:c.id});console.log(JSON.stringify({event:'case-start',caseId:c.id}));
    const pass=(variant:string):RoundResult=>({caseId:c.id,status:'PASS',variants:[{id:variant,status:'PASS',evidence:[dir]}]});
    const environment=async()=>{qa=new SecondRoundEnvironment(validated,cluster!,dir,rt);await qa.initialize();await qa.api.login();await qa.ownership('c1-media-files');return qa;};
    try {
      if(c.id==='SR-C1-013') {
        if(!browser)browser=await ({chromium,firefox,webkit}[browserName as 'chromium'|'firefox'|'webkit']).launch({headless:validated.ui.headless??true});
        await runMediaUiCase(await environment(),browser);result=pass('actual-media-ws-and-background-notification-control');
      } else if(c.id==='SR-C1-008'||c.id==='SR-C1-014') {
        result=await runMediaObservationCase(c.id,{target:validated,cluster,outputDir:dir,runtimeDir:rt});
      } else if(c.id==='SR-C1-012') {
        result=await runMediaMigrationCase({target:validated,cluster,outputDir:dir,runtimeDir:rt});
      } else if(c.id==='SR-C1-015') {
        result=await runMediaIoCase({target:validated,cluster,outputDir:dir,runtimeDir:rt});
      } else if(c.id==='SR-C2-010'||c.id==='SR-C2-019') {
        const driver=providerDriver({target:validated,cluster,outputDir:dir,runtimeDir:rt});
        result=await (c.id==='SR-C2-010'?runProviderBudgetCase:runProviderRegressionCase)({providerDriver:driver,providerEnvironment:()=>providerEnvironment(driver),outputDir:dir});
      } else if(c.id==='SR-C2-020') {
        await runProviderTransportCase(providerDriver({target:validated,cluster,outputDir:dir,runtimeDir:rt}));result=pass('actual-offline-transport-and-owned-exit-facts');
      } else if(c.id==='SR-C2-018') {
        await providerUsageConfiguration(providerDriver({target:validated,cluster,outputDir:dir,runtimeDir:rt}));result=pass('actual-offline-config-and-owned-temp-matrix');
      } else if(c.id.startsWith('SR-C1-')||c.id.startsWith('SR-C2-')) {
        const name=c.automation?.split('#')[1];
        if(!name||!(name in operations))throw new BlockedError(`No reviewed executable entry for ${c.id}; ${c.dependencies?.join(', ')}`);
        const operation=operations[name as keyof typeof operations] as (driver:unknown)=>Promise<void>;
        const context={target:validated,cluster,outputDir:dir,runtimeDir:rt};
        await operation(c.id.startsWith('SR-C1-')?mediaDriver(context):providerDriver(context));result=pass('actual-independent-driver-and-all-declared-variants');
      } else if(c.id.startsWith('SR-BE-USG-')) {
        const context={target:validated,cluster,outputDir:dir,runtimeDir:rt};await runUsageCase(c.id,providerDriver(context),context);result=pass('actual-provider-usage-case-obligations');
      } else if(c.id.startsWith('SR-UI-')||c.id==='SR-BE-DEL-006') {
        if(!browser)browser=await ({chromium,firefox,webkit}[browserName as 'chromium'|'firefox'|'webkit']).launch({headless:validated.ui.headless??true});
        const checks=await runUiCase(c.id,{qa:await environment(),browser,outputDir:dir});
        await writeFile(resolve(dir,'checks.json'),JSON.stringify(checks,null,2));result=pass('actual-browser-public-effects');
      } else if(c.id==='SR-BE-POL-007') {
        const driver=providerDriver({target:validated,cluster,outputDir:dir,runtimeDir:rt});
        const placeholder=new SecondRoundEnvironment(validated,cluster,dir,rt);
        result=await runBackendCase(c.id,{qa:placeholder,outputDir:dir,sutDirectory:sut,providerDriver:driver,providerEnvironment:()=>providerEnvironment(driver)});
      } else if((BACKEND_EXECUTABLE_IDS as readonly string[]).includes(c.id)) {
        result=await runBackendCase(c.id,{qa:await environment(),outputDir:dir,sutDirectory:sut});
      } else if(c.id.startsWith('SR-BE-DB-'))result=await runTimelineCase(c.id,await environment());
      else if(c.id==='SR-BE-DEL-005') result=await runDeliveryRecoveryCase({target:validated,cluster,outputDir:dir,runtimeDir:rt});
      else if((c.id.startsWith('SR-BE-DEL-')&&c.id!=='SR-BE-DEL-005')||c.id.startsWith('SR-BE-MUT-')) {
        result=await runDeliveryCase(c.id,{sutDirectory:sut,outputDir:dir,manifest,qa:c.id==='SR-BE-DEL-004'?await environment():undefined});
      } else throw new BlockedError(`Declared case remains missing an independently observed engineering fault window; ${c.dependencies?.join(', ')}; see requirements/current-execution.md and reports/readiness/backend.json`);
    } catch(error) {
      const status=classifyError(error),reason=String(error);
      await writeFile(resolve(dir,'error.json'),redact({name:(error as Error)?.name,message:reason,stack:(error as Error)?.stack,matcherResult:(error as {matcherResult?:unknown})?.matcherResult}));
      result={caseId:c.id,status,reason,variants:[{id:'actual-attempt',status,reason,evidence:[resolve(dir,'error.json')]}]};
    } finally {
      try{await qa?.close();}catch(e){cleanupErrors.push(String(e));}
    }
    assert.ok(result);result.cleanupErrors=[...(result.cleanupErrors??[]),...cleanupErrors];result.status=combineVariants(result.variants,[...(result.uncoveredVariants??[]),...result.cleanupErrors]);
    result.startedAt=startedAt;result.completedAt=new Date().toISOString();result.durationMs=performance.now()-start;result.attempt=1;result.phase=smokeIds.has(c.id)?'smoke':'acceptance';
    results.push(result);await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2)+'\n');await event({event:'case-complete',caseId:c.id,status:result.status,durationMs:result.durationMs,reason:result.reason});
    console.log(JSON.stringify({event:'case-complete',caseId:c.id,status:result.status,durationMs:result.durationMs,reason:result.reason}));
    await writeSecondRoundReport(out,manifest,results);
  }
} catch(error) {errors.push(String(error));await event({event:'runner-error',error:String(error),stack:(error as Error)?.stack});console.error(error);}
finally {
  for(const [name,close] of [['browser',()=>browser?.close()],['database',()=>cluster?.close()],['controllers',()=>controllers?.close()]] as const)
    try{await close();await event({event:'cleanup',resource:name,status:'complete'});}catch(e){errors.push(`${name}: ${String(e)}`);await event({event:'cleanup',resource:name,status:'failed',error:String(e)});}
  if(ownedDatabaseResource) {
    const observations=[];
    for(const [kind,id] of [['container',ownedDatabaseResource.id],...ownedDatabaseResource.volumes.map(id=>['volume',id])]) {
      try {await exec('docker',['--host','unix:///var/run/docker.sock',kind==='volume'?'volume':'container','inspect',id]);
        errors.push(`Owned ${kind} remains after cleanup: ${id}`);observations.push({kind,id,absent:false});}
      catch(e){const value=e as {code?:number;stderr?:string};if(value.code===1&&/no such (object|container|volume)|not found/i.test(value.stderr??''))observations.push({kind,id,absent:true});
        else {errors.push(`Cleanup identity verification unavailable: ${kind} ${id}`);observations.push({kind,id,absent:null,error:String(e)});}}
    }
    await writeFile(resolve(out,'database-cleanup-verification.json'),JSON.stringify(observations,null,2));
  }
  manifest.completedAt=new Date().toISOString();await saveManifest();const report=await writeSecondRoundReport(out,manifest,results);
  console.log(JSON.stringify({event:'report-complete',out,counts:report.counts,verdict:report.verdict,runnerErrors:errors}));
}
