import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyReply } from "fastify";
import type { QueryResultRow } from "pg";
import { createApp } from "../../apps/server/src/app.js";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import {
  loadMigrations,
  migrate,
} from "../../apps/server/src/core/migrations.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import {
  Messages,
  recordSent,
} from "../../apps/server/src/modules/gateway/messages.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { AgentModule } from "../../apps/server/src/modules/automation/agent.js";
import {
  MediaFiles,
  mediaOptions,
  referenceMedia,
  trustedMediaUrl,
} from "../../apps/server/src/modules/media-files/index.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import type { Queryable } from "../../apps/server/src/core/db.js";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, message: string) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await check()) return;
    await pause(10);
  }
  throw new Error(message);
}
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function fixture(
  t: TestContext,
  options: Partial<ReturnType<typeof mediaOptions>> = {},
) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  const directory = await mkdtemp(join(tmpdir(), "kapibala-media-"));
  temporary.onCleanup(() => rm(directory, { recursive: true, force: true }));
  t.diagnostic(
    `database=${new URL(temporary.url).pathname.slice(1)} files=${directory}`,
  );
  await migrate(db);
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
  );
  const remote = Fastify({ logger: false });
  temporary.onCleanup(() => remote.close());
  const calls: string[] = [];
  const handlers = new Map<string, (reply: FastifyReply) => unknown>();
  const turns = {
    call: async (_body: unknown): Promise<unknown> => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "done" }],
    }),
  };
  remote.get<{ Params: { id: string } }>(
    "/media/:id",
    async (request, reply) => {
      calls.push(request.params.id);
      return (
        handlers.get(request.params.id)?.(reply) ??
        reply
          .type("application/octet-stream")
          .send(Buffer.from("attachment bytes"))
      );
    },
  );
  remote.post("/agent/turn", (request) => turns.call(request.body));
  const url = await remote.listen({ host: "127.0.0.1", port: 0 });
  const ctx: AppContext = {
    db,
    log: remote.log,
    gateway: new RemoteClient(url),
    agent: new RemoteClient(url),
  };
  const settings = { ...mediaOptions(), directory, ...options };
  const worker = new MediaFiles(ctx, settings);
  temporary.onCleanup(async () => worker.close());
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  let eventId = 1;
  async function inbound(msgId: string, mediaUrl?: string, own = false) {
    if (own)
      await db.query(
        "UPDATE accounts SET platform_user_id='own' WHERE id='account-1'",
      );
    await events.process({
      eventId: eventId++,
      type: "message",
      groupId: "remote-g",
      msgId,
      senderPlatformUserId: own ? "own" : "outside",
      text: `text-${msgId}`,
      sentAt: new Date().toISOString(),
      ...(mediaUrl === undefined ? {} : { mediaUrl }),
    });
  }
  const row = async (msgId: string) =>
    (await db.query("SELECT * FROM media_files WHERE msg_id=$1", [msgId]))
      .rows[0]!;
  const expire = () =>
    db.query(
      "UPDATE media_files SET downloaded_at=now()-interval '31 days' WHERE state='ready'",
    );
  async function api() {
    const app = await createApp({
      db,
      background: false,
      logger: false,
      modules: (context) => [createGatewayModule(context)],
    });
    temporary.onCleanup(() => app.close());
    const auth = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "admin" },
    });
    const token = auth.json<{ accessToken: string }>().accessToken;
    return { app, headers: { authorization: `Bearer ${token}` } };
  }
  return {
    temporary,
    db,
    directory,
    ctx,
    worker,
    settings,
    inbound,
    row,
    expire,
    calls,
    handlers,
    turns,
    api,
    url,
    messages,
  };
}

test("C1 validates gateway media URLs and the default retention", () => {
  assert.equal(mediaOptions().retentionDays, 30);
  assert.equal(
    trustedMediaUrl("/media/file-1", "http://127.0.0.1:3101").href,
    "http://127.0.0.1:3101/media/file-1",
  );
  for (const source of [
    "https://evil.invalid/media/a",
    "//evil.invalid/media/a",
    "file:///media/a",
    "/media/../private",
    "/media/%2fprivate",
    "/media/%5cprivate",
    "/media/x?q=1",
    "/media/x#f",
    "http://user:pass@127.0.0.1:3101/media/x",
    "/private",
    " /media/a",
    "",
  ]) {
    assert.throws(
      () => trustedMediaUrl(source, "http://127.0.0.1:3101"),
      /UNTRUSTED_MEDIA_URL/,
      source,
    );
  }
});

test("C1 upgrade queues legacy attachments and preserves references of existing running sessions", async (t) => {
  const temporary = await temporaryDatabase(t);
  const directory = await mkdtemp(join(tmpdir(), "kapibala-media-migrations-"));
  temporary.onCleanup(() => rm(directory, { recursive: true, force: true }));
  t.diagnostic(
    `database=${new URL(temporary.url).pathname.slice(1)} files=${directory}`,
  );
  for (const migration of (await loadMigrations()).filter(
    (item) => item.version < 9,
  ))
    await writeFile(join(directory, migration.name), migration.sql);
  await migrate(temporary.db, pathToFileURL(directory + "/"));
  await temporary.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
  );
  await temporary.db.query(
    "INSERT INTO messages(id,group_id,msg_id,is_own,text,metadata) VALUES('legacy','g','legacy',false,'text','{\"mediaUrl\":\"/media/legacy\"}')",
  );
  await temporary.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('running','g'); INSERT INTO agent_runs(id,group_id,status,end_reason) VALUES('terminal','g','finished','final')",
  );
  await migrate(temporary.db);
  await migrate(temporary.db);
  assert.deepEqual(
    (
      await temporary.db.query(
        "SELECT msg_id,state,local_file_path FROM media_files",
      )
    ).rows,
    [{ msg_id: "legacy", state: "pending", local_file_path: null }],
  );
  assert.deepEqual(
    (await temporary.db.query("SELECT run_id FROM agent_media_references"))
      .rows,
    [{ run_id: "running" }],
  );
});

test("C1 downloads once across duplicate events/workers and keeps message text", async (t) => {
  const f = await fixture(t);
  await f.inbound("attachment", "/media/ok");
  await f.inbound("attachment", "/media/ok");
  const other = new MediaFiles(f.ctx, f.settings);
  await Promise.all([f.worker.tick(), other.tick()]);
  const media = await f.row("attachment");
  assert.equal(media.state, "ready");
  assert.equal(
    await readFile(media.local_file_path, "utf8"),
    "attachment bytes",
  );
  assert.deepEqual(f.calls, ["ok"]);
  const message = (
    await f.db.query("SELECT * FROM messages WHERE msg_id='attachment'")
  ).rows[0]!;
  assert.equal(message.local_file_path, media.local_file_path);
  assert.equal(message.text, "text-attachment");
  assert.equal(
    (await f.db.query("SELECT count(*) FROM media_files")).rows[0]!.count,
    "1",
  );
  assert.deepEqual(await readdir(f.directory), [`media-${media.id}.bin`]);
});

test("C1 transient failure retries later; expired URL, redirect, and oversized body remain unavailable", async (t) => {
  const f = await fixture(t, { maxBytes: 32 });
  let transient = true;
  f.handlers.set("retry", (reply) =>
    transient ? reply.code(503).send() : reply.send("recovered"),
  );
  await f.inbound("retry", "/media/retry");
  await f.worker.tick();
  assert.equal((await f.row("retry")).state, "pending");
  await f.worker.tick();
  assert.equal(
    f.calls.length,
    1,
    "backoff does not spin on every scheduler tick",
  );
  transient = false;
  await f.db.query(
    "UPDATE media_files SET next_attempt_at=now() WHERE msg_id='retry'",
  );
  await f.worker.tick();
  assert.equal(
    await readFile((await f.row("retry")).local_file_path, "utf8"),
    "recovered",
  );
  f.handlers.set("gone", (reply) => reply.code(404).send());
  f.handlers.set("redirect", (reply) => reply.redirect("/media/destination"));
  f.handlers.set("large", (reply) =>
    reply.send(Readable.from([Buffer.alloc(20), Buffer.alloc(20)])),
  );
  for (const id of ["gone", "redirect", "large"]) {
    await f.inbound(id, `/media/${id}`);
    await f.worker.tick();
    assert.equal((await f.row(id)).state, "unavailable", id);
    assert.equal((await f.row(id)).local_file_path, null);
  }
  await f.inbound("unsafe", "https://evil.invalid/media/x");
  await f.worker.tick();
  assert.equal((await f.row("unsafe")).last_error, "UNTRUSTED_MEDIA_URL");
  assert.equal(f.calls.includes("destination"), false);
  assert.equal(
    (await readdir(f.directory)).length,
    1,
    "partial failed downloads removed",
  );
});

test("C1 timeout leaves no pointer and a replacement worker retries the interrupted body", async (t) => {
  const f = await fixture(t, { timeoutMs: 30 });
  f.handlers.set("slow", (reply) =>
    reply.send(
      Readable.from(
        (async function* () {
          yield Buffer.from("part");
          await pause(100);
          yield Buffer.from("end");
        })(),
      ),
    ),
  );
  await f.inbound("slow", "/media/slow");
  await f.worker.tick();
  assert.equal((await f.row("slow")).state, "pending");
  assert.deepEqual(await readdir(f.directory), []);
  assert.equal((await f.row("slow")).local_file_path, null);
  f.handlers.delete("slow");
  await f.db.query("UPDATE media_files SET next_attempt_at=now()");
  await new MediaFiles(f.ctx, { ...f.settings, timeoutMs: 1000 }).tick();
  assert.equal((await f.row("slow")).state, "ready");
});

test("C1 a local file-open failure closes the unconsumed HTTP response before its timeout", async (t) => {
  const f = await fixture(t, { timeoutMs: 15000 });
  const release = barrier();
  f.temporary.onCleanup(async () => release.release());
  let closed = false;
  f.handlers.set("blocked-open", (reply) => {
    reply.raw.on("close", () => {
      closed = true;
    });
    return reply.send(
      Readable.from(
        (async function* () {
          yield Buffer.from("initial bytes");
          await release.promise;
        })(),
      ),
    );
  });
  await f.inbound("blocked-open", "/media/blocked-open");
  const original = f.db.query.bind(f.db);
  f.db.query = async <R extends QueryResultRow = QueryResultRow>(
    query: string,
    values?: unknown[],
  ) => {
    const result = await original<R>(query, values);
    if (query.startsWith("UPDATE media_files SET state='downloading'"))
      await mkdir(join(f.directory, values![2] as string));
    return result;
  };
  // The obstructing directory makes both open(O_EXCL) and unlink fail; the
  // response must still close in the worker's finally block.
  await assert.rejects(f.worker.tick());
  await until(
    async () => closed,
    "HTTP response stayed open after the local failure",
  );
  assert.equal((await f.row("blocked-open")).local_file_path, null);
  release.release();
});

test("C1 own-message reconciliation preserves media attached before its acknowledgement", async (t) => {
  const f = await fixture(t);
  await f.inbound("own-message", "/media/ok", true);
  await f.worker.tick();
  const path = (await f.row("own-message")).local_file_path;
  await f.db.query(
    "INSERT INTO messages(id,group_id,client_msg_id,is_own,text,delivery_status) VALUES('outbox','g','client',true,'text-own-message','accepted')",
  );
  await f.db.transaction((tx) =>
    recordSent(tx, "client", "own-message", new Date().toISOString()),
  );
  const rows = (await f.db.query("SELECT id,local_file_path FROM messages"))
    .rows;
  assert.deepEqual(rows, [{ id: "outbox", local_file_path: path }]);
});

test("C1 own-message acknowledgement and expiry cannot restore a deleted file pointer", async (t) => {
  const f = await fixture(t);
  await f.inbound("own-race", "/media/ok", true);
  await f.worker.tick();
  await f.expire();
  await f.db.query(
    "INSERT INTO messages(id,group_id,client_msg_id,is_own,text,delivery_status) VALUES('outbox','g','client',true,'text-own-race','accepted')",
  );
  const deletedEcho = barrier(),
    release = barrier();
  const acknowledgement = f.db.transaction(async (tx) => {
    const observed: Queryable = {
      query: async (query, values) => {
        const result = await tx.query(query, values);
        if (query.startsWith("DELETE FROM messages WHERE group_id=")) {
          deletedEcho.release();
          await release.promise;
        }
        return result;
      },
    };
    await recordSent(observed, "client", "own-race", new Date().toISOString());
  });
  await deletedEcho.promise;
  const cleanup = f.worker.cleanupExpired();
  await until(
    async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
          )
        ).rowCount,
      ),
    "cleanup did not contend with the acknowledgement",
  );
  release.release();
  await Promise.all([acknowledgement, cleanup]);
  assert.equal((await f.row("own-race")).state, "deleted");
  assert.deepEqual(
    (await f.db.query("SELECT id,local_file_path FROM messages")).rows,
    [{ id: "outbox", local_file_path: null }],
  );
  assert.deepEqual(await readdir(f.directory), []);
});

test("C1 configured retention preserves younger files and rejects a changed storage root", async (t) => {
  const f = await fixture(t, { retentionDays: 2 });
  await f.inbound("young", "/media/young");
  await f.inbound("old", "/media/old");
  await f.worker.tick();
  await f.db.query(
    "UPDATE media_files SET downloaded_at=now()-interval '1 day' WHERE msg_id='young'",
  );
  await f.db.query(
    "UPDATE media_files SET downloaded_at=now()-interval '3 days' WHERE msg_id='old'",
  );
  await f.worker.cleanupExpired();
  assert.equal((await f.row("young")).state, "ready");
  assert.equal((await f.row("old")).state, "deleted");
  await assert.rejects(
    new MediaFiles(f.ctx, {
      ...f.settings,
      directory: join(f.directory, "other"),
    }).recover(),
    /MEDIA_DIR differs/,
  );
});

test("C1 a failed unlink retains a retryable tombstone and does not stop other expired files", async (t) => {
  const f = await fixture(t);
  await f.inbound("blocked-file", "/media/blocked");
  await f.inbound("normal-file", "/media/normal");
  await f.worker.tick();
  await f.expire();
  const path = (await f.row("blocked-file")).local_file_path;
  // A filesystem obstruction deterministically produces unlink(EISDIR), without
  // depending on whether the test's OS user can override mode bits.
  await rm(path);
  await mkdir(path);
  await f.worker.cleanupExpired();
  const blocked = await f.row("blocked-file");
  assert.equal(blocked.state, "deleting");
  assert.equal(blocked.local_file_path, null);
  assert.ok(blocked.last_error);
  assert.ok(blocked.next_attempt_at.getTime() > Date.now());
  assert.equal((await f.row("normal-file")).state, "deleted");
  assert.ok(
    (await f.db.query("SELECT local_file_path FROM messages")).rows.every(
      (row) => row.local_file_path === null,
    ),
  );
  await rm(path, { recursive: true });
  await f.db.query(
    "UPDATE media_files SET next_attempt_at=now() WHERE state='deleting'",
  );
  await f.worker.cleanupExpired();
  assert.equal((await f.row("blocked-file")).state, "deleted");
  assert.deepEqual(await readdir(f.directory), []);
});

test("C1 deletion clears message references and old cursor file availability without changing frozen content", async (t) => {
  const f = await fixture(t);
  await f.inbound("old", "/media/ok");
  await f.worker.tick();
  const path = (await f.row("old")).local_file_path;
  await f.inbound("new");
  await f.db.query(
    "UPDATE messages SET sent_at=now()-interval '1 minute' WHERE msg_id='old'",
  );
  const { app, headers } = await f.api();
  const first = (
    await app.inject({ url: "/api/groups/g/messages?limit=1", headers })
  ).json();
  assert.ok(first.nextCursor);
  const snapshot = (
    await f.db.query("SELECT items FROM timeline_snapshots WHERE id=$1", [
      first.snapshotId,
    ])
  ).rows[0]!.items;
  assert.ok(
    snapshot.every(
      (item: Record<string, unknown>) => !("localFilePath" in item),
    ),
  );
  const nextUrl = `/api/groups/g/messages?limit=1&before=${encodeURIComponent(first.nextCursor)}`;
  const before = (await app.inject({ url: nextUrl, headers })).json().items[0];
  assert.equal(before.localFilePath, path);
  await f.expire();
  await f.worker.cleanupExpired();
  await assert.rejects(stat(path), { code: "ENOENT" });
  assert.equal(
    (
      await f.db.query(
        "SELECT local_file_path FROM messages WHERE msg_id='old'",
      )
    ).rows[0]!.local_file_path,
    null,
  );
  const after = (await app.inject({ url: nextUrl, headers })).json().items[0];
  assert.deepEqual(after, { ...before, localFilePath: null });
  await f.inbound("old", "/media/ok");
  await f.worker.tick();
  assert.deepEqual(
    f.calls,
    ["ok"],
    "historical replay cannot resurrect an expired file",
  );
});

test("C1 durable references serialize with cleanup and protect paused running sessions after restart", async (t) => {
  const f = await fixture(t);
  await f.inbound("protected", "/media/ok");
  await f.worker.tick();
  const file = await f.row("protected");
  await f.expire();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,recovery_note) VALUES('run','g','unknown remote turn')",
  );
  const locked = barrier(),
    release = barrier();
  const pin = f.db.transaction(async (tx) => {
    await tx.query("SELECT id FROM media_files WHERE id=$1 FOR UPDATE", [
      file.id,
    ]);
    locked.release();
    await release.promise;
    await referenceMedia(tx, "run", "g", ["protected"]);
  });
  await locked.promise;
  const cleanup = new MediaFiles(f.ctx, f.settings).cleanupExpired();
  await pause(25);
  release.release();
  await Promise.all([pin, cleanup]);
  assert.equal((await f.row("protected")).state, "ready");
  assert.equal(
    await readFile(file.local_file_path, "utf8"),
    "attachment bytes",
  );
  await f.db.query(
    "UPDATE agent_runs SET status='finished',end_reason='final' WHERE id='run'",
  );
  await new MediaFiles(f.ctx, f.settings).cleanupExpired();
  await assert.rejects(stat(file.local_file_path), { code: "ENOENT" });
  await f.db.transaction((tx) => referenceMedia(tx, "run", "g", ["protected"]));
  assert.equal((await f.row("protected")).state, "deleted");
});

test("C1 actual Agent trigger and get_recent_messages register the files their messages reference", async (t) => {
  const f = await fixture(t);
  await f.inbound("history-file", "/media/old", true);
  await f.db.query("UPDATE groups SET agent_enabled=true WHERE id='g'");
  await f.inbound("trigger-file", "/media/new");
  await f.worker.tick();
  const secondTurn = barrier(),
    release = barrier();
  let turns = 0;
  f.turns.call = async () => {
    if (++turns === 1)
      return {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "recent",
            name: "get_recent_messages",
            input: { limit: 10 },
          },
        ],
      };
    secondTurn.release();
    await release.promise;
    return {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "done" }],
    };
  };
  const agent = new AgentModule(f.ctx, f.messages);
  f.temporary.onCleanup(() => agent.close());
  f.temporary.onCleanup(async () => release.release());
  await agent.tick();
  await Promise.race([
    secondTurn.promise,
    pause(5000).then(() => {
      throw new Error("Agent did not reach its second turn");
    }),
  ]);
  const refs = (
    await f.db.query(
      "SELECT f.msg_id FROM agent_media_references r JOIN media_files f ON f.id=r.media_id ORDER BY f.msg_id",
    )
  ).rows;
  assert.deepEqual(refs, [
    { msg_id: "history-file" },
    { msg_id: "trigger-file" },
  ]);
  await f.expire();
  await f.worker.cleanupExpired();
  assert.equal(
    (await f.db.query("SELECT count(*) FROM media_files WHERE state='ready'"))
      .rows[0]!.count,
    "2",
  );
  release.release();
  await until(
    async () =>
      (await f.db.query("SELECT status FROM agent_runs")).rows[0]?.status ===
      "finished",
    "Agent final state missing",
  );
  await f.worker.cleanupExpired();
  assert.deepEqual(await readdir(f.directory), []);
});

test("C1 cleanup winning the row lock prevents a new run from pinning an unavailable file", async (t) => {
  const f = await fixture(t);
  await f.inbound("expiring", "/media/ok");
  await f.worker.tick();
  await f.expire();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('late-run','g')",
  );
  await f.db.query(
    "CREATE FUNCTION expiry_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='deleting' THEN PERFORM pg_sleep(0.3); END IF; RETURN NEW; END $$; CREATE TRIGGER expiry_barrier BEFORE UPDATE ON media_files FOR EACH ROW EXECUTE FUNCTION expiry_barrier()",
  );
  const cleanup = f.worker.cleanupExpired();
  await until(
    async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'",
          )
        ).rowCount,
      ),
    "cleanup never held its row lock",
  );
  await f.db.transaction((tx) =>
    referenceMedia(tx, "late-run", "g", ["expiring"]),
  );
  await cleanup;
  assert.equal((await f.row("expiring")).state, "deleted");
  assert.equal(
    (await f.db.query("SELECT count(*) FROM agent_media_references")).rows[0]!
      .count,
    "0",
  );
  assert.deepEqual(await readdir(f.directory), []);
});

test("C1 SIGKILL during a streamed body discards its partial and retries on restart", async (t) => {
  const f = await fixture(t);
  const release = barrier();
  f.temporary.onCleanup(async () => release.release());
  f.handlers.set("stream", (reply) =>
    reply.send(
      Readable.from(
        (async function* () {
          yield Buffer.from("unfinished");
          await release.promise;
          yield Buffer.from(" tail");
        })(),
      ),
    ),
  );
  await f.inbound("interrupted", "/media/stream");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/support/media-worker-process.ts"],
    {
      env: {
        ...process.env,
        MEDIA_TEST_DATABASE_URL: f.temporary.url,
        MEDIA_TEST_DIRECTORY: f.directory,
        MEDIA_TEST_GATEWAY_URL: f.url,
      },
      stdio: "ignore",
    },
  );
  const exited = once(child, "exit");
  f.temporary.onCleanup(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    release.release();
    await exited;
  });
  await until(async () => {
    const names = await readdir(f.directory);
    return (
      names.length === 1 &&
      names[0]!.endsWith(".part") &&
      (await stat(join(f.directory, names[0]!))).size > 0
    );
  }, "streamed bytes never reached the managed partial");
  assert.equal((await f.row("interrupted")).local_file_path, null);
  child.kill("SIGKILL");
  assert.equal((await exited)[1], "SIGKILL");
  release.release();
  f.handlers.delete("stream");
  const restarted = new MediaFiles(f.ctx, f.settings);
  await restarted.recover();
  await restarted.tick();
  const row = await f.row("interrupted");
  assert.equal(row.state, "ready");
  assert.equal(await readFile(row.local_file_path, "utf8"), "attachment bytes");
  assert.equal((await readdir(f.directory)).length, 1);
  assert.deepEqual(f.calls, ["stream", "stream"]);
  t.diagnostic(
    "confirmed SIGKILL with persisted partial; restarted body is complete and partial is gone",
  );
});

for (const stage of ["ready", "deleted"] as const)
  test(`C1 SIGKILL at ${stage} DB save recovers from the durable filesystem/intent boundary`, async (t) => {
    const f = await fixture(t);
    await f.inbound("crash", "/media/crash");
    if (stage === "deleted") {
      await f.worker.tick();
      await f.expire();
    }
    await f.db.query(
      `CREATE FUNCTION media_save_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='${stage}' THEN PERFORM pg_sleep(10); END IF; RETURN NEW; END $$; CREATE TRIGGER media_save_barrier BEFORE UPDATE ON media_files FOR EACH ROW EXECUTE FUNCTION media_save_barrier()`,
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/support/media-worker-process.ts"],
      {
        env: {
          ...process.env,
          MEDIA_TEST_DATABASE_URL: f.temporary.url,
          MEDIA_TEST_DIRECTORY: f.directory,
          MEDIA_TEST_GATEWAY_URL: f.url,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    const exited = once(child, "exit");
    f.temporary.onCleanup(async () => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
    });
    await until(
      async () =>
        Boolean(
          (
            await f.db.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep' AND query LIKE 'UPDATE media_files SET state=%'",
            )
          ).rowCount,
        ),
      `child never reached ${stage} boundary: ${output}`,
    );
    const atBarrier = await f.row("crash");
    const finalPath = join(f.directory, `media-${atBarrier.id}.bin`);
    if (stage === "ready") {
      assert.equal(atBarrier.state, "downloading");
      assert.equal(await readFile(finalPath, "utf8"), "attachment bytes");
    } else {
      assert.equal(atBarrier.state, "deleting");
      await assert.rejects(stat(finalPath), { code: "ENOENT" });
    }
    assert.equal(
      (
        await f.db.query(
          "SELECT local_file_path FROM messages WHERE msg_id='crash'",
        )
      ).rows[0]!.local_file_path,
      null,
    );
    child.kill("SIGKILL");
    const exit = await exited;
    assert.equal(exit[1], "SIGKILL");
    await f.db.query(
      "DROP TRIGGER media_save_barrier ON media_files; DROP FUNCTION media_save_barrier()",
    );
    f.handlers.set("crash", (reply) => reply.code(404).send());
    const restarted = new MediaFiles(f.ctx, f.settings);
    await restarted.recover();
    await restarted.tick();
    assert.equal((await f.row("crash")).state, stage);
    assert.deepEqual(
      f.calls,
      ["crash"],
      "recovery never re-downloads a complete body",
    );
    assert.equal(
      (await readdir(f.directory)).length,
      stage === "ready" ? 1 : 0,
    );
    t.diagnostic(
      `confirmed child SIGKILL at ${stage}; recovered state=${stage}; HTTP downloads=1`,
    );
  });
