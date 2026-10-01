import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentTools } from "../../apps/server/src/modules/automation/tool-execution.js";
import type { ToolOutcome } from "../../apps/server/src/modules/automation/protocol.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { withOperationSignal } from "../../apps/server/src/core/db.js";
import {
  automationFixture,
  delay,
  until,
} from "../support/core-automation-fixture.js";

async function prepared(
  t: Parameters<typeof automationFixture>[0],
  remaining = 60000,
) {
  const f = await automationFixture(t);
  const messages = new Messages(f.ctx);
  const message = await messages.enqueueSend({
    groupId: "g",
    accountId: "account-1",
    text: "already enqueued",
  });
  await f.db.query(
    "UPDATE messages SET delivery_status='accepted' WHERE client_msg_id=$1",
    [message.clientMsgId],
  );
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history) VALUES('deadline-run','g','[]')",
  );
  await f.db.query(
    "INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state) VALUES('deadline-run',1,'tool_use','deadline-tool','send_message',$1,'ready')",
    [JSON.stringify({ text: "already enqueued", idempotency_key: "same-key" })],
  );
  await f.db.query(
    "INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES('deadline-run','same-key',$1)",
    [message.clientMsgId],
  );
  const outcomes: ToolOutcome[] = [];
  const tool = new AgentTools(f.ctx, messages, {
    completeStep: async (_run, _step, outcome) => {
      outcomes.push(outcome);
    },
    remaining: () => remaining,
    readRun: f.readRun,
    checkpoint: async () => {
      assert.fail("a reused send key must not audit");
    },
    finish: async () => {
      assert.fail("delivery does not terminate the run");
    },
    finishAfterStep: async () => {
      assert.fail("send is not finish");
    },
    pause: async () => {
      assert.fail("a read failure does not invent an unknown tool");
    },
  });
  const run = await f.readRun("deadline-run");
  const [step] = await f.steps(run.id);
  return { ...f, outcomes, execute: () => tool.executeStep(run, step!) };
}

for (const { table, messageStatus, accountStatus } of [
  { table: "messages", messageStatus: "accepted", accountStatus: "online" },
  { table: "accounts", messageStatus: "accepted", accountStatus: "online" },
  { table: "messages", messageStatus: "failed", accountStatus: "online" },
  { table: "accounts", messageStatus: "accepted", accountStatus: "suspended" },
] as const) {
  test(
    `Agent delivery discards a late ${table} read (${messageStatus}/${accountStatus}) after its original five-second deadline`,
    { timeout: 15000 },
    async (t) => {
      const f = await prepared(t);
      const query = f.db.query.bind(f.db);
      await query("UPDATE messages SET delivery_status=$1,fail_code=$2", [
        messageStatus,
        messageStatus === "failed" ? "ACCOUNT_TERMINAL" : null,
      ]);
      await query("UPDATE accounts SET status=$1 WHERE id='account-1'", [
        accountStatus,
      ]);
      let accountReads = 0;
      const tracked = t.mock.method(
        f.db,
        "query",
        async (sql: string, values?: unknown[]) => {
          if (sql.startsWith("SELECT a.status FROM messages m JOIN accounts"))
            accountReads++;
          return query(sql, values);
        },
      );
      const locker = await f.db.pool.connect();
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        await locker.query("ROLLBACK");
        locker.release();
      };
      f.onCleanup(release);
      await locker.query("BEGIN");
      await locker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
      const began = performance.now();
      const work = f.execute();
      try {
        await until(async () =>
          Boolean(
            (
              await query(
                "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",
                [
                  table === "messages"
                    ? "SELECT * FROM messages WHERE client_msg_id%"
                    : "SELECT a.status FROM messages m JOIN accounts%",
                ],
              )
            ).rowCount,
          ),
        );
        // Hold a real database read beyond the full, unshortened five seconds.
        // No clock, timer, start boundary, or product budget is mocked.
        await delay(5100);
      } finally {
        await release();
        await work;
        tracked.mock.restore();
      }
      const elapsedMs = performance.now() - began;
      t.diagnostic(
        JSON.stringify({
          table,
          messageStatus,
          accountStatus,
          elapsedMs,
          accountReads,
          outcome: f.outcomes[0],
        }),
      );
      assert.equal(f.outcomes.length, 1);
      assert.equal(f.outcomes[0]!.errorCode, "SEND_TIMEOUT");
      assert.equal(
        accountReads,
        table === "messages" ? 0 : 1,
        "an expired message read must not start another account read",
      );
      assert.ok(
        elapsedMs > 5000,
        "retain the real blocking tail; this is not a strict-time PASS",
      );
      assert.equal(f.audits.length, 0);
      assert.equal(f.gatewayRequests.length, 0);
      assert.equal((await query("SELECT * FROM agent_send_keys")).rowCount, 1);
      assert.equal(
        (await query("SELECT delivery_status FROM messages")).rows[0]!
          .delivery_status,
        messageStatus,
        "timeout must not rewrite the durable delivery fact",
      );
      assert.equal(
        (await query("SELECT status FROM accounts WHERE id='account-1'"))
          .rows[0]!.status,
        accountStatus,
      );
      await f.execute();
      assert.equal(f.outcomes.length, 2);
      const failed =
        messageStatus === "failed" || accountStatus === "suspended";
      assert.equal(
        f.outcomes[1]!.errorCode,
        failed ? "SEND_FAILED" : undefined,
      );
      if (!failed)
        assert.equal(f.outcomes[1]!.value.deliveryStatus, "accepted");
      assert.equal(f.audits.length, 0, "same-key retry does not repeat audit");
      assert.equal(
        f.gatewayRequests.length,
        0,
        "same-key retry does not resend",
      );
    },
  );
}

test("Agent delivery with no remaining wait does not start message or account reads", async (t) => {
  const f = await prepared(t, 0);
  const query = f.db.query.bind(f.db);
  const reads: string[] = [];
  const tracked = t.mock.method(
    f.db,
    "query",
    async (sql: string, values?: unknown[]) => {
      reads.push(sql);
      return query(sql, values);
    },
  );
  await f.execute();
  tracked.mock.restore();
  // executeStep must resolve the existing idempotency key before entering the
  // delivery wait; the zero-budget wait itself performs no database reads.
  assert.deepEqual(reads, [
    "SELECT client_msg_id FROM agent_send_keys WHERE run_id=$1 AND idempotency_key=$2",
  ]);
  assert.equal(f.outcomes[0]!.errorCode, "SEND_TIMEOUT");
});

test("Agent delivery retains the ownership failure after a blocked read and does not complete the step", async (t) => {
  const f = await prepared(t);
  const locker = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await locker.query("ROLLBACK");
    locker.release();
  };
  f.onCleanup(release);
  await locker.query("BEGIN");
  await locker.query("LOCK TABLE messages IN ACCESS EXCLUSIVE MODE");
  const owner = new AbortController();
  const failure = new Error("test: Agent lock ownership lost");
  const work = withOperationSignal(owner.signal, () => f.execute());
  const rejection = assert.rejects(work, (error) => error === failure);
  try {
    await until(async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM messages WHERE client_msg_id%'",
          )
        ).rowCount,
      ),
    );
    owner.abort(failure);
  } finally {
    await release();
    await rejection;
  }
  assert.deepEqual(f.outcomes, []);
  assert.equal(f.audits.length, 0);
  assert.equal(f.gatewayRequests.length, 0);
});

test("Agent delivery returns a timely sent observation without waiting for an unrelated account lock", async (t) => {
  const f = await prepared(t);
  await f.db.query(
    "UPDATE messages SET delivery_status='sent',msg_id='already-sent'",
  );
  await f.db.query(
    "UPDATE accounts SET status='suspended' WHERE id='account-1'",
  );
  const query = f.db.query.bind(f.db);
  let accountReads = 0;
  const tracked = t.mock.method(
    f.db,
    "query",
    async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("SELECT a.status FROM messages m JOIN accounts"))
        accountReads++;
      return query(sql, values);
    },
  );
  const locker = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await locker.query("ROLLBACK");
    locker.release();
  };
  f.onCleanup(release);
  await locker.query("BEGIN");
  await locker.query("LOCK TABLE accounts IN ACCESS EXCLUSIVE MODE");
  const timer = setTimeout(() => {
    void release();
  }, 250);
  const began = performance.now();
  let releasedAtResult: boolean;
  try {
    await f.execute();
    releasedAtResult = released;
  } finally {
    clearTimeout(timer);
    await release();
    tracked.mock.restore();
  }
  t.diagnostic(
    JSON.stringify({
      case: "timely-sent",
      elapsedMs: performance.now() - began,
      accountReads,
      releasedAtResult,
    }),
  );
  assert.equal(f.outcomes[0]!.value.deliveryStatus, "sent");
  assert.equal(f.outcomes[0]!.errorCode, undefined);
  assert.equal(
    accountReads,
    0,
    "sent already proves delivery and is exempt from account-terminal rejection",
  );
  assert.equal(
    releasedAtResult,
    false,
    "return while the irrelevant account lock is still held",
  );
});
