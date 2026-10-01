// Explicit engineering entry. Normal apps/server/src/main.ts never imports this.
import "dotenv/config";
import { requireObservationRemotes } from "./qa-observation/remote-config.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { CapacityRuntime, ControlledDatabase } from "./qa-capacity/runtime.js";
import { sourceRevision } from "./qa-capacity/ownership.js";
requireObservationRemotes();
const directory = process.env.QA_CAPACITY_REGISTRY_DIR;
if (
  !directory ||
  !process.env.QA_ACCEPTANCE_RESOURCE_TOKEN ||
  !process.env.DATABASE_URL ||
  !process.env.PORT
)
  throw new Error(
    "Explicit QA registry, owner token, DATABASE_URL and PORT required",
  );
const revision = await sourceRevision();
const db = new ControlledDatabase(process.env.DATABASE_URL);
const runtime = new CapacityRuntime(db);
const app = await createApp({
  db,
  modules: (ctx) => {
    ctx.testExecutionObserver = runtime;
    const gateway = createGatewayModule(ctx);
    return [gateway, createAutomationModule(ctx, gateway)];
  },
});
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
await runtime.listen(directory, app.listeningOrigin, revision);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void runtime
      .close()
      .then(() => app.close())
      .then(() => db.close())
      .then(() => process.exit(0));
  });
