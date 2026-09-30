import type { AccountStatus } from "../../../../../packages/contracts/src/index.js";
import { emit, type Queryable } from "../../core/db.js";
import { AppError } from "../../core/errors.js";
import {
  type AccountRow,
  type MessageRow,
  isTerminal,
  transitions,
} from "./models.js";
import { resolveMessageAttention } from "./message-attention.js";

/** All terminal consequences commit together. Events never describe an uncommitted state. */
export async function changeAccount(
  tx: Queryable,
  accountId: string,
  to: AccountStatus,
  expectedFrom?: AccountStatus,
  rateUntil?: Date,
): Promise<AccountRow> {
  const account = (
    await tx.query<AccountRow>(
      "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
      [accountId],
    )
  ).rows[0];
  if (!account) throw new AppError(404, "ACCOUNT_NOT_FOUND", "账号不存在");
  if (expectedFrom !== undefined) {
    if (!transitions[expectedFrom].includes(to))
      throw new AppError(409, "ILLEGAL_TRANSITION", "不允许此状态转移");
    if (account.status !== expectedFrom)
      throw new AppError(409, "CAS_CONFLICT", "账号状态已经变化，请刷新后重试");
  } else {
    if (isTerminal(account.status)) return account;
    if (account.status === to && to !== "rate_limited") return account;
    if (account.status !== to && !transitions[account.status].includes(to))
      return account;
  }
  const updated = (
    await tx.query<AccountRow>(
      "UPDATE accounts SET status=$2,rate_limited_until=$3,updated_at=now() WHERE id=$1 RETURNING *",
      [
        accountId,
        to,
        to === "rate_limited"
          ? (rateUntil ?? new Date(Date.now() + 1000))
          : null,
      ],
    )
  ).rows[0]!;
  if (isTerminal(to)) {
    const affectedGroups = await tx.query<{ group_id: string }>(
      "DELETE FROM members WHERE account_id=$1 RETURNING group_id",
      [accountId],
    );
    for (const group of affectedGroups.rows)
      await emit(tx, "group_changed", {
        groupId: group.group_id,
        changedFields: ["members"],
      });
    const cancelled = await tx.query<MessageRow>(
      "UPDATE messages SET delivery_status='cancelled',fail_code='ACCOUNT_TERMINAL',dispatch_state='done',updated_at=now() WHERE account_id=$1 AND delivery_status='queued' RETURNING *",
      [accountId],
    );
    const skipped = await tx.query<{ run_id: string; index: number }>(
      "UPDATE sequence_steps SET status='skipped',sent_at=now() WHERE client_msg_id IN (SELECT client_msg_id FROM messages WHERE account_id=$1 AND delivery_status='cancelled' AND fail_code='ACCOUNT_TERMINAL') AND status IN ('pending','accepted') RETURNING run_id,index",
      [accountId],
    );
    for (const step of skipped.rows) {
      const run = (
        await tx.query<{ group_id: string }>(
          "SELECT group_id FROM sequence_runs WHERE id=$1",
          [step.run_id],
        )
      ).rows[0]!;
      await emit(tx, "sequence_step_changed", {
        runId: step.run_id,
        groupId: run.group_id,
        stepIndex: step.index,
        changedFields: ["status", "sentAt"],
      });
    }
    for (const message of cancelled.rows)
      await resolveMessageAttention(tx, message);
    await emit(tx, "account_terminal", { accountId, status: to });
  }
  if (account.status !== to)
    await emit(tx, "account_status_changed", {
      accountId,
      from: account.status,
      to,
    });
  if (
    account.status === to &&
    account.rate_limited_until?.getTime() !==
      updated.rate_limited_until?.getTime()
  )
    await emit(tx, "account_changed", {
      accountId,
      changedFields: ["rateLimitedUntil"],
    });
  return updated;
}

export async function markGroupUnreachable(
  tx: Queryable,
  groupId: string,
): Promise<void> {
  const changed = await tx.query(
    "UPDATE groups SET status='unreachable' WHERE id=$1 AND status='active' RETURNING id",
    [groupId],
  );
  if (!changed.rowCount) return;
  const cancelled = await tx.query<MessageRow>(
    "UPDATE messages SET delivery_status='cancelled',fail_code='GROUP_UNREACHABLE',dispatch_state='done',updated_at=now() WHERE group_id=$1 AND delivery_status='queued' RETURNING *",
    [groupId],
  );
  await tx.query(
    "UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1 AND status='running'",
    [groupId],
  );
  const runs = await tx.query<{ id: string; current_step_index: number }>(
    "UPDATE sequence_runs SET status='stopped' WHERE group_id=$1 AND status='running' RETURNING id,current_step_index",
    [groupId],
  );
  for (const run of runs.rows)
    await emit(tx, "sequence_run", {
      runId: run.id,
      groupId,
      status: "stopped",
      currentStepIndex: run.current_step_index,
    });
  for (const message of cancelled.rows)
    await resolveMessageAttention(tx, message);
  await emit(tx, "group_changed", {
    groupId,
    status: "unreachable",
    changedFields: ["status"],
  });
}
