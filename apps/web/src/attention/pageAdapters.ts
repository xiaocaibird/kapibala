import type {
  PlatformEvent,
  Account,
  AgentRun,
  SequenceRun,
} from "../api/schemas";

export function eventEntity(
  event: PlatformEvent,
  types: readonly string[],
  field: string,
): string | null {
  const value = event.payload[field];
  return types.includes(event.type) && typeof value === "string" ? value : null;
}

export function groupFields(
  event: PlatformEvent,
  groupId: string,
  fields: readonly string[],
): boolean {
  if (event.type !== "group_changed" || event.payload.groupId !== groupId)
    return false;
  const changed = event.payload.changedFields;
  // Older producers carry only invalidation. The rendered projection still decides
  // whether a real business change occurred; no revision-only reminders.
  return (
    !Array.isArray(changed) ||
    changed.some((field) => typeof field === "string" && fields.includes(field))
  );
}

export function messageKey(
  event: PlatformEvent,
  groupId: string,
): string | null {
  if (
    event.type !== "message" ||
    event.payload.groupId !== groupId ||
    event.payload.changeKind !== "created" ||
    event.payload.attentionIdentity === "pending"
  )
    return null;
  return typeof event.payload.id === "string" ? event.payload.id : null;
}

export function agentStepKey(
  event: PlatformEvent,
  runId: string,
): string | null {
  return event.type === "agent_step_changed" &&
    event.payload.runId === runId &&
    typeof event.payload.ordinal === "number"
    ? String(event.payload.ordinal)
    : null;
}

export function sequenceStepKey(
  event: PlatformEvent,
  runId: string,
): string | null {
  return event.type === "sequence_step_changed" &&
    event.payload.runId === runId &&
    typeof event.payload.stepIndex === "number"
    ? String(event.payload.stepIndex)
    : null;
}

export const accountVersion = (account: Account): string =>
  JSON.stringify([
    account.status,
    account.platformUserId,
    account.rateLimitedUntil,
  ]);
export const runVersion = (run: AgentRun): string =>
  JSON.stringify([run.status, run.endReason, run.summary, run.recoveryNote]);
export const sequenceStatusVersion = (run: SequenceRun | null): string =>
  JSON.stringify(run ? [run.status, run.currentStepIndex] : null);

/** Retain only business events used by the mounted page adapters. */
export function acceptsAgentListEvent(
  event: PlatformEvent,
  groupId: string,
): boolean {
  return (
    Boolean(groupId) &&
    event.payload.groupId === groupId &&
    ["group_changed", "agent_run"].includes(event.type)
  );
}

export function acceptsSequencePageEvent(
  event: PlatformEvent,
  groupId: string,
): boolean {
  // The choice list is itself current-page content, including newly created choices.
  if (event.type === "sequence_definition_changed") return true;
  return (
    Boolean(groupId) &&
    event.payload.groupId === groupId &&
    ["group_changed", "sequence_run", "sequence_step_changed"].includes(
      event.type,
    )
  );
}

export function definitiveAgentListEvent(event: PlatformEvent): boolean {
  return (
    event.type === "agent_run" &&
    (event.payload.status !== "running" || !event.payload.recoveryNote)
  );
}

export function definitiveSequenceSelectionEvent(
  event: PlatformEvent,
): boolean {
  return (
    (event.type === "group_changed" &&
      Array.isArray(event.payload.changedFields) &&
      event.payload.changedFields.some(
        (field) => field === "name" || field === "status",
      )) ||
    (event.type === "sequence_run" &&
      event.payload.status === "running" &&
      event.payload.currentStepIndex === 1)
  );
}

export function definitiveSenderAvailabilityEvent(
  event: PlatformEvent,
): boolean {
  const displayed = (status: unknown) =>
    status === "online" || status === "rate_limited" ? status : "unavailable";
  return (
    event.type === "account_status_changed" &&
    displayed(event.payload.from) !== displayed(event.payload.to)
  );
}
