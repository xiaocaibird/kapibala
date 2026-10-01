import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Database } from "../../apps/server/src/core/db.js";
import type {
  LifecycleFact,
  TestLifecycleObserver,
} from "../../apps/server/src/core/test-lifecycle-observer.js";
import {
  ControlError,
  targetSchema,
  type Binding,
} from "../qa-capacity/protocol.js";
import type {
  ObservationEvent,
  ObservationRuntime,
  ObservationSnapshot,
} from "../qa-observation/types.js";
import { clockFields } from "./clock.js";

const base = {
  protocol: z.literal("qa-runtime-observation/1"),
  target: targetSchema,
  ttlMs: z.number().int().min(5000).max(120000),
};
export const lifecycleRequestSchema = z.union([
  z
    .object({
      ...base,
      mode: z.enum(["observe-tool-wait", "observe-agent-lifecycle"]),
      correlation: z
        .object({
          kind: z.literal("tool-wait"),
          groupId: z.string().min(1).max(200),
          runId: z.string().min(1).max(200),
          toolUseId: z.literal("all-run-steps"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      mode: z.literal("observe-message-recovery"),
      correlation: z
        .object({
          kind: z.literal("message-recovery"),
          groupId: z.string().min(1).max(200),
          clientMsgId: z.string().uuid(),
        })
        .strict(),
    })
    .strict(),
]);
export type LifecycleRequest = z.infer<typeof lifecycleRequestSchema>;
interface Lease {
  request: LifecycleRequest;
  snapshot: ObservationSnapshot;
  timer: NodeJS.Timeout;
}

/** Read-only same-process raw history. Missing prior process history is never
 * reconstructed from a current database row or an owner-supplied timestamp. */
export class LifecycleWitness
  implements TestLifecycleObserver, ObservationRuntime<LifecycleRequest>
{
  readonly protocol = "qa-runtime-observation/1";
  // Witness lifetime identity, distinct from the bridge registry instance ID.
  private readonly instanceId = randomUUID();
  private events: ObservationEvent[] = [];
  private nextSeq = 0;
  private droppedThrough = 0;
  private readonly leases = new Map<string, Lease>();
  private closed = false;
  constructor(private readonly db: Database) {}
  capabilities(): string[] {
    return [
      "tool-wait-witness",
      "message-recovery-witness",
      "agent-lifecycle-witness",
      "agent-run-lock-witness",
    ];
  }
  record(fact: LifecycleFact): void {
    if (this.closed) return;
    const clock = clockFields();
    const event: ObservationEvent = {
      ...structuredClone(fact),
      ...clock,
      instanceId: this.instanceId,
      at: new Date().toISOString(),
      seq: ++this.nextSeq,
    };
    this.events.push(event);
    // Bound explicit test-entry memory. Consumers get the truncation fact;
    // existing lease history stays append-only and is not rewritten.
    if (this.events.length > 20000)
      this.droppedThrough = this.events.shift()!.seq;
    for (const lease of this.leases.values()) {
      this.expire(lease);
      if (
        lease.snapshot.state !== "released" &&
        this.matches(lease.request, event)
      )
        this.append(lease, event);
    }
  }
  private matches(request: LifecycleRequest, event: ObservationEvent): boolean {
    const c = request.correlation;
    return (
      event.groupId === c.groupId &&
      (c.kind === "tool-wait"
        ? event.runId === c.runId
        : event.clientMsgId === c.clientMsgId)
    );
  }
  private append(lease: Lease, event: ObservationEvent): void {
    lease.snapshot.events.push({
      ...event,
      sourceSeq: event.seq,
      seq: lease.snapshot.events.length + 1,
      instancePid: lease.snapshot.binding.pid,
      correlation: lease.request.correlation,
    });
  }
  async establish(
    id: string,
    raw: LifecycleRequest,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot> {
    const request = lifecycleRequestSchema.parse(raw);
    if (this.closed)
      throw new ControlError(503, "Lifecycle observer is closed");
    const previous = this.leases.get(id);
    if (previous) {
      if (!isDeepStrictEqual(previous.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    const c = request.correlation;
    const rows =
      c.kind === "tool-wait"
        ? await this.db.query(
            "SELECT id FROM agent_runs WHERE id=$1 AND group_id=$2",
            [c.runId, c.groupId],
          )
        : await this.db.query(
            "SELECT id FROM messages WHERE client_msg_id=$1 AND group_id=$2",
            [c.clientMsgId, c.groupId],
          );
    if (!rows.rowCount)
      throw new ControlError(
        404,
        "Observed resource does not exist in the correlated group",
      );
    const facts = await this.db.query(
      "SELECT current_database() AS database,current_schema() AS schema,inet_server_addr()::text AS address,inet_server_port() AS port,pg_postmaster_start_time()::text AS started",
    );
    const remaining = Date.parse(expiresAt) - Date.now();
    if (this.closed || remaining <= 0 || remaining > request.ttlMs)
      throw new ControlError(
        409,
        "Lease expired or invalid before establishment",
      );
    // No await after the second identity check: concurrent PUT cannot replace
    // the first lease and lose its append-only history or timer.
    const established = this.leases.get(id);
    if (established) {
      if (!isDeepStrictEqual(established.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    const timer = setTimeout(() => void this.release(id), remaining);
    timer.unref();
    const lease: Lease = {
      request,
      timer,
      snapshot: {
        protocol: this.protocol,
        leaseId: id,
        state: "armed",
        expiresAt,
        binding,
        correlation: c,
        events: [],
      },
    };
    this.leases.set(id, lease);
    lease.snapshot.events.push({
      seq: 1,
      at: new Date().toISOString(),
      kind: "lifecycle-observation-attached",
      attemptId: randomUUID(),
      ...clockFields(),
      instanceId: this.instanceId,
      instancePid: binding.pid,
      databaseIdentity: createHash("sha256")
        .update(JSON.stringify(facts.rows[0]))
        .digest("hex"),
      resourceId: rows.rows[0]!.id,
      correlation: c,
      historyScope: "this-process-only",
      droppedThroughSourceSeq: this.droppedThrough,
      includesPriorProcessHistory: false,
    });
    for (const event of this.events)
      if (this.matches(request, event)) this.append(lease, event);
    return this.snapshot(id);
  }
  private expire(lease: Lease): void {
    if (Date.parse(lease.snapshot.expiresAt) <= Date.now()) {
      clearTimeout(lease.timer);
      lease.snapshot.state = "released";
    }
  }
  private get(id: string): Lease {
    const lease = this.leases.get(id);
    if (!lease) throw new ControlError(404, "Unknown lifecycle lease");
    this.expire(lease);
    return lease;
  }
  snapshot(id: string): ObservationSnapshot {
    return structuredClone(this.get(id).snapshot);
  }
  async advance(id: string): Promise<ObservationSnapshot> {
    this.get(id);
    throw new ControlError(
      409,
      "Read-only lifecycle observation has no barrier to advance",
    );
  }
  async release(id: string): Promise<ObservationSnapshot> {
    const lease = this.get(id);
    clearTimeout(lease.timer);
    lease.snapshot.state = "released";
    return this.snapshot(id);
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.leases.keys()].map((id) => this.release(id)));
    this.events = [];
  }
}
