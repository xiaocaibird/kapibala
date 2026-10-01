import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { capacityFixture } from "../support/capacity-control-fixture.js";
import { until } from "../support/core-automation-fixture.js";
import { createObservationController } from "../../scripts/qa-observation/controller.js";
import {
  protocol,
  requestSchema,
  type MessageRequest,
} from "../../scripts/qa-message-observation/protocol.js";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";

async function fixture(t: TestContext, normal = false) {
  const streams = new Set<ServerResponse>();
  let sends = 0;
  const f = await capacityFixture(t, normal, {
    entry: normal
      ? "apps/server/src/main.ts"
      : "scripts/qa-message-observation-server.ts",
    registryVariable: "QA_MESSAGE_REGISTRY_DIR",
    controllerFactory: (directory) =>
      createObservationController({
        directory,
        prefix: "/qa/message/v1",
        protocol,
        requestSchema,
      }),
    configureRemote: (remote) => {
      remote.addHook("onRequest", (req, reply, done) => {
        if (req.url.split("?")[0] === "/events") {
          streams.add(reply.raw);
          reply.raw.once("close", () => streams.delete(reply.raw));
        }
        done();
      });
      remote.post("/groups/remote-g/send", (_req, reply) => {
        sends++;
        return reply.code(504).send({
          error: { code: "NETWORK_TIMEOUT", message: "real remote 504" },
        });
      });
      remote.get("/messages/:id", (_req, reply) =>
        reply
          .code(404)
          .send({ error: { code: "MESSAGE_NOT_FOUND", message: "absent" } }),
      );
    },
  });
  async function arm(mode: MessageRequest["mode"], ttlMs = 10000) {
    const id = randomUUID();
    const body: MessageRequest = {
      protocol,
      target: f.target(),
      mode,
      ttlMs,
      correlation:
        mode === "timeout-observed-before-local-save"
          ? { clientMsgId: "client-a" }
          : { clientMsgId: "client-a", msgId: "remote-a", eventId: "701" },
    } as MessageRequest;
    const r = await f.request("PUT", `/qa/message/v1/leases/${id}`, body);
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return { id, body };
  }
  async function snapshot(id: string) {
    const r = await f.request("GET", `/qa/message/v1/leases/${id}`);
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return r.value as ObservationSnapshot;
  }
  async function held(id: string) {
    await until(async () => (await snapshot(id)).state === "held", 5000);
    return snapshot(id);
  }
  async function seed(pending = false) {
    await f.db.query(
      "INSERT INTO messages(id,group_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,delivery_status,dispatch_state) VALUES('m','g','client-a','account-2','account-2',true,'receipt observation',$1,$2)",
      [pending ? "queued" : "accepted", pending ? "pending" : "waiting_event"],
    );
  }
  const event = {
    eventId: 701,
    type: "message_sent",
    clientMsgId: "client-a",
    msgId: "remote-a",
    sentAt: "2026-10-01T00:00:00.000Z",
  };
  async function emit(value = event) {
    await until(async () => streams.size > 0, 5000);
    for (const stream of streams)
      stream.write(`id: ${value.eventId}\ndata: ${JSON.stringify(value)}\n\n`);
  }
  const receipt = async () =>
    (
      await f.db.query<{ observed_at: Date }>(
        "SELECT observed_at FROM message_sent_receipts WHERE client_msg_id=$1 AND msg_id=$2",
        ["client-a", "remote-a"],
      )
    ).rows[0];
  const message = async () =>
    (
      await f.db.query<{
        delivery_status: string;
        message_sent_observed_at: Date | null;
        timeout_at: Date | null;
      }>(
        "SELECT delivery_status,message_sent_observed_at,timeout_at FROM messages WHERE id=$1",
        ["m"],
      )
    ).rows[0]!;
  return {
    ...f,
    arm,
    snapshot,
    held,
    seed,
    emit,
    receipt,
    message,
    sends: () => sends,
  };
}

test("MO01 production entry has no message bridge even with explicit QA variables", async (t) => {
  const f = await fixture(t, true);
  const target = f.target();
  const r = await f.request(
    "GET",
    "/qa/message/v1/capabilities?" +
      new URLSearchParams({ ...target, pid: String(target.pid) }),
  );
  assert.equal(r.status, 409);
});
test("MO02 committed receipt survives exact pre-business SIGKILL; old lease cannot control reused API", async (t) => {
  const f = await fixture(t);
  await f.seed();
  const lease = await f.arm("receipt-committed-before-business");
  await f.emit();
  const held = await f.held(lease.id);
  const receipt = await f.receipt();
  assert.ok(receipt);
  assert.equal((await f.message()).delivery_status, "accepted");
  assert.equal(
    held.events[0]?.localBoundary,
    "receipt-autocommit-confirmed-business-not-started",
  );
  assert.equal(held.events[0]?.receiptPresentAtProbe, true);
  const pid = f.target().pid;
  await f.kill();
  await f.start();
  assert.notEqual(f.target().pid, pid);
  const cleared = await f.request(
    "DELETE",
    `/qa/message/v1/leases/${lease.id}`,
  );
  assert.equal(cleared.status, 200);
  assert.equal((cleared.value as ObservationSnapshot).state, "released");
  await f.emit();
  await until(async () => (await f.message()).delivery_status === "sent", 5000);
  assert.equal(
    (await f.message()).message_sent_observed_at?.getTime(),
    receipt.observed_at.getTime(),
  );
  await f.emit({
    eventId: 702,
    type: "message_sent",
    clientMsgId: "client-a",
    msgId: "remote-a",
    sentAt: "2026-10-01T00:00:00.000Z",
  });
  await delay(150);
  assert.equal(
    (await f.receipt())?.observed_at.getTime(),
    receipt.observed_at.getTime(),
  );
  const publicResponse = await f.api("/api/groups/g/messages");
  assert.equal(publicResponse.status, 200);
  assert.match(await publicResponse.text(), /remote-a/);
  f.evidence({
    case: "MO02",
    held,
    firstPersisted: receipt.observed_at.toISOString(),
    after: await f.message(),
    interpretation: "Developer exact-window check, not a QA product result.",
  });
});
test("MO03 pre-INSERT window has no receipt; after SIGKILL replay cannot prove original physical timestamp", async (t) => {
  const f = await fixture(t);
  await f.seed();
  const lease = await f.arm("receipt-before-commit");
  await f.emit();
  const held = await f.held(lease.id);
  assert.equal(await f.receipt(), undefined);
  assert.equal(held.events[0]?.localBoundary, "receipt-insert-not-issued");
  const observation = Date.parse(String(held.events[0]?.observedAt));
  await delay(100);
  await f.kill();
  await f.start();
  await f.emit();
  await until(async () => (await f.message()).delivery_status === "sent", 5000);
  const r = await f.receipt();
  assert.ok(r && r.observed_at.getTime() > observation);
  f.evidence({
    case: "MO03-known-pre-save-limit",
    held,
    replayedReceipt: r.observed_at.toISOString(),
    interpretation:
      "Original physical observation was not durable; this controller exposes the limit, not a strict recovery pass. Scope is this bound instance, no all-writers claim.",
  });
});
test("MO04 real 504 is captured before local save; delay does not reset timeout timestamp", async (t) => {
  const f = await fixture(t);
  const lease = await f.arm("timeout-observed-before-local-save");
  await f.seed(true);
  const held = await f.held(lease.id);
  assert.equal(f.sends(), 1);
  assert.equal((await f.message()).timeout_at, null);
  const observed = Date.parse(String(held.events[0]?.observedAt));
  await delay(350);
  const advance = await f.request(
    "POST",
    `/qa/message/v1/leases/${lease.id}/advance`,
  );
  assert.equal(advance.status, 200);
  await until(async () => Boolean((await f.message()).timeout_at), 5000);
  assert.equal((await f.message()).timeout_at?.getTime(), observed);
  f.evidence({
    case: "MO04",
    held,
    storedTimeout: (await f.message()).timeout_at?.toISOString(),
  });
});
test("MO05 TTL releases real held receipt; bad target and duplicate UUID cannot retarget or extend gate", async (t) => {
  const f = await fixture(t);
  await f.seed();
  const lease = await f.arm("receipt-before-commit", 5000);
  const initial = await f.snapshot(lease.id);
  const duplicate = await f.request(
    "PUT",
    `/qa/message/v1/leases/${lease.id}`,
    lease.body,
  );
  assert.equal(duplicate.status, 200);
  assert.equal(
    (duplicate.value as ObservationSnapshot).expiresAt,
    initial.expiresAt,
  );
  const changed = await f.request("PUT", `/qa/message/v1/leases/${lease.id}`, {
    ...lease.body,
    ttlMs: 6000,
  });
  assert.equal(changed.status, 409);
  const bad = await f.request("PUT", `/qa/message/v1/leases/${randomUUID()}`, {
    ...lease.body,
    target: { ...lease.body.target, pid: 1 },
  });
  assert.equal(bad.status, 409);
  await f.emit();
  await f.held(lease.id);
  await until(
    async () => (await f.snapshot(lease.id)).state === "released",
    7000,
  );
  await until(async () => (await f.message()).delivery_status === "sent", 5000);
  const before = await f.snapshot(lease.id);
  const clean = await f.request("DELETE", `/qa/message/v1/leases/${lease.id}`);
  assert.equal(clean.status, 200);
  assert.deepEqual((clean.value as ObservationSnapshot).events, before.events);
});
