// Preparation only: reads local files/Git, writes inactive execution bindings.
// It never starts a product/controller, opens a port or creates a DB/registry.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { loadTarget, targetFingerprint } from '../../harness/security.js';
import { exec, isolatedEnv } from '../../harness/process.js';
import { executionPlan } from '../../harness/execution-plan.js';
import { snapshotQaTree } from '../../harness/provenance.js';
import { reviewTargetChanges } from '../../harness/change-review.js';

const usage = 'node --import tsx .runtime/evidence-retest-20261001/prepare.ts normal|ui|runtime|capacity [--ready <owned-controller-ready.json>]';
const [mode, flag, input, ...extra] = process.argv.slice(2);
if (mode === '--help') { console.log(usage); process.exit(0); }
if (!['normal','ui','runtime','capacity'].includes(mode!) || extra.length ||
    ((mode === 'normal' || mode === 'ui') ? !!flag || !!input : flag !== '--ready' || !input)) throw new Error(usage);
const folder = fileURLToPath(new URL('./', import.meta.url));
const qaRoot = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const sut = '/Users/zcm/.codex/worktrees/qa-sut-evidence-retest/kapibala';
const revision = 'e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb';
assert.equal(await realpath(sut), sut);
const git = async (...args: string[]) => (await exec('git', args, { cwd: sut, env: isolatedEnv({}), timeout: 10000 })).stdout.trim();
assert.equal(await git('rev-parse','HEAD'), revision, 'Candidate has moved');
assert.equal(await git('status','--porcelain','--untracked-files=all'), '', 'Candidate must remain clean');
const primary = (await git('worktree','list','--porcelain','-z')).split('\0')[0]!.replace(/^worktree /,'');
assert.notEqual(await realpath(primary), sut, 'Never prepare the primary checkout');
const templatePath = join(folder, `target.${mode}.template.json`);
const template = JSON.parse(await readFile(templatePath,'utf8'));
let readyBinding: unknown = null;
if (mode === 'runtime' || mode === 'capacity') {
  const readyPath = await realpath(resolve(qaRoot,input!));
  assert.ok(readyPath.startsWith(resolve(qaRoot,'reports')+'/'), 'Only this QA root owned controller evidence is accepted');
  assert.ok((await lstat(readyPath)).isFile());
  const readyBytes = await readFile(readyPath);
  const ready = JSON.parse(readyBytes.toString());
  assert.equal(ready.component, `qa-owned-${mode}-controller-ready`);
  assert.equal(ready.sut,sut); assert.equal(ready.revision,revision);
  assert.equal(ready.evidenceDirectory, resolve(readyPath,'..'));
  assert.ok(Number.isSafeInteger(ready.port) && ready.port>0 && ready.port<65536);
  assert.equal(ready.url,`http://127.0.0.1:${ready.port}`);
  assert.ok(Date.parse(ready.stopRequestedNoLaterThan)>Date.now(), 'Controller lifetime expired');
  for (const pid of [ready.runnerPid,ready.guardianPid]) {
    assert.ok(Number.isSafeInteger(pid) && pid>0); process.kill(pid,0);
  }
  const marker = JSON.parse(await readFile(join(ready.registryDirectory,'.qa-lifecycle-owner.json'),'utf8'));
  assert.equal(marker.runnerPid,ready.runnerPid); assert.equal(marker.qaRoot,qaRoot);
  assert.equal(marker.sut,sut); assert.equal(marker.revision,revision);
  const adapter = mode === 'runtime' ? 'runtimeObservation' : 'capacityControl';
  template.adapters[adapter].url = ready.url;
  template.adapters[adapter].registryDirectory = ready.registryDirectory;
  readyBinding = { path: readyPath, sha256: createHash('sha256').update(readyBytes).digest('hex'), ready };
}
const out = join(folder,`prepared-${mode}-${randomUUID().slice(0,8)}`);
await mkdir(out);
const targetPath = join(out,'target.json');
await writeFile(targetPath, JSON.stringify(template,null,2)+'\n',{flag:'wx'});
const target = await loadTarget(targetPath,qaRoot);
const targetSha256 = targetFingerprint(target);
const review = await reviewTargetChanges(qaRoot,target);
const suiteIds = mode === 'normal' ? ['evidence-followup-stream-20261001'] :
  mode === 'ui' ? ['evidence-followup-ui-20261001','manual-ui-repair-regression-20261001'] :
  mode === 'runtime' ? ['evidence-followup-backend-20261001'] : ['budget-dispatch-followup-20261001'];
const bindings = [];
for (const suiteId of suiteIds) {
  const plan = await executionPlan(qaRoot,'developer-preflight',suiteId);
  const allowedActions = ['start-isolated-sut','create-owned-database','fault-injection','kill-owned-process'];
  if (plan.suite!.projects.some((p) => p !== 'system')) allowedActions.push('browser-automation');
  const authPath = join(out,`authorization.${suiteId}.template.json`);
  await writeFile(authPath,JSON.stringify({version:1,approvedBy:'REQUIRED_ACTUAL_USER_AUTHORITY',
    approvalReference:'REQUIRED_EXISTING_USER_AUTHORIZATION_REFERENCE_NOT_A_NEW_APPROVAL',
    approvedAt:'REQUIRED_REAL_APPROVAL_TIME',expiresAt:'REQUIRED_BOUNDED_EXECUTION_EXPIRY',
    sutRevision:revision,sutDirectory:sut,allowedActions,scope:'developer-preflight',targetSha256,
    suiteId,suiteSha256:plan.suiteSha256},null,2)+'\n',{flag:'wx'});
  bindings.push({suiteId,suiteSha256:plan.suiteSha256,projects:plan.suite!.projects,caseIds:plan.suite!.caseIds,
    authorizationTemplate:authPath,command:[process.execPath,'--import','tsx','harness/cli.ts','preflight','--suite',suiteId,'--target',targetPath,'--authorization',authPath]});
}
const qaTree = await snapshotQaTree(qaRoot);
const scripts=[];
for (const name of ['prepare.ts','owned-runtime-controller.ts','owned-capacity-controller.ts',`target.${mode}.template.json`]) {
  const bytes=await readFile(join(folder,name));
  await writeFile(join(out,name),bytes,{flag:'wx'});
  scripts.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(join(out,'preparation.json'),JSON.stringify({kind:'inactive-execution-bindings',preparedAt:new Date().toISOString(),
  productStarted:false,controllerStartedByPrepare:false,authorizationCreated:false,
  sut,revision,targetSha256,qaRoot,qaTree,changeReview:review,readyBinding,scripts,bindings},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({kind:'inactive-bindings-prepared',out,targetSha256,qaTreeSha256:qaTree.sha256,suiteIds}));
