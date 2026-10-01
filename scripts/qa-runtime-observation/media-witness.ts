import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  currentDatabaseDeadline,
  currentOperationSignal,
  type Database,
  type Queryable,
} from "../../apps/server/src/core/db.js";
import type {
  MediaPhase,
  TestMediaObserver,
  TestMediaOperation,
} from "../../apps/server/src/core/test-media-observer.js";
import {
  ControlError,
  targetSchema,
  type Binding,
} from "../qa-capacity/protocol.js";
import type {
  ObservationRuntime,
  ObservationSnapshot,
} from "../qa-observation/types.js";
import { clockFields } from "./clock.js";

const identity = {
  groupId: z.string().min(1).max(200),
  msgId: z.string().min(1).max(200),
  mediaId: z.uuid(),
};
const base = {
  protocol: z.literal("qa-runtime-observation/1"),
  target: targetSchema,
  ttlMs: z.number().int().min(5000).max(120000),
};
export const mediaRequestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      ...base,
      mode: z.literal("hold-media-reference"),
      correlation: z
        .object({
          ...identity,
          kind: z.literal("media-reference"),
          operation: z.discriminatedUnion("kind", [
            z
              .object({
                kind: z.literal("trigger"),
                messageId: z.string().min(1).max(200),
              })
              .strict(),
            z
              .object({
                kind: z.literal("history"),
                runId: z.string().min(1).max(200),
                toolUseId: z.string().min(1).max(200),
              })
              .strict(),
          ]),
        })
        .strict(),
      holdAt: z
        .array(
          z.enum([
            "reference-before-lock",
            "reference-locked",
            "reference-registered",
            "reference-committed",
          ]),
        )
        .min(1)
        .max(4),
    })
    .strict(),
  z
    .object({
      ...base,
      mode: z.literal("hold-media-cleanup"),
      correlation: z
        .object({ ...identity, kind: z.literal("media-cleanup") })
        .strict(),
      holdAt: z
        .array(z.enum(["cleanup-before-lock", "cleanup-claimed"]))
        .min(1)
        .max(2),
    })
    .strict(),
]);
export type MediaRequest = z.infer<typeof mediaRequestSchema>;
interface Lease {
  request: MediaRequest;
  snapshot: ObservationSnapshot;
  timer: NodeJS.Timeout;
  operationId?: string;
  gate?: () => void;
}

/** One exact file/operation per lease; release never executes or rewrites work. */
export class MediaWitness
  implements TestMediaObserver, ObservationRuntime<MediaRequest>
{
  readonly protocol = "qa-runtime-observation/1";
  private readonly leases = new Map<string, Lease>();
  private closed = false;
  constructor(private readonly db: Database) {}
  capabilities(): string[] {
    return ["media-reference-witness"];
  }
  async establish(
    id: string,
    raw: MediaRequest,
    expiresAt: string,
    binding: Binding,
  ): Promise<ObservationSnapshot> {
    const request = mediaRequestSchema.parse(raw);
    if (this.closed) throw new ControlError(503, "Media observer is closed");
    const previous = this.leases.get(id);
    if (previous) {
      if (!isDeepStrictEqual(previous.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    const c = request.correlation;
    const file = await this.db.query(
      "SELECT id FROM media_files WHERE id=$1 AND group_id=$2 AND msg_id=$3",
      [c.mediaId, c.groupId, c.msgId],
    );
    if (!file.rowCount)
      throw new ControlError(
        404,
        "Media does not match the exact group/message/file identity",
      );
    if (c.kind === "media-reference") {
      const op = c.operation;
      const resource =
        op.kind === "trigger"
          ? await this.db.query(
              "SELECT id FROM messages WHERE id=$1 AND group_id=$2 AND msg_id=$3 AND NOT is_own AND NOT EXISTS(SELECT 1 FROM agent_pending WHERE message_id=$1 AND run_id IS NOT NULL)",
              [op.messageId, c.groupId, c.msgId],
            )
          : await this.db.query(
              "SELECT id FROM agent_runs WHERE id=$1 AND group_id=$2 AND status='running'",
              [op.runId, c.groupId],
            );
      if (!resource.rowCount)
        throw new ControlError(
          404,
          "Reference operation does not match its live resource",
        );
    }
    const remaining = Date.parse(expiresAt) - Date.now();
    if (this.closed || remaining <= 0 || remaining > request.ttlMs)
      throw new ControlError(409, "Media lease expired before establishment");
    // Controller serializes creation; recheck for direct concurrent bridge requests.
    if (this.leases.has(id)) {
      if (!isDeepStrictEqual(this.leases.get(id)!.request, request))
        throw new ControlError(409, "Lease identity cannot be rebound");
      return this.snapshot(id);
    }
    for (const lease of this.leases.values()) {
      this.expire(lease);
      if (
        lease.snapshot.state !== "released" &&
        lease.request.mode === request.mode &&
        lease.request.correlation.mediaId === c.mediaId
      )
        throw new ControlError(
          409,
          "Media operation already has an owned lease",
        );
    }
    const timer = setTimeout(() => void this.release(id), remaining);
    timer.unref();
    this.leases.set(id, {
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
    });
    return this.snapshot(id);
  }
  private releaseLease(lease: Lease): void {
    clearTimeout(lease.timer);
    lease.snapshot.state = "released";
    const release = lease.gate;
    lease.gate = undefined;
    release?.();
  }
  private expire(lease: Lease): void {
    if (Date.parse(lease.snapshot.expiresAt) <= Date.now())
      this.releaseLease(lease);
  }
  private get(id: string): Lease {
    const lease = this.leases.get(id);
    if (!lease) throw new ControlError(404, "Unknown media lease");
    this.expire(lease);
    return lease;
  }
  snapshot(id: string): ObservationSnapshot {
    return structuredClone(this.get(id).snapshot);
  }
  async advance(id: string): Promise<ObservationSnapshot> {
    const lease = this.get(id);
    if (lease.snapshot.state === "released") return this.snapshot(id);
    if (!lease.gate)
      throw new ControlError(409, "No reached media barrier to advance");
    const release = lease.gate;
    lease.gate = undefined;
    lease.snapshot.state = "armed";
    release();
    return this.snapshot(id);
  }
  async release(id: string): Promise<ObservationSnapshot> {
    this.releaseLease(this.get(id));
    return this.snapshot(id);
  }
  private matching(
    predicate: (request: MediaRequest) => boolean,
  ): Lease | undefined {
    if (this.closed) return;
    for (const lease of this.leases.values()) {
      this.expire(lease);
      if (
        lease.snapshot.state !== "released" &&
        !lease.operationId &&
        predicate(lease.request)
      )
        return lease;
    }
    return;
  }
  async reference(
    tx: Queryable,
    input: Parameters<TestMediaObserver["reference"]>[1],
  ): Promise<TestMediaOperation | undefined> {
    const lease = this.matching((r) => {
      const c = r.correlation;
      if (
        c.kind !== "media-reference" ||
        c.groupId !== input.groupId ||
        !input.msgIds.includes(c.msgId)
      )
        return false;
      const op = c.operation;
      return op.kind === "trigger"
        ? input.operation.kind === "trigger" &&
            input.operation.messageIds.includes(op.messageId)
        : input.operation.kind === "history" &&
            op.runId === input.runId &&
            op.toolUseId === input.operation.toolUseId;
    });
    return lease
      ? this.begin(lease, tx, "reference-before-lock", {
          runId: input.runId,
          operation: input.operation,
        })
      : undefined;
  }
  async cleanup(
    tx: Queryable,
    input: Parameters<TestMediaObserver["cleanup"]>[1],
  ): Promise<TestMediaOperation | undefined> {
    const lease = this.matching(
      (r) =>
        r.correlation.kind === "media-cleanup" &&
        r.correlation.mediaId === input.mediaId &&
        r.correlation.groupId === input.groupId &&
        r.correlation.msgId === input.msgId,
    );
    return lease ? this.begin(lease, tx, "cleanup-before-lock", {}) : undefined;
  }
  private async begin(
    lease: Lease,
    tx: Queryable,
    phase: MediaPhase,
    detail: object,
  ): Promise<TestMediaOperation> {
    // Bind synchronously before I/O so another operation cannot consume the lease.
    const operationId = randomUUID();
    lease.operationId = operationId;
    const facts = (
      await tx.query<{ backend_pid: number; transaction_id: string }>(
        "SELECT pg_backend_pid() AS backend_pid,txid_current()::text AS transaction_id",
      )
    ).rows[0]!;
    const operation: TestMediaOperation = {
      stage: async (point, mediaIds) => {
        this.expire(lease);
        if (lease.snapshot.state === "released") return;
        const signal = currentOperationSignal();
        const deadline = currentDatabaseDeadline();
        const held =
          (lease.request.holdAt as string[]).includes(point) &&
          !signal?.aborted &&
          (deadline === undefined || deadline > performance.now());
        lease.snapshot.events.push({
          seq: lease.snapshot.events.length + 1,
          at: new Date().toISOString(),
          kind: point,
          ...clockFields(),
          correlation: lease.request.correlation,
          ...detail,
          operationId,
          transactionIdentityScope:
            lease.request.mode === "hold-media-reference"
              ? "reference-transaction"
              : "cleanup-claim-transaction",
          instancePid: lease.snapshot.binding.pid,
          backendPid: facts.backend_pid,
          transactionId: facts.transaction_id,
          ...(mediaIds ? { selectedMediaIds: mediaIds } : {}),
          transactionState:
            point === "reference-committed" ||
            point === "cleanup-claimed" ||
            point === "cleanup-skipped"
              ? "outer-commit-confirmed"
              : point === "cleanup-completed"
                ? "deleted-update-returned"
                : "transaction-open",
          barrierHeld: held,
        });
        if (!held) return;
        lease.snapshot.state = "held";
        let resolve!: () => void;
        const wait = new Promise<void>((done) => {
          resolve = done;
        });
        const release = () => {
          if (lease.gate === release) {
            lease.gate = undefined;
            if (lease.snapshot.state !== "released")
              lease.snapshot.state = "armed";
          }
          resolve();
        };
        lease.gate = release;
        signal?.addEventListener("abort", release, { once: true });
        const timer =
          deadline === undefined
            ? undefined
            : setTimeout(release, Math.max(0, deadline - performance.now()));
        timer?.unref();
        try {
          await wait;
        } finally {
          signal?.removeEventListener("abort", release);
          if (timer) clearTimeout(timer);
        }
      },
    };
    await operation.stage(phase);
    return operation;
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const lease of this.leases.values()) this.releaseLease(lease);
  }
}
