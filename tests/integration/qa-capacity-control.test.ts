import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { test } from "node:test";
import { capacityFixture } from "../support/capacity-control-fixture.js";
import { delay, until } from "../support/core-automation-fixture.js";
import type { Snapshot } from "../../scripts/qa-capacity/protocol.js";

test("DC01 normal production main ignores test token and never opens a capacity bridge", async (t) => {
  const f = await capacityFixture(t, true);
  assert.deepEqual(await readdir(f.directory), []);
  assert.equal((await f.capabilities()).status, 409);
  const response = await fetch(
    f.target().apiUrl + "/qa/capacity/v1/capabilities",
  );
  assert.notEqual(response.status, 200);
});

test("DC02 real SUT holders, ownership rejects, immutable lease identity and independent release", async (t) => {
  const f = await capacityFixture(t);
  const capabilities = await f.capabilities();
  assert.equal(capabilities.status, 200, JSON.stringify(capabilities.value));
  assert.equal(
    (capabilities.value as { binding: { observedOwnerToken: string } }).binding
      .observedOwnerToken,
    f.token,
  );
  for (const target of [
    { ...f.target(), revision: "0".repeat(40) },
    { ...f.target(), pid: process.pid },
    { ...f.target(), apiUrl: f.controller.listeningOrigin },
  ])
    assert.equal((await f.capabilities(target)).status, 409);
  const rejectedId = randomUUID();
  assert.equal(
    (await f.request("PUT", `/qa/capacity/v1/leases/${rejectedId}`, f.body()))
      .status,
    409,
  );
  assert.equal(
    (await f.request("DELETE", `/qa/capacity/v1/leases/${rejectedId}`)).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        "PUT",
        `/qa/capacity/v1/leases/${randomUUID()}`,
        f.body("hold-admission-capacity", 120001),
      )
    ).status,
    400,
  );
  await f.prepare();
  const first = await f.hold();
  assert.equal(first.snapshot.events[0]!.kind, "capacity-held");
  assert.equal(
    first.snapshot.events[0]!.holderKeys!.length,
    7,
    "One actual Agent holder leaves seven slots in this version",
  );
  const replay = await f.request(
    "PUT",
    `/qa/capacity/v1/leases/${first.id}`,
    first.input,
  );
  assert.deepEqual(replay.value, first.snapshot);
  assert.equal(
    (
      await f.request("PUT", `/qa/capacity/v1/leases/${first.id}`, {
        ...first.input,
        ttlMs: 9999,
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request("PUT", `/qa/capacity/v1/leases/${randomUUID()}`, f.body()))
      .status,
    409,
  );
  assert.equal(
    (await f.request("DELETE", `/qa/capacity/v1/leases/${randomUUID()}`))
      .status,
    404,
  );
  assert.equal((await f.snapshot(first.id)).state, "held");
  const malformed = await fetch(
    `${f.controller.listeningOrigin}/qa/capacity/v1/leases/${first.id}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );
  assert.equal(malformed.status, 400);
  assert.equal((await f.snapshot(first.id)).state, "held");
  f.auditResponse.resolve();
  await until(async () =>
    (await f.snapshot(first.id)).events.some(
      (event) => event.kind === "admission-refused",
    ),
  );
  const refused = await f.snapshot(first.id);
  const event = refused.events.find(
    (event) => event.kind === "admission-refused",
  )!;
  assert.equal(event.callbackEntered, false);
  assert.equal(event.remoteRequestCount, 0);
  assert.equal(f.kicks(), 0);
  await until(async () =>
    (await f.snapshot(first.id)).events.some(
      (event) => event.kind === "ready-persisted",
    ),
  );
  const released = await f.snapshot(first.id, "DELETE");
  assert.equal(released.state, "released");
  assert.deepEqual(
    released.events.slice(0, refused.events.length),
    refused.events,
  );
  await until(async () => (await f.run()).status === "finished");
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  await until(async () =>
    (await f.snapshot(first.id)).events.some(
      (event) => event.kind === "run-terminal",
    ),
  );
  const final = await f.snapshot(first.id, "DELETE");
  assert.deepEqual(await f.snapshot(first.id, "DELETE"), final);
  const terminal = final.events.find((event) => event.kind === "run-terminal")!;
  assert.equal(terminal.status, "finished");
  assert.ok(terminal.activeElapsedMs![1] > terminal.activeElapsedMs![0]);
  const endedId = randomUUID();
  assert.equal(
    (await f.request("PUT", `/qa/capacity/v1/leases/${endedId}`, f.body()))
      .status,
    409,
  );
  assert.equal(
    (await f.request("DELETE", `/qa/capacity/v1/leases/${endedId}`)).status,
    404,
  );
  f.evidence({
    case: "DC02",
    eventCount: final.events.length,
    refusal: event,
    terminal,
  });
});

test("DC03 lost PUT response remains addressable; TTL and explicit release race preserve history", async (t) => {
  const f = await capacityFixture(t);
  await f.prepare();
  const id = randomUUID();
  const input = f.body("hold-admission-capacity", 800);
  await new Promise<void>((resolve, reject) => {
    const request = httpRequest(
      f.controller.listeningOrigin + `/qa/capacity/v1/leases/${id}`,
      { method: "PUT", headers: { "content-type": "application/json" } },
      (response) => {
        // Deliberately discard the successful response body. Cleanup only knows its UUID.
        response.destroy();
        resolve();
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(input));
  });
  const held = await f.snapshot(id);
  assert.equal(held.state, "held");
  f.auditResponse.resolve();
  await until(async () =>
    (await f.snapshot(id)).events.some(
      (event) => event.kind === "admission-refused",
    ),
  );
  await delay(Math.max(0, Date.parse(held.expiresAt) - Date.now()));
  const [one, two] = await Promise.all([
    f.snapshot(id, "DELETE"),
    f.snapshot(id, "DELETE"),
  ]);
  assert.equal(one.state, "released");
  assert.equal(two.state, "released");
  assert.equal(one.expiresAt, held.expiresAt);
  assert.deepEqual(one.events.slice(0, held.events.length), held.events);
  await until(async () => (await f.run()).status === "finished");
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  f.evidence({
    case: "DC03",
    expiresAt: held.expiresAt,
    final: await f.snapshot(id),
  });
});

test("DC04 exact before-ready crash retains old history and rebinds same API port to new guardian", async (t) => {
  const f = await capacityFixture(t);
  await f.prepare();
  const lease = await f.hold("hold-after-refusal-before-ready");
  f.auditResponse.resolve();
  let held!: Snapshot;
  await until(async () => {
    held = await f.snapshot(lease.id);
    return held.events.some((event) => event.kind === "before-ready-held");
  });
  const refused = held.events.find(
    (event) => event.kind === "admission-refused",
  )!;
  assert.equal(
    held.events.find((event) => event.kind === "before-ready-held")!.attemptId,
    refused.attemptId,
  );
  assert.equal(
    held.events.some((event) => event.kind === "ready-persisted"),
    false,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT state FROM agent_steps WHERE run_id='capacity-run'",
      )
    ).rows[0]!.state,
    "executing",
  );
  assert.equal(f.kicks(), 0);
  const old = f.target();
  await f.kill();
  const released = await f.snapshot(lease.id, "DELETE");
  assert.equal(released.state, "released");
  assert.deepEqual(released.events, held.events);
  await f.start();
  assert.notEqual(f.target().pid, old.pid);
  assert.equal(f.target().apiUrl, old.apiUrl);
  assert.equal((await f.capabilities(old)).status, 409);
  assert.equal((await f.capabilities()).status, 200);
  await until(async () => Boolean((await f.run()).recoveryNote));
  const recovered = await f.run();
  assert.equal(recovered.status, "running");
  assert.ok(recovered.recoveryNote?.includes("kick"));
  await delay(1500);
  assert.equal(f.kicks(), 0);
  assert.equal(f.audits(), 1);
  assert.equal(f.turns(), 1);
  assert.deepEqual(await f.snapshot(lease.id, "DELETE"), released);
  f.evidence({
    case: "DC04-known-product-gap",
    oldGuardian: old.pid,
    newGuardian: f.target().pid,
    held,
    recovered,
    limit:
      "Development reproduction: precise CAP009 crash currently pauses; controller does not repair state. This is not a QA result.",
  });
});

test("DC05 pressure after dispatch holds remaining real slots without attributing a zero-effect refusal", async (t) => {
  const f = await capacityFixture(t);
  f.blockKick();
  f.timeoutKick();
  await f.prepare();
  f.auditResponse.resolve();
  await f.kickEntered.promise;
  const lease = await f.hold();
  assert.equal(
    lease.snapshot.events[0]!.holderKeys!.length,
    6,
    "Agent and dispatched kick already own two slots",
  );
  f.kickResponse.resolve();
  await until(async () => (await f.run()).status === "finished", 6000);
  const snapshot = await f.snapshot(lease.id);
  assert.equal(
    snapshot.events.some((event) => event.kind === "admission-refused"),
    false,
  );
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  await f.snapshot(lease.id, "DELETE");
  f.evidence({
    case: "DC05",
    snapshot,
    kicks: f.kicks(),
    publicRun: await f.run(),
  });
});

test(
  "DC06 real uninterrupted budget reports measured active interval without clamping to 60000",
  { timeout: 75_000 },
  async (t) => {
    const f = await capacityFixture(t);
    const creation = await f.prepare();
    const lease = await f.hold("hold-admission-capacity", 90_000);
    f.auditResponse.resolve();
    await until(async () =>
      (await f.snapshot(lease.id)).events.some(
        (event) => event.kind === "admission-refused",
      ),
    );
    let lastRunning = performance.now();
    let terminalObserved = lastRunning;
    await until(async () => {
      const started = performance.now();
      const run = await f.run();
      if (run.status === "running") {
        lastRunning = started;
        return false;
      }
      terminalObserved = performance.now();
      assert.equal(run.status, "failed");
      assert.equal(run.endReason, "wall_clock");
      return true;
    }, 65_000);
    await until(async () =>
      (await f.snapshot(lease.id)).events.some(
        (event) => event.kind === "run-terminal",
      ),
    );
    const snapshot = await f.snapshot(lease.id);
    const terminal = snapshot.events.find(
      (event) => event.kind === "run-terminal",
    )!;
    const persisted = Number(
      (
        await f.db.query(
          "SELECT active_ms FROM agent_runs WHERE id='capacity-run'",
        )
      ).rows[0]!.active_ms,
    );
    assert.equal(terminal.activeElapsedMs![0], persisted);
    assert.ok(terminal.activeElapsedMs![1] > persisted);
    assert.equal(snapshot.state, "held");
    assert.equal(f.kicks(), 0);
    assert.equal(f.audits(), 1);
    await f.snapshot(lease.id, "DELETE");
    await delay(1500);
    assert.equal(f.kicks(), 0);
    f.evidence({
      case: "DC06-measurement-only",
      terminal,
      persisted,
      independentElapsedMs: [
        lastRunning - creation.after,
        terminalObserved - creation.before,
      ],
      limit:
        "No 60000 clamp or new tolerance; QA classifies its own exact threshold. Valid only for this uninterrupted healthy clock epoch.",
    });
  },
);

test("DC07 TTL releases the precise ready barrier without controller state writes", async (t) => {
  const f = await capacityFixture(t);
  await f.prepare();
  const lease = await f.hold("hold-after-refusal-before-ready", 700);
  f.auditResponse.resolve();
  await until(async () =>
    (await f.snapshot(lease.id)).events.some(
      (event) => event.kind === "before-ready-held",
    ),
  );
  assert.equal(f.kicks(), 0);
  await until(async () => (await f.snapshot(lease.id)).state === "released");
  await until(async () => (await f.run()).status === "finished");
  const snapshot = await f.snapshot(lease.id);
  const before = snapshot.events.find(
    (event) => event.kind === "before-ready-held",
  )!;
  const after = snapshot.events.find(
    (event) => event.kind === "ready-persisted",
  )!;
  assert.equal(before.attemptId, after.attemptId);
  assert.ok(after.seq > before.seq);
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  f.evidence({ case: "DC07", snapshot });
});

test("DC08 a holder connection loss releases only its lease and does not fabricate a target refusal", async (t) => {
  const f = await capacityFixture(t);
  await f.prepare();
  const lease = await f.hold();
  const key = lease.snapshot.events[0]!.holderKeys![0]!;
  const pids = await f.db.query<{ pid: number }>(
    "SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND classid=((hashtextextended($1,0)>>32)&4294967295)::oid AND objid=(hashtextextended($1,0)&4294967295)::oid AND objsubid=1",
    [key],
  );
  assert.equal(pids.rows.length, 1);
  await f.db.query("SELECT pg_terminate_backend($1)", [pids.rows[0]!.pid]);
  await until(async () => (await f.snapshot(lease.id)).state === "released");
  assert.equal(
    (await f.snapshot(lease.id)).events.some(
      (event) => event.kind === "admission-refused",
    ),
    false,
  );
  assert.equal(f.kicks(), 0);
  f.auditResponse.resolve();
  await until(async () => (await f.run()).status === "finished");
  assert.equal(f.kicks(), 1);
  assert.equal(f.audits(), 1);
  f.evidence({
    case: "DC08",
    terminatedHolderPid: pids.rows[0]!.pid,
    snapshot: await f.snapshot(lease.id),
  });
});
