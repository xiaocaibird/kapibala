import { randomUUID } from "node:crypto";
import { Database } from "../../apps/server/src/core/db.js";

interface TemporaryDatabase {
  db: Database;
  url: string;
  onCleanup(cleanup: () => Promise<void>): void;
  close(): Promise<void>;
}

export async function temporaryDatabase(t: {
  after(cleanup: () => Promise<void>): void;
}): Promise<TemporaryDatabase> {
  // DATABASE_URL supplies connection credentials only. Never migrate or write to
  // its selected database, even when a test is run directly without a wrapper.
  const url = new URL(
    process.env.DATABASE_URL ??
      "postgres://kapibala:kapibala@localhost:55432/kapibala",
  );
  const name = `kapibala_test_${randomUUID().replaceAll("-", "")}`;
  url.pathname = "/postgres";
  url.searchParams.set("options", "-csearch_path=public");
  url.searchParams.set("application_name", name);
  const admin = new Database(url.toString());
  let db: Database | undefined;
  const cleanups: (() => Promise<void>)[] = [];
  // Register before the first CREATE/migrate/app setup so initialization failures
  // cannot leave a test database or pool behind. All deletions use this UUID name.
  let closing: Promise<void> | undefined;
  async function dispose(): Promise<void> {
    const failures: unknown[] = [];
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await db?.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } catch (error) {
      failures.push(error);
    }
    try {
      await admin.close();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length)
      throw new AggregateError(failures, "Temporary database cleanup failed");
  }
  function close(): Promise<void> {
    return (closing ??= dispose());
  }
  t.after(close);
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  db = new Database(url.toString());
  return {
    db,
    url: url.toString(),
    onCleanup: (cleanup) => {
      if (closing)
        throw new Error("Temporary database cleanup already started");
      cleanups.push(cleanup);
    },
    close,
  };
}
