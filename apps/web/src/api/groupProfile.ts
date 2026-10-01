import { z } from "zod";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  type Group,
} from "../../../../packages/contracts/src/index";
import { ApiError } from "./client";

// Match the public UTF-16 write contract; Zod max() counts code points.
const nameInput = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.length <= GROUP_NAME_MAX_LENGTH);
const descriptionInput = z
  .string()
  .trim()
  .refine((value) => value.length <= GROUP_DESCRIPTION_MAX_LENGTH);
export interface GroupProfileDraft {
  name: string;
  description: string;
}
export type GroupProfileSnapshot = Pick<Group, "name" | "description">;
export type GroupProfileField = keyof GroupProfileDraft;
type Profile = GroupProfileSnapshot;
type ProfileChanges = Partial<GroupProfileDraft>;
export interface GroupProfilePatch extends ProfileChanges {
  expected: Partial<GroupProfileSnapshot>;
}
const profileFields: readonly GroupProfileField[] = ["name", "description"];
const profileConflictSchema = z.object({
  current: z
    .object({ name: z.string().nullable(), description: z.string().nullable() })
    .strict(),
  conflictingFields: z
    .array(z.enum(["name", "description"]))
    .min(1)
    .max(2)
    .refine((fields) => new Set(fields).size === fields.length),
});
export type GroupProfileConflict = z.infer<typeof profileConflictSchema>;

export function changedProfileFields(
  changes: ProfileChanges,
): GroupProfileField[] {
  return profileFields.filter((field) => Object.hasOwn(changes, field));
}

export function conditionalGroupProfilePatch(
  original: GroupProfileSnapshot,
  draft: GroupProfileDraft,
): GroupProfilePatch | null {
  const changes = changedGroupProfile(original, draft);
  const fields = changedProfileFields(changes);
  if (!fields.length) return null;
  const expected: Partial<GroupProfileSnapshot> = {};
  // Preconditions are the raw snapshot, including null or legacy empty values.
  // Only actual write fields participate, so disjoint edits remain independent.
  for (const field of fields) expected[field] = original[field];
  return { ...changes, expected };
}

export function readGroupProfileConflict(
  error: unknown,
): GroupProfileConflict | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    error.code !== "GROUP_PROFILE_CONFLICT"
  )
    return null;
  const result = profileConflictSchema.safeParse(error.details);
  return result.success ? result.data : null;
}

export function rebaseGroupProfileDraft(
  draft: GroupProfileDraft,
  current: GroupProfileSnapshot,
  submittedFields: readonly GroupProfileField[],
): GroupProfileDraft {
  // Untouched drafts must follow the new base. Otherwise the next submission
  // could turn another administrator's independent change into our write.
  return {
    name: submittedFields.includes("name") ? draft.name : (current.name ?? ""),
    description: submittedFields.includes("description")
      ? draft.description
      : (current.description ?? ""),
  };
}

function readName(value: string): string {
  const result = nameInput.safeParse(value);
  if (!result.success)
    throw new Error(
      `群名称去除首尾空格后需为 1–${GROUP_NAME_MAX_LENGTH} 个字符，不能清空。`,
    );
  return result.data;
}
function readDescription(value: string): string {
  const result = descriptionInput.safeParse(value);
  if (!result.success)
    throw new Error(
      `群简介去除首尾空格后最多 ${GROUP_DESCRIPTION_MAX_LENGTH} 个字符。`,
    );
  return result.data;
}

export function createGroupProfile(draft: GroupProfileDraft): ProfileChanges {
  const description = readDescription(draft.description);
  return {
    ...(draft.name === "" ? {} : { name: readName(draft.name) }),
    ...(description ? { description } : {}),
  };
}

// Compare with the opening snapshot, not a later poll: untouched fields must
// not overwrite another administrator's changes while this form is open.
export function changedGroupProfile(
  original: Profile,
  draft: GroupProfileDraft,
): ProfileChanges {
  const changes: ProfileChanges = {};
  if (draft.name !== (original.name ?? "")) {
    const name = readName(draft.name);
    if (name !== original.name) changes.name = name;
  }
  if (draft.description !== (original.description ?? "")) {
    const description = readDescription(draft.description);
    if (description !== (original.description ?? ""))
      changes.description = description;
  }
  return changes;
}

export function groupOptionLabel(
  group: Pick<Group, "name" | "gatewayGroupId">,
): string {
  return group.name
    ? `${group.name} · ${group.gatewayGroupId}`
    : group.gatewayGroupId;
}
