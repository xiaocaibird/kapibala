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

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, "window", {
  value: new EventTarget(),
  configurable: true,
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearSession();
});
const resultSchema = z.object({ value: z.string() });
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function unauthorized(): Response {
  return response({ error: { code: "UNAUTHORIZED", message: "expired" } }, 401);
}
function pending<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const sessionChanged = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "SESSION_CHANGED";

test("a delayed write 401 cannot replay under a newly logged-in identity", async () => {
  setAccessToken("identity-a");
  const first = pending<Response>();
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(
      `${String(input)}:${new Headers(init?.headers).get("Authorization")}`,
    );
    return calls.length === 1
      ? first.promise
      : response({ value: "unwanted-write" });
  };
  const writing = post("/api/groups/group-a/messages", resultSchema, {
    text: "draft-a",
  });
  const rejected = assert.rejects(writing, sessionChanged);
  clearSession();
  setAccessToken("identity-b");
  first.resolve(unauthorized());
  await rejected;
  assert.deepEqual(calls, ["/api/groups/group-a/messages:Bearer identity-a"]);
  assert.equal(getAccessToken(), "identity-b");
});

test("an old retried request cannot clear the new identity on its delayed 401", async () => {
  setAccessToken("identity-a");
  const retryStarted = pending<void>();
  const retry = pending<Response>();
  let writes = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/auth/refresh")
      return response({ accessToken: "a-renewed" });
    if (++writes === 1) return unauthorized();
    retryStarted.resolve();
    return retry.promise;
  };
  const writing = post("/api/groups/group-a/messages", resultSchema, {
    text: "draft-a",
  });
  const rejected = assert.rejects(writing, sessionChanged);
  await retryStarted.promise;
  setAccessToken("identity-b");
  retry.resolve(unauthorized());
  await rejected;
  assert.equal(writes, 2);
  assert.equal(getAccessToken(), "identity-b");
});

test("a late successful result is not returned into a different session", async () => {
  setAccessToken("identity-a");
  const first = pending<Response>();
  globalThis.fetch = async () => first.promise;
  const reading = request("/api/auth/me", resultSchema);
  const rejected = assert.rejects(reading, sessionChanged);
  setAccessToken("identity-b");
  first.resolve(response({ value: "identity-a" }));
  await rejected;
  assert.equal(getAccessToken(), "identity-b");
});

test("a new session owns a new refresh flight and an old finalizer cannot release it", async () => {
  setAccessToken("identity-a");
  const old = pending<Response>();
  const current = pending<Response>();
  let rotations = 0;
  globalThis.fetch = async () =>
    ++rotations === 1 ? old.promise : current.promise;
  const oldRefresh = refreshAccessToken();
  const oldRejected = assert.rejects(oldRefresh, sessionChanged);
  setAccessToken("identity-b");
  const currentRefresh = refreshAccessToken();
  // Attach immediately: the baseline incorrectly returns the old rejected flight.
  void currentRefresh.catch(() => undefined);
  old.resolve(response({ accessToken: "a-renewed" }));
  await oldRejected;
  const joined = refreshAccessToken();
  void joined.catch(() => undefined);
  current.resolve(response({ accessToken: "b-renewed" }));
  assert.notEqual(currentRefresh, oldRefresh);
  assert.equal(joined, currentRefresh);
  assert.equal(await currentRefresh, "b-renewed");
  assert.equal(rotations, 2);
  assert.equal(getAccessToken(), "b-renewed");
});
