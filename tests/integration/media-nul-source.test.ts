import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import Fastify from "fastify";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import { temporaryDatabase } from "../support/temporary-database.js";

const execute = promisify(execFile);

test(
  "C1 raw NUL source preserves SSE text and identity with an inert reversible witness, including real persistence retry",
  { timeout: 30000 },
  async (t) => {
    const temporary = await temporaryDatabase(t);
    const { db } = temporary;
    await migrate(db);
    await db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('nul-group','nul-remote','account-1')",
    );
    const directory = await mkdtemp(join(tmpdir(), "kapibala-media-nul-"));
    temporary.onCleanup(() => rm(directory, { recursive: true, force: true }));
    const logHost = Fastify({ logger: false });
    temporary.onCleanup(() => logHost.close());
    const requests: { method: string | undefined; url: string | undefined }[] =
      [];
    const input = (eventId: number, msgId: string, mediaUrl?: string) => ({
      eventId,
      type: "message" as const,
      groupId: "nul-remote",
      msgId,
      senderPlatformUserId: "external",
      text: `text-${msgId}`,
      sentAt: new Date().toISOString(),
      ...(mediaUrl === undefined ? {} : { mediaUrl }),
      // Unknown remote fields cannot supply the internal persistence witness.
      rejectedMediaSource: { encoding: "forged", value: "forged" },
    });
    let frames: ReturnType<typeof input>[] = [];
    const remote = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      if (request.url === "/events?since=0") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        for (const frame of frames)
          response.write(`data: ${JSON.stringify(frame)}\n\n`);
      } else if (request.url?.startsWith("/media/")) {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end("real attachment bytes");
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    temporary.onCleanup(async () => {
      remote.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        remote.close((error) => (error ? reject(error) : resolve())),
      );
    });
    remote.listen(0, "127.0.0.1");
    await once(remote, "listening");
    const address = remote.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const raw = `${origin}/media/raw\0nul`;
    const rawEvent = input(2, "raw-nul", raw);
    frames = [
      input(1, "ok-start", "/media/ok-start"),
      rawEvent,
      rawEvent,
      input(3, "raw-nul", raw),
      {
        ...input(4, "raw-nul", `${origin}/media/must-not-fetch`),
        text: "must not replace first text",
      },
      input(5, "encoded-nul", "/media/encoded%00nul"),
      input(6, "sentinel-literal", "untrusted-media-source:raw-nul"),
      input(7, "escaped-literal", "/media/raw\\u0000nul"),
      input(8, "ok-end", `${origin}/media/ok-end`),
      input(9, "ok-start", raw),
      input(10, "no-media"),
      input(11, "empty-media", ""),
    ];
    const ctx = {
      db,
      log: logHost.log,
      gateway: new RemoteClient(origin),
      agent: new RemoteClient(origin),
    };
    const events = new GatewayEvents(ctx, new Messages(ctx));
    temporary.onCleanup(() => events.close());
    async function until(read: () => Promise<boolean>) {
      const deadline = Date.now() + 5000;
      while (!(await read())) {
        assert.ok(
          Date.now() < deadline,
          "actual persistence condition reached",
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    events.start();
    await until(async () =>
      Boolean(
        (await db.query("SELECT 1 FROM gateway_events WHERE event_id='11'"))
          .rowCount,
      ),
    );
    await events.close();
    const read = async () => ({
      ledger: (
        await db.query(
          "SELECT event_id,data FROM gateway_events ORDER BY event_id",
        )
      ).rows,
      messages: (
        await db.query(
          "SELECT id,msg_id,text,metadata,local_file_path FROM messages ORDER BY msg_id",
        )
      ).rows,
      media: (
        await db.query(
          "SELECT id,msg_id,source_url,state,attempts,last_error,local_file_path FROM media_files ORDER BY msg_id",
        )
      ).rows,
    });
    const first = await read();
    assert.equal(first.ledger.length, 11);
    assert.equal(first.messages.length, 8);
    assert.equal(first.media.length, 7);
    const witness = {
      reason: "UNTRUSTED_MEDIA_URL",
      encoding: "json-string",
      value: JSON.stringify(raw),
    };
    const message = first.messages.find((row) => row.msg_id === "raw-nul")!;
    const media = first.media.find((row) => row.msg_id === "raw-nul")!;
    assert.equal(message.text, "text-raw-nul");
    assert.equal(message.local_file_path, null);
    assert.equal(message.metadata.mediaUrl, undefined);
    assert.deepEqual(message.metadata.rejectedMediaSource, witness);
    assert.equal(JSON.parse(message.metadata.rejectedMediaSource.value), raw);
    assert.equal(media.source_url, "untrusted-media-source:raw-nul");
    assert.equal(media.state, "unavailable");
    assert.equal(media.last_error, "UNTRUSTED_MEDIA_URL");
    assert.equal(media.attempts, 0);
    assert.equal(media.local_file_path, null);
    for (const eventId of ["2", "3", "9"]) {
      const row = first.ledger.find((row) => String(row.event_id) === eventId)!;
      assert.equal(row.data.mediaUrl, undefined);
      assert.deepEqual(row.data.rejectedMediaSource, witness);
    }
    for (const msgId of [
      "ok-start",
      "ok-end",
      "encoded-nul",
      "sentinel-literal",
      "escaped-literal",
      "no-media",
      "empty-media",
    ]) {
      assert.equal(
        first.messages.find((row) => row.msg_id === msgId)!.metadata
          .rejectedMediaSource,
        undefined,
      );
    }
    assert.equal(
      first.ledger.find((row) => String(row.event_id) === "1")!.data
        .rejectedMediaSource,
      undefined,
    );
    assert.equal(
      first.messages.find((row) => row.msg_id === "sentinel-literal")!.metadata
        .mediaUrl,
      "untrusted-media-source:raw-nul",
    );
    assert.equal(
      first.messages.find((row) => row.msg_id === "empty-media")!.metadata
        .mediaUrl,
      undefined,
    );
    assert.equal(
      first.ledger.find((row) => String(row.event_id) === "11")!.data.mediaUrl,
      "",
    );
    // Six normal pending entries retain the real two-file tick limit.
    for (let index = 0; index < 3; index++) {
      const child = await execute(
        process.execPath,
        ["--import", "tsx", "tests/support/media-worker-process.ts"],
        {
          env: {
            ...process.env,
            MEDIA_TEST_DATABASE_URL: temporary.url,
            MEDIA_TEST_DIRECTORY: directory,
            MEDIA_TEST_GATEWAY_URL: origin,
          },
          timeout: 20000,
        },
      );
      assert.equal(child.stderr, "");
    }
    const downloaded = await read();
    for (const row of downloaded.media) {
      if (row.msg_id.startsWith("ok-")) {
        assert.equal(row.state, "ready");
        assert.equal(
          await readFile(row.local_file_path, "utf8"),
          "real attachment bytes",
        );
      } else {
        assert.equal(row.state, "unavailable");
        assert.equal(row.attempts, 0);
        assert.equal(row.local_file_path, null);
        assert.equal(row.last_error, "UNTRUSTED_MEDIA_URL");
      }
    }
    // A real temporary SQL failure establishes the existing retry path.
    await db.query(
      "CREATE FUNCTION media_nul_retry_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_id=13 THEN RAISE EXCEPTION 'owned fixture retry'; END IF; RETURN NEW; END $$",
    );
    await db.query(
      "CREATE TRIGGER media_nul_retry_fault BEFORE INSERT ON gateway_events FOR EACH ROW EXECUTE FUNCTION media_nul_retry_fault()",
    );
    frames.push(
      input(12, "ok-start", raw),
      input(13, "retry-nul", raw),
      input(14, "no-media"),
    );
    events.start();
    await until(async () =>
      Boolean(
        (await db.query("SELECT 1 FROM gateway_events WHERE event_id='14'"))
          .rowCount,
      ),
    );
    await events.close();
    assert.equal(
      (await db.query("SELECT 1 FROM messages WHERE msg_id='retry-nul'"))
        .rowCount,
      0,
    );
    await db.query("DROP TRIGGER media_nul_retry_fault ON gateway_events");
    await db.query("DROP FUNCTION media_nul_retry_fault()");
    await events.retryFailed();
    const recovered = await read();
    const retry = recovered.messages.find((row) => row.msg_id === "retry-nul")!;
    assert.equal(retry.text, "text-retry-nul");
    assert.deepEqual(retry.metadata.rejectedMediaSource, witness);
    const retryMedia = recovered.media.find(
      (row) => row.msg_id === "retry-nul",
    )!;
    assert.equal(retryMedia.state, "unavailable");
    assert.equal(retryMedia.last_error, "UNTRUSTED_MEDIA_URL");
    assert.equal(retryMedia.attempts, 0);
    assert.equal(retryMedia.local_file_path, null);
    await events.retryFailed();
    assert.deepEqual(await read(), recovered);
    assert.deepEqual(
      recovered.messages.find((row) => row.msg_id === "raw-nul"),
      message,
    );
    assert.deepEqual(
      recovered.media.find((row) => row.msg_id === "raw-nul"),
      media,
    );
    assert.deepEqual(
      recovered.media.find((row) => row.msg_id === "ok-start"),
      downloaded.media.find((row) => row.msg_id === "ok-start"),
    );
    assert.deepEqual(
      requests
        .filter((request) => request.url?.startsWith("/media/"))
        .map((request) => request.url)
        .sort(),
      ["/media/ok-end", "/media/ok-start"],
    );
    assert.equal((await readdir(directory)).length, 2);
    t.diagnostic(
      JSON.stringify({
        database: new URL(temporary.url).pathname.slice(1),
        directory,
        origin,
        first,
        downloaded,
        recovered,
        requests,
        workerProcesses: 3,
      }),
    );
  },
);
