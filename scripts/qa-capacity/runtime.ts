import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import type { PoolClient } from "pg";
import { Database, type LockAttempt } from "../../apps/server/src/core/db.js";
import type {
  TestExecutionObserver,
  TestKickCorrelation,
} from "../../apps/server/src/core/test-execution-observer.js";
import {
  ControlError,
  matches,
  protocol,
  same,
  type CapacityEvent,
  type LeaseRequest,
  type Snapshot,
} from "./protocol.js";
import {
  processIdentity,
  registryDirectory,
  type Registration,
} from "./ownership.js";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
interface Attempt {
  correlation: TestKickCorrelation;
  attemptId: string;
}
const attempts = new AsyncLocalStorage<Attempt>();

/** This subclass forwards admission unchanged, observing the actual returned
 * result and protected callback. It is the very Database given to createApp. */
export class ControlledDatabase extends Database {
  refused?: (attempt: Attempt) => void;
  override async tryWithLock<T>(
    key: string,
    fn: (connection: PoolClient, signal: AbortSignal) => Promise<T>,
  ): Promise<LockAttempt<T>> {
    let entered = false;
    const result = await super.tryWithLock(key, (connection, signal) => {
      entered = true;
      return fn(connection, signal);
    });
    const attempt = attempts.getStore();
    if (
      attempt &&
      key ===
        `kick:${attempt.correlation.groupId}:${attempt.correlation.targetPlatformUserId}` &&
      result.status === "capacity_unavailable" &&
      !entered
    )
      this.refused?.(attempt);
    return result;
  }
}
interface Lease {
  request: LeaseRequest;
  snapshot: Snapshot;
  releaseGate: ReturnType<typeof deferred>;
  holders: Promise<unknown>[];
  timer: NodeJS.Timeout;
  release?: Promise<void>;
  pending: Map<string, Attempt>;
  terminal: boolean;
}
export class CapacityRuntime implements TestExecutionObserver {
  readonly instanceId = randomUUID();
  private registration?: Registration;
  private readonly leases = new Map<string, Lease>();
  private readonly bridge = Fastify({ logger: false, bodyLimit: 16_384 });
  private timer?: NodeJS.Timeout;
  private sampling?: Promise<void>;
  private closed = false;
  private creation: Promise<unknown> = Promise.resolve();
  private file?: string;
  constructor(readonly db: ControlledDatabase) {
    db.refused = (attempt) => this.refused(attempt);
    this.bridge.setErrorHandler((error, _request, reply) =>
      reply
        .code(error instanceof ControlError ? error.status : 500)
        .send({ error: String(error) }),
    );
    this.bridge.get("/identity", () => this.registration);
    this.bridge.put<{
      Params: { id: string };
      Body: { request: LeaseRequest; expiresAt: string };
    }>("/leases/:id", (request) =>
      this.hold(
        request.params.id,
        request.body.request,
        request.body.expiresAt,
      ),
    );
    this.bridge.get<{ Params: { id: string } }>("/leases/:id", (request) =>
      this.snapshot(request.params.id),
    );
    this.bridge.delete<{ Params: { id: string } }>(
      "/leases/:id",
      async (request) => {
        await this.release(request.params.id);
        return this.snapshot(request.params.id);
      },
    );
  }
  async listen(
    directory: string,
    apiUrl: string,
    revision: string,
  ): Promise<Registration> {
    const token = process.env.QA_ACCEPTANCE_RESOURCE_TOKEN;
    if (!token) throw new ControlError(403, "Explicit QA owner token required");
    const folder = await registryDirectory(directory);
    const identity = await processIdentity(process.pid);
    const guardian = await processIdentity(identity.pgid);
    const socket = join(folder, `${this.instanceId}.sock`);
    this.registration = {
      instanceId: this.instanceId,
      socket,
      appPid: process.pid,
      appStarted: identity.started,
      guardianStarted: guardian.started,
      binding: {
        apiUrl,
        revision,
        pid: identity.pgid,
        observedOwnerToken: token,
      },
    };
    await this.bridge.listen({ path: socket });
    await chmod(socket, 0o600);
    this.file = join(folder, `${this.instanceId}.json`);
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.registration), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(`${this.file}.tmp`, this.file);
    this.timer = setInterval(() => {
      if (this.closed || this.sampling) return;
      this.sampling = this.sampleTerminals()
        .catch((error: unknown) => {
          console.error("Capacity observation sample failed", error);
        })
        .finally(() => {
          this.sampling = undefined;
        });
    }, 100);
    this.timer.unref();
    return this.registration;
  }
  private append(
    lease: Lease,
    event: Omit<
      CapacityEvent,
      "seq" | "at" | "groupId" | "runId" | "toolUseId"
    >,
  ): void {
    lease.snapshot.events.push({
      ...lease.request.correlation,
      seq: lease.snapshot.events.length + 1,
      at: new Date().toISOString(),
      ...event,
    });
  }
  private refused(attempt: Attempt): void {
    for (const lease of this.leases.values()) {
      if (
        lease.snapshot.state !== "held" ||
        !matches(lease.request.correlation, attempt.correlation)
      )
        continue;
      lease.pending.set(attempt.correlation.toolUseId, attempt);
      this.append(lease, {
        kind: "admission-refused",
        attemptId: attempt.attemptId,
        reason: "capacity",
        callbackEntered: false,
        remoteRequestCount: 0,
      });
    }
  }
  kick<T>(
    correlation: TestKickCorrelation,
    operation: () => Promise<T>,
  ): Promise<T> {
    return attempts.run({ correlation, attemptId: randomUUID() }, operation);
  }
  async ready(
    correlation: TestKickCorrelation,
    phase: "before" | "after",
  ): Promise<void> {
    for (const lease of this.leases.values()) {
      const attempt = lease.pending.get(correlation.toolUseId);
      if (!attempt || !matches(lease.request.correlation, correlation))
        continue;
      if (
        phase === "before" &&
        lease.snapshot.state === "held" &&
        lease.request.mode === "hold-after-refusal-before-ready"
      ) {
        this.append(lease, {
          kind: "before-ready-held",
          attemptId: attempt.attemptId,
          reason: "capacity",
          callbackEntered: false,
          remoteRequestCount: 0,
        });
        await lease.releaseGate.promise;
      } else if (phase === "after") {
        this.append(lease, {
          kind: "ready-persisted",
          attemptId: attempt.attemptId,
        });
        lease.pending.delete(correlation.toolUseId);
      }
    }
  }
  hold(
    id: string,
    request: LeaseRequest,
    expiresAt: string,
  ): Promise<Snapshot> {
    const work = this.creation
      .catch(() => undefined)
      .then(() => this.establish(id, request, expiresAt));
    this.creation = work;
    return work;
  }
  private async establish(
    id: string,
    request: LeaseRequest,
    expiresAt: string,
  ): Promise<Snapshot> {
    if (!this.registration || this.closed)
      throw new ControlError(409, "SUT bridge is not ready");
    const old = this.leases.get(id);
    if (old) {
      if (!same(old.request, request))
        throw new ControlError(409, "Lease identity cannot change");
      return this.snapshot(id);
    }
    if (
      [...this.leases.values()].some((lease) => lease.snapshot.state === "held")
    )
      throw new ControlError(409, "This SUT already has a capacity lease");
    const valid = await this.db.query(
      "SELECT 1 FROM agent_runs r JOIN agent_steps s ON s.run_id=r.id WHERE r.id=$1 AND r.group_id=$2 AND s.tool_use_id=$3 AND r.status='running' AND s.name='kick_user'",
      [
        request.correlation.runId,
        request.correlation.groupId,
        request.correlation.toolUseId,
      ],
    );
    if (!valid.rowCount)
      throw new ControlError(
        409,
        "Correlation is not a current kick step in this SUT",
      );
    const ttl = Date.parse(expiresAt) - Date.now();
    if (ttl <= 0 || ttl > 120_000)
      throw new ControlError(409, "Lease expired or exceeds 120 seconds");
    const releaseGate = deferred();
    const lease: Lease = {
      request,
      snapshot: {
        protocol,
        leaseId: id,
        state: "held",
        expiresAt,
        binding: this.registration.binding,
        correlation: request.correlation,
        events: [],
      },
      releaseGate,
      holders: [],
      timer: setTimeout(() => {
        void this.release(id).catch((error: unknown) =>
          console.error("Capacity release failed", error),
        );
      }, ttl),
      pending: new Map(),
      terminal: false,
    };
    this.leases.set(id, lease);
    const keys: string[] = [];
    try {
      for (let index = 0; index < 64; index++) {
        if (Date.now() >= Date.parse(expiresAt) || lease.release)
          throw new ControlError(409, "Lease expired during admission");
        const key = `qa-capacity:${this.instanceId}:${id}:${index}`;
        const entered = deferred();
        const holder = this.db.tryWithLock(key, async (_connection, signal) => {
          keys.push(key);
          entered.resolve();
          await Promise.race([
            releaseGate.promise,
            new Promise<void>((_resolve, reject) => {
              if (signal.aborted) reject(signal.reason);
              else
                signal.addEventListener("abort", () => reject(signal.reason), {
                  once: true,
                });
            }),
          ]);
        });
        // Attach rejection immediately: a live holder can lose its connection while
        // later holders are being admitted. Never leave an unhandled rejection.
        const tracked = holder.catch(async (error: unknown) => {
          releaseGate.resolve();
          throw error;
        });
        void tracked.catch(() => {
          void this.release(id);
        });
        lease.holders.push(tracked);
        const result = await Promise.race([
          entered.promise.then(() => "entered" as const),
          holder,
        ]);
        if (result === "entered") continue;
        if (result.status !== "capacity_unavailable" || keys.length === 0)
          throw new ControlError(
            409,
            "No owned capacity saturation established",
          );
        this.append(lease, { kind: "capacity-held", holderKeys: keys });
        return this.snapshot(id);
      }
      throw new ControlError(
        409,
        "Capacity exceeds bounded engineering holder limit",
      );
    } catch (error) {
      await this.release(id);
      throw error;
    }
  }
  snapshot(id: string): Snapshot {
    const lease = this.leases.get(id);
    if (!lease) throw new ControlError(404, "Unknown lease");
    return structuredClone(lease.snapshot);
  }
  release(id: string): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease) return Promise.reject(new ControlError(404, "Unknown lease"));
    return (lease.release ??= (async () => {
      clearTimeout(lease.timer);
      lease.releaseGate.resolve();
      await Promise.allSettled(lease.holders);
      lease.snapshot.state = "released";
    })());
  }
  private async sampleTerminals(): Promise<void> {
    for (const lease of this.leases.values()) {
      if (lease.terminal) continue;
      const result = await this.db.query<{
        status: string;
        end_reason: string | null;
        active_ms: string;
        tail_ms: string;
      }>(
        "SELECT status,end_reason,active_ms,GREATEST(0,ceil(extract(epoch FROM (clock_timestamp()-activity_updated_at))*1000))::text AS tail_ms FROM agent_runs WHERE id=$1 AND status<>'running'",
        [lease.request.correlation.runId],
      );
      const row = result.rows[0];
      if (!row) continue;
      lease.terminal = true;
      const lower = Number(row.active_ms);
      this.append(lease, {
        kind: "run-terminal",
        status: row.status,
        endReason: row.end_reason,
        activeElapsedMs: [lower, lower + Number(row.tail_ms) + 1],
        clockSource:
          "persisted active_ms through last sample; upper includes DB sample-to-terminal-observation tail plus 1ms timestamp resolution; prior hard-crash unsampled tail is not reconstructable",
      });
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    await this.sampling;
    await this.creation.catch(() => undefined);
    await Promise.all([...this.leases.keys()].map((id) => this.release(id)));
    await this.bridge.close();
    if (this.file)
      await unlink(this.file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
}
