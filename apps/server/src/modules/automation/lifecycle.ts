import { emit, type Queryable } from "../../core/db.js";

/** Automation owns terminal consequences for its tables. Callers retain their
 * existing transaction and domain-lock order; these functions never commit,
 * call a remote service, or schedule asynchronous state changes. */
export async function skipCancelledAccountSequenceSteps(
  tx: Queryable,
  accountId: string,
): Promise<void> {
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
}

export async function requestGroupAgentCancellation(
  tx: Queryable,
  groupId: string,
): Promise<void> {
  await tx.query(
    "UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1 AND status='running'",
    [groupId],
  );
}

export async function stopGroupAutomation(
  tx: Queryable,
  groupId: string,
): Promise<void> {
  await requestGroupAgentCancellation(tx, groupId);
  const runs = await tx.query<{ id: string; current_step_index: number }>(
    "UPDATE sequence_runs SET status='stopped' WHERE group_id=$1 AND status='running' RETURNING id,current_step_index",
    [groupId],
  );
  for (const run of runs.rows)
    await emit(tx, "sequence_run", {
      runId: run.id,
      groupId,
      status: "stopped",
      directoryChangedFields: ["activeSequenceRunId"],
      currentStepIndex: run.current_step_index,
    });
}
