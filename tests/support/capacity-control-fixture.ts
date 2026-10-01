import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { createCapacityController } from "../../scripts/qa-capacity/controller.js";
import type {
  LeaseRequest,
  Snapshot,
  Target,
} from "../../scripts/qa-capacity/protocol.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "./temporary-database.js";
import { deferred, until, tool, end } from "./core-automation-fixture.js";

export async function capacityFixture(
  t: TestContext,
  normal = false,
  options: {
    entry?: string;
    registryVariable?: string;
    controllerFactory?: typeof createCapacityController;
    configureRemote?: (remote: FastifyInstance) => void;
    extraEnv?: Record<string, string>;
  } = {},
) {
  assert.ok(
    process.env.DATABASE_URL,
    "An explicitly owned disposable PostgreSQL URL is required",
  );
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled,auto_kick_enabled) VALUES('g','remote-g','account-1',true,true)",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-1','account-1','creator'),('g','account-2','account-2','admin'),('g',null,'external-target','member')",
  );
  const directory = await mkdtemp("/tmp/kap-cap-");
  temporary.onCleanup(() => rm(directory, { recursive: true }));
  const remote = Fastify({ logger: false, forceCloseConnections: true });
  temporary.onCleanup(() => remote.close());
  const audited = deferred();
  const auditResponse = deferred();
  const kickEntered = deferred();
  const kickResponse = deferred();
  let blockKick = false;
  let timeoutKick = false;
  let kicks = 0;
  let audits = 0;
  let turns = 0;
  let removed = false;
  remote.post("/agent/turn", () =>
    ++turns === 1
      ? tool("kick-one", "kick_user", {
          platform_user_id: "external-target",
          reason: "engineering capacity observation",
        })
      : end(),
  );
  remote.post("/agent/audit", async () => {
    audits++;
    audited.resolve();
    await auditResponse.promise;
    return { verdict: "pass", reason: "approved" };
  });
  remote.post("/groups/remote-g/kick", async (_request, reply) => {
    kicks++;
    kickEntered.resolve();
    if (blockKick) await kickResponse.promise;
    if (timeoutKick) {
      setTimeout(() => {
        removed = true;
      }, 1500).unref();
      return reply.code(504).send({
        error: { code: "NETWORK_TIMEOUT", message: "explicit timeout" },
      });
    }
    removed = true;
    return { kicked: true };
  });
  remote.get("/groups/remote-g/members", () =>
    ["account-1", "account-2", ...(removed ? [] : ["external-target"])].map(
      (platformUserId) => ({ platformUserId }),
    ),
  );
  options.configureRemote?.(remote);
  remote.get("/events", (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    reply.raw.write(": engineering fixture\n\n");
  });
  await remote.listen({ host: "127.0.0.1", port: 0 });
  const controller = await (
    options.controllerFactory ?? createCapacityController
  )(directory);
  await controller.listen({ host: "127.0.0.1", port: 0 });
  temporary.onCleanup(() => controller.close());
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  const apiUrl = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const token = randomUUID();
  let guardian: ChildProcess | undefined;
  let output = "";
  let accessToken = "";
  const guardianCode = `const {spawn}=require('node:child_process'); const keep=setInterval(()=>{},1000); process.on('SIGTERM',()=>{}); process.on('disconnect',()=>{try{process.kill(-process.pid,'SIGKILL')}catch{}}); const child=spawn(process.execPath,['--import','tsx',process.argv[1]],{stdio:['ignore','inherit','inherit'],env:process.env}); child.on('exit',(code)=>{clearInterval(keep);process.exit(code??1)});`;
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
            : "scripts/qa-capacity-server.ts"),
      ],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          ...options.extraEnv,
          DATABASE_URL: temporary.url,
          PORT: String(port),
          GATEWAY_URL: remote.listeningOrigin,
          AGENT_URL: remote.listeningOrigin,
          QA_ACCEPTANCE_RESOURCE_TOKEN: token,
          [options.registryVariable ?? "QA_CAPACITY_REGISTRY_DIR"]: directory,
        },
      },
    );
    guardian.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    guardian.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    await until(async () => {
      if (guardian!.exitCode !== null) throw new Error(`SUT exited: ${output}`);
      return fetch(`${apiUrl}/api/health`)
        .then((response) => response.ok)
        .catch(() => false);
    }, 12_000).catch((cause: unknown) => {
      throw new Error(`SUT failed to start: ${output}`, { cause });
    });
    if (!normal)
      await until(async () => {
        for (const file of await readdir(directory)) {
          if (!file.endsWith(".json")) continue;
          const record = JSON.parse(
            await readFile(join(directory, file), "utf8"),
          ) as { binding: { pid: number } };
          if (record.binding.pid === guardian!.pid) return true;
        }
        return false;
      }, 3000);
    const login = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    assert.equal(login.status, 200);
    accessToken = ((await login.json()) as { accessToken: string }).accessToken;
  }
  async function kill() {
    if (!guardian || guardian.exitCode !== null) return;
    const exited = once(guardian, "exit");
    process.kill(-guardian.pid!, "SIGKILL");
    await exited;
  }
  temporary.onCleanup(async () => {
    auditResponse.resolve();
    kickResponse.resolve();
    await kill();
  });
  await start();
  const target = (): Target => ({ apiUrl, revision, pid: guardian!.pid! });
  async function request(method: string, path: string, body?: unknown) {
    const response = await fetch(controller.listeningOrigin + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value: unknown = await response.json();
    return { status: response.status, value };
  }
  async function capabilities(forTarget = target()) {
    return request(
      "GET",
      "/qa/capacity/v1/capabilities?" +
        new URLSearchParams({ ...forTarget, pid: String(forTarget.pid) }),
    );
  }
  function body(
    mode: LeaseRequest["mode"] = "hold-admission-capacity",
    ttlMs = 10_000,
  ): LeaseRequest {
    return {
      protocol: "qa-capacity-control/1",
      target: target(),
      correlation: {
        groupId: "g",
        runId: "capacity-run",
        toolUseId: "kick-one",
      },
      mode,
      ttlMs,
    };
  }
  async function snapshot(id: string, method = "GET"): Promise<Snapshot> {
    const response = await request(method, `/qa/capacity/v1/leases/${id}`);
    assert.equal(response.status, 200, JSON.stringify(response.value));
    return response.value as Snapshot;
  }
  async function hold(mode?: LeaseRequest["mode"], ttlMs?: number) {
    const id = randomUUID();
    const input = body(mode, ttlMs);
    const response = await request(
      "PUT",
      `/qa/capacity/v1/leases/${id}`,
      input,
    );
    assert.equal(response.status, 200, JSON.stringify(response.value));
    return { id, input, snapshot: response.value as Snapshot };
  }
  async function run() {
    const response = await fetch(`${apiUrl}/api/agent-runs/capacity-run`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<{
      status: string;
      endReason: string | null;
      recoveryNote: string | null;
      steps: { state?: string; resultSummary: string }[];
    }>;
  }
  async function prepare() {
    const before = performance.now();
    await db.query(
      "INSERT INTO agent_runs(id,group_id,history) VALUES('capacity-run','g','[]')",
    );
    const after = performance.now();
    await audited.promise;
    return { before, after };
  }
  function evidence(value: unknown) {
    t.diagnostic(JSON.stringify(value).replaceAll(token, "<redacted>"));
  }
  t.diagnostic(
    `Developer-owned UUID database ${new URL(temporary.url).pathname}; revision ${revision}; guardian ${guardian!.pid}; API ${apiUrl}; controller ${controller.listeningOrigin}`,
  );
  return {
    db,
    api: (path: string, init: RequestInit = {}) =>
      fetch(`${apiUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${accessToken}`, ...init.headers },
      }),
    directory,
    controller,
    target,
    token,
    request,
    capabilities,
    body,
    snapshot,
    hold,
    run,
    prepare,
    start,
    kill,
    auditResponse,
    kickEntered,
    kickResponse,
    blockKick: () => {
      blockKick = true;
    },
    timeoutKick: () => {
      timeoutKick = true;
    },
    kicks: () => kicks,
    audits: () => audits,
    turns: () => turns,
    evidence,
    output: () => output,
  };
}
