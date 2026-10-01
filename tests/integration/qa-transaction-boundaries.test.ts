import assert from "node:assert/strict";
import { test } from "node:test";
import {
  withTestTransactionObserver,
  observeTestTransactionQuery,
  type TransactionBoundaryFact,
} from "../../apps/server/src/core/test-transaction-observer.js";
import { temporaryDatabase } from "../support/temporary-database.js";

test("engineering transaction boundaries bind actual BEGIN, domain SQL and acknowledged ROLLBACK to one backend", async (t) => {
  const { db } = await temporaryDatabase(t);
  const facts: TransactionBoundaryFact[] = [];
  await db.query("CREATE TABLE evidence_probe (id integer PRIMARY KEY)");
  let pid = 0;
  await assert.rejects(
    withTestTransactionObserver(
      (f) => facts.push(f),
      () =>
        db.transaction(async (tx) => {
          pid = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
          await observeTestTransactionQuery(tx, "owned-insert", () =>
            tx.query("INSERT INTO evidence_probe VALUES (1)"),
          );
          await observeTestTransactionQuery(tx, "owned-failing-insert", () =>
            tx.query("INSERT INTO evidence_probe VALUES (1)"),
          );
        }),
    ),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505",
      ),
  );
  assert.deepEqual(
    facts.map((f) => [f.phase, f.edge]),
    [
      ["begin", "called"],
      ["begin", "returned"],
      ["owned-insert", "called"],
      ["owned-insert", "returned"],
      ["owned-failing-insert", "called"],
      ["owned-failing-insert", "rejected"],
      ["rollback", "called"],
      ["rollback", "returned"],
    ],
  );
  assert.equal(new Set(facts.map((f) => f.transactionAttemptId)).size, 1);
  assert.ok(
    facts.every((f) => f.backendPid === pid && f.windowMs[1] >= f.windowMs[0]),
  );
  assert.equal(facts[5]!.sqlState, "23505");
  assert.equal((await db.query("SELECT * FROM evidence_probe")).rowCount, 0);
  assert.equal(
    (await db.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid,
    pid,
  );
  const size = facts.length;
  await db.transaction((tx) =>
    tx.query("INSERT INTO evidence_probe VALUES (2)"),
  );
  assert.equal(
    facts.length,
    size,
    "the next unobserved transaction must not inherit the completed scope",
  );
  assert.equal((await db.query("SELECT * FROM evidence_probe")).rows[0]!.id, 2);
  t.diagnostic(
    JSON.stringify({
      facts,
      noValuesOrRawErrors: !JSON.stringify(facts).includes("duplicate key"),
    }),
  );
});

test("throwing engineering recorders cannot change committed data or replace the original database error", async (t) => {
  const { db } = await temporaryDatabase(t);
  await db.query("CREATE TABLE evidence_probe (id integer PRIMARY KEY)");
  const brokenRecorder = () => {
    throw new Error("recorder unavailable");
  };
  await withTestTransactionObserver(brokenRecorder, () =>
    db.transaction((tx) => tx.query("INSERT INTO evidence_probe VALUES (1)")),
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM evidence_probe")).rows[0]!
      .n,
    1,
  );
  await assert.rejects(
    withTestTransactionObserver(brokenRecorder, () =>
      db.transaction((tx) => tx.query("INSERT INTO evidence_probe VALUES (1)")),
    ),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505",
      ),
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM evidence_probe")).rows[0]!
      .n,
    1,
  );
});
