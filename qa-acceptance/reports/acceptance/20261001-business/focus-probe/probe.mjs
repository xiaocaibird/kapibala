import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const frozenQa = '/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance';
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(frozenQa, '.runtime/browsers');
const require = createRequire(resolve(frozenQa, 'package.json'));
const { chromium } = require('playwright');
const mode = process.argv.includes('--helper') ? 'helper' : 'protocol';
const record = { mode, startedAt: new Date().toISOString(), pid: process.pid, node: process.version,
  playwright: require('playwright/package.json').version, headed: true,
  scope: 'Owned about:blank documents only; no SUT, DOM assignments or synthetic events',
  browserPath: chromium.executablePath(), browserVersion: null, operations: [], snapshots: [], errors: [], cleanup: {} };
let browser;
const allPages = [];
const eventLogs = new Map();
async function tracked(page, name) {
  allPages.push({ page, name });
  const events = []; eventLogs.set(page, events);
  await page.exposeFunction('__qaNativeFocusEvent', event => events.push(event));
  await page.evaluate(() => {
    for (const type of ['blur', 'focus']) window.addEventListener(type, event => {
      void window.__qaNativeFocusEvent({ type, isTrusted: event.isTrusted, at: Date.now(),
        hasFocus: document.hasFocus(), visibility: document.visibilityState });
    });
    document.addEventListener('visibilitychange', event => {
      void window.__qaNativeFocusEvent({ type: event.type, isTrusted: event.isTrusted, at: Date.now(),
        hasFocus: document.hasFocus(), visibility: document.visibilityState });
    });
  });
}
async function snapshot(label) {
  const pages = [];
  for (const { page, name } of allPages) {
    if (page.isClosed()) continue;
    pages.push({ name, url: page.url(), ...await page.evaluate(() => ({ hasFocus: document.hasFocus(),
      visibility: document.visibilityState })), events: [...eventLogs.get(page)] });
  }
  const s = { label, at: new Date().toISOString(), pages }; record.snapshots.push(s); return s;
}
async function switchTo(page, label, expectedBackground, verifyNative = false) {
  record.operations.push({ operation: 'bringToFront', page: label, at: new Date().toISOString() });
  await page.bringToFront();
  const until = performance.now() + 2000;
  if (verifyNative) {
    let actual;
    do {
      actual = { front: await page.evaluate(() => document.hasFocus()),
        back: await expectedBackground.evaluate(() => document.hasFocus()) };
      if (actual.front && !actual.back) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    } while (performance.now() < until);
    assert.deepEqual(actual, { front: true, back: false }, 'Real browser tab switch must establish exclusive native focus');
  }
  return snapshot(label);
}
try {
  browser = await chromium.launch({ headless: false }); record.browserVersion = browser.version();
  const context = await browser.newContext();
  await context.route('**/*', route => route.abort());
  const a = await context.newPage(); await a.goto('about:blank'); await tracked(a, 'A');
  const b = await context.newPage(); await b.goto('about:blank'); await tracked(b, 'B');
  await switchTo(a, 'default-A-front', b);
  await switchTo(b, 'default-B-front', a);
  if (mode === 'protocol') {
    for (const [name, page] of [['A', a], ['B', b]]) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      record.operations.push({ operation: 'Emulation.setFocusEmulationEnabled', page: name, enabled: false, at: new Date().toISOString() });
      await cdp.detach();
    }
    await snapshot('disabled-and-CDP-detached');
    await switchTo(a, 'native-A-front', b, true);
    await switchTo(b, 'native-B-front', a, true);
    await switchTo(a, 'native-A-front-again', b, true);
  } else {
    const { nativeBackgroundTab } = await import('../../../../tests/ui/native-focus.ts');
    await b.close();
    const other = await nativeBackgroundTab(a, { record: event => record.operations.push(event) });
    await tracked(other, 'helper-background');
    await snapshot('helper-created-native-background');
    await switchTo(a, 'helper-return-A-front', other, true);
    await other.close();
  }
  record.verdict = 'PASS';
} catch (error) {
  record.verdict = 'FAIL'; record.errors.push(String(error?.stack ?? error)); process.exitCode = 1;
} finally {
  try { await browser?.close(); record.cleanup.browserClosed = true; }
  catch (error) { record.cleanup.browserCloseError = String(error); process.exitCode = 1; }
  record.endedAt = new Date().toISOString();
  record.scriptSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  await mkdir(here, { recursive: true });
  await writeFile(resolve(here, `result-${mode}.json`), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ mode, verdict: record.verdict, browser: record.browserVersion,
    snapshots: record.snapshots.map(s => ({ label: s.label, pages: s.pages.map(({ name, hasFocus, visibility }) => ({ name, hasFocus, visibility })) })), cleanup: record.cleanup }));
}
