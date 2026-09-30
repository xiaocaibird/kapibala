import { test } from "node:test";
import assert from "node:assert/strict";
import { temporaryDatabase } from "../support/temporary-database.js";
test("PostgreSQL lock admission preserves connection capacity for nested transactions", async (t) => {
  const { db } = await temporaryDatabase(t);
  const work = Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      db.withLock(`capacity:${i}`, () =>
        db.transaction(async (tx) => {
          await tx.query("SELECT pg_sleep(0.05)");
          return i;
        }),
      ),
    ),
  );
  const results = await Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Lock holders exhausted the connection pool")),
        2500,
      );
      timer.unref();
    }),
  ]);
  assert.equal(results.filter((x) => x !== undefined).length, 8);
  assert.equal(
    await db.withLock("capacity:after", () =>
      db.transaction(async (tx) => {
        await tx.query("SELECT 1");
        return "available";
      }),
    ),
    "available",
  );
});
