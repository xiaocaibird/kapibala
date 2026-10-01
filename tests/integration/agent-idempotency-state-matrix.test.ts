import assert from "node:assert/strict";
import { test } from "node:test";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  delay,
  end,
  tool,
} from "../support/core-automation-fixture.js";

// These are explicit persisted-state fixtures, not claims that every remote
// delivery transition or unknown-outcome recovery has been reproduced.
for (const status of [
  "queued",
  "unknown",
  "accepted",
  "sent",
  "failed",
  "cancelled",
] as const) {
  test(
    `same-key state read returns stored ${status} even after the original account becomes terminal`,
    { timeout: 10000 },
    async (t) => {
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
          await delay(5);
        }
      })();
      f.onCleanup(async () => {
        stop = true;
        await worker;
      });
      let originalClientMsgId: string | undefined;
      f.handlers.turn = async () => {
        if (f.turns.length === 2) {
          // Stop only this fixture's delivery worker before setting a known
          // stored state. The real second tool call remains HTTP → DB → history.
          stop = true;
          await worker;
          const row = (
            await f.db.query<{
              client_msg_id: string;
              delivery_status: string;
              account_id: string;
            }>(
              "SELECT client_msg_id,delivery_status,account_id FROM messages WHERE client_msg_id IS NOT NULL",
            )
          ).rows[0]!;
          assert.equal(row.delivery_status, "accepted");
          originalClientMsgId = row.client_msg_id;
          await f.db.query(
            "UPDATE messages SET delivery_status=$2,fail_code=$3 WHERE client_msg_id=$1",
            [
              row.client_msg_id,
              status,
              ["failed", "cancelled"].includes(status)
                ? "ACCOUNT_SUSPENDED"
                : null,
            ],
          );
          await f.db.query(
            "UPDATE accounts SET status='suspended' WHERE id=$1",
            [row.account_id],
          );
        }
        return f.turns.length <= 2
          ? tool(`state-${f.turns.length}`, "send_message", {
              text:
                f.turns.length === 1
                  ? "original message"
                  : "different text must not be sent",
              idempotency_key: "one-key",
            })
          : end();
      };
      await f.inbound();
      const id = await f.start();
      assert.equal((await f.complete(id)).status, "finished");
      const steps = (await f.steps(id)).filter(
        (step) => step.name === "send_message",
      );
      assert.equal(steps[0]!.is_error, false);
      assert.equal(steps[1]!.is_error, false);
      assert.deepEqual(steps[1]!.result, {
        clientMsgId: originalClientMsgId,
        deliveryStatus: status,
      });
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
      t.diagnostic(
        JSON.stringify({
          fixtureStoredStatus: status,
          result: steps[1]!.result,
          sends,
          audits: f.audits.length,
        }),
      );
    },
  );
}
