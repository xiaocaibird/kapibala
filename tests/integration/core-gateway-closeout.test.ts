import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { createApp } from "../../apps/server/src/app.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { changeAccount } from "../../apps/server/src/modules/gateway/state.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { createGatewaySimulator } from "../../apps/simulator/src/gateway.js";
import { createAgentSimulator } from "../../apps/simulator/src/agent.js";
import type {
  Account,
  Group,
  Job as ContractJob,
} from "../../packages/contracts/src/index.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  ms = 10000,
): Promise<T> {
  const deadline = Date.now() + ms;
  let value: T;
  do {
    value = await read();
    if (ok(value)) return value;
    await delay(30);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${JSON.stringify(value)}`);
}
interface RemoteState {
  accounts: Record<string, { online: boolean; platformUserId: string }>;
  groups: Record<string, { members: string[]; writable: boolean }>;
  requests: { path: string; body: { clientMsgId?: string } }[];
  events: { eventId: number; type: string; msgId?: string }[];
}
interface Fault {
  suffix: string;
  code: string;
  status: number;
}
interface Job extends ContractJob {
  processing: boolean;
  groupId: string | null;
}
async function fixture(
  t: TestContext,
  configureAgent?: (agent: FastifyInstance) => void,
  configureGateway?: (gateway: FastifyInstance) => void,
) {
  const temp = await temporaryDatabase(t);
  t.diagnostic(`isolated database: ${new URL(temp.url).pathname.slice(1)}`);
  await migrate(temp.db);
  const dir = await mkdtemp(join(tmpdir(), "core-gateway-"));
  temp.onCleanup(() => rm(dir, { recursive: true, force: true }));
  const gateway = createGatewaySimulator(join(dir, "gateway.json"));
  const agent = createAgentSimulator(join(dir, "agent.json"));
  const faults: Fault[] = [];
  gateway.addHook("preHandler", async (request, reply) => {
    const fault = faults[0];
    if (fault && request.url.endsWith(fault.suffix)) {
      faults.shift();
      return reply.code(fault.status).send({ code: fault.code });
    }
  });
  configureAgent?.(agent);
  configureGateway?.(gateway);
  temp.onCleanup(() => gateway.close());
  temp.onCleanup(() => agent.close());
  const gatewayUrl = await gateway.listen({ host: "127.0.0.1", port: 0 });
  const agentUrl = await agent.listen({ host: "127.0.0.1", port: 0 });
  const app = await createApp({
    db: temp.db,
    logger: false,
    modules: (ctx) => {
      ctx.gateway = new RemoteClient(gatewayUrl);
      ctx.agent = new RemoteClient(agentUrl);
      const gatewayModule = createGatewayModule(ctx);
      return [gatewayModule, createAutomationModule(ctx, gatewayModule)];
    },
  });
  temp.onCleanup(() => app.close());
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const login = await fetch(`${address}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  assert.equal(login.status, 200);
  const { accessToken } = (await login.json()) as { accessToken: string };
  async function api<T>(
    method: string,
    path: string,
    body?: unknown,
    base = address,
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as T };
  }
  async function control<T = RemoteState>(
    path = "",
    body?: unknown,
    target = gatewayUrl,
  ): Promise<T> {
    const response = await fetch(`${target}/__control${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 200);
    return (await response.json()) as T;
  }
  async function connect() {
    for (const id of ["account-1", "account-2", "account-3"])
      assert.equal(
        (await api("POST", `/api/accounts/${id}/connect`, {})).status,
        200,
      );
  }
  async function create(): Promise<{ group: Group; job: Job }> {
    const response = await api<{ jobId: string }>("POST", "/api/groups", {
      creatorAccountId: "account-1",
      memberAccountIds: ["account-2", "account-3"],
    });
    assert.equal(response.status, 202);
    const job = await until(
      async () =>
        (await api<Job>("GET", `/api/jobs/${response.body.jobId}`)).body,
      (value) => !value.processing,
    );
    assert.equal(job.status, "finished", JSON.stringify(job));
    const group = (await api<Group>("GET", `/api/groups/${job.groupId}`)).body;
    return { group, job };
  }
  return {
    ...temp,
    app,
    address,
    accessToken,
    gatewayUrl,
    agentUrl,
    api,
    control,
    connect,
    create,
    faults,
  };
}

test("CG09: HTTP seed, reconnect identity, transition preconditions and actual gateway disconnect", async (t) => {
  const f = await fixture(t);
  const initial = (await f.api<Account[]>("GET", "/api/accounts")).body;
  assert.equal(initial.length, 6);
  assert.ok(
    initial.every(
      (account) => account.status === "idle" && account.platformUserId === null,
    ),
  );
  assert.equal(
    (
      await f.api("POST", "/api/accounts/account-1/transition", {
        to: "online",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.api("POST", "/api/accounts/absent/transition", {
        to: "online",
        expectedFrom: "idle",
      })
    ).status,
    404,
  );
  assert.equal(
    (await f.api("POST", "/api/accounts/absent/connect", {})).status,
    404,
  );
  assert.equal((await f.control()).requests.length, 0);
  const first = (
    await f.api<Account>("POST", "/api/accounts/account-1/connect", {})
  ).body;
  assert.equal(first.status, "online");
  assert.ok(first.platformUserId);
  for (const to of ["disconnected", "idle"] as const) {
    assert.equal(
      (
        await f.api("POST", "/api/accounts/account-1/transition", {
          to,
          expectedFrom: "online",
        })
      ).status,
      200,
    );
    const remote = await f.control();
    assert.equal(remote.accounts["account-1"]!.online, false);
    assert.equal(
      (await f.api<Account[]>("GET", "/api/accounts")).body[0]!.status,
      to,
    );
    const reconnected = await f.api<Account>(
      "POST",
      "/api/accounts/account-1/connect",
      {},
    );
    assert.equal(reconnected.status, 200);
    assert.equal(reconnected.body.platformUserId, first.platformUserId);
  }
  const calls = (await f.control()).requests.map((request) => request.path);
  assert.equal(calls.filter((path) => path.endsWith("/disconnect")).length, 2);
  assert.equal(calls.filter((path) => path.endsWith("/connect")).length, 3);
  const rows = (
    await f.db.query(
      "SELECT payload FROM events WHERE type='account_status_changed' ORDER BY seq",
    )
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.payload.to),
    ["online", "disconnected", "online", "idle", "online"],
  );
});

test("CG09: refreshing a rate-limit deadline emits no self transition; offline expiry stays offline", async (t) => {
  const f = await fixture(t);
  await f.api("POST", "/api/accounts/account-1/connect", {});
  const firstDeadline = new Date(Date.now() + 600);
  const secondDeadline = new Date(firstDeadline.getTime() + 300);
  await f.db.transaction((tx) =>
    changeAccount(tx, "account-1", "rate_limited", undefined, firstDeadline),
  );
  await f.db.transaction((tx) =>
    changeAccount(tx, "account-1", "rate_limited", undefined, secondDeadline),
  );
  assert.equal(
    (
      await f.api("POST", "/api/accounts/account-1/transition", {
        to: "rate_limited",
        expectedFrom: "rate_limited",
      })
    ).status,
    409,
  );
  const transitions = (
    await f.db.query(
      "SELECT payload FROM events WHERE type='account_status_changed'",
    )
  ).rows;
  assert.equal(
    transitions.filter((row) => row.payload.to === "rate_limited").length,
    1,
  );
  const changed = (
    await f.db.query("SELECT payload FROM events WHERE type='account_changed'")
  ).rows;
  assert.equal(changed.length, 1);
  assert.deepEqual(changed[0]!.payload.changedFields, ["rateLimitedUntil"]);
  assert.equal(
    (
      await f.api("POST", "/api/accounts/account-1/transition", {
        to: "disconnected",
        expectedFrom: "rate_limited",
      })
    ).status,
    200,
  );
  await delay(Math.max(0, secondDeadline.getTime() - Date.now()) + 250);
  assert.equal(
    (await f.api<Account[]>("GET", "/api/accounts")).body[0]!.status,
    "disconnected",
  );
  assert.equal((await f.control()).accounts["account-1"]!.online, false);
});

test("CG11: rejected create has no job or gateway effects; defaults and terminal run references match API", async (t) => {
  const f = await fixture(t);
  await f.connect();
  const before = (await f.control()).requests.length;
  for (const [payload, expected] of [
    [{ creatorAccountId: "account-1", memberAccountIds: [] }, 400],
    [{ creatorAccountId: "account-1", memberAccountIds: ["account-1"] }, 400],
    [
      {
        creatorAccountId: "account-1",
        memberAccountIds: ["account-2", "account-2"],
      },
      400,
    ],
    [{ creatorAccountId: "account-1", memberAccountIds: ["account-6"] }, 422],
    [{ creatorAccountId: "missing", memberAccountIds: ["account-2"] }, 422],
  ] as const)
    assert.equal(
      (await f.api("POST", "/api/groups", payload)).status,
      expected,
    );
  assert.equal((await f.db.query("SELECT * FROM jobs")).rowCount, 0);
  assert.equal((await f.db.query("SELECT * FROM groups")).rowCount, 0);
  assert.equal((await f.control()).requests.length, before);
  const { group } = await f.create();
  assert.equal(group.agentEnabled, false);
  assert.equal(group.autoKickEnabled, false);
  assert.equal(group.activeAgentRunId, null);
  assert.equal(group.activeSequenceRunId, null);
  for (const status of ["finished", "failed", "blocked", "cancelled"])
    await f.db.query(
      "INSERT INTO agent_runs(id,group_id,status,end_reason) VALUES($1,$2,$3,'fixture-terminal')",
      [`agent-${status}`, group.id, status],
    );
  await f.db.query(
    "INSERT INTO sequences(id,name,steps) VALUES('sequence','terminal fixtures','[]')",
  );
  for (const status of ["finished", "failed", "stopped"])
    await f.db.query(
      "INSERT INTO sequence_runs(id,group_id,sequence_id,status) VALUES($1,$2,'sequence',$3)",
      [`sequence-${status}`, group.id, status],
    );
  const current = (await f.api<Group>("GET", `/api/groups/${group.id}`)).body;
  assert.equal(current.activeAgentRunId, null);
  assert.equal(current.activeSequenceRunId, null);
});

test("CG11: real HTTP job failures expose fixed create/invite/join/promote/leave step names", async (t) => {
  const f = await fixture(t);
  await f.connect();
  for (const [suffix, step] of [
    ["/groups", "create"],
    ["/invite", "invite"],
    ["/join", "join:account-2"],
    ["/promote", "promote"],
  ] as const) {
    f.faults.push({ suffix, code: "NO_PERMISSION", status: 403 });
    const response = await f.api<{ jobId: string }>("POST", "/api/groups", {
      creatorAccountId: "account-1",
      memberAccountIds: ["account-2"],
    });
    assert.equal(response.status, 202);
    const job = await until(
      async () =>
        (await f.api<Job>("GET", `/api/jobs/${response.body.jobId}`)).body,
      (value) => !value.processing,
    );
    assert.equal(job.status, "failed");
    assert.deepEqual(job.errors, [{ step, code: "NO_PERMISSION" }]);
  }
  const { group } = await f.create();
  await f.control("/config", { leaveFailures: ["account-2"] });
  const leaving = await f.api<{ jobId: string }>(
    "POST",
    `/api/groups/${group.id}/leave-all`,
    {},
  );
  assert.equal(leaving.status, 202);
  const job = await until(
    async () =>
      (await f.api<Job>("GET", `/api/jobs/${leaving.body.jobId}`)).body,
    (value) => !value.processing,
  );
  assert.equal(job.status, "failed");
  assert.equal(job.errors[0]!.step, "leave:account-2");
});

test("CG10: stopped business process replays every external SSE event once, including history and duplicates", async (t) => {
  const f = await fixture(t);
  await f.connect();
  const { group } = await f.create();
  await f.app.close();
  const children: ChildProcess[] = [];
  async function stop(child: ChildProcess, signal: NodeJS.Signals) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill(signal);
    const force = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(force);
    }
  }
  f.onCleanup(async () => {
    for (const child of children) await stop(child, "SIGTERM");
  });
  async function boot() {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/src/main.ts"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          DATABASE_URL: f.url,
          GATEWAY_URL: f.gatewayUrl,
          AGENT_URL: f.agentUrl,
          PORT: "0",
        },
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
    const address = await until(async () => {
      if (child.exitCode !== null) throw new Error(`Child exited: ${output}`);
      return output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "";
    }, Boolean);
    return { child, address };
  }
  const first = await boot();
  await f.control("/message", {
    groupId: group.gatewayGroupId,
    msgId: "before-stop",
    text: "baseline",
  });
  await until(
    async () =>
      (await f.db.query("SELECT * FROM messages WHERE msg_id='before-stop'"))
        .rowCount,
    (count) => count === 1,
  );
  const baselineEvents = Number(
    (await f.db.query("SELECT count(*) AS count FROM gateway_events")).rows[0]!
      .count,
  );
  await stop(first.child, "SIGKILL");
  assert.equal(first.child.signalCode, "SIGKILL");
  await f.control("/config", { duplicateEvents: true, outOfOrder: true });
  for (let index = 0; index < 5; index++)
    await f.control("/message", {
      groupId: group.gatewayGroupId,
      msgId: `during-stop-${index}`,
      text: `offline ${index}`,
      ...(index === 2 ? { sentAt: "2020-01-01T00:00:00.000Z" } : {}),
    });
  const source = (await f.control()).events.find(
    (event) => event.msgId === "during-stop-1",
  )!;
  await f.control("/replay", { eventId: source.eventId });
  await f.control("/member", {
    groupId: group.gatewayGroupId,
    platformUserId: "external-offline",
    joined: true,
  });
  // The process is absent, so durable business state cannot change before restart.
  assert.equal((await f.db.query("SELECT * FROM messages")).rowCount, 1);
  assert.equal(
    Number(
      (await f.db.query("SELECT count(*) AS count FROM gateway_events"))
        .rows[0]!.count,
    ),
    baselineEvents,
  );
  const second = await boot();
  const expectedEvents = (await f.control()).events;
  await until(
    async () =>
      Number(
        (await f.db.query("SELECT count(*) AS count FROM gateway_events"))
          .rows[0]!.count,
      ),
    (count) => count === expectedEvents.length,
  );
  const messages = (
    await f.db.query<{ msg_id: string; text: string; sent_at: Date }>(
      "SELECT msg_id,text,sent_at FROM messages ORDER BY msg_id",
    )
  ).rows;
  assert.deepEqual(
    messages.map((message) => message.msg_id),
    [
      "before-stop",
      ...Array.from({ length: 5 }, (_, index) => `during-stop-${index}`),
    ],
  );
  assert.equal(
    messages
      .find((message) => message.msg_id === "during-stop-2")!
      .sent_at.toISOString(),
    "2020-01-01T00:00:00.000Z",
  );
  const eventIds = (
    await f.db.query<{ event_id: string }>(
      "SELECT event_id FROM gateway_events ORDER BY event_id",
    )
  ).rows.map((event) => Number(event.event_id));
  assert.deepEqual(
    eventIds,
    expectedEvents.map((event) => event.eventId).sort((a, b) => a - b),
  );
  const current = (
    await f.api<Group>(
      "GET",
      `/api/groups/${group.id}`,
      undefined,
      second.address,
    )
  ).body;
  assert.ok(
    current.members.some(
      (member) => member.platformUserId === "external-offline",
    ),
  );
  assert.equal((await f.db.query("SELECT * FROM agent_runs")).rowCount, 0);
  await f.control("/disconnect-events", {});
  await delay(1000);
  assert.equal((await f.db.query("SELECT * FROM messages")).rowCount, 6);
  assert.equal(
    Number(
      (await f.db.query("SELECT count(*) AS count FROM gateway_events"))
        .rows[0]!.count,
    ),
    expectedEvents.length,
  );
});

test("CG10: real GROUP_WRITE_FORBIDDEN commits group/sequence cancellation before WS, then finishes current Agent step", async (t) => {
  let releaseAudit!: () => void;
  let enteredAudit!: () => void;
  const auditGate = new Promise<void>((resolve) => {
    releaseAudit = resolve;
  });
  const auditEntered = new Promise<void>((resolve) => {
    enteredAudit = resolve;
  });
  let releaseForbidden!: () => void;
  let enteredForbidden!: () => void;
  const forbiddenGate = new Promise<void>((resolve) => {
    releaseForbidden = resolve;
  });
  const forbiddenEntered = new Promise<void>((resolve) => {
    enteredForbidden = resolve;
  });
  const f = await fixture(
    t,
    (agent) => {
      agent.addHook("preHandler", async (request) => {
        if (request.url === "/agent/audit") {
          enteredAudit();
          await auditGate;
        }
      });
    },
    (gateway) => {
      gateway.addHook("onSend", async (request, _reply, payload) => {
        if (
          request.url.endsWith("/send") &&
          typeof payload === "string" &&
          payload.includes("GROUP_WRITE_FORBIDDEN")
        ) {
          enteredForbidden();
          await forbiddenGate;
        }
        return payload;
      });
    },
  );
  f.onCleanup(async () => {
    releaseAudit();
    releaseForbidden();
  });
  await f.connect();
  const { group } = await f.create();
  await f.control(
    "/config",
    {
      turnScript: [
        {
          body: {
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "current-send",
                name: "send_message",
                input: {
                  text: "current audited step",
                  idempotency_key: "current",
                },
              },
            ],
          },
        },
      ],
    },
    f.agentUrl,
  );
  await f.api("PATCH", `/api/groups/${group.id}`, { agentEnabled: true });
  const sequence = await f.api<{ id: string }>("POST", "/api/sequences", {
    name: "future",
    steps: [
      {
        index: 1,
        accountRole: "admin",
        text: "must not send",
        delaySeconds: 60,
      },
    ],
  });
  assert.equal(sequence.status, 200);
  const started = await f.api<{ runId: string }>(
    "POST",
    `/api/groups/${group.id}/sequence-runs`,
    { sequenceId: sequence.body.id },
  );
  assert.equal(started.status, 201);
  await f.control("/message", {
    groupId: group.gatewayGroupId,
    text: "start held agent step",
  });
  await Promise.race([
    auditEntered,
    delay(5000).then(() => {
      throw new Error("Audit did not start");
    }),
  ]);
  const run = (
    await f.db.query<{ id: string }>(
      "SELECT id FROM agent_runs WHERE group_id=$1 AND status='running'",
      [group.id],
    )
  ).rows[0]!;
  assert.equal(
    (
      await f.db.query("SELECT state FROM agent_steps WHERE run_id=$1", [
        run.id,
      ])
    ).rows[0]!.state,
    "auditing",
  );
  const blocker = await f.db.pool.connect();
  let released = false;
  f.onCleanup(async () => {
    if (!released) {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });
  await blocker.query("BEGIN");
  const blockerPid = Number(
    (await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid,
  );
  const frames: {
    type: string;
    payload?: { groupId?: string; status?: string };
  }[] = [];
  const committedSnapshots: Promise<Record<string, unknown>[]>[] = [];
  const socket = new WebSocket(`${f.address.replace("http", "ws")}/ws`);
  f.onCleanup(async () => {
    socket.terminate();
  });
  socket.on("message", (data) => {
    const frame = JSON.parse(data.toString()) as (typeof frames)[number];
    frames.push(frame);
    if (
      (frame.type === "group_changed" &&
        frame.payload?.status === "unreachable") ||
      (frame.type === "sequence_run" && frame.payload?.status === "stopped")
    )
      committedSnapshots.push(
        f.db
          .query(
            "SELECT g.status AS group_status,s.status AS sequence_status,a.status AS agent_status,a.cancel_requested FROM groups g JOIN sequence_runs s ON s.group_id=g.id JOIN agent_runs a ON a.group_id=g.id WHERE g.id=$1",
            [group.id],
          )
          .then((result) => result.rows),
      );
  });
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "auth", accessToken: f.accessToken }));
  await until(
    async () => frames.some((frame) => frame.type === "auth"),
    Boolean,
  );
  await f.control("/config", { sendFaults: ["GROUP_WRITE_FORBIDDEN"] });
  const send = await f.api<{ clientMsgId: string }>(
    "POST",
    `/api/groups/${group.id}/send`,
    { accountId: "account-3", text: "observe forbidden" },
  );
  assert.equal(send.status, 202);
  await Promise.race([
    forbiddenEntered,
    delay(3000).then(() => {
      throw new Error("Forbidden response did not arrive");
    }),
  ]);
  // Queue acceptance has already committed. Hold the final durable-event flush,
  // then release the actual HTTP 403. A scheduler may also lock sequence rows, so
  // an arbitrary blocked backend there would not identify this result transaction.
  await blocker.query("SELECT pg_advisory_xact_lock(913457)");
  releaseForbidden();
  await until(
    async () =>
      (
        await f.db.query(
          "SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND query='SELECT pg_advisory_xact_lock(913457)'",
          [blockerPid],
        )
      ).rowCount,
    (count) => Number(count) > 0,
  );
  assert.equal(
    (await f.control()).groups[group.gatewayGroupId]!.writable,
    false,
  );
  assert.equal(
    (await f.db.query("SELECT status FROM groups WHERE id=$1", [group.id]))
      .rows[0]!.status,
    "active",
  );
  assert.equal(committedSnapshots.length, 0);
  await blocker.query("COMMIT");
  blocker.release();
  released = true;
  await until(
    async () => committedSnapshots.length,
    (count) => count === 2,
  );
  for (const result of await Promise.all(committedSnapshots))
    assert.deepEqual(result[0], {
      group_status: "unreachable",
      sequence_status: "stopped",
      agent_status: "running",
      cancel_requested: true,
    });
  const interim = (await f.api<Group>("GET", `/api/groups/${group.id}`)).body;
  assert.equal(interim.activeSequenceRunId, null);
  assert.equal(interim.activeAgentRunId, run.id);
  assert.equal(
    (
      await f.db.query("SELECT state FROM agent_steps WHERE run_id=$1", [
        run.id,
      ])
    ).rows[0]!.state,
    "auditing",
  );
  releaseAudit();
  await until(
    async () =>
      (await f.db.query("SELECT status FROM agent_runs WHERE id=$1", [run.id]))
        .rows[0]!.status as string,
    (status) => status === "cancelled",
  );
  const terminal = (
    await f.db.query(
      "SELECT status,end_reason,step_count FROM agent_runs WHERE id=$1",
      [run.id],
    )
  ).rows[0]!;
  assert.deepEqual(terminal, {
    status: "cancelled",
    end_reason: "cancelled",
    step_count: 1,
  });
  assert.equal(
    (
      await f.db.query("SELECT state FROM agent_steps WHERE run_id=$1", [
        run.id,
      ])
    ).rows[0]!.state,
    "complete",
  );
  assert.equal(
    (await f.api<Group>("GET", `/api/groups/${group.id}`)).body
      .activeAgentRunId,
    null,
  );
  assert.ok(
    (await f.api<Account[]>("GET", "/api/accounts")).body
      .slice(0, 3)
      .every((account) => account.status === "online"),
  );
  await f.control("/message", {
    groupId: group.gatewayGroupId,
    msgId: "after-unreachable",
    text: "must not start next run",
  });
  await until(
    async () =>
      (
        await f.db.query(
          "SELECT * FROM messages WHERE msg_id='after-unreachable'",
        )
      ).rowCount,
    (count) => count === 1,
  );
  await delay(350);
  assert.equal((await f.db.query("SELECT * FROM agent_runs")).rowCount, 1);
  const agent = await f.control<{ calls: unknown[] }>(
    "",
    undefined,
    f.agentUrl,
  );
  assert.equal(agent.calls.length, 1);
  const sends = (await f.control()).requests.filter((request) =>
    request.path.endsWith("/send"),
  );
  assert.equal(sends.length, 1);
  assert.equal(sends[0]!.body.clientMsgId, send.body.clientMsgId);
});
