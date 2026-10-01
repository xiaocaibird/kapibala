// Development-only child: real Agent.tick, PostgreSQL and HTTP; manual scheduling.
import { randomUUID } from "node:crypto";
import { createApp } from "../../apps/server/src/app.js";
import { Database } from "../../apps/server/src/core/db.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { LifecycleWitness } from "../../scripts/qa-runtime-observation/lifecycle-witness.js";

const db = new Database(process.env.DATABASE_URL!);
const witness = new LifecycleWitness(db);
let automation!: ReturnType<typeof createAutomationModule>;
const app = await createApp({
  db,
  logger: false,
  background: false,
  modules(ctx) {
    ctx.testLifecycleObserver = witness;
    const gateway = createGatewayModule(ctx);
    automation = createAutomationModule(ctx, gateway);
    return [gateway, automation];
  },
});
await app.listen({ host: "127.0.0.1", port: 0 });
let releaseCapacity = () => {};
let holders: Promise<unknown>[] = [];
const binding = {
  apiUrl: app.listeningOrigin,
  revision: process.env.TEST_SOURCE_REVISION!,
  pid: process.pid,
  observedOwnerToken: randomUUID(),
};
process.on("message", async (raw) => {
  const message = raw as { id: string; action: string; runId?: string };
  try {
    let result: unknown;
    if (message.action === "tick") await automation.tick();
    else if (message.action === "snapshot") {
      result = await witness.establish(
        randomUUID(),
        {
          protocol: "qa-runtime-observation/1",
          target: {
            apiUrl: binding.apiUrl,
            revision: binding.revision,
            pid: binding.pid,
          },
          ttlMs: 5000,
          mode: "observe-agent-lifecycle",
          correlation: {
            kind: "tool-wait",
            groupId: "g",
            runId: message.runId!,
            toolUseId: "all-run-steps",
          },
        },
        new Date(Date.now() + 5000).toISOString(),
        binding,
      );
    } else if (message.action === "fill-capacity") {
      let admitted = 0;
      const release = new Promise<void>((resolve) => {
        releaseCapacity = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        holders = Array.from({ length: 8 }, (_, i) =>
          db.withLock(`test-capacity:${i}`, async () => {
            admitted++;
            if (admitted === 8) resolve();
            await release;
          }),
        );
      });
      await ready;
      result = { admitted };
    } else if (message.action === "release-capacity") {
      releaseCapacity();
      await Promise.all(holders);
      holders = [];
    } else if (message.action === "close") {
      releaseCapacity();
      await Promise.all(holders);
      await app.close();
      await witness.close();
      await db.close();
    } else throw new Error("Unknown development worker command");
    process.send!({ id: message.id, result });
    if (message.action === "close") process.disconnect();
  } catch (error) {
    process.send!({ id: message.id, error: String(error) });
  }
});
process.send!({ ready: true, pid: process.pid, apiUrl: app.listeningOrigin });
