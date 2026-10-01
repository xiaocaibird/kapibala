import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { runtimeFixture } from "../support/runtime-observation-fixture.js";
import { delay, until } from "../support/core-automation-fixture.js";

test("RT01 default main exposes no runtime controller and binding requires real guardian/port/revision", async (t) => {
  const f = await runtimeFixture(t, true);
  assert.deepEqual(await readdir(f.directory), []);
  assert.equal((await f.capabilities()).status, 409);
});

test("RT02 real savepoint fault preserves original transaction and observes newer HTTP waiting", async (t) => {
  const f = await runtimeFixture(t);
  const caps = await f.capabilities();
  assert.equal(caps.status, 200, JSON.stringify(caps.value));
  assert.equal(
    (caps.value as { protocol: string }).protocol,
    "qa-runtime-observation/1",
  );
  assert.equal(
    (caps.value as { binding: { observedOwnerToken: string } }).binding
      .observedOwnerToken,
    f.token,
  );
  assert.deepEqual((caps.value as { capabilities: string[] }).capabilities, [
    "account-local-save",
    "account-intent-wait",
    "module-tick",
    "module-tick-independent",
    "activity-witness",
    "activity-safe-boundary",
    "tool-wait-witness",
    "message-recovery-witness",
    "agent-lifecycle-witness",
    "agent-run-lock-witness",
    "media-reference-witness",
  ]);
  for (const target of [
    { ...f.target(), pid: process.pid },
    { ...f.target(), revision: "0".repeat(40) },
    { ...f.target(), apiUrl: "http://127.0.0.1:1" },
  ])
    assert.equal((await f.capabilities(target)).status, 409);
  const lease = await f.hold();
  const connect = f.api("/api/accounts/account-1/connect", "POST", {});
  const held = await f.event(lease.id, "local-retry-held");
  assert.equal(held.state, "held");
  assert.equal(f.connects(), 1);
  assert.equal((await f.account()).status, "idle");
  assert.equal((await f.stateEvents()).length, 0);
  const disconnect = f.api("/api/accounts/account-1/transition", "POST", {
    expectedFrom: "online",
    to: "disconnected",
  });
  const waiting = await f.event(lease.id, "newer-account-intent-waiting");
  assert.equal(waiting.state, "held");
  assert.equal(f.disconnects(), 0);
  assert.equal((await f.account()).status, "idle");
  assert.equal((await f.stateEvents()).length, 0);
  assert.equal(
    f.frames.some((frame) =>
      JSON.stringify(frame).includes("account_status_changed"),
    ),
    false,
  );
  const original = waiting.events.find((e) => e.kind === "remote-success")!;
  const actualWait = waiting.events.find(
    (e) => e.kind === "newer-account-intent-waiting",
  )!;
  const newer = actualWait.waitingIntent as {
    requestId: string;
    waitingForTransactionId: string;
  };
  assert.notEqual(newer.requestId, original.requestId);
  assert.equal(newer.waitingForTransactionId, original.transactionId);
  await f.advance(lease.id);
  const results = await Promise.all([connect, disconnect]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  const final = await f.event(lease.id, "local-save-committed");
  assert.equal((await f.account()).status, "disconnected");
  assert.equal(f.connects(), 1);
  assert.equal(f.disconnects(), 1);
  assert.deepEqual(
    final.events.map((e) => e.kind),
    [
      "remote-success",
      "local-save-failed",
      "local-retry-held",
      "newer-account-intent-waiting",
      "local-save-committed",
    ],
  );
  for (const e of final.events) {
    assert.equal(e.transactionId, original.transactionId);
    assert.equal(e.requestId, original.requestId);
    assert.equal(e.attemptId, original.attemptId);
  }
  assert.equal(final.events.at(-1)!.commitBoundary, "outer-commit-confirmed");
  assert.equal((await f.stateEvents()).length, 2);
  f.evidence(final);
  await f.snapshot(lease.id, "DELETE");
});

test("RT03 persistent SQL failure exhausts native retries, real rollback, no automatic remote replay", async (t) => {
  const f = await runtimeFixture(t);
  const lease = await f.hold("account-save-persistent");
  const result = await f.api("/api/accounts/account-1/connect", "POST", {});
  assert.equal(result.status, 500);
  assert.equal(
    (result.value as { error: { code: string } }).error.code,
    "INTERNAL_ERROR",
  );
  const final = await f.event(lease.id, "transaction-rolled-back");
  assert.equal(
    final.events.filter((e) => e.kind === "local-save-failed").length,
    3,
  );
  assert.equal(
    final.events.some((e) => e.kind === "local-save-committed"),
    false,
  );
  assert.equal((await f.account()).status, "idle");
  assert.equal((await f.stateEvents()).length, 0);
  await delay(200);
  assert.equal(f.connects(), 1);
  assert.equal(f.disconnects(), 0);
  assert.equal(
    f.frames.some((frame) =>
      JSON.stringify(frame).includes("account_status_changed"),
    ),
    false,
  );
  await f.snapshot(lease.id, "DELETE");
  assert.equal(
    (await f.api("/api/accounts/account-1/connect", "POST", {})).status,
    200,
  );
  assert.equal(
    (
      await f.api("/api/accounts/account-1/transition", "POST", {
        expectedFrom: "online",
        to: "disconnected",
      })
    ).status,
    200,
  );
  assert.equal(f.connects(), 2);
  assert.equal(f.disconnects(), 1);
  assert.equal((await f.account()).status, "disconnected");
  f.evidence(final);
});

test("RT04 module diagnostics follow real fail, before-start gate, running, success and release", async (t) => {
  const f = await runtimeFixture(t);
  const diagnostics = async () => {
    const r = await f.api("/api/diagnostics/background");
    assert.equal(r.status, 200);
    assert.equal(
      JSON.stringify(r.value).includes("qa-runtime-developer-check"),
      false,
    );
    return (
      r.value as {
        modules: {
          name: string;
          status: string;
          ticks: number;
          consecutiveFailures: number;
          lastFailedAt: string;
          lastSucceededAt: string | null;
          runningForMs: number | null;
        }[];
      }
    ).modules.find((m) => m.name === "gateway")!;
  };
  const lease = await f.hold("module-fail-then-hold");
  const failedSnapshot = await f.event(lease.id, "module-before-next-held");
  assert.equal(failedSnapshot.state, "held");
  const failed = await diagnostics();
  assert.equal(failed.status, "failed");
  assert.ok(failed.consecutiveFailures >= 1);
  assert.ok(failed.lastFailedAt);
  await f.advance(lease.id);
  await f.event(lease.id, "module-running-held");
  const running = await diagnostics();
  assert.equal(running.status, "running");
  assert.equal(running.lastSucceededAt, failed.lastSucceededAt);
  await delay(30);
  const later = await diagnostics();
  assert.ok(later.runningForMs! >= running.runningForMs!);
  await f.advance(lease.id);
  const finished = await f.event(lease.id, "module-succeeded");
  const done = await diagnostics();
  assert.equal(done.status, "idle");
  assert.equal(done.consecutiveFailures, 0);
  assert.equal(done.lastFailedAt, failed.lastFailedAt);
  assert.notEqual(done.lastSucceededAt, failed.lastSucceededAt);
  assert.ok(done.ticks > failed.ticks);
  assert.equal(
    (await f.advance(lease.id)).state,
    "held",
    "Completed lifecycle remains held until DELETE/TTL",
  );
  await delay(150);
  assert.equal((await diagnostics()).ticks, done.ticks);
  await f.snapshot(lease.id, "DELETE");
  await until(async () => (await diagnostics()).ticks > done.ticks);
  f.evidence({ events: finished.events, failed, running, done });
});

test("RT05 UUID replay, lease conflicts, independent TTL release, body validation and old instance history", async (t) => {
  const f = await runtimeFixture(t);
  const lease = await f.hold("account-save-once", 5000);
  assert.deepEqual(
    (await f.request("PUT", `/leases/${lease.id}`, lease.input)).value,
    lease.snapshot,
  );
  assert.equal(
    (
      await f.request("PUT", `/leases/${lease.id}`, {
        ...lease.input,
        ttlMs: 5001,
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request("PUT", `/leases/${randomUUID()}`, f.body())).status,
    409,
  );
  assert.equal(
    (await f.request("POST", `/leases/${lease.id}/advance`, {})).status,
    400,
  );
  assert.equal(
    (
      await f.request("PUT", `/leases/${randomUUID()}`, {
        ...f.body(),
        sql: "select 1",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        "PUT",
        `/leases/${randomUUID()}`,
        f.body("account-save-once", 20000, "account-2"),
      )
    ).status,
    409,
  );
  const connect = f.api("/api/accounts/account-1/connect", "POST", {});
  await f.event(lease.id, "local-retry-held");
  await until(
    async () => (await f.snapshot(lease.id)).state === "released",
    10000,
  );
  assert.equal((await connect).status, 200);
  await f.event(lease.id, "local-save-committed");
  const second = await f.hold("account-save-once", 20000, "account-2");
  assert.equal((await f.snapshot(second.id)).state, "armed");
  await f.kill();
  const oldTarget = second.input.target;
  const dead = await f.snapshot(second.id);
  assert.equal(dead.state, "released");
  await f.start();
  assert.notEqual(f.target().pid, oldTarget.pid);
  assert.equal((await f.capabilities(oldTarget)).status, 409);
  assert.deepEqual(await f.snapshot(second.id, "DELETE"), dead);
  assert.equal((await f.capabilities()).status, 200);
  const current = await f.hold("account-save-once", 20000, "account-2");
  await f.snapshot(second.id, "DELETE");
  assert.equal((await f.snapshot(current.id)).state, "armed");
  await f.snapshot(current.id, "DELETE");
  f.evidence({ old: dead, current: current.snapshot });
});

test("RT06 actual module operation failure after advance is never reported as success", async () => {
  const { ObservedRuntimeDatabase, RuntimeObservation } =
    await import("../../scripts/qa-runtime-observation/runtime.js");
  // No connection or business fixture is needed to drive the scheduler hook's
  // negative callback path. The real REST lifecycle is exercised by RT04.
  const db = new ObservedRuntimeDatabase(
    "postgres://unused@127.0.0.1:1/unused",
  );
  const runtime = new RuntimeObservation(db);
  const id = randomUUID();
  runtime.modules(["failing-module"]);
  const target = {
    apiUrl: "http://127.0.0.1:1",
    revision: "0".repeat(40),
    pid: process.pid,
  };
  try {
    await runtime.establish(
      id,
      {
        protocol: "qa-runtime-observation/1",
        target,
        ttlMs: 5000,
        mode: "module-fail-then-hold",
        correlation: {
          kind: "module",
          module: "failing-module",
          attemptLabel: randomUUID(),
        },
        faultMarker: "qa-runtime-real-failure",
      },
      new Date(Date.now() + 5000).toISOString(),
      { ...target, observedOwnerToken: "test-only" },
    );
    await assert.rejects(
      runtime.tick("failing-module", async () => {}),
      /qa-runtime-real-failure/,
    );
    runtime.tickFinished("failing-module", false);
    const before = runtime.beforeTick("failing-module");
    await runtime.advance(id);
    await before;
    const execution = runtime.tick("failing-module", async () => {
      throw new Error("real operation failed");
    });
    await runtime.advance(id);
    await assert.rejects(execution, /real operation failed/);
    runtime.tickFinished("failing-module", false);
    const snapshot = runtime.snapshot(id);
    assert.equal(
      snapshot.events.some((e) => e.kind === "module-succeeded"),
      false,
    );
    assert.equal(snapshot.events.at(-1)!.failureSource, "module-operation");
    const failed = snapshot.events.find((e) => e.kind === "module-failed")!;
    const running = snapshot.events.find(
      (e) => e.kind === "module-running-held",
    )!;
    assert.notEqual(
      failed.attemptId,
      running.attemptId,
      "Distinct real ticks have distinct attempt identities",
    );
  } finally {
    await runtime.close();
    await db.close();
  }
});
