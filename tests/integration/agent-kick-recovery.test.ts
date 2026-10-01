import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { Database } from "../../apps/server/src/core/db.js";
import { capacityFixture } from "../support/capacity-control-fixture.js";
import {
  automationFixture,
  deferred,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

test("CAP009 exact refused-before-ready SIGKILL resumes the same audited step", async (t) => {
  const f = await capacityFixture(t);
  await f.prepare();
  const lease = await f.hold("hold-after-refusal-before-ready");
  f.auditResponse.resolve();
  await until(async () =>
    (await f.snapshot(lease.id)).events.some(
      (event) => event.kind === "before-ready-held",
    ),
  );
  const held = await f.snapshot(lease.id);
  const refusal = held.events.find(
    (event) => event.kind === "admission-refused",
  )!;
  assert.equal(
    held.events.find((event) => event.kind === "before-ready-held")!.attemptId,
    refusal.attemptId,
  );
  assert.equal(refusal.callbackEntered, false);
  assert.equal(refusal.remoteRequestCount, 0);
  assert.equal(
    held.events.some((event) => event.kind === "ready-persisted"),
    false,
  );
  const pending = (
    await f.db.query("SELECT * FROM agent_steps WHERE run_id='capacity-run'")
  ).rows[0]!;
  assert.equal(pending.state, "executing");
  assert.equal(pending.intent.dispatchState, "awaiting_admission");
  assert.equal(f.kicks(), 0);
  const old = f.target();
  await f.kill();
  const released = await f.snapshot(lease.id, "DELETE");
  assert.deepEqual(released.events, held.events);
  await f.start();
  assert.notEqual(f.target().pid, old.pid);
  await until(async () => (await f.run()).status === "finished");
  const recovered = await f.run();
  assert.equal(recovered.recoveryNote, null);
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  assert.equal(
    f.turns(),
    2,
    "Only the normal next turn runs after the saved tool completes",
  );
  const completed = (
    await f.db.query(
      "SELECT * FROM agent_steps WHERE run_id='capacity-run' AND tool_use_id='kick-one'",
    )
  ).rows;
  assert.equal(completed.length, 1);
  assert.equal(completed[0]!.state, "complete");
  assert.equal(completed[0]!.audit_attempts, 1);
  assert.equal(completed[0]!.intent.dispatchState, "dispatching");
  await delay(400);
  assert.equal(f.kicks(), 1);
  assert.deepEqual(await f.snapshot(lease.id, "DELETE"), released);
  f.evidence({
    case: "CAP009-development-repaired",
    oldGuardian: old.pid,
    newGuardian: f.target().pid,
    held,
    pending,
    recovered,
    kicks: f.kicks(),
    audits: f.audits(),
    turns: f.turns(),
  });
});

test("CAP009 a dispatched kick killed before response remains paused without replay", async (t) => {
  const f = await capacityFixture(t);
  f.blockKick();
  await f.prepare();
  f.auditResponse.resolve();
  await f.kickEntered.promise;
  const saved = (
    await f.db.query(
      "SELECT state,intent FROM agent_steps WHERE run_id='capacity-run'",
    )
  ).rows[0]!;
  assert.equal(saved.state, "executing");
  assert.equal(saved.intent.dispatchState, "dispatching");
  await f.kill();
  await f.start();
  await until(async () => Boolean((await f.run()).recoveryNote));
  f.kickResponse.resolve();
  await delay(500);
  assert.equal((await f.run()).status, "running");
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  assert.equal(f.turns(), 1);
  f.evidence({
    case: "CAP009-dispatched-unknown",
    saved,
    recovered: await f.run(),
    kicks: f.kicks(),
    audits: f.audits(),
    turns: f.turns(),
  });
});

test("CAP009 dispatch intent commit then pre-HTTP SIGKILL stays conservatively paused", async (t) => {
  const f = await capacityFixture(t, false, {
    entry: "tests/support/kick-dispatch-crash-entry.ts",
  });
  await f.prepare();
  f.auditResponse.resolve();
  const marker = join(f.directory, "dispatching-held.signal");
  await until(async () =>
    readFile(marker, "utf8").then(
      () => true,
      () => false,
    ),
  );
  assert.deepEqual(JSON.parse(await readFile(marker, "utf8")), {
    rowCount: 1,
    runId: "capacity-run",
  });
  const saved = (
    await f.db.query(
      "SELECT state,intent FROM agent_steps WHERE run_id='capacity-run'",
    )
  ).rows[0]!;
  assert.equal(saved.state, "executing");
  assert.equal(saved.intent.dispatchState, "dispatching");
  assert.equal(f.kicks(), 0);
  await f.kill();
  await f.start();
  await until(async () => Boolean((await f.run()).recoveryNote));
  await delay(400);
  assert.equal(f.kicks(), 0);
  assert.equal(f.audits(), 1);
  assert.equal(f.turns(), 1);
  f.evidence({
    case: "CAP009-intent-committed-before-http",
    saved,
    recovered: await f.run(),
    kicks: f.kicks(),
  });
});

test("CAP009 legacy executing intents without a dispatch stage remain paused", async (t) => {
  const f = await capacityFixture(t);
  await f.kill();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history) VALUES('capacity-run','g','[]')",
  );
  await f.db.query(
    "INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict,intent) VALUES('capacity-run',1,'tool_use','kick-one','kick_user',$1,'executing','pass',$2)",
    [
      JSON.stringify({
        platform_user_id: "external-target",
        reason: "legacy saved intent",
      }),
      JSON.stringify({
        accountId: "account-1",
        targetPlatformUserId: "external-target",
      }),
    ],
  );
  await f.start();
  await until(async () => Boolean((await f.run()).recoveryNote));
  await delay(400);
  assert.equal((await f.run()).status, "running");
  assert.equal(f.kicks(), 0);
  assert.equal(f.audits(), 0);
  assert.equal(f.turns(), 0);
});

test("CAP009 two live Agent instances recover one admitted step without duplicate audit or effect", async (t) => {
  let kicks = 0;
  const entered = deferred();
  const release = deferred();
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", async () => {
      kicks++;
      entered.resolve();
      await release.promise;
      return { kicked: true };
    });
    remote.get("/groups/remote-g/members", () => []);
  });
  const otherDb = new Database(f.url);
  const otherCtx = { ...f.ctx, db: otherDb };
  const otherGateway = createGatewayModule(otherCtx);
  const other = createAutomationModule(otherCtx, otherGateway);
  f.onCleanup(async () => {
    release.resolve();
    await other.close?.();
    await otherDb.close();
  });
  f.handlers.turn = () => end();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history,step_count) VALUES('recovery-run','g','[]',1)",
  );
  await f.db.query(
    "INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict,audit_attempts,intent) VALUES('recovery-run',1,'tool_use','saved-kick','kick_user',$1,'executing','pass',1,$2)",
    [
      JSON.stringify({
        platform_user_id: "external-target",
        reason: "saved audited kick",
      }),
      JSON.stringify({
        accountId: "account-1",
        targetPlatformUserId: "external-target",
        dispatchState: "awaiting_admission",
      }),
    ],
  );
  await Promise.all([f.automation.tick(), other.tick()]);
  await entered.promise;
  for (let attempt = 0; attempt < 4; attempt++)
    await Promise.all([f.automation.tick(), other.tick()]);
  assert.equal(kicks, 1);
  assert.equal(f.audits.length, 0);
  assert.equal(
    (await f.steps("recovery-run"))[0]!.intent?.dispatchState,
    "dispatching",
  );
  release.resolve();
  assert.equal((await f.complete("recovery-run")).status, "finished");
  assert.equal(kicks, 1);
  assert.equal(f.turns.length, 1);
  assert.equal(f.audits.length, 0);
});

test("CAP009 failed durable dispatch write never reaches the gateway", async (t) => {
  let kicks = 0;
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", () => {
      kicks++;
      return { kicked: true };
    });
  });
  await f.db.query(
    "CREATE FUNCTION reject_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.intent->>'dispatchState'='dispatching' THEN RAISE EXCEPTION 'development injected dispatch write failure'; END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER reject_dispatch BEFORE UPDATE ON agent_steps FOR EACH ROW EXECUTE FUNCTION reject_dispatch()",
  );
  f.handlers.turn = () =>
    tool("write-failure", "kick_user", {
      platform_user_id: "external-target",
      reason: "write must commit",
    });
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history) VALUES('write-failure-run','g','[]')",
  );
  await f.automation.tick();
  await until(async () =>
    Boolean((await f.readRun("write-failure-run")).recovery_note),
  );
  assert.equal(kicks, 0);
  assert.equal(f.audits.length, 1);
  assert.equal(
    (await f.steps("write-failure-run"))[0]!.intent?.dispatchState,
    "awaiting_admission",
  );
  assert.equal(f.turns.length, 1);
});

test("CAP009 local kick validation runs before the durable dispatch hook", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "UPDATE accounts SET status='disconnected' WHERE id='account-1'",
  );
  let prepared = 0;
  await assert.rejects(
    new Messages(f.ctx).kick(
      {
        groupId: "g",
        accountId: "account-1",
        targetPlatformUserId: "external-target",
      },
      {
        beforeDispatch: async () => {
          prepared++;
        },
      },
    ),
    /没有可执行的账号/,
  );
  assert.equal(prepared, 0);
  assert.equal(f.gatewayRequests.length, 0);
});
