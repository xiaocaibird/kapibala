import assert from "node:assert/strict";
import { test } from "node:test";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import {
  automationFixture,
  deferred,
  delay,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

// Persisted active_ms fixtures test local boundaries, not a full 60s lifecycle.
// Admission now requires the unchanged 15s POST plus a 2s settlement allocation.
// These waits consume real elapsed time; no running clock or timer is mocked.
function blockFor(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function kickTurn() {
  return tool("budget-kick", "kick_user", {
    platform_user_id: "external-target",
    reason: "dispatch boundary regression",
  });
}

test("kick does not enter admission when real preparation consumes the first POST window", async (t) => {
  const f = await automationFixture(t);
  let admissions = 0;
  const original = Messages.prototype.kick;
  Messages.prototype.kick = async function (...args) {
    admissions++;
    return original.apply(this, args);
  };
  f.onCleanup(async () => {
    Messages.prototype.kick = original;
  });
  await f.db.query(
    "CREATE FUNCTION slow_kick_prepare() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='executing' AND OLD.state<>'executing' THEN PERFORM pg_sleep(0.35); END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER slow_kick_prepare BEFORE UPDATE OF state ON agent_steps FOR EACH ROW EXECUTE FUNCTION slow_kick_prepare()",
  );
  await f.preparedTool("expired-kick-prepare", 42800, kickTurn().content[0]!);
  await f.automation.tick();
  const run = await f.complete("expired-kick-prepare");
  const [step] = await f.steps(run.id);
  t.diagnostic(
    JSON.stringify({
      admissions,
      persistedActiveMs: Number(run.active_ms),
      recoveryNote: run.recovery_note,
      intent: step?.intent,
    }),
  );
  assert.equal(admissions, 0);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(
    f.turns.length,
    0,
    "resume a recorded tool without a new model turn",
  );
  assert.equal(f.audits.length, 1);
  assert.equal(run.status, "failed");
  assert.equal(run.end_reason, "wall_clock");
  assert.equal(run.recovery_note, null);
  assert.equal(step?.intent?.dispatchState, "awaiting_admission");
  assert.ok(
    Number(run.active_ms) > 43000 && Number(run.active_ms) < 60000,
    "bill the real SQL wait without pretending the 60s cap was exhausted",
  );
});

test("kick blocked across its first POST window before fetch ends without inventing an unknown external effect", async (t) => {
  let blocked = false;
  let signalAbortedAfterBlock: boolean | undefined;
  let kickFetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    if (String(args[0]).endsWith("/kick")) kickFetchCalls++;
    return originalFetch(...args);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const f = await automationFixture(
    t,
    undefined,
    (remote) => {
      remote.post("/groups/remote-g/kick", async () => ({ kicked: true }));
      remote.get("/groups/remote-g/members", async () => []);
    },
    (ctx) => {
      const request = ctx.gateway.request.bind(ctx.gateway);
      ctx.gateway.request = async (...args) => {
        if (args[0].endsWith("/kick")) {
          assert.equal(args[3]?.aborted, false);
          blockFor(1500);
          blocked = true;
          signalAbortedAfterBlock = args[3]?.aborted;
        }
        return request(...args);
      };
    },
  );
  await f.preparedTool("expired-kick-fetch", 42000, kickTurn().content[0]!);
  await f.automation.tick();
  const run = await f.complete("expired-kick-fetch", 5000);
  const [step] = await f.steps(run.id);
  t.diagnostic(
    JSON.stringify({
      blocked,
      signalAbortedAfterBlock,
      kickFetchCalls,
      persistedActiveMs: Number(run.active_ms),
      recoveryNote: run.recovery_note,
      intent: step?.intent,
    }),
  );
  assert.equal(blocked, true);
  assert.equal(
    signalAbortedAfterBlock,
    false,
    "the event loop has not run the deadline timer yet",
  );
  assert.equal(kickFetchCalls, 0);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(run.status, "failed");
  assert.equal(run.end_reason, "wall_clock");
  assert.equal(run.recovery_note, null);
  assert.equal(
    step?.intent?.dispatchState,
    "dispatching",
    "retain the committed intent; never make it replayable",
  );
  assert.equal(
    f.turns.length,
    0,
    "resume a recorded tool without a new model turn",
  );
  assert.equal(f.audits.length, 1);
  assert.ok(
    Number(run.active_ms) > 43000 && Number(run.active_ms) < 60000,
    "bill the real blocked interval without fabricating 60s exhaustion",
  );
});

test("RemoteClient checks the synchronous dispatch guard after real request serialization", async (t) => {
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/serialize", async () => ({ ok: true }));
  });
  const client = new RemoteClient(f.remote.listeningOrigin);
  const deadline = performance.now() + 30;
  const expired = new Error("serialization exhausted the deadline");
  let serialized = false;
  let rejection: unknown;
  try {
    await client.request(
      "/serialize",
      {
        toJSON() {
          blockFor(60);
          serialized = true;
          return { test: true };
        },
      },
      15000,
      undefined,
      () => {
        if (performance.now() >= deadline) throw expired;
      },
    );
  } catch (error) {
    rejection = error;
  }
  t.diagnostic(
    JSON.stringify({
      serialized,
      elapsedBeyondDeadlineMs: performance.now() - deadline,
      remoteRequests: f.gatewayRequests.length,
    }),
  );
  assert.equal(serialized, true);
  assert.equal(rejection, expired);
  assert.equal(f.gatewayRequests.length, 0);
});

test("a deadline timer already fired before kick fetch is still a known non-dispatch", async (t) => {
  let expiredSignal: boolean | undefined;
  const f = await automationFixture(t, undefined, undefined, (ctx) => {
    const request = ctx.gateway.request.bind(ctx.gateway);
    ctx.gateway.request = async (...args) => {
      if (args[0].endsWith("/kick")) {
        await delay(15500);
        expiredSignal = args[3]?.aborted;
      }
      return request(...args);
    };
  });
  await f.preparedTool("expired-kick-timer", 42800, kickTurn().content[0]!);
  await f.automation.tick();
  const run = await f.complete("expired-kick-timer", 20000);
  assert.equal(expiredSignal, true);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(run.end_reason, "wall_clock");
  assert.equal(run.recovery_note, null);
  assert.equal(
    (await f.steps(run.id))[0]?.intent?.dispatchState,
    "dispatching",
  );
});

test("failed terminal persistence after a local dispatch rejection keeps the saved intent non-replayable", async (t) => {
  const failure = deferred();
  let attempts = 0;
  const f = await automationFixture(t, undefined, undefined, (ctx) => {
    const request = ctx.gateway.request.bind(ctx.gateway);
    ctx.gateway.request = async (...args) => {
      if (args[0].endsWith("/kick")) {
        attempts++;
        blockFor(700);
      }
      return request(...args);
    };
    const error = ctx.log.error.bind(ctx.log);
    ctx.log.error = (object: unknown, message?: string) => {
      if (message === "Agent execution paused after an infrastructure failure")
        failure.resolve();
      error(object, message);
    };
  });
  await f.db.query(
    "CREATE FUNCTION reject_budget_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='failed' THEN RAISE EXCEPTION 'terminal persistence unavailable'; END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER reject_budget_terminal BEFORE UPDATE OF status ON agent_runs FOR EACH ROW EXECUTE FUNCTION reject_budget_terminal()",
  );
  await f.preparedTool("failed-kick-terminal", 42500, kickTurn().content[0]!);
  await f.automation.tick();
  await Promise.race([
    failure.promise,
    delay(3000).then(() => {
      throw new Error("terminal failure was not observed");
    }),
  ]);
  const beforeRestart = await f.readRun("failed-kick-terminal");
  assert.equal(beforeRestart.status, "running");
  assert.equal(beforeRestart.recovery_note, null);
  assert.equal(
    (await f.steps(beforeRestart.id))[0]?.intent?.dispatchState,
    "dispatching",
  );
  await f.automation.close?.();
  await f.db.query("DROP TRIGGER reject_budget_terminal ON agent_runs");
  const replacement = createAutomationModule(f.ctx, new Messages(f.ctx));
  f.onCleanup(async () => {
    await replacement.close?.();
  });
  await replacement.recover?.();
  await replacement.tick();
  await until(async () =>
    Boolean((await f.readRun(beforeRestart.id)).recovery_note),
  );
  const run = await f.readRun(beforeRestart.id);
  t.diagnostic(
    JSON.stringify({
      attempts,
      persistedActiveMs: Number(run.active_ms),
      stateAfterReplacement: run.status,
      intent: (await f.steps(run.id))[0]?.intent,
    }),
  );
  assert.equal(run.status, "running");
  assert.equal(run.end_reason, null);
  assert.match(
    run.recovery_note ?? "",
    /kick was dispatched before interruption/,
  );
  assert.equal(
    attempts,
    1,
    "replacement must never retry a saved dispatching intent",
  );
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(
    (await f.steps(run.id))[0]?.intent?.dispatchState,
    "dispatching",
  );
});

test("a real kick remains unknown when confirmation outlasts the work allocation before the original run deadline", async (t) => {
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", async (_request, reply) =>
      reply.code(504).send({ code: "NETWORK_TIMEOUT" }),
    );
    remote.get("/groups/remote-g/members", async () => {
      await delay(16000);
      return [];
    });
  });
  await f.preparedTool("inflight-kick-timeout", 42800, kickTurn().content[0]!);
  await f.automation.tick();
  const run = await f.complete("inflight-kick-timeout", 20000);
  assert.equal(
    f.gatewayRequests.filter((path) => path.endsWith("/kick")).length,
    1,
  );
  assert.equal(
    f.gatewayRequests.filter((path) => path.endsWith("/members")).length,
    1,
    "actual confirmation still starts after the POST; the first-stage guard must not reject it",
  );
  assert.equal(run.end_reason, "wall_clock");
  assert.match(run.recovery_note ?? "", /external result remains unknown/);
  assert.equal(
    (await f.steps(run.id))[0]?.intent?.dispatchState,
    "dispatching",
  );
  assert.equal(
    f.turns.length,
    0,
    "resume a recorded tool without a new model turn",
  );
  assert.equal(f.audits.length, 1);
});

test("kick with sufficient budget still dispatches once and preserves the one audit", async (t) => {
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", async () => ({ kicked: true }));
    remote.get("/groups/remote-g/members", async () => []);
  });
  f.handlers.turn = () => (f.turns.length === 1 ? kickTurn() : end());
  await f.inbound();
  const id = await f.start();
  const run = await f.complete(id);
  assert.equal(run.status, "finished");
  assert.equal(
    f.gatewayRequests.filter((path) => path.endsWith("/kick")).length,
    1,
  );
  assert.equal(f.audits.length, 1);
  assert.equal(f.turns.length, 2);
  assert.equal(run.recovery_note, null);
});

test("a confirmed first kick POST still refreshes members below its admission window", async (t) => {
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", async () => {
      await delay(350);
      return { kicked: true };
    });
    remote.get("/groups/remote-g/members", async () => []);
  });
  await f.preparedTool(
    "kick-confirmed-below-window",
    42800,
    kickTurn().content[0]!,
  );
  await f.automation.tick();
  const run = await f.complete("kick-confirmed-below-window");
  const [step] = await f.steps(run.id);
  assert.equal(
    f.gatewayRequests.filter((path) => path.endsWith("/kick")).length,
    1,
  );
  assert.equal(
    f.gatewayRequests.filter((path) => path.endsWith("/members")).length,
    1,
  );
  assert.equal(step?.state, "complete");
  assert.equal(step?.is_error, false);
  assert.deepEqual(step?.result, { kicked: true });
  assert.equal(run.recovery_note, null);
  assert.equal(f.audits.length, 1);
});

for (const scenario of ["policy", "account", "cancel"] as const) {
  test(`kick admission preserves ${scenario} precedence with less than the 17-second admission allocation`, async (t) => {
    const f = await automationFixture(t);
    const id = `kick-order-${scenario}`;
    await f.preparedTool(id, 45500, kickTurn().content[0]!);
    if (scenario === "policy")
      await f.db.query(
        "UPDATE groups SET auto_kick_enabled=false WHERE id='g'",
      );
    else if (scenario === "account")
      await f.db.query("UPDATE accounts SET status='suspended'");
    else {
      await f.db.query("UPDATE groups SET status='unreachable' WHERE id='g'");
      await f.db.query(
        "UPDATE agent_runs SET cancel_requested=true WHERE id=$1",
        [id],
      );
    }
    await f.automation.tick();
    const run = await f.complete(id);
    const [step] = await f.steps(id);
    assert.equal(step?.state, "complete");
    assert.equal(
      step?.error_code,
      scenario === "policy"
        ? "POLICY_DENIED"
        : scenario === "account"
          ? "NO_AVAILABLE_ACCOUNT"
          : "GROUP_UNREACHABLE",
    );
    assert.equal(run.status, scenario === "cancel" ? "cancelled" : "finished");
    assert.equal(run.end_reason, scenario === "cancel" ? "cancelled" : "final");
    assert.equal(f.audits.length, scenario === "account" ? 1 : 0);
    assert.equal(f.gatewayRequests.length, 0);
    assert.equal(f.turns.length, scenario === "cancel" ? 0 : 1);
  });
}
