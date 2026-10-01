// QA-tool-only calibration: owned Chromium and about:blank, no SUT/origins.
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { nativeBackgroundTab } from '../../tests/ui/native-focus.js';
const folder=fileURLToPath(new URL('./',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
if (process.argv.slice(2).some((arg)=>arg!=='--headed')) throw new Error('Only --headed may be specified');
const headless=!process.argv.includes('--headed');
const out=resolve(folder,`native-focus-${headless?'headless':'headed'}-${new Date().toISOString().replaceAll(':','-')}.json`);
let browser: Browser | undefined, context: BrowserContext | undefined;
const evidence: Record<string,unknown>={kind:'qa-tool-only-native-focus-calibration',startedAt:new Date().toISOString(),headless,
  sutStarted:false,productTestExecuted:false,onlyNavigatedUrl:'about:blank',node:process.version,
  playwrightVersion:JSON.parse(await readFile(resolve(root,'node_modules/@playwright/test/package.json'),'utf8')).version,
  helperSha256:createHash('sha256').update(await readFile(resolve(root,'tests/ui/native-focus.ts'))).digest('hex'),
  browserPath:chromium.executablePath(),status:'NOT_RUN'};
try {
  browser=await chromium.launch({headless,timeout:15000});
  evidence.browserVersion=browser.version();
  context=await browser.newContext();
  const page=await context.newPage(); await page.goto('about:blank');
  const other=await nativeBackgroundTab(page,{record:async(value)=>{
    evidence.nativeFocus=value;
    evidence.actualPagesAtRecord=await Promise.all(context!.pages().map(async(p)=>({url:p.url(),...(await p.evaluate(()=>({hasFocus:document.hasFocus(),visibility:document.visibilityState})))})));
  }});
  await other.close();
  evidence.status='PASS';
} catch(error) {
  evidence.status='BLOCKED'; evidence.error=String(error); process.exitCode=1;
} finally {
  try { await browser?.close(); evidence.ownedBrowserClosed=true; }
  catch(error) { evidence.ownedBrowserClosed=false; evidence.cleanupError=String(error); process.exitCode=1; }
  evidence.completedAt=new Date().toISOString();
  await mkdir(folder,{recursive:true});
  await writeFile(out,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({path:out,...evidence}));
}
