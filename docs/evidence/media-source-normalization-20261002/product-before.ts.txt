import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, open, stat, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { AppContext } from "../../core/context.js";
import { currentOperationSignal, emit, type Queryable } from "../../core/db.js";
import type { Message } from "../../../../../packages/contracts/src/index.js";
import type {
  MediaReferenceOperation,
  TestMediaObserver,
  TestMediaOperation,
} from "../../core/test-media-observer.js";

interface MediaRow {
  id: string;
  group_id: string;
  msg_id: string;
  source_url: string;
  state: string;
  storage_root: string | null;
  partial_name: string | null;
  attempts: number;
}
export interface MediaOptions {
  directory: string;
  retentionDays: number;
  maxBytes: number;
  timeoutMs: number;
  cleanupIntervalMs: number;
}
function setting(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max ||
    process.env[name]?.trim() === ""
  )
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function mediaOptions(): MediaOptions {
  return {
    directory: resolve(process.env.MEDIA_DIR || "media"),
    retentionDays: setting("MEDIA_RETENTION_DAYS", 30, 0, 36500),
    maxBytes: setting(
      "MEDIA_MAX_BYTES",
      20 * 1024 * 1024,
      1,
      1024 * 1024 * 1024,
    ),
    timeoutMs: setting("MEDIA_DOWNLOAD_TIMEOUT_MS", 15000, 1, 300000),
    cleanupIntervalMs: setting(
      "MEDIA_CLEANUP_INTERVAL_MS",
      3600000,
      100,
      86400000,
    ),
  };
}
class UnavailableMedia extends Error {}
class RejectedStoredMedia extends UnavailableMedia {}

/** Accept only the configured gateway's media endpoint; never follow redirects. */
export function trustedMediaUrl(source: string, gateway: string): URL {
  const base = new URL(gateway);
  let url: URL;
  try {
    if (source.length > 4096 || source !== source.trim()) throw new Error();
    url = new URL(source, base);
    const match = /^\/media\/([^/]+)$/.exec(url.pathname);
    const id = match ? decodeURIComponent(match[1]!) : "";
    if (
      !id ||
      id === "." ||
      id === ".." ||
      /[\x00-\x1f\x7f/\\]/.test(id) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new UnavailableMedia("UNTRUSTED_MEDIA_URL");
  }
  return url;
}

export async function registerMedia(
  tx: Queryable,
  groupId: string,
  msgId: string,
  source: string,
): Promise<void> {
  await tx.query(
    "INSERT INTO media_files(id,group_id,msg_id,source_url) VALUES($1,$2,$3,$4) ON CONFLICT(group_id,msg_id) DO NOTHING",
    [randomUUID(), groupId, msgId, source],
  );
}

/** Run creation/history reads and expiry serialize on the same durable file rows. */
export async function referenceMedia(
  tx: Queryable,
  runId: string,
  groupId: string,
  msgIds: (string | null)[],
  observation?: {
    observer: TestMediaObserver;
    operation: MediaReferenceOperation;
  },
): Promise<TestMediaOperation | undefined> {
  if (!msgIds.length) return;
  const witness = observation
    ? await observation.observer.reference(tx, {
        groupId,
        runId,
        msgIds,
        operation: observation.operation,
      })
    : undefined;
  const files = await tx.query<{ id: string }>(
    "SELECT id FROM media_files WHERE group_id=$1 AND msg_id=ANY($2::text[]) AND state NOT IN ('deleting','deleted','unavailable') ORDER BY id FOR UPDATE",
    [groupId, msgIds.filter((id): id is string => id !== null)],
  );
  if (witness)
    await witness.stage(
      "reference-locked",
      files.rows.map((file) => file.id),
    );
  for (const file of files.rows)
    await tx.query(
      "INSERT INTO agent_media_references(run_id,media_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [runId, file.id],
    );
  if (witness)
    await witness.stage(
      "reference-registered",
      files.rows.map((file) => file.id),
    );
  return witness;
}

/** Content snapshots stay frozen; file availability is a current resource field.
 * Never persist a copied filesystem pointer in a timeline snapshot. */
export async function withCurrentFiles(
  db: Queryable,
  groupId: string,
  items: Message[],
): Promise<Message[]> {
  if (!items.length) return items;
  const files = await db.query<{
    msg_id: string;
    local_file_path: string | null;
  }>(
    "SELECT msg_id,local_file_path FROM media_files WHERE group_id=$1 AND msg_id=ANY($2::text[])",
    [groupId, items.map((item) => item.msgId).filter(Boolean)],
  );
  const paths = new Map(
    files.rows.map((row) => [row.msg_id, row.local_file_path]),
  );
  return items.map(({ localFilePath: _path, ...item }) =>
    item.msgId && paths.has(item.msgId)
      ? { ...item, localFilePath: paths.get(item.msgId)! }
      : item,
  );
}

async function remove(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
async function syncDirectory(path: string): Promise<void> {
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export class MediaFiles {
  private readonly stop = new AbortController();
  private nextCleanup = 0;
  readonly options: MediaOptions;
  constructor(
    private readonly ctx: AppContext,
    options = mediaOptions(),
  ) {
    this.options = { ...options, directory: resolve(options.directory) };
  }
  close(): void {
    this.stop.abort();
  }
  async recover(): Promise<void> {
    const mismatch = await this.ctx.db.query(
      "SELECT 1 FROM media_files WHERE storage_root IS NOT NULL AND storage_root<>$1 AND state NOT IN ('deleted','unavailable') LIMIT 1",
      [this.options.directory],
    );
    if (mismatch.rowCount)
      throw new Error(
        "MEDIA_DIR differs from persisted media storage; restore/move the managed directory before starting",
      );
  }
  async tick(): Promise<void> {
    // Empty polling must not briefly consume a shared execution slot. This is
    // only a hint: the lock holder below re-reads all work before changing it.
    const due = await this.ctx.db.query(
      "SELECT 1 FROM media_files WHERE (state IN ('pending','downloading') AND next_attempt_at<=now()) OR ($1::boolean AND ((state='deleting' AND next_attempt_at<=now()) OR (state='ready' AND downloaded_at < now()-$2*interval '1 day'))) LIMIT 1",
      [Date.now() >= this.nextCleanup, this.options.retentionDays],
    );
    if (!due.rowCount) return;
    await this.ctx.db.withLock("media:files", async () => {
      const files = await this.ctx.db.query<MediaRow>(
        "SELECT * FROM media_files WHERE state IN ('pending','downloading') AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT 2",
      );
      for (const file of files.rows) {
        this.stop.signal.throwIfAborted();
        await this.download(file);
      }
      if (Date.now() >= this.nextCleanup) {
        const count = await this.cleanupExpired();
        this.nextCleanup =
          count === 50 ? 0 : Date.now() + this.options.cleanupIntervalMs;
      }
    });
  }
  private path(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid managed media identity");
    return join(this.options.directory, `media-${id}.bin`);
  }
  private partial(name: string): string {
    if (!/^media-[a-f0-9-]{36}\.[a-f0-9-]{36}\.part$/.test(name))
      throw new Error("Invalid managed partial identity");
    return join(this.options.directory, name);
  }
  private async publish(file: MediaRow, path: string): Promise<void> {
    const info = await stat(path);
    await this.ctx.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE media_files SET state='ready',local_file_path=$2,downloaded_at=COALESCE(downloaded_at,$3),storage_root=$4,partial_name=NULL,last_error=NULL WHERE id=$1",
        [file.id, path, info.mtime, this.options.directory],
      );
      await this.projectPath(tx, file, path);
    });
  }
  private async projectPath(
    tx: Queryable,
    file: MediaRow,
    path: string | null,
  ): Promise<void> {
    const rows = await tx.query<{ id: string; is_own: boolean }>(
      "UPDATE messages SET local_file_path=$3 WHERE group_id=$1 AND msg_id=$2 RETURNING id,is_own",
      [file.group_id, file.msg_id, path],
    );
    for (const row of rows.rows)
      await emit(tx, "message", {
        groupId: file.group_id,
        msgId: file.msg_id,
        id: row.id,
        isOwn: row.is_own,
        changeKind: "media",
        source: "gateway",
      });
  }
  private async download(file: MediaRow): Promise<void> {
    const path = this.path(file.id);
    const partialName = `media-${file.id}.${randomUUID()}.part`;
    const partialPath = this.partial(partialName);
    const operation = currentOperationSignal();
    const signal = AbortSignal.any([
      this.stop.signal,
      AbortSignal.timeout(this.options.timeoutMs),
      ...(operation ? [operation] : []),
    ]);
    let response: Response | undefined;
    let directoryReady = false;
    try {
      const url = trustedMediaUrl(file.source_url, this.ctx.gateway.baseUrl);
      if (file.storage_root && file.storage_root !== this.options.directory)
        throw new Error("MEDIA_DIR mismatch");
      await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
      directoryReady = true;
      if (file.partial_name) {
        await remove(this.partial(file.partial_name));
        await syncDirectory(this.options.directory);
      }
      // Only complete, fsynced bodies are linked at this stable name. Reuse a
      // completed download after a crash before publishing its DB result.
      try {
        const existing = await open(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const info = await existing.stat();
          if (!info.isFile() || info.size > this.options.maxBytes)
            throw new RejectedStoredMedia("INVALID_STORED_MEDIA");
        } finally {
          await existing.close();
        }
        await this.publish(file, path);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await this.ctx.db.query(
        "UPDATE media_files SET state='downloading',storage_root=$2,partial_name=$3,attempts=attempts+1 WHERE id=$1",
        [file.id, this.options.directory, partialName],
      );
      response = await fetch(url, { redirect: "manual", signal });
      if (!response.ok) {
        await response.body?.cancel();
        if (
          response.status >= 300 &&
          response.status < 500 &&
          ![408, 429].includes(response.status)
        )
          throw new UnavailableMedia(`MEDIA_HTTP_${response.status}`);
        throw new Error(`MEDIA_HTTP_${response.status}`);
      }
      if (
        Number(response.headers.get("content-length")) > this.options.maxBytes
      ) {
        await response.body?.cancel();
        throw new UnavailableMedia("MEDIA_TOO_LARGE");
      }
      const output = await open(
        partialPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      let bytes = 0;
      try {
        if (response.body)
          for await (const chunk of response.body) {
            signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > this.options.maxBytes)
              throw new UnavailableMedia("MEDIA_TOO_LARGE");
            let offset = 0;
            while (offset < chunk.byteLength) {
              signal.throwIfAborted();
              const written = await output.write(
                chunk,
                offset,
                chunk.byteLength - offset,
              );
              if (!written.bytesWritten) throw new Error("MEDIA_WRITE_STALLED");
              offset += written.bytesWritten;
            }
          }
        signal.throwIfAborted();
        await output.sync();
      } finally {
        await output.close();
      }
      signal.throwIfAborted();
      // Exclusive publication: an old cancelled worker can never overwrite an
      // already completed body from its successor.
      try {
        await link(partialPath, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await syncDirectory(this.options.directory);
      await remove(partialPath);
      await syncDirectory(this.options.directory);
      signal.throwIfAborted();
      await this.publish(file, path);
    } catch (error) {
      await remove(partialPath);
      // Clearing partial_name must follow durable removal, including a retry
      // after unlink succeeded but its first directory sync failed.
      if (directoryReady) await syncDirectory(this.options.directory);
      if (operation?.aborted || this.stop.signal.aborted) throw error;
      const permanent = error instanceof UnavailableMedia;
      if (error instanceof RejectedStoredMedia) {
        // A completed body can outlive its ready transaction and then exceed a
        // newly lowered limit. Keep a durable cleanup intent, not an orphan in
        // unavailable. Cleanup still waits for every running reference to end.
        await this.ctx.db.transaction(async (tx) => {
          await tx.query(
            "UPDATE media_files SET state='deleting',local_file_path=NULL,partial_name=NULL,storage_root=$2,last_error=$3,next_attempt_at=now() WHERE id=$1",
            [file.id, this.options.directory, error.message],
          );
          await this.projectPath(tx, file, null);
        });
      } else
        await this.ctx.db.query(
          "UPDATE media_files SET state=$2,partial_name=NULL,last_error=$3,next_attempt_at=now()+$4*interval '1 millisecond' WHERE id=$1",
          [
            file.id,
            permanent ? "unavailable" : "pending",
            error instanceof Error
              ? error.message.slice(0, 300)
              : "MEDIA_DOWNLOAD_FAILED",
            Math.min(300000, 1000 * 2 ** Math.min(file.attempts, 9)),
          ],
        );
      this.ctx.log.warn(
        { mediaId: file.id, permanent },
        "媒体下载未完成，消息文本已保留",
      );
    } finally {
      // A filesystem failure can happen after headers but before consuming the
      // stream. Release that response before admitting another download.
      await response?.body?.cancel().catch(() => {});
    }
  }
  async cleanupExpired(): Promise<number> {
    const candidates = await this.ctx.db.query<MediaRow>(
      "SELECT * FROM media_files f WHERE ((state='deleting' AND next_attempt_at<=now()) OR (state='ready' AND downloaded_at < now()-$1*interval '1 day')) AND NOT EXISTS(SELECT 1 FROM agent_media_references p JOIN agent_runs r ON r.id=p.run_id WHERE p.media_id=f.id AND r.status='running') ORDER BY downloaded_at NULLS FIRST,id LIMIT 50",
      [this.options.retentionDays],
    );
    for (const file of candidates.rows) {
      this.stop.signal.throwIfAborted();
      let witness: TestMediaOperation | undefined;
      const deleting = await this.ctx.db.transaction(async (tx) => {
        witness = this.ctx.testMediaObserver
          ? await this.ctx.testMediaObserver.cleanup(tx, {
              groupId: file.group_id,
              msgId: file.msg_id,
              mediaId: file.id,
            })
          : undefined;
        const row = (
          await tx.query<MediaRow>(
            "SELECT * FROM media_files WHERE id=$1 FOR UPDATE",
            [file.id],
          )
        ).rows[0];
        if (!row || !["ready", "deleting"].includes(row.state)) return false;
        if (
          (
            await tx.query(
              "SELECT 1 FROM agent_media_references p JOIN agent_runs r ON r.id=p.run_id WHERE p.media_id=$1 AND r.status='running' LIMIT 1",
              [file.id],
            )
          ).rowCount
        )
          return false;
        await tx.query(
          "UPDATE media_files SET state='deleting',local_file_path=NULL,next_attempt_at=now() WHERE id=$1",
          [file.id],
        );
        await this.projectPath(tx, file, null);
        return true;
      });
      if (!deleting) {
        if (witness) await witness.stage("cleanup-skipped");
        continue;
      }
      if (witness) await witness.stage("cleanup-claimed");
      try {
        if (file.storage_root !== this.options.directory)
          throw new Error("MEDIA_DIR mismatch during cleanup");
        await remove(this.path(file.id));
        if (file.partial_name) await remove(this.partial(file.partial_name));
        await syncDirectory(this.options.directory);
        await this.ctx.db.query(
          "UPDATE media_files SET state='deleted',partial_name=NULL,last_error=NULL WHERE id=$1 AND state='deleting'",
          [file.id],
        );
        if (witness) await witness.stage("cleanup-completed");
      } catch (error) {
        currentOperationSignal()?.throwIfAborted();
        this.stop.signal.throwIfAborted();
        // Keep the committed tombstone, but let other expired files progress.
        await this.ctx.db.query(
          "UPDATE media_files SET last_error=$2,next_attempt_at=now()+$3*interval '1 millisecond' WHERE id=$1 AND state='deleting'",
          [
            file.id,
            error instanceof Error
              ? error.message.slice(0, 300)
              : "MEDIA_DELETE_FAILED",
            this.options.cleanupIntervalMs,
          ],
        );
        this.ctx.log.warn({ mediaId: file.id }, "媒体删除未完成，稍后重试");
      }
    }
    return candidates.rowCount ?? 0;
  }
}
