import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import { migrate } from "../../scripts/migrate.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture(t: TestContext) {
  const url = new URL(
    process.env.DATABASE_URL ??
      "postgres://kapibala:kapibala@localhost:55432/kapibala",
  );
  url.pathname = "/postgres";
  const admin = new Database(url.toString());
  const name = `member_rejoin_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const db = new Database(url.toString());
  await migrate(db);
  const groupId = randomUUID();
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id=CASE id WHEN 'account-1' THEN 'creator' ELSE 'member-2' END WHERE id IN ('account-1','account-2')",
  );
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES($1,'remote-group','account-1')",
    [groupId],
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-1','creator','creator'),($1,'account-2','member-2','member')",
    [groupId],
  );
  const remoteMembers = new Set(["creator", "member-2"]);
  const deleted = deferred();
  const releaseResponse = deferred();
  const calls = { kick: 0, leave: 0 };
  let failReads = false;
  const remote = Fastify({ logger: false });
  remote.get("/groups/remote-group/members", async (_request, reply) => {
    if (failReads) return reply.code(503).send({ code: "SERVICE_UNAVAILABLE" });
    return [...remoteMembers].map((platformUserId) => ({ platformUserId }));
  });
  remote.post("/groups/remote-group/kick", async () => {
    calls.kick++;
    remoteMembers.delete("member-2");
    deleted.resolve();
    await releaseResponse.promise;
    return { kicked: true };
  });
  remote.post("/groups/remote-group/leave", async (request) => {
    calls.leave++;
    const { accountId } = request.body as { accountId: string };
    remoteMembers.delete(accountId === "account-1" ? "creator" : "member-2");
    deleted.resolve();
    await releaseResponse.promise;
    return {};
  });
  const gateway = new RemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const ctx = { db, gateway, agent: gateway, log: remote.log };
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  const jobs = new Jobs(ctx);
  t.after(async () => {
    releaseResponse.resolve();
    await remote.close();
    await db.close();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.close();
  });
  return {
    db,
    groupId,
    messages,
    events,
    jobs,
    calls,
    deleted,
    releaseResponse,
    remoteMembers,
    failReads(value: boolean) {
      failReads = value;
    },
    kick: () =>
      messages.kick({
        groupId,
        accountId: "account-1",
        targetPlatformUserId: "member-2",
      }),
    localContains: async () =>
      Boolean(
        (
          await db.query(
            "SELECT 1 FROM members WHERE group_id=$1 AND platform_user_id='member-2'",
            [groupId],
          )
        ).rowCount,
      ),
    rejoin: async () => {
      remoteMembers.add("member-2");
      await events.process({
        eventId: "100",
        type: "member_joined",
        groupId: "remote-group",
        platformUserId: "member-2",
      });
      assert.equal(
        (await db.query("SELECT 1 FROM gateway_events WHERE event_id=100"))
          .rowCount,
        1,
        "member_joined must be committed before releasing the old operation response",
      );
    },
    createLeave: async () => {
      const id = randomUUID();
      await db.query(
        "INSERT INTO jobs(id,kind,group_id,state) VALUES($1,'leave',$2,$3)",
        [
          id,
          groupId,
          JSON.stringify({
            phase: "leave",
            leavingIds: ["account-2", "account-1"],
            index: 0,
          }),
        ],
      );
      return id;
    },
  };
}

test(
  "kick 200 arriving after a committed rejoin preserves current membership without kicking twice",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const operation = f.kick();
    await f.deleted.promise;
    await f.rejoin();
    assert.equal(await f.localContains(), true);
    f.releaseResponse.resolve();
    assert.deepEqual(await operation, { kicked: true });
    assert.equal(f.remoteMembers.has("member-2"), true);
    assert.equal(
      await f.localContains(),
      true,
      "an old successful kick response must not erase the newer member_joined projection",
    );
    assert.equal(f.calls.kick, 1);
  },
);

test(
  "leave 200 arriving after rejoin retains the member and prevents the creator from leaving",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const jobId = await f.createLeave();
    const operation = f.jobs.advance(jobId);
    await f.deleted.promise;
    await f.rejoin();
    f.releaseResponse.resolve();
    await operation;
    assert.equal(f.remoteMembers.has("member-2"), true);
    assert.equal(
      await f.localContains(),
      true,
      "confirmed leave is past operation evidence, not proof of current absence",
    );
    await f.jobs.advance(jobId);
    assert.equal(
      f.calls.leave,
      1,
      "creator must remain when a departed service account has rejoined",
    );
    const job = await f.jobs.get(jobId);
    assert.equal(job.status, "failed");
    assert.ok(
      job.errors.some((error) => error.code === "MEMBER_STILL_PRESENT"),
    );
  },
);

test(
  "member refresh failure after confirmed kick remains success and converges through event retry",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    f.failReads(true);
    f.releaseResponse.resolve();
    assert.deepEqual(
      await f.kick(),
      { kicked: true },
      "member GET failure must not turn the confirmed operation into unknown",
    );
    assert.equal(
      await f.localContains(),
      true,
      "without a current snapshot, do not overwrite the current projection",
    );
    assert.equal(
      (
        await f.db.query(
          "SELECT 1 FROM events WHERE type='inconsistency' AND payload->>'kind'='membership_refresh_failed'",
        )
      ).rowCount,
      1,
    );
    await f.events.process({
      eventId: "101",
      type: "member_left",
      groupId: "remote-group",
      platformUserId: "member-2",
    });
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=101"))
        .rowCount,
      0,
    );
    f.failReads(false);
    await f.events.retryFailed();
    assert.equal(await f.localContains(), false);
    assert.equal(f.calls.kick, 1);
  },
);

test(
  "leave refresh failure preserves confirmed progress and prevents unsafe creator departure",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const jobId = await f.createLeave();
    f.failReads(true);
    f.releaseResponse.resolve();
    await f.jobs.advance(jobId);
    assert.equal(await f.localContains(), true);
    const job = await f.jobs.get(jobId);
    assert.equal(
      job.recoveryNote,
      null,
      "a confirmed leave must not be recorded as an unknown operation",
    );
    assert.ok(
      job.errors.some((error) => error.code === "MEMBERS_REFRESH_FAILED"),
    );
    await f.jobs.advance(jobId);
    assert.equal(f.calls.leave, 1);
    assert.equal(f.remoteMembers.has("creator"), true);
    await f.events.process({
      eventId: "101",
      type: "member_left",
      groupId: "remote-group",
      platformUserId: "member-2",
    });
    f.failReads(false);
    await f.events.retryFailed();
    assert.equal(await f.localContains(), false);
  },
);

test(
  "leave completion reads current members after acquiring the group projection lock",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const jobId = randomUUID();
    await f.db.query(
      "INSERT INTO jobs(id,kind,group_id,state) VALUES($1,'leave',$2,$3)",
      [
        jobId,
        f.groupId,
        JSON.stringify({ phase: "leave", leavingIds: [], index: 0 }),
      ],
    );
    f.remoteMembers.clear();
    const observer = await f.db.pool.connect();
    let committed = false;
    let completion: Promise<void> | undefined;
    try {
      await observer.query("BEGIN");
      await observer.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
        f.groupId,
      ]);
      completion = f.jobs.advance(jobId);
      const deadline = Date.now() + 5000;
      while (
        !(
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
          )
        ).rowCount
      ) {
        if (Date.now() > deadline)
          throw new Error(
            "Completion did not wait for the concurrent group projection",
          );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      f.remoteMembers.add("member-2");
      await observer.query("COMMIT");
      committed = true;
      await completion;
      assert.equal(await f.localContains(), true);
      assert.equal((await f.jobs.get(jobId)).status, "failed");
      assert.equal(
        (
          await f.db.query<{ status: string }>(
            "SELECT status FROM groups WHERE id=$1",
            [f.groupId],
          )
        ).rows[0]!.status,
        "active",
      );
    } finally {
      if (!committed) await observer.query("ROLLBACK");
      observer.release();
      await completion;
    }
  },
);
