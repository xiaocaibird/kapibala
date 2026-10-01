import assert from "node:assert/strict";
import type { ActivityObservationSnapshot } from "../../scripts/qa-runtime-observation/activity-witness.js";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { runtimeFixture } from "../support/runtime-observation-fixture.js";
import {
  deferred,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";

test("AC01 real controller permits witness plus same-run safe boundary and exposes killed tail as incomplete", async (t) => {
  const response = deferred();
  let turns = 0;
  const f = await runtimeFixture(t, false, {
    entry: "scripts/qa-observation-server.ts",
    configureRemote: (remote) =>
      remote.post("/agent/turn", async () => {
        if (++turns === 1) {
          await response.promise;
          return tool("read-safe", "get_recent_messages", { limit: 1 });
        }
        return end("finished after witnessed read");
      }),
  });
  f.onCleanup(async () => response.resolve());
  await f.db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES('activity-g','remote-activity','account-1',true)",
  );
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('activity-g','account-1','account-1','creator')",
  );
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) VALUES('activity-m','activity-g','remote-activity-m','external',false,'activity witness',now())",
  );
  await until(async () => turns === 1);
  const runId = (
    await f.db.query<{ id: string }>(
      "SELECT id FROM agent_runs WHERE group_id='activity-g'",
    )
  ).rows[0]!.id;
  const correlation = {
    kind: "activity",
    groupId: "activity-g",
    runId,
    toolUseId: "all-run-steps",
  };
  async function arm(mode: string) {
    const id = randomUUID();
    const result = await f.request("PUT", `/leases/${id}`, {
      protocol: "qa-runtime-observation/1",
      target: f.target(),
      mode,
      correlation,
      ttlMs: 20000,
    });
    return { id, ...result };
  }
  const witness = await arm("observe-activity");
  assert.equal(witness.status, 200, JSON.stringify(witness.value));
  assert.equal(
    (witness.value as ObservationSnapshot).events[0]!.includesUnsavedTail,
    true,
  );
  const safe = await arm("hold-safe-activity-boundary");
  assert.equal(safe.status, 200, JSON.stringify(safe.value));
  assert.equal((await arm("hold-safe-activity-boundary")).status, 409);
  assert.equal((await arm("observe-activity")).status, 409);
  response.resolve();
  const held = await f.event(safe.id, "activity-safe-held");
  assert.equal(held.state, "held");
  const actual = held.events.find((e) => e.kind === "activity-safe-held")!;
  assert.equal(actual.remoteInFlightCount, 0);
  assert.equal(actual.continuationDurable, true);
  assert.equal(turns, 1);
  const row = (
    await f.db.query<{ inflight_turn: boolean }>(
      "SELECT inflight_turn FROM agent_runs WHERE id=$1",
      [runId],
    )
  ).rows[0]!;
  assert.equal(row.inflight_turn, false);
  assert.equal(
    (await f.db.query("SELECT state FROM agent_steps WHERE run_id=$1", [runId]))
      .rows[0]!.state,
    "complete",
  );
  const oldTarget = f.target();
  f.evidence({ witness: await f.snapshot(witness.id), safe: held });
  const live1 = (await f.snapshot(safe.id)) as ActivityObservationSnapshot;
  const live2 = (await f.snapshot(safe.id)) as ActivityObservationSnapshot;
  assert.equal(live2.snapshotProvenance?.source, "live-bridge");
  assert.equal(
    live2.snapshotProvenance?.applicationPid,
    live2.clockObservation.applicationPid,
  );
  assert.notEqual(
    live2.clockObservation.applicationPid,
    oldTarget.pid,
    "The controlled app is a guardian descendant, not the guardian itself",
  );
  assert.ok(
    live2.clockObservation.monotonicMs > live1.clockObservation.monotonicMs,
  );
  assert.deepEqual(live2.events.slice(0, live1.events.length), live1.events);
  // Losing bridge reachability while its process lives must fail, not claim a
  // process exit or calibrate from an old retained snapshot.
  process.kill(live2.clockObservation.applicationPid, "SIGSTOP");
  try {
    const unavailable = await f.request("GET", `/leases/${safe.id}`);
    assert.equal(unavailable.status, 503);
    assert.equal(
      (unavailable.value as ObservationSnapshot).snapshotProvenance,
      undefined,
    );
    process.kill(live2.clockObservation.applicationPid, 0);
  } finally {
    process.kill(live2.clockObservation.applicationPid, "SIGCONT");
  }
  const immediatelyBeforeKill = (await f.snapshot(
    safe.id,
  )) as ActivityObservationSnapshot;
  assert.equal(immediatelyBeforeKill.state, "held");
  const expiresAt = Date.parse(immediatelyBeforeKill.expiresAt);
  const killBefore = Date.now();
  assert.ok(killBefore < expiresAt);
  await f.kill();
  const killAfter = Date.now();
  assert.ok(
    killAfter < expiresAt,
    "Kill must finish inside the actual held lease, not after TTL",
  );
  const retained = (await f.snapshot(safe.id)) as ActivityObservationSnapshot;
  assert.equal(
    retained.snapshotProvenance?.source,
    "retained-after-process-exit",
  );
  assert.deepEqual(
    retained.clockObservation,
    immediatelyBeforeKill.clockObservation,
  );
  assert.deepEqual(retained.events, immediatelyBeforeKill.events);
  f.evidence({ immediatelyBeforeKill, retained, killBefore, killAfter });
  await f.start();
  assert.notEqual(f.target().pid, oldTarget.pid);
  const resumed = await arm("observe-activity");
  assert.equal(resumed.status, 200, JSON.stringify(resumed.value));
  const after = resumed.value as ObservationSnapshot;
  assert.equal(after.events[0]!.includesUnsavedTail, false);
  assert.equal(
    after.events[0]!.activeElapsedMs,
    undefined,
    "No manufactured whole-run upper bound after SIGKILL",
  );
  await until(
    async () =>
      (await f.db.query("SELECT status FROM agent_runs WHERE id=$1", [runId]))
        .rows[0]!.status === "finished",
  );
  assert.equal(turns, 2);
  assert.equal(
    (
      await f.db.query("SELECT recovery_note FROM agent_runs WHERE id=$1", [
        runId,
      ])
    ).rows[0]!.recovery_note,
    null,
  );
  assert.equal((await f.snapshot(safe.id, "DELETE")).state, "released");
  await f.snapshot(witness.id, "DELETE");
  await f.snapshot(resumed.id, "DELETE");
  f.evidence({ resumed: after, oldReleased: await f.snapshot(safe.id) });
});
