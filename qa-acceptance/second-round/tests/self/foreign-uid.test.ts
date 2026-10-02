import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertForeignContainer, foreignRuntimeArguments, foreignUidBaseImage } from '../../harness/foreign-uid.js';

const owner='b6a3fa1e-5e2d-4bc5-8915-1a7c046bb2d4',id='a'.repeat(64),label='org.kapibala.independent-qa.foreign-uid';
function record(){return {Id:id,Image:foreignUidBaseImage,Config:{Labels:{[label]:owner}},Mounts:[{Type:'volume',Name:`qa-foreign-${owner}`,Destination:'/qa'},{Type:'tmpfs',Destination:'/tmp'}],HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true,Binds:null,PortBindings:{}}};}
test('foreign UID ownership rejects unrelated or writable-networked containers',()=>{
 const correct=record();assert.doesNotThrow(()=>assertForeignContainer(correct,id,owner,foreignUidBaseImage,'execute'));
 for(const changed of [
  {...correct,Id:'b'.repeat(64)},
  {...correct,Image:`sha256:${'c'.repeat(64)}`},
  {...correct,Config:{Labels:{[label]:'different-owner'}}},
  {...correct,Mounts:[{Type:'bind',Source:'/some-existing-project',Destination:'/qa'}]},
  {...correct,Mounts:[{Type:'volume',Name:'foreign-volume',Destination:'/qa'}]},
  {...correct,Mounts:[]},
  {...correct,HostConfig:{...correct.HostConfig,NetworkMode:'bridge'}},
  {...correct,HostConfig:{...correct.HostConfig,Privileged:true}},
  {...correct,HostConfig:{...correct.HostConfig,ReadonlyRootfs:false}},
  {...correct,HostConfig:{...correct.HostConfig,PortBindings:{'8000/tcp':[{HostPort:'8000'}]}}},
 ])assert.throws(()=>assertForeignContainer(changed,id,owner,foreignUidBaseImage,'execute'),/\[BLOCKED\]/);
});
test('foreign UID execution command contains no host mount, port or inherited credential',()=>{
 const args=foreignRuntimeArguments(`qa-foreign-${owner}`,owner,foreignUidBaseImage);
 assert.ok(args.includes('none'));assert.ok(args.includes('--read-only'));assert.ok(args.includes('--cap-drop'));assert.ok(args.includes('ALL'));
 assert.ok(!args.includes('--privileged'));assert.ok(!args.includes('--env-file'));assert.ok(!args.includes('-v'));assert.ok(!args.includes('-p'));
 assert.deepEqual(args.filter(x=>x.startsWith('type=')),[`type=volume,source=qa-foreign-${owner},target=/qa`]);
 assert.throws(()=>foreignRuntimeArguments('qa-foreign-unsafe','owner',foreignUidBaseImage),/\[BLOCKED\]/);
});
test('standalone foreign UID script parses without executing SUT or containers',async()=>{
 const path=fileURLToPath(new URL('../../harness/foreign-uid-container.mjs',import.meta.url));
 await promisify(execFile)(process.execPath,['--check',path]);
 const source=await readFile(path,'utf8');
 assert.ok(source.includes('uid:owner,gid:owner'));assert.ok(source.includes('uid,gid:uid'));
 assert.ok(!source.includes('process.getuid ='));assert.ok(!source.includes('chmod('));
 assert.ok(source.includes("assert.equal(creator.caps,'0000000000000000')"));
 assert.ok(source.includes('assert.deepEqual(await snapshot(temporary),before)'));
 const prepare=fileURLToPath(new URL('../../harness/foreign-uid-prepare.mjs',import.meta.url));await promisify(execFile)(process.execPath,['--check',prepare]);
 const prep=await readFile(prepare,'utf8');assert.ok(prep.includes("'npm@12.1.0'"));assert.ok(prep.includes("assert.equal(process.version,'v24.21.0')"));assert.ok(prep.includes("assert.equal(lock(),before)"));
});
