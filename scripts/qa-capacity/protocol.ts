import { z } from "zod";
export const protocol = "qa-capacity-control/1" as const;
export const targetSchema = z
  .object({
    apiUrl: z.string().refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "http:" &&
          url.hostname === "127.0.0.1" &&
          Boolean(url.port) &&
          !url.username &&
          !url.password &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash &&
          url.origin === value
        );
      } catch {
        return false;
      }
    }),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    pid: z.number().int().positive(),
  })
  .strict();
export const correlationSchema = z
  .object({
    groupId: z.string().min(1).max(200),
    runId: z.string().min(1).max(200),
    toolUseId: z.string().min(1).max(200),
  })
  .strict();
export const leaseRequestSchema = z
  .object({
    protocol: z.literal(protocol),
    target: targetSchema,
    correlation: correlationSchema,
    mode: z.enum([
      "hold-admission-capacity",
      "hold-after-refusal-before-ready",
    ]),
    ttlMs: z.number().int().min(1).max(120_000),
  })
  .strict();
export type Target = z.infer<typeof targetSchema>;
export type Correlation = z.infer<typeof correlationSchema>;
export type LeaseRequest = z.infer<typeof leaseRequestSchema>;
export type Binding = Target & { observedOwnerToken: string };
export interface CapacityEvent extends Correlation {
  seq: number;
  at: string;
  kind:
    | "capacity-held"
    | "admission-refused"
    | "before-ready-held"
    | "ready-persisted"
    | "run-terminal";
  attemptId?: string;
  reason?: "capacity";
  callbackEntered?: false;
  remoteRequestCount?: 0;
  holderKeys?: string[];
  status?: string;
  endReason?: string | null;
  activeElapsedMs?: [number, number];
  clockSource?: string;
}
export interface Snapshot {
  protocol: typeof protocol;
  leaseId: string;
  state: "held" | "released";
  expiresAt: string;
  binding: Binding;
  correlation: Correlation;
  events: CapacityEvent[];
}
export class ControlError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function matches(a: Correlation, b: Correlation): boolean {
  return (
    a.groupId === b.groupId &&
    a.runId === b.runId &&
    a.toolUseId === b.toolUseId
  );
}
