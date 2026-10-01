import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  until,
} from "../support/core-automation-fixture.js";

for (const edge of ["started", "returned", "failed"] as const) {
  test(
    `real Agent save preserves transaction outcome when only ${edge} observation throws`,
    { timeout: 10000 },
    async (t) => {
      const facts: LifecycleFact[] = [];
      const f = await automationFixture(t, undefined, undefined, (ctx) => {
        ctx.testLifecycleObserver = {
          record(fact) {
            facts.push(structuredClone(fact));
            if (fact.kind === `send-tool-history-save-${edge}`)
              throw new Error("engineering recorder unavailable");
          },
        };
      });
      const runId = `real-save-${edge}`;
      await f.preparedTool(runId, 0, {
        id: "same-tool",
        name: "send_message",
        input: { text: "already queued", idempotency_key: "same-key" },
      });
      const message = await new Messages(f.ctx).enqueueSend({
        groupId: "g",
        accountId: "account-1",
        text: "already queued",
      });
      await f.db.query(
        "UPDATE messages SET delivery_status='accepted' WHERE client_msg_id=$1",
        [message.clientMsgId],
      );
      await f.db.query(
        "INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES($1,'same-key',$2)",
        [runId, message.clientMsgId],
      );
      const originalHistory = (await f.readRun(runId)).history;
      if (edge === "failed") {
        // Real PostgreSQL rejects the history write after the actual step UPDATE.
        // The fixture neither replaces completeStep nor fabricates a rollback.
        await f.db.query(
          "CREATE FUNCTION reject_probe_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'developer history persistence probe' USING ERRCODE='P0001'; END $$",
        );
        await f.db.query(
          "CREATE TRIGGER reject_probe_history BEFORE UPDATE OF history ON agent_runs FOR EACH ROW EXECUTE FUNCTION reject_probe_history()",
        );
      }
      await f.automation.tick();
      await until(async () =>
        facts.some(
          (fact) =>
            fact.kind ===
            `send-tool-history-save-${edge === "failed" ? "failed" : "returned"}`,
        ),
      );
      if (edge !== "failed")
        assert.equal((await f.complete(runId)).status, "finished");

      const entered = facts.find((fact) => fact.kind === "send-tool-entered")!;
      assert.ok(entered?.attemptId);
      const execution = facts.filter(
        (fact) => fact.attemptId === entered.attemptId,
      );
      const transactions = execution.filter(
        (fact) => fact.kind === "agent-step-save-transaction",
      );
      assert.equal(
        new Set(transactions.map((fact) => fact.transactionAttemptId)).size,
        1,
      );
      assert.ok(
        transactions.every((fact) => typeof fact.backendPid === "number"),
      );
      const expected =
        edge === "failed"
          ? [
              ["begin", "called"],
              ["begin", "returned"],
              ["step-result-update", "called"],
              ["step-result-update", "returned"],
              ["run-history-update", "called"],
              ["run-history-update", "rejected"],
              ["rollback", "called"],
              ["rollback", "returned"],
            ]
          : [
              ["begin", "called"],
              ["begin", "returned"],
              ["step-result-update", "called"],
              ["step-result-update", "returned"],
              ["run-history-update", "called"],
              ["run-history-update", "returned"],
              ["commit", "called"],
              ["commit", "returned"],
            ];
      assert.deepEqual(
        transactions.map((fact) => [fact.phase, fact.edge]),
        expected,
      );
      assert.equal(
        execution.filter(
          (fact) => fact.kind === "send-tool-history-save-started",
        ).length,
        1,
      );
      assert.equal(
        execution.filter((fact) => fact.kind === "send-tool-history-committed")
          .length,
        edge === "failed" ? 0 : 1,
      );
      const savedStep = (await f.steps(runId))[0]!;
      const run = await f.readRun(runId);
      if (edge === "failed") {
        assert.equal(savedStep.state, "ready");
        assert.equal(savedStep.result, null);
        assert.deepEqual(run.history, originalHistory);
        assert.equal(
          transactions.find((fact) => fact.edge === "rejected")?.sqlState,
          "P0001",
        );
        assert.equal(
          execution.find(
            (fact) => fact.kind === "send-tool-history-save-failed",
          )?.sqlState,
          "P0001",
        );
        assert.equal(f.turns.length, 0);
      } else {
        assert.equal(savedStep.state, "complete");
        assert.equal(savedStep.result?.deliveryStatus, "accepted");
        assert.ok(JSON.stringify(run.history).includes('"tool_result"'));
      }
      assert.equal(
        f.audits.length,
        0,
        "the persisted send key does not re-audit",
      );
      assert.equal(
        f.gatewayRequests.length,
        0,
        "the persisted send key does not re-send",
      );
      assert.equal(
        (
          await f.db.query(
            "SELECT count(*)::int AS n FROM messages WHERE client_msg_id=$1",
            [message.clientMsgId],
          )
        ).rows[0]!.n,
        1,
      );
      t.diagnostic(
        JSON.stringify({
          edge,
          runId,
          clientMsgId: message.clientMsgId,
          execution,
          savedState: savedStep.state,
          historyUnchanged:
            edge === "failed"
              ? JSON.stringify(run.history) === JSON.stringify(originalHistory)
              : false,
        }),
      );
    },
  );
}
