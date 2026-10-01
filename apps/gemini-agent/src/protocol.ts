import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { Ajv2019 } from "ajv/dist/2019.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";

export class AgentError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
  ) {
    super(code);
  }
}

const text = z.object({ type: z.literal("text"), text: z.string() }).strict();
const use = z
  .object({
    type: z.literal("tool_use"),
    id: z.string().min(1),
    name: z.string().min(1),
    input: z.unknown(),
  })
  .strict();
const result = z
  .object({
    type: z.literal("tool_result"),
    tool_use_id: z.string().min(1),
    content: z.string(),
    is_error: z.boolean().optional(),
  })
  .strict();
export const messageSchema = z.union([
  z
    .object({
      role: z.literal("user"),
      content: z.array(z.union([text, result])).min(1),
    })
    .strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z.array(z.union([text, use])).min(1),
    })
    .strict(),
]);
export const turnRequestSchema = z
  .object({
    runId: z.string().min(1).max(512),
    tools: z.unknown(),
    messages: z.array(messageSchema).min(1),
  })
  .strict();
export type TurnRequest = z.infer<typeof turnRequestSchema>;
export const auditRequestSchema = z
  .object({ text: z.string(), groupId: z.string().min(1) })
  .strict();
export const auditResponseSchema = z
  .object({ verdict: z.enum(["pass", "fail"]), reason: z.string() })
  .strict();

const inputs = {
  get_recent_messages: z
    .object({ limit: z.number().int().positive() })
    .strict(),
  send_message: z
    .object({
      text: z.string().min(1).max(20000),
      idempotency_key: z.string().min(1).max(512),
    })
    .strict(),
  kick_user: z
    .object({
      platform_user_id: z.string().min(1).max(512),
      reason: z.string().min(1).max(2000),
    })
    .strict(),
  finish: z.object({ summary: z.string().max(20000) }).strict(),
};
export const decisionSchema = z
  .object({
    decision: z.discriminatedUnion("name", [
      z
        .object({
          name: z.literal("get_recent_messages"),
          input: inputs.get_recent_messages,
        })
        .strict(),
      z
        .object({ name: z.literal("send_message"), input: inputs.send_message })
        .strict(),
      z
        .object({ name: z.literal("kick_user"), input: inputs.kick_user })
        .strict(),
      z.object({ name: z.literal("finish"), input: inputs.finish }).strict(),
      z
        .object({ name: z.literal("end_turn"), text: z.string().max(20000) })
        .strict(),
    ]),
  })
  .strict();
export const turnResponseSchema = z.union([
  z
    .object({ stop_reason: z.literal("end_turn"), content: z.tuple([text]) })
    .strict(),
  z
    .object({ stop_reason: z.literal("tool_use"), content: z.tuple([use]) })
    .strict(),
]);
export type TurnResponse = z.infer<typeof turnResponseSchema>;

// Check schema documents, not executable functions. No remote $ref loading or
// tool implementation is installed in this service.
const validators = {
  "http://json-schema.org/draft-07/schema#": new Ajv({ strict: false }),
  "https://json-schema.org/draft/2019-09/schema": new Ajv2019({
    strict: false,
  }),
  "https://json-schema.org/draft/2020-12/schema": new Ajv2020({
    strict: false,
  }),
};
const declaredTools = z
  .array(
    z
      .object({
        name: z.string(),
        description: z.string(),
        input_schema: z.record(z.string(), z.unknown()),
      })
      .strict(),
  )
  .length(4);
export function validateTools(value: unknown): void {
  const parsed = declaredTools.safeParse(value);
  if (!parsed.success) throw new AgentError(400, "TOOLS_INVALID");
  const seen = new Set<string>();
  for (const tool of parsed.data) {
    if (!Object.hasOwn(inputs, tool.name) || seen.has(tool.name))
      throw new AgentError(400, "TOOLS_INVALID");
    seen.add(tool.name);
    const schema = tool.input_schema;
    const schemaRequired = schema.required;
    const dialect = schema.$schema ?? "http://json-schema.org/draft-07/schema#";
    if (typeof dialect !== "string" || !Object.hasOwn(validators, dialect))
      throw new AgentError(400, "SCHEMA_DIALECT_UNSUPPORTED");
    const validator = validators[dialect as keyof typeof validators];
    const required = Object.keys(
      inputs[tool.name as keyof typeof inputs].shape,
    );
    try {
      if (
        !validator.validateSchema(schema) ||
        schema.type !== "object" ||
        !Array.isArray(schemaRequired) ||
        required.some((key) => !schemaRequired.includes(key))
      )
        throw new Error();
    } catch {
      throw new AgentError(400, "TOOLS_INVALID");
    }
  }
}

export function toTurnResponse(
  value: unknown,
  messages: TurnRequest["messages"],
): TurnResponse {
  const parsed = decisionSchema.safeParse(value);
  if (!parsed.success) throw new AgentError(502, "MODEL_INVALID_OUTPUT");
  const decision = parsed.data.decision;
  if (decision.name === "end_turn")
    return {
      stop_reason: "end_turn",
      content: [{ type: "text", text: decision.text }],
    };
  const used = new Set(
    messages.flatMap((message) =>
      message.content.flatMap((block) =>
        block.type === "tool_use" ? [block.id] : [],
      ),
    ),
  );
  let id: string;
  do {
    id = randomUUID();
  } while (used.has(id));
  return {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id, name: decision.name, input: decision.input },
    ],
  };
}
