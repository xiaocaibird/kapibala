import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { UsageQueueEvent } from "../../apps/gemini-agent/src/usage.js";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server, type RequestListener } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import { tools } from "../../apps/server/src/modules/automation/protocol.js";

const entry = fileURLToPath(
  new URL("../../scripts/qa-gemini-agent.ts", import.meta.url),
);
const loader = import.meta.resolve("tsx");
const syntheticKey = "qa-offline-synthetic-key";
interface Ready {
  observation?: { instanceId: string; basePath: string };
  event: string;
  address: string;
  model: string;
  offline: boolean;
  providerOrigin: string;
  providerTransport: string;
  credentialSource: string;
  sessionDirectory: string;
}
interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
}
interface ManagedProcess {
  child: ReturnType<typeof spawn>;
  done: Promise<Exit>;
  readonly stdout: string;
  readonly stderr: string;
  ready(): Promise<Ready>;
  stop(signal?: NodeJS.Signals): Promise<Exit>;
}
async function bounded<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("process test deadline")),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "kapibala-qa-gemini-"));
  // A key-file fallback would fail on this directory, instead of yielding a key.
  await mkdir(join(directory, ".env"));
  const children: ManagedProcess[] = [];
  const servers: Server[] = [];
  const sessionDirectory = join(directory, "sessions");
  t.after(async () => {
    try {
      for (const child of children) await child.stop();
    } finally {
      for (const server of servers) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
  const listen = async (handler: RequestListener) => {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  };
  function launch(
    providerOrigin: string,
    overrides: NodeJS.ProcessEnv = {},
  ): ManagedProcess {
    const child = spawn(process.execPath, ["--import", loader, entry], {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        QA_GEMINI_OFFLINE: "true",
        QA_GEMINI_PROVIDER_URL: providerOrigin,
        QA_GEMINI_SESSION_DIR: sessionDirectory,
        GEMINI_ENV_FILE: join(directory, ".env"),
        GEMINI_USAGE_ENABLED: "true",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const done = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const running = {
      child,
      done,
      get stdout() {
        return stdout;
      },
      get stderr() {
        return stderr;
      },
      async ready(): Promise<Ready> {
        const deadline = performance.now() + 8000;
        for (;;) {
          const line = stdout
            .split("\n")
            .find((item) => item.includes('"event":"qa-gemini-agent-ready"'));
          if (line) return JSON.parse(line) as Ready;
          assert.ok(
            performance.now() < deadline && child.exitCode === null,
            `entry ready: ${stderr}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
      async stop(signal: NodeJS.Signals = "SIGTERM") {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill(signal);
          const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
          try {
            return await bounded(done, 7000);
          } finally {
            clearTimeout(timer);
          }
        }
        return done;
      },
    };
    children.push(running);
    return running;
  }
  return { directory, sessionDirectory, launch, listen };
}
const candidate = (value: unknown, usageMetadata?: unknown) =>
  JSON.stringify({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
    ...(usageMetadata === undefined ? {} : { usageMetadata }),
  });
const post = (address: string, path: string, body: unknown) =>
  fetch(`${address}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
const initial = (runId = "offline-run") => ({
  runId,
  tools,
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "private synthetic conversation" }],
    },
  ],
});
const usage = async (directory: string): Promise<Record<string, unknown>[]> =>
  (await readFile(join(directory, "usage", "usage.jsonl"), "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const controlToken = randomUUID();
interface Snapshot {
  instanceId: string;
  usage: {
    entry: string;
    optionsSupplied: boolean;
    configuredEnabled: boolean;
    observationEnabled: boolean;
    initialized: boolean;
    queued: number;
    queuedIncludesActiveBatch: false;
    activeBatch: number;
    dropped: number;
    writeFailures: number;
    diagnosticCodes: string[];
    events: UsageQueueEvent[];
    truncatedEvents: number;
  };
  hold: null | {
    id: string;
    state: string;
    expiresAt: string;
    reached: UsageQueueEvent | null;
    releaseReason: string | null;
  };
  transport: {
    enabled: boolean;
    coverage: string;
    events: { kind: string; details: Record<string, unknown> }[];
  };
}
const observationEnv = {
  QA_GEMINI_USAGE_OBSERVATION: "true",
  QA_GEMINI_TRANSPORT_OBSERVATION: "true",
  QA_ACCEPTANCE_RESOURCE_TOKEN: controlToken,
};
function control(
  ready: Ready,
  path = "/snapshot",
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
) {
  return fetch(`${ready.address}/qa/usage/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${controlToken}`,
      "x-qa-instance-id": ready.observation!.instanceId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
}
async function snapshot(ready: Ready): Promise<Snapshot> {
  const response = await control(ready);
  assert.equal(response.status, 200);
  return (await response.json()) as Snapshot;
}
async function until(
  ready: Ready,
  predicate: (value: Snapshot) => boolean,
): Promise<Snapshot> {
  const deadline = performance.now() + 5000;
  for (;;) {
    const value = await snapshot(ready);
    if (predicate(value)) return value;
    assert.ok(
      performance.now() < deadline,
      "actual observation condition deadline",
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function evidence(name: string, value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  assert.ok(!serialized.includes(controlToken));
  assert.ok(!serialized.includes(syntheticKey));
  assert.ok(!serialized.includes("private synthetic conversation"));
  if (process.env.QA_USAGE_EVIDENCE_DIR) {
    await mkdir(process.env.QA_USAGE_EVIDENCE_DIR, { recursive: true });
    await writeFile(
      join(process.env.QA_USAGE_EVIDENCE_DIR, `${name}.json`),
      `${serialized}\n`,
    );
  }
}
const audit = async (ready: Ready) => {
  const response = await post(ready.address, "/agent/audit", {
    text: "private synthetic conversation",
    groupId: "local-test",
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), {
    verdict: "pass",
    reason: "synthetic",
  });
};
const success = (
  _request: unknown,
  response: import("node:http").ServerResponse,
) =>
  response.end(
    candidate(
      { verdict: "pass", reason: "synthetic" },
      { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
    ),
  );

test(
  "usage observation: actual main/factory defaults, omission, explicit enable and controls off",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const origin = await f.listen(success);
    for (const config of [
      { entry: "main", enabled: true, supplied: true, extra: {} },
      {
        entry: "main",
        enabled: false,
        supplied: true,
        extra: { GEMINI_USAGE_ENABLED: "false" },
      },
      { entry: "factory", enabled: false, supplied: false, extra: {} },
      {
        entry: "factory",
        enabled: true,
        supplied: true,
        extra: {
          QA_GEMINI_FACTORY_USAGE: "true",
          GEMINI_USAGE_ENABLED: "false",
        },
      },
    ]) {
      const session = join(f.directory, `${config.entry}-${config.enabled}`);
      const child = f.launch(origin, {
        ...observationEnv,
        QA_GEMINI_USAGE_ENTRY: config.entry,
        QA_GEMINI_SESSION_DIR: session,
        ...config.extra,
      });
      const ready = await child.ready();
      await audit(ready);
      const observed = await until(
        ready,
        (s) =>
          !config.enabled ||
          s.usage.events.some((e) => e.kind === "write-settled"),
      );
      assert.equal(observed.usage.optionsSupplied, config.supplied);
      assert.equal(observed.usage.configuredEnabled, config.enabled);
      assert.equal(observed.usage.initialized, config.enabled);
      if (config.enabled) assert.equal((await usage(session)).length, 1);
      else {
        assert.ok(!(await readdir(session)).includes("usage"));
        assert.deepEqual(observed.usage.events, []);
        assert.equal(
          (
            await control(ready, `/holds/${randomUUID()}`, "PUT", {
              ttlMs: 1000,
            })
          ).status,
          409,
        );
      }
      await evidence(`mode-${config.entry}-${config.enabled}`, observed);
      assert.deepEqual(await child.stop(), { code: 0, signal: null });
    }
    const ordinary = f.launch(origin);
    const ready = await ordinary.ready();
    assert.equal(ready.observation, undefined);
    assert.equal(
      (await fetch(`${ready.address}/qa/usage/v1/snapshot`)).status,
      404,
    );
    await audit(ready);
    assert.deepEqual(await ordinary.stop(), { code: 0, signal: null });
    assert.equal((await usage(f.sessionDirectory)).length, 1);
    for (const flag of [
      "QA_GEMINI_USAGE_OBSERVATION",
      "QA_GEMINI_TRANSPORT_OBSERVATION",
    ]) {
      const rejected = f.launch(origin, { [flag]: "true" });
      assert.deepEqual(await bounded(rejected.done), { code: 1, signal: null });
      assert.match(rejected.stderr, /QA_OBSERVATION_TOKEN_REQUIRED/);
      assert.ok(!rejected.stdout.includes("ready"));
    }
    const transportOnly = f.launch(origin, {
      QA_GEMINI_USAGE_OBSERVATION: "false",
      QA_GEMINI_TRANSPORT_OBSERVATION: "true",
      QA_ACCEPTANCE_RESOURCE_TOKEN: controlToken,
    });
    const transportReady = await transportOnly.ready();
    await audit(transportReady);
    const transportSnapshot = await snapshot(transportReady);
    assert.equal(transportSnapshot.usage.observationEnabled, false);
    assert.equal(transportSnapshot.usage.initialized, null);
    assert.equal(transportSnapshot.usage.queued, null);
    assert.deepEqual(transportSnapshot.usage.events, []);
    assert.ok(transportSnapshot.transport.events.length > 0);
    assert.equal(
      (
        await control(transportReady, `/holds/${randomUUID()}`, "PUT", {
          ttlMs: 1000,
        })
      ).status,
      409,
    );
    assert.deepEqual(await transportOnly.stop(), { code: 0, signal: null });
    assert.equal((await usage(f.sessionDirectory)).length, 2);
  },
);

test(
  "usage observation: real queue overflow, gate identity, transport facts and persistence are distinct",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    let providerCalls = 0;
    const origin = await f.listen((request, response) => {
      providerCalls++;
      success(request, response);
    });
    const child = f.launch(origin, observationEnv);
    const ready = await child.ready();
    const id = randomUUID();
    const initialFile = await readFile(
      join(f.sessionDirectory, "usage", "usage.jsonl"),
      "utf8",
    );
    assert.equal(initialFile, "");
    assert.equal(
      (await control(ready, `/holds/${id}`, "PUT", { ttlMs: 30000 })).status,
      200,
    );
    await audit(ready);
    let held = await until(ready, (s) => s.hold?.state === "held");
    assert.equal(held.usage.activeBatch, 1);
    assert.equal(held.usage.queued, 0);
    assert.equal(held.usage.queuedIncludesActiveBatch, false);
    const batchId = held.hold!.reached!.batchId;
    assert.ok(batchId);
    assert.equal(held.hold!.reached!.kind, "before-write");
    assert.ok(
      !held.usage.events.some(
        (e) => e.kind === "write-started" && e.batchId === batchId,
      ),
    );
    assert.equal(
      (
        await control(ready, `/holds/${id}`, "DELETE", undefined, {
          authorization: "Bearer wrong",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await control(ready, `/holds/${id}`, "DELETE", undefined, {
          "x-qa-instance-id": randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (await control(ready, `/holds/${randomUUID()}`, "DELETE")).status,
      404,
    );
    assert.equal(
      (await control(ready, `/holds/${randomUUID()}`, "PUT", { ttlMs: 5000 }))
        .status,
      409,
    );
    assert.equal(
      (await control(ready, `/holds/${id}`, "PUT", { ttlMs: 30001 })).status,
      409,
    );
    const replay = (await (
      await control(ready, `/holds/${id}`, "PUT", { ttlMs: 30000 })
    ).json()) as Snapshot["hold"];
    assert.equal(replay!.expiresAt, held.hold!.expiresAt);
    for (let index = 0; index < 140; index++) await audit(ready);
    held = await snapshot(ready);
    assert.equal(providerCalls, 141);
    assert.equal(held.hold!.state, "held");
    assert.equal(held.usage.queued, 64);
    assert.equal(held.usage.activeBatch, 1);
    assert.equal(held.usage.dropped, 76);
    assert.deepEqual(held.usage.diagnosticCodes, ["USAGE_QUEUE_FULL"]);
    assert.equal(
      held.usage.events.filter((e) => e.kind === "enqueued").length,
      65,
    );
    assert.equal(
      held.usage.events.filter((e) => e.kind === "rejected-queue-full").length,
      76,
    );
    assert.equal(
      await readFile(join(f.sessionDirectory, "usage", "usage.jsonl"), "utf8"),
      initialFile,
    );
    assert.equal(held.transport.coverage, "provider-transport-only");
    const attempt = held.transport.events.find((e) => e.kind === "attempt")!;
    assert.equal(attempt.details.keyHeaderPresent, true);
    assert.equal(attempt.details.matchesSyntheticKey, true);
    assert.equal(attempt.details.syntheticKeyElsewhere, false);
    assert.equal(attempt.details.redirect, "error");
    assert.ok(
      held.transport.events.some(
        (e) =>
          e.kind === "socket-connected" &&
          e.details.remoteAddress === "127.0.0.1",
      ),
    );
    await evidence("overflow-held", held);
    assert.equal((await control(ready, `/holds/${id}`, "DELETE")).status, 200);
    const settled = await until(
      ready,
      (s) => s.usage.activeBatch === 0 && s.usage.queued === 0,
    );
    assert.equal((await usage(f.sessionDirectory)).length, 65);
    const stages = settled.usage.events
      .filter((e) => e.batchId === batchId)
      .map((e) => e.kind);
    assert.ok(stages.indexOf("before-write") < stages.indexOf("write-started"));
    assert.ok(
      stages.indexOf("write-started") < stages.indexOf("write-settled"),
    );
    assert.equal(settled.usage.writeFailures, 0);
    const replacement = randomUUID();
    assert.equal(
      (await control(ready, `/holds/${replacement}`, "PUT", { ttlMs: 30000 }))
        .status,
      200,
    );
    assert.equal((await control(ready, `/holds/${id}`, "DELETE")).status, 404);
    assert.equal((await snapshot(ready)).hold!.state, "armed");
    assert.equal(
      (await control(ready, `/holds/${replacement}`, "DELETE")).status,
      200,
    );
    await evidence("overflow-settled", settled);
    assert.deepEqual(await child.stop(), { code: 0, signal: null });
    assert.ok(!(await readdir(f.sessionDirectory)).includes("owner.lock"));
    assert.ok(
      !child.stdout.includes(controlToken) &&
        !child.stderr.includes(controlToken),
    );
    t.diagnostic(
      "real calls=141; held activeBatch=1 queued=64 dropped=76; released persisted=65; no write failure",
    );
  },
);

test(
  "usage observation: real TTL release, normal exit flush and SIGKILL retain distinct physical evidence",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const origin = await f.listen(success);
    const child = f.launch(origin, observationEnv);
    const ready = await child.ready();
    const ttlId = randomUUID();
    assert.equal(
      (await control(ready, `/holds/${ttlId}`, "PUT", { ttlMs: 99 })).status,
      400,
    );
    const start = performance.now();
    assert.equal(
      (await control(ready, `/holds/${ttlId}`, "PUT", { ttlMs: 100 })).status,
      200,
    );
    const armed = await snapshot(ready);
    assert.equal(armed.hold!.state, "armed");
    const expired = await until(ready, (s) => s.hold?.state === "expired");
    assert.ok(performance.now() - start >= 90);
    assert.equal(expired.hold!.releaseReason, "ttl");
    const heldId = randomUUID();
    assert.equal(
      (await control(ready, `/holds/${heldId}`, "PUT", { ttlMs: 500 })).status,
      200,
    );
    await audit(ready);
    const held = await until(ready, (s) => s.hold?.state === "held");
    const settled = await until(
      ready,
      (s) => s.hold?.state === "expired" && s.usage.activeBatch === 0,
    );
    assert.equal(settled.hold!.releaseReason, "ttl");
    assert.equal((await usage(f.sessionDirectory)).length, 1);
    await evidence("ttl-released", { held, settled });
    const exitId = randomUUID();
    assert.equal(
      (await control(ready, `/holds/${exitId}`, "PUT", { ttlMs: 30000 }))
        .status,
      200,
    );
    await audit(ready);
    const beforeExit = await until(ready, (s) => s.hold?.state === "held");
    assert.equal((await usage(f.sessionDirectory)).length, 1);
    assert.deepEqual(await child.stop(), { code: 0, signal: null });
    assert.equal((await usage(f.sessionDirectory)).length, 2);
    assert.ok(!(await readdir(f.sessionDirectory)).includes("owner.lock"));
    await evidence("normal-exit", {
      beforeExit,
      persistedAfterExit: 2,
      ownerLockAfterExit: false,
    });
    const killed = f.launch(origin, observationEnv);
    const killReady = await killed.ready();
    assert.notEqual(
      killReady.observation!.instanceId,
      ready.observation!.instanceId,
    );
    const killId = randomUUID();
    assert.equal(
      (await control(killReady, `/holds/${killId}`, "PUT", { ttlMs: 30000 }))
        .status,
      200,
    );
    await audit(killReady);
    const beforeKill = await until(killReady, (s) => s.hold?.state === "held");
    const batch = beforeKill.hold!.reached!.batchId;
    assert.ok(
      !beforeKill.usage.events.some(
        (e) => e.kind === "write-started" && e.batchId === batch,
      ),
    );
    assert.deepEqual(await killed.stop("SIGKILL"), {
      code: null,
      signal: "SIGKILL",
    });
    assert.equal((await usage(f.sessionDirectory)).length, 2);
    assert.ok((await readdir(f.sessionDirectory)).includes("owner.lock"));
    await evidence("queued-write-killed", {
      beforeKill,
      persistedAfterKill: 2,
      ownerLockAfterKill: true,
      guardianExit: { code: null, signal: "SIGKILL" },
      tailComplete: false,
    });
  },
);
