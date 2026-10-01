import type { QueryResultRow } from "pg";
import {
  currentOperationSignal,
  type Database,
  type Queryable,
} from "../../core/db.js";

class ObservationExpired extends Error {}
class ObservationReadTimeout extends Error {}

// Only these server acknowledgements from a SELECT governed by our SET LOCAL
// limits mean "no observation". User cancellation, connection failures, and
// other errors (including an unrecognised/localised message) still propagate.
function isOwnReadTimeout(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return (
    (error.code === "55P03" &&
      error.message === "canceling statement due to lock timeout") ||
    (error.code === "57014" &&
      error.message === "canceling statement due to statement timeout")
  );
}

/** Short, serial database observations, not a physical response-time guarantee.
 * Pool acquisition, transport, cleanup, and JS scheduling remain outside the
 * server statement timer. No client timer abandons an in-flight query. */
export async function observeDelivery<T>(
  db: Database,
  deadline: number,
  read: (reader: Queryable) => Promise<T>,
): Promise<{ status: "observed"; value: T } | { status: "retry" }> {
  const signal = currentOperationSignal();
  signal?.throwIfAborted();
  const client = await db.pool.connect();
  let connectionError: Error | undefined;
  let failure: unknown;
  let cleanupError: unknown;
  let began = false;
  let value!: T;
  const onError = (error: Error): void => {
    connectionError = error;
  };
  client.on("error", onError);
  const check = (): void => {
    signal?.throwIfAborted();
    if (connectionError) throw connectionError;
    if (performance.now() >= deadline) throw new ObservationExpired();
  };
  try {
    check();
    await client.query("BEGIN READ ONLY");
    began = true;
    const reader: Queryable = {
      async query<R extends QueryResultRow>(sql: string, values?: unknown[]) {
        check();
        // Refresh per statement so the second read does not inherit a fresh
        // full wait window. lock_timeout limits lock waits; statement_timeout
        // also cancels long execution at the server, before we release/reuse.
        const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
        await client.query(
          "SELECT set_config('lock_timeout',$1,true),set_config('statement_timeout',$2,true)",
          [`${Math.min(50, remaining)}ms`, `${Math.min(100, remaining)}ms`],
        );
        check();
        try {
          const result = await client.query<R>(sql, values);
          check();
          return result;
        } catch (error) {
          signal?.throwIfAborted();
          if (connectionError) throw connectionError;
          if (isOwnReadTimeout(error)) throw new ObservationReadTimeout();
          throw error;
        }
      },
    };
    value = await read(reader);
    // Fix timeliness at observation, before transaction cleanup. A successful
    // rollback returning late must not erase a fact obtained inside the window.
    check();
  } catch (error) {
    failure = error;
  } finally {
    // Acknowledged cancellation aborts the read-only transaction. Do not turn
    // it into a retry until ROLLBACK confirms both transaction and SET LOCAL
    // state were cleared. A cleanup/connection failure is never "no new fact".
    if (began && !connectionError) {
      try {
        await client.query("ROLLBACK");
      } catch (error) {
        cleanupError = error;
      }
    }
    const reusable =
      !connectionError &&
      !cleanupError &&
      (!failure ||
        failure instanceof ObservationExpired ||
        failure instanceof ObservationReadTimeout ||
        (signal?.aborted && failure === signal.reason));
    client.removeListener("error", onError);
    client.release(!reusable);
  }
  if (connectionError) throw connectionError;
  if (cleanupError) throw cleanupError;
  signal?.throwIfAborted();
  if (
    failure instanceof ObservationExpired ||
    failure instanceof ObservationReadTimeout
  )
    return { status: "retry" };
  if (failure) throw failure;
  return { status: "observed", value };
}
