// Explicit, combined engineering entry. Production main never imports this.
import "dotenv/config";
import { realpath } from "node:fs/promises";
import { requireObservationRemotes } from "./qa-observation/remote-config.js";
import { createApp } from "../apps/server/src/app.js";
import { createGatewayModule } from "../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../apps/server/src/modules/automation/index.js";
import { CapacityRuntime } from "./qa-capacity/runtime.js";
import { registryDirectory, sourceRevision } from "./qa-capacity/ownership.js";
import { MessageObservationRuntime } from "./qa-message-observation/runtime.js";
import { createObservationBridge } from "./qa-observation/bridge.js";
import { ObservedRuntimeDatabase } from "./qa-runtime-observation/runtime.js";
import { CombinedRuntimeObservation } from "./qa-runtime-observation/combined.js";

requireObservationRemotes();
const directories = {
  capacity: process.env.QA_CAPACITY_REGISTRY_DIR,
  message: process.env.QA_MESSAGE_REGISTRY_DIR,
  runtime: process.env.QA_RUNTIME_REGISTRY_DIR,
};
const configured = Object.values(directories).filter((value): value is string =>
  Boolean(value),
);
const port = Number(process.env.PORT);
if (
  !configured.length ||
  !process.env.QA_ACCEPTANCE_RESOURCE_TOKEN ||
  !process.env.DATABASE_URL ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
)
  throw new Error(
    "At least one explicit QA registry, owner token, DATABASE_URL and PORT required",
  );
const canonical = await Promise.all(
  configured.map(async (directory) =>
    realpath(await registryDirectory(directory)),
  ),
);
if (new Set(canonical).size !== canonical.length)
  throw new Error(
    "Each observation protocol requires a distinct registry directory",
  );
const revision = await sourceRevision();
const db = new ObservedRuntimeDatabase(process.env.DATABASE_URL);
const capacity = directories.capacity ? new CapacityRuntime(db) : undefined;
const message = directories.message
  ? new MessageObservationRuntime(db)
  : undefined;
const runtime = directories.runtime
  ? new CombinedRuntimeObservation(db)
  : undefined;
let app: Awaited<ReturnType<typeof createApp>> | undefined;
const bridges: Awaited<ReturnType<typeof createObservationBridge>>[] = [];
let closing: Promise<void> | undefined;
function close(): Promise<void> {
  return (closing ??= (async () => {
    const failures: unknown[] = [];
    for (const cleanup of [
      () => runtime?.close(),
      () => message?.close(),
      () => capacity?.close(),
      ...bridges.map((bridge) => () => bridge.close()),
      () => app?.close(),
      () => db.close(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Combined observation cleanup failed");
  })());
}
try {
  app = await createApp({
    db,
    modules: (ctx) => {
      ctx.testExecutionObserver = capacity;
      ctx.testMessageObserver = message;
      ctx.testRuntimeObserver = runtime?.resource;
      ctx.testActivityObserver = runtime?.activity;
      ctx.testLifecycleObserver = runtime?.lifecycle;
      ctx.testMediaObserver = runtime?.media;
      const gateway = createGatewayModule(ctx);
      return [gateway, createAutomationModule(ctx, gateway)];
    },
  });
  await app.listen({ host: "127.0.0.1", port });
  if (capacity)
    await capacity.listen(directories.capacity!, app.listeningOrigin, revision);
  if (message)
    bridges.push(
      await createObservationBridge({
        directory: directories.message!,
        apiUrl: app.listeningOrigin,
        revision,
        runtime: message,
      }),
    );
  if (runtime)
    bridges.push(
      await createObservationBridge({
        directory: directories.runtime!,
        apiUrl: app.listeningOrigin,
        revision,
        runtime,
      }),
    );
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
  await close().catch((cleanupError) => console.error(cleanupError));
  throw error;
}
