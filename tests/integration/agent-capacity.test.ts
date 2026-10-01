import assert from "node:assert/strict";
import { test } from "node:test";
import { LockCapacityUnavailableError } from "../../apps/server/src/core/db.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  deferred,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

async function saturatedKick(
  t: Parameters<typeof automationFixture>[0],
  activeMs = 0,
) {
  let kicks = 0;
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", async () => {
      kicks++;
      return { kicked: true };
    });
    remote.get("/groups/remote-g/members", async () => []);
  });
  const audited = deferred();
  const auditResponse = deferred();
  const release = deferred();
  const firstKickAttempt = deferred();
  const refusals: number[] = [];
  const kick = Messages.prototype.kick;
  Messages.prototype.kick = async function (...args) {
    try {
      return await kick.apply(this, args);
    } catch (error) {
      if (error instanceof LockCapacityUnavailableError)
        refusals.push(performance.now());
      throw error;
    } finally {
      firstKickAttempt.resolve();
    }
  };
  let holders: Promise<unknown>[] = [];
  f.onCleanup(async () => {
    Messages.prototype.kick = kick;
    auditResponse.resolve();
    release.resolve();
    await Promise.allSettled(holders);
  });
  f.handlers.turn = () =>
    f.turns.length === 1
      ? tool("kick-one", "kick_user", {
          platform_user_id: "external-target",
          reason: "capacity regression",
        })
      : end();
  f.handlers.audit = async () => {
    audited.resolve();
    await auditResponse.promise;
    return { verdict: "pass", reason: "approved" };
  };
  if (activeMs > 0)
    await f.preparedTool(
      "capacity-run",
      activeMs,
      tool("kick-one", "kick_user", {
        platform_user_id: "external-target",
        reason: "capacity regression",
      }).content[0]!,
    );
  else
    await f.db.query(
      "INSERT INTO agent_runs(id,group_id,history,active_ms) VALUES('capacity-run','g','[]',$1)",
      [activeMs],
    );
  const startedAt = performance.now();
  await f.automation.tick();
  await audited.promise;
  let admitted = 0;
  holders = Array.from({ length: 7 }, (_, index) =>
    f.db.withLock(`capacity-blocker:${index}`, async () => {
      admitted++;
      await release.promise;
    }),
  );
  await until(async () => admitted === 7);
  auditResponse.resolve();
  await firstKickAttempt.promise;
  const id = "capacity-run";
  await until(async () => (await f.steps(id))[0]?.state === "ready").catch(
    async (cause: unknown) => {
      throw new Error(
        `Capacity refusal must leave the audited step ready: ${JSON.stringify(await f.steps(id))}`,
        { cause },
      );
    },
  );
  return {
    ...f,
    id,
    startedAt,
    refusals,
    kicks: () => kicks,
    release: async () => {
      release.resolve();
      await Promise.all(holders);
    },
  };
}

test("Agent kick waits for local capacity without failing, repeating audit, or dispatching twice", async (t) => {
  const f = await saturatedKick(t);
  const run = await f.readRun(f.id);
  const [pending] = await f.steps(f.id);
  assert.equal(run.status, "running");
  assert.equal(run.recovery_note, null);
  assert.equal(run.step_count, 1);
  assert.equal(pending!.error_code, null);
  assert.equal(pending!.intent, null);
  assert.equal(pending!.audit_attempts, 1);
  assert.equal(f.kicks(), 0);
  assert.equal(f.turns.length, 1);
  await f.release();
  assert.equal((await f.complete(f.id)).status, "finished");
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits.length, 1);
  assert.equal(f.turns.length, 2);
  assert.equal((await f.steps(f.id))[0]!.is_error, false);
  await f.automation.tick();
  assert.equal(f.kicks(), 1);
});

test("Agent stops a real capacity wait when the first kick stage no longer fits, without inventing an unknown effect", async (t) => {
  const priorActiveMs = 41800;
  const f = await saturatedKick(t, priorActiveMs);
  const savedHistory = (await f.readRun(f.id)).history;
  await until(
    async () => (await f.readRun(f.id)).status !== "running",
    2500,
  ).catch(() => {});
  const completed = await f.readRun(f.id);
  t.diagnostic(
    JSON.stringify({
      case: "capacity-first-kick-stage",
      priorActiveMs,
      firstRefusalElapsedMs: f.refusals[0]! - f.startedAt,
      refusalCount: f.refusals.length,
      waitBetweenRefusalsMs: f.refusals.at(-1)! - f.refusals[0]!,
      elapsedMs: performance.now() - f.startedAt,
      status: completed.status,
      endReason: completed.end_reason,
      persistedActiveMs: Number(completed.active_ms),
      modelRequests: f.turns.length,
      audits: f.audits.length,
      kicks: f.kicks(),
    }),
  );
  assert.ok(
    f.refusals.length >= 2,
    "must actually refuse capacity and continue waiting",
  );
  assert.ok(
    f.refusals[0]! - f.startedAt < 1200,
    "first refusal precedes the 17s admission threshold (15s POST plus 2s settlement)",
  );
  assert.ok(
    f.refusals.at(-1)! - f.refusals[0]! > 500,
    "wait real time across the threshold",
  );
  assert.deepEqual(
    completed.history,
    savedHistory,
    "retain the recorded tool_use without a fabricated tool_result",
  );
  assert.ok(
    Number(completed.active_ms) >= 43000 && Number(completed.active_ms) < 46000,
    "bill the real wait; do not consume or clip to 60000",
  );
  assert.equal(completed.status, "failed");
  assert.equal(completed.end_reason, "wall_clock");
  assert.equal(completed.recovery_note, null);
  assert.equal(completed.step_count, 1);
  const [step] = await f.steps(f.id);
  assert.equal(step!.state, "executing");
  assert.equal(step!.intent?.dispatchState, "awaiting_admission");
  assert.equal(step!.error_code, null);
  assert.equal(f.kicks(), 0);
  assert.equal(f.audits.length, 1);
  await f.release();
  await f.automation.tick();
  assert.equal(f.kicks(), 0);
});

test("Agent rechecks kick policy after capacity refusal and preserves the recorded audit", async (t) => {
  const f = await saturatedKick(t);
  await f.db.query("UPDATE groups SET auto_kick_enabled=false WHERE id='g'");
  await f.release();
  assert.equal((await f.complete(f.id)).status, "finished");
  assert.equal((await f.steps(f.id))[0]!.error_code, "POLICY_DENIED");
  assert.equal(f.audits.length, 1);
  assert.equal(f.kicks(), 0);
});

test("Agent cancellation while waiting for capacity ends after the current step without another turn", async (t) => {
  const f = await saturatedKick(t);
  await f.db.query("UPDATE groups SET status='unreachable' WHERE id='g'");
  await f.db.query("UPDATE agent_runs SET cancel_requested=true WHERE id=$1", [
    f.id,
  ]);
  await f.release();
  const completed = await f.complete(f.id);
  assert.equal(completed.status, "cancelled");
  assert.equal(completed.end_reason, "cancelled");
  assert.equal(completed.recovery_note, null);
  assert.equal((await f.steps(f.id))[0]!.error_code, "GROUP_UNREACHABLE");
  assert.equal(f.turns.length, 1);
  assert.equal(f.kicks(), 0);
});

test("pending kick cancellation retains current-step budget precedence while capacity never arrives", async (t) => {
  const f = await saturatedKick(t, 41800);
  await f.db.query("UPDATE agent_runs SET cancel_requested=true WHERE id=$1", [
    f.id,
  ]);
  const run = await f.complete(f.id, 2500);
  const [step] = await f.steps(f.id);
  assert.ok(f.refusals.length >= 2);
  assert.equal(run.cancel_requested, true);
  assert.equal(run.status, "failed");
  assert.equal(run.end_reason, "wall_clock");
  assert.equal(step?.state, "executing");
  assert.equal(step?.intent?.dispatchState, "awaiting_admission");
  assert.equal(step?.error_code, null);
  assert.equal(f.audits.length, 1);
  assert.equal(f.kicks(), 0);
  await f.release();
});
