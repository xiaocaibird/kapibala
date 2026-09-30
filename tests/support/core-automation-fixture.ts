import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { createApp } from "../../apps/server/src/app.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import type { ConversationMessage } from "../../apps/server/src/modules/automation/protocol.js";
import type {
  RunRow,
  StepRow,
} from "../../apps/server/src/modules/automation/types.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "./temporary-database.js";

export interface TurnRequest {
  runId: string;
  tools: { name: string; input_schema: { required: string[] } }[];
  messages: ConversationMessage[];
}
export const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function until(predicate: () => Promise<boolean>, timeout = 3000) {
  const deadline = Date.now() + timeout;
  do {
    if (await predicate()) return;
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error(`Condition did not become true within ${timeout}ms`);
}
export function tool(id: string, name: string, input: unknown) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
  };
}
export function end(text = "done") {
  return { stop_reason: "end_turn", content: [{ type: "text", text }] };
}

export async function automationFixture(
  t: TestContext,
  turnTimeoutMs?: number,
  configureRemote?: (remote: FastifyInstance) => void,
) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  t.diagnostic(
    `Independent database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled,auto_kick_enabled) VALUES('g','remote-g','account-1',true,true)",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-1','account-1','creator'),('g','account-2','account-2','admin'),('g','account-3','account-3','member')",
  );
  const handlers: {
    turn: (body: TurnRequest) => unknown | Promise<unknown>;
    audit: (body: {
      text: string;
      groupId: string;
    }) => unknown | Promise<unknown>;
  } = {
    turn: () => end(),
    audit: () => ({ verdict: "pass", reason: "allowed" }),
  };
  const turns: TurnRequest[] = [];
  const audits: { text: string; groupId: string }[] = [];
  const gatewayRequests: string[] = [];
  const remote = Fastify({ logger: false, forceCloseConnections: true });
  temporary.onCleanup(() => remote.close());
  remote.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/agent/")) gatewayRequests.push(request.url);
  });
  remote.post("/agent/turn", async (request) => {
    const body = request.body as TurnRequest;
    turns.push(body);
    return handlers.turn(body);
  });
  remote.post("/agent/audit", async (request) => {
    const body = request.body as { text: string; groupId: string };
    audits.push(body);
    return handlers.audit(body);
  });
  configureRemote?.(remote);
  await remote.listen({ host: "127.0.0.1", port: 0 });
  let ctx!: AppContext;
  let automation!: ReturnType<typeof createAutomationModule>;
  const previousTimeout = process.env.AGENT_TURN_TIMEOUT_MS;
  if (turnTimeoutMs !== undefined)
    process.env.AGENT_TURN_TIMEOUT_MS = String(turnTimeoutMs);
  let app: Awaited<ReturnType<typeof createApp>>;
  try {
    app = await createApp({
      db,
      logger: false,
      background: false,
      modules: (context) => {
        ctx = {
          ...context,
          agent: new RemoteClient(remote.listeningOrigin),
          gateway: new RemoteClient(remote.listeningOrigin),
        };
        const gateway = createGatewayModule(ctx);
        automation = createAutomationModule(ctx, gateway);
        return [gateway, automation];
      },
    });
  } finally {
    if (previousTimeout === undefined) delete process.env.AGENT_TURN_TIMEOUT_MS;
    else process.env.AGENT_TURN_TIMEOUT_MS = previousTimeout;
  }
  temporary.onCleanup(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "admin" },
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json<{ accessToken: string }>().accessToken;
  async function api(
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: unknown,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload: payload as never }),
    });
  }
  async function inbound(
    text = "trigger",
    sentAt = new Date().toISOString(),
    own = false,
  ) {
    const id = randomUUID();
    await db.query(
      "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) VALUES($1,'g',$1,$2,$3,$4,$5)",
      [id, own ? "account-1" : "external", own, text, sentAt],
    );
    return {
      msgId: id,
      senderPlatformUserId: own ? "account-1" : "external",
      text,
      sentAt,
    };
  }
  async function readRun(id: string) {
    return (
      await db.query<RunRow>("SELECT * FROM agent_runs WHERE id=$1", [id])
    ).rows[0]!;
  }
  async function steps(id: string) {
    return (
      await db.query<StepRow>(
        "SELECT * FROM agent_steps WHERE run_id=$1 ORDER BY ordinal",
        [id],
      )
    ).rows;
  }
  async function start() {
    await automation.tick();
    const row = (
      await db.query<{ id: string }>(
        "SELECT id FROM agent_runs ORDER BY created_at,id LIMIT 1",
      )
    ).rows[0];
    assert.ok(row, "inbound messages must create a run");
    return row.id;
  }
  async function complete(id: string, timeout = 3000) {
    await until(async () => (await readRun(id)).status !== "running", timeout);
    return readRun(id);
  }
  return {
    ...temporary,
    db,
    ctx,
    app,
    api,
    remote,
    automation,
    handlers,
    turns,
    audits,
    gatewayRequests,
    inbound,
    readRun,
    steps,
    start,
    complete,
  };
}
