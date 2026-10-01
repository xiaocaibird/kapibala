// Focused page-attention check. Requires Playwright via PLAYWRIGHT_MODULE or local install.
// Uses only a fresh database, ephemeral API/Vite ports, and a new browser instance.
// Run from repo root: npx tsx scripts/verify-page-attention-browser.mjs
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { Database, emit } from "../apps/server/src/core/db.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { Messages } from "../apps/server/src/modules/gateway/messages.js";
import { changeAccount } from "../apps/server/src/modules/gateway/state.js";
import { RemoteClient } from "../apps/server/src/core/remote.js";
import { migrate } from "../scripts/migrate.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
await mkdir(".runtime", { recursive: true });
const name = `kapibala_browser_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(
  process.env.DATABASE_URL ??
    "postgres://kapibala:kapibala@localhost:55432/kapibala",
);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.set("options", "-csearch_path=public");
const admin = new Database(adminUrl.toString());
let db, app, vite, browser;
const errors = [];
const results = [];
const pass = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
try {
  await admin.query(`CREATE DATABASE ${name}`);
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${name}`;
  db = new Database(testUrl.toString());
  await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,created_at) SELECT 'g'||i,'remote-'||i,'account-1','测试群 '||i,now()-i*interval '1 minute' FROM generate_series(1,45) i",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) SELECT id,'account-1','account-1','creator' FROM groups",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) SELECT id,'account-2','account-2','admin' FROM groups",
  );
  await db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) SELECT 'history-'||i,'g1','history-'||i,'external',false,'历史消息 '||i,now()-i*interval '1 minute' FROM generate_series(1,80) i",
  );
  await db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('run1','g1'),('run2','g2')",
  );
  await db.query(
    "INSERT INTO agent_steps(run_id,ordinal,kind,result_summary,state) VALUES('run1',1,'final','初始结果','complete')",
  );
  await db.query(
    `INSERT INTO sequences(id,name,steps) VALUES('seq1','测试序列','[{"index":1,"accountRole":"admin","text":"测试步骤","delaySeconds":0}]')`,
  );
  await db.query(
    "INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('sr1','g1','seq1')",
  );
  await db.query(
    "INSERT INTO sequence_steps(run_id,index,account_role,text,delay_seconds,resolved_vars,var_sources) VALUES('sr1',1,'admin','测试步骤',0,'{}','{}')",
  );
  let ctx;
  app = await createApp({
    db,
    logger: false,
    background: false,
    modules: (c) => {
      ctx = {
        ...c,
        gateway: new RemoteClient("http://unused.invalid"),
        agent: new RemoteClient("http://unused.invalid"),
      };
      const gateway = createGatewayModule(ctx);
      return [gateway, createAutomationModule(ctx, gateway)];
    },
  });
  const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  vite = await createServer({
    configFile: false,
    root: new URL("../apps/web", import.meta.url).pathname,
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      watch: null,
      proxy: {
        "/api": { target: apiUrl },
        "/ws": { target: apiUrl.replace("http:", "ws:"), ws: true },
      },
    },
  });
  await vite.listen();
  const url = vite.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });
  const page = await context.newPage();
  const away = await context.newPage();
  await away.goto(
    "data:text/html,<title>Attention test focus</title><p>Independent browser verification</p>",
  );
  await (
    await context.newCDPSession(page)
  ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await (
    await context.newCDPSession(away)
  ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.bringToFront();
  await page.goto(url);
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByText("实时同步中", { exact: true }).waitFor();
  const background = async () => {
    await (
      await context.newCDPSession(page)
    ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
    await (
      await context.newCDPSession(away)
    ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
    await away.bringToFront();
    assert.equal(
      await page.evaluate(() => document.hasFocus()),
      false,
      "test page must actually lose focus",
    );
  };
  const wait = () => page.waitForTimeout(900);
  const titleHas = async (v) => {
    try {
      await page.waitForFunction(
        (v) => document.title.includes("[有更新]") === v,
        v,
        { timeout: 6000 },
      );
    } catch (e) {
      console.log(
        "DEBUG",
        await page.evaluate(() => ({
          title: document.title,
          focus: document.hasFocus(),
          visibility: document.visibilityState,
          body: document.body.innerText,
        })),
        errors,
      );
      throw e;
    }
  };
  const go = async (hash) => {
    await page.bringToFront();
    await page.goto(url + "#/" + hash);
    await wait();
    await titleHas(false);
  };
  const event = async (type, payload) =>
    db.transaction((tx) => emit(tx, type, payload));
  const api = async (method, path, payload) => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "admin" },
    });
    const token = login.json().accessToken;
    const res = await app.inject({
      method: method,
      url: path,
      headers: { authorization: `Bearer ${token}` },
      payload: payload,
    });
    assert.ok(res.statusCode < 300, res.body);
    return res.json();
  };
  const clearEntries = async () => {
    for (let i = 0; i < 12; i++) {
      const buttons = page.locator(".attention-notice button");
      if (!(await buttons.count())) break;
      const confirm = page
        .locator(".attention-notice button")
        .filter({ hasText: "确认" });
      if ((await confirm.count()) && page.url().endsWith("#/groups"))
        await page.screenshot({
          path: ".runtime/page-attention-range.png",
          fullPage: true,
        });
      await (
        (await confirm.count()) ? confirm.first() : buttons.first()
      ).click();
      await wait();
    }
    await titleHas(false);
  };
  await go("accounts");
  await background();
  await db.transaction((tx) => changeAccount(tx, "account-1", "disconnected"));
  await titleHas(true);
  assert.ok(await page.locator('link[rel="icon"][href^="data:"]').count());
  await page.bringToFront();
  await wait();
  await titleHas(true);
  await page.getByRole("heading", { name: "服务账号", exact: true }).click();
  await titleHas(true);
  await page
    .locator("tbody tr")
    .filter({ hasText: "account-1" })
    .locator("strong")
    .click();
  await titleHas(false);
  pass("Accounts background/focus/unrelated click/exact row + favicon");
  await background();
  await db.transaction((tx) => changeAccount(tx, "account-1", "disconnected"));
  await wait();
  await titleHas(false);
  pass("same-value account transition stays quiet");
  await page.bringToFront();
  await db.transaction((tx) => changeAccount(tx, "account-3", "disconnected"));
  await wait();
  await titleHas(false);
  assert.equal(await page.locator(".attention-notice").count(), 0);
  await background();
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("foreground presented update quiet; blur promotes unresolved update");
  await background();
  await db.transaction(async (tx) => {
    await changeAccount(tx, "account-4", "disconnected");
    await changeAccount(tx, "account-4", "online");
  });
  await wait();
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("real A-to-B-to-A state changes retain attention");
  await background();
  await db.transaction((tx) => changeAccount(tx, "account-3", "online"));
  await titleHas(true);
  await page.bringToFront();
  await wait();
  let releaseRefresh;
  let observeRefresh;
  const refreshHeld = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  const refreshStarted = new Promise((resolve) => {
    observeRefresh = resolve;
  });
  await page.route("**/api/accounts", async (route) => {
    observeRefresh();
    await refreshHeld;
    await route.continue();
  });
  await page.locator(".attention-notice button").first().click();
  await refreshStarted;
  await background();
  releaseRefresh();
  await wait();
  await page.unroute("**/api/accounts");
  await page.bringToFront();
  await wait();
  await titleHas(true);
  await clearEntries();
  pass("refresh intent interrupted by blur cannot confirm on focus return");
  await go("groups/g1");
  await page.getByRole("button", { name: "加载更早", exact: true }).click();
  await wait();
  await titleHas(false);
  pass("initial history/load earlier quiet");
  await background();
  await event("message", {
    groupId: "g1",
    id: "history-1",
    changeKind: "created",
    attentionIdentity: "confirmed",
    attentionCreatedSeq: 1,
  });
  await wait();
  await titleHas(false);
  await page.bringToFront();
  pass("late identity confirmation of pre-scope history stays quiet");
  await page.getByLabel("消息内容", { exact: true }).fill("本页手动发送");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await wait();
  await background();
  await wait();
  await titleHas(false);
  pass("pre-generated manual clientMsgId excluded");
  const messages = new Messages(ctx);
  await messages.enqueueSend({
    groupId: "g1",
    accountId: "account-2",
    text: "后台 Agent 消息",
    source: "agent",
  });
  await titleHas(true);
  await page.bringToFront();
  await page.getByLabel("消息内容", { exact: true }).fill("输入其他内容不确认");
  await titleHas(true);
  await clearEntries();
  pass("Agent message counts; composer does not clear; explicit view confirms");
  await background();
  await messages.enqueueSend({
    groupId: "g1",
    accountId: "account-2",
    text: Array.from({ length: 25 }, (_, i) => `长消息行 ${i}`).join("\n"),
    source: "sequence",
  });
  await titleHas(true);
  await page.bringToFront();
  await page.locator(".timeline .attention-notice button").first().click();
  await page
    .getByRole("button", { name: "确认这条更新摘要", exact: true })
    .waitFor();
  await titleHas(true);
  await page
    .getByRole("button", { name: "确认这条更新摘要", exact: true })
    .click();
  await titleHas(false);
  pass("oversized timeline message requires second summary confirmation");
  await background();
  await api("PATCH", "/api/groups/g1", { name: "资料已更新" });
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("group profile update");
  await background();
  await api("PATCH", "/api/groups/g1", { agentEnabled: true });
  await titleHas(true);
  await wait();
  await page.bringToFront();
  assert.equal(
    await page
      .locator(".attention-notice")
      .filter({ hasText: "群资料有更新" })
      .count(),
    0,
  );
  await clearEntries();
  pass("confirmed profile change is not promoted by later settings event");
  await go("groups");
  await background();
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE members SET role='member' WHERE group_id='g1' AND account_id='account-2'",
    );
    await emit(tx, "group_changed", {
      groupId: "g1",
      changedFields: ["members"],
      directoryChangedFields: [],
    });
  });
  await wait();
  await titleHas(false);
  pass("directory ignores member-role changes with unchanged visible count");
  // Deliberately let the actual REST projection arrive before its WS signal.
  await db.query(
    "DELETE FROM members WHERE group_id='g1' AND account_id='account-2'",
  );
  await page.bringToFront();
  await page.getByRole("button", { name: "刷新列表", exact: true }).click();
  await page
    .locator(".group-card")
    .filter({ hasText: "资料已更新" })
    .getByText("1 位成员", { exact: true })
    .waitFor();
  await wait();
  await background();
  await event("group_changed", {
    groupId: "g1",
    changedFields: ["members"],
    directoryChangedFields: ["memberCount"],
  });
  await wait();
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("directory member count REST-before-WS retains committed change");
  await db.query(
    "UPDATE agent_runs SET status='finished',end_reason='end_turn' WHERE id='run2'",
  );
  await page.getByRole("button", { name: "刷新列表", exact: true }).click();
  await page
    .locator('.group-card[href="#/groups/g2"]')
    .getByText("查看群组详情", { exact: true })
    .waitFor();
  await wait();
  await background();
  await event("agent_run", {
    groupId: "g2",
    runId: "run2",
    status: "finished",
    changedFields: ["status"],
    directoryChangedFields: ["activeAgentRunId"],
  });
  await wait();
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("directory active run REST-before-WS retains committed change");
  await page.bringToFront();
  await page.getByRole("button", { name: "加载更多", exact: true }).click();
  await wait();
  await background();
  await api("PATCH", "/api/groups/g25", { name: "末页已更新" });
  await titleHas(true);
  await wait();
  assert.ok(
    await page
      .getByRole("button", { name: "加载更多", exact: true })
      .isDisabled(),
  );
  await page.route("**/api/group-directory?**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "TEST_FAILURE", message: "测试刷新失败" },
      }),
    }),
  );
  await page.bringToFront();
  await page.locator(".attention-notice button").first().click();
  await wait();
  await titleHas(true);
  await page.unroute("**/api/group-directory?**");
  await clearEntries();
  pass(
    "directory multipage stale; failed refresh retains; successful range refresh confirms",
  );
  await go("groups");
  const search = page.getByRole("searchbox");
  // Synthetic composition covers our event handling and copy only. A real OS
  // input method remains a separate human/browser compatibility exercise.
  const compositionRequests = [];
  const captureSearch = (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname === "/api/group-directory")
      compositionRequests.push(requestUrl.searchParams.get("q") ?? "");
  };
  await wait();
  page.on("request", captureSearch);
  await search.focus();
  await search.dispatchEvent("compositionstart", { data: "" });
  await search.fill("ceshi");
  await wait();
  await page.getByText("正在输入，完成选词后再搜索", { exact: true }).waitFor();
  assert.deepEqual(compositionRequests, []);
  assert.ok(await search.evaluate((el) => el === document.activeElement));
  assert.ok(
    await page
      .getByRole("button", { name: "刷新列表", exact: true })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByRole("button", { name: "重置条件", exact: true })
      .isEnabled(),
  );
  await search.fill("测试");
  await search.dispatchEvent("compositionend", { data: "测试" });
  await page.getByText("等待应用搜索条件…", { exact: true }).waitFor();
  await wait();
  assert.deepEqual(compositionRequests, ["测试"]);
  assert.ok(await search.evaluate((el) => el === document.activeElement));
  page.off("request", captureSearch);
  await page.screenshot({
    path: ".runtime/manual-ui-composition-committed.png",
  });
  pass(
    "synthetic composition shows input copy without an intermediate request; committed text queries once and retains focus",
  );
  await search.fill("测试");
  await wait();
  assert.ok(await search.evaluate((el) => el === document.activeElement));
  await page.keyboard.type("群");
  await wait();
  assert.equal(await search.inputValue(), "测试群");
  assert.ok(await search.evaluate((el) => el === document.activeElement));
  await search.fill("");
  await wait();
  pass("query reset preserves search input focus across debounce");
  await background();
  await api("PATCH", "/api/groups/g1", { name: "筛选变化" });
  await titleHas(true);
  await page.bringToFront();
  await page.locator(".directory-tools select").nth(0).selectOption("left");
  await wait();
  await titleHas(false);
  await page.getByText("没有匹配的群", { exact: true }).waitFor();
  await page.locator(".directory-tools select").nth(1).focus();
  await page.locator(".directory-tools select").nth(1).selectOption("false");
  await wait();
  await titleHas(false);
  assert.ok(
    await page
      .locator(".directory-tools select")
      .nth(1)
      .evaluate((el) => el === document.activeElement),
  );
  await page
    .getByRole("button", { name: "重置条件", exact: true })
    .first()
    .click();
  await wait();
  pass(
    "status and Agent filters reset scope with empty-state and focus preserved",
  );

  await page.getByRole("button", { name: "创建群组", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("任务验证群");
  await dialog.locator("select").nth(0).selectOption("account-2");
  await dialog.locator("select").nth(1).selectOption("account-4");
  await dialog.getByRole("button", { name: "创建群组", exact: true }).click();
  await page.getByText("异步任务", { exact: true }).waitFor();
  await wait();
  await background();
  const job = (
    await db.query("SELECT id FROM jobs ORDER BY created_at DESC LIMIT 1")
  ).rows[0];
  await db.transaction(async (tx) => {
    await tx.query(
      'UPDATE jobs SET status=\'failed\',errors=\'[{"step":"create","code":"TEST_FAILURE"}]\' WHERE id=$1',
      [job.id],
    );
    await emit(tx, "job_changed", {
      jobId: job.id,
      status: "failed",
      changedFields: ["status", "errors"],
    });
  });
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("mounted create task failure attention");
  await go("agent-runs");
  await page.locator(".selector-panel select").selectOption("g1");
  await wait();
  await background();
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE agent_runs SET status='finished',end_reason='end_turn',summary='结束结果' WHERE id='run1'",
    );
    await emit(tx, "agent_run", {
      runId: "run1",
      groupId: "g1",
      status: "finished",
    });
  });
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("selected Agent run list terminal summary");
  await go("agent-runs/run1");
  await background();
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE agent_steps SET result_summary='新的结果摘要' WHERE run_id='run1' AND ordinal=1",
    );
    await emit(tx, "agent_step_changed", {
      runId: "run1",
      groupId: "g1",
      ordinal: 1,
      changedFields: ["resultSummary"],
    });
  });
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("Agent exact ordinal step update");
  await go("sequences/g1");
  await background();
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE sequence_steps SET scheduled_at=now()+interval '1 minute' WHERE run_id='sr1' AND index=1",
    );
    await emit(tx, "sequence_step_changed", {
      runId: "sr1",
      groupId: "g1",
      stepIndex: 1,
      changedFields: ["scheduledAt"],
    });
  });
  await titleHas(true);
  await page.bringToFront();
  await clearEntries();
  pass("selected sequence schedule update");
  await background();
  await event("agent_step_changed", {
    runId: "run2",
    groupId: "g2",
    ordinal: 1,
    changedFields: ["created"],
  });
  await wait();
  await titleHas(false);
  pass("unrelated route entity stays quiet");
  await page.bringToFront();
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("heading", { name: "登录工作台" }).waitFor();
  assert.ok(!(await page.title()).includes("[有更新]"));
  assert.equal(
    await page.locator('link[rel="icon"][href^="data:"]').count(),
    0,
  );
  pass("logout restores browser chrome");
  assert.deepEqual(errors, []);
  const evidence = {
    database: name,
    origin: url,
    checks: results.length,
    errors,
    results,
  };
  await writeFile(
    ".runtime/page-attention-browser.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  const failures = [];
  for (const cleanup of [
    () => browser?.close(),
    () => vite?.close(),
    () => app?.close(),
    () => db?.close(),
    () => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    const remaining = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    assert.equal(
      remaining.rowCount,
      0,
      "independent browser database must be removed",
    );
  } catch (error) {
    failures.push(error);
  }
  await admin.close();
  if (failures.length)
    throw new AggregateError(failures, "Browser fixture cleanup failed");
}
