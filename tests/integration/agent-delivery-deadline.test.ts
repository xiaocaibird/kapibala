import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentTools } from "../../apps/server/src/modules/automation/tool-execution.js";
import type { ToolOutcome } from "../../apps/server/src/modules/automation/protocol.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  delay,
  until,
} from "../support/core-automation-fixture.js";

async function prepared(t: Parameters<typeof automationFixture>[0]) {
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
    remaining: () => 60000,
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

for (const table of ["messages", "accounts"] as const) {
  test(
    `Agent delivery discards a ${table} read that completes after its original five-second deadline`,
    { timeout: 15000 },
    async (t) => {
      const f = await prepared(t);
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
        "accepted",
        "timeout must not rewrite the durable delivery fact",
      );
      await f.execute();
      assert.equal(f.outcomes.length, 2);
      assert.equal(f.outcomes[1]!.errorCode, undefined);
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
