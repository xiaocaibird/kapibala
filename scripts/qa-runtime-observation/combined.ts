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

export const combinedRequestSchema = z.union([
  resourceRequestSchema,
  activityRequestSchema,
]);
export type CombinedRequest = z.infer<typeof combinedRequestSchema>;

/** The sole allowed concurrent pair is a read witness and its same-run barrier. */
export function compatibleActivityPair(
  a: CombinedRequest,
  b: CombinedRequest,
): boolean {
  return (
    a.correlation.kind === "activity" &&
    b.correlation.kind === "activity" &&
    a.correlation.runId === b.correlation.runId &&
    a.correlation.groupId === b.correlation.groupId &&
    a.mode !== b.mode
  );
}

export class CombinedRuntimeObservation implements ObservationRuntime<CombinedRequest> {
  readonly protocol = protocol;
  readonly resource: RuntimeObservation;
  readonly activity: ActivityWitness;
  private readonly owners = new Map<string, "activity" | "resource">();
  constructor(db: ObservedRuntimeDatabase) {
    this.resource = new RuntimeObservation(db);
    this.activity = new ActivityWitness(db);
  }
  capabilities(): string[] {
    return [...this.resource.capabilities(), ...this.activity.capabilities()];
  }
  async establish(
    id: string,
    raw: CombinedRequest,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot> {
    const request = combinedRequestSchema.parse(raw);
    const owner =
      request.correlation.kind === "activity" ? "activity" : "resource";
    const old = this.owners.get(id);
    if (old && old !== owner)
      throw new ControlError(
        409,
        "Lease identity cannot change observation domain",
      );
    this.owners.set(id, owner);
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
  private forLease(id: string): ActivityWitness | RuntimeObservation {
    const owner = this.owners.get(id);
    if (!owner)
      throw new ControlError(404, "Unknown runtime observation lease");
    return owner === "activity" ? this.activity : this.resource;
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
    ]);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((r) => r.reason),
        "Runtime observers failed to close",
      );
  }
}
