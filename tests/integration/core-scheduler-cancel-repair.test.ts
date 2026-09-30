import assert from "node:assert/strict";
import { test } from "node:test";
import {
  automationFixture,
  delay,
  until,
} from "../support/core-automation-fixture.js";

test("R05 cancellation: a paused run with a locked group preserves cancellation while another group's Agent and sequence advance", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history,recovery_note,cancel_requested) VALUES('paused','g','[]','unknown remote outcome',true)",
  );
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES('healthy','remote-healthy','account-4',true)",
  );
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('healthy','account-4','account-4','creator')",
  );
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES('healthy-trigger','healthy','healthy-trigger','external',false,'trigger')",
  );
  await f.automation.recover!();
  const definition = await f.api("POST", "/api/sequences", {
    name: "healthy sequence",
    steps: [
      { index: 1, accountRole: "admin", text: "scheduled", delaySeconds: 0 },
    ],
  });
  assert.equal(definition.statusCode, 200);
  const started = await f.api("POST", "/api/groups/healthy/sequence-runs", {
    sequenceId: definition.json<{ id: string }>().id,
  });
  assert.equal(started.statusCode, 201);
  const runId = started.json<{ runId: string }>().runId;
  const blocker = await f.db.pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
  let tick: Promise<void> | undefined;
  try {
    const before = Date.now();
    tick = f.automation.tick();
    assert.equal(
      await Promise.race([
        tick.then(() => "completed"),
        delay(1000).then(() => "blocked"),
      ]),
      "completed",
      "paused-run cancellation must not hold the whole automation tick",
    );
    t.diagnostic(
      `tick with paused cancellation locked: ${Date.now() - before}ms`,
    );
    const paused = (
      await f.db.query(
        "SELECT status,recovery_note,cancel_requested FROM agent_runs WHERE id='paused'",
      )
    ).rows[0]!;
    assert.deepEqual(paused, {
      status: "running",
      recovery_note: "unknown remote outcome",
      cancel_requested: true,
    });
    await until(
      async () =>
        (
          await f.db.query(
            "SELECT id FROM agent_runs WHERE group_id='healthy' AND status='finished'",
          )
        ).rowCount === 1,
    );
    assert.ok(
      (
        await f.db.query(
          "SELECT client_msg_id FROM sequence_steps WHERE run_id=$1",
          [runId],
        )
      ).rows[0]!.client_msg_id,
    );
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await tick;
  }
  await f.automation.tick();
  await f.automation.tick();
  const cancelled = (
    await f.db.query(
      "SELECT status,end_reason,recovery_note FROM agent_runs WHERE id='paused'",
    )
  ).rows[0]!;
  assert.deepEqual(cancelled, {
    status: "cancelled",
    end_reason: "cancelled",
    recovery_note: "unknown remote outcome",
  });
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='agent_run' AND payload->>'runId'='paused' AND payload->>'status'='cancelled'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM messages WHERE is_own AND group_id='healthy'",
      )
    ).rowCount,
    1,
  );
});

test("R05 cancellation: non-lock persistence errors propagate and preserve the cancellation intent", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history,recovery_note,cancel_requested) VALUES('paused','g','[]','unknown remote outcome',true)",
  );
  await f.automation.recover!();
  await f.db
    .query(`CREATE FUNCTION reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='cancelled' THEN RAISE EXCEPTION 'injected cancellation persistence failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_cancel BEFORE UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION reject_cancel()`);
  await assert.rejects(
    f.automation.tick(),
    /injected cancellation persistence failure/,
  );
  const retained = (
    await f.db.query(
      "SELECT status,cancel_requested,recovery_note FROM agent_runs WHERE id='paused'",
    )
  ).rows[0]!;
  assert.deepEqual(retained, {
    status: "running",
    cancel_requested: true,
    recovery_note: "unknown remote outcome",
  });
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='agent_run' AND payload->>'runId'='paused' AND payload->>'status'='cancelled'",
      )
    ).rowCount,
    0,
  );
  await f.db.query("DROP TRIGGER reject_cancel ON agent_runs");
  await f.automation.tick();
  assert.equal(
    (await f.db.query("SELECT status FROM agent_runs WHERE id='paused'"))
      .rows[0]!.status,
    "cancelled",
  );
});
