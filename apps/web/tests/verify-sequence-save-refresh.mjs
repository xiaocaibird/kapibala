// Development regression: real REST transaction, PostgreSQL event log, WebSocket,
// automatic list reload and production React. No QA assets or product state hooks.
// Use explicit DATABASE_URL, PLAYWRIGHT_MODULE and UI_EVIDENCE_PATH via tsx.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { preview } from "vite";
import { temporaryDatabase } from "../../../tests/support/temporary-database.js";
import { migrate } from "../../server/src/core/migrations.js";
import { createApp } from "../../server/src/app.js";
import { createGatewayModule } from "../../server/src/modules/gateway/index.js";
import { createAutomationModule } from "../../server/src/modules/automation/index.js";

assert(process.env.DATABASE_URL, "Explicit disposable PostgreSQL required");
assert(process.env.UI_EVIDENCE_PATH, "Explicit evidence output required");
const databaseOrigin = new URL(process.env.DATABASE_URL);
assert.equal(databaseOrigin.hostname, "127.0.0.1");
assert.notEqual(
  databaseOrigin.port,
  "55432",
  "Do not use the default database",
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(process.env.UI_EVIDENCE_PATH);
const build = resolve(process.env.UI_BUILD_DIR ?? "apps/web/dist");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const report = {
  sourceHead: git("rev-parse", "HEAD"),
  sourceStatus: git("status", "--short"),
  startedAt: new Date().toISOString(),
  scriptSha256: sha256(await readFile(new URL(import.meta.url))),
  sequenceSourceSha256: sha256(
    await readFile("apps/web/src/pages/Sequences.tsx"),
  ),
  buildAssets: Object.fromEntries(
    await Promise.all(
      (await readdir(`${build}/assets`)).map(async (name) => [
        name,
        sha256(await readFile(`${build}/assets/${name}`)),
      ]),
    ),
  ),
  mode: "real REST/PG/event log/WebSocket/list refresh; production React; unrelated background workers disabled",
  exclusions: [
    "independent QA acceptance",
    "external Gateway/Agent",
    "human input method or OS focus",
  ],
  results: [],
};
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function bounded(promise, label, milliseconds = 10000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Missing actual ${label}`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function eventually(check, label) {
  const deadline = Date.now() + 10000;
  do {
    if (await check()) return;
    await pause(20);
  } while (Date.now() < deadline);
  throw new Error(`Missing actual ${label}`);
}
const definition = (name) => ({
  name,
  steps: [
    {
      index: 1,
      accountRole: "admin",
      text: "Submitted A {name}",
      delaySeconds: 0,
    },
    {
      index: 2,
      accountRole: "member",
      text: "Submitted B {name}",
      delaySeconds: 0,
    },
  ],
});
await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of [
    "first-no-escape",
    "first-escape-before-refresh",
    "existing-selection",
    "dirty-external-refresh",
  ]) {
    let fixture, cleanup, app, web, context, page;
    const saveGate = deferred(),
      listGate = deferred(),
      saveReceived = deferred(),
      listReceived = deferred();
    const result = {
      variant,
      status: "RUNNING",
      events: [],
      snapshots: [],
      cleanup: [],
      pageErrors: [],
      routeErrors: [],
    };
    report.results.push(result);
    const record = (type, facts) =>
      result.events.push({ at: new Date().toISOString(), type, ...facts });
    try {
      fixture = await temporaryDatabase({
        after: (fn) => {
          cleanup = fn;
        },
      });
      result.database = new URL(fixture.url).pathname.slice(1);
      await migrate(fixture.db);
      await fixture.db.query(
        "INSERT INTO groups(id,gateway_group_id,creator_account_id,name) VALUES('refresh-group','refresh-remote','account-1','Refresh fixture')",
      );
      if (variant === "existing-selection")
        await fixture.db.query(
          "INSERT INTO sequences(id,name,steps) VALUES('existing','Existing template',$1)",
          [JSON.stringify(definition("Existing template").steps)],
        );
      app = await createApp({
        db: fixture.db,
        logger: false,
        background: false,
        modules: (ctx) => {
          const gateway = createGatewayModule(ctx);
          return [gateway, createAutomationModule(ctx, gateway)];
        },
      });
      const api = await app.listen({ host: "127.0.0.1", port: 0 });
      web = await preview({
        configFile: false,
        root: resolve("apps/web"),
        build: { outDir: build },
        preview: {
          host: "127.0.0.1",
          port: 0,
          proxy: {
            "/api": { target: api },
            "/ws": { target: api.replace("http:", "ws:"), ws: true },
          },
        },
      });
      context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      });
      page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => result.pageErrors.push(error.message));
      page.on("websocket", (socket) =>
        socket.on("framereceived", ({ payload }) => {
          const value = JSON.parse(String(payload));
          if (value.type === "sequence_definition_changed")
            record("actual-websocket-event", value);
        }),
      );
      await page.goto(web.resolvedUrls.local[0]);
      await page.getByLabel("用户名", { exact: true }).fill("admin");
      await page.getByLabel("密码", { exact: true }).fill("admin");
      const login = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/auth/login") &&
          response.status() === 200,
      );
      await page.getByRole("button", { name: "进入工作台" }).click();
      const accessToken = (await (await login).json()).accessToken;
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "定时序列", exact: true })
        .click();
      const choices = page.locator(".sequence-form select").nth(1);
      await choices.waitFor();
      await eventually(
        () => page.getByText("实时同步中", { exact: true }).isVisible(),
        "live connection",
      );
      await eventually(
        async () =>
          (await choices.inputValue()) ===
          (variant === "existing-selection" ? "existing" : ""),
        "initial sequence selection",
      );
      const submitted = definition(`Development-${variant}-${randomUUID()}`);
      const json = JSON.stringify(submitted, null, 2);
      const external = definition(`External-${randomUUID()}`);
      const expectedListName =
        variant === "dirty-external-refresh" ? external.name : submitted.name;
      let posts = 0,
        publishedId;
      await page.route("**/api/sequences", async (route) => {
        try {
          const request = route.request();
          const response = await route.fetch({
            timeout: 10000,
            maxRetries: 0,
            maxRedirects: 0,
          });
          const body = await response.json();
          if (request.method() === "POST") {
            posts++;
            publishedId = body.id;
            record("actual-post-response-held", {
              status: response.status(),
              request: request.postDataJSON(),
              response: body,
            });
            saveReceived.resolve();
            await bounded(saveGate.promise, "save response release");
          } else if (
            request.method() === "GET" &&
            body.some((item) => item.name === expectedListName)
          ) {
            record("actual-refreshed-list-held", {
              status: response.status(),
              body,
            });
            listReceived.resolve();
            await bounded(listGate.promise, "list response release");
          }
          await route.fulfill({ response });
        } catch (error) {
          result.routeErrors.push(String(error));
          await route.abort("failed").catch(() => {});
        }
      });
      const dialog = () =>
        page.locator(
          'dialog[open]:has(> .modal-heading > h2:text-is("新建消息序列"))',
        );
      const editor = () => dialog().getByRole("textbox", { name: "序列 JSON" });
      const snapshot = async (phase) => {
        const value = {
          phase,
          at: new Date().toISOString(),
          open: await dialog().isVisible(),
          json: await editor().inputValue(),
          saving: await dialog()
            .getByRole("button", { name: "保存中…", exact: true })
            .isVisible(),
          disabled: await editor().isDisabled(),
          selected: await choices.inputValue(),
        };
        result.snapshots.push(value);
        return value;
      };
      await page.getByRole("button", { name: "新建序列", exact: true }).click();
      await editor().fill(json);
      if (variant === "dirty-external-refresh") {
        const response = await fetch(`${api}/api/sequences`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(external),
        });
        assert.equal(response.status, 200);
        publishedId = (await response.json()).id;
        record("external-real-post-completed", {
          id: publishedId,
          submitted: external,
        });
      } else {
        await dialog()
          .getByRole("button", { name: "保存序列", exact: true })
          .click();
        await bounded(saveReceived.promise, "committed POST held from browser");
      }
      await bounded(
        listReceived.promise,
        "automatic GET of the committed template",
      );
      await eventually(
        () =>
          result.events.some(
            (event) =>
              event.type === "sequence_definition_changed" &&
              event.payload.sequenceId === publishedId,
          ),
        "matching WebSocket event",
      );
      const before = await snapshot("list-held");
      assert.equal(before.json, json);
      if (variant !== "dirty-external-refresh")
        assert.equal(before.saving, true);
      if (variant === "first-escape-before-refresh") {
        await page.keyboard.press("Escape");
        await page.evaluate(
          () =>
            new Promise((done) =>
              requestAnimationFrame(() => requestAnimationFrame(done)),
            ),
        );
        const afterEscape = await snapshot("escape-while-list-held");
        assert.equal(afterEscape.open, true);
        assert.equal(afterEscape.json, json);
        assert.equal(afterEscape.saving, true);
      }
      record("list-response-released", { publishedId });
      listGate.resolve();
      await eventually(
        () => choices.locator(`option[value="${publishedId}"]`).count(),
        "new option rendered from actual GET",
      );
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
      const after = await snapshot("actual-list-rendered");
      const screenshot = `${output}.${variant}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      result.screenshot = {
        file: screenshot,
        sha256: sha256(await readFile(screenshot)),
      };
      assert.equal(
        after.open,
        true,
        "Automatic list refresh must not dismiss the form",
      );
      assert.equal(
        after.json,
        json,
        "Automatic list refresh must preserve the exact submitted/draft JSON",
      );
      if (variant !== "dirty-external-refresh") {
        assert.equal(
          after.saving,
          true,
          "Actual POST response is still held; saving must stay visible",
        );
        assert.equal(after.disabled, true);
        for (const action of ["close", "escape", "cancel"]) {
          if (action === "close")
            await dialog()
              .getByRole("button", { name: "关闭弹窗", exact: true })
              .click();
          else if (action === "escape") await page.keyboard.press("Escape");
          else
            assert.equal(
              await dialog()
                .getByRole("button", { name: "取消", exact: true })
                .isDisabled(),
              true,
            );
          const still = await snapshot(`saving-${action}-after-refresh`);
          assert.equal(still.open, true);
          assert.equal(still.json, json);
          assert.equal(still.saving, true);
        }
        record("save-response-released", {});
        saveGate.resolve();
        await dialog().waitFor({ state: "hidden" });
        assert.equal(posts, 1, "One actual submission, no duplicated POST");
        const stored = await fetch(`${api}/api/sequences`, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const values = (await stored.json()).filter(
          (item) => item.name === submitted.name,
        );
        assert.equal(values.length, 1);
        assert.deepEqual(values[0].steps, submitted.steps);
        result.savedSnapshot = values[0];
      } else {
        assert.equal(after.saving, false);
        await dialog()
          .getByRole("button", { name: "关闭弹窗", exact: true })
          .click();
        await page
          .getByRole("button", { name: "继续编辑", exact: true })
          .click();
        assert.equal(await editor().inputValue(), json);
        await dialog()
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await page
          .getByRole("button", { name: "放弃修改", exact: true })
          .click();
        await dialog().waitFor({ state: "hidden" });
        assert.equal(posts, 0);
      }
      result.status = "PASS";
    } catch (error) {
      result.status = "FAIL";
      result.error = String(error?.stack ?? error);
    } finally {
      saveGate.resolve();
      listGate.resolve();
      for (const [name, close] of [
        ["browser-context", () => context?.close()],
        ["web", () => web?.close()],
        ["api", () => app?.close()],
        ["database", () => cleanup?.()],
      ]) {
        try {
          await close();
          result.cleanup.push({ name, success: true });
        } catch (error) {
          result.cleanup.push({ name, success: false, error: String(error) });
        }
      }
      console.log(`${result.status} ${variant}`);
    }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  if (
    report.results.some(
      (item) =>
        item.status !== "PASS" ||
        item.pageErrors.length ||
        item.routeErrors.length ||
        item.cleanup.some((entry) => !entry.success),
    )
  )
    process.exitCode = 1;
}
