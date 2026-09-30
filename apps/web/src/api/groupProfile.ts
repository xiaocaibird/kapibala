import { z } from "zod";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  type Group,
} from "../../../../packages/contracts/src/index";

const nameInput = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH);
const descriptionInput = z.string().trim().max(GROUP_DESCRIPTION_MAX_LENGTH);
export interface GroupProfileDraft {
  name: string;
  description: string;
}
type Profile = Pick<Group, "name" | "description">;
type ProfileChanges = Partial<GroupProfileDraft>;

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
