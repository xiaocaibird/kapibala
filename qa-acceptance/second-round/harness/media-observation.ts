import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readRuntimeConfig } from '../../harness/runtime-observation.js';
import { BlockedError } from '../../harness/security.js';
import type { SecondRoundEnvironment } from './environment.js';

export type MediaCorrelation = { kind: 'media-cleanup'; groupId: string; msgId: string; mediaId: string } |
  { kind: 'media-reference'; groupId: string; msgId: string; mediaId: string; operation: { kind: 'history'; runId: string; toolUseId: string } | { kind:'trigger'; messageId:string } };
export interface MediaSnapshot {
  protocol: string; leaseId: string; state: string; expiresAt: string; correlation: MediaCorrelation;
  binding: {apiUrl:string;revision:string;pid:number;observedOwnerToken:string};
  events: Array<Record<string, unknown> & {seq:number;kind:string}>;
}
const same = (a:unknown,b:unknown) => { try { assert.deepEqual(a,b); return true; } catch { return false; } };
export function validateMediaSnapshot(value: unknown, target: ReturnType<SecondRoundEnvironment['capacityControlTarget']>, id: string, correlation: MediaCorrelation, prior?: MediaSnapshot): MediaSnapshot {
  const v = value as MediaSnapshot;
  if (!v || v.protocol !== 'qa-runtime-observation/1' || v.leaseId !== id || !same(v.correlation,correlation) ||
      !['armed','held','released'].includes(v.state) || !Number.isFinite(Date.parse(v.expiresAt)) || !Array.isArray(v.events) ||
      !same(v.binding,{apiUrl:target.apiUrl,revision:target.revision,pid:target.pid,observedOwnerToken:target.ownerToken}))
    throw new BlockedError('Media witness is not bound to the exact owned process, lease and media operation');
  let seq=0,operationId:unknown;
  const transactionIdentities=new Map<string,{backendPid:number;transactionId:string}>();
  const expectedScope=correlation.kind==='media-reference'?'reference-transaction':'cleanup-claim-transaction';
  for(const event of v.events) {
    if(!Number.isSafeInteger(event.seq)||event.seq<=seq||typeof event.kind!=='string'||!event.kind.startsWith(correlation.kind==='media-reference'?'reference-':'cleanup-')||
      event.instancePid!==target.pid||!same(event.correlation,correlation)||typeof event.operationId!=='string'||!event.operationId||
      !Number.isSafeInteger(event.backendPid)||Number(event.backendPid)<=0||typeof event.transactionId!=='string'||!event.transactionId||
      event.transactionIdentityScope!==expectedScope||typeof event.barrierHeld!=='boolean')
      throw new BlockedError('Media event lacks the original operation and real PostgreSQL transaction identity');
    seq=event.seq;
    if(operationId!==undefined&&operationId!==event.operationId)throw new BlockedError('Media lease changed original operation');
    operationId=event.operationId;
    // Commit/completed stages carry the named original transaction identity.
    // This does not assert the later deleted update reused that connection.
    const identity={backendPid:Number(event.backendPid),transactionId:event.transactionId};
    const original=transactionIdentities.get(expectedScope);
    if(original&&!same(original,identity))throw new BlockedError('Media lease changed the PostgreSQL identity of its declared original transaction scope');
    transactionIdentities.set(expectedScope,identity);
  }
  if(prior&&(prior.expiresAt!==v.expiresAt||v.events.length<prior.events.length||!same(v.events.slice(0,prior.events.length),prior.events)))throw new BlockedError('Media lease history changed or TTL extended');
  return v;
}
export function assertMediaHeld(snapshot:MediaSnapshot,kind:string,now=Date.now()):void {
  const current=snapshot.events.at(-1);
  if(snapshot.state!=='held'||Date.parse(snapshot.expiresAt)<=now||current?.kind!==kind||current.barrierHeld!==true)
    throw new BlockedError(`Media stage ${kind} was historical/released or expired; the exact fault window is no longer proven`);
}
export class MediaObservation {
  readonly target; readonly url; private verified=false; private leases: MediaLease[]=[];
  constructor(readonly env:SecondRoundEnvironment) {this.target=env.capacityControlTarget();this.url=readRuntimeConfig(env.config).url;}
  async request(method:string,path:string,body?:unknown):Promise<unknown> {
    const response=await fetch(this.url.replace(/\/$/,'')+path,{method,redirect:'manual',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    const text=await response.text();let value:unknown;try{value=JSON.parse(text);}catch{throw new BlockedError('Media controller returned invalid JSON');}
    await this.env.evidence(`media-control-${randomUUID()}`,{method,path,status:response.status,body,response:value});
    if(!response.ok)throw new BlockedError(`Media controller rejected exact operation: ${response.status}`);
    return value;
  }
  async verify() {
    const query=new URLSearchParams({apiUrl:this.target.apiUrl,revision:this.target.revision,pid:String(this.target.pid)});
    const value=await this.request('GET','/qa/runtime/v1/capabilities?'+query) as {protocol:string;binding:unknown;capabilities:string[]};
    if(value.protocol!=='qa-runtime-observation/1'||!value.capabilities?.includes('media-reference-witness')||!same(value.binding,{apiUrl:this.target.apiUrl,revision:this.target.revision,pid:this.target.pid,observedOwnerToken:this.target.ownerToken}))throw new BlockedError('No owned media-reference witness capability');
    this.verified=true;
  }
  async arm(correlation:MediaCorrelation,holdAt:string[],ttlMs=50000) {
    if(!this.verified)throw new BlockedError('Verify before arming media observation');
    const id=randomUUID(),lease=new MediaLease(this,id,correlation,[...holdAt]);this.leases.push(lease);
    const value=await this.request('PUT',lease.path,{protocol:'qa-runtime-observation/1',target:{apiUrl:this.target.apiUrl,revision:this.target.revision,pid:this.target.pid},ttlMs,mode:correlation.kind==='media-reference'?'hold-media-reference':'hold-media-cleanup',correlation,holdAt});
    lease.accept(value);return lease;
  }
  async close() {const settled=await Promise.allSettled(this.leases.map(l=>l.release()));const failures=settled.filter(r=>r.status==='rejected');if(failures.length)throw new AggregateError(failures,'Media observation cleanup incomplete');}
}
export class MediaLease {
  latest?:MediaSnapshot; readonly path;
  constructor(readonly observer:MediaObservation,readonly id:string,readonly correlation:MediaCorrelation,readonly holdAt:readonly string[]=[]){this.path='/qa/runtime/v1/leases/'+id;}
  accept(value:unknown){this.latest=validateMediaSnapshot(value,this.observer.target,this.id,this.correlation,this.latest);return this.latest;}
  async snapshot(){return this.accept(await this.observer.request('GET',this.path));}
  async advance(){return this.accept(await this.observer.request('POST',this.path+'/advance'));}
  async release(){if(this.latest?.state==='released')return this.latest;return this.accept(await this.observer.request('DELETE',this.path));}
  async wait(kind:string,budgetMs=10000){
    const until=performance.now()+budgetMs;
    do {
      const s=await this.snapshot();
      if(s.events.some(e=>e.kind===kind)) {if(this.holdAt.includes(kind))assertMediaHeld(s,kind);return s;}
      if(s.state==='released'||Date.parse(s.expiresAt)<=Date.now())throw new BlockedError(`Media lease ended before observing ${kind}`);
      await new Promise(r=>setTimeout(r,25));
    }while(performance.now()<until);
    throw new BlockedError(`Actual media stage ${kind} did not occur`);
  }
}
