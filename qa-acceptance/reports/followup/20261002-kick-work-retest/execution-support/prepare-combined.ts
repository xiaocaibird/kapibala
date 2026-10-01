import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,lstat,mkdir} from 'node:fs/promises';
import{createHash,randomUUID}from'node:crypto';
import{resolve,dirname,join}from'node:path';
import{fileURLToPath}from'node:url';
import{loadTarget,targetFingerprint}from'../../harness/security.js';
import{reviewTargetChanges}from'../../harness/change-review.js';
import{snapshotQaTree}from'../../harness/provenance.js';
import{exec,isolatedEnv}from'../../harness/process.js';
const [runtimeFile,capacityFile,...extra]=process.argv.slice(2);assert.ok(runtimeFile&&capacityFile&&!extra.length,'runtime ready + capacity ready required');
const root=await realpath(fileURLToPath(new URL('../../',import.meta.url))),folder=dirname(fileURLToPath(import.meta.url));
const revision='7d53ee1f054961c9c997ff79dcb30e5a7e89ac46',sut='/Users/zcm/.codex/worktrees/qa-sut-evidence-retest/kapibala';
assert.equal((await exec('git',['rev-parse','HEAD'],{cwd:sut,env:isolatedEnv({})})).stdout.trim(),revision);
assert.equal((await exec('git',['status','--porcelain','--untracked-files=all'],{cwd:sut,env:isolatedEnv({})})).stdout.trim(),'');
const template=JSON.parse(await readFile(join(folder,'target.combined.template.json'),'utf8')),bindings=[];
for(const [kind,file,key]of[['runtime',runtimeFile,'runtimeObservation'],['capacity',capacityFile,'capacityControl']]as const){
 const path=await realpath(resolve(root,file));assert.ok(path.startsWith(resolve(root,'reports')+'/'));
 const bytes=await readFile(path),ready=JSON.parse(String(bytes));assert.equal(ready.component,`qa-owned-${kind}-controller-ready`);assert.equal(ready.sut,sut);assert.equal(ready.revision,revision);assert.equal(ready.evidenceDirectory,dirname(path));
 assert.ok(Number.isSafeInteger(ready.port)&&ready.port>0&&ready.port<65536);assert.equal(ready.url,`http://127.0.0.1:${ready.port}`);assert.ok(Date.parse(ready.stopRequestedNoLaterThan)>Date.now());
 for(const pid of[ready.runnerPid,ready.guardianPid]){assert.ok(Number.isSafeInteger(pid)&&pid>0);process.kill(pid,0);}
 const registry=await realpath(ready.registryDirectory),info=await lstat(registry);assert.equal(registry,ready.registryDirectory);assert.ok(info.isDirectory()&&!info.isSymbolicLink());assert.equal(info.uid,process.getuid!());assert.equal(info.mode&0o777,0o700);
 const owner=JSON.parse(await readFile(join(registry,'.qa-lifecycle-owner.json'),'utf8'));assert.equal(owner.runnerPid,ready.runnerPid);assert.equal(owner.qaRoot,root);assert.equal(owner.sut,sut);assert.equal(owner.revision,revision);
 template.adapters[key].url=ready.url;template.adapters[key].registryDirectory=registry;bindings.push({kind,path,sha256:createHash('sha256').update(bytes).digest('hex'),ready});
}
assert.notEqual(template.adapters.runtimeObservation.registryDirectory,template.adapters.capacityControl.registryDirectory);
const out=join(folder,'prepared-combined-'+randomUUID().slice(0,8));await mkdir(out);const targetPath=join(out,'target.json');await writeFile(targetPath,JSON.stringify(template,null,2)+'\n',{flag:'wx'});
const target=await loadTarget(targetPath,root);const changeReview=await reviewTargetChanges(root,target);await writeFile(join(out,'preparation.json'),JSON.stringify({kind:'inactive-combined-bindings',preparedAt:new Date().toISOString(),productStarted:false,revision,sut,targetSha256:targetFingerprint(target),changeReview,qaTree:await snapshotQaTree(root),bindings},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({targetPath,out,targetSha256:targetFingerprint(target)}));
