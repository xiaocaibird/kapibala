import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import Fastify from "fastify";
import {
  assertSchemaCurrent,
  loadMigrations,
  migrate,
} from "../../apps/server/src/core/migrations.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { SequenceModule } from "../../apps/server/src/modules/automation/sequences.js";
import { temporaryDatabase } from "../support/temporary-database.js";

const confirmation = {
  eventId: 101,
  type: "message_sent" as const,
  clientMsgId: "client-a",
  msgId: "remote-a",
  sentAt: "2020-01-01T00:00:00.000Z",
};

async function until(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 8000;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, message);
    await delay(10);
  }
}

async function fixture(t: TestContext, version7 = false) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  t.diagnostic(
    `isolated database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  if (version7) {
    const directory = await mkdtemp(join(tmpdir(), "confirmation-migrations-"));
    temporary.onCleanup(() => rm(directory, { recursive: true, force: true }));
    for (const migration of (await loadMigrations()).filter(
      (item) => item.version <= 7,
    ))
      await writeFile(join(directory, migration.name), migration.sql);
    await migrate(db, pathToFileURL(`${directory}/`));
  } else await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-2','account-2','admin')",
  );
  await db.query(
    "INSERT INTO messages(id,group_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,delivery_status,dispatch_state) VALUES('m','g','client-a','account-2','account-2',true,'first','accepted','waiting_event')",
  );
  const app = Fastify({ logger: false });
  temporary.onCleanup(() => app.close());
  const remote = new RemoteClient("http://unused.invalid");
  const ctx = { db, gateway: remote, agent: remote, log: app.log };
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  temporary.onCleanup(() => events.close());
  const receipt = async (
    clientId = confirmation.clientMsgId,
    msgId = confirmation.msgId,
  ) =>
    (
      await db.query<{
        observed_at: Date | null;
        first_event_id: string | null;
      }>(
        "SELECT observed_at,first_event_id FROM message_sent_receipts WHERE client_msg_id=$1 AND msg_id=$2",
        [clientId, msgId],
      )
    ).rows[0];
  const message = async () =>
    (
      await db.query<{
        delivery_status: string;
        message_sent_observed_at: Date | null;
      }>(
        "SELECT delivery_status,message_sent_observed_at FROM messages WHERE id='m'",
      )
    ).rows[0]!;
  return { ...temporary, ctx, messages, events, receipt, message };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function worker(
  f: Fixture,
  name: string,
  event = confirmation,
  pauseBeforeInsert = false,
) {
  const url = new URL(f.url);
  url.searchParams.set("application_name", name);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("../support/confirmation-receipt-process.ts", import.meta.url),
      ),
      JSON.stringify(event),
    ],
    {
      env: {
        ...process.env,
        CONFIRMATION_TEST_DATABASE_URL: url.toString(),
        CONFIRMATION_TEST_PAUSE_BEFORE_INSERT: pauseBeforeInsert ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  const messages: { type: string; at: number }[] = [];
  child.on("message", (message) =>
    messages.push(message as { type: string; at: number }),
  );
  let output = "";
  child.stdout!.on("data", (data) => {
    output += String(data);
  });
  child.stderr!.on("data", (data) => {
    output += String(data);
  });
  const result = new Promise<{
    code: number | null;
    signal: string | null;
    output: string;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, output }));
  });
  f.onCleanup(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await result;
  });
  return { child, messages, result };
}

async function lockMessage(f: Fixture) {
  const connection = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      await connection.query("ROLLBACK");
    } finally {
      connection.release();
    }
  };
  f.onCleanup(release);
  await connection.query("BEGIN");
  await connection.query("SELECT id FROM messages WHERE id='m' FOR UPDATE");
  return release;
}

async function gateReceipt(f: Fixture, applicationName: string) {
  const connection = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      await connection.query("SELECT pg_advisory_unlock(946008)");
    } finally {
      connection.release();
    }
  };
  f.onCleanup(release);
  await connection.query("SELECT pg_advisory_lock(946008)");
  assert.match(applicationName, /^[a-z_]+$/);
  await f.db
    .query(`CREATE FUNCTION gate_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('application_name')='${applicationName}' THEN PERFORM pg_advisory_xact_lock(946008); END IF; RETURN NEW; END $$;
    CREATE TRIGGER gate_receipt BEFORE INSERT ON message_sent_receipts FOR EACH ROW EXECUTE FUNCTION gate_receipt()`);
  return release;
}

async function waitForLock(f: Fixture, name: string) {
  await until(
    async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock'",
            [name],
          )
        ).rowCount,
      ),
    `${name} did not reach the controlled database lock`,
  );
}

test("CR01 migration 008 is atomic and repeatable, preserving actual old clocks and unknown historical receipts", async (t) => {
  const f = await fixture(t, true);
  const known = new Date("2026-09-30T00:00:00.123Z");
  await f.db.query(
    "UPDATE messages SET msg_id='remote-a',delivery_status='sent',message_sent_observed_at=$1 WHERE id='m'",
    [known],
  );
  await f.db.query(
    "INSERT INTO messages(id,group_id,client_msg_id,msg_id,is_own,text,delivery_status) VALUES('old','g','old-client','old-message',true,'legacy','sent'),('query','g','query-client','query-message',true,'query only','sent')",
  );
  await f.db.query(
    "INSERT INTO gateway_events(event_id,type,data) VALUES(1,'message_sent',$1),(2,'message_sent',$2)",
    [
      JSON.stringify({ ...confirmation, eventId: 1 }),
      JSON.stringify({
        ...confirmation,
        eventId: 2,
        clientMsgId: "old-client",
        msgId: "old-message",
      }),
    ],
  );
  await f.db.query(
    "INSERT INTO sequences(id,name,steps) VALUES('s','active old sequence','[]'); INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('r','g','s')",
  );
  await f.db.query(
    "CREATE FUNCTION reject_receipt_migration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=8 THEN RAISE EXCEPTION 'injected version-8 ledger failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_receipt_migration BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_receipt_migration()",
  );
  await assert.rejects(migrate(f.db), /injected version-8 ledger failure/);
  assert.equal(
    (await f.db.query("SELECT to_regclass('message_sent_receipts') AS name"))
      .rows[0]!.name,
    null,
  );
  assert.equal(
    (await f.db.query("SELECT max(version) AS version FROM schema_migrations"))
      .rows[0]!.version,
    7,
  );
  await f.db.query(
    "DROP TRIGGER reject_receipt_migration ON schema_migrations",
  );
  await migrate(f.db);
  const first = (
    await f.db.query(
      "SELECT * FROM message_sent_receipts ORDER BY client_msg_id,msg_id",
    )
  ).rows;
  await migrate(f.db);
  assert.equal(await assertSchemaCurrent(f.db), 8);
  assert.deepEqual(
    (
      await f.db.query(
        "SELECT * FROM message_sent_receipts ORDER BY client_msg_id,msg_id",
      )
    ).rows,
    first,
  );
  assert.equal((await f.receipt())!.observed_at!.getTime(), known.getTime());
  assert.equal(
    (await f.receipt("old-client", "old-message"))!.observed_at,
    null,
  );
  assert.equal(await f.receipt("query-client", "query-message"), undefined);
  assert.equal(
    (await f.db.query("SELECT status FROM sequence_runs WHERE id='r'")).rows[0]!
      .status,
    "running",
  );
  await f.events.process({ ...confirmation, eventId: 10 });
  await f.events.process({
    ...confirmation,
    eventId: 11,
    clientMsgId: "old-client",
    msgId: "old-message",
  });
  assert.equal(
    (await f.message()).message_sent_observed_at!.getTime(),
    known.getTime(),
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT message_sent_observed_at FROM messages WHERE id='old'",
      )
    ).rows[0]!.message_sent_observed_at,
    null,
  );
  const before = Date.now();
  await f.events.process({
    ...confirmation,
    eventId: 12,
    clientMsgId: "query-client",
    msgId: "query-message",
  });
  assert.ok(
    (await f.receipt(
      "query-client",
      "query-message",
    ))!.observed_at!.getTime() >= before,
  );
});

test("CR02 business rollback leaves a reliable receipt, and a new event handler reuses its stable identity", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "CREATE FUNCTION reject_receipt_application() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.message_sent_observed_at IS NOT NULL THEN RAISE EXCEPTION 'injected business failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_receipt_application BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION reject_receipt_application()",
  );
  const before = Date.now();
  await f.events.process(confirmation);
  const observed = (await f.receipt())!.observed_at!.getTime();
  assert.ok(observed >= before && observed <= Date.now());
  assert.equal((await f.message()).message_sent_observed_at, null);
  assert.equal((await f.db.query("SELECT 1 FROM gateway_events")).rowCount, 0);
  await f.db.query("DROP TRIGGER reject_receipt_application ON messages");
  await delay(40);
  const restarted = new GatewayEvents(f.ctx, f.messages);
  await restarted.process({ ...confirmation, eventId: 102 });
  await f.events.retryFailed();
  await restarted.process({ ...confirmation, eventId: 103 });
  assert.equal((await f.receipt())!.observed_at!.getTime(), observed);
  assert.equal((await f.receipt())!.first_event_id, "101");
  assert.equal(
    (await f.message()).message_sent_observed_at!.getTime(),
    observed,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM message_sent_receipts")).rowCount,
    1,
  );
  assert.equal((await f.db.query("SELECT 1 FROM gateway_events")).rowCount, 3);
  await restarted.process({
    ...confirmation,
    eventId: 104,
    msgId: "conflicting-message",
  });
  assert.equal(
    (await f.message()).message_sent_observed_at!.getTime(),
    observed,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM message_sent_receipts")).rowCount,
    2,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='inconsistency' AND payload->>'kind'='duplicate_remote_delivery'",
      )
    ).rowCount,
    1,
  );
});

test("CR03 receipt-write failure prevents business application and a surviving process retains its first clock", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected receipt failure'; END $$; CREATE TRIGGER reject_receipt BEFORE INSERT ON message_sent_receipts FOR EACH ROW EXECUTE FUNCTION reject_receipt()",
  );
  const before = Date.now();
  const processing = f.events.process(confirmation);
  const afterCall = Date.now();
  await processing;
  assert.equal(await f.receipt(), undefined);
  assert.equal((await f.message()).message_sent_observed_at, null);
  assert.equal((await f.db.query("SELECT 1 FROM gateway_events")).rowCount, 0);
  await f.db.query("DROP TRIGGER reject_receipt ON message_sent_receipts");
  await delay(60);
  await f.events.retryFailed();
  const saved = (await f.receipt())!.observed_at!.getTime();
  assert.ok(saved >= before && saved <= afterCall);
  assert.equal((await f.message()).message_sent_observed_at!.getTime(), saved);
});

test("CR04 SIGKILL after independent receipt commit preserves the clock through a new process and sequence recovery", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO sequences(id,name,steps) VALUES('s','receipt recovery','[]'); INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('r','g','s')",
  );
  await f.db.query(
    "INSERT INTO sequence_steps(run_id,index,status,client_msg_id,account_role,text,delay_seconds,resolved_vars,var_sources) VALUES('r',1,'accepted','client-a','admin','first',0,'{}','{}'),('r',2,'pending',null,'admin','second',60,'{}','{}')",
  );
  const release = await lockMessage(f);
  const first = worker(f, "receipt_crash_after_commit");
  await until(
    async () => Boolean(await f.receipt()),
    "receipt did not commit independently of business state",
  );
  await waitForLock(f, "receipt_crash_after_commit");
  const saved = (await f.receipt())!.observed_at!.getTime();
  assert.equal((await f.message()).message_sent_observed_at, null);
  first.child.kill("SIGKILL");
  assert.equal((await first.result).signal, "SIGKILL");
  await release();
  assert.equal((await f.db.query("SELECT 1 FROM gateway_events")).rowCount, 0);
  await delay(100);
  const replay = worker(f, "receipt_restarted");
  const completed = await replay.result;
  assert.equal(completed.code, 0, completed.output);
  assert.equal((await f.message()).message_sent_observed_at!.getTime(), saved);
  assert.equal((await f.receipt())!.observed_at!.getTime(), saved);
  const sequences = new SequenceModule(f.ctx, f.messages);
  f.onCleanup(() => sequences.close());
  await sequences.recover();
  await sequences.tick();
  const steps = (
    await f.db.query<{ sent_at: Date | null; scheduled_at: Date | null }>(
      "SELECT sent_at,scheduled_at FROM sequence_steps WHERE run_id='r' ORDER BY index",
    )
  ).rows;
  assert.equal(steps[0]!.sent_at!.getTime(), saved);
  assert.equal(steps[1]!.scheduled_at!.getTime(), saved + 60000);
  t.diagnostic(
    JSON.stringify({
      case: "CR04",
      signal: "SIGKILL",
      savedObservedAt: saved,
      replayStartedAt: replay.messages.find(
        (message) => message.type === "starting",
      )!.at,
      recoveredObservedAt: (
        await f.message()
      ).message_sent_observed_at!.getTime(),
      nextScheduledAt: steps[1]!.scheduled_at!.getTime(),
    }),
  );
});

test("CR05 two processes keep the first reliable record, not a later writer's earlier physical observation", async (t) => {
  const f = await fixture(t);
  const release = await gateReceipt(f, "receipt_earlier_observer");
  const earlier = worker(f, "receipt_earlier_observer");
  await waitForLock(f, "receipt_earlier_observer");
  await delay(100);
  const winner = worker(f, "receipt_first_durable", {
    ...confirmation,
    eventId: 102,
  });
  const win = await winner.result;
  assert.equal(win.code, 0, win.output);
  const saved = (await f.receipt())!.observed_at!.getTime();
  const earlierStarted = earlier.messages.find(
    (message) => message.type === "starting",
  )!.at;
  const winnerStarted = winner.messages.find(
    (message) => message.type === "starting",
  )!.at;
  assert.ok(winnerStarted > earlierStarted);
  assert.ok(saved >= winnerStarted);
  await release();
  const late = await earlier.result;
  assert.equal(late.code, 0, late.output);
  assert.equal((await f.receipt())!.observed_at!.getTime(), saved);
  assert.equal((await f.receipt())!.first_event_id, "102");
  assert.equal((await f.message()).message_sent_observed_at!.getTime(), saved);
  assert.equal(
    (await f.db.query("SELECT 1 FROM message_sent_receipts")).rowCount,
    1,
  );
  t.diagnostic(
    JSON.stringify({
      case: "CR05",
      earlierProcessStartedAt: earlierStarted,
      winningProcessStartedAt: winnerStarted,
      firstReliableObservedAt: saved,
      unchangedAfterEarlierObserverContinued: true,
    }),
  );
});

test("CR06 SIGKILL before receipt persistence demonstrates the unrecoverable observation window", async (t) => {
  const f = await fixture(t);
  const first = worker(f, "receipt_before_commit", confirmation, true);
  await until(
    async () =>
      first.messages.some(
        (message) => message.type === "before_receipt_insert",
      ),
    "worker did not pause before receipt SQL submission",
  );
  const lostStart = first.messages.find(
    (message) => message.type === "starting",
  )!.at;
  first.child.kill("SIGKILL");
  assert.equal((await first.result).signal, "SIGKILL");
  assert.equal(await f.receipt(), undefined);
  assert.equal((await f.db.query("SELECT 1 FROM gateway_events")).rowCount, 0);
  await delay(100);
  const replay = worker(f, "receipt_after_unpersisted_loss");
  const completed = await replay.result;
  assert.equal(completed.code, 0, completed.output);
  const replayStart = replay.messages.find(
    (message) => message.type === "starting",
  )!.at;
  const saved = (await f.receipt())!.observed_at!.getTime();
  assert.ok(saved >= replayStart && saved > lostStart);
  assert.notEqual(saved, Date.parse(confirmation.sentAt));
  t.diagnostic(
    JSON.stringify({
      case: "CR06",
      lostProcessStartedAt: lostStart,
      replayStartedAt: replayStart,
      firstReliableObservedAt: saved,
      originalPhysicalObservationRecovered: false,
      faultInjection:
        "process paused before receipt SQL submission, then SIGKILL",
      boundary:
        "Only the new reliable observation survives; this is not reconstruction of the lost receipt.",
    }),
  );
});
