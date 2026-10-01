import assert from "node:assert/strict";
import { test } from "node:test";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  deferred,
  delay,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

test(
  "same-key current state: actual 429 leaves queued and second HTTP tool use reads its identity without waiting or resending",
  { timeout: 20000 },
  async (t) => {
    let sends = 0;
    const secondTurn = deferred();
    const release = deferred();
    const f = await automationFixture(t, undefined, (remote) => {
      remote.post("/groups/remote-g/send", async (_request, reply) => {
        sends++;
        return reply
          .code(429)
          .send({ code: "RATE_LIMITED", retryAfterSeconds: 60 });
      });
    });
    const messages = new Messages(f.ctx);
    let stop = false;
    const worker = (async () => {
      while (!stop) {
        for (const account of ["account-1", "account-2", "account-3"])
          await messages.accountWork(account);
        await delay(5);
      }
    })();
    f.onCleanup(async () => {
      release.resolve();
      stop = true;
      await worker;
    });
    let reached = false;
    f.handlers.turn = async () => {
      if (f.turns.length === 2) {
        reached = true;
        secondTurn.resolve();
        await release.promise;
      }
      return f.turns.length <= 2
        ? tool(`send-${f.turns.length}`, "send_message", {
            text: "single logical message",
            idempotency_key: "queued-key",
          })
        : end();
    };
    await f.inbound();
    const id = await f.start();
    await until(async () => reached, 8000);
    const before = (
      await f.db.query<{
        client_msg_id: string;
        delivery_status: string;
        metadata: Record<string, unknown>;
      }>(
        "SELECT client_msg_id,delivery_status,metadata FROM messages WHERE client_msg_id IS NOT NULL",
      )
    ).rows;
    assert.equal(before.length, 1);
    assert.equal(before[0]!.delivery_status, "queued");
    const limited = (
      await f.db.query<{ rate_limited_until: Date }>(
        "SELECT a.rate_limited_until FROM messages m JOIN accounts a ON a.id=m.account_id WHERE m.client_msg_id=$1 AND a.status='rate_limited'",
        [before[0]!.client_msg_id],
      )
    ).rows[0];
    assert.ok(
      limited && limited.rate_limited_until.getTime() > Date.now() + 45000,
    );
    const first = (await f.steps(id))[0]!;
    assert.equal(
      first.error_code,
      "SEND_TIMEOUT",
      "initial send keeps the original five-second contract",
    );
    assert.equal(sends, 1);
    assert.equal(f.audits.length, 1);
    const releasedAt = performance.now();
    release.resolve();
    assert.equal((await f.complete(id, 8000)).status, "finished");
    const steps = (await f.steps(id)).filter(
      (step) => step.name === "send_message",
    );
    t.diagnostic(
      JSON.stringify({
        stateAtSecondResponseBarrier: before[0]!.delivery_status,
        originalClientMsgId: before[0]!.client_msg_id,
        results: steps.map((step) => step.result),
        secondCompletionMs: performance.now() - releasedAt,
        sends,
        audits: f.audits.length,
        keys: (await f.db.query("SELECT * FROM agent_send_keys")).rowCount,
        storedMessages: (
          await f.db.query(
            "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
          )
        ).rowCount,
      }),
    );
    assert.equal(steps.length, 2);
    assert.deepEqual(steps[1]!.result, {
      clientMsgId: before[0]!.client_msg_id,
      deliveryStatus: "queued",
    });
    assert.equal(steps[1]!.is_error, false);
    assert.equal(sends, 1);
    assert.equal(f.audits.length, 1);
    assert.equal(
      (await f.db.query("SELECT * FROM agent_send_keys")).rowCount,
      1,
    );
    assert.equal(
      (
        await f.db.query(
          "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
        )
      ).rowCount,
      1,
    );
  },
);
