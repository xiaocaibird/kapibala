import type { PlatformEvent } from "../api/schemas";

/** Current producers emit these only at actual business changes. Page adapters
 * observing a smaller projection can override this classification: e.g. an Agent
 * recovery note changes its detail but not a directory's active-run ID. */
export function isDefinitiveBusinessEvent(event: PlatformEvent): boolean {
  if (
    Array.isArray(event.payload.changedFields) &&
    event.payload.changedFields.some((field) => typeof field === "string")
  )
    return true;
  if (event.type === "account_status_changed")
    return (
      typeof event.payload.from === "string" &&
      typeof event.payload.to === "string" &&
      event.payload.from !== event.payload.to
    );
  if (event.type === "message")
    return (
      event.payload.changeKind === "created" &&
      event.payload.attentionIdentity !== "pending"
    );
  return ["account_terminal", "agent_run", "sequence_run"].includes(event.type);
}
