import { createCapacityController } from "./qa-capacity/controller.js";
const directory = process.env.QA_CAPACITY_REGISTRY_DIR;
const port = Number(process.env.QA_CAPACITY_PORT);
if (!directory || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error(
    "Explicit QA_CAPACITY_REGISTRY_DIR and QA_CAPACITY_PORT are required",
  );
const app = await createCapacityController(directory);
await app.listen({ host: "127.0.0.1", port });
console.log(
  JSON.stringify({
    component: "qa-capacity-controller",
    url: app.listeningOrigin,
    pid: process.pid,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
