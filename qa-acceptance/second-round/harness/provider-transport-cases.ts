import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { C2_CAPABILITIES as P, PreparationBlocked, type ProviderDriver, type ProviderFault } from '../contracts/media-provider.js';
import { withOwnedDriver, turnRequest } from '../tests/media-provider.js';
import type { ProviderSnapshot } from './provider-observation.js';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(read:()=>Promise<T>,good:(value:T)=>boolean,label:string){const end=performance.now()+10000;do{const value=await read();if(good(value))return value;await sleep(25);}while(performance.now()<end);throw new PreparationBlocked(label+' not observed');}
export function assertProviderTransport(snapshot:ProviderSnapshot,expectedCalls:number,model:string,upstreamOrigin:string){
  const {transport}=snapshot;assert.equal(transport.enabled,true);assert.equal(transport.coverage,'provider-transport-only');assert.equal(transport.truncatedEvents,0);
  const attempts=transport.events.filter(e=>e.kind==='attempt');assert.equal(attempts.length,expectedCalls);assert.equal(new Set(attempts.map(e=>e.requestId)).size,expectedCalls);
  for(const item of attempts){assert.equal(item.details.inputUrl,`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);assert.equal(item.details.inputUrlAllowed,true);assert.equal(item.details.method,'POST');assert.equal(item.details.redirect,'error');assert.equal(item.details.keyHeaderPresent,true);assert.equal(item.details.matchesSyntheticKey,true);assert.equal(item.details.syntheticKeyElsewhere,false);}
  const origin=new URL(upstreamOrigin);
  for(const e of transport.events.filter(e=>e.kind==='request-created')){assert.equal(e.details.hostname,'127.0.0.1');assert.equal(e.details.port,Number(origin.port));assert.equal(e.details.proxyAgent,false);}
  for(const e of transport.events.filter(e=>e.kind==='socket-connected')){assert.equal(e.details.remoteAddress,'127.0.0.1');assert.equal(e.details.remotePort,Number(origin.port));}
}
async function egress(d:ProviderDriver,upstreamOrigin:string,requireExit:boolean){
  const facts=await d.providerEgress(requireExit);await d.evidence('provider-finite-egress-proof',facts);
  let requests=0;
  for(const ledger of facts.ledgers)for(const row of ledger.rows){
    if(row.event==='http-request-created'){assert.equal(typeof row.url,'string');const url=new URL(row.url as string);assert.equal(url.origin,upstreamOrigin,'offline service never creates unrelated logical HTTP destination');assert.match(url.pathname,/^\/v1beta\/models\/gemini-[A-Za-z0-9.-]+:generateContent$/);requests++;}
    const target=row.target as {kind?:string;host?:string;port?:number}|undefined;
    if(row.event==='socket-connect-call'&&target?.kind==='tcp'){assert.equal(row.blocked,false,'policy-blocked TCP attempt remains a product failure');assert.equal(target.host,'127.0.0.1');assert.equal(target.port,Number(new URL(upstreamOrigin).port));}
  }
  assert.equal(requests,(await d.calls()).length,'every actual upstream call has a complete logical HTTP creation record');return facts;
}
async function requestsAndCancellation(driver:ProviderDriver){
  return withOwnedDriver(driver,[P.protocol,P.upstream,P.usage],'provider-transport-endpoints',async(d,owner)=>{
    const upstreamOrigin=owner.endpoints[1]!;let redirectHits=0;const sink=createServer((_req,res)=>{redirectHits++;res.end('must not be reached');});await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));
    const marker=`QA-TRANSPORT-BODY-${randomUUID()}`,model='gemini-3.1-flash-lite';
    try{
      const variants:(ProviderFault|undefined)[]=[undefined,'redirect','http-401','http-429','http-500','network-error','timeout'];
      for(const [index,fault] of variants.entries()){
        const before=(await d.calls()).length,request=turnRequest();request.messages[0]!.content.push({type:'text',text:marker});
        await d.enqueue({purpose:'turn',...(fault?{fault}:{}),proposal:{kind:'text',text:'transport finite check'},...(fault==='redirect'?{redirectLocation:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/redirect-target`}:{})});
        const reply=await d.exchange('/agent/turn',request);assert.equal(reply.status===200,fault===undefined);assert.equal((await d.calls()).length,before+1,'no silent retry/fallback inference');
        const seen=await until(()=>d.usageObservation(),v=>v.snapshot.transport.events.filter(e=>e.kind==='attempt').length===index+1,'current transport attempt');assertProviderTransport(seen.snapshot,index+1,model,upstreamOrigin);
        assert.ok(!JSON.stringify(seen.snapshot).includes(marker));assert.ok(!JSON.stringify(seen.snapshot).includes('qa-offline-synthetic-key'));
        if(fault==='redirect'){assert.equal(redirectHits,0);assert.ok(seen.snapshot.transport.events.some(e=>e.kind==='redirect-rejected'));}
        if(fault==='timeout'){
          const currentAttempt=seen.snapshot.transport.events.filter(e=>e.kind==='attempt').at(-1)!;
          const finished=await until(()=>d.usageObservation(),v=>v.snapshot.transport.events.some(e=>e.requestId===currentAttempt.requestId&&e.kind==='socket-close'),'actual socket close after abort');
          assert.ok(finished.snapshot.transport.events.some(e=>e.requestId===currentAttempt.requestId&&e.kind==='signal-aborted'));
          const wire=await until(()=>d.upstreamFacts(),v=>!!v.records.at(-1)?.connectionClosedAt,'independent source sees request close');assert.equal(wire.records.at(-1)!.responseFinishedAt,null);await d.evidence('provider-timeout-is-cancellation-not-refund',{finished,wire,noProviderBillingClaim:true});
        }
        await d.evidence(`provider-transport-${index}`,{fault:fault??'success',reply,seen});
      }
      assert.equal(new Set((await d.calls()).map(c=>c.model)).size,1);assert.equal((await d.calls())[0]!.model,model);assert.ok(!(await d.logs()).join('\n').includes(marker));
      for(const call of await d.calls())assert.ok(!JSON.stringify(call.rawWire).includes('qa-offline-synthetic-key'));
      const stopped=await d.stopProvider('SIGTERM');assert.equal(stopped.exit.code,0);assert.equal(stopped.exit.signal,null);assert.equal((await d.lockState()).exists,false);await egress(d,upstreamOrigin,true);
    }finally{await new Promise<void>(r=>sink.close(()=>r()));}
  },{transportEgress:true});
}
async function exitWithPending(driver:ProviderDriver,mode:'SIGTERM'|'SIGKILL'){
  return withOwnedDriver(driver,[P.protocol,P.upstream,P.pending,P.restart,P.usage],`provider-transport-exit-${mode}`,async(d,owner)=>{
    const request=turnRequest();await d.enqueue({purpose:'turn',proposal:{kind:'text',text:'response intentionally pending'}});const gate=await d.holdNextUpstream('turn');let pending:ReturnType<ProviderDriver['exchange']>|undefined;
    try{
      pending=d.exchange('/agent/turn',request);pending.catch(()=>undefined);await d.evidence('provider-exit-real-upstream-hold',await gate.reached());
      const before=await d.usageObservation();assertProviderTransport(before.snapshot,1,'gemini-3.1-flash-lite',owner.endpoints[1]!);
      const stopped=await d.stopProvider(mode);await d.evidence('provider-exit-observed',stopped);
      if(mode==='SIGTERM'){assert.equal(stopped.exit.code,0);assert.equal(stopped.exit.signal,null);}else assert.equal(stopped.exit.signal,'SIGKILL');
      const source=await until(()=>d.upstreamFacts(),v=>!!v.records[0]?.connectionClosedAt,'actual source pending connection closure');assert.equal(source.records[0]!.responseFinishedAt,null);assert.equal(source.records[0]!.aborted,true);
      const lock=await d.lockState();await d.evidence('provider-exit-lock-facts',lock);const originalCount=(await d.calls()).length;
      if(mode==='SIGTERM')assert.equal(lock.exists,false);else{assert.equal(lock.exists,true);assert.equal(lock.actualOwnerAlive,false);assert.equal(lock.ownedDirectoryVerified,true);await d.evidence('provider-exit-manual-stale-lock-reclaim',await d.reclaimOwnedStaleLock());}
      await egress(d,owner.endpoints[1]!,true);await gate.release();await pending.catch(()=>undefined);
      const restarted=await d.restart('SIGTERM');assert.equal(restarted.started,true);assert.notEqual(restarted.afterPid,stopped.beforePid);
      let uncertain:unknown=null;
      if(mode==='SIGKILL'){const reply=await d.exchange('/agent/turn',request);assert.notEqual(reply.status,200);assert.match(reply.rawBody,/TURN_OUTCOME_UNCERTAIN/);assert.equal((await d.calls()).length,originalCount);uncertain=reply;}
      await d.stopProvider('SIGTERM');await egress(d,owner.endpoints[1]!,true);
      await d.evidence('provider-finite-exit-scope',{mode,stopped,source,lock,uncertain,strongAutomaticRecoveryEstablished:false,globalKernelEgressEstablished:false});
    }finally{await gate.release();await pending?.catch(()=>undefined);}
  },{transportEgress:true});
}
export async function runProviderTransportCase(driver:ProviderDriver){
  const failures:unknown[]=[];
  for(const [name,body] of [['requests',()=>requestsAndCancellation(driver)],['normal-exit',()=>exitWithPending(driver,'SIGTERM')],['hard-exit',()=>exitWithPending(driver,'SIGKILL')]] as const)try{await body();}catch(error){failures.push(error);await driver.evidence(`provider-transport-${name}-result`,{status:error instanceof PreparationBlocked?'BLOCKED':'FAIL',error:String(error)});}
  if(failures.length)throw failures.find(e=>!(e instanceof PreparationBlocked))??failures[0];
}
