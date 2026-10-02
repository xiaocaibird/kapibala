import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { actualRequests, capacityRunId, jsonlBytes, keyFileFixture, retainedSuffix } from '../../harness/provider-usage-supplement.js';
import type { ProviderDriver, UsageRecord } from '../../contracts/media-provider.js';
function row(text:string):UsageRecord{const attemptId=randomUUID(),requestId=randomUUID(),raw={attemptId,requestId,runId:text,model:'gemini-3.1-flash-lite',purpose:'turn',stage:'validated-generation',outcome:'success',observedAt:new Date().toISOString(),elapsedMs:1,errorCode:null,inputTokens:0,outputTokens:0,totalTokens:0};return {attemptId,requestId,serviceCallId:attemptId,runId:text,model:raw.model,purpose:'turn',stage:raw.stage,outcome:raw.outcome,observedAt:raw.observedAt,elapsedMs:1,errorCode:null,usage:{inputTokens:0,outputTokens:0,totalTokens:0},raw};}
test('key fixture contains only known synthetic key and deliberate non-key poison; conflicting process/file values are distinct',()=>{
 const path=resolve('.runtime/second-round-self/foreign-sentinel');
 assert.match(keyFileFixture(path),/GEMINI_API_KEY=qa-offline-synthetic-key\n/);assert.match(keyFileFixture(path),/GEMINI_USAGE_ENABLED=false/);assert.match(keyFileFixture(path,true),/GEMINI_USAGE_ENABLED=true/);
 assert.match(keyFileFixture(path),/GEMINI_USAGE_MAX_RECORDS=0/);assert.match(keyFileFixture(path),/GEMINI_MODEL=not-a-valid-model/);assert.throws(()=>keyFileFixture('relative'));assert.throws(()=>keyFileFixture(path+'\nGEMINI_API_KEY=bad'));
});
test('capacity input is legal-length unique multibyte text; byte oracle is UTF-8 and retains actual stable suffix',()=>{
 const ids=Array.from({length:10001},(_,i)=>capacityRunId(i));assert.equal(new Set(ids).size,10001);assert.ok(ids.every(id=>id.length===512&&Buffer.byteLength(id)>id.length));assert.throws(()=>capacityRunId(10001));
 const rows=[row('first'),row(capacityRunId(0)),row('last')];const raw=rows.map(r=>JSON.stringify(r.raw)+'\n').join('');assert.equal(jsonlBytes(rows),Buffer.byteLength(raw));assert.ok(jsonlBytes(rows)>raw.length);
 assert.deepEqual(retainedSuffix(rows,2,100000),rows.slice(1));const suffixBytes=jsonlBytes(rows.slice(1));assert.deepEqual(retainedSuffix(rows,10,suffixBytes),rows.slice(1));assert.deepEqual(retainedSuffix(rows,10,suffixBytes-1),rows.slice(2));assert.deepEqual(retainedSuffix(rows,10,1),[]);
});

function capacityDouble(rejectIndex?:number) {
 let active=0,peak=0,enqueued=0,observed=0;const identities:string[]=[];
 const driver={
  async enqueue(){enqueued++;},
  async exchange(path:string,request:{groupId?:string;runId?:string}){
   const id=String(request.groupId??request.runId),index=identities.length;identities.push(id);active++;peak=Math.max(peak,active);
   assert.ok(active<=4,'public model admission allows at most four in flight');
   await new Promise<void>(done=>setImmediate(done));active--;
   return {status:index===rejectIndex?429:200,body:{},rawBody:'{}',evidence:{reference:'self-only://request',raw:{path,id}}};
  },
  async usageObservation(){assert.equal(active,0);observed++;return {snapshot:{usage:{queued:0,activeBatch:0,dropped:0,writeFailures:0,diagnosticCodes:[]}}};},
 } as unknown as ProviderDriver;
 return {driver,stats:()=>({active,peak,enqueued,observed,identities})};
}
test('actual capacity batching respects four model requests while keeping all 32 distinct samples',async()=>{
 for(const mode of ['records','bytes'] as const){const d=capacityDouble();await actualRequests(d.driver,mode,20,32);const s=d.stats();assert.equal(s.peak,4);assert.equal(s.active,0);assert.equal(s.enqueued,32);assert.equal(s.identities.length,32);assert.equal(new Set(s.identities).size,32);assert.equal(s.observed,1);
  assert.deepEqual(s.identities,Array.from({length:32},(_,i)=>mode==='records'?`qa-capacity-${20+i}`:capacityRunId(20+i)));}
});
test('capacity rejection settles its entire wave, schedules no later wave and never retries',async()=>{
 const d=capacityDouble(1);await assert.rejects(actualRequests(d.driver,'records',0,32),assert.AssertionError);const s=d.stats();assert.equal(s.active,0);assert.equal(s.peak,4);assert.equal(s.enqueued,4);assert.equal(s.identities.length,4);assert.equal(s.observed,0);
});
