import { z } from "zod";

export const sequenceDefinitionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    steps: z
      .array(
        z
          .object({
            index: z.number().int().positive(),
            accountRole: z.enum(["admin", "member"]),
            text: z.string().min(1).max(20000),
            delaySeconds: z.number().min(0).max(604800),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .refine((value) => value.steps.every((step, i) => step.index === i + 1), {
    path: ["steps"],
    message: "Step indexes must be consecutive and start at 1",
  });

export const sequenceVariablesSchema = z.record(
  z.string().regex(/^[A-Za-z0-9_]+$/),
  z.string().max(20000),
);
export const sequenceStepVariablesSchema = z.record(
  z.string().regex(/^[1-9][0-9]*$/),
  sequenceVariablesSchema,
);
export const sequenceStartRequestSchema = z
  .object({
    sequenceId: z.string().min(1),
    vars: sequenceVariablesSchema.default({}),
    stepVars: sequenceStepVariablesSchema.default({}),
  })
  .strict();
export type SequenceStartRequest = z.infer<typeof sequenceStartRequestSchema>;
