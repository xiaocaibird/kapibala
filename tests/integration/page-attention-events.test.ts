import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { WebSocket } from "ws";
import { createApp } from "../../apps/server/src/app.js";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { emit } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { RemoteError } from "../../apps/server/src/core/errors.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import {
  Messages,
  recordSent,
} from "../../apps/server/src/modules/gateway/messages.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { changeAccount } from "../../apps/server/src/modules/gateway/state.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import { SequenceModule } from "../../apps/server/src/modules/automation/sequences.js";
import { AgentModule } from "../../apps/server/src/modules/automation/agent.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

class Gateway extends RemoteClient {
  constructor() {
    super("http://unused.invalid");
  }
  override async request<T>(path: string): Promise<T> {
    if (path.endsWith("/members")) return [] as T;
    throw new RemoteError(404, "NOT_FOUND");
  }
}
async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  const accountId = (
    await db.query<{ id: string }>(
      "SELECT id FROM accounts ORDER BY id LIMIT 1",
    )
  ).rows[0]!.id;
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g',$1)",
    [accountId],
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g',$1,$1,'creator')",
    [accountId],
  );
  let ctx!: AppContext;
  const app = await createApp({
    db,
    logger: false,
    background: false,
    modules: (context) => {
      ctx = { ...context, gateway: new Gateway() };
      return [createGatewayModule(ctx)];
    },
  });
  const messages = new Messages(ctx);
  const sequences = new SequenceModule(ctx, messages);
  await sequences.register(app);
  temporary.onCleanup(() => app.close());
  temporary.onCleanup(() => sequences.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "admin" },
  });
  const token = login.json<{ accessToken: string }>().accessToken;
  const api = (
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload: payload as never }),
    });
  const events = async (type?: string) =>
    (
      await db.query<{
        seq: string;
        type: string;
        payload: Record<string, unknown>;
      }>(
        "SELECT * FROM events WHERE ($1::text IS NULL OR type=$1) ORDER BY seq",
        [type ?? null],
      )
    ).rows;
  return {
    ...temporary,
    app,
    ctx,
    messages,
    sequences,
    accountId,
    api,
    token,
    events,
  };
}
async function until(predicate: () => Promise<boolean>, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("Timed out waiting for committed state");
}

test("attention: marker is authenticated, committed, request-only and never skips replay", async (t) => {
  const f = await fixture(t);
  await f.db.transaction((tx) => emit(tx, "before-marker", {}));
  const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const socket = new WebSocket(address.replace("http:", "ws:") + "/ws");
  f.onCleanup(async () => {
    socket.terminate();
  });
  const received: Record<string, unknown>[] = [];
  socket.on("message", (raw) =>
    received.push(JSON.parse(raw.toString()) as Record<string, unknown>),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({ type: "auth", accessToken: f.token, sinceSeq: 0 }),
  );
  await until(async () => received.some((event) => event.type === "auth"));
  assert.equal(
    received.some((event) => event.type === "scope_ready"),
    false,
  );
  socket.send("legacy non-control frame");
  socket.send(JSON.stringify({ type: "scope_marker", requestId: "page-1" }));
  await until(async () =>
    received.some((event) => event.type === "scope_ready"),
  );
  const marker = received.find((event) => event.type === "scope_ready")!;
  assert.equal(marker.requestId, "page-1");
  assert.equal(marker.startSeq, Number((await f.events()).at(-1)!.seq));
  assert.equal(marker.seq, undefined);
  await f.db.transaction((tx) => emit(tx, "after-marker", {}));
  await until(
    async () =>
      received.some((event) => event.type === "before-marker") &&
      received.some((event) => event.type === "after-marker"),
  );
  assert.ok(
    Number(received.find((event) => event.type === "after-marker")!.seq) >
      Number(marker.startSeq),
  );
});

test("attention: optional send correlation retains legacy response, rejects reuse and distinguishes delivery", async (t) => {
  const f = await fixture(t);
  const payload = {
    accountId: f.accountId,
    text: "manual",
    clientMsgId: "local-correlation",
  };
  const result = await f.api("POST", "/api/groups/g/send", payload);
  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.json(), { clientMsgId: payload.clientMsgId });
  assert.equal(
    (await f.api("POST", "/api/groups/g/send", payload)).statusCode,
    409,
  );
  assert.equal(
    (
      await f.api("POST", "/api/groups/g/send", {
        ...payload,
        clientMsgId: "bad id",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await f.api("POST", "/api/groups/g/send", {
        accountId: f.accountId,
        text: "legacy",
      })
    ).statusCode,
    202,
  );
  await f.db.transaction((tx) =>
    recordSent(tx, payload.clientMsgId, "remote-id", new Date().toISOString()),
  );
  await f.db.transaction((tx) =>
    recordSent(tx, payload.clientMsgId, "remote-id", new Date().toISOString()),
  );
  const relevant = (await f.events("message")).filter(
    (event) => event.payload.clientMsgId === payload.clientMsgId,
  );
  assert.deepEqual(
    relevant.map((event) => event.payload.changeKind),
    ["created", "delivery"],
  );
  assert.equal(relevant[0]!.payload.id, relevant[1]!.payload.id);
  assert.equal(relevant[0]!.payload.source, "manual");
});

test("attention: duplicate inbound and ambiguous own echo never invent a second logical creation", async (t) => {
  const f = await fixture(t);
  const gatewayEvents = new GatewayEvents(f.ctx, f.messages);
  const incoming = {
    eventId: 1,
    type: "message" as const,
    groupId: "remote-g",
    msgId: "external",
    senderPlatformUserId: "external",
    text: "old timestamp",
    sentAt: "2000-01-01T00:00:00.000Z",
  };
  await gatewayEvents.process(incoming);
  await gatewayEvents.process(incoming);
  await gatewayEvents.process({ ...incoming, eventId: 2 });
  assert.equal((await f.events("message")).length, 1);
  const outbound = await f.messages.enqueueSend({
    groupId: "g",
    accountId: f.accountId,
    text: "echo",
    clientMsgId: "own",
    source: "agent",
  });
  await gatewayEvents.process({
    ...incoming,
    eventId: 3,
    msgId: "echo-id",
    senderPlatformUserId: f.accountId,
    text: "echo",
  });
  const pending = (await f.events("message")).at(-1)!;
  assert.equal(pending.payload.attentionIdentity, "pending");
  assert.equal(
    (await f.db.query("SELECT * FROM messages WHERE msg_id='echo-id'"))
      .rowCount,
    1,
    "original timeline persistence is retained",
  );
  await f.db.transaction((tx) =>
    recordSent(tx, "own", "echo-id", new Date().toISOString()),
  );
  assert.equal((await f.events("message")).at(-1)!.payload.id, outbound.id);
  assert.equal(
    (await f.events("message")).at(-1)!.payload.changeKind,
    "delivery",
  );
  assert.equal(
    (await f.db.query("SELECT * FROM messages WHERE msg_id='echo-id'"))
      .rowCount,
    1,
  );
});

test("attention: group and rate-limit no-ops are silent; terminal membership consequences are scoped", async (t) => {
  const f = await fixture(t);
  await f.api("PATCH", "/api/groups/g", { name: "Visible" });
  await f.api("PATCH", "/api/groups/g", { name: "Visible" });
  assert.deepEqual(
    (await f.events("group_changed")).map(
      (event) => event.payload.changedFields,
    ),
    [["name"]],
  );
  const first = new Date(Date.now() + 10000);
  await f.db.transaction((tx) =>
    changeAccount(tx, f.accountId, "rate_limited", undefined, first),
  );
  await f.db.transaction((tx) =>
    changeAccount(tx, f.accountId, "rate_limited", undefined, first),
  );
  await f.db.transaction((tx) =>
    changeAccount(
      tx,
      f.accountId,
      "rate_limited",
      undefined,
      new Date(first.getTime() + 1000),
    ),
  );
  assert.equal((await f.events("account_changed")).length, 1);
  await f.db.transaction((tx) => changeAccount(tx, f.accountId, "suspended"));
  const groupEvents = await f.events("group_changed");
  assert.deepEqual(groupEvents.at(-1)!.payload, {
    groupId: "g",
    changedFields: ["members"],
  });
});

test("attention: sequence definitions and displayed step mutations emit once while idle scans remain silent", async (t) => {
  const f = await fixture(t);
  const definition = await f.api("POST", "/api/sequences", {
    name: "Current sequence",
    steps: [
      {
        index: 1,
        accountRole: "admin",
        text: "sequence send",
        delaySeconds: 0,
      },
    ],
  });
  const sequenceId = definition.json<{ id: string }>().id;
  assert.equal(
    (await f.events("sequence_definition_changed"))[0]!.payload.sequenceId,
    sequenceId,
  );
  const response = await f.api("POST", "/api/groups/g/sequence-runs", {
    sequenceId,
  });
  const runId = response.json<{ runId: string }>().runId;
  await f.sequences.tick();
  const snapshot = (await f.api("GET", `/api/sequence-runs/${runId}`)).json<{
    steps: { clientMsgId: string }[];
  }>();
  const afterEnqueue = (await f.events("sequence_step_changed")).length;
  await f.sequences.tick();
  await f.sequences.tick();
  assert.equal((await f.events("sequence_step_changed")).length, afterEnqueue);
  await f.db.query(
    "UPDATE messages SET delivery_status='accepted' WHERE client_msg_id=$1",
    [snapshot.steps[0]!.clientMsgId],
  );
  await f.sequences.tick();
  assert.deepEqual(
    (await f.events("sequence_step_changed")).at(-1)!.payload.changedFields,
    ["status"],
  );
  await f.db.transaction((tx) =>
    recordSent(
      tx,
      snapshot.steps[0]!.clientMsgId,
      "sequence-msg",
      new Date().toISOString(),
    ),
  );
  await f.sequences.tick();
  assert.equal(
    (await f.events("sequence_run")).at(-1)!.payload.status,
    "finished",
  );
});

test("attention: job failure commits displayed outcome with its event", async (t) => {
  const f = await fixture(t);
  const jobs = new Jobs(f.ctx);
  const ids = (
    await f.db.query<{ id: string }>(
      "SELECT id FROM accounts ORDER BY id LIMIT 2",
    )
  ).rows.map((row) => row.id);
  const job = await jobs.createGroup(ids[0]!, [ids[1]!]);
  await jobs.advance(job.jobId);
  assert.equal((await jobs.get(job.jobId)).status, "failed");
  const events = await f.events("job_changed");
  assert.equal(events.at(-1)!.payload.jobId, job.jobId);
  assert.equal(events.at(-1)!.payload.status, "failed");
});

test("attention: Agent persisted ordinary steps, audit result and final result carry stable ordinals", async (t) => {
  const f = await fixture(t);
  const remote = Fastify();
  let turn = 0;
  remote.post("/agent/turn", () =>
    ++turn === 1
      ? {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "send_message",
              input: { text: "reply", idempotency_key: "test-reply" },
            },
          ],
        }
      : { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
  );
  remote.post("/agent/audit", () => ({
    verdict: "fail",
    reason: "test rejection",
  }));
  const url = await remote.listen({ host: "127.0.0.1", port: 0 });
  f.onCleanup(() => remote.close());
  const agent = new AgentModule(
    { ...f.ctx, agent: new RemoteClient(url) },
    f.messages,
  );
  f.onCleanup(() => agent.close());
  // Register detail API on a dedicated app because the authenticated fixture is ready.
  const api = Fastify();
  await agent.register(api);
  f.onCleanup(() => api.close());
  await f.db.query("UPDATE groups SET agent_enabled=true WHERE id='g'");
  await f.db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES('trigger','g','trigger','external',false,'hello')",
  );
  await until(async () => {
    await agent.tick();
    return Boolean(
      (await f.db.query("SELECT 1 FROM agent_runs WHERE status='finished'"))
        .rowCount,
    );
  });
  const run = (await f.db.query<{ id: string }>("SELECT id FROM agent_runs"))
    .rows[0]!;
  const detail = (await api.inject(`/api/agent-runs/${run.id}`)).json<{
    steps: { ordinal: number }[];
  }>();
  assert.deepEqual(
    detail.steps.map((step) => step.ordinal),
    [1, 2],
  );
  const changes = (await f.events("agent_step_changed")).map(
    (event) => event.payload,
  );
  assert.ok(
    changes.some(
      (event) =>
        event.ordinal === 1 &&
        (event.changedFields as string[]).includes("auditVerdict"),
    ),
  );
  assert.ok(
    changes.some(
      (event) =>
        event.ordinal === 1 &&
        (event.changedFields as string[]).includes("resultSummary"),
    ),
  );
  assert.ok(
    changes.some(
      (event) =>
        event.ordinal === 2 &&
        (event.changedFields as string[]).includes("created"),
    ),
  );
});
