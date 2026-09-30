import { test as base, expect, chromium, firefox, webkit } from '@playwright/test';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QaEnvironment } from '../harness/environment.js';
import { OwnedDatabaseCluster } from '../harness/database.js';
import { loadTarget, requireAuthorization, BlockedError } from '../harness/security.js';
import type { TargetConfig } from '../harness/types.js';

export const qaRoot = fileURLToPath(new URL('../', import.meta.url));
export const test = base.extend<
  { qa: QaEnvironment },
  { target: TargetConfig; cluster: OwnedDatabaseCluster }
>({
  browser: [
    async ({ target, browserName, launchOptions }, use) => {
      await requireAuthorization(target);
      const type = { chromium, firefox, webkit }[browserName];
      const segments = type.executablePath().split(/[\\/]/);
      const index = segments.findIndex((segment) =>
        new RegExp(`^${browserName}-[0-9]+$`).test(segment),
      );
      if (index < 0) throw new BlockedError('无法定位专属浏览器可执行路径');
      const executablePath = resolve(qaRoot, '.runtime/browsers', ...segments.slice(index));
      try {
        await access(executablePath, constants.X_OK);
      } catch {
        throw new BlockedError(`专属${browserName}未安装：请在执行授权后按README准备浏览器`);
      }
      let browser;
      try {
        browser = await type.launch({ ...launchOptions, headless: true, executablePath });
      } catch (e) {
        throw new BlockedError(`浏览器运行环境不可用: ${String(e)}`);
      }
      try {
        await use(browser);
      } finally {
        await browser.close();
      }
    },
    { scope: 'worker' },
  ],
  target: [
    async ({}, use) => {
      const file = process.env.QA_TARGET_CONFIG;
      if (!file) throw new BlockedError('QA_TARGET_CONFIG 未指定；不连接任何默认服务');
      const target = await loadTarget(resolve(file), qaRoot);
      await requireAuthorization(target);
      await use(target);
    },
    { scope: 'worker' },
  ],
  cluster: [
    async ({ target }, use) => {
      const cluster = new OwnedDatabaseCluster(target.database.image);
      try {
        await cluster.start();
        await use(cluster);
      } finally {
        await cluster.close();
      }
    },
    { scope: 'worker', timeout: 180000 },
  ],
  context: async ({ context, qa }, use) => {
    await qa.startWeb();
    const allowed = (raw: string) => {
      const u = new URL(raw);
      u.protocol = u.protocol === 'ws:' ? 'http:' : u.protocol === 'wss:' ? 'https:' : u.protocol;
      return qa.allowedBrowserOrigins.includes(u.origin);
    };
    await context.route('**/*', async (route) => {
      if (allowed(route.request().url())) await route.continue();
      else {
        await qa.recordHttp({ kind: 'browser-egress-blocked', url: route.request().url() });
        await route.abort('blockedbyclient');
      }
    });
    await context.routeWebSocket(/.*/, (socket) => {
      if (allowed(socket.url())) socket.connectToServer();
      else socket.close({ code: 1008, reason: 'QA isolation: foreign WebSocket origin' });
    });
    await use(context);
  },
  qa: async ({ target, cluster }, use, info) => {
    const qa = new QaEnvironment(target, cluster, info.outputPath('evidence'));
    try {
      await qa.initialize();
      await use(qa);
    } finally {
      try {
        await qa.close();
      } finally {
        await info.attach('qa-evidence-directory', {
          body: qa.outputDir,
          contentType: 'text/plain',
        });
      }
    }
  },
});
export { expect };
