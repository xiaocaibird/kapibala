import { createHash, randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import {
  currentOperationSignal,
  type Database,
  type Queryable,
} from "../../core/db.js";

class ObservationExpired extends Error {}
class ObservationReadTimeout extends Error {}

/** Engineering entry only. No query parameters, row contents or error messages
 * leave this boundary. The callback observes facts; it supplies no SQL outcome. */
export interface DeliveryReadFact {
  kind: string;
  readAttemptId: string;
  [key: string]: unknown;
}
type QueryRole =
  "begin" | "identity" | "set-timeouts" | "delivery-select" | "rollback";
function errorFacts(error: unknown): Record<string, unknown> {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
      ? { sqlState: code }
      : {}),
  };
}

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
  observe?: (fact: DeliveryReadFact) => void,
): Promise<{ status: "observed"; value: T } | { status: "retry" }> {
  const signal = currentOperationSignal();
  signal?.throwIfAborted();
  const readAttemptId = observe ? randomUUID() : "";
  let backend: { pid: number; backendStarted: string } | undefined;
  let queryOrdinal = 0;
  let recorderFailed = false;
  const record = (kind: string, fields: Record<string, unknown> = {}): void => {
    if (!observe || recorderFailed) return;
    try {
      observe({
        kind,
        readAttemptId,
        ...(backend ? { backend } : {}),
        ...fields,
      });
    } catch {
      // Missing trailing facts invalidate evidence, not the delivery outcome.
      // A recorder must never break transaction cleanup or change a result.
      recorderFailed = true;
    }
  };
  record("delivery-read-attempt-started", { deadlineMonotonicMs: deadline });
  const client = await db.pool.connect();
  record("delivery-read-client-acquired");
  let connectionError: Error | undefined;
  let failure: unknown;
  let cleanupError: unknown;
  let began = false;
  let value!: T;
  const onError = (error: Error): void => {
    connectionError = error;
    record("delivery-read-connection-error", errorFacts(error));
  };
  client.on("error", onError);
  const onEnd = () => record("delivery-read-connection-ended");
  if (observe) client.once("end", onEnd);
  const check = (): void => {
    signal?.throwIfAborted();
    if (connectionError) throw connectionError;
    if (performance.now() >= deadline) throw new ObservationExpired();
  };
  const query = async <R extends QueryResultRow = QueryResultRow>(
    role: QueryRole,
    sql: string,
    values?: unknown[],
    fields: Record<string, unknown> = {},
  ) => {
    if (!observe) return client.query<R>(sql, values);
    const queryAttemptId = `${readAttemptId}:${++queryOrdinal}`;
    const before = performance.now();
    const queryFact = {
      queryAttemptId,
      queryRole: role,
      querySha256: createHash("sha256").update(sql).digest("hex"),
      ...fields,
    };
    record("delivery-read-query-started", {
      ...queryFact,
      queryStartedMonotonicMs: before,
    });
    try {
      const result = await client.query<R>(sql, values);
      record("delivery-read-query-returned", {
        ...queryFact,
        queryWindowMs: [before, performance.now()],
        rowCount: result.rowCount,
      });
      return result;
    } catch (error) {
      record("delivery-read-query-failed", {
        ...queryFact,
        queryWindowMs: [before, performance.now()],
        ...errorFacts(error),
        ownReadTimeout:
          (role === "delivery-select" || role === "identity") &&
          isOwnReadTimeout(error),
      });
      throw error;
    }
  };
  const limits = async () => {
    check();
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
    const lockTimeoutMs = Math.min(50, remaining);
    const statementTimeoutMs = Math.min(100, remaining);
    await query(
      "set-timeouts",
      "SELECT set_config('lock_timeout',$1,true),set_config('statement_timeout',$2,true)",
      [`${lockTimeoutMs}ms`, `${statementTimeoutMs}ms`],
      { lockTimeoutMs, statementTimeoutMs },
    );
    check();
  };
  try {
    check();
    await query("begin", "BEGIN READ ONLY");
    began = true;
    if (observe && !recorderFailed) {
      // The identity comes from this actual connection, not a caller-supplied
      // PID or an unrelated pool query. Its cost uses the original deadline.
      await limits();
      const identity = (
        await query<{ pid: number; backend_started: string }>(
          "identity",
          "SELECT pg_backend_pid() AS pid,backend_start::text AS backend_started FROM pg_stat_activity WHERE pid=pg_backend_pid()",
        ).catch((error: unknown) => {
          if (isOwnReadTimeout(error)) throw new ObservationReadTimeout();
          throw error;
        })
      ).rows[0];
      if (!identity)
        throw new Error("Delivery read backend identity unavailable");
      backend = { pid: identity.pid, backendStarted: identity.backend_started };
      record("delivery-read-backend-identified");
      check();
    }
    const reader: Queryable = {
      async query<R extends QueryResultRow>(sql: string, values?: unknown[]) {
        check();
        // Refresh per statement so the second read does not inherit a fresh
        // full wait window. lock_timeout limits lock waits; statement_timeout
        // also cancels long execution at the server, before we release/reuse.
        await limits();
        try {
          const result = await query<R>("delivery-select", sql, values);
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
    record("delivery-read-value-observed", {
      observationMonotonicMs: performance.now(),
    });
  } catch (error) {
    failure = error;
    record("delivery-read-attempt-failed", {
      ...errorFacts(error),
      deadlineExpired: error instanceof ObservationExpired,
      ownReadTimeout: error instanceof ObservationReadTimeout,
      operationAborted: Boolean(signal?.aborted),
    });
  } finally {
    // Acknowledged cancellation aborts the read-only transaction. Do not turn
    // it into a retry until ROLLBACK confirms both transaction and SET LOCAL
    // state were cleared. A cleanup/connection failure is never "no new fact".
    if (began && !connectionError) {
      try {
        await query("rollback", "ROLLBACK");
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
    // release(true) requests destruction; only the later pg 'end' callback
    // observes local connection closure. Neither claims a server COMMIT.
    if (reusable) client.removeListener("end", onEnd);
    client.release(!reusable);
    record("delivery-read-client-released", {
      disposition: reusable ? "returned-to-pool" : "destroy-requested",
    });
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
