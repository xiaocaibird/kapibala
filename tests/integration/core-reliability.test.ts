import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test, type TestContext } from "node:test";
import pg from "pg";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { RemoteError } from "../../apps/server/src/core/errors.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://kapibala:kapibala@localhost:55432/kapibala";
async function resources(t: TestContext) {
  const db = new Database(databaseUrl);
  const observer = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await db.close();
    await observer.end();
  });
  return { db, observer };
}
async function listen(t: TestContext, server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

test("checked-out advisory connection loss rejects safely, fences subsequent DB work, and releases capacity", async (t) => {
  const { db, observer } = await resources(t);
  let continued = false;
  await assert.rejects(
    db.withLock("review:checked-out", async (client, signal) => {
      const pid = (
        await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      await observer.query("SELECT pg_terminate_backend($1)", [pid]);
      await waitForAbort(signal);
      await db.query("SELECT 1");
      continued = true;
    }),
    /terminating connection|connection.*terminated/i,
  );
  assert.equal(continued, false);
  assert.equal(
    await db.withLock("review:checked-out", () =>
      db.transaction(async (tx) => {
        await tx.query("SELECT 1");
        return "recovered";
      }),
    ),
    "recovered",
  );
});

test("advisory lock loss aborts an in-flight HTTP request and blocks later remote calls", async (t) => {
  const { db, observer } = await resources(t);
  let requestStarted!: () => void;
  const requestSeen = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let count = 0;
  const server = createServer((_request, response) => {
    count++;
    response.writeHead(200, { "content-type": "application/json" });
    if (count > 1) response.end('{"ok":true}');
    else {
      response.write(" ");
      requestStarted();
    }
  });
  const remote = new RemoteClient(await listen(t, server));
  let pid = 0;
  let laterCallReached = false;
  const operation = db.withLock("review:http", async (client) => {
    pid = (
      await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    try {
      await remote.request("/slow", {}, 10000);
    } catch {
      await remote.request("/must-not-run", {});
      laterCallReached = true;
    }
  });
  const rejected = assert.rejects(
    operation,
    /terminating connection|connection.*terminated|abort/i,
  );
  await requestSeen;
  const started = performance.now();
  await observer.query("SELECT pg_terminate_backend($1)", [pid]);
  await rejected;
  assert.ok(performance.now() - started < 2000);
  assert.equal(laterCallReached, false);
  assert.equal(count, 1);
  assert.deepEqual(await remote.request("/outside-failed-scope"), { ok: true });
});

test("transaction client loss during HTTP wait aborts safely and does not poison later transactions", async (t) => {
  const { db, observer } = await resources(t);
  let requestStarted!: () => void;
  const requestSeen = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  const remote = new RemoteClient(
    await listen(
      t,
      createServer((_request, response) => {
        response.writeHead(200);
        response.write(" ");
        requestStarted();
      }),
    ),
  );
  let pid = 0;
  const operation = db.transaction(async (tx) => {
    pid = (await tx.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
      .rows[0]!.pid;
    await remote.request("/slow", {}, 10000);
  });
  const rejected = assert.rejects(
    operation,
    /terminating connection|connection.*terminated|abort/i,
  );
  await requestSeen;
  await observer.query("SELECT pg_terminate_backend($1)", [pid]);
  await rejected;
  assert.equal(
    await db.transaction(
      async (tx) => (await tx.query<{ n: number }>("SELECT 7 AS n")).rows[0]!.n,
    ),
    7,
  );
});

test("cleanup on a disconnected advisory connection preserves the callback error", async (t) => {
  const { db, observer } = await resources(t);
  const intended = new Error("original callback failure");
  await assert.rejects(
    db.withLock("review:original-error", async (client, signal) => {
      const pid = (
        await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      await observer.query("SELECT pg_terminate_backend($1)", [pid]);
      await waitForAbort(signal);
      throw intended;
    }),
    (error) => error === intended,
  );
});

test("RemoteClient preserves HTTP errors for null, primitive, malformed nested envelopes and valid arrays", async (t) => {
  const responses = [
    "null",
    "5",
    '"unavailable"',
    "[]",
    '{"error":null}',
    '{"code":{},"error":{"code":"SERVICE_UNAVAILABLE"}}',
  ];
  const remote = new RemoteClient(
    await listen(
      t,
      createServer((request, response) => {
        if (request.url === "/members") {
          response.writeHead(200);
          response.end('[{"platformUserId":"external"}]');
          return;
        }
        response.writeHead(503, { "content-type": "application/json" });
        response.end(responses.shift());
      }),
    ),
  );
  for (let i = 0; i < 6; i++)
    await assert.rejects(
      remote.request("/error"),
      (error) =>
        error instanceof RemoteError &&
        error.status === 503 &&
        error.code === (i === 5 ? "SERVICE_UNAVAILABLE" : "HTTP_503"),
    );
  assert.deepEqual(await remote.request("/members"), [
    { platformUserId: "external" },
  ]);
});
