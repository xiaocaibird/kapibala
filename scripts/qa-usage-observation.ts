import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  UsageQueueEvent,
  UsageTestObserver,
} from "../apps/gemini-agent/src/usage.js";

const maxEvents = 2048;
const holdBody = z
  .object({ ttlMs: z.number().int().min(100).max(120000) })
  .strict();
interface Hold {
  id: string;
  state: "armed" | "held" | "released" | "expired";
  ttlMs: number;
  expiresAt: string;
  reached: UsageQueueEvent | null;
  releaseReason: "delete" | "ttl" | "shutdown" | "writer-close" | null;
}

/** Explicit offline engineering control. One gate belongs to the sole real writer. */
export class QaUsageObservation implements UsageTestObserver {
  readonly instanceId = randomUUID();
  readonly basePath = "/qa/usage/v1";
  readonly protocol = "qa-gemini-observation/1";
  private usageEvents: UsageQueueEvent[] = [];
  private transportEvents: unknown[] = [];
  private usageTruncated = 0;
  private transportTruncated = 0;
  private latest?: UsageQueueEvent;
  private initialized = false;
  private diagnostics = new Set<string>();
  private hold: Hold | null = null;
  private release?: () => void;
  private timer?: NodeJS.Timeout;
  private closed = false;
  private writer?: { close(): Promise<void> };
  private writerClose?: Promise<void>;
  constructor(
    private options: {
      token: string;
      usageEnabled: boolean;
      transportEnabled: boolean;
      entry: "main" | "factory";
      optionsSupplied: boolean;
      configuredEnabled: boolean;
    },
  ) {}

  bindWriter(writer: { close(): Promise<void> }): void {
    if (this.writer) throw new Error("QA usage writer already bound");
    this.writer = writer;
  }

  event(event: UsageQueueEvent): void {
    this.latest = structuredClone(event);
    if (event.kind === "initialized") this.initialized = true;
    if (event.diagnosticCode) this.diagnostics.add(event.diagnosticCode);
    this.usageEvents.push(structuredClone(event));
    if (this.usageEvents.length > maxEvents) {
      this.usageEvents.shift();
      this.usageTruncated++;
    }
  }
  transport(event: unknown): void {
    this.transportEvents.push(structuredClone(event));
    if (this.transportEvents.length > maxEvents) {
      this.transportEvents.shift();
      this.transportTruncated++;
    }
  }
  async beforeWrite(event: UsageQueueEvent): Promise<void> {
    if (this.closed || this.hold?.state !== "armed") return;
    this.hold.state = "held";
    this.hold.reached = structuredClone(event);
    await new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }
  close(): void {
    this.closed = true;
    this.releaseHold("shutdown");
  }
  private releaseHold(reason: NonNullable<Hold["releaseReason"]>): void {
    if (!this.hold || !["armed", "held"].includes(this.hold.state)) return;
    clearTimeout(this.timer);
    this.hold.state = reason === "ttl" ? "expired" : "released";
    this.hold.releaseReason = reason;
    this.release?.();
    this.release = undefined;
  }
  private authorized(request: FastifyRequest): boolean {
    const supplied = request.headers.authorization;
    const expected = `Bearer ${this.options.token}`;
    return (
      typeof supplied === "string" &&
      Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    );
  }
  snapshot() {
    return {
      protocol: this.protocol,
      instanceId: this.instanceId,
      pid: process.pid,
      usage: {
        entry: this.options.entry,
        optionsSupplied: this.options.optionsSupplied,
        configuredEnabled: this.options.configuredEnabled,
        observationEnabled: this.options.usageEnabled,
        initialized: this.options.usageEnabled ? this.initialized : null,
        queued: this.options.usageEnabled ? (this.latest?.queued ?? 0) : null,
        queuedIncludesActiveBatch: false,
        activeBatch: this.options.usageEnabled
          ? (this.latest?.activeBatch ?? 0)
          : null,
        dropped: this.options.usageEnabled ? (this.latest?.dropped ?? 0) : null,
        writeFailures: this.options.usageEnabled
          ? (this.latest?.writeFailures ?? 0)
          : null,
        diagnosticCodes: [...this.diagnostics],
        events: structuredClone(this.usageEvents),
        truncatedEvents: this.usageTruncated,
      },
      hold: structuredClone(this.hold),
      transport: {
        enabled: this.options.transportEnabled,
        coverage: "provider-transport-only",
        events: structuredClone(this.transportEvents),
        truncatedEvents: this.transportTruncated,
      },
    };
  }
  register(app: FastifyInstance): void {
    app.register(
      async (routes) => {
        routes.addHook("onRequest", async (request, reply) => {
          if (!this.authorized(request))
            return reply.code(403).send({ error: "QA_OBSERVATION_FORBIDDEN" });
          if (request.headers["x-qa-instance-id"] !== this.instanceId)
            return reply
              .code(409)
              .send({ error: "QA_OBSERVATION_INSTANCE_MISMATCH" });
        });
        routes.get("/snapshot", async () => this.snapshot());
        routes.post("/writer/close", async (request, reply) => {
          if (request.body !== undefined)
            return reply.code(400).send({ error: "QA_WRITER_CLOSE_INVALID" });
          if (!this.options.usageEnabled || !this.initialized || !this.writer)
            return reply
              .code(409)
              .send({ error: "QA_USAGE_WRITER_UNAVAILABLE" });
          if (!this.writerClose) {
            this.closed = true;
            this.releaseHold("writer-close");
            this.writerClose = this.writer.close();
          }
          await this.writerClose;
          return { closed: true, snapshot: this.snapshot() };
        });
        routes.put<{ Params: { id: string } }>(
          "/holds/:id",
          async (request, reply) => {
            const parsed = holdBody.safeParse(request.body);
            if (
              !z.uuid().safeParse(request.params.id).success ||
              !parsed.success
            )
              return reply.code(400).send({ error: "QA_HOLD_INVALID" });
            if (!this.options.usageEnabled || !this.initialized || this.closed)
              return reply
                .code(409)
                .send({ error: "QA_USAGE_WRITER_UNAVAILABLE" });
            if (this.hold?.id === request.params.id) {
              if (this.hold.ttlMs !== parsed.data.ttlMs)
                return reply.code(409).send({ error: "QA_HOLD_CONFLICT" });
              return structuredClone(this.hold);
            }
            if (this.hold && ["armed", "held"].includes(this.hold.state))
              return reply.code(409).send({ error: "QA_HOLD_BUSY" });
            this.hold = {
              id: request.params.id,
              state: "armed",
              ttlMs: parsed.data.ttlMs,
              expiresAt: new Date(Date.now() + parsed.data.ttlMs).toISOString(),
              reached: null,
              releaseReason: null,
            };
            this.timer = setTimeout(
              () => this.releaseHold("ttl"),
              parsed.data.ttlMs,
            );
            this.timer.unref();
            return structuredClone(this.hold);
          },
        );
        routes.get<{ Params: { id: string } }>(
          "/holds/:id",
          async (request, reply) => {
            if (this.hold?.id !== request.params.id)
              return reply.code(404).send({ error: "QA_HOLD_NOT_FOUND" });
            return structuredClone(this.hold);
          },
        );
        routes.delete<{ Params: { id: string } }>(
          "/holds/:id",
          async (request, reply) => {
            if (this.hold?.id !== request.params.id)
              return reply.code(404).send({ error: "QA_HOLD_NOT_FOUND" });
            this.releaseHold("delete");
            return structuredClone(this.hold);
          },
        );
      },
      { prefix: this.basePath },
    );
  }
}
