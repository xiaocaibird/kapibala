import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RuntimeRequest } from "../../scripts/qa-runtime-observation/protocol.js";
import type { ObservationSnapshot } from "../../scripts/qa-observation/types.js";
import { runtimeFixture } from "../support/runtime-observation-fixture.js";
import { delay, until } from "../support/core-automation-fixture.js";

type Fixture = Awaited<ReturnType<typeof runtimeFixture>>;
interface ModuleState {
  name: string;
  status: string;
  ticks: number;
  tickId: string | null;
  consecutiveFailures: number;
  lastFailure: {
    reason: string;
    correlation: { module: string; tickId: string };
    recoveredAt: string | null;
  } | null;
}
function input(f: Fixture, module: string, ttlMs = 20000): RuntimeRequest {
  return {
    protocol: "qa-runtime-observation/1",
    target: f.target(),
    mode: "module-fail-then-hold",
    ttlMs,
    correlation: { kind: "module", module, attemptLabel: randomUUID() },
    faultMarker: `qa-runtime-multimodule-${module}`,
  };
}
async function hold(f: Fixture, module: string, ttlMs = 20000) {
  const id = randomUUID();
  const body = input(f, module, ttlMs);
  const result = await f.request("PUT", `/leases/${id}`, body);
  f.evidence({ operation: "module-lease-create", id, module, ...result });
  assert.equal(result.status, 200, JSON.stringify(result.value));
  return { id, body, snapshot: result.value as ObservationSnapshot };
}
async function diagnostics(f: Fixture) {
  const result = await f.api("/api/diagnostics/background");
  assert.equal(result.status, 200);
  assert.equal(
    JSON.stringify(result.value).includes("qa-runtime-multimodule-"),
    false,
  );
  const modules = (result.value as { modules: ModuleState[] }).modules;
  return {
    gateway: modules.find((m) => m.name === "gateway")!,
    automation: modules.find((m) => m.name === "automation")!,
  };
}

test(
  "MM01 one owned process exposes simultaneous real module failures and independently advances/releases exact leases",
  { timeout: 30000 },
  async (t) => {
    const f = await runtimeFixture(t);
    const gateway = await hold(f, "gateway");
    const automation = await hold(f, "automation");
    assert.deepEqual(gateway.snapshot.binding, automation.snapshot.binding);
    assert.deepEqual(
      gateway.snapshot.snapshotProvenance,
      automation.snapshot.snapshotProvenance,
    );
    const caps = await f.capabilities();
    assert.ok(
      (caps.value as { capabilities: string[] }).capabilities.includes(
        "module-tick-independent",
      ),
    );
    const [gatewayHeld, automationHeld] = await Promise.all([
      f.event(gateway.id, "module-before-next-held"),
      f.event(automation.id, "module-before-next-held"),
    ]);
    const bothFailed = await diagnostics(f);
    for (const module of ["gateway", "automation"] as const) {
      const state = bothFailed[module];
      assert.equal(state.status, "failed");
      assert.ok(state.consecutiveFailures >= 1);
      assert.equal(state.lastFailure?.reason, "UNEXPECTED_FAILURE");
      assert.equal(state.lastFailure?.correlation.module, module);
      assert.equal(state.lastFailure?.correlation.tickId, state.tickId);
      assert.equal(state.lastFailure?.recoveredAt, null);
    }
    assert.notEqual(bothFailed.gateway.tickId, bothFailed.automation.tickId);
    assert.ok(
      gatewayHeld.events.every(
        (event) =>
          (event.correlation as { module: string }).module === "gateway",
      ),
    );
    assert.ok(
      automationHeld.events.every(
        (event) =>
          (event.correlation as { module: string }).module === "automation",
      ),
    );
    for (const target of [
      { ...f.target(), pid: process.pid },
      { ...f.target(), revision: "0".repeat(40) },
      { ...f.target(), apiUrl: "http://127.0.0.1:1" },
    ]) {
      assert.equal(
        (
          await f.request("PUT", `/leases/${randomUUID()}`, {
            ...input(f, "gateway"),
            target,
          })
        ).status,
        409,
      );
    }
    assert.equal(
      (await f.request("PUT", `/leases/${randomUUID()}`, input(f, "gateway")))
        .status,
      409,
    );
    assert.equal(
      (
        await f.request(
          "PUT",
          `/leases/${randomUUID()}`,
          f.body("account-save-once"),
        )
      ).status,
      409,
    );
    assert.equal(
      (await f.request("PUT", `/leases/${gateway.id}`, automation.body)).status,
      409,
    );
    assert.equal(
      (
        await f.request(
          "PUT",
          `/leases/${randomUUID()}`,
          input(f, "missing-module"),
        )
      ).status,
      404,
    );
    assert.equal(
      (await f.request("DELETE", `/leases/${randomUUID()}`)).status,
      404,
    );
    assert.equal(
      (await f.request("POST", `/leases/${randomUUID()}/advance`)).status,
      404,
    );
    assert.deepEqual(await diagnostics(f), bothFailed);
    assert.deepEqual(await f.snapshot(automation.id), automationHeld);

    await f.advance(gateway.id);
    await f.event(gateway.id, "module-running-held");
    const gatewayRunning = await diagnostics(f);
    assert.equal(gatewayRunning.gateway.status, "running");
    assert.deepEqual(gatewayRunning.automation, bothFailed.automation);
    await f.advance(gateway.id);
    await f.event(gateway.id, "module-succeeded");
    const gatewayRecovered = await diagnostics(f);
    assert.equal(gatewayRecovered.gateway.status, "idle");
    assert.equal(gatewayRecovered.gateway.consecutiveFailures, 0);
    assert.ok(gatewayRecovered.gateway.lastFailure?.recoveredAt);
    assert.deepEqual(
      gatewayRecovered.gateway.lastFailure?.correlation,
      bothFailed.gateway.lastFailure?.correlation,
    );
    assert.deepEqual(gatewayRecovered.automation, bothFailed.automation);
    await f.snapshot(gateway.id, "DELETE");
    await until(
      async () =>
        (await diagnostics(f)).gateway.ticks > gatewayRecovered.gateway.ticks,
    );
    assert.deepEqual((await diagnostics(f)).automation, bothFailed.automation);
    assert.deepEqual(await f.snapshot(automation.id), automationHeld);

    await f.advance(automation.id);
    await f.event(automation.id, "module-running-held");
    await f.advance(automation.id);
    await f.event(automation.id, "module-succeeded");
    const bothRecovered = await diagnostics(f);
    assert.equal(bothRecovered.automation.status, "idle");
    assert.equal(bothRecovered.automation.consecutiveFailures, 0);
    assert.ok(bothRecovered.automation.lastFailure?.recoveredAt);
    assert.deepEqual(
      bothRecovered.automation.lastFailure?.correlation,
      bothFailed.automation.lastFailure?.correlation,
    );
    await f.snapshot(gateway.id, "DELETE");
    assert.equal((await f.snapshot(automation.id)).state, "held");
    await f.snapshot(automation.id, "DELETE");
    f.evidence({
      bothFailed,
      gatewayRunning,
      gatewayRecovered,
      bothRecovered,
      gatewayHeld,
      automationHeld,
    });
  },
);

test(
  "MM02 one module TTL and stale DELETE cannot release the other module or its successor lease",
  { timeout: 30000 },
  async (t) => {
    const f = await runtimeFixture(t);
    const gateway = await hold(f, "gateway", 5000);
    const automation = await hold(f, "automation");
    await f.event(gateway.id, "module-before-next-held");
    const automationHeld = await f.event(
      automation.id,
      "module-before-next-held",
    );
    const bothFailed = await diagnostics(f);
    assert.equal(bothFailed.gateway.status, "failed");
    assert.equal(bothFailed.automation.status, "failed");
    await until(
      async () => (await f.snapshot(gateway.id)).state === "released",
      8000,
    );
    await until(async () =>
      Boolean((await diagnostics(f)).gateway.lastFailure?.recoveredAt),
    );
    const afterTtl = await diagnostics(f);
    assert.equal(afterTtl.gateway.consecutiveFailures, 0);
    assert.deepEqual(afterTtl.automation, bothFailed.automation);
    assert.deepEqual(await f.snapshot(automation.id), automationHeld);

    const successor = await hold(f, "gateway");
    const successorHeld = await f.event(
      successor.id,
      "module-before-next-held",
    );
    await f.snapshot(gateway.id, "DELETE");
    await f.snapshot(gateway.id, "DELETE");
    await delay(200);
    assert.deepEqual(await f.snapshot(successor.id), successorHeld);
    assert.deepEqual(await f.snapshot(automation.id), automationHeld);
    const afterStaleDelete = await diagnostics(f);
    assert.equal(afterStaleDelete.gateway.status, "failed");
    assert.deepEqual(afterStaleDelete.automation, bothFailed.automation);
    await f.snapshot(successor.id, "DELETE");
    await until(
      async () => (await diagnostics(f)).gateway.consecutiveFailures === 0,
    );
    assert.deepEqual((await diagnostics(f)).automation, bothFailed.automation);
    await f.snapshot(automation.id, "DELETE");
    f.evidence({
      bothFailed,
      afterTtl,
      afterStaleDelete,
      successorHeld,
      automationHeld,
    });
  },
);
