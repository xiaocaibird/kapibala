import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import type { Queryable } from "../../apps/server/src/core/db.js";
import { ControlledDatabase } from "../qa-capacity/runtime.js";
import type {
  TestAccountObservation,
  TestAccountRequest,
  TestRuntimeObserver,
} from "../../apps/server/src/core/test-runtime-observer.js";
import { ControlError, type Binding } from "../qa-capacity/protocol.js";
import type {
  ObservationRuntime,
  ObservationSnapshot,
} from "../qa-observation/types.js";
import { protocol, requestSchema, type RuntimeRequest } from "./protocol.js";

type Stage =
  | "armed"
  | "injected"
  | "failed"
  | "before-next"
  | "running"
  | "executing"
  | "succeeded";
interface Lease {
  request: RuntimeRequest;
  snapshot: ObservationSnapshot;
  timer: NodeJS.Timeout;
  probe?: AccountProbe;
  stage: Stage;
  attemptId?: string;
  gate?: { promise: Promise<void>; release: () => void; next?: Stage };
}
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Only this explicit test entry observes raw COMMIT/ROLLBACK acknowledgements.
 * Business transaction/savepoint/event buffering remain Database's implementation. */
export class ObservedRuntimeDatabase extends ControlledDatabase {
  observer?: RuntimeObservation;
  override async transaction<T>(
    fn: (tx: PoolClient) => Promise<T>,
  ): Promise<T> {
    return super.transaction(async (tx) => {
      const query = tx.query;
      const release = tx.release;
      // Database and domain code use the Promise query overload. Restore before
      // returning this pooled client, including broken-connection cleanup.
      const observedQuery = (async (...args: unknown[]) => {
        const result = await Reflect.apply(query, tx, args);
        const sql = args[0];
        if (sql === "COMMIT" || sql === "ROLLBACK")
          this.observer?.transactionSettled(tx, sql === "COMMIT");
        return result;
      }) as PoolClient["query"];
      tx.query = observedQuery;
      tx.release = (...args) => {
        // A scoped database connection may already have restored native query.
        // Do not reinstall its old deadline wrapper as this client reenters the
        // pool, where pg uses the callback overload for ordinary queries.
        if (tx.query === observedQuery) tx.query = query;
        tx.release = release;
        this.observer?.transactionReleased(tx);
        return release.apply(tx, args);
      };
      return fn(tx);
    });
  }
}

export class RuntimeObservation
  implements TestRuntimeObserver, ObservationRuntime<RuntimeRequest>
{
  readonly protocol = protocol;
  private readonly leases = new Map<string, Lease>();
  private readonly transactions = new WeakMap<PoolClient, AccountProbe>();
  private names = new Set<string>();
  private closed = false;
  constructor(readonly db: ObservedRuntimeDatabase) {
    db.observer = this;
  }
  capabilities(): string[] {
    return ["account-local-save", "account-intent-wait", "module-tick"];
  }
  modules(names: string[]): void {
    this.names = new Set(names);
  }
  async establish(
    id: string,
    raw: RuntimeRequest,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot> {
    const request = requestSchema.parse(raw);
    if (this.closed) throw new ControlError(503, "Runtime observer is closed");
    const previous = this.leases.get(id);
    if (previous) {
      if (!isDeepStrictEqual(previous.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    if (Date.parse(expiresAt) <= Date.now())
      throw new ControlError(409, "Lease expired before establishment");
    const target = request.correlation;
    for (const lease of this.leases.values()) {
      if (lease.snapshot.state === "released") continue;
      const other = lease.request.correlation;
      if (
        (target.kind === "account" &&
          other.kind === "account" &&
          target.accountId === other.accountId) ||
        (target.kind === "module" &&
          other.kind === "module" &&
          target.module === other.module)
      )
        throw new ControlError(
          409,
          "Target already has an active observation lease",
        );
    }
    if (target.kind === "account") {
      const row = await this.db.query("SELECT 1 FROM accounts WHERE id=$1", [
        target.accountId,
      ]);
      if (!row.rowCount) throw new ControlError(404, "Account does not exist");
    } else if (!this.names.has(target.module))
      throw new ControlError(404, "Module does not exist");
    // Recheck after the account lookup: concurrent PUTs must not both arm a target.
    for (const lease of this.leases.values()) {
      const other = lease.request.correlation;
      if (
        lease.snapshot.state !== "released" &&
        target.kind === "account" &&
        other.kind === "account" &&
        target.accountId === other.accountId
      )
        throw new ControlError(
          409,
          "Target already has an active observation lease",
        );
    }
    if (this.closed || Date.parse(expiresAt) <= Date.now())
      throw new ControlError(409, "Lease unavailable after target lookup");
    const lease: Lease = {
      request,
      stage: "armed",
      snapshot: {
        protocol,
        leaseId: id,
        state: "armed",
        expiresAt,
        binding,
        correlation: target,
        events: [],
      },
      timer: setTimeout(
        () => {
          void this.release(id);
        },
        Math.max(1, Date.parse(expiresAt) - Date.now()),
      ),
    };
    lease.timer.unref();
    this.leases.set(id, lease);
    return this.snapshot(id);
  }
  snapshot(id: string): ObservationSnapshot {
    return structuredClone(this.get(id).snapshot);
  }
  async advance(id: string): Promise<ObservationSnapshot> {
    const lease = this.get(id);
    if (lease.snapshot.state === "released") return this.snapshot(id);
    const gate = lease.gate;
    if (lease.stage === "succeeded") return this.snapshot(id);
    if (gate) {
      lease.gate = undefined;
      if (gate.next) lease.stage = gate.next;
      lease.snapshot.state = "armed";
      gate.release();
    }
    return this.snapshot(id);
  }
  async release(id: string): Promise<ObservationSnapshot> {
    const lease = this.get(id);
    clearTimeout(lease.timer);
    lease.snapshot.state = "released";
    lease.gate?.release();
    lease.gate = undefined;
    return this.snapshot(id);
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.leases.keys()].map((id) => this.release(id)));
  }
  private get(id: string): Lease {
    const lease = this.leases.get(id);
    if (!lease)
      throw new ControlError(404, "Unknown runtime observation lease");
    return lease;
  }
  private active(lease: Lease): boolean {
    return lease.snapshot.state !== "released";
  }
  private gate(lease: Lease, next?: Stage): Promise<void> {
    if (!this.active(lease)) return Promise.resolve();
    if (lease.gate) return lease.gate.promise;
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    lease.gate = { promise, release, next };
    lease.snapshot.state = "held";
    return promise;
  }
  event(
    lease: Lease,
    kind: string,
    fields: Record<string, unknown> = {},
  ): void {
    lease.snapshot.events.push({
      seq: lease.snapshot.events.length + 1,
      at: new Date().toISOString(),
      kind,
      correlation: lease.snapshot.correlation,
      attemptId: lease.attemptId,
      instancePid: lease.snapshot.binding.pid,
      ...fields,
    });
  }
  account(request: TestAccountRequest): TestAccountObservation | undefined {
    if (this.closed) return undefined;
    let selected: Lease | undefined;
    for (const lease of this.leases.values()) {
      const c = lease.request.correlation;
      if (
        this.active(lease) &&
        c.kind === "account" &&
        c.accountId === request.accountId &&
        !lease.probe &&
        request.operation === "connect"
      ) {
        selected = lease;
        break;
      }
    }
    // New transition probes prove actual blocking on the held original account.
    if (
      !selected &&
      ![...this.leases.values()].some(
        (lease) =>
          this.active(lease) &&
          lease.request.correlation.kind === "account" &&
          lease.request.correlation.accountId === request.accountId &&
          lease.probe,
      )
    )
      return undefined;
    const probe = new AccountProbe(this, request, selected);
    if (selected) {
      selected.probe = probe;
      selected.attemptId = probe.attemptId;
    }
    return probe;
  }
  register(tx: PoolClient, probe: AccountProbe): void {
    this.transactions.set(tx, probe);
  }
  transactionSettled(tx: PoolClient, committed: boolean): void {
    const probe = this.transactions.get(tx);
    if (!probe) return;
    probe.settled(committed);
    this.transactions.delete(tx);
  }
  transactionReleased(tx: PoolClient): void {
    this.transactions.delete(tx);
  }
  async waitEvidence(probe: AccountProbe): Promise<void> {
    if (
      probe.request.operation !== "transition" ||
      probe.request.expectedFrom !== "online" ||
      probe.request.to !== "disconnected"
    )
      return;
    for (const lease of this.leases.values()) {
      const original = lease.probe;
      if (
        !original ||
        !this.active(lease) ||
        lease.snapshot.state !== "held" ||
        original.request.accountId !== probe.request.accountId ||
        original.request.requestId === probe.request.requestId ||
        !original.backendPid ||
        !probe.backendPid ||
        original.waiters.has(probe.request.requestId)
      )
        continue;
      const query = {
        text: "SELECT pg_blocking_pids($1) AS blockers",
        values: [probe.backendPid],
        query_timeout: 500,
      };
      const result = await this.db.pool.query<{ blockers: number[] }>(query);
      if (
        !probe.waiting ||
        !this.active(lease) ||
        !lease.gate ||
        !result.rows[0]?.blockers.includes(original.backendPid)
      )
        continue;
      original.waiters.add(probe.request.requestId);
      original.emit("newer-account-intent-waiting", {
        waitingIntent: {
          requestId: probe.request.requestId,
          accountId: probe.request.accountId,
          expectedFrom: "online",
          to: "disconnected",
          waitingForTransactionId: original.transactionId,
        },
      });
    }
  }
  holdAccount(lease: Lease): Promise<void> {
    const gate = this.gate(lease);
    this.event(lease, "local-retry-held", lease.probe!.identity());
    return gate;
  }
  private moduleLease(name: string): Lease | undefined {
    return [...this.leases.values()].find(
      (l) =>
        this.active(l) &&
        l.request.correlation.kind === "module" &&
        l.request.correlation.module === name,
    );
  }
  async beforeTick(name: string): Promise<void> {
    const lease = this.moduleLease(name);
    if (!lease) return;
    if (lease.stage === "failed") {
      lease.stage = "before-next";
      lease.attemptId = randomUUID();
      const hold = this.gate(lease, "running");
      this.event(lease, "module-before-next-held", {
        tickBoundary: "before-activity-and-diagnostics-start",
      });
      await hold;
    } else if (lease.stage === "succeeded") await this.gate(lease);
  }
  async tick(name: string, operation: () => Promise<void>): Promise<void> {
    const lease = this.moduleLease(name);
    if (lease?.stage === "armed") {
      lease.attemptId = randomUUID();
      lease.stage = "injected";
      // This is the fault thrown by the actual scheduler tick, not a diagnostics rewrite.
      throw new Error(
        lease.request.mode === "module-fail-then-hold"
          ? lease.request.faultMarker
          : "qa-runtime-module-failure",
      );
    }
    if (lease?.stage === "running") {
      const hold = this.gate(lease, "executing");
      this.event(lease, "module-running-held");
      await hold;
    }
    await operation();
  }
  tickFinished(name: string, succeeded: boolean): void {
    const lease = this.moduleLease(name);
    if (!lease) return;
    if (!succeeded && lease.stage === "injected") {
      lease.stage = "failed";
      this.event(lease, "module-failed", {
        faultMarker:
          lease.request.mode === "module-fail-then-hold"
            ? lease.request.faultMarker
            : undefined,
      });
    } else if (!succeeded && lease.stage === "executing") {
      lease.stage = "failed";
      this.event(lease, "module-failed", { failureSource: "module-operation" });
    } else if (succeeded && lease.stage === "executing") {
      lease.stage = "succeeded";
      void this.gate(lease);
      this.event(lease, "module-succeeded");
    }
  }
}

class AccountProbe implements TestAccountObservation {
  readonly attemptId = randomUUID();
  readonly transactionId = randomUUID();
  readonly waiters = new Set<string>();
  backendPid?: number;
  waiting = false;
  private remote = false;
  private injected = 0;
  private outstandingFault = false;
  constructor(
    private readonly runtime: RuntimeObservation,
    readonly request: TestAccountRequest,
    private readonly lease?: Lease,
  ) {}
  identity(): Record<string, unknown> {
    return {
      requestId: this.request.requestId,
      transactionId: this.transactionId,
      attemptId: this.attemptId,
    };
  }
  emit(kind: string, extra: Record<string, unknown> = {}): void {
    if (this.lease)
      this.runtime.event(this.lease, kind, { ...this.identity(), ...extra });
  }
  async transaction(tx: PoolClient): Promise<void> {
    this.runtime.register(tx, this);
    this.backendPid = (
      await tx.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
  }
  async lock<T>(acquire: () => Promise<T>): Promise<T> {
    this.waiting = true;
    const operation = acquire().finally(() => {
      this.waiting = false;
    });
    const monitor = (async () => {
      while (this.waiting) {
        await delay(20);
        if (this.waiting)
          await this.runtime.waitEvidence(this).catch(() => undefined);
      }
    })();
    try {
      return await operation;
    } finally {
      await monitor;
    }
  }
  remoteSucceeded(): void {
    this.remote = true;
    this.emit("remote-success");
  }
  async save(tx: Queryable): Promise<void> {
    if (
      !this.lease ||
      this.lease.snapshot.state === "released" ||
      (this.lease.request.mode === "account-save-once" && this.injected > 0)
    )
      return;
    this.injected++;
    this.outstandingFault = true;
    await tx.query(
      "DO $$ BEGIN RAISE EXCEPTION 'qa runtime local save fault' USING ERRCODE='55P03'; END $$",
    );
  }
  async saveFailed(error: unknown, willRetry: boolean): Promise<void> {
    if (
      !this.outstandingFault ||
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "55P03"
    )
      return;
    this.outstandingFault = false;
    this.emit("local-save-failed", { recoverableInOriginalTransaction: true });
    if (
      willRetry &&
      this.lease?.request.mode === "account-save-once" &&
      this.lease.snapshot.state !== "released"
    )
      await this.runtime.holdAccount(this.lease);
  }
  settled(committed: boolean): void {
    if (!this.remote) return;
    this.emit(
      committed ? "local-save-committed" : "transaction-rolled-back",
      committed
        ? { commitBoundary: "outer-commit-confirmed" }
        : { rollbackBoundary: "outer-rollback-confirmed" },
    );
  }
}
