import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { createRuntimeObservationController } from "../../scripts/qa-runtime-observation/controller.js";
import {
  protocol,
  type RuntimeRequest,
} from "../../scripts/qa-runtime-observation/protocol.js";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";
import type { Target } from "../../scripts/qa-capacity/protocol.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "./temporary-database.js";
import { until } from "./core-automation-fixture.js";

export async function runtimeFixture(
  t: TestContext,
  normal = false,
  options: {
    entry?: string;
    configureRemote?: (remote: FastifyInstance) => void;
    extraEnv?: Record<string, string>;
  } = {},
) {
  assert.ok(
    process.env.DATABASE_URL,
    "Explicit disposable PostgreSQL required",
  );
  const temporary = await temporaryDatabase(t);
  await migrate(temporary.db);
  const directory = await mkdtemp("/tmp/kap-run-");
  temporary.onCleanup(() => rm(directory, { recursive: true }));
  const remote = Fastify({ logger: false, forceCloseConnections: true });
  temporary.onCleanup(() => remote.close());
  let connects = 0;
  let disconnects = 0;
  remote.post("/accounts/:id/connect", (request) => {
    connects++;
    return { platformUserId: (request.params as { id: string }).id };
  });
  remote.post("/accounts/:id/disconnect", () => {
    disconnects++;
    return { disconnected: true };
  });
  remote.get("/events", (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    reply.raw.write(": runtime observation fixture\n\n");
  });
  options.configureRemote?.(remote);
  await remote.listen({ host: "127.0.0.1", port: 0 });
  const controller = await createRuntimeObservationController(directory);
  await controller.listen({ host: "127.0.0.1", port: 0 });
  temporary.onCleanup(() => controller.close());
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const apiUrl = `http://127.0.0.1:${port}`;
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const token = randomUUID();
  let guardian: ChildProcess | undefined;
  let output = "";
  let accessToken = "";
  const guardianCode = `const {spawn}=require('node:child_process');const keep=setInterval(()=>{},1000);process.on('SIGTERM',()=>{});process.on('disconnect',()=>{try{process.kill(-process.pid,'SIGKILL')}catch{}});const child=spawn(process.execPath,['--import','tsx',process.argv[1]],{stdio:['ignore','inherit','inherit'],env:process.env});child.on('exit',code=>{clearInterval(keep);process.exit(code??1)});`;
  async function start() {
    output = "";
    guardian = spawn(
      process.execPath,
      [
        "-e",
        guardianCode,
        options.entry ??
          (normal
            ? "apps/server/src/main.ts"
            : "scripts/qa-runtime-observation-server.ts"),
      ],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          DATABASE_URL: temporary.url,
          PORT: String(port),
          GATEWAY_URL: remote.listeningOrigin,
          AGENT_URL: remote.listeningOrigin,
          QA_ACCEPTANCE_RESOURCE_TOKEN: token,
          QA_RUNTIME_REGISTRY_DIR: directory,
          ...options.extraEnv,
        },
      },
    );
    guardian.stdout!.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    guardian.stderr!.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    await until(async () => {
      if (guardian!.exitCode !== null) throw new Error(`SUT exited: ${output}`);
      return fetch(apiUrl + "/api/health")
        .then((r) => r.ok)
        .catch(() => false);
    }, 12000).catch((cause: unknown) => {
      throw new Error(`Start failure: ${output}`, { cause });
    });
    if (!normal)
      await until(async () => {
        for (const file of await readdir(directory)) {
          if (!file.endsWith(".json")) continue;
          const value = JSON.parse(
            await readFile(join(directory, file), "utf8"),
          ) as { binding: { pid: number } };
          if (value.binding.pid === guardian!.pid) return true;
        }
        return false;
      });
    const login = await fetch(apiUrl + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    assert.equal(login.status, 200);
    accessToken = ((await login.json()) as { accessToken: string }).accessToken;
  }
  async function kill() {
    if (!guardian || guardian.exitCode !== null || guardian.signalCode !== null)
      return;
    const ended = once(guardian, "exit");
    process.kill(-guardian.pid!, "SIGKILL");
    await ended;
  }
  temporary.onCleanup(kill);
  await start();
  const target = (): Target => ({ apiUrl, revision, pid: guardian!.pid! });
  const prefix = "/qa/runtime/v1";
  async function request(method: string, path: string, body?: unknown) {
    const r = await fetch(controller.listeningOrigin + prefix + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, value: (await r.json()) as unknown };
  }
  function body(
    mode: RuntimeRequest["mode"] = "account-save-once",
    ttlMs = 20000,
    accountId = "account-1",
  ): RuntimeRequest {
    const base = { protocol, target: target(), ttlMs };
    return mode === "module-fail-then-hold"
      ? {
          ...base,
          mode,
          correlation: {
            kind: "module",
            module: "gateway",
            attemptLabel: randomUUID(),
          },
          faultMarker: "qa-runtime-developer-check",
        }
      : {
          ...base,
          mode,
          correlation: {
            kind: "account",
            accountId,
            operation: "connect",
            intentId: randomUUID(),
          },
        };
  }
  async function hold(
    mode?: RuntimeRequest["mode"],
    ttl?: number,
    accountId?: string,
  ) {
    const id = randomUUID(),
      input = body(mode, ttl, accountId);
    const result = await request("PUT", `/leases/${id}`, input);
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return { id, input, snapshot: result.value as ObservationSnapshot };
  }
  async function snapshot(id: string, method = "GET") {
    const r = await request(method, `/leases/${id}`);
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return r.value as ObservationSnapshot;
  }
  async function advance(id: string) {
    const r = await request("POST", `/leases/${id}/advance`);
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return r.value as ObservationSnapshot;
  }
  async function event(id: string, kind: string, timeout = 5000) {
    let value!: ObservationSnapshot;
    await until(async () => {
      value = await snapshot(id);
      return value.events.some((e) => e.kind === kind);
    }, timeout);
    return value;
  }
  async function api(path: string, method = "GET", body?: unknown) {
    const response = await fetch(apiUrl + path, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      value: (await response.json()) as unknown,
    };
  }
  async function account(accountId = "account-1") {
    const result = await api("/api/accounts");
    assert.equal(result.status, 200);
    return (result.value as { id: string; status: string }[]).find(
      (a) => a.id === accountId,
    )!;
  }
  async function stateEvents() {
    const rows = await temporary.db.query(
      "SELECT type,payload FROM events WHERE type='account_status_changed' ORDER BY seq",
    );
    return rows.rows;
  }
  const socket = new WebSocket(apiUrl.replace("http:", "ws:") + "/ws");
  temporary.onCleanup(async () => {
    socket.terminate();
  });
  const frames: unknown[] = [];
  socket.on("message", (raw) => {
    frames.push(JSON.parse(raw.toString()));
  });
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "auth", accessToken, sinceSeq: 0 }));
  await until(async () =>
    frames.some(
      (f) =>
        (f as { type: string; success?: boolean }).type === "auth" &&
        (f as { success?: boolean }).success === true,
    ),
  );
  t.diagnostic(
    `Developer UUID DB ${new URL(temporary.url).pathname}; revision ${revision}; guardian ${guardian!.pid}; API ${apiUrl}`,
  );
  return {
    ...temporary,
    directory,
    target,
    token,
    request,
    body,
    hold,
    snapshot,
    advance,
    event,
    api,
    account,
    stateEvents,
    frames,
    start,
    kill,
    capabilities: (value = target()) =>
      request(
        "GET",
        "/capabilities?" +
          new URLSearchParams({ ...value, pid: String(value.pid) }),
      ),
    connects: () => connects,
    disconnects: () => disconnects,
    evidence: (value: unknown) =>
      t.diagnostic(JSON.stringify(value).replaceAll(token, "<redacted>")),
  };
}
