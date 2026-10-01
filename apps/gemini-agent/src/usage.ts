import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { UsageObservation } from "./provider.js";

const token = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
const recordSchema = z
  .object({
    requestId: z.string().uuid(),
    attemptId: z.string().uuid(),
    runId: z.string().max(512).nullable(),
    observedAt: z.iso.datetime(),
    stage: z.enum(["provider", "validated-generation"]),
    purpose: z.enum(["turn", "audit"]),
    model: z
      .string()
      .regex(/^gemini-[a-zA-Z0-9.-]+$/)
      .max(128),
    elapsedMs: z.number().finite().nonnegative(),
    outcome: z.enum(["success", "failure"]),
    errorCode: z
      .enum([
        "MODEL_RATE_LIMITED",
        "MODEL_AUTH_ERROR",
        "MODEL_REQUEST_INVALID",
        "MODEL_UNAVAILABLE",
        "MODEL_INVALID_OUTPUT",
        "MODEL_RESPONSE_TOO_LARGE",
        "MODEL_BLOCKED",
        "MODEL_CANCELLED",
        "MODEL_TIMEOUT",
        "AGENT_UNAVAILABLE",
      ])
      .nullable(),
    inputTokens: token,
    outputTokens: token,
    totalTokens: token,
  })
  .strict();
export interface UsageJournalOptions {
  enabled?: boolean;
  maxRecords?: number;
  maxBytes?: number;
  maxAgeDays?: number;
  /** Explicit engineering injection only; normal entry configuration never sets it. */
  testObserver?: UsageTestObserver;
  warn?: (
    code:
      | "USAGE_STORE_UNAVAILABLE"
      | "USAGE_WRITE_FAILED"
      | "USAGE_QUEUE_FULL"
      | "USAGE_RECORD_INVALID",
  ) => void;
}
export interface UsageQueueEvent {
  seq: number;
  at: string;
  monotonicMs: number;
  kind:
    | "initialized"
    | "enqueued"
    | "rejected-queue-full"
    | "rejected-closed"
    | "diagnostic"
    | "batch-dequeued"
    | "before-write"
    | "write-started"
    | "write-settled"
    | "write-failed"
    | "batch-settled"
    | "closing"
    | "closed";
  queued: number;
  activeBatch: number;
  dropped: number;
  writeFailures: number;
  batchId: string | null;
  attemptIds: string[];
  requestId?: string;
  attemptId?: string;
  diagnosticCode?: string;
}
export interface UsageTestObserver {
  event(event: UsageQueueEvent): void;
  beforeWrite(event: UsageQueueEvent): Promise<void>;
}
const hardMaxBytes = 16 * 1024 * 1024;
const fileName = "usage.jsonl";

/** Metadata only. The enclosing SessionStore owns this directory for its lifetime.
 * A bounded queue decouples optional telemetry I/O from model responses. */
export class UsageJournal {
  private entries: string[] = [];
  private queue: string[] = [];
  private writing?: Promise<void>;
  private closed = false;
  private warned = new Set<string>();
  private activeBatch: { id: string; attemptIds: string[] } | undefined;
  private dropped = 0;
  private writeFailures = 0;
  private observationSequence = 0;
  private constructor(
    private directory: string,
    private limits: {
      maxRecords: number;
      maxBytes: number;
      maxAgeDays: number;
    },
    private warn: NonNullable<UsageJournalOptions["warn"]>,
    private testObserver?: UsageTestObserver,
  ) {}
  static async open(
    directory: string,
    options: UsageJournalOptions,
  ): Promise<UsageJournal | undefined> {
    if (options.enabled === false) return undefined;
    const warn =
      options.warn ??
      ((code) =>
        console.error(JSON.stringify({ event: "gemini-usage-warning", code })));
    const limits = {
      maxRecords: options.maxRecords ?? 1000,
      maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
      maxAgeDays: options.maxAgeDays ?? 30,
    };
    const journal = new UsageJournal(
      directory,
      limits,
      warn,
      options.testObserver,
    );
    try {
      if (
        !Number.isInteger(limits.maxRecords) ||
        limits.maxRecords < 1 ||
        limits.maxRecords > 10000 ||
        !Number.isInteger(limits.maxBytes) ||
        limits.maxBytes < 4096 ||
        limits.maxBytes > hardMaxBytes ||
        !Number.isInteger(limits.maxAgeDays) ||
        limits.maxAgeDays < 1 ||
        limits.maxAgeDays > 365
      )
        throw new Error("invalid usage limits");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const stat = await lstat(directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.mode & 0o077 ||
        stat.uid !== process.getuid?.()
      )
        throw new Error("unsafe usage directory");
      // A killed optional writer can leave one private atomic-write file. Only
      // this journal's exact UUID pattern is reclaimed; session/unknown files stay.
      for (const name of await readdir(directory)) {
        if (
          !/^usage-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/.test(
            name,
          )
        )
          continue;
        const path = join(directory, name);
        const item = await lstat(path);
        if (
          !item.isFile() ||
          item.isSymbolicLink() ||
          item.nlink !== 1 ||
          item.mode & 0o077 ||
          item.uid !== process.getuid?.()
        )
          throw new Error("unsafe usage temporary file");
        await unlink(path);
      }
      let file;
      try {
        file = await open(
          join(directory, fileName),
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (file) {
        try {
          const stat = await file.stat();
          if (
            !stat.isFile() ||
            stat.nlink !== 1 ||
            stat.mode & 0o077 ||
            stat.uid !== process.getuid?.() ||
            stat.size > hardMaxBytes
          )
            throw new Error("unsafe usage file");
          const lines = (await file.readFile("utf8"))
            .split("\n")
            .filter(Boolean);
          journal.entries = lines.map((line) =>
            JSON.stringify(recordSchema.parse(JSON.parse(line))),
          );
        } finally {
          await file.close();
        }
      }
      journal.entries = journal.retain(journal.entries);
      await journal.persist(journal.entries);
      journal.observe("initialized");
      return journal;
    } catch {
      journal.diagnostic("USAGE_STORE_UNAVAILABLE");
      return undefined;
    }
  }
  private diagnostic(
    code: Parameters<NonNullable<UsageJournalOptions["warn"]>>[0],
  ): void {
    if (this.warned.has(code)) return;
    this.warned.add(code);
    this.observe("diagnostic", { diagnosticCode: code });
    try {
      this.warn(code);
    } catch {
      /* Optional diagnostics cannot fail a request. */
    }
  }
  record(value: UsageObservation): void {
    if (this.closed) {
      this.observe("rejected-closed");
      return;
    }
    let line: string;
    try {
      line = JSON.stringify(recordSchema.parse(value));
      if (Buffer.byteLength(line) + 1 > 4096) throw new Error();
    } catch {
      this.diagnostic("USAGE_RECORD_INVALID");
      return;
    }
    if (this.queue.length >= 64) {
      this.dropped++;
      this.observe("rejected-queue-full", {
        requestId: value.requestId,
        attemptId: value.attemptId,
      });
      this.diagnostic("USAGE_QUEUE_FULL");
      return;
    }
    this.queue.push(line);
    this.observe("enqueued", {
      requestId: value.requestId,
      attemptId: value.attemptId,
    });
    if (!this.writing) this.writing = this.drain();
  }
  private retain(lines: string[]): string[] {
    const cutoff = Date.now() - this.limits.maxAgeDays * 86400000;
    const kept: string[] = [];
    let bytes = 0;
    for (
      let i = lines.length - 1;
      i >= 0 && kept.length < this.limits.maxRecords;
      i--
    ) {
      const line = lines[i]!;
      if (
        Date.parse((JSON.parse(line) as UsageObservation).observedAt) < cutoff
      )
        continue;
      const size = Buffer.byteLength(line) + 1;
      if (bytes + size > this.limits.maxBytes) break;
      kept.push(line);
      bytes += size;
    }
    return kept.reverse();
  }
  private async persist(lines: string[]): Promise<void> {
    const temporary = join(this.directory, `usage-${randomUUID()}.tmp`);
    const opening = open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    // The physical open has been issued; this is not a completion/fsync claim.
    this.observe("write-started");
    const file = await opening;
    try {
      await file.writeFile(lines.length ? `${lines.join("\n")}\n` : "");
      await file.sync();
      await file.close();
      await rename(temporary, join(this.directory, fileName));
    } finally {
      await file.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
  private async drain(): Promise<void> {
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0);
        if (this.testObserver)
          this.activeBatch = {
            id: randomUUID(),
            attemptIds: batch.map(
              (line) => (JSON.parse(line) as UsageObservation).attemptId,
            ),
          };
        this.observe("batch-dequeued");
        try {
          const next = this.retain([...this.entries, ...batch]);
          if (this.testObserver) {
            const event = this.observe("before-write")!;
            await this.testObserver.beforeWrite(event);
          }
          await this.persist(next);
          this.entries = next;
          this.observe("write-settled");
        } catch {
          this.writeFailures++;
          this.observe("write-failed");
          this.diagnostic("USAGE_WRITE_FAILED");
        } finally {
          this.activeBatch = undefined;
          this.observe("batch-settled");
        }
      }
    } finally {
      this.writing = undefined;
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    this.observe("closing");
    await this.writing;
    this.observe("closed");
  }
  private observe(
    kind: UsageQueueEvent["kind"],
    fields: Pick<
      UsageQueueEvent,
      "requestId" | "attemptId" | "diagnosticCode"
    > = {},
  ): UsageQueueEvent | undefined {
    if (!this.testObserver) return undefined;
    const event: UsageQueueEvent = {
      seq: ++this.observationSequence,
      at: new Date().toISOString(),
      monotonicMs: performance.now(),
      kind,
      queued: this.queue.length,
      activeBatch: this.activeBatch?.attemptIds.length ?? 0,
      dropped: this.dropped,
      writeFailures: this.writeFailures,
      batchId: this.activeBatch?.id ?? null,
      attemptIds: [...(this.activeBatch?.attemptIds ?? [])],
      ...fields,
    };
    try {
      this.testObserver.event(structuredClone(event));
    } catch {
      /* Observation failures cannot change normal usage behavior. */
    }
    return event;
  }
}

export function usageOptions(env: NodeJS.ProcessEnv): UsageJournalOptions {
  return {
    enabled: env.GEMINI_USAGE_ENABLED !== "false",
    ...(env.GEMINI_USAGE_MAX_RECORDS !== undefined
      ? { maxRecords: Number(env.GEMINI_USAGE_MAX_RECORDS) }
      : {}),
    ...(env.GEMINI_USAGE_MAX_BYTES !== undefined
      ? { maxBytes: Number(env.GEMINI_USAGE_MAX_BYTES) }
      : {}),
    ...(env.GEMINI_USAGE_MAX_AGE_DAYS !== undefined
      ? { maxAgeDays: Number(env.GEMINI_USAGE_MAX_AGE_DAYS) }
      : {}),
  };
}
