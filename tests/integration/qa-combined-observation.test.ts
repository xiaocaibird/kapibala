import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { createObservationController } from "../../scripts/qa-observation/controller.js";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";
import {
  protocol as messageProtocol,
  requestSchema,
} from "../../scripts/qa-message-observation/protocol.js";
import { createRuntimeObservationController } from "../../scripts/qa-runtime-observation/controller.js";
import { capacityFixture } from "../support/capacity-control-fixture.js";
import { until } from "../support/core-automation-fixture.js";

test("CO01 one real SUT preserves capacity, receipt and account observers simultaneously", async (t) => {
  const messageDir = await mkdtemp("/tmp/kap-cm-");
  const runtimeDir = await mkdtemp("/tmp/kap-cr-");
  t.after(async () => {
    await rm(messageDir, { recursive: true, force: true });
    await rm(runtimeDir, { recursive: true, force: true });
  });
  const messageControl = await createObservationController({
    directory: messageDir,
    prefix: "/qa/message/v1",
    protocol: messageProtocol,
    requestSchema,
  });
  t.after(() => messageControl.close());
  await messageControl.listen({ host: "127.0.0.1", port: 0 });
  const runtimeControl = await createRuntimeObservationController(runtimeDir);
  t.after(() => runtimeControl.close());
  await runtimeControl.listen({ host: "127.0.0.1", port: 0 });
  const streams = new Set<ServerResponse>();
  let connects = 0;
  const f = await capacityFixture(t, false, {
    entry: "scripts/qa-observation-server.ts",
    extraEnv: {
      QA_MESSAGE_REGISTRY_DIR: messageDir,
      QA_RUNTIME_REGISTRY_DIR: runtimeDir,
    },
    configureRemote: (remote) => {
      remote.post("/accounts/account-6/connect", () => {
        connects++;
        return { platformUserId: "account-6" };
      });
      remote.addHook("onRequest", (request, reply, done) => {
        if (request.url.split("?")[0] === "/events") {
          streams.add(reply.raw);
          reply.raw.once("close", () => streams.delete(reply.raw));
        }
        done();
      });
    },
  });
  async function request(
    origin: string,
    prefix: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    const response = await fetch(origin + prefix + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value: unknown = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value as ObservationSnapshot;
  }
  const mr = (path: string, method = "GET", body?: unknown) =>
    request(
      messageControl.listeningOrigin,
      "/qa/message/v1",
      path,
      method,
      body,
    );
  const rr = (path: string, method = "GET", body?: unknown) =>
    request(
      runtimeControl.listeningOrigin,
      "/qa/runtime/v1",
      path,
      method,
      body,
    );
  const query = new URLSearchParams({
    ...f.target(),
    pid: String(f.target().pid),
  });
  await until(async () => {
    try {
      await mr("/capabilities?" + query);
      await rr("/capabilities?" + query);
      return true;
    } catch {
      return false;
    }
  });
  const caps = await f.capabilities();
  assert.equal(caps.status, 200);
  for (const snapshot of [
    await mr("/capabilities?" + query),
    await rr("/capabilities?" + query),
  ]) {
    assert.equal(snapshot.binding.observedOwnerToken, f.token);
    assert.equal(snapshot.binding.pid, f.target().pid);
  }
  await f.prepare();
  const capacity = await f.hold();
  f.auditResponse.resolve();
  await until(async () =>
    (await f.snapshot(capacity.id)).events.some(
      (e) => e.kind === "admission-refused",
    ),
  );
  assert.equal(f.kicks(), 0);

  await f.db.query(
    "UPDATE accounts SET status='idle', platform_user_id=NULL WHERE id='account-6'",
  );
  const accountLease = randomUUID();
  await rr(`/leases/${accountLease}`, "PUT", {
    protocol: "qa-runtime-observation/1",
    target: f.target(),
    mode: "account-save-once",
    ttlMs: 20000,
    correlation: {
      kind: "account",
      accountId: "account-6",
      operation: "connect",
      intentId: randomUUID(),
    },
  });
  const connecting = f.api("/api/accounts/account-6/connect", {
    method: "POST",
  });
  await until(async () =>
    (await rr(`/leases/${accountLease}`)).events.some(
      (e) => e.kind === "local-retry-held",
    ),
  );
  assert.equal(connects, 1);
  assert.equal(
    (await f.db.query("SELECT status FROM accounts WHERE id='account-6'"))
      .rows[0]!.status,
    "idle",
  );

  await f.db.query(
    "INSERT INTO messages(id,group_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,delivery_status,dispatch_state) VALUES('combined-m','g','combined-client','account-2','account-2',true,'combined observation','accepted','waiting_event')",
  );
  const messageLease = randomUUID();
  await mr(`/leases/${messageLease}`, "PUT", {
    protocol: messageProtocol,
    target: f.target(),
    mode: "receipt-committed-before-business",
    ttlMs: 20000,
    correlation: {
      clientMsgId: "combined-client",
      msgId: "combined-remote",
      eventId: "9001",
    },
  });
  await until(async () => streams.size > 0);
  const event = {
    eventId: 9001,
    type: "message_sent",
    clientMsgId: "combined-client",
    msgId: "combined-remote",
    sentAt: new Date().toISOString(),
  };
  for (const stream of streams)
    stream.write(`id: 9001\ndata: ${JSON.stringify(event)}\n\n`);
  await until(
    async () => (await mr(`/leases/${messageLease}`)).state === "held",
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT count(*)::int AS n FROM message_sent_receipts WHERE client_msg_id='combined-client'",
      )
    ).rows[0]!.n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT delivery_status FROM messages WHERE id='combined-m'",
      )
    ).rows[0]!.delivery_status,
    "accepted",
  );
  assert.equal((await f.snapshot(capacity.id)).state, "held");
  assert.equal((await rr(`/leases/${accountLease}`)).state, "held");

  await mr(`/leases/${messageLease}/advance`, "POST");
  await until(
    async () =>
      (
        await f.db.query(
          "SELECT delivery_status FROM messages WHERE id='combined-m'",
        )
      ).rows[0]!.delivery_status === "sent",
  );
  await rr(`/leases/${accountLease}/advance`, "POST");
  assert.equal((await connecting).status, 200);
  await until(async () =>
    (await rr(`/leases/${accountLease}`)).events.some(
      (e) => e.kind === "local-save-committed",
    ),
  );
  const committed = (await rr(`/leases/${accountLease}`)).events.find(
    (e) => e.kind === "local-save-committed",
  )!;
  assert.equal(committed.commitBoundary, "outer-commit-confirmed");
  await f.snapshot(capacity.id, "DELETE");
  await until(async () => (await f.run()).status === "finished");
  assert.equal(f.kicks(), 1);
  assert.equal(connects, 1);
  await mr(`/leases/${messageLease}`, "DELETE");
  await rr(`/leases/${accountLease}`, "DELETE");
  f.evidence({
    capacity: await f.snapshot(capacity.id),
    message: await mr(`/leases/${messageLease}`),
    account: await rr(`/leases/${accountLease}`),
  });
});
