import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import type { QueryResult, QueryResultRow } from "pg";
import { Database } from "../../apps/server/src/core/db.js";
import { temporaryDatabase } from "../support/temporary-database.js";

test("temporary database: failed CREATE response still drops the database and closes the admin pool", async (t) => {
  const observer = await temporaryDatabase(t);
  let cleanup: (() => Promise<void>) | undefined;
  let admin: Database | undefined;
  let name: string | undefined;
  const failure = new Error("Injected failure after CREATE DATABASE");
  const query = Database.prototype.query;
  const injected = t.mock.method(Database.prototype, "query", async function <
    R extends QueryResultRow,
  >(this: Database, sql: string, values?: unknown[]): Promise<QueryResult<R>> {
    const result = (await query.call(this, sql, values)) as QueryResult<R>;
    if (sql.startsWith("CREATE DATABASE ")) {
      assert.ok(cleanup, "cleanup must be registered before CREATE");
      admin = this;
      name = sql.slice("CREATE DATABASE ".length);
      throw failure;
    }
    return result;
  });
  try {
    await assert.rejects(
      temporaryDatabase({
        after(close) {
          cleanup = close;
          t.after(close);
        },
      }),
      failure,
    );
  } finally {
    injected.mock.restore();
  }
  assert.ok(name);
  assert.ok(admin);
  assert.ok(cleanup);
  assert.equal(
    (
      await observer.db.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        name,
      ])
    ).rowCount,
    1,
  );
  await cleanup();
  await cleanup();
  assert.equal(
    (
      await observer.db.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        name,
      ])
    ).rowCount,
    0,
  );
  await assert.rejects(admin.query("SELECT 1"), /pool after calling end/);
});

test("temporary database: cleanup failure cannot skip later resources and repeated close runs once", async (t) => {
  const observer = await temporaryDatabase(t);
  let cleanup: (() => Promise<void>) | undefined;
  const failure = new Error("Injected resource cleanup failure");
  const temporary = await temporaryDatabase({
    after(close) {
      cleanup = close;
      t.after(async () => {
        // Repeating cleanup may report only the deliberately injected error.
        await close().catch((error: unknown) => {
          assert.ok(error instanceof AggregateError);
          assert.deepEqual(error.errors, [failure]);
        });
      });
    },
  });
  const name = new URL(temporary.url).pathname.slice(1);
  const directory = await mkdtemp(join(tmpdir(), "kapibala-cleanup-"));
  temporary.onCleanup(() => rm(directory, { recursive: true, force: true }));
  const remote = Fastify({ forceCloseConnections: true });
  temporary.onCleanup(() => remote.close());
  const address = await remote.listen({ host: "127.0.0.1", port: 0 });
  let calls = 0;
  temporary.onCleanup(async () => {
    calls++;
    throw failure;
  });
  const first = temporary.close();
  assert.equal(
    temporary.close(),
    first,
    "concurrent close shares the same promise",
  );
  await assert.rejects(first, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [failure]);
    return true;
  });
  await assert.rejects(cleanup!(), AggregateError);
  assert.equal(calls, 1);
  assert.equal(remote.server.listening, false);
  await assert.rejects(fetch(address));
  await assert.rejects(stat(directory), { code: "ENOENT" });
  assert.equal(
    (
      await observer.db.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        name,
      ])
    ).rowCount,
    0,
  );
  await assert.rejects(
    temporary.db.query("SELECT 1"),
    /pool after calling end/,
  );
});
