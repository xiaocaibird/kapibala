import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  rm,
  stat,
  readFile,
  writeFile,
  readdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGeminiAgent } from "../../apps/gemini-agent/src/app.js";
import { AgentError } from "../../apps/gemini-agent/src/protocol.js";
import type { Generation } from "../../apps/gemini-agent/src/provider.js";
import { digest } from "../../apps/gemini-agent/src/sessions.js";
import {
  tools,
  parseTurn,
  validateTool,
} from "../../apps/server/src/modules/automation/protocol.js";

const initial = (runId = "run-A", sentinel = "only-A") => ({
  runId,
  tools,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            groupId: "group-synthetic",
            triggerMessages: [
              {
                msgId: sentinel,
                senderPlatformUserId: "external",
                text: sentinel,
                sentAt: "2026-10-01T00:00:00.000Z",
              },
            ],
            policy: { autoKickEnabled: false },
            ownPlatformUserIds: ["own-1"],
          }),
        },
      ],
    },
  ],
});
async function fixture(
  t: { after(fn: () => Promise<void>): void },
  generate: (input: Generation) => Promise<unknown>,
) {
  const directory = await mkdtemp(join(tmpdir(), "kapibala-gemini-protocol-"));
  const apps: Awaited<ReturnType<typeof createGeminiAgent>>[] = [];
  t.after(async () => {
    for (const app of apps.reverse()) await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const open = async () => {
    const app = await createGeminiAgent({
      stateDirectory: directory,
      provider: { generate },
    });
    apps.push(app);
    return app;
  };
  return { app: await open(), directory, open };
}
const end = { decision: { name: "end_turn", text: "Synthetic completion" } };
const post = (
  app: Awaited<ReturnType<typeof createGeminiAgent>>,
  body: unknown,
  path = "/agent/turn",
) => app.inject({ method: "POST", url: path, payload: body as never });

test("C2 offline: actual backend tools and all four single-block decisions are compatible", async (t) => {
  const cases = [
    { name: "get_recent_messages", input: { limit: 5 } },
    {
      name: "send_message",
      input: { text: "synthetic", idempotency_key: "stable-send" },
    },
    {
      name: "kick_user",
      input: { platform_user_id: "external", reason: "synthetic moderation" },
    },
    { name: "finish", input: { summary: "done" } },
  ];
  let value: unknown;
  const f = await fixture(t, async () => value);
  for (const [index, decision] of cases.entries()) {
    value = { decision };
    const response = await post(f.app, initial(`run-${index}`));
    assert.equal(response.statusCode, 200, response.body);
    const parsed = parseTurn(response.body);
    assert.equal(parsed?.stop_reason, "tool_use");
    if (parsed?.stop_reason !== "tool_use") throw new Error("not a tool");
    assert.equal(validateTool(parsed.content[0]), null);
    assert.deepEqual(parsed.content[0].input, decision.input);
  }
  value = end;
  assert.equal(
    parseTurn((await post(f.app, initial("end"))).body)?.stop_reason,
    "end_turn",
  );
});

test("C2 offline: invalid tool declarations and schemas stop before inference", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    return end;
  });
  const wrong = [
    tools.slice(1),
    [...tools, tools[0]],
    [tools[0], ...tools.slice(0, 3)],
    tools.map((x, i) => (i ? x : { ...x, name: "shell" })),
    tools.map((x, i) =>
      i ? x : { ...x, input_schema: { type: "object", required: [] } },
    ),
    tools.map((x, i) =>
      i
        ? x
        : {
            ...x,
            input_schema: {
              type: "object",
              required: ["limit"],
              properties: { limit: { type: "not-a-json-type" } },
            },
          },
    ),
  ];
  for (const value of wrong) {
    const response = await post(f.app, { ...initial(), tools: value });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "TOOLS_INVALID");
  }
  const unsupported = tools.map((x, i) =>
    i
      ? x
      : {
          ...x,
          input_schema: {
            ...x.input_schema,
            $schema: "https://example.invalid/future-schema",
          },
        },
  );
  assert.equal(
    (await post(f.app, { ...initial(), tools: unsupported })).json().code,
    "SCHEMA_DIALECT_UNSUPPORTED",
  );
  assert.equal(calls, 0);
});

test("C2 offline: malformed requests and oversized histories do not buy inference", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    return end;
  });
  for (const body of [
    { ...initial(), runId: "" },
    { ...initial(), messages: [] },
    { ...initial(), messages: [{ role: "system", content: [] }] },
    {
      ...initial(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "x",
              content: {},
              is_error: "yes",
            },
          ],
        },
      ],
    },
  ])
    assert.equal((await post(f.app, body)).statusCode, 400);
  const big = initial();
  big.messages[0]!.content[0]!.text = "x".repeat(1024 * 1024);
  assert.equal((await post(f.app, big)).statusCode, 413);
  assert.equal(calls, 0);
});

test("C2 offline: interleaved runs preserve complete error history and idempotency keys without cross-run state", async (t) => {
  const seen: Generation[] = [];
  const f = await fixture(t, async (input) => {
    seen.push(input);
    return {
      decision: {
        name: "send_message",
        input: { text: "same logical send", idempotency_key: "original-key" },
      },
    };
  });
  const a = initial();
  const b = initial("run-B", "only-B");
  const [first, other] = await Promise.all([post(f.app, a), post(f.app, b)]);
  assert.equal(first.statusCode, 200);
  assert.equal(other.statusCode, 200);
  const use = first.json().content[0];
  const continued = {
    ...a,
    messages: [
      ...a.messages,
      { role: "assistant", content: [use] },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify({
              code: "SEND_TIMEOUT",
              message: "unknown effect",
              hint: "reuse original-key",
            }),
            is_error: true,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "PROTOCOL_ERROR BAD_JSON: prior response was invalid",
          },
        ],
      },
    ],
  };
  const next = await post(f.app, continued);
  assert.equal(next.statusCode, 200, next.body);
  assert.deepEqual(seen[2]!.payload, continued);
  assert.notEqual(next.json().content[0].id, use.id);
  assert.equal(next.json().content[0].input.idempotency_key, "original-key");
  for (const item of seen) {
    const serialized = JSON.stringify(item.payload);
    assert.equal(
      serialized.includes("only-A") && serialized.includes("only-B"),
      false,
    );
    assert.equal(item.timeoutMs, 9000);
  }
});

test("C2 offline: persistent same-request replay and completed-history continuation survive adapter restart", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    return { decision: { name: "get_recent_messages", input: { limit: 1 } } };
  });
  const input = initial("../../run-is-not-a-path");
  const first = await post(f.app, input);
  assert.equal(first.statusCode, 200);
  assert.equal((await post(f.app, input)).body, first.body);
  assert.equal(calls, 1);
  await f.app.close();
  const restarted = await f.open();
  assert.equal((await post(restarted, input)).body, first.body);
  assert.equal(calls, 1);
  const use = first.json().content[0];
  const continued = {
    ...input,
    messages: [
      ...input.messages,
      { role: "assistant", content: [use] },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: use.id,
            content: '{"messages":[],"truncated":false}',
          },
        ],
      },
    ],
  };
  assert.equal((await post(restarted, continued)).statusCode, 200);
  assert.equal(calls, 2);
  assert.equal(
    (await post(restarted, input)).json().code,
    "RUN_HISTORY_CONFLICT",
  );
  for (const name of await readdir(f.directory))
    assert.ok(name === "owner.lock" || /^[a-f0-9]{64}\.json$/.test(name));
  assert.equal(
    (await stat(join(f.directory, `${digest(input.runId)}.json`))).mode & 0o777,
    0o600,
  );
});

test("C2 offline: conflicting run histories, corrupt state, symlink state and a second writer fail closed", async (t) => {
  const f = await fixture(t, async () => end);
  await post(f.app, initial());
  assert.equal(
    (await post(f.app, initial("run-A", "changed-context"))).json().code,
    "RUN_HISTORY_CONFLICT",
  );
  await assert.rejects(
    createGeminiAgent({
      stateDirectory: f.directory,
      provider: { generate: async () => end },
    }),
    (error: unknown) =>
      error instanceof AgentError && error.code === "SESSION_DIRECTORY_LOCKED",
  );
  const filename = join(f.directory, `${digest("run-A")}.json`);
  const saved = await readFile(filename, "utf8");
  await writeFile(filename, "not-json");
  assert.equal(
    (await post(f.app, initial())).json().code,
    "SESSION_STORE_ERROR",
  );
  await writeFile(filename, saved);
  await symlink(filename, join(f.directory, `${digest("run-C")}.json`));
  assert.equal(
    (await post(f.app, initial("run-C"))).json().code,
    "SESSION_STORE_ERROR",
  );
  const pending = JSON.parse(saved);
  pending.status = "pending";
  delete pending.response;
  await writeFile(filename, JSON.stringify(pending));
  assert.equal(
    (await post(f.app, initial())).json().code,
    "TURN_OUTCOME_UNCERTAIN",
  );
});

test("C2 offline: malformed or multiple model decisions never become an invented completion", async (t) => {
  let value: unknown;
  const f = await fixture(t, async () => value);
  const invalid = [
    undefined,
    "```json\n{}\n```",
    { decision: [] },
    { decision: [end.decision, end.decision] },
    { decision: { name: "shell", input: {} } },
    { decision: { name: "send_message", input: { text: "x" } } },
    { decision: end.decision, extra: "hidden block" },
  ];
  for (const [index, bad] of invalid.entries()) {
    value = bad;
    const response = await post(f.app, initial(`invalid-${index}`));
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().code, "MODEL_INVALID_OUTPUT");
  }
});

test("C2 offline: audit pass/fail preserved, errors never grant permission and audit context stays separate", async (t) => {
  let value: unknown;
  const requests: Generation[] = [];
  const f = await fixture(t, async (request) => {
    requests.push(request);
    if (value instanceof Error) throw value;
    return value;
  });
  const input = {
    text: JSON.stringify({
      action: "kick",
      platform_user_id: "external",
      reason: "synthetic",
    }),
    groupId: "group-B",
  };
  for (const verdict of ["pass", "fail"] as const) {
    value = { verdict, reason: "exact reason" };
    const response = await post(f.app, input, "/agent/audit");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), value);
  }
  for (const invalid of [
    { verdict: "unknown", reason: "x" },
    { verdict: "pass" },
    "not-json",
    new AgentError(504, "MODEL_TIMEOUT"),
  ]) {
    value = invalid;
    const response = await post(f.app, input, "/agent/audit");
    assert.ok(response.statusCode >= 400);
    assert.equal(response.json().verdict, undefined);
  }
  assert.ok(
    requests.every(
      (request) =>
        request.purpose === "audit" &&
        request.timeoutMs === 4000 &&
        JSON.stringify(request.payload) === JSON.stringify(input),
    ),
  );
});

test("C2 offline: same-run concurrent inference rejected and total live generations bounded to four", async (t) => {
  const release: (() => void)[] = [];
  const f = await fixture(t, async () => {
    await new Promise<void>((resolve) => release.push(resolve));
    return end;
  });
  const calls = [post(f.app, initial())];
  while (!release.length)
    await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await post(f.app, initial())).json().code, "RUN_BUSY");
  for (let i = 1; i < 4; i++) calls.push(post(f.app, initial(`run-${i}`)));
  while (release.length < 4)
    await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await post(f.app, initial("fifth"))).json().code, "AGENT_BUSY");
  release.forEach((resolve) => resolve());
  assert.ok(
    (await Promise.all(calls)).every((response) => response.statusCode === 200),
  );
});
