import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { acknowledgeRunAttention } from '../../harness/ui-runner.js';

/** Only in-memory QA HTML is rendered; no SUT, gateway, DB or remote URL. */
async function lab(notices: number, stuck = false) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort('blockedbyclient'));
  await page.setContent(`<title>QA pending</title><main><p>QA summary</p>${Array.from({ length: notices }, (_, i) => `<div class="attention-notice">Region ${i}<button type="button">刷新并查看更新</button></div>`).join('')}</main>`);
  await page.evaluate(stuck => {
    for (const button of document.querySelectorAll('button')) button.addEventListener('click', () => {
      button.setAttribute('data-clicked', 'true');
      if (!stuck) button.parentElement!.remove();
      if (!document.querySelector('.attention-notice')) document.title = 'QA confirmed';
    });
  }, stuck);
  return { browser, page };
}

test('UI025 confirms each actual region without requiring a summary dialog', async () => {
  const { browser, page } = await lab(2), records: any[] = [];
  try {
    await acknowledgeRunAttention(page, 'QA summary', async facts => { records.push(facts); });
    assert.equal(await page.locator('.attention-summary').count(), 0);
    assert.equal(await page.locator('.attention-notice').count(), 0);
    assert.equal(await page.title(), 'QA confirmed');
    assert.deepEqual(records.filter(r => r.stage === 'after-region-confirmation').map(r => r.remaining), [1, 0]);
  } finally { await browser.close(); }
});

test('UI025 accepts already-read regions but still observes the exact rendered summary', async () => {
  const { browser, page } = await lab(0), records: any[] = [];
  try {
    await acknowledgeRunAttention(page, 'QA summary', async facts => { records.push(facts); });
    assert.equal(records.at(-1).stage, 'all-rendered-regions-confirmed');
    assert.equal(records.some(r => r.stage === 'after-region-confirmation'), false);
    await assert.rejects(acknowledgeRunAttention(page, 'missing summary', async () => {}, 100), /toBeVisible/);
  } finally { await browser.close(); }
});

test('UI025 does not accept a clicked control when its notice remains', async () => {
  const { browser, page } = await lab(1, true), records: any[] = [];
  try {
    await assert.rejects(acknowledgeRunAttention(page, 'QA summary', async facts => { records.push(facts); }, 100), /toBeLessThan/);
    assert.equal(await page.locator('[data-clicked="true"]').count(), 1);
    assert.equal(await page.locator('.attention-notice').count(), 1);
    assert.equal(records.some(r => r.stage === 'all-rendered-regions-confirmed'), false);
  } finally { await browser.close(); }
});
