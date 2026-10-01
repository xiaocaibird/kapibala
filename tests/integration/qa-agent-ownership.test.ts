import assert from "node:assert/strict";
import { fork, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";
import type { LifecycleFact } from "../../apps/server/src/core/test-lifecycle-observer.js";
import {
  automationFixture,
  deferred,
  end,
  until,
} from "../support/core-automation-fixture.js";

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
async function worker(
  onCleanup: (cleanup: () => Promise<void>) => void,
  databaseUrl: string,
  remoteUrl: string,
) {
  const child = fork(
    new URL("../support/agent-ownership-worker.ts", import.meta.url),
    [],
    {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        GATEWAY_URL: remoteUrl,
        AGENT_URL: remoteUrl,
        TEST_SOURCE_REVISION: revision,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let output = "";
  child.stdout!.on("data", (s) => {
    output += s;
  });
  child.stderr!.on("data", (s) => {
    output += s;
  });
  let ready: { ready: true; pid: number; apiUrl: string } | undefined;
  const waiting = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  child.on("message", (raw) => {
    const value = raw as {
      ready?: true;
      pid: number;
      apiUrl: string;
      id: string;
      result: unknown;
      error?: string;
    };
    if (value.ready)
      ready = { ready: true, pid: value.pid, apiUrl: value.apiUrl };
    const pending = waiting.get(value.id);
    if (pending) {
      waiting.delete(value.id);
      value.error
        ? pending.reject(new Error(value.error))
        : pending.resolve(value.result);
    }
  });
  child.on("exit", () => {
    for (const p of waiting.values())
      p.reject(new Error(`worker exited: ${output}`));
    waiting.clear();
  });
  async function command(action: string, runId?: string): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`worker command timed out: ${action}; ${output}`));
      }, 10000);
      waiting.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      child.send({ id, action, runId });
    });
  }
  onCleanup(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        await command("close");
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const done = once(child, "exit");
          child.kill("SIGKILL");
          await done;
        }
      }
    }
  });
  await until(async () => !!ready, 10000);
  return {
    pid: ready!.pid,
    command,
    snapshot: async (runId: string) =>
      (await command("snapshot", runId)) as ObservationSnapshot,
  };
}
const diagnostic = (value: unknown) =>
  JSON.stringify(value, (key, item) =>
    key === "observedOwnerToken"
      ? "[redacted synthetic ownership token]"
      : item,
  );
const locks = (s: ObservationSnapshot) =>
  s.events.filter((e) => e.kind.startsWith("agent-run-lock-"));
function checkChain(s: ObservationSnapshot, status: string) {
  const events = locks(s);
  const result = events.findLast(
    (e) => e.kind === "agent-run-lock-result" && e.lockStatus === status,
  );
  assert.ok(result, JSON.stringify(events));
  const chain = events.filter((e) => e.attemptId === result.attemptId);
  assert.deepEqual(
    chain.map((e) => e.kind),
    status === "executed"
      ? [
          "agent-run-lock-attempted",
          "agent-run-lock-acquired",
          "agent-run-lock-result",
        ]
      : ["agent-run-lock-attempted", "agent-run-lock-result"],
  );
  assert.equal(result.callbackEntered, status === "executed");
  for (const e of chain) {
    assert.equal(e.runId, (s.correlation as { runId: string }).runId);
    assert.equal(e.groupId, "g");
    assert.equal(e.lockKey, `agent:${e.runId}`);
    assert.equal(e.purpose, "run");
    assert.equal(e.applicationPid, result.applicationPid);
    assert.equal(e.instanceId, result.instanceId);
    assert.equal(typeof e.instanceId, "string");
    assert.equal(e.clockDomain, result.clockDomain);
    assert.equal(typeof e.sourceSeq, "number");
  }
  assert.ok(
    chain.every(
      (e, i) =>
        i === 0 ||
        ((e.monotonicMs as number[])[0]! >=
          (chain[i - 1]!.monotonicMs as number[])[0]! &&
          e.sourceSeq! > chain[i - 1]!.sourceSeq!),
    ),
  );
  return result;
}

test("two real child instances: same-run PG lock refusal, owner completion, then second instance progresses", async (t) => {
  const f = await automationFixture(t);
  const release = deferred();
  f.onCleanup(async () => release.resolve());
  f.handlers.turn = async () => {
    await release.promise;
    return end();
  };
  const a = await worker(f.onCleanup, f.url, f.remote.listeningOrigin);
  const b = await worker(f.onCleanup, f.url, f.remote.listeningOrigin);
  assert.notEqual(a.pid, b.pid);
  assert.notEqual(a.pid, process.pid);
  await f.inbound();
  await a.command("tick");
  await until(async () => f.turns.length === 1);
  const runId = f.turns[0]!.runId;
  const held = await a.snapshot(runId);
  assert.deepEqual(
    locks(held).map((e) => e.kind),
    ["agent-run-lock-attempted", "agent-run-lock-acquired"],
  );
  const pgLocks = (
    await f.db.query(
      "SELECT pid,locktype,granted,classid::text,objid::text,objsubid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
    )
  ).rows;
  assert.ok(pgLocks.some((l) => l.granted));
  await b.command("tick");
  let denied!: ObservationSnapshot;
  await until(async () => {
    denied = await b.snapshot(runId);
    return locks(denied).some((e) => e.lockStatus === "lock_busy");
  });
  const refusal = checkChain(denied, "lock_busy");
  assert.equal(refusal.applicationPid, b.pid);
  assert.notEqual(refusal.instanceId, locks(held)[0]!.instanceId);
  assert.equal(f.turns.length, 1);
  release.resolve();
  await f.complete(runId);
  let completed!: ObservationSnapshot;
  await until(async () => {
    completed = await a.snapshot(runId);
    return locks(completed).some((e) => e.lockStatus === "executed");
  });
  checkChain(completed, "executed");
  // A later eligible run still progresses in the formerly refused process.
  await f.inbound("next independent trigger");
  await b.command("tick");
  await until(async () => f.turns.length === 2);
  const nextId = f.turns[1]!.runId;
  assert.notEqual(nextId, runId);
  await f.complete(nextId);
  let next!: ObservationSnapshot;
  await until(async () => {
    next = await b.snapshot(nextId);
    return locks(next).some((e) => e.lockStatus === "executed");
  });
  checkChain(next, "executed");
  t.diagnostic(
    diagnostic({
      sample: "two-real-instances",
      revision,
      pgLocks,
      held,
      denied,
      completed,
      next,
      httpTurns: f.turns.length,
    }),
  );
});

test("real worker admission capacity is distinct from same-run PG contention; release permits that run", async (t) => {
  const f = await automationFixture(t);
  const b = await worker(f.onCleanup, f.url, f.remote.listeningOrigin);
  assert.deepEqual(await b.command("fill-capacity"), { admitted: 8 });
  await f.inbound();
  await b.command("tick");
  const runId = (await f.db.query<{ id: string }>("SELECT id FROM agent_runs"))
    .rows[0]!.id;
  let denied!: ObservationSnapshot;
  await until(async () => {
    denied = await b.snapshot(runId);
    return locks(denied).some((e) => e.lockStatus === "capacity_unavailable");
  });
  checkChain(denied, "capacity_unavailable");
  assert.equal(f.turns.length, 0);
  assert.equal(
    locks(denied).some((e) => e.lockStatus === "lock_busy"),
    false,
  );
  await b.command("release-capacity");
  // Independently hold this exact key on a PostgreSQL session after capacity is
  // available. The same worker must now report contention, not capacity refusal.
  const owner = await f.db.pool.connect();
  let busy!: ObservationSnapshot;
  try {
    await owner.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
      `agent:${runId}`,
    ]);
    await b.command("tick");
    await until(async () => {
      busy = await b.snapshot(runId);
      return locks(busy).some((e) => e.lockStatus === "lock_busy");
    });
    checkChain(busy, "lock_busy");
    assert.equal(f.turns.length, 0);
  } finally {
    await owner.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
      `agent:${runId}`,
    ]);
    owner.release();
  }
  await b.command("tick");
  await f.complete(runId);
  let completed!: ObservationSnapshot;
  await until(async () => {
    completed = await b.snapshot(runId);
    return locks(completed).some((e) => e.lockStatus === "executed");
  });
  checkChain(completed, "executed");
  assert.equal(f.turns.length, 1);
  t.diagnostic(
    diagnostic({
      sample: "real-capacity-release",
      revision,
      denied,
      busy,
      completed,
      httpTurns: f.turns.length,
    }),
  );
});

test("run-lock observation exceptions cannot prevent real callback execution", async (t) => {
  const events: LifecycleFact[] = [];
  const f = await automationFixture(t, undefined, undefined, (ctx) => {
    ctx.testLifecycleObserver = {
      record(fact) {
        events.push(fact);
        if (fact.kind.startsWith("agent-run-lock-"))
          throw new Error("test observer failure");
      },
    };
  });
  await f.inbound();
  const runId = await f.start();
  assert.equal((await f.complete(runId)).status, "finished");
  await until(async () =>
    events.some((e) => e.kind === "agent-run-lock-result"),
  );
  assert.equal(
    events.find((e) => e.kind === "agent-run-lock-result")!.lockStatus,
    "executed",
  );
  assert.equal(f.turns.length, 1);
});

test("paused recovery is not a fabricated ownership attempt; paused cancellation keeps its real lock path", async (t) => {
  const events: LifecycleFact[] = [];
  const f = await automationFixture(t, undefined, undefined, (ctx) => {
    ctx.testLifecycleObserver = { record: (e) => events.push(e) };
  });
  const id = randomUUID();
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,recovery_note) VALUES($1,'g','unknown external effect')",
    [id],
  );
  await f.automation.tick();
  assert.equal(
    events.some((e) => e.kind.startsWith("agent-run-lock-")),
    false,
  );
  assert.equal(f.turns.length, 0);
  await f.db.query("UPDATE agent_runs SET cancel_requested=true WHERE id=$1", [
    id,
  ]);
  await f.automation.tick();
  const result = events.find((e) => e.kind === "agent-run-lock-result")!;
  assert.equal(result.purpose, "paused-cancellation");
  assert.equal(result.lockStatus, "executed");
  const run = await f.readRun(id);
  assert.equal(run.status, "cancelled");
  assert.equal(run.recovery_note, "unknown external effect");
  assert.equal(f.turns.length, 0);
});
