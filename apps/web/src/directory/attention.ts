import type { PlatformEvent } from "../api/schemas";

export type DirectoryAttentionImpact = "changed" | "possible" | "none";
const directFields = new Set([
  "name",
  "description",
  "status",
  "agentEnabled",
  "created",
]);
const projectedFields = new Set([
  "memberCount",
  "activeAgentRunId",
  "activeSequenceRunId",
]);

/** Directory cards display counts and active identities, not member roles,
 * recovery notes or individual run steps. Producers attach projection evidence
 * at the same transaction that changes those visible fields. */
export function directoryAttentionImpact(
  event: PlatformEvent,
): DirectoryAttentionImpact {
  if (
    !["group_changed", "agent_run", "sequence_run"].includes(event.type) ||
    typeof event.payload.groupId !== "string"
  )
    return "none";

  if (event.type === "group_changed") {
    const changed = event.payload.changedFields;
    if (Array.isArray(changed)) {
      if (
        changed.some(
          (field) => typeof field === "string" && directFields.has(field),
        )
      )
        return "changed";
      if (!changed.includes("members")) return "none";
    }
  }

  const projected = event.payload.directoryChangedFields;
  if (Array.isArray(projected)) {
    if (
      projected.some(
        (field) => typeof field === "string" && projectedFields.has(field),
      )
    )
      return "changed";
    if (projected.length === 0) return "none";
  }
  // An older coarse event cannot prove unchanged cards when REST has already
  // observed its commit. Keep that uncertainty as a range check, not a read row.
  return "possible";
}

export function directoryAttentionKey(event: PlatformEvent): string | null {
  const impact = directoryAttentionImpact(event);
  if (impact === "none") return null;
  const groupId = String(event.payload.groupId);
  return impact === "changed" ? groupId : `range:${groupId}`;
}
