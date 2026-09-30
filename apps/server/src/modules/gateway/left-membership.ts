import type { Queryable } from "../../core/db.js";

/** Caller holds the group row lock; left groups retain only external facts. */
export async function reconcileLeftMembers(
  tx: Queryable,
  groupId: string,
  gatewayMembers: readonly { platformUserId: string }[],
): Promise<{ changed: boolean; countChanged: boolean }> {
  // Classification uses managed identities even when an account is offline or
  // terminal. A later remote rejoin must not revive a managed member in a left group.
  const externalIds = (
    await tx.query<{ platform_user_id: string }>(
      "SELECT DISTINCT platform_user_id FROM unnest($1::text[]) AS remote(platform_user_id) WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.platform_user_id=remote.platform_user_id)",
      [gatewayMembers.map((member) => member.platformUserId)],
    )
  ).rows.map((row) => row.platform_user_id);
  const beforeCount = Number(
    (
      await tx.query<{ count: string }>(
        "SELECT count(*) FROM members WHERE group_id=$1",
        [groupId],
      )
    ).rows[0]!.count,
  );
  const removed = await tx.query(
    "DELETE FROM members WHERE group_id=$1 AND (account_id IS NOT NULL OR NOT (platform_user_id=ANY($2::text[])))",
    [groupId, externalIds],
  );
  const added = await tx.query(
    "INSERT INTO members(group_id,platform_user_id,role) SELECT $1,unnest($2::text[]),'member' ON CONFLICT(group_id,platform_user_id) DO UPDATE SET account_id=NULL,role='member' WHERE members.account_id IS NOT NULL OR members.role<>'member'",
    [groupId, externalIds],
  );
  return {
    changed: Boolean(removed.rowCount || added.rowCount),
    countChanged: beforeCount !== externalIds.length,
  };
}
