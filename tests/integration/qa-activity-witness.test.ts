import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import {
  ActivityWitness,
  type ActivityRequest,
} from "../../scripts/qa-runtime-observation/activity-witness.js";
import type { ActivityTransitionEvidence } from "../../apps/server/src/core/test-activity-observer.js";
import type { Binding } from "../../scripts/qa-capacity/protocol.js";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";
import {
  automationFixture,
  deferred,
  delay,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

async function fixture(t: TestContext, rejectPauseObservation = false) {
  let witness!: ActivityWitness;
  const f = await automationFixture(t, undefined, undefined, (ctx) => {
    witness = new ActivityWitness(ctx.db);
    ctx.testActivityObserver = witness;
    if (rejectPauseObservation)
      ctx.testLifecycleObserver = {
        record(fact) {
          if (fact.kind === "agent-activity-pause-committed")
            throw new Error("controlled recorder failure");
        },
      };
  });
  f.onCleanup(() => witness.close());
  await f.app.listen({ host: "127.0.0.1", port: 0 });
  const binding: Binding = {
    apiUrl: f.app.listeningOrigin,
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    pid: process.pid,
    observedOwnerToken: randomUUID(),
  };
  async function arm(
    runId: string,
    mode: ActivityRequest["mode"] = "observe-activity",
    ttlMs = 10000,
  ) {
    const id = randomUUID();
    const request: ActivityRequest = {
      protocol: "qa-runtime-observation/1",
      target: {
        apiUrl: binding.apiUrl,
        revision: binding.revision,
        pid: binding.pid,
      },
      mode,
      ttlMs,
      correlation: {
        kind: "activity",
        groupId: "g",
        runId,
        toolUseId: "all-run-steps",
      },
    };
    const snapshot = await witness.establish(
      id,
      request,
      new Date(Date.now() + ttlMs).toISOString(),
      binding,
    );
    return { id, request, snapshot };
  }
  async function startRead() {
    const response = deferred();
    f.onCleanup(async () => response.resolve());
    f.handlers.turn = async () => {
      if (f.turns.length === 1) {
        await response.promise;
        return tool("read-one", "get_recent_messages", { limit: 1 });
      }
      return end("continued after durable read");
    };
    await f.inbound();
    const id = await f.start();
    await until(async () => f.turns.length === 1);
    return { id, response };
  }
  return { ...f, witness, binding, arm, startRead };
}

test("activity witness keeps pre-lease creation time and holds only a committed read continuation", async (t) => {
  const f = await fixture(t);
  const { id, response } = await f.startRead();
  await delay(100);
  const observation = await f.arm(id);
  const first = observation.snapshot.events[0]!;
  assert.equal(first.includesUnsavedTail, true);
  assert.equal(first.activityState, "active");
  assert.ok((first.activeElapsedMs as number[])[0]! >= 80);
  const hold = await f.arm(id, "hold-safe-activity-boundary");
  assert.equal((await f.witness.advance(hold.id)).state, "armed");
  await assert.rejects(f.arm(id, "hold-safe-activity-boundary"), /already has/);
  response.resolve();
  await until(async () => f.witness.snapshot(hold.id).state === "held");
  const held = f.witness.snapshot(hold.id);
  const safe = held.events.find(
    (event) => event.kind === "activity-safe-held",
  )!;
  assert.equal(safe.continuationDurable, true);
  assert.equal(safe.remoteInFlightCount, 0);
  assert.equal(safe.includesUnsavedTail, true);
  const run = await f.readRun(id);
  assert.equal(run.inflight_turn, false);
  assert.equal((await f.steps(id))[0]!.state, "complete");
  assert.equal(run.history.at(-1)!.content[0]!.type, "tool_result");
  assert.equal(f.turns.length, 1);
  await until(
    async () =>
      (
        f.witness.snapshot(hold.id).events.at(-1)!.activeElapsedMs as number[]
      )[0]! >
        (safe.activeElapsedMs as number[])[1]! + 400 &&
      Number((await f.readRun(id)).active_ms) > Number(run.active_ms) + 400,
  );
  const later = f.witness.snapshot(hold.id);
  assert.equal(later.state, "held");
  assert.deepEqual(later.events.slice(0, held.events.length), held.events);
  assert.ok(
    (later.events.at(-1)!.activeElapsedMs as number[])[0]! >
      (safe.activeElapsedMs as number[])[1]! + 400,
  );
  assert.ok(
    Number((await f.readRun(id)).active_ms) > Number(run.active_ms) + 400,
  );
  await f.witness.advance(hold.id);
  await f.witness.advance(hold.id);
  assert.equal((await f.complete(id)).status, "finished");
  const terminal = f.witness.snapshot(observation.id).events.at(-1)!;
  assert.equal(terminal.kind, "activity-terminal");
  assert.equal(terminal.activityState, "terminal");
  assert.equal(terminal.includesUnsavedTail, true);
  const transitions =
    terminal.transitionEvidence as ActivityTransitionEvidence[];
  assert.deepEqual(
    transitions.map((x) => x.phase),
    ["creation", "terminal"],
  );
  for (const transition of transitions) {
    const facts = transition.transactionBoundaries;
    assert.equal(new Set(facts.map((x) => x.transactionAttemptId)).size, 1);
    assert.ok(
      facts.every(
        (x) => x.backendPid !== null && x.windowMs[1] >= x.windowMs[0],
      ),
    );
    assert.equal(facts[0]!.phase, "begin");
    assert.equal(facts[0]!.edge, "called");
    assert.equal(facts.at(-1)!.phase, "commit");
    assert.equal(facts.at(-1)!.edge, "returned");
  }
  const creation = transitions[0]!.transactionBoundaries;
  assert.ok(
    creation.some((x) => x.phase === "run-insert" && x.edge === "returned"),
  );
  const begin = creation.find(
    (x) => x.phase === "begin" && x.edge === "returned",
  )!;
  const broadStart = terminal.creationOrEpochStartWindowMs as [number, number];
  assert.ok(
    begin.windowMs[0] >= broadStart[0] && begin.windowMs[1] <= broadStart[1],
  );
  assert.ok(
    transitions[1]!.transactionBoundaries.some(
      (x) => x.phase === "run-terminal-update" && x.edge === "returned",
    ),
  );
  assert.equal(f.turns.length, 2);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal((await f.witness.release(hold.id)).state, "released");
  assert.equal((await f.witness.release(hold.id)).state, "released");
  t.diagnostic(
    JSON.stringify({
      safe,
      terminal,
      limitation:
        "same-process monotonic creation-to-terminal brackets; not a 60-second acceptance result",
    }),
  );
});

test("safe activity lease TTL releases the actual wait while the product clock keeps billing it", async (t) => {
  const f = await fixture(t);
  const { id, response } = await f.startRead();
  const observed = await f.arm(id);
  const held = await f.arm(id, "hold-safe-activity-boundary", 5000);
  response.resolve();
  await until(async () => f.witness.snapshot(held.id).state === "held");
  assert.equal((await f.complete(id, 6500)).status, "finished");
  assert.equal(f.witness.snapshot(held.id).state, "released");
  assert.equal(f.turns.length, 2);
  const terminal = f.witness.snapshot(observed.id).events.at(-1)!;
  assert.equal(terminal.kind, "activity-terminal");
  assert.ok((terminal.activeElapsedMs as number[])[0]! >= 4900);
  t.diagnostic(
    JSON.stringify({ terminal, holdState: f.witness.snapshot(held.id).state }),
  );
});

test("DELETE releases only its matched safe wait without deleting historical events", async (t) => {
  const f = await fixture(t);
  const { id, response } = await f.startRead();
  const observation = await f.arm(id);
  const held = await f.arm(id, "hold-safe-activity-boundary");
  response.resolve();
  await until(async () => f.witness.snapshot(held.id).state === "held");
  const history = f.witness.snapshot(held.id).events;
  await f.witness.release(held.id);
  assert.equal((await f.complete(id)).status, "finished");
  assert.deepEqual(f.witness.snapshot(held.id).events, history);
  assert.equal(f.witness.snapshot(observation.id).state, "armed");
  assert.equal(
    f.witness.snapshot(observation.id).events.at(-1)!.kind,
    "activity-terminal",
  );
});

test("loss of the real run lock invalidates a safe hold before a new worker may resume", async (t) => {
  const f = await fixture(t);
  const { id, response } = await f.startRead();
  const hold = await f.arm(id, "hold-safe-activity-boundary");
  response.resolve();
  await until(async () => f.witness.snapshot(hold.id).state === "held");
  const killed = await f.db.query(
    "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended($1,0)>>32)&4294967295) AND objid::bigint=(hashtextextended($1,0)&4294967295) AND granted",
    [`agent:${id}`],
  );
  assert.equal(killed.rowCount, 1);
  await until(async () => f.witness.snapshot(hold.id).state !== "held");
  const invalid = f.witness.snapshot(hold.id).events.at(-1)!;
  assert.equal(invalid.activityState, "unknown");
  assert.equal(invalid.includesUnsavedTail, false);
  assert.equal(invalid.activeElapsedMs, undefined);
  assert.equal(f.turns.length, 1);
  await until(async () => {
    await f.automation.tick();
    return (await f.readRun(id)).status !== "running";
  });
  assert.equal((await f.readRun(id)).status, "finished");
  assert.equal(f.turns.length, 2);
  assert.equal(
    f.witness.snapshot(hold.id).events.at(-1)!.includesUnsavedTail,
    false,
  );
});

test("loss of the clock owner invalidates completeness instead of treating a rebased epoch as continuous", async (t) => {
  const f = await fixture(t);
  const { id, response } = await f.startRead();
  const observation = await f.arm(id);
  const hold = await f.arm(id, "hold-safe-activity-boundary");
  response.resolve();
  await until(async () => f.witness.snapshot(hold.id).state === "held");
  const killed = await f.db.query(
    "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295) AND objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND granted",
  );
  assert.equal(killed.rowCount, 1);
  await until(async () =>
    f.witness
      .snapshot(observation.id)
      .events.some((event) => event.activityState === "unknown"),
  );
  assert.equal(f.witness.snapshot(hold.id).state, "held");
  assert.equal(f.turns.length, 1);
  await f.automation.tick();
  assert.equal(f.witness.snapshot(hold.id).state, "held");
  await f.witness.advance(hold.id);
  await f.complete(id);
  const events = f.witness.snapshot(observation.id).events;
  assert.ok(
    events.some(
      (event) =>
        event.activityState === "unknown" &&
        event.includesUnsavedTail === false,
    ),
  );
  const terminal = events.at(-1)!;
  assert.equal(terminal.kind, "activity-terminal");
  assert.equal(terminal.includesUnsavedTail, false);
  assert.equal(terminal.activeElapsedMs, undefined);
  assert.equal((terminal.epochIds as unknown[]).length, 2);
});

test("pre-existing inflight work reports the real recovery pause with incomplete earlier activity", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,inflight_turn) VALUES('unrecorded-response','g',true)",
  );
  const observation = await f.arm("unrecorded-response");
  const hold = await f.arm(
    "unrecorded-response",
    "hold-safe-activity-boundary",
  );
  await f.automation.tick();
  await until(async () =>
    Boolean((await f.readRun("unrecorded-response")).recovery_note),
  );
  const latest = f.witness.snapshot(observation.id).events.at(-1)!;
  assert.equal(latest.activityState, "recovery-paused");
  const pausedFacts = (
    latest.transitionEvidence as ActivityTransitionEvidence[]
  ).at(-1)!;
  assert.equal(pausedFacts.phase, "pause");
  assert.equal(pausedFacts.pauseCause, "unrecorded-model-response");
  assert.ok(
    pausedFacts.transactionBoundaries.some(
      (x) => x.phase === "run-pause-update" && x.edge === "returned",
    ),
  );
  assert.equal(pausedFacts.transactionBoundaries.at(-1)!.phase, "commit");
  assert.equal(pausedFacts.transactionBoundaries.at(-1)!.edge, "returned");
  assert.equal(latest.includesUnsavedTail, false);
  assert.equal(latest.activeElapsedMs, undefined);
  assert.equal(f.witness.snapshot(hold.id).state, "armed");
  assert.equal(f.turns.length, 0);
  assert.equal(
    (latest.epochObservation as { continuous: boolean }).continuous,
    false,
  );
  await f.db.query(
    "UPDATE agent_runs SET cancel_requested=true WHERE id='unrecorded-response'",
  );
  await f.automation.tick();
  await until(
    async () => (await f.readRun("unrecorded-response")).status === "cancelled",
  );
  // The original leases retain the witness. A later subscriber has no pause
  // event in its own history, so the witness-level continuity flag must survive.
  const late = await f.arm("unrecorded-response");
  assert.equal(late.snapshot.events.length, 1);
  assert.equal(late.snapshot.events[0]!.kind, "activity-terminal");
  assert.equal(
    (late.snapshot.events[0]!.epochObservation as { continuous: boolean })
      .continuous,
    false,
  );
  t.diagnostic(
    JSON.stringify({
      latest,
      qaCompatibility:
        "Current QA requires activeElapsedMs even when incomplete, so this honest partial witness is BLOCKED at schema validation.",
    }),
  );
});

test("audit-blocked commits publish terminal activity without relying on Agent.finish", async (t) => {
  const f = await fixture(t);
  const reply = deferred();
  f.onCleanup(async () => reply.resolve());
  f.handlers.turn = async () => {
    await reply.promise;
    return tool("blocked-send", "send_message", {
      text: "blocked",
      idempotency_key: "blocked",
    });
  };
  f.handlers.audit = () => ({ reason: "no verdict" });
  await f.inbound();
  const id = await f.start();
  const observed = await f.arm(id);
  reply.resolve();
  assert.equal((await f.complete(id)).status, "blocked");
  const terminal = f.witness.snapshot(observed.id).events.at(-1)!;
  assert.equal(terminal.kind, "activity-terminal");
  assert.equal(terminal.includesUnsavedTail, true);
  await delay(550);
  assert.deepEqual(f.witness.snapshot(observed.id).events.at(-1), terminal);
  assert.equal(f.gatewayRequests.length, 0);
});

test("a rolled-back creation transaction cannot publish a run creation witness", async (t) => {
  const f = await fixture(t);
  let created = 0;
  const original = f.witness.runCreated.bind(f.witness);
  f.witness.runCreated = (...args) => {
    created++;
    original(...args);
  };
  await f.db.query(
    "CREATE FUNCTION reject_created_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='agent_run' THEN RAISE EXCEPTION 'fail outer create commit'; END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER reject_created_event BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION reject_created_event()",
  );
  await f.inbound();
  await assert.rejects(f.automation.tick(), /fail outer create commit/);
  assert.equal(created, 0);
  assert.equal((await f.db.query("SELECT * FROM agent_runs")).rowCount, 0);
  assert.equal(f.turns.length, 0);
});

test("subscribing to an already paused run never bills the pause before its later cancellation", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,recovery_note) VALUES('already-paused','g','Unrecorded prior response')",
  );
  const observed = await f.arm("already-paused");
  const first = observed.snapshot.events.at(-1)!;
  assert.equal(first.activityState, "recovery-paused");
  await delay(120);
  await f.db.query(
    "UPDATE agent_runs SET cancel_requested=true WHERE id='already-paused'",
  );
  await f.automation.tick();
  const terminal = f.witness.snapshot(observed.id).events.at(-1)!;
  assert.equal(terminal.kind, "activity-terminal");
  assert.deepEqual(terminal.observedEpochActiveMs, first.observedEpochActiveMs);
  assert.equal(terminal.activeElapsedMs, undefined);
  assert.equal(terminal.includesUnsavedTail, false);
});

test("a delayed notification of real clock acquisition cannot overwrite a newer committed recovery pause", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,inflight_turn) VALUES('pause-before-owner-notice','g',true)",
  );
  const observed = await f.arm("pause-before-owner-notice");
  const original = f.witness.clockAcquired.bind(f.witness);
  let notification: Parameters<typeof original> | undefined;
  f.witness.clockAcquired = (...args) => {
    notification = args;
  };
  await f.db.query(
    "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295) AND objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND granted",
  );
  await until(async () =>
    f.witness
      .snapshot(observed.id)
      .events.some((event) => event.activityState === "unknown"),
  );
  await f.automation.tick();
  await until(async () =>
    Boolean((await f.readRun("pause-before-owner-notice")).recovery_note),
  );
  assert.ok(notification, "A real rebase COMMIT must have completed");
  assert.equal(
    f.witness.snapshot(observed.id).events.at(-1)!.activityState,
    "recovery-paused",
  );
  original(...notification);
  assert.equal(
    f.witness.snapshot(observed.id).events.at(-1)!.activityState,
    "recovery-paused",
  );
  assert.equal(
    f.witness.snapshot(observed.id).events.at(-1)!.includesUnsavedTail,
    false,
  );
  f.witness.clockAcquired = original;
});

test("SIGKILL ends the held instance and a real replacement cannot inherit its lease or invent its unsaved tail", async (t) => {
  const f = await fixture(t);
  await f.witness.close();
  await f.app.close();
  const response = deferred();
  f.onCleanup(async () => response.resolve());
  f.handlers.turn = async () => {
    if (f.turns.length === 1) {
      await response.promise;
      return tool("read-before-kill", "get_recent_messages", { limit: 1 });
    }
    return end("resumed durable continuation");
  };
  const children: ChildProcess[] = [];
  async function kill(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  f.onCleanup(async () => {
    await Promise.all(children.map(kill));
  });
  async function launch() {
    const child = fork(
      fileURLToPath(
        new URL("../support/activity-witness-process.ts", import.meta.url),
      ),
      [],
      {
        execArgv: ["--import", "tsx"],
        env: {
          ...process.env,
          ACTIVITY_TEST_DATABASE_URL: f.url,
          ACTIVITY_TEST_REMOTE_URL: f.remote.listeningOrigin,
        },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    children.push(child);
    let binding: Binding | undefined;
    let stderr = "";
    const replies = new Map<
      string,
      { ok: boolean; result?: unknown; error?: string }
    >();
    child.stderr!.on("data", (data) => {
      stderr += String(data);
    });
    child.on(
      "message",
      (message: {
        type?: string;
        binding?: Binding;
        key: string;
        ok: boolean;
        result?: unknown;
        error?: string;
      }) => {
        if (message.type === "ready") binding = message.binding;
        else replies.set(message.key, message);
      },
    );
    await until(async () => {
      assert.equal(child.exitCode, null, stderr);
      return Boolean(binding);
    });
    async function command(
      command: string,
      args: Record<string, unknown> = {},
    ) {
      const key = randomUUID();
      child.send({ key, command, ...args });
      await until(async () => replies.has(key));
      const reply = replies.get(key)!;
      if (!reply.ok) throw new Error(reply.error);
      return reply.result as ObservationSnapshot;
    }
    return { child, binding: binding!, command };
  }
  const first = await launch();
  await f.inbound();
  await first.command("tick");
  await until(async () => f.turns.length === 1);
  const runId = f.turns[0]!.runId;
  const oldLease = randomUUID();
  await first.command("arm", {
    leaseId: oldLease,
    runId,
    mode: "hold-safe-activity-boundary",
  });
  response.resolve();
  let held!: ObservationSnapshot;
  await until(async () => {
    held = await first.command("snapshot", { leaseId: oldLease });
    return held.state === "held";
  });
  assert.equal((await f.readRun(runId)).inflight_turn, false);
  assert.equal((await f.steps(runId))[0]!.state, "complete");
  assert.equal(f.turns.length, 1);
  const safe = held.events.find(
    (event) => event.kind === "activity-safe-held",
  )!;
  assert.equal(safe.includesUnsavedTail, true);
  await kill(first.child);
  const killedAt = Date.now();
  assert.ok(killedAt < Date.parse(held.expiresAt));
  await delay(200);
  const second = await launch();
  assert.notEqual(second.binding.pid, first.binding.pid);
  await assert.rejects(
    second.command("snapshot", { leaseId: oldLease }),
    /Unknown activity lease/,
  );
  const newLease = randomUUID();
  const recovered = await second.command("arm", {
    leaseId: newLease,
    runId,
    mode: "observe-activity",
  });
  assert.equal(recovered.events.at(-1)!.includesUnsavedTail, false);
  assert.equal(recovered.events.at(-1)!.activeElapsedMs, undefined);
  assert.notDeepEqual(recovered.events.at(-1)!.epochIds, safe.epochIds);
  await second.command("tick");
  await until(async () => (await f.readRun(runId)).status !== "running");
  const terminal = (
    await second.command("snapshot", { leaseId: newLease })
  ).events.at(-1)!;
  assert.equal(terminal.kind, "activity-terminal");
  assert.equal(terminal.includesUnsavedTail, false);
  assert.equal((await f.readRun(runId)).recovery_note, null);
  assert.equal(f.turns.length, 2);
  assert.equal(f.gatewayRequests.length, 0);
  t.diagnostic(
    JSON.stringify({
      killedAt,
      oldOwnerPid: first.binding.pid,
      newOwnerPid: second.binding.pid,
      safe,
      terminal,
      limitation:
        "Actual old online tail was lost on SIGKILL; no whole-run finite activity interval is asserted.",
    }),
  );
  await second.command("close");
});

test("a failing pause recorder cannot suppress the real pause witness or later cancellation", async (t) => {
  const f = await fixture(t, true);
  const id = "pause-recorder-failure";
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,inflight_turn) VALUES($1,'g',true)",
    [id],
  );
  const observed = await f.arm(id);
  await f.automation.tick();
  await until(async () => Boolean((await f.readRun(id)).recovery_note));
  assert.equal(
    f.witness.snapshot(observed.id).events.at(-1)!.activityState,
    "recovery-paused",
  );
  await f.db.query("UPDATE agent_runs SET cancel_requested=true WHERE id=$1", [
    id,
  ]);
  await f.automation.tick();
  assert.equal((await f.complete(id)).status, "cancelled");
  assert.equal(
    f.witness.snapshot(observed.id).events.at(-1)!.activityState,
    "terminal",
  );
  assert.equal(f.turns.length, 0);
});
