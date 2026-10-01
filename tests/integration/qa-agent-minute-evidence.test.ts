import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { runtimeFixture } from "../support/runtime-observation-fixture.js";
import { tool, until } from "../support/core-automation-fixture.js";
import type { ObservationEvent } from "../../scripts/qa-observation/types.js";

const time = (event: ObservationEvent) => (event.monotonicMs as number[])[0]!;

test(
  "optional real-minute run exposes creation, decision, commit and every dispatch without clipping",
  { skip: process.env.BACKEND_EVIDENCE_MINUTE !== "1", timeout: 80000 },
  async (t) => {
    let turns = 0;
    const f = await runtimeFixture(t, false, {
      configureRemote: (remote) =>
        remote.post("/agent/turn", async () => {
          const ordinal = ++turns;
          await new Promise((resolve) => setTimeout(resolve, 8000));
          return tool(`slow-read-${ordinal}`, "get_recent_messages", {
            limit: 1,
          });
        }),
    });
    await f.db.query("UPDATE accounts SET status='online',platform_user_id=id");
    await f.db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES('minute-g','remote-minute','account-1',true)",
    );
    await f.db.query(
      "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) VALUES('minute-trigger','minute-g','remote-minute-trigger','external',false,'minute observation',now())",
    );
    await until(async () => turns === 1);
    const runId = (
      await f.db.query<{ id: string }>(
        "SELECT id FROM agent_runs WHERE group_id='minute-g'",
      )
    ).rows[0]!.id;
    const ids: string[] = [];
    for (const mode of ["observe-activity", "observe-agent-lifecycle"]) {
      const id = randomUUID();
      ids.push(id);
      const result = await f.request("PUT", `/leases/${id}`, {
        protocol: "qa-runtime-observation/1",
        target: f.target(),
        mode,
        ttlMs: 80000,
        correlation: {
          kind: mode === "observe-activity" ? "activity" : "tool-wait",
          groupId: "minute-g",
          runId,
          toolUseId: "all-run-steps",
        },
      });
      assert.equal(result.status, 200, JSON.stringify(result.value));
    }
    await until(
      async () =>
        (await f.db.query("SELECT status FROM agent_runs WHERE id=$1", [runId]))
          .rows[0]!.status !== "running",
      70000,
    );
    const activity = await f.snapshot(ids[0]!),
      lifecycle = await f.snapshot(ids[1]!);
    const decision = lifecycle.events.find(
      (e) => e.kind === "agent-termination-decided",
    )!;
    const terminal = lifecycle.events.find(
      (e) => e.kind === "agent-terminal-committed",
    )!;
    assert.equal(decision.reason, "wall_clock");
    assert.equal(decision.attemptId, terminal.attemptId);
    assert.ok(time(decision) <= time(terminal));
    assert.equal(
      lifecycle.events.filter((e) => e.kind === "agent-turn-dispatched").length,
      turns,
    );
    assert.equal(
      lifecycle.events.some(
        (e) => e.kind === "agent-turn-dispatched" && time(e) > time(decision),
      ),
      false,
    );
    assert.equal(activity.events.at(-1)!.includesUnsavedTail, true);
    assert.equal(
      (await f.db.query("SELECT * FROM messages WHERE is_own")).rowCount,
      0,
    );
    f.evidence({
      sample: "real-minute-observation",
      activity,
      lifecycle,
      turns,
      conclusion:
        "raw observation; developer hook checks do not assert the 60000ms acceptance limit",
    });
    for (const id of ids) await f.snapshot(id, "DELETE");
  },
);
