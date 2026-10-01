import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, lstat, open, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { AgentError, messageSchema, turnResponseSchema } from "./protocol.js";

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  );
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
const recordSchema = z
  .object({
    version: z.literal(1),
    runId: z.string(),
    toolsDigest: z.string(),
    requestHash: z.string(),
    history: z.array(messageSchema),
    status: z.enum(["pending", "complete", "failed"]),
    response: turnResponseSchema.optional(),
  })
  .strict();
export type SessionRecord = z.infer<typeof recordSchema>;

export class SessionStore {
  private constructor(
    private directory: string,
    private owner: string,
  ) {}
  static async open(directory: string): Promise<SessionStore> {
    directory = resolve(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.mode & 0o077 ||
      stat.uid !== process.getuid?.()
    )
      throw new AgentError(503, "SESSION_DIRECTORY_UNSAFE");
    const owner = JSON.stringify({
      pid: process.pid,
      nonce: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    let file;
    try {
      file = await open(
        join(directory, "owner.lock"),
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch {
      throw new AgentError(503, "SESSION_DIRECTORY_LOCKED");
    }
    try {
      await file.writeFile(owner);
      await file.sync();
    } finally {
      await file.close();
    }
    return new SessionStore(directory, owner);
  }
  private path(runId: string): string {
    return join(this.directory, `${digest(runId)}.json`);
  }
  async read(runId: string): Promise<SessionRecord | undefined> {
    let file;
    try {
      file = await open(
        this.path(runId),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new AgentError(503, "SESSION_STORE_ERROR");
    }
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size > 2 * 1024 * 1024 ||
        stat.mode & 0o077 ||
        stat.uid !== process.getuid?.()
      )
        throw new Error();
      const record = recordSchema.parse(
        JSON.parse(await file.readFile("utf8")),
      );
      if (
        record.runId !== runId ||
        (record.status === "complete" && !record.response)
      )
        throw new Error();
      return record;
    } catch {
      throw new AgentError(503, "SESSION_STORE_ERROR");
    } finally {
      await file.close();
    }
  }
  async write(record: SessionRecord): Promise<void> {
    const path = this.path(record.runId);
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(record));
      await file.sync();
      await file.close();
      await rename(temporary, path);
      const directory = await open(this.directory, constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
      await file.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw new AgentError(503, "SESSION_STORE_ERROR");
    }
  }
  async close(): Promise<void> {
    const path = join(this.directory, "owner.lock");
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if ((await file.readFile("utf8")) !== this.owner)
        throw new AgentError(503, "SESSION_LOCK_CHANGED");
    } finally {
      await file.close();
    }
    await unlink(path);
  }
}
