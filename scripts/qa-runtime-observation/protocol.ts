import { z } from "zod";
import { targetSchema } from "../qa-capacity/protocol.js";
export const protocol = "qa-runtime-observation/1" as const;
const base = {
  protocol: z.literal(protocol),
  target: targetSchema,
  ttlMs: z.number().int().min(5_000).max(120_000),
};
const account = z
  .object({
    kind: z.literal("account"),
    accountId: z.string().min(1).max(200),
    operation: z.literal("connect"),
    intentId: z.uuid(),
  })
  .strict();
export const requestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      ...base,
      mode: z.literal("account-save-once"),
      correlation: account,
    })
    .strict(),
  z
    .object({
      ...base,
      mode: z.literal("account-save-persistent"),
      correlation: account,
    })
    .strict(),
  z
    .object({
      ...base,
      mode: z.literal("module-fail-then-hold"),
      correlation: z
        .object({
          kind: z.literal("module"),
          module: z.string().min(1).max(100),
          attemptLabel: z.uuid(),
        })
        .strict(),
      faultMarker: z.string().startsWith("qa-runtime-").max(96),
    })
    .strict(),
]);
export type RuntimeRequest = z.infer<typeof requestSchema>;
