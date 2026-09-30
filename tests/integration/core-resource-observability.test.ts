import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test, type TestContext } from "node:test";
import { WebSocket } from "ws";
import type { Socket } from "node:net";
import type { QueryResult, QueryResultRow } from "pg";
import { createApp, type AppOptions } from "../../apps/server/src/app.js";
import { boundedSocketSender } from "../../apps/server/src/core/socket-sender.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import type { Message } from "../../packages/contracts/src/index.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>, timeout = 4000) {
  const deadline = performance.now() + timeout;
  do {
    if (await check()) return;
    await delay(10);
  } while (performance.now() < deadline);
  throw new Error("Condition did not become true");
}

class SlowSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  frames: string[] = [];
  closed: { code: number; reason: string } | undefined;
  terminated = 0;
  send(value: string) {
    this.frames.push(value);
    this.bufferedAmount += Buffer.byteLength(value);
  }
  close(code: number, reason: string) {
    this.readyState = 2;
    this.closed = { code, reason };
  }
  terminate() {
    this.terminated++;
    this.readyState = 3;
    this.emit("close");
  }
}

test("slow socket: an in-flight oversized frame cannot authorize further buffers, and stalled close is terminated", async () => {
  const socket = new SlowSocket();
  const sender = boundedSocketSender(socket as unknown as WebSocket, {
    maxBufferedBytes: 100,
    sendTimeoutMs: 200,
    closeGraceMs: 20,
  });
  const first = sender.send({ text: "x".repeat(200) });
  await Promise.resolve();
  assert.equal(socket.frames.length, 1);
  const next = sender.send({ text: "more" });
  await delay(220);
  assert.equal(await next, false);
  assert.equal(await first, false);
  assert.equal(socket.closed?.code, 1013);
  assert.equal(await sender.send({ text: "even later" }), false);
  await until(() => socket.terminated === 1);
  assert.equal(socket.frames.length, 1);
  await delay(220);
  assert.equal(
    socket.terminated,
    1,
    "send timeout and close fallback must be cleared after closure",
  );
});

test("slow socket: callback starvation closes even below the buffer watermark; ordinary close cancels the fallback", async () => {
  const socket = new SlowSocket();
  const sender = boundedSocketSender(socket as unknown as WebSocket, {
    maxBufferedBytes: 1000,
    sendTimeoutMs: 20,
    closeGraceMs: 100,
  });
  const waiting = sender.send({ text: "small" });
  await delay(30);
  assert.equal(await waiting, false);
  assert.equal(socket.closed?.code, 1013);
  socket.readyState = 3;
  socket.emit("close");
  await delay(130);
  assert.equal(socket.terminated, 0);
});

test("slow socket: a drained frame larger than the watermark still reaches an able consumer", async () => {
  const socket = new SlowSocket();
  socket.send = (value: string, ...args: unknown[]) => {
    socket.frames.push(value);
    (args[0] as (error?: Error) => void)();
  };
  const sender = boundedSocketSender(socket as unknown as WebSocket, {
    maxBufferedBytes: 10,
  });
  assert.equal(await sender.send({ text: "x".repeat(200) }), true);
  assert.equal(await sender.send({ text: "next" }), true);
  assert.equal(socket.closed, undefined);
  socket.emit("close");
});

test("slow socket: control replies wait for a permitted oversized frame instead of disconnecting it", async () => {
  const socket = new SlowSocket();
  let complete!: () => void;
  socket.send = (value: string, ...args: unknown[]) => {
    socket.frames.push(value);
    socket.bufferedAmount += Buffer.byteLength(value);
    complete = () => {
      socket.bufferedAmount = 0;
      (args[0] as (error?: Error) => void)();
    };
  };
  const sender = boundedSocketSender(socket as unknown as WebSocket, {
    maxBufferedBytes: 10,
  });
  const event = sender.send({ text: "x".repeat(200) });
  await Promise.resolve();
  const marker = sender.send({ type: "scope_ready" });
  await Promise.resolve();
  assert.equal(socket.frames.length, 1);
  assert.equal(socket.closed, undefined);
  complete();
  assert.equal(await event, true);
  await until(() => socket.frames.length === 2);
  complete();
  assert.equal(await marker, true);
  assert.equal(socket.closed, undefined);
  socket.emit("close");
});

test("slow socket: pending frame admission is bounded and all waiters finish when closed", async () => {
  const socket = new SlowSocket();
  const sender = boundedSocketSender(socket as unknown as WebSocket, {
    closeGraceMs: 10,
  });
  const first = sender.send({ text: "first" });
  await Promise.resolve();
  const second = sender.send({ text: "second" });
  const third = sender.send({ text: "third" });
  assert.equal(await sender.send({ text: "fourth" }), false);
  assert.deepEqual(await Promise.all([first, second, third]), [
    false,
    false,
    false,
  ]);
  await until(() => socket.terminated === 1);
  assert.equal(socket.frames.length, 1);
});

async function fixture(t: TestContext, options: Omit<AppOptions, "db"> = {}) {
  const temporary = await temporaryDatabase(t);
  t.diagnostic(
    `Independent database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await migrate(temporary.db);
  const app = await createApp({
    db: temporary.db,
    logger: false,
    background: false,
    ...options,
  });
  temporary.onCleanup(() => app.close());
  async function login(username: "admin" | "viewer") {
    const result = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: username },
    });
    assert.equal(result.statusCode, 200, result.body);
    return result.json<{ accessToken: string }>().accessToken;
  }
  const token = await login("admin");
  function get(url: string, accessToken = token) {
    return app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }
  return { ...temporary, app, token, login, get };
}

type Frame = { type: string; seq?: number; payload?: { n: number } };
async function openSocket(
  t: TestContext,
  address: string,
  token: string,
  sinceSeq = 0,
) {
  const socket = new WebSocket(address.replace("http:", "ws:") + "/ws");
  t.after(() => socket.terminate());
  const frames: Frame[] = [];
  socket.on("message", (raw) =>
    frames.push(JSON.parse(raw.toString()) as Frame),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "auth", accessToken: token, sinceSeq }));
  await until(() => frames.some((frame) => frame.type === "auth"));
  return { socket, frames };
}

test("realtime: a stopped TCP reader is disconnected without blocking a healthy peer; client cursor replays all remaining durable events", async (t) => {
  const f = await fixture(t, {
    realtime: {
      maxBufferedBytes: 128 * 1024,
      sendTimeoutMs: 1000,
      closeGraceMs: 50,
    },
  });
  const query = f.db.query.bind(f.db);
  let replayQueries = 0;
  f.db.query = async <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> => {
    if (sql.includes("SELECT seq,type,payload FROM events")) replayQueries++;
    return query<R>(sql, values);
  };
  const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const slow = await openSocket(t, address, f.token);
  const healthy = await openSocket(t, address, f.token);
  const serverSockets = [...f.app.websocketServer.clients];
  assert.equal(serverSockets.length, 2);
  const slowServer = serverSockets[0]!;
  const tcp = (slow.socket as unknown as { _socket: Socket })._socket;
  tcp.pause();
  const count = 80;
  await f.db.query(
    "INSERT INTO events(type,payload) SELECT 'resource-probe',jsonb_build_object('n',n,'text',repeat('x',65536)) FROM generate_series(1,$1::int) AS n",
    [count],
  );
  await until(() => slowServer.readyState === WebSocket.CLOSED, 5000);
  assert.equal(f.app.websocketServer.clients.has(slowServer), false);
  await until(
    () =>
      healthy.frames.filter((frame) => frame.seq !== undefined).length ===
      count,
  );
  const prefix = slow.frames.filter((frame) => frame.seq !== undefined);
  const lastReceived = prefix.at(-1)?.seq ?? 0;
  // The stopped peer did not read its buffered frames. Reconnect from what its
  // application actually observed, never from the server's attempted-send cursor.
  slow.socket.terminate();
  const resumed = await openSocket(t, address, f.token, lastReceived);
  await until(
    () =>
      resumed.frames.filter((frame) => frame.seq !== undefined).length ===
      count - prefix.length,
  );
  const complete = [
    ...prefix,
    ...resumed.frames.filter((frame) => frame.seq !== undefined),
  ];
  assert.deepEqual(
    complete.map((frame) => frame.payload?.n),
    Array.from({ length: count }, (_, n) => n + 1),
  );
  assert.equal(new Set(complete.map((frame) => frame.seq)).size, count);
  healthy.socket.terminate();
  resumed.socket.terminate();
  await until(() => f.app.websocketServer.clients.size === 0);
  // Allow already-admitted reads to settle, then prove that closed sockets do
  // not leave polling intervals that consume the shared database pool.
  await delay(50);
  const settledQueries = replayQueries;
  await delay(220);
  assert.equal(replayQueries, settledQueries);
  t.diagnostic(
    `Paused TCP reader removed; ${count} durable events reached healthy peer and reconnect in exact order`,
  );
});

test("realtime: marker bursts batch one database request at a time without dropping admitted scope replies or skipping durable replay", async (t) => {
  const f = await fixture(t);
  const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const connected = await openSocket(t, address, f.token);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.onCleanup(async () => release());
  const query = f.db.query.bind(f.db);
  let markerQueries = 0;
  let inFlight = 0;
  let maximum = 0;
  f.db.query = async <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> => {
    if (sql === "SELECT COALESCE(max(seq),0) AS seq FROM events") {
      markerQueries++;
      maximum = Math.max(maximum, ++inFlight);
      try {
        if (markerQueries === 1) await barrier;
        return await query<R>(sql, values);
      } finally {
        inFlight--;
      }
    }
    return query<R>(sql, values);
  };
  connected.socket.send(
    JSON.stringify({ type: "scope_marker", requestId: "scope-0" }),
  );
  await until(() => markerQueries === 1);
  for (let n = 1; n <= 100; n++)
    connected.socket.send(
      JSON.stringify({ type: "scope_marker", requestId: `scope-${n}` }),
    );
  await delay(50);
  assert.equal(markerQueries, 1);
  await f.db.query(
    "INSERT INTO events(type,payload) VALUES('resource-probe','{}')",
  );
  release();
  await until(() =>
    connected.frames.some(
      (frame) =>
        (frame as Frame & { requestId?: string }).requestId === "scope-100",
    ),
  );
  await until(() =>
    connected.frames.some((frame) => frame.type === "resource-probe"),
  );
  assert.equal(maximum, 1);
  assert.equal(markerQueries, 2);
  const markers = connected.frames.filter(
    (frame) => frame.type === "scope_ready",
  );
  assert.equal(markers.length, 101);
  assert.equal(
    new Set(
      markers.map(
        (frame) => (frame as Frame & { requestId: string }).requestId,
      ),
    ).size,
    101,
  );
  assert.ok(markers.every((frame) => frame.seq === undefined));
});

test("realtime: overflowing pending marker capacity closes without launching unbounded database work", async (t) => {
  const f = await fixture(t, { realtime: { closeGraceMs: 50 } });
  const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const connected = await openSocket(t, address, f.token);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.onCleanup(async () => release());
  const query = f.db.query.bind(f.db);
  let markerQueries = 0;
  f.db.query = async <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> => {
    if (sql === "SELECT COALESCE(max(seq),0) AS seq FROM events") {
      markerQueries++;
      await barrier;
    }
    return query<R>(sql, values);
  };
  let closeCode: number | undefined;
  connected.socket.on("close", (code) => {
    closeCode = code;
  });
  connected.socket.send(
    JSON.stringify({ type: "scope_marker", requestId: "active" }),
  );
  await until(() => markerQueries === 1);
  for (let n = 0; n < 150; n++)
    connected.socket.send(
      JSON.stringify({ type: "scope_marker", requestId: `pending-${n}` }),
    );
  await until(() => closeCode !== undefined);
  assert.equal(closeCode, 1013);
  assert.equal(markerQueries, 1);
  release();
  await delay(150);
  assert.equal(markerQueries, 1);
  assert.equal(
    connected.frames.some((frame) => frame.type === "scope_ready"),
    false,
  );
});

test("timeline: continuation transfers only its slice and preserves old frozen cursors across writes, page sizes and large offsets", async (t) => {
  const f = await fixture(t, { modules: (ctx) => [createGatewayModule(ctx)] });
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1'),('other','remote-other','account-2')",
  );
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) SELECT 'm-'||lpad(n::text,3,'0'),'g','r-'||n,'external',false,repeat('text',2500),'2020-01-01'::timestamptz+n*interval '1 second' FROM generate_series(1,123) AS n",
  );
  type Page = {
    items: Message[];
    nextCursor: string | null;
    snapshotId: string;
  };
  const firstResponse = await f.get("/api/groups/g/messages?limit=7");
  assert.equal(firstResponse.statusCode, 200, firstResponse.body);
  const first = firstResponse.json<Page>();
  const snapshot = (
    await f.db.query<{ items: Message[] }>(
      "SELECT items FROM timeline_snapshots WHERE id=$1",
      [first.snapshotId],
    )
  ).rows[0]!.items;
  await f.db.query(
    "UPDATE messages SET text='new content',sent_at='2040-01-01' WHERE id='m-001'",
  );
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES('late','g','late','external',false,'late')",
  );
  const query = f.db.query.bind(f.db);
  const transfer: { rows: number; bytes: number; total: number }[] = [];
  f.db.query = async <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> => {
    const result = await query<R>(sql, values);
    if (sql.includes("FROM timeline_snapshots")) {
      const row = result.rows[0] as
        { items: unknown[]; total: number } | undefined;
      if (row)
        transfer.push({
          rows: row.items.length,
          bytes: Buffer.byteLength(JSON.stringify(row)),
          total: row.total,
        });
    }
    return result;
  };
  const pages = [...first.items];
  let next = first.nextCursor;
  while (next) {
    const response = await f.get(
      `/api/groups/g/messages?limit=9&before=${next}`,
    );
    assert.equal(response.statusCode, 200, response.body);
    const page = response.json<Page>();
    assert.equal(page.snapshotId, first.snapshotId);
    pages.push(...page.items);
    next = page.nextCursor;
  }
  assert.deepEqual(
    pages,
    snapshot,
    "frozen identity, order and field values must match the original snapshot",
  );
  assert.ok(transfer.every((page) => page.rows <= 9 && page.total === 123));
  const fullBytes = Buffer.byteLength(JSON.stringify(snapshot));
  assert.ok(transfer.every((page) => page.bytes < fullBytes / 10));
  const beyond = Buffer.from(
    JSON.stringify({
      snapshotId: first.snapshotId,
      offset: Number.MAX_SAFE_INTEGER,
    }),
  ).toString("base64url");
  const empty = await f.get(`/api/groups/g/messages?before=${beyond}`);
  assert.equal(empty.statusCode, 200, empty.body);
  assert.deepEqual(empty.json<Page>().items, []);
  assert.equal(empty.json<Page>().nextCursor, null);
  assert.equal(
    (await f.get(`/api/groups/other/messages?before=${first.nextCursor}`))
      .statusCode,
    400,
  );
  assert.equal(
    (await f.get("/api/groups/g/messages?before=not-a-cursor")).statusCode,
    400,
  );
  t.diagnostic(
    `Frozen snapshot ${fullBytes} bytes; continuation database transfer maximum ${Math.max(...transfer.map((page) => page.bytes))} bytes for at most 9 items`,
  );
});

test("diagnostics: only admin sees disabled process-local scheduler data; public health stays unchanged", async (t) => {
  const f = await fixture(t, { modules: (ctx) => [createGatewayModule(ctx)] });
  const viewer = await f.login("viewer");
  assert.equal(
    (await f.app.inject("/api/diagnostics/background")).statusCode,
    401,
  );
  assert.equal(
    (await f.get("/api/diagnostics/background", viewer)).statusCode,
    403,
  );
  const result = await f.get("/api/diagnostics/background");
  assert.equal(result.statusCode, 200, result.body);
  const body = result.json();
  assert.equal(body.scope, "process");
  assert.equal(body.backgroundEnabled, false);
  assert.equal(body.semantics, "scheduler-ticks-not-business-completion");
  assert.equal(body.modules[0].name, "gateway");
  assert.equal(body.modules[0].status, "disabled");
  assert.equal(body.modules[0].recovery, "not_started");
  assert.equal(body.modules[0].lastSucceededAt, null);
  assert.equal(body.modules[0].ticks, 0);
  const health = (await f.app.inject("/api/health")).json();
  assert.deepEqual(Object.keys(health).sort(), ["ok", "schemaVersion"]);
  assert.equal(health.ok, true);
});

test("diagnostics: failures, hung ticks and later recovery are distinguishable without leaking error bodies or claiming business completion", async (t) => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let tick = 0;
  const f = await fixture(t, {
    background: true,
    modules: () => [
      {
        async register() {},
        async tick() {
          tick++;
          if (tick === 1)
            throw new Error("secret payload credentials@example.invalid");
          if (tick === 2) await barrier;
        },
      },
    ],
  });
  f.onCleanup(async () => release());
  const current = async () =>
    (await f.get("/api/diagnostics/background")).json().modules[0];
  await until(async () => (await current()).status === "failed");
  const failure = await current();
  assert.equal(failure.consecutiveFailures, 1);
  assert.equal(failure.successfulTicks, 0);
  assert.ok(failure.lastFailedAt);
  assert.equal(failure.recovery, "succeeded");
  await until(async () => (await current()).status === "running");
  await delay(130);
  const hanging = await current();
  assert.equal(
    hanging.ticks,
    2,
    "an in-flight tick cannot launch another concurrent tick",
  );
  assert.ok(hanging.runningForMs >= 100);
  assert.equal((await f.app.inject("/api/health")).json().ok, true);
  assert.equal(JSON.stringify(hanging).includes("credentials"), false);
  release();
  await until(async () => (await current()).successfulTicks >= 1);
  const recovered = await current();
  assert.equal(recovered.consecutiveFailures, 0);
  assert.ok(recovered.lastSucceededAt);
  assert.ok(
    recovered.lastFailedAt,
    "latest failure is retained after scheduler recovery",
  );
});
