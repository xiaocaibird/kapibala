// Explicit isolated engineering entry; production main never imports this.
import "dotenv/config";
import { requireObservationRemotes } from "./qa-observation/remote-config.js";
import { createApp } from "../apps/server/src/app.js";
import { Database } from "../apps/server/src/core/db.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { MessageObservationRuntime } from "./qa-message-observation/runtime.js";
import { createObservationBridge } from "./qa-observation/bridge.js";
import { sourceRevision } from "./qa-capacity/ownership.js";
requireObservationRemotes();
const directory = process.env.QA_MESSAGE_REGISTRY_DIR;
if (
  !directory ||
  !process.env.QA_ACCEPTANCE_RESOURCE_TOKEN ||
  !process.env.DATABASE_URL ||
  !process.env.PORT
)
  throw new Error(
    "Explicit QA message registry, resource token, database and port required",
  );
const revision = await sourceRevision();
const db = new Database(process.env.DATABASE_URL);
const runtime = new MessageObservationRuntime(db);
const app = await createApp({
  db,
  modules: (ctx) => {
    ctx.testMessageObserver = runtime;
    const gateway = createGatewayModule(ctx);
    return [gateway, createAutomationModule(ctx, gateway)];
  },
});
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
const bridge = await createObservationBridge({
  directory,
  apiUrl: app.listeningOrigin,
  revision,
  runtime,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(
    signal,
    () =>
      void runtime
        .close()
        .then(() => bridge.close())
        .then(() => app.close())
        .then(() => db.close())
        .then(() => process.exit(0)),
  );
