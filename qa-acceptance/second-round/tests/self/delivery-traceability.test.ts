import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDeliveryTraceability, traceabilityTopic } from '../../harness/delivery-traceability.js';
import { secondRoundRoot } from '../../harness/scope.js';
test('delivery map rejects unknown topics instead of silently dropping obligations',()=>{
 assert.equal(traceabilityTopic('SR-P1-05-01'),'P1-05');
 assert.throws(()=>traceabilityTopic('SR-NEW-001'),assert.AssertionError);
});
test('full delivery mapping has no inherited current PASS and preserves historical failures',async()=>{
 const parent=resolve(secondRoundRoot,'..','.runtime','self');await mkdir(parent,{recursive:true});
 const out=await mkdtemp(resolve(parent,'delivery-map-'));
 try {
  const facts=await buildDeliveryTraceability({sutDirectory:resolve(secondRoundRoot,'../..'),outputDir:out,manifest:{sutRevision:'SELF_ONLY',qaRevision:'SELF_ONLY',runId:'SELF_ONLY'}});
  const data=JSON.parse(await readFile(facts.path,'utf8'));
  assert.equal(data.counts.originalRequirements,128);assert.equal(data.counts.secondRoundRequirements,73);
  assert.ok(data.currentRequirements.every((r:any)=>r.currentCases.length&&r.currentCases.every((c:any)=>c.statusAtReview==='NOT_RUN_AT_REVIEW')));
  assert.ok(data.originalRequirements.some((r:any)=>r.historicalResults.some((x:any)=>x.adjudicatedStatus==='FAIL')));
  assert.equal(data.firstRoundSignedReports.length,4);
 } finally {await rm(out,{recursive:true,force:true});}
});
