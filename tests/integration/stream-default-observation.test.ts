import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { createGatewaySimulator } from "../../apps/simulator/src/gateway.js";
import { createAgentSimulator } from "../../apps/simulator/src/agent.js";
import { temporaryDatabase } from "../support/temporary-database.js";

const profile = {
  maxMessages: 8192,
  batch: 32,
  textBytes: 128,
  injectionMs: 120000,
  healthyDrainMs: 45000,
  closeObservationMs: 8000,
  oldReaderDrainMs: 10000,
  replayMs: 30000,
  duplicateObservationMs: 1000,
  maxFramesPerReader: 20000,
  maxBytesPerReader: 16 * 1024 * 1024,
  maxHistoryPages: 100,
  historyLimit: 100,
  postCloseTail: 16,
  maxEvidenceBytes: 16 * 1024 * 1024,
};
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(
  check: () => boolean | Promise<boolean>,
  ms: number,
): Promise<boolean> {
  const end = performance.now() + ms;
  do {
    if (await check()) return true;
    await delay(25);
  } while (performance.now() < end);
  return check();
}
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
type Frame = {
  type: string;
  seq?: number;
  startSeq?: number;
  requestId?: string;
  success?: boolean;
  payload?: { msgId?: string; groupId?: string; isOwn?: boolean };
};
type Receipt = {
  seq: number;
  type: string;
  msgId?: string;
  groupId?: string;
  isOwn?: boolean;
  bytes: number;
  monotonicMs: number;
};
function openReader(address: string, token: string, sinceSeq?: number) {
  const ws = new WebSocket(address.replace("http:", "ws:") + "/ws");
  const receipts: Receipt[] = [];
  const controls: Frame[] = [];
  const errors: string[] = [];
  let bytes = 0;
  let lastSeq = sinceSeq ?? 0;
  let localPort = 0;
  let closed: { code: number; reason: string; monotonicMs: number } | undefined;
  let cleanupAt: number | undefined;
  const opened = once(ws, "open");
  ws.on("error", (error) => errors.push(error.message));
  ws.on("close", (code, reason) => {
    closed = {
      code,
      reason: reason.toString(),
      monotonicMs: performance.now(),
    };
  });
  ws.on("message", (raw) => {
    try {
      const length = Buffer.byteLength(raw as Buffer);
      bytes += length;
      if (
        bytes > profile.maxBytesPerReader ||
        receipts.length + controls.length >= profile.maxFramesPerReader
      )
        throw new Error("reader evidence cap reached");
      const frame = JSON.parse(raw.toString()) as Frame;
      if (frame.seq !== undefined) {
        assert.ok(
          Number.isSafeInteger(frame.seq) && frame.seq > lastSeq,
          "event sequence is strictly increasing",
        );
        lastSeq = frame.seq;
        receipts.push({
          seq: frame.seq,
          type: frame.type,
          msgId: frame.payload?.msgId,
          groupId: frame.payload?.groupId,
          isOwn: frame.payload?.isOwn,
          bytes: length,
          monotonicMs: performance.now(),
        });
      } else controls.push(frame);
    } catch (error) {
      errors.push(String(error));
    }
  });
  const ready = (async () => {
    await opened;
    localPort = (ws as unknown as { _socket: Socket })._socket.localPort!;
    ws.send(
      JSON.stringify({
        type: "auth",
        accessToken: token,
        ...(sinceSeq === undefined ? {} : { sinceSeq }),
      }),
    );
    assert.ok(
      await waitFor(
        () => controls.some((x) => x.type === "auth" && x.success),
        5000,
      ),
      "normal WS authentication",
    );
    const requestId = randomUUID();
    ws.send(JSON.stringify({ type: "scope_marker", requestId }));
    assert.ok(
      await waitFor(
        () =>
          controls.some(
            (x) => x.type === "scope_ready" && x.requestId === requestId,
          ),
        5000,
      ),
      "real scope checkpoint",
    );
    return controls.find(
      (x) => x.type === "scope_ready" && x.requestId === requestId,
    )!.startSeq!;
  })();
  return {
    ws,
    receipts,
    controls,
    errors,
    ready,
    get lastSeq() {
      return lastSeq;
    },
    get localPort() {
      return localPort;
    },
    get closed() {
      return closed;
    },
    get bytes() {
      return bytes;
    },
    snapshot() {
      return {
        localPort,
        receipts: [...receipts],
        controls: [...controls],
        errors: [...errors],
        bytes,
        lastSeq,
        closed,
        cleanupAt,
      };
    },
    async cleanup() {
      cleanupAt = performance.now();
      if (ws.readyState !== WebSocket.CLOSED) {
        ws.terminate();
        await once(ws, "close");
      }
    },
  };
}

test(
  "STREAM default configuration: public HTTP/WS auth and bounded real-reader experiment (measurement-only)",
  { timeout: 250000, skip: process.env.STREAM_EXPERIMENT !== "1" },
  async (t) => {
    const temporary = await temporaryDatabase(t);
    await migrate(temporary.db);
    const dir = await mkdtemp(join(tmpdir(), "kapibala-stream-"));
    temporary.onCleanup(() => rm(dir, { recursive: true, force: true }));
    const gateway = createGatewaySimulator(join(dir, "gateway.json"));
    const agent = createAgentSimulator(join(dir, "agent.json"));
    temporary.onCleanup(() => gateway.close());
    temporary.onCleanup(() => agent.close());
    const gatewayUrl = await gateway.listen({ host: "127.0.0.1", port: 0 });
    const agentUrl = await agent.listen({ host: "127.0.0.1", port: 0 });
    const port = await freePort();
    const address = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/src/main.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: temporary.url,
          GATEWAY_URL: gatewayUrl,
          AGENT_URL: agentUrl,
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const transport: Record<string, unknown>[] = [];
    let carry = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-32768);
    });
    child.stdout.on("data", (chunk) => {
      carry += chunk.toString();
      const lines = carry.split("\n");
      carry = lines.pop()!;
      for (const line of lines) {
        try {
          const x = JSON.parse(line);
          if (String(x.component).startsWith("realtime-")) transport.push(x);
        } catch {
          /* other startup output */
        }
      }
    });
    temporary.onCleanup(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        if (
          !(await waitFor(
            () => child.exitCode !== null || child.signalCode !== null,
            8000,
          ))
        )
          child.kill("SIGKILL");
        await waitFor(
          () => child.exitCode !== null || child.signalCode !== null,
          3000,
        );
      }
    });
    const readers: ReturnType<typeof openReader>[] = [];
    temporary.onCleanup(async () => {
      await Promise.all(readers.map((r) => r.cleanup()));
    });
    const evidence: Record<string, unknown> = {
      profile,
      startedAt: new Date().toISOString(),
      databaseName: new URL(temporary.url).pathname,
      stateDirectory: dir,
      childPid: child.pid,
      address,
      gatewayUrl,
      agentUrl,
      transport,
      readerPid: process.pid,
      sourceSha256: Object.fromEntries(
        await Promise.all(
          [
            "apps/server/src/core/realtime.ts",
            "apps/server/src/core/socket-sender.ts",
            "tests/integration/stream-default-observation.test.ts",
          ].map(async (path) => [
            path,
            createHash("sha256")
              .update(await readFile(path))
              .digest("hex"),
          ]),
        ),
      ),
    };
    const expected = new Map<string, { textSha256: string; sentAt: string }>();
    let failure: unknown;
    try {
      assert.ok(
        await waitFor(async () => {
          try {
            return (await fetch(`${address}/api/health`)).ok;
          } catch {
            return false;
          }
        }, 10000),
        `normal main startup: ${stderr}`,
      );
      async function http(
        path: string,
        body?: unknown,
        token?: string,
        base = address,
      ) {
        const response = await fetch(`${base}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.any([t.signal, AbortSignal.timeout(10000)]),
        });
        const result = await response.json();
        assert.ok(
          response.ok,
          `${path}: ${response.status} ${JSON.stringify(result)}`,
        );
        return result;
      }
      const login = await http("/api/auth/login", {
        username: "admin",
        password: "admin",
      });
      const token = login.accessToken as string;
      await http("/api/accounts/account-1/connect", {}, token);
      await http("/api/accounts/account-2/connect", {}, token);
      const job = await http(
        "/api/groups",
        { creatorAccountId: "account-1", memberAccountIds: ["account-2"] },
        token,
      );
      assert.ok(
        await waitFor(
          async () =>
            (await http(`/api/jobs/${job.jobId}`, undefined, token)).status ===
            "finished",
          10000,
        ),
      );
      const [group] = await http("/api/groups", undefined, token);
      assert.equal(group.agentEnabled, false);
      const bad = new WebSocket(`${address.replace("http:", "ws:")}/ws`);
      bad.on("error", () => {});
      temporary.onCleanup(async () => {
        if (bad.readyState !== WebSocket.CLOSED) {
          bad.terminate();
          await once(bad, "close");
        }
      });
      const badClosed = once(bad, "close");
      await once(bad, "open");
      bad.send(
        JSON.stringify({ type: "auth", accessToken: "invalid-owned-token" }),
      );
      const [badCode] = await badClosed;
      assert.equal(badCode, 4401);
      evidence.invalidAuthCloseCode = badCode;
      const slow = openReader(address, token);
      readers.push(slow);
      const healthy = openReader(address, token);
      readers.push(healthy);
      const [slowCheckpoint, healthyCheckpoint] = await Promise.all([
        slow.ready,
        healthy.ready,
      ]);
      const pausedAt = performance.now();
      slow.ws.pause();
      assert.equal(slow.ws.isPaused, true);
      evidence.pause = {
        at: new Date().toISOString(),
        monotonicMs: pausedAt,
        checkpoint: slowCheckpoint,
        healthyCheckpoint,
        slow: slow.snapshot(),
        healthyPort: healthy.localPort,
      };
      const closeRequest = () =>
        transport.find(
          (x) => x.peerPort === slow.localPort && x.kind === "close-requested",
        );
      const targets = (reader: typeof slow) =>
        reader.receipts.filter((x) => x.msgId && expected.has(x.msgId));
      let next = 0;
      async function inject(count: number) {
        const batch = Array.from({ length: count }, () => {
          const msgId = `stream-${String(next++).padStart(6, "0")}-${randomUUID()}`;
          const text = `legal stream ${msgId} `.padEnd(profile.textBytes, "x");
          const sentAt = new Date().toISOString();
          return {
            groupId: group.gatewayGroupId,
            msgId,
            senderPlatformUserId: "external-stream-reader",
            text,
            sentAt,
          };
        });
        const results = await Promise.all(
          batch.map(async (message) => {
            const result = await http(
              "/__control/message",
              message,
              undefined,
              gatewayUrl,
            );
            assert.equal(result.msgId, message.msgId);
            expected.set(message.msgId, {
              textSha256: createHash("sha256")
                .update(message.text)
                .digest("hex"),
              sentAt: message.sentAt,
            });
          }),
        );
        return results.length;
      }
      const injectionStart = performance.now();
      while (
        expected.size < profile.maxMessages &&
        performance.now() - injectionStart < profile.injectionMs &&
        !closeRequest()
      ) {
        await inject(
          Math.min(profile.batch, profile.maxMessages - expected.size),
        );
        assert.deepEqual(healthy.errors, []);
        if (expected.size % 512 === 0)
          t.diagnostic(
            JSON.stringify({
              stage: "inject",
              injected: expected.size,
              healthy: targets(healthy).length,
              actualHealthyWsPayloadBytes: healthy.bytes,
              elapsedMs: performance.now() - injectionStart,
            }),
          );
      }
      evidence.injection = {
        elapsedMs: performance.now() - injectionStart,
        countBeforeTail: expected.size,
        endAt: new Date().toISOString(),
      };
      const healthyComplete = await waitFor(
        () => targets(healthy).length === expected.size,
        profile.healthyDrainMs,
      );
      await waitFor(() => Boolean(closeRequest()), profile.closeObservationMs);
      evidence.healthyCompleteBeforeTail = healthyComplete;
      evidence.productCloseRequest = closeRequest() ?? null;
      evidence.outcome =
        "BLOCKED: bounded load did not establish product slow-reader closure";
      if (closeRequest() && healthyComplete) {
        assert.ok(
          ["send-timeout", "buffer-high-water"].includes(
            String(closeRequest()!.trigger),
          ),
        );
        assert.equal(closeRequest()!.code, 1013);
        assert.ok(
          await waitFor(
            () =>
              transport.some(
                (x) => x.peerPort === slow.localPort && x.kind === "closed",
              ),
            5000,
          ),
        );
        await inject(profile.postCloseTail);
        assert.ok(
          await waitFor(
            () => targets(healthy).length === expected.size,
            profile.healthyDrainMs,
          ),
        );
        evidence.beforeResume = slow.snapshot();
        slow.ws.resume();
        assert.ok(
          await waitFor(() => Boolean(slow.closed), profile.oldReaderDrainMs),
          "product-closed old reader drains to its actual close",
        );
        const receivedCursor = slow.lastSeq || slowCheckpoint;
        const prefix = targets(slow);
        assert.ok(
          prefix.length < expected.size,
          "a real nonempty receipt gap exists",
        );
        const replay = openReader(address, token, receivedCursor);
        readers.push(replay);
        await replay.ready;
        assert.ok(
          await waitFor(
            () => prefix.length + targets(replay).length === expected.size,
            profile.replayMs,
          ),
        );
        await delay(profile.duplicateObservationMs);
        const combined = [...prefix, ...targets(replay)];
        assert.equal(new Set(combined.map((x) => x.msgId)).size, expected.size);
        assert.deepEqual(
          new Set(combined.map((x) => x.msgId)),
          new Set(expected.keys()),
        );
        assert.ok(
          combined.every((x, i) => i === 0 || x.seq > combined[i - 1]!.seq),
        );
        evidence.replay = {
          sinceSeq: receivedCursor,
          prefixCount: prefix.length,
          gapCount: expected.size - prefix.length,
          reader: replay.snapshot(),
        };
        evidence.outcome =
          "DEVELOPMENT_OBSERVED: product close, healthy set and actual-cursor replay; independent QA acceptance remains separate";
      }
      assert.deepEqual(healthy.errors, []);
      assert.deepEqual(slow.errors, []);
      for (const reader of readers) {
        for (const receipt of targets(reader)) {
          assert.equal(receipt.type, "message");
          assert.equal(receipt.groupId, group.id);
          assert.equal(receipt.isOwn, false);
        }
      }
      if (healthyComplete)
        assert.deepEqual(
          new Set(targets(healthy).map((x) => x.msgId)),
          new Set(expected.keys()),
        );
      const history = new Map<string, string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const result = await http(
          `/api/groups/${group.id}/messages?limit=${profile.historyLimit}${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`,
          undefined,
          token,
        );
        for (const item of result.items)
          if (expected.has(item.msgId))
            history.set(
              item.msgId,
              createHash("sha256").update(item.text).digest("hex"),
            );
        cursor = result.nextCursor ?? undefined;
        pages++;
      } while (cursor && pages < profile.maxHistoryPages);
      evidence.history = {
        pages,
        exhausted: !cursor,
        count: history.size,
        hashes: Object.fromEntries(history),
      };
      if (healthyComplete) {
        assert.equal(history.size, expected.size);
        for (const [id, value] of expected)
          assert.equal(history.get(id), value.textSha256);
      }
      evidence.slow = slow.snapshot();
      evidence.healthy = healthy.snapshot();
      evidence.expected = Object.fromEntries(expected);
      evidence.healthyClosedDuringExperiment = healthy.closed ?? null;
      assert.equal(
        healthy.closed,
        undefined,
        "healthy reader remains connected before developer cleanup",
      );
      assert.ok((await http("/api/health")).ok);
      const configured = transport.filter((x) => x.kind === "configured");
      assert.ok(configured.length >= 3);
      for (const x of configured)
        assert.deepEqual(x.limits, {
          maxBufferedBytes: 1048576,
          sendTimeoutMs: 5000,
          closeGraceMs: 1000,
        });
    } catch (error) {
      failure = error;
      evidence.failure = String(error);
      throw error;
    } finally {
      evidence.finishedAt = new Date().toISOString();
      evidence.cleanupBeginsAt = performance.now();
      evidence.readersBeforeCleanup = readers.map((r) => r.snapshot());
      let cleanupFailure: unknown;
      try {
        await temporary.close();
      } catch (error) {
        cleanupFailure = error;
        evidence.cleanupFailure = String(error);
      }
      evidence.cleanupFinishedAt = new Date().toISOString();
      evidence.childExit = { code: child.exitCode, signal: child.signalCode };
      evidence.readerCleanup = readers.map((r) => ({
        localPort: r.localPort,
        cleanupAt: r.snapshot().cleanupAt,
        actualClose: r.closed,
      }));
      evidence.stderr = stderr;
      if (process.env.STREAM_EVIDENCE_PATH) {
        const encoded = JSON.stringify(evidence, null, 2) + "\n";
        assert.ok(
          Buffer.byteLength(encoded) <= profile.maxEvidenceBytes,
          "bounded evidence file",
        );
        await writeFile(process.env.STREAM_EVIDENCE_PATH, encoded);
      }
      t.diagnostic(
        JSON.stringify({
          outcome: evidence.outcome,
          expectedCount: expected.size,
          healthyComplete: evidence.healthyCompleteBeforeTail,
          close: evidence.productCloseRequest,
          failure: failure ? String(failure) : null,
          databaseName: new URL(temporary.url).pathname,
          childPid: child.pid,
          stateDirectory: dir,
        }),
      );
      if (cleanupFailure && !failure) throw cleanupFailure;
    }
  },
);
