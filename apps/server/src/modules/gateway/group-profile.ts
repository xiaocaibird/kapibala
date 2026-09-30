import { z } from "zod";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "../../../../../packages/contracts/src/index.js";

export const groupNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(GROUP_NAME_MAX_LENGTH);
export const groupDescriptionSchema = z
  .string()
  .trim()
  .max(GROUP_DESCRIPTION_MAX_LENGTH)
  .transform((value) => value || null);

export const groupProfileFields = ["name", "description"] as const;
export const groupPatchSchema = z
  .object({
    name: groupNameSchema.optional(),
    description: groupDescriptionSchema.optional(),
    agentEnabled: z.boolean().optional(),
    autoKickEnabled: z.boolean().optional(),
    // Originals are stored values: preserve whitespace, empty strings and null.
    expected: z
      .object({
        name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.agentEnabled !== undefined ||
      value.autoKickEnabled !== undefined,
  )
  .refine(
    (value) =>
      value.expected === undefined ||
      (groupProfileFields.some(
        (field) => value.expected![field] !== undefined,
      ) &&
        groupProfileFields.every(
          (field) =>
            (value[field] !== undefined) ===
            (value.expected![field] !== undefined),
        )),
    {
      path: ["expected"],
      message: "expected 必须非空且与本次修改的名称、简介字段一一对应",
    },
  );
