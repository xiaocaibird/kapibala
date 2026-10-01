import { createHash } from "node:crypto";
import type { Database } from "../../apps/server/src/core/db.js";
import type {
  MessageObservation,
  TestMessageObserver,
} from "../../apps/server/src/core/test-message-observer.js";
import { ControlError, same, type Binding } from "../qa-capacity/protocol.js";
import type {
  ObservationRuntime,
  ObservationSnapshot,
} from "../qa-observation/types.js";
import { protocol, requestSchema, type MessageRequest } from "./protocol.js";
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
interface Lease {
  request: MessageRequest;
  snapshot: ObservationSnapshot;
  gate: ReturnType<typeof gate>;
  timer: NodeJS.Timeout;
  reached: boolean;
}
export class MessageObservationRuntime
  implements TestMessageObserver, ObservationRuntime<MessageRequest>
{
  readonly protocol = protocol;
  private readonly leases = new Map<string, Lease>();
  private closed = false;
  private databaseIdentity?: string;
  constructor(private readonly db: Database) {}
  capabilities() {
    return [
      "timeout-observed-before-local-save",
      "receipt-before-commit",
      "receipt-committed-before-business",
    ];
  }
  async establish(
    id: string,
    raw: MessageRequest,
    expiresAt: string,
    binding: Binding,
  ) {
    const request = requestSchema.parse(raw);
    const old = this.leases.get(id);
    if (old) {
      if (!same(old.request, request))
        throw new ControlError(409, "Lease identity already in use");
      return this.snapshot(id);
    }
    if (this.closed) throw new ControlError(503, "Observation is closed");
    for (const l of this.leases.values())
      if (l.snapshot.state !== "released")
        throw new ControlError(409, "Instance already has a lease");
    const remaining = Date.parse(expiresAt) - Date.now();
    if (
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      remaining > request.ttlMs ||
      remaining > 120000
    )
      throw new ControlError(400, "Invalid lease expiration");
    const snapshot: ObservationSnapshot = {
      protocol,
      leaseId: id,
      state: "armed",
      expiresAt,
      binding,
      correlation: request.correlation,
      events: [],
    };
    const l: Lease = {
      request,
      snapshot,
      gate: gate(),
      timer: setTimeout(() => void this.release(id), remaining),
      reached: false,
    };
    l.timer.unref();
    this.leases.set(id, l);
    return this.snapshot(id);
  }
  snapshot(id: string) {
    const l = this.leases.get(id);
    if (!l) throw new ControlError(404, "Unknown lease");
    return structuredClone(l.snapshot);
  }
  async advance(id: string) {
    return this.release(id);
  }
  async release(id: string) {
    const l = this.leases.get(id);
    if (!l) throw new ControlError(404, "Unknown lease");
    clearTimeout(l.timer);
    l.snapshot.state = "released";
    l.gate.resolve();
    return this.snapshot(id);
  }
  async boundary(o: MessageObservation): Promise<void> {
    for (const l of this.leases.values()) {
      const c = l.request.correlation;
      if (
        l.snapshot.state === "released" ||
        l.request.mode !== o.phase ||
        c.clientMsgId !== o.clientMsgId ||
        ("msgId" in c && (c.msgId !== o.msgId || c.eventId !== o.eventId))
      )
        continue;
      if (Date.now() >= Date.parse(l.snapshot.expiresAt)) {
        await this.release(l.snapshot.leaseId);
        continue;
      }
      if (l.reached) {
        await l.gate.promise;
        continue;
      }
      // Mark selected synchronously, so concurrent callbacks cannot cross the
      // already selected boundary while evidence queries are in progress.
      l.reached = true;
      try {
        if (!this.databaseIdentity) {
          const facts = (
            await this.db.query(
              "SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,pg_postmaster_start_time()::text AS started",
            )
          ).rows[0];
          this.databaseIdentity = createHash("sha256")
            .update(JSON.stringify(facts))
            .digest("hex");
        }
        const receipt = o.msgId
          ? (
              await this.db.query<{ observed_at: Date | null }>(
                "SELECT observed_at FROM message_sent_receipts WHERE client_msg_id=$1 AND msg_id=$2",
                [o.clientMsgId, o.msgId],
              )
            ).rows[0]
          : undefined;
        if (this.snapshot(l.snapshot.leaseId).state === "released") return;
        const before = o.phase === "receipt-before-commit";
        const invalid = before && Boolean(receipt);
        l.snapshot.state = invalid ? "released" : "held";
        l.snapshot.events.push({
          seq: l.snapshot.events.length + 1,
          at: new Date().toISOString(),
          kind: invalid ? "window-unavailable" : "window-held",
          ...o,
          instancePid: l.snapshot.binding.pid,
          databaseIdentity: this.databaseIdentity,
          localBoundary: before
            ? "receipt-insert-not-issued"
            : o.phase === "receipt-committed-before-business"
              ? "receipt-autocommit-confirmed-business-not-started"
              : "504-recognized-local-result-save-not-started",
          receiptPresentAtProbe: Boolean(receipt),
          receiptObservedAt: receipt?.observed_at?.toISOString() ?? null,
          coverage: {
            scope: "bound-instance",
            allDatabaseWritersProven: false,
          },
        });
        if (invalid) {
          await this.release(l.snapshot.leaseId);
          return;
        }
        await l.gate.promise;
      } catch (error) {
        await this.release(l.snapshot.leaseId);
        throw error;
      }
    }
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.leases.keys()].map((id) => this.release(id)));
  }
}
