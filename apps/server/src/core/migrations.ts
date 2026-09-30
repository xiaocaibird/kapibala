import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Queryable } from "./db.js";
import { Database } from "./db.js";

const defaultDirectory = new URL("../../../../db/migrations/", import.meta.url);
export const migrationLock = 913456;

export interface Migration {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}
interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

export async function loadMigrations(
  directory: URL = defaultDirectory,
): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) =>
    name.endsWith(".sql"),
  );
  const migrations = await Promise.all(
    names.map(async (name): Promise<Migration> => {
      const match = /^(\d+)_[a-z][a-z0-9_]*\.sql$/.exec(name);
      const version = Number(match?.[1]);
      if (
        !match ||
        !Number.isSafeInteger(version) ||
        version < 1 ||
        version > 2147483647
      )
        throw new Error(
          `Invalid migration filename: ${name}; expected positive integer_name.sql`,
        );
      const bytes = await readFile(new URL(name, directory));
      return {
        version,
        name,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        sql: bytes.toString("utf8"),
      };
    }),
  );
  migrations.sort((a, b) => a.version - b.version);
  for (const [index, migration] of migrations.entries())
    if (migrations[index - 1]?.version === migration.version)
      throw new Error(`Duplicate migration version: ${migration.version}`);
  if (!migrations.length)
    throw new Error("Migration directory contains no SQL files");
  return migrations;
}

export async function expectedVersion(directory?: URL): Promise<number> {
  return (await loadMigrations(directory)).at(-1)!.version;
}

function mismatch(message: string): Error {
  return new Error(`Schema mismatch: ${message}`);
}

async function readLedger(tx: Queryable): Promise<AppliedMigration[]> {
  const { rows } = await tx.query<{ exists: boolean; checksummed: boolean }>(
    `SELECT to_regclass('schema_migrations') IS NOT NULL AS exists,
      EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('schema_migrations')
        AND attname='checksum' AND NOT attisdropped) AS checksummed`,
  );
  if (!rows[0]!.exists) return [];
  if (!rows[0]!.checksummed)
    throw mismatch(
      "legacy migration ledger has no checksums; historical SQL is unverified. " +
        "Automatic checksum backfill is refused; an independently reviewed legacy baseline is required",
    );
  return (
    await tx.query<AppliedMigration>(
      "SELECT version,name,checksum FROM schema_migrations ORDER BY version",
    )
  ).rows;
}

function verifyLedger(
  migrations: Migration[],
  applied: AppliedMigration[],
  requireCurrent: boolean,
): void {
  for (const [index, row] of applied.entries()) {
    const migration = migrations[index];
    if (!migration || migration.version !== row.version)
      throw mismatch(
        `migration ledger is not a complete prefix; unexpected version ${row.version} at position ${index + 1}`,
      );
    if (migration.name !== row.name)
      throw mismatch(
        `migration ${row.version} filename differs: installed=${row.name}, required=${migration.name}`,
      );
    if (migration.checksum !== row.checksum)
      throw mismatch(
        `migration ${row.version} checksum differs; applied SQL must not be modified or automatically re-baselined`,
      );
  }
  if (requireCurrent && applied.length !== migrations.length)
    throw mismatch(
      `installed=${applied.at(-1)?.version ?? 0}, required=${migrations.at(-1)!.version}; run npm run db:migrate`,
    );
}

export async function assertSchemaCurrent(
  db: Database,
  directory?: URL,
): Promise<number> {
  const migrations = await loadMigrations(directory);
  await db.transaction(async (tx) => {
    // Use the migration lock so startup never observes a partly applied batch.
    await tx.query("SELECT pg_advisory_xact_lock($1)", [migrationLock]);
    verifyLedger(migrations, await readLedger(tx), true);
  });
  return migrations.at(-1)!.version;
}

export async function migrate(db: Database, directory?: URL): Promise<void> {
  // Hash and execute the same bytes from one immutable in-memory manifest.
  const migrations = await loadMigrations(directory);
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [migrationLock]);
    const applied = await readLedger(tx);
    verifyLedger(migrations, applied, false);
    await tx.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations(
        version integer PRIMARY KEY, name text NOT NULL,
        checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'),
        checksum_origin text NOT NULL DEFAULT 'executed' CHECK(checksum_origin IN ('executed','legacy_schema_baseline')),
        baseline_source text, baseline_verified_at timestamptz, baseline_schema_checksum text,
        applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    for (const migration of migrations.slice(applied.length)) {
      await tx.query(migration.sql);
      await tx.query(
        "INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)",
        [migration.version, migration.name, migration.checksum],
      );
    }
  });
}
