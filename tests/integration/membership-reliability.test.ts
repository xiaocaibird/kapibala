import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import { changeAccount } from "../../apps/server/src/modules/gateway/state.js";
import { migrate } from "../../scripts/migrate.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function until(read: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await read())) {
    if (Date.now() > deadline)
      throw new Error(
        "Expected concurrent transaction did not reach its blocking point",
      );
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function fixture(t: TestContext) {
  const url = new URL(
    process.env.DATABASE_URL ??
      "postgres://kapibala:kapibala@localhost:55432/kapibala",
  );
  url.pathname = "/postgres";
  const admin = new Database(url.toString());
  const name = `membership_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const db = new Database(url.toString());
  const remote = Fastify({ logger: false });
  let members = [{ platformUserId: "member-2" }];
  let readMembers = async () => members;
  remote.get("/groups/gateway-group/members", async () => readMembers());
  remote.post("/groups/gateway-group/join", async (_request, reply) =>
    reply.code(409).send({ code: "ALREADY_MEMBER" }),
  );
  remote.post("/groups/gateway-group/leave", async () => ({}));
  const gateway = new RemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const ctx = { db, gateway, agent: gateway, log: remote.log };
  const events = new GatewayEvents(ctx, new Messages(ctx));
  t.after(async () => {
    await remote.close();
    await db.close();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.close();
  });
  await migrate(db);
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id=CASE id WHEN 'account-1' THEN 'creator' ELSE 'member-2' END WHERE id IN ('account-1','account-2')",
  );
  const groupId = randomUUID();
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES($1,'gateway-group','account-1')",
    [groupId],
  );
  return {
    db,
    events,
    jobs: new Jobs(ctx),
    groupId,
    setMembers: (value: typeof members) => {
      members = value;
    },
    setReadMembers: (value: typeof readMembers) => {
      readMembers = value;
    },
    members: async () =>
      (await db.query("SELECT * FROM members WHERE group_id=$1", [groupId]))
        .rows,
    blocked: async () =>
      Boolean(
        (
          await db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
          )
        ).rowCount,
      ),
    join: () =>
      events.process({
        eventId: "100",
        type: "member_joined",
        groupId: "gateway-group",
        platformUserId: "member-2",
      }),
  };
}

test(
  "a delayed member snapshot cannot overwrite a newer member removal from another event worker",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const firstRead = deferred();
    const releaseRead = deferred();
    let reads = 0;
    f.setReadMembers(async () => {
      if (++reads === 1) {
        firstRead.resolve();
        await releaseRead.promise;
        return [{ platformUserId: "member-2" }];
      }
      return [];
    });
    const oldEvent = f.join();
    await firstRead.promise;
    let newFinished = false;
    const newEvent = f.events
      .process({
        eventId: "101",
        type: "member_left",
        groupId: "gateway-group",
        platformUserId: "member-2",
      })
      .then(() => {
        newFinished = true;
      });
    try {
      await until(async () => newFinished || (await f.blocked()));
    } finally {
      releaseRead.resolve();
    }
    await Promise.all([oldEvent, newEvent]);
    assert.equal(reads, 2);
    assert.equal(
      (await f.members()).length,
      0,
      "late pre-removal snapshot must not resurrect the member",
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events")).rowCount,
      2,
    );
  },
);

test(
  "member_joined rechecks terminal account state under the same lock as terminal cleanup",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const locked = deferred();
    const terminalMayCommit = deferred();
    const terminal = f.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM accounts WHERE id='account-2' FOR UPDATE");
      locked.resolve();
      await terminalMayCommit.promise;
      await changeAccount(tx, "account-2", "suspended");
    });
    await locked.promise;
    const joined = f.join();
    try {
      await until(f.blocked);
    } finally {
      terminalMayCommit.resolve();
    }
    await Promise.all([terminal, joined]);
    assert.equal(
      (
        await f.db.query<{ status: string }>(
          "SELECT status FROM accounts WHERE id='account-2'",
        )
      ).rows[0]!.status,
      "suspended",
    );
    assert.equal(
      (await f.members()).length,
      0,
      "a terminal account must remain removed after a delayed member_joined commit",
    );
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id='100'"))
        .rowCount,
      1,
    );
  },
);

test(
  "a delayed member snapshot cannot undo a successful leave job",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const jobId = randomUUID();
    await f.db.query(
      "INSERT INTO jobs(id,kind,group_id,state) VALUES($1,'leave',$2,$3)",
      [
        jobId,
        f.groupId,
        JSON.stringify({ phase: "leave", leavingIds: ["account-2"], index: 0 }),
      ],
    );
    const snapshotRead = deferred();
    const releaseRead = deferred();
    f.setReadMembers(async () => {
      snapshotRead.resolve();
      await releaseRead.promise;
      return [{ platformUserId: "member-2" }];
    });
    const joined = f.join();
    await snapshotRead.promise;
    let leaveFinished = false;
    const leave = f.jobs.advance(jobId).then(() => {
      leaveFinished = true;
    });
    try {
      await until(async () => leaveFinished || (await f.blocked()));
    } finally {
      releaseRead.resolve();
    }
    await Promise.all([joined, leave]);
    assert.equal(
      (await f.members()).length,
      0,
      "completed remote leave must serialize its local removal with delayed member snapshots",
    );
  },
);

test(
  "member_joined cannot add a member after the group has atomically become left",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const locked = deferred();
    const leaveMayCommit = deferred();
    const leave = f.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
        f.groupId,
      ]);
      locked.resolve();
      await leaveMayCommit.promise;
      await tx.query("DELETE FROM members WHERE group_id=$1", [f.groupId]);
      await tx.query("UPDATE groups SET status='left' WHERE id=$1", [
        f.groupId,
      ]);
    });
    await locked.promise;
    const joined = f.join();
    try {
      await until(f.blocked);
    } finally {
      leaveMayCommit.resolve();
    }
    await Promise.all([leave, joined]);
    assert.equal(
      (await f.members()).length,
      0,
      "left group's public empty membership must also remain empty in storage",
    );
  },
);

test(
  "ALREADY_MEMBER job reconciliation cannot reinsert an account after terminal cleanup",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const jobId = randomUUID();
    await f.db.query(
      "INSERT INTO jobs(id,kind,group_id,state) VALUES($1,'create',$2,$3)",
      [
        jobId,
        f.groupId,
        JSON.stringify({
          phase: "join",
          creatorAccountId: "account-1",
          memberAccountIds: ["account-2"],
          index: 0,
          inviteLink: "test",
        }),
      ],
    );
    const locked = deferred();
    const terminalMayCommit = deferred();
    const terminal = f.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM accounts WHERE id='account-2' FOR UPDATE");
      locked.resolve();
      await terminalMayCommit.promise;
      await changeAccount(tx, "account-2", "session_expired");
    });
    await locked.promise;
    const joining = f.jobs.advance(jobId);
    try {
      await until(f.blocked);
    } finally {
      terminalMayCommit.resolve();
    }
    await Promise.all([terminal, joining]);
    assert.equal(
      (await f.members()).length,
      0,
      "ALREADY_MEMBER is remote evidence, not permission to restore a terminal account",
    );
  },
);

test(
  "twenty persistent event failures cannot starve a later recoverable event",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    await f.db.query("DELETE FROM groups WHERE id=$1", [f.groupId]);
    for (let index = 1; index <= 21; index++) {
      await f.events.process({
        eventId: String(200 + index),
        type: "member_joined",
        groupId: index === 21 ? "gateway-group" : `missing-group-${index}`,
        platformUserId: "member-2",
      });
    }
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events")).rowCount,
      0,
    );
    await f.db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES($1,'gateway-group','account-1')",
      [f.groupId],
    );
    await f.events.retryFailed();
    await f.events.retryFailed();
    assert.equal(
      (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id='221'"))
        .rowCount,
      1,
      "retry rotation must reach the recovered twenty-first event without reconnect or restart",
    );
    assert.equal((await f.members()).length, 1);
  },
);
