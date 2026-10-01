import assert from "node:assert/strict";
import { test } from "node:test";
import {
  automationFixture,
  deferred,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

async function fixture(
  t: Parameters<typeof automationFixture>[0],
  configure?: Parameters<typeof automationFixture>[3],
) {
  let kicks = 0;
  const f = await automationFixture(
    t,
    undefined,
    (remote) => {
      remote.post("/groups/remote-g/kick", async () => {
        kicks++;
        return { kicked: true };
      });
      remote.get("/groups/remote-g/members", async () => []);
    },
    configure,
  );
  function target(platformId: string) {
    f.handlers.turn = () =>
      f.turns.length === 1
        ? tool("kick", "kick_user", {
            platform_user_id: platformId,
            reason: "policy boundary",
          })
        : end();
  }
  async function execute() {
    await f.inbound();
    const id = await f.start();
    assert.equal((await f.complete(id)).status, "finished");
    return (await f.steps(id))[0]!;
  }
  return { ...f, kicks: () => kicks, target, execute };
}

for (const [name, target, prepare] of [
  ["creator", "account-1", "SELECT 1"],
  ["admin", "account-2", "SELECT 1"],
  [
    "disconnected ordinary member",
    "account-3",
    "UPDATE accounts SET status='disconnected' WHERE id='account-3'",
  ],
  ["current account mapping before member projection", "account-4", "SELECT 1"],
  [
    "previous member projection during identity replacement",
    "account-3",
    "UPDATE accounts SET platform_user_id='replacement' WHERE id='account-3'",
  ],
] as const) {
  test(`managed target: ${name} cannot be automatically removed`, async (t) => {
    const f = await fixture(t);
    await f.db.query(prepare);
    f.target(target);
    const step = await f.execute();
    assert.equal(step.error_code, "POLICY_DENIED");
    assert.equal(f.kicks(), 0);
    assert.equal(f.audits.length, 1);
    assert.equal(
      (
        await f.db.query(
          "SELECT count(*)::int AS n FROM members WHERE group_id='g'",
        )
      ).rows[0]!.n,
      3,
    );
  });
}

test("managed target: an external target retains the audited real kick path", async (t) => {
  const f = await fixture(t);
  f.target("external-target");
  const step = await f.execute();
  assert.equal(step.is_error, false);
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits.length, 1);
});

test("managed target: identity becoming managed during audit is checked after audit", async (t) => {
  const f = await fixture(t);
  const started = deferred(),
    release = deferred();
  f.onCleanup(async () => release.resolve());
  f.handlers.audit = async () => {
    started.resolve();
    await release.promise;
    return { verdict: "pass", reason: "approved" };
  };
  f.target("external-target");
  const result = f.execute();
  await started.promise;
  await f.db.query(
    "UPDATE accounts SET platform_user_id='external-target' WHERE id='account-4'",
  );
  release.resolve();
  assert.equal((await result).error_code, "POLICY_DENIED");
  assert.equal(f.kicks(), 0);
});

test("managed target: identity is rechecked after waiting to persist dispatch intent", async (t) => {
  const entered = deferred(),
    proceed = deferred();
  const f = await fixture(t, (ctx) => {
    ctx.testExecutionObserver = {
      async ready() {},
      async kick(_correlation, operation) {
        entered.resolve();
        await proceed.promise;
        return operation();
      },
    };
  });
  f.onCleanup(async () => proceed.resolve());
  f.target("external-target");
  await f.inbound();
  const id = await f.start();
  await entered.promise;
  const blocker = await f.db.pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT * FROM agent_steps WHERE run_id=$1 FOR UPDATE",
      [id],
    );
    proceed.resolve();
    await until(
      async () =>
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE agent_steps SET intent=%'",
          )
        ).rowCount! > 0,
    );
    await f.db.query(
      "UPDATE accounts SET platform_user_id='external-target' WHERE id='account-4'",
    );
    await blocker.query("ROLLBACK");
    assert.equal((await f.complete(id)).status, "finished");
    assert.equal((await f.steps(id))[0]!.error_code, "POLICY_DENIED");
    assert.equal(
      f.kicks(),
      0,
      "no HTTP kick may cross the newly committed identity guard",
    );
    assert.equal(f.audits.length, 1);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});

test("Agent disable transaction delegates cancellation and allows only the current step to finish", async (t) => {
  const entered = deferred(),
    release = deferred();
  const f = await fixture(t);
  f.onCleanup(async () => release.resolve());
  f.handlers.turn = async () => {
    entered.resolve();
    await release.promise;
    return tool("read", "get_recent_messages", { limit: 1 });
  };
  await f.inbound();
  const id = await f.start();
  await entered.promise;
  const response = await f.api("PATCH", "/api/groups/g", {
    agentEnabled: false,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal((await f.readRun(id)).cancel_requested, true);
  release.resolve();
  assert.equal((await f.complete(id)).status, "cancelled");
  assert.equal(f.turns.length, 1);
  const steps = await f.steps(id);
  assert.equal(steps.length, 1);
  assert.equal(steps[0]!.state, "complete");
});
