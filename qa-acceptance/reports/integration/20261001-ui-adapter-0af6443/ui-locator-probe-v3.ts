import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { QaEnvironment } from '../harness/environment.js';
import { OwnedDatabaseCluster } from '../harness/database.js';
import { loadTarget, requireAuthorization, assertAuthorizedAction, targetFingerprint, redact } from '../harness/security.js';

const root=process.cwd();
const out=resolve(root,'reports/integration/20261001-ui-adapter-0af6443/attempt-3');
const adapterFile='/Users/zcm/.codex/worktrees/independent-qa-acceptance/kapibala/qa-acceptance/config/ui-adapter-0af6443.json';
const adapterRaw=await readFile(adapterFile,'utf8');
const adapter=JSON.parse(adapterRaw);
const authorizationFile=resolve(root,'.runtime/authorization.business.json');
const authRaw=JSON.parse(await readFile(authorizationFile,'utf8'));
process.env.QA_EXECUTION_AUTHORIZATION=authorizationFile;
process.env.QA_EXECUTION_KIND='business-acceptance';
process.env.QA_EXECUTION_BUSINESS_SHA256=authRaw.businessSha256;
const target=await loadTarget(resolve(root,'.runtime/target.current.json'),root);
const authorization=await requireAuthorization(target);
assertAuthorizedAction(authorization,'browser-automation');
assertAuthorizedAction(authorization,'create-owned-database');
const scriptPath=resolve(root,'.runtime/ui-locator-probe-v3.ts');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'manifest.json'),JSON.stringify({purpose:'locator-only integration, NOT acceptance result',startedAt:new Date().toISOString(),sutRevision:target.sut.revision,targetSha256:targetFingerprint(target),authorizationReference:authorization.approvalReference,authorizationFile,scriptSha256:sha(await readFile(scriptPath,'utf8')),adapterInputSha256:sha(adapterRaw)},null,2));
const cluster=new OwnedDatabaseCluster(target.database.image);
const qa=new QaEnvironment(target,cluster,resolve(out,'evidence'));
const samples:any[]=[];const stageErrors:any[]=[];
let browser:any;let page:any;
const loc=(key:string)=>page.locator(adapter.ui.selectors[key]);
async function verify(keys:string[],stage:string){
 for(const key of keys){
  const l=loc(key);const count=await l.count();
  const matches=await l.evaluateAll((nodes:Element[])=>nodes.map(n=>({tag:n.tagName,text:n.textContent?.trim().slice(0,180),visible:!!(n.getBoundingClientRect().width&&n.getBoundingClientRect().height)})));
  samples.push({stage,key,selector:adapter.ui.selectors[key],url:page.url(),count,matches,confirmed:count>0&&matches.some((m:any)=>m.visible)});
 }
 await writeFile(resolve(out,'locator-observations.json'),JSON.stringify(samples,null,2));
}
async function stage(name:string,body:()=>Promise<void>){
 try{await body();console.log('PROBE',name,'completed');}
 catch(e){stageErrors.push({name,error:redact(String(e))});console.log('PROBE',name,'ERROR',redact(String(e)));}
 if(page&&!page.isClosed())await page.screenshot({path:resolve(out,`${name}.png`),fullPage:true}).catch(()=>{});
}
async function go(name:string,id=''){await page.goto(qa.webUrl+adapter.ui.routes[name].replace('{id}',encodeURIComponent(id)));}
try{
 await cluster.start();await qa.initialize();await qa.startWeb();
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(qa.allowedBrowserOrigins.includes(u.origin))await r.continue();else await r.abort('blockedbyclient');});
 await context.routeWebSocket(/.*/,socket=>{const u=new URL(socket.url());u.protocol=u.protocol==='ws:'?'http:':'https:';if(qa.allowedBrowserOrigins.includes(u.origin))socket.connectToServer();else socket.close({code:1008,reason:'QA isolation'});});
 page=await context.newPage();
 page.on('pageerror',(e:any)=>console.log('PAGEERROR',String(e)));page.on('console',(m:any)=>console.log('CONSOLE',m.type(),m.text()));page.on('response',(r:any)=>{if(r.status()>=400)console.log('BAD_RESPONSE',r.status(),r.url());});page.on('requestfailed',(r:any)=>console.log('FAILED_REQUEST',r.url(),r.failure()));
 page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(15000);
 await go('login');await loc('username').waitFor();await verify(['username','password','login'],'login');
 await loc('username').fill('admin');await loc('password').fill('admin');
 const login=page.waitForResponse((r:any)=>new URL(r.url()).pathname==='/api/auth/login'&&r.request().method()==='POST');
 await loc('login').click();if((await login).status()!==200)throw Error('real UI login failed');
 await loc('username').waitFor({state:'hidden'});await qa.api.login();
 await stage('groups-empty',async()=>{await go('groups');await loc('directoryEmpty').waitFor({state:'visible'});await verify(['navAccounts','navSequences','logout','directoryEmpty','createGroup','search','statusFilter','agentFilter','order','clearSearch','resetFilters','refreshDirectory','directoryLoadedCount'],'groups-empty');});
 await stage('accounts',async()=>{await go('accounts');await loc('accountRow').first().waitFor();await verify(['accountRow'],'accounts');});
 await stage('account-observation-adapter',async()=>{
  await go('accounts');const a=(await qa.api.accounts()).find(a=>a.status==='idle');if(!a)throw Error('No independent idle account');
  const observation={confirmed:false,candidateRevision:target.sut.revision,reviewReference:'reports/integration/20261001-ui-adapter-0af6443/attempt-3/account-observation.json',rowSelector:'section:has(> .panel-header > h2:text-is("账号列表")) tbody > tr:has(strong:text-is("{id}"))',stateSelector:'td:nth-child(3) .badge',errorSelector:'main > [role="alert"]',refreshSelector:'.page-header button:text-is("刷新")',acknowledgeSelector:'td:nth-child(3) .badge',stateText:{online:'',disconnected:''}};
  const row=page.locator(observation.rowSelector.replaceAll('{id}',a.id));const state=row.locator(observation.stateSelector);
  await qa.api.require(qa.api.post(`/api/accounts/${a.id}/connect`));await qa.api.waitFor('/api/accounts',(items:any)=>items.some((x:any)=>x.id===a.id&&x.status==='online'));
  await state.filter({hasText:'在线'}).waitFor();
  observation.stateText.online=(await state.textContent()).trim();
  await qa.api.require(qa.api.post(`/api/accounts/${a.id}/transition`,{expectedFrom:'online',to:'disconnected'}));
  await qa.api.waitFor('/api/accounts',(items:any)=>items.some((x:any)=>x.id===a.id&&x.status==='disconnected'));
  await state.filter({hasText:'已离线'}).waitFor();
  observation.stateText.disconnected=(await state.textContent()).trim();
  await page.route('**/api/accounts',async(r:any)=>r.request().method()==='GET'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'QA observation locator',requestId:'qa-observation-locator'}})}):r.continue());
  await page.locator(observation.refreshSelector).click();await page.locator(observation.errorSelector).waitFor();
  const errorVisible=await page.locator(observation.errorSelector).isVisible();const ackVisible=await row.locator(observation.acknowledgeSelector).isVisible();
  await page.unroute('**/api/accounts');
  const before=await page.evaluate(()=>performance.timeOrigin);const response=page.waitForResponse((r:any)=>new URL(r.url()).pathname==='/api/accounts'&&r.request().method()==='GET'&&r.status()===200);
  await page.locator(observation.refreshSelector).click();await response;const after=await page.evaluate(()=>performance.timeOrigin);
  observation.confirmed=errorVisible&&ackVisible&&before===after&&observation.stateText.online!==observation.stateText.disconnected;
  await writeFile(resolve(out,'account-observation.json'),JSON.stringify({adapter:observation,checks:{errorVisible,ackVisible,sameDocument:before===after,refreshSemantic:'Dedicated page header refresh performs GET accounts; no navigation or view-and-confirm notice used'},scope:'Locator and pure-resource refresh only; unread acknowledgement behavior still NOT_RUN'},null,2));
 });
 const group=(await qa.api.createGroup()).group;
 await qa.api.require(qa.api.patch(`/api/groups/${group.id}`,{name:'QA定位群',description:'独立 UI 定位验证简介'}));
 await stage('group-directory',async()=>{await go('groups');await loc('directoryItem').filter({hasText:'QA定位群'}).waitFor();await verify(['directoryItem'],'group-directory');const card=loc('directoryItem').filter({hasText:'QA定位群'});for(const key of ['directorySummary','directoryLink']){const l=card.locator(adapter.ui.selectors[key]);samples.push({stage:'group-directory',key,selector:adapter.ui.selectors[key],count:await l.count(),confirmed:await l.isVisible(),tag:await l.evaluate((n:Element)=>n.tagName)});}await card.locator(adapter.ui.selectors.directoryLink).click();});
 await stage('group-profile',async()=>{await go('group',group.id);await loc('editProfile').waitFor();await verify(['editProfile','groupDescriptionView','groupCreatedAt','messageInput','senderAccount','sendMessage'],'group-profile');await loc('editProfile').click();await loc('groupName').waitFor();await verify(['profileDialog','groupName','groupDescription','saveProfile','closeProfile'],'profile-edit');await loc('groupName').fill('QA未保存定位');await loc('closeProfile').click();await verify(['continueEditing','discardChanges'],'discard-dialog');await loc('continueEditing').click();await loc('closeProfile').click();await loc('discardChanges').click();});
 await stage('create-group',async()=>{await go('groups');await loc('createGroup').click();await loc('groupName').waitFor();await verify(['groupName','groupDescription','closeCreateGroup'],'create-group');await loc('closeCreateGroup').click();});
 const sequence=await qa.api.require(qa.api.post<{id:string}>('/api/sequences',{name:'QA定位序列',steps:[{index:1,accountRole:'admin',text:'{event} at {place}',delaySeconds:0}]}));
 await stage('sequences',async()=>{await go('sequences');await loc('sequence').waitFor();await verify(['sequence','sequenceGroup','sequenceVars','sequenceStepVars','previewSequence','createSequence'],'sequences');await loc('sequenceGroup').selectOption(group.id);await loc('sequence').selectOption(sequence.id);await loc('sequenceVars').fill(JSON.stringify({event:'QA定位',place:'隔离环境'}));await loc('sequenceStepVars').fill('{}');await loc('previewSequence').click();await loc('sequencePreview').waitFor();await verify(['sequencePreview','startSequence'],'sequence-preview');await page.getByRole('button',{name:'返回编辑',exact:true}).click();await loc('sequenceVars').fill(JSON.stringify({event:'QA定位'}));await loc('previewSequence').click();await loc('sequencePreviewError').waitFor();await verify(['sequencePreviewError','sequenceInputError'],'sequence-error');for(const key of ['sequenceErrorStepIndex','sequenceErrorKey']){const l=loc('sequencePreviewError').locator(adapter.ui.selectors[key]);samples.push({stage:'sequence-error',key,count:await l.count(),confirmed:await l.isVisible(),text:await l.textContent()});}});
 await stage('sequence-definition',async()=>{await go('sequences');await loc('createSequence').click();await loc('sequenceDefinitionInput').waitFor();await verify(['sequenceDefinitionInput','saveSequenceDefinition'],'sequence-definition');await loc('sequenceDefinitionInput').fill('{bad-json');await loc('saveSequenceDefinition').click();await loc('sequenceDefinitionError').waitFor();await verify(['sequenceDefinitionError'],'definition-error');await page.getByRole('button',{name:'取消',exact:true}).click();});
 await stage('sequence-resource-error',async()=>{await page.route('**/api/sequences',async(r:any)=>r.request().method()==='GET'?r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'FORBIDDEN',message:'QA locator source failure',requestId:'qa-ui-locator'}})}):r.continue());await go('accounts');await loc('navSequences').click();await loc('sequenceResourceError').waitFor();await verify(['sequenceResourceError','sequenceResourceRefresh'],'sequence-resource-error');await page.unroute('**/api/sequences');});
 await stage('message-row',async()=>{await go('group',group.id);qa.gateway.emitMessage({groupId:group.gatewayGroupId,senderPlatformUserId:'qa-locator-external',text:'QA定位消息'});await loc('messageRow').filter({hasText:'QA定位消息'}).waitFor();await verify(['messageRow'],'message-row');});
 await stage('agent-run',async()=>{qa.agent.enqueueTurns({rawBody:'QA_LOCATOR_INVALID_JSON'},{body:{stop_reason:'end_turn',content:[]}});await qa.api.require(qa.api.patch(`/api/groups/${group.id}`,{agentEnabled:true}));qa.gateway.emitMessage({groupId:group.gatewayGroupId,senderPlatformUserId:'qa-locator-external',text:'QA定位Agent'});await loc('runLink').first().waitFor();await verify(['runLink'],'agent-run-link');await loc('runLink').first().click();await loc('rawResponseToggle').first().waitFor();await verify(['rawResponseToggle'],'agent-run');});
} catch(error){if(page){await writeFile(resolve(out,'failure-dom.html'),await page.content());await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});}stageErrors.push({name:'initialization-or-unhandled',error:redact(String(error))});console.error(redact(String(error)));}
finally{
 const cleanup=await Promise.allSettled([browser?.close()]);
 try{await qa.close();}catch(e){stageErrors.push({name:'qa-cleanup',error:redact(String(e))});}
 try{await cluster.close();}catch(e){stageErrors.push({name:'cluster-cleanup',error:redact(String(e))});}
 for(const r of cleanup)if(r.status==='rejected')stageErrors.push({name:'browser-cleanup',error:redact(String(r.reason))});
 await writeFile(resolve(out,'locator-observations.json'),JSON.stringify(samples,null,2));
 await writeFile(resolve(out,'result.json'),JSON.stringify({purpose:'LOCATOR_PROBE_ONLY_NOT_ACCEPTANCE',endedAt:new Date().toISOString(),observedKeys:[...new Set(samples.filter(x=>x.confirmed).map(x=>x.key))],unconfirmedKeys:Object.keys(adapter.ui.selectors).filter(k=>!samples.some(x=>x.key===k&&x.confirmed)),stageErrors,cleanup:'owned QA environment cleanup attempted, inspect any cleanup stage errors'},null,2));
 console.log('RESULT',JSON.stringify({confirmed:new Set(samples.filter(x=>x.confirmed).map(x=>x.key)).size,total:Object.keys(adapter.ui.selectors).length,stageErrors}));
}
