import assert from "node:assert/strict";
import { test } from "node:test";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  delay,
  end,
  tool,
} from "../support/core-automation-fixture.js";

async function sendFixture(t: Parameters<typeof automationFixture>[0]) {
  let sends = 0;
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/send", async (_request, reply) => {
      sends++;
      return reply.code(202).send({ accepted: true });
    });
  });
  const messages = new Messages(f.ctx);
  let stop = false;
  const worker = (async () => {
    while (!stop) {
      for (const account of ["account-1", "account-2", "account-3"])
        await messages.accountWork(account);
      await delay(10);
    }
  })();
  f.onCleanup(async () => {
    stop = true;
    await worker;
  });
  return { ...f, sends: () => sends };
}

test("guard effects: audit fail creates no message/key and makes no remote send", async (t) => {
  const f = await sendFixture(t);
  f.handlers.audit = () => ({ verdict: "fail", reason: "not permitted" });
  f.handlers.turn = () =>
    f.turns.length === 1
      ? tool("send-one", "send_message", {
          text: "must not send",
          idempotency_key: "blocked-key",
        })
      : end();
  await f.inbound();
  const id = await f.start();
  assert.equal((await f.complete(id)).status, "finished");
  t.diagnostic(
    JSON.stringify({
      guard: "audit-fail",
      audits: f.audits.length,
      remoteSends: f.sends(),
      messages: (
        await f.db.query(
          "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
        )
      ).rowCount,
      keys: (await f.db.query("SELECT * FROM agent_send_keys")).rowCount,
      errorCode: (await f.steps(id))[0]!.error_code,
    }),
  );
  assert.equal((await f.steps(id))[0]!.error_code, "AUDIT_REJECTED");
  assert.equal(f.audits.length, 1);
  assert.equal(
    (
      await f.db.query(
        "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
      )
    ).rowCount,
    0,
  );
  assert.equal((await f.db.query("SELECT * FROM agent_send_keys")).rowCount, 0);
  assert.equal(
    f.sends(),
    0,
    "audit rejection must stop the real HTTP side effect",
  );
});

test("guard effects: same key reuses original identity without a second audit or remote send", async (t) => {
  const f = await sendFixture(t);
  f.handlers.turn = () =>
    f.turns.length <= 2
      ? tool(`send-${f.turns.length}`, "send_message", {
          text: "one logical message",
          idempotency_key: "reused-key",
        })
      : end();
  await f.inbound();
  const id = await f.start();
  assert.equal((await f.complete(id)).status, "finished");
  const steps = (await f.steps(id)).filter((step) => step.kind === "tool_use");
  t.diagnostic(
    JSON.stringify({
      guard: "same-key",
      audits: f.audits.length,
      remoteSends: f.sends(),
      messages: (
        await f.db.query(
          "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
        )
      ).rowCount,
      keys: (await f.db.query("SELECT * FROM agent_send_keys")).rowCount,
      results: steps.map((step) => step.result),
    }),
  );
  assert.equal(steps.length, 2);
  assert.equal(
    steps.every((step) => !step.is_error),
    true,
  );
  const results = steps.map(
    (step) => step.result as { clientMsgId: string; deliveryStatus: string },
  );
  assert.equal(results[0]!.clientMsgId, results[1]!.clientMsgId);
  assert.equal(
    (
      await f.db.query(
        "SELECT client_msg_id FROM messages WHERE client_msg_id IS NOT NULL",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (await f.db.query("SELECT * FROM agent_send_keys WHERE run_id=$1", [id]))
      .rowCount,
    1,
  );
  assert.equal(
    f.sends(),
    1,
    "one logical key must make exactly one real HTTP send",
  );
  assert.equal(f.audits.length, 1, "same key must not repeat audit");
});
