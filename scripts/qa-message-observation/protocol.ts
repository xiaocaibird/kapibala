import { z } from "zod";
import { targetSchema } from "../qa-capacity/protocol.js";
export const protocol = "qa-message-observation/1" as const;
const id = z.string().min(1).max(200);
const common = {
  protocol: z.literal(protocol),
  target: targetSchema,
  ttlMs: z.number().int().min(5000).max(120000),
};
export const requestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      ...common,
      mode: z.literal("timeout-observed-before-local-save"),
      correlation: z.object({ clientMsgId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      mode: z.literal("receipt-before-commit"),
      correlation: z
        .object({ clientMsgId: id, msgId: id, eventId: id })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      mode: z.literal("receipt-committed-before-business"),
      correlation: z
        .object({ clientMsgId: id, msgId: id, eventId: id })
        .strict(),
    })
    .strict(),
]);
export type MessageRequest = z.infer<typeof requestSchema>;
