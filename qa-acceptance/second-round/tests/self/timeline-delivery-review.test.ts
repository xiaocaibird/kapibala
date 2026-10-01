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
