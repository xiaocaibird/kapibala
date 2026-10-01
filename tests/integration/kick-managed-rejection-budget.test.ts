import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import type { TransactionBoundaryFact } from "../../apps/server/src/core/test-transaction-observer.js";
import {
  automationFixture,
  deferred,
  delay,
  tool,
  until,
} from "../support/core-automation-fixture.js";

for (const cancel of [false, true]) {
  test(
    `local managed rejection after work cutoff preserves known non-dispatch${cancel ? " and cancellation" : ""}`,
    { timeout: 25000 },
    async (t) => {
      const facts: LifecycleFact[] = [];
      const entered = deferred();
      const proceed = deferred();
      const workStopped = deferred();
      let posts = 0;
      const f = await automationFixture(
        t,
        undefined,
        (remote) => {
          remote.post("/groups/remote-g/kick", async () => {
            posts++;
            return { kicked: true };
          });
          remote.get("/groups/remote-g/members", async () => []);
        },
        (ctx) => {
          ctx.testExecutionObserver = {
            async ready() {},
            async kick(_correlation, operation) {
              entered.resolve();
              await proceed.promise;
              return operation();
            },
          };
          ctx.testLifecycleObserver = {
            record(fact) {
              facts.push(structuredClone(fact));
              if (fact.kind === "kick-work-budget-signal-aborted")
                workStopped.resolve();
            },
          };
        },
      );
      f.onCleanup(async () => proceed.resolve());
      const runId = `managed-cutoff-${cancel ? "cancel" : "budget"}`;
      // A legitimate persisted tool leaves 17.4s of the original 60s budget.
      // No clock, timeout, HTTP result, or product deadline is replaced.
      const priorActiveMs = 42600;
      await f.preparedTool(
        runId,
        priorActiveMs,
        tool("managed-cutoff-kick", "kick_user", {
          platform_user_id: "external-target",
          reason: "local managed identity changed during intent persistence",
        }).content[0]!,
      );
      const startedAt = performance.now();
      await f.automation.tick();
      await entered.promise;
      const blocker = await f.db.pool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          "SELECT * FROM agent_steps WHERE run_id=$1 FOR UPDATE",
          [runId],
        );
        proceed.resolve();
        const isIntentWaiting = async () =>
          (
            await f.db.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE agent_steps SET intent=%'",
            )
          ).rowCount! > 0;
        await until(isIntentWaiting);
        const waitingObservedAt = performance.now();
        await f.db.query(
          "UPDATE accounts SET platform_user_id='external-target' WHERE id='account-4'",
        );
        if (cancel)
          await f.db.query(
            "UPDATE agent_runs SET cancel_requested=true WHERE id=$1",
            [runId],
          );
        await workStopped.promise;
        await delay(100);
        assert.equal(await isIntentWaiting(), true);
        await blocker.query("ROLLBACK");
        const releasedAt = performance.now();
        const run = await f.complete(runId, 2000);
        await until(async () =>
          facts.some((fact) => fact.kind === "agent-terminal-committed"),
        );
        const [step] = await f.steps(runId);
        const work = facts.find(
          (fact) => fact.kind === "kick-work-budget-signal-aborted",
        )!;
        const terminal = facts.find(
          (fact) => fact.kind === "agent-terminal-committed",
        )!;
        const commit = (
          terminal.transactionBoundaries as TransactionBoundaryFact[]
        ).find((fact) => fact.phase === "commit" && fact.edge === "returned")!;
        t.diagnostic(
          JSON.stringify({
            role: "developer-real-lock-boundary-not-full-60s-proof",
            runId,
            priorActiveMs,
            startedAt,
            waitingObservedAt,
            releasedAt,
            posts,
            status: run.status,
            endReason: run.end_reason,
            recoveryNote: run.recovery_note,
            step,
            facts,
          }),
        );
        assert.ok(work);
        assert.ok(
          waitingObservedAt < (work.signalObservedWindowMs as number[])[0]!,
        );
        assert.ok((work.signalObservedWindowMs as number[])[1]! < releasedAt);
        assert.equal(
          facts.some((fact) => fact.kind === "kick-budget-signal-aborted"),
          false,
        );
        assert.ok(commit.windowMs[1] - startedAt < 60000 - priorActiveMs);
        assert.equal(posts, 0);
        assert.equal(f.gatewayRequests.length, 0);
        assert.equal(f.audits.length, 1);
        assert.equal(f.turns.length, 0);
        assert.equal(run.recovery_note, null);
        assert.equal(step?.state, "complete");
        assert.equal(step?.error_code, "POLICY_DENIED");
        assert.equal(run.status, cancel ? "cancelled" : "failed");
        assert.equal(run.end_reason, cancel ? "cancelled" : "wall_clock");
        assert.equal(
          run.history
            .flatMap((message) => message.content)
            .filter((block) => block.type === "tool_result").length,
          1,
        );
        assert.equal(
          facts.filter(
            (fact) =>
              fact.kind === "agent-step-save-transaction" &&
              fact.toolUseId === "managed-cutoff-kick" &&
              fact.phase === "commit" &&
              fact.edge === "returned",
          ).length,
          1,
        );
        await f.automation.tick();
        assert.equal(posts, 0, "completed local rejection is not replayed");
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    },
  );
}
