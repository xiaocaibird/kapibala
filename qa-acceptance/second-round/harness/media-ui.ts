import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { PublicUiDriver, allowedBrowserOrigin } from './ui-public-driver.js';
import { MediaDatabaseFixtures } from './media-fixtures.js';
import type { SecondRoundEnvironment } from './environment.js';
import { nativeBackgroundTab } from '../../tests/ui/native-focus.js';
import { BlockedError } from '../../harness/security.js';
/** Real task turns also run when a native background tab suspends rAF. This
 * is an observation barrier, not a forged focus/visibility/product event. */
export async function mediaBackgroundTaskBarrier(page:Page):Promise<void> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    await Promise.race([page.evaluate(()=>new Promise<void>(done=>{
      const channel=new MessageChannel();let turns=0;
      channel.port1.onmessage=()=>{if(++turns===2){channel.port1.close();channel.port2.close();done();}else channel.port2.postMessage(null);};
      channel.port2.postMessage(null);
    })),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new BlockedError('Background browser task barrier did not settle')),5000);})]);
  } finally {if(timer)clearTimeout(timer);}
}
async function waitFor(test:()=>Promise<boolean>,label:string){const end=performance.now()+12000;do{if(await test())return;await new Promise(r=>setTimeout(r,30));}while(performance.now()<end);throw new BlockedError(label+' was not observed');}
export async function runMediaUiCase(env:SecondRoundEnvironment,browser:Browser) {
  const {group}=await env.api.createGroup(),msgId=randomUUID(),text='QA-media-ui-'+randomUUID(),source=env.mediaSource!.source({id:msgId,bytes:Buffer.alloc(4097,0x61)}),gate=env.mediaSource!.holdPartial(msgId);
  await env.startWeb();const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),allowed=env.allowedBrowserOrigins;
  const denied:unknown[]=[];
  await context.route('**/*',async route=>{if(allowedBrowserOrigin(route.request().url(),allowed))await route.continue();else {denied.push({kind:'http',url:route.request().url()});await route.abort('blockedbyclient');}});
  await context.routeWebSocket(/.*/,socket=>{if(allowedBrowserOrigin(socket.url(),allowed))socket.connectToServer();else {denied.push({kind:'websocket',url:socket.url()});void socket.close({code:1008});}});
  await context.tracing.start({screenshots:true,snapshots:true,sources:false});const page=await context.newPage();const frames:unknown[]=[];
  page.on('websocket',socket=>socket.on('framereceived',event=>{try{frames.push(JSON.parse(String(event.payload)));}catch{frames.push({unparsed:true});}}));
  const ui=await PublicUiDriver.attach({page,baseUrl:env.webUrl,outputDir:env.outputDir,allowedOrigins:allowed});let background:Page|undefined,primary:unknown;
  const fixture=new MediaDatabaseFixtures(()=>env,`${env.config.sut.revision}:docs/c1-media-files.md`),ref={groupId:group.id,msgId};
  try {
    await ui.login('admin','media-ui');await ui.openGroup(group.id);
    const quietTitle=await page.title();
    env.gateway.emitMessage({groupId:group.gatewayGroupId,msgId,senderPlatformUserId:'qa-media-ui-external',text,mediaUrl:source.url});await gate.reached();
    await expect(page.getByText(text,{exact:true})).toBeVisible();const before=await env.api.messages(group.id);assert.equal(before.items.filter(m=>m.msgId===msgId).length,1);assert.equal(before.items.find(m=>m.msgId===msgId)?.localFilePath,null);
    // The initial real incoming message is a separate business event. Confirm
    // its already rendered content before measuring silence for media updates.
    await page.getByText(text,{exact:true}).click();
    const reminder=page.locator('.attention-notice > button');
    if(await reminder.isVisible()) {
      // The group timeline's real '刷新并查看更新' control refreshes and
      // confirms the visible region; it does not promise a summary dialog.
      await reminder.click();await waitFor(async()=>!(await reminder.isVisible()),'initial message refresh acknowledgment');
    }
    await ui.paint();
    background=await nativeBackgroundTab(page,{record:facts=>env.evidence('media-ui-real-focus',facts)});
    await mediaBackgroundTaskBarrier(page);await expect(page).toHaveTitle(quietTitle);
    const baseline={title:await page.title(),notice:await page.locator('.attention-notice').allTextContents()},frameStart=frames.length;
    await gate.release();await waitFor(async()=>!!(await env.api.messages(group.id)).items.find(m=>m.msgId===msgId)?.localFilePath,'media actual published path');
    await waitFor(async()=>frames.slice(frameStart).some(v=>{const s=JSON.stringify(v);return s.includes(msgId)&&s.includes('"changeKind":"media"');}),'real browser media WS event');
    await mediaBackgroundTaskBarrier(page);assert.equal(await page.title(),baseline.title);assert.deepEqual(await page.locator('.attention-notice').allTextContents(),baseline.notice);
    assert.equal((await env.api.messages(group.id)).items.filter(m=>m.msgId===msgId).length,1);
    const ready=await env.api.messages(group.id);if(!ready.snapshotId)throw new BlockedError('Actual fixed snapshot identity missing');
    // The delivered public cursor encoding supports offset zero for the same
    // observed snapshot; a single-message page has no nextCursor.
    const cursor=Buffer.from(JSON.stringify({snapshotId:ready.snapshotId,offset:0})).toString('base64url');
    await fixture.age(ref,31);const deletionStart=frames.length;await fixture.cycle('cleanup');
    await waitFor(async()=>frames.slice(deletionStart).some(v=>{const s=JSON.stringify(v);return s.includes(msgId)&&s.includes('"changeKind":"media"');}),'real browser deleted-media event');
    await mediaBackgroundTaskBarrier(page);assert.equal(await page.title(),baseline.title);assert.deepEqual(await page.locator('.attention-notice').allTextContents(),baseline.notice);
    const current=await env.api.messages(group.id),old=await env.api.messages(group.id,cursor);assert.equal(current.items.filter(m=>m.msgId===msgId).length,1);assert.equal(current.items.find(m=>m.msgId===msgId)?.localFilePath,null);assert.equal(old.items.find(m=>m.msgId===msgId)?.localFilePath,null);
    // Positive control: this same real background page must detect a real new
    // message; otherwise silence on media events cannot establish filtering.
    const controlId=randomUUID();env.gateway.emitMessage({groupId:group.gatewayGroupId,msgId:controlId,senderPlatformUserId:'qa-media-ui-control',text:'actual new message control'});
    await waitFor(async()=>frames.some(v=>JSON.stringify(v).includes(controlId)),'actual new-message control frame');
    await expect(page).not.toHaveTitle(baseline.title);
    ui.assertHealthy();assert.deepEqual(denied,[],'owned browser must not attempt foreign requests');
    await env.evidence('media-ui-notification-proof',{denied,controlId,baseline,afterNewMessageTitle:await page.title(),frames,before,current,old,realHumanFocusSigned:false});
  }catch(error){primary=error;await env.evidence('media-ui-first-error',{error:String(error),frames,denied});throw error;}
  finally {
    const failures:unknown[]=[];for(const action of [()=>gate.release(),()=>fixture.cleanup(),()=>page.screenshot({path:resolve(env.outputDir,'media-ui-final.png'),fullPage:true}),()=>background?.close(),()=>ui.close(),()=>context.tracing.stop({path:resolve(env.outputDir,'media-ui-trace.zip')}),()=>context.close()])try{await action();}catch(e){failures.push(e);}
    if(failures.length){await env.evidence('media-ui-cleanup-errors',{errors:failures.map(String)});if(!primary)throw new AggregateError(failures,'Media UI cleanup incomplete');}
  }
}
