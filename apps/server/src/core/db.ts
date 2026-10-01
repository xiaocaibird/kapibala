import pg, { type QueryResult, type QueryResultRow, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { installTestTransactionObserver } from "./test-transaction-observer.js";
import type { PlatformEventArguments } from "../../../../packages/contracts/src/index.js";
import {
  currentDatabaseDeadline,
  DeadlineConnection,
} from "./database-deadline.js";
export {
  currentDatabaseDeadline,
  withDatabaseDeadline,
  withoutDatabaseDeadline,
  DatabaseDeadlineExceededError,
} from "./database-deadline.js";

const operationSignals = new AsyncLocalStorage<AbortSignal>();
export function currentOperationSignal(): AbortSignal | undefined {
  return operationSignals.getStore();
}
export async function withOperationSignal<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  const parent = currentOperationSignal();
  const combined = parent ? AbortSignal.any([parent, signal]) : signal;
  return operationSignals.run(combined, async () => {
    combined.throwIfAborted();
    const result = await operation();
    combined.throwIfAborted();
    return result;
  });
}
function guardOperation(): void {
  currentOperationSignal()?.throwIfAborted();
}
function scopedSignal(controller: AbortController): AbortSignal {
  const parent = currentOperationSignal();
  return parent
    ? AbortSignal.any([parent, controller.signal])
    : controller.signal;
}
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}
export type LockAttempt<T> =
  | { status: "executed"; value: T }
  | { status: "capacity_unavailable" }
  | { status: "lock_busy" };

// Internal admission failure: the protected callback and its remote effects never ran.
export class LockCapacityUnavailableError extends Error {
  constructor() {
    super("Local execution capacity is temporarily unavailable");
    this.name = "LockCapacityUnavailableError";
  }
}
interface PendingEvent {
  type: string;
  payload: string;
}
const transactionEvents = new AsyncLocalStorage<{
  tx: Queryable;
  events: PendingEvent[];
}>();
let savepointCounter = 0;

/** Retryable local writes keep locks acquired by the parent transaction. Never
 * include an external side effect: PostgreSQL cannot roll that effect back. */
export async function withSavepoint<T>(
  tx: Queryable,
  write: () => Promise<T>,
): Promise<T> {
  const parent = transactionEvents.getStore();
  if (parent?.tx !== tx)
    throw new Error("Savepoints require the active Database transaction");
  guardOperation();
  const name = `local_write_${++savepointCounter}`;
  await tx.query(`SAVEPOINT ${name}`);
  const events: PendingEvent[] = [];
  try {
    const result = await transactionEvents.run({ tx, events }, write);
    guardOperation();
    await tx.query(`RELEASE SAVEPOINT ${name}`);
    parent.events.push(...events);
    return result;
  } catch (error) {
    // The child event buffer is discarded with its SQL. A failed rollback must
    // escape as a connection/transaction failure, never a retryable write error.
    await tx.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await tx.query(`RELEASE SAVEPOINT ${name}`);
    throw error;
  }
}
async function persistEvents(
  tx: Queryable,
  events: PendingEvent[],
): Promise<void> {
  if (!events.length) return;
  await tx.query("SELECT pg_advisory_xact_lock(913457)");
  for (const event of events)
    await tx.query("INSERT INTO events(type,payload) VALUES($1,$2)", [
      event.type,
      event.payload,
    ]);
}
export class Database implements Queryable {
  readonly pool: pg.Pool;
  private activeLocks = 0;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 20 });
    // Idle sockets can fail during a database restart. Active operations reject normally;
    // handling the pool event prevents a disconnected idle socket from crashing the process.
    this.pool.on("error", (error: Error) => {
      console.error(
        JSON.stringify({
          component: "postgres",
          event: "idle_connection_error",
          message: error.message,
        }),
      );
    });
  }
  async query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    guardOperation();
    const deadline = currentDatabaseDeadline();
    if (deadline !== undefined) {
      const connection = await DeadlineConnection.connect(this.pool, deadline);
      try {
        guardOperation();
        const result = await connection.client.query<R>(sql, values);
        guardOperation();
        return result;
      } finally {
        await connection.release();
      }
    }
    const result = await this.pool.query<R>(sql, values);
    guardOperation();
    return result;
  }
  async transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    guardOperation();
    const deadline = currentDatabaseDeadline();
    const bounded =
      deadline === undefined
        ? undefined
        : await DeadlineConnection.connect(this.pool, deadline);
    const tx = bounded?.client ?? (await this.pool.connect());
    const observation = installTestTransactionObserver(tx);
    const controller = new AbortController();
    const signal = scopedSignal(controller);
    let connectionFailed = false;
    const onError = (error: Error): void => {
      connectionFailed = true;
      controller.abort(error);
    };
    // Checked-out clients are not covered by pool.error while awaiting a remote service.
    tx.on("error", onError);
    try {
      return await operationSignals.run(signal, async () => {
        signal.throwIfAborted();
        await (observation
          ? observation.query("begin", () => tx.query("BEGIN"))
          : tx.query("BEGIN"));
        const events: PendingEvent[] = [];
        const result = await transactionEvents.run({ tx, events }, () =>
          fn(tx),
        );
        signal.throwIfAborted();
        // Acquire the global commit-order lock only after every domain row update.
        // No transaction may hold this lock and then wait for another domain row.
        await persistEvents(tx, events);
        signal.throwIfAborted();
        await (observation
          ? observation.query("commit", () => tx.query("COMMIT"))
          : tx.query("COMMIT"));
        return result;
      });
    } catch (error) {
      // A rollback on a broken socket must not hide the original failure.
      if (!connectionFailed && !bounded?.poisoned) {
        try {
          await (observation
            ? observation.query("rollback", () => tx.query("ROLLBACK"))
            : tx.query("ROLLBACK"));
        } catch {
          connectionFailed = true;
        }
      }
      throw error;
    } finally {
      observation?.release();
      tx.removeListener("error", onError);
      if (bounded) await bounded.release(connectionFailed);
      else tx.release(connectionFailed);
    }
  }
  // Session locks span remote calls. A lease alone cannot fence a still-running remote request.
  async withLock<T>(
    key: string,
    fn: (connection: PoolClient, signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> {
    const result = await this.tryWithLock(key, fn);
    return result.status === "executed" ? result.value : undefined;
  }
  // Background workers may defer either admission failure via withLock. Callers
  // interpreting a result must distinguish capacity from an already-owned entity.
  async tryWithLock<T>(
    key: string,
    fn: (connection: PoolClient, signal: AbortSignal) => Promise<T>,
  ): Promise<LockAttempt<T>> {
    guardOperation();
    // Each lock holder may need a second connection for a transaction. Bound admission
    // so queued lock holders cannot occupy the entire pool and deadlock their own work.
    if (this.activeLocks >= 8) return { status: "capacity_unavailable" };
    this.activeLocks++;
    let client: PoolClient | undefined;
    let bounded: DeadlineConnection | undefined;
    const controller = new AbortController();
    const signal = scopedSignal(controller);
    let connectionFailed = false;
    let operationFailed = false;
    let locked = false;
    const onError = (error: Error): void => {
      connectionFailed = true;
      controller.abort(error);
    };
    try {
      const deadline = currentDatabaseDeadline();
      bounded =
        deadline === undefined
          ? undefined
          : await DeadlineConnection.connect(this.pool, deadline);
      client = bounded?.client ?? (await this.pool.connect());
      client.on("error", onError);
      signal.throwIfAborted();
      const r = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key],
      );
      if (!r.rows[0]?.locked) return { status: "lock_busy" };
      locked = true;
      const connection = client;
      const result = await operationSignals.run(signal, () =>
        fn(connection, signal),
      );
      signal.throwIfAborted();
      return { status: "executed", value: result };
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      try {
        if (client && locked && !connectionFailed && !bounded?.poisoned) {
          try {
            await client.query(
              "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
              [key],
            );
          } catch (error) {
            connectionFailed = true;
            if (!operationFailed) throw error;
          }
        }
      } finally {
        client?.removeListener("error", onError);
        if (bounded) await bounded.release(connectionFailed);
        else client?.release(connectionFailed);
        this.activeLocks--;
      }
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
export async function emit(
  tx: Queryable,
  ...[type, payload]: PlatformEventArguments
): Promise<void> {
  const event = { type, payload: JSON.stringify(payload) };
  const pending = transactionEvents.getStore();
  if (pending?.tx === tx) pending.events.push(event);
  else await persistEvents(tx, [event]);
}
