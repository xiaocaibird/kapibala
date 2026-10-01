// Real React/API verification in a UUID database; never starts the demo ports.
// Run with tsx, DATABASE_URL for a disposable PG server and PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { preview } from "vite";
import { Database } from "../apps/server/src/core/db.js";
import { migrate } from "../apps/server/src/core/migrations.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";

assert(
  process.env.DATABASE_URL,
  "An explicit disposable PostgreSQL server is required",
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const evidencePrefix =
  process.env.ARCHITECTURE_BROWSER_EVIDENCE_PREFIX ??
  "docs/evidence/architecture-resource-browser";
const name = `architecture_browser_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const admin = new Database(adminUrl.toString());
let db, app, vite, browser, page;
let created = false;
const report = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceFiles: Object.fromEntries(
    await Promise.all(
      [
        "apps/web/src/pages/Sequences.tsx",
        "scripts/verify-architecture-resource-browser.mjs",
      ].map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      ]),
    ),
  ),
  startedAt: new Date().toISOString(),
  database: name,
  background: false,
  webMode: "production build",
  results: [],
  pageErrors: [],
  cleanupErrors: [],
};
const pass = (name, observed) => {
  report.results.push({ name, observed });
  console.log(`PASS ${name}`);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  db = new Database(url.toString());
  await migrate(db);
  await db.query(
    "INSERT INTO sequences(id,name,steps) VALUES('architecture-sequence','读取恢复样例',$1)",
    [
      JSON.stringify([
        {
          index: 1,
          accountRole: "admin",
          text: "恢复后的序列正文",
          delaySeconds: 0,
        },
      ]),
    ],
  );
  app = await createApp({
    db,
    logger: false,
    background: false,
    modules: (ctx) => {
      const gateway = createGatewayModule(ctx);
      return [gateway, createAutomationModule(ctx, gateway)];
    },
  });
  const api = await app.listen({ host: "127.0.0.1", port: 0 });
  vite = await preview({
    configFile: false,
    root: new URL("../apps/web", import.meta.url).pathname,
    preview: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": { target: api },
        "/ws": { target: api.replace("http:", "ws:"), ws: true },
      },
    },
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  let failures = 0,
    status = 503,
    gets = 0,
    posts = 0;
  await page.route("**/api/sequences", async (route) => {
    if (route.request().method() !== "GET") {
      posts++;
      return route.continue();
    }
    gets++;
    if (failures > 0) {
      failures--;
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: status === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
            message: "Isolated architecture verification",
            requestId: "architecture-browser",
          },
        }),
      });
    }
    return route.continue();
  });
  await page.goto(vite.resolvedUrls.local[0]);
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("link", { name: "定时序列", exact: true }).waitFor();
  // The authenticated WS handshake itself schedules a 60ms invalidation, even
  // with an empty events table. Settle it before counting failure/retry requests.
  await page.getByText("实时同步中", { exact: true }).waitFor();
  await pause(200);
  const enter = async () => {
    await page.getByRole("link", { name: "服务账号", exact: true }).click();
    await page
      .getByRole("heading", { name: "服务账号", exact: true })
      .waitFor();
    gets = 0;
    await page.getByRole("link", { name: "定时序列", exact: true }).click();
  };
  const sampleVisible = () =>
    page
      .getByText("恢复后的序列正文", { exact: true })
      .waitFor({ state: "visible", timeout: 8000 });

  failures = 2;
  await enter();
  await sampleVisible();
  assert.equal(gets, 3);
  assert.equal(
    Number((await db.query("SELECT count(*) FROM events")).rows[0].count),
    0,
  );
  pass(
    "transient GET failures recover without polling, new events, or manual reload",
    { gets, events: 0 },
  );

  failures = 99;
  status = 403;
  await enter();
  await page
    .getByText("Isolated architecture verification", { exact: true })
    .waitFor();
  await pause(2300);
  assert.equal(gets, 1);
  pass("permanent forbidden response is not automatically retried", { gets });

  failures = 99;
  status = 503;
  await enter();
  await pause(3300);
  assert.equal(gets, 4);
  await pause(1200);
  assert.equal(gets, 4);
  pass(
    "transient retry budget stops after initial attempt plus three retries",
    { gets },
  );

  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  const exhaustedAttempts = gets;
  failures = 0;
  const retry = page
    .getByRole("alert")
    .getByRole("button", { name: "重试", exact: true });
  await retry.waitFor({ state: "visible", timeout: 2000 });
  await retry.click();
  await sampleVisible();
  await pause(2200);
  assert.equal(gets, exhaustedAttempts + 1);
  assert.equal(
    await page.evaluate(() => performance.timeOrigin),
    documentOrigin,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "消息序列", exact: true })
      .inputValue(),
    "architecture-sequence",
  );
  assert.equal(
    Number((await db.query("SELECT count(*) FROM events")).rows[0].count),
    0,
  );
  assert.equal(await retry.count(), 0);
  pass(
    "visible retry restarts the exhausted resource in the same document without events",
    {
      exhaustedAttempts,
      gets,
      events: 0,
      documentOrigin,
      selectedSequence: "architecture-sequence",
    },
  );

  failures = 99;
  await enter();
  await page
    .getByText("Isolated architecture verification", { exact: true })
    .waitFor();
  await page.getByRole("link", { name: "服务账号", exact: true }).click();
  await page.getByRole("heading", { name: "服务账号", exact: true }).waitFor();
  const afterLeave = gets;
  await pause(1800);
  assert.equal(gets, afterLeave);
  pass("leaving a resource page cancels its pending retries", {
    beforeWait: afterLeave,
    afterWait: gets,
  });

  failures = 0;
  await enter();
  await sampleVisible();
  await page.getByRole("button", { name: "新建序列", exact: true }).click();
  // The wrapping label includes the textarea's initial text content in this DOM.
  const input = page.getByRole("textbox", { name: /^序列 JSON/ });
  const valid = {
    name: "架构契约验证",
    steps: [
      { index: 1, accountRole: "admin", text: "契约一致", delaySeconds: 0 },
    ],
  };
  await input.fill(JSON.stringify({ ...valid, extra: true }));
  await page.getByRole("button", { name: "保存序列", exact: true }).click();
  await page.getByText(/序列定义格式不正确/).waitFor();
  assert.equal(posts, 0);
  pass(
    "unknown sequence fields are rejected by the rendered form without POST",
    { posts },
  );
  await input.fill(
    JSON.stringify({ ...valid, steps: [{ ...valid.steps[0], index: 2 }] }),
  );
  await page.getByRole("button", { name: "保存序列", exact: true }).click();
  await page.getByText(/序列定义格式不正确/).waitFor();
  assert.equal(posts, 0);
  pass("non-contiguous sequence indices are rejected before POST", { posts });
  await input.fill(JSON.stringify(valid));
  await page.getByRole("button", { name: "保存序列", exact: true }).click();
  await page
    .getByRole("heading", { name: "新建消息序列", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(posts, 1);
  assert.equal(
    Number(
      (
        await db.query("SELECT count(*) FROM sequences WHERE name=$1", [
          valid.name,
        ])
      ).rows[0].count,
    ),
    1,
  );
  pass("valid sequence still saves exactly once through the real API", {
    posts,
    rows: 1,
  });
  assert.deepEqual(report.pageErrors, []);
  await mkdir("docs/evidence", { recursive: true });
  await page.screenshot({
    path: `${evidencePrefix}.png`,
    fullPage: true,
  });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (page && !page.isClosed()) {
    await mkdir("docs/evidence", { recursive: true });
    report.failurePage = await page.locator("body").ariaSnapshot();
    await page.screenshot({
      path: `${evidencePrefix}-failure.png`,
      fullPage: true,
    });
  }
  process.exitCode = 1;
} finally {
  for (const [label, close] of [
    ["browser", () => browser?.close()],
    ["vite", () => vite?.close()],
    ["app", () => app?.close()],
    ["database pool", () => db?.close()],
    [
      "temporary database",
      () =>
        created && admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
    ],
    ["administrative pool", () => admin.close()],
  ]) {
    try {
      await close();
    } catch (error) {
      report.cleanupErrors.push({ label, message: error.message });
      process.exitCode = 1;
    }
  }
  report.completedAt = new Date().toISOString();
  report.passed = report.passed === true && report.cleanupErrors.length === 0;
  await mkdir("docs/evidence", { recursive: true });
  await writeFile(
    `${evidencePrefix}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      cases: report.results.length,
      cleanupErrors: report.cleanupErrors.length,
      error: report.error?.message,
    }),
  );
}
