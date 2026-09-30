// Approved group-form evidence only; production UI, real REST/PG, isolated browser.
// npm run build first; explicit disposable DATABASE_URL and PLAYWRIGHT_MODULE required.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { preview } from "vite";
import { temporaryDatabase } from "../tests/support/temporary-database.js";
import { migrate } from "../apps/server/src/core/migrations.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";

assert(process.env.DATABASE_URL, "Explicit disposable PostgreSQL required");
assert.equal(
  new URL(process.env.DATABASE_URL).port,
  "64550",
  "Only the dedicated PG is allowed",
);
process.env.GATEWAY_URL = "http://127.0.0.1:1";
process.env.AGENT_URL = "http://127.0.0.1:1";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = `docs/evidence/cr-browser-closeout-${runId}`;
const key = "kapibala:createJob";
const groupId = "cr-browser-evidence-group";
const report = {
  runId,
  sourceHead: git("rev-parse", "HEAD"),
  webTree: git("rev-parse", "HEAD:apps/web"),
  referenceWebTree: git("rev-parse", "17b2d43:apps/web"),
  scriptSha256: createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex"),
  mode: "production build; real API/UUID PG; background disabled; independent headless Chromium",
  excluded: [
    "real OS IME",
    "native browser privacy-policy SecurityError",
    "remote gateway group creation",
    "user acceptance",
  ],
  results: [],
  requests: [],
  pageErrors: [],
  cleanupErrors: [],
};
let cleanup, fixture, app, vite, browser, page;
let currentCase;
const paint = async () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
const modal = (title) =>
  page
    .getByRole("heading", { name: title, exact: true })
    .locator("..")
    .locator("..");
const submit = () =>
  modal("创建群组")
    .getByRole("button", { name: "创建群组", exact: true })
    .click();
const groupPosts = () =>
  report.requests.filter(
    (r) =>
      r.case === currentCase &&
      r.method === "POST" &&
      r.url.endsWith("/api/groups"),
  );
const screenshot = async (suffix) => {
  const path = `${output}-${suffix}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
};
const finish = async (observed) => {
  report.results.push({
    name: currentCase,
    observed,
    screenshot: await screenshot(currentCase),
  });
  console.log(`PASS ${currentCase}`);
  await page.context().close();
};
async function openCase(name, storageFault) {
  currentCase = name;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addInitScript(
    ({ key, fault }) => {
      window.__crEvidence = { storageFaults: [], clicks: [] };
      document.addEventListener(
        "pointerdown",
        (event) => {
          window.__crEvidence.clicks.push({
            trusted: event.isTrusted,
            x: event.clientX,
            y: event.clientY,
            target: event.target.tagName,
          });
        },
        true,
      );
      if (!fault) return;
      const original = Storage.prototype[fault];
      Storage.prototype[fault] = function (name, ...args) {
        if (this === sessionStorage && name === key) {
          window.__crEvidence.storageFaults.push({
            operation: fault,
            name: "SecurityError",
            at: performance.now(),
          });
          throw new DOMException(
            "Isolated create-job storage denial",
            "SecurityError",
          );
        }
        return original.call(this, name, ...args);
      };
    },
    { key, fault: storageFault },
  );
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) =>
    report.pageErrors.push({ case: name, message: error.message }),
  );
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      report.requests.push({
        case: name,
        method: request.method(),
        url: request.url(),
      });
  });
  await page.goto(vite.resolvedUrls.local[0]);
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page
    .getByRole("heading", { name: "群组工作台", exact: true })
    .waitFor();
  await page.getByText("实时同步中", { exact: true }).waitFor();
}
async function openCreate(name = "尚未保存的创建草稿") {
  await page.getByRole("button", { name: "创建群组", exact: true }).click();
  await modal("创建群组")
    .getByRole("textbox", { name: /^群名称/ })
    .fill(name);
  await modal("创建群组")
    .getByRole("combobox", { name: /^群主账号/ })
    .selectOption("account-1");
  await modal("创建群组")
    .getByRole("combobox", { name: /^管理员账号/ })
    .selectOption("account-2");
}
async function backdrop(title) {
  const box = await modal(title).boundingBox();
  assert(box && box.x > 10 && box.y > 10);
  await page.mouse.click(5, 5);
  await paint();
  assert(await modal(title).isVisible());
  const click = await page.evaluate(() => window.__crEvidence.clicks.at(-1));
  assert.equal(click.trusted, true);
  assert.equal(click.target, "DIALOG");
  return { click, dialogBox: box };
}
async function createAndObserve() {
  await openCreate("存储异常时仍已受理");
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/groups",
  );
  await submit();
  const accepted = await response;
  assert.equal(accepted.status(), 202);
  const { jobId } = await accepted.json();
  await page.getByText(jobId, { exact: true }).waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(groupPosts().length, 1);
  assert.equal(
    Number(
      (await fixture.db.query("SELECT count(*) FROM jobs WHERE id=$1", [jobId]))
        .rows[0].count,
    ),
    1,
  );
  return jobId;
}
try {
  assert.equal(report.webTree, report.referenceWebTree);
  await mkdir("docs/evidence", { recursive: true });
  report.buildAssets = await Promise.all(
    (await readdir("apps/web/dist/assets")).map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(`apps/web/dist/assets/${file}`))
        .digest("hex"),
    })),
  );
  fixture = await temporaryDatabase({
    after: (cb) => {
      cleanup = cb;
    },
  });
  report.database = new URL(fixture.url).pathname.slice(1);
  report.databaseServerPort = new URL(fixture.url).port;
  await migrate(fixture.db);
  await fixture.db.query(
    "UPDATE accounts SET status='online',platform_user_id='cr-'||id",
  );
  await fixture.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,description) VALUES($1,'cr-gateway-group','account-1','已保存的群名','已保存的简介')",
    [groupId],
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
  fixture.onCleanup(() => app.close());
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
  fixture.onCleanup(
    () =>
      new Promise((resolve, reject) =>
        vite.httpServer.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  report.apiPort = new URL(api).port;
  report.webPort = new URL(vite.resolvedUrls.local[0]).port;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  fixture.onCleanup(() => browser.close());
  report.browserVersion = browser.version();

  await openCase("create-backdrop-and-discard");
  await openCreate();
  const createBackdrop = await backdrop("创建群组");
  assert.equal(
    await modal("创建群组")
      .getByRole("textbox", { name: /^群名称/ })
      .inputValue(),
    "尚未保存的创建草稿",
  );
  await modal("创建群组")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  const createPromptBackdrop = await backdrop("放弃未保存的修改？");
  await modal("放弃未保存的修改？")
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "创建群组", exact: true }).click();
  assert.equal(
    await modal("创建群组")
      .getByRole("textbox", { name: /^群名称/ })
      .inputValue(),
    "",
  );
  assert.equal(groupPosts().length, 0);
  await finish({
    createBackdrop,
    createPromptBackdrop,
    draftClearedOnReopen: true,
    postCount: 0,
  });

  await openCase("edit-backdrop-and-discard");
  await page.locator(`[data-directory-group-id="${groupId}"]`).click();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await modal("编辑群资料")
    .getByRole("textbox", { name: /^群名称/ })
    .fill("未提交的编辑草稿");
  const editBackdrop = await backdrop("编辑群资料");
  await modal("编辑群资料")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  const editPromptBackdrop = await backdrop("放弃未保存的修改？");
  await modal("放弃未保存的修改？")
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  assert.equal(
    await modal("编辑群资料")
      .getByRole("textbox", { name: /^群名称/ })
      .inputValue(),
    "已保存的群名",
  );
  assert.equal(
    report.requests.filter(
      (r) => r.case === currentCase && r.method === "PATCH",
    ).length,
    0,
  );
  assert.equal(
    (await fixture.db.query("SELECT name FROM groups WHERE id=$1", [groupId]))
      .rows[0].name,
    "已保存的群名",
  );
  await finish({
    editBackdrop,
    editPromptBackdrop,
    persistedNameUnchanged: true,
    patchCount: 0,
  });

  for (const outcome of ["success", "failure"]) {
    await openCase(`create-unmount-late-${outcome}`);
    await page.getByRole("link", { name: "服务账号", exact: true }).click();
    await page
      .getByRole("heading", { name: "服务账号", exact: true })
      .waitFor();
    await page.getByRole("link", { name: "群组工作台", exact: true }).click();
    let held, release;
    const ready = new Promise((resolve) => {
      held = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let originalJobId;
    await page.route("**/api/groups", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      let response;
      if (outcome === "success") {
        response = await route.fetch();
        assert.equal(response.status(), 202);
        originalJobId = (await response.json()).jobId;
      }
      held();
      await gate;
      if (response) await route.fulfill({ response });
      else
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Isolated late create failure",
              requestId: "cr-late",
            },
          }),
        });
    });
    await openCreate("旧创建请求");
    await submit();
    await ready;
    await page.goBack();
    await page
      .getByRole("heading", { name: "服务账号", exact: true })
      .waitFor();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.getByRole("link", { name: "群组工作台", exact: true }).click();
    await openCreate("新组件未提交草稿");
    const finished = page.waitForEvent(
      "requestfinished",
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/groups",
    );
    release();
    await finished;
    await paint();
    assert(await modal("创建群组").isVisible());
    assert.equal(
      await modal("创建群组")
        .getByRole("textbox", { name: /^群名称/ })
        .inputValue(),
      "新组件未提交草稿",
    );
    assert.equal(
      await page
        .getByText("Isolated late create failure", { exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.evaluate((key) => sessionStorage.getItem(key), key),
      null,
    );
    assert.equal(groupPosts().length, 1);
    assert.equal(
      report.requests.filter(
        (r) => r.case === currentCase && r.url.includes("/api/jobs/"),
      ).length,
      0,
    );
    if (originalJobId)
      assert.equal(
        Number(
          (
            await fixture.db.query("SELECT count(*) FROM jobs WHERE id=$1", [
              originalJobId,
            ])
          ).rows[0].count,
        ),
        1,
      );
    await finish({
      navigation:
        "real browser history back, then sidebar forward and new form mount",
      response: outcome,
      originalJobId,
      oldAcceptedJobSurvives: outcome === "success",
      newDraftUnchanged: true,
      storageJob: null,
      jobGetCount: 0,
      postCount: 1,
    });
  }

  await openCase("storage-get-security-error", "getItem");
  await openCreate("读取存储失败仍可编辑");
  const getFaults = await page.evaluate(
    () => window.__crEvidence.storageFaults,
  );
  assert(getFaults.some((f) => f.operation === "getItem"));
  await finish({
    injection:
      "key-scoped Storage.getItem SecurityError; real React catch path",
    faults: getFaults,
    workspaceAndCreateFormVisible: true,
  });

  await openCase("storage-set-security-error", "setItem");
  const setJobId = await createAndObserve();
  const setFaults = await page.evaluate(
    () => window.__crEvidence.storageFaults,
  );
  assert(setFaults.some((f) => f.operation === "setItem"));
  await finish({
    injection: "key-scoped Storage.setItem SecurityError",
    faults: setFaults,
    jobId: setJobId,
    acceptedJobVisible: true,
    postCount: 1,
  });

  await openCase("storage-remove-security-error", "removeItem");
  const removeJobId = await createAndObserve();
  await page.getByRole("button", { name: "隐藏任务", exact: true }).click();
  await page
    .getByText(removeJobId, { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), key),
    removeJobId,
  );
  const removeFaults = await page.evaluate(
    () => window.__crEvidence.storageFaults,
  );
  assert(removeFaults.some((f) => f.operation === "removeItem"));
  const hiddenScreenshot = await screenshot("storage-remove-hidden");
  await page.reload();
  await page.getByText(removeJobId, { exact: true }).waitFor();
  assert.equal(groupPosts().length, 1);
  await finish({
    injection: "key-scoped Storage.removeItem SecurityError",
    faults: removeFaults,
    jobId: removeJobId,
    hiddenInCurrentMount: true,
    hiddenScreenshot,
    retainedStorageRestoresJobAfterReload: true,
    postCount: 1,
  });

  await openCase("storage-native-quota-exceeded");
  const quota = await page.evaluate((key) => {
    let data = "",
      step = 1024 * 1024,
      lastError;
    while (step >= 1) {
      try {
        sessionStorage.setItem("cr-quota-padding", data + "x".repeat(step));
        data += "x".repeat(step);
      } catch (error) {
        lastError = error.name;
        step = Math.floor(step / 2);
      }
    }
    let targetError;
    try {
      sessionStorage.setItem(key, "probe");
    } catch (error) {
      targetError = {
        name: error.name,
        code: error.code,
        message: error.message,
      };
    }
    return {
      paddingCharacters: data.length,
      lastError,
      targetError,
      targetValue: sessionStorage.getItem(key),
    };
  }, key);
  assert.equal(quota.targetError?.name, "QuotaExceededError");
  assert.equal(quota.targetValue, null);
  const quotaJobId = await createAndObserve();
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), key),
    null,
  );
  const acceptedScreenshot = await screenshot("storage-quota-accepted");
  await page.reload();
  await page
    .getByRole("heading", { name: "群组工作台", exact: true })
    .waitFor();
  assert.equal(await page.getByText(quotaJobId, { exact: true }).count(), 0);
  assert.equal(groupPosts().length, 1);
  await finish({
    nativeBrowserQuota: quota,
    jobId: quotaJobId,
    acceptedJobVisibleBeforeReload: true,
    acceptedScreenshot,
    persisted: false,
    absentAfterReload: true,
    postCount: 1,
    boundary:
      "job tracking cannot survive reload when native storage write is denied; accepted server job remains",
  });

  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = {
    case: currentCase,
    message: error.message,
    stack: error.stack,
  };
  try {
    report.failureBody = await page?.locator("body").innerText();
    report.failureScreenshot = await screenshot("failure");
  } catch {}
  console.error(error);
} finally {
  try {
    await cleanup?.();
    report.cleaned = true;
  } catch (error) {
    report.cleanupErrors.push(String(error));
    report.passed = false;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        results: report.results.length,
        output: `${output}.json`,
        failure: report.failure?.message,
        cleanupErrors: report.cleanupErrors,
      },
      null,
      2,
    ),
  );
}
if (!report.passed) process.exitCode = 1;
