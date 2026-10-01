import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  LifecycleWitness,
  type LifecycleRequest,
} from "../../scripts/qa-runtime-observation/lifecycle-witness.js";
import { ActivityWitness } from "../../scripts/qa-runtime-observation/activity-witness.js";
import type { Binding } from "../../scripts/qa-capacity/protocol.js";
import type {
  ObservationEvent,
  ObservationSnapshot,
} from "../../scripts/qa-observation/types.js";
import {
  automationFixture,
  deferred,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";
import { runtimeFixture } from "../support/runtime-observation-fixture.js";

const time = (event: ObservationEvent) => (event.monotonicMs as number[])[0]!;

test("real send wait resolves before history/next turn; same key reuses one outbound after real 504 and positive query", async (t) => {
  let witness!: LifecycleWitness, activity!: ActivityWitness;
  let available = false;
  const effects: string[] = [];
  const f = await automationFixture(
    t,
    undefined,
    (remote) => {
      remote.post("/groups/remote-g/send", async (request, reply) => {
        effects.push((request.body as { clientMsgId: string }).clientMsgId);
        return reply.code(504).send({ code: "NETWORK_TIMEOUT" });
      });
      remote.get(
        "/groups/remote-g/messages/by-client-id/:id",
        async (_request, reply) =>
          available
            ? { msgId: "actual-effect-1", sentAt: new Date().toISOString() }
            : reply.code(503).send({ code: "SERVICE_UNAVAILABLE" }),
      );
    },
    (ctx) => {
      witness = new LifecycleWitness(ctx.db);
      activity = new ActivityWitness(ctx.db);
      ctx.testLifecycleObserver = witness;
      ctx.testActivityObserver = activity;
    },
  );
  f.onCleanup(() => witness.close());
  f.onCleanup(() => activity.close());
  await f.app.listen({ host: "127.0.0.1", port: 0 });
  const messages = new Messages(f.ctx);
  f.handlers.turn = () =>
    f.turns.length <= 2
      ? tool(`send-${f.turns.length}`, "send_message", {
          text: "one outbound",
          idempotency_key: "same-key",
        })
      : end();
  await f.inbound();
  const runId = await f.start();
  await until(
    async () =>
      (
        await f.db.query("SELECT * FROM agent_send_keys WHERE run_id=$1", [
          runId,
        ])
      ).rowCount === 1,
  );
  const row = (
    await f.db.query<{ client_msg_id: string; account_id: string }>(
      "SELECT client_msg_id,account_id FROM messages WHERE metadata->>'source'='agent'",
    )
  ).rows[0]!;
  await messages.accountWork(row.account_id);
  // The selected account is known from the actual outbound, not guessed by a stub.
  f.handlers.turn = async () => {
    if (f.turns.length === 2) {
      available = true;
      await messages.accountWork(row.account_id);
    }
    return f.turns.length <= 2
      ? tool(`send-${f.turns.length}`, "send_message", {
          text: "one outbound",
          idempotency_key: "same-key",
        })
      : end();
  };
  const binding: Binding = {
    apiUrl: f.app.listeningOrigin,
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    pid: process.pid,
    observedOwnerToken: randomUUID(),
  };
  const leaseId = randomUUID();
  const request: LifecycleRequest = {
    protocol: "qa-runtime-observation/1",
    target: {
      apiUrl: binding.apiUrl,
      revision: binding.revision,
      pid: binding.pid,
    },
    ttlMs: 10000,
    mode: "observe-tool-wait",
    correlation: {
      kind: "tool-wait",
      groupId: "g",
      runId,
      toolUseId: "all-run-steps",
    },
  };
  const first = await witness.establish(
    leaseId,
    request,
    new Date(Date.now() + 10000).toISOString(),
    binding,
  );
  const activityId = randomUUID();
  await activity.establish(
    activityId,
    {
      ...request,
      mode: "observe-activity",
      correlation: { ...request.correlation, kind: "activity" },
    },
    new Date(Date.now() + 10000).toISOString(),
    binding,
  );
  assert.equal((await f.complete(runId, 8000)).status, "finished");
  const snapshot = witness.snapshot(leaseId),
    events = snapshot.events;
  assert.deepEqual(events.slice(0, first.events.length), first.events);
  const one = (kind: string, toolUseId = "send-1") =>
    events.find((e) => e.kind === kind && e.toolUseId === toolUseId)!;
  const started = one("send-wait-started"),
    ready = one("send-wait-result-ready"),
    returned = one("send-tool-result-returned"),
    committed = one("send-tool-history-committed");
  assert.equal(returned.errorCode, "SEND_TIMEOUT");
  assert.equal(returned.attemptId, started.attemptId);
  assert.equal(returned.clientMsgId, row.client_msg_id);
  assert.ok(time(started) <= time(ready) && time(ready) <= time(returned));
  assert.ok(
    time(started) <= time(returned) && time(returned) <= time(committed),
  );
  const next = events.find(
    (e) => e.kind === "agent-turn-dispatched" && e.ordinal === 2,
  )!;
  assert.ok(time(committed) <= time(next));
  assert.equal(
    one("send-key-resolved", "send-2").clientMsgId,
    row.client_msg_id,
  );
  assert.equal(one("send-key-resolved", "send-2").keyReused, true);
  assert.equal(one("send-tool-result-returned", "send-2").errorCode, null);
  assert.equal(f.audits.length, 1);
  assert.equal(effects.length, 1);
  assert.equal((await f.steps(runId))[0]!.error_code, "SEND_TIMEOUT");
  assert.equal(
    events.some((e) => e.kind === "agent-run-created"),
    true,
  );
  const terminal = events.find((e) => e.kind === "agent-terminal-committed")!;
  const decision = events.find((e) => e.kind === "agent-termination-decided")!;
  assert.ok(time(decision) <= time(terminal));
  assert.equal(
    activity.snapshot(activityId).events.at(-1)!.clockDomain,
    returned.clockDomain,
  );
  await assert.rejects(witness.advance(leaseId), /no barrier/);
  const released = await witness.release(leaseId);
  assert.deepEqual((await witness.release(leaseId)).events, released.events);
  t.diagnostic(
    JSON.stringify({
      sample: "tool-wait-real-504",
      snapshot,
      activity: activity.snapshot(activityId),
      measuredWaitMs: time(returned) - time(started),
      resultReturnWindowMs: [time(ready), time(returned)],
      conclusion:
        "development observation only; no 5000ms tolerance or acceptance verdict",
    }),
  );
});

test("real controller preserves lost-response dispatch identity across SIGKILL and observes automatic 404 queries without inventing absence", async (t) => {
  const sendGate = deferred();
  let sends = 0,
    queries = 0,
    lands = false;
  const clientMsgId = randomUUID();
  const f = await runtimeFixture(t, false, {
    entry: "scripts/qa-observation-server.ts",
    configureRemote: (remote) => {
      remote.post("/groups/recovery-remote/send", async (_request, reply) => {
        sends++;
        await sendGate.promise;
        lands = true;
        return reply.code(202).send({ accepted: true });
      });
      remote.get(
        "/groups/recovery-remote/messages/by-client-id/:id",
        async (_request, reply) => {
          queries++;
          return lands
            ? { msgId: "later-real-effect", sentAt: new Date().toISOString() }
            : reply.code(404).send({ code: "NOT_FOUND" });
        },
      );
    },
  });
  f.onCleanup(async () => sendGate.resolve());
  await f.db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('recovery-g','recovery-remote','account-1')",
  );
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('recovery-g','account-1','account-1','creator')",
  );
  const send = await f.api("/api/groups/recovery-g/send", "POST", {
    accountId: "account-1",
    clientMsgId,
    text: "lost response",
  });
  assert.equal(send.status, 202, JSON.stringify(send.value));
  await until(async () => sends === 1);
  async function arm() {
    const id = randomUUID();
    const result = await f.request("PUT", `/leases/${id}`, {
      protocol: "qa-runtime-observation/1",
      target: f.target(),
      mode: "observe-message-recovery",
      ttlMs: 10000,
      correlation: {
        kind: "message-recovery",
        groupId: "recovery-g",
        clientMsgId,
      },
    });
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return id;
  }
  const oldLease = await arm();
  const original = await f.snapshot(oldLease);
  const dispatch = original.events.find(
    (e) => e.kind === "message-send-dispatch",
  )!;
  assert.ok(dispatch);
  assert.equal(
    original.events.some((e) => e.kind === "message-send-response-headers"),
    false,
  );
  const oldTarget = f.target();
  await f.kill();
  await f.start();
  assert.notEqual(oldTarget.pid, f.target().pid);
  const newLease = await arm();
  await until(async () => queries >= 3);
  const pending = await f.snapshot(newLease);
  const adopted = pending.events.find(
    (e) => e.kind === "message-recovery-adopted",
  )!;
  assert.equal(adopted.attemptId, dispatch.attemptId);
    assert.notEqual(adopted.clockDomain, dispatch.clockDomain);
    assert.equal(pending.events.some((e) => e.kind === "message-send-dispatch"), false);
    assert.equal(pending.events[0]!.includesPriorProcessHistory, false);
  assert.equal(adopted.recordedTimeoutAvailable, false);
  assert.equal(adopted.originalResponseReceipt, "not-durably-recorded");
  assert.ok(
    pending.events.some(
      (e) =>
        e.kind === "message-recovery-query-inconclusive" &&
        e.recoveryState === "automatic-query-pending",
    ),
  );
  assert.ok(
    pending.events.some(
      (e) =>
        e.kind === "message-query-response-body" && e.responseStatus === 404,
    ),
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT delivery_status FROM messages WHERE client_msg_id=$1",
        [clientMsgId],
      )
    ).rows[0]!.delivery_status,
    "unknown",
  );
  assert.equal(sends, 1);
  // A separate positive-result continuation; it does not close the prior
  // no-effect/no-signal trajectory or provide that trajectory a deadline.
  sendGate.resolve();
  const terminal = await f.event(newLease, "message-recovery-result-committed");
  assert.equal(terminal.events.at(-1)!.msgId, "later-real-effect");
  assert.equal(sends, 1);
  assert.equal((await f.snapshot(oldLease, "DELETE")).state, "released");
  assert.equal((await f.snapshot(newLease, "DELETE")).state, "released");
  f.evidence({
    sample: "lost-response-real-restart",
    original,
    pending,
    terminal,
    sends,
    queries,
  });
});
