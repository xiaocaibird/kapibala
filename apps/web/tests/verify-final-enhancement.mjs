// Development browser evidence: actual production React build, REST API and
// disposable PostgreSQL. HTTP holds delay real responses without replacing data.
// Run via tsx with explicit DATABASE_URL, PLAYWRIGHT_MODULE and UI_EVIDENCE_PATH.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { preview } from "vite";
import { temporaryDatabase } from "../../../tests/support/temporary-database.js";
import { migrate } from "../../server/src/core/migrations.js";
import { createApp } from "../../server/src/app.js";
import { createGatewayModule } from "../../server/src/modules/gateway/index.js";
import { createAutomationModule } from "../../server/src/modules/automation/index.js";

assert.equal(
  new URL(process.env.DATABASE_URL).port,
  "64602",
  "Dedicated UI verification PostgreSQL only",
);
assert(process.env.UI_EVIDENCE_PATH, "Explicit evidence path required");
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const output = process.env.UI_EVIDENCE_PATH;
const build = resolve(process.env.UI_BUILD_DIR ?? "apps/web/dist");
const files = [
  "apps/web/src/components/Timeline.tsx",
  "apps/web/src/pages/Sequences.tsx",
  "apps/web/src/hooks/useRoute.ts",
  "apps/web/src/pages/AgentRuns.tsx",
  "apps/web/src/components/AgentRunList.tsx",
  "apps/web/src/App.tsx",
];
const hash = (body) => createHash("sha256").update(body).digest("hex");
const report = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceStatus: execFileSync("git", ["status", "--short"], {
    encoding: "utf8",
  }).trim(),
  buildSourceHead:
    process.env.UI_BUILD_SOURCE_HEAD ??
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceFiles: Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, hash(await readFile(file))]),
    ),
  ),
  build,
  buildAssets: Object.fromEntries(
    await Promise.all(
      (await readdir(`${build}/assets`)).map(async (file) => [
        file,
        hash(await readFile(`${build}/assets/${file}`)),
      ]),
    ),
  ),
  scriptSha256: hash(await readFile(new URL(import.meta.url))),
  startedAt: new Date().toISOString(),
  mode: "production React; real REST/PG; background false; real responses held at browser transport",
  exclusions: [
    "real remote message delivery/model",
    "human OS IME/focus acceptance",
    "QA acceptance",
  ],
  results: [],
  pageErrors: [],
  cleanup: [],
  screenshots: [],
};
let fixture, cleanup, app, vite, browser, context, page;
const releases = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const checkEventually = async (check, timeout = 5000) => {
  const end = Date.now() + timeout;
  do {
    if (await check()) return;
    await pause(25);
  } while (Date.now() < end);
  assert.fail("Condition did not become true");
};
async function open(hashRoute = "#/groups/ui-group-a") {
  await page?.close();
  page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  await page.goto(`${vite.resolvedUrls.local[0]}${hashRoute}`);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "定时序列", exact: true })
    .waitFor();
}
function hold(path, method = "POST") {
  let release, arrived;
  const gate = new Promise((done) => {
    release = done;
  });
  const received = new Promise((done) => {
    arrived = done;
  });
  releases.push(release);
  let calls = 0;
  const requests = [];
  const ready = page.route(`**${path}`, async (route) => {
    if (route.request().method() !== method) return route.continue();
    calls++;
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    arrived(response.status());
    await gate;
    await route.fulfill({ response });
  });
  return { ready, received, release, calls: () => calls, requests };
}
async function run(name, work) {
  if (process.env.UI_CASES && !process.env.UI_CASES.split(",").includes(name))
    return;
  try {
    const observed = await work();
    report.results.push({ name, status: "PASS", observed });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.results.push({
      name,
      status: "FAIL",
      error: String(error?.stack ?? error),
    });
    console.log(`FAIL ${name}: ${error}`);
    try {
      await page.screenshot({ path: `${output}.${name}.png`, fullPage: true });
    } catch {}
  } finally {
    for (const release of releases.splice(0)) release();
    await pause(50);
  }
}
const composer = () => page.getByRole("textbox", { name: "消息内容" });
const send = () =>
  page.getByRole("button", { name: "发送消息", exact: true }).click();
const previewButton = () =>
  page.getByRole("button", { name: "预检所有步骤", exact: true });
const previewDialog = () =>
  page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "预检通过 · 确认发送内容" }),
  });
const createDialog = () =>
  page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "新建消息序列" }) });
const count = async (sql, params = []) =>
  Number((await fixture.db.query(sql, params)).rows[0].count);
const capture = async (name) => {
  const path = `${output}.${name}.png`;
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push({ name, path, sha256: hash(await readFile(path)) });
};
try {
  await mkdir(dirname(output), { recursive: true });
  fixture = await temporaryDatabase({
    after: (fn) => {
      cleanup = fn;
    },
  });
  report.database = new URL(fixture.url).pathname.slice(1);
  report.databasePort = "64602";
  await migrate(fixture.db);
  await fixture.db.query(
    "UPDATE accounts SET status='online',platform_user_id='ui-'||id",
  );
  for (const letter of ["a", "b"]) {
    await fixture.db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id,name) VALUES($1,$2,'account-1',$3)",
      [
        `ui-group-${letter}`,
        `ui-gateway-${letter}`,
        `隔离目标${letter.toUpperCase()}`,
      ],
    );
    await fixture.db.query(
      "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-1','ui-account-1','creator'),($1,'account-2','ui-account-2','member')",
      [`ui-group-${letter}`],
    );
    await fixture.db.query(
      "INSERT INTO sequences(id,name,steps) VALUES($1,$2,$3)",
      [
        `ui-sequence-${letter}`,
        `模板${letter.toUpperCase()}`,
        JSON.stringify([
          {
            index: 1,
            accountRole: "admin",
            text: `${letter}-正文`,
            delaySeconds: 10,
          },
          {
            index: 2,
            accountRole: "member",
            text: `${letter}-后续`,
            delaySeconds: 5,
          },
        ]),
      ],
    );
    await fixture.db.query(
      "INSERT INTO agent_runs(id,group_id,status,end_reason,summary) VALUES($1,$2,'finished','final','隔离导航样例')",
      [`ui-run-${letter}`, `ui-group-${letter}`],
    );
  }
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
  report.api = api;
  vite = await preview({
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
  report.web = vite.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  page = await context.newPage();
  await page.goto(vite.resolvedUrls.local[0]);
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("link", { name: "定时序列", exact: true }).waitFor();

  for (const replacement of ["B", "A"])
    await run(`draft-late-${replacement}`, async () => {
      await open();
      await composer().fill("A");
      const held = hold("/api/groups/ui-group-a/send");
      await held.ready;
      await send();
      assert.equal(await held.received, 202);
      await composer().fill("B");
      if (replacement === "A") await composer().fill("A");
      held.release();
      await page
        .getByRole("button", { name: "发送消息", exact: true })
        .waitFor();
      assert.equal(await composer().inputValue(), replacement);
      assert.equal(held.calls(), 1);
      assert.equal(held.requests[0].text, "A");
      assert.equal(
        await count("SELECT count(*) FROM messages WHERE client_msg_id=$1", [
          held.requests[0].clientMsgId,
        ]),
        1,
      );
      return { retained: replacement, realAcceptedWrites: 1 };
    });
  await run("draft-unchanged-clears", async () => {
    await open();
    await composer().fill("unchanged");
    await send();
    await checkEventually(async () => (await composer().inputValue()) === "");
    return { retained: "" };
  });
  await run("draft-failure-retained", async () => {
    await open();
    await composer().fill("must-retain");
    // Actual backend rejection after the UI read; do not synthesize its response.
    await fixture.db.query(
      "UPDATE groups SET status='unreachable' WHERE id='ui-group-a'",
    );
    try {
      await send();
      await page
        .getByRole("alert")
        .filter({ hasText: /不可|群/ })
        .first()
        .waitFor();
      await fixture.db.query(
        "UPDATE groups SET status='active' WHERE id='ui-group-a'",
      );
      assert.equal(await composer().inputValue(), "must-retain");
      assert.equal(
        await count("SELECT count(*) FROM messages WHERE text='must-retain'"),
        0,
      );
      return { retained: "must-retain", writes: 0 };
    } finally {
      await fixture.db.query(
        "UPDATE groups SET status='active' WHERE id='ui-group-a'",
      );
    }
  });
  await run("draft-sender-changed", async () => {
    await open();
    await composer().fill("sender-draft");
    const held = hold("/api/groups/ui-group-a/send");
    await held.ready;
    await send();
    await held.received;
    await page
      .getByRole("combobox", { name: "发送身份" })
      .selectOption("account-2");
    held.release();
    await page.getByRole("button", { name: "发送消息", exact: true }).waitFor();
    assert.equal(await composer().inputValue(), "sender-draft");
    return {
      originalSender: held.requests[0].accountId,
      currentSender: "account-2",
    };
  });
  await run("draft-group-changed", async () => {
    await open();
    await composer().fill("old-group");
    const held = hold("/api/groups/ui-group-a/send");
    await held.ready;
    await send();
    await held.received;
    await page.evaluate(() => {
      location.hash = "/groups/ui-group-b";
    });
    await page
      .getByRole("heading", { name: "隔离目标B", exact: true })
      .waitFor();
    await composer().fill("new-group");
    held.release();
    await pause(150);
    assert.equal(await composer().inputValue(), "new-group");
    return { retained: "new-group", requestGroup: "ui-group-a" };
  });
  await run("draft-double-submit", async () => {
    await open();
    await composer().fill("double-submit");
    const held = hold("/api/groups/ui-group-a/send");
    await held.ready;
    await page.locator("form.composer").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await held.received;
    await pause(100);
    assert.equal(held.calls(), 1);
    held.release();
    return { writes: held.calls(), syntheticSameTickSubmission: true };
  });
  for (const close of ["x", "escape", "cancel"])
    await run(`create-dirty-${close}`, async () => {
      await open("#/sequences/ui-group-a");
      await page.getByRole("button", { name: "新建序列", exact: true }).click();
      await createDialog()
        .getByRole("textbox", { name: "序列 JSON" })
        .fill('{"name":"draft"}');
      if (close === "escape") await page.keyboard.press("Escape");
      else
        await createDialog()
          .getByRole("button", {
            name: close === "x" ? "关闭弹窗" : "取消",
            exact: true,
          })
          .click();
      await page
        .getByRole("heading", { name: "放弃未保存的修改？" })
        .waitFor({ timeout: 1500 });
      await page.getByRole("button", { name: "继续编辑", exact: true }).click();
      assert.equal(
        await createDialog()
          .getByRole("textbox", { name: "序列 JSON" })
          .inputValue(),
        '{"name":"draft"}',
      );
      return { retained: true, close };
    });
  await run("create-pending-locks-close-and-edit", async () => {
    await open("#/sequences/ui-group-a");
    await page.getByRole("button", { name: "新建序列", exact: true }).click();
    const held = hold("/api/sequences");
    await held.ready;
    await createDialog()
      .getByRole("button", { name: "保存序列", exact: true })
      .click();
    assert.equal(await held.received, 200);
    assert.equal(
      await createDialog()
        .getByRole("textbox", { name: "序列 JSON" })
        .isDisabled(),
      true,
    );
    await createDialog()
      .getByRole("button", { name: "关闭弹窗", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(await createDialog().isVisible(), true);
    assert.equal(
      await createDialog()
        .getByRole("button", { name: "取消", exact: true })
        .isDisabled(),
      true,
    );
    held.release();
    await createDialog().waitFor({ state: "hidden" });
    assert.equal(held.calls(), 1);
    return { writes: 1, editsLocked: true };
  });
  for (const change of ["group", "group-aba", "vars", "template"])
    await run(`preview-stale-${change}`, async () => {
      await open("#/sequences/ui-group-a");
      await page
        .getByRole("combobox", { name: "消息序列" })
        .selectOption("ui-sequence-a");
      await previewButton().waitFor();
      const held = hold("/api/sequences/preview");
      await held.ready;
      await previewButton().click();
      assert.equal(await held.received, 200);
      if (change.startsWith("group")) {
        await page
          .getByRole("combobox", { name: "目标群组" })
          .selectOption("ui-group-b");
        if (change === "group-aba")
          await page
            .getByRole("combobox", { name: "目标群组" })
            .selectOption("ui-group-a");
      } else if (change === "vars")
        await page
          .getByRole("textbox", { name: "默认变量 vars" })
          .fill('{"extra":"new"}');
      else
        await page
          .getByRole("combobox", { name: "消息序列" })
          .selectOption("ui-sequence-b");
      held.release();
      await previewButton().waitFor();
      await pause(100);
      assert.equal(await previewDialog().count(), 0);
      assert.equal(await count("SELECT count(*) FROM sequence_runs"), 0);
      return { oldPreviewDiscarded: true, starts: 0 };
    });
  await run("preview-disappeared-target", async () => {
    await fixture.db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id,name) VALUES('ui-removable','ui-removable','account-1','可移除目标')",
    );
    await open("#/sequences/ui-removable");
    await page
      .getByRole("combobox", { name: "消息序列" })
      .selectOption("ui-sequence-a");
    await previewButton().click();
    await previewDialog().waitFor();
    await fixture.db.query("DELETE FROM groups WHERE id='ui-removable'");
    await checkEventually(async () => (await previewDialog().count()) === 0);
    assert.equal(
      await page.getByRole("combobox", { name: "目标群组" }).inputValue(),
      "ui-removable",
    );
    assert.equal(await previewButton().isDisabled(), true);
    return { originalChoiceRetained: true, confirmationClosed: true };
  });
  await run("preview-role-change-invalidates", async () => {
    await open("#/sequences/ui-group-a");
    await page
      .getByRole("combobox", { name: "消息序列" })
      .selectOption("ui-sequence-a");
    await previewButton().click();
    await previewDialog().waitFor();
    await fixture.db.query(
      "UPDATE members SET role='member' WHERE group_id='ui-group-a' AND account_id='account-1'",
    );
    try {
      await checkEventually(async () => (await previewDialog().count()) === 0);
      await previewButton().click();
      await previewDialog().waitFor();
      assert((await previewDialog().innerText()).includes("跳过"));
      return {
        staleConfirmationClosed: true,
        noRoleStillAllowsPreflight: true,
      };
    } finally {
      await fixture.db.query(
        "UPDATE members SET role='creator' WHERE group_id='ui-group-a' AND account_id='account-1'",
      );
    }
  });
  await run("create-invalid-json-retained", async () => {
    await open("#/sequences/ui-group-a");
    await page.getByRole("button", { name: "新建序列", exact: true }).click();
    await createDialog()
      .getByRole("textbox", { name: "序列 JSON" })
      .fill("{invalid");
    const before = await count("SELECT count(*) FROM sequences");
    await createDialog()
      .getByRole("button", { name: "保存序列", exact: true })
      .click();
    await createDialog().getByRole("alert").waitFor();
    assert.equal(
      await createDialog()
        .getByRole("textbox", { name: "序列 JSON" })
        .inputValue(),
      "{invalid",
    );
    assert.equal(
      await createDialog()
        .getByRole("textbox", { name: "序列 JSON" })
        .isDisabled(),
      false,
    );
    assert.equal(await count("SELECT count(*) FROM sequences"), before);
    return { retained: true, extraWrites: 0 };
  });
  await run("preview-invalid-deep-link", async () => {
    await open("#/sequences/missing-explicit-group");
    await page.getByRole("combobox", { name: "消息序列" }).waitFor();
    await pause(150);
    assert.equal(
      await page.getByRole("combobox", { name: "目标群组" }).inputValue(),
      "missing-explicit-group",
    );
    assert.equal(await previewButton().isDisabled(), true);
    return { selected: "missing-explicit-group", silentlyRetargeted: false };
  });
  await run("preview-frozen-summary-and-start", async () => {
    await open("#/sequences/ui-group-b");
    await page
      .getByRole("combobox", { name: "消息序列" })
      .selectOption("ui-sequence-b");
    await previewButton().click();
    await previewDialog().waitFor();
    const content = await previewDialog().innerText();
    for (const expected of [
      "隔离目标B",
      "ui-group-b",
      "模板B",
      "ui-sequence-b",
      "管理员 / 群主",
      "普通成员",
      "10",
      "5",
      "b-正文",
    ])
      assert(content.includes(expected), expected);
    await capture("frozen-preview");
    const held = hold("/api/groups/ui-group-b/sequence-runs");
    await held.ready;
    await previewDialog().getByRole("button", { name: "确认启动序列" }).click();
    assert.equal(await held.received, 201);
    held.release();
    await previewDialog().waitFor({ state: "hidden" });
    assert.equal(held.calls(), 1);
    assert.equal(held.requests[0].sequenceId, "ui-sequence-b");
    assert.equal(
      await count(
        "SELECT count(*) FROM sequence_runs WHERE group_id='ui-group-b' AND sequence_id='ui-sequence-b'",
      ),
      1,
    );
    return {
      frozenGroup: "ui-group-b",
      frozenTemplate: "ui-sequence-b",
      actualStarts: 1,
    };
  });
  await run("navigation-group-origin", async () => {
    await open();
    await page
      .locator("a.run-list-item")
      .filter({ hasText: "ui-run-a" })
      .click();
    const back = page.getByRole("link", { name: "← 返回原群组", exact: true });
    await back.waitFor({ timeout: 1500 });
    assert.equal(await back.getAttribute("href"), "#/groups/ui-group-a");
    assert.equal(await page.locator("nav a.active").innerText(), "群组工作台");
    assert(
      (await page.locator(".breadcrumbs").innerText()).includes("群组工作台"),
    );
    assert((await page.title()).includes("群组工作台"));
    await capture("group-origin-detail");
    assert.equal(
      await page
        .getByRole("link", { name: "查看所属群", exact: true })
        .getAttribute("href"),
      "#/groups/ui-group-a",
    );
    await page.reload();
    await back.waitFor();
    await back.click();
    await page
      .getByRole("heading", { name: "隔离目标A", exact: true })
      .waitFor();
    return {
      returned: "ui-group-a",
      workspace: "groups",
      refreshRetained: true,
    };
  });
  await run("navigation-list-origin", async () => {
    await open("#/agent-runs");
    await page
      .getByRole("combobox", { name: "查看群组" })
      .selectOption("ui-group-a");
    await page
      .locator("a.run-list-item")
      .filter({ hasText: "ui-run-a" })
      .click();
    const back = page.getByRole("link", {
      name: "← 返回 Agent 运行列表",
      exact: true,
    });
    await back.waitFor({ timeout: 1500 });
    assert.equal(await page.locator("nav a.active").innerText(), "Agent 运行");
    await back.click();
    await page.getByRole("combobox", { name: "查看群组" }).waitFor();
    assert.equal(
      await page.getByRole("combobox", { name: "查看群组" }).inputValue(),
      "ui-group-a",
    );
    await page.goBack();
    await back.waitFor();
    await page.goForward();
    await page.getByRole("combobox", { name: "查看群组" }).waitFor();
    await page.reload();
    await page.getByRole("combobox", { name: "查看群组" }).waitFor();
    assert.equal(
      await page.getByRole("combobox", { name: "查看群组" }).inputValue(),
      "ui-group-a",
    );
    return { selected: "ui-group-a", backForwardAndRefresh: true };
  });
  await run("navigation-deep-link-fallbacks", async () => {
    await open("#/agent-runs/missing?from=groups");
    await page.getByText("未能读取运行记录", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "← 返回群组工作台", exact: true })
        .getAttribute("href"),
      "#/groups",
    );
    await open(
      "#/agent-runs/ui-run-a?from=https://example.com&returnTo=//example.com",
    );
    const back = page.getByRole("link", {
      name: "← 返回 Agent 运行列表",
      exact: true,
    });
    await back.waitFor();
    assert.equal(await back.getAttribute("href"), "#/agent-runs");
    assert.equal(await page.locator("nav a.active").innerText(), "Agent 运行");
    await open("#/agent-runs/%E0%A4?from=groups");
    await page
      .getByRole("heading", { name: "Agent 运行", exact: true })
      .waitFor();
    return {
      externalSourceIgnored: true,
      malformedIdSafe: true,
      failureReturn: true,
    };
  });
  await run("navigation-identity-clears-context", async () => {
    await open("#/agent-runs/ui-run-a?from=groups");
    await page
      .getByRole("link", { name: "← 返回原群组", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.getByLabel("用户名", { exact: true }).fill("viewer");
    await page.getByLabel("密码", { exact: true }).fill("viewer");
    await page.getByRole("button", { name: "进入工作台" }).click();
    await page
      .getByRole("link", { name: "← 返回 Agent 运行列表", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).hash, "#/agent-runs/ui-run-a");
    assert.equal(await page.locator("nav a.active").innerText(), "Agent 运行");
    return { oldOriginCleared: true, identity: "viewer" };
  });
} catch (error) {
  report.fatal = String(error?.stack ?? error);
  console.error(error);
} finally {
  for (const release of releases.splice(0)) release();
  for (const [name, close] of [
    ["browser", () => browser?.close()],
    ["web", () => vite?.close()],
    ["api", () => app?.close()],
    ["database", () => cleanup?.()],
  ]) {
    try {
      await close();
      report.cleanup.push({ name, success: true });
    } catch (error) {
      report.cleanup.push({ name, success: false, error: String(error) });
    }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  if (
    report.fatal ||
    report.results.some((item) => item.status !== "PASS") ||
    report.cleanup.some((item) => !item.success) ||
    report.pageErrors.length
  )
    process.exitCode = 1;
}
