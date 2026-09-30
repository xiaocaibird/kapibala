import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import {
  automationFixture,
  delay,
  deferred,
  until,
} from "../support/core-automation-fixture.js";

async function startSequence(
  f: Awaited<ReturnType<typeof automationFixture>>,
  group = "g",
  skipped = false,
) {
  const created = await f.api("POST", "/api/sequences", {
    name: "observation and isolation",
    steps: [
      {
        index: 1,
        accountRole: skipped ? "member" : "admin",
        text: "first",
        delaySeconds: 0,
      },
      { index: 2, accountRole: "admin", text: "second", delaySeconds: 0.5 },
    ],
  });
  assert.equal(created.statusCode, 200, created.body);
  const started = await f.api("POST", `/api/groups/${group}/sequence-runs`, {
    sequenceId: created.json<{ id: string }>().id,
  });
  assert.equal(started.statusCode, 201, started.body);
  return started.json<{ runId: string }>().runId;
}
async function readSteps(
  f: Awaited<ReturnType<typeof automationFixture>>,
  id: string,
) {
  return (
    await f.db.query<{
      index: number;
      status: string;
      client_msg_id: string | null;
      scheduled_at: Date | null;
      sent_at: Date | null;
    }>("SELECT * FROM sequence_steps WHERE run_id=$1 ORDER BY index", [id])
  ).rows;
}

for (const first of ["echo", "query", "event"] as const) {
  test(`R09: ${first} confirmation uses only message_sent observation, preserves it after duplicate and restart`, async (t) => {
    const landed = {
      msgId: "remote-message",
      sentAt: "2020-01-01T00:00:00.000Z",
    };
    const f = await automationFixture(t, undefined, (remote) => {
      remote.get(
        "/groups/:group/messages/by-client-id/:client",
        async () => landed,
      );
    });
    await f.db.query("UPDATE groups SET agent_enabled=false");
    await f.automation.recover!();
    const id = await startSequence(f);
    await f.automation.tick();
    const [initial] = await readSteps(f, id);
    assert.ok(initial?.client_msg_id);
    const messages = new Messages(f.ctx);
    let events = new GatewayEvents(f.ctx, messages);
    if (first === "echo") {
      await events.process({
        eventId: 1,
        type: "message",
        groupId: "remote-g",
        senderPlatformUserId: "account-2",
        text: "first",
        ...landed,
      });
    } else if (first === "query") {
      await f.db.query(
        "UPDATE messages SET delivery_status='accepted',dispatch_state='waiting_event' WHERE client_msg_id=$1",
        [initial.client_msg_id],
      );
      await messages.accountWork("account-2");
    }
    if (first !== "event") {
      assert.equal(
        (await messages.getMessage(initial.client_msg_id))?.deliveryStatus,
        "sent",
      );
      await f.automation.tick();
      const [step, next] = await readSteps(f, id);
      assert.equal(
        step!.sent_at,
        null,
        "echo/query must not count as message_sent observation",
      );
      assert.equal(next!.scheduled_at, null);
      await delay(550);
      await f.automation.tick();
      assert.equal(
        (await f.db.query("SELECT id FROM messages WHERE is_own")).rowCount,
        1,
      );
      // Rebuild the module before acknowledgement to check persistence of the wait.
      await f.automation.close!();
      events = new GatewayEvents(f.ctx, messages);
    }
    const receivedBefore = Date.now();
    const event = {
      eventId: 2,
      type: "message_sent" as const,
      clientMsgId: initial.client_msg_id,
      ...landed,
    };
    await events.process(event);
    const receivedAfter = Date.now();
    const replacement = createAutomationModule(f.ctx, messages);
    f.onCleanup(() => replacement.close!());
    if (first === "event") await f.automation.close!();
    await replacement.recover!();
    await replacement.tick();
    const [sent, next] = await readSteps(f, id);
    assert.equal(sent!.status, "sent");
    assert.ok(
      sent!.sent_at!.getTime() >= receivedBefore &&
        sent!.sent_at!.getTime() <= receivedAfter,
    );
    assert.equal(next!.scheduled_at!.getTime(), sent!.sent_at!.getTime() + 500);
    assert.equal(next!.client_msg_id, null);
    await delay(20);
    await events.process({ ...event, eventId: 3 });
    await events.process(event);
    await replacement.tick();
    assert.equal(
      (await readSteps(f, id))[0]!.sent_at!.getTime(),
      sent!.sent_at!.getTime(),
    );
    const persisted = (
      await f.db.query<{ message_sent_observed_at: Date }>(
        "SELECT message_sent_observed_at FROM messages WHERE client_msg_id=$1",
        [initial.client_msg_id],
      )
    ).rows[0]!;
    assert.equal(
      persisted.message_sent_observed_at.getTime(),
      sent!.sent_at!.getTime(),
    );
    await delay(Math.max(0, next!.scheduled_at!.getTime() - Date.now()) + 10);
    await replacement.tick();
    assert.equal(
      (await f.db.query("SELECT id FROM messages WHERE is_own")).rowCount,
      2,
    );
  });
}

test("R05: a locked group cannot block another group's Agent or sequence; retry preserves one run and one enqueue", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES('healthy','remote-healthy','account-4',true)",
  );
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('healthy','account-4','account-4','creator')",
  );
  await f.inbound();
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES('healthy-trigger','healthy','healthy-trigger','external',false,'trigger')",
  );
  await f.automation.recover!();
  const blockedId = await startSequence(f);
  const healthyId = await startSequence(f, "healthy");
  const blocker = await f.db.pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
  let tick: Promise<void> | undefined;
  try {
    const start = Date.now();
    tick = f.automation.tick();
    const result = await Promise.race([
      tick.then(() => "completed"),
      delay(1000).then(() => "blocked"),
    ]);
    assert.equal(
      result,
      "completed",
      "background tick must yield a busy group while its lock remains held",
    );
    t.diagnostic(`tick with group lock held: ${Date.now() - start}ms`);
    await until(
      async () =>
        (
          await f.db.query(
            "SELECT id FROM agent_runs WHERE group_id='healthy' AND status='finished'",
          )
        ).rowCount === 1,
    );
    assert.equal(
      (await f.db.query("SELECT id FROM agent_runs WHERE group_id='g'"))
        .rowCount,
      0,
    );
    assert.ok((await readSteps(f, healthyId))[0]!.client_msg_id);
    assert.equal((await readSteps(f, blockedId))[0]!.client_msg_id, null);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await tick;
  }
  await f.automation.tick();
  await f.automation.tick();
  await until(
    async () =>
      (
        await f.db.query(
          "SELECT id FROM agent_runs WHERE group_id='g' AND status='finished'",
        )
      ).rowCount === 1,
  );
  assert.equal(
    (await f.db.query("SELECT id FROM agent_runs WHERE group_id='g'")).rowCount,
    1,
  );
  assert.ok((await readSteps(f, blockedId))[0]!.client_msg_id);
  assert.equal(
    (await f.db.query("SELECT id FROM messages WHERE is_own AND group_id='g'"))
      .rowCount,
    1,
  );
});

test("R05: a real slow member reconciliation holds its group lock without stopping another group", async (t) => {
  const entered = deferred();
  const release = deferred();
  const f = await automationFixture(t, undefined, (remote) => {
    remote.get("/groups/remote-g/members", async () => {
      entered.resolve();
      await release.promise;
      return [1, 2, 3].map((n) => ({ platformUserId: `account-${n}` }));
    });
  });
  f.onCleanup(async () => release.resolve());
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES('healthy','remote-healthy','account-4',true)",
  );
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('healthy','account-4','account-4','creator')",
  );
  await f.inbound();
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES('healthy-trigger','healthy','healthy-trigger','external',false,'trigger')",
  );
  await f.automation.recover!();
  await startSequence(f);
  const healthyId = await startSequence(f, "healthy");
  const events = new GatewayEvents(f.ctx, new Messages(f.ctx));
  const processing = events.process({
    eventId: 20,
    type: "member_joined",
    groupId: "remote-g",
    platformUserId: "account-3",
  });
  await entered.promise;
  try {
    const tick = f.automation.tick();
    assert.equal(
      await Promise.race([
        tick.then(() => true),
        delay(1000).then(() => false),
      ]),
      true,
    );
    await until(
      async () =>
        (
          await f.db.query(
            "SELECT id FROM agent_runs WHERE group_id='healthy' AND status='finished'",
          )
        ).rowCount === 1,
    );
    assert.ok((await readSteps(f, healthyId))[0]!.client_msg_id);
    assert.equal(
      (await f.db.query("SELECT id FROM agent_runs WHERE group_id='g'"))
        .rowCount,
      0,
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=20"))
        .rowCount,
      0,
      "member event is still in its remote request transaction",
    );
  } finally {
    release.resolve();
    await processing;
  }
  await f.automation.tick();
  await until(
    async () =>
      (
        await f.db.query(
          "SELECT id FROM agent_runs WHERE group_id='g' AND status='finished'",
        )
      ).rowCount === 1,
  );
});

test("R05: busy takeover defers only that run and must rebase it before dispatch after unlock", async (t) => {
  const f = await automationFixture(t);
  await f.db.query("UPDATE groups SET agent_enabled=false");
  await f.automation.recover!();
  const id = await startSequence(f);
  await f.db.query(
    "UPDATE sequence_steps SET delay_seconds=0.25,scheduled_at=now()-interval '1 hour' WHERE run_id=$1 AND index=1",
    [id],
  );
  await f.automation.close!();
  const replacement = createAutomationModule(f.ctx, new Messages(f.ctx));
  f.onCleanup(() => replacement.close!());
  const blocker = await f.db.pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
  try {
    const recovery = replacement.recover!();
    assert.equal(
      await Promise.race([
        recovery.then(() => true),
        delay(1000).then(() => false),
      ]),
      true,
    );
    await replacement.tick();
    assert.equal((await readSteps(f, id))[0]!.client_msg_id, null);
    assert.equal((await readSteps(f, id))[1]!.scheduled_at, null);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  const unlockedAt = Date.now();
  await replacement.tick();
  const step = (await readSteps(f, id))[0]!;
  assert.equal(step.client_msg_id, null);
  assert.ok(step.scheduled_at!.getTime() >= unlockedAt + 249);
  await delay(270);
  await replacement.tick();
  await replacement.tick();
  assert.equal(
    (await f.db.query("SELECT id FROM messages WHERE is_own")).rowCount,
    1,
  );
  assert.equal((await readSteps(f, id))[1]!.scheduled_at, null);
});

test("R09: skipped step still schedules from the actual skip time", async (t) => {
  const f = await automationFixture(t);
  await f.db.query("DELETE FROM members WHERE role='member'");
  await f.automation.recover!();
  const id = await startSequence(f, "g", true);
  const before = Date.now();
  await f.automation.tick();
  const [skipped, next] = await readSteps(f, id);
  assert.equal(skipped!.status, "skipped");
  assert.ok(skipped!.sent_at!.getTime() >= before);
  assert.equal(
    next!.scheduled_at!.getTime(),
    skipped!.sent_at!.getTime() + 500,
  );
  assert.equal(next!.client_msg_id, null);
});

test("R09: observation precedes row-lock wait and survives a failed transaction retry", async (t) => {
  const f = await automationFixture(t);
  await f.automation.recover!();
  const id = await startSequence(f);
  await f.automation.tick();
  const messageId = (await readSteps(f, id))[0]!.client_msg_id!;
  const events = new GatewayEvents(f.ctx, new Messages(f.ctx));
  await f.db.query(
    `CREATE FUNCTION reject_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.message_sent_observed_at IS NOT NULL THEN RAISE EXCEPTION 'injected observation write failure'; END IF; RETURN NEW; END $$`,
  );
  await f.db.query(
    "CREATE TRIGGER reject_observation BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION reject_observation()",
  );
  const blocker = await f.db.pool.connect();
  await blocker.query("BEGIN");
  await blocker.query(
    "SELECT id FROM messages WHERE client_msg_id=$1 FOR UPDATE",
    [messageId],
  );
  const before = Date.now();
  const processing = events.process({
    eventId: 30,
    type: "message_sent",
    clientMsgId: messageId,
    msgId: "received",
    sentAt: "2020-01-01T00:00:00.000Z",
  });
  const afterCall = Date.now();
  try {
    await delay(120);
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=30"))
        .rowCount,
      0,
    );
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  await processing;
  assert.equal(
    (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=30"))
      .rowCount,
    0,
    "failed event transaction rolls back its dedupe record",
  );
  await f.db.query("DROP TRIGGER reject_observation ON messages");
  await delay(50);
  await events.retryFailed();
  const row = (
    await f.db.query<{ message_sent_observed_at: Date }>(
      "SELECT message_sent_observed_at FROM messages WHERE client_msg_id=$1",
      [messageId],
    )
  ).rows[0]!;
  assert.ok(
    row.message_sent_observed_at.getTime() >= before &&
      row.message_sent_observed_at.getTime() <= afterCall,
  );
  await f.automation.tick();
  assert.equal(
    (await readSteps(f, id))[0]!.sent_at!.getTime(),
    row.message_sent_observed_at.getTime(),
  );
});

test("R09: migration refuses active old sequences and never fabricates historical observations", async (t) => {
  const temp = await temporaryDatabase(t);
  const { db } = temp;
  await migrate(db);
  // Reconstruct the only schema difference from version 6, keeping all historical
  // data. Execute migration 007 directly so this test is independent of ledger APIs.
  await db.query("ALTER TABLE messages DROP COLUMN message_sent_observed_at");
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
  );
  await db.query("INSERT INTO sequences(id,name,steps) VALUES('s','old','[]')");
  await db.query(
    "INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('r','g','s')",
  );
  await db.query(
    "INSERT INTO messages(id,group_id,client_msg_id,msg_id,is_own,text,delivery_status) VALUES('m','g','c','remote-m',true,'old','sent')",
  );
  const sql = await readFile(
    new URL(
      "../../db/migrations/007_message_sent_observation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.query(sql);
    }),
    /Finish running sequences/,
  );
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='message_sent_observed_at'",
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM sequence_runs WHERE id='r' AND status='running'",
      )
    ).rowCount,
    1,
  );
  await db.query("UPDATE sequence_runs SET status='finished' WHERE id='r'");
  await db.transaction(async (tx) => {
    await tx.query(sql);
  });
  assert.equal(
    (
      await db.query<{ message_sent_observed_at: Date | null }>(
        "SELECT message_sent_observed_at FROM messages WHERE id='m'",
      )
    ).rows[0]!.message_sent_observed_at,
    null,
  );
  // Repeating an already-applied migration with a new running run remains valid.
  await db.query(
    "INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('new','g','s')",
  );
  await migrate(db);
});
