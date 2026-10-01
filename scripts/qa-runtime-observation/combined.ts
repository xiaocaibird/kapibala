import { z } from "zod";
import { ControlError, type Binding } from "../qa-capacity/protocol.js";
import type {
  ObservationRuntime,
  ObservationSnapshot,
} from "../qa-observation/types.js";
import { ActivityWitness, activityRequestSchema } from "./activity-witness.js";
import {
  protocol,
  requestSchema as resourceRequestSchema,
} from "./protocol.js";
import { ObservedRuntimeDatabase, RuntimeObservation } from "./runtime.js";
import {
  LifecycleWitness,
  lifecycleRequestSchema,
} from "./lifecycle-witness.js";

export const combinedRequestSchema = z.union([
  resourceRequestSchema,
  activityRequestSchema,
  lifecycleRequestSchema,
]);
export type CombinedRequest = z.infer<typeof combinedRequestSchema>;

/** Same-run read observers can accompany the original activity barrier. The
 * controller still requires the same verified owner and rejects other pairs. */
export function compatibleActivityPair(
  a: CombinedRequest,
  b: CombinedRequest,
): boolean {
  const ac = a.correlation,
    bc = b.correlation;
  return (
    (ac.kind === "activity" || ac.kind === "tool-wait") &&
    (bc.kind === "activity" || bc.kind === "tool-wait") &&
    ac.runId === bc.runId &&
    ac.groupId === bc.groupId &&
    a.mode !== b.mode
  );
}

/** Independently owned module gates may share only the same verified target.
 * Each registered module still has at most one active lease and its own TTL. */
export function compatibleRuntimePair(
  a: CombinedRequest,
  b: CombinedRequest,
): boolean {
  return (
    compatibleActivityPair(a, b) ||
    (a.mode === "module-fail-then-hold" &&
      b.mode === "module-fail-then-hold" &&
      a.correlation.module !== b.correlation.module &&
      a.target.apiUrl === b.target.apiUrl &&
      a.target.pid === b.target.pid &&
      a.target.revision === b.target.revision)
  );
}

export class CombinedRuntimeObservation implements ObservationRuntime<CombinedRequest> {
  readonly protocol = protocol;
  readonly resource: RuntimeObservation;
  readonly activity: ActivityWitness;
  readonly lifecycle: LifecycleWitness;
  private readonly owners = new Map<
    string,
    "activity" | "resource" | "lifecycle"
  >();
  constructor(db: ObservedRuntimeDatabase) {
    this.resource = new RuntimeObservation(db);
    this.activity = new ActivityWitness(db);
    this.lifecycle = new LifecycleWitness(db);
  }
  capabilities(): string[] {
    return [
      ...this.resource.capabilities(),
      ...this.activity.capabilities(),
      ...this.lifecycle.capabilities(),
    ];
  }
  async establish(
    id: string,
    raw: CombinedRequest,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot> {
    const request = combinedRequestSchema.parse(raw);
    const owner =
      request.correlation.kind === "activity"
        ? "activity"
        : request.correlation.kind === "tool-wait" ||
            request.correlation.kind === "message-recovery"
          ? "lifecycle"
          : "resource";
    const old = this.owners.get(id);
    if (old && old !== owner)
      throw new ControlError(
        409,
        "Lease identity cannot change observation domain",
      );
    this.owners.set(id, owner);
    if (
      request.mode === "observe-tool-wait" ||
      request.mode === "observe-agent-lifecycle" ||
      request.mode === "observe-message-recovery"
    )
      return this.lifecycle.establish(id, request, expiresAt, binding);
    if (
      request.mode === "observe-activity" ||
      request.mode === "hold-safe-activity-boundary"
    )
      return this.activity.establish(id, request, expiresAt, binding);
    return this.resource.establish(
      id,
      resourceRequestSchema.parse(request),
      expiresAt,
      binding,
    );
  }
  private forLease(
    id: string,
  ): ActivityWitness | RuntimeObservation | LifecycleWitness {
    const owner = this.owners.get(id);
    if (!owner)
      throw new ControlError(404, "Unknown runtime observation lease");
    return owner === "activity"
      ? this.activity
      : owner === "lifecycle"
        ? this.lifecycle
        : this.resource;
  }
  snapshot(id: string): ObservationSnapshot {
    return this.forLease(id).snapshot(id);
  }
  advance(id: string): Promise<ObservationSnapshot> {
    return this.forLease(id).advance(id);
  }
  release(id: string): Promise<ObservationSnapshot> {
    return this.forLease(id).release(id);
  }
  async close(): Promise<void> {
    const results = await Promise.allSettled([
      this.activity.close(),
      this.resource.close(),
      this.lifecycle.close(),
    ]);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((r) => r.reason),
        "Runtime observers failed to close",
      );
  }
}
