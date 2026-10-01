import { createObservationController } from "./qa-observation/controller.js";
import { protocol, requestSchema } from "./qa-message-observation/protocol.js";
const directory = process.env.QA_MESSAGE_REGISTRY_DIR;
const port = Number(process.env.QA_MESSAGE_PORT);
if (!directory || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error(
    "Explicit QA_MESSAGE_REGISTRY_DIR and QA_MESSAGE_PORT required",
  );
const app = await createObservationController({
  directory,
  prefix: "/qa/message/v1",
  protocol,
  requestSchema,
});
await app.listen({ host: "127.0.0.1", port });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void app.close().then(() => process.exit(0)));
