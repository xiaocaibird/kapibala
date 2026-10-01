import { createObservationController } from "../qa-observation/controller.js";
import { protocol } from "./protocol.js";
import { combinedRequestSchema, compatibleRuntimePair } from "./combined.js";
export const createRuntimeObservationController = (directory: string) =>
  createObservationController({
    directory,
    prefix: "/qa/runtime/v1",
    protocol,
    requestSchema: combinedRequestSchema,
    canShareInstance: compatibleRuntimePair,
  });
