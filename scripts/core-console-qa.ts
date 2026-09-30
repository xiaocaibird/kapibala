/** Finite isolated console QA: real modules/simulators, transport fault injection only. */
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { createServer, type ViteDevServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { z } from "zod";
import { Database } from "../apps/server/src/core/db.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { changeAccount } from "../apps/server/src/modules/gateway/state.js";
import { createGatewaySimulator } from "../apps/simulator/src/gateway.js";
import { createAgentSimulator } from "../apps/simulator/src/agent.js";
import { migrate } from "./migrate.js";
import type { AgentRun, Group, Job } from "../packages/contracts/src/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const dbName = `core_console_qa_${randomUUID().replaceAll("-", "")}`;
const base = new URL(
  process.env.QA_DATABASE_URL ??
    "postgres://kapibala:kapibala@localhost:55432/kapibala",
);
const adminURL = new URL(base);
adminURL.pathname = "/postgres";
const admin = new Database(adminURL.toString());
base.pathname = `/${dbName}`;
const db = new Database(base.toString());
const metadata: Record<string, unknown> = {
  pid: process.pid,
  dbName,
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  status: "starting",
  startedAt: new Date().toISOString(),
};
let app: FastifyInstance | undefined,
  gateway: FastifyInstance | undefined,
  agent: FastifyInstance | undefined;
let vite: ViteDevServer | undefined, directory: string | undefined;
let created = false,
  stopping = false,
  internalToken = "";
let mainGroup: Group;
const groups: Record<string, Group> = {};
const runs: Record<string, AgentRun> = {};
const controls = {
  outage: false,
  holdRefresh: false,
  holdNextEarlier: false,
  releaseEarlier: true,
  failTimelineCount: 0,
};
const marks: Record<string, unknown> = {};
const http: {
  method: string;
  path: string;
  startedAt: number;
  finishedAt?: number;
  status?: number;
}[] = [];
const writes: {
  method: string;
  path: string;
  at: number;
  role?: string;
  username?: string;
  body: unknown;
  status?: number;
}[] = [];
const ws: {
  type: string;
  at: number;
  seq?: number;
  sinceSeq?: number;
  code?: number;
}[] = [];
let refreshCount = 0,
  heldRefresh = 0,
  heldEarlier = 0,
  timelineFailures = 0;
let restoreTimer: ReturnType<typeof setTimeout> | undefined;
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const controlSchema = z
  .object({
    outage: z.boolean().optional(),
    holdRefresh: z.boolean().optional(),
    holdNextEarlier: z.boolean().optional(),
    releaseEarlier: z.boolean().optional(),
    failTimelineCount: z.number().int().min(0).max(10).optional(),
    restoreAfterMs: z.number().int().min(100).max(30_000).optional(),
  })
  .strict();
async function save() {
  await mkdir(join(root, ".runtime"), { recursive: true });
  await writeFile(
    join(root, ".runtime/core-console-qa.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
}
async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeout = 20000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - start > timeout) throw new Error("QA condition timed out");
    await pause(50);
  }
}
async function loginInternal() {
  const result = await app!.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "admin" },
  });
  internalToken = result.json<{ accessToken: string }>().accessToken;
}
async function api<T>(
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: object,
): Promise<T> {
  const response = await app!.inject({
    method,
    url,
    headers: { authorization: `Bearer ${internalToken}` },
    ...(payload ? { payload } : {}),
  });
  if (response.statusCode >= 400)
    throw new Error(`${method} ${url}: ${response.body}`);
  return response.json<T>();
}
async function remote<T>(
  server: FastifyInstance,
  path: string,
  body: object,
): Promise<T> {
  const result = await server.inject({
    method: "POST",
    url: path,
    payload: body,
  });
  if (result.statusCode >= 400) throw new Error(result.body);
  return result.json<T>();
}
async function makeGroup(name: string) {
  const { jobId } = await api<{ jobId: string }>("POST", "/api/groups", {
    creatorAccountId: "account-1",
    memberAccountIds: ["account-2", "account-3", "account-4"],
    name,
  });
  const job = await until(
    () => api<Job>("GET", `/api/jobs/${jobId}`),
    (value) => value.status !== "running",
  );
  if (job.status !== "finished") throw new Error(JSON.stringify(job));
  const group = (await api<Group[]>("GET", "/api/groups")).find(
    (group) => group.name === name,
  );
  if (!group) throw new Error("Created group missing");
  return group;
}
async function publish(
  group: Group,
  prefix: string,
  count: number,
  historical = false,
  duplicates = false,
) {
  const published: { msgId: string; sentAt: string; text: string }[] = [];
  const time = historical ? Date.parse("2020-01-01T00:00:00Z") : Date.now();
  marks.publishStartedAt = Date.now();
  for (let index = 0; index < count; index++) {
    const result = await remote<{
      msgId: string;
      sentAt: string;
      text: string;
    }>(gateway!, "/__control/message", {
      groupId: group.gatewayGroupId,
      text: `${prefix}-${String(index + 1).padStart(3, "0")}`,
      sentAt: new Date(time + index).toISOString(),
      senderPlatformUserId: "qa-external",
    });
    published.push(result);
    if (duplicates)
      await remote(gateway!, "/__control/message", {
        groupId: group.gatewayGroupId,
        ...result,
        senderPlatformUserId: "qa-external",
      });
  }
  await until(
    () =>
      db.query<{ count: string }>(
        "SELECT count(*) FROM messages WHERE group_id=$1 AND msg_id=ANY($2::text[])",
        [group.id, published.map((item) => item.msgId)],
      ),
    (value) => Number(value.rows[0]?.count) === count,
  );
  marks.eventsCommittedBy = Date.now();
  marks.latestPublish = published;
  marks.latestEvent = (
    await db.query(
      "SELECT seq,type,created_at FROM events ORDER BY seq DESC LIMIT 1",
    )
  ).rows[0];
  return published;
}
async function state() {
  return {
    metadata,
    controls,
    marks,
    counters: { refreshCount, heldRefresh, heldEarlier, timelineFailures },
    http,
    writes,
    ws,
    groups,
    runs,
    messages: mainGroup
      ? (
          await db.query(
            "SELECT id,msg_id,client_msg_id,account_id,text,sent_at,delivery_status FROM messages WHERE group_id=$1 ORDER BY sent_at,id",
            [mainGroup.id],
          )
        ).rows
      : [],
    accounts: (
      await db.query(
        "SELECT id,status,rate_limited_until FROM accounts ORDER BY id",
      )
    ).rows,
    eventTail: (
      await db.query(
        "SELECT seq,type,payload,created_at FROM events ORDER BY seq DESC LIMIT 8",
      )
    ).rows,
  };
}
async function stop() {
  if (stopping) return;
  stopping = true;
  controls.holdRefresh = false;
  controls.releaseEarlier = true;
  clearTimeout(restoreTimer);
  const errors: string[] = [];
  for (const socket of app?.websocketServer.clients ?? [])
    socket.close(1001, "QA cleanup");
  for (const close of [
    () => vite?.close(),
    () => app?.close(),
    () => gateway?.close(),
    () => agent?.close(),
    () => db.close(),
  ]) {
    try {
      await close();
    } catch (error) {
      errors.push(String(error));
    }
  }
  try {
    if (created) await admin.query(`DROP DATABASE ${dbName} WITH (FORCE)`);
  } catch (error) {
    errors.push(String(error));
  }
  await admin.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  Object.assign(metadata, {
    status: "stopped",
    stoppedAt: new Date().toISOString(),
    cleanupErrors: errors,
  });
  await save();
  process.exitCode = errors.length ? 1 : 0;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void stop();
  });
try {
  await admin.query(`CREATE DATABASE ${dbName}`);
  created = true;
  await migrate(db);
  directory = await mkdtemp(join(tmpdir(), "kapibala-core-console-qa-"));
  gateway = createGatewaySimulator(join(directory, "gateway.json"));
  agent = createAgentSimulator(join(directory, "agent.json"));
  const gatewayURL = await gateway.listen({ host: "127.0.0.1", port: 0 });
  const agentURL = await agent.listen({ host: "127.0.0.1", port: 0 });
  process.env.GATEWAY_URL = gatewayURL;
  process.env.AGENT_URL = agentURL;
  await remote(gateway, "/__control/config", {
    joinDelayMs: 0,
    sendDelayMs: 150,
  });
  app = await createApp({
    db,
    logger: false,
    modules: (ctx) => {
      const messaging = createGatewayModule(ctx);
      return [
        {
          async tick() {},
          async register(server) {
            server.get("/__qa/state", state);
            server.post("/__qa/control", async (request) => {
              const { restoreAfterMs, ...input } = controlSchema.parse(
                request.body,
              );
              if (
                input.outage !== undefined &&
                input.outage !== controls.outage
              ) {
                marks[
                  input.outage ? "outageStartedAt" : "transportRestoredAt"
                ] = Date.now();
                if (input.outage)
                  for (const socket of server.websocketServer.clients)
                    socket.close(1012, "QA transport outage");
              }
              Object.assign(controls, input);
              if (restoreAfterMs !== undefined) {
                clearTimeout(restoreTimer);
                marks.restoreScheduledAt = Date.now();
                marks.restoreAfterMs = restoreAfterMs;
                restoreTimer = setTimeout(() => {
                  controls.outage = false;
                  marks.transportRestoredAt = Date.now();
                }, restoreAfterMs);
              }
              return state();
            });
            server.post("/__qa/reset-metrics", async () => {
              http.length = 0;
              writes.length = 0;
              ws.length = 0;
              refreshCount = heldRefresh = heldEarlier = timelineFailures = 0;
              for (const key of Object.keys(marks)) delete marks[key];
              return state();
            });
            server.post("/__qa/expire-access", async (request) => {
              const { username } = z
                .object({
                  username: z.enum(["admin", "viewer"]).default("admin"),
                })
                .parse(request.body ?? {});
              controls.holdRefresh = true;
              marks.accessExpiredAt = Date.now();
              const result = await db.query(
                "UPDATE auth_tokens t SET expires_at=now()-interval '1 second' FROM auth_sessions s WHERE s.id=t.session_id AND t.kind='access' AND s.username=$1 AND t.token_hash<>$2",
                [
                  username,
                  createHash("sha256").update(internalToken).digest("hex"),
                ],
              );
              return { updated: result.rowCount, ...(await state()) };
            });
            server.post("/__qa/publish", async (request) => {
              const input = z
                .object({
                  count: z.number().int().min(1).max(150).default(1),
                  prefix: z.string().min(1),
                  historical: z.boolean().default(false),
                  duplicates: z.boolean().default(false),
                })
                .parse(request.body);
              const published = await publish(
                mainGroup,
                input.prefix,
                input.count,
                input.historical,
                input.duplicates,
              );
              return { published, ...(await state()) };
            });
            server.post("/__qa/group-setting", async (request) => {
              const input = z
                .object({ autoKickEnabled: z.boolean() })
                .parse(request.body);
              const result = await api<Group>(
                "PATCH",
                `/api/groups/${mainGroup.id}`,
                input,
              );
              marks.groupChangedCommittedBy = Date.now();
              return { group: result, ...(await state()) };
            });
            server.post("/__qa/sender", async (request) => {
              const { accountId, action } = z
                .object({
                  accountId: z.enum([
                    "account-1",
                    "account-2",
                    "account-3",
                    "account-4",
                  ]),
                  action: z.enum([
                    "disconnect",
                    "connect",
                    "rate-limit",
                    "clear-rate-limit",
                  ]),
                })
                .parse(request.body);
              if (action === "disconnect")
                await api("POST", `/api/accounts/${accountId}/transition`, {
                  to: "disconnected",
                  expectedFrom: "online",
                });
              else if (action === "connect")
                await api("POST", `/api/accounts/${accountId}/connect`, {});
              else if (action === "rate-limit") {
                await db.transaction((tx) =>
                  changeAccount(
                    tx,
                    accountId,
                    "rate_limited",
                    undefined,
                    new Date(Date.now() + 60_000),
                  ),
                );
                marks.rateLimitPrecondition =
                  "Isolated DB uses production changeAccount with 60-second deadline; gateway untouched";
              } else
                await db.query(
                  "UPDATE accounts SET rate_limited_until=now() WHERE id=$1 AND status='rate_limited'",
                  [accountId],
                );
              return state();
            });
            server.post("/__qa/agent-scenario", async (request) => {
              const { scenario } = z
                .object({ scenario: z.enum(["blocked", "protocol"]) })
                .parse(request.body);
              const group = await makeGroup(`CG19 ${scenario}`);
              groups[scenario] = group;
              const finish = {
                body: {
                  stop_reason: "tool_use",
                  content: [
                    {
                      type: "tool_use",
                      id: "qa-finish",
                      name: "finish",
                      input: { summary: "协议错误后合法完成" },
                    },
                  ],
                },
              };
              await remote(
                agent!,
                "/__control/config",
                scenario === "blocked"
                  ? {
                      turnScript: [
                        {
                          body: {
                            stop_reason: "tool_use",
                            content: [
                              {
                                type: "tool_use",
                                id: "qa-blocked-send",
                                name: "send_message",
                                input: {
                                  text: "CG19 blocked 不应发送",
                                  idempotency_key: "cg19-blocked",
                                },
                              },
                            ],
                          },
                        },
                      ],
                      auditScript: [
                        { status: 503, body: {} },
                        { status: 503, body: {} },
                        { status: 503, body: {} },
                      ],
                    }
                  : {
                      turnScript: [{ raw: "{CG19 malformed response" }, finish],
                      auditScript: [],
                    },
              );
              await api("PATCH", `/api/groups/${group.id}`, {
                agentEnabled: true,
              });
              await publish(group, `CG19-${scenario}-trigger`, 1);
              const run = await until(
                async () =>
                  (
                    await api<AgentRun[]>(
                      "GET",
                      `/api/groups/${group.id}/agent-runs`,
                    )
                  )[0],
                (value) => !!value && value.status !== "running",
              );
              runs[scenario] = await api<AgentRun>(
                "GET",
                `/api/agent-runs/${run!.id}`,
              );
              await api("PATCH", `/api/groups/${group.id}`, {
                agentEnabled: false,
              });
              await remote(agent!, "/__control/config", {
                turnScript: [],
                auditScript: [],
              });
              return {
                run: runs[scenario],
                url: `${metadata.url}/#/agent-runs/${run!.id}`,
                ...(await state()),
              };
            });
            server.addHook("onRequest", async (request, reply) => {
              if (request.url.startsWith("/ws") && controls.outage)
                return reply.code(503).send({ error: "QA websocket outage" });
            });
            server.addHook("preHandler", async (request, reply) => {
              if (
                request.headers["x-qa-browser"] !== "1" ||
                !["POST", "PATCH"].includes(request.method) ||
                request.url.startsWith("/api/auth/")
              )
                return;
              const record = {
                method: request.method,
                path: request.url,
                at: Date.now(),
                role: request.identity?.role,
                username: request.identity?.username,
                body: request.body,
                status: undefined as number | undefined,
              };
              writes.push(record);
              reply.raw.once("finish", () => {
                record.status = reply.raw.statusCode;
              });
            });
            server.addHook("onSend", async (request, _reply, payload) => {
              if (
                request.headers["x-qa-browser"] === "1" &&
                request.url.includes("/messages?") &&
                request.url.includes("before=") &&
                controls.holdNextEarlier
              ) {
                controls.holdNextEarlier = false;
                controls.releaseEarlier = false;
                heldEarlier++;
                marks.earlierResponseCapturedAt = Date.now();
                while (!controls.releaseEarlier && !stopping) await pause(20);
                marks.earlierResponseReleasedAt = Date.now();
              }
              return payload;
            });
          },
        },
        messaging,
        createAutomationModule(ctx, messaging),
      ];
    },
  });
  app.websocketServer.on("connection", (socket) => {
    ws.push({ type: "connected", at: Date.now() });
    socket.on("message", (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as {
          type?: string;
          sinceSeq?: number;
        };
        if (parsed.type === "auth")
          ws.push({
            type: "auth-received",
            at: Date.now(),
            sinceSeq: parsed.sinceSeq,
          });
      } catch {}
    });
    socket.on("close", (code) =>
      ws.push({ type: "closed", at: Date.now(), code }),
    );
    const originalSend = socket.send.bind(socket);
    socket.send = ((...args: Parameters<typeof socket.send>) => {
      try {
        const parsed = JSON.parse(String(args[0])) as {
          type: string;
          seq?: number;
        };
        ws.push({
          type: parsed.type,
          at: Date.now(),
          ...(parsed.seq !== undefined ? { seq: parsed.seq } : {}),
        });
      } catch {}
      return originalSend(...args);
    }) as typeof socket.send;
  });
  const serverURL = await app.listen({ host: "127.0.0.1", port: 0 });
  await loginInternal();
  for (let i = 1; i <= 4; i++)
    await api("POST", `/api/accounts/account-${i}/connect`, {});
  mainGroup = await makeGroup("CG12 时间线与重连验收");
  groups.timeline = mainGroup;
  await publish(mainGroup, "CG12-seed", 125, false);
  // The seeded timestamps precede the later test events; initial dataset is real gateway ingestion.
  const transport: Plugin = {
    name: "isolated-qa-transport",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url ?? "";
        if (!path.startsWith("/api/")) return next();
        request.headers["x-qa-browser"] = "1";
        const record = {
          method: request.method ?? "GET",
          path,
          startedAt: Date.now(),
          finishedAt: undefined as number | undefined,
          status: undefined as number | undefined,
        };
        http.push(record);
        response.once("finish", () => {
          record.finishedAt = Date.now();
          record.status = response.statusCode;
        });
        if (path === "/api/auth/refresh") {
          refreshCount++;
          if (controls.holdRefresh) heldRefresh++;
          while (controls.holdRefresh && !stopping) await pause(20);
        }
        if (
          controls.outage ||
          (path.includes("/messages") && controls.failTimelineCount > 0)
        ) {
          if (!controls.outage) {
            controls.failTimelineCount--;
            timelineFailures++;
            marks.lastTimelineFailureAt = Date.now();
          }
          response.statusCode = 503;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              error: {
                code: "QA_TRANSPORT_UNAVAILABLE",
                message: "独立验证中的暂时传输故障",
              },
            }),
          );
          return;
        }
        next();
      });
    },
  };
  vite = await createServer({
    configFile: false,
    root: join(root, "apps/web"),
    plugins: [transport, react()],
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      proxy: {
        "/api": { target: serverURL },
        "/ws": { target: serverURL.replace("http:", "ws:"), ws: true },
      },
    },
  });
  await vite.listen();
  const address = vite.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing Vite port");
  Object.assign(metadata, {
    status: "ready",
    url: `http://127.0.0.1:${address.port}`,
    serverURL,
    gatewayURL,
    agentURL,
    temporaryDirectory: directory,
    groupId: mainGroup.id,
    initialMessages: 125,
    controls: [
      "control",
      "reset-metrics",
      "expire-access",
      "publish",
      "group-setting",
      "sender",
      "agent-scenario",
    ],
  });
  await save();
  console.log(JSON.stringify(metadata));
} catch (error) {
  console.error(error);
  await stop();
  process.exitCode = 1;
}
