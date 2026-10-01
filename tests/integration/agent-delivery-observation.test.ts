import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import {
  observeDelivery,
  type DeliveryReadFact,
} from "../../apps/server/src/modules/automation/delivery-observation.js";
import { withOperationSignal } from "../../apps/server/src/core/db.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import { until } from "../support/core-automation-fixture.js";

async function assertClean(
  db: Awaited<ReturnType<typeof temporaryDatabase>>["db"],
) {
  const result = await db.query(
    "SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock",
  );
  assert.deepEqual(result.rows[0], { statement: "0", lock: "0" });
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%'",
      )
    ).rowCount,
    0,
  );
}

test("delivery engineering observer does no identity SQL when absent and recorder failure cannot change a real result", async (t) => {
  const { db } = await temporaryDatabase(t);
  const queries: string[] = [];
  const seen = new WeakSet<PoolClient>();
  const acquire = (client: PoolClient) => {
    if (seen.has(client)) return;
    seen.add(client);
    const query = client.query.bind(client);
    t.mock.method(client, "query", (sql: unknown, ...args: unknown[]) => {
      if (typeof sql === "string") queries.push(sql);
      return Reflect.apply(query, client, [sql, ...args]);
    });
  };
  db.pool.on("acquire", acquire);
  try {
    assert.deepEqual(
      await observeDelivery(
        db,
        performance.now() + 2000,
        async (reader) => (await reader.query("SELECT 42 AS value")).rows[0],
      ),
      { status: "observed", value: { value: 42 } },
    );
    assert.equal(
      queries.some((sql) => sql.includes("backend_start")),
      false,
    );
    const facts: DeliveryReadFact[] = [];
    assert.deepEqual(
      await observeDelivery(
        db,
        performance.now() + 2000,
        async (reader) => (await reader.query("SELECT 43 AS value")).rows[0],
        (fact) => {
          if (
            fact.kind === "delivery-read-query-returned" &&
            fact.queryRole === "delivery-select"
          )
            throw new Error("failed engineering recorder");
          facts.push(fact);
        },
      ),
      { status: "observed", value: { value: 43 } },
    );
    assert.ok(queries.some((sql) => sql.includes("backend_start")));
    assert.equal(
      facts.some((fact) => fact.kind === "delivery-read-client-released"),
      false,
      "an interrupted recorder cannot claim complete cleanup evidence",
    );
  } finally {
    db.pool.removeListener("acquire", acquire);
  }
  await assertClean(db);
});

test("delivery SELECT server timeout is acknowledged and its transaction/settings are cleared before reuse", async (t) => {
  const { db } = await temporaryDatabase(t);
  let pid: number | undefined;
  const started = performance.now();
  const facts: DeliveryReadFact[] = [];
  const observed = await observeDelivery(
    db,
    performance.now() + 2000,
    async (reader) => {
      pid = (
        await reader.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      return reader.query("SELECT pg_sleep(1)");
    },
    (fact) => facts.push(structuredClone(fact)),
  );
  const elapsedMs = performance.now() - started;
  assert.deepEqual(observed, { status: "retry" });
  const timeout = facts.find(
    (fact) =>
      fact.kind === "delivery-read-query-failed" &&
      fact.queryRole === "delivery-select" &&
      fact.sqlState === "57014",
  );
  assert.ok(timeout);
  assert.equal(timeout.ownReadTimeout, true);
  assert.equal((timeout.backend as { pid: number }).pid, pid);
  assert.ok(
    facts.find(
      (fact) =>
        fact.kind === "delivery-read-query-returned" &&
        fact.queryRole === "rollback",
    ),
  );
  assert.equal(
    facts.some((fact) => fact.kind === "delivery-read-connection-ended"),
    false,
    "returning to pool is not closing the connection",
  );
  assert.equal(
    (await db.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid,
    pid,
    "reuse the acknowledged, rolled-back connection",
  );
  await assertClean(db);
  assert.deepEqual(
    await observeDelivery(
      db,
      performance.now() + 2000,
      async (reader) => (await reader.query("SELECT 42 AS value")).rows[0],
    ),
    { status: "observed", value: { value: 42 } },
  );
  t.diagnostic(
    JSON.stringify({
      elapsedMs,
      statementTimeoutMs: 100,
      originalSleepMs: 1000,
      sameConnectionReused: true,
    }),
  );
});

for (const action of ["cancel", "terminate"] as const) {
  test(`delivery does not swallow a real database ${action} as an observation timeout`, async (t) => {
    const { db, onCleanup } = await temporaryDatabase(t);
    const control = await db.pool.connect();
    onCleanup(async () => control.release());
    let pid: number | undefined;
    const facts: DeliveryReadFact[] = [];
    const work = observeDelivery(
      db,
      performance.now() + 2000,
      async (reader) => {
        pid = (
          await reader.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
        ).rows[0]!.pid;
        return reader.query("SELECT pg_sleep(1) /* external-interrupt */");
      },
      (fact) => facts.push(structuredClone(fact)),
    );
    const rejected = assert.rejects(work, (error: unknown) => {
      assert.ok(error instanceof Error);
      if (action === "cancel") {
        assert.equal((error as Error & { code: string }).code, "57014");
        assert.equal(error.message, "canceling statement due to user request");
      } else
        assert.match(
          error.message,
          /terminating connection due to administrator command|Connection terminated/,
        );
      return true;
    });
    await until(async () =>
      Boolean(
        pid &&
        (
          await control.query(
            "SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND query LIKE 'SELECT pg_sleep(1)%'",
            [pid],
          )
        ).rowCount,
      ),
    );
    await control.query(`SELECT pg_${action}_backend($1)`, [pid]);
    await rejected;
    const failed = facts.find(
      (fact) =>
        fact.kind === "delivery-read-query-failed" &&
        fact.queryRole === "delivery-select",
    );
    assert.ok(failed);
    assert.equal(
      failed.ownReadTimeout,
      false,
      "a real user cancellation/termination cannot be labelled as our timeout",
    );
    if (action === "cancel") assert.equal(failed.sqlState, "57014");
    if (action === "terminate")
      await until(async () =>
        facts.some((fact) => fact.kind === "delivery-read-connection-ended"),
      );
    await assertClean(db);
  });
}

test("delivery propagates non-timeout SQL errors rather than converting them to SEND_TIMEOUT", async (t) => {
  const { db } = await temporaryDatabase(t);
  await assert.rejects(
    observeDelivery(db, performance.now() + 2000, (reader) =>
      reader.query("SELECT * FROM deliberately_missing_table"),
    ),
    { code: "42P01" },
  );
  await assertClean(db);
});

test("delivery rollback failure cannot turn an acknowledged statement timeout into retry", async (t) => {
  const { db } = await temporaryDatabase(t);
  const failure = new Error("test: rollback transport failure");
  let lease: PoolClient | undefined;
  let rolledBack = false;
  const facts: DeliveryReadFact[] = [];
  const listener = (client: PoolClient) => {
    if (lease) return;
    lease = client;
    const query = client.query.bind(client);
    t.mock.method(client, "query", async (sql: unknown, ...args: unknown[]) => {
      if (sql === "ROLLBACK") {
        rolledBack = true;
        throw failure;
      }
      return Reflect.apply(query, client, [sql, ...args]);
    });
  };
  db.pool.on("acquire", listener);
  try {
    await assert.rejects(
      observeDelivery(
        db,
        performance.now() + 2000,
        (reader) => reader.query("SELECT pg_sleep(1)"),
        (fact) => facts.push(structuredClone(fact)),
      ),
      (error) => error === failure,
    );
  } finally {
    db.pool.removeListener("acquire", listener);
  }
  assert.equal(rolledBack, true);
  assert.ok(
    facts.find(
      (fact) =>
        fact.kind === "delivery-read-query-failed" &&
        fact.queryRole === "rollback",
    ),
  );
  assert.equal(
    facts.some(
      (fact) =>
        fact.kind === "delivery-read-query-returned" &&
        fact.queryRole === "rollback",
    ),
    false,
    "rollback initiation is not acknowledgement",
  );
  assert.equal(
    facts.find((fact) => fact.kind === "delivery-read-client-released")!
      .disposition,
    "destroy-requested",
  );
  assert.equal(
    db.pool.totalCount,
    0,
    "discard the lease with unconfirmed transaction cleanup",
  );
  await assertClean(db);
});

test("delivery preserves ownership loss during rollback after a server timeout", async (t) => {
  const { db } = await temporaryDatabase(t);
  const owner = new AbortController();
  const failure = new Error("test: ownership lost during cleanup");
  let lease: PoolClient | undefined;
  const listener = (client: PoolClient) => {
    if (lease) return;
    lease = client;
    const query = client.query.bind(client);
    t.mock.method(client, "query", async (sql: unknown, ...args: unknown[]) => {
      const result = await Reflect.apply(query, client, [sql, ...args]);
      if (sql === "ROLLBACK") owner.abort(failure);
      return result;
    });
  };
  db.pool.on("acquire", listener);
  try {
    await assert.rejects(
      withOperationSignal(owner.signal, () =>
        observeDelivery(db, performance.now() + 2000, (reader) =>
          reader.query("SELECT pg_sleep(1)"),
        ),
      ),
      (error) => error === failure,
    );
  } finally {
    db.pool.removeListener("acquire", listener);
  }
  await assertClean(db);
});

test("delivery does not accept a SELECT result delivered after its observation deadline", async (t) => {
  const { db } = await temporaryDatabase(t);
  const seen = new WeakSet<PoolClient>();
  const listener = (client: PoolClient) => {
    if (seen.has(client)) return;
    seen.add(client);
    const query = client.query.bind(client);
    t.mock.method(client, "query", async (sql: unknown, ...args: unknown[]) => {
      const result = await Reflect.apply(query, client, [sql, ...args]);
      if (sql === "SELECT 'sent' AS status")
        await new Promise((resolve) => setTimeout(resolve, 150));
      return result;
    });
  };
  db.pool.on("acquire", listener);
  let callbackCompleted = false;
  try {
    const observation = await observeDelivery(
      db,
      performance.now() + 100,
      async (reader) => {
        const result = await reader.query("SELECT 'sent' AS status");
        callbackCompleted = true;
        return result.rows[0];
      },
    );
    assert.deepEqual(observation, { status: "retry" });
    assert.equal(
      callbackCompleted,
      false,
      "a late read cannot become a timely delivery fact",
    );
  } finally {
    db.pool.removeListener("acquire", listener);
  }
  await assertClean(db);
});
