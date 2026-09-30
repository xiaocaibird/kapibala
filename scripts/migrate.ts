import "dotenv/config";
import { Database } from "../apps/server/src/core/db.js";
import { loadMigrations, migrate } from "../apps/server/src/core/migrations.js";
export {
  expectedVersion,
  migrate,
} from "../apps/server/src/core/migrations.js";
export async function schemaFiles(): Promise<string[]> {
  return (await loadMigrations()).map((migration) => migration.name);
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
