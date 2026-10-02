import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { temporaryDatabase } from "/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala/tests/support/temporary-database.ts";
import { migrate } from "/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala/apps/server/src/core/migrations.ts";
import { GatewayEvents } from "/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala/apps/server/src/modules/gateway/events.ts";
import { Messages } from "/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala/apps/server/src/modules/gateway/messages.ts";
import { RemoteClient } from "/Users/zcm/.codex/worktrees/architecture-runtime-boundaries/kapibala/apps/server/src/core/remote.ts";
const execute=promisify(execFile);
const temporary=await temporaryDatabase({after(){}});
const db=temporary.db;
const logs:any[]=[]; const requests:any[]=[]; const sseFrames:string[]=[];
const log={error(fields:any,message:string){logs.push({level:"error",message,eventId:fields.eventId,eventType:fields.eventType,error:fields.err ? {name:fields.err.name,message:fields.err.message,code:fields.err.code,detail:fields.err.detail,where:fields.err.where,stack:fields.err.stack}:null});},warn(fields:any,message:string){logs.push({level:"warn",message,error:fields.err?.message});},info(){},debug(){}};
let events:GatewayEvents|undefined;let server:any;let directory:string|undefined;let eventInputs:any[]=[];
const facts:any={kind:"development-readonly-reproduction-no-product-patch",productMediaRevision:"22db66d7e82383eac17be6db85cf3e2bd512c975",integratedRevision:"771e44e2db4b539daf65e0041059a4d45394f3b8",database:new URL(temporary.url).pathname.slice(1)};
try {
 await migrate(db); facts.version=(await db.query('SELECT version()')).rows[0];
 await db.query("INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('nul-group','nul-remote','account-1')");
 directory=await mkdtemp(join(tmpdir(),'kapibala-media-nul-files-')); facts.directory=directory;
 const frame=(eventId:number,msgId:string,mediaUrl:string)=>({eventId,type:'message',groupId:'nul-remote',msgId,senderPlatformUserId:'external',text:`text-${msgId}`,sentAt:new Date().toISOString(),mediaUrl});
 server=createServer((req,res)=>{
  requests.push({method:req.method,url:req.url});
  if(req.url==='/events?since=0'){
   res.writeHead(200,{'content-type':'text/event-stream'});
   for(const event of eventInputs){const wire='data: '+JSON.stringify(event)+'\n\n';sseFrames.push(wire);res.write(wire);}
   return;
  }
  if(req.url?.startsWith('/media/')){res.writeHead(200,{'content-type':'application/octet-stream'});res.end('real attachment bytes');return;}
  res.writeHead(404);res.end();
 });
 server.listen(0,'127.0.0.1'); await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;facts.origin=origin;
 eventInputs=[frame(1,'ok-start','/media/ok-start'),frame(2,'raw-nul',origin+'/media/raw\u0000nul'),frame(3,'encoded-nul','/media/encoded%00nul'),frame(4,'ok-end',origin+'/media/ok-end')];
 const ctx:any={db,log,gateway:new RemoteClient(origin),agent:new RemoteClient(origin)};
 events=new GatewayEvents(ctx,new Messages(ctx));events.start();
 const until=Date.now()+5000;
 while(!(await db.query("SELECT 1 FROM messages WHERE msg_id='ok-end'")).rowCount){assert.ok(Date.now()<until,'later valid event ingested');await new Promise(r=>setTimeout(r,10));}
 await events.close();
 const snapshot=async()=>({gatewayEvents:(await db.query('SELECT event_id,type,data FROM gateway_events ORDER BY event_id')).rows,messages:(await db.query('SELECT msg_id,text,metadata,local_file_path FROM messages ORDER BY msg_id')).rows,media:(await db.query('SELECT msg_id,source_url,state,attempts,last_error,local_file_path FROM media_files ORDER BY msg_id')).rows,inconsistencies:(await db.query("SELECT type,payload FROM events WHERE type='inconsistency' ORDER BY seq")).rows});
 facts.afterFirst=await snapshot();
 facts.retries=[];
 for(let i=0;i<2;i++){await events.retryFailed();facts.retries.push(await snapshot());}
 facts.probes=[];
 for(const [type,value] of [['text',eventInputs[1].mediaUrl],['jsonb',JSON.stringify(eventInputs[1])],['jsonb',JSON.stringify({mediaUrl:eventInputs[1].mediaUrl})]] as const){
  try{await db.query(`SELECT $1::${type} AS value`,[value]);facts.probes.push({type,unexpectedSuccess:true});}
  catch(error:any){facts.probes.push({type,code:error.code,message:error.message,detail:error.detail,where:error.where});}
 }
 for(let i=0;i<2;i++){
  const child=await execute(process.execPath,['--import','tsx','tests/support/media-worker-process.ts'],{env:{...process.env,MEDIA_TEST_DATABASE_URL:temporary.url,MEDIA_TEST_DIRECTORY:directory,MEDIA_TEST_GATEWAY_URL:origin},timeout:20000});
  assert.equal(child.stderr,'');
 }
 facts.afterWorkers=await snapshot(); facts.requests=requests;facts.logs=logs;facts.input=eventInputs;facts.sseFrames=sseFrames;
 facts.files=await readdir(directory);
 assert.equal(facts.afterFirst.messages.length,3);assert.equal(facts.afterFirst.gatewayEvents.length,3);assert.equal(facts.afterFirst.media.length,3);
 for(const state of [facts.afterFirst,...facts.retries,facts.afterWorkers]){
  assert.ok(!state.messages.some((r:any)=>r.msg_id==='raw-nul'));assert.ok(!state.media.some((r:any)=>r.msg_id==='raw-nul'));assert.ok(!state.gatewayEvents.some((r:any)=>String(r.event_id)==='2'));
 }
 assert.ok(logs.some(x=>x.eventId==='2'&&x.error?.code==='22P05'));
 assert.deepEqual(requests.filter(x=>x.url.startsWith('/media/')).map(x=>x.url).sort(),['/media/ok-end','/media/ok-start']);
 const encoded=facts.afterWorkers.media.find((r:any)=>r.msg_id==='encoded-nul');assert.equal(encoded.state,'unavailable');assert.equal(encoded.last_error,'UNTRUSTED_MEDIA_URL');assert.equal(encoded.attempts,0);
 for(const row of facts.afterWorkers.media.filter((r:any)=>r.msg_id.startsWith('ok-'))){assert.equal(row.state,'ready');assert.equal(await readFile(row.local_file_path,'utf8'),'real attachment bytes');}
 facts.conclusion='RAW_NUL_EVENT_ROLLED_BACK_BEFORE_MESSAGE_OR_MEDIA_REGISTRATION';
 console.log(JSON.stringify(facts,null,2));
} finally {
 await events?.close(); if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close((error:any)=>error?reject(error):resolve()));}
 await temporary.close();if(directory)await rm(directory,{recursive:true,force:true});
}
