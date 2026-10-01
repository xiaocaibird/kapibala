import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const qaRoot = fileURLToPath(new URL('./', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(qaRoot, '.runtime/browsers');

const out = process.env.QA_RUN_DIRECTORY ?? resolve('.runtime', 'unlaunched');
export default defineConfig({
  globalSetup: './harness/execution-gate.ts',
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 8000 },
  forbidOnly: true,
  outputDir: resolve(out, 'artifacts'),
  reporter: [
    ['list'],
    ['./harness/reporter.ts'],
    ['json', { outputFile: resolve(out, 'playwright.json') }],
    ['junit', { outputFile: resolve(out, 'playwright.junit.xml') }],
  ],
  use: {
    headless: true,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    { name: 'system', testIgnore: ['**/ui/**'] },
    { name: 'chromium', testMatch: '**/ui/*.spec.ts', use: { browserName: 'chromium' } },
    {
      name: 'firefox-smoke',
      testMatch: '**/ui/*.spec.ts',
      grep: /@compat/,
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit-smoke',
      testMatch: '**/ui/*.spec.ts',
      grep: /@compat/,
      use: { browserName: 'webkit' },
    },
  ],
});
