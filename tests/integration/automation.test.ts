import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { Database, type Queryable } from "../../apps/server/src/core/db.js";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import { AppError, RemoteError } from "../../apps/server/src/core/errors.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import type {
  MessagingService,
  SendInput,
} from "../../apps/server/src/core/messaging.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import {
  parseTurn,
  tools,
  validateTool,
  resultContent,
} from "../../apps/server/src/modules/automation/protocol.js";
import { resolveSteps } from "../../apps/server/src/modules/automation/sequences.js";
import type { Message } from "../../packages/contracts/src/index.js";

interface TurnBody {
  runId: string;
  tools: unknown[];
  messages: {
    role: string;
    content: {
      type: string;
      name?: string;
      text?: string;
      content?: string;
      is_error?: boolean;
    }[];
  }[];
}
type AgentReply = (body: TurnBody) => unknown;
let db: Database;
let api: FastifyInstance;
let remote: FastifyInstance;
let module: ReturnType<typeof createAutomationModule>;
let second: ReturnType<typeof createAutomationModule>;
let agentReply: AgentReply;
let auditReply: () => unknown;
let auditCalls = 0;
let enqueueCalls = 0;
let kickCalls = 0;
let sendState: Message["deliveryStatus"] = "accepted";
let kickFailure: string | null = null;
let kickWaitForAbort = false;
const schema = "public";
let applicationName: string;
const groupId = "g-automation";
const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
function use(id: string, name: string, input: unknown): unknown {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
  };
}
function end(text = "done"): unknown {
  return { stop_reason: "end_turn", content: [{ type: "text", text }] };
}
async function waitFor(
  predicate: () => Promise<boolean>,
  timeout = 5000,
): Promise<void> {
  const until = Date.now() + timeout;
  do {
    await Promise.all([module.tick(), second.tick()]);
    if (await predicate()) return;
    await delay(20);
  } while (Date.now() < until);
  throw new Error("Timed out waiting for automation state");
}
async function inbound(text = "hello"): Promise<string> {
  const id = randomUUID();
  await db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES($1,$2,$1,'external',false,$3)",
    [id, groupId, text],
  );
  return id;
}
async function latestRun(): Promise<{
  id: string;
  status: string;
  end_reason: string;
  history: TurnBody["messages"];
}> {
  return (
    await db.query<{
      id: string;
      status: string;
      end_reason: string;
      history: TurnBody["messages"];
    }>("SELECT * FROM agent_runs ORDER BY created_at DESC,id DESC LIMIT 1")
  ).rows[0]!;
}
async function terminateRunLock(runId: string): Promise<void> {
  const killed = await db.query(
    `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended($1,0)>>32)&4294967295) AND objid::bigint=(hashtextextended($1,0)&4294967295) AND granted`,
    [`agent:${runId}`],
  );
  assert.equal(
    killed.rowCount,
    1,
    "exactly one active run lock must be terminated",
  );
}
async function waitForInitializingClockOwner(
  blockerPid: number,
): Promise<number> {
  const deadline = Date.now() + 3000;
  do {
    const owner = (
      await db.query<{ pid: number }>(
        `SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
       WHERE a.application_name=$1 AND $2::integer=ANY(pg_blocking_pids(a.pid))
       AND l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
       AND l.classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295)
       AND l.objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND l.granted`,
        [applicationName, blockerPid],
      )
    ).rows[0];
    if (owner) return owner.pid;
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error(
    "Clock owner did not hold its session lock while waiting for the run row",
  );
}
async function waitForClockInitializationFollower(
  ownerPid: number,
): Promise<number> {
  const deadline = Date.now() + 3000;
  do {
    const follower = (
      await db.query<{ pid: number }>(
        `SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
       WHERE a.application_name=$1 AND $2::integer=ANY(pg_blocking_pids(a.pid))
       AND l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
       AND l.classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock:init',0)>>32)&4294967295)
       AND l.objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock:init',0)&4294967295) AND NOT l.granted`,
        [applicationName, ownerPid],
      )
    ).rows[0];
    if (follower) return follower.pid;
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error(
    "Follower did not demonstrably wait for the owner's initialization advisory lock",
  );
}
async function reset(): Promise<void> {
  await module.close!();
  await second.close!();
  await db.query(
    "TRUNCATE agent_send_keys,agent_steps,agent_pending,agent_runs,sequence_steps,sequence_runs,sequences,messages,events CASCADE",
  );
  await db.query(
    "UPDATE groups SET agent_enabled=true,auto_kick_enabled=false,status='active'",
  );
  await db.query("UPDATE accounts SET status='online',rate_limited_until=NULL");
  auditCalls = 0;
  enqueueCalls = 0;
  kickCalls = 0;
  agentReply = () => end();
  auditReply = () => ({ verdict: "pass", reason: "allowed" });
  sendState = "accepted";
  kickFailure = null;
  kickWaitForAbort = false;
  const context = {
    db,
    agent: new RemoteClient(remote.listeningOrigin),
    gateway: new RemoteClient(remote.listeningOrigin),
    log: api.log,
  };
  module = createAutomationModule(context, messaging);
  second = createAutomationModule(context, messaging);
}
const messaging: MessagingService = {
  async enqueueSend(input: SendInput, tx?: Queryable): Promise<Message> {
    enqueueCalls++;
    const id = randomUUID();
    const client = input.clientMsgId ?? randomUUID();
    await (tx ?? db).query(
      `INSERT INTO messages(id,group_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,delivery_status,metadata) VALUES($1,$2,$3,$4,$4,true,$5,$7,$6)`,
      [
        id,
        input.groupId,
        client,
        input.accountId,
        input.text,
        JSON.stringify({ source: input.source, sourceRef: input.sourceRef }),
        sendState,
      ],
    );
    return {
      id,
      msgId: null,
      clientMsgId: client,
      senderPlatformUserId: input.accountId,
      isOwn: true,
      text: input.text,
      sentAt: new Date().toISOString(),
      deliveryStatus: sendState,
      failCode: null,
    };
  },
  async getMessage(clientMsgId: string): Promise<Message | null> {
    const row = (
      await db.query<{
        id: string;
        text: string;
        delivery_status: Message["deliveryStatus"];
        fail_code: string | null;
      }>("SELECT * FROM messages WHERE client_msg_id=$1", [clientMsgId])
    ).rows[0];
    return row
      ? {
          id: row.id,
          msgId: null,
          clientMsgId,
          senderPlatformUserId: "account-1",
          isOwn: true,
          text: row.text,
          sentAt: new Date().toISOString(),
          deliveryStatus: row.delivery_status,
          failCode: row.fail_code,
        }
      : null;
  },
  async kick(_input, options): Promise<{ kicked: true }> {
    kickCalls++;
    if (kickFailure) throw new RemoteError(409, kickFailure);
    if (kickWaitForAbort)
      await new Promise<void>((_resolve, reject) => {
        assert.ok(options?.signal);
        options.signal.throwIfAborted();
        options.signal.addEventListener(
          "abort",
          () => {
            reject(options.signal?.reason);
          },
          { once: true },
        );
      });
    return { kicked: true };
  },
};
let closeFixture: (() => Promise<void>) | undefined;
// Keep this hook at suite scope: after() inside before() can bind to the first test.
after(async () => {
  await closeFixture?.();
});
before(async () => {
  const temporary = await temporaryDatabase({
    after(cleanup) {
      closeFixture = cleanup;
    },
  });
  db = temporary.db;
  applicationName = new URL(temporary.url).searchParams.get(
    "application_name",
  )!;
  await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await db.query(
    `INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES($1,'remote-group','account-1',true)`,
    [groupId],
  );
  await db.query(
    `INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-1','account-1','creator'),($1,'account-2','account-2','admin'),($1,'account-3','account-3','member')`,
    [groupId],
  );
  remote = Fastify({ forceCloseConnections: true });
  temporary.onCleanup(() => remote.close());
  remote.post("/agent/turn", async (request) =>
    agentReply(request.body as TurnBody),
  );
  remote.post("/agent/audit", async () => {
    auditCalls++;
    return auditReply();
  });
  await remote.listen({ host: "127.0.0.1", port: 0 });
  api = Fastify();
  temporary.onCleanup(() => api.close());
  api.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError)
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message, ...error.details },
      });
    return reply
      .code(500)
      .send({ error: { code: "INTERNAL", message: String(error) } });
  });
  const context = {
    db,
    agent: new RemoteClient(remote.listeningOrigin),
    gateway: new RemoteClient(remote.listeningOrigin),
    log: api.log,
  };
  module = createAutomationModule(context, messaging);
  temporary.onCleanup(async () => {
    await module.close?.();
  });
  second = createAutomationModule(context, messaging);
  temporary.onCleanup(async () => {
    await second.close?.();
  });
  await module.register(api);
});

test("tool definitions have all required arguments; invalid protocols are rejected", () => {
  assert.equal(tools.length, 4);
  for (const tool of tools)
    assert.deepEqual(
      [...(tool.input_schema.required ?? [])].sort(),
      Object.keys(tool.input_schema.properties ?? {}).sort(),
    );
  assert.equal(parseTurn("```json\n{}\n```"), null);
  assert.equal(
    parseTurn(
      JSON.stringify({
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    validateTool({
      type: "tool_use",
      id: "t",
      name: "send_message",
      input: { text: "hello" },
    }),
    "INVALID_INPUT",
  );
  assert.equal(
    validateTool({ type: "tool_use", id: "t", name: "__proto__", input: {} }),
    "UNKNOWN_TOOL",
  );
  assert.ok(
    Buffer.byteLength(resultContent({ text: "中".repeat(10000) })) <= 8192,
  );
});
test("sequence variables persist overrides and report the first unresolved step", () => {
  const steps = [1, 2, 3].map((index) => ({
    index,
    accountRole: "admin" as const,
    text: "{x} {y}",
    delaySeconds: 0,
  }));
  const resolved = resolveSteps(
    steps,
    { x: "default", y: "first" },
    { "2": { x: "override", y: "" } },
  );
  assert.equal(resolved[2]?.text, "override first");
  assert.deepEqual(resolved[2]?.varSources, { x: "step:2", y: "default" });
  assert.throws(
    () => resolveSteps(steps, { x: "" }, {}),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "UNRESOLVED_PLACEHOLDER" &&
      error.details.stepIndex === 1 &&
      error.details.key === "x",
  );
});
test("PostgreSQL serializes concurrent sequence starts and failed preflight creates no run", async () => {
  await reset();
  const created = await api.inject({
    method: "POST",
    url: "/api/sequences",
    payload: {
      name: "announcements",
      steps: [1, 2, 3].map((index) => ({
        index,
        accountRole: "admin",
        text: index === 3 ? "{missing}" : "hello",
        delaySeconds: 0,
      })),
    },
  });
  const sequenceId = created.json<{ id: string }>().id;
  const invalid = await api.inject({
    method: "POST",
    url: `/api/groups/${groupId}/sequence-runs`,
    payload: { sequenceId },
  });
  assert.equal(invalid.statusCode, 422);
  const preflightError = invalid.json<{
    error: { code: string; stepIndex: number; key: string };
  }>().error;
  assert.equal(preflightError.code, "UNRESOLVED_PLACEHOLDER");
  assert.equal(preflightError.stepIndex, 3);
  assert.equal(preflightError.key, "missing");
  assert.equal((await db.query("SELECT id FROM sequence_runs")).rowCount, 0);
  assert.equal(enqueueCalls, 0);
  const calls = await Promise.all(
    [1, 2].map(() =>
      api.inject({
        method: "POST",
        url: `/api/groups/${groupId}/sequence-runs`,
        payload: { sequenceId, vars: { missing: "resolved" } },
      }),
    ),
  );
  assert.deepEqual(calls.map((r) => r.statusCode).sort(), [201, 409]);
  assert.equal(
    (await db.query("SELECT id FROM sequence_runs WHERE status='running'"))
      .rowCount,
    1,
  );
});
test("multiple workers create one agent run and same send key is audited and enqueued once", async () => {
  await reset();
  agentReply = (body) => {
    const turns = body.messages.filter((m) => m.role === "assistant").length;
    return turns < 2
      ? use(`tool-${turns}`, "send_message", {
          text: "hello",
          idempotency_key: "same",
        })
      : end("complete");
  };
  await inbound();
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal((await db.query("SELECT id FROM agent_runs")).rowCount, 1);
  assert.equal(auditCalls, 1);
  assert.equal(enqueueCalls, 1);
  const run = await latestRun();
  const result = await api.inject(`/api/agent-runs/${run.id}`);
  assert.equal(result.json<{ steps: unknown[] }>().steps.length, 3);
  assert.equal(run.history.filter((m) => m.role === "user").length, 3);
});
test("bad JSON, unknown tool, duplicate tool id are recorded without corrupting history", async () => {
  await reset();
  let call = 0;
  agentReply = () => {
    call++;
    if (call === 1) return "```json\n{}\n```";
    if (call === 2 || call === 3) return use("duplicate", "not_a_tool", {});
    return end();
  };
  await inbound();
  await waitFor(async () => (await latestRun())?.status === "failed");
  assert.equal((await latestRun()).end_reason, "protocol_errors");
  const steps = (
    await db.query<{ kind: string; error_code: string; raw_response: string }>(
      "SELECT * FROM agent_steps ORDER BY ordinal",
    )
  ).rows;
  assert.deepEqual(
    steps.map((s) => s.error_code),
    ["BAD_JSON", "UNKNOWN_TOOL", "DUPLICATE_TOOL_USE_ID"],
  );
  assert.deepEqual(
    steps.map((s) => s.kind),
    ["protocol_error", "tool_use", "protocol_error"],
  );
  assert.ok(steps.every((s) => s.raw_response.length > 0));
});
test("invalid finish inputs return INVALID_INPUT and allow a later valid completion", async (t) => {
  for (const [label, input] of [
    ["null", null],
    ["missing summary", {}],
    ["wrong summary type", { summary: 42 }],
  ] as const) {
    for (const completion of ["end_turn", "finish"] as const) {
      await t.test(`${label} followed by ${completion}`, async () => {
        await reset();
        let turns = 0;
        let resumedHistory: TurnBody["messages"] = [];
        agentReply = (body) => {
          turns++;
          if (turns === 1) return use("invalid-finish", "finish", input);
          resumedHistory = body.messages;
          return completion === "end_turn"
            ? end("valid completion")
            : use("valid-finish", "finish", { summary: "valid completion" });
        };
        await inbound();
        await waitFor(
          async () => (await latestRun())?.status === "finished",
          1500,
        );
        assert.equal(turns, 2);
        const result = resumedHistory.at(-1)!.content[0]!;
        assert.equal(result.type, "tool_result");
        assert.equal(result.is_error, true);
        assert.equal(JSON.parse(result.content!).code, "INVALID_INPUT");
        const run = await latestRun();
        const detail = (await api.inject(`/api/agent-runs/${run.id}`)).json<{
          summary: string;
          steps: {
            kind: string;
            name: string;
            isError: boolean;
            errorCode: string;
          }[];
        }>();
        assert.equal(detail.summary, "valid completion");
        assert.equal(detail.steps.length, 2);
        assert.equal(detail.steps[0]!.kind, "tool_use");
        assert.equal(detail.steps[0]!.name, "finish");
        assert.equal(detail.steps[0]!.isError, true);
        assert.equal(detail.steps[0]!.errorCode, "INVALID_INPUT");
        assert.equal(enqueueCalls, 0);
        agentReply = () => end("next group run");
        await inbound("another message after invalid finish");
        await waitFor(async () => {
          const next = await latestRun();
          return next.id !== run.id && next.status === "finished";
        });
      });
    }
  }
});

test("completed invalid finish recovery honors cancellation and execution limits", async (t) => {
  for (const [reason, status, activeMs, stepCount, protocolErrors, cancel] of [
    ["cancelled", "cancelled", 0, 1, 0, true],
    ["wall_clock", "failed", 60000, 1, 0, false],
    ["budget_exhausted", "failed", 0, 12, 0, false],
    ["protocol_errors", "failed", 0, 1, 3, false],
  ] as const) {
    await t.test(reason, async () => {
      await reset();
      let turns = 0;
      agentReply = () => {
        turns++;
        return end("must not run");
      };
      const id = randomUUID();
      await db.query(
        "INSERT INTO agent_runs(id,group_id,active_ms,step_count,protocol_errors,cancel_requested) VALUES($1,$2,$3,$4,$5,$6)",
        [id, groupId, activeMs, stepCount, protocolErrors, cancel],
      );
      await db.query(
        `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,is_error,error_code,result) VALUES($1,1,'tool_use','invalid-finish','finish','null'::jsonb,'complete',true,'INVALID_INPUT','{"code":"INVALID_INPUT"}'::jsonb)`,
        [id],
      );
      await waitFor(
        async () => (await latestRun())?.status !== "running",
        1500,
      );
      const run = await latestRun();
      assert.equal(run.status, status);
      assert.equal(run.end_reason, reason);
      assert.equal(turns, 0);
      assert.equal(
        (await db.query("SELECT * FROM agent_steps WHERE run_id=$1", [id]))
          .rowCount,
        1,
      );
    });
  }
});

test("a successful persisted finish completes recovery without another remote turn", async () => {
  await reset();
  let turns = 0;
  agentReply = () => {
    turns++;
    return end("must not run");
  };
  const id = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,step_count) VALUES($1,$2,1)",
    [id, groupId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state) VALUES($1,1,'tool_use','saved-finish','finish',$2,'complete')`,
    [id, JSON.stringify({ summary: "durable completion" })],
  );
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(turns, 0);
  assert.equal(
    (await api.inject(`/api/agent-runs/${id}`)).json<{ summary: string }>()
      .summary,
    "durable completion",
  );
});

test("inconclusive audit blocks without side effects; rejection does not reserve a send key", async () => {
  await reset();
  agentReply = () =>
    use("s1", "send_message", { text: "test", idempotency_key: "key" });
  auditReply = () => ({ verdict: "uncertain" });
  await inbound();
  await waitFor(async () => (await latestRun())?.status === "blocked");
  assert.equal(auditCalls, 3);
  assert.equal(enqueueCalls, 0);
  assert.equal((await latestRun()).end_reason, "audit_blocked");
  await reset();
  let turn = 0;
  auditReply = () => ({
    verdict: auditCalls === 1 ? "fail" : "pass",
    reason: "policy",
  });
  agentReply = () =>
    ++turn <= 2
      ? use(`s${turn}`, "send_message", {
          text: "test",
          idempotency_key: "key",
        })
      : end();
  await inbound();
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(auditCalls, 2);
  assert.equal(enqueueCalls, 1);
});
test("messages arriving during a run become one next trigger and own messages never trigger", async () => {
  await reset();
  let release: (() => void) | undefined;
  let first = true;
  agentReply = async () => {
    if (first) {
      first = false;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return end();
  };
  await inbound("first");
  await waitFor(async () => Boolean(release));
  await inbound("second");
  await inbound("third");
  await db.query(
    "INSERT INTO messages(id,group_id,msg_id,is_own,text) VALUES($1,$2,$1,true,'own')",
    [randomUUID(), groupId],
  );
  await module.tick();
  release!();
  await waitFor(
    async () =>
      (await db.query("SELECT id FROM agent_runs WHERE status='finished'"))
        .rowCount === 2,
  );
  const rows = (
    await db.query<{ history: TurnBody["messages"] }>(
      "SELECT history FROM agent_runs ORDER BY created_at",
    )
  ).rows;
  const context = JSON.parse(rows[1]!.history[0]!.content[0]!.text!) as {
    triggerMessages: { text: string }[];
  };
  assert.deepEqual(
    context.triggerMessages.map((m) => m.text),
    ["second", "third"],
  );
  assert.equal((await db.query("SELECT * FROM agent_pending")).rowCount, 3);
});
test("interrupted remote turn is visibly paused and never replayed", async () => {
  await reset();
  let calls = 0;
  agentReply = () => {
    calls++;
    return end();
  };
  const runId = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,inflight_turn) VALUES($1,$2,true)",
    [runId, groupId],
  );
  await waitFor(async () =>
    Boolean(
      (
        await db.query<{ recovery_note: string }>(
          "SELECT recovery_note FROM agent_runs WHERE id=$1",
          [runId],
        )
      ).rows[0]?.recovery_note,
    ),
  );
  assert.equal(calls, 0);
  assert.equal((await latestRun()).status, "running");
  assert.equal(
    (await db.query("SELECT * FROM events WHERE type='inconsistency'"))
      .rowCount,
    1,
  );
  await db.query("UPDATE groups SET agent_enabled=false WHERE id=$1", [
    groupId,
  ]);
  await waitFor(async () => (await latestRun())?.status === "cancelled");
  assert.equal(calls, 0);
  assert.ok(
    (await api.inject(`/api/agent-runs/${runId}`)).json<{
      recoveryNote: string;
    }>().recoveryNote,
  );
});
test("sequence rate limit defers, sent event schedules next step, and restart only reschedules earliest step", async () => {
  await reset();
  await db.query("UPDATE groups SET agent_enabled=false");
  await db.query(
    "UPDATE accounts SET status='rate_limited',rate_limited_until=now()+interval '1 hour' WHERE id IN ('account-1','account-2')",
  );
  const definition = await api.inject({
    method: "POST",
    url: "/api/sequences",
    payload: {
      name: "timed",
      steps: [1, 2].map((index) => ({
        index,
        accountRole: "admin",
        text: "test",
        delaySeconds: index === 1 ? 0 : 10,
      })),
    },
  });
  const start = await api.inject({
    method: "POST",
    url: `/api/groups/${groupId}/sequence-runs`,
    payload: { sequenceId: definition.json<{ id: string }>().id },
  });
  const runId = start.json<{ runId: string }>().runId;
  await module.tick();
  assert.equal(enqueueCalls, 0);
  await db.query("UPDATE accounts SET status='online',rate_limited_until=NULL");
  await module.tick();
  assert.equal(enqueueCalls, 1);
  await db.query(
    "UPDATE messages SET delivery_status='sent',updated_at=now(),message_sent_observed_at=now() WHERE is_own",
  );
  await module.tick();
  const steps = (
    await db.query<{
      index: number;
      status: string;
      scheduled_at: Date;
      sent_at: Date;
    }>("SELECT * FROM sequence_steps WHERE run_id=$1 ORDER BY index", [runId])
  ).rows;
  assert.equal(steps[0]!.status, "sent");
  assert.equal(
    steps[1]!.scheduled_at.getTime() - steps[0]!.sent_at.getTime(),
    10000,
  );
  await db.query(
    "UPDATE sequence_steps SET scheduled_at=now()-interval '1 hour' WHERE run_id=$1 AND index=2",
    [runId],
  );
  const expired = (
    await db.query<{ scheduled_at: Date }>(
      "SELECT scheduled_at FROM sequence_steps WHERE run_id=$1 AND index=2",
      [runId],
    )
  ).rows[0]!.scheduled_at.getTime();
  await second.recover!();
  assert.equal(
    (
      await db.query<{ scheduled_at: Date }>(
        "SELECT scheduled_at FROM sequence_steps WHERE run_id=$1 AND index=2",
        [runId],
      )
    ).rows[0]!.scheduled_at.getTime(),
    expired,
    "a joining instance must not rebase the active scheduler",
  );
  await module.close!();
  const before = Date.now();
  await second.recover!();
  const scheduled = (
    await db.query<{ scheduled_at: Date }>(
      "SELECT scheduled_at FROM sequence_steps WHERE run_id=$1 AND index=2",
      [runId],
    )
  ).rows[0]!.scheduled_at.getTime();
  assert.ok(scheduled >= before + 9900);
  assert.equal(enqueueCalls, 1);
});

test("persisted final and prepared send recover without replaying prior external work", async () => {
  await reset();
  let calls = 0;
  agentReply = () => {
    calls++;
    return end();
  };
  const finalId = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,step_count) VALUES($1,$2,1)",
    [finalId, groupId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,state,result) VALUES($1,1,'final','complete',$2)`,
    [finalId, JSON.stringify({ summary: "saved final" })],
  );
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(calls, 0);
  assert.equal(
    (await api.inject(`/api/agent-runs/${finalId}`)).json<{ summary: string }>()
      .summary,
    "saved final",
  );
  await reset();
  const runId = randomUUID();
  const tool = {
    type: "tool_use",
    id: "saved-send",
    name: "send_message",
    input: { text: "already enqueued", idempotency_key: "saved-key" },
  };
  await db.query(
    "INSERT INTO agent_runs(id,group_id,step_count,history) VALUES($1,$2,1,$3)",
    [
      runId,
      groupId,
      JSON.stringify([
        { role: "user", content: [{ type: "text", text: "{}" }] },
        { role: "assistant", content: [tool] },
      ]),
    ],
  );
  const message = await messaging.enqueueSend({
    groupId,
    accountId: "account-2",
    text: "already enqueued",
  });
  await db.query(
    "INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES($1,'saved-key',$2)",
    [runId, message.clientMsgId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','saved-send','send_message',$2,'executing','pass')`,
    [runId, JSON.stringify(tool.input)],
  );
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(enqueueCalls, 1);
  assert.equal(auditCalls, 0);
  const history = (await latestRun()).history;
  assert.equal(history[2]!.content[0]!.type, "tool_result");
});
test("kick policy and persisted uncertain kick cannot produce a second side effect", async () => {
  await reset();
  let calls = 0;
  agentReply = () =>
    ++calls === 1
      ? use("kick-policy", "kick_user", {
          platform_user_id: "external",
          reason: "policy test",
        })
      : end();
  await inbound();
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(kickCalls, 0);
  assert.equal(auditCalls, 0);
  assert.equal(
    (
      await db.query<{ error_code: string }>(
        "SELECT error_code FROM agent_steps WHERE ordinal=1",
      )
    ).rows[0]!.error_code,
    "POLICY_DENIED",
  );
  await reset();
  const id = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,step_count) VALUES($1,$2,1)",
    [id, groupId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','kick-saved','kick_user',$2,'executing','pass')`,
    [id, JSON.stringify({ platform_user_id: "external", reason: "saved" })],
  );
  await waitFor(async () =>
    Boolean(
      (
        await db.query<{ recovery_note: string }>(
          "SELECT recovery_note FROM agent_runs WHERE id=$1",
          [id],
        )
      ).rows[0]?.recovery_note,
    ),
  );
  assert.equal(kickCalls, 0);
  assert.equal((await latestRun()).status, "running");
});
test("repeated reads stop within twelve steps and result bytes remain bounded", async () => {
  await reset();
  let turns = 0;
  agentReply = () =>
    use(`read-${++turns}`, "get_recent_messages", { limit: 100000 });
  for (let i = 0; i < 55; i++) await inbound("文".repeat(2000));
  await waitFor(async () => (await latestRun())?.status === "failed");
  const run = await latestRun();
  assert.equal(run.end_reason, "budget_exhausted");
  assert.equal(turns, 12);
  const results = run.history
    .flatMap((m) => m.content)
    .filter((c) => c.type === "tool_result");
  for (const result of results) {
    assert.ok(Buffer.byteLength(result.content!) <= 8192);
    const content = JSON.parse(result.content!) as {
      messages: unknown[];
      truncated: boolean;
    };
    assert.ok(content.messages.length <= 50);
    assert.equal(content.truncated, true);
  }
});
test("disabling Agent during its current step cancels after that step, without another turn", async () => {
  await reset();
  let release: (() => void) | undefined;
  let turns = 0;
  agentReply = async () => {
    turns++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return use("current-step", "get_recent_messages", { limit: 10 });
  };
  await inbound();
  await waitFor(async () => Boolean(release));
  await db.query("UPDATE groups SET agent_enabled=false WHERE id=$1", [
    groupId,
  ]);
  await db.query(
    "UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1",
    [groupId],
  );
  release!();
  await waitFor(async () => (await latestRun())?.status === "cancelled");
  assert.equal(turns, 1);
  assert.equal((await latestRun()).end_reason, "cancelled");
  assert.equal(
    (await db.query<{ state: string }>("SELECT state FROM agent_steps"))
      .rows[0]!.state,
    "complete",
  );
});

test("activity budget interrupts a late turn and discards the eventual response", async () => {
  await reset();
  let turns = 0;
  agentReply = async () => {
    turns++;
    await delay(200);
    return end("too late");
  };
  const id = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,active_ms) VALUES($1,$2,59930)",
    [id, groupId],
  );
  await waitFor(async () => (await latestRun())?.status === "failed");
  assert.equal((await latestRun()).end_reason, "wall_clock");
  assert.equal(turns, 1);
  await delay(220);
  const steps = (
    await db.query<{ kind: string; error_code: string }>(
      "SELECT kind,error_code FROM agent_steps WHERE run_id=$1",
      [id],
    )
  ).rows;
  assert.deepEqual(
    steps.map((step) => step.error_code),
    ["TURN_TIMEOUT"],
  );
  assert.equal((await latestRun()).status, "failed");
});
test("activity budget expires during audit without authorizing the prepared tool", async () => {
  await reset();
  auditReply = async () => {
    await delay(200);
    return { verdict: "pass", reason: "late" };
  };
  const id = randomUUID();
  const input = { text: "must not send", idempotency_key: "late-audit" };
  await db.query(
    "INSERT INTO agent_runs(id,group_id,active_ms,step_count) VALUES($1,$2,59930,1)",
    [id, groupId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input) VALUES($1,1,'tool_use','late-audit','send_message',$2)`,
    [id, JSON.stringify(input)],
  );
  await waitFor(async () => (await latestRun())?.status === "failed");
  assert.equal((await latestRun()).end_reason, "wall_clock");
  assert.equal(auditCalls, 1);
  assert.equal(enqueueCalls, 0);
  await delay(220);
  assert.equal(enqueueCalls, 0);
});

test("an accepted send whose account becomes terminal yields SEND_FAILED without a resend", async () => {
  await reset();
  const id = randomUUID();
  const input = {
    text: "accepted before terminal",
    idempotency_key: "terminal-key",
  };
  await db.query(
    "INSERT INTO agent_runs(id,group_id,step_count,history) VALUES($1,$2,1,$3)",
    [
      id,
      groupId,
      JSON.stringify([
        { role: "user", content: [{ type: "text", text: "{}" }] },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "terminal-send",
              name: "send_message",
              input,
            },
          ],
        },
      ]),
    ],
  );
  const message = await messaging.enqueueSend({
    groupId,
    accountId: "account-2",
    text: input.text,
  });
  await db.query(
    "INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES($1,$2,$3)",
    [id, input.idempotency_key, message.clientMsgId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','terminal-send','send_message',$2,'executing','pass')`,
    [id, JSON.stringify(input)],
  );
  await db.query("UPDATE accounts SET status='suspended' WHERE id='account-2'");
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(enqueueCalls, 1);
  assert.equal(auditCalls, 0);
  assert.equal(
    (
      await db.query<{ error_code: string }>(
        "SELECT error_code FROM agent_steps WHERE run_id=$1 AND ordinal=1",
        [id],
      )
    ).rows[0]!.error_code,
    "SEND_FAILED",
  );
});

test("restart catches up a committed send before rebasing the next unscheduled step", async () => {
  await reset();
  await db.query("UPDATE groups SET agent_enabled=false");
  const definition = await api.inject({
    method: "POST",
    url: "/api/sequences",
    payload: {
      name: "restart gap",
      steps: [1, 2].map((index) => ({
        index,
        accountRole: "admin",
        text: "test",
        delaySeconds: index === 1 ? 0 : 10,
      })),
    },
  });
  const start = await api.inject({
    method: "POST",
    url: `/api/groups/${groupId}/sequence-runs`,
    payload: { sequenceId: definition.json<{ id: string }>().id },
  });
  const runId = start.json<{ runId: string }>().runId;
  await module.tick();
  await db.query(
    "UPDATE messages SET delivery_status='sent',updated_at=now()-interval '1 hour',message_sent_observed_at=now()-interval '1 hour' WHERE is_own",
  );
  await module.close!();
  const before = Date.now();
  await second.recover!();
  const rows = (
    await db.query<{ status: string; scheduled_at: Date }>(
      "SELECT * FROM sequence_steps WHERE run_id=$1 ORDER BY index",
      [runId],
    )
  ).rows;
  assert.equal(rows[0]!.status, "sent");
  assert.equal(rows[1]!.status, "pending");
  assert.ok(rows[1]!.scheduled_at.getTime() >= before + 9900);
  assert.equal(enqueueCalls, 1);
});
test("kick permission errors remain tool errors and a confirmed kick succeeds", async () => {
  for (const code of ["OWNER_LEFT", "NO_PERMISSION", null]) {
    await reset();
    await db.query("UPDATE groups SET auto_kick_enabled=true");
    kickFailure = code;
    let turns = 0;
    agentReply = () =>
      ++turns === 1
        ? use("kick", "kick_user", {
            platform_user_id: "external",
            reason: "approved policy",
          })
        : end();
    await inbound();
    await waitFor(async () => (await latestRun())?.status === "finished");
    const step = (
      await db.query<{
        error_code: string | null;
        result: { kicked?: boolean };
      }>("SELECT error_code,result FROM agent_steps WHERE ordinal=1")
    ).rows[0]!;
    assert.equal(step.error_code, code);
    if (!code) assert.equal(step.result.kicked, true);
    assert.equal(kickCalls, 1);
    assert.equal(auditCalls, 1);
  }
});
test("SEND_TIMEOUT retries with the same key read the eventual send without re-auditing", async () => {
  await reset();
  sendState = "unknown";
  let turns = 0;
  agentReply = async () => {
    turns++;
    if (turns === 2)
      await db.query("UPDATE messages SET delivery_status='sent' WHERE is_own");
    return turns <= 2
      ? use(`timeout-send-${turns}`, "send_message", {
          text: "once",
          idempotency_key: "timeout-key",
        })
      : end();
  };
  await inbound();
  await waitFor(async () => (await latestRun())?.status === "finished", 8000);
  const steps = (
    await db.query<{
      error_code: string | null;
      result: { deliveryStatus?: string };
    }>("SELECT error_code,result FROM agent_steps ORDER BY ordinal")
  ).rows;
  assert.equal(steps[0]!.error_code, "SEND_TIMEOUT");
  assert.equal(steps[1]!.result.deliveryStatus, "sent");
  assert.equal(enqueueCalls, 1);
  assert.equal(auditCalls, 1);
});
test("sequence roles prefer admin, choose the first member, and skip unavailable roles with a timestamp", async () => {
  await reset();
  await db.query("UPDATE groups SET agent_enabled=false");
  await db.query(
    `INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-4','account-4','member') ON CONFLICT DO NOTHING`,
    [groupId],
  );
  const definition = await api.inject({
    method: "POST",
    url: "/api/sequences",
    payload: {
      name: "roles",
      steps: [1, 2, 3].map((index) => ({
        index,
        accountRole: index === 1 ? "admin" : "member",
        text: "role test",
        delaySeconds: 0,
      })),
    },
  });
  const start = await api.inject({
    method: "POST",
    url: `/api/groups/${groupId}/sequence-runs`,
    payload: { sequenceId: definition.json<{ id: string }>().id },
  });
  const id = start.json<{ runId: string }>().runId;
  await module.tick();
  assert.equal(
    (await db.query<{ account_id: string }>("SELECT account_id FROM messages"))
      .rows[0]!.account_id,
    "account-2",
  );
  await db.query(
    "UPDATE messages SET delivery_status='sent',updated_at=now(),message_sent_observed_at=now()",
  );
  await module.tick();
  await module.tick();
  assert.equal(
    (
      await db.query<{ account_id: string }>(
        "SELECT account_id FROM messages ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0]!.account_id,
    "account-3",
  );
  await db.query(
    "UPDATE messages SET delivery_status='sent',updated_at=now(),message_sent_observed_at=now()",
  );
  await db.query(
    "UPDATE accounts SET status='disconnected' WHERE id IN ('account-3','account-4')",
  );
  await module.tick();
  await module.tick();
  const result = (await api.inject(`/api/sequence-runs/${id}`)).json<{
    status: string;
    steps: { status: string; sentAt: string | null }[];
  }>();
  assert.equal(result.status, "finished");
  assert.equal(result.steps[2]!.status, "skipped");
  assert.ok(result.steps[2]!.sentAt);
});

test("loss of the advisory-lock connection aborts a turn without saving a false protocol error", async () => {
  await reset();
  let release: (() => void) | undefined;
  let turns = 0;
  agentReply = async () => {
    turns++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return end("late after lost lock");
  };
  await inbound();
  await waitFor(async () => Boolean(release));
  const id = (await latestRun()).id;
  await terminateRunLock(id);
  await waitFor(async () =>
    Boolean(
      (
        await db.query<{ recovery_note: string }>(
          "SELECT recovery_note FROM agent_runs WHERE id=$1",
          [id],
        )
      ).rows[0]?.recovery_note,
    ),
  );
  release!();
  await delay(100);
  assert.equal(
    (await db.query("SELECT * FROM agent_steps WHERE run_id=$1", [id]))
      .rowCount,
    0,
  );
  assert.equal(turns, 1);
  assert.equal((await latestRun()).status, "running");
});
test("loss of a run lock during audit prevents old-worker effects and permits safe audit recovery", async () => {
  await reset();
  let firstRelease: (() => void) | undefined;
  let nextRelease: (() => void) | undefined;
  let turns = 0;
  agentReply = () =>
    ++turns === 1
      ? use("audit-lock", "send_message", {
          text: "only the new owner may enqueue",
          idempotency_key: "audit-lock",
        })
      : end();
  auditReply = async () => {
    await new Promise<void>((resolve) => {
      if (auditCalls === 1) firstRelease = resolve;
      else nextRelease = resolve;
    });
    return { verdict: "pass", reason: "approved" };
  };
  await inbound();
  await waitFor(async () => Boolean(firstRelease));
  const id = (await latestRun()).id;
  await terminateRunLock(id);
  await waitFor(async () => Boolean(nextRelease));
  firstRelease!();
  await delay(100);
  assert.equal(enqueueCalls, 0);
  nextRelease!();
  await waitFor(async () => (await latestRun())?.status === "finished");
  assert.equal(enqueueCalls, 1);
  assert.equal(auditCalls, 2);
  assert.equal(
    (await db.query("SELECT * FROM agent_steps WHERE error_code='BAD_JSON'"))
      .rowCount,
    0,
  );
});

test("kick budget exhaustion ends the run while retaining an uncertain non-replayable effect", async () => {
  await reset();
  kickWaitForAbort = true;
  await db.query("UPDATE groups SET auto_kick_enabled=true");
  const id = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,active_ms,step_count) VALUES($1,$2,59900,1)",
    [id, groupId],
  );
  await db.query(
    `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','budget-kick','kick_user',$2,'ready','pass')`,
    [
      id,
      JSON.stringify({
        platform_user_id: "external",
        reason: "slow external result",
      }),
    ],
  );
  await waitFor(async () => (await latestRun())?.status === "failed");
  assert.equal((await latestRun()).end_reason, "wall_clock");
  assert.equal(kickCalls, 1);
  const step = (
    await db.query<{
      state: string;
      is_error: boolean;
      error_code: string | null;
      result_summary: string;
    }>("SELECT * FROM agent_steps WHERE run_id=$1", [id])
  ).rows[0]!;
  assert.equal(step.state, "executing");
  assert.equal(step.is_error, false);
  assert.equal(step.error_code, null);
  assert.match(step.result_summary, /unknown/);
  assert.match(
    (await api.inject(`/api/agent-runs/${id}`)).json<{ recoveryNote: string }>()
      .recoveryNote,
    /unknown/,
  );
  await second.tick();
  assert.equal(kickCalls, 1);
});

test("a stale scheduler transaction cannot enqueue after its ownership connection is lost", async () => {
  await reset();
  await db.query("UPDATE groups SET agent_enabled=false");
  await module.recover!();
  const definition = await api.inject({
    method: "POST",
    url: "/api/sequences",
    payload: {
      name: "ownership loss",
      steps: [
        {
          index: 1,
          accountRole: "admin",
          text: "must wait after takeover",
          delaySeconds: 10,
        },
      ],
    },
  });
  const start = await api.inject({
    method: "POST",
    url: `/api/groups/${groupId}/sequence-runs`,
    payload: { sequenceId: definition.json<{ id: string }>().id },
  });
  const id = start.json<{ runId: string }>().runId;
  await db.query(
    "UPDATE sequence_steps SET scheduled_at=now()-interval '1 hour' WHERE run_id=$1",
    [id],
  );
  const blocker = await db.pool.connect();
  let released = false;
  const waitForBlocked = async (count: number): Promise<void> => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const active = (
        await db.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND state='active'`,
          [applicationName],
        )
      ).rows[0]!.count;
      if (active >= count) return;
      await delay(10);
    }
    throw new Error(
      `Expected ${count} transactions blocked behind this test's group row`,
    );
  };
  let oldTick: Promise<unknown> | undefined;
  let newRecovery: Promise<unknown> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
      groupId,
    ]);
    oldTick = module.tick().then(
      () => null,
      (error: unknown) => error,
    );
    await waitForBlocked(1);
    const killed = await db.query(
      `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended($1,0)>>32)&4294967295) AND objid::bigint=(hashtextextended($1,0)&4294967295) AND granted`,
      [`${schema}:automation:sequence-scheduler`],
    );
    assert.equal(
      killed.rowCount,
      1,
      "only this schema scheduler is terminated",
    );
    newRecovery = second.recover!().then(
      () => null,
      (error: unknown) => error,
    );
    await waitForBlocked(2);
    const resumedAt = Date.now();
    await blocker.query("COMMIT");
    released = true;
    const [staleResult, takeoverResult] = await Promise.all([
      oldTick,
      newRecovery,
    ]);
    assert.equal(takeoverResult, null);
    assert.ok(
      staleResult instanceof Error,
      "the stale transaction must reject",
    );
    const step = (
      await db.query<{ client_msg_id: string | null; scheduled_at: Date }>(
        "SELECT * FROM sequence_steps WHERE run_id=$1",
        [id],
      )
    ).rows[0]!;
    assert.equal(step.client_msg_id, null);
    assert.equal((await db.query("SELECT * FROM messages")).rowCount, 0);
    assert.equal(enqueueCalls, 0);
    assert.ok(
      step.scheduled_at.getTime() >= resumedAt + 9900,
      "takeover must rebase the pending step by its full delay",
    );
  } finally {
    if (!released) await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled(
      [oldTick, newRecovery].filter((work): work is Promise<unknown> =>
        Boolean(work),
      ),
    );
  }
});

test("closing and recreating modules preserves activity while excluding actual downtime", async () => {
  await reset();
  let release: (() => void) | undefined;
  let turns = 0;
  agentReply = async () => {
    if (++turns === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return use("before-shutdown", "get_recent_messages", { limit: 1 });
    }
    return end("resumed");
  };
  await inbound();
  for (let i = 0; i < 100 && !release; i++) {
    await module.tick();
    await delay(10);
  }
  assert.ok(release);
  await delay(200);
  const closing = module.close!();
  release();
  await closing;
  await second.close!();
  const before = (
    await db.query<{ id: string; active_ms: string; status: string }>(
      "SELECT id,active_ms,status FROM agent_runs",
    )
  ).rows[0]!;
  assert.equal(before.status, "running");
  assert.ok(Number(before.active_ms) >= 190);
  await delay(700);
  const context = {
    db,
    agent: new RemoteClient(remote.listeningOrigin),
    gateway: new RemoteClient(remote.listeningOrigin),
    log: api.log,
  };
  module = createAutomationModule(context, messaging);
  second = createAutomationModule(context, messaging);
  await module.recover!();
  await waitFor(async () => (await latestRun())?.status === "finished");
  const after = (
    await db.query<{ id: string; active_ms: string; status: string }>(
      "SELECT id,active_ms,status FROM agent_runs",
    )
  ).rows[0]!;
  assert.equal(after.id, before.id);
  assert.equal(turns, 2);
  const resumedActivity = Number(after.active_ms) - Number(before.active_ms);
  assert.ok(
    resumedActivity >= 0 && resumedActivity < 350,
    `downtime leaked into activity: ${resumedActivity}ms`,
  );
});

test("queued runs persist online activity across a real shutdown without counting downtime or a second clock", async () => {
  await reset();
  const groupIds = Array.from({ length: 5 }, () => `queued-${randomUUID()}`);
  const releases: (() => void)[] = [];
  let queuedRunId = "";
  agentReply = async () => {
    await new Promise<void>((resolve) => releases.push(resolve));
    return use(randomUUID(), "get_recent_messages", { limit: 1 });
  };
  try {
    for (const id of groupIds) {
      await db.query(
        "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES($1,$1,'account-1',true)",
        [id],
      );
      await db.query(
        "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES($1,$2,$1,'external',false,'queued budget')",
        [randomUUID(), id],
      );
    }
    await module.tick();
    for (let i = 0; i < 100 && releases.length !== 4; i++) await delay(10);
    assert.equal(releases.length, 4, "four execution slots must be occupied");
    queuedRunId = (
      await db.query<{ id: string }>(
        "SELECT id FROM agent_runs WHERE NOT inflight_turn AND step_count=0",
      )
    ).rows[0]!.id;
    await db.query("UPDATE agent_runs SET active_ms=58000 WHERE id=$1", [
      queuedRunId,
    ]);
    // A live second module may compete for the clock, but does not take execution slots.
    await second.recover!();
    const onlineStart = Date.now();
    await delay(1200);
    const sampled = (
      await db.query<{ active_ms: string; step_count: number }>(
        "SELECT active_ms,step_count FROM agent_runs WHERE id=$1",
        [queuedRunId],
      )
    ).rows[0]!;
    const consumed = Number(sampled.active_ms) - 58000;
    assert.ok(
      consumed >= 850,
      `queued online time was not persisted: ${consumed}ms`,
    );
    assert.ok(
      consumed <= Date.now() - onlineStart + 150,
      `activity counted twice: ${consumed}ms`,
    );
    assert.equal(sampled.step_count, 0);
    const closing = module.close!();
    releases.forEach((release) => release());
    await closing;
    await second.close!();
    const before = Number(
      (
        await db.query<{ active_ms: string }>(
          "SELECT active_ms FROM agent_runs WHERE id=$1",
          [queuedRunId],
        )
      ).rows[0]!.active_ms,
    );
    await delay(700);
    const context = {
      db,
      agent: new RemoteClient(remote.listeningOrigin),
      gateway: new RemoteClient(remote.listeningOrigin),
      log: api.log,
    };
    module = createAutomationModule(context, messaging);
    second = createAutomationModule(context, messaging);
    await module.recover!();
    const after = Number(
      (
        await db.query<{ active_ms: string }>(
          "SELECT active_ms FROM agent_runs WHERE id=$1",
          [queuedRunId],
        )
      ).rows[0]!.active_ms,
    );
    assert.ok(
      after >= before && after - before < 100,
      `recovery must preserve queued activity and exclude actual downtime: ${after - before}ms`,
    );
    agentReply = async (body) => {
      if (body.runId === queuedRunId) await delay(1500);
      return end("resumed");
    };
    const resumedAt = Date.now();
    await waitFor(
      async () =>
        !(await db.query("SELECT id FROM agent_runs WHERE status='running'"))
          .rowCount,
    );
    const result = (
      await db.query<{ status: string; end_reason: string }>(
        "SELECT status,end_reason FROM agent_runs WHERE id=$1",
        [queuedRunId],
      )
    ).rows[0]!;
    assert.equal(result.status, "failed");
    assert.equal(result.end_reason, "wall_clock");
    assert.ok(
      Date.now() - resumedAt < 1300,
      "queued run received a fresh budget after restart",
    );
  } finally {
    releases.forEach((release) => release());
    await module.close!();
    await second.close!();
  }
});

test("a follower cannot execute against a stale activity base while the new clock owner initializes", async () => {
  await reset();
  await module.recover!();
  const runId = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,active_ms) VALUES($1,$2,59000)",
    [runId, groupId],
  );
  await module.close!();
  await second.close!();
  const consumedBefore = Number(
    (
      await db.query<{ active_ms: string }>(
        "SELECT active_ms FROM agent_runs WHERE id=$1",
        [runId],
      )
    ).rows[0]!.active_ms,
  );
  await delay(1200);
  const context = {
    db,
    agent: new RemoteClient(remote.listeningOrigin),
    gateway: new RemoteClient(remote.listeningOrigin),
    log: api.log,
  };
  module = createAutomationModule(context, messaging);
  second = createAutomationModule(context, messaging);
  let turns = 0;
  agentReply = async () => {
    turns++;
    await delay(100);
    return end("remaining budget preserved");
  };
  const blocker = await db.pool.connect();
  let released = false;
  let ownerRecovery: Promise<void> | undefined;
  let followerTick: Promise<void> | undefined;
  try {
    await blocker.query("BEGIN");
    const blockerPid = (
      await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    await blocker.query("SELECT id FROM agent_runs WHERE id=$1 FOR UPDATE", [
      runId,
    ]);
    ownerRecovery = module.recover!();
    const ownerPid = await waitForInitializingClockOwner(blockerPid);
    let followerReturned = false;
    followerTick = second.tick().then(() => {
      followerReturned = true;
    });
    const followerPid = await waitForClockInitializationFollower(ownerPid);
    assert.notEqual(followerPid, ownerPid);
    const executedBeforeReady = Boolean(
      (
        await db.query(
          `SELECT pid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended($1,0)>>32)&4294967295) AND objid::bigint=(hashtextextended($1,0)&4294967295) AND granted`,
          [`agent:${runId}`],
        )
      ).rowCount,
    );
    const returnedBeforeReady = followerReturned;
    await blocker.query("COMMIT");
    released = true;
    await Promise.all([ownerRecovery, followerTick]);
    await waitFor(async () => (await latestRun()).status !== "running");
    const result = await latestRun();
    assert.equal(
      result.status,
      "finished",
      `follower exhausted the preserved budget: ${result.end_reason}`,
    );
    assert.equal(
      executedBeforeReady,
      false,
      "no Agent execution lock may be obtained before the shared clock is ready",
    );
    assert.equal(
      returnedBeforeReady,
      false,
      "follower start must wait for committed clock initialization",
    );
    assert.equal(turns, 1);
    const consumedAfter = Number(
      (
        await db.query<{ active_ms: string }>(
          "SELECT active_ms FROM agent_runs WHERE id=$1",
          [runId],
        )
      ).rows[0]!.active_ms,
    );
    assert.ok(
      consumedAfter >= consumedBefore && consumedAfter - consumedBefore < 600,
      `downtime or initialization barrier was billed: ${consumedAfter - consumedBefore}ms`,
    );
  } finally {
    if (!released) await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled(
      [ownerRecovery, followerTick].filter((work): work is Promise<void> =>
        Boolean(work),
      ),
    );
  }
});

test("an initialization follower takes over after the blocked clock owner connection is terminated", async () => {
  await reset();
  await module.recover!();
  const runId = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,active_ms) VALUES($1,$2,59000)",
    [runId, groupId],
  );
  await module.close!();
  await second.close!();
  const consumedBefore = Number(
    (
      await db.query<{ active_ms: string }>(
        "SELECT active_ms FROM agent_runs WHERE id=$1",
        [runId],
      )
    ).rows[0]!.active_ms,
  );
  await delay(1200);
  const context = {
    db,
    agent: new RemoteClient(remote.listeningOrigin),
    gateway: new RemoteClient(remote.listeningOrigin),
    log: api.log,
  };
  module = createAutomationModule(context, messaging);
  second = createAutomationModule(context, messaging);
  let turns = 0;
  agentReply = async () => {
    turns++;
    await delay(100);
    return end("clock takeover preserved remaining budget");
  };
  const blocker = await db.pool.connect();
  let released = false;
  let ownerOutcome: Promise<unknown> | undefined;
  let ownerClosing: Promise<void> | undefined;
  let followerTick: Promise<void> | undefined;
  try {
    await blocker.query("BEGIN");
    const blockerPid = (
      await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    await blocker.query("SELECT id FROM agent_runs WHERE id=$1 FOR UPDATE", [
      runId,
    ]);
    // Observe rejection immediately so terminating the connection cannot become an
    // unhandled rejection while the test inspects PostgreSQL's replacement owner.
    ownerOutcome = module.recover!().then(
      () => null,
      (error: unknown) => error,
    );
    const ownerPid = await waitForInitializingClockOwner(blockerPid);
    let followerReturned = false;
    followerTick = second.tick().then(() => {
      followerReturned = true;
    });
    const followerPid = await waitForClockInitializationFollower(ownerPid);
    assert.notEqual(followerPid, ownerPid);
    assert.equal(turns, 0);
    // Closing starts by disabling the old instance's timer. Its blocked startup
    // remains pending until the following kill, and cannot revive as a competitor.
    ownerClosing = module.close!();
    await Promise.resolve();
    const killed = (
      await db.query<{ killed: boolean }>(
        "SELECT pg_terminate_backend($1) AS killed",
        [ownerPid],
      )
    ).rows[0]!.killed;
    assert.equal(killed, true);
    const ownerError = await ownerOutcome;
    assert.ok(ownerError instanceof Error);
    assert.match(
      ownerError.message,
      /terminating connection|connection.*terminated/i,
    );
    await ownerClosing;
    const takeoverPid = await waitForInitializingClockOwner(blockerPid);
    assert.equal(
      takeoverPid,
      followerPid,
      "the follower proven to wait on init must become the new clock owner",
    );
    assert.equal(
      (await db.query("SELECT 1 FROM pg_locks WHERE pid=$1", [ownerPid]))
        .rowCount,
      0,
      "the terminated initialization transaction and all its locks must be released",
    );
    // Keep the confirmed replacement blocked long enough to detect billing from
    // BEGIN instead of the actual successful rebase, independently of downtime.
    await delay(650);
    assert.equal(followerReturned, false);
    assert.equal(turns, 0);
    assert.equal(
      (await db.query("SELECT 1 FROM agent_steps WHERE run_id=$1", [runId]))
        .rowCount,
      0,
    );
    assert.equal(
      Number(
        (
          await db.query<{ active_ms: string }>(
            "SELECT active_ms FROM agent_runs WHERE id=$1",
            [runId],
          )
        ).rows[0]!.active_ms,
      ),
      consumedBefore,
    );
    await blocker.query("COMMIT");
    released = true;
    await followerTick;
    await waitFor(async () => (await latestRun()).status !== "running");
    const result = await latestRun();
    assert.equal(result.status, "finished");
    assert.equal(result.end_reason, "final");
    assert.equal(
      turns,
      1,
      "initialization recovery must not execute the Agent twice",
    );
    assert.equal(
      (await db.query("SELECT 1 FROM agent_steps WHERE run_id=$1", [runId]))
        .rowCount,
      1,
    );
    const consumedAfter = Number(
      (
        await db.query<{ active_ms: string }>(
          "SELECT active_ms FROM agent_runs WHERE id=$1",
          [runId],
        )
      ).rows[0]!.active_ms,
    );
    assert.ok(
      consumedAfter >= consumedBefore && consumedAfter - consumedBefore < 600,
      `downtime or blocked takeover was charged: ${consumedAfter - consumedBefore}ms`,
    );
  } finally {
    if (!released) await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled(
      [ownerOutcome, ownerClosing, followerTick].filter(
        (work) => work !== undefined,
      ),
    );
    await module.close!();
    await second.close!();
  }
});

test("frequent activity samples retain subinterval time instead of losing rounded milliseconds", async () => {
  await reset();
  await module.recover!();
  const runId = randomUUID();
  const initial = (
    await db.query<{ activity_updated_at: Date }>(
      "INSERT INTO agent_runs(id,group_id) VALUES($1,$2) RETURNING activity_updated_at",
      [runId, groupId],
    )
  ).rows[0]!.activity_updated_at;
  for (let i = 0; i < 40; i++) await module.recover!();
  const sample = (
    await db.query<{ active_ms: string; activity_updated_at: Date }>(
      "SELECT active_ms,activity_updated_at FROM agent_runs WHERE id=$1",
      [runId],
    )
  ).rows[0]!;
  assert.ok(sample.activity_updated_at.getTime() > initial.getTime());
  assert.equal(
    Number(sample.active_ms),
    sample.activity_updated_at.getTime() - initial.getTime(),
  );
});

test("activity clock survives loss of its own PostgreSQL session and only bills once after takeover", async () => {
  await reset();
  await module.recover!();
  const runId = randomUUID();
  await db.query("INSERT INTO agent_runs(id,group_id) VALUES($1,$2)", [
    runId,
    groupId,
  ]);
  await delay(750);
  const before = Number(
    (
      await db.query<{ active_ms: string }>(
        "SELECT active_ms FROM agent_runs WHERE id=$1",
        [runId],
      )
    ).rows[0]!.active_ms,
  );
  assert.ok(before >= 400 && before < 800);
  const killed = await db.query(
    `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295) AND objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND granted`,
  );
  assert.equal(
    killed.rowCount,
    1,
    "terminate only this schema's activity clock owner",
  );
  await second.recover!();
  await delay(750);
  const after = Number(
    (
      await db.query<{ active_ms: string }>(
        "SELECT active_ms FROM agent_runs WHERE id=$1",
        [runId],
      )
    ).rows[0]!.active_ms,
  );
  assert.ok(after - before >= 400, "new owner did not resume the clock");
  assert.ok(after - before < 800, "multiple owners charged activity twice");
  const owners = await db.query(
    `SELECT pid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid::bigint=((hashtextextended(current_schema()||':automation:activity-clock',0)>>32)&4294967295) AND objid::bigint=(hashtextextended(current_schema()||':automation:activity-clock',0)&4294967295) AND granted`,
  );
  assert.equal(owners.rowCount, 1);
});

const realTiming = process.env.AUTOMATION_TIMING_TESTS === "1";
test("inconclusive audit step and blocked run roll back together before recovery", async () => {
  await reset();
  let turns = 0;
  agentReply = () =>
    ++turns === 1
      ? use("uncertain-audit", "send_message", {
          text: "must not send",
          idempotency_key: "blocked",
        })
      : end();
  auditReply = () => ({ verdict: "maybe" });
  await db.query(
    "CREATE FUNCTION reject_audit_block() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='blocked' THEN RAISE EXCEPTION 'injected block persistence failure'; END IF; RETURN NEW; END $$",
  );
  await db.query(
    "CREATE TRIGGER reject_audit_block BEFORE UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION reject_audit_block()",
  );
  try {
    await inbound();
    await module.tick();
    const deadline = Date.now() + 3000;
    while (auditCalls < 3 && Date.now() < deadline) await delay(10);
    assert.equal(auditCalls, 3);
    await module.close!();
    const saved = (
      await db.query<{ state: string }>(
        "SELECT state FROM agent_steps WHERE tool_use_id='uncertain-audit'",
      )
    ).rows[0]!;
    assert.equal(
      saved.state,
      "auditing",
      "a failed blocked commit must not persist a completed tool step",
    );
    assert.equal((await latestRun()).status, "running");
  } finally {
    await db.query("DROP TRIGGER reject_audit_block ON agent_runs");
    await db.query("DROP FUNCTION reject_audit_block()");
  }
  module = createAutomationModule(
    {
      db,
      agent: new RemoteClient(remote.listeningOrigin),
      gateway: new RemoteClient(remote.listeningOrigin),
      log: api.log,
    },
    messaging,
  );
  await waitFor(async () => (await latestRun())?.status === "blocked");
  assert.equal((await latestRun()).end_reason, "audit_blocked");
  assert.equal(turns, 1);
  assert.equal(auditCalls, 3);
  assert.equal(enqueueCalls, 0);
});

test("persisted legacy audit-block window cannot resume another Agent turn", async () => {
  await reset();
  let turns = 0;
  agentReply = () => {
    turns++;
    return end();
  };
  const id = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,group_id,step_count) VALUES($1,$2,1)",
    [id, groupId],
  );
  await db.query(
    "INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_attempts,is_error,error_code) VALUES($1,1,'tool_use','legacy-audit','send_message',$2,'complete',3,true,'AUDIT_REJECTED')",
    [id, JSON.stringify({ text: "blocked", idempotency_key: "legacy" })],
  );
  await waitFor(async () => (await latestRun())?.status !== "running");
  assert.equal((await latestRun()).status, "blocked");
  assert.equal((await latestRun()).end_reason, "audit_blocked");
  assert.equal(turns, 0);
  assert.equal(enqueueCalls, 0);
});

test(
  "timing: the default twelve-second turn timeout discards the late response",
  { skip: !realTiming },
  async () => {
    await reset();
    let turns = 0;
    agentReply = async () => {
      turns++;
      if (turns === 1) {
        await delay(13200);
        return end("late first response");
      }
      return end("after timeout");
    };
    const started = Date.now();
    await inbound();
    await waitFor(
      async () => (await latestRun())?.status === "finished",
      16000,
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 11900 && elapsed < 15500, `elapsed ${elapsed}ms`);
    const steps = (
      await db.query<{ kind: string; error_code: string }>(
        "SELECT kind,error_code FROM agent_steps ORDER BY ordinal",
      )
    ).rows;
    assert.equal(steps[0]!.error_code, "TURN_TIMEOUT");
    assert.equal(steps[1]!.kind, "final");
    assert.equal(turns, 2);
    await delay(1400);
    assert.equal((await db.query("SELECT * FROM agent_steps")).rowCount, 2);
  },
);
test(
  "timing: three five-second inconclusive audit attempts block without sending",
  { skip: !realTiming },
  async () => {
    await reset();
    agentReply = () =>
      use("slow-audit", "send_message", {
        text: "no audit approval in time",
        idempotency_key: "slow-audit",
      });
    auditReply = async () => {
      await delay(6200);
      return { verdict: "pass", reason: "too late" };
    };
    const started = Date.now();
    await inbound();
    await waitFor(async () => (await latestRun())?.status === "blocked", 19000);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 14900 && elapsed < 18500, `elapsed ${elapsed}ms`);
    assert.equal(auditCalls, 3);
    assert.equal(enqueueCalls, 0);
    assert.equal((await latestRun()).end_reason, "audit_blocked");
    await delay(1400);
    assert.equal(enqueueCalls, 0);
  },
);
test(
  "timing: sixty seconds of activity ends the run even below the twelve-step cap",
  { skip: !realTiming },
  async () => {
    await reset();
    let turns = 0;
    agentReply = async () => {
      const id = `slow-read-${++turns}`;
      await delay(8000);
      return use(id, "get_recent_messages", { limit: 1 });
    };
    const started = Date.now();
    await inbound();
    await waitFor(async () => (await latestRun())?.status === "failed", 66000);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 59500 && elapsed < 65000, `elapsed ${elapsed}ms`);
    const run = await latestRun();
    assert.equal(run.end_reason, "wall_clock");
    assert.ok(turns < 12);
    assert.equal(
      (
        await db.query<{ error_code: string }>(
          "SELECT error_code FROM agent_steps ORDER BY ordinal DESC LIMIT 1",
        )
      ).rows[0]!.error_code,
      "TURN_TIMEOUT",
    );
  },
);
