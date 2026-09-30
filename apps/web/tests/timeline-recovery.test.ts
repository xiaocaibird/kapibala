import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createSnapshotReconciler } from "../src/hooks/snapshotReconciler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("a failed snapshot retains consumed invalidations and retries without a new event", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const secondPage = deferred<void>();
  const published: string[][] = [];
  const errors: unknown[] = [];
  const paths: string[] = [];
  let attempts = 0;
  const sync = createSnapshotReconciler({
    load: async () => {
      attempts++;
      paths.push("first");
      const rows = ["latest"];
      paths.push("second");
      if (attempts === 1) await secondPage.promise;
      return [...rows, "historical backfill"];
    },
    onValue: (value) => published.push(value),
    onError: (error) => errors.push(error),
    onSyncing: () => {},
  });
  t.after(() => sync.dispose());
  const pending = sync.invalidate();
  void sync.invalidate(); // The WS cursor has already consumed another event.
  secondPage.reject(new Error("page two unavailable"));
  await pending;
  assert.equal(errors.length, 1);
  assert.deepEqual(published, []);
  t.mock.timers.tick(249);
  await setImmediate();
  assert.equal(attempts, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(attempts, 2);
  assert.deepEqual(paths, ["first", "second", "first", "second"]);
  assert.deepEqual(published, [["latest", "historical backfill"]]);
});

test("events during a snapshot coalesce into one serial follow-up snapshot", async (t) => {
  const pages = [deferred<number>(), deferred<number>()];
  let attempts = 0;
  let active = 0;
  let maxActive = 0;
  const published: number[] = [];
  const sync = createSnapshotReconciler({
    load: async () => {
      const page = pages[attempts++]!;
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await page.promise;
      } finally {
        active--;
      }
    },
    onValue: (value) => published.push(value),
    onError: (error) => {
      throw error;
    },
    onSyncing: () => {},
  });
  t.after(() => sync.dispose());
  const pending = sync.invalidate();
  assert.equal(sync.invalidate(), pending);
  assert.equal(sync.invalidate(), pending);
  pages[0]!.resolve(1);
  await setImmediate();
  assert.equal(attempts, 2);
  pages[1]!.resolve(2);
  await pending;
  assert.equal(maxActive, 1);
  assert.deepEqual(published, [1, 2]);
});

test("snapshot retries use capped backoff and reset their delay after recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  let unavailable = true;
  let published = 0;
  const sync = createSnapshotReconciler({
    load: async () => {
      attempts++;
      if (unavailable) throw new Error("offline");
      return attempts;
    },
    onValue: () => {
      published++;
    },
    onError: () => {},
    onSyncing: () => {},
  });
  t.after(() => sync.dispose());
  await sync.invalidate();
  for (const delay of [250, 500, 1000, 2000, 2000]) {
    const before = attempts;
    await sync.invalidate(); // Events must not bypass a failed request's backoff.
    t.mock.timers.tick(delay - 1);
    await setImmediate();
    assert.equal(attempts, before);
    t.mock.timers.tick(1);
    await setImmediate();
    assert.equal(attempts, before + 1);
  }
  unavailable = false;
  t.mock.timers.tick(2000);
  await setImmediate();
  assert.equal(published, 1);
  unavailable = true;
  await sync.invalidate();
  const before = attempts;
  unavailable = false;
  t.mock.timers.tick(249);
  await setImmediate();
  assert.equal(attempts, before);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(attempts, before + 1);
  assert.equal(published, 2);
});

test("disposing a group clears retries and blocks late results from the old group", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const published: string[] = [];
  const failing = createSnapshotReconciler({
    load: async () => {
      attempts++;
      throw new Error("offline");
    },
    onValue: (value: string) => published.push(value),
    onError: () => {},
    onSyncing: () => {},
  });
  await failing.invalidate();
  failing.dispose();
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(attempts, 1);

  const oldRequest = deferred<string>();
  let oldSignal: AbortSignal | undefined;
  const oldGroup = createSnapshotReconciler({
    load: async (signal) => {
      oldSignal = signal;
      return oldRequest.promise;
    },
    onValue: (value) => published.push(value),
    onError: () => {
      throw new Error("disposed group must not publish errors");
    },
    onSyncing: () => {},
  });
  const pending = oldGroup.invalidate();
  oldGroup.dispose();
  assert.equal(oldSignal?.aborted, true);
  const newGroup = createSnapshotReconciler({
    load: async () => "new group",
    onValue: (value) => published.push(value),
    onError: () => {},
    onSyncing: () => {},
  });
  t.after(() => newGroup.dispose());
  await newGroup.invalidate();
  oldRequest.resolve("stale old group");
  await pending;
  await oldGroup.invalidate();
  assert.deepEqual(published, ["new group"]);
});

test("an invalidation at snapshot completion cannot get stranded behind the finishing promise", async (t) => {
  let attempts = 0;
  let invalidateAtCompletion = true;
  const published: number[] = [];
  const sync = createSnapshotReconciler({
    load: async () => ++attempts,
    onValue: (value) => published.push(value),
    onError: () => {},
    onSyncing: (syncing) => {
      if (!syncing && invalidateAtCompletion) {
        invalidateAtCompletion = false;
        void sync.invalidate();
      }
    },
  });
  t.after(() => sync.dispose());
  await sync.invalidate();
  assert.equal(attempts, 2);
  assert.deepEqual(published, [1, 2]);
});
