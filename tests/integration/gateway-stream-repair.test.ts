import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function parseChunks(t: TestContext, chunks: Uint8Array[]) {
  let consumed = false;
  const errors: string[] = [];
  const parsed: string[] = [];
  const ctx = {
    gateway: new RemoteClient("http://gateway.invalid"),
    log: {
      error: (_error: unknown, text: string) => errors.push(text),
      warn() {},
    },
  } as unknown as AppContext;
  const events = new GatewayEvents(ctx, new Messages(ctx));
  events.process = async (event) => {
    parsed.push(String(event.eventId));
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            const next = chunks.shift();
            if (next) controller.enqueue(next);
            else {
              consumed = true;
              controller.close();
            }
          },
        }),
      ),
  );
  events.start();
  try {
    while (!consumed) await delay(1);
  } finally {
    await events.close();
  }
  return { parsed, errors };
}

function message(id: number) {
  return {
    eventId: id,
    type: "message",
    groupId: "g",
    msgId: `m-${id}`,
    senderPlatformUserId: "external",
    text: "跨块消息",
    sentAt: "2026-10-01T00:00:00.000Z",
  };
}

test("KG01 SSE CRLF split across three chunks preserves both frames", async (t) => {
  const bytes = new TextEncoder();
  const result = await parseChunks(t, [
    bytes.encode(`data: ${JSON.stringify(message(1))}\r`),
    bytes.encode("\n\r"),
    bytes.encode(`\ndata: ${JSON.stringify(message(2))}\n\n`),
  ]);
  assert.deepEqual(result, { parsed: ["1", "2"], errors: [] });
});

test("KG02 SSE every byte boundary preserves UTF-8, comments and multiline data", async (t) => {
  const data = JSON.stringify(message(3));
  const split = data.indexOf(',"text"');
  const stream = `: keepalive\r\n\r\nid: 3\r\nevent: gateway\r\ndata:${data.slice(0, split + 1)}\r\ndata:${data.slice(split + 1)}\r\n\r\ndata: ${JSON.stringify(message(4))}\n\n`;
  const result = await parseChunks(
    t,
    [...new TextEncoder().encode(stream)].map((byte) => Uint8Array.of(byte)),
  );
  assert.deepEqual(result, { parsed: ["3", "4"], errors: [] });
});
