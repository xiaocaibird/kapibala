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
