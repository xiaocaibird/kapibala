import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PreparationBlocked, type Barrier, type Evidence, type Json } from '../contracts/media-provider.js';
export const OBSERVATION_PROTOCOL = 'qa-gemini-observation/1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
export interface UsageEvent { seq: number; at: string; monotonicMs: number; kind: string; queued: number; activeBatch: number; dropped: number; writeFailures: number; batchId: string | null; attemptIds: string[]; requestId?: string; attemptId?: string; diagnosticCode?: string }
export interface UsageHold { id: string; state: 'armed'|'held'|'released'|'expired'; ttlMs: number; expiresAt: string; reached: UsageEvent|null; releaseReason: string|null }
export interface ProviderSnapshot {
  protocol: string; instanceId: string; pid: number;
  usage: { entry: 'main'|'factory'; optionsSupplied: boolean; configuredEnabled: boolean; observationEnabled: boolean; initialized: boolean|null; queued: number|null; queuedIncludesActiveBatch: false; activeBatch: number|null; dropped: number|null; writeFailures: number|null; diagnosticCodes: string[]; events: UsageEvent[]; truncatedEvents: number };
  hold: UsageHold|null;
  transport: { enabled: boolean; coverage: 'provider-transport-only'; events: {seq:number;at:string;monotonicMs:number;requestId:string;kind:string;details:Record<string,Json>}[]; truncatedEvents:number };
}
const count = (value: unknown) => assert.ok(Number.isSafeInteger(value) && Number(value) >= 0, 'actual nonnegative integer observation required');
export function validateSnapshot(value: unknown, instanceId: string, pids: number[]): asserts value is ProviderSnapshot {
  assert.ok(value && typeof value === 'object'); const s = value as ProviderSnapshot;
  assert.equal(s.protocol, OBSERVATION_PROTOCOL); assert.equal(s.instanceId, instanceId); assert.ok(pids.includes(s.pid), 'snapshot PID must be owned listener');
  assert.ok(['main','factory'].includes(s.usage.entry));
  for (const key of ['optionsSupplied','configuredEnabled','observationEnabled'] as const) assert.equal(typeof s.usage[key], 'boolean');
  assert.equal(s.usage.queuedIncludesActiveBatch, false);
  for (const key of ['queued','activeBatch','dropped','writeFailures'] as const) { if (s.usage.observationEnabled) count(s.usage[key]); else assert.equal(s.usage[key], null); }
  if (s.usage.observationEnabled) assert.equal(typeof s.usage.initialized,'boolean'); else assert.equal(s.usage.initialized,null);
  assert.ok(Array.isArray(s.usage.events)); count(s.usage.truncatedEvents); assert.ok(Array.isArray(s.usage.diagnosticCodes));
  let seq = 0;
  for (const event of s.usage.events) { count(event.seq); assert.ok(event.seq > seq); seq = event.seq; assert.ok(Number.isFinite(Date.parse(event.at))); assert.ok(Number.isFinite(event.monotonicMs)); assert.equal(typeof event.kind,'string'); for (const key of ['queued','activeBatch','dropped','writeFailures'] as const) count(event[key]); assert.ok(Array.isArray(event.attemptIds) && event.attemptIds.every(id=>uuid.test(id))); if(event.batchId!==null)assert.ok(uuid.test(event.batchId)); }
  assert.equal(s.transport.coverage, 'provider-transport-only'); assert.equal(typeof s.transport.enabled,'boolean'); assert.ok(Array.isArray(s.transport.events)); count(s.transport.truncatedEvents);
}
/** QA-only HTTP client. Its identity is rebound after each real process start. */
export class ProviderObservationClient {
  constructor(readonly origin:string, private readonly token:string, readonly instanceId:string, readonly pids:number[], readonly save:(name:string,value:unknown)=>Promise<void>) {
    const url = new URL(origin); assert.equal(url.origin,origin); assert.equal(url.protocol,'http:'); assert.equal(url.hostname,'127.0.0.1'); assert.ok(url.port); assert.ok(uuid.test(instanceId)); assert.ok(token.length>=32 && token.length<=256);
  }
  private async request(path:string, method='GET', body?:unknown):Promise<unknown> {
    const response=await fetch(`${this.origin}/qa/usage/v1${path}`,{method,headers:{authorization:`Bearer ${this.token}`,'x-qa-instance-id':this.instanceId,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(5000)});
    const raw=await response.json();
    if(response.status!==200)throw new PreparationBlocked(`Owned observation ${method} ${path} returned ${response.status}: ${JSON.stringify(raw)}`);
    return raw;
  }
  async snapshot():Promise<ProviderSnapshot> {const value=await this.request('/snapshot');validateSnapshot(value,this.instanceId,this.pids);await this.save('provider-observation-snapshot',value);return value;}
  async closeWriter():Promise<ProviderSnapshot> {
    const value=await this.request('/writer/close','POST') as {closed?:unknown;snapshot?:unknown};
    assert.equal(value.closed,true);validateSnapshot(value.snapshot,this.instanceId,this.pids);
    const snapshot=value.snapshot,events=snapshot.usage.events;
    if(snapshot.usage.truncatedEvents||!events.some(e=>e.kind==='closing')||!events.some(e=>e.kind==='closed'))throw new PreparationBlocked('Writer close lacks complete actual closing/closed observation');
    assert.equal(snapshot.usage.queued,0);assert.equal(snapshot.usage.activeBatch,0);
    const closing=events.find(e=>e.kind==='closing')!,closed=events.find(e=>e.kind==='closed')!;assert.ok(closed.seq>closing.seq);
    await this.save('provider-writer-closed',snapshot);return snapshot;
  }
  async hold(ttlMs=120000):Promise<Barrier> {
    assert.ok(Number.isInteger(ttlMs)&&ttlMs>=100&&ttlMs<=120000);const id=randomUUID(),first=await this.request(`/holds/${id}`,'PUT',{ttlMs}) as UsageHold;
    assert.equal(first.id,id);assert.equal(first.ttlMs,ttlMs);assert.equal(first.state,'armed');assert.equal(first.reached,null);await this.save('provider-write-hold-created',first);
    let released=false;
    return {id,reached:async()=>{const deadline=performance.now()+10000;do {
      const hold=await this.request(`/holds/${id}`) as UsageHold;assert.equal(hold.id,id);assert.equal(hold.expiresAt,first.expiresAt,'polling cannot extend TTL');
      if(hold.state==='held') {
        const s=await this.snapshot(),event=hold.reached;assert.ok(event && event.kind==='before-write' && event.batchId && event.attemptIds.length>0);
        assert.equal(s.hold?.id,id);assert.equal(s.hold?.state,'held');assert.equal(s.usage.truncatedEvents,0,'finite gate proof must retain complete event history');
        assert.ok(s.usage.events.some(e=>e.seq===event.seq&&e.kind==='before-write'&&e.batchId===event.batchId));
        assert.ok(!s.usage.events.some(e=>e.batchId===event.batchId&&['write-started','write-settled'].includes(e.kind)),'held batch has not started persistence');
        await this.save('provider-write-hold-reached',{hold,snapshot:s});return proof('provider:actual-writer-before-write',{hold,snapshot:s});
      }
      if(!['armed','held'].includes(hold.state))throw new PreparationBlocked(`Usage hold terminated before evidence: ${hold.state}`);
      await new Promise(r=>setTimeout(r,25));
    }while(performance.now()<deadline);throw new PreparationBlocked('Usage hold did not reach actual writer');},release:async()=>{
      if(released)return;released=true;
      // Captured instance is immutable. Cleanup after a real stop must never
      // release a new process's hold through a reused address.
      try{const value=await this.request(`/holds/${id}`,'DELETE') as UsageHold;assert.equal(value.id,id);await this.save('provider-write-hold-released',value);}catch(error){try{process.kill(this.pids[0]!,0);}catch(dead){if((dead as NodeJS.ErrnoException).code==='ESRCH'){await this.save('provider-write-hold-owner-exited',{instanceId:this.instanceId,pids:this.pids});return;}}throw error;}
    }};
  }
}
