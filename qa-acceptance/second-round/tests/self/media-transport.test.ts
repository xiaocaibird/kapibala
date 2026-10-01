import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertProviderTransport } from '../../harness/provider-transport-cases.js';
import type { ProviderSnapshot } from '../../harness/provider-observation.js';
import { readProviderEgress } from '../../harness/provider-egress.js';
import { ProviderWireStub } from '../../harness/provider-wire.js';
const model='gemini-3.1-flash-lite';
test('transport oracle rejects wrong logical target, leaked auth and fallback attempts',()=>{
  const item={seq:1,at:new Date().toISOString(),monotonicMs:1,requestId:randomUUID(),kind:'attempt',details:{inputUrl:`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,inputUrlAllowed:true,method:'POST',redirect:'error',keyHeaderPresent:true,matchesSyntheticKey:true,syntheticKeyElsewhere:false}};
  const snapshot={transport:{enabled:true,coverage:'provider-transport-only',events:[item],truncatedEvents:0}} as unknown as ProviderSnapshot;
  assertProviderTransport(snapshot,1,model,'http://127.0.0.1:43210');
  item.details.syntheticKeyElsewhere=true;assert.throws(()=>assertProviderTransport(snapshot,1,model,'http://127.0.0.1:43210'));item.details.syntheticKeyElsewhere=false;
  item.details.inputUrl='https://elsewhere.invalid/model';assert.throws(()=>assertProviderTransport(snapshot,1,model,'http://127.0.0.1:43210'));
  snapshot.transport.events.push({...item,seq:2});assert.throws(()=>assertProviderTransport(snapshot,1,model,'http://127.0.0.1:43210'));
});
test('egress evidence requires real binding fields and graceful tail; explicit hard-kill does not fabricate tail',async()=>{
  const base=resolve('.runtime/second-round-self');await mkdir(base,{recursive:true});const root=await mkdtemp(resolve(base,'egress-reader-')),path=resolve(root,'self-only.ndjson');
  const binding={path,preloadSha256:'a'.repeat(64),pids:[process.pid],endpoints:[{host:'127.0.0.1',port:43210}],exit:{code:0 as number|null,signal:null as string|null}};
  const common={protocol:'node-egress-hooks-v1',pid:process.pid,instance:randomUUID()};const ready={...common,seq:1,event:'observer-ready',mode:'strict',node:'v24.21.0',undici:'7.29.1',preloadSha256:binding.preloadSha256,endpoints:binding.endpoints};
  const save=async(rows:unknown[])=>writeFile(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});
  try{
    await save([ready]);await assert.rejects(readProviderEgress([binding],true),/lacks final ledger/);
    binding.exit={code:null,signal:'SIGKILL'};assert.equal((await readProviderEgress([binding],true)).ledgers[0]!.tailComplete,false);
    binding.exit={code:0,signal:null};await save([ready,{...common,seq:2,event:'process-exit',gaps:0,hookStillInstalled:false}]);await assert.rejects(readProviderEgress([binding],true));
    await save([{...ready,pid:process.pid+100000}]);await assert.rejects(readProviderEgress([binding],false),/frozen owned process/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('redirect source emits a real 302 to an explicit loopback target without adding automatic follow',async()=>{
  const wire=new ProviderWireStub();await wire.start();try{
    wire.enqueue({purpose:'turn',fault:'redirect',redirectLocation:'http://127.0.0.1:43210/sentinel'});
    const response=await fetch(`${wire.url}/v1beta/models/${model}:generateContent`,{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:JSON.stringify({runId:'qa-self',tools:[],messages:[]})}]}]})});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'http://127.0.0.1:43210/sentinel');assert.equal(wire.snapshot().records[0]!.responseStatus,302);assert.equal(wire.calls().length,1);
    assert.throws(()=>wire.enqueue({purpose:'turn',fault:'redirect',redirectLocation:'https://external.invalid/'}));
  }finally{await wire.close();}
});
