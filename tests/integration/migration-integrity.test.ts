import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { Database } from "../../apps/server/src/core/db.js";
import { createApp } from "../../apps/server/src/app.js";
import {
  assertSchemaCurrent,
  expectedVersion,
  loadMigrations,
  migrate,
} from "../../apps/server/src/core/migrations.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import {
  baselineLegacy,
  legacyBaselineSource,
  LegacyBaselineCleanupError,
} from "../../apps/server/src/core/legacy-migration-baseline.js";

async function directory(
  t: TestContext,
  files: Record<string, string>,
): Promise<URL> {
  const path = await mkdtemp(join(tmpdir(), "kapibala-migration-integrity-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  const url = pathToFileURL(`${path}/`);
  await Promise.all(
    Object.entries(files).map(([name, sql]) =>
      writeFile(new URL(name, url), sql),
    ),
  );
  return url;
}

async function schemaSnapshot(db: Database) {
  return {
    columns: (
      await db.query(`SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)
    ).rows,
    constraints: (
      await db.query(`SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public' ORDER BY c.conname`)
    ).rows,
    indexes: (
      await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname='public' ORDER BY tablename,indexname`)
    ).rows,
    ledger: (await db.query("SELECT * FROM schema_migrations ORDER BY version"))
      .rows,
  };
}

async function legacyDatabase(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const historical = (await loadMigrations()).filter(
    (migration) => migration.version <= 6,
  );
  assert.equal(historical.length, 6);
  await temporary.db.transaction(async (tx) => {
    await tx.query(
      "CREATE TABLE schema_migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const migration of historical) {
      await tx.query(migration.sql);
      await tx.query(
        "INSERT INTO schema_migrations(version,name) VALUES($1,$2)",
        [migration.version, migration.name],
      );
    }
  });
  return temporary;
}

async function assertNoReferenceDatabase(db: Database) {
  assert.deepEqual(
    (
      await db.query(
        "SELECT datname FROM pg_database WHERE datname LIKE 'kapibala_migration_reference_%'",
      )
    ).rows,
    [],
  );
}

function child(
  script: URL,
  databaseUrl: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  const process = spawn(
    globalThis.process.execPath,
    ["--import", "tsx", fileURLToPath(script), ...args],
    {
      env: {
        ...globalThis.process.env,
        DATABASE_URL: databaseUrl,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  process.stdout.on("data", (data) => {
    output += String(data);
  });
  process.stderr.on("data", (data) => {
    output += String(data);
  });
  const result = new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      process.once("error", reject);
      process.once("close", (code) => resolve({ code, output }));
    },
  );
  return { process, result };
}

async function until(
  check: () => Promise<boolean>,
  message: string,
): Promise<void> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

test("migration manifest uses explicit numeric identifiers and rejects invalid or duplicate versions", async (t) => {
  const valid = await directory(t, {
    "010_last.sql": "SELECT 10",
    "001_first.sql": "SELECT 1",
    "02_middle.sql": "SELECT 2",
  });
  assert.deepEqual(
    (await loadMigrations(valid)).map((row) => row.version),
    [1, 2, 10],
  );
  assert.equal(await expectedVersion(valid), 10);
  for (const name of ["core.sql", "000_zero.sql", "2147483648_large.sql"]) {
    const invalid = await directory(t, { [name]: "SELECT 1" });
    await assert.rejects(loadMigrations(invalid), /Invalid migration filename/);
  }
  const duplicate = await directory(t, {
    "001_first.sql": "SELECT 1",
    "1_other.sql": "SELECT 2",
  });
  await assert.rejects(
    loadMigrations(duplicate),
    /Duplicate migration version: 1/,
  );
});

test("history content changes with the same file count are rejected, while a fresh database gets the changed schema", async (t) => {
  const { db } = await temporaryDatabase(t);
  const historical = await directory(t, {
    "001_probe.sql":
      "CREATE TABLE probe(value integer); INSERT INTO probe VALUES(7);",
  });
  await migrate(db, historical);
  const before = await schemaSnapshot(db);
  await writeFile(
    new URL("001_probe.sql", historical),
    "CREATE TABLE probe(value text); INSERT INTO probe VALUES('changed');",
  );
  await assert.rejects(migrate(db, historical), /checksum differs/);
  await assert.rejects(assertSchemaCurrent(db, historical), /checksum differs/);
  assert.deepEqual(await schemaSnapshot(db), before);
  assert.deepEqual((await db.query("SELECT * FROM probe")).rows, [
    { value: 7 },
  ]);
  const fresh = await temporaryDatabase(t);
  await migrate(fresh.db, historical);
  assert.equal(await assertSchemaCurrent(fresh.db, historical), 1);
  assert.deepEqual((await fresh.db.query("SELECT * FROM probe")).rows, [
    { value: "changed" },
  ]);
  t.diagnostic(
    "Same count/version=1, old schema integer versus fresh schema text; old ledger rejected by checksum before writes",
  );
});

test("complete ledger comparison rejects middle holes, renamed/deleted/inserted history and a newer database", async (t) => {
  const cases = [
    "middle-hole",
    "renamed-file",
    "deleted-file",
    "inserted-file",
    "renumbered-file",
    "newer-database",
  ] as const;
  for (const scenario of cases)
    await t.test(scenario, async (t) => {
      const { db } = await temporaryDatabase(t);
      const files = await directory(t, {
        "001_probe.sql":
          "CREATE TABLE probe(value integer); INSERT INTO probe VALUES(1);",
        "003_middle.sql": "UPDATE probe SET value=value+1;",
        "005_last.sql": "UPDATE probe SET value=value+1;",
      });
      await migrate(db, files);
      if (scenario === "middle-hole")
        await db.query("DELETE FROM schema_migrations WHERE version=3");
      if (scenario === "renamed-file")
        await rename(
          new URL("003_middle.sql", files),
          new URL("003_renamed.sql", files),
        );
      if (scenario === "deleted-file")
        await rm(new URL("003_middle.sql", files));
      if (scenario === "inserted-file")
        await writeFile(
          new URL("002_inserted.sql", files),
          "UPDATE probe SET value=99;",
        );
      if (scenario === "renumbered-file")
        await rename(
          new URL("003_middle.sql", files),
          new URL("004_middle.sql", files),
        );
      if (scenario === "newer-database")
        await db.query(
          "INSERT INTO schema_migrations(version,name,checksum) VALUES(9,'009_future.sql',$1)",
          ["0".repeat(64)],
        );
      const before = await schemaSnapshot(db);
      await assert.rejects(assertSchemaCurrent(db, files), /Schema mismatch/);
      await assert.rejects(migrate(db, files), /Schema mismatch/);
      assert.deepEqual(await schemaSnapshot(db), before);
      assert.deepEqual((await db.query("SELECT * FROM probe")).rows, [
        { value: 3 },
      ]);
    });
});

test("a failure after pending SQL and earlier ledger writes rolls the entire batch back before a successful retry", async (t) => {
  const { db } = await temporaryDatabase(t);
  const files = await directory(t, {
    "001_probe.sql":
      "CREATE TABLE probe(value integer); INSERT INTO probe VALUES(7);",
  });
  await migrate(db, files);
  await db.query(`CREATE FUNCTION reject_test_migration() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.version=3 THEN RAISE EXCEPTION 'injected failure before version record'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_migration_record BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_test_migration()`);
  const before = await schemaSnapshot(db);
  await writeFile(
    new URL("002_second.sql", files),
    "ALTER TABLE probe ADD COLUMN second text; UPDATE probe SET value=8;",
  );
  await writeFile(
    new URL("003_third.sql", files),
    "ALTER TABLE probe ADD COLUMN third text; UPDATE probe SET value=9;",
  );
  await assert.rejects(
    migrate(db, files),
    /injected failure before version record/,
  );
  assert.deepEqual(await schemaSnapshot(db), before);
  assert.deepEqual((await db.query("SELECT * FROM probe")).rows, [
    { value: 7 },
  ]);
  await db.query(
    "DROP TRIGGER fail_migration_record ON schema_migrations; DROP FUNCTION reject_test_migration()",
  );
  await migrate(db, files);
  assert.equal(await assertSchemaCurrent(db, files), 3);
  assert.deepEqual((await db.query("SELECT * FROM probe")).rows, [
    { value: 9, second: null, third: null },
  ]);
  const successful = await schemaSnapshot(db);
  await migrate(db, files);
  assert.deepEqual(await schemaSnapshot(db), successful);
  t.diagnostic(
    "Version 2 SQL/ledger plus version 3 DDL/data all rolled back when the version 3 ledger INSERT failed; retry and repeat passed",
  );
});

test("two migration processes wait on a real PostgreSQL advisory lock and apply a batch exactly once", async (t) => {
  const temporary = await temporaryDatabase(t);
  const { db, url } = temporary;
  const files = await directory(t, {
    "001_probe.sql":
      "CREATE TABLE probe(value integer); INSERT INTO probe VALUES(1);",
  });
  await migrate(db, files);
  // Gate the first process inside pending SQL, after it owns the migration lock.
  const gate = await db.pool.connect();
  await gate.query("SELECT pg_advisory_lock(913458)");
  await writeFile(
    new URL("002_once.sql", files),
    "SELECT pg_advisory_xact_lock(913458); UPDATE probe SET value=value+1;",
  );
  const runner = new URL("../support/migration-process.ts", import.meta.url);
  const firstUrl = new URL(url);
  firstUrl.searchParams.set("application_name", "a0_migration_first");
  const secondUrl = new URL(url);
  secondUrl.searchParams.set("application_name", "a0_migration_second");
  const first = child(runner, firstUrl.toString(), [files.href]);
  let second: ReturnType<typeof child> | undefined;
  let gateReleased = false;
  temporary.onCleanup(async () => {
    for (const running of [first, second])
      if (running && running.process.exitCode === null)
        running.process.kill("SIGKILL");
    await Promise.all([first.result, second?.result]);
    if (!gateReleased) {
      await gate.query("SELECT pg_advisory_unlock(913458)");
      gate.release();
    }
  });
  await until(
    async () =>
      (
        await db.query(`SELECT 1 FROM pg_stat_activity
    WHERE application_name='a0_migration_first' AND wait_event='advisory'`)
      ).rowCount === 1,
    "first process did not reach its transaction gate",
  );
  second = child(runner, secondUrl.toString(), [files.href]);
  await until(
    async () =>
      (
        await db.query(`SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
    WHERE a.application_name='a0_migration_second' AND l.locktype='advisory' AND l.objid=913456 AND NOT l.granted`)
      ).rowCount === 1,
    "second process never waited on the first process migration lock",
  );
  const waits = (
    await db.query(`SELECT a.application_name,l.objid::text AS lock_key,l.granted
    FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name LIKE 'a0_migration_%'
    AND l.locktype='advisory' ORDER BY a.application_name,l.objid`)
  ).rows;
  assert.equal((await db.query("SELECT value FROM probe")).rows[0]!.value, 1);
  await gate.query("SELECT pg_advisory_unlock(913458)");
  gate.release();
  gateReleased = true;
  for (const result of await Promise.all([first.result, second.result]))
    assert.equal(result.code, 0, result.output);
  assert.equal(await assertSchemaCurrent(db, files), 2);
  assert.deepEqual((await db.query("SELECT * FROM probe")).rows, [
    { value: 2 },
  ]);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM schema_migrations WHERE version=2",
      )
    ).rows[0]!.count,
    1,
  );
  t.diagnostic(
    JSON.stringify({
      observedLocks: waits,
      finalValue: 2,
      version2LedgerRows: 1,
    }),
  );
});

test("the production entry refuses an actually lagging database before listening, then migration permits a healthy server and repeat", async (t) => {
  const temporary = await temporaryDatabase(t);
  const { db, url } = temporary;
  const migrations = await loadMigrations();
  const old = await directory(
    t,
    Object.fromEntries(
      migrations.slice(0, -1).map((row) => [row.name, row.sql]),
    ),
  );
  await migrate(db, old);
  await assert.rejects(
    createApp({ db, logger: false, background: false }),
    /Schema mismatch/,
  );
  const portReservation = createServer();
  await new Promise<void>((resolve) =>
    portReservation.listen(0, "127.0.0.1", resolve),
  );
  const address = portReservation.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    portReservation.close((error) => (error ? reject(error) : resolve())),
  );
  const startup = child(
    new URL("../../apps/server/src/main.ts", import.meta.url),
    url,
    [],
    { PORT: String(port) },
  );
  temporary.onCleanup(async () => {
    if (startup.process.exitCode === null) startup.process.kill("SIGKILL");
    await startup.result;
  });
  const failed = await startup.result;
  assert.equal(failed.code, 1, failed.output);
  assert.match(failed.output, /Schema mismatch/);
  assert.doesNotMatch(failed.output, /Server listening/);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`));
  await db.query(
    "UPDATE accounts SET platform_user_id='preserved-migration-user' WHERE id='account-1'",
  );
  await migrate(db);
  const before = await schemaSnapshot(db);
  const business = (await db.query("SELECT * FROM accounts ORDER BY id")).rows;
  await migrate(db);
  assert.deepEqual(await schemaSnapshot(db), before);
  assert.deepEqual(
    (await db.query("SELECT * FROM accounts ORDER BY id")).rows,
    business,
  );
  const app = await createApp({ db, logger: false, background: false });
  temporary.onCleanup(() => app.close());
  const appUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  assert.deepEqual(await (await fetch(`${appUrl}/api/health`)).json(), {
    ok: true,
    schemaVersion: migrations.at(-1)!.version,
  });
  await db.query("UPDATE schema_migrations SET checksum=$1 WHERE version=$2", [
    "0".repeat(64),
    migrations[0]!.version,
  ]);
  await assert.rejects(
    createApp({ db, logger: false, background: false }),
    /checksum differs/,
  );
  await db.query("UPDATE schema_migrations SET checksum=$1 WHERE version=$2", [
    migrations[0]!.checksum,
    migrations[0]!.version,
  ]);
  t.diagnostic(
    JSON.stringify({
      laggingVersion: migrations.at(-2)!.version,
      requiredVersion: migrations.at(-1)!.version,
      refusedProcessExit: failed.code,
      randomRefusedPort: port,
      healthyUrl: appUrl,
    }),
  );
});

test("a real six-migration legacy ledger stays explicitly unverified and unchanged rather than gaining fabricated checksums", async (t) => {
  const { db } = await temporaryDatabase(t);
  const historical = (await loadMigrations()).filter(
    (migration) => migration.version <= 6,
  );
  assert.equal(historical.length, 6);
  await db.transaction(async (tx) => {
    await tx.query(
      "CREATE TABLE schema_migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const migration of historical) {
      await tx.query(migration.sql);
      await tx.query(
        "INSERT INTO schema_migrations(version,name) VALUES($1,$2)",
        [migration.version, migration.name],
      );
    }
  });
  await db.query(
    "UPDATE accounts SET platform_user_id='legacy-data-preserved' WHERE id='account-1'",
  );
  const before = await schemaSnapshot(db);
  const business = (await db.query("SELECT * FROM accounts ORDER BY id")).rows;
  await assert.rejects(migrate(db), /legacy migration ledger has no checksums/);
  await assert.rejects(
    createApp({ db, logger: false, background: false }),
    /legacy migration ledger has no checksums/,
  );
  assert.deepEqual(await schemaSnapshot(db), before);
  assert.deepEqual(
    (await db.query("SELECT * FROM accounts ORDER BY id")).rows,
    business,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='schema_migrations' AND column_name='checksum'",
      )
    ).rows[0]!.count,
    0,
  );
  t.diagnostic(
    "Historical 001–006 SQL was executed into the old ledger shape; migrate/startup rejected with no checksum column, DDL, ledger or account changes",
  );
});

test("explicit legacy baseline compares a replayed release schema, records limited provenance, and permits subsequent migration", async (t) => {
  const { db, url } = await legacyDatabase(t);
  await db.query(
    "UPDATE accounts SET platform_user_id='baseline-existing-business' WHERE id='account-1'",
  );
  const business = (await db.query("SELECT * FROM accounts ORDER BY id")).rows;
  const ledger = (
    await db.query(
      "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
    )
  ).rows;
  const result = await baselineLegacy(db, url, legacyBaselineSource);
  assert.equal(result.source, legacyBaselineSource);
  assert.match(result.schemaChecksum, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.versions, [1, 2, 3, 4, 5, 6]);
  const baseline = (
    await db.query(
      "SELECT version,checksum,checksum_origin,baseline_source,baseline_verified_at,baseline_schema_checksum FROM schema_migrations ORDER BY version",
    )
  ).rows;
  for (const row of baseline) {
    assert.equal(row.checksum_origin, "legacy_schema_baseline");
    assert.equal(row.baseline_source, legacyBaselineSource);
    assert.equal(
      row.baseline_verified_at.toISOString(),
      result.verifiedAt.toISOString(),
    );
    assert.equal(row.baseline_schema_checksum, result.schemaChecksum);
  }
  assert.deepEqual(
    (
      await db.query(
        "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
      )
    ).rows,
    ledger,
  );
  assert.deepEqual(
    (await db.query("SELECT * FROM accounts ORDER BY id")).rows,
    business,
  );
  await assertNoReferenceDatabase(db);
  const afterBaseline = await schemaSnapshot(db);
  await assert.rejects(
    baselineLegacy(db, url, legacyBaselineSource),
    /schema differs/,
  );
  assert.deepEqual(await schemaSnapshot(db), afterBaseline);
  await assertNoReferenceDatabase(db);
  await migrate(db);
  assert.equal(await assertSchemaCurrent(db), await expectedVersion());
  await migrate(db);
  for (const row of (
    await db.query(
      "SELECT checksum_origin,baseline_source,baseline_verified_at FROM schema_migrations WHERE version>6",
    )
  ).rows) {
    assert.equal(row.checksum_origin, "executed");
    assert.equal(row.baseline_source, null);
    assert.equal(row.baseline_verified_at, null);
  }
  assert.deepEqual(
    (await db.query("SELECT * FROM accounts ORDER BY id")).rows,
    business,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT version,checksum,checksum_origin,baseline_source,baseline_verified_at,baseline_schema_checksum FROM schema_migrations WHERE version<=6 ORDER BY version",
      )
    ).rows,
    baseline,
  );
  t.diagnostic(
    JSON.stringify({
      ...result,
      referenceRemoved: true,
      currentVersion: await expectedVersion(),
      pastExecutionBytesProven: false,
    }),
  );
});

test("legacy baseline rejects damaged ledgers, structural drift and untrusted source bytes without changing the target", async (t) => {
  for (const scenario of [
    "middle-hole",
    "name-mismatch",
    "missing-index",
    "changed-default",
    "extra-function",
    "disabled-internal-constraint-triggers",
    "altered-sequence",
    "modified-source",
  ] as const)
    await t.test(scenario, async (t) => {
      const { db, url } = await legacyDatabase(t);
      if (scenario === "middle-hole")
        await db.query("DELETE FROM schema_migrations WHERE version=3");
      if (scenario === "name-mismatch")
        await db.query(
          "UPDATE schema_migrations SET name='003_renamed.sql' WHERE version=3",
        );
      if (scenario === "missing-index")
        await db.query("DROP INDEX groups_directory_asc");
      if (scenario === "changed-default")
        await db.query(
          "ALTER TABLE accounts ALTER COLUMN status SET DEFAULT 'online'",
        );
      if (scenario === "extra-function")
        await db.query(
          "CREATE FUNCTION unexpected_function() RETURNS integer LANGUAGE SQL AS 'SELECT 1'",
        );
      if (scenario === "disabled-internal-constraint-triggers")
        await db.query("ALTER TABLE messages DISABLE TRIGGER ALL");
      if (scenario === "altered-sequence")
        await db.query("ALTER SEQUENCE events_seq_seq INCREMENT BY 2");
      let source: URL | undefined;
      if (scenario === "modified-source") {
        const files = await loadMigrations();
        source = await directory(
          t,
          Object.fromEntries(files.map((row) => [row.name, row.sql])),
        );
        await writeFile(
          new URL(files[0]!.name, source),
          `${files[0]!.sql}\n-- same result, untrusted different bytes\n`,
        );
      }
      const before = await schemaSnapshot(db);
      const data = (await db.query("SELECT * FROM accounts ORDER BY id")).rows;
      await assert.rejects(
        baselineLegacy(db, url, legacyBaselineSource, source),
        /exact complete|schema differs|fixed trusted release manifest/,
      );
      assert.deepEqual(await schemaSnapshot(db), before);
      assert.deepEqual(
        (await db.query("SELECT * FROM accounts ORDER BY id")).rows,
        data,
      );
      await assertNoReferenceDatabase(db);
    });
});

test("legacy baseline lock contention and missing CREATEDB permission fail without target changes or reference leaks", async (t) => {
  const { db, url } = await legacyDatabase(t);
  const before = await schemaSnapshot(db);
  const lock = await db.pool.connect();
  await lock.query("BEGIN");
  await lock.query("SELECT * FROM accounts FOR UPDATE");
  try {
    await assert.rejects(
      baselineLegacy(db, url, legacyBaselineSource),
      /lock timeout/,
    );
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
  assert.deepEqual(await schemaSnapshot(db), before);
  await assertNoReferenceDatabase(db);
  const role = `a0_no_createdb_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  await db.query(
    `CREATE ROLE ${role} LOGIN PASSWORD 'isolated-test-only' NOCREATEDB`,
  );
  try {
    const limited = new URL(url);
    limited.username = role;
    limited.password = "isolated-test-only";
    await assert.rejects(
      baselineLegacy(db, limited.toString(), legacyBaselineSource),
      /permission denied to create database/,
    );
  } finally {
    await db.query(`DROP ROLE ${role}`);
  }
  assert.deepEqual(await schemaSnapshot(db), before);
  await assertNoReferenceDatabase(db);
});

test("legacy baseline and migration 007 preserve the running-sequence gate and leave historical observation time unknown", async (t) => {
  if (!(await loadMigrations()).some((row) => row.version === 7)) {
    t.skip("Migration 007 is supplied by the parallel automation repair");
    return;
  }
  const { db, url } = await legacyDatabase(t);
  await db.query(`INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('legacy-running','legacy-remote','account-1');
    INSERT INTO sequences(id,name,steps) VALUES('legacy-sequence','Legacy','[]');
    INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('legacy-run','legacy-running','legacy-sequence');
    INSERT INTO messages(id,group_id,is_own,text) VALUES('legacy-message','legacy-running',true,'historical')`);
  await baselineLegacy(db, url, legacyBaselineSource);
  const baselined = await schemaSnapshot(db);
  await assert.rejects(
    migrate(db),
    /Finish running sequences on the previous version before migration 007/,
  );
  assert.deepEqual(await schemaSnapshot(db), baselined);
  assert.equal(
    (await db.query("SELECT status FROM sequence_runs WHERE id='legacy-run'"))
      .rows[0]!.status,
    "running",
  );
  await assert.rejects(
    assertSchemaCurrent(db),
    new RegExp(`installed=6, required=${await expectedVersion()}`),
  );
  // Fixture represents the old application having completed the run. The
  // baseline/migration implementation must never stop or finish it itself.
  await db.query(
    "UPDATE sequence_runs SET status='finished' WHERE id='legacy-run'",
  );
  await migrate(db);
  assert.equal(await assertSchemaCurrent(db), await expectedVersion());
  assert.equal(
    (
      await db.query(
        "SELECT message_sent_observed_at FROM messages WHERE id='legacy-message'",
      )
    ).rows[0]!.message_sent_observed_at,
    null,
  );
  await assertNoReferenceDatabase(db);
  t.diagnostic(
    "Legacy 6 -> explicit baseline -> 007 rejects running sequence atomically -> completed-run fixture -> 007 succeeds; historical observed_at remains NULL",
  );
});

test("a reference cleanup failure reports that the target baseline already committed, with its exact evidence and reference name", async (t) => {
  const { db, url } = await legacyDatabase(t);
  const role = `a0_cleanup_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  await db.query(
    `CREATE ROLE ${role} LOGIN PASSWORD 'isolated-test-only' CREATEDB`,
  );
  const owner = (
    await db.query<{ owner: string }>("SELECT current_user AS owner")
  ).rows[0]!.owner;
  const lock = await db.pool.connect();
  await lock.query("BEGIN; SELECT * FROM accounts FOR UPDATE");
  const limited = new URL(url);
  limited.username = role;
  limited.password = "isolated-test-only";
  let referenceName: string | undefined;
  let released = false;
  const running = baselineLegacy(
    db,
    limited.toString(),
    legacyBaselineSource,
  ).then(
    () => ({ error: undefined }),
    (error: unknown) => ({ error }),
  );
  try {
    await until(async () => {
      const references = (
        await db.query<{ datname: string }>(
          `SELECT d.datname FROM pg_database d
        JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname=$1 AND d.datname LIKE 'kapibala_migration_reference_%'`,
          [role],
        )
      ).rows;
      referenceName = references[0]?.datname;
      return (
        referenceName !== undefined &&
        (
          await db.query(`SELECT 1 FROM pg_locks
        WHERE relation='accounts'::regclass AND mode='AccessExclusiveLock' AND NOT granted`)
        ).rowCount === 1
      );
    }, "reference replay did not reach the target table gate");
    await db.query(
      `ALTER DATABASE ${referenceName!} OWNER TO "${owner.replaceAll('"', '""')}"`,
    );
    await lock.query("ROLLBACK");
    lock.release();
    released = true;
    const { error } = await running;
    assert.ok(error instanceof LegacyBaselineCleanupError);
    assert.match(error.message, /COMMITTED.*cleanup failed/);
    assert.equal(error.baseline.referenceDatabase, referenceName);
    assert.equal(error.baseline.source, legacyBaselineSource);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM schema_migrations WHERE checksum_origin='legacy_schema_baseline'",
        )
      ).rows[0]!.count,
      6,
    );
    assert.equal(
      (
        await db.query("SELECT datname FROM pg_database WHERE datname=$1", [
          referenceName,
        ])
      ).rowCount,
      1,
    );
  } finally {
    if (!released) {
      await lock.query("ROLLBACK");
      lock.release();
    }
    await running;
    if (referenceName)
      await db.query(`DROP DATABASE IF EXISTS ${referenceName} WITH (FORCE)`);
    await db.query(`DROP ROLE ${role}`);
  }
  await assertNoReferenceDatabase(db);
});
