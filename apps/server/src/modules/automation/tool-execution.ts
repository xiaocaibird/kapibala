import type { AppContext } from "../../core/context.js";
import { emit, currentOperationSignal, type Queryable } from "../../core/db.js";
import { AppError, RemoteError } from "../../core/errors.js";
import type { MessagingService } from "../../core/messaging.js";
import type {
  AgentRun,
  Message,
} from "../../../../../packages/contracts/src/index.js";
import {
  auditSchema,
  toolError,
  validateTool,
  type ToolOutcome,
  type ToolUse,
} from "./protocol.js";
import type { GroupRow, RecentRow, RunRow, StepRow } from "./types.js";

export interface ToolExecutionHost {
  completeStep(
    run: RunRow,
    step: StepRow,
    outcome: ToolOutcome,
    endReason?: "audit_blocked",
  ): Promise<void>;
  finishAfterStep(run: RunRow, text: string): Promise<void>;
  remaining(run: RunRow): number;
  finish(
    run: RunRow,
    status: AgentRun["status"],
    reason: string,
  ): Promise<void>;
  pause(run: RunRow, reason: string): Promise<void>;
  readRun(id: string): Promise<RunRow | undefined>;
}
const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Tool policy and side effects operate only through persisted orchestration hooks. */
export class AgentTools {
  constructor(
    private readonly ctx: AppContext,
    private readonly messaging: MessagingService,
    private readonly host: ToolExecutionHost,
  ) {}
  async executeStep(run: RunRow, step: StepRow): Promise<void> {
    const tool: ToolUse = {
      type: "tool_use",
      id: step.tool_use_id!,
      name: step.name!,
      input: step.input,
    };
    const validationCode = validateTool(tool);
    if (validationCode) {
      await this.host.completeStep(
        run,
        step,
        toolError(validationCode, "Tool input or name is invalid."),
      );
      return;
    }
    if (step.name === "finish") {
      const input = step.input as { summary: string };
      await this.host.completeStep(run, step, { value: { ok: true } });
      await this.host.finishAfterStep(run, input.summary);
      return;
    }
    if (step.name === "get_recent_messages") {
      await this.host.completeStep(
        run,
        step,
        await this.recent(run, step.input as { limit: number }),
      );
      return;
    }
    if (step.name === "send_message") {
      await this.send(run, step);
      return;
    }
    await this.kick(run, step);
  }
  private async recent(
    run: RunRow,
    input: { limit: number },
  ): Promise<ToolOutcome> {
    const rows = (
      await this.ctx.db.query<RecentRow>(
        "SELECT msg_id,sender_platform_user_id,is_own,text,sent_at FROM messages WHERE group_id=$1 ORDER BY sent_at DESC,id DESC LIMIT $2",
        [run.group_id, Math.min(input.limit, 50)],
      )
    ).rows.reverse();
    let truncated = false;
    const messages = rows.map((row) => {
      const chars = [...row.text];
      if (chars.length > 500) truncated = true;
      return {
        msgId: row.msg_id,
        senderPlatformUserId: row.sender_platform_user_id,
        isOwn: row.is_own,
        text: chars.slice(0, 500).join(""),
        sentAt: row.sent_at.toISOString(),
      };
    });
    while (Buffer.byteLength(JSON.stringify({ messages, truncated })) > 8192) {
      truncated = true;
      const longest = messages.reduce((a, b) =>
        a.text.length > b.text.length ? a : b,
      );
      if (longest.text.length > 20)
        longest.text = longest.text.slice(
          0,
          Math.floor(longest.text.length / 2),
        );
      else messages.shift();
    }
    return { value: { messages, truncated } };
  }
  private async audit(
    run: RunRow,
    step: StepRow,
    text: string,
  ): Promise<"pass" | "fail" | "blocked" | "expired"> {
    if (step.audit_verdict === "pass" || step.audit_verdict === "fail")
      return step.audit_verdict;
    let attempts = step.audit_attempts;
    while (attempts < 3) {
      const current = (await this.host.readRun(run.id))!;
      const left = this.host.remaining(current);
      if (left <= 0) {
        await this.host.finish(current, "failed", "wall_clock");
        return "expired";
      }
      attempts++;
      await this.ctx.db.query(
        "UPDATE agent_steps SET state='auditing',audit_attempts=$3 WHERE run_id=$1 AND ordinal=$2",
        [run.id, step.ordinal, attempts],
      );
      let verdict: "pass" | "fail" | undefined;
      const operation = currentOperationSignal();
      const timeout = AbortSignal.timeout(Math.min(5000, Math.max(1, left)));
      try {
        const response = await fetch(`${this.ctx.agent.baseUrl}/agent/audit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, groupId: run.group_id }),
          signal: operation ? AbortSignal.any([timeout, operation]) : timeout,
        });
        const raw = await response.text();
        const parsed = response.ok
          ? auditSchema.safeParse(JSON.parse(raw) as unknown)
          : null;
        if (parsed?.success) verdict = parsed.data.verdict;
      } catch {
        operation?.throwIfAborted(); /* An uncertain audit response grants no permission. */
      }
      operation?.throwIfAborted();
      if (verdict) {
        await this.ctx.db.transaction(async (tx) => {
          await tx.query(
            "UPDATE agent_steps SET audit_verdict=$3,state='ready' WHERE run_id=$1 AND ordinal=$2",
            [run.id, step.ordinal, verdict],
          );
          if (step.audit_verdict !== verdict)
            await emit(tx, "agent_step_changed", {
              runId: run.id,
              groupId: run.group_id,
              ordinal: step.ordinal,
              changedFields: ["auditVerdict"],
            });
        });
        return verdict;
      }
    }
    await this.host.completeStep(
      run,
      step,
      toolError(
        "AUDIT_REJECTED",
        "Audit service returned no conclusive verdict after three attempts.",
        "The run is blocked; no side effect was executed.",
      ),
      "audit_blocked",
    );
    return "blocked";
  }
  private async send(run: RunRow, step: StepRow): Promise<void> {
    const input = step.input as { text: string; idempotency_key: string };
    const existing = (
      await this.ctx.db.query<{ client_msg_id: string }>(
        "SELECT client_msg_id FROM agent_send_keys WHERE run_id=$1 AND idempotency_key=$2",
        [run.id, input.idempotency_key],
      )
    ).rows[0];
    if (existing) {
      await this.host.completeStep(
        run,
        step,
        await this.delivery(existing.client_msg_id, run),
      );
      return;
    }
    const verdict = await this.audit(run, step, input.text);
    if (verdict === "blocked" || verdict === "expired") return;
    if (verdict === "fail") {
      await this.host.completeStep(
        run,
        step,
        toolError("AUDIT_REJECTED", "Message was rejected by audit."),
      );
      return;
    }
    if (this.host.remaining(run) <= 0) {
      await this.host.finish(run, "failed", "wall_clock");
      return;
    }
    let outcome: ToolOutcome | undefined;
    let clientMsgId: string | undefined;
    await this.ctx.db.transaction(async (tx) => {
      const group = (
        await tx.query<GroupRow>(
          "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
          [run.group_id],
        )
      ).rows[0];
      if (group?.status !== "active") {
        outcome = toolError("GROUP_UNREACHABLE", "Group is not writable.");
        return;
      }
      const account = await this.account(run.group_id, false, tx);
      if (!account) {
        outcome = toolError(
          "NO_AVAILABLE_ACCOUNT",
          "No online group member can send.",
        );
        return;
      }
      try {
        const message = await this.messaging.enqueueSend(
          {
            groupId: run.group_id,
            accountId: account,
            text: input.text,
            source: "agent",
            sourceRef: `${run.id}:${step.ordinal}`,
          },
          tx,
        );
        clientMsgId = message.clientMsgId!;
        await tx.query(
          "INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES($1,$2,$3)",
          [run.id, input.idempotency_key, clientMsgId],
        );
        await tx.query(
          "UPDATE agent_steps SET state='executing',intent=$3 WHERE run_id=$1 AND ordinal=$2",
          [run.id, step.ordinal, JSON.stringify({ accountId: account })],
        );
      } catch (error) {
        if (
          error instanceof AppError &&
          ["ACCOUNT_UNAVAILABLE", "ACCOUNT_NOT_IN_GROUP"].includes(error.code)
        )
          outcome = toolError(
            "SEND_FAILED",
            "Selected account became unavailable.",
          );
        else throw error;
      }
    });
    await this.host.completeStep(
      run,
      step,
      outcome ?? (await this.delivery(clientMsgId!, run)),
    );
  }
  private async delivery(
    clientMsgId: string,
    run: RunRow,
  ): Promise<ToolOutcome> {
    const deadline = Date.now() + Math.min(5000, this.host.remaining(run));
    let message: Message | null = null;
    do {
      message = await this.messaging.getMessage(clientMsgId);
      const account = (
        await this.ctx.db.query<{ status: string }>(
          "SELECT a.status FROM messages m JOIN accounts a ON a.id=m.account_id WHERE m.client_msg_id=$1",
          [clientMsgId],
        )
      ).rows[0];
      if (
        message?.deliveryStatus !== "sent" &&
        account &&
        ["suspended", "session_expired"].includes(account.status)
      )
        return toolError(
          "SEND_FAILED",
          "The sending account entered a terminal state before delivery completed.",
        );
      if (
        message &&
        ["accepted", "sent"].includes(message.deliveryStatus ?? "")
      )
        return {
          value: { clientMsgId, deliveryStatus: message.deliveryStatus },
        };
      if (
        message &&
        ["failed", "cancelled"].includes(message.deliveryStatus ?? "")
      )
        return toolError(
          message.failCode === "GROUP_UNREACHABLE" ||
            message.failCode === "GROUP_WRITE_FORBIDDEN"
            ? "GROUP_UNREACHABLE"
            : "SEND_FAILED",
          message.failCode ?? "Message could not be sent.",
        );
      await sleep(100);
    } while (Date.now() < deadline);
    return toolError(
      "SEND_TIMEOUT",
      "Delivery could not be confirmed within five seconds.",
      "Retrying this idempotency key reads the same outbound message.",
    );
  }
  private async account(
    groupId: string,
    elevated: boolean,
    tx: Queryable = this.ctx.db,
  ): Promise<string | undefined> {
    return (
      await tx.query<{ id: string }>(
        `SELECT a.id FROM members m JOIN accounts a ON a.id=m.account_id WHERE m.group_id=$1 AND a.status='online' AND (NOT $2::boolean OR m.role IN ('creator','admin')) ORDER BY CASE WHEN m.role='admin' THEN 0 WHEN m.role='creator' THEN 1 ELSE 2 END,a.id LIMIT 1`,
        [groupId, elevated],
      )
    ).rows[0]?.id;
  }
  private async kick(run: RunRow, step: StepRow): Promise<void> {
    const input = step.input as { platform_user_id: string; reason: string };
    if (step.state === "executing") {
      await this.host.pause(
        run,
        "A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.",
      );
      return;
    }
    const group = (
      await this.ctx.db.query<GroupRow>("SELECT * FROM groups WHERE id=$1", [
        run.group_id,
      ])
    ).rows[0];
    if (group?.status !== "active") {
      await this.host.completeStep(
        run,
        step,
        toolError("GROUP_UNREACHABLE", "Group is not writable."),
      );
      return;
    }
    if (!group.auto_kick_enabled) {
      await this.host.completeStep(
        run,
        step,
        toolError("POLICY_DENIED", "Automatic member removal is disabled."),
      );
      return;
    }
    const verdict = await this.audit(
      run,
      step,
      JSON.stringify({
        action: "kick",
        platform_user_id: input.platform_user_id,
        reason: input.reason,
      }),
    );
    if (verdict === "blocked" || verdict === "expired") return;
    if (verdict === "fail") {
      await this.host.completeStep(
        run,
        step,
        toolError("AUDIT_REJECTED", "Member removal was rejected by audit."),
      );
      return;
    }
    if (this.host.remaining(run) <= 0) {
      await this.host.finish(run, "failed", "wall_clock");
      return;
    }
    let accountId: string | undefined;
    let denied: ToolOutcome | undefined;
    await this.ctx.db.transaction(async (tx) => {
      const currentGroup = (
        await tx.query<GroupRow>(
          "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
          [run.group_id],
        )
      ).rows[0];
      if (currentGroup?.status !== "active") {
        denied = toolError("GROUP_UNREACHABLE", "Group is not writable.");
        return;
      }
      if (!currentGroup.auto_kick_enabled) {
        denied = toolError(
          "POLICY_DENIED",
          "Automatic member removal was disabled.",
        );
        return;
      }
      accountId = await this.account(run.group_id, true, tx);
      if (!accountId) {
        denied = toolError(
          "NO_AVAILABLE_ACCOUNT",
          "No online administrator is available.",
        );
        return;
      }
      await tx.query(
        "UPDATE agent_steps SET state='executing',intent=$3 WHERE run_id=$1 AND ordinal=$2",
        [
          run.id,
          step.ordinal,
          JSON.stringify({
            accountId,
            targetPlatformUserId: input.platform_user_id,
          }),
        ],
      );
    });
    if (denied) {
      await this.host.completeStep(run, step, denied);
      return;
    }
    const deadline = AbortSignal.timeout(Math.max(1, this.host.remaining(run)));
    try {
      await this.messaging.kick(
        {
          groupId: run.group_id,
          accountId: accountId!,
          targetPlatformUserId: input.platform_user_id,
        },
        { signal: deadline },
      );
    } catch (error) {
      currentOperationSignal()?.throwIfAborted();
      if (deadline.aborted) {
        // Budget exhaustion ends the run, not the uncertain external effect. Keep
        // its intent as executing so a later process can never replay this kick.
        await this.ctx.db.transaction(async (tx) => {
          await tx.query(
            "UPDATE agent_steps SET result_summary=$3 WHERE run_id=$1 AND ordinal=$2",
            [
              run.id,
              step.ordinal,
              "Activity budget ended while the kick outcome remained unknown; this intent is not replayed.",
            ],
          );
          await emit(tx, "agent_step_changed", {
            runId: run.id,
            groupId: run.group_id,
            ordinal: step.ordinal,
            changedFields: ["resultSummary"],
          });
        });
        await this.host.pause(
          run,
          "The activity budget expired during a kick. Its external result remains unknown and the saved intent will not be replayed.",
        );
        await this.host.finish(run, "failed", "wall_clock");
        return;
      }
      const code =
        error instanceof RemoteError || error instanceof AppError
          ? error.code
          : "UNKNOWN";
      if (
        (error instanceof RemoteError && error.status >= 500) ||
        [
          "NETWORK_TIMEOUT",
          "UNKNOWN",
          "KICK_UNKNOWN",
          "HTTP_503",
          "SERVICE_UNAVAILABLE",
        ].includes(code)
      ) {
        await this.host.pause(
          run,
          "The dispatched kick has no provable outcome; automatic replay is paused.",
        );
        return;
      }
      const mapped = [
        "OWNER_LEFT",
        "NO_PERMISSION",
        "GROUP_UNREACHABLE",
      ].includes(code)
        ? code
        : "SEND_FAILED";
      await this.host.completeStep(run, step, toolError(mapped, code));
      return;
    }
    await this.host.completeStep(run, step, { value: { kicked: true } });
  }
}
