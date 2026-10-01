import type { Binding, Target } from "../qa-capacity/protocol.js";
export interface ObservationRequest {
  protocol: string;
  target: Target;
  mode: string;
  correlation: object;
  ttlMs: number;
}
export interface ObservationEvent {
  seq: number;
  at: string;
  kind: string;
  [key: string]: unknown;
}
export interface ObservationSnapshot {
  protocol: string;
  leaseId: string;
  state: "armed" | "held" | "released";
  expiresAt: string;
  binding: Binding;
  correlation: object;
  events: ObservationEvent[];
  /** Controller transport provenance, not a new business observation. */
  snapshotProvenance?: {
    source: "live-bridge" | "retained-after-process-exit";
    applicationPid: number;
    applicationStarted: string;
  };
}
export interface ObservationRuntime<
  R extends ObservationRequest = ObservationRequest,
> {
  protocol: string;
  capabilities(): string[];
  establish(
    id: string,
    request: R,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot>;
  snapshot(id: string): ObservationSnapshot | Promise<ObservationSnapshot>;
  advance(id: string): Promise<ObservationSnapshot>;
  release(id: string): Promise<ObservationSnapshot>;
}
