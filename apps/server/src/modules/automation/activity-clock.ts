import type { PoolClient } from "pg";
import type { AppContext } from "../../core/context.js";

interface ClockLease {
  connection: PoolClient;
  failed: boolean;
  locked: boolean;
  onError(error: Error): void;
}

// One clock bills every runnable run, including runs waiting for a local slot.
// All clock writes use the lock-owning connection: losing ownership also aborts
// any pending write on that connection before another instance can take over.
export class ActivityClock {
  private lease: ClockLease | null = null;
  private work: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
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
    if (this.work) return this.work;
    if (this.closed) return Promise.resolve();
    const work = this.sample().finally(() => {
      if (this.work === work) this.work = null;
    });
    this.work = work;
    return work;
  }

  private async acquire(): Promise<void> {
    const connection = await this.ctx.db.pool.connect();
    const lease: ClockLease = {
      connection,
      failed: false,
      locked: false,
      onError: () => {
        lease.failed = true;
      },
    };
    connection.on("error", lease.onError);
    this.lease = lease;
    try {
      // Every contender crosses this database barrier before testing ownership.
      // Taking the session lock first would let followers observe an owner whose
      // rebasing UPDATE is still blocked, then execute against the old base.
      await connection.query("BEGIN");
      await connection.query(
        "SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':automation:activity-clock:init',0))",
      );
      const result = await connection.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended(current_schema()||':automation:activity-clock',0)) AS locked",
      );
      lease.locked = Boolean(result.rows[0]?.locked);
      if (lease.locked) {
        // Lock first, then sample wall time after any initialization wait. now()
        // would use BEGIN's timestamp and accidentally charge that blocked wait.
        await connection.query(
          "SELECT id FROM agent_runs WHERE status='running' AND recovery_note IS NULL ORDER BY id FOR UPDATE",
        );
        await connection.query(
          "UPDATE agent_runs SET activity_updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE status='running' AND recovery_note IS NULL",
        );
      }
      // The initialization barrier is released only after the new base commits.
      await connection.query("COMMIT");
      if (!lease.locked) await this.release();
    } catch (error) {
      lease.failed = true;
      await this.release();
      throw error;
    }
  }

  private async sample(): Promise<void> {
    if (this.lease?.failed) await this.release();
    if (!this.lease) await this.acquire();
    const lease = this.lease;
    if (!lease) return;
    try {
      await lease.connection.query(
        `UPDATE agent_runs SET active_ms=active_ms+GREATEST(0,floor(extract(epoch FROM (date_trunc('milliseconds',now())-activity_updated_at))*1000))::bigint,activity_updated_at=date_trunc('milliseconds',now()) WHERE status='running' AND recovery_note IS NULL`,
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
    try {
      if (lease.locked && !lease.failed)
        await lease.connection.query(
          "SELECT pg_advisory_unlock(hashtextextended(current_schema()||':automation:activity-clock',0))",
        );
    } catch {
      lease.failed = true;
    } finally {
      lease.connection.removeListener("error", lease.onError);
      lease.connection.release(lease.failed);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.work?.catch(() => undefined);
    try {
      // A follower must not become a new owner during shutdown just to flush.
      if (this.lease && !this.lease.failed) await this.sample();
    } finally {
      await this.release();
    }
  }
}
