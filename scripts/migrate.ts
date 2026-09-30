import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { Database } from "../apps/server/src/core/db.js";
export async function schemaFiles(): Promise<string[]> {
  return (await readdir(new URL("../db/migrations/", import.meta.url)))
    .filter((x) => x.endsWith(".sql"))
    .sort();
}
export async function expectedVersion(): Promise<number> {
  return (await schemaFiles()).length;
}
export async function migrate(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(913456)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const files = await schemaFiles();
    for (const [i, file] of files.entries()) {
      if (
        (
          await tx.query("SELECT 1 FROM schema_migrations WHERE version=$1", [
            i + 1,
          ])
        ).rowCount
      )
        continue;
      await tx.query(
        await readFile(
          new URL(`../db/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
      await tx.query(
        "INSERT INTO schema_migrations(version,name) VALUES($1,$2)",
        [i + 1, file],
      );
    }
  });
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  const db = new Database(
    process.env.DATABASE_URL ??
      "postgres://kapibala:kapibala@localhost:55432/kapibala",
  );
  try {
    await migrate(db);
    console.log("Migrations applied");
  } finally {
    await db.close();
  }
}
