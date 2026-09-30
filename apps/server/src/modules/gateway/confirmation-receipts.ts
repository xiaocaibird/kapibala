import type { Database } from "../../core/db.js";

interface ReceiptRow {
  observed_at: Date | null;
}

export async function recordConfirmationReceipt(
  db: Database,
  clientMsgId: string,
  msgId: string,
  eventId: string,
  observedAt: Date,
): Promise<Date | undefined> {
  // Database.query is an independent autocommit operation, not the later
  // business transaction. The first successful record wins across processes;
  // a later writer's earlier wall clock cannot overwrite that reliable record.
  const inserted = await db.query<ReceiptRow>(
    "INSERT INTO message_sent_receipts(client_msg_id,msg_id,observed_at,first_event_id) VALUES($1,$2,$3,$4) ON CONFLICT (client_msg_id,msg_id) DO NOTHING RETURNING observed_at",
    [clientMsgId, msgId, observedAt, eventId],
  );
  if (inserted.rows[0]) return inserted.rows[0].observed_at ?? undefined;
  // Use a new statement snapshot after a concurrent winner commits. NULL is a
  // migrated historical unknown and deliberately stays unknown on every replay.
  const existing = await db.query<ReceiptRow>(
    "SELECT observed_at FROM message_sent_receipts WHERE client_msg_id=$1 AND msg_id=$2",
    [clientMsgId, msgId],
  );
  if (!existing.rows[0])
    throw new Error("Committed confirmation receipt disappeared");
  return existing.rows[0].observed_at ?? undefined;
}
