import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { RemoteError } from "../../apps/server/src/core/errors.js";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { temporaryDatabase } from "../support/temporary-database.js";

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

async function until(check: () => Promise<boolean>, timeoutMs = 8000) {
  const deadline = performance.now() + timeoutMs;
  while (!(await check())) {
    assert.ok(performance.now() < deadline, "bounded condition did not settle");
    await delay(10);
  }
}

interface SendReply {
  status: 202 | 504;
  delayMs?: number;
  gate?: ReturnType<typeof gate>;
  landAfterMs?: number;
}

class ObservedRemoteClient extends RemoteClient {
  readonly timeouts: { wall: number; monotonic: number }[] = [];
  override async request<T>(
    path: string,
    body?: unknown,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      return await super.request<T>(path, body, timeoutMs, signal);
    } catch (error) {
      if (
        path.endsWith("/send") &&
        error instanceof RemoteError &&
        error.status === 504
      )
        this.timeouts.push({ wall: Date.now(), monotonic: performance.now() });
      throw error;
    }
  }
}

async function fixture(t: TestContext, replies: SendReply[]) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  await migrate(db);
  t.diagnostic(
    `isolated database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  const remote = Fastify({ logger: false, forceCloseConnections: true });
  const sends: { started: number; clientMsgId: string }[] = [];
  const queries: { started: number; status: number; delayMs: number }[] = [];
  const landed: { msgId: string; sentAt: string }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const query = { unavailable: false, delayMs: 0 };
  temporary.onCleanup(async () => {
    for (const reply of replies) reply.gate?.open();
    for (const timer of timers) clearTimeout(timer);
    await remote.close();
  });
  remote.post<{ Body: { clientMsgId: string } }>(
    "/groups/remote/send",
    async (request, reply) => {
      sends.push({
        started: performance.now(),
        clientMsgId: request.body.clientMsgId,
      });
      const plan = replies[sends.length - 1];
      assert.ok(
        plan,
        "unexpected extra send; the endpoint does not deduplicate",
      );
      await plan.gate?.promise;
      await delay(plan.delayMs ?? 0);
      if (plan.landAfterMs !== undefined) {
        const timer = setTimeout(() => {
          // Deliberately append every effect: duplicate POSTs cannot hide behind deduplication.
          landed.push({
            msgId: `effect-${landed.length + 1}`,
            sentAt: new Date().toISOString(),
          });
          timers.delete(timer);
        }, plan.landAfterMs);
        timers.add(timer);
      }
      return reply
        .code(plan.status)
        .send(
          plan.status === 504
            ? { code: "NETWORK_TIMEOUT" }
            : { accepted: true },
        );
    },
  );
  remote.get(
    "/groups/remote/messages/by-client-id/:id",
    async (_request, reply) => {
      // The response describes the snapshot at query ingress, even if its body is slow.
      const snapshot = landed[0];
      const status = query.unavailable ? 503 : snapshot ? 200 : 404;
      queries.push({
        started: performance.now(),
        status,
        delayMs: query.delayMs,
      });
      await delay(query.delayMs);
      return reply
        .code(status)
        .send(
          status === 200
            ? snapshot
            : { code: status === 503 ? "SERVICE_UNAVAILABLE" : "NOT_FOUND" },
        );
    },
  );
  const gateway = new ObservedRemoteClient(
    await remote.listen({ host: "127.0.0.1", port: 0 }),
  );
  const messages = new Messages({
    db,
    gateway,
    agent: gateway,
    log: remote.log,
  });
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id='platform-1' WHERE id='account-1'",
  );
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote','account-1')",
  );
  await db.query(
    "INSERT INTO members(group_id,platform_user_id,account_id,role) VALUES('g','platform-1','account-1','creator')",
  );
  const message = await messages.enqueueSend({
    groupId: "g",
    accountId: "account-1",
    text: t.name,
  });
  const read = () => messages.getMessage(message.clientMsgId!);
  const work = () => messages.accountWork("account-1");
  async function driveTo(status: string, timeoutMs = 8000) {
    const deadline = performance.now() + timeoutMs;
    while ((await read())?.deliveryStatus !== status) {
      assert.ok(performance.now() < deadline, `did not reach ${status}`);
      await delay(100);
      await work();
    }
    return performance.now();
  }
  async function assertEffects(sendsExpected: number, effectsExpected: number) {
    assert.equal(sends.length, sendsExpected);
    assert.equal(new Set(sends.map((send) => send.clientMsgId)).size, 1);
    assert.equal(landed.length, effectsExpected);
    assert.equal((await db.query("SELECT id FROM messages")).rowCount, 1);
  }
  return {
    db,
    gateway,
    messages,
    message,
    sends,
    queries,
    landed,
    query,
    read,
    work,
    driveTo,
    assertEffects,
  };
}

test("TB01 known 504 clock starts at receipt, before local result-persistence lock wait", async (t) => {
  const response = gate();
  const f = await fixture(t, [{ status: 504, gate: response }]);
  const work = f.work();
  await until(async () => f.sends.length === 1);
  const blocker = await f.db.pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
    response.open();
    await until(async () => f.gateway.timeouts.length === 1);
    await delay(750);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    response.open();
    await work;
  }
  const persisted = (
    await f.db.query<{ timeout_at: Date }>(
      "SELECT timeout_at FROM messages WHERE id=$1",
      [f.message.id],
    )
  ).rows[0]!.timeout_at;
  const anchorShiftMs = persisted.getTime() - f.gateway.timeouts[0]!.wall;
  t.diagnostic(
    JSON.stringify({ case: "TB01", localLockWaitMs: 750, anchorShiftMs }),
  );
  assert.ok(
    anchorShiftMs >= 0 && anchorShiftMs < 100,
    `504 receipt clock shifted by ${anchorShiftMs} ms`,
  );
  assert.equal((await f.read())?.deliveryStatus, "unknown");
  await f.assertEffects(1, 0);
});

test("TB02 a 1900ms initial 202 is accepted only after its real response", async (t) => {
  const f = await fixture(t, [{ status: 202, delayMs: 1900 }]);
  const start = performance.now();
  const work = f.work();
  await until(async () => f.sends.length === 1);
  await delay(400);
  assert.equal((await f.read())?.deliveryStatus, "queued");
  await work;
  const elapsedMs = performance.now() - start;
  t.diagnostic(
    JSON.stringify({ case: "TB02", sendStartToAcceptedMs: elapsedMs }),
  );
  assert.ok(elapsedMs >= 1900);
  assert.equal((await f.read())?.deliveryStatus, "accepted");
  assert.equal(f.gateway.timeouts.length, 0);
  await f.assertEffects(1, 0);
});

test("TB03 known 504, authoritative absence, then 1800ms retry 202 converges within five seconds", async (t) => {
  const f = await fixture(t, [{ status: 504 }, { status: 202, delayMs: 1800 }]);
  await f.work();
  assert.equal((await f.read())?.deliveryStatus, "unknown");
  const end = await f.driveTo("accepted");
  const first504ToAcceptedMs = end - f.gateway.timeouts[0]!.monotonic;
  t.diagnostic(
    JSON.stringify({
      case: "TB03",
      first504ToAcceptedMs,
      retryStartedMs: f.sends[1]!.started - f.gateway.timeouts[0]!.monotonic,
    }),
  );
  assert.ok(f.sends[1]!.started - f.gateway.timeouts[0]!.monotonic > 2000);
  assert.ok(first504ToAcceptedMs < 5000);
  await f.assertEffects(2, 0);
});

test("TB04 two immediate HTTP 504 responses and absence converge within the first five seconds", async (t) => {
  const f = await fixture(t, [{ status: 504 }, { status: 504 }]);
  await f.work();
  const end = await f.driveTo("failed");
  const first504ToFailedMs = end - f.gateway.timeouts[0]!.monotonic;
  const second504ToFailedMs = end - f.gateway.timeouts[1]!.monotonic;
  t.diagnostic(
    JSON.stringify({ case: "TB04", first504ToFailedMs, second504ToFailedMs }),
  );
  assert.ok(first504ToFailedMs < 5000);
  assert.ok(second504ToFailedMs > 2000);
  assert.equal((await f.read())?.failCode, "NETWORK_TIMEOUT");
  await f.work();
  await f.assertEffects(2, 0);
});

test("TB05 boundary: a 1400ms second 504 preserves its safety window but exceeds the first five seconds", async (t) => {
  const f = await fixture(t, [{ status: 504 }, { status: 504, delayMs: 1400 }]);
  await f.work();
  const end = await f.driveTo("failed");
  const first504ToFailedMs = end - f.gateway.timeouts[0]!.monotonic;
  const second504ToFailedMs = end - f.gateway.timeouts[1]!.monotonic;
  // This passes only the safety check. It explicitly records an OPEN first-504 SLA interpretation.
  t.diagnostic(
    JSON.stringify({
      case: "TB05",
      first504ToFailedMs,
      second504ToFailedMs,
      first504FiveSecondRequirementMet: first504ToFailedMs <= 5000,
      boundary:
        "open: first versus each 504 clock; no forced failure before authoritative absence",
    }),
  );
  assert.ok(first504ToFailedMs > 5000);
  assert.ok(second504ToFailedMs > 2000 && second504ToFailedMs < 5000);
  assert.equal((await f.read())?.failCode, "NETWORK_TIMEOUT");
  await f.work();
  await f.assertEffects(2, 0);
});

test("TB06 query 503 beyond five seconds stays unknown; a 1400ms positive query recovers within two seconds", async (t) => {
  const f = await fixture(t, [{ status: 504, landAfterMs: 1000 }]);
  f.query.unavailable = true;
  await f.work();
  while (performance.now() - f.gateway.timeouts[0]!.monotonic < 5200) {
    await delay(100);
    await f.work();
    assert.equal((await f.read())?.deliveryStatus, "unknown");
    assert.equal(f.sends.length, 1);
  }
  const availableAt = performance.now();
  f.query.unavailable = false;
  f.query.delayMs = 1400;
  const end = await f.driveTo("sent", 2500);
  const recoveredMs = end - availableAt;
  t.diagnostic(
    JSON.stringify({
      case: "TB06",
      first504ToSentMs: end - f.gateway.timeouts[0]!.monotonic,
      availabilityToSentMs: recoveredMs,
    }),
  );
  assert.ok(recoveredMs < 2000);
  assert.equal((await f.read())?.msgId, "effect-1");
  await f.assertEffects(1, 1);
});

test("TB07 a query exceeding the two-second HTTP timeout does not authorize retry or failure", async (t) => {
  const f = await fixture(t, [{ status: 504, landAfterMs: 1200 }]);
  f.query.delayMs = 2300;
  await f.work();
  const start = performance.now();
  await f.work();
  const queryElapsedMs = performance.now() - start;
  assert.ok(queryElapsedMs >= 1900 && queryElapsedMs < 2300);
  assert.equal((await f.read())?.deliveryStatus, "unknown");
  await f.assertEffects(1, 1);
  const availableAt = performance.now();
  f.query.delayMs = 0;
  const end = await f.driveTo("sent");
  t.diagnostic(
    JSON.stringify({
      case: "TB07",
      queryElapsedMs,
      fastQueryAvailabilityToSentMs: end - availableAt,
    }),
  );
  assert.ok(end - availableAt < 2000);
  await f.assertEffects(1, 1);
});

test("TB08 boundary: query recovery with absence and another 504 needs a new safety window", async (t) => {
  const f = await fixture(t, [{ status: 504 }, { status: 504 }]);
  f.query.unavailable = true;
  await f.work();
  while (performance.now() - f.gateway.timeouts[0]!.monotonic < 5200) {
    await delay(100);
    await f.work();
    assert.equal((await f.read())?.deliveryStatus, "unknown");
    assert.equal(f.sends.length, 1);
  }
  const availableAt = performance.now();
  f.query.unavailable = false;
  const end = await f.driveTo("failed");
  const availabilityToFailedMs = end - availableAt;
  const second504ToFailedMs = end - f.gateway.timeouts[1]!.monotonic;
  t.diagnostic(
    JSON.stringify({
      case: "TB08",
      availabilityToFailedMs,
      second504ToFailedMs,
      recoveryTwoSecondRequirementMet: availabilityToFailedMs <= 2000,
      boundary:
        "open: recovery deadline versus a safely authorized retry receiving another 504",
    }),
  );
  assert.ok(availabilityToFailedMs > 2000);
  assert.ok(second504ToFailedMs > 2000 && second504ToFailedMs < 5000);
  assert.equal((await f.read())?.failCode, "NETWORK_TIMEOUT");
  await f.work();
  await f.assertEffects(2, 0);
});
