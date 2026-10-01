import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  rm,
  readFile,
  stat,
  writeFile,
  rename,
  symlink,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  UsageJournal,
  usageOptions,
} from "../../apps/gemini-agent/src/usage.js";
import {
  GeminiProvider,
  type UsageObservation,
} from "../../apps/gemini-agent/src/provider.js";
import { createGeminiAgent } from "../../apps/gemini-agent/src/app.js";
import { tools } from "../../apps/server/src/modules/automation/protocol.js";
const secret = "synthetic-key-never-a-real-credential";
const content = "synthetic-private-body-must-not-appear-in-usage";
const fact = (values: Partial<UsageObservation> = {}): UsageObservation => ({
  requestId: randomUUID(),
  attemptId: randomUUID(),
  runId: "run-A",
  observedAt: new Date().toISOString(),
  stage: "validated-generation",
  purpose: "turn",
  model: "gemini-3.1-flash-lite",
  elapsedMs: 12,
  outcome: "success",
  errorCode: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  ...values,
});
async function directory(t: { after(fn: () => Promise<void>): void }) {
  const path = await mkdtemp(join(tmpdir(), "kapibala-gemini-usage-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function records(path: string): Promise<UsageObservation[]> {
  return (await readFile(join(path, "usage.jsonl"), "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
const candidate = (output: unknown, usageMetadata?: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(output) }] },
      },
    ],
    ...(usageMetadata === undefined ? {} : { usageMetadata }),
  });

test("usage: real provider adapter records validated turn/audit attempts, cache adds no inference and missing/error usage stays unknown", async (t) => {
  const path = await directory(t);
  let calls = 0;
  let reply = () =>
    candidate(
      { decision: { name: "end_turn", text: content } },
      { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 },
    );
  const provider = new GeminiProvider({
    apiKey: secret,
    fetch: async () => {
      calls++;
      return reply();
    },
  });
  const app = await createGeminiAgent({
    stateDirectory: path,
    provider,
    usage: {},
  });
  t.after(() => app.close());
  const input = {
    runId: "run-A",
    tools,
    messages: [{ role: "user", content: [{ type: "text", text: content }] }],
  };
  const post = (url: string, payload: unknown) =>
    app.inject({ method: "POST", url, payload: payload as never });
  const first = await post("/agent/turn", input);
  assert.equal(first.statusCode, 200, first.body);
  assert.deepEqual((await post("/agent/turn", input)).json(), first.json());
  assert.equal(calls, 1);
  reply = () =>
    candidate(
      { verdict: "fail", reason: content },
      { promptTokenCount: -2, candidatesTokenCount: "8" },
    );
  assert.equal(
    (await post("/agent/audit", { groupId: "g", text: content })).statusCode,
    200,
  );
  reply = () => new Response(secret + content, { status: 503 });
  assert.equal(
    (await post("/agent/audit", { groupId: "g", text: content })).statusCode,
    502,
  );
  reply = () => candidate({ wrong: content }, { totalTokenCount: 7 });
  assert.equal(
    (await post("/agent/audit", { groupId: "g", text: content })).statusCode,
    502,
  );
  await app.close();
  const saved = await records(join(path, "usage"));
  assert.equal(saved.length, calls);
  assert.equal(saved.length, 4);
  assert.equal(new Set(saved.map((item) => item.attemptId)).size, 4);
  assert.equal(new Set(saved.map((item) => item.requestId)).size, 4);
  assert.ok(
    saved.every(
      (item) => item.elapsedMs >= 0 && item.stage === "validated-generation",
    ),
  );
  assert.equal(saved[0]!.runId, "run-A");
  assert.equal(saved[0]!.purpose, "turn");
  assert.equal(
    saved[0]!.outputTokens,
    0,
    "an explicit provider zero is retained",
  );
  assert.deepEqual(
    saved.slice(1).map((item) => item.runId),
    [null, null, null],
  );
  assert.equal(
    saved[1]!.outcome,
    "success",
    "a valid fail verdict is a successfully validated audit, not tool permission",
  );
  assert.deepEqual(
    [saved[1]!.inputTokens, saved[1]!.outputTokens, saved[1]!.totalTokens],
    [null, null, null],
  );
  assert.equal(saved[2]!.errorCode, "MODEL_UNAVAILABLE");
  assert.equal(saved[2]!.totalTokens, null);
  assert.equal(saved[3]!.outcome, "failure");
  assert.equal(saved[3]!.errorCode, "MODEL_INVALID_OUTPUT");
  assert.equal(
    saved[3]!.totalTokens,
    7,
    "provider-reported usage survives local validation failure",
  );
  const raw = JSON.stringify(saved);
  assert.ok(!raw.includes(secret) && !raw.includes(content));
  assert.equal((await stat(join(path, "usage"))).mode & 0o777, 0o700);
  assert.equal(
    (await stat(join(path, "usage", "usage.jsonl"))).mode & 0o777,
    0o600,
  );
  const restored = await createGeminiAgent({
    stateDirectory: path,
    provider,
    usage: {},
  });
  try {
    assert.deepEqual(
      (
        await restored.inject({
          method: "POST",
          url: "/agent/turn",
          payload: input,
        })
      ).json(),
      first.json(),
    );
    assert.equal(calls, 4);
  } finally {
    await restored.close();
  }
  assert.equal((await records(join(path, "usage"))).length, 4);
});

test("usage: provider timeout and cancellation each emit one failed attempt without invented zero usage", async () => {
  const seen: UsageObservation[] = [];
  const provider = new GeminiProvider({
    apiKey: secret,
    observe: (value) => seen.push(value),
    fetch: async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = options!.signal!;
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      }),
  });
  const controller = new AbortController();
  const input = {
    purpose: "audit" as const,
    system: content,
    payload: content,
    schema: {},
    signal: controller.signal,
    timeoutMs: 20,
  };
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(provider.generate(input), { code: "MODEL_TIMEOUT" });
    const next = provider.generate({ ...input, timeoutMs: 1000 });
    controller.abort();
    await assert.rejects(next, { code: "MODEL_CANCELLED" });
  } finally {
    clearInterval(keepAlive);
  }
  assert.deepEqual(
    seen.map((item) => item.errorCode),
    ["MODEL_TIMEOUT", "MODEL_CANCELLED"],
  );
  assert.ok(
    seen.every(
      (item) => item.outcome === "failure" && item.totalTokens === null,
    ),
  );
  assert.notEqual(seen[0]!.attemptId, seen[1]!.attemptId);
});

test("usage: retention bounds count, bytes and age, cleans only owned crash temporary files and preserves private permissions", async (t) => {
  const path = await directory(t);
  const journal = (await UsageJournal.open(path, {
    maxRecords: 3,
    maxBytes: 4096,
    maxAgeDays: 1,
  }))!;
  for (let i = 0; i < 8; i++) journal.record(fact({ elapsedMs: i }));
  journal.record(fact({ observedAt: "2020-01-01T00:00:00.000Z" }));
  await journal.close();
  assert.deepEqual(
    (await records(path)).map((item) => item.elapsedMs),
    [5, 6, 7],
  );
  assert.ok((await stat(join(path, "usage.jsonl"))).size <= 4096);
  const orphan = join(path, `usage-${randomUUID()}.tmp`);
  await writeFile(orphan, "partial", { mode: 0o600 });
  await writeFile(join(path, "unrelated.tmp"), "keep", { mode: 0o600 });
  const restored = (await UsageJournal.open(path, { maxRecords: 1 }))!;
  await restored.close();
  assert.deepEqual(
    (await records(path)).map((item) => item.elapsedMs),
    [7],
  );
  await assert.rejects(access(orphan));
  assert.equal(await readFile(join(path, "unrelated.tmp"), "utf8"), "keep");
  const bytesOnly = (await UsageJournal.open(path, {
    maxRecords: 100,
    maxBytes: 4096,
  }))!;
  for (let i = 0; i < 10; i++)
    bytesOnly.record(fact({ runId: "r".repeat(512) }));
  await bytesOnly.close();
  assert.ok((await stat(join(path, "usage.jsonl"))).size <= 4096);
  assert.ok((await records(path)).length < 10);
});

test("usage: disabled config makes no files; unsafe storage and invalid config degrade with fixed diagnostics", async (t) => {
  const path = await directory(t);
  const warnings: string[] = [];
  const off = join(path, "disabled");
  assert.equal(
    await UsageJournal.open(
      off,
      usageOptions({ GEMINI_USAGE_ENABLED: "false" }),
    ),
    undefined,
  );
  await assert.rejects(access(off));
  const link = join(path, "link");
  await symlink(path, link);
  assert.equal(
    await UsageJournal.open(link, { warn: (code) => warnings.push(code) }),
    undefined,
  );
  assert.equal(
    await UsageJournal.open(join(path, "invalid"), {
      maxRecords: 0,
      warn: (code) => warnings.push(code),
    }),
    undefined,
  );
  assert.deepEqual(warnings, [
    "USAGE_STORE_UNAVAILABLE",
    "USAGE_STORE_UNAVAILABLE",
  ]);
});

test("usage: optional journal write failure and bounded-queue overflow do not reject successful model responses", async (t) => {
  const path = await directory(t);
  const warnings: string[] = [];
  const app = await createGeminiAgent({
    stateDirectory: path,
    usage: { warn: (code) => warnings.push(code) },
    provider: new GeminiProvider({
      apiKey: secret,
      fetch: async () => candidate({ verdict: "pass", reason: content }),
    }),
  });
  t.after(() => app.close());
  await rename(join(path, "usage"), join(path, "old-usage"));
  await writeFile(join(path, "usage"), "not a directory", { mode: 0o600 });
  const result = await app.inject({
    method: "POST",
    url: "/agent/audit",
    payload: { groupId: "g", text: content },
  });
  assert.equal(result.statusCode, 200, result.body);
  await app.close();
  assert.deepEqual(warnings, ["USAGE_WRITE_FAILED"]);
  const queue = (await UsageJournal.open(join(path, "bounded"), {
    maxRecords: 200,
    warn: (code) => warnings.push(code),
  }))!;
  for (let i = 0; i < 200; i++) queue.record(fact());
  await queue.close();
  assert.equal(
    warnings.filter((code) => code === "USAGE_QUEUE_FULL").length,
    1,
  );
  assert.ok((await records(join(path, "bounded"))).length <= 65);
});
