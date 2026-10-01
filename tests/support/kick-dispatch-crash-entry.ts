import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import { Database } from "../../apps/server/src/core/db.js";

// Development crash fixture only: hold the real, acknowledged autocommit before
// its caller can reach HTTP. It never supplies or repairs a business state.
const query = Database.prototype.query;
Database.prototype.query = async function <R extends QueryResultRow>(
  sql: string,
  values?: unknown[],
): Promise<QueryResult<R>> {
  const result = await query.call(this, sql, values);
  if (sql.includes("intent=jsonb_set(intent,'{dispatchState}'")) {
    await writeFile(
      join(process.env.QA_CAPACITY_REGISTRY_DIR!, "dispatching-held.signal"),
      JSON.stringify({ rowCount: result.rowCount, runId: values?.[0] }),
    );
    await new Promise<void>(() => {});
  }
  return result as QueryResult<R>;
};

await import("../../scripts/qa-capacity-server.js");
