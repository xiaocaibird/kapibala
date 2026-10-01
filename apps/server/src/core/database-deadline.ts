import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Pool,
  PoolClient,
  QueryConfig,
  QueryResult,
  QueryResultRow,
} from "pg";

const deadlines = new AsyncLocalStorage<number | undefined>();

/** Monotonic, absolute database deadline. It never changes activity accounting. */
export function currentDatabaseDeadline(): number | undefined {
  return deadlines.getStore();
}

export class DatabaseDeadlineExceededError extends Error {
  constructor(readonly phase: "connect" | "query") {
    super(`Database ${phase} exceeded its original deadline`);
    this.name = "DatabaseDeadlineExceededError";
  }
}

export function withDatabaseDeadline<T>(
  deadline: number,
  operation: () => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(deadline))
    throw new Error("Database deadline must be a finite monotonic timestamp");
  const parent = currentDatabaseDeadline();
  return deadlines.run(Math.min(parent ?? deadline, deadline), operation);
}

export function withoutDatabaseDeadline<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return deadlines.run(undefined, operation);
}

function remaining(deadline: number, phase: "connect" | "query"): number {
  const left =
    Math.min(deadline, currentDatabaseDeadline() ?? deadline) -
    performance.now();
  if (left <= 0) throw new DatabaseDeadlineExceededError(phase);
  return Math.max(1, Math.floor(left));
}

/** pg cannot cancel a queued pool acquisition. A late checkout never issues SQL. */
export function connectBeforeDeadline(
  pool: Pool,
  deadline: number,
): Promise<PoolClient> {
  const timeoutMs = remaining(deadline, "connect");
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new DatabaseDeadlineExceededError("connect"));
    }, timeoutMs);
    pool.connect().then(
      (client) => {
        clearTimeout(timer);
        if (expired || performance.now() >= deadline) {
          client.release();
          if (!expired) reject(new DatabaseDeadlineExceededError("connect"));
        } else resolve(client);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function acknowledgedSqlError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const severity = "severity" in error ? error.severity : undefined;
  return (
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code) &&
    !error.code.startsWith("08") &&
    severity !== "FATAL" &&
    severity !== "PANIC"
  );
}

/** One checked-out client, with the same identity used by transaction/event probes.
 * Client read timeouts do not acknowledge PostgreSQL cancellation. Such a client
 * is poisoned and destroyed; no ROLLBACK or pool reuse may pretend otherwise. */
export class DeadlineConnection {
  poisoned = false;
  private readonly originalQuery: PoolClient["query"];
  private readonly rawQuery: PoolClient["query"];
  private settings:
    | { statement: string; lock: string; statement_ms: number; lock_ms: number }
    | undefined;
  private readonly onError = () => {
    this.poisoned = true;
  };

  private constructor(
    readonly client: PoolClient,
    private readonly deadline: number,
  ) {
    this.originalQuery = client.query;
    this.rawQuery = client.query.bind(client);
    client.on("error", this.onError);
  }

  static async connect(
    pool: Pool,
    deadline: number,
  ): Promise<DeadlineConnection> {
    const connection = new DeadlineConnection(
      await connectBeforeDeadline(pool, deadline),
      deadline,
    );
    try {
      connection.settings = (
        await connection.raw<{
          statement: string;
          lock: string;
          statement_ms: number;
          lock_ms: number;
        }>({
          text: "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock,(SELECT setting::integer FROM pg_settings WHERE name='statement_timeout') AS statement_ms,(SELECT setting::integer FROM pg_settings WHERE name='lock_timeout') AS lock_ms",
        })
      ).rows[0];
      if (!connection.settings)
        throw new Error("Database timeout settings unavailable");
      // The application uses promise queries. Preserve configs (including rowMode)
      // as well as the common SQL/values form; never silently bypass the deadline.
      connection.client.query = (async (
        sql: string | QueryConfig,
        values?: unknown[],
      ) => {
        if (typeof sql !== "string" && (!sql || typeof sql.text !== "string"))
          throw new Error("Database deadline requires a SQL promise query");
        if (values !== undefined && !Array.isArray(values))
          throw new Error("Database deadline requires a SQL promise query");
        return connection.query(
          typeof sql === "string" ? { text: sql, values } : sql,
        );
      }) as PoolClient["query"];
      return connection;
    } catch (error) {
      connection.poisoned = true;
      await connection.release();
      throw error;
    }
  }

  private async raw<R extends QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<R>> {
    const timeoutMs = remaining(this.deadline, "query");
    if (this.poisoned)
      throw new Error("Database deadline connection is unusable");
    try {
      const timed = { ...config, query_timeout: timeoutMs };
      return await this.rawQuery<R>(timed);
    } catch (error) {
      if (!acknowledgedSqlError(error)) this.poisoned = true;
      throw error;
    }
  }

  private async query<R extends QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<R>> {
    const left = remaining(this.deadline, "query");
    // Give server cancellation a small acknowledgement/cleanup head start. This
    // is not a completion guarantee; transport remains bounded by the same deadline.
    const serverMs = Math.max(1, left - 25);
    const statementMs = Math.min(
      serverMs,
      this.settings!.statement_ms || Infinity,
    );
    const lockMs = Math.min(serverMs, this.settings!.lock_ms || Infinity);
    // An aborted transaction cannot execute SET. ROLLBACK must go straight to
    // the server and be acknowledged before this connection becomes reusable.
    if (!/^\s*(?:ROLLBACK|ABORT)\b/i.test(config.text)) {
      await this.raw({
        text: "SELECT set_config('statement_timeout',$1,false),set_config('lock_timeout',$2,false)",
        values: [`${statementMs}ms`, `${lockMs}ms`],
      });
    }
    // Do not inspect time after a response: especially COMMIT, whose successful
    // acknowledgement remains a real committed fact even if JS resumes late.
    return this.raw<R>(config);
  }

  async release(destroy = false): Promise<void> {
    this.poisoned ||= destroy;
    try {
      if (!this.poisoned && this.settings) {
        await this.raw({
          text: "SELECT set_config('statement_timeout',$1,false),set_config('lock_timeout',$2,false)",
          values: [this.settings.statement, this.settings.lock],
        });
      }
    } catch {
      this.poisoned = true;
    } finally {
      this.client.query = this.originalQuery;
      this.client.removeListener("error", this.onError);
      // release(true) requests destruction. It does not acknowledge server
      // ROLLBACK, nor resolve a COMMIT whose response was never received.
      this.client.release(this.poisoned);
    }
  }
}
