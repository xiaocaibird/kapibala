import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { probeImmutableOpenWrite } from '../../harness/media-io-probe.js';
test('actual open-write OS probe distinguishes denied writes from unchanged permission on an existing FD and cleans only own files',async()=>{
  const base=resolve('.runtime/second-round-self');await mkdir(base,{recursive:true});const root=await mkdtemp(resolve(base,'probe-parent-'));
  try{
    const result=await probeImmutableOpenWrite(root);
    if(result.denied){assert.ok(['EPERM','EACCES'].includes(result.errorCode!));assert.equal(result.after,'prefix');assert.equal(result.writeBytes,null);}
    else{assert.equal(result.errorCode,null);assert.equal(result.writeBytes,5);assert.equal(result.after,'prefix-tail','do not classify a successful actual write as denied');}
    assert.deepEqual(await readdir(root),[],'private probe flags and exact temporary file are reclaimed');
  }finally{await rm(root,{recursive:true,force:true});}
});
