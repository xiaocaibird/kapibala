import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import Fastify from "fastify";
import { AppError } from "../../apps/server/src/core/errors.js";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { AgentModule } from "../../apps/server/src/modules/automation/agent.js";
import { SequenceModule } from "../../apps/server/src/modules/automation/sequences.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import type { Group } from "../../packages/contracts/src/index.js";
import { temporaryDatabase } from "../support/temporary-database.js";

async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  t.diagnostic(
    `isolated database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await migrate(db);
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id='p-' || id",
  );
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES('g','remote-g','account-1',true)",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-1','p-account-1','creator'),('g','account-2','p-account-2','admin'),('g','account-3','p-account-3','member'),('g',null,'external-kept','member'),('g',null,'external-stale','member')",
  );
  const remoteMembers = new Set([
    "p-account-1",
    "p-account-2",
    "p-account-3",
    "external-kept",
    "external-new",
  ]);
  const leaves: string[] = [];
  const calls: string[] = [];
  const faults = { failedAccount: "", membersUnavailable: false };
  const remote = Fastify({ logger: false });
  temporary.onCleanup(() => remote.close());
  remote.addHook("onRequest", async (request) => {
    calls.push(request.url);
  });
  remote.get("/groups/remote-g/members", async (_request, reply) =>
    faults.membersUnavailable
      ? reply.code(503).send({ code: "SERVICE_UNAVAILABLE" })
      : [...remoteMembers].map((platformUserId) => ({ platformUserId })),
  );
  remote.post("/groups/remote-g/leave", async (request, reply) => {
    const { accountId } = request.body as { accountId: string };
    leaves.push(accountId);
    if (accountId === faults.failedAccount)
      return reply.code(500).send({ code: "LEAVE_FAILED" });
    remoteMembers.delete(`p-${accountId}`);
    return {};
  });
  const gateway = new RemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const ctx = { db, gateway, agent: gateway, log: remote.log };
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  temporary.onCleanup(() => events.close());
  const jobs = new Jobs(ctx);
  const app = Fastify({ logger: false });
  temporary.onCleanup(() => app.close());
  app.setErrorHandler((error, _request, reply) =>
    error instanceof AppError
      ? reply.code(error.status).send({ error: { code: error.code } })
      : reply.code(500).send({ error: String(error) }),
  );
  await createGatewayModule(ctx).register(app);
  const sequences = new SequenceModule(ctx, messages);
  temporary.onCleanup(() => sequences.close());
  await sequences.register(app);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  async function api<
    T = { jobId: string; status: string; error: { code: string } },
  >(method: string, path: string, body?: unknown) {
    const response = await fetch(`${address}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as T };
  }
  const group = async () => (await api<Group>("GET", "/api/groups/g")).body;
  const localMembers = async () =>
    (
      await db.query(
        "SELECT account_id,platform_user_id,role FROM members WHERE group_id='g' ORDER BY platform_user_id",
      )
    ).rows;
  async function leaveAll() {
    const response = await api("POST", "/api/groups/g/leave-all", {});
    assert.equal(response.status, 202);
    return response.body.jobId as string;
  }
  async function finish(jobId: string) {
    for (let i = 0; i < 6; i++) await jobs.advance(jobId);
    return jobs.get(jobId);
  }
  async function member(
    eventId: number,
    type: "member_joined" | "member_left",
    platformUserId: string,
    handler = events,
  ) {
    await handler.process({
      eventId,
      type,
      groupId: "remote-g",
      platformUserId,
    });
  }
  return {
    ...temporary,
    ctx,
    messages,
    events,
    jobs,
    sequences,
    api,
    group,
    localMembers,
    leaveAll,
    finish,
    member,
    remoteMembers,
    leaves,
    calls,
    faults,
  };
}
const external = (platformUserId: string) => ({
  accountId: null,
  platformUserId,
  role: "member",
});

test("LM01 D042: leave-all exits only managed accounts, creator last; final HTTP and DB members match current external facts", async (t) => {
  const f = await fixture(t);
  const jobId = await f.leaveAll();
  assert.equal((await f.finish(jobId)).status, "finished");
  assert.deepEqual(f.leaves, ["account-2", "account-3", "account-1"]);
  assert.deepEqual([...f.remoteMembers].sort(), [
    "external-kept",
    "external-new",
  ]);
  const group = await f.group();
  assert.equal(group.status, "left");
  assert.deepEqual(
    group.members,
    ["external-kept", "external-new"].map(external),
  );
  assert.deepEqual(
    await f.localMembers(),
    ["external-kept", "external-new"].map((platform_user_id) => ({
      account_id: null,
      platform_user_id,
      role: "member",
    })),
  );
  assert.deepEqual(
    (await f.db.query("SELECT state FROM jobs WHERE id=$1", [jobId])).rows[0]!
      .state.gatewayMembersAtCompletion,
    [...f.remoteMembers].map((platformUserId) => ({ platformUserId })),
  );
  assert.equal(
    (await f.api("GET", "/api/jobs/" + jobId)).body.status,
    "finished",
  );
});

test("LM02 D042: left member replay reconciles external joins/leaves but never resurrects managed members; failed reads retry", async (t) => {
  const f = await fixture(t);
  await f.finish(await f.leaveAll());
  const restarted = new GatewayEvents(f.ctx, f.messages);
  f.onCleanup(() => restarted.close());
  f.remoteMembers.delete("external-kept");
  f.remoteMembers.add("external-later");
  f.remoteMembers.add("p-account-2");
  f.remoteMembers.add("p-account-1");
  await f.db.query(
    "UPDATE accounts SET status='suspended' WHERE id='account-2'",
  );
  // A stale left notification for an external who is currently present also uses
  // the fresh snapshot. No historical event is allowed to erase a later rejoin.
  await f.member(201, "member_left", "external-later", restarted);
  assert.deepEqual(
    (await f.group()).members,
    ["external-later", "external-new"].map(external),
  );
  assert.equal((await f.group()).status, "left");
  const before = (
    await f.db.query("SELECT 1 FROM events WHERE type='group_changed'")
  ).rowCount;
  await f.member(201, "member_left", "external-later", restarted);
  await f.member(202, "member_joined", "p-account-2", restarted);
  assert.equal(
    (await f.db.query("SELECT 1 FROM events WHERE type='group_changed'"))
      .rowCount,
    before,
  );
  f.remoteMembers.add("external-retry");
  f.faults.membersUnavailable = true;
  await f.member(203, "member_joined", "external-retry", restarted);
  assert.equal(
    (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=203"))
      .rowCount,
    0,
  );
  assert.deepEqual(
    (await f.group()).members,
    ["external-later", "external-new"].map(external),
  );
  f.faults.membersUnavailable = false;
  await restarted.retryFailed();
  assert.deepEqual(
    (await f.group()).members,
    ["external-later", "external-new", "external-retry"].map(external),
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=203"))
      .rowCount,
    1,
  );
  assert.equal(
    (await f.db.query("SELECT 1 FROM members WHERE account_id IS NOT NULL"))
      .rowCount,
    0,
  );
  assert.deepEqual(f.leaves, ["account-2", "account-3", "account-1"]);
});

test("LM03 D042: a non-creator failure still continues others and keeps creator, failed account and active state", async (t) => {
  const f = await fixture(t);
  f.faults.failedAccount = "account-2";
  const job = await f.finish(await f.leaveAll());
  assert.equal(job.status, "failed");
  assert.deepEqual(job.errors, [
    { step: "leave:account-2", code: "LEAVE_FAILED" },
  ]);
  assert.deepEqual(f.leaves, ["account-2", "account-3"]);
  assert.equal((await f.group()).status, "active");
  assert.deepEqual(
    (await f.localMembers())
      .filter((m) => m.account_id)
      .map((m) => m.account_id),
    ["account-1", "account-2"],
  );
  assert.equal(f.remoteMembers.has("p-account-1"), true);
  assert.equal(f.remoteMembers.has("p-account-2"), true);
  assert.equal(f.remoteMembers.has("external-kept"), true);
});

test("LM04 D042: final membership transaction failure recovers without another leave or partial left state", async (t) => {
  const f = await fixture(t);
  const jobId = await f.leaveAll();
  for (let i = 0; i < 3; i++) await f.jobs.advance(jobId);
  await f.db.query(
    "CREATE FUNCTION reject_external_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.platform_user_id='external-new' THEN RAISE EXCEPTION 'injected external projection failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_external_projection BEFORE INSERT ON members FOR EACH ROW EXECUTE FUNCTION reject_external_projection()",
  );
  await assert.rejects(
    f.jobs.advance(jobId),
    /injected external projection failure/,
  );
  assert.equal((await f.jobs.get(jobId)).status, "running");
  assert.equal((await f.group()).status, "active");
  assert.deepEqual(
    (await f.group()).members,
    ["external-kept", "external-stale"].map(external),
  );
  await f.db.query("DROP TRIGGER reject_external_projection ON members");
  const restarted = new Jobs(f.ctx);
  await restarted.advance(jobId);
  assert.equal((await restarted.get(jobId)).status, "finished");
  assert.equal((await f.group()).status, "left");
  assert.deepEqual(
    (await f.group()).members,
    ["external-kept", "external-new"].map(external),
  );
  assert.deepEqual(f.leaves, ["account-2", "account-3", "account-1"]);
});

test("LM05 D042: preserved external members cannot enable sending, kick, sequence or Agent recovery in a left group", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id) VALUES('agent-r','g'); INSERT INTO sequences(id,name,steps) VALUES('s','left guard','[{\"index\":1,\"accountRole\":\"member\",\"text\":\"must not send\",\"delaySeconds\":0}]'); INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('r','g','s'); INSERT INTO sequence_steps(run_id,index,account_role,text,delay_seconds,resolved_vars,var_sources,scheduled_at) VALUES('r',1,'member','must not send',0,'{}','{}',now())",
  );
  await f.finish(await f.leaveAll());
  const callCount = f.calls.length;
  assert.equal(
    (
      await f.db.query(
        "SELECT cancel_requested FROM agent_runs WHERE id='agent-r'",
      )
    ).rows[0]!.cancel_requested,
    true,
  );
  const send = await f.api("POST", "/api/groups/g/send", {
    accountId: "account-2",
    text: "blocked",
  });
  assert.equal(send.status, 409);
  assert.equal(send.body.error.code, "GROUP_UNREACHABLE");
  await assert.rejects(
    f.messages.kick({
      groupId: "g",
      accountId: "account-2",
      targetPlatformUserId: "external-kept",
    }),
    { code: "GROUP_UNREACHABLE" },
  );
  const start = await f.api("POST", "/api/groups/g/sequence-runs", {
    sequenceId: "s",
    vars: {},
    stepVars: {},
  });
  assert.equal(start.status, 409);
  assert.equal(start.body.error.code, "GROUP_UNREACHABLE");
  await f.events.process({
    eventId: 301,
    type: "message",
    groupId: "remote-g",
    msgId: "external-after-left",
    senderPlatformUserId: "external-kept",
    text: "not an Agent trigger",
    sentAt: new Date().toISOString(),
  });
  const agent = new AgentModule(f.ctx, f.messages);
  f.onCleanup(() => agent.close());
  await agent.recover();
  await f.sequences.recover();
  await agent.tick();
  await f.sequences.tick();
  const deadline = Date.now() + 5000;
  while (
    (await f.db.query("SELECT status FROM agent_runs WHERE id='agent-r'"))
      .rows[0]!.status === "running"
  ) {
    assert.ok(
      Date.now() < deadline,
      "old Agent run must cancel after recovery",
    );
    await delay(10);
  }
  await agent.tick();
  assert.equal(
    (await f.db.query("SELECT status FROM agent_runs WHERE id='agent-r'"))
      .rows[0]!.status,
    "cancelled",
  );
  assert.equal(
    (await f.db.query("SELECT status FROM sequence_runs WHERE id='r'")).rows[0]!
      .status,
    "stopped",
  );
  assert.equal((await f.db.query("SELECT 1 FROM agent_runs")).rowCount, 1);
  assert.equal(
    (await f.db.query("SELECT 1 FROM messages WHERE is_own")).rowCount,
    0,
  );
  assert.equal(
    f.calls.length,
    callCount,
    "left guards and recovery must not invoke external operations",
  );
  assert.equal((await f.group()).activeAgentRunId, null);
  assert.equal((await f.group()).activeSequenceRunId, null);
  assert.deepEqual(
    (await f.group()).members,
    ["external-kept", "external-new"].map(external),
  );
});

test("LM06 D042: legacy cleared left groups recover only from fresh snapshots, never from old completion evidence or deduped replay", async (t) => {
  const f = await fixture(t);
  const oldJobId = await f.leaveAll();
  await f.finish(oldJobId);
  // Represents the pre-D042 successful leave projection, including its existing
  // processed event ledger and historical completion snapshot.
  await f.db.query("DELETE FROM members WHERE group_id='g'");
  const oldEvent = {
    eventId: 401,
    type: "member_joined" as const,
    groupId: "remote-g",
    platformUserId: "external-kept",
  };
  await f.db.query(
    "INSERT INTO gateway_events(event_id,type,data) VALUES(401,'member_joined',$1)",
    [JSON.stringify(oldEvent)],
  );
  f.remoteMembers.delete("external-kept");
  f.remoteMembers.add("external-current");
  const restarted = new GatewayEvents(f.ctx, f.messages);
  f.onCleanup(() => restarted.close());
  const readsBefore = f.calls.length;
  await restarted.process(oldEvent);
  assert.equal(f.calls.length, readsBefore);
  assert.deepEqual(
    (await f.group()).members,
    [],
    "already-processed history cannot reconstruct the old cleared projection",
  );
  await f.member(402, "member_joined", "external-current", restarted);
  assert.deepEqual(
    (await f.group()).members,
    ["external-current", "external-new"].map(external),
  );
  await f.db.query("DELETE FROM members WHERE group_id='g'");
  const leavesBefore = f.leaves.length;
  const newJobId = await f.leaveAll();
  await f.finish(newJobId);
  assert.notEqual(newJobId, oldJobId);
  assert.equal(
    f.leaves.length,
    leavesBefore,
    "refreshing an old left group must not repeat a leave request",
  );
  assert.deepEqual(
    (await f.group()).members,
    ["external-current", "external-new"].map(external),
  );
  assert.deepEqual(
    (await f.db.query("SELECT state FROM jobs WHERE id=$1", [oldJobId]))
      .rows[0]!.state.gatewayMembersAtCompletion,
    ["external-kept", "external-new"].map((platformUserId) => ({
      platformUserId,
    })),
    "old completion evidence stays historical and is never copied as current membership",
  );
});
