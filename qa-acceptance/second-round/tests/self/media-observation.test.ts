import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { ProviderObservationClient, validateSnapshot, type ProviderSnapshot, type UsageHold, type UsageEvent } from '../../harness/provider-observation.js';
const snapshot=():ProviderSnapshot=>({protocol:'qa-gemini-observation/1',instanceId:randomUUID(),pid:process.pid,usage:{entry:'main',optionsSupplied:true,configuredEnabled:true,observationEnabled:true,initialized:true,queued:0,queuedIncludesActiveBatch:false,activeBatch:0,dropped:0,writeFailures:0,diagnosticCodes:[],events:[],truncatedEvents:0},hold:null,transport:{enabled:true,coverage:'provider-transport-only',events:[],truncatedEvents:0}});
test('observation rejects wrong process, unknown counters and fabricated empty event identity',()=>{
  const s=snapshot();validateSnapshot(s,s.instanceId,[process.pid]);
  assert.throws(()=>validateSnapshot(s,randomUUID(),[process.pid]));assert.throws(()=>validateSnapshot(s,s.instanceId,[process.pid+1000]));
  s.usage.queued=null;assert.throws(()=>validateSnapshot(s,s.instanceId,[process.pid]));
  s.usage.observationEnabled=false;s.usage.initialized=null;s.usage.activeBatch=null;s.usage.dropped=null;s.usage.writeFailures=null;validateSnapshot(s,s.instanceId,[process.pid]);
  assert.throws(()=>new ProviderObservationClient('https://example.com','a'.repeat(32),s.instanceId,[process.pid],async()=>{}));
});
test('HTTP observation binds identity, real gate event, fixed TTL and persists no token',async()=>{
  const s=snapshot(),token='qa-self-observation-'.repeat(3),saved:unknown[]=[];let hold:UsageHold|null=null;let calls=0,writeStarted=false;
  const event:UsageEvent={seq:1,at:new Date().toISOString(),monotonicMs:1,kind:'before-write',queued:0,activeBatch:1,dropped:0,writeFailures:0,batchId:randomUUID(),attemptIds:[randomUUID()]};
  const server=createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,`Bearer ${token}`);assert.equal(req.headers['x-qa-instance-id'],s.instanceId);calls++;
    res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/snapshot')){res.end(JSON.stringify(s));return;}
    const id=req.url!.split('/').at(-1)!;
    if(req.method==='PUT'){let text='';for await(const chunk of req)text+=chunk;const {ttlMs}=JSON.parse(text);hold={id,state:'armed',ttlMs,expiresAt:new Date(Date.now()+ttlMs).toISOString(),reached:null,releaseReason:null};res.end(JSON.stringify(hold));return;}
    assert.equal(hold!.id,id);
    if(req.method==='GET'){hold!.state='held';hold!.reached=event;s.hold=hold;s.usage.events=writeStarted?[event,{...event,seq:2,kind:'write-started'}]:[event];s.usage.activeBatch=1;}
    if(req.method==='DELETE'){hold!.state='released';hold!.releaseReason='delete';}
    res.end(JSON.stringify(hold));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try{
    const c=new ProviderObservationClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`,token,s.instanceId,[process.pid],async(name,value)=>{saved.push({name,value});});
    const g=await c.hold();await g.reached();await g.release();await g.release();assert.equal(calls,4);assert.ok(!JSON.stringify(saved).includes(token));
    writeStarted=true;const second=await c.hold();
    // Deliberately stale gate event cannot be interpreted as a completed write.
    assert.equal(second.id.length,36);await assert.rejects(second.reached(),/not started persistence/);await second.release();
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
