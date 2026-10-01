import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRun, Group } from '../../../../harness/platform-client.js';
import type { AgentRequest } from '../../../../harness/agent.js';
import { firstHolderPlans, boundHolderPlans, fourInitialHolderRequests, classifyZeroStepTarget } from './ui039-public-queue-fixture.draft.js';

test('first plans are identical and later plans bind each real run independently', () => {
  const first = firstHolderPlans();
  assert.equal(first.length, 4);
  first.forEach(p => { assert.deepEqual(p, first[0]); assert.equal(p.responseDelayMs, 14000); });
  const later = boundHolderPlans(['r1','r2','r3','r4'], 'nonce');
  assert.equal(later.length, 8);
  for (let index=0; index<4; index++) {
    const body=later[index*2]!.body as {content:{input:{idempotency_key:string}}[]};
    assert.equal(body.content[0]!.input.idempotency_key,`h${index+1}`);
  }
  // Simulate the existing documented first matching plan selection, in a different arrival order.
  const queue = [...later];
  for (const id of ['r4','r2','r4','r1','r3','r3','r1','r2']) {
    const index = queue.findIndex(p => p.runId === id);
    assert.ok(index >= 0);
    const [plan] = queue.splice(index, 1);
    assert.equal(plan!.runId, id);
  }
  assert.equal(queue.length, 0);
  assert.equal(later.findIndex(p => p.runId === 'target'), -1);
  assert.throws(() => boundHolderPlans(['r1','r1','r3','r4'], 'nonce'));
});
test('four initial requests require distinct real identity and pending response, not estimated slots', () => {
  const holders = ['1','2','3','4'].map(n => ({ group: { id: `g${n}` } as Group, runId: `r${n}` }));
  const requests: AgentRequest[] = holders.map((h,i) => ({ id:i+1, at:'2026-10-01T00:00:00Z', path:'/agent/turn',
    body: {runId:h.runId,messages:[{content:[{type:'text',text:JSON.stringify({groupId:h.group.id})}]}]} }));
  assert.equal(fourInitialHolderRequests(holders,requests),true);
  assert.equal(fourInitialHolderRequests(holders,requests.slice(0,3)),false);
  assert.equal(fourInitialHolderRequests(holders,[...requests,requests[0]!]),false);
  assert.equal(fourInitialHolderRequests(holders,requests.map((r,i)=>i===2?{...r,completedAt:'2026-10-01T00:00:14Z'}:r)),false);
  assert.equal(fourInitialHolderRequests(holders,requests.map((r,i)=>i===2?{...r,body:{runId:'r3',messages:[]}}:r)),false);
});
const run=(status:'failed'|'cancelled',steps:AgentRun['steps']=[]):AgentRun=>({id:'target',groupId:'g',status,endReason:status==='failed'?'wall_clock':'cancelled',summary:null,steps});
test('zero-step terminal needs zero actual model dispatch; missed scene is not a copy PASS',()=>{
  for(const role of ['failed','cancelled'] as const) assert.equal(classifyZeroStepTarget(role,run(role),0,0,0,0).ready,true);
  assert.equal(classifyZeroStepTarget('failed',run('failed'),1,0,0,0).ready,false);
  assert.equal(classifyZeroStepTarget('cancelled',run('failed'),0,0,0,0).ready,false);
  assert.equal(classifyZeroStepTarget('failed',run('failed',[{} as AgentRun['steps'][number]]),0,0,0,0).ready,false);
});
test('known public-contract or unexpected-effect violation is never hidden by missed zero-step scene',()=>{
  assert.throws(()=>classifyZeroStepTarget('failed',{...run('cancelled'),endReason:'final'},1,0,0,0));
  assert.throws(()=>classifyZeroStepTarget('failed',run('failed'),0,1,0,0));
  assert.throws(()=>classifyZeroStepTarget('failed',run('failed'),0,0,1,0));
  assert.throws(()=>classifyZeroStepTarget('failed',run('failed'),0,0,0,1));
});
test('actual target model dispatch invalidates queue premise without forbidding its legitimate effects',()=>{
  assert.equal(classifyZeroStepTarget('failed',run('failed'),1,1,1,1).ready,false);
  assert.equal(classifyZeroStepTarget('cancelled',run('cancelled',[{} as AgentRun['steps'][number]]),2,1,1,1).ready,false);
});
