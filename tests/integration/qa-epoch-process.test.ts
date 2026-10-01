import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import type { Binding } from "../../scripts/qa-capacity/protocol.js";
import type { ActivityObservationSnapshot } from "../../scripts/qa-runtime-observation/activity-witness.js";
import {
  joinKilledActivityEpochs,
  type ActivityCapture,
  type KilledProcessObservation,
} from "../../scripts/qa-runtime-observation/epoch-evidence.js";
import {
  automationFixture,
  delay,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

async function scenario(
  t: TestContext,
  budgetProfile: boolean,
  lateObservation = false,
) {
  const f = await automationFixture(t);
  await f.app.close();
  const parentClockDomain = `parent-performance:${process.pid}:${randomUUID()}`;
  const turnLedger: {
    ordinal: number;
    receivedMs: number;
    completedMs?: number;
  }[] = [];
  f.handlers.turn = async () => {
    const ordinal = f.turns.length;
    const row = {
      ordinal,
      receivedMs: performance.now(),
    } as (typeof turnLedger)[number];
    turnLedger.push(row);
    await delay(budgetProfile ? 7000 : 650);
    row.completedMs = performance.now();
    return !budgetProfile && ordinal > 1
      ? end("continued after durable read")
      : tool(`read-${ordinal}`, "get_recent_messages", { limit: ordinal });
  };
  const children: ChildProcess[] = [];
  async function terminate(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  f.onCleanup(async () => {
    await Promise.all(children.map(terminate));
  });
  async function launch() {
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      ACTIVITY_TEST_DATABASE_URL: f.url,
      ACTIVITY_TEST_REMOTE_URL: f.remote.listeningOrigin,
    };
    delete childEnvironment.GEMINI_API_KEY;
    delete childEnvironment.GOOGLE_API_KEY;
    const child = fork(
      fileURLToPath(
        new URL("../support/activity-witness-process.ts", import.meta.url),
      ),
      [],
      {
        execArgv: ["--import", "tsx"],
        env: childEnvironment,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    children.push(child);
    let binding: Binding | undefined;
    let stderr = "";
    const replies = new Map<
      string,
      (message: { ok: boolean; result: unknown; error?: string }) => void
    >();
    child.stderr!.on("data", (data) => {
      stderr += String(data);
    });
    child.on(
      "message",
      (message: {
        type?: string;
        binding?: Binding;
        key: string;
        ok: boolean;
        result: unknown;
        error?: string;
      }) => {
        if (message.type === "ready") binding = message.binding;
        else replies.get(message.key)?.(message);
      },
    );
    await until(async () => {
      assert.equal(child.exitCode, null, stderr);
      return Boolean(binding);
    }, 10000);
    function command(
      command: string,
      args: Record<string, unknown> = {},
    ): Promise<ActivityObservationSnapshot> {
      const key = randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          replies.delete(key);
          reject(new Error(`IPC timeout: ${command}`));
        }, 10000);
        replies.set(key, (message) => {
          clearTimeout(timeout);
          replies.delete(key);
          if (message.ok)
            resolve(message.result as ActivityObservationSnapshot);
          else reject(new Error(message.error));
        });
        child.send({ key, command, ...args });
      });
    }
    async function capture(leaseId: string): Promise<ActivityCapture> {
      const before = performance.now();
      const snapshot = await command("snapshot", { leaseId });
      const after = performance.now();
      return {
        parentClockDomain,
        transport: "direct-app-ipc",
        requestWindowMs: [before, after],
        snapshot,
      };
    }
    return { child, binding: binding!, command, capture };
  }
  const first = await launch();
  await f.inbound();
  await first.command("tick");
  await until(async () => f.turns.length === 1);
  const runId = f.turns[0]!.runId;
  if (budgetProfile) await delay(17000);
  const heldId = randomUUID();
  await first.command("arm", {
    leaseId: heldId,
    runId,
    mode: "hold-safe-activity-boundary",
    ttlMs: 120000,
  });
  let beforeKill!: ActivityCapture;
  await until(async () => {
    beforeKill = await first.capture(heldId);
    return (
      beforeKill.snapshot.state === "held" &&
      Boolean(beforeKill.snapshot.events.at(-1)!.lastSuccessfulSample)
    );
  }, 10000);
  await delay(155);
  beforeKill = await first.capture(heldId);
  const heldRun = await f.readRun(runId);
  assert.equal(heldRun.inflight_turn, false);
  assert.equal(heldRun.recovery_note, null);
  assert.ok((await f.steps(runId)).every((step) => step.state === "complete"));
  assert.ok(turnLedger.every((entry) => entry.completedMs !== undefined));
  const actualAppPid = first.binding.pid;
  assert.equal(actualAppPid, first.child.pid);
  assert.equal(
    beforeKill.snapshot.clockObservation.applicationPid,
    actualAppPid,
  );
  const exited = once(first.child, "exit");
  const signalRequestedBeforeMs = performance.now();
  assert.equal(first.child.kill("SIGKILL"), true);
  const exitSignal = await exited;
  const processExitObservedAfterMs = performance.now();
  assert.deepEqual(exitSignal, [null, "SIGKILL"]);
  assert.ok(Date.now() < Date.parse(beforeKill.snapshot.expiresAt));
  const killed: KilledProcessObservation = {
    parentClockDomain,
    applicationPid: actualAppPid,
    signal: "SIGKILL",
    signalRequestedBeforeMs,
    processExitObservedAfterMs,
    exitObservation: "direct-child-exit",
  };
  const afterExit = await f.readRun(runId);
  const persistedAfterExitMs = Number(afterExit.active_ms);
  const downtime = budgetProfile ? 5000 : 200;
  await delay(downtime);
  const beforeRestart = await f.readRun(runId);
  assert.equal(
    Number(beforeRestart.active_ms),
    persistedAfterExitMs,
    "Stopped time must not advance the persisted ledger",
  );
  const startupBefore = performance.now();
  const second = await launch();
  const startupAfter = performance.now();
  const resumedId = randomUUID();
  if (!lateObservation) {
    await second.command("arm", {
      leaseId: resumedId,
      runId,
      mode: "observe-activity",
      ttlMs: 120000,
    });
  }
  await second.command("tick");
  await until(
    async () => (await f.readRun(runId)).status !== "running",
    budgetProfile ? 55000 : 5000,
  );
  if (lateObservation) {
    await second.command("arm", {
      leaseId: resumedId,
      runId,
      mode: "observe-activity",
      ttlMs: 120000,
    });
  }
  const afterRecovery = await second.capture(resumedId);
  const terminal = await f.readRun(runId);
  assert.equal(terminal.recovery_note, null);
  assert.equal(terminal.status, budgetProfile ? "failed" : "finished");
  if (budgetProfile) assert.equal(terminal.end_reason, "wall_clock");
  assert.equal(
    afterRecovery.snapshot.events.at(-1)!.includesUnsavedTail,
    false,
  );
  assert.equal(
    afterRecovery.snapshot.events.at(-1)!.activeElapsedMs,
    undefined,
  );
  assert.equal(f.gatewayRequests.length, 0);
  if (lateObservation) {
    assert.deepEqual(afterRecovery.snapshot.events.at(-1)!.epochObservation, {
      continuous: false,
      startSource: "unwitnessed",
    });
    assert.throws(
      () =>
        joinKilledActivityEpochs({
          beforeKill,
          killed,
          afterRecovery,
          persistedAfterExitMs,
        }),
      /late reconstruction is insufficient/,
    );
    t.diagnostic(
      "Actual recovered run completed before lease: late terminal reconstruction rejected, not counted as zero activity",
    );
    return;
  }
  const combined = joinKilledActivityEpochs({
    beforeKill,
    killed,
    afterRecovery,
    persistedAfterExitMs,
  });
  assert.equal(combined.epochIds.length, 2);
  assert.ok(combined.lastAcknowledgedSampleToExitMs[1] > 0);
  assert.ok(combined.excludedBetweenEpochsMs[0] >= downtime);
  assert.ok(combined.activeElapsedMs[0] > (budgetProfile ? 59000 : 1000));
  const evidence = {
    format: "engineering-cross-epoch-evidence/1",
    measuredAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    profile: budgetProfile
      ? "7s-turns-17s-before-safe-kill-5s-stopped-60s-original-budget"
      : "short-safe-read-recovery",
    beforeKill,
    killed,
    persistedAfterExitMs,
    beforeRestartPersistedMs: Number(beforeRestart.active_ms),
    startupWindowMs: [startupBefore, startupAfter],
    afterRecovery,
    turnLedger,
    combined,
    publicResult: {
      status: terminal.status,
      stopReason: terminal.end_reason,
      recoveryNote: terminal.recovery_note,
      persistedActiveMs: Number(terminal.active_ms),
      gatewayOperations: f.gatewayRequests,
    },
    boundaries: [
      "No business budget or QA assertion changed",
      "Old incomplete QA evidence is not repaired retroactively",
      "Per-process recovered includesUnsavedTail remains false",
      "The lower zero bound does not assert that no tail was lost",
      "Same-host stable-rate monotonic mapping; not an arbitrary power-loss or multi-owner guarantee",
    ],
  };
  // A real owner token must not enter the committed developer evidence.
  const serialized = JSON.stringify(
    evidence,
    (key, value) => (key === "observedOwnerToken" ? "<redacted>" : value),
    2,
  );
  if (process.env.EPOCH_EVIDENCE_DIRECTORY) {
    await mkdir(process.env.EPOCH_EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(
      join(
        process.env.EPOCH_EVIDENCE_DIRECTORY,
        budgetProfile ? "minute-profile.json" : "short-profile.json",
      ),
      serialized + "\n",
    );
  }
  t.diagnostic(
    JSON.stringify({
      profile: evidence.profile,
      combined,
      publicResult: evidence.publicResult,
    }),
  );
}

test(
  "real SIGKILL cross-epoch evidence includes process-exit tail and excludes stopped time",
  { timeout: 20000 },
  async (t) => scenario(t, false),
);
test(
  "original 60-second activity profile produces bounded cross-epoch evidence without changing its acceptance standard",
  { timeout: 100000 },
  async (t) => scenario(t, true),
);

test(
  "recovery completing before a lease cannot manufacture a zero-length new epoch",
  { timeout: 20000 },
  async (t) => scenario(t, false, true),
);
