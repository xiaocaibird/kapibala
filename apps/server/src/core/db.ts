import pg, { type QueryResult, type QueryResultRow, type PoolClient } from "pg";
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
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
    return this.pool.query<R>(sql, values);
  }
  async transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      const result = await fn(tx);
      await tx.query("COMMIT");
      return result;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
  }
  // Session locks span remote calls. A lease alone cannot fence a still-running remote request.
  async withLock<T>(
    key: string,
    fn: (connection: PoolClient) => Promise<T>,
  ): Promise<T | undefined> {
    // Each lock holder may need a second connection for a transaction. Bound admission
    // so queued lock holders cannot occupy the entire pool and deadlock their own work.
    if (this.activeLocks >= 8) return undefined;
    this.activeLocks++;
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      const r = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key],
      );
      if (!r.rows[0]?.locked) return undefined;
      try {
        return await fn(client);
      } finally {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [key],
        );
      }
    } finally {
      client?.release();
      this.activeLocks--;
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
  // The transaction-level lock makes committed sequence order agree with allocation order.
  await tx.query("SELECT pg_advisory_xact_lock(913457)");
  await tx.query("INSERT INTO events(type,payload) VALUES($1,$2)", [
    type,
    JSON.stringify(payload),
  ]);
}
