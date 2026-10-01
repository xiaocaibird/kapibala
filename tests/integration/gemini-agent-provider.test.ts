import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GeminiProvider,
  type Generation,
} from "../../apps/gemini-agent/src/provider.js";
import { AgentError } from "../../apps/gemini-agent/src/protocol.js";
const input = (): Generation => ({
  purpose: "turn",
  system: "synthetic system",
  payload: { synthetic: true },
  schema: { type: "object" },
  signal: new AbortController().signal,
  timeoutMs: 100,
});
const response = (value: unknown) => Response.json(value);
const candidate = (text: string) => ({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
});
const secret = "fake-unit-secret-never-a-real-key";
async function rejects(
  provider: GeminiProvider,
  code: string,
  request = input(),
) {
  await assert.rejects(
    provider.generate(request),
    (error: unknown) =>
      error instanceof AgentError &&
      error.code === code &&
      !error.message.includes(secret),
  );
}

test("C2 offline provider: official HTTPS request, header-only key, bounded JSON generation, no executable tools", async () => {
  let observed = false;
  const provider = new GeminiProvider({
    apiKey: secret,
    fetch: async (url, options) => {
      assert.equal(
        String(url),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      );
      assert.equal(String(url).includes(secret), false);
      assert.equal(
        (options!.headers as Record<string, string>)["x-goog-api-key"],
        secret,
      );
      assert.equal(options!.redirect, "error");
      const body = JSON.parse(options!.body as string);
      assert.equal(body.tools, undefined);
      assert.equal(body.generationConfig.candidateCount, 1);
      assert.equal(body.generationConfig.maxOutputTokens, 2048);
      assert.equal(
        body.generationConfig.responseFormat.text.mimeType,
        "APPLICATION_JSON",
      );
      assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), {
        synthetic: true,
      });
      return response({
        ...candidate('{"decision":"synthetic"}'),
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 2,
          totalTokenCount: 12,
        },
      });
    },
    observe: (value) => {
      observed = true;
      assert.equal(value.totalTokens, 12);
      assert.equal(JSON.stringify(value).includes(secret), false);
    },
  });
  assert.deepEqual(await provider.generate(input()), { decision: "synthetic" });
  assert.ok(observed);
});
test("C2 offline provider: provider HTTP/auth/rate errors never reflect bodies or manufacture audit verdicts", async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    const provider = new GeminiProvider({
      apiKey: secret,
      fetch: async () => new Response(secret, { status }),
    });
    await rejects(
      provider,
      status === 429
        ? "MODEL_RATE_LIMITED"
        : [401, 403].includes(status)
          ? "MODEL_AUTH_ERROR"
          : status === 400
            ? "MODEL_REQUEST_INVALID"
            : "MODEL_UNAVAILABLE",
    );
  }
});
test("C2 offline provider: invalid JSON, multiple candidates, native tools, truncation and safety blocks fail explicitly", async () => {
  const cases: [unknown, string][] = [
    [{}, "MODEL_INVALID_OUTPUT"],
    [{ candidates: [] }, "MODEL_INVALID_OUTPUT"],
    [
      {
        candidates: [
          ...candidate("{}").candidates,
          ...candidate("{}").candidates,
        ],
      },
      "MODEL_INVALID_OUTPUT",
    ],
    [candidate("```json\n{}\n```"), "MODEL_INVALID_OUTPUT"],
    [
      {
        candidates: [
          { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } },
        ],
      },
      "MODEL_INVALID_OUTPUT",
    ],
    [
      {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { functionCall: { name: "send_message" } },
                { text: "{}" },
              ],
            },
          },
        ],
      },
      "MODEL_INVALID_OUTPUT",
    ],
    [{ promptFeedback: { blockReason: "SAFETY" } }, "MODEL_BLOCKED"],
  ];
  for (const [value, code] of cases)
    await rejects(
      new GeminiProvider({
        apiKey: secret,
        fetch: async () => response(value),
      }),
      code,
    );
  await rejects(
    new GeminiProvider({
      apiKey: secret,
      fetch: async () => new Response("not-json"),
    }),
    "MODEL_INVALID_OUTPUT",
  );
  await rejects(
    new GeminiProvider({
      apiKey: secret,
      fetch: async () => new Response("x".repeat(1024 * 1024 + 1)),
    }),
    "MODEL_RESPONSE_TOO_LARGE",
  );
});
test("C2 offline provider: actual abort signals stop bounded wait; no hidden automatic retry", async () => {
  let calls = 0;
  const provider = new GeminiProvider({
    apiKey: secret,
    fetch: async (_url, options) => {
      calls++;
      return new Promise<Response>((_resolve, reject) =>
        options!.signal!.addEventListener(
          "abort",
          () => reject(options!.signal!.reason),
          { once: true },
        ),
      );
    },
  });
  // Keep a ref'ed test timer: AbortSignal.timeout deliberately does not keep Node alive.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await rejects(provider, "MODEL_TIMEOUT", { ...input(), timeoutMs: 30 });
    const controller = new AbortController();
    const result = rejects(provider, "MODEL_CANCELLED", {
      ...input(),
      signal: controller.signal,
    });
    controller.abort();
    await result;
    assert.equal(calls, 2);
  } finally {
    clearInterval(keepAlive);
  }
});
