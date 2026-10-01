import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PreparationBlocked, type Evidence, type Json } from '../contracts/media-provider.js';
import type { SecondRoundEnvironment } from './environment.js';
export function mediaEgressProjection(rows:Record<string,unknown>[],gatewayOrigin:string,agentOrigin:string){
  const attempts:{id:string;url:string}[]=[];let seq=0,instance:unknown,pid:unknown;
  const protocolRoutes=/^\/(?:events|accounts(?:\/|$)|groups(?:\/|$)|messages(?:\/|$)|health(?:\/|$))/;
  for(const row of rows){
    if(row.protocol!=='node-egress-hooks-v1'||row.seq!==++seq||typeof row.instance!=='string'||!Number.isSafeInteger(row.pid))throw new PreparationBlocked('Egress ledger identity/sequence malformed');
    if(instance!==undefined&&(instance!==row.instance||pid!==row.pid))throw new PreparationBlocked('Egress instance identity changed');instance=row.instance;pid=row.pid;
    if(row.event==='observer-gap')throw new PreparationBlocked('Egress observer reported a coverage gap');
    if(row.event==='http-request-created'){
      if(typeof row.url!=='string'||typeof row.requestId!=='string')throw new PreparationBlocked('Unclassified HTTP target in egress');
      const u=new URL(row.url);const knownGateway=u.origin===gatewayOrigin&&protocolRoutes.test(u.pathname);
      const knownAgent=u.origin===agentOrigin&&/^\/agent\/(turn|audit)$/.test(u.pathname);
      if(!knownGateway&&!knownAgent)attempts.push({id:String(instance)+':'+row.requestId,url:row.url});
    }
    // Preserve forbidden connect attempts even if there was no HTTP creation.
    // The reviewed tsx bootstrap can attempt a Unix pipe; that is retained in
    // the full ledger but is not attributed to a media URL request.
    const target=row.target as {kind?:string;host?:string;port?:number}|undefined;
    if(row.event==='socket-connect-call'&&row.blocked===true&&target?.kind==='tcp')attempts.push({id:String(instance)+':'+String(row.connectId),url:`tcp://${target.host}:${target.port}`});
  }
  if(rows[0]?.event!=='observer-ready')throw new PreparationBlocked('Egress observer was not established before application activity');
  return attempts;
}
export async function mediaEgress(env:SecondRoundEnvironment, requireExit=false):Promise<{attempts:{id:string;url:string}[];evidence:Evidence}>{
  if(!env.egressLedgers.length)throw new PreparationBlocked('Actual process egress observer is not enabled');
  const attempts:{id:string;url:string}[]=[],ledgers:unknown[]=[];
  for(const path of env.egressLedgers){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o077))throw new PreparationBlocked('Egress ledger ownership changed');
    const bytes=await readFile(path),text=bytes.toString('utf8');if(!text.endsWith('\n'))throw new PreparationBlocked('Egress ledger has an incomplete final line');
    const rows=text.trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);
    const expected=env.egressBindings.get(path),ready=rows[0];
    if(!expected?.pids?.includes(Number(ready?.pid))||ready?.mode!=='strict'||ready?.node!=='v24.21.0'||ready?.undici!=='7.29.1'||ready?.preloadSha256!==expected.preloadSha256)throw new PreparationBlocked('Egress ready metadata does not identify current owned application and reviewed preload');
    try { assert.deepEqual(ready.endpoints,expected.endpoints); } catch { throw new PreparationBlocked('Egress endpoint set differs from owned launch'); }
    if(requireExit){const tail=rows.at(-1);if(tail?.event!=='process-exit'||tail.gaps!==0||tail.hookStillInstalled!==true||tail.exitCode!==0)throw new PreparationBlocked('Graceful egress tail must prove no observer gaps, unchanged hook and normal exit; zero activity cannot be inferred from incomplete coverage');}
    attempts.push(...mediaEgressProjection(rows,env.mediaSource!.url,env.externalAgentUrl??env.agent.url));
    ledgers.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),rows});
  }
  const raw={coverage:'reviewed Node24.21.0 HTTP creation and net.Socket hooks; excludes native bypass and child processes',attempts,ledgers};
  await env.evidence('media-egress-snapshot',raw);
  return {attempts,evidence:{reference:'media-egress-snapshot.json',raw:JSON.parse(JSON.stringify(raw)) as Json}};
}
