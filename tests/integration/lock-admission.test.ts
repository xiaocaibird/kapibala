import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LockCapacityUnavailableError,
  withOperationSignal,
} from "../../apps/server/src/core/db.js";
import { AppError } from "../../apps/server/src/core/errors.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import {
  automationFixture,
  deferred,
  until,
} from "../support/core-automation-fixture.js";

test("PostgreSQL lock admission distinguishes local capacity, entity contention, and an undefined callback result", async (t) => {
  const f = await temporaryDatabase(t);
  const release = deferred();
  let admitted = 0;
  const holders = Array.from({ length: 8 }, (_, index) =>
    f.db.withLock(`admission:${index}`, async () => {
      admitted++;
      await release.promise;
    }),
  );
  f.onCleanup(async () => {
    release.resolve();
    await Promise.allSettled(holders);
  });
  await until(async () => admitted === 8);
  let ran = false;
  assert.deepEqual(
    await f.db.tryWithLock("otherwise-free", async () => {
      ran = true;
    }),
    { status: "capacity_unavailable" },
  );
  assert.equal(ran, false);
  await f.db.transaction(async (tx) => {
    await tx.query("SELECT 1");
  });
  release.resolve();
  await Promise.all(holders);
  const owner = await f.db.pool.connect();
  try {
    await owner.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
      "owned",
    ]);
    assert.deepEqual(await f.db.tryWithLock("owned", async () => 1), {
      status: "lock_busy",
    });
    assert.deepEqual(await f.db.tryWithLock("free", async () => undefined), {
      status: "executed",
      value: undefined,
    });
  } finally {
    await owner.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
      "owned",
    ]);
    owner.release();
  }
  const cancelled = new AbortController();
  cancelled.abort(new Error("admission cancelled"));
  await assert.rejects(
    withOperationSignal(cancelled.signal, () =>
      f.db.tryWithLock("cancelled", async () => {
        ran = true;
      }),
    ),
    /admission cancelled/,
  );
  assert.equal(ran, false);
});

test("Gateway kick maps only actual entity contention to the existing member conflict", async (t) => {
  let kicks = 0;
  const f = await automationFixture(t, undefined, (remote) => {
    remote.post("/groups/remote-g/kick", async () => {
      kicks++;
      return { kicked: true };
    });
    remote.get("/groups/remote-g/members", async () => []);
  });
  const input = {
    groupId: "g",
    accountId: "account-2",
    targetPlatformUserId: "target",
  };
  const messages = new Messages(f.ctx);
  const release = deferred();
  let admitted = 0;
  const holders = Array.from({ length: 8 }, (_, index) =>
    f.db.withLock(`gateway-admission:${index}`, async () => {
      admitted++;
      await release.promise;
    }),
  );
  f.onCleanup(async () => {
    release.resolve();
    await Promise.allSettled(holders);
  });
  await until(async () => admitted === 8);
  await assert.rejects(messages.kick(input), LockCapacityUnavailableError);
  assert.equal(kicks, 0);
  release.resolve();
  await Promise.all(holders);
  const owner = await f.db.pool.connect();
  try {
    await owner.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
      "kick:g:target",
    ]);
    await assert.rejects(
      messages.kick(input),
      (error: unknown) =>
        error instanceof AppError &&
        error.status === 409 &&
        error.code === "SEND_TIMEOUT",
    );
    assert.equal(kicks, 0);
  } finally {
    await owner.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
      "kick:g:target",
    ]);
    owner.release();
  }
  assert.deepEqual(await messages.kick(input), { kicked: true });
  assert.equal(kicks, 1);
});
