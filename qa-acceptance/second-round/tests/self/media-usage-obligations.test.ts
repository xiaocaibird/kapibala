import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { allUsageObligations } from '../../harness/provider-usage-cases.js';
import { PreparationBlocked, type ProviderDriver } from '../../contracts/media-provider.js';
import type { DriverContext } from '../../harness/driver-factories.js';
test('usage obligation summary records all statuses and real artifact paths; later work runs and FAIL precedes foreign BLOCKED',async()=>{
 const base=resolve('.runtime/second-round-self');await mkdir(base,{recursive:true});const out=await mkdtemp(join(base,'obligations-'));
 const context={outputDir:out,target:{sut:{revision:'a'.repeat(40)}}} as DriverContext,driver={contractReference:'self-only'} as ProviderDriver;let later=false;
 try{
  const failure=new assert.AssertionError({message:'QA self intentional assertion'});
  await assert.rejects(allUsageObligations(driver,[['first',async()=>{await writeFile(join(out,'first-proof.json'),'{}');}],['failed',async()=>{await writeFile(join(out,'failed-proof.json'),'{}');throw failure;}],['foreign-uid-proof',async()=>{throw new PreparationBlocked('QA self missing foreign UID');}],['later',async()=>{later=true;await writeFile(join(out,'later-proof.json'),'{}');}]],context,'SELF-USG-006'),e=>e===failure);
  assert.equal(later,true);const summary=JSON.parse(await readFile(join(out,'usage-obligations-summary.json'),'utf8'));assert.equal(summary.sutRevision,'a'.repeat(40));assert.deepEqual(summary.exactNames,['first','failed','foreign-uid-proof','later']);assert.deepEqual(summary.obligations.map((r:{status:string})=>r.status),['PASS','FAIL','BLOCKED','PASS']);assert.equal(summary.status,'FAIL');assert.deepEqual(summary.counts,{PASS:2,FAIL:1,BLOCKED:1});
  for(const row of summary.obligations)for(const file of row.evidence)await readFile(file);const good=JSON.parse(await readFile(summary.obligations[0].evidence[0],'utf8'));assert.deepEqual(good.executionEvidence,[join(out,'first-proof.json')]);
 }finally{await rm(out,{recursive:true,force:true});}
});
