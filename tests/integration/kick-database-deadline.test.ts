import assert from "node:assert/strict";
import { createServer, createConnection, type Socket } from "node:net";
import { test } from "node:test";
import type { PoolClient } from "pg";
import {
  Database,
  DatabaseDeadlineExceededError,
  currentDatabaseDeadline,
  emit,
  withDatabaseDeadline,
  withoutDatabaseDeadline,
} from "../../apps/server/src/core/db.js";
import {
  withTestTransactionObserver,
  type TransactionBoundaryFact,
} from "../../apps/server/src/core/test-transaction-observer.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import { delay, until } from "../support/core-automation-fixture.js";

async function createProbe(db: Database) {
  await db.query(
    "CREATE TABLE deadline_probe(id integer PRIMARY KEY,value integer NOT NULL)",
  );
  await db.query("INSERT INTO deadline_probe VALUES(1,0)");
  await db.query("CREATE TABLE events(type text,payload jsonb)");
}

async function probe(db: Database) {
  return (
    await db.query(
      "SELECT value,(SELECT count(*)::integer FROM events) AS events FROM deadline_probe WHERE id=1",
    )
  ).rows[0];
}

async function cleanSettings(db: Database) {
  assert.deepEqual(
    (
      await db.query(
        "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock",
      )
    ).rows[0],
    { statement: "0", lock: "0" },
  );
}

test("kick database deadline scope is explicit, nested deadlines shrink and clearing preserves its parent", async () => {
  const outer = performance.now() + 1000;
  assert.equal(currentDatabaseDeadline(), undefined);
  await withDatabaseDeadline(outer, async () => {
    assert.equal(currentDatabaseDeadline(), outer);
    await withDatabaseDeadline(outer + 1000, async () => {
      assert.equal(currentDatabaseDeadline(), outer);
    });
    await withDatabaseDeadline(outer - 100, async () => {
      assert.equal(currentDatabaseDeadline(), outer - 100);
    });
    await withoutDatabaseDeadline(async () => {
      assert.equal(currentDatabaseDeadline(), undefined);
    });
    assert.equal(currentDatabaseDeadline(), outer);
  });
  assert.equal(currentDatabaseDeadline(), undefined);
});

test("kick database deadline releases a late pool checkout without issuing SQL", async (t) => {
  const { db } = await temporaryDatabase(t);
  db.pool.options.max = 1;
  const holder = await db.pool.connect();
  let held = true;
  t.after(() => {
    if (held) holder.release();
  });
  const query = holder.query.bind(holder);
  let queries = 0;
  t.mock.method(holder, "query", (...args: unknown[]) => {
    queries++;
    return Reflect.apply(query, holder, args);
  });
  await assert.rejects(
    withDatabaseDeadline(performance.now() + 70, () => db.query("SELECT 1")),
    (error) =>
      error instanceof DatabaseDeadlineExceededError &&
      error.phase === "connect",
  );
  assert.equal(db.pool.waitingCount, 1);
  holder.release();
  held = false;
  await until(
    async () => db.pool.waitingCount === 0 && db.pool.idleCount === 1,
  );
  assert.equal(
    queries,
    0,
    "expired queued work must not revive on a late checkout",
  );
  await cleanSettings(db);
});

test("kick database deadline admits a released row lock and commits domain data and events together", async (t) => {
  const { db, onCleanup } = await temporaryDatabase(t);
  await createProbe(db);
  const blocker = await db.pool.connect();
  onCleanup(async () => {
    await blocker.query("ROLLBACK");
    blocker.release();
  });
  await blocker.query("BEGIN");
  await blocker.query("SELECT * FROM deadline_probe WHERE id=1 FOR UPDATE");
  const facts: TransactionBoundaryFact[] = [];
  const release = delay(60).then(() => blocker.query("ROLLBACK"));
  const result = await withDatabaseDeadline(performance.now() + 800, () =>
    withTestTransactionObserver(
      (fact) => facts.push(fact),
      () =>
        db.transaction(async (tx) => {
          await tx.query("UPDATE deadline_probe SET value=1 WHERE id=1");
          await emit(tx, "inconsistency", {
            kind: "agent_recovery_unknown",
            ref: "deadline-test",
            message: "committed",
          });
          return "done";
        }),
    ),
  );
  await release;
  assert.equal(result, "done");
  assert.deepEqual(await probe(db), { value: 1, events: 1 });
  assert.ok(
    facts.some((fact) => fact.phase === "commit" && fact.edge === "returned"),
  );
  assert.equal(
    facts.some((fact) => fact.phase === "rollback"),
    false,
  );
  await cleanSettings(db);
});

test("kick database deadline preserves stricter existing session timeouts and restores them for ordinary work", async (t) => {
  const { db } = await temporaryDatabase(t);
  db.pool.options.max = 1;
  await db.query("SET statement_timeout='100ms'");
  await db.query("SET lock_timeout='40ms'");
  const settings = await withDatabaseDeadline(performance.now() + 1000, () =>
    db.transaction(
      async (tx) =>
        (
          await tx.query(
            "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock",
          )
        ).rows[0],
    ),
  );
  assert.deepEqual(settings, { statement: "100ms", lock: "40ms" });
  await assert.rejects(
    withDatabaseDeadline(performance.now() + 1000, () =>
      db.transaction(async (tx) => {
        await tx.query("SELECT pg_sleep(0.3)");
      }),
    ),
    (error) =>
      error instanceof Error && "code" in error && error.code === "57014",
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock",
      )
    ).rows[0],
    { statement: "100ms", lock: "40ms" },
  );
});

test("kick database deadline cancels a long row wait at PostgreSQL and acknowledges rollback before reuse", async (t) => {
  const { db, onCleanup } = await temporaryDatabase(t);
  await createProbe(db);
  const blocker = await db.pool.connect();
  onCleanup(async () => {
    await blocker.query("ROLLBACK");
    blocker.release();
  });
  await blocker.query("BEGIN");
  await blocker.query("SELECT * FROM deadline_probe WHERE id=1 FOR UPDATE");
  const facts: TransactionBoundaryFact[] = [];
  await assert.rejects(
    withDatabaseDeadline(performance.now() + 250, () =>
      withTestTransactionObserver(
        (fact) => facts.push(fact),
        () =>
          db.transaction(async (tx) => {
            await tx.query("UPDATE deadline_probe SET value=1 WHERE id=1");
            await emit(tx, "inconsistency", {
              kind: "agent_recovery_unknown",
              ref: "deadline-test",
              message: "must roll back",
            });
          }),
      ),
    ),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      ["55P03", "57014"].includes(String(error.code)),
  );
  assert.ok(
    facts.some((fact) => fact.phase === "rollback" && fact.edge === "returned"),
  );
  assert.equal(
    facts.some((fact) => fact.phase === "commit"),
    false,
  );
  assert.equal(
    (await db.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid,
    facts.find((fact) => fact.phase === "begin")!.backendPid,
    "only the acknowledged rollback permits reusing this actual connection",
  );
  assert.deepEqual(await probe(db), { value: 0, events: 0 });
  await cleanSettings(db);
});

test("kick database local read timeout destroys the client and never queues rollback behind the unacknowledged query", async (t) => {
  const { db } = await temporaryDatabase(t);
  await createProbe(db);
  let timedOutPid: number | undefined;
  const seen = new WeakSet<PoolClient>();
  const acquire = (client: PoolClient) => {
    if (seen.has(client)) return;
    seen.add(client);
    const raw = client.query.bind(client);
    t.mock.method(client, "query", (sql: unknown, ...args: unknown[]) => {
      if (
        sql &&
        typeof sql === "object" &&
        "text" in sql &&
        sql.text === "SELECT pg_sleep(0.5)"
      ) {
        // A real pg client timeout, deliberately shorter than its server timer.
        // No SQL result or transaction outcome is replaced by this fault injection.
        timedOutPid = (client as PoolClient & { processID: number }).processID;
        return Reflect.apply(raw, client, [
          { ...sql, query_timeout: 35 },
          ...args,
        ]);
      }
      return Reflect.apply(raw, client, [sql, ...args]);
    });
  };
  db.pool.on("acquire", acquire);
  const facts: TransactionBoundaryFact[] = [];
  try {
    await assert.rejects(
      withDatabaseDeadline(performance.now() + 800, () =>
        withTestTransactionObserver(
          (fact) => facts.push(fact),
          () =>
            db.transaction(async (tx) => {
              await tx.query("UPDATE deadline_probe SET value=1 WHERE id=1");
              await tx.query("SELECT pg_sleep(0.5)");
            }),
        ),
      ),
      /Query read timeout/,
    );
  } finally {
    db.pool.removeListener("acquire", acquire);
  }
  assert.ok(timedOutPid);
  assert.equal(
    facts.some((fact) => fact.phase === "rollback"),
    false,
  );
  assert.equal(
    facts.some((fact) => fact.phase === "commit"),
    false,
  );
  assert.notEqual(
    (await db.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid,
    timedOutPid,
  );
  await until(
    async () =>
      (
        await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1", [
          timedOutPid,
        ])
      ).rowCount === 0,
  );
  assert.deepEqual(await probe(db), { value: 0, events: 0 });
  await cleanSettings(db);
});

/** A real TCP fault: forward COMMIT to PostgreSQL but suppress its server reply. */
async function withholdCommitReply(url: string) {
  const upstream = new URL(url);
  const destination = {
    host: upstream.hostname,
    port: Number(upstream.port || 5432),
  };
  const sockets = new Set<Socket>();
  let committedRepliesWithheld = 0;
  const server = createServer((downstream) => {
    const target = createConnection(destination);
    sockets.add(downstream);
    sockets.add(target);
    let startup = true;
    let held = false;
    let input: Buffer = Buffer.alloc(0);
    let output: Buffer = Buffer.alloc(0);
    downstream.on("data", (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      while (input.length >= (startup ? 4 : 5)) {
        const length = input.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1);
        if (input.length < length) break;
        const packet = input.subarray(0, length);
        input = input.subarray(length);
        if (
          !startup &&
          packet[0] === 81 &&
          packet.subarray(5, -1).toString().trim().toUpperCase() === "COMMIT"
        )
          held = true;
        startup = false;
        target.write(packet);
      }
    });
    target.on("data", (chunk: Buffer) => {
      if (!held) {
        downstream.write(chunk);
        return;
      }
      output = Buffer.concat([output, chunk]);
      while (output.length >= 5) {
        const length = output.readInt32BE(1) + 1;
        if (output.length < length) break;
        const packet = output.subarray(0, length);
        output = output.subarray(length);
        if (packet[0] === 67 && packet.subarray(5, -1).toString() === "COMMIT")
          committedRepliesWithheld++;
      }
    });
    for (const socket of [downstream, target]) {
      socket.on("error", () => {});
      socket.on("close", () => {
        sockets.delete(socket);
        downstream.destroy();
        target.destroy();
      });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  upstream.hostname = "127.0.0.1";
  upstream.port = String(address.port);
  return {
    url: upstream.toString(),
    committedRepliesWithheld: () => committedRepliesWithheld,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("kick database lost COMMIT reply is unconfirmed to the caller even when PostgreSQL really committed", async (t) => {
  const { db, url, onCleanup } = await temporaryDatabase(t);
  await createProbe(db);
  const proxy = await withholdCommitReply(url);
  const throughProxy = new Database(proxy.url);
  onCleanup(async () => {
    await throughProxy.close();
    await proxy.close();
  });
  const facts: TransactionBoundaryFact[] = [];
  await assert.rejects(
    withDatabaseDeadline(performance.now() + 400, () =>
      withTestTransactionObserver(
        (fact) => facts.push(fact),
        () =>
          throughProxy.transaction(async (tx) => {
            await tx.query("UPDATE deadline_probe SET value=1 WHERE id=1");
            await emit(tx, "inconsistency", {
              kind: "agent_recovery_unknown",
              ref: "deadline-test",
              message: "committed but reply lost",
            });
          }),
      ),
    ),
    /Query read timeout/,
  );
  assert.equal(proxy.committedRepliesWithheld(), 1);
  assert.ok(
    facts.some((fact) => fact.phase === "commit" && fact.edge === "rejected"),
  );
  assert.equal(
    facts.some((fact) => fact.phase === "commit" && fact.edge === "returned"),
    false,
  );
  assert.equal(
    facts.some((fact) => fact.phase === "rollback"),
    false,
  );
  assert.deepEqual(await probe(db), { value: 1, events: 1 });
  assert.equal(
    throughProxy.pool.idleCount,
    0,
    "unconfirmed commit connection cannot return to pool",
  );
});

test("kick database retains an acknowledged COMMIT when the caller resumes after its deadline", async (t) => {
  const { db } = await temporaryDatabase(t);
  await createProbe(db);
  const deadline = performance.now() + 150;
  const facts: TransactionBoundaryFact[] = [];
  const result = await withDatabaseDeadline(deadline, () =>
    withTestTransactionObserver(
      (fact) => {
        facts.push(fact);
        if (fact.phase === "commit" && fact.edge === "returned") {
          // Delay local continuation after the actual server acknowledgement.
          while (performance.now() <= deadline + 10) {
            /* deliberate event-loop stall */
          }
        }
      },
      () =>
        db.transaction(async (tx) => {
          await tx.query("UPDATE deadline_probe SET value=1 WHERE id=1");
          await emit(tx, "inconsistency", {
            kind: "agent_recovery_unknown",
            ref: "deadline-test",
            message: "committed",
          });
          return "committed";
        }),
    ),
  );
  assert.equal(result, "committed");
  assert.equal(
    db.pool.idleCount,
    0,
    "expired restoration destroys the committed connection",
  );
  assert.deepEqual(await probe(db), { value: 1, events: 1 });
  assert.equal(
    facts.some((fact) => fact.phase === "rollback"),
    false,
  );
  await cleanSettings(db);
});
