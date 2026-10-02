import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { capacityRunId, jsonlBytes, keyFileFixture, retainedSuffix } from '../../harness/provider-usage-supplement.js';
import type { UsageRecord } from '../../contracts/media-provider.js';
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
