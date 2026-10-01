import { createObservationController } from "../qa-observation/controller.js";
import { protocol, requestSchema } from "./protocol.js";
export const createRuntimeObservationController = (directory: string) =>
  createObservationController({
    directory,
    prefix: "/qa/runtime/v1",
    protocol,
    requestSchema,
  });
