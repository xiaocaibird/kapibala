import type { PoolClient } from "pg";
import { currentOperationSignal, type Database } from "../../core/db.js";

// Only background admission/progress may defer a busy transaction. API writes and
// remote tool execution retain their existing locking and error contracts.
export async function schedulingTransaction(
  db: Database,
  operation: (tx: PoolClient) => Promise<void>,
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout = '50ms'");
      await operation(tx);
    });
    return true;
  } catch (error) {
    currentOperationSignal()?.throwIfAborted();
    if (error instanceof Error && "code" in error && error.code === "55P03")
      return false;
    throw error;
  }
}
