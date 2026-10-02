import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { PublicUiDriver } from '../../harness/ui-public-driver.js';
test('page identity recheck uses only its observed /me credential and never relogs',async()=>{
 const paths:string[]=[],canary='Bearer qa-self-only-observed-header';let active=true;
 const server=createServer((req,res)=>{paths.push(req.url!);if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<body>QA identity lab</body>');return;}assert.equal(req.headers.authorization,canary);res.writeHead(active?200:401,{'content-type':'application/json'});res.end(JSON.stringify(active?{username:'admin',role:'admin'}:{error:'expired'}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const baseUrl=`http://127.0.0.1:${address.port}`,directory=await mkdtemp(join(tmpdir(),'qa-ui-identity-')),browser=await chromium.launch({headless:true});
 const page=await browser.newPage(),driver=await PublicUiDriver.attach({page,baseUrl,outputDir:directory});
 try{
  await page.goto(baseUrl);await assert.rejects(driver.currentPublicIdentity(),/no observed public/);
  await page.evaluate(async value=>{await fetch('/api/auth/me',{headers:{authorization:value}});},canary);
  assert.deepEqual(await driver.currentPublicIdentity(),{username:'admin',role:'admin'});
  active=false;await assert.rejects(driver.currentPublicIdentity(),/no longer established/);
  assert.ok(paths.every(path=>path==='/'||path==='/api/auth/me'));const proof=await readFile(join(directory,'ui.ndjson'),'utf8');assert.ok(!proof.includes(canary));assert.ok(proof.includes('"status":401'));
 }finally{await driver.close();await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true});}
});
