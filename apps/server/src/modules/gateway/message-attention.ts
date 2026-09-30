import { emit, type Queryable } from "../../core/db.js";
import type { MessageRow } from "./models.js";

/** Recheck only persisted inbound candidates tied to this outbox transition. */
export async function resolveMessageAttention(
  tx: Queryable,
  outbound: MessageRow,
): Promise<void> {
  if (!outbound.client_msg_id) return;
  const pending = await tx.query<MessageRow>(
    "SELECT * FROM messages WHERE group_id=$1 AND sender_platform_user_id=$2 AND text=$3 AND client_msg_id IS NULL AND metadata->'attentionPendingClientMsgIds' ? $4 ORDER BY id FOR UPDATE",
    [
      outbound.group_id,
      outbound.sender_platform_user_id,
      outbound.text,
      outbound.client_msg_id,
    ],
  );
  for (const inbound of pending.rows) {
    const ids = inbound.metadata.attentionPendingClientMsgIds;
    if (
      !Array.isArray(ids) ||
      !ids.every((id): id is string => typeof id === "string")
    )
      continue;
    const candidates = await tx.query<MessageRow>(
      "SELECT * FROM messages WHERE client_msg_id=ANY($1::text[])",
      [ids],
    );
    // Missing evidence is not proof of independence. Another unresolved same-text
    // send keeps the candidate pending; a matching echo is merged by recordSent.
    // Cancellation after dispatch is not evidence that the gateway never accepted
    // the send. Keep that case pending until an authoritative remote ID is known.
    if (
      candidates.rows.length !== ids.length ||
      !candidates.rows.every(
        (candidate) =>
          (candidate.msg_id !== null && candidate.msg_id !== inbound.msg_id) ||
          (candidate.msg_id === null &&
            (candidate.delivery_status === "failed" ||
              (candidate.delivery_status === "cancelled" &&
                candidate.attempts === 0))),
      )
    )
      continue;
    await tx.query(
      "UPDATE messages SET metadata=metadata-'attentionPendingClientMsgIds' WHERE id=$1",
      [inbound.id],
    );
    // Identity resolution is a new synchronization event, not a new creation.
    // Preserve the original committed boundary so newly opened scopes ignore it.
    const original = (
      await tx.query<{ seq: string }>(
        "SELECT seq FROM events WHERE type='message' AND payload->>'id'=$1 AND payload->>'changeKind'='created' ORDER BY seq LIMIT 1",
        [inbound.id],
      )
    ).rows[0];
    await emit(tx, "message", {
      ...(original ? { attentionCreatedSeq: Number(original.seq) } : {}),
      changeKind: "created",
      attentionIdentity: "confirmed",
      source: "gateway",
      groupId: inbound.group_id,
      id: inbound.id,
      msgId: inbound.msg_id,
      isOwn: inbound.is_own,
    });
  }
}
