import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { temporaryDatabase } from "../support/temporary-database.js";

type GatewayEvent = Parameters<GatewayEvents["process"]>[0];
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(
  read: () => Promise<boolean>,
  timeout = 3000,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  do {
    if (await read()) return true;
    await delay(10);
  } while (Date.now() < deadline);
  return false;
}

async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  await migrate(db);
  t.diagnostic(
    `independent database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('a','remote-a','account-1'),('b','remote-b','account-1')",
  );
  const remote = Fastify({ logger: false, forceCloseConnections: true });
  temporary.onCleanup(() => remote.close());
  const history: GatewayEvent[] = [];
  const streams = new Set<ServerResponse>();
  let memberRequests = 0;
  const remoteMembers = new Set(["external-a"]);
  remote.get("/groups/remote-a/members", async () => {
    memberRequests++;
    return [...remoteMembers].map((platformUserId) => ({ platformUserId }));
  });
  const frame = (event: GatewayEvent) => `data: ${JSON.stringify(event)}\n\n`;
  remote.get("/events", async (request, reply) => {
    assert.equal((request.query as { since: string }).since, "0");
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of history) reply.raw.write(frame(event));
    streams.add(reply.raw);
    reply.raw.once("close", () => streams.delete(reply.raw));
    return reply;
  });
  const gateway = new RemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const ctx = { db, gateway, agent: gateway, log: remote.log };
  let events = new GatewayEvents(ctx, new Messages(ctx));
  temporary.onCleanup(() => events.close());
  async function lockGroup() {
    const client = await db.pool.connect();
    let released = false;
    async function release() {
      if (released) return;
      released = true;
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
    temporary.onCleanup(release);
    await client.query("BEGIN");
    await client.query("SELECT id FROM groups WHERE id='a' FOR UPDATE");
    const pid = (
      await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    return { pid, release };
  }
  function publish(event: GatewayEvent) {
    history.push(event);
    for (const stream of streams) stream.write(frame(event));
  }
  return {
    db,
    get events() {
      return events;
    },
    async rebuild() {
      await events.close();
      events = new GatewayEvents(ctx, new Messages(ctx));
      events.start();
    },
    remoteMembers,
    lockGroup,
    publish,
    memberRequests: () => memberRequests,
  };
}
const joined = (eventId: number): GatewayEvent => ({
  eventId,
  type: "member_joined",
  groupId: "remote-a",
  platformUserId: "external-a",
});
const message = (
  eventId: number,
  msgId: string,
  sentAt: string,
): GatewayEvent => ({
  eventId,
  type: "message",
  groupId: "remote-b",
  msgId,
  senderPlatformUserId: "external-b",
  text: msgId,
  sentAt,
});

test("AR02 a group row lock defers its member events while later SSE messages commit, then retry recovers exactly once", async (t) => {
  const f = await fixture(t);
  const blocker = await f.lockGroup();
  const first = message(2, "b-first", "2024-01-02T00:00:00.000Z");
  f.publish(joined(1));
  f.publish(first);
  f.publish(first);
  f.publish(message(3, "b-historical", "2024-01-01T00:00:00.000Z"));
  f.publish(joined(4));
  const began = Date.now();
  let healthyAdvanced = false;
  let elapsedMs = 0;
  let retryMs: number | undefined;
  f.events.start();
  try {
    assert.equal(
      await waitFor(
        async () =>
          (
            await f.db.query(
              "SELECT 1 FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))",
              [blocker.pid],
            )
          ).rowCount! > 0,
        1000,
      ),
      true,
      "a real PostgreSQL wait behind A must be observed",
    );
    healthyAdvanced = await waitFor(
      async () =>
        (await f.db.query("SELECT 1 FROM messages WHERE group_id='b'"))
          .rowCount === 2,
      2300,
    );
    elapsedMs = Date.now() - began;
    t.diagnostic(
      `B messages while A remains locked: advanced=${healthyAdvanced}, elapsed=${elapsedMs}ms, member HTTP requests=${f.memberRequests()}`,
    );
    assert.equal(
      f.memberRequests(),
      0,
      "the 2s HTTP budget has not started while acquiring A's group lock",
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id IN (1,4)"))
        .rowCount,
      0,
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM members WHERE group_id='a'")).rowCount,
      0,
    );
    if (healthyAdvanced) {
      const retriedAt = Date.now();
      await f.events.retryFailed();
      retryMs = Date.now() - retriedAt;
      assert.ok(
        retryMs < 1000,
        `retry must also defer locked events; took ${retryMs}ms`,
      );
      assert.equal(
        (
          await f.db.query(
            "SELECT 1 FROM gateway_events WHERE event_id IN (1,4)",
          )
        ).rowCount,
        0,
        "lock timeout must roll back the dedup ledger too",
      );
    }
  } finally {
    await blocker.release();
  }
  await f.events.retryFailed();
  assert.equal(
    await waitFor(
      async () =>
        (
          await f.db.query(
            "SELECT 1 FROM gateway_events WHERE event_id IN (1,2,3,4)",
          )
        ).rowCount === 4,
    ),
    true,
  );
  await f.events.retryFailed();
  await f.events.process(joined(1));
  await f.events.process(first);
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM members WHERE group_id='a' AND platform_user_id='external-a'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM messages WHERE group_id='b'")).rowCount,
    2,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='group_changed' AND payload->>'groupId'='a'",
      )
    ).rowCount,
    1,
  );
  assert.deepEqual(
    (
      await f.db.query<{ msg_id: string }>(
        "SELECT msg_id FROM messages WHERE group_id='b' ORDER BY sent_at,id",
      )
    ).rows.map((row) => row.msg_id),
    ["b-historical", "b-first"],
  );
  assert.deepEqual(
    (
      await f.db.query<{ msg_id: string }>(
        "SELECT payload->>'msgId' AS msg_id FROM events WHERE type='message' AND payload->>'groupId'='b' ORDER BY seq",
      )
    ).rows.map((row) => row.msg_id),
    ["b-first", "b-historical"],
  );
  t.diagnostic(
    `after A release: ledger=4, A member=1, member change=1, B messages=2; locked retry=${retryMs ?? "not reached"}ms`,
  );
  assert.equal(
    healthyAdvanced,
    true,
    `B did not advance while A stayed locked for ${elapsedMs}ms`,
  );
  assert.ok(
    elapsedMs < 1000,
    `bounded member lock wait took ${elapsedMs}ms to release healthy events`,
  );
});

test("AR02 non-lock member failure retains replay and a delayed joined event cannot undo a newer authoritative leave", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO members(group_id,platform_user_id,role) VALUES('a','external-a','member')",
  );
  await f.db
    .query(`CREATE FUNCTION reject_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected member persistence failure'; END $$;
    CREATE TRIGGER reject_member BEFORE INSERT ON members FOR EACH ROW EXECUTE FUNCTION reject_member()`);
  f.publish(joined(10));
  f.publish(message(11, "b-after-failure", "2024-02-01T00:00:00.000Z"));
  f.events.start();
  assert.equal(
    await waitFor(
      async () =>
        (
          await f.db.query(
            "SELECT 1 FROM messages WHERE msg_id='b-after-failure'",
          )
        ).rowCount === 1,
    ),
    true,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=10"))
      .rowCount,
    0,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM members WHERE group_id='a'")).rowCount,
    1,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM events WHERE type='group_changed'"))
      .rowCount,
    0,
    "failed transaction cannot emit a committed projection change",
  );
  f.remoteMembers.clear();
  const left: GatewayEvent = {
    eventId: 12,
    type: "member_left",
    groupId: "remote-a",
    platformUserId: "external-a",
  };
  f.publish(left);
  f.publish(left);
  assert.equal(
    await waitFor(
      async () =>
        (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=12"))
          .rowCount === 1,
    ),
    true,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM members WHERE group_id='a'")).rowCount,
    0,
  );
  await f.db.query("DROP TRIGGER reject_member ON members");
  await f.events.retryFailed();
  await f.events.process(joined(10));
  await f.events.process(left);
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM gateway_events WHERE event_id IN (10,11,12)",
      )
    ).rowCount,
    3,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM members WHERE group_id='a'")).rowCount,
    0,
    "the older joined event must read current remote membership instead of resurrecting the member",
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='group_changed' AND payload->>'groupId'='a'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='inconsistency' AND payload->>'ref'='10'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM messages WHERE msg_id='b-after-failure'"))
      .rowCount,
    1,
  );
  t.diagnostic(
    `non-lock failure recovered: ledger=3, final A members=0, committed member changes=1, inconsistency=1; member HTTP requests=${f.memberRequests()}`,
  );
});

test("AR02 a rebuilt event handler recovers a deferred member event from real SSE history without duplicating committed messages", async (t) => {
  const f = await fixture(t);
  const blocker = await f.lockGroup();
  f.publish(joined(20));
  f.publish(message(21, "b-before-rebuild", "2024-03-01T00:00:00.000Z"));
  f.events.start();
  try {
    assert.equal(
      await waitFor(
        async () =>
          (
            await f.db.query(
              "SELECT 1 FROM messages WHERE msg_id='b-before-rebuild'",
            )
          ).rowCount === 1,
      ),
      true,
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=20"))
        .rowCount,
      0,
    );
    assert.equal(f.memberRequests(), 0);
    await f.events.close();
  } finally {
    await blocker.release();
  }
  // No retryFailed call: the replacement has a fresh in-memory retry map.
  await f.rebuild();
  assert.equal(
    await waitFor(
      async () =>
        (
          await f.db.query(
            "SELECT 1 FROM gateway_events WHERE event_id IN (20,21)",
          )
        ).rowCount === 2,
    ),
    true,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM members WHERE group_id='a' AND platform_user_id='external-a'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM messages WHERE msg_id='b-before-rebuild'"))
      .rowCount,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='message' AND payload->>'msgId'='b-before-rebuild'",
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='group_changed' AND payload->>'groupId'='a'",
      )
    ).rowCount,
    1,
  );
  t.diagnostic(
    "fresh GatewayEvents recovered from since=0 history: ledger=2, A member=1, B message=1, message notification=1",
  );
});
