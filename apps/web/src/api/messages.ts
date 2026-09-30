import type { Message } from "./schemas";

export function mergeMessages(
  current: Message[],
  incoming: Message[],
  updateExisting = true,
): Message[] {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming)
    if (updateExisting || !merged.has(message.id))
      merged.set(message.id, message);
  return [...merged.values()].sort(
    (left, right) =>
      left.sentAt.localeCompare(right.sentAt) ||
      left.id.localeCompare(right.id),
  );
}
