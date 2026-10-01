import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import type { Socket } from "node:net";
import { randomUUID, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  realpath,
  rm,
  rename,
} from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const execute = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const label = "kapibala.local";
interface Manifest {
  version: 1;
  runId: string;
  ownerToken: string;
  ownerPid: number;
  ownerStarted: string;
  directory: string;
  engineArgs: string[];
  engineId: string;
  containerName: string;
  containerId?: string;
  volumeName: string;
  revision: string | null;
  databaseUrl?: string;
  urls?: { api: string; web: string; gateway: string; agent: string };
  gatewayState: string;
  agentState: string;
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const dockerEnv = { ...process.env };
delete dockerEnv.DOCKER_HOST;
delete dockerEnv.DOCKER_CONTEXT;
async function docker(
  engineArgs: string[],
  args: string[],
  timeout = 30_000,
): Promise<string> {
  return (
    await execute("docker", [...engineArgs, ...args], {
      env: dockerEnv,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout.trim();
}
async function started(pid: number): Promise<string> {
  const value = (
    await execute("ps", ["-p", String(pid), "-o", "lstart="], { timeout: 2000 })
  ).stdout.trim();
  if (!value) throw new Error("Process start identity is unavailable");
  return value;
}
async function persist(m: Manifest): Promise<void> {
  await writeFile(
    join(m.directory, "manifest.json.tmp"),
    JSON.stringify(m, null, 2) + "\n",
    { mode: 0o600 },
  );
  await rename(
    join(m.directory, "manifest.json.tmp"),
    join(m.directory, "manifest.json"),
  );
}
async function inspect(
  m: Manifest,
  kind: "container" | "volume",
  name: string,
): Promise<Record<string, unknown> | undefined> {
  // Listing avoids interpreting arbitrary daemon/transport failures as absence.
  const names = await docker(m.engineArgs, [
    kind === "container" ? "ps" : "volume",
    ...(kind === "container" ? ["-a"] : ["ls"]),
    "--format",
    kind === "container" ? "{{.Names}}" : "{{.Name}}",
  ]);
  if (!names.split("\n").includes(name)) return undefined;
  const items = JSON.parse(
    await docker(m.engineArgs, [kind, "inspect", name]),
  ) as Record<string, unknown>[];
  const item = items[0];
  if (!item) throw new Error(`Cannot inspect owned ${kind}`);
  const labels = (
    kind === "container"
      ? (item.Config as { Labels?: Record<string, string> }).Labels
      : item.Labels
  ) as Record<string, string> | undefined;
  assert.equal(
    labels?.[`${label}.run`],
    m.runId,
    "Resource run label mismatch; refusing cleanup",
  );
  assert.equal(
    labels?.[`${label}.owner`],
    m.ownerToken,
    "Resource owner label mismatch; refusing cleanup",
  );
  if (kind === "container" && m.containerId)
    assert.equal(item.Id, m.containerId, "Container identity changed");
  return item;
}
async function cleanup(m: Manifest): Promise<void> {
  assert.equal(
    await docker(m.engineArgs, ["info", "--format", "{{.ID}}"]),
    m.engineId,
    "Docker daemon changed; refusing cleanup",
  );
  if (await inspect(m, "container", m.containerName))
    await docker(m.engineArgs, ["rm", "-f", m.containerName]);
  if (await inspect(m, "volume", m.volumeName))
    await docker(m.engineArgs, ["volume", "rm", m.volumeName]);
  assert.equal(await inspect(m, "container", m.containerName), undefined);
  assert.equal(await inspect(m, "volume", m.volumeName), undefined);
  await rm(m.directory, { recursive: true });
  console.log(
    JSON.stringify({
      event: "isolated-cleaned",
      runId: m.runId,
      container: m.containerName,
      volume: m.volumeName,
      directoryRemoved: true,
    }),
  );
}
async function cleanupFile(path: string): Promise<void> {
  const file = resolve(path);
  const directory = dirname(file);
  const [fileInfo, dirInfo] = await Promise.all([
    lstat(file),
    lstat(directory),
  ]);
  assert.ok(
    fileInfo.isFile() &&
      !fileInfo.isSymbolicLink() &&
      dirInfo.isDirectory() &&
      !dirInfo.isSymbolicLink(),
  );
  assert.equal(fileInfo.uid, process.getuid?.());
  assert.equal(dirInfo.uid, process.getuid?.());
  assert.equal(fileInfo.mode & 0o077, 0);
  assert.equal(dirInfo.mode & 0o077, 0);
  assert.equal(
    await realpath(directory),
    directory,
    "Use the canonical manifest path printed by start",
  );
  const m = JSON.parse(await readFile(file, "utf8")) as Manifest;
  assert.equal(m.version, 1);
  assert.match(m.runId, uuid);
  assert.match(m.ownerToken, /^[a-f0-9]{64}$/);
  assert.equal(basename(file), "manifest.json");
  assert.equal(basename(directory), `kapibala-local-${m.runId}`);
  assert.equal(m.directory, directory);
  assert.equal(m.containerName, `kapibala-local-${m.runId}`);
  assert.equal(m.volumeName, `${m.containerName}-data`);
  assert.ok(
    Array.isArray(m.engineArgs) &&
      m.engineArgs.length === 2 &&
      ["--host", "--context"].includes(m.engineArgs[0]!) &&
      typeof m.engineArgs[1] === "string",
  );
  assert.ok(
    Number.isSafeInteger(m.ownerPid) &&
      m.ownerPid > 0 &&
      typeof m.ownerStarted === "string",
  );
  let alive = true;
  try {
    process.kill(m.ownerPid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    else throw error;
  }
  if (alive && (await started(m.ownerPid)) === m.ownerStarted)
    throw new Error(
      "Run owner is still alive; stop its foreground session first",
    );
  // If the PID was reused, only labeled Docker resources are cleaned. Never kill any PID.
  await cleanup(m);
}

async function start(smoke: boolean): Promise<void> {
  const [major, minor] = process.versions.node.split(".").map(Number);
  assert.ok(major === 24 && minor! >= 21, "Use the Node 24 version in .nvmrc");
  process.chdir(root);
  const engineArgs = process.env.DOCKER_CONTEXT
    ? ["--context", process.env.DOCKER_CONTEXT]
    : process.env.DOCKER_HOST
      ? ["--host", process.env.DOCKER_HOST]
      : [
          "--context",
          (await execute("docker", ["context", "show"])).stdout.trim(),
        ];
  const engineId = await docker(engineArgs, ["info", "--format", "{{.ID}}"]);
  const runId = randomUUID();
  const directory = join(await realpath(tmpdir()), `kapibala-local-${runId}`);
  await mkdir(directory, { mode: 0o700 });
  const m: Manifest = {
    version: 1,
    runId,
    ownerToken: randomBytes(32).toString("hex"),
    ownerPid: process.pid,
    ownerStarted: await started(process.pid),
    directory,
    engineArgs,
    engineId,
    containerName: `kapibala-local-${runId}`,
    volumeName: `kapibala-local-${runId}-data`,
    revision: await execute("git", ["rev-parse", "HEAD"], { cwd: root }).then(
      (r) => r.stdout.trim(),
      () => null,
    ),
    gatewayState: join(directory, "gateway.json"),
    agentState: join(directory, "agent.json"),
  };
  await persist(m);
  console.log(
    JSON.stringify({
      event: "isolated-preparing",
      runId,
      manifest: join(directory, "manifest.json"),
      ownerPid: m.ownerPid,
      ownerStarted: m.ownerStarted,
    }),
  );
  const disposers: (() => Promise<unknown>)[] = [];
  let interrupted = false;
  let closePromise: Promise<void> | undefined;
  let wake!: () => void;
  const stopped = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const onSignal = () => {
    interrupted = true;
    wake();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const check = () => {
    if (interrupted) throw new Error("Isolated startup interrupted");
  };
  const close = () =>
    (closePromise ??= (async () => {
      const errors: unknown[] = [];
      for (const dispose of disposers.reverse()) {
        try {
          let timer: NodeJS.Timeout | undefined;
          try {
            await Promise.race([
              dispose(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(new Error("Service shutdown exceeded 5 seconds")),
                  5000,
                );
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await cleanup(m);
      } catch (error) {
        errors.push(error);
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          "Service or resource cleanup failed; consult the resource cleanup result and retained manifest if present",
        );
    })());
  try {
    assert.equal(await inspect(m, "volume", m.volumeName), undefined);
    await docker(engineArgs, [
      "volume",
      "create",
      "--label",
      `${label}.run=${runId}`,
      "--label",
      `${label}.owner=${m.ownerToken}`,
      m.volumeName,
    ]);
    check();
    const password = randomBytes(24).toString("hex");
    const dbName = `kapibala_${runId.replaceAll("-", "")}`;
    assert.equal(await inspect(m, "container", m.containerName), undefined);
    m.containerId = await docker(
      engineArgs,
      [
        "run",
        "-d",
        "--name",
        m.containerName,
        "--label",
        `${label}.run=${runId}`,
        "--label",
        `${label}.owner=${m.ownerToken}`,
        "--mount",
        `type=volume,src=${m.volumeName},dst=/var/lib/postgresql/data`,
        "-e",
        "POSTGRES_USER=kapibala",
        "-e",
        `POSTGRES_PASSWORD=${password}`,
        "-e",
        `POSTGRES_DB=${dbName}`,
        "-p",
        "127.0.0.1::5432",
        "postgres:17-alpine",
      ],
      180_000,
    );
    await persist(m);
    check();
    const portMap = await docker(engineArgs, [
      "port",
      m.containerId,
      "5432/tcp",
    ]);
    const match = portMap.match(/^127\.0\.0\.1:(\d+)$/);
    assert.ok(match, "Database must bind only loopback with its own port");
    m.databaseUrl = `postgres://kapibala:${password}@127.0.0.1:${match[1]}/${dbName}`;
    await persist(m);
    let ready = false;
    for (let n = 0; n < 120; n++) {
      check();
      try {
        await docker(
          engineArgs,
          [
            "exec",
            m.containerId,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "kapibala",
            "-d",
            dbName,
          ],
          2000,
        );
        ready = true;
        break;
      } catch {
        await sleep(250);
      }
    }
    assert.ok(ready, "Owned PostgreSQL did not become ready");
    const { Database } = await import("../apps/server/src/core/db.js");
    const { migrate } = await import("../apps/server/src/core/migrations.js");
    const db = new Database(m.databaseUrl);
    disposers.push(() => db.close());
    await db.query("SELECT 1");
    await migrate(db);
    check();
    const { createGatewaySimulator } =
      await import("../apps/simulator/src/gateway.js");
    const { createAgentSimulator } =
      await import("../apps/simulator/src/agent.js");
    const gateway = createGatewaySimulator(m.gatewayState),
      agent = createAgentSimulator(m.agentState);
    disposers.push(
      () => gateway.close(),
      () => agent.close(),
    );
    await gateway.listen({ host: "127.0.0.1", port: 0 });
    await agent.listen({ host: "127.0.0.1", port: 0 });
    check();
    process.env.GATEWAY_URL = gateway.listeningOrigin;
    process.env.AGENT_URL = agent.listeningOrigin;
    const { createApp } = await import("../apps/server/src/app.js");
    const { createGatewayModule } =
      await import("../apps/server/src/modules/gateway/index.js");
    const { createAutomationModule } =
      await import("../apps/server/src/modules/automation/index.js");
    const api = await createApp({
      db,
      logger: false,
      modules: (ctx) => {
        const module = createGatewayModule(ctx);
        return [module, createAutomationModule(ctx, module)];
      },
    });
    disposers.push(() => api.close());
    await api.listen({ host: "127.0.0.1", port: 0 });
    check();
    const { createServer } = await import("vite");
    const webHttp = createHttpServer();
    const webSockets = new Set<Socket>();
    webHttp.on("connection", (socket) => {
      webSockets.add(socket);
      socket.once("close", () => webSockets.delete(socket));
    });
    disposers.push(async () => {
      for (const socket of webSockets) socket.destroy();
      if (webHttp.listening)
        await new Promise<void>((resolve, reject) =>
          webHttp.close((error) => (error ? reject(error) : resolve())),
        );
    });
    const web = await createServer({
      root: join(root, "apps/web"),
      configFile: join(root, "apps/web/vite.config.ts"),
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: true,
        // The orchestrator owns process signals and HTTP lifecycle. Vite's
        // standalone mode exits the process before our Docker cleanup finishes.
        middlewareMode: { server: webHttp },
        ws: { server: webHttp },
        proxy: {
          "/api": { target: api.listeningOrigin },
          "/ws": {
            target: api.listeningOrigin.replace("http:", "ws:"),
            ws: true,
          },
        },
      },
    });
    disposers.push(() => web.close());
    webHttp.on("request", web.middlewares);
    webHttp.listen(0, "127.0.0.1");
    await once(webHttp, "listening");
    const webAddress = webHttp.address();
    assert.ok(webAddress && typeof webAddress !== "string");
    m.urls = {
      api: api.listeningOrigin,
      web: `http://127.0.0.1:${webAddress.port}`,
      gateway: gateway.listeningOrigin,
      agent: agent.listeningOrigin,
    };
    await persist(m);
    check();
    const health = await fetch(m.urls.web + "/api/health", {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    const page = await fetch(m.urls.web, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    console.log(
      JSON.stringify({
        event: "isolated-ready",
        runId,
        revision: m.revision,
        ownerPid: m.ownerPid,
        urls: m.urls,
        database: { host: "127.0.0.1", port: Number(match[1]), name: dbName },
        manifest: join(directory, "manifest.json"),
        health: healthBody,
      }),
    );
    console.log(
      "Admin admin/admin; read-only viewer/viewer. Ctrl-C deletes this isolated database and simulator state.",
    );
    if (smoke) {
      await smokeCheck(m);
      console.log(
        JSON.stringify({
          event: "isolated-smoke-passed",
          runId,
          checks: [
            "web-entry",
            "random-api-proxy",
            "random-ws-proxy",
            "both-roles",
            "viewer-write-denied",
            "admin-connect-disconnect",
            "gateway-state-file",
            "agent-state-file",
          ],
        }),
      );
    } else await stopped;
  } finally {
    // Keep signal handlers installed through asynchronous cleanup. The tsx
    // launcher may relay a foreground signal while cleanup is still running.
    try {
      await close();
    } finally {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    }
  }
}

async function smokeCheck(m: Manifest): Promise<void> {
  const url = m.urls!.web;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) => {
    const response = await fetch(url + path, {
      signal: AbortSignal.timeout(10000),
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      value: (await response.json()) as Record<string, unknown>,
    };
  };
  const admin = await request("/api/auth/login", "POST", {
    username: "admin",
    password: "admin",
  });
  assert.equal(admin.status, 200);
  const viewer = await request("/api/auth/login", "POST", {
    username: "viewer",
    password: "viewer",
  });
  assert.equal(viewer.status, 200);
  const adminToken = String(admin.value.accessToken),
    viewerToken = String(viewer.value.accessToken);
  for (const [token, role] of [
    [adminToken, "admin"],
    [viewerToken, "viewer"],
  ]) {
    const me = await request("/api/auth/me", "GET", undefined, token);
    assert.equal(me.status, 200);
    assert.equal(me.value.role, role);
    assert.equal(
      (await request("/api/accounts", "GET", undefined, token)).status,
      200,
    );
  }
  const { WebSocket } = await import("ws");
  const socket = new WebSocket(url.replace("http:", "ws:") + "/ws");
  const frames: {
    type?: string;
    success?: boolean;
    payload?: { accountId?: string; to?: string };
  }[] = [];
  socket.on("error", () => undefined);
  socket.on("message", (raw) => {
    frames.push(JSON.parse(raw.toString()));
  });
  async function waitFor(predicate: () => boolean) {
    const end = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(Date.now() < end, "WebSocket proxy check timed out");
      await sleep(10);
    }
  }
  try {
    await waitFor(() => socket.readyState === WebSocket.OPEN);
    socket.send(
      JSON.stringify({ type: "auth", accessToken: adminToken, sinceSeq: 0 }),
    );
    await waitFor(() => frames.some((f) => f.type === "auth" && f.success));
    assert.equal(
      (
        await request(
          "/api/accounts/account-1/connect",
          "POST",
          {},
          viewerToken,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/accounts/account-1/connect", "POST", {}, adminToken))
        .status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/accounts/account-1/transition",
          "POST",
          { expectedFrom: "online", to: "disconnected" },
          adminToken,
        )
      ).status,
      200,
    );
    await waitFor(() =>
      frames.some(
        (f) =>
          f.type === "account_status_changed" &&
          f.payload?.accountId === "account-1" &&
          f.payload.to === "disconnected",
      ),
    );
  } finally {
    socket.terminate();
  }
  const gateway = JSON.parse(await readFile(m.gatewayState, "utf8")) as {
    accounts: Record<string, { online: boolean }>;
  };
  assert.equal(gateway.accounts["account-1"]?.online, false);
  const audit = await fetch(m.urls!.agent + "/agent/audit", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "isolated smoke", groupId: "isolated-smoke" }),
  });
  assert.equal(audit.status, 200);
  const agent = JSON.parse(await readFile(m.agentState, "utf8")) as {
    audits: unknown[];
  };
  assert.equal(agent.audits.length, 1);
}

const args = process.argv.slice(2);
try {
  if (args[0] === "cleanup" && args.length === 2) await cleanupFile(args[1]!);
  else if (args.length === 0 || (args.length === 1 && args[0] === "--smoke"))
    await start(args[0] === "--smoke");
  else
    throw new Error(
      "Usage: npm run dev:isolated [-- --smoke | -- cleanup /absolute/manifest.json]",
    );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Every local HTTP server lives in this process. Exit also closes an already
  // failed partial initialization after owned Docker cleanup has been attempted.
  process.exit(process.exitCode ?? 0);
}
