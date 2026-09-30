import pg, { type QueryResult, type QueryResultRow, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

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
interface PendingEvent {
  type: string;
  payload: string;
}
const transactionEvents = new AsyncLocalStorage<{
  tx: Queryable;
  events: PendingEvent[];
}>();
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
    const result = await this.pool.query<R>(sql, values);
    guardOperation();
    return result;
  }
  async transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    guardOperation();
    const tx = await this.pool.connect();
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
        await tx.query("BEGIN");
        const events: PendingEvent[] = [];
        const result = await transactionEvents.run({ tx, events }, () =>
          fn(tx),
        );
        signal.throwIfAborted();
        // Acquire the global commit-order lock only after every domain row update.
        // No transaction may hold this lock and then wait for another domain row.
        await persistEvents(tx, events);
        signal.throwIfAborted();
        await tx.query("COMMIT");
        return result;
      });
    } catch (error) {
      // A rollback on a broken socket must not hide the original failure.
      if (!connectionFailed) {
        try {
          await tx.query("ROLLBACK");
        } catch {
          connectionFailed = true;
        }
      }
      throw error;
    } finally {
      tx.removeListener("error", onError);
      tx.release(connectionFailed);
    }
  }
  // Session locks span remote calls. A lease alone cannot fence a still-running remote request.
  async withLock<T>(
    key: string,
    fn: (connection: PoolClient, signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> {
    guardOperation();
    // Each lock holder may need a second connection for a transaction. Bound admission
    // so queued lock holders cannot occupy the entire pool and deadlock their own work.
    if (this.activeLocks >= 8) return undefined;
    this.activeLocks++;
    let client: PoolClient | undefined;
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
      client = await this.pool.connect();
      client.on("error", onError);
      signal.throwIfAborted();
      const r = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key],
      );
      if (!r.rows[0]?.locked) return undefined;
      locked = true;
      const connection = client;
      const result = await operationSignals.run(signal, () =>
        fn(connection, signal),
      );
      signal.throwIfAborted();
      return result;
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      try {
        if (client && locked && !connectionFailed) {
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
        client?.release(connectionFailed);
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
  type: string,
  payload: unknown,
): Promise<void> {
  const event = { type, payload: JSON.stringify(payload) };
  const pending = transactionEvents.getStore();
  if (pending?.tx === tx) pending.events.push(event);
  else await persistEvents(tx, [event]);
}
