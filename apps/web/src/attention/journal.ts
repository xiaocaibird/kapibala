import type { PlatformEvent } from "../api/schemas";

export interface ScopedEvent {
  event: PlatformEvent;
  backgroundSeq: number;
}

function identity(event: PlatformEvent): string {
  return JSON.stringify([
    event.type,
    event.payload.id ??
      event.payload.accountId ??
      event.payload.jobId ??
      event.payload.runId ??
      event.payload.sequenceId ??
      event.payload.groupId ??
      event.seq,
    event.payload.ordinal ?? event.payload.stepIndex ?? "",
    event.payload.changeKind ?? "",
    Array.isArray(event.payload.changedFields)
      ? (event.payload.changedFields[0] ?? null)
      : null,
  ]);
}

/** Preserve each changed field's original sequence. Promoting an old field to a
 * later unrelated event would revive an already confirmed region. Keeping one
 * latest entry per field also lets targets mounted after first load see changes. */
export function retainLatest(
  items: ScopedEvent[],
  next: ScopedEvent,
): ScopedEvent[] {
  const fields = Array.isArray(next.event.payload.changedFields)
    ? [
        ...new Set(
          next.event.payload.changedFields.filter(
            (field): field is string => typeof field === "string",
          ),
        ),
      ]
    : [];
  const entries: ScopedEvent[] = fields.length
    ? fields.map((field) => ({
        ...next,
        event: {
          ...next.event,
          payload: { ...next.event.payload, changedFields: [field] },
        },
      }))
    : [next];
  const retained = new Map(items.map((item) => [identity(item.event), item]));
  for (const entry of entries) {
    const key = identity(entry.event);
    const previous = retained.get(key);
    if (previous && previous.event.seq >= entry.event.seq) continue;
    retained.set(key, {
      ...entry,
      backgroundSeq: Math.max(
        previous?.backgroundSeq ?? -1,
        entry.backgroundSeq,
      ),
    });
  }
  // Targets can observe more than one field; keep their consumption monotonic.
  return [...retained.values()].sort(
    (left, right) => left.event.seq - right.event.seq,
  );
}
