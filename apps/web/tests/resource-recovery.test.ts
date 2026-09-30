import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { z } from "zod";
import {
  ApiError,
  clearSession,
  getSessionGeneration,
  refreshAccessToken,
  request,
  setAccessToken,
} from "../src/api/client";
import { createResourceLoader } from "../src/hooks/resourceLoader";

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, "window", {
  value: new EventTarget(),
  configurable: true,
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearSession();
});
const unavailable = () => new ApiError("HTTP_ERROR", "temporary", 503);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture<T>(
  load: (signal: AbortSignal) => Promise<T>,
  readGeneration = () => 0,
) {
  const values: T[] = [];
  const errors: unknown[] = [];
  let settlements = 0;
  const loader = createResourceLoader({
    load,
    readGeneration,
    onValue: (value) => values.push(value),
    onError: (error) => errors.push(error),
    onSettled: () => {
      settlements++;
    },
  });
  return { loader, values, errors, settlements: () => settlements };
}

test("a transient resource failure recovers without another event or polling tick", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const f = fixture(async () => {
    if (++attempts === 1) throw unavailable();
    return "fresh";
  });
  t.after(() => f.loader.dispose());
  const pending = f.loader.reload();
  await setImmediate();
  assert.equal(f.errors.length, 1);
  assert.equal(f.settlements(), 1);
  t.mock.timers.tick(249);
  await setImmediate();
  assert.equal(attempts, 1);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(attempts, 2);
  assert.deepEqual(f.values, ["fresh"]);
});

test("backoff is bounded even with repeated invalidations and a later reload can recover", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  let failing = true;
  const f = fixture(async () => {
    attempts++;
    if (failing) throw unavailable();
    return attempts;
  });
  t.after(() => f.loader.dispose());
  const pending = f.loader.reload();
  await setImmediate();
  for (const delay of [250, 500, 1000]) {
    const before = attempts;
    assert.equal(f.loader.reload(), pending);
    assert.equal(f.loader.reload(), pending);
    t.mock.timers.tick(delay - 1);
    await setImmediate();
    assert.equal(attempts, before);
    t.mock.timers.tick(1);
    await setImmediate();
    assert.equal(attempts, before + 1);
  }
  await pending;
  t.mock.timers.tick(60000);
  await setImmediate();
  assert.equal(attempts, 4);
  assert.equal(f.errors.length, 4);
  failing = false;
  await f.loader.reload();
  assert.deepEqual(f.values, [5]);
  failing = true;
  const renewed = f.loader.reload();
  await setImmediate();
  failing = false;
  t.mock.timers.tick(250);
  await renewed;
  assert.deepEqual(f.values, [5, 7]);
});

test("polls and event bursts share one flight and one serial follow-up", async (t) => {
  const reads = [deferred<number>(), deferred<number>()];
  let attempts = 0;
  let active = 0;
  let maxActive = 0;
  const f = fixture(async () => {
    const read = reads[attempts++]!;
    maxActive = Math.max(maxActive, ++active);
    try {
      return await read.promise;
    } finally {
      active--;
    }
  });
  t.after(() => f.loader.dispose());
  const pending = f.loader.reload();
  assert.equal(f.loader.reload(), pending);
  assert.equal(f.loader.reload(), pending);
  reads[0]!.resolve(1);
  await setImmediate();
  assert.equal(attempts, 2);
  reads[1]!.resolve(2);
  await pending;
  assert.equal(maxActive, 1);
  assert.deepEqual(f.values, [1, 2]);
});

test("an invalidation during completion is drained before reload resolves", async (t) => {
  let attempts = 0;
  let invalidate = true;
  const values: number[] = [];
  const loader = createResourceLoader({
    load: async () => ++attempts,
    readGeneration: () => 0,
    onValue: (value) => values.push(value),
    onError: (error) => {
      throw error;
    },
    onSettled: () => {
      if (invalidate) {
        invalidate = false;
        void loader.reload();
      }
    },
  });
  t.after(() => loader.dispose());
  await loader.reload();
  assert.deepEqual(values, [1, 2]);
});

test("permission, contract, validation and rate-limit errors never schedule automatic retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const error of [
    ...[400, 401, 403, 404, 409, 422, 429, 501].map(
      (status) => new ApiError("HTTP_ERROR", "permanent", status),
    ),
    new ApiError("INVALID_RESPONSE", "contract", 502),
    new ApiError("VALIDATION_ERROR", "invalid", 500),
    new ApiError("SESSION_CHANGED", "identity", 401),
    new DOMException("cancelled", "AbortError"),
    new Error("programmer error"),
  ]) {
    let attempts = 0;
    const f = fixture(async () => {
      attempts++;
      throw error;
    });
    await f.loader.reload();
    t.mock.timers.tick(60000);
    await setImmediate();
    assert.equal(attempts, 1, String(error));
    f.loader.dispose();
  }
});

test("disposing during backoff cancels the timer and resolves the outstanding reload", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const f = fixture(async () => {
    attempts++;
    throw unavailable();
  });
  const pending = f.loader.reload();
  await setImmediate();
  f.loader.dispose();
  await pending;
  t.mock.timers.tick(60000);
  await setImmediate();
  await f.loader.reload();
  assert.equal(attempts, 1);
});

test("a replaced resource aborts its read and ignores late values and errors", async () => {
  for (const outcome of ["value", "error"]) {
    const read = deferred<string>();
    let signal: AbortSignal | undefined;
    const old = fixture(async (value) => {
      signal = value;
      return read.promise;
    });
    const pending = old.loader.reload();
    old.loader.dispose();
    const next = fixture(async () => "new resource");
    await next.loader.reload();
    if (outcome === "value") read.resolve("old resource");
    else read.reject(unavailable());
    await pending;
    assert.equal(signal?.aborted, true);
    assert.deepEqual(old.values, []);
    assert.deepEqual(old.errors, []);
    assert.equal(old.settlements(), 0);
    assert.deepEqual(next.values, ["new resource"]);
    next.loader.dispose();
  }
});

const valueSchema = z.object({ value: z.string() });
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

test("a login while an automatic retry waits cannot issue an old read with the new identity", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  setAccessToken("old-user");
  const tokens: (string | null)[] = [];
  globalThis.fetch = async (_path, init) => {
    tokens.push(new Headers(init?.headers).get("Authorization"));
    throw new TypeError("temporary network failure");
  };
  const f = fixture(
    (signal) => request("/api/value", valueSchema, { signal }),
    getSessionGeneration,
  );
  t.after(() => f.loader.dispose());
  const pending = f.loader.reload();
  await setImmediate();
  setAccessToken("new-user");
  // Even an invalidation queued during the old flight must not cross identity.
  assert.equal(f.loader.reload(), pending);
  t.mock.timers.tick(10000);
  await pending;
  assert.deepEqual(tokens, ["Bearer old-user"]);
  assert.deepEqual(f.values, []);
  assert.equal(f.errors.length, 1);
  globalThis.fetch = async (_path, init) => {
    tokens.push(new Headers(init?.headers).get("Authorization"));
    return json({ value: "new user data" });
  };
  await f.loader.reload();
  assert.deepEqual(tokens, ["Bearer old-user", "Bearer new-user"]);
  assert.deepEqual(f.values, [{ value: "new user data" }]);
});

test("a login during an active read discards its late result without publishing or retrying", async (t) => {
  for (const outcome of ["value", "error"]) {
    setAccessToken("old-user");
    const response = deferred<Response>();
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return response.promise;
    };
    const f = fixture(
      (signal) => request("/api/value", valueSchema, { signal }),
      getSessionGeneration,
    );
    const pending = f.loader.reload();
    setAccessToken("new-user");
    if (outcome === "value") response.resolve(json({ value: "old" }));
    else response.reject(new TypeError("offline"));
    await pending;
    assert.equal(attempts, 1);
    assert.deepEqual(f.values, []);
    assert.deepEqual(f.errors, []);
    assert.equal(f.settlements(), 0);
    f.loader.dispose();
  }
});

test("normal token renewal within the same identity does not cancel a waiting recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  setAccessToken("old-token");
  const generation = getSessionGeneration();
  let attempts = 0;
  globalThis.fetch = async (path, init) => {
    if (String(path) === "/api/auth/refresh")
      return json({ accessToken: "renewed-token" });
    if (++attempts === 1) throw new TypeError("offline");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer renewed-token",
    );
    return json({ value: "restored" });
  };
  const f = fixture(
    (signal) => request("/api/value", valueSchema, { signal }),
    getSessionGeneration,
  );
  t.after(() => f.loader.dispose());
  const pending = f.loader.reload();
  await setImmediate();
  await refreshAccessToken();
  assert.equal(getSessionGeneration(), generation);
  t.mock.timers.tick(250);
  await pending;
  assert.equal(attempts, 2);
  assert.deepEqual(f.values, [{ value: "restored" }]);
});
