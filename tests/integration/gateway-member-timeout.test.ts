import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

test("KM01 a slow member query rolls back and retries while a later group's SSE message proceeds", async (t) => {
  const temporary = await temporaryDatabase(t);
  await migrate(temporary.db);
  const { db } = temporary;
  const remote = Fastify({ logger: false, forceCloseConnections: true });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  temporary.onCleanup(async () => {
    release();
    await remote.close();
  });
  let memberRequests = 0;
  const startedAt = Date.now();
  remote.get("/groups/remote-a/members", async () => {
    memberRequests++;
    if (memberRequests === 1) await blocked;
    return [{ platformUserId: "external-member" }];
  });
  remote.get("/events", async (_request, reply) => {
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    reply.raw.write(
      `data: ${JSON.stringify({ eventId: 1, type: "member_joined", groupId: "remote-a", platformUserId: "external-member" })}\n\n`,
    );
    reply.raw.write(
      `data: ${JSON.stringify({ eventId: 2, type: "message", groupId: "remote-b", msgId: "m", senderPlatformUserId: "external", text: "later event", sentAt: new Date().toISOString() })}\n\n`,
    );
    return reply;
  });
  const gateway = new RemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const ctx = { db, gateway, agent: gateway, log: remote.log };
  const events = new GatewayEvents(ctx, new Messages(ctx));
  temporary.onCleanup(() => events.close());
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('a','remote-a','account-1'),('b','remote-b','account-1')",
  );
  events.start();
  const deadline = Date.now() + 4000;
  while (
    !(await db.query("SELECT 1 FROM messages WHERE msg_id='m'")).rowCount
  ) {
    if (Date.now() >= deadline)
      assert.fail("later SSE message remained blocked");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const elapsedMs = Date.now() - startedAt;
  t.diagnostic(`later group's message persisted after ${elapsedMs} ms`);
  assert.ok(
    elapsedMs < 3000,
    `single member timeout blocked for ${elapsedMs} ms`,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM gateway_events WHERE event_id='1'"))
      .rowCount,
    0,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM members WHERE group_id='a'")).rowCount,
    0,
    "timeout must not invent membership",
  );
  // The first HTTP handler stays blocked: retry uses an independent successful request.
  await events.retryFailed();
  assert.equal(memberRequests, 2);
  assert.equal(
    (await db.query("SELECT 1 FROM gateway_events WHERE event_id='1'"))
      .rowCount,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM members WHERE group_id='a' AND platform_user_id='external-member'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM events WHERE type='inconsistency'"))
      .rowCount,
    1,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM messages WHERE msg_id='m'")).rowCount,
    1,
  );
});
