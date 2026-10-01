// Explicit isolated engineering entry. Normal main never imports this module.
import "dotenv/config";
import { requireObservationRemotes } from "./qa-observation/remote-config.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { sourceRevision } from "./qa-capacity/ownership.js";
import { createObservationBridge } from "./qa-observation/bridge.js";
import { ObservedRuntimeDatabase } from "./qa-runtime-observation/runtime.js";
import { CombinedRuntimeObservation } from "./qa-runtime-observation/combined.js";
requireObservationRemotes();
const directory = process.env.QA_RUNTIME_REGISTRY_DIR;
const port = Number(process.env.PORT);
if (
  !directory ||
  !process.env.QA_ACCEPTANCE_RESOURCE_TOKEN ||
  !process.env.DATABASE_URL ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
)
  throw new Error(
    "Explicit registry, resource token, DATABASE_URL and PORT required",
  );
const revision = await sourceRevision();
const db = new ObservedRuntimeDatabase(process.env.DATABASE_URL);
const runtime = new CombinedRuntimeObservation(db);
let app: Awaited<ReturnType<typeof createApp>> | undefined;
let bridge: Awaited<ReturnType<typeof createObservationBridge>> | undefined;
let closing: Promise<void> | undefined;
function close(): Promise<void> {
  return (closing ??= (async () => {
    const failures: unknown[] = [];
    for (const cleanup of [
      () => runtime.close(),
      async () => {
        await bridge?.close();
      },
      async () => {
        await app?.close();
      },
      () => db.close(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Runtime observation cleanup failed");
  })());
}
try {
  app = await createApp({
    db,
    modules: (ctx) => {
      ctx.testRuntimeObserver = runtime.resource;
      ctx.testActivityObserver = runtime.activity;
      const gateway = createGatewayModule(ctx);
      return [gateway, createAutomationModule(ctx, gateway)];
    },
  });
  await app.listen({ host: "127.0.0.1", port });
  bridge = await createObservationBridge({
    directory,
    apiUrl: app.listeningOrigin,
    revision,
    runtime,
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void close().then(
        () => process.exit(0),
        (error) => {
          console.error(error);
          process.exit(1);
        },
      );
    });
} catch (error) {
  try {
    await close();
  } catch (cleanupError) {
    console.error(cleanupError);
  }
  throw error;
}
