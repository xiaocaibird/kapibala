import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import {
  automationFixture,
  deferred,
  delay,
  end,
  until,
} from "../support/core-automation-fixture.js";

for (const timeoutMs of [10000, 12000, 15000]) {
  test(`Agent does not start a configured ${timeoutMs}ms model turn with less than that budget`, async (t) => {
    const f = await automationFixture(t, timeoutMs);
    const activeMs = 60000 - timeoutMs + 500;
    await f.db.query(
      "INSERT INTO agent_runs(id,group_id,active_ms,history) VALUES('short-next-turn','g',$1,'[]')",
      [activeMs],
    );
    f.handlers.turn = () => end("must not be requested");
    await f.automation.tick();
    const run = await f.complete("short-next-turn");
    t.diagnostic(
      JSON.stringify({
        configuredTimeoutMs: timeoutMs,
        priorActiveMs: activeMs,
        persistedActiveMs: Number(run.active_ms),
        modelRequests: f.turns.length,
        endReason: run.end_reason,
      }),
    );
    assert.equal(f.turns.length, 0);
    assert.equal(run.status, "failed");
    assert.equal(run.end_reason, "wall_clock");
    assert.equal(run.step_count, 0);
    assert.equal(run.inflight_turn, false);
    assert.deepEqual(run.history, []);
    assert.deepEqual(await f.steps(run.id), []);
    assert.ok(
      Number(run.active_ms) >= activeMs && Number(run.active_ms) < 60000,
      "do not charge an unstarted turn or pretend all 60s were spent",
    );
  });
}

test(
  "real terminal lock can outlast 60s even after an immediate model final and an early real decision",
  { skip: process.env.AGENT_TERMINAL_LOCK_EXPERIMENT !== "1", timeout: 75000 },
  async (t) => {
    const facts: { fact: LifecycleFact; observedAt: number }[] = [];
    const f = await automationFixture(t, undefined, undefined, (ctx) => {
      ctx.testLifecycleObserver = {
        record: (fact) => facts.push({ fact, observedAt: performance.now() }),
      };
    });
    const response = deferred();
    f.handlers.turn = async () => {
      await response.promise;
      return end("completed before storage lock");
    };
    await f.inbound();
    const runId = await f.start();
    await until(async () => f.turns.length === 1);
    const created = facts.find((x) => x.fact.kind === "agent-run-created")!;
    const creation = created.fact.creationWindowMs as [number, number];
    const locker = await f.db.pool.connect();
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await locker.query("ROLLBACK");
      locker.release();
    };
    f.onCleanup(release);
    f.onCleanup(async () => response.resolve());
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
    response.resolve();
    let beforeRelease: Awaited<ReturnType<typeof f.readRun>>;
    try {
      await until(async () =>
        facts.some((x) => x.fact.kind === "agent-termination-decided"),
      );
      await until(async () =>
        Boolean(
          (
            await f.db.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM groups WHERE id=$1 FOR UPDATE%'",
            )
          ).rowCount,
        ),
      );
      await delay(Math.max(0, creation[1] + 61000 - performance.now()));
      beforeRelease = await f.readRun(runId);
      assert.equal(
        beforeRelease.status,
        "running",
        "no fabricated terminal while its transaction is blocked",
      );
      assert.equal(
        (await f.steps(runId)).length,
        1,
        "the actual final step/history remains stored",
      );
    } finally {
      await release();
    }
    const run = await f.complete(runId);
    const decision = facts.find(
      (x) => x.fact.kind === "agent-termination-decided",
    )!;
    const committed = facts.find(
      (x) => x.fact.kind === "agent-terminal-committed",
    )!;
    const decisionWindow = decision.fact.decisionWindowMs as [number, number];
    const decisionElapsedMs = [
      decisionWindow[0] - creation[1],
      decisionWindow[1] - creation[0],
    ];
    const commitElapsedMs = [
      committed.observedAt - creation[1],
      committed.observedAt - creation[0],
    ];
    t.diagnostic(
      JSON.stringify({
        case: "unbounded-terminal-lock",
        runId,
        creationWindowMs: creation,
        decisionWindowMs: decisionWindow,
        decisionElapsedMs,
        commitElapsedMs,
        persistedActiveMs: Number(run.active_ms),
        history: run.history,
        status: run.status,
        endReason: run.end_reason,
        modelRequests: f.turns.length,
        strictCommit60000Result: "FAIL",
        evidenceRole:
          "one real-time developer storage-boundary counterexample; not a QA pass",
      }),
    );
    assert.ok(
      decisionElapsedMs[1]! < 5000,
      "the run had most of its budget left when it actually decided to finish",
    );
    assert.ok(commitElapsedMs[0]! > 60000, "retain the actual storage tail");
    assert.ok(Number(run.active_ms) > 60000, "no active_ms clipping");
    assert.equal(run.status, "finished");
    assert.equal(run.end_reason, "final");
    assert.equal(f.turns.length, 1);
    assert.equal(f.audits.length, 0);
    assert.equal(f.gatewayRequests.length, 0);
  },
);
