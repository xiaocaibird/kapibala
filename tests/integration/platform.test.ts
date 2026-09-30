import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../../apps/server/src/app.js";
import { Database } from "../../apps/server/src/core/db.js";
import { migrate } from "../../scripts/migrate.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { createGatewaySimulator } from "../../apps/simulator/src/gateway.js";
import { createAgentSimulator } from "../../apps/simulator/src/agent.js";
import type {
  Group,
  Job,
  Message,
  AgentRun,
  SequenceRun,
} from "../../packages/contracts/src/index.js";
async function until<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  ms = 10000,
): Promise<T> {
  const end = Date.now() + ms;
  let value: T;
  do {
    value = await read();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 60));
  } while (Date.now() < end);
  throw new Error(`Timed out: ${JSON.stringify(value)}`);
}
async function fixture() {
  const base =
    process.env.DATABASE_URL ??
    "postgres://kapibala:kapibala@localhost:55432/kapibala";
  const admin = new Database(base);
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const db = new Database(url.toString());
  await migrate(db);
  const dir = await mkdtemp(join(tmpdir(), "kapibala-"));
  const gateway = createGatewaySimulator(join(dir, "gateway.json"));
  const agent = createAgentSimulator(join(dir, "agent.json"));
  const gatewayUrl = await gateway.listen({ host: "127.0.0.1", port: 0 });
  const agentUrl = await agent.listen({ host: "127.0.0.1", port: 0 });
  process.env.GATEWAY_URL = gatewayUrl;
  process.env.AGENT_URL = agentUrl;
  const build = () =>
    createApp({
      db,
      logger: false,
      modules: (ctx) => {
        const messaging = createGatewayModule(ctx);
        return [messaging, createAutomationModule(ctx, messaging)];
      },
    });
  const app = await build();
  await app.ready();
  const apps = [app];
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "admin" },
  });
  const accessToken = login.json<{ accessToken: string }>().accessToken;
  async function api<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    target: FastifyInstance = app,
  ): Promise<{ status: number; body: T }> {
    const res = await target.inject({
      method,
      url: path,
      headers: { authorization: `Bearer ${accessToken}` },
      ...(body === undefined ? {} : { payload: body as never }),
    });
    return { status: res.statusCode, body: res.json<T>() };
  }
  async function control(
    target: "gateway" | "agent",
    path: string,
    body?: unknown,
  ) {
    const res = await (target === "gateway" ? gateway : agent).inject({
      method: body === undefined ? "GET" : "POST",
      url: `/__control${path}`,
      ...(body === undefined ? {} : { payload: body as never }),
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json<Record<string, unknown>>();
  }
  async function group(): Promise<Group> {
    for (let i = 1; i <= 4; i++) {
      const res = await api("POST", `/api/accounts/account-${i}/connect`, {});
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    const created = await api<{ jobId: string }>("POST", "/api/groups", {
      creatorAccountId: "account-1",
      memberAccountIds: ["account-2", "account-3", "account-4"],
    });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    await until(
      async () =>
        (await api<Job>("GET", `/api/jobs/${created.body.jobId}`)).body,
      (j) => j.status !== "running",
    );
    const groups = await api<Group[]>("GET", "/api/groups");
    assert.equal(groups.body.length, 1);
    return groups.body[0]!;
  }
  async function messages(groupId: string): Promise<Message[]> {
    return (
      await api<{ items: Message[] }>("GET", `/api/groups/${groupId}/messages`)
    ).body.items;
  }
  return {
    app,
    db,
    accessToken,
    databaseUrl: url.toString(),
    gatewayUrl,
    agentUrl,
    api,
    control,
    group,
    messages,
    build,
    apps,
    async close() {
      for (const a of apps) await a.close();
      await gateway.close();
      await agent.close();
      await db.close();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("platform: message dedup, own echo, delayed delivery and historical pagination", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    assert.deepEqual(g.members.map((m) => m.role).sort(), [
      "admin",
      "creator",
      "member",
      "member",
    ]);
    await f.control("gateway", "/config", {
      duplicateEvents: true,
      outOfOrder: true,
      sendDelayMs: 400,
    });
    const send = await f.api<{ clientMsgId: string }>(
      "POST",
      `/api/groups/${g.id}/send`,
      { accountId: "account-2", text: "own message" },
    );
    assert.equal(send.status, 202);
    const own = await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === send.body.clientMsgId &&
            x.deliveryStatus === "sent",
        ),
    );
    assert.equal(
      own.filter((x) => x.clientMsgId === send.body.clientMsgId).length,
      1,
    );
    assert.equal(own[0]!.isOwn, true);
    for (let i = 0; i < 5; i++)
      await f.control("gateway", "/message", {
        groupId: g.gatewayGroupId,
        text: `history-${i}`,
        sentAt: `2020-01-01T00:00:0${i}.000Z`,
      });
    await until(
      () => f.messages(g.id),
      (m) => m.length === 6,
    );
    const first = await f.api<{ items: Message[]; nextCursor: string }>(
      "GET",
      `/api/groups/${g.id}/messages?limit=2`,
    );
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "late-old",
      sentAt: "2010-01-01T00:00:00.000Z",
    });
    const ids = first.body.items.map((m) => m.id);
    let cursor = first.body.nextCursor;
    while (cursor) {
      const page = await f.api<{ items: Message[]; nextCursor: string }>(
        "GET",
        `/api/groups/${g.id}/messages?limit=2&before=${encodeURIComponent(cursor)}`,
      );
      ids.push(...page.body.items.map((m) => m.id));
      cursor = page.body.nextCursor;
    }
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, 6);
    await until(
      () => f.messages(g.id),
      (m) => m.length === 7,
    );
  } finally {
    await f.close();
  }
});
test("platform: explicit 504 confirmation retries at most once and account-wide rate limit queues", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.control("gateway", "/config", { sendFaults: ["NETWORK_TIMEOUT"] });
    const one = await f.api<{ clientMsgId: string }>(
      "POST",
      `/api/groups/${g.id}/send`,
      { accountId: "account-2", text: "timeout landed" },
    );
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === one.body.clientMsgId &&
            x.deliveryStatus === "sent",
        ),
      6000,
    );
    await f.control("gateway", "/config", {
      sendFaults: ["NETWORK_TIMEOUT_NO_EFFECT"],
    });
    const two = await f.api<{ clientMsgId: string }>(
      "POST",
      `/api/groups/${g.id}/send`,
      { accountId: "account-2", text: "retry once" },
    );
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === two.body.clientMsgId &&
            x.deliveryStatus === "sent",
        ),
      6500,
    );
    await f.control("gateway", "/config", { sendFaults: ["RATE_LIMITED"] });
    await f.api("POST", `/api/groups/${g.id}/send`, {
      accountId: "account-2",
      text: "limited one",
    });
    await f.api("POST", `/api/groups/${g.id}/send`, {
      accountId: "account-2",
      text: "limited two",
    });
    await until(
      () => f.messages(g.id),
      (m) => m.filter((x) => x.deliveryStatus === "sent").length === 4,
      7000,
    );
    const remote = await f.control("gateway", "");
    const sent = remote.messages as { clientMsgId: string }[];
    assert.equal(
      sent.filter((m) => m.clientMsgId === one.body.clientMsgId).length,
      1,
    );
    assert.equal(
      sent.filter((m) => m.clientMsgId === two.body.clientMsgId).length,
      1,
    );
    const requests = remote.requests as {
      at: string;
      path: string;
      body: { text?: string };
    }[];
    const limited = requests.filter(
      (r) => r.path.endsWith("/send") && r.body.text?.startsWith("limited"),
    );
    assert.equal(limited.length, 3);
    assert.ok(Date.parse(limited[1]!.at) - Date.parse(limited[0]!.at) >= 1950);
  } finally {
    await f.close();
  }
});
test("platform: Agent exactly-once key, bad responses, audit blocking and no self-trigger", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.api("PATCH", `/api/groups/${g.id}`, { agentEnabled: true });
    const tool = (id: string, name: string, input: unknown) => ({
      body: {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id, name, input }],
      },
    });
    await f.control("agent", "/config", {
      turnScript: [
        { raw: "not JSON" },
        tool("bad", "missing_tool", {}),
        tool("send1", "send_message", {
          text: "agent reply",
          idempotency_key: "same",
        }),
        tool("send2", "send_message", {
          text: "agent reply",
          idempotency_key: "same",
        }),
        tool("final", "finish", { summary: "done" }),
      ],
    });
    await f.control("gateway", "/config", {
      duplicateEvents: true,
      sendFaults: ["NETWORK_TIMEOUT"],
    });
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "hello agent",
    });
    const run = await until(
      async () =>
        (await f.api<AgentRun[]>("GET", `/api/groups/${g.id}/agent-runs`)).body,
      (r) => r.length === 1 && r[0]!.status !== "running",
      15000,
    );
    assert.equal(run[0]!.status, "finished");
    const details = (
      await f.api<AgentRun>("GET", `/api/agent-runs/${run[0]!.id}`)
    ).body;
    assert.equal(details.steps?.[0]?.kind, "protocol_error");
    assert.ok(details.steps?.some((s) => s.errorCode === "UNKNOWN_TOOL"));
    const repeatedSend = (
      await f.db.query<{ result: { deliveryStatus: string } }>(
        "SELECT result FROM agent_steps WHERE run_id=$1 AND tool_use_id='send2'",
        [run[0]!.id],
      )
    ).rows[0]!;
    assert.equal(repeatedSend.result.deliveryStatus, "sent");
    assert.equal((await f.control("agent", "")).audits instanceof Array, true);
    assert.equal(
      ((await f.control("agent", "")).audits as unknown[]).length,
      1,
    );
    assert.equal(
      ((await f.control("gateway", "")).messages as unknown[]).length,
      1,
    );
    await f.control("agent", "/config", {
      turnScript: [
        tool("send", "send_message", {
          text: "must not send",
          idempotency_key: "blocked",
        }),
      ],
      auditScript: [
        { status: 500, body: {} },
        { raw: "bad" },
        { body: { verdict: "maybe" } },
      ],
    });
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "blocked trigger",
    });
    await until(
      async () =>
        (await f.api<AgentRun[]>("GET", `/api/groups/${g.id}/agent-runs`)).body,
      (r) => r.some((x) => x.status === "blocked"),
      15000,
    );
    assert.equal(
      ((await f.control("gateway", "")).messages as unknown[]).length,
      1,
    );
  } finally {
    await f.close();
  }
});
test("platform: sequence preflight, variable inheritance and concurrent single running", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    const seq = await f.api<{ id: string }>("POST", "/api/sequences", {
      name: "staged",
      steps: [
        { index: 1, accountRole: "admin", text: "{event}", delaySeconds: 0.2 },
        {
          index: 2,
          accountRole: "member",
          text: "{event} {place}",
          delaySeconds: 0.1,
        },
      ],
    });
    assert.equal(seq.status, 200);
    const failed = await f.api<{
      error: { code: string; stepIndex: number; key: string };
    }>("POST", `/api/groups/${g.id}/sequence-runs`, {
      sequenceId: seq.body.id,
      vars: { event: "one" },
      stepVars: {},
    });
    assert.equal(failed.status, 422);
    assert.equal(failed.body.error.code, "UNRESOLVED_PLACEHOLDER");
    assert.equal(failed.body.error.stepIndex, 2);
    assert.equal(failed.body.error.key, "place");
    const body = {
      sequenceId: seq.body.id,
      vars: { event: "one" },
      stepVars: { "2": { event: "two", place: "room" } },
    };
    const results = await Promise.all([
      f.api<{ runId: string }>(
        "POST",
        `/api/groups/${g.id}/sequence-runs`,
        body,
      ),
      f.api<{ runId: string }>(
        "POST",
        `/api/groups/${g.id}/sequence-runs`,
        body,
      ),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const id = results.find((r) => r.status === 201)!.body.runId;
    const run = await until(
      async () =>
        (await f.api<SequenceRun>("GET", `/api/sequence-runs/${id}`)).body,
      (r) => r.status !== "running",
    );
    assert.equal(run.status, "finished");
    assert.equal(run.steps[1]!.resolvedVars.event, "two");
    assert.equal(run.steps[1]!.varSources.place, "step:2");
    assert.ok(
      Date.parse(run.steps[1]!.scheduledAt!) -
        Date.parse(run.steps[0]!.sentAt!) >=
        90,
    );
  } finally {
    await f.close();
  }
});
test("platform: account CAS, terminal atomic effects and owner-last failed leave", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.control("gateway", "/config", { leaveFailures: ["account-3"] });
    const leave = await f.api<{ jobId: string }>(
      "POST",
      `/api/groups/${g.id}/leave-all`,
      {},
    );
    const job = await until(
      async () =>
        (await f.api<Job>("GET", `/api/jobs/${leave.body.jobId}`)).body,
      (j) => j.status !== "running",
    );
    assert.equal(job.status, "failed");
    assert.ok(job.errors.some((e) => e.step === "leave:account-3"));
    const members = (await f.api<Group>("GET", `/api/groups/${g.id}`)).body
      .members;
    assert.ok(members.some((m) => m.role === "creator"));
    assert.ok(members.some((m) => m.accountId === "account-3"));
    const cas = await Promise.all([
      f.api("POST", "/api/accounts/account-1/transition", {
        to: "disconnected",
        expectedFrom: "online",
      }),
      f.api("POST", "/api/accounts/account-1/transition", {
        to: "idle",
        expectedFrom: "online",
      }),
    ]);
    assert.deepEqual(cas.map((r) => r.status).sort(), [200, 409]);
    await f.api("POST", "/api/accounts/account-3/transition", {
      to: "suspended",
      expectedFrom: "online",
    });
    const after = (await f.api<Group>("GET", `/api/groups/${g.id}`)).body
      .members;
    assert.ok(!after.some((m) => m.accountId === "account-3"));
  } finally {
    await f.close();
  }
});

test("platform: database write failure retains events, reports inconsistency and replays after outage", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.db.query(
      `CREATE FUNCTION reject_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.text='retry-db-write' THEN RAISE EXCEPTION 'injected database write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_probe BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION reject_probe()`,
    );
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "retry-db-write",
    });
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "unaffected",
    });
    await until(
      () => f.messages(g.id),
      (m) => m.some((x) => x.text === "unaffected"),
    );
    assert.equal(
      (await f.messages(g.id)).some((x) => x.text === "retry-db-write"),
      false,
    );
    await until(
      async () =>
        (await f.db.query("SELECT 1 FROM events WHERE type='inconsistency'"))
          .rowCount,
      (n) => Boolean(n),
    );
    await f.db.query(
      "DROP TRIGGER reject_probe ON messages; DROP FUNCTION reject_probe()",
    );
    await until(
      () => f.messages(g.id),
      (m) => m.some((x) => x.text === "retry-db-write"),
    );
    await f.control("gateway", "/config", { unavailable: true });
    await f.control("gateway", "/disconnect-events", {});
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "during-disconnect",
    });
    await new Promise((r) => setTimeout(r, 600));
    await f.control("gateway", "/config", { unavailable: false });
    await until(
      () => f.messages(g.id),
      (m) => m.some((x) => x.text === "during-disconnect"),
      3000,
    );
    assert.equal(
      (await f.messages(g.id)).filter((x) => x.text === "retry-db-write")
        .length,
      1,
    );
  } finally {
    await f.close();
  }
});

test("platform: two instances enforce one Agent and share durable event replay", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    const second = await f.build();
    f.apps.push(second);
    await second.ready();
    await f.api("PATCH", `/api/groups/${g.id}`, { agentEnabled: true });
    await f.control("agent", "/config", { turnDelayMs: 300 });
    await f.control("gateway", "/config", { duplicateEvents: true });
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "first",
    });
    await until(
      async () =>
        (await f.api<AgentRun[]>("GET", `/api/groups/${g.id}/agent-runs`)).body,
      (r) => r.some((x) => x.status === "running"),
    );
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "second",
    });
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "third",
    });
    const runs = await until(
      async () =>
        (await f.api<AgentRun[]>("GET", `/api/groups/${g.id}/agent-runs`)).body,
      (r) => r.length === 2 && r.every((x) => x.status === "finished"),
      15000,
    );
    assert.equal(new Set(runs.map((r) => r.id)).size, 2);
    const state = await f.control("agent", "");
    const calls = state.calls as {
      runId: string;
      body: { messages: { content: { text?: string }[] }[] };
    }[];
    for (const run of runs)
      assert.equal(calls.filter((c) => c.runId === run.id).length, 3);
    assert.equal(
      ((await f.control("gateway", "")).messages as unknown[]).length,
      2,
    );
    const contexts = calls
      .filter((c) => c.body.messages.length === 1)
      .map(
        (c) =>
          JSON.parse(c.body.messages[0]!.content[0]!.text!) as {
            triggerMessages: unknown[];
          },
      );
    assert.deepEqual(
      contexts.map((c) => c.triggerMessages.length).sort(),
      [1, 2],
    );
  } finally {
    await f.close();
  }
});

test("platform: frozen pagination survives queued sentAt changes", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.control("gateway", "/config", { sendDelayMs: 1300 });
    for (let i = 0; i < 4; i++)
      await f.control("gateway", "/message", {
        groupId: g.gatewayGroupId,
        text: `fixed-${i}`,
      });
    await until(
      () => f.messages(g.id),
      (m) => m.length === 4,
    );
    await f.api("POST", `/api/groups/${g.id}/send`, {
      accountId: "account-2",
      text: "moving-time",
    });
    const first = await f.api<{ items: Message[]; nextCursor: string | null }>(
      "GET",
      `/api/groups/${g.id}/messages?limit=2`,
    );
    assert.ok(
      first.body.items.some(
        (m) => m.text === "moving-time" && m.deliveryStatus !== "sent",
      ),
    );
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some((x) => x.text === "moving-time" && x.deliveryStatus === "sent"),
    );
    const rows = [...first.body.items];
    let cursor = first.body.nextCursor;
    while (cursor) {
      const page = await f.api<{ items: Message[]; nextCursor: string | null }>(
        "GET",
        `/api/groups/${g.id}/messages?before=${encodeURIComponent(cursor)}&limit=2`,
      );
      rows.push(...page.body.items);
      cursor = page.body.nextCursor;
    }
    assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map((m) => m.id)).size, 5);
    assert.equal(rows.filter((m) => m.text === "moving-time").length, 1);
  } finally {
    await f.close();
  }
});

test("platform: authenticated WebSocket replays missed events and logout closes the stream", async () => {
  const { WebSocket } = await import("ws");
  const f = await fixture();
  try {
    const g = await f.group();
    const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
    const initial = Number(
      (
        await f.db.query<{ seq: string }>(
          "SELECT COALESCE(max(seq),0) seq FROM events",
        )
      ).rows[0]!.seq,
    );
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "missed by console",
    });
    await until(
      () => f.messages(g.id),
      (m) => m.some((x) => x.text === "missed by console"),
    );
    const socket = new WebSocket(address.replace("http:", "ws:") + "/ws");
    const received: { seq?: number; type: string; success?: boolean }[] = [];
    socket.on("message", (raw) =>
      received.push(
        JSON.parse(raw.toString()) as {
          seq?: number;
          type: string;
          success?: boolean;
        },
      ),
    );
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    const began = Date.now();
    socket.send(
      JSON.stringify({
        type: "auth",
        accessToken: f.accessToken,
        sinceSeq: initial,
      }),
    );
    await until(
      async () => received,
      (r) => r.some((e) => e.type === "message"),
      3000,
    );
    assert.ok(Date.now() - began < 3000);
    assert.equal(received[0]!.success, true);
    const seqs = received.filter((e) => e.seq !== undefined).map((e) => e.seq!);
    assert.equal(new Set(seqs).size, seqs.length);
    assert.ok(seqs.every((s) => s > initial));
    const closed = new Promise<number>((resolve) =>
      socket.once("close", (code) => resolve(code)),
    );
    await f.api("POST", "/api/auth/logout", {});
    assert.equal(await closed, 4401);
  } finally {
    await f.close();
  }
});

test("platform: SIGKILL during remote send recovers by evidence without resending", async () => {
  const { spawn } = await import("node:child_process");
  const f = await fixture();
  const children: import("node:child_process").ChildProcess[] = [];
  async function boot(): Promise<{
    child: import("node:child_process").ChildProcess;
    address: string;
  }> {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/src/main.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: f.databaseUrl,
          GATEWAY_URL: f.gatewayUrl,
          AGENT_URL: f.agentUrl,
          PORT: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.push(child);
    let output = "";
    child.stdout!.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr!.on("data", (chunk) => {
      output += String(chunk);
    });
    const address = await until(
      async () => output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "",
      (s) => Boolean(s),
      10000,
    );
    return { child, address };
  }
  try {
    const g = await f.group();
    await f.app.close();
    await f.control("gateway", "/config", {
      sendDelayMs: 1500,
      sendResponseDelayMs: 3000,
    });
    const first = await boot();
    const response = await fetch(`${first.address}/api/groups/${g.id}/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${f.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "account-2",
        text: "survive process kill",
      }),
    });
    assert.equal(response.status, 202);
    const { clientMsgId } = (await response.json()) as { clientMsgId: string };
    await until(
      async () =>
        (await f.control("gateway", "")).requests as {
          path: string;
          body: { clientMsgId?: string };
        }[],
      (r) =>
        r.some(
          (x) => x.path.endsWith("/send") && x.body.clientMsgId === clientMsgId,
        ),
    );
    const stopped = new Promise<void>((resolve) =>
      first.child.once("exit", () => resolve()),
    );
    first.child.kill("SIGKILL");
    await stopped;
    await boot();
    await until(
      async () =>
        (
          await f.db.query<{ delivery_status: string }>(
            "SELECT delivery_status FROM messages WHERE client_msg_id=$1",
            [clientMsgId],
          )
        ).rows[0]!.delivery_status,
      (s) => s === "sent",
      6000,
    );
    const remote = await f.control("gateway", "");
    assert.equal(
      (remote.messages as { clientMsgId: string }[]).filter(
        (m) => m.clientMsgId === clientMsgId,
      ).length,
      1,
    );
    assert.equal(
      (
        remote.requests as { path: string; body: { clientMsgId?: string } }[]
      ).filter(
        (r) => r.path.endsWith("/send") && r.body.clientMsgId === clientMsgId,
      ).length,
      1,
    );
  } finally {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = new Promise<void>((resolve) =>
          child.once("exit", () => resolve()),
        );
        child.kill("SIGTERM");
        await stopped;
      }
    await f.close();
  }
});

test("platform: S1 distinguishes accepted from sent and unknown survives query outage", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.control("gateway", "/config", { sendDelayMs: 1200 });
    const first = await f.api<{ clientMsgId: string }>(
      "POST",
      `/api/groups/${g.id}/send`,
      { accountId: "account-2", text: "accepted window" },
    );
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === first.body.clientMsgId &&
            x.deliveryStatus === "accepted",
        ),
      1000,
    );
    assert.equal(
      ((await f.control("gateway", "")).messages as unknown[]).length,
      0,
    );
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === first.body.clientMsgId &&
            x.deliveryStatus === "sent",
        ),
    );
    await f.control("gateway", "/config", {
      sendDelayMs: 100,
      sendFaults: ["NETWORK_TIMEOUT_NO_EFFECT"],
      queryUnavailable: true,
    });
    const second = await f.api<{ clientMsgId: string }>(
      "POST",
      `/api/groups/${g.id}/send`,
      { accountId: "account-2", text: "wait for evidence" },
    );
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === second.body.clientMsgId &&
            x.deliveryStatus === "unknown",
        ),
    );
    await new Promise((r) => setTimeout(r, 2400));
    assert.equal(
      (await f.messages(g.id)).find(
        (x) => x.clientMsgId === second.body.clientMsgId,
      )!.deliveryStatus,
      "unknown",
    );
    await f.control("gateway", "/config", { queryUnavailable: false });
    const start = Date.now();
    await until(
      () => f.messages(g.id),
      (m) =>
        m.some(
          (x) =>
            x.clientMsgId === second.body.clientMsgId &&
            x.deliveryStatus === "sent",
        ),
      2000,
    );
    assert.ok(Date.now() - start < 2000);
  } finally {
    await f.close();
  }
});

test("platform: schema lag refuses startup and viewer is denied all business write routes", async () => {
  const f = await fixture();
  try {
    const login = await f.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "viewer", password: "viewer" },
    });
    const token = login.json<{ accessToken: string }>().accessToken;
    const writes: [string, "POST" | "PATCH"][] = [
      ["/api/accounts/account-1/connect", "POST"],
      ["/api/accounts/account-1/transition", "POST"],
      ["/api/groups", "POST"],
      ["/api/groups/missing", "PATCH"],
      ["/api/groups/missing/send", "POST"],
      ["/api/groups/missing/leave-all", "POST"],
      ["/api/sequences", "POST"],
      ["/api/groups/missing/sequence-runs", "POST"],
    ];
    for (const [url, method] of writes) {
      const response = await f.app.inject({
        url,
        method,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      assert.equal(response.statusCode, 403, url);
      assert.equal(
        response.json<{ error: { code: string } }>().error.code,
        "FORBIDDEN",
      );
    }
    const latest = (
      await f.db.query<{ version: number; name: string; checksum: string }>(
        "SELECT version,name,checksum FROM schema_migrations ORDER BY version DESC LIMIT 1",
      )
    ).rows[0]!;
    await f.db.query("DELETE FROM schema_migrations WHERE version=$1", [
      latest.version,
    ]);
    await assert.rejects(
      createApp({ db: f.db, logger: false, background: false }),
      /Schema mismatch/,
    );
    await f.db.query(
      "INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)",
      [latest.version, latest.name, latest.checksum],
    );
  } finally {
    await f.close();
  }
});

test("platform: audited kick confirms 504 and propagates permission errors without account mutation", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    const initialAccounts = (await f.api("GET", "/api/accounts")).body;
    await f.api("PATCH", `/api/groups/${g.id}`, {
      agentEnabled: true,
      autoKickEnabled: true,
    });
    const script = [
      {
        body: {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "kick",
              name: "kick_user",
              input: {
                platform_user_id: "moderated-user",
                reason: "group policy",
              },
            },
          ],
        },
      },
      {
        body: {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "done" }],
        },
      },
    ];
    await f.control("agent", "/config", { turnScript: script });
    for (const [index, fault] of [
      "NETWORK_TIMEOUT",
      "OWNER_LEFT",
      "NO_PERMISSION",
    ].entries()) {
      await f.control("gateway", "/member", {
        groupId: g.gatewayGroupId,
        platformUserId: "moderated-user",
        joined: true,
      });
      await f.control("gateway", "/config", { kickFaults: [fault] });
      await f.control("gateway", "/message", {
        groupId: g.gatewayGroupId,
        text: `kick-${fault}`,
      });
      const runs = await until(
        async () =>
          (await f.api<AgentRun[]>("GET", `/api/groups/${g.id}/agent-runs`))
            .body,
        (r) => r.length === index + 1 && r.every((x) => x.status !== "running"),
        10000,
      );
      const newest = (
        await f.api<AgentRun>("GET", `/api/agent-runs/${runs[0]!.id}`)
      ).body;
      assert.equal(newest.status, "finished");
      if (fault === "NETWORK_TIMEOUT")
        assert.equal(newest.steps![0]!.isError, false);
      else assert.equal(newest.steps![0]!.errorCode, fault);
      assert.equal(
        (await f.api<Group>("GET", `/api/groups/${g.id}`)).body.status,
        "active",
      );
      assert.deepEqual(
        (await f.api("GET", "/api/accounts")).body,
        initialAccounts,
        `kick ${fault} must not change any account state`,
      );
    }
    const remote = await f.control("gateway", "");
    assert.equal(
      (remote.requests as { path: string }[]).filter((r) =>
        r.path.endsWith("/kick"),
      ).length,
      3,
    );
    const audits = (await f.control("agent", "")).audits as { text: string }[];
    assert.equal(audits.length, 3);
    assert.deepEqual(JSON.parse(audits[0]!.text), {
      action: "kick",
      platform_user_id: "moderated-user",
      reason: "group policy",
    });
  } finally {
    await f.close();
  }
});

test("platform: Agent SEND_TIMEOUT repeats the same key without re-auditing or duplicating delivery", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.api("PATCH", `/api/groups/${g.id}`, { agentEnabled: true });
    const send = (id: string) => ({
      body: {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id,
            name: "send_message",
            input: { text: "same timeout key", idempotency_key: "stable" },
          },
        ],
      },
    });
    await f.control("agent", "/config", {
      turnScript: [
        send("first"),
        send("again"),
        {
          body: {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "done" }],
          },
        },
      ],
    });
    await f.control("gateway", "/config", {
      sendFaults: ["NETWORK_TIMEOUT_NO_EFFECT"],
      queryUnavailable: true,
    });
    await f.control("gateway", "/message", {
      groupId: g.gatewayGroupId,
      text: "trigger timeout",
    });
    await until(
      async () =>
        (
          await f.db.query(
            "SELECT 1 FROM agent_steps WHERE error_code='SEND_TIMEOUT'",
          )
        ).rowCount,
      (n) => Boolean(n),
      8000,
    );
    await f.control("gateway", "/config", { queryUnavailable: false });
    const runs = await until(
      async () =>
        (await f.api<AgentRun[]>("GET", `/api/groups/${g.id}/agent-runs`)).body,
      (r) => r.length === 1 && r[0]!.status === "finished",
      7000,
    );
    const run = (await f.api<AgentRun>("GET", `/api/agent-runs/${runs[0]!.id}`))
      .body;
    assert.equal(run.steps![0]!.errorCode, "SEND_TIMEOUT");
    assert.equal(run.steps![1]!.isError, false);
    await until(
      () => f.messages(g.id),
      (m) => m.some((x) => x.isOwn && x.deliveryStatus === "sent"),
    );
    assert.equal(
      ((await f.control("agent", "")).audits as unknown[]).length,
      1,
    );
    assert.equal(
      ((await f.control("gateway", "")).messages as unknown[]).length,
      1,
    );
  } finally {
    await f.close();
  }
});

test("platform: Agent kick deadline cancels real HTTP confirmation without replaying an uncertain effect", async () => {
  const f = await fixture();
  try {
    const g = await f.group();
    await f.control("gateway", "/member", {
      groupId: g.gatewayGroupId,
      platformUserId: "deadline-target",
      joined: true,
    });
    const id = randomUUID();
    const started = Date.now();
    await f.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE groups SET agent_enabled=true,auto_kick_enabled=true WHERE id=$1",
        [g.id],
      );
      await tx.query(
        "INSERT INTO agent_runs(id,group_id,active_ms,step_count) VALUES($1,$2,59500,1)",
        [id, g.id],
      );
      await tx.query(
        "INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','deadline-kick','kick_user',$2,'ready','pass')",
        [
          id,
          JSON.stringify({
            platform_user_id: "deadline-target",
            reason: "deadline test",
          }),
        ],
      );
    });
    const run = await until(
      async () => (await f.api<AgentRun>("GET", `/api/agent-runs/${id}`)).body,
      (run) => run.status === "failed",
      2000,
    );
    assert.equal(run.endReason, "wall_clock");
    assert.ok(
      Date.now() - started < 950,
      "run must stop before the simulator's one-second kick response",
    );
    assert.match(run.recoveryNote ?? "", /unknown/);
    const step = (
      await f.db.query<{
        state: string;
        is_error: boolean;
        error_code: string | null;
      }>("SELECT * FROM agent_steps WHERE run_id=$1", [id])
    ).rows[0]!;
    assert.equal(step.state, "executing");
    assert.equal(step.is_error, false);
    assert.equal(step.error_code, null);
    // A disconnected HTTP caller cannot undo the already dispatched side effect.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const second = await f.build();
    f.apps.push(second);
    await second.ready();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const remote = await f.control("gateway", "");
    assert.equal(
      (remote.requests as { path: string }[]).filter((r) =>
        r.path.endsWith("/kick"),
      ).length,
      1,
    );
    assert.equal(
      (await f.api<AgentRun>("GET", `/api/agent-runs/${id}`)).body.status,
      "failed",
    );
  } finally {
    await f.close();
  }
});
