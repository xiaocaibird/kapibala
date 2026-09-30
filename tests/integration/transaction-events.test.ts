import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { Database, emit } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { migrate } from "../../scripts/migrate.js";

function barrier() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    release: () => resolve(),
  };
}
async function fixture(t: TestContext) {
  const url = new URL(
    process.env.DATABASE_URL ??
      "postgres://kapibala:kapibala@localhost:55432/kapibala",
  );
  const admin = new Database(url.toString());
  const database = `event_order_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  const db = new Database(url.toString());
  const remote = Fastify({ logger: false });
  t.after(async () => {
    await remote.close();
    await db.close();
    await admin.query(`DROP DATABASE ${database}`);
    await admin.close();
  });
  await migrate(db);
  let sends = 0;
  const sentTexts: string[] = [];
  remote.post("/groups/:id/send", (request, reply) => {
    sends++;
    sentTexts.push((request.body as { text: string }).text);
    return reply.code(403).send({ code: "ACCOUNT_SUSPENDED" });
  });
  const gateway = new RemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const messages = new Messages({
    db,
    gateway,
    agent: gateway,
    log: remote.log,
  });
  const groups = [randomUUID(), randomUUID()];
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id=id WHERE id='account-2'",
  );
  for (const group of groups) {
    await db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES($1,$1,'account-2')",
      [group],
    );
    await db.query(
      "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-2','account-2','creator')",
      [group],
    );
  }
  const first = await messages.enqueueSend({
    groupId: groups[0]!,
    accountId: "account-2",
    text: "terminal send",
  });
  const queued = await messages.enqueueSend({
    groupId: groups[1]!,
    accountId: "account-2",
    text: "queued after terminal",
  });
  const sequenceId = randomUUID();
  const runId = randomUUID();
  await db.query(
    "INSERT INTO sequences(id,name,steps) VALUES($1,'terminal propagation','[]')",
    [sequenceId],
  );
  await db.query(
    "INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES($1,$2,$3)",
    [runId, groups[1], sequenceId],
  );
  await db.query(
    "INSERT INTO sequence_steps(run_id,index,account_role,text,delay_seconds,resolved_vars,var_sources,client_msg_id) VALUES($1,1,'admin','queued',0,'{}','{}',$2)",
    [runId, queued.clientMsgId],
  );
  async function assertTerminal() {
    assert.equal(
      (await db.query("SELECT status FROM accounts WHERE id='account-2'"))
        .rows[0]!.status,
      "suspended",
    );
    assert.equal(
      (await db.query("SELECT * FROM members WHERE account_id='account-2'"))
        .rowCount,
      0,
    );
    assert.equal(
      (await messages.getMessage(first.clientMsgId!))!.deliveryStatus,
      "failed",
    );
    assert.equal(
      (await messages.getMessage(first.clientMsgId!))!.failCode,
      "ACCOUNT_SUSPENDED",
    );
    assert.equal(
      (await messages.getMessage(queued.clientMsgId!))!.deliveryStatus,
      "cancelled",
    );
    assert.equal(
      (
        await db.query("SELECT status FROM sequence_steps WHERE run_id=$1", [
          runId,
        ])
      ).rows[0]!.status,
      "skipped",
    );
    assert.equal(sends, 1);
  }
  return { db, admin, database, groups, messages, assertTerminal, sentTexts };
}

test("terminal send and concurrent member removal acquire event ordering only after domain writes", async (t) => {
  const f = await fixture(t);
  const held = barrier();
  const emitAllowed = barrier();
  const leaving = f.db.transaction(async (tx) => {
    await tx.query("SELECT * FROM members WHERE group_id=$1 FOR UPDATE", [
      f.groups[1],
    ]);
    held.release();
    await emitAllowed.promise;
    await emit(tx, "group_changed", { groupId: f.groups[1] });
  });
  await held.promise;
  const sending = f.messages.accountWork("account-2");
  const deadline = Date.now() + 3000;
  while (
    !(
      await f.admin.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE 'DELETE FROM members%'",
        [f.database],
      )
    ).rowCount
  ) {
    if (Date.now() > deadline) {
      emitAllowed.release();
      throw new Error("terminal cleanup never reached held member row");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  emitAllowed.release();
  const results = await Promise.allSettled([sending, leaving]);
  assert.ok(
    results.every((r) => r.status === "fulfilled"),
    JSON.stringify(results),
  );
  await f.assertTerminal();
});

test("retrying a local terminal-result transaction never repeats the remote send", async (t) => {
  const f = await fixture(t);
  await f.db.query("CREATE SEQUENCE local_result_fault");
  await f.db.query(
    "CREATE FUNCTION fail_first_terminal_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='suspended' AND nextval('local_result_fault')=1 THEN RAISE EXCEPTION 'injected retryable transaction failure' USING ERRCODE='40P01'; END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER fail_first_terminal_update BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION fail_first_terminal_update()",
  );
  await f.messages.accountWork("account-2");
  await f.assertTerminal();
  const events = (
    await f.db.query<{ type: string }>(
      "SELECT type FROM events WHERE type='account_terminal'",
    )
  ).rows;
  assert.equal(
    events.length,
    1,
    "the rolled-back attempt must not leak an event",
  );
});

test("outgoing FIFO follows commit order when an older transaction enqueues first but commits last", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "UPDATE messages SET delivery_status='sent',dispatch_state='done'",
  );
  const enqueued = barrier();
  const commitAllowed = barrier();
  const older = f.db.transaction(async (tx) => {
    await f.messages.enqueueSend(
      {
        groupId: f.groups[0]!,
        accountId: "account-2",
        text: "older transaction, later commit",
      },
      tx,
    );
    enqueued.release();
    await commitAllowed.promise;
  });
  try {
    await enqueued.promise;
    await f.messages.enqueueSend({
      groupId: f.groups[1]!,
      accountId: "account-2",
      text: "newer transaction, first commit",
    });
  } finally {
    commitAllowed.release();
    await older;
  }
  await f.messages.accountWork("account-2");
  assert.deepEqual(f.sentTexts, ["newer transaction, first commit"]);
  const unsent = (
    await f.db.query(
      "SELECT delivery_status FROM messages WHERE text='older transaction, later commit'",
    )
  ).rows[0];
  assert.equal(unsent?.delivery_status, "cancelled");
});
