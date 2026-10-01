import assert from "node:assert/strict";
import { test } from "node:test";
import {
  automationFixture,
  end,
  tool,
} from "../support/core-automation-fixture.js";

test("Agent does not dispatch a model request after its intent write consumes the remaining budget", async (t) => {
  const f = await automationFixture(t);
  // Delay the real pre-dispatch SQL. The fixture starts with a short remaining
  // budget to isolate this scheduling race; DC06 measures an unshortened minute.
  await f.db.query(
    "CREATE FUNCTION slow_model_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.inflight_turn AND NOT OLD.inflight_turn THEN PERFORM pg_sleep(0.35); END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER slow_model_intent BEFORE UPDATE OF inflight_turn ON agent_runs FOR EACH ROW EXECUTE FUNCTION slow_model_intent()",
  );
  f.handlers.turn = () => end("must never be requested");
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history,active_ms) VALUES('expired-intent','g','[]',59800)",
  );
  const began = performance.now();
  await f.automation.tick();
  const run = await f.complete("expired-intent");
  t.diagnostic(
    JSON.stringify({
      runId: run.id,
      elapsedMs: performance.now() - began,
      persistedActiveMs: Number(run.active_ms),
      modelRequests: f.turns.length,
    }),
  );
  assert.equal(f.turns.length, 0);
  assert.equal(f.audits.length, 0);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(run.status, "failed");
  assert.equal(run.end_reason, "wall_clock");
  assert.equal(run.inflight_turn, false);
  assert.equal(run.recovery_note, null);
  assert.equal(run.step_count, 0);
  assert.deepEqual(await f.steps(run.id), []);
  assert.ok(Number(run.active_ms) > 60000, "retain actual overshoot evidence");
});

test("Agent does not dispatch an audit request after its intent write consumes the remaining budget", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "CREATE FUNCTION slow_audit_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='auditing' AND OLD.state<>'auditing' THEN PERFORM pg_sleep(0.35); END IF; RETURN NEW; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER slow_audit_intent BEFORE UPDATE OF state ON agent_steps FOR EACH ROW EXECUTE FUNCTION slow_audit_intent()",
  );
  f.handlers.turn = () =>
    tool("requires-audit", "send_message", {
      text: "must not send",
      idempotency_key: "expired-audit-intent",
    });
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history,active_ms) VALUES('expired-audit-intent','g','[]',59800)",
  );
  const began = performance.now();
  await f.automation.tick();
  const run = await f.complete("expired-audit-intent");
  const [step] = await f.steps(run.id);
  t.diagnostic(
    JSON.stringify({
      runId: run.id,
      elapsedMs: performance.now() - began,
      persistedActiveMs: Number(run.active_ms),
      auditRequests: f.audits.length,
    }),
  );
  assert.equal(f.turns.length, 1);
  assert.equal(f.audits.length, 0);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(run.status, "failed");
  assert.equal(run.end_reason, "wall_clock");
  assert.equal(run.recovery_note, null);
  assert.equal(step!.audit_verdict, null);
  assert.equal(step!.state, "auditing");
  assert.equal((await f.db.query("SELECT * FROM agent_send_keys")).rowCount, 0);
  assert.ok(Number(run.active_ms) > 60000, "retain actual overshoot evidence");
});
