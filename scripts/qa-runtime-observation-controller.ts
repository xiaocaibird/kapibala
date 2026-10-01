import { createRuntimeObservationController } from "./qa-runtime-observation/controller.js";
const directory = process.env.QA_RUNTIME_OBSERVATION_REGISTRY_DIR;
const port = Number(process.env.QA_RUNTIME_OBSERVATION_PORT);
if (!directory || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error(
    "Explicit QA_RUNTIME_OBSERVATION_REGISTRY_DIR and QA_RUNTIME_OBSERVATION_PORT required",
  );
const app = await createRuntimeObservationController(directory);
await app.listen({ host: "127.0.0.1", port });
console.log(
  JSON.stringify({
    component: "qa-runtime-observation-controller",
    url: app.listeningOrigin,
    pid: process.pid,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
