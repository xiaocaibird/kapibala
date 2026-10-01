import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertConfirmationContinuation, assertFrozenOrder, readFrozenPages } from '../../harness/timeline-driver.js';
import { reviewMutationDiagnostics } from '../../harness/delivery-driver.js';
import { BlockedError } from '../../../harness/security.js';
import type { Message } from '../../../harness/platform-client.js';
import type { QaEnvironment } from '../../../harness/environment.js';

const message=(msgId:string,clientMsgId:string|null=null):Message=>({msgId,clientMsgId,senderPlatformUserId:'qa',isOwn:!!clientMsgId,text:msgId,sentAt:'2026-01-01T00:00:00Z',deliveryStatus:'queued',failCode:null});
test('frozen order accepts arbitrary initial tie order but rejects changed same-chain order',()=>{
  const a=message('a'),b=message('b');assertFrozenOrder([b,a],[b,a]);
  assert.throws(()=>assertFrozenOrder([b,a],[a,b]),assert.AssertionError);
  assert.throws(()=>assertFrozenOrder([a,b],[a,a]),assert.AssertionError);
});
test('confirmation checks require target from an actual second read of old continuation',async()=>{
  const first={items:[message('head')],nextCursor:'owned-cursor'},target=message('pending','client-owned');
  const calls:string[]=[];
  const qa={api:{messages:async(_id:string,cursor:string)=>{calls.push(cursor);return {items:[target],nextCursor:null};}}} as unknown as QaEnvironment;
  const before=await readFrozenPages(qa,'g',first),after=await readFrozenPages(qa,'g',first);
  assert.deepEqual(calls,['owned-cursor','owned-cursor']);
  assertConfirmationContinuation(first,before,after,'client-owned');
  assert.throws(()=>assertConfirmationContinuation(first,before,{...after,reads:[]},'client-owned'),assert.AssertionError);
  assert.throws(()=>assertConfirmationContinuation({...first,items:[target]},before,after,'client-owned'),BlockedError);
});
const auditTitle='guard effects: audit fail creates no message/key and makes no remote send';
const sameTitle='guard effects: same key reuses original identity without a second audit or remote send';
const source=[`test("${auditTitle}",async()=>{`, 'const id = await f.start();',
  'assert.equal((await f.steps(id))[0]!.error_code, "AUDIT_REJECTED");','});',
  `test("${sameTitle}",async()=>{`,'const id = await f.start();',
  'f.handlers.turn = () => f.turns.length <= 2 ? { idempotency_key: "reused-key" } : end();',
  'const steps = await f.steps(id);','assert.equal(f.audits.length, 1, "same key must not repeat audit");','});'].join('\n');
const auditGood={guard:'audit-fail',audits:1,remoteSends:0,messages:0,keys:0,errorCode:'AUDIT_REJECTED'};
const sameGood={guard:'same-key',audits:1,remoteSends:1,messages:1,keys:1,results:[{clientMsgId:'same'},{clientMsgId:'same'}]};
function row(title:string,index:number,value:unknown,failure?:{expected:string;actual:string;line:number}) {
  return `# Subtest: ${title}\n${failure?'not ok':'ok'} ${index} - ${title}\n`+(failure?
    `  ---\n  failureType: 'testCodeFailure'\n  code: 'ERR_ASSERTION'\n  name: 'AssertionError'\n  expected: ${failure.expected}\n  actual: ${failure.actual}\n  operator: 'strictEqual'\n  stack: |-\n    TestContext (owned/tests/integration/automation-guard-effects.test.ts:${failure.line}:10)\n  ...\n`:'')+
    `# Independent database: kapibala_test_${index}\n# ${JSON.stringify(value)}\n`;
}
const footer=(fail:number)=>`# tests 2\n# pass ${2-fail}\n# fail ${fail}\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const baseline=row(auditTitle,1,auditGood)+row(sameTitle,2,sameGood)+footer(0);
const auditChanged=row(auditTitle,1,{...auditGood,remoteSends:1,messages:1,keys:1,errorCode:null},{expected:"'AUDIT_REJECTED'",actual:'~',line:3})+row(sameTitle,2,sameGood)+footer(1);
const sameChanged=row(auditTitle,1,auditGood)+row(sameTitle,2,{...sameGood,audits:2},{expected:'1',actual:'2',line:9})+footer(1);
test('mutation review requires specified business assertion and corresponding JSON effects',()=>{
  const audit=reviewMutationDiagnostics('audit-fail-bypass',baseline,auditChanged,source);
  assert.equal(audit.changed.value.remoteSends,1);
  const same=reviewMutationDiagnostics('same-key-repeat-audit',baseline,sameChanged,source);
  assert.equal(same.changed.value.audits,2);
  assert.throws(()=>reviewMutationDiagnostics('audit-fail-bypass',baseline,auditChanged.replace('test.ts:3:10','test.ts:2:10'),source),BlockedError);
  assert.throws(()=>reviewMutationDiagnostics('audit-fail-bypass',baseline,auditChanged.replace('"remoteSends":1','"remoteSends":0'),source),assert.AssertionError);
  assert.throws(()=>reviewMutationDiagnostics('same-key-repeat-audit',baseline,sameChanged.replace('"clientMsgId":"same"','"clientMsgId":"different"'),source),assert.AssertionError);
});
test('missing diagnostic or incidental assertion cannot become mutation detection PASS',()=>{
  const missing=auditChanged.replace(/^# \{"guard":"audit-fail".*\n/m,'');
  assert.throws(()=>reviewMutationDiagnostics('audit-fail-bypass',baseline,missing,source),BlockedError);
  assert.throws(()=>reviewMutationDiagnostics('audit-fail-bypass',baseline,auditChanged.replace("code: 'ERR_ASSERTION'","code: 'ECONNREFUSED'"),source),BlockedError);
});


// Pure QA safety tests; no product process, database or Docker command runs.
test('public README manifest validation rejects foreign roots, resource names and network targets', async () => {
  const { validateDeliveryManifest } = await import('../../harness/delivery-isolated.js');
  const runtimeRoot='/qa-owned/runtime',runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const directory=`${runtimeRoot}/kapibala-local-${runId}`,path=`${directory}/manifest.json`;
  const m={runId,ownerToken:'a'.repeat(64),ownerPid:12345,ownerStarted:'Wed Oct 1 10:00:00 2026',directory,
    containerName:`kapibala-local-${runId}`,volumeName:`kapibala-local-${runId}-data`,engineArgs:['--context','desktop-linux'],engineId:'owned-engine',revision:'qa-fixture',
    gatewayState:`${directory}/gateway.json`,agentState:`${directory}/agent.json`,urls:{api:'http://127.0.0.1:20001',web:'http://127.0.0.1:20002',gateway:'http://127.0.0.1:20003',agent:'http://127.0.0.1:20004'}};
  validateDeliveryManifest(m,path,runtimeRoot);
  for(const changed of [{...m,directory:'/foreign'}, {...m,containerName:'existing-demo'}, {...m,volumeName:'foreign-data'}, {...m,ownerToken:'short'}, {...m,urls:{...m.urls,api:'https://example.invalid'}}])
    assert.throws(()=>validateDeliveryManifest(changed,path,runtimeRoot));
  assert.throws(()=>validateDeliveryManifest(m,'/foreign/manifest.json',runtimeRoot));
});
test('public README stdout parsing preserves actual events and ignores npm prose or partial JSON', async () => {
  const { isolatedEvents } = await import('../../harness/delivery-isolated.js');
  assert.deepEqual(isolatedEvents('> npm run dev:isolated\n{"event":"isolated-preparing","runId":"one"}\n{"event":\n{"event":"isolated-cleaned","runId":"one"}\n'),[
    {event:'isolated-preparing',runId:'one'},{event:'isolated-cleaned',runId:'one'}]);
});

test('recovery discovers only this run private manifests without requiring stdout and retains unproven entries', async () => {
  const { discoverDeliveryManifests } = await import('../../harness/delivery-isolated.js');
  const { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qa-delivery-discovery-')));
  const foreign = await mkdtemp(join(tmpdir(), 'qa-delivery-foreign-sentinel-'));
  const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
  try {
    const directory = join(root, `kapibala-local-${ids[0]}`);
    await mkdir(directory, { mode: 0o700 });
    const manifest = { version: 1, runId: ids[0], ownerToken: 'a'.repeat(64), ownerPid: 12345, ownerStarted: 'QA self only', directory,
      containerName: `kapibala-local-${ids[0]}`, volumeName: `kapibala-local-${ids[0]}-data`, engineArgs: ['--context','qa-self'], engineId: 'qa-self', revision: 'qa-frozen',
      gatewayState: join(directory,'gateway.json'), agentState: join(directory,'agent.json') };
    await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
    await writeFile(join(foreign,'sentinel'),'untouched',{mode:0o600});
    await symlink(foreign,join(root,`kapibala-local-${ids[1]}`));
    const missing=join(root,`kapibala-local-${ids[2]}`); await mkdir(missing,{mode:0o700});
    const wrong=join(root,`kapibala-local-${ids[3]}`); await mkdir(wrong,{mode:0o700});
    await writeFile(join(wrong,'manifest.json'),JSON.stringify({...manifest,revision:'foreign-revision'}),{mode:0o600});
    // npm/tsx may leave unrelated temporary files: never treat these as Docker owners.
    await mkdir(join(root,'tsx-cache'),{mode:0o700});
    const result=await discoverDeliveryManifests(root,'qa-frozen');
    assert.equal(result.manifests.length,1); assert.equal(result.manifests[0]!.manifest.runId,ids[0]);
    assert.equal(result.unresolved.length,3);
    assert.equal(await readFile(join(foreign,'sentinel'),'utf8'),'untouched');
    assert.equal(await readFile(join(directory,'manifest.json'),'utf8'),JSON.stringify(manifest));
    assert.equal(await readFile(join(wrong,'manifest.json'),'utf8'),JSON.stringify({...manifest,revision:'foreign-revision'}));
  } finally { await rm(root,{recursive:true,force:true}); await rm(foreign,{recursive:true,force:true}); }
});

test('recovery rejects a symlinked or nonprivate discovery root before following it', async () => {
  const { discoverDeliveryManifests } = await import('../../harness/delivery-isolated.js');
  const { mkdtemp, mkdir, chmod, symlink, rm, realpath } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const root=await realpath(await mkdtemp(join(tmpdir(),'qa-delivery-root-')));
  try {
    const real=join(root,'real'),link=join(root,'link');await mkdir(real,{mode:0o700});await symlink(real,link);
    await assert.rejects(discoverDeliveryManifests(link,'qa'),BlockedError);
    await chmod(real,0o755);await assert.rejects(discoverDeliveryManifests(real,'qa'),BlockedError);
  } finally {await rm(root,{recursive:true,force:true});}
});
