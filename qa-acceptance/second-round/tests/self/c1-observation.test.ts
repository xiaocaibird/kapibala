import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaSnapshot, assertMediaHeld, MediaLease } from '../../harness/media-observation.js';
import { mediaEgressProjection } from '../../harness/media-egress.js';
const target={apiUrl:'http://127.0.0.1:43123',revision:'a'.repeat(40),pid:1234,ownerToken:'owner'};
const correlation={kind:'media-reference' as const,groupId:'g',msgId:'m',mediaId:'f',operation:{kind:'history' as const,runId:'r',toolUseId:'t'}};
const snapshot=()=>({protocol:'qa-runtime-observation/1',leaseId:'l',state:'held',expiresAt:new Date(Date.now()+20000).toISOString(),binding:{apiUrl:target.apiUrl,revision:target.revision,pid:target.pid,observedOwnerToken:target.ownerToken},correlation,events:[{seq:1,kind:'reference-locked',instancePid:1234,operationId:'o',backendPid:44,transactionId:'200',transactionIdentityScope:'reference-transaction',barrierHeld:true,correlation,selectedMediaIds:['f']}]});
test('media lease requires exact original operation and PG identity; immutable prefix and expiry',()=>{
 const s=snapshot();assert.equal(validateMediaSnapshot(s,target,'l',correlation).events.length,1);
 for(const changed of [{...s,binding:{...s.binding,pid:555}},{...s,events:[{...s.events[0],backendPid:undefined}]},{...s,events:[...s.events,{...s.events[0],seq:2,operationId:'other'}]}])assert.throws(()=>validateMediaSnapshot(changed,target,'l',correlation));
 assert.throws(()=>validateMediaSnapshot({...s,events:[]},target,'l',correlation,s));
 assert.throws(()=>validateMediaSnapshot({...s,expiresAt:new Date(Date.now()+90000).toISOString()},target,'l',correlation,s));
});
const record=(seq:number,event:string,extra:Record<string,unknown>={})=>({protocol:'node-egress-hooks-v1',instance:'own',pid:555,seq,event,...extra});
test('egress distinguishes ordinary owned protocol, actual media HTTP, forbidden creation and denied TCP',()=>{
 const rows=[record(1,'observer-ready'),record(2,'http-request-created',{requestId:'a',url:'http://127.0.0.1:123/events'}),record(3,'http-request-created',{requestId:'b',url:'http://127.0.0.1:123/media/x'}),record(4,'http-request-created',{requestId:'c',url:'https://qa-foreign.invalid/media/x'}),record(5,'socket-connect-call',{connectId:'d',target:{kind:'tcp',host:'127.0.0.1',port:1},blocked:true}),record(6,'socket-connect-call',{connectId:'e',target:{kind:'pipe',path:'bootstrap'},blocked:true})];
 const actual=mediaEgressProjection(rows,'http://127.0.0.1:123','http://127.0.0.1:124');assert.deepEqual(actual.map(r=>r.id),['own:b','own:c','own:d']);
 assert.throws(()=>mediaEgressProjection([...rows,record(8,'process-exit')],'http://127.0.0.1:123','http://127.0.0.1:124'));
 assert.throws(()=>mediaEgressProjection([record(1,'observer-ready'),record(2,'observer-gap')],'http://127.0.0.1:123','http://127.0.0.1:124'));
});

test('exact held stage excludes expired/released/history-only evidence and changed original PG transaction',()=>{
 const s=snapshot();assertMediaHeld(s,'reference-locked');
 for(const changed of [{...s,state:'released'},{...s,expiresAt:new Date(0).toISOString()},{...s,events:[{...s.events[0],barrierHeld:false}]},{...s,events:[{...s.events[0],kind:'reference-registered'}]}])assert.throws(()=>assertMediaHeld(changed,'reference-locked'));
 for(const change of [{backendPid:99},{transactionId:'999'},{transactionIdentityScope:'unrelated-transaction'}]) {
  const second={...s.events[0],seq:2,kind:'reference-committed',...change};
  assert.throws(()=>validateMediaSnapshot({...s,events:[...s.events,second]},target,'l',correlation));
 }
});
test('wait permits record-only historical stage but never accepts a released holdAt event',async()=>{
 const s={...snapshot(),state:'released'};
 const observer={target,request:async()=>s} as unknown as ConstructorParameters<typeof MediaLease>[0];
 const record=new MediaLease(observer,'l',correlation,[]);assert.equal((await record.wait('reference-locked')).state,'released');
 const gate=new MediaLease(observer,'l',correlation,['reference-locked']);await assert.rejects(gate.wait('reference-locked'),/window is no longer proven/);
});
test('cleanup completed retains declared claim identity without claiming the deleted update connection',()=>{
 const c={kind:'media-cleanup' as const,groupId:'g',msgId:'m',mediaId:'f'};
 const s=snapshot(),base={...s.events[0],correlation:c,transactionIdentityScope:'cleanup-claim-transaction',barrierHeld:false};
 const cleanup={...s,correlation:c,events:[{...base,kind:'cleanup-claimed',transactionState:'outer-commit-confirmed'},{...base,seq:2,kind:'cleanup-completed',transactionState:'deleted-update-returned'}]};
 assert.equal(validateMediaSnapshot(cleanup,target,'l',c).events.length,2);
});
test('background task observation does not require rAF or synthesize focus events',async()=>{
 const {chromium}=await import('@playwright/test');const {mediaBackgroundTaskBarrier}=await import('../../harness/media-ui.js');
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.evaluate(()=>{
   window.requestAnimationFrame=()=>{throw new Error('rAF must not be required in a hidden page');};
   for(const kind of ['focus','blur','visibilitychange'])window.addEventListener(kind,()=>document.body.dataset.synthetic='seen');
   const channel=new MessageChannel();channel.port1.onmessage=()=>{document.body.textContent='real queued task';channel.port1.close();channel.port2.close();};channel.port2.postMessage(null);
  });
  await mediaBackgroundTaskBarrier(page);
  assert.equal(await page.locator('body').textContent(),'real queued task');
  assert.equal(await page.locator('body').getAttribute('data-synthetic'),null);
 }finally{await browser.close();}
});
