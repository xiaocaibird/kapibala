import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import {
  automationFixture,
  delay,
  end,
  until,
} from "../support/core-automation-fixture.js";

for (const timeoutMs of [10000, 15000]) {
  test(
    `CG08 timing: configured ${timeoutMs}ms turn timeout rejects a genuinely late HTTP response`,
    { skip: process.env.CORE_AUTOMATION_TIMING_TESTS !== "1" },
    async (t) => {
      const f = await automationFixture(t, timeoutMs);
      let began = 0;
      let nextAt = 0;
      let lateReturned = false;
      f.handlers.turn = async () => {
        if (f.turns.length === 1) {
          began = performance.now();
          await delay(timeoutMs + 250);
          lateReturned = true;
          return end("late response must be discarded");
        }
        nextAt = performance.now();
        return end("valid next turn");
      };
      await f.inbound();
      const id = await f.start();
      const run = await f.complete(id, timeoutMs + 3000);
      const elapsed = nextAt - began;
      assert.ok(
        elapsed >= timeoutMs - 100 && elapsed < timeoutMs + 2000,
        `actual timeout ${elapsed}ms`,
      );
      assert.equal(run.status, "finished");
      assert.equal(run.summary, "valid next turn");
      assert.equal(run.protocol_errors, 0);
      assert.equal(f.turns.length, 2);
      assert.deepEqual(
        (await f.steps(id)).map((step) => [step.kind, step.error_code]),
        [
          ["protocol_error", "TURN_TIMEOUT"],
          ["final", null],
        ],
      );
      assert.deepEqual(
        run.history.map((message) => [message.role, message.content[0]!.type]),
        [
          ["user", "text"],
          ["user", "text"],
          ["assistant", "text"],
        ],
      );
      await until(async () => lateReturned, 3000);
      await delay(50);
      assert.deepEqual(
        await f.readRun(id),
        run,
        "late HTTP completion must not alter saved history or summary",
      );
      assert.equal((await f.steps(id)).length, 2);
      assert.equal(f.audits.length, 0);
      assert.equal(f.gatewayRequests.length, 0);
      t.diagnostic(
        JSON.stringify({
          configuredTimeoutMs: timeoutMs,
          observedTimeoutMs: elapsed,
          lateResponseObserved: lateReturned,
        }),
      );
    },
  );
}

test("CG08: hard termination preserves sampled activity, excludes downtime, and exposes a tail beyond one sampling interval", async (t) => {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  t.diagnostic(
    `Independent database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await migrate(db);
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
  );
  await db.query("INSERT INTO agent_runs(id,group_id) VALUES('clock-run','g')");
  const children: ChildProcess[] = [];
  async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGKILL") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill(signal);
    await exited;
  }
  temporary.onCleanup(async () => {
    await Promise.all(children.map((child) => stop(child)));
  });
  async function launch() {
    const messages: { type: string; at: number }[] = [];
    let stderr = "";
    const child = fork(
      fileURLToPath(
        new URL("../support/activity-clock-process.ts", import.meta.url),
      ),
      [],
      {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, CLOCK_TEST_DATABASE_URL: temporary.url },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    children.push(child);
    child.stderr!.on("data", (data) => {
      stderr += String(data);
    });
    child.on("message", (message) =>
      messages.push(message as { type: string; at: number }),
    );
    await until(async () => {
      assert.equal(child.exitCode, null, stderr);
      return messages.some((message) => message.type === "ready");
    });
    return { child, messages };
  }
  async function read() {
    return (
      await db.query<{ active_ms: string; activity_updated_at: Date }>(
        "SELECT active_ms,activity_updated_at FROM agent_runs WHERE id='clock-run'",
      )
    ).rows[0]!;
  }
  const first = await launch();
  await until(async () => Number((await read()).active_ms) >= 400);
  first.child.send("block");
  await until(async () =>
    first.messages.some((message) => message.type === "blocked"),
  );
  await delay(50);
  const sampled = await read();
  await delay(1100);
  const killedAt = Date.now();
  await stop(first.child);
  const afterKill = await read();
  assert.deepEqual(afterKill, sampled);
  const lostTail = killedAt - sampled.activity_updated_at.getTime();
  assert.ok(lostTail >= 1000, `unsampled online tail ${lostTail}ms`);
  await delay(700);
  const restartedAt = Date.now();
  const second = await launch();
  const restored = await read();
  assert.ok(restored.activity_updated_at.getTime() >= restartedAt);
  const billedOnRestore =
    Number(restored.active_ms) - Number(sampled.active_ms);
  assert.ok(
    billedOnRestore >= 0 && billedOnRestore < 300,
    `recovery charged ${billedOnRestore}ms`,
  );
  await delay(550);
  const resumed = await read();
  assert.ok(
    Number(resumed.active_ms) > Number(restored.active_ms),
    "online sampling must resume after the new base commits",
  );
  const exited = once(second.child, "exit");
  second.child.send("close");
  const [code] = await exited;
  assert.equal(code, 0);
  t.diagnostic(
    JSON.stringify({
      sampledActiveMs: Number(sampled.active_ms),
      unbilledOnlineTailMs: lostTail,
      actualDowntimeMs: restartedAt - killedAt,
      billedOnRestoreMs: billedOnRestore,
      resumedActiveMs: Number(resumed.active_ms),
    }),
  );
});
