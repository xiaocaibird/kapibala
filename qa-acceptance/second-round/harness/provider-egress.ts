import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PreparationBlocked, type Evidence, type Json } from '../contracts/media-provider.js';
export interface ProviderEgressBinding {path:string;preloadSha256:string;endpoints:{host:string;port:number}[];pids:number[];exit?:{code:number|null;signal:string|null}}
export async function readProviderEgress(bindings:ProviderEgressBinding[],requireExit:boolean){
  if(!bindings.length)throw new PreparationBlocked('Provider egress preload not explicitly enabled');const ledgers=[];
  for(const binding of bindings){
    const st=await lstat(binding.path);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid?.()||(st.mode&0o777)!==0o600)throw new PreparationBlocked('Provider egress ledger is not owned private file');
    const bytes=await readFile(binding.path),text=bytes.toString('utf8');if(!text.endsWith('\n'))throw new PreparationBlocked('Incomplete provider egress final line');
    const rows=text.trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>),ready=rows[0];
    if(ready?.event!=='observer-ready'||!binding.pids.includes(Number(ready.pid))||ready.node!=='v24.21.0'||ready.undici!=='7.29.1'||ready.preloadSha256!==binding.preloadSha256||ready.mode!=='strict')throw new PreparationBlocked('Provider egress ready is not bound to the frozen owned process');
    assert.deepEqual(ready.endpoints,binding.endpoints);let seq=0;
    for(const row of rows){if(row.seq!==++seq||row.protocol!=='node-egress-hooks-v1'||row.pid!==ready.pid||row.instance!==ready.instance)throw new PreparationBlocked('Provider egress sequence/identity mismatch');if(row.event==='observer-gap')throw new PreparationBlocked('Provider egress coverage gap');}
    const tail=rows.find(row=>row.event==='process-exit');
    if(requireExit){if(!binding.exit)throw new PreparationBlocked('No actual process exit outcome');if(binding.exit.signal===null){assert.equal(binding.exit.code,0);if(!tail)throw new PreparationBlocked('Graceful provider exit lacks final ledger');assert.equal(rows.at(-1),tail,'graceful exit record must be the final ledger entry');assert.equal(tail.exitCode,0);assert.equal(tail.gaps,0);assert.equal(tail.hookStillInstalled,true);}else if(binding.exit.signal!=='SIGKILL')throw new PreparationBlocked('Unexpected provider exit signal');}
    ledgers.push({binding,rows,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,tailComplete:!!tail});
  }
  const evidence:Evidence={reference:'provider:actual-node-egress',raw:JSON.parse(JSON.stringify({ledgers,coverage:'Node v24.21.0 HTTP/net.Socket hooks only; native bypass, child processes, DNS/UDP and earlier imports excluded'})) as Json};return {ledgers,evidence};
}
