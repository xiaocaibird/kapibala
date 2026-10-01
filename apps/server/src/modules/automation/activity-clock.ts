import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import type { Notification, PoolClient, QueryResultRow } from "pg";
import type { AppContext } from "../../core/context.js";
import {
  currentDatabaseDeadline,
  currentOperationSignal,
} from "../../core/db.js";
import type { ActivitySample } from "../../core/test-activity-observer.js";

const checkpointChannel = "kapibala_activity_checkpoint";
const checkpointTimeoutMs = 1500;

interface ClockLease {
  epochId: string;
  connection: PoolClient;
  failed: boolean;
  locked: boolean;
  schema: string;
  onError(error: Error): void;
  onNotification(message: Notification): void;
}

interface SampleRow extends QueryResultRow {
  id: string;
  group_id: string;
  active_ms: string;
}
function sampleRows(rows: SampleRow[]): ActivitySample[] {
  return rows.map((row) => ({
    runId: row.id,
    groupId: row.group_id,
    persistedActiveMs: Number(row.active_ms),
  }));
}

// One clock bills every runnable run, including runs waiting for a local slot.
// All clock writes use the lock-owning connection: losing ownership also aborts
// any pending write on that connection before another instance can take over.
export class ActivityClock {
  private lease: ClockLease | null = null;
  private work: Promise<void> | null = null;
  private pulseWork: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private readonly requested = new Set<string>();
  private notificationWork: Promise<void> | null = null;
  constructor(private readonly ctx: AppContext) {}

  async start(): Promise<void> {
    if (this.closed) return;
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.pulse().catch((error) => {
          this.ctx.log.error(
            { err: error },
            "Agent activity clock interrupted",
          );
        });
      }, 500);
      this.timer.unref();
    }
    await this.pulse();
  }

  private pulse(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.pulseWork) return this.pulseWork;
    // Targeted phase writes must not starve queued runs' periodic full sample.
    const work = this.enqueue(() => this.sample()).finally(() => {
      if (this.pulseWork === work) this.pulseWork = null;
    });
    this.pulseWork = work;
    return work;
  }

  private connect(timeoutMs = checkpointTimeoutMs): Promise<PoolClient> {
    if (timeoutMs <= 0)
      return Promise.reject(
        new Error("Activity clock connection acquisition timed out"),
      );
    return new Promise((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(
        () => {
          expired = true;
          reject(new Error("Activity clock connection acquisition timed out"));
        },
        Math.max(1, timeoutMs),
      );
      this.ctx.db.pool.connect().then(
        (connection) => {
          clearTimeout(timer);
          // pg's pool queue has no public cancel API. A late checkout is released
          // without issuing SQL; it cannot revive a timed-out checkpoint.
          if (expired) connection.release();
          else resolve(connection);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async observe<R extends QueryResultRow>(
    deadline: number,
    text: string,
    values?: unknown[],
  ) {
    const connection = await this.connect(deadline - performance.now());
    let failed = false;
    const onError = () => {
      failed = true;
    };
    connection.on("error", onError);
    try {
      if (performance.now() >= deadline)
        throw new Error("Activity checkpoint expired before observation");
      const config = {
        text,
        values,
        query_timeout: Math.max(1, deadline - performance.now()),
      };
      return await connection.query<R>(config);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      connection.removeListener("error", onError);
      connection.release(failed);
    }
  }

  private async waitForWork(
    work: Promise<void>,
    deadline: number,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Activity checkpoint queue timed out")),
            Math.max(1, deadline - performance.now()),
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private enqueue(sample: () => Promise<void>): Promise<void> {
    const work = (this.work ?? Promise.resolve()).then(sample).finally(() => {
      if (this.work === work) this.work = null;
    });
    this.work = work;
    return work;
  }

  private query<R extends QueryResultRow = QueryResultRow>(
    lease: ClockLease,
    text: string,
    values?: unknown[],
  ) {
    // A client timeout destroys the failed lease below. Never return a timed-out
    // query's connection to the pool while its server-side write can still run.
    const config = {
      text,
      values,
      query_timeout: checkpointTimeoutMs,
    };
    return lease.connection.query<R>(config);
  }

  private wake(): void {
    if (this.notificationWork || this.closed) return;
    const work = this.enqueue(async () => {
      if (this.requested.size && !this.closed) {
        const ids = [...this.requested];
        this.requested.clear();
        await this.sample(ids);
      }
    })
      .catch((error) => {
        this.ctx.log.error(
          { err: error },
          "Agent activity checkpoint wake interrupted",
        );
      })
      .finally(() => {
        if (this.notificationWork === work) this.notificationWork = null;
        if (this.requested.size && !this.closed) this.wake();
      });
    this.notificationWork = work;
  }

  async checkpoint(runId: string, phase: string): Promise<void> {
    const started = performance.now();
    const deadline = Math.min(
      started + checkpointTimeoutMs,
      currentDatabaseDeadline() ?? Infinity,
    );
    try {
      if (this.closed) throw new Error("Activity clock is closed");
      const signal = currentOperationSignal();
      signal?.throwIfAborted();
      const boundary = (
        await this.observe<{ at: Date; schema: string }>(
          deadline,
          "SELECT date_trunc('milliseconds',clock_timestamp()) AS at,current_schema() AS schema",
        )
      ).rows[0]!;
      // Joining a sample already in flight does not establish this new boundary.
      // Serialize a fresh targeted write on the existing lock-owning connection.
      await this.waitForWork(
        this.enqueue(async () => {
          if (performance.now() >= deadline)
            throw new Error("Activity checkpoint expired before sampling");
          await this.sample([runId]);
        }),
        deadline,
      );
      let notified = false;
      while (true) {
        signal?.throwIfAborted();
        if (this.closed || performance.now() >= deadline)
          throw new Error(
            "Activity checkpoint was not confirmed before its deadline",
          );
        const row = (
          await this.observe<{
            activity_updated_at: Date;
            status: string;
            recovery_note: string | null;
          }>(
            deadline,
            "SELECT activity_updated_at,status,recovery_note FROM agent_runs WHERE id=$1",
            [runId],
          )
        ).rows[0];
        if (performance.now() >= deadline)
          throw new Error(
            "Activity checkpoint was not confirmed before its deadline",
          );
        if (!row || row.status !== "running" || row.recovery_note) return;
        if (row.activity_updated_at.getTime() >= boundary.at.getTime()) return;
        // A follower never writes the owner's accounting. NOTIFY is only a hint;
        // committed activity_updated_at, not notification delivery, confirms it.
        if (!notified) {
          await this.observe(deadline, "SELECT pg_notify($1,$2)", [
            checkpointChannel,
            JSON.stringify({ schema: boundary.schema, runId }),
          ]);
          notified = true;
        }
        await delay(
          Math.min(20, Math.max(0, deadline - performance.now())),
          undefined,
          { signal },
        );
      }
    } catch (error) {
      this.ctx.log.error(
        {
          err: error,
          runId,
          phase,
          elapsedMs: performance.now() - started,
          clockOwner: Boolean(this.lease?.locked),
        },
        "Agent activity checkpoint failed; no next stage authorized",
      );
      throw error;
    } finally {
      const elapsedMs = performance.now() - started;
      if (elapsedMs >= 750)
        this.ctx.log.warn(
          { runId, phase, elapsedMs, clockOwner: Boolean(this.lease?.locked) },
          "Agent activity checkpoint delayed",
        );
    }
  }

  private async acquire(): Promise<void> {
    const connection = await this.connect();
    const lease: ClockLease = {
      epochId: randomUUID(),
      connection,
      failed: false,
      locked: false,
      schema: "",
      onError: () => {
        lease.failed = true;
        this.ctx.testActivityObserver?.clockLost(lease.epochId);
      },
      onNotification: (message) => {
        if (
          this.closed ||
          this.lease !== lease ||
          !lease.locked ||
          lease.failed ||
          message.channel !== checkpointChannel
        )
          return;
        try {
          const request = JSON.parse(message.payload ?? "") as {
            schema?: unknown;
            runId?: unknown;
          };
          if (
            request.schema !== lease.schema ||
            typeof request.runId !== "string" ||
            request.runId.length > 200
          )
            return;
          this.requested.add(request.runId);
          this.wake();
        } catch {
          /* Notification contents are only an optional wake hint. */
        }
      },
    };
    connection.on("error", lease.onError);
    connection.on("notification", lease.onNotification);
    this.lease = lease;
    let rows: SampleRow[] = [];
    let before = performance.now();
    try {
      // Server-side cancellation releases blocked row/advisory waits even when
      // closing a client socket alone would not interrupt PostgreSQL promptly.
      await this.query(lease, "SET statement_timeout = '1200ms'");
      // Every contender crosses this database barrier before testing ownership.
      // Taking the session lock first would let followers observe an owner whose
      // rebasing UPDATE is still blocked, then execute against the old base.
      await this.query(lease, "BEGIN");
      await this.query(
        lease,
        "SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':automation:activity-clock:init',0))",
      );
      const result = await this.query<{ locked: boolean; schema: string }>(
        lease,
        "SELECT pg_try_advisory_lock(hashtextextended(current_schema()||':automation:activity-clock',0)) AS locked,current_schema() AS schema",
      );
      lease.locked = Boolean(result.rows[0]?.locked);
      lease.schema = result.rows[0]?.schema ?? "";
      if (lease.locked) {
        await this.query(lease, `LISTEN ${checkpointChannel}`);
        // Lock first, then sample wall time after any initialization wait. now()
        // would use BEGIN's timestamp and accidentally charge that blocked wait.
        await this.query(
          lease,
          "SELECT id FROM agent_runs WHERE status='running' AND recovery_note IS NULL ORDER BY id FOR UPDATE",
        );
        before = performance.now();
        rows = (
          await this.query<SampleRow>(
            lease,
            `UPDATE agent_runs SET activity_updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE status='running' AND recovery_note IS NULL${this.ctx.testActivityObserver ? " RETURNING id,group_id,active_ms" : ""}`,
          )
        ).rows;
      }
      // The initialization barrier is released only after the new base commits.
      await this.query(lease, "COMMIT");
      if (lease.locked)
        this.ctx.testActivityObserver?.clockAcquired(
          lease.epochId,
          sampleRows(rows),
          {
            before,
            after: performance.now(),
          },
        );
      if (!lease.locked) await this.release();
    } catch (error) {
      lease.failed = true;
      await this.release();
      throw error;
    }
  }

  private async sample(ids?: string[]): Promise<void> {
    if (this.closed) return;
    if (this.lease?.failed) await this.release();
    if (!this.lease) await this.acquire();
    const lease = this.lease;
    if (!lease) return;
    try {
      const before = performance.now();
      const sampled = await this.query<SampleRow>(
        lease,
        `UPDATE agent_runs SET active_ms=active_ms+GREATEST(0,floor(extract(epoch FROM (date_trunc('milliseconds',now())-activity_updated_at))*1000))::bigint,activity_updated_at=date_trunc('milliseconds',now()) WHERE status='running' AND recovery_note IS NULL${ids ? " AND id=ANY($1::text[])" : ""}${this.ctx.testActivityObserver ? " RETURNING id,group_id,active_ms" : ""}`,
        ids ? [ids] : undefined,
      );
      this.ctx.testActivityObserver?.clockSampled(
        lease.epochId,
        sampleRows(sampled.rows),
        {
          before,
          after: performance.now(),
        },
      );
    } catch (error) {
      lease.failed = true;
      await this.release();
      throw error;
    }
  }

  private async release(): Promise<void> {
    const lease = this.lease;
    if (!lease) return;
    this.lease = null;
    if (lease.locked) this.ctx.testActivityObserver?.clockLost(lease.epochId);
    try {
      if (lease.locked && !lease.failed) {
        await this.query(lease, `UNLISTEN ${checkpointChannel}`);
        await this.query(
          lease,
          "SELECT pg_advisory_unlock(hashtextextended(current_schema()||':automation:activity-clock',0))",
        );
      }
      if (!lease.failed) await this.query(lease, "RESET statement_timeout");
    } catch {
      lease.failed = true;
    } finally {
      lease.connection.removeListener("error", lease.onError);
      lease.connection.removeListener("notification", lease.onNotification);
      lease.connection.release(lease.failed);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.requested.clear();
    if (this.timer) clearInterval(this.timer);
    await this.work?.catch(() => undefined);
    try {
      // A follower must not become a new owner during shutdown just to flush.
      if (this.lease && !this.lease.failed) {
        // Shutdown flush owns an existing lease and cannot acquire a new one.
        await this.query(
          this.lease,
          "UPDATE agent_runs SET active_ms=active_ms+GREATEST(0,floor(extract(epoch FROM (date_trunc('milliseconds',now())-activity_updated_at))*1000))::bigint,activity_updated_at=date_trunc('milliseconds',now()) WHERE status='running' AND recovery_note IS NULL",
        );
      }
    } catch (error) {
      if (this.lease) this.lease.failed = true;
      throw error;
    } finally {
      await this.release();
    }
  }
}
