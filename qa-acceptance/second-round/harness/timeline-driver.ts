import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { QaEnvironment } from '../../harness/environment.js';
import { eventually, type Message } from '../../harness/platform-client.js';
import type { RoundResult } from './result.js';
import { BlockedError } from '../../harness/security.js';

// Publicly delivered storage measurement mapping. These SQLs are measured inputs,
// never the oracle for the API's independently constructed expected identities.
const currentSql="SELECT jsonb_array_length(items) AS total, jsonb_path_query_array(items, '$[$start to $last]'::jsonpath, jsonb_build_object('start', LEAST($3::numeric, jsonb_array_length(items)), 'last', LEAST(jsonb_array_length(items), $3::numeric+$4::int)-1)) AS items FROM timeline_snapshots WHERE id=$1 AND group_id=$2";
const oldSql="SELECT jsonb_array_length(items) AS total, COALESCE((SELECT jsonb_agg(items->position ORDER BY position) FROM generate_series(LEAST($3::numeric, jsonb_array_length(items))::int, LEAST(jsonb_array_length(items), $3::numeric+$4::int)::int-1) AS position), '[]'::jsonb) AS items FROM timeline_snapshots WHERE id=$1 AND group_id=$2";
type MessagePage=Awaited<ReturnType<QaEnvironment['api']['messages']>>;
export async function readFrozenPages(qa:QaEnvironment,groupId:string,initial?:MessagePage) {
  const first=initial ?? await qa.api.messages(groupId,undefined,17), items=[...first.items], cursors:string[]=[];
  const reads:{cursor:string;startedAt:string;completedAt:string;response:MessagePage}[]=[];
  let cursor=first.nextCursor;
  while(cursor) {
    assert.ok(!cursors.includes(cursor),'cursor chain must progress'); cursors.push(cursor);
    assert.ok(cursors.length<1000,'bounded test fixture must terminate');
    const startedAt=new Date().toISOString();
    const page=await qa.api.messages(groupId,cursor,17);
    reads.push({cursor,startedAt,completedAt:new Date().toISOString(),response:page});
    items.push(...page.items);cursor=page.nextCursor;
  }
  return {items,cursors,reads};
}
const pages=readFrozenPages;
export const timelineIdentity=(message:Message)=>message.clientMsgId!==null ? `client:${message.clientMsgId}` : `msg:${message.msgId}`;
export function assertFrozenOrder(before:Message[],after:Message[]) {
  uniqueAndSorted(before);uniqueAndSorted(after);
  // No contract promises id DESC for equal sentAt. Compare only the already
  // observed order of this same frozen cursor chain, including timestamp ties.
  assert.deepEqual(after.map(timelineIdentity),before.map(timelineIdentity),'one frozen chain must retain its observed order and membership');
}
export function assertConfirmationContinuation(first:MessagePage,before:Awaited<ReturnType<typeof pages>>,after:Awaited<ReturnType<typeof pages>>,clientMsgId:string) {
  if(first.items.some(m=>m.clientMsgId===clientMsgId)||!first.nextCursor||
    !before.reads.some(read=>read.response.items.some(m=>m.clientMsgId===clientMsgId)))
    throw new BlockedError('Confirmation fixture must place the original pending identity on an actually read continuation page');
  assert.ok(after.reads.some(read=>read.response.items.some(m=>m.clientMsgId===clientMsgId)),
    'After real confirmation the target must come from a newly fetched old-cursor response, not cached first-page objects');
  assertFrozenOrder(before.items,after.items);
}
function uniqueAndSorted(items:Message[]) {
  assert.ok(items.every(m=>m.clientMsgId!==null||m.msgId!==null));
  assert.equal(new Set(items.map(timelineIdentity)).size,items.length);
  const times=items.map(m=>Date.parse(m.sentAt));assert.deepEqual(times,[...times].sort((a,b)=>b-a));
}
async function seedPublic(qa:QaEnvironment,groupId:string,gatewayId:string,count=83,baseTime=Date.UTC(2026,0,1)) {
  const ids=Array.from({length:count},(_,i)=>`sr-${i.toString().padStart(4,'0')}`);
  for(const [i,msgId] of ids.entries()) qa.gateway.emitMessage({groupId:gatewayId,msgId,
    senderPlatformUserId:'qa-external',text:msgId,sentAt:new Date(baseTime+Math.floor(i/3)).toISOString()});
  await eventually(()=>pages(qa,groupId),x=>x.items.length===count,{timeoutMs:25000});
  return ids;
}
async function measurement(qa:QaEnvironment,compare:boolean) {
  const storage=qa.ownedStorage();assert.ok(storage.cluster.ownsDatabase(storage.database));
  const db=new Client({connectionString:storage.cluster.url(storage.database),statement_timeout:30000,query_timeout:35000});
  await db.connect();
  try {
    for(const count of [1000,10000]) {
      const {group}=await qa.api.createGroup(1), control=(await qa.api.createGroup(1)).group;
      const prefix=randomUUID(), samples=[];
      // Explicit input-only fixture: two owned groups, deterministic identities,
      // ties, backdated timestamps and own messages. It seeds no derived outcome.
      await db.query(`INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at,delivery_status,dispatch_state)
        SELECT $1||'-'||g||'-'||i,g,$1||'-'||g||'-'||i,'qa-fixture',i%10=0,
        lpad(i::text,10,'0')||repeat('independent-qa-',16),
        '2026-01-01'::timestamptz + floor(i/3.0)*interval '1 millisecond' - CASE WHEN i%50=0 THEN interval '1 day' ELSE interval '0' END,
        'sent','done' FROM unnest($2::text[]) g CROSS JOIN generate_series(1,$3::int) i`,[prefix,[group.id,control.id],count]);
      const distribution=(await db.query('SELECT group_id,count(*),count(DISTINCT sent_at),count(*) FILTER(WHERE is_own) AS own FROM messages GROUP BY group_id')).rows;
      assert.equal(Number(distribution.find(x=>x.group_id===group.id)?.count),count);
      await db.query('ANALYZE messages');
      for(const cursor of [undefined,'continuation']) {
        const start=performance.now(); const response=await qa.api.messages(group.id,cursor==='continuation' ? (samples[0].response.nextCursor??undefined) : undefined,50);
        samples.push({elapsedMs:performance.now()-start,bytes:Buffer.byteLength(JSON.stringify(response)),response});
        assert.equal(response.items.length,50);
      }
      const snapshot=(await db.query('SELECT id,jsonb_array_length(items) AS count,pg_column_size(items) AS stored_bytes FROM timeline_snapshots WHERE group_id=$1 ORDER BY created_at DESC LIMIT 1',[group.id])).rows[0];
      assert.equal(snapshot.count,count);
      const params=[snapshot.id,group.id,50,50], firstSql='SELECT * FROM messages WHERE group_id=$1 ORDER BY sent_at DESC,id DESC';
      const plans={first:(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+firstSql,[group.id])).rows,
        continuation:(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+currentSql,params)).rows};
      const comparisons=[];
      if(compare) for(const offset of [0,49,count-1,count,Number.MAX_SAFE_INTEGER]) {
        const p=[snapshot.id,group.id,offset,50], old=(await db.query(oldSql,p)).rows, current=(await db.query(currentSql,p)).rows;
        assert.deepEqual(current,old,'local query optimization preserves slice at each edge');
        comparisons.push({offset,rows:current,oldPlan:(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+oldSql,p)).rows,
          currentPlan:(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+currentSql,p)).rows});
      }
      const source=await readFile(resolve(qa.config.sut.cwd,'apps/server/src/modules/gateway/index.ts'));
      await qa.evidence(`timeline-measurement-${count}`,{count,distribution,samples,snapshot,plans,comparisons,
        statements:{firstSql,currentSql,oldSql,params},sourceSha256:createHash('sha256').update(source).digest('hex'),
        sourceMappingVerified:source.toString().includes('jsonb_path_query_array'),
        postgres:(await db.query('SELECT version(),current_setting(\'work_mem\') AS work_mem')).rows,
        indexes:(await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE tablename IN ('messages','timeline_snapshots')")).rows,
        statistics:(await db.query("SELECT attname,n_distinct,null_frac,correlation FROM pg_stats WHERE tablename='messages'")).rows,
        limits:'QA synthetic two-scale experiment; EXPLAIN warm after actual API; no production SLA, p95 or browser/memory claim; old SQL comparison is within one actual new-version database.'});
      assert.ok(source.toString().includes('jsonb_path_query_array'),'declared current query mapping must exist in actual candidate');
    }
  } finally {await db.end();}
}
export async function runTimelineCase(caseId:string,qa:QaEnvironment):Promise<RoundResult> {
  await qa.api.login();
  if(caseId==='SR-BE-DB-001'||caseId==='SR-BE-DB-002') {
    await measurement(qa,caseId.endsWith('002'));
    const files=[1000,10000].map(n=>resolve(qa.outputDir,`timeline-measurement-${n}.json`));
    if(caseId.endsWith('002')) return {caseId,status:'BLOCKED',variants:[{id:'same-database-queries-and-api',status:'PASS',evidence:files}],
      uncoveredVariants:['真实原/新版应用回滚复跑及最终优化diff独立核查尚未附入，不把SQL比较冒称应用回滚已验证']};
    return {caseId,status:'PASS',variants:[{id:'real-two-scale-plans-and-http',status:'PASS',evidence:files}]};
  }
  const {group,accounts}=await qa.api.createGroup(1);
  const ids=await seedPublic(qa,group.id,group.gatewayGroupId,83,
    caseId==='SR-BE-DB-004'?Date.now()+86_400_000:Date.UTC(2026,0,1));
  if(caseId==='SR-BE-DB-004') {
    const barrier=`confirmation-cursor-${randomUUID()}`;
    qa.gateway.configure({eventDuplicates:2});
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`,{barrier:{name:barrier,phase:'request'}});
    let released=false,primary:unknown;
    try {
      const sent=await qa.api.send(group.id,accounts[0].id,'snapshot pending send');
      const requestBarrier=await qa.gateway.barriers.waitFor(barrier,15_000);
      const queued=await eventually(()=>pages(qa,group.id),x=>x.items.some(m=>m.clientMsgId===sent.clientMsgId));
      const pending=queued.items.find(m=>m.clientMsgId===sent.clientMsgId)!;
      if(!['queued','accepted'].includes(pending.deliveryStatus))throw new BlockedError('Actual request barrier did not preserve a pending message premise');
      // This independent external message falls between the local pending time
      // and its eventual gateway confirmation. The old snapshot must remain
      // traversable, while a new snapshot must reflect the actual new ordering.
      const markerId=`confirmation-marker-${randomUUID()}`,markerAt=new Date(Date.parse(pending.sentAt)+1).toISOString();
      qa.gateway.emitMessage({groupId:group.gatewayGroupId,msgId:markerId,senderPlatformUserId:'qa-external',text:markerId,sentAt:markerAt});
      await eventually(()=>pages(qa,group.id),x=>x.items.length===ids.length+2);
      const baseline=await qa.api.messages(group.id,undefined,17),before=await pages(qa,group.id,baseline);
      if(baseline.items.some(m=>m.clientMsgId===sent.clientMsgId)||!before.reads.some(r=>r.response.items.some(m=>m.clientMsgId===sent.clientMsgId)))
        throw new BlockedError('Owned send was not on an actual continuation page before confirmation');
      assert.equal(before.items.find(m=>m.clientMsgId===sent.clientMsgId)?.deliveryStatus,pending.deliveryStatus);
      await qa.evidence('timeline-confirmation-before-release',{sent,requestBarrier,baseline,before,markerId,markerAt,pending});
      qa.gateway.barriers.release(barrier);released=true;
      const fresh=await eventually(()=>pages(qa,group.id),x=>x.items.some(m=>m.clientMsgId===sent.clientMsgId&&m.deliveryStatus==='sent'));
      const confirmedAt=new Date().toISOString(),confirmed=fresh.items.find(m=>m.clientMsgId===sent.clientMsgId)!;
      if(Date.parse(confirmed.sentAt)<=Date.parse(markerAt))throw new BlockedError('Actual confirmation timestamp did not cross the observed marker; reordering premise not established');
      const prior=await pages(qa,group.id,baseline);
      assertConfirmationContinuation(baseline,before,prior,sent.clientMsgId);
      assert.equal(fresh.items.filter(m=>m.clientMsgId===sent.clientMsgId).length,1);
      assert.ok(before.items.findIndex(m=>m.msgId===markerId)<before.items.findIndex(m=>m.clientMsgId===sent.clientMsgId));
      assert.ok(fresh.items.findIndex(m=>m.clientMsgId===sent.clientMsgId)<fresh.items.findIndex(m=>m.msgId===markerId));
      assert.deepEqual(fresh.items.map(timelineIdentity).sort(),before.items.map(timelineIdentity).sort());
      uniqueAndSorted(fresh.items);
      const gateway=qa.gateway.snapshot(),confirmEvent=gateway.events.find(e=>e.type==='message_sent'&&e.data.clientMsgId===sent.clientMsgId);
      assert.ok(confirmEvent,'actual gateway confirmation event must have occurred');
      qa.gateway.deliver(confirmEvent.eventId,{repeat:2});
      const replayWindowMs=500,observeUntil=performance.now()+replayWindowMs;
      let replayed=await pages(qa,group.id),replaySamples=0;
      do {
        replayed=await pages(qa,group.id);replaySamples++;
        assert.equal(replayed.items.filter(m=>m.clientMsgId===sent.clientMsgId).length,1);uniqueAndSorted(replayed.items);
      }while(performance.now()<observeUntil);
      await qa.evidence('timeline-confirmation',{sent,baseline,before,prior,fresh,replayed,confirmedAt,markerId,markerAt,requestBarrier,
        replayObservation:{windowMs:replayWindowMs,samples:replaySamples,scope:'finite actual API observation, not a liveness proof or new product SLA'},
        oracle:'fixed original identities and observed same-snapshot order; no invented tie-breaker or requirement to freeze all status fields',gateway:qa.gateway.snapshot()});
    } catch(error) {primary=error;throw error;
    } finally {
      // This barrier is before the remote effect; stop dispatchers first if the
      // case failed before explicitly authorizing the intended release.
      if(!released) {
        try {await qa.kill('SIGKILL');qa.gateway.barriers.release(barrier);}
        catch(error) {
          await qa.evidence('timeline-confirmation-cleanup-error',{primary:String(primary??''),cleanup:String(error),barrierKeptHeld:true});
          if(!primary)throw error;
        }
      }
    }
    return {caseId,status:'PASS',variants:[{id:'frozen-confirmation-order-and-duplicate',status:'PASS',evidence:[resolve(qa.outputDir,'timeline-confirmation.json')]}]};
  }
  const first=await qa.api.messages(group.id,undefined,13),second=await qa.api.messages(group.id,undefined,17);
  const [firstBefore,secondBefore]=await Promise.all([pages(qa,group.id,first),pages(qa,group.id,second)]);
  qa.gateway.emitMessage({groupId:group.gatewayGroupId,msgId:'late-new',senderPlatformUserId:'qa-ext',text:'new',sentAt:'2027-01-01T00:00:00Z'});
  qa.gateway.emitMessage({groupId:group.gatewayGroupId,msgId:'late-old',senderPlatformUserId:'qa-ext',text:'old',sentAt:'2020-01-01T00:00:00Z'});
  if(caseId==='SR-BE-DB-005') await qa.restart();
  const [a,b]=await Promise.all([pages(qa,group.id,first),pages(qa,group.id,second)]);
  for(const chain of [a,b]) {assert.deepEqual(chain.items.map(m=>m.msgId).sort(),[...ids].sort());uniqueAndSorted(chain.items);}
  assertFrozenOrder(firstBefore.items,a.items);assertFrozenOrder(secondBefore.items,b.items);
  const fresh=await eventually(()=>pages(qa,group.id),x=>x.items.length===85);
  uniqueAndSorted(fresh.items);
  await qa.evidence('timeline-fixed-set',{ids,first,second,firstBefore,secondBefore,a,b,fresh,restarted:caseId.endsWith('005'),
    tieRule:'No additional id ordering imposed; each original frozen chain retains its own observed order across equal sentAt values.'});
  return {caseId,status:'PASS',variants:[{id:'independent-cursor-chains-and-refresh',status:'PASS',evidence:[resolve(qa.outputDir,'timeline-fixed-set.json')]}]};
}
