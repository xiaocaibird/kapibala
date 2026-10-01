import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import type { TransactionBoundaryFact } from "../../apps/server/src/core/test-transaction-observer.js";
import { KickRejectionPersistenceError } from "../../apps/server/src/core/messaging.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  delay,
  tool,
  until,
} from "../support/core-automation-fixture.js";

const kickUse = () =>
  tool("settlement-kick", "kick_user", {
    platform_user_id: "external-target",
    reason: "isolated settlement fixture",
  }).content[0]!;
function saveCommits(facts: LifecycleFact[]) {
  return facts.filter(
    (f) =>
      f.kind === "agent-step-save-transaction" &&
      f.toolUseId === "settlement-kick" &&
      f.phase === "commit" &&
      f.edge === "returned",
  );
}
function terminalCommit(facts: LifecycleFact[]) {
  const terminal = facts.find((f) => f.kind === "agent-terminal-committed");
  return (
    terminal?.transactionBoundaries as TransactionBoundaryFact[] | undefined
  )?.find((f) => f.phase === "commit" && f.edge === "returned");
}

for (const scenario of [
  "confirmed-projection",
  "confirmed-cancel",
  "definite-rejection",
] as const) {
  test(
    `real ${scenario} keeps its proved result when a local row lock crosses only the work deadline`,
    { timeout: 25000 },
    async (t) => {
      const confirmed = scenario !== "definite-rejection";
      const facts: LifecycleFact[] = [];
      let posts = 0;
      let lock: PoolClient | undefined;
      let unlockWork: Promise<void> | undefined;
      let lockReleasedAt: number | undefined;
      let releaseTimer: ReturnType<typeof setTimeout> | undefined;
      const release = () =>
        (unlockWork ??= (async () => {
          if (!lock) return;
          await lock.query("ROLLBACK");
          lock.release();
          lock = undefined;
          lockReleasedAt = performance.now();
        })());
      const f = await automationFixture(
        t,
        undefined,
        (remote) => {
          remote.post("/groups/remote-g/kick", async (request, reply) => {
            posts++;
            lock = await f.db.pool.connect();
            await lock.query("BEGIN");
            if (confirmed)
              await lock.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
            else
              await lock.query(
                "SELECT id FROM accounts WHERE id=$1 FOR UPDATE",
                [(request.body as { byAccountId: string }).byAccountId],
              );
            // The persisted fixture leaves about 17.2s total/15.2s work. Keep this
            // real PG row lock across work, release inside the unchanged hard limit.
            releaseTimer = setTimeout(() => {
              void release();
            }, 15600);
            if (scenario === "confirmed-cancel")
              await f.db.query(
                "UPDATE agent_runs SET cancel_requested=true WHERE id=$1",
                [`settlement-${scenario}`],
              );
            return confirmed
              ? { kicked: true }
              : reply.code(403).send({ code: "ACCOUNT_SUSPENDED" });
          });
          remote.get("/groups/remote-g/members", async () => []);
        },
        (ctx) => {
          ctx.testLifecycleObserver = {
            record: (f) => {
              facts.push(structuredClone(f));
            },
          };
        },
      );
      f.onCleanup(async () => {
        clearTimeout(releaseTimer);
        await release();
      });
      await f.preparedTool(`settlement-${scenario}`, 42800, kickUse());
      const startedAt = performance.now();
      await f.automation.tick();
      if (confirmed) {
        await until(
          async () =>
            (await f.steps(`settlement-${scenario}`))[0]?.state === "complete",
        );
        assert.equal(
          lockReleasedAt,
          undefined,
          "actual success/history COMMIT precedes optional blocked projection",
        );
      }
      const run = await f.complete(`settlement-${scenario}`, 22000);
      await until(async () => Boolean(terminalCommit(facts)));
      const [step] = await f.steps(run.id);
      const work = facts.find(
        (f) => f.kind === "kick-work-budget-signal-aborted",
      )!;
      const commit = terminalCommit(facts)!;
      t.diagnostic(
        JSON.stringify({
          role: "developer-local-boundary-not-full-60s-proof",
          scenario,
          priorActiveMs: 42800,
          startedAt,
          lockReleasedAt,
          posts,
          status: run.status,
          endReason: run.end_reason,
          step,
          facts,
        }),
      );
      assert.ok(work);
      assert.equal(
        facts.some((f) => f.kind === "kick-budget-signal-aborted"),
        false,
      );
      assert.ok(
        (work.signalObservedWindowMs as number[])[1]! < lockReleasedAt!,
      );
      assert.ok(commit.windowMs[1] - startedAt < 17200);
      assert.equal(
        run.end_reason,
        scenario === "confirmed-cancel" ? "cancelled" : "wall_clock",
      );
      assert.equal(run.recovery_note, null);
      assert.equal(step?.state, "complete");
      assert.equal(
        saveCommits(facts).length,
        1,
        "save real tool result/history once",
      );
      assert.equal(
        run.history
          .flatMap((m) => m.content)
          .filter((b) => b.type === "tool_result").length,
        1,
      );
      assert.equal(posts, 1);
      if (confirmed) {
        assert.equal(step?.is_error, false);
        assert.deepEqual(step?.result, { kicked: true });
        assert.equal(
          f.gatewayRequests.filter((p) => p.endsWith("/members")).length,
          0,
          "blocked projection never gets beyond its real work deadline",
        );
      } else {
        assert.equal(step?.error_code, "SEND_FAILED");
        assert.match(step?.result_summary ?? "", /ACCOUNT_SUSPENDED/);
        const account = (
          await f.db.query("SELECT status FROM accounts WHERE id=$1", [
            step?.intent?.accountId,
          ])
        ).rows[0];
        assert.equal(account?.status, "suspended");
      }
      await f.automation.tick();
      assert.equal(posts, 1, "finite post-completion no-replay check");
    },
  );
}

for (const result of ["confirmed", "rejected"] as const) {
  test(`real ${result} response plus failed local persistence propagates infrastructure failure without replay`, async (t) => {
    const facts: LifecycleFact[] = [];
    const failures: unknown[] = [];
    let posts = 0;
    const f = await automationFixture(
      t,
      undefined,
      (remote) => {
        remote.post("/groups/remote-g/kick", async (_request, reply) => {
          posts++;
          return result === "confirmed"
            ? { kicked: true }
            : reply.code(403).send({ code: "ACCOUNT_SUSPENDED" });
        });
        remote.get("/groups/remote-g/members", async () => []);
      },
      (ctx) => {
        ctx.testLifecycleObserver = {
          record: (f) => {
            facts.push(structuredClone(f));
          },
        };
        const error = ctx.log.error.bind(ctx.log);
        ctx.log.error = (object: unknown, message?: string) => {
          if (
            message === "Agent execution paused after an infrastructure failure"
          )
            failures.push(object);
          error(object, message);
        };
      },
    );
    await f.preparedTool(`failed-${result}`, 0, kickUse());
    await f.db.query(
      "CREATE FUNCTION reject_settlement_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'developer settlement persistence failure' USING ERRCODE='P0001'; END $$",
    );
    await f.db.query(
      result === "confirmed"
        ? "CREATE TRIGGER reject_settlement_write BEFORE UPDATE OF history ON agent_runs FOR EACH ROW EXECUTE FUNCTION reject_settlement_write()"
        : "CREATE TRIGGER reject_settlement_write BEFORE UPDATE OF status ON accounts FOR EACH ROW EXECUTE FUNCTION reject_settlement_write()",
    );
    await f.automation.tick();
    await until(async () => failures.length > 0);
    const before = await f.readRun(`failed-${result}`);
    const [step] = await f.steps(before.id);
    assert.equal(posts, 1);
    assert.equal(step?.state, "executing");
    assert.equal(step?.intent?.dispatchState, "dispatching");
    assert.equal(step?.result, null);
    assert.equal(
      before.history
        .flatMap((m) => m.content)
        .filter((b) => b.type === "tool_result").length,
      0,
    );
    assert.equal(
      before.recovery_note,
      null,
      "do not fabricate a saved unknown result after a definite response",
    );
    assert.equal(saveCommits(facts).length, 0);
    assert.equal(
      f.gatewayRequests.filter((p) => p.endsWith("/members")).length,
      0,
    );
    if (result === "rejected") {
      const error = (failures[0] as { err: unknown }).err;
      assert.ok(error instanceof KickRejectionPersistenceError);
      assert.equal(error.rejectionCode, "ACCOUNT_SUSPENDED");
      assert.equal((error.cause as { code: string }).code, "P0001");
    } else {
      const transactions = facts.filter(
        (f) => f.kind === "agent-step-save-transaction",
      );
      assert.ok(
        transactions.some(
          (f) => f.phase === "rollback" && f.edge === "returned",
        ),
      );
    }
    await f.automation.close?.();
    await f.db.query(
      `DROP TRIGGER reject_settlement_write ON ${result === "confirmed" ? "agent_runs" : "accounts"}`,
    );
    const replacement = createAutomationModule(f.ctx, new Messages(f.ctx));
    f.onCleanup(async () => {
      await replacement.close?.();
    });
    await replacement.recover?.();
    await replacement.tick();
    await until(async () =>
      Boolean((await f.readRun(before.id)).recovery_note),
    );
    assert.equal(
      posts,
      1,
      "unpersisted response is conservatively unknown on recovery; never replay",
    );
    assert.equal((await f.steps(before.id))[0]?.state, "executing");
    t.diagnostic(
      JSON.stringify({
        result,
        posts,
        durableResultSaved: false,
        infrastructureFailures: failures.length,
        facts,
        recovered: await f.readRun(before.id),
      }),
    );
  });
}

// Unlike persisted active_ms component fixtures above, this starts from actual
// inbound creation and spends real time. Its bracket includes pause AND terminal
// COMMIT tails; it does not truncate the budget at the pause observation.
test(
  "real initial run cancels pending kick confirmation at work cutoff and durably finishes within the original 60s",
  {
    skip: process.env.KICK_SETTLEMENT_OBSERVATION_EXPERIMENT !== "1",
    timeout: 75000,
  },
  async (t) => {
    const facts: LifecycleFact[] = [];
    const ledger: { kind: string; at: number }[] = [];
    let posts = 0;
    let confirmations = 0;
    let effects = 0;
    const f = await automationFixture(
      t,
      15000,
      (remote) => {
        remote.post("/groups/remote-g/kick", async (_request, reply) => {
          posts++;
          effects++;
          ledger.push({ kind: "stub-member-removal", at: performance.now() });
          await delay(5000);
          return reply.code(504).send({ code: "NETWORK_TIMEOUT" });
        });
        remote.get("/groups/remote-g/members", async (_request, reply) => {
          confirmations++;
          ledger.push({ kind: "confirmation-pending", at: performance.now() });
          reply.hijack();
          reply.raw.once("close", () =>
            ledger.push({ kind: "confirmation-closed", at: performance.now() }),
          );
        });
      },
      (ctx) => {
        ctx.testLifecycleObserver = {
          record: (f) => {
            facts.push(structuredClone(f));
          },
        };
      },
    );
    let turns = 0;
    f.handlers.turn = async () => {
      await delay(12600);
      return ++turns < 3
        ? tool(`read-${turns}`, "get_recent_messages", { limit: 1 })
        : tool("settlement-kick", "kick_user", kickUse().input);
    };
    await f.inbound();
    const runId = await f.start();
    const run = await f.complete(runId, 66000);
    await until(async () => Boolean(terminalCommit(facts)));
    const creation = facts.find(
      (f) => f.kind === "agent-run-created" && f.runId === runId,
    )!;
    const terminal = terminalCommit(facts)!;
    const work = facts.find(
      (f) => f.kind === "kick-work-budget-signal-aborted",
    )!;
    const source = facts.find(
      (f) =>
        f.kind === "kick-confirmation-source-aborted" &&
        f.source === "kick-work-budget",
    )!;
    const settled = facts.find(
      (f) => f.kind === "kick-confirmation-request-settled",
    )!;
    const pause = facts.find(
      (f) => f.kind === "agent-activity-pause-committed",
    )!;
    const creationWindow = creation.creationWindowMs as [number, number];
    const actualUpperMs = terminal.windowMs[1] - creationWindow[0];
    const step = (await f.steps(runId)).find(
      (s) => s.tool_use_id === "settlement-kick",
    )!;
    t.diagnostic(
      JSON.stringify({
        role: "developer-new-strategy-real-time-chain",
        clockDomain: "same-process-performance.now",
        actualUpperMs,
        creationWindow,
        terminal,
        posts,
        confirmations,
        effects,
        turns,
        ledger,
        facts,
        run,
        step,
      }),
    );
    assert.equal(posts, 1);
    assert.equal(
      effects,
      1,
      "controlled fixture effect only; no external protocol inference",
    );
    assert.equal(confirmations, 1);
    assert.equal(turns, 3);
    assert.ok(
      actualUpperMs <= 60000,
      `actual creation-to-terminal upper bracket ${actualUpperMs}ms`,
    );
    assert.ok(
      actualUpperMs >= 57500,
      "exercise the real work deadline rather than an earlier shortcut",
    );
    assert.ok(source && settled && work && pause);
    assert.equal(source.fetchPending, true);
    assert.equal(settled.outcome, "rejected");
    assert.deepEqual(settled.reasonMatchedSources, [
      "caller",
      "kick-work-budget",
    ]);
    assert.equal(pause.pauseCause, "kick-work-budget-exhausted");
    assert.equal(
      facts.some((f) => f.kind === "kick-budget-signal-aborted"),
      false,
      "do not claim the original 60s signal fired",
    );
    assert.equal(run.status, "failed");
    assert.equal(run.end_reason, "wall_clock");
    assert.equal(step.state, "executing");
    assert.equal(step.intent?.dispatchState, "dispatching");
    assert.equal(step.result, null);
    assert.match(step.result_summary, /outcome remains unknown/);
    await f.automation.tick();
    assert.equal(posts, 1, "finite no-replay check after durable termination");
  },
);
