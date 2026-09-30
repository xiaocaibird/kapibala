import type { Queryable } from "../../apps/server/src/core/db.js";
import { emit } from "../../apps/server/src/core/db.js";
import type { KnownPlatformEvent } from "../../packages/contracts/src/index.js";

// Compile-only contract checks. This function is deliberately never executed.
export function checkEventContracts(
  tx: Queryable,
  event: KnownPlatformEvent,
): void {
  void emit(tx, "account_status_changed", {
    accountId: "a",
    from: "idle",
    to: "online",
  });
  // @ts-expect-error Event names are a closed set for new producers.
  void emit(tx, "account_stats_changed", { accountId: "a" });
  const groupPayload = { groupId: "g", changedFields: ["members"] };
  // @ts-expect-error A different event's payload cannot accompany this name.
  void emit(tx, "account_status_changed", groupPayload);
  // @ts-expect-error The previous state is required.
  void emit(tx, "account_status_changed", { accountId: "a", to: "online" });
  // @ts-expect-error Invalid states cannot be published.
  void emit(tx, "account_status_changed", {
    accountId: "a",
    from: "idle",
    to: "ready",
  });
  // @ts-expect-error Numeric page positions are not message identities.
  void emit(tx, "message", {
    groupId: "g",
    id: 1,
    msgId: null,
    isOwn: true,
    source: "manual",
    changeKind: "created",
  });
  if (event.type === "agent_step_changed") {
    const ordinal: number = event.payload.ordinal;
    void ordinal;
    // @ts-expect-error The discriminant narrows to the agent step payload.
    event.payload.accountId;
  }
}
