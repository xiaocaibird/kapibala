import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ApiError,
  clearSession,
  getAccessToken,
  post,
  refreshAccessToken,
  request,
  setAccessToken,
} from "../src/api/client";
import { mergeMessages } from "../src/api/messages";
import type { Message } from "../src/api/schemas";
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, "window", {
  value: new EventTarget(),
  configurable: true,
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearSession();
});
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function unauthorized(): Response {
  return json(
    {
      error: { code: "UNAUTHORIZED", message: "expired", requestId: "r-auth" },
    },
    401,
  );
}
const valueSchema = z.object({ value: z.number() });

test("concurrent REST 401s and WS refresh share one token rotation", async () => {
  setAccessToken("old");
  let rotations = 0;
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/auth/refresh") {
      rotations++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return json({ accessToken: "new" });
    }
    requests++;
    assert.equal(init?.credentials, "include");
    return new Headers(init?.headers).get("Authorization") === "Bearer new"
      ? json({ value: 1 })
      : unauthorized();
  };
  const [first, second, token] = await Promise.all([
    request("/api/a", valueSchema),
    request("/api/b", valueSchema),
    refreshAccessToken(),
  ]);
  assert.deepEqual(first, { value: 1 });
  assert.deepEqual(second, { value: 1 });
  assert.equal(token, "new");
  assert.equal(rotations, 1);
  assert.equal(requests, 4);
});

test("a delayed old-token 401 uses the already refreshed token", async () => {
  setAccessToken("old");
  let rotations = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/auth/refresh") {
      rotations++;
      return json({ accessToken: "new" });
    }
    const token = new Headers(init?.headers).get("Authorization");
    if (token === "Bearer new") return json({ value: 2 });
    if (String(input) === "/api/slow")
      await new Promise((resolve) => setTimeout(resolve, 35));
    return unauthorized();
  };
  await Promise.all([
    request("/api/fast", valueSchema),
    request("/api/slow", valueSchema),
  ]);
  assert.equal(rotations, 1);
});

test("logout first renews expired access and then reaches the server", async () => {
  setAccessToken("old");
  let rotations = 0;
  let revoked = false;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/auth/refresh") {
      rotations++;
      return json({ accessToken: "new" });
    }
    if (new Headers(init?.headers).get("Authorization") !== "Bearer new")
      return unauthorized();
    revoked = true;
    return json({ ok: true });
  };
  await post("/api/auth/logout", z.object({ ok: z.boolean() }));
  assert.equal(rotations, 1);
  assert.equal(revoked, true);
});

test("revoked refresh clears the access token and reports the server error", async () => {
  setAccessToken("old");
  globalThis.fetch = async () => unauthorized();
  await assert.rejects(
    () => request("/api/a", valueSchema),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "UNAUTHORIZED" &&
      error.requestId === "r-auth",
  );
  assert.equal(getAccessToken(), null);
});

test("a login or logout cannot be overwritten by an older refresh response", async () => {
  setAccessToken("old");
  let finish: ((value: Response) => void) | undefined;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = refreshAccessToken();
  setAccessToken("different-session");
  finish?.(json({ accessToken: "stale-refresh" }));
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof ApiError && error.code === "SESSION_CHANGED",
  );
  assert.equal(getAccessToken(), "different-session");
});

const message = (
  id: string,
  sentAt: string,
  deliveryStatus: Message["deliveryStatus"] = "sent",
): Message => ({
  id,
  msgId: `m-${id}`,
  clientMsgId: `c-${id}`,
  senderPlatformUserId: "sender",
  isOwn: true,
  text: id,
  sentAt,
  deliveryStatus,
  failCode: null,
});
test("own-message return and sentAt correction keep one stable row", () => {
  const queued = message("local-1", "2026-09-30T10:00:01.000Z", "queued");
  const sent = {
    ...queued,
    msgId: "gateway-1",
    sentAt: "2026-09-30T10:00:00.000Z",
    deliveryStatus: "sent" as const,
  };
  const merged = mergeMessages([queued], [sent, sent]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0], sent);
});

test("old snapshot pagination cannot downgrade a row or lose backfilled history", () => {
  const sent = message("local-1", "2026-09-30T10:00:00.000Z");
  const old = {
    ...sent,
    deliveryStatus: "queued" as const,
    sentAt: "2026-09-30T10:00:01.000Z",
  };
  const historical = message("historical", "2020-01-01T00:00:00.000Z");
  const merged = mergeMessages([sent], [old, historical], false);
  assert.deepEqual(merged, [historical, sent]);
});

test("equal timestamps are ordered consistently by stable identity", () => {
  const stamp = "2026-09-30T10:00:00.000Z";
  assert.deepEqual(
    mergeMessages([], [message("b", stamp), message("a", stamp)]).map(
      (item) => item.id,
    ),
    ["a", "b"],
  );
});
