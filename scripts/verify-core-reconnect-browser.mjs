// Production React + real REST/WS, isolated UUID PostgreSQL database and browser.
// Run after npm run build with explicit DATABASE_URL and PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { preview } from "vite";
import { temporaryDatabase } from "../tests/support/temporary-database.js";
import { migrate } from "../apps/server/src/core/migrations.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { GatewayEvents } from "../apps/server/src/modules/gateway/events.js";
import { Messages } from "../apps/server/src/modules/gateway/messages.js";

assert(
  process.env.DATABASE_URL,
  "Explicit disposable PostgreSQL server required",
);
assert.notEqual(
  new URL(process.env.DATABASE_URL).port,
  "55432",
  "Demo PG forbidden",
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const now = () => performance.timeOrigin + performance.now();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = `docs/evidence/core-reconnect-browser-${runId}`;
const groupId = "core-reconnect-group";
const gatewayGroupId = "core-reconnect-gateway-group";
const report = {
  runId,
  sourceHead: git("rev-parse", "HEAD"),
  appsTree: git("rev-parse", "HEAD:apps"),
  packagesTree: git("rev-parse", "HEAD:packages"),
  scriptSha256: createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex"),
  startedAt: new Date().toISOString(),
  mode: "production build; real API and WebSocket; fresh headless Chromium context",
  thresholdMs: 3000,
  boundary:
    "Browser REST/WS transport restored after outage; GatewayEvents.process injects gateway events without the SSE network parser; background workers disabled",
  timing:
    "Node and browser performance.timeOrigin + performance.now on one host; offset bounded by a browser round trip; DOM first exact match followed by two animation frames and a second exact match",
  results: [],
  requests: [],
  sockets: [],
  pageErrors: [],
  cleanupErrors: [],
};
let cleanup, fixture, app, vite, browser, page, ingestion;
let eventId = 0;
const controls = {
  outage: false,
  failTimelineOnce: false,
  replayOnNextAuth: false,
};
const browserOnly = (req) => req.headers["x-core-qa-internal"] !== "true";
const unavailable = {
  error: {
    code: "SERVICE_UNAVAILABLE",
    message: "Isolated B4 transport fault",
    requestId: "core-reconnect",
  },
};
try {
  await mkdir("docs/evidence", { recursive: true });
  const assets = await readdir("apps/web/dist/assets");
  report.buildAssets = await Promise.all(
    assets.map(async (file) => ({
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
  const { db } = fixture;
  await migrate(db);
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id='core-'||id",
  );
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name) VALUES($1,$2,'account-1','B4 多页断线恢复验证')",
    [groupId, gatewayGroupId],
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-1','core-account-1','creator')",
    [groupId],
  );
  app = await createApp({
    db,
    logger: false,
    background: false,
    modules: (ctx) => {
      ingestion = new GatewayEvents(ctx, new Messages(ctx));
      const gateway = createGatewayModule(ctx);
      return [
        {
          async register(server) {
            server.addHook("onRequest", async (req, reply) => {
              if (!browserOnly(req)) return;
              const entry = {
                id: req.id,
                url: req.url,
                method: req.method,
                startedAt: now(),
              };
              report.requests.push(entry);
              if (
                controls.outage &&
                (req.url.startsWith("/api/") || req.url.startsWith("/ws"))
              ) {
                entry.fault = "outage";
                return reply.code(503).send(unavailable);
              }
              if (
                controls.failTimelineOnce &&
                req.method === "GET" &&
                req.url.startsWith(`/api/groups/${groupId}/messages`)
              ) {
                controls.failTimelineOnce = false;
                entry.fault = "one-restored-timeline-503";
                return reply.code(503).send(unavailable);
              }
            });
            server.addHook("onSend", async (req, reply, payload) => {
              const entry = report.requests.find((item) => item.id === req.id);
              if (entry) {
                entry.status = reply.statusCode;
                entry.finishedAt = now();
                if (
                  req.url.includes("/messages") &&
                  reply.statusCode === 200 &&
                  typeof payload === "string"
                ) {
                  const value = JSON.parse(payload);
                  entry.itemCount = value.items.length;
                  entry.snapshotId = value.snapshotId;
                  entry.hasNextCursor = value.nextCursor !== null;
                }
              }
              return payload;
            });
          },
          async tick() {},
        },
        gateway,
        createAutomationModule(ctx, gateway),
      ];
    },
  });
  fixture.onCleanup(() => app.close());
  fixture.onCleanup(() => ingestion.close());
  const oldReplayFrames = [];
  app.websocketServer.on("connection", (socket) => {
    const record = { openedAt: now(), frames: [] };
    report.sockets.push(record);
    const send = socket.send.bind(socket);
    socket.send = (data, ...args) => {
      const value = JSON.parse(String(data));
      record.frames.push({
        at: now(),
        type: value.type,
        seq: value.seq,
        success: value.success,
      });
      send(data, ...args);
      if (value.type === "auth" && value.success && controls.replayOnNextAuth) {
        controls.replayOnNextAuth = false;
        // Replay real persisted WS envelopes from before the outage twice. The
        // normal WS stream still replays all new persisted events by sinceSeq.
        for (const frame of oldReplayFrames) {
          send(JSON.stringify(frame));
          send(JSON.stringify(frame));
        }
        record.injectedOldFrames = oldReplayFrames.length * 2;
      }
    };
    socket.on("message", (raw) => {
      const value = JSON.parse(String(raw));
      if (value.type === "auth")
        ((record.authRequestedAt = now()), (record.sinceSeq = value.sinceSeq));
    });
    socket.on("close", (code) => {
      record.closedAt = now();
      record.closeCode = code;
    });
  });
  const api = await app.listen({ host: "127.0.0.1", port: 0 });
  report.apiPort = new URL(api).port;
  const publish = async (msgId, text, minute, extra = {}) => {
    const event = {
      type: "message",
      eventId: ++eventId,
      groupId: gatewayGroupId,
      msgId,
      senderPlatformUserId: "external-core-user",
      text,
      sentAt: new Date(Date.UTC(2026, 0, 1) + minute * 60_000).toISOString(),
      ...extra,
    };
    await ingestion.process(event);
    return event;
  };
  for (let i = 0; i < 160; i++)
    await publish(`initial-${i}`, `初始消息 ${String(i).padStart(3, "0")}`, i);
  oldReplayFrames.push(
    ...(
      await db.query(
        "SELECT seq,type,payload FROM events ORDER BY seq DESC LIMIT 3",
      )
    ).rows.map((row) => ({ ...row, seq: Number(row.seq) })),
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-core-qa-internal": "true" },
    payload: { username: "admin", password: "admin" },
  });
  assert.equal(login.statusCode, 200);
  const accessToken = login.json().accessToken;
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
  report.webPort = new URL(vite.resolvedUrls.local[0]).port;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  fixture.onCleanup(() => browser.close());
  report.browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addInitScript(() => {
    const clock = () => performance.timeOrigin + performance.now();
    window.__coreQA = {
      socketEvents: [],
      loadedAt: clock(),
      navigationCount: 0,
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        const qa = window.__coreQA;
        qa.socketEvents.push({ type: "construct", at: clock() });
        this.addEventListener("open", () =>
          qa.socketEvents.push({ type: "open", at: clock() }),
        );
        this.addEventListener("close", (event) =>
          qa.socketEvents.push({
            type: "close",
            at: clock(),
            code: event.code,
          }),
        );
        this.addEventListener("message", (event) => {
          const value = JSON.parse(event.data);
          qa.socketEvents.push({
            type: value.type,
            at: clock(),
            seq: value.seq,
            success: value.success,
          });
        });
      }
    };
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.goto(`${vite.resolvedUrls.local[0]}#/groups/${groupId}`);
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByText("实时同步中", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "消息时间线", exact: true })
    .waitFor();
  await pause(250);
  for (
    let count = 0;
    count < 4 && (await page.locator("[data-message-id]").count()) < 160;
    count++
  ) {
    const earlier = page.getByRole("button", { name: "加载更早", exact: true });
    if (await earlier.isVisible()) await earlier.click();
    await pause(150);
  }
  await page.waitForFunction(
    () => document.querySelectorAll("[data-message-id]").length === 160,
  );
  await page.getByText("160 条已加载", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("switch", { name: "允许自动移除成员", exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await pause(200);
  const clockStart = now();
  const browserClock = await page.evaluate(
    () => performance.timeOrigin + performance.now(),
  );
  const clockEnd = now();
  report.clockCalibration = {
    nodeBefore: clockStart,
    browser: browserClock,
    nodeAfter: clockEnd,
    maxOffsetBoundMs: Math.max(
      Math.abs(browserClock - clockStart),
      Math.abs(clockEnd - browserClock),
    ),
  };
  const initialRows = await page.locator("[data-message-id]").count();
  report.initial = { domRows: initialRows, navigations, wsAuthenticated: true };
  const navigationBaseline = navigations;
  controls.outage = true;
  report.outageStartedAt = now();
  for (const socket of app.websocketServer.clients)
    socket.close(1012, "Isolated B4 outage");
  await page
    .getByText("连接恢复中", { exact: true })
    .waitFor({ timeout: 5000 });
  await pause(650);
  const newest = await publish("offline-new-1", "断线新消息 1", 161);
  await publish("offline-new-2", "断线新消息 2", 162);
  await publish("offline-new-3", "断线新消息 3", 163);
  await publish("late-history-oldest", "晚到历史：早于所有可见消息", -30);
  await publish("late-history-middle", "晚到历史：插入中间同时间排序", 75);
  await ingestion.process(newest); // Same gateway event id replay.
  await ingestion.process({ ...newest, eventId: ++eventId }); // Same msgId in a new event.
  const changed = await app.inject({
    method: "PATCH",
    url: `/api/groups/${groupId}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-core-qa-internal": "true",
    },
    payload: { autoKickEnabled: true },
  });
  assert.equal(changed.statusCode, 200);
  const expected = (
    await db.query(
      "SELECT id,msg_id,text,sender_platform_user_id,is_own,sent_at FROM messages WHERE group_id=$1 ORDER BY sent_at,id",
      [groupId],
    )
  ).rows
    .map((row) => ({
      id: row.id,
      msgId: row.msg_id,
      text: row.text,
      sender: row.sender_platform_user_id,
      own: row.is_own,
      sentAt: row.sent_at.toISOString(),
    }))
    .sort(
      (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
    );
  assert.equal(expected.length, 165);
  report.fixture = {
    initialMessages: 160,
    offlineNewMessages: 3,
    historicalBackfills: 2,
    gatewayDuplicateDeliveries: 2,
    oldWsReplayCopies: 6,
    expectedRows: expected.length,
    expected,
  };
  await page.evaluate((expected) => {
    const qa = window.__coreQA;
    const clock = () => performance.timeOrigin + performance.now();
    const inspect = () => {
      const rows = [...document.querySelectorAll("[data-message-id]")];
      const actual = rows.map((row) => ({
        id: row.dataset.messageId,
        msgId: row.querySelector(".message-id")?.getAttribute("title"),
        text: row.querySelector(".message-bubble")?.textContent,
        sender: row.querySelector(".message-meta strong")?.textContent,
        own: row.classList.contains("own"),
        sentAt: row.querySelector("time")?.getAttribute("datetime"),
      }));
      const switchElement = document.querySelector(
        '[role="switch"][aria-label="允许自动移除成员"]',
      );
      const matches = JSON.stringify(actual) === JSON.stringify(expected);
      const allLaidOut = rows.every(
        (row) =>
          row.getBoundingClientRect().height > 0 &&
          getComputedStyle(row).visibility === "visible",
      );
      const stateMatches =
        switchElement?.getAttribute("aria-checked") === "true";
      const syncFinished = document
        .querySelector(".timeline .panel-header")
        ?.textContent.includes(`${expected.length} 条已加载`);
      const live = document.body.textContent.includes("实时同步中");
      return { matches, allLaidOut, stateMatches, syncFinished, live, actual };
    };
    qa.inspect = inspect;
    let pending = false;
    const check = () => {
      if (qa.complete || pending) return;
      const result = inspect();
      if (
        !result.matches ||
        !result.allLaidOut ||
        !result.stateMatches ||
        !result.syncFinished ||
        !result.live
      )
        return;
      const matchedAt = clock();
      pending = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          pending = false;
          const confirmed = inspect();
          if (
            confirmed.matches &&
            confirmed.allLaidOut &&
            confirmed.stateMatches &&
            confirmed.syncFinished &&
            confirmed.live
          ) {
            qa.complete = { matchedAt, domReadyAt: clock(), ...confirmed };
          } else check();
        }),
      );
    };
    qa.observer = new MutationObserver(check);
    qa.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    check();
  }, expected);
  // No browser refresh, navigation, click, focus/online event, or manual retry
  // after this point. Reconnection and the failed REST read recover themselves.
  controls.failTimelineOnce = true;
  controls.replayOnNextAuth = true;
  report.transportAvailableAt = now();
  controls.outage = false;
  await page.waitForFunction(
    () => Boolean(window.__coreQA.complete),
    undefined,
    { timeout: 10_000 },
  );
  report.browser = await page.evaluate(() => ({
    socketEvents: window.__coreQA.socketEvents,
    complete: window.__coreQA.complete,
  }));
  report.navigationsDuringRecovery = navigations - navigationBaseline;
  const auth = report.browser.socketEvents.find(
    (event) =>
      event.at >= report.transportAvailableAt &&
      event.type === "auth" &&
      event.success,
  );
  assert(auth, "Restored real WS must authenticate");
  report.timingResult = {
    transportAvailableAt: report.transportAvailableAt,
    wsAuthenticatedAt: auth.at,
    domMatchedAt: report.browser.complete.matchedAt,
    domReadyAt: report.browser.complete.domReadyAt,
    availabilityToAuthMs: auth.at - report.transportAvailableAt,
    authToDomMs: report.browser.complete.domReadyAt - auth.at,
    availabilityToDomMs:
      report.browser.complete.domReadyAt - report.transportAvailableAt,
  };
  const recoveryReads = report.requests.filter(
    (entry) =>
      entry.startedAt >= report.transportAvailableAt &&
      entry.url.includes("/messages"),
  );
  report.recoveryReads = recoveryReads;
  assert.equal(
    recoveryReads.filter((entry) => entry.fault === "one-restored-timeline-503")
      .length,
    1,
  );
  const snapshots = new Map();
  for (const entry of recoveryReads.filter((entry) => entry.status === 200)) {
    const pages = snapshots.get(entry.snapshotId) ?? [];
    pages.push(entry.itemCount);
    snapshots.set(entry.snapshotId, pages);
  }
  report.recoverySnapshots = [...snapshots].map(([id, pages]) => ({
    id,
    pages,
  }));
  assert(
    report.recoverySnapshots.some(
      (snapshot) =>
        snapshot.pages.length >= 4 &&
        snapshot.pages.reduce((a, b) => a + b, 0) === expected.length,
    ),
    "Real REST must fetch a complete >=4-page snapshot",
  );
  assert.equal(report.navigationsDuringRecovery, 0);
  assert(report.sockets.some((socket) => socket.injectedOldFrames === 6));
  assert.equal(
    new Set(report.browser.complete.actual.map((row) => row.id)).size,
    expected.length,
  );
  assert.deepEqual(report.browser.complete.actual, expected);
  // Observe stability after duplicate/history replay, without initiating reads.
  await pause(700);
  report.stableAfterReplay = await page.evaluate(() =>
    window.__coreQA.inspect(),
  );
  assert.deepEqual(report.stableAfterReplay.actual, expected);
  assert.deepEqual(report.pageErrors, []);
  await page.screenshot({ path: `${output}.png`, fullPage: true });
  report.screenshot = `${output}.png`;
  // Conservatively include the measured clock-offset bound in the fixed limit.
  assert(
    report.timingResult.availabilityToDomMs +
      report.clockCalibration.maxOffsetBoundMs <=
      3000,
    `B4 DOM exceeded 3000ms: ${report.timingResult.availabilityToDomMs}ms (+ clock bound ${report.clockCalibration.maxOffsetBoundMs}ms)`,
  );
  report.results.push({
    name: "165 exact ordered DOM rows, group state, >=4 pages, duplicate/history replay and one GET503 recover without user action within 3000ms",
    passed: true,
  });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = { message: error.message, stack: error.stack };
  if (page) {
    try {
      report.failureBrowser = await page.evaluate(() => ({
        socketEvents: window.__coreQA?.socketEvents,
        complete: window.__coreQA?.complete,
        current: window.__coreQA?.inspect?.(),
        body: document.body.innerText,
      }));
    } catch {}
    try {
      await page.screenshot({ path: `${output}-failure.png`, fullPage: true });
      report.screenshot = `${output}-failure.png`;
    } catch {}
  }
  console.error(error);
} finally {
  try {
    await cleanup?.();
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
        output: `${output}.json`,
        timing: report.timingResult,
        failure: report.failure?.message,
        cleanupErrors: report.cleanupErrors,
      },
      null,
      2,
    ),
  );
}
if (!report.passed) process.exitCode = 1;
