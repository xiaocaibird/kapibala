import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { PublicUiDriver, publicOperation } from '../../harness/ui-public-driver.js';

test('public response classifier binds exact method and endpoint', () => {
  const origin = 'http://127.0.0.1:12345';
  assert.equal(publicOperation('POST', origin + '/api/groups/g/send'), 'send');
  assert.equal(publicOperation('GET', origin + '/api/groups/g/send'), null);
  assert.equal(publicOperation('POST', origin + '/api/groups/g/send-extra'), null);
  assert.equal(publicOperation('POST', origin + '/api/sequences/preview'), 'precheck');
  assert.equal(publicOperation('POST', origin + '/api/sequences'), 'sequence-save');
  assert.equal(publicOperation('GET', origin + '/api/agent-runs/r'), 'run-read');
});

/** The only server used in these tests is this QA-owned counter. No product,
 * product database, external gateway or user browser is started or connected. */
async function lab(status = 202) {
  const requests: Array<{ url: string; body: string }> = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.setHeader('content-type', 'text/html'); response.end('<html><body>QA transport self-test</body></html>'); return;
    }
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push({ url: request.url!, body });
    response.writeHead(status, { 'content-type': 'application/json', 'x-qa-real-upstream': 'present' });
    response.end('{"actual":"QA upstream bytes","count":' + requests.length + '}');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const outputDir = await mkdtemp(join(tmpdir(), 'qa-ui-transport-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const driver = await PublicUiDriver.attach({ page, baseUrl, outputDir, timeoutMs: 3_000 });
  await page.goto(baseUrl);
  return { requests, page, driver, outputDir,
    send: async () => { await page.evaluate(() => {
      const output = document.createElement('pre'); output.id = 'result'; document.body.append(output);
      void fetch('/api/groups/qa-owned/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"A","clientMsgId":"qa-self-only"}' })
        .then(async (response) => { output.textContent = `${response.status} ${await response.text()}`; })
        .catch(() => { output.textContent = 'actual-transport-failure'; });
    }); },
    cleanup: async () => {
      await driver.close(); await browser.close();
      await new Promise<void>((ok, bad) => server.close((error) => error ? bad(error) : ok()));
      await rm(outputDir, { recursive: true, force: true });
    },
  };
}
test('real transport gate holds response after exactly one upstream effect and preserves bytes', async () => {
  const value = await lab();
  try {
    const gate = await value.driver.holdNextResponse('send'); await value.send(); await gate.received;
    assert.equal(value.requests.length, 1); assert.equal(value.requests[0]!.body, '{"text":"A","clientMsgId":"qa-self-only"}');
    assert.equal(await value.page.locator('#result').innerText(), '');
    await gate.release('success');
    await value.page.waitForFunction(() => document.querySelector('#result')?.textContent?.startsWith('202 '));
    assert.equal(await value.page.locator('#result').innerText(), '202 {"actual":"QA upstream bytes","count":1}');
    assert.equal(await value.driver.actualSendRequestCount(), 1);
    const evidence = await readFile(join(value.outputDir, 'ui.ndjson'), 'utf8');
    assert.ok(evidence.includes('bodyUnchanged')); assert.ok(evidence.includes('QA upstream bytes'));
  } finally { await value.cleanup(); }
});
test('unknown response abort preserves actual upstream effect and introduces no retry', async () => {
  const value = await lab();
  try {
    const gate = await value.driver.holdNextResponse('send'); await value.send(); await gate.received;
    await gate.release('unknown');
    await value.page.waitForFunction(() => document.querySelector('#result')?.textContent === 'actual-transport-failure');
    assert.equal(value.requests.length, 1); assert.equal(await value.driver.actualSendRequestCount(), 1);
  } finally { await value.cleanup(); }
});
test('failure path requires an actual upstream error instead of forging a response', async () => {
  const value = await lab(503);
  try {
    const gate = await value.driver.holdNextResponse('send'); await value.send(); await gate.received;
    await gate.release('failure');
    await value.page.waitForFunction(() => document.querySelector('#result')?.textContent?.startsWith('503 '));
    assert.equal(await value.page.locator('#result').innerText(), '503 {"actual":"QA upstream bytes","count":1}');
  } finally { await value.cleanup(); }
});
test('planned failure cannot relabel an actual success', async () => {
  const value = await lab();
  try {
    const gate = await value.driver.holdNextResponse('send'); await value.send(); await gate.received;
    await assert.rejects(gate.release('failure'), /Planned failure premise did not occur/);
    assert.equal(value.requests.length, 1);
  } finally { await value.cleanup(); }
});
test('nested discard prompt is identified by its own heading, not its dirty-form ancestor', async () => {
  const value = await lab();
  try {
    await value.page.setContent('<dialog open><div class="modal-heading"><h2>新建消息序列</h2></div><dialog open><div class="modal-heading"><h2>放弃未保存的修改？</h2></div></dialog></dialog>');
    assert.equal(await value.driver.dialog('新建消息序列').count(), 1);
    assert.equal(await value.driver.dialog('放弃未保存的修改？').count(), 1);
    assert.equal(await value.driver.dialog('新建消息序列').locator('dialog').count(), 1);
    assert.equal(await value.driver.dialog('放弃未保存的修改？').locator('dialog').count(), 0);
  } finally { await value.cleanup(); }
});
