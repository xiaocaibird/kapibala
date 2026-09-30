import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  clearSession,
  getAccessToken,
  loginSession,
  logoutSession,
  refreshAccessToken,
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
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const unauthorized = () =>
  response({ error: { code: "UNAUTHORIZED", message: "expired" } }, 401);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const oldStatus of [200, 401]) {
  test(`cookie serialization: an old refresh ${oldStatus} finishes headers/body before logout and new login`, async () => {
    setAccessToken("old-access");
    let cookie: string | null = "old-cookie";
    const finishBody = pending<void>();
    const calls: string[] = [];
    let firstRefresh = true;
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      calls.push(path);
      if (path === "/api/auth/refresh" && firstRefresh) {
        firstRefresh = false;
        // Simulate the browser applying Set-Cookie when response headers arrive,
        // before response.text() and the client generation check can complete.
        cookie = oldStatus === 200 ? "old-rotated-cookie" : null;
        const result =
          oldStatus === 200
            ? response({ accessToken: "old-renewed" })
            : unauthorized();
        const text = await result.text();
        result.text = async () => {
          await finishBody.promise;
          return text;
        };
        return result;
      }
      if (path === "/api/auth/refresh") {
        if (cookie === "viewer-cookie") {
          cookie = "viewer-rotated-cookie";
          return response({ accessToken: "viewer-renewed" });
        }
        assert.equal(cookie, null);
        return unauthorized();
      }
      if (path === "/api/auth/logout") {
        if (oldStatus === 401) return unauthorized();
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          "Bearer old-renewed",
        );
        cookie = null;
        return response({ ok: true });
      }
      assert.equal(path, "/api/auth/login");
      assert.equal(cookie, null);
      cookie = "viewer-cookie";
      return response({ accessToken: "viewer-access" });
    };
    const refresh = refreshAccessToken();
    const oldResult = refresh.then(
      () => "ok",
      (error: unknown) => error,
    );
    const logout = logoutSession();
    const login = loginSession("viewer", "viewer");
    await flush();
    assert.deepEqual(
      calls,
      ["/api/auth/refresh"],
      "new auth calls cannot overtake an older response body",
    );
    finishBody.resolve();
    await logout;
    await login;
    const previous = await oldResult;
    if (oldStatus === 200) assert.equal(previous, "ok");
    else assert.ok(previous instanceof ApiError && previous.status === 401);
    assert.equal(calls.at(-1), "/api/auth/login");
    assert.equal(cookie, "viewer-cookie");
    assert.equal(getAccessToken(), "viewer-access");
    // Model a reload dropping in-memory access: the surviving cookie must still
    // restore the new identity. This is a controlled cookie model, not a browser.
    clearSession();
    assert.equal(await refreshAccessToken(), "viewer-renewed");
    assert.equal(cookie, "viewer-rotated-cookie");
  });
}

test("logout revokes the cookie even when an old successful refresh lost its generation before saving access", async () => {
  setAccessToken("old-access");
  const oldResponse = pending<Response>();
  let cookie: string | null = "old-cookie";
  const calls: string[] = [];
  let rotations = 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    calls.push(path);
    if (path === "/api/auth/refresh") {
      if (++rotations === 1) return oldResponse.promise;
      assert.equal(cookie, "old-rotated-cookie");
      cookie = "old-rotated-again";
      return response({ accessToken: "revocable-old-access" });
    }
    if (path === "/api/auth/logout") {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer revocable-old-access",
      );
      cookie = null;
      return response({ ok: true });
    }
    assert.equal(path, "/api/auth/login");
    assert.equal(cookie, null);
    cookie = "viewer-cookie";
    return response({ accessToken: "viewer-access" });
  };
  const old = refreshAccessToken();
  const rejected = assert.rejects(
    old,
    (error: unknown) =>
      error instanceof ApiError && error.code === "SESSION_CHANGED",
  );
  clearSession();
  const logout = logoutSession();
  const login = loginSession("viewer", "viewer");
  cookie = "old-rotated-cookie";
  oldResponse.resolve(response({ accessToken: "ignored-old-access" }));
  await rejected;
  await logout;
  await login;
  assert.deepEqual(calls, [
    "/api/auth/refresh",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/login",
  ]);
  assert.equal(cookie, "viewer-cookie");
  assert.equal(getAccessToken(), "viewer-access");
});

for (const failure of [
  new TypeError("network unavailable"),
  new DOMException("request timed out", "TimeoutError"),
]) {
  test(`a ${failure.name} refresh rejection releases the auth queue for a new login`, async () => {
    setAccessToken("old-access");
    const release = pending<void>();
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const path = String(input);
      calls.push(path);
      if (path === "/api/auth/refresh") {
        await release.promise;
        throw failure;
      }
      assert.equal(path, "/api/auth/login");
      return response({ accessToken: "viewer-access" });
    };
    const refresh = refreshAccessToken();
    const rejected = assert.rejects(
      refresh,
      (error: unknown) =>
        error instanceof ApiError && error.code === "NETWORK_ERROR",
    );
    const login = loginSession("viewer", "viewer");
    await flush();
    assert.deepEqual(calls, ["/api/auth/refresh"]);
    release.resolve();
    await rejected;
    await login;
    assert.equal(getAccessToken(), "viewer-access");
    assert.deepEqual(calls, ["/api/auth/refresh", "/api/auth/login"]);
  });
}

test("logout alone renews expired access inside its queue, then revokes without deadlock", async () => {
  setAccessToken("expired-access");
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    calls.push(path);
    if (path === "/api/auth/refresh")
      return response({ accessToken: "renewed-access" });
    if (
      new Headers(init?.headers).get("Authorization") !==
      "Bearer renewed-access"
    )
      return unauthorized();
    return response({ ok: true });
  };
  await logoutSession();
  assert.deepEqual(calls, [
    "/api/auth/logout",
    "/api/auth/refresh",
    "/api/auth/logout",
  ]);
  assert.equal(getAccessToken(), null);
});

test("a queued obsolete refresh is rejected before it can rotate a newly logged-in cookie", async () => {
  setAccessToken("old-access");
  const oldResponse = pending<Response>();
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    calls.push(path);
    if (path === "/api/auth/refresh") return oldResponse.promise;
    return response({ accessToken: "viewer-access" });
  };
  const old = refreshAccessToken();
  const oldRejected = assert.rejects(
    old,
    (error: unknown) =>
      error instanceof ApiError && error.code === "SESSION_CHANGED",
  );
  const login = loginSession("viewer", "viewer");
  setAccessToken("intermediate-access");
  const queued = refreshAccessToken();
  const queuedRejected = assert.rejects(
    queued,
    (error: unknown) =>
      error instanceof ApiError && error.code === "SESSION_CHANGED",
  );
  oldResponse.resolve(response({ accessToken: "old-renewed" }));
  await oldRejected;
  await login;
  await queuedRejected;
  assert.deepEqual(calls, ["/api/auth/refresh", "/api/auth/login"]);
  assert.equal(getAccessToken(), "viewer-access");
});

test(
  "timing: the real twenty-second refresh abort releases a queued login",
  {
    skip: process.env.SESSION_COOKIE_TIMING_TESTS !== "1",
  },
  async (t) => {
    const keepAlive = setInterval(() => undefined, 1000);
    t.after(() => clearInterval(keepAlive));
    setAccessToken("old-access");
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      calls.push(path);
      if (path !== "/api/auth/refresh")
        return response({ accessToken: "viewer-access" });
      assert.ok(init?.signal);
      const signal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    };
    const startedAt = Date.now();
    const refresh = refreshAccessToken();
    const rejected = assert.rejects(
      refresh,
      (error: unknown) =>
        error instanceof ApiError && error.code === "NETWORK_ERROR",
    );
    const login = loginSession("viewer", "viewer");
    await rejected;
    await login;
    assert.ok(
      Date.now() - startedAt >= 19000,
      "production timeout must not be shortened for this test",
    );
    assert.deepEqual(calls, ["/api/auth/refresh", "/api/auth/login"]);
    assert.equal(getAccessToken(), "viewer-access");
    t.diagnostic(`actual refresh timeout: ${Date.now() - startedAt}ms`);
  },
);
