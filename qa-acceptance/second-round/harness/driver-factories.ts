import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TargetConfig } from '../../harness/types.js';
import type { OwnedDatabaseCluster } from '../../harness/database.js';
import { eventually, type Group } from '../../harness/platform-client.js';
import { exec } from '../../harness/process.js';
import { redact } from '../../harness/security.js';
import { C1_CAPABILITIES as M,C2_CAPABILITIES as P,PreparationBlocked,type Evidence,type Json,type ProviderDriver,type MediaDriver,type BackendFacts } from '../contracts/media-provider.js';
import { SecondRoundEnvironment,OwnedOfflineProvider,actualListenerIdentity } from './environment.js';
import { createMediaHttpDriver } from './media-driver.js';
import { MediaDatabaseFixtures } from './media-fixtures.js';
import { createProviderHttpDriver } from './provider-driver.js';
import { ProviderUsageFiles } from './provider-usage.js';
import { decodeProviderWire } from './provider-wire.js';
import { ServiceRelay } from './service-relay.js';

export interface DriverContext {target:TargetConfig;cluster:OwnedDatabaseCluster;outputDir:string;runtimeDir:string}
const proof=(reference:string,raw:unknown):Evidence=>({reference,raw:JSON.parse(JSON.stringify(raw)) as Json});
export function mediaDriver(context:DriverContext):MediaDriver {
  let env:SecondRoundEnvironment|undefined,variant=0,serial=0;
  const active=()=>{if(!env)throw new PreparationBlocked('Media environment not open');return env;};
  const fixture=new MediaDatabaseFixtures(active,`${context.target.sut.revision}:docs/qa-media-scenarios-20261002.md`);
  const evidence=async(name:string,value:unknown)=>{
    const directory=env?.outputDir??context.outputDir;await mkdir(directory,{recursive:true});
    await writeFile(resolve(directory,`${++serial}-${name}.json`),redact(value));
  };
  return createMediaHttpDriver({contractReference:fixture.contractReference,
    capabilities:[M.age,M.cleanup,M.barriers,M.restart,M.multi,M.references],
    retentionContract:{reference:`${context.target.sut.revision}:docs/qa-media-scenarios-20261002.md`,zeroDaysSupported:true},
    open:async(options={})=>{
      env=new SecondRoundEnvironment(context.target,context.cluster,resolve(context.outputDir,`variant-${++variant}`),resolve(context.runtimeDir,`variant-${variant}`),options);
      await env.initialize();await env.api.login();
      return {ownership:await env.ownership('c1-media-files'),api:env.api,gateway:env.gateway,agent:env.agent,source:env.mediaSource!,mediaDirectory:env.mediaDirectory,retentionDays:Number(options.retentionDays??30)};
    },evidence,
    cleanup:async()=>{const failures:string[]=[];
      // A fixture gate is released while the app is already stopped, so cleanup cannot dispatch a pending effect.
      try{await env?.kill('SIGKILL');}catch(e){failures.push(String(e));}
      try{await fixture.cleanup();}catch(e){failures.push(String(e));}
      try{await env?.close();}catch(e){failures.push(String(e));}
      const value={failures,evidence:proof('media:cleanup',{failures,variant})};await evidence('cleanup-summary',value);env=undefined;return value;},
    operations:{age:fixture.age.bind(fixture),cycle:fixture.cycle.bind(fixture),hold:fixture.hold.bind(fixture),secondInstance:fixture.secondInstance.bind(fixture),
      startReference:fixture.startReference.bind(fixture),run:fixture.run.bind(fixture),agentRequests:fixture.agentRequests.bind(fixture),finishReference:fixture.finishReference.bind(fixture),
      restart:async(mode)=>{const e=active(),before=await actualListenerIdentity(e.api.baseUrl),database=e.ownedStorage().database;
        await e.restart(mode);const after=await actualListenerIdentity(e.api.baseUrl);
        return {beforePid:before[0].pid,afterPid:after[0].pid,directoryPreserved:true,databasePreserved:database===e.ownedStorage().database,
          evidence:proof('media:actual-restart',{before,after,mode,database,mediaDirectory:e.mediaDirectory})};},
    }});
}

export function providerDriver(context:DriverContext):ProviderDriver {
  let provider:OwnedOfflineProvider|undefined,env:SecondRoundEnvironment|undefined,relay:ServiceRelay|undefined,variant=0,serial=0,options:Record<string,Json>={};
  const groups=new Map<string,Group>();
  const active=()=>{if(!provider)throw new PreparationBlocked('Provider environment not open');return provider;};
  const evidence=async(name:string,value:unknown)=>{const dir=provider?.outputDirectory??context.outputDir;await mkdir(dir,{recursive:true});await writeFile(resolve(dir,`${++serial}-${name}.json`),redact(value));};
  const logs=async()=>{const p=active();const names=(await readdir(p.outputDirectory)).filter(n=>/^provider-\d+\.log$/.test(n));return Promise.all(names.map(n=>readFile(resolve(p.outputDirectory,n),'utf8')));};
  const getEnvironment=async()=>{
    if(!env){env=new SecondRoundEnvironment(context.target,context.cluster,resolve(active().outputDirectory,'backend'),resolve(active().runtimeDirectory,'backend'));
      if(options.selectedAgent!=='mock')env.externalAgentUrl=relay!.url;
      await env.initialize();await env.api.login();}
    return env;
  };
  let driver:ProviderDriver;
  const usage=new ProviderUsageFiles(()=>({sessionDirectory:active().sessionDirectory,resourceRoot:active().runtimeDirectory,options,
    stopGracefully:async()=>{const result=await active().stop('SIGTERM');if(!result)throw new PreparationBlocked('No actual provider exit outcome');return {...result,evidence:proof('provider:normal-exit',result)};},
    start:async()=>{await active().start(typeof options.usageEnabled==='boolean'?{usageEnabled:options.usageEnabled}:{});relay!.pointTo(active().address);return active().ownership().evidence;},logs}),()=>driver.calls(),`${context.target.sut.revision}:docs/final-enhancement-measurement-20261002.md`);
  driver=createProviderHttpDriver({contractReference:`${context.target.sut.revision}:docs/qa-offline-model-entry-20261002.md`,
    capabilities:[P.backend,P.usage,P.usageFault],
    open:async(opt,upstreamUrl)=>{
      options=opt;groups.clear();provider=new OwnedOfflineProvider(context.target,resolve(context.runtimeDir,`variant-${++variant}`),resolve(context.outputDir,`variant-${variant}`),upstreamUrl,opt);
      await mkdir(provider.outputDirectory,{recursive:true});await provider.start();relay=new ServiceRelay();await relay.start(provider.address);
      return {ownership:provider.ownership(),agentUrl:relay.url,sessionDirectory:provider.sessionDirectory};
    },evidence,logs,
    restart:async(mode,changes)=>{if(changes)options={...options,...changes};const result=await active().restart(mode,changes);if(result.started)relay!.pointTo(active().address);
      return {...result,beforePid:result.beforePid!,agentUrl:relay!.url,evidence:proof('provider:actual-restart',result)};},
    verifyExited:async(pid)=>{try{const line=(await exec('ps',['-o','pid=,lstart=,command=','-p',String(pid)],{timeout:2000})).stdout.trim();if(line)throw new PreparationBlocked('PID still exists; do not reclaim ambiguous owner');}
      catch(e){if(e instanceof PreparationBlocked || (e as {code?:number}).code!==1)throw e;}
      return proof('provider:actual-owner-exited',{pid,absent:true});},
    cleanup:async()=>{const failures:string[]=[];
      try{await env?.close();}catch(e){failures.push(String(e));}env=undefined;
      try{await provider?.stop('SIGTERM');}catch(e){failures.push(String(e));}
      try{if(relay)await evidence('agent-relay-ledger',relay.ledger);await relay?.close();}catch(e){failures.push(String(e));}relay=undefined;
      const result={failures,evidence:proof('provider:cleanup',{failures,variant,actualExit:provider?.lastStopOutcome})};await evidence('cleanup-summary',result);provider=undefined;return result;},
    operations:{usage:usage.usage.bind(usage),usageFiles:usage.usageFiles.bind(usage),settleUsage:usage.settleUsage.bind(usage),usageWriteFault:usage.usageWriteFault.bind(usage),diagnostics:usage.diagnostics.bind(usage),
      deploymentBinding:async()=>{const e=await getEnvironment();return {selectedAgent:options.selectedAgent==='mock'?'mock':'independent',changedBackendSettings:options.selectedAgent==='mock'?[]:['AGENT_URL'],upstreamCalls:(await driver.calls()).length,
        evidence:proof('provider:backend-binding',{configuredAgent:e.externalAgentUrl??e.agent.url,defaultMock:e.agent.url,realProviderRelay:relay!.url})};},
      backendGroup:async(policy)=>{const e=await getEnvironment(),created=await e.api.createGroup(2),group=created.group;groups.set(group.id,group);
        const target=policy.managedTarget?created.accounts[1].platformUserId!:`qa-external-${randomUUID()}`;
        if(!policy.managedTarget)e.gateway.setMembership(group.gatewayGroupId,target,true);
        if(policy.executor==='none')for(const account of created.accounts)await e.api.require(e.api.post(`/api/accounts/${account.id}/transition`,{expectedFrom:'online',to:'disconnected'}));
        if(policy.executor==='member')for(const account of created.accounts)e.gateway.setMemberRole(group.gatewayGroupId,account.platformUserId!,'member');
        await e.api.require(e.api.patch(`/api/groups/${group.id}`,{autoKickEnabled:policy.autoKickEnabled,agentEnabled:true}));
        const observed=await eventually(()=>e.api.group(group.id),g=>g.members.some(m=>m.platformUserId===target)&&
          (policy.executor!=='member'||g.members.filter(m=>m.accountId).every(m=>m.role==='member')));
        return {groupId:group.id,target,evidence:proof('provider:backend-group',{policy,group:observed,accounts:await e.api.accounts()})};},
      triggerBackend:async(groupId)=>{const e=await getEnvironment(),g=groups.get(groupId)!;
        e.gateway.emitMessage({groupId:g.gatewayGroupId,senderPlatformUserId:'qa-provider-trigger',text:`trigger-${randomUUID()}`});
        const rows=await eventually(()=>e.api.require(e.api.get<{id:string}[]>(`/api/groups/${groupId}/agent-runs`)),x=>x.length===1);return rows[0].id;},
      backendRun:async(runId,budget)=>{const e=await getEnvironment();const run=await eventually(()=>e.api.agentRun(runId),r=>r.status!=='running',{timeoutMs:budget});await evidence('provider-backend-run',run);return {...run,raw:run as unknown as Json};},
      backendFacts:async(groupId):Promise<BackendFacts>=>{const e=await getEnvironment(),g=groups.get(groupId)!,snap=e.gateway.snapshot(),calls=await driver.calls();
        const requests=snap.requests.filter(r=>r.path.startsWith(`/groups/${g.gatewayGroupId}/`));
        const sends=requests.filter(r=>r.method==='POST'&&r.path.endsWith('/send')).map(r=>({id:String(r.id),clientMsgId:String((r.body as {clientMsgId:string}).clientMsgId),text:String((r.body as {text:string}).text)}));
        const kicks=requests.filter(r=>r.method==='POST'&&r.path.endsWith('/kick')).map(r=>({id:String(r.id),target:String((r.body as {targetPlatformUserId:string}).targetPlatformUserId)}));
        const runIds=new Set((await e.api.require(e.api.get<{id:string}[]>(`/api/groups/${groupId}/agent-runs`))).map(r=>r.id));
        const decoded=calls.map(c=>({call:c,payload:decodeProviderWire(`/v1beta/models/${c.model}:generateContent`,c.rawWire).payload}));
        const audits=decoded.filter(c=>c.call.purpose==='audit'&&c.payload.groupId===groupId).map(c=>({id:c.call.id,text:c.call.auditText??'',verdict:null}));
        const turns=decoded.filter(c=>c.call.purpose==='turn'&&runIds.has(String(c.payload.runId))).map(c=>({id:c.call.id,runId:String(c.payload.runId)}));
        const effects=snap.effects.filter(f=>f.groupId===g.gatewayGroupId&&(f.kind==='send'||f.kind==='kick')).map((f,i)=>({id:String(i),kind:f.kind as 'send'|'kick',identity:f.clientMsgId??f.platformUserId??''}));
        const publicMessages=(await e.api.messages(groupId)).items.filter(m=>m.isOwn&&m.clientMsgId).map(m=>({clientMsgId:m.clientMsgId!,deliveryStatus:m.deliveryStatus}));
        const value={sends,kicks,audits,turns,effects,publicMessages};await evidence('provider-backend-facts',{...value,gateway:snap});return {...value,evidence:proof('provider:backend-facts',value)};},
    }});
  Object.defineProperty(driver,'usageContract',{get:()=>provider?usage.contract():null});
  return driver;
}
