import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import type { JobRow } from "../../apps/server/src/modules/gateway/models.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

type Reply = "ok" | "503" | "not_member" | "unknown";
async function promoteFixture(t: TestContext, replies: Reply[]) {
  const temporary = await temporaryDatabase(t);
  await migrate(temporary.db);
  const remote = Fastify({ logger: false });
  temporary.onCleanup(() => remote.close());
  let calls = 0;
  remote.post("/groups/remote-g/promote", async (_request, reply) => {
    calls++;
    switch (replies.shift() ?? "ok") {
      case "503":
        return reply.code(503).send({ code: "SERVICE_UNAVAILABLE" });
      case "not_member":
        return reply.code(409).send({ code: "NOT_MEMBER_YET" });
      case "unknown":
        return reply.code(504).send({ code: "NETWORK_TIMEOUT" });
      default:
        return {};
    }
  });
  const address = await remote.listen({ host: "127.0.0.1", port: 0 });
  const ctx: AppContext = {
    db: temporary.db,
    gateway: new RemoteClient(address),
    agent: new RemoteClient(address),
    log: remote.log,
  };
  const jobs = new Jobs(ctx);
  await temporary.db.query(
    "UPDATE accounts SET status='online',platform_user_id=id",
  );
  await temporary.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
  );
  await temporary.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-1','account-1','creator'),('g','account-2','account-2','member')",
  );
  await temporary.db.query(
    "INSERT INTO jobs(id,kind,group_id,state) VALUES('j','create','g',$1)",
    [
      JSON.stringify({
        phase: "promote",
        creatorAccountId: "account-1",
        memberAccountIds: ["account-2"],
      }),
    ],
  );
  const read = async () =>
    (await temporary.db.query<JobRow>("SELECT * FROM jobs WHERE id='j'"))
      .rows[0]!;
  async function ready() {
    await temporary.db.query(
      "UPDATE jobs SET state=state-'nextAt' WHERE id='j'",
    );
  }
  return { ...temporary, ctx, jobs, read, ready, calls: () => calls };
}

test("KG03 first explicit promote 503 retries after backoff and finishes within two calls", async (t) => {
  const f = await promoteFixture(t, ["503", "ok"]);
  await f.jobs.advance("j");
  const first = await f.read();
  assert.equal(first.state.phase, "promote");
  assert.equal(first.state.promoteAttempts, 1);
  assert.equal(first.state.recoveryNote, undefined);
  assert.ok(first.state.nextAt! > Date.now());
  await f.jobs.advance("j");
  assert.equal(f.calls(), 1, "backoff prevents another immediate request");
  await f.ready();
  await f.jobs.advance("j");
  assert.equal((await f.read()).status, "finished");
  assert.equal(f.calls(), 2);
  assert.equal(
    (await f.db.query("SELECT role FROM members WHERE account_id='account-2'"))
      .rows[0].role,
    "admin",
  );
});

for (const replies of [
  ["503", "503"],
  ["not_member", "503"],
  ["503", "not_member"],
] as Reply[][]) {
  test(`KG04 promote ${replies.join(" then ")} ends as explicit failure without a third call`, async (t) => {
    const expectedCode =
      replies[1] === "503" ? "SERVICE_UNAVAILABLE" : "NOT_MEMBER_YET";
    const f = await promoteFixture(t, [...replies]);
    await f.jobs.advance("j");
    await f.ready();
    await f.jobs.advance("j");
    const result = await f.read();
    assert.equal(result.status, "failed");
    assert.deepEqual(result.errors, [{ step: "promote", code: expectedCode }]);
    assert.equal(result.state.recoveryNote, undefined);
    for (let i = 0; i < 3; i++) await f.jobs.advance("j");
    assert.equal(f.calls(), 2);
  });
}

test("KG05 promote unknown response or persisted dispatch never silently retries", async (t) => {
  const f = await promoteFixture(t, ["unknown"]);
  await f.jobs.advance("j");
  assert.match((await f.read()).state.recoveryNote!, /未知/);
  await f.jobs.advance("j");
  assert.equal(f.calls(), 1);
  // Simulate a process exit after dispatch persistence, without a durable response.
  await f.db.query("UPDATE jobs SET state=state-'recoveryNote' WHERE id='j'");
  await new Jobs(f.ctx).advance("j");
  assert.match((await f.read()).state.recoveryNote!, /未知|没有保存/);
  assert.equal(f.calls(), 1);
});
