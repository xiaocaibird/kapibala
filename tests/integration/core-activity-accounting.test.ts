import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ActivityClock } from "../../apps/server/src/modules/automation/activity-clock.js";
import {
  automationFixture,
  delay,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

type Fixture = Awaited<ReturnType<typeof automationFixture>>;
async function installClockFault(f: Fixture, enabled: boolean) {
  await f.db.query("CREATE TABLE checkpoint_fault(enabled boolean NOT NULL)");
  await f.db.query("INSERT INTO checkpoint_fault VALUES($1)", [enabled]);
  await f.db.query(
    "CREATE FUNCTION reject_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT enabled FROM checkpoint_fault) THEN RAISE EXCEPTION 'injected activity checkpoint failure'; END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER reject_checkpoint BEFORE UPDATE OF active_ms,activity_updated_at ON agent_runs FOR EACH ROW EXECUTE FUNCTION reject_checkpoint()",
  );
  f.onCleanup(async () => {
    await f.db.query("UPDATE checkpoint_fault SET enabled=false");
  });
}

test("checkpoint connection-pool exhaustion rejects and late checkout returns without reviving the stage", async (t) => {
  const f = await automationFixture(t);
  const clock = new ActivityClock(f.ctx);
  f.onCleanup(() => clock.close());
  await clock.start();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('pool-run','g')",
  );
  const held = await Promise.all(
    Array.from({ length: 19 }, () => f.db.pool.connect()),
  );
  const began = performance.now();
  try {
    await assert.rejects(
      clock.checkpoint("pool-run", "pool-exhaustion"),
      /acquisition timed out/,
    );
    const elapsedMs = performance.now() - began;
    assert.ok(
      elapsedMs >= 1400 && elapsedMs < 2300,
      `pool wait ${elapsedMs}ms`,
    );
    t.diagnostic(JSON.stringify({ poolWaitMs: elapsedMs }));
  } finally {
    held.forEach((client) => client.release());
  }
  await until(async () => f.db.pool.waitingCount === 0);
  await clock.checkpoint("pool-run", "after-pool-recovery");
});

test("blocked checkpoint query destroys its owning lease before another owner resumes", async (t) => {
  const f = await automationFixture(t);
  const clock = new ActivityClock(f.ctx);
  f.onCleanup(() => clock.close());
  await clock.start();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('blocked-run','g')",
  );
  const blocker = await f.db.pool.connect();
  const began = performance.now();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT id FROM agent_runs WHERE id='blocked-run' FOR UPDATE",
    );
    await assert.rejects(
      clock.checkpoint("blocked-run", "blocked-write"),
      /timeout|timed out|1500ms/i,
    );
    const elapsedMs = performance.now() - began;
    await clock.close();
    const locks = await blocker.query(
      "SELECT pid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295) AND objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND granted",
    );
    assert.equal(locks.rowCount, 0);
    assert.ok(
      elapsedMs >= 1100 && elapsedMs < 2000,
      `blocked query ${elapsedMs}ms`,
    );
    t.diagnostic(
      JSON.stringify({
        blockedQueryWaitMs: elapsedMs,
        remainingOwners: locks.rowCount,
      }),
    );
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  const next = new ActivityClock(f.ctx);
  f.onCleanup(() => next.close());
  await next.start();
  await next.checkpoint("blocked-run", "takeover");
});

test("continuous targeted wakes leave periodic accounting available for queued runs", async (t) => {
  const f = await automationFixture(t);
  const clock = new ActivityClock(f.ctx);
  f.onCleanup(() => clock.close());
  await clock.start();
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('queued-group','remote-queued','account-1')",
  );
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('busy-run','g'),('queued-run','queued-group')",
  );
  await f.db.query(
    "CREATE FUNCTION slow_busy_sample() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='busy-run' THEN PERFORM pg_sleep(0.06); END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER slow_busy_sample BEFORE UPDATE OF active_ms ON agent_runs FOR EACH ROW EXECUTE FUNCTION slow_busy_sample()",
  );
  let notifications = 0;
  const began = performance.now();
  while (performance.now() - began < 1200) {
    await f.db.query("SELECT pg_notify('kapibala_activity_checkpoint',$1)", [
      JSON.stringify({ schema: "public", runId: "busy-run" }),
    ]);
    notifications++;
    await delay(5);
  }
  const queued = (
    await f.db.query<{ active_ms: string }>(
      "SELECT active_ms FROM agent_runs WHERE id='queued-run'",
    )
  ).rows[0]!;
  assert.ok(
    Number(queued.active_ms) >= 600,
    `queued run starved at ${queued.active_ms}ms`,
  );
  assert.ok(Number(queued.active_ms) < 1500);
  t.diagnostic(
    JSON.stringify({
      notifications,
      elapsedMs: performance.now() - began,
      queuedActiveMs: Number(queued.active_ms),
    }),
  );
});

test("an unresponsive owner cannot acknowledge a follower checkpoint, then takeover excludes the outage", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('clock-run','g')",
  );
  const child = fork(
    fileURLToPath(
      new URL("../support/activity-clock-process.ts", import.meta.url),
    ),
    [],
    {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, CLOCK_TEST_DATABASE_URL: f.url },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  const messages: { type: string }[] = [];
  let stderr = "";
  child.stderr!.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("message", (message) => messages.push(message as { type: string }));
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  };
  f.onCleanup(stop);
  await until(async () => {
    assert.equal(child.exitCode, null, stderr);
    return messages.some((message) => message.type === "ready");
  });
  const follower = new ActivityClock(f.ctx);
  f.onCleanup(() => follower.close());
  await follower.start();
  child.send("block");
  await until(async () =>
    messages.some((message) => message.type === "blocked"),
  );
  const before = Number(
    (
      await f.db.query<{ active_ms: string }>(
        "SELECT active_ms FROM agent_runs WHERE id='clock-run'",
      )
    ).rows[0]!.active_ms,
  );
  const began = performance.now();
  await assert.rejects(
    follower.checkpoint("clock-run", "unresponsive-owner"),
    /1500ms|timeout|timed out/i,
  );
  const elapsedMs = performance.now() - began;
  assert.ok(elapsedMs >= 1400 && elapsedMs < 2300);
  await stop();
  await delay(100);
  await follower.start();
  await follower.checkpoint("clock-run", "replacement-owner");
  const after = Number(
    (
      await f.db.query<{ active_ms: string }>(
        "SELECT active_ms FROM agent_runs WHERE id='clock-run'",
      )
    ).rows[0]!.active_ms,
  );
  assert.ok(
    after >= before && after - before < 400,
    `takeover billed unobserved interval: ${after - before}ms`,
  );
  t.diagnostic(
    JSON.stringify({
      unresponsiveOwnerWaitMs: elapsedMs,
      beforeActiveMs: before,
      afterActiveMs: after,
      caveat: "hard termination still loses the unpersisted online tail",
    }),
  );
});
function checkpointFailures(f: Fixture) {
  const failures: { phase?: string; elapsedMs?: number }[] = [];
  f.ctx.log.error = ((value: { phase?: string; elapsedMs?: number }) => {
    if (value?.phase) failures.push(value);
  }) as typeof f.ctx.log.error;
  return failures;
}

test("activity checkpoints persist a completed model wait shorter than the sampling interval", async (t) => {
  const f = await automationFixture(t);
  let began = 0;
  let responded = 0;
  f.handlers.turn = async () => {
    began = performance.now();
    await delay(140);
    responded = performance.now();
    return end("short completed turn");
  };
  await f.inbound();
  const id = await f.start();
  const run = await f.complete(id);
  const activeMs = Number(run.active_ms);
  const modelWaitMs = responded - began;
  t.diagnostic(JSON.stringify({ activeMs, modelWaitMs }));
  assert.equal(run.status, "finished");
  assert.ok(
    activeMs >= modelWaitMs - 10,
    `completed model wait was not persisted: ${activeMs}ms for ${modelWaitMs}ms`,
  );
  assert.ok(
    activeMs < modelWaitMs + 200,
    "checkpoint must bill elapsed time without reserving future budget",
  );
});

test("activity checkpoints persist audit waiting and a follower wakes only the shared owner", async (t) => {
  const f = await automationFixture(t);
  const owner = new ActivityClock(f.ctx);
  f.onCleanup(() => owner.close());
  await owner.start();
  await f.db.query(
    "CREATE TABLE clock_writes(pid integer,active_ms bigint,previous_ms bigint)",
  );
  await f.db.query(
    "CREATE FUNCTION record_clock_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO clock_writes VALUES(pg_backend_pid(),NEW.active_ms,OLD.active_ms); RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER record_clock_write AFTER UPDATE OF active_ms ON agent_runs FOR EACH ROW EXECUTE FUNCTION record_clock_write()",
  );
  const ownerPid = (
    await f.db.query<{ pid: number }>(
      "SELECT pid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295) AND objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND granted",
    )
  ).rows[0]!.pid;
  let auditWaitMs = 0;
  f.handlers.turn = () =>
    f.turns.length === 1
      ? tool("audit-wait", "send_message", {
          text: "must be rejected",
          idempotency_key: "audit-wait",
        })
      : end();
  f.handlers.audit = async () => {
    const began = performance.now();
    await delay(140);
    auditWaitMs = performance.now() - began;
    return { verdict: "fail", reason: "denied" };
  };
  await f.inbound();
  const began = performance.now();
  const id = await f.start();
  const run = await f.complete(id);
  const elapsedMs = performance.now() - began;
  const writers = (
    await f.db.query<{ pid: number }>("SELECT DISTINCT pid FROM clock_writes")
  ).rows.map((row) => row.pid);
  assert.deepEqual(
    writers,
    [ownerPid],
    "follower must not write or double-count clock activity",
  );
  assert.equal(run.status, "finished");
  assert.ok(Number(run.active_ms) >= auditWaitMs - 10);
  assert.ok(
    Number(run.active_ms) <= elapsedMs + 20,
    "multiple checkpoints must not reserve or double-count time",
  );
  assert.ok(
    elapsedMs < 800,
    "notify must avoid waiting for each natural 500ms sample",
  );
  assert.equal(f.audits.length, 1);
  assert.equal(
    (await f.db.query("SELECT 1 FROM messages WHERE is_own")).rowCount,
    0,
  );
  t.diagnostic(
    JSON.stringify({
      auditWaitMs,
      elapsedMs,
      activeMs: Number(run.active_ms),
      writers,
      ownerPid,
    }),
  );
});

for (const phase of [
  "model:before",
  "model:after",
  "audit:before",
  "audit:after",
]) {
  test(`activity checkpoint failure at ${phase} blocks the next remote or durable stage`, async (t) => {
    const f = await automationFixture(t);
    const failures = checkpointFailures(f);
    await installClockFault(f, phase === "model:before");
    if (phase === "audit:before") {
      await f.db.query(
        "CREATE FUNCTION arm_audit_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE checkpoint_fault SET enabled=true; RETURN NEW; END $$",
      );
      await f.db.query(
        "CREATE TRIGGER arm_audit_checkpoint AFTER INSERT ON agent_steps FOR EACH ROW EXECUTE FUNCTION arm_audit_checkpoint()",
      );
    }
    f.handlers.turn = async () => {
      if (phase === "model:after")
        await f.db.query("UPDATE checkpoint_fault SET enabled=true");
      return tool("guarded-tool", "send_message", {
        text: "no unbilled side effect",
        idempotency_key: "guarded-tool",
      });
    };
    f.handlers.audit = async () => {
      if (phase === "audit:after")
        await f.db.query("UPDATE checkpoint_fault SET enabled=true");
      return {
        verdict: "pass",
        reason: "permission alone cannot bypass accounting",
      };
    };
    await f.inbound();
    const id = await f.start();
    await until(async () =>
      failures.some((failure) => failure.phase === phase),
    );
    const run = await f.readRun(id);
    const steps = await f.steps(id);
    assert.equal(run.status, "running");
    assert.equal(
      run.protocol_errors,
      0,
      "accounting failure must not become model protocol failure",
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM messages WHERE is_own")).rowCount,
      0,
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM agent_send_keys")).rowCount,
      0,
    );
    if (phase.startsWith("model:")) {
      assert.equal(f.turns.length, phase === "model:before" ? 0 : 1);
      assert.equal(run.inflight_turn, phase === "model:after");
      assert.equal(steps.length, 0);
      assert.equal(f.audits.length, 0);
    } else {
      assert.equal(f.turns.length, 1);
      assert.equal(f.audits.length, phase === "audit:before" ? 0 : 1);
      assert.equal(steps[0]!.audit_attempts, phase === "audit:before" ? 0 : 1);
      assert.equal(steps[0]!.audit_verdict, null);
      assert.notEqual(steps[0]!.state, "complete");
    }
    t.diagnostic(
      JSON.stringify({
        phase,
        turns: f.turns.length,
        audits: f.audits.length,
        inflightTurn: run.inflight_turn,
        steps: steps.length,
        activeMs: Number(run.active_ms),
        elapsedMs: failures.find((failure) => failure.phase === phase)
          ?.elapsedMs,
      }),
    );
  });
}
