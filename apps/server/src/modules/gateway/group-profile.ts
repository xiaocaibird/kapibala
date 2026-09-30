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
