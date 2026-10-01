import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import {
  automationFixture,
  delay,
  tool,
} from "../support/core-automation-fixture.js";

// Developer wiring evidence only. This deliberately spends the original real
// activity budget; it neither injects active_ms nor asserts an activity SLA.
test(
  "real kick POST 504 and pending confirmation share the original budget signal and execution identity",
  {
    skip: process.env.KICK_CANCEL_OBSERVATION_EXPERIMENT !== "1",
    timeout: 75000,
  },
  async (t) => {
    const facts: LifecycleFact[] = [];
    const ledger: { kind: string; at: number }[] = [];
    let posts = 0;
    let confirmations = 0;
    const f = await automationFixture(
      t,
      15000,
      (remote) => {
        remote.post("/groups/remote-g/kick", async (_request, reply) => {
          posts++;
          ledger.push({ kind: "post-received", at: performance.now() });
          reply.raw.once("finish", () =>
            ledger.push({ kind: "post-finished", at: performance.now() }),
          );
          return reply.code(504).send({ code: "NETWORK_TIMEOUT" });
        });
        remote.get("/groups/remote-g/members", async (_request, reply) => {
          confirmations++;
          ledger.push({ kind: "confirmation-received", at: performance.now() });
          reply.hijack();
          reply.raw.once("close", () =>
            ledger.push({ kind: "confirmation-closed", at: performance.now() }),
          );
        });
      },
      (ctx) => {
        ctx.testLifecycleObserver = {
          record: (fact) => {
            facts.push(fact);
          },
        };
      },
    );
    let turns = 0;
    f.handlers.turn = async () => {
      await delay(14500);
      turns++;
      return turns < 3
        ? tool(`read-${turns}`, "get_recent_messages", { limit: 1 })
        : tool("cancel-observed-kick", "kick_user", {
            platform_user_id: "external-target",
            reason: "isolated observation fixture",
          });
    };
    await f.inbound();
    const runId = await f.start();
    const run = await f.complete(runId, 66000);
    const kickFacts = facts.filter((fact) => fact.kind.startsWith("kick-"));
    const post = kickFacts.find((fact) => fact.kind === "kick-post-dispatch");
    const postSettled = kickFacts.find(
      (fact) => fact.kind === "kick-post-request-settled",
    );
    const confirmation = kickFacts.find(
      (fact) => fact.kind === "kick-confirmation-dispatch",
    );
    const budget = kickFacts.find(
      (fact) => fact.kind === "kick-budget-signal-aborted",
    );
    const source = kickFacts.find(
      (fact) =>
        fact.kind === "kick-confirmation-source-aborted" &&
        fact.source === "activity-budget",
    );
    const combined = kickFacts.find(
      (fact) => fact.kind === "kick-confirmation-combined-aborted",
    );
    const settled = kickFacts.find(
      (fact) => fact.kind === "kick-confirmation-request-settled",
    );
    const termination = facts.find(
      (fact) =>
        fact.kind === "agent-termination-decided" && fact.runId === runId,
    );
    // Print raw safe facts even when a later assertion fails. A missing combination
    // is retained as a failed developer check, never repaired with a second run.
    t.diagnostic(
      JSON.stringify({
        evidenceRole: "developer-observation-wiring-only",
        runId,
        posts,
        confirmations,
        turns,
        ledger,
        kickFacts,
        termination,
        status: run.status,
        endReason: run.end_reason,
      }),
    );
    assert.equal(posts, 1);
    assert.equal(confirmations, 1);
    assert.equal(turns, 3);
    assert.ok(
      post &&
        postSettled &&
        confirmation &&
        budget &&
        source &&
        combined &&
        settled &&
        termination,
    );
    assert.equal(postSettled.responseStatus, 504);
    assert.equal(postSettled.outcome, "rejected");
    assert.equal(new Set(kickFacts.map((fact) => fact.attemptId)).size, 1);
    assert.equal(new Set(kickFacts.map((fact) => fact.stepId)).size, 1);
    assert.ok(
      kickFacts.every(
        (fact) =>
          fact.runId === runId && fact.toolUseId === "cancel-observed-kick",
      ),
    );
    assert.notEqual(post.requestId, confirmation.requestId);
    assert.equal(source.requestId, confirmation.requestId);
    assert.equal(source.fetchPending, true);
    assert.equal(combined.fetchPending, true);
    assert.equal(settled.outcome, "rejected");
    assert.deepEqual(settled.reasonMatchedSources, [
      "caller",
      "activity-budget",
    ]);
    const budgetWindow = budget.signalObservedWindowMs as [number, number];
    const sourceWindow = source.observedWindowMs as [number, number];
    assert.ok(
      ledger.find((item) => item.kind === "confirmation-received")!.at <
        budgetWindow[0],
    );
    assert.ok(budgetWindow[1] <= sourceWindow[0]);
    assert.ok(
      facts.indexOf(budget) < facts.indexOf(termination),
      "retain original signal before the later termination decision",
    );
    assert.equal(run.status, "failed");
    assert.equal(run.end_reason, "wall_clock");
    const kickStep = (await f.steps(runId)).find(
      (step) => step.tool_use_id === "cancel-observed-kick",
    )!;
    assert.match(kickStep.result_summary, /unknown/);
    assert.equal(kickStep.intent?.dispatchState, "dispatching");
    await f.automation.tick();
    assert.equal(
      posts,
      1,
      "this finite check does not prove permanent no-replay",
    );
  },
);
