import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { PoolClient } from "pg";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import { AgentTools } from "../../apps/server/src/modules/automation/tool-execution.js";
import type { ToolOutcome } from "../../apps/server/src/modules/automation/protocol.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { withOperationSignal } from "../../apps/server/src/core/db.js";
import {
  automationFixture,
  until,
} from "../support/core-automation-fixture.js";

async function prepared(
  t: Parameters<typeof automationFixture>[0],
  remaining = 60000,
  hostFailure?: Error,
) {
  const f = await automationFixture(t);
  const messages = new Messages(f.ctx);
  const message = await messages.enqueueSend({
    groupId: "g",
    accountId: "account-1",
    text: "already enqueued",
  });
  await f.db.query(
    "UPDATE messages SET delivery_status='accepted' WHERE client_msg_id=$1",
    [message.clientMsgId],
  );
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,history) VALUES('deadline-run','g','[]')",
  );
  await f.db.query(
    "INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state) VALUES('deadline-run',1,'tool_use','deadline-tool','send_message',$1,'ready')",
    [JSON.stringify({ text: "already enqueued", idempotency_key: "same-key" })],
  );
  await f.db.query(
    "INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES('deadline-run','same-key',$1)",
    [message.clientMsgId],
  );
  const outcomes: ToolOutcome[] = [];
  const tool = new AgentTools(f.ctx, messages, {
    completeStep: async (_run, _step, outcome) => {
      outcomes.push(outcome);
      if (hostFailure) throw hostFailure;
    },
    remaining: () => remaining,
    readRun: f.readRun,
    checkpoint: async () => {
      assert.fail("a reused send key must not audit");
    },
    finish: async () => {
      assert.fail("delivery does not terminate the run");
    },
    finishAfterStep: async () => {
      assert.fail("send is not finish");
    },
    settleAfterKick: async () => {
      assert.fail("send does not use kick settlement");
    },
    pause: async () => {
      assert.fail("a read failure does not invent an unknown tool");
    },
  });
  const run = await f.readRun("deadline-run");
  const [step] = await f.steps(run.id);
  return { ...f, outcomes, execute: () => tool.executeStep(run, step!) };
}

for (const edge of ["started", "returned", "failed"] as const) {
  test(`Agent send save observer isolation: only ${edge} recorder throws`, async (t) => {
    const originalError = new Error("original host persistence failure");
    const recorderError = new Error("engineering recorder unavailable");
    const f = await prepared(
      t,
      60000,
      edge === "failed" ? originalError : undefined,
    );
    const observed: string[] = [];
    const failingEvent = `send-tool-history-save-${edge}`;
    f.ctx.testLifecycleObserver = {
      record(fact) {
        observed.push(fact.kind);
        if (fact.kind === failingEvent) throw recorderError;
      },
    };
    if (edge === "failed")
      await assert.rejects(
        f.execute(),
        (error: unknown) => error === originalError,
      );
    else await f.execute();
    assert.equal(
      f.outcomes.length,
      1,
      "the observer cannot prevent or duplicate the host call",
    );
    assert.equal(f.outcomes[0]!.value.deliveryStatus, "accepted");
    assert.equal(observed.filter((kind) => kind === failingEvent).length, 1);
    assert.equal(
      observed.includes("send-tool-history-save-failed"),
      edge === "failed",
    );
    assert.equal(
      observed.includes("send-tool-history-save-returned"),
      edge !== "failed",
    );
    assert.equal(f.audits.length, 0);
    assert.equal(f.gatewayRequests.length, 0);
  });
}

function trackAccountReads(
  t: TestContext,
  f: Awaited<ReturnType<typeof prepared>>,
) {
  let count = 0;
  const seen = new WeakSet<PoolClient>();
  const acquire = (client: PoolClient) => {
    if (seen.has(client)) return;
    seen.add(client);
    const query = client.query.bind(client);
    t.mock.method(client, "query", (sql: unknown, ...args: unknown[]) => {
      if (
        typeof sql === "string" &&
        sql.startsWith("SELECT a.status FROM messages m JOIN accounts")
      )
        count++;
      return Reflect.apply(query, client, [sql, ...args]);
    });
  };
  f.db.pool.on("acquire", acquire);
  f.onCleanup(async () => {
    f.db.pool.removeListener("acquire", acquire);
  });
  return () => count;
}

for (const { table, messageStatus, accountStatus } of [
  { table: "messages", messageStatus: "accepted", accountStatus: "online" },
  { table: "accounts", messageStatus: "accepted", accountStatus: "online" },
  { table: "messages", messageStatus: "failed", accountStatus: "online" },
  { table: "accounts", messageStatus: "accepted", accountStatus: "suspended" },
] as const) {
  test(
    `Agent delivery completes its five-second observation while ${table} remains locked (${messageStatus}/${accountStatus})`,
    { timeout: 15000 },
    async (t) => {
      const f = await prepared(t);
      const observeCausal =
        table === "messages" && messageStatus === "accepted";
      const facts: LifecycleFact[] = [];
      if (observeCausal)
        f.ctx.testLifecycleObserver = {
          record: (fact) => facts.push(structuredClone(fact)),
        };
      const query = f.db.query.bind(f.db);
      await query("UPDATE messages SET delivery_status=$1,fail_code=$2", [
        messageStatus,
        messageStatus === "failed" ? "ACCOUNT_TERMINAL" : null,
      ]);
      await query("UPDATE accounts SET status=$1 WHERE id='account-1'", [
        accountStatus,
      ]);
      const accountReads = trackAccountReads(t, f);
      const locker = await f.db.pool.connect();
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        await locker.query("ROLLBACK");
        locker.release();
      };
      f.onCleanup(release);
      await locker.query("BEGIN");
      const lockerPid = (await locker.query("SELECT pg_backend_pid() AS pid"))
        .rows[0]!.pid as number;
      await locker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
      let causalSample:
        | { pid: number; backend_started: string; blockers: number[] }
        | undefined;
      const began = performance.now();
      const work = f.execute();
      // Fail-safe releases the fixture lock, not a product timer. A regression
      // without server cancellation will complete only after this release and
      // fail releasedAtResult, rather than leave teardown blocked forever.
      const safetyRelease = setTimeout(() => {
        void release();
      }, 6500);
      let elapsedMs = 0;
      let releasedAtResult = false;
      try {
        await until(async () => {
          const waiting = await query<{
            pid: number;
            backend_started: string;
            blockers: number[];
          }>(
            "SELECT pid,backend_start::text AS backend_started,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",
            [
              table === "messages"
                ? "SELECT * FROM messages WHERE client_msg_id%"
                : "SELECT a.status FROM messages m JOIN accounts%",
            ],
          );
          if (!observeCausal) return Boolean(waiting.rowCount);
          causalSample = waiting.rows.find(
            (row) =>
              row.blockers.includes(lockerPid) &&
              facts.some((fact) => {
                const backend = fact.backend as
                  { pid?: number; backendStarted?: string } | undefined;
                return (
                  fact.kind === "delivery-read-query-started" &&
                  fact.queryRole === "delivery-select" &&
                  backend?.pid === row.pid &&
                  backend.backendStarted === row.backend_started
                );
              }),
          );
          return Boolean(causalSample);
        });
        await work;
        elapsedMs = performance.now() - began;
        releasedAtResult = released;
      } finally {
        clearTimeout(safetyRelease);
        await release();
        await work;
      }
      t.diagnostic(
        JSON.stringify({
          table,
          messageStatus,
          accountStatus,
          elapsedMs,
          accountReads: accountReads(),
          releasedAtResult,
          outcome: f.outcomes[0],
        }),
      );
      assert.equal(f.outcomes.length, 1);
      assert.equal(f.outcomes[0]!.errorCode, "SEND_TIMEOUT");
      if (observeCausal) {
        assert.ok(
          causalSample,
          "real blocked reader must match the observer's exact PG identity and our locker",
        );
        const firstToolAttempt = facts.find(
          (fact) => fact.kind === "send-tool-entered",
        )!.attemptId;
        const reads = facts.filter((fact) =>
          fact.kind.startsWith("delivery-read-"),
        );
        assert.ok(reads.length > 0);
        for (const fact of reads) {
          assert.equal(fact.attemptId, firstToolAttempt);
          assert.equal(fact.runId, "deadline-run");
          assert.equal(fact.toolUseId, "deadline-tool");
          assert.equal(
            fact.clientMsgId,
            facts.find((candidate) => candidate.kind === "send-key-resolved")!
              .clientMsgId,
          );
        }
        const failures = reads.filter(
          (fact) =>
            fact.kind === "delivery-read-query-failed" &&
            fact.queryRole === "delivery-select" &&
            fact.sqlState === "55P03",
        );
        assert.ok(
          failures.length > 0,
          "actual server lock timeout must be observed",
        );
        for (const failure of failures) {
          assert.equal(failure.ownReadTimeout, true);
          const attempt = reads.filter(
            (fact) => fact.readAttemptId === failure.readAttemptId,
          );
          const failedAt = attempt.indexOf(failure);
          const rollbackStarted = attempt.findIndex(
            (fact) =>
              fact.kind === "delivery-read-query-started" &&
              fact.queryRole === "rollback",
          );
          const rollbackReturned = attempt.findIndex(
            (fact) =>
              fact.kind === "delivery-read-query-returned" &&
              fact.queryRole === "rollback",
          );
          const releasedAt = attempt.findIndex(
            (fact) => fact.kind === "delivery-read-client-released",
          );
          assert.ok(
            failedAt < rollbackStarted &&
              rollbackStarted < rollbackReturned &&
              rollbackReturned < releasedAt,
          );
          assert.equal(attempt[releasedAt]!.disposition, "returned-to-pool");
          assert.deepEqual(attempt[rollbackReturned]!.backend, failure.backend);
        }
        assert.equal(
          facts.filter((fact) => fact.kind === "send-tool-history-save-started")
            .length,
          1,
        );
        assert.equal(
          facts.filter(
            (fact) => fact.kind === "send-tool-history-save-returned",
          ).length,
          1,
        );
        assert.equal(
          facts.filter((fact) => fact.kind === "send-tool-history-committed")
            .length,
          0,
          "fixture host returns but does not perform a history transaction; never fabricate COMMIT",
        );
        assert.equal(
          JSON.stringify(reads).includes("already enqueued"),
          false,
          "observation must not publish message text or SQL values",
        );
        t.diagnostic(
          JSON.stringify({
            causalSample,
            sameAttemptRealLockTimeouts: failures.length,
            causalFacts: facts,
          }),
        );
      }
      assert.equal(
        releasedAtResult,
        false,
        "the tool returns while the table lock is still held",
      );
      if (table === "messages") assert.equal(accountReads(), 0);
      else
        assert.ok(
          accountReads() > 1,
          "retry local read timeouts throughout the original window",
        );
      assert.ok(
        elapsedMs >= 5000,
        "no early SEND_TIMEOUT; measured scheduling/cleanup tail is not a strict-time PASS",
      );
      assert.equal(f.audits.length, 0);
      assert.equal(f.gatewayRequests.length, 0);
      assert.equal((await query("SELECT * FROM agent_send_keys")).rowCount, 1);
      assert.equal(
        (await query("SELECT delivery_status FROM messages")).rows[0]!
          .delivery_status,
        messageStatus,
        "timeout must not rewrite the durable delivery fact",
      );
      assert.equal(
        (await query("SELECT status FROM accounts WHERE id='account-1'"))
          .rows[0]!.status,
        accountStatus,
      );
      await f.execute();
      assert.equal(f.outcomes.length, 2);
      const failed =
        messageStatus === "failed" || accountStatus === "suspended";
      assert.equal(
        f.outcomes[1]!.errorCode,
        failed ? "SEND_FAILED" : undefined,
      );
      if (!failed)
        assert.equal(f.outcomes[1]!.value.deliveryStatus, "accepted");
      assert.equal(f.audits.length, 0, "same-key retry does not repeat audit");
      assert.equal(
        f.gatewayRequests.length,
        0,
        "same-key retry does not resend",
      );
    },
  );
}

test("Agent delivery with no remaining wait does not start message or account reads", async (t) => {
  const f = await prepared(t, 0);
  const query = f.db.query.bind(f.db);
  const reads: string[] = [];
  const tracked = t.mock.method(
    f.db,
    "query",
    async (sql: string, values?: unknown[]) => {
      reads.push(sql);
      return query(sql, values);
    },
  );
  await f.execute();
  tracked.mock.restore();
  // executeStep must resolve the existing idempotency key before entering the
  // delivery wait; the zero-budget wait itself performs no database reads.
  assert.deepEqual(reads, [
    "SELECT client_msg_id FROM agent_send_keys WHERE run_id=$1 AND idempotency_key=$2",
  ]);
  assert.equal(f.outcomes[0]!.errorCode, "SEND_TIMEOUT");
});

test("Agent delivery retains the ownership failure after a blocked read and does not complete the step", async (t) => {
  const f = await prepared(t);
  const locker = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await locker.query("ROLLBACK");
    locker.release();
  };
  f.onCleanup(release);
  await locker.query("BEGIN");
  await locker.query("LOCK TABLE messages IN ACCESS EXCLUSIVE MODE");
  const owner = new AbortController();
  const failure = new Error("test: Agent lock ownership lost");
  const work = withOperationSignal(owner.signal, () => f.execute());
  const rejection = assert.rejects(work, (error) => error === failure);
  try {
    await until(async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM messages WHERE client_msg_id%'",
          )
        ).rowCount,
      ),
    );
    owner.abort(failure);
  } finally {
    await release();
    await rejection;
  }
  assert.deepEqual(f.outcomes, []);
  assert.equal(f.audits.length, 0);
  assert.equal(f.gatewayRequests.length, 0);
});

test("Agent delivery returns a timely sent observation without waiting for an unrelated account lock", async (t) => {
  const f = await prepared(t);
  await f.db.query(
    "UPDATE messages SET delivery_status='sent',msg_id='already-sent'",
  );
  await f.db.query(
    "UPDATE accounts SET status='suspended' WHERE id='account-1'",
  );
  const query = f.db.query.bind(f.db);
  const accountReads = trackAccountReads(t, f);
  const locker = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await locker.query("ROLLBACK");
    locker.release();
  };
  f.onCleanup(release);
  await locker.query("BEGIN");
  await locker.query("LOCK TABLE accounts IN ACCESS EXCLUSIVE MODE");
  const timer = setTimeout(() => {
    void release();
  }, 250);
  const began = performance.now();
  let releasedAtResult: boolean;
  try {
    await f.execute();
    releasedAtResult = released;
  } finally {
    clearTimeout(timer);
    await release();
  }
  t.diagnostic(
    JSON.stringify({
      case: "timely-sent",
      elapsedMs: performance.now() - began,
      accountReads: accountReads(),
      releasedAtResult,
    }),
  );
  assert.equal(f.outcomes[0]!.value.deliveryStatus, "sent");
  assert.equal(f.outcomes[0]!.errorCode, undefined);
  assert.equal(
    accountReads(),
    0,
    "sent already proves delivery and is exempt from account-terminal rejection",
  );
  assert.equal(
    releasedAtResult,
    false,
    "return while the irrelevant account lock is still held",
  );
});

for (const deliveryStatus of ["cancelled", "failed", "unknown"] as const) {
  test(
    `Agent delivery preserves ${deliveryStatus} and same-key sent recovery`,
    { timeout: 10000 },
    async (t) => {
      const f = await prepared(t);
      await f.db.query("UPDATE messages SET delivery_status=$1,fail_code=$2", [
        deliveryStatus,
        deliveryStatus === "cancelled"
          ? "GROUP_UNREACHABLE"
          : deliveryStatus === "failed"
            ? "ACCOUNT_TERMINAL"
            : null,
      ]);
      const started = performance.now();
      await f.execute();
      const elapsedMs = performance.now() - started;
      assert.equal(
        f.outcomes[0]!.errorCode,
        deliveryStatus === "unknown"
          ? "SEND_TIMEOUT"
          : deliveryStatus === "cancelled"
            ? "GROUP_UNREACHABLE"
            : "SEND_FAILED",
      );
      if (deliveryStatus === "unknown") assert.ok(elapsedMs >= 5000);
      assert.equal(
        (await f.db.query("SELECT delivery_status FROM messages")).rows[0]!
          .delivery_status,
        deliveryStatus,
      );
      await f.db.query(
        "UPDATE messages SET delivery_status='sent',msg_id='recovered-sent'",
      );
      await f.execute();
      assert.equal(f.outcomes[1]!.value.deliveryStatus, "sent");
      assert.equal(
        (await f.db.query("SELECT * FROM agent_send_keys")).rowCount,
        1,
      );
      assert.equal(f.audits.length, 0);
      assert.equal(f.gatewayRequests.length, 0);
      t.diagnostic(
        JSON.stringify({ deliveryStatus, elapsedMs, outcomes: f.outcomes }),
      );
    },
  );
}

test("Agent delivery observes sent after a timed-out message read is released inside the same window", async (t) => {
  const f = await prepared(t);
  await f.db.query("UPDATE messages SET delivery_status='unknown'");
  const locker = await f.db.pool.connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await locker.query("COMMIT");
    locker.release();
  };
  f.onCleanup(release);
  await locker.query("BEGIN");
  await locker.query("LOCK TABLE messages IN ACCESS EXCLUSIVE MODE");
  const started = performance.now();
  const work = f.execute();
  try {
    await until(async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM messages WHERE client_msg_id%'",
          )
        ).rowCount,
      ),
    );
    // Longer than the local 50 ms lock timeout, shorter than the tool window.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await locker.query(
      "UPDATE messages SET delivery_status='sent',msg_id='arrived-during-wait'",
    );
    await release();
    await work;
  } finally {
    await release();
    await work;
  }
  assert.equal(f.outcomes[0]!.value.deliveryStatus, "sent");
  assert.equal(f.outcomes[0]!.errorCode, undefined);
  assert.equal(f.audits.length, 0);
  assert.equal(f.gatewayRequests.length, 0);
  t.diagnostic(
    JSON.stringify({
      case: "sent-after-lock-release",
      elapsedMs: performance.now() - started,
    }),
  );
});

for (const deliveryStatus of ["sent", "accepted", "failed"] as const) {
  test(`Agent delivery retains timely ${deliveryStatus} when successful cleanup returns after the window`, async (t) => {
    const f = await prepared(t, 100);
    await f.db.query(
      "UPDATE messages SET delivery_status=$1,fail_code=$2,msg_id=$3",
      [
        deliveryStatus,
        deliveryStatus === "failed" ? "ACCOUNT_TERMINAL" : null,
        deliveryStatus === "sent" ? "timely-sent" : null,
      ],
    );
    let delayed = false;
    let observedAt = 0;
    const seen = new WeakSet<PoolClient>();
    const listener = (client: PoolClient) => {
      if (seen.has(client)) return;
      seen.add(client);
      const query = client.query.bind(client);
      t.mock.method(
        client,
        "query",
        async (sql: unknown, ...args: unknown[]) => {
          const result = await Reflect.apply(query, client, [sql, ...args]);
          if (
            typeof sql === "string" &&
            (sql.startsWith("SELECT * FROM messages WHERE client_msg_id") ||
              sql.startsWith("SELECT a.status FROM messages m JOIN accounts"))
          )
            observedAt = performance.now();
          if (sql === "ROLLBACK" && !delayed) {
            delayed = true;
            // The real server rollback succeeds. Only delivery of its completion
            // is held here, exposing cleanup/JS delay independently of SELECT.
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return result;
        },
      );
    };
    f.db.pool.on("acquire", listener);
    f.onCleanup(async () => {
      f.db.pool.removeListener("acquire", listener);
    });
    const started = performance.now();
    await f.execute();
    const elapsedMs = performance.now() - started;
    assert.ok(observedAt - started < 100);
    assert.ok(elapsedMs >= 150);
    assert.equal(delayed, true);
    assert.equal(
      f.outcomes[0]!.errorCode,
      deliveryStatus === "failed" ? "SEND_FAILED" : undefined,
    );
    if (deliveryStatus !== "failed")
      assert.equal(f.outcomes[0]!.value.deliveryStatus, deliveryStatus);
    assert.equal(f.audits.length, 0);
    assert.equal(f.gatewayRequests.length, 0);
    t.diagnostic(
      JSON.stringify({
        case: "timely-observation-late-cleanup",
        deliveryStatus,
        windowMs: 100,
        observedAfterMs: observedAt - started,
        elapsedMs,
        cleanupCompletionDelayMs: 150,
      }),
    );
  });
}
