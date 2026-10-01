import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  currentOperationSignal,
  type Database,
} from "../../apps/server/src/core/db.js";
import type {
  ActivitySample,
  ActivityWindow,
  TestActivityObserver,
} from "../../apps/server/src/core/test-activity-observer.js";
import {
  ControlError,
  targetSchema,
  type Binding,
} from "../qa-capacity/protocol.js";
import type {
  ObservationRuntime,
  ObservationSnapshot,
} from "../qa-observation/types.js";
import { clockDomain } from "./clock.js";

export const activityProtocol = "qa-runtime-observation/1" as const;
export const activityRequestSchema = z
  .object({
    protocol: z.literal(activityProtocol),
    target: targetSchema,
    mode: z.enum(["observe-activity", "hold-safe-activity-boundary"]),
    correlation: z
      .object({
        kind: z.literal("activity"),
        groupId: z.string().min(1).max(200),
        runId: z.string().min(1).max(200),
        toolUseId: z.literal("all-run-steps"),
      })
      .strict(),
    ttlMs: z.number().int().min(5000).max(120000),
  })
  .strict();
export type ActivityRequest = z.infer<typeof activityRequestSchema>;
export interface ActivityObservationSnapshot extends ObservationSnapshot {
  clockObservation: {
    clockDomain: string;
    clockUnit: "ms";
    applicationPid: number;
    monotonicMs: number;
  };
}

type ActivityState = "active" | "recovery-paused" | "terminal" | "unknown";
interface RunWitness extends ActivitySample {
  attemptId: string;
  epochIds: string[];
  began: ActivityWindow;
  ended?: ActivityWindow;
  state: ActivityState;
  complete: boolean;
  epochObservation: {
    continuous: boolean;
    startSource: "run-creation" | "clock-acquisition" | "unwitnessed";
  };
  reason?: string;
  lastSuccessfulSample?: {
    epochId: string;
    at: ActivityWindow;
    persistedActiveMs: number;
  };
}
interface Lease {
  request: ActivityRequest;
  snapshot: ObservationSnapshot;
  timer: NodeJS.Timeout;
  consumed: boolean;
  gate?: { release(): void };
}
const point = (): ActivityWindow => {
  const now = performance.now();
  return { before: now, after: now };
};
const interval = (
  began: ActivityWindow,
  ended: ActivityWindow,
): [number, number] => [
  Math.max(0, Math.floor(ended.before - began.after)),
  Math.max(0, Math.ceil(ended.after - began.before)),
];

/** An explicit engineering-entry observer. Never substitutes the persistent
 * wall-clock ledger for monotonic activity truth or reconstructs a killed tail. */
export class ActivityWitness
  implements TestActivityObserver, ObservationRuntime<ActivityRequest>
{
  readonly protocol = activityProtocol;
  private readonly runs = new Map<string, RunWitness>();
  private readonly leases = new Map<string, Lease>();
  private epoch?: { id: string; acquired: ActivityWindow };
  private closed = false;
  constructor(private readonly db: Database) {}
  capabilities(): string[] {
    return ["activity-witness", "activity-safe-boundary"];
  }
  private observed(row: ActivitySample, at: ActivityWindow): RunWitness {
    const previous = this.runs.get(row.runId);
    if (previous) {
      previous.persistedActiveMs = row.persistedActiveMs;
      return previous;
    }
    const witness: RunWitness = {
      ...row,
      attemptId: randomUUID(),
      epochIds: this.epoch ? [this.epoch.id] : [],
      began: at,
      state: this.epoch ? "active" : "unknown",
      complete: false,
      epochObservation: { continuous: false, startSource: "unwitnessed" },
      reason:
        "Run creation or earlier epoch tail was not witnessed by this process.",
    };
    this.runs.set(row.runId, witness);
    return witness;
  }
  clockAcquired(
    epochId: string,
    rows: ActivitySample[],
    at: ActivityWindow,
  ): void {
    if (this.closed) return;
    if (this.epoch) this.clockLost(this.epoch.id);
    this.epoch = { id: epochId, acquired: at };
    for (const row of rows) {
      const witness = this.observed(row, at);
      if (!witness.epochIds.includes(epochId)) witness.epochIds.push(epochId);
      // COMMIT acknowledgement of a rebase may arrive after another connection
      // has confirmed a pause or terminal transition. Never undo that fact.
      if (witness.state === "terminal" || witness.state === "recovery-paused")
        continue;
      witness.complete = false;
      witness.lastSuccessfulSample = undefined;
      witness.epochObservation = {
        continuous: true,
        startSource: "clock-acquisition",
      };
      witness.began = at;
      witness.ended = undefined;
      witness.state = "active";
      witness.reason =
        "A pre-existing run was rebased after clock ownership acquisition; prior unsaved activity is not reconstructable.";
      this.changed(witness);
    }
  }
  clockSampled(
    epochId: string,
    rows: ActivitySample[],
    at: ActivityWindow,
  ): void {
    if (this.closed || this.epoch?.id !== epochId) return;
    for (const row of rows) {
      const witness = this.observed(row, at);
      // A sample may have committed before a pause/terminal transaction but its
      // response can arrive later. It must not revive the newer state fact.
      if (witness.state === "terminal" || witness.state === "recovery-paused")
        continue;
      if (witness.state !== "active") {
        witness.complete = false;
        witness.epochObservation = {
          continuous: false,
          startSource: "unwitnessed",
        };
        witness.began = at;
        witness.state = "active";
        witness.ended = undefined;
        witness.reason =
          "Activity resumed without a fully witnessed continuous interval.";
      }
      witness.lastSuccessfulSample = {
        epochId,
        at: { ...at },
        persistedActiveMs: row.persistedActiveMs,
      };
      if (!witness.epochIds.includes(epochId)) witness.epochIds.push(epochId);
      this.changed(witness);
    }
  }
  clockLost(epochId: string): void {
    if (this.epoch?.id !== epochId) return;
    this.epoch = undefined;
    for (const witness of this.runs.values()) {
      if (witness.state !== "active") continue;
      witness.complete = false;
      witness.epochObservation.continuous = false;
      witness.state = "unknown";
      witness.ended = point();
      witness.reason =
        "Clock ownership was lost; continuous activity and the unsaved tail are no longer proven.";
      this.changed(witness);
      // The run lock and continuation barrier are independent of the clock
      // connection. Keep the actual barrier held; only invalidate its timing
      // completeness until the caller explicitly releases it or TTL expires.
    }
  }
  runCreated(row: ActivitySample, at: ActivityWindow): void {
    if (this.closed) return;
    const witness = this.observed(row, at);
    // The entire creation transaction must lie inside one witnessed ownership
    // epoch. A lock acquisition after BEGIN cannot retroactively prove its past.
    const complete = Boolean(
      this.epoch && this.epoch.acquired.after <= at.before,
    );
    witness.began = at;
    witness.complete = complete;
    witness.epochObservation = {
      continuous: complete,
      startSource: "run-creation",
    };
    witness.state = this.epoch ? "active" : "unknown";
    witness.ended = undefined;
    witness.reason = complete
      ? undefined
      : "Creation crossed an unwitnessed clock ownership boundary.";
    this.changed(witness);
  }
  runPaused(runId: string, at: ActivityWindow): void {
    this.ended(runId, "recovery-paused", at);
  }
  runTerminal(runId: string, at: ActivityWindow): void {
    this.ended(runId, "terminal", at);
  }
  private ended(
    runId: string,
    state: "recovery-paused" | "terminal",
    at: ActivityWindow,
  ): void {
    const witness = this.runs.get(runId);
    if (!witness || this.closed) return;
    // A paused run's later cancellation must not charge its recovery pause.
    if (!witness.ended) witness.ended = at;
    witness.state = state;
    this.changed(witness);
    for (const lease of this.matching(runId)) this.unhold(lease);
    if (state === "terminal" && !this.matching(runId).length)
      this.runs.delete(runId);
  }
  private fields(witness: RunWitness): Record<string, unknown> {
    const measured = interval(witness.began, witness.ended ?? point());
    return {
      runId: witness.runId,
      groupId: witness.groupId,
      clockDomain,
      clockUnit: "ms",
      applicationPid: process.pid,
      creationOrEpochStartWindowMs: [witness.began.before, witness.began.after],
      ...(witness.ended
        ? { activityEndWindowMs: [witness.ended.before, witness.ended.after] }
        : {}),
      activityState: witness.state,
      includesUnsavedTail: witness.complete,
      epochObservation: { ...witness.epochObservation },
      epochIds: [...witness.epochIds],
      persistedActiveMs: witness.persistedActiveMs,
      ...(witness.lastSuccessfulSample
        ? {
            lastSuccessfulSample: {
              epochId: witness.lastSuccessfulSample.epochId,
              windowMs: [
                witness.lastSuccessfulSample.at.before,
                witness.lastSuccessfulSample.at.after,
              ],
              persistedActiveMs: witness.lastSuccessfulSample.persistedActiveMs,
            },
          }
        : {}),
      clockSource:
        "process performance.now brackets around confirmed product creation, ownership and terminal boundaries",
      ...(witness.complete
        ? { activeElapsedMs: measured }
        : {
            observedEpochActiveMs: measured,
            incompleteReason: witness.reason,
          }),
    };
  }
  private emit(
    lease: Lease,
    witness: RunWitness,
    kind: string,
    fields: Record<string, unknown> = {},
  ): void {
    lease.snapshot.events.push({
      seq: lease.snapshot.events.length + 1,
      at: new Date().toISOString(),
      kind,
      correlation: lease.request.correlation,
      attemptId: witness.attemptId,
      instancePid: lease.snapshot.binding.pid,
      ...this.fields(witness),
      ...fields,
    });
  }
  private changed(witness: RunWitness): void {
    for (const lease of this.matching(witness.runId))
      this.emit(
        lease,
        witness,
        witness.state === "terminal"
          ? "activity-terminal"
          : "activity-checkpoint",
      );
  }
  private matching(runId: string): Lease[] {
    return [...this.leases.values()].filter((lease) => {
      this.expire(lease);
      return (
        lease.snapshot.state !== "released" &&
        lease.request.correlation.runId === runId
      );
    });
  }
  async establish(
    id: string,
    raw: ActivityRequest,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot> {
    const request = activityRequestSchema.parse(raw);
    if (this.closed) throw new ControlError(503, "Activity observer is closed");
    const previous = this.leases.get(id);
    if (previous) {
      if (!isDeepStrictEqual(previous.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    const row = (
      await this.db.query<{
        id: string;
        group_id: string;
        active_ms: string;
        status: string;
        recovery_note: string | null;
      }>(
        "SELECT id,group_id,active_ms,status,recovery_note FROM agent_runs WHERE id=$1 AND group_id=$2",
        [request.correlation.runId, request.correlation.groupId],
      )
    ).rows[0];
    if (!row)
      throw new ControlError(404, "Run does not exist in the correlated group");
    if (this.closed || Date.parse(expiresAt) <= Date.now())
      throw new ControlError(409, "Lease expired before establishment");
    const established = this.leases.get(id);
    if (established) {
      if (!isDeepStrictEqual(established.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    if (
      request.mode === "hold-safe-activity-boundary" &&
      this.matching(row.id).some((lease) => lease.request.mode === request.mode)
    )
      throw new ControlError(
        409,
        "Run already has an active safe-boundary lease",
      );
    let witness = this.runs.get(row.id);
    if (!witness) {
      witness = this.observed(
        {
          runId: row.id,
          groupId: row.group_id,
          persistedActiveMs: Number(row.active_ms),
        },
        point(),
      );
      witness.state =
        row.status !== "running"
          ? "terminal"
          : row.recovery_note
            ? "recovery-paused"
            : "unknown";
      // No active segment was observed merely by reading a paused/terminal
      // row. Later cancellation must not turn this waiting time into activity.
      witness.ended = point();
    }
    const lease: Lease = {
      request,
      consumed: false,
      snapshot: {
        protocol: activityProtocol,
        leaseId: id,
        state: "armed",
        expiresAt,
        binding,
        correlation: request.correlation,
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
    this.emit(
      lease,
      witness,
      witness.state === "terminal"
        ? "activity-terminal"
        : "activity-checkpoint",
    );
    return this.snapshot(id);
  }
  private get(id: string): Lease {
    const lease = this.leases.get(id);
    if (!lease) throw new ControlError(404, "Unknown activity lease");
    this.expire(lease);
    return lease;
  }
  private unhold(lease: Lease): void {
    lease.gate?.release();
    lease.gate = undefined;
    if (lease.snapshot.state === "held") lease.snapshot.state = "armed";
  }
  private expire(lease: Lease): void {
    if (
      lease.snapshot.state !== "released" &&
      Date.parse(lease.snapshot.expiresAt) <= Date.now()
    ) {
      clearTimeout(lease.timer);
      this.unhold(lease);
      lease.snapshot.state = "released";
    }
  }
  snapshot(id: string): ActivityObservationSnapshot {
    const snapshot = structuredClone(this.get(id).snapshot);
    // This is a fresh transport observation, not a rewritten historic event.
    // A caller's request/response brackets enclose this actual local clock read.
    return {
      ...snapshot,
      clockObservation: {
        clockDomain,
        clockUnit: "ms",
        applicationPid: process.pid,
        monotonicMs: performance.now(),
      },
    };
  }
  async advance(id: string): Promise<ObservationSnapshot> {
    this.unhold(this.get(id));
    return this.snapshot(id);
  }
  async release(id: string): Promise<ObservationSnapshot> {
    const lease = this.get(id);
    clearTimeout(lease.timer);
    this.unhold(lease);
    lease.snapshot.state = "released";
    return this.snapshot(id);
  }
  async safeBoundary(row: ActivitySample, stepId: string): Promise<void> {
    const signal = currentOperationSignal();
    signal?.throwIfAborted();
    if (this.closed || !signal || !this.epoch) return;
    const witness = this.runs.get(row.runId);
    if (!witness || witness.state !== "active") return;
    const lease = this.matching(row.runId).find(
      (candidate) =>
        candidate.request.mode === "hold-safe-activity-boundary" &&
        !candidate.consumed,
    );
    if (!lease) return;
    lease.consumed = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    lease.gate = { release };
    lease.snapshot.state = "held";
    const onAbort = () => {
      witness.complete = false;
      witness.epochObservation.continuous = false;
      witness.state = "unknown";
      witness.ended = point();
      witness.reason =
        "Run execution ownership was lost while the safe boundary was held.";
      this.unhold(lease);
      this.changed(witness);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    this.emit(lease, witness, "activity-safe-held", {
      stepId: createHash("sha256").update(stepId).digest("hex"),
      continuationDurable: true,
      remoteInFlightCount: 0,
      safeBoundary:
        "read-tool-result-outer-commit-confirmed-before-next-dispatch",
    });
    try {
      await gate;
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.leases.keys()].map((id) => this.release(id)));
    this.epoch = undefined;
    this.runs.clear();
  }
}
