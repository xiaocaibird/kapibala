import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createApp } from "../../apps/server/src/app.js";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import {
  ActivityWitness,
  type ActivityRequest,
} from "../../scripts/qa-runtime-observation/activity-witness.js";

const db = new Database(process.env.ACTIVITY_TEST_DATABASE_URL!);
const witness = new ActivityWitness(db);
let automation!: ReturnType<typeof createAutomationModule>;
const app = await createApp({
  db,
  logger: false,
  background: false,
  modules: (context) => {
    const ctx = {
      ...context,
      gateway: new RemoteClient(process.env.ACTIVITY_TEST_REMOTE_URL!),
      agent: new RemoteClient(process.env.ACTIVITY_TEST_REMOTE_URL!),
      testActivityObserver: witness,
    };
    const gateway = createGatewayModule(ctx);
    automation = createAutomationModule(ctx, gateway);
    return [gateway, automation];
  },
});
await app.listen({ host: "127.0.0.1", port: 0 });
const binding = {
  apiUrl: app.listeningOrigin,
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  pid: process.pid,
  observedOwnerToken: randomUUID(),
};
process.send?.({ type: "ready", binding });
process.on(
  "message",
  async (message: {
    key: string;
    command: string;
    leaseId?: string;
    runId?: string;
    mode?: ActivityRequest["mode"];
    ttlMs?: number;
  }) => {
    try {
      let result: unknown;
      if (message.command === "tick") await automation.tick();
      else if (message.command === "arm") {
        const request: ActivityRequest = {
          protocol: "qa-runtime-observation/1",
          target: {
            apiUrl: binding.apiUrl,
            revision: binding.revision,
            pid: binding.pid,
          },
          correlation: {
            kind: "activity",
            groupId: "g",
            runId: message.runId!,
            toolUseId: "all-run-steps",
          },
          mode: message.mode!,
          ttlMs: message.ttlMs ?? 10000,
        };
        result = await witness.establish(
          message.leaseId!,
          request,
          new Date(Date.now() + request.ttlMs).toISOString(),
          binding,
        );
      } else if (message.command === "snapshot")
        result = witness.snapshot(message.leaseId!);
      else if (message.command === "close") {
        await witness.close();
        await app.close();
        await db.close();
      } else throw new Error("Unknown test command");
      process.send?.({ key: message.key, ok: true, result });
      if (message.command === "close") process.exit(0);
    } catch (error) {
      process.send?.({
        key: message.key,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
