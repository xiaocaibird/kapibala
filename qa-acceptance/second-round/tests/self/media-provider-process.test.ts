import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { OwnedProcess, isolatedEnv } from '../../../harness/process.js';
test('guardian observes actual application SIGKILL before it is reaped; sent signal alone is not fabricated as exit',async()=>{
 const base=resolve('.runtime/second-round-self');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'guardian-'));
 const owner=new OwnedProcess({command:process.execPath,args:['-e','setInterval(()=>{},1000)']},root,isolatedEnv({}),join(root,'qa-only.log'));
 try{await assert.rejects(owner.killApplication(),/No live owned/);await owner.start();assert.equal(owner.exitOutcome,undefined);const result=await owner.killApplication();assert.deepEqual(result,{code:null,signal:'SIGKILL'});assert.deepEqual(owner.exitOutcome,result);await owner.stop();assert.deepEqual(owner.exitOutcome,result);await assert.rejects(owner.killApplication(),/No live owned/);}
 finally{await owner.stop();await rm(root,{recursive:true,force:true});}
});
