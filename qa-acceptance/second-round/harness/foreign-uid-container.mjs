// Standalone QA program copied into an ephemeral Linux container. It imports
// only Node builtins and invokes the fixed SUT's public offline process entry.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, chown, lstat, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const root='/qa', source='/work/source', uid=10001, foreignUid=10002;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const result={schema:1,scope:'Linux real UID supplement only; does not replace Darwin or whole-case results',
  environment:{platform:process.platform,arch:process.arch,node:process.version,qaUid:process.getuid(),sutUid:uid,foreignUid},variants:[],cleanupErrors:[]};
let serial=0, active, server, currentPlans=0; const upstream=[], children=new Set();
const proof=async(name,value)=>{const path=`${root}/${++serial}-${name}.json`;await writeFile(path,JSON.stringify(value,null,2)+'\n');return path;};
const failure=error=>error instanceof assert.AssertionError?'FAIL':'BLOCKED';
async function variant(id,body){try{const value=await body();const path=await proof(id,value);result.variants.push({id,status:'PASS',evidence:[path]});return true;}
 catch(error){const path=await proof(id,{error:String(error),stack:error.stack});result.variants.push({id,status:failure(error),reason:String(error),evidence:[path]});return false;}}
async function snapshot(path){const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());return {path,ino:stat.ino,uid:stat.uid,gid:stat.gid,mode:stat.mode&0o777,nlink:stat.nlink,sha256:sha(await readFile(path)),size:stat.size};}
async function directory(path,owner){await mkdir(path,{mode:0o700});await chown(path,owner,owner);}
function launch(command,args,options={}){
 const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:root,TMPDIR:'/tmp'},...options});
 const record={pid:child.pid,stdout:'',stderr:'',exit:null,child};children.add(record);
 child.stdout.on('data',b=>{record.stdout+=b});child.stderr.on('data',b=>{record.stderr+=b});
 record.closed=new Promise(resolve=>{child.once('error',error=>{record.error=String(error);resolve();});child.once('close',(code,signal)=>{record.exit={code,signal};children.delete(record);resolve();});});return record;
}
async function bounded(record,budget=20000){let timer;try{await Promise.race([record.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('QA bounded process diagnostic expired')),budget);})]);}finally{clearTimeout(timer);}if(record.error)throw new Error(record.error);return record;}
async function createdBy(path,bytes,owner){
 const child=launch(process.execPath,['-e',`require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'),{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),caps:require('fs').readFileSync('/proc/self/status','utf8').match(/^CapEff:\\s*(.*)$/m)?.[1]}))`,path,Buffer.from(bytes).toString('base64')],{uid:owner,gid:owner});
 await bounded(child);assert.deepEqual(child.exit,{code:0,signal:null});const creator=JSON.parse(child.stdout);assert.equal(creator.uid,owner);assert.equal(creator.caps,'0000000000000000');const file=await snapshot(path);assert.equal(file.uid,owner);assert.equal(file.mode,0o600);return {creator,file};
}
async function start(){
 if(active)throw new Error('Owned SUT already running');
 const child=launch(process.execPath,['--import','tsx','scripts/qa-gemini-agent.ts'],{cwd:source,uid,gid:uid,
 env:{PATH:process.env.PATH,HOME:`${root}/sut-home`,TMPDIR:'/tmp',QA_GEMINI_OFFLINE:'true',QA_GEMINI_PROVIDER_URL:`http://127.0.0.1:${server.address().port}`,QA_GEMINI_SESSION_DIR:`${root}/session`,GEMINI_USAGE_ENABLED:'true'}});
 active=child;const until=Date.now()+20000;let ready;
 while(Date.now()<until&&!child.exit){ready=child.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}}).find(row=>row.event==='qa-gemini-agent-ready');if(ready)break;await delay(20);}
 if(!ready)throw new Error(`No actual owned SUT ready: ${child.stderr}`);
 assert.match(ready.address,/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);child.address=ready.address;
 const proc=await readFile(`/proc/${child.pid}/status`,'utf8');assert.deepEqual(proc.match(/^Uid:\s*(.*)$/m)[1].trim().split(/\s+/).map(Number),[uid,uid,uid,uid]);assert.equal(proc.match(/^CapEff:\s*(.*)$/m)[1].trim(),'0000000000000000');
 await proof('sut-ready',{pid:child.pid,ready,procStatus:proc});return child;
}
async function stop(){if(!active)return;const child=active;child.child.kill('SIGTERM');let error;try{await bounded(child,10000);assert.deepEqual(child.exit,{code:0,signal:null});}catch(e){error=e;child.child.kill('SIGKILL');await bounded(child,5000);}
 await proof('sut-exit',{pid:child.pid,stdout:child.stdout,stderr:child.stderr,exit:child.exit});active=undefined;if(error)throw error;
}
const request=runId=>({runId,tools:[['get_recent_messages',{limit:{type:'number'}}],['send_message',{text:{type:'string'},idempotency_key:{type:'string'}}],['kick_user',{platform_user_id:{type:'string'},reason:{type:'string'}}],['finish',{summary:{type:'string'}}]].map(([name,properties])=>({name,description:`QA ${name}`,input_schema:{type:'object',properties,required:Object.keys(properties)}})),messages:[{role:'user',content:[{type:'text',text:'QA independent real UID fixture'}]}]});
async function exchange(body){if(!active)throw new Error('No owned SUT');const began=new Date().toISOString(),response=await fetch(`${active.address}/agent/turn`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)}),text=await response.text();let value;try{value=JSON.parse(text)}catch{value=null}const fact={began,ended:new Date().toISOString(),status:response.status,request:body,body:value,raw:text};await proof('http',fact);return fact;}
async function successful(body){currentPlans++;const response=await exchange(body);assert.equal(response.status,200);assert.equal(response.body.stop_reason,'end_turn');assert.equal(response.body.content[0].type,'text');return response;}
async function absent(path){try{await lstat(path);return false}catch(e){if(e.code==='ENOENT')return true;throw e;}}

try {
 assert.equal(process.platform,'linux');assert.equal(process.getuid(),0);assert.equal(process.version,'v24.21.0');
 assert.deepEqual(await readdir(root),[],'The exact newly owned evidence volume must start empty');
 await directory(`${root}/session`,uid);await directory(`${root}/sut-home`,uid);await directory(`${root}/foreign`,foreignUid);
 const sentinelPath=`${root}/foreign/foreign-history.json`,secretPath=`${root}/foreign/fake-credential-sentinel`;
 const sentinel=await createdBy(sentinelPath,'QA separate history',foreignUid),secret=await createdBy(secretPath,`QA-FAKE-SECRET-${randomUUID()}`,foreignUid);
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const part of req)chunks.push(part);const entry={path:req.url,method:req.method,body:Buffer.concat(chunks).toString(),syntheticAuthMatched:req.headers['x-goog-api-key']==='qa-offline-synthetic-key',at:new Date().toISOString()};upstream.push(entry);
 if(req.method!=='POST'||req.url!=='/v1beta/models/gemini-3.1-flash-lite:generateContent'||!entry.syntheticAuthMatched||currentPlans===0){res.writeHead(503);res.end('QA_UNPLANNED');return;}currentPlans--;res.setHeader('content-type','application/json');res.end(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({decision:{name:'end_turn',text:'QA real UID response'}})}]}}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:3,totalTokenCount:5}}));}catch{res.writeHead(500);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let savedRequest,firstResponse,sessionPath,originalSession;
 const ready=await variant('linux-owned-positive-control',async()=>{await start();savedRequest=request(`qa-foreign-${randomUUID()}`);firstResponse=await successful(savedRequest);
 const records=(await readdir(`${root}/session`)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));assert.equal(records.length,1);sessionPath=`${root}/session/${records[0]}`;originalSession=await snapshot(sessionPath);assert.equal(originalSession.uid,uid);assert.equal(originalSession.mode,0o600);assert.equal((await lstat(`${root}/session`)).mode&0o777,0o700);assert.equal(upstream.length,1);return {firstResponse,originalSession,creatorUid:uid};});
 if(ready)await variant('SR-C2-008-foreign-uid-record',async()=>{
  const foreignPath=`${root}/foreign/session-${randomUUID()}`,foreign=await createdBy(foreignPath,await readFile(sessionPath),foreignUid),backup=`${root}/original-session-backup`;
  await rename(sessionPath,backup);await rename(foreignPath,sessionPath);let primary;const callsBeforeFault=upstream.length;
  try {const installed=await snapshot(sessionPath);assert.equal(installed.uid,foreignUid);assert.equal(installed.mode,originalSession.mode);assert.equal(installed.sha256,originalSession.sha256);const before=upstream.length;
   const rejected=await exchange(savedRequest);assert.ok(rejected.status<200||rejected.status>=300,'Actual foreign owner record must be refused');assert.equal(upstream.length,before,'Refusal occurs before another inference');assert.deepEqual(await snapshot(sessionPath),installed);
   return {foreign,installed,rejected,upstreamCount:before,scope:'Same real generated bytes/private mode; actual different UID, SUT lacks capabilities. Refusal can occur at OS read or public store safety check.'};
  }catch(e){primary=e;throw e;}finally {try{const current=await snapshot(sessionPath);assert.equal(current.ino,foreign.file.ino);assert.equal(current.uid,foreignUid);await rename(sessionPath,foreignPath);assert.deepEqual(await snapshot(backup),{...originalSession,path:backup});await rename(backup,sessionPath);const repeat=await exchange(savedRequest);assert.deepEqual(repeat.body,firstResponse.body);assert.equal(repeat.status,200);assert.equal(upstream.length,callsBeforeFault,'Restored actual completed state reuses its response');await proof('foreign-record-restored',{restored:await snapshot(sessionPath),repeat});}catch(e){await proof('foreign-record-restore-error',{error:String(e)});if(!primary)throw e;result.cleanupErrors.push(String(e));}}
 });
 if(ready)await variant('SR-BE-USG-006-safe-temp-positive-control',async()=>{
  await stop();const path=`${root}/session/usage/usage-${randomUUID()}.tmp`,created=await createdBy(path,'QA safe private temporary',uid);await start();assert.equal(await absent(path),true,'Safe exact UUID temporary must actually be reclaimed');await stop();return {created,deleted:true};
 });
 if(ready)await variant('SR-BE-USG-006-foreign-uid-preservation',async()=>{
  await stop();const sessionBefore=await snapshot(sessionPath),usagePath=`${root}/session/usage/usage.jsonl`,usageBefore=await snapshot(usagePath);
  const from=`${root}/foreign/usage-${randomUUID()}.tmp`,created=await createdBy(from,'QA foreign private temporary',foreignUid),temporary=`${root}/session/usage/${from.split('/').pop()}`;await rename(from,temporary);const before=await snapshot(temporary);
  await start();const activeLock=await snapshot(`${root}/session/owner.lock`);assert.equal(activeLock.uid,uid);const response=await successful(request(`qa-foreign-usage-${randomUUID()}`));
  assert.deepEqual(await snapshot(temporary),before);assert.deepEqual(await snapshot(sessionPath),sessionBefore);assert.deepEqual(await snapshot(usagePath),usageBefore);assert.deepEqual(await snapshot(sentinelPath),sentinel.file);assert.deepEqual(await snapshot(secretPath),secret.file);
  assert.ok(active.stderr.includes('USAGE_STORE_UNAVAILABLE'));const logs=active.stdout+active.stderr;assert.ok(!logs.includes((await readFile(secretPath)).toString()));assert.ok(!logs.includes('qa-offline-synthetic-key'));await stop();
  assert.equal(await absent(`${root}/session/owner.lock`),true);assert.deepEqual(await snapshot(temporary),before);
  return {created,before,after:await snapshot(temporary),response,sessionBefore,usageBefore,activeLock,foreignSentinels:[sentinel.file,secret.file],scope:'Real UID foreign file preserved; optional journal refusal does not prevent actual inference. Fake key is an untouched sentinel, not a production key-import test.'};
 });
} catch(error){const path=await proof('setup-or-unhandled-error',{error:String(error),stack:error.stack});result.variants.push({id:'linux-fixture-prerequisite',status:failure(error),reason:String(error),evidence:[path]});}
finally {
 try{await stop();}catch(error){result.cleanupErrors.push(String(error));}
 for(const child of children){child.child.kill('SIGKILL');try{await bounded(child,5000);}catch(error){result.cleanupErrors.push(String(error));}}
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await proof('upstream-complete',{records:upstream,unconsumedPlans:currentPlans});
 if(upstream.some(row=>!row.syntheticAuthMatched))result.variants.push({id:'synthetic-transport-auth',status:'FAIL',reason:'Actual upstream authentication mismatch',evidence:[]});
 result.status=result.variants.some(v=>v.status==='FAIL')?'FAIL':result.cleanupErrors.length||result.variants.length!==4||result.variants.some(v=>v.status!=='PASS')?'BLOCKED':'PASS';
 await writeFile(`${root}/result.json`,JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify({event:'qa-foreign-uid-complete',status:result.status})+'\n');
}
