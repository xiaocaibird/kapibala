import assert from "node:assert/strict";
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

test(
  "QA C2 process: actual provider HTTP, complete history, replay, restart and usage with synthetic credentials",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const requests: {
      url: string;
      key: string | string[] | undefined;
      body: Record<string, any>;
    }[] = [];
    let output: unknown = {
      decision: { name: "end_turn", text: "offline completion" },
    };
    const origin = await f.listen((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({
          url: request.url!,
          key: request.headers["x-goog-api-key"],
          body: JSON.parse(Buffer.concat(chunks).toString()),
        });
        response.end(
          candidate(output, {
            promptTokenCount: 10,
            candidatesTokenCount: 0,
            totalTokenCount: 10,
          }),
        );
      });
    });
    let proxyCalls = 0;
    const proxy = await f.listen((_request, response) => {
      proxyCalls++;
      response.writeHead(502).end();
    });
    const first = f.launch(origin, {
      GEMINI_API_KEY: "synthetic-env-key-must-be-ignored",
      GOOGLE_API_KEY: "synthetic-google-key-must-be-ignored",
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      NO_PROXY: "",
      http_proxy: proxy,
      https_proxy: proxy,
      no_proxy: "",
    });
    const ready = await first.ready();
    assert.match(ready.address, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);
    assert.deepEqual(
      { ...ready, address: "random" },
      {
        event: "qa-gemini-agent-ready",
        address: "random",
        model: "gemini-3.1-flash-lite",
        offline: true,
        providerOrigin: origin,
        providerTransport: "loopback-http",
        credentialSource: "synthetic",
        sessionDirectory: f.sessionDirectory,
      },
    );
    assert.deepEqual(await (await fetch(`${ready.address}/health`)).json(), {
      ok: true,
      service: "gemini-agent",
    });
    const input = initial();
    const response = await post(ready.address, "/agent/turn", input);
    assert.equal(
      response.status,
      200,
      JSON.stringify({
        body: await response.clone().text(),
        requests,
        proxyCalls,
        stderr: first.stderr,
      }),
    );
    const result = await response.json();
    assert.deepEqual(result, {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "offline completion" }],
    });
    assert.deepEqual(
      await (await post(ready.address, "/agent/turn", input)).json(),
      result,
    );
    assert.equal(
      requests.length,
      1,
      "identical request is served by actual session store",
    );
    assert.equal(
      requests[0]!.url,
      "/v1beta/models/gemini-3.1-flash-lite:generateContent",
    );
    assert.equal(requests[0]!.key, syntheticKey);
    assert.deepEqual(
      JSON.parse(requests[0]!.body.contents[0].parts[0].text),
      input,
    );
    assert.equal(
      requests[0]!.body.generationConfig.responseFormat.text.mimeType,
      "APPLICATION_JSON",
    );
    assert.ok(requests[0]!.body.systemInstruction.parts[0].text.length > 100);
    const followup = {
      ...input,
      messages: [
        ...input.messages,
        { role: "assistant", content: result.content },
        { role: "user", content: [{ type: "text", text: "followup" }] },
      ],
    };
    assert.equal(
      (await post(ready.address, "/agent/turn", followup)).status,
      200,
    );
    assert.deepEqual(
      JSON.parse(requests[1]!.body.contents[0].parts[0].text),
      followup,
    );
    assert.equal((await post(ready.address, "/agent/turn", input)).status, 409);
    output = { verdict: "fail", reason: "synthetic audit verdict" };
    assert.deepEqual(
      await (
        await post(ready.address, "/agent/audit", {
          groupId: "group-A",
          text: "audit only",
        })
      ).json(),
      output,
    );
    assert.equal(
      proxyCalls,
      0,
      "native loopback transport ignores proxy settings",
    );
    assert.deepEqual(await first.stop(), { code: 0, signal: null });
    assert.equal(
      (await readdir(f.sessionDirectory)).includes("owner.lock"),
      false,
    );
    let saved = await usage(f.sessionDirectory);
    assert.equal(saved.length, 3);
    assert.deepEqual(
      saved.map((row) => row.purpose),
      ["turn", "turn", "audit"],
    );
    assert.ok(
      saved.every(
        (row) =>
          row.stage === "validated-generation" &&
          row.outcome === "success" &&
          row.outputTokens === 0 &&
          row.totalTokens === 10,
      ),
    );
    assert.ok(
      !JSON.stringify(saved).includes("private synthetic conversation"),
    );
    assert.ok(
      !first.stdout.includes("must-be-ignored") &&
        !first.stderr.includes("must-be-ignored"),
    );
    const restarted = f.launch(origin); // No key variables and an unreadable-as-file .env.
    const restored = await restarted.ready();
    assert.equal(
      (await post(restored.address, "/agent/turn", followup)).status,
      200,
    );
    assert.equal(
      requests.length,
      3,
      "persisted replay buys no inference after restart",
    );
    await restarted.stop();
    saved = await usage(f.sessionDirectory);
    assert.equal(saved.length, 3);
  },
);

test(
  "QA C2 process: real HTTP status and invalid outputs preserve provider errors and known versus unknown usage",
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t);
    let status = 200,
      body = "not-json",
      calls = 0;
    const origin = await f.listen((_request, response) => {
      calls++;
      response.writeHead(status).end(body);
    });
    const child = f.launch(origin);
    const ready = await child.ready();
    const cases: [number, string, number, string, number | null][] = [
      [200, "not-json", 502, "MODEL_INVALID_OUTPUT", null],
      [
        200,
        candidate({ wrong: true }, { totalTokenCount: 7 }),
        502,
        "MODEL_INVALID_OUTPUT",
        7,
      ],
      [400, "private provider body", 502, "MODEL_REQUEST_INVALID", null],
      [401, "private provider body", 502, "MODEL_AUTH_ERROR", null],
      [403, "private provider body", 502, "MODEL_AUTH_ERROR", null],
      [429, "private provider body", 429, "MODEL_RATE_LIMITED", null],
      [
        503,
        candidate(
          { verdict: "pass", reason: "must not parse" },
          { totalTokenCount: 99 },
        ),
        502,
        "MODEL_UNAVAILABLE",
        null,
      ],
    ];
    for (const item of cases) {
      [status, body] = item;
      const response = await post(ready.address, "/agent/audit", {
        groupId: "g",
        text: "synthetic",
      });
      assert.equal(response.status, item[2]);
      assert.deepEqual(await response.json(), { code: item[3] });
    }
    assert.equal(calls, cases.length, "transport never retries");
    await child.stop();
    const saved = await usage(f.sessionDirectory);
    assert.deepEqual(
      saved.map((row) => [row.outcome, row.errorCode, row.totalTokens]),
      cases.map((item) => ["failure", item[3], item[4]]),
    );
  },
);

test(
  "QA C2 process: explicit offline and canonical numeric loopback origin required before resources are acquired",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const invalid: NodeJS.ProcessEnv[] = [
      { QA_GEMINI_OFFLINE: undefined },
      { QA_GEMINI_OFFLINE: "1" },
      ...[
        "https://127.0.0.1:1234",
        "http://localhost:1234",
        "http://127.1:1234",
        "http://2130706433:1234",
        "http://127.0.0.2:1234",
        "http://example.invalid:1234",
        "http://127.0.0.1",
        "http://127.0.0.1:0",
        "http://127.0.0.1:65536",
        "http://user:pass@127.0.0.1:1234",
        "http://127.0.0.1:1234/?x=1",
        "http://127.0.0.1:1234/#fragment",
        "http://127.0.0.1:1234/path",
      ].map((url) => ({ QA_GEMINI_PROVIDER_URL: url })),
      { QA_GEMINI_SESSION_DIR: undefined },
      { QA_GEMINI_SESSION_DIR: "relative" },
    ];
    for (const overrides of invalid) {
      const child = f.launch("http://127.0.0.1:1234", overrides);
      assert.deepEqual(await bounded(child.done), { code: 1, signal: null });
      assert.equal(child.stdout, "");
      const error = JSON.parse(child.stderr.trim());
      assert.equal(error.event, "qa-gemini-agent-start-failed");
      assert.ok(
        [
          "QA_OFFLINE_REQUIRED",
          "QA_PROVIDER_URL_INVALID",
          "QA_SESSION_DIRECTORY_REQUIRED",
        ].includes(error.code),
      );
    }
    assert.equal((await readdir(f.directory)).includes("sessions"), false);
  },
);

test(
  "QA C2 process: redirects are rejected without a second request or fallback",
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t);
    let escaped = 0,
      status = 302,
      location = "";
    const destination = await f.listen((_request, response) => {
      escaped++;
      response.end(candidate({ verdict: "pass", reason: "redirected" }));
    });
    const origin = await f.listen((_request, response) => {
      response.writeHead(status, { location }).end();
    });
    const child = f.launch(origin);
    const ready = await child.ready();
    for (status of [301, 302, 303, 307, 308]) {
      for (location of [
        destination,
        "https://generativelanguage.googleapis.com/",
      ]) {
        const response = await post(ready.address, "/agent/audit", {
          groupId: "g",
          text: "synthetic",
        });
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), { code: "MODEL_UNAVAILABLE" });
      }
    }
    assert.equal(escaped, 0);
    await child.stop();
    assert.equal((await usage(f.sessionDirectory)).length, 10);
  },
);

test(
  "QA C2 process: exclusive owner, SIGINT release, crash lock and changed owner are preserved",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const origin = await f.listen((_request, response) =>
      response.end(candidate({ verdict: "pass", reason: "offline" })),
    );
    const first = f.launch(origin);
    await first.ready();
    const lock = join(f.sessionDirectory, "owner.lock");
    const originalOwner = await readFile(lock, "utf8");
    const competing = f.launch(origin);
    assert.equal((await bounded(competing.done)).code, 1);
    assert.equal(JSON.parse(competing.stderr).code, "SESSION_DIRECTORY_LOCKED");
    assert.equal(await readFile(lock, "utf8"), originalOwner);
    assert.deepEqual(await first.stop("SIGINT"), { code: 0, signal: null });
    const killed = f.launch(origin);
    await killed.ready();
    const crashOwner = await readFile(lock, "utf8");
    assert.equal((await killed.stop("SIGKILL")).signal, "SIGKILL");
    const restart = f.launch(origin);
    assert.equal((await bounded(restart.done)).code, 1);
    assert.equal(JSON.parse(restart.stderr).code, "SESSION_DIRECTORY_LOCKED");
    assert.equal(await readFile(lock, "utf8"), crashOwner);
    // A different directory isolates the changed-owner shutdown case.
    const alternate = join(f.directory, "alternate");
    const changed = f.launch(origin, { QA_GEMINI_SESSION_DIR: alternate });
    await changed.ready();
    await writeFile(join(alternate, "owner.lock"), "foreign-owner", {
      mode: 0o600,
    });
    assert.equal((await changed.stop()).code, 1);
    assert.equal(JSON.parse(changed.stderr).code, "SESSION_LOCK_CHANGED");
    assert.equal(
      await readFile(join(alternate, "owner.lock"), "utf8"),
      "foreign-owner",
    );
  },
);

test(
  "QA C2 process: graceful stop aborts actual in-flight provider request and settles usage",
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t);
    let observed!: () => void;
    const started = new Promise<void>((resolve) => {
      observed = resolve;
    });
    let closed!: () => void;
    const providerClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const origin = await f.listen((request, response) => {
      request.resume();
      response.once("close", closed);
      observed(); // No response: wait for the real service abort, not a stub timer.
    });
    const child = f.launch(origin);
    const ready = await child.ready();
    const request = post(ready.address, "/agent/audit", {
      groupId: "g",
      text: "pending",
    }).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));
    await bounded(started);
    const result = await Promise.all([child.stop(), request]);
    assert.deepEqual(result[0], { code: 0, signal: null });
    assert.deepEqual(result[1], {
      status: 499,
      body: { code: "MODEL_CANCELLED" },
    });
    await bounded(providerClosed);
    const saved = await usage(f.sessionDirectory);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.errorCode, "MODEL_CANCELLED");
    assert.equal(saved[0]!.totalTokens, null);
    assert.equal(
      (await readdir(f.sessionDirectory)).includes("owner.lock"),
      false,
    );
  },
);

test(
  "QA C2 process: malformed HTTP status is safely rejected without killing service or retaining its lock",
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t);
    let status = 600;
    const origin = await f.listen((_request, response) => {
      response
        .writeHead(status)
        .end(
          candidate({ verdict: "pass", reason: "subsequent valid response" }),
        );
    });
    const child = f.launch(origin);
    const ready = await child.ready();
    const attempt = await post(ready.address, "/agent/audit", {
      groupId: "g",
      text: "synthetic malformed status",
    }).then(
      async (response) => ({
        status: response.status,
        body: await response.json(),
      }),
      () => ({ status: 0, body: { transportError: "connection closed" } }),
    );
    if (attempt.status === 0) {
      const exit = await bounded(child.done);
      t.diagnostic(
        JSON.stringify({
          exit,
          ownerLockRetained: (await readdir(f.sessionDirectory)).includes(
            "owner.lock",
          ),
          stderr: child.stderr,
        }),
      );
    }
    assert.deepEqual(attempt, {
      status: 502,
      body: { code: "MODEL_UNAVAILABLE" },
    });
    assert.deepEqual(await (await fetch(`${ready.address}/health`)).json(), {
      ok: true,
      service: "gemini-agent",
    });
    status = 200;
    const recovered = await post(ready.address, "/agent/audit", {
      groupId: "g",
      text: "synthetic recovery",
    });
    assert.equal(recovered.status, 200);
    assert.deepEqual(await recovered.json(), {
      verdict: "pass",
      reason: "subsequent valid response",
    });
    assert.deepEqual(await child.stop(), { code: 0, signal: null });
    assert.equal(child.stderr, "");
    assert.equal(
      (await readdir(f.sessionDirectory)).includes("owner.lock"),
      false,
    );
    assert.deepEqual(
      (await usage(f.sessionDirectory)).map((row) => [
        row.outcome,
        row.errorCode,
      ]),
      [
        ["failure", "MODEL_UNAVAILABLE"],
        ["success", null],
      ],
    );
  },
);
