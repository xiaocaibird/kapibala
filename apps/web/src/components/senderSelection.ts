import type { Account, Group } from "../api/schemas";

export function availableSenders(
  accounts: Account[],
  members: Group["members"],
): Account[] {
  return accounts.filter(
    (account) =>
      members.some((member) => member.accountId === account.id) &&
      ["online", "rate_limited"].includes(account.status),
  );
}

export function resolveSenderSelection(
  accountId: string,
  candidates: Account[],
): string {
  // An existing choice is never replaced by a different service identity.
  return accountId || candidates[0]?.id || "";
}
