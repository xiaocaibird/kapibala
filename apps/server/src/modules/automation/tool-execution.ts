import { randomUUID } from "node:crypto";
import type { ActivityPauseCause } from "../../core/test-activity-observer.js";
import { setTimeout as delay } from "node:timers/promises";
import type { LifecycleFact } from "../../core/test-lifecycle-observer.js";
import type { AppContext } from "../../core/context.js";
import {
  emit,
  currentOperationSignal,
  LockCapacityUnavailableError,
  currentDatabaseDeadline,
  withDatabaseDeadline,
  type Queryable,
} from "../../core/db.js";
import { AppError, RemoteError } from "../../core/errors.js";
import {
  KICK_POST_TIMEOUT_MS,
  KICK_SETTLEMENT_BUDGET_MS,
  KickRejectionPersistenceError,
  type MessagingService,
} from "../../core/messaging.js";
import type { AgentRun } from "../../../../../packages/contracts/src/index.js";
import {
  auditSchema,
  toolError,
  validateTool,
  type ToolOutcome,
  type ToolUse,
} from "./protocol.js";
import type { GroupRow, RecentRow, RunRow, StepRow } from "./types.js";
import { referenceMedia } from "../media-files/index.js";
import { observeDelivery } from "./delivery-observation.js";

export interface ToolExecutionHost {
  completeStep(
    run: RunRow,
    step: StepRow,
    outcome: ToolOutcome,
    endReason?: "audit_blocked",
    executionAttemptId?: string,
  ): Promise<void>;
  finishAfterStep(run: RunRow, text: string): Promise<void>;
  settleAfterKick(run: RunRow): Promise<void>;
  remaining(run: RunRow): number;
  finish(
    run: RunRow,
    status: AgentRun["status"],
    reason: string,
  ): Promise<void>;
  pause(run: RunRow, reason: string, cause: ActivityPauseCause): Promise<void>;
  readRun(id: string): Promise<RunRow | undefined>;
  checkpoint(run: RunRow, phase: string): Promise<void>;
}
const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Only the local, synchronous pre-fetch guard creates this proof. A remote
// error or an abort after dispatch can never establish that no kick was sent.
class KickBudgetExpiredBeforeDispatch extends Error {}

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
    const rows = await this.ctx.db.transaction(async (tx) => {
      const rows = (
        await tx.query<RecentRow>(
          "SELECT msg_id,sender_platform_user_id,is_own,text,sent_at FROM messages WHERE group_id=$1 ORDER BY sent_at DESC,id DESC LIMIT $2",
          [run.group_id, Math.min(input.limit, 50)],
        )
      ).rows.reverse();
      await referenceMedia(
        tx,
        run.id,
        run.group_id,
        rows.map((row) => row.msg_id),
      );
      return rows;
    });
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
    executionAttemptId?: string,
  ): Promise<"pass" | "fail" | "blocked" | "expired"> {
    if (step.audit_verdict === "pass" || step.audit_verdict === "fail")
      return step.audit_verdict;
    let attempts = step.audit_attempts;
    while (attempts < 3) {
      await this.host.checkpoint(run, "audit:before");
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
      const body = JSON.stringify({ text, groupId: run.group_id });
      // The durable attempt write and serialization may exhaust the original
      // deadline. Their time cannot be granted again to the HTTP request.
      const dispatchRemaining = this.host.remaining(current);
      if (dispatchRemaining <= 0) {
        await this.host.finish(current, "failed", "wall_clock");
        return "expired";
      }
      let verdict: "pass" | "fail" | undefined;
      const operation = currentOperationSignal();
      const timeout = AbortSignal.timeout(
        Math.min(5000, Math.max(1, dispatchRemaining)),
      );
      try {
        const response = await fetch(`${this.ctx.agent.baseUrl}/agent/audit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
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
      // A received pass is not usable until its elapsed wait is durably billed.
      // Infrastructure failure must escape rather than consume another attempt.
      await this.host.checkpoint(run, "audit:after");
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
        "This tool was blocked before its side effect; earlier completed steps are not rolled back.",
      ),
      "audit_blocked",
      executionAttemptId,
    );
    return "blocked";
  }
  private async send(run: RunRow, step: StepRow): Promise<void> {
    const input = step.input as { text: string; idempotency_key: string };
    const fact = {
      groupId: run.group_id,
      runId: run.id,
      stepId: `${run.id}:${step.ordinal}`,
      toolUseId: step.tool_use_id!,
      attemptId: this.ctx.testLifecycleObserver ? randomUUID() : "",
      idempotencyKey: input.idempotency_key,
    };
    const observe = (kind: string, fields: Record<string, unknown> = {}) => {
      try {
        this.ctx.testLifecycleObserver?.record({ ...fact, kind, ...fields });
      } catch {
        // Evidence failure cannot prevent saving, turn a successful save into
        // failure, or replace the host's original persistence error.
      }
    };
    observe("send-tool-entered");
    const complete = async (outcome: ToolOutcome) => {
      observe("send-tool-history-save-started");
      try {
        await this.host.completeStep(
          run,
          step,
          outcome,
          undefined,
          fact.attemptId,
        );
        // This is the caller's return, not a fabricated transaction COMMIT.
        // The actual host emits its existing send-tool-history-committed fact.
        observe("send-tool-history-save-returned");
      } catch (error) {
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        observe("send-tool-history-save-failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          ...(typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
            ? { sqlState: code }
            : {}),
        });
        throw error;
      }
    };
    const deliver = async (clientMsgId: string, keyReused: boolean) => {
      observe("send-key-resolved", { clientMsgId, keyReused });
      const result = await this.delivery(clientMsgId, run, fact);
      // delivery() has actually resolved to its caller. The history transaction
      // has not started, and no subsequent turn is used as this endpoint.
      observe("send-tool-result-returned", {
        clientMsgId,
        errorCode: result.errorCode ?? null,
        result: result.value,
      });
      return result;
    };
    const existing = (
      await this.ctx.db.query<{ client_msg_id: string }>(
        "SELECT client_msg_id FROM agent_send_keys WHERE run_id=$1 AND idempotency_key=$2",
        [run.id, input.idempotency_key],
      )
    ).rows[0];
    if (existing) {
      await complete(await deliver(existing.client_msg_id, true));
      return;
    }
    observe("send-audit-started");
    const verdict = await this.audit(run, step, input.text, fact.attemptId);
    observe("send-audit-completed", { verdict });
    if (verdict === "blocked" || verdict === "expired") return;
    if (verdict === "fail") {
      await complete(
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
    await complete(outcome ?? (await deliver(clientMsgId!, false)));
  }
  private async delivery(
    clientMsgId: string,
    run: RunRow,
    fact: Omit<LifecycleFact, "kind">,
  ): Promise<ToolOutcome> {
    this.ctx.testLifecycleObserver?.record({
      ...fact,
      kind: "send-wait-started",
      groupId: run.group_id,
      attemptId: String(fact.attemptId),
      clientMsgId,
    });
    const outcome = await this.waitForDelivery(clientMsgId, run, fact);
    this.ctx.testLifecycleObserver?.record({
      ...fact,
      kind: "send-wait-result-ready",
      groupId: run.group_id,
      attemptId: String(fact.attemptId),
      clientMsgId,
      errorCode: outcome.errorCode ?? null,
    });
    return outcome;
  }
  private async waitForDelivery(
    clientMsgId: string,
    run: RunRow,
    fact: Omit<LifecycleFact, "kind">,
  ): Promise<ToolOutcome> {
    const deadline =
      performance.now() + Math.min(5000, this.host.remaining(run));
    while (performance.now() < deadline) {
      const observation = await observeDelivery(
        this.ctx.db,
        deadline,
        async (reader) => {
          const message = await this.messaging.getMessage(clientMsgId, reader);
          // A timely confirmed send is final even if the account later becomes
          // terminal. Never make it wait for an unrelated account lock.
          if (message?.deliveryStatus === "sent")
            return { value: { clientMsgId, deliveryStatus: "sent" } };
          const account = (
            await reader.query<{ status: string }>(
              "SELECT a.status FROM messages m JOIN accounts a ON a.id=m.account_id WHERE m.client_msg_id=$1",
              [clientMsgId],
            )
          ).rows[0];
          if (
            account &&
            ["suspended", "session_expired"].includes(account.status)
          )
            return toolError(
              "SEND_FAILED",
              "The sending account entered a terminal state before delivery completed.",
            );
          if (message?.deliveryStatus === "accepted")
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
          return undefined;
        },
        this.ctx.testLifecycleObserver
          ? (event) =>
              this.ctx.testLifecycleObserver!.record({
                ...fact,
                groupId: run.group_id,
                attemptId: String(fact.attemptId),
                clientMsgId,
                ...event,
              })
          : undefined,
      );
      // A local read timeout gives no new delivery fact. Keep the original
      // observation window and idempotency key; never fail the stored message.
      // Timeliness was fixed before cleanup; a late successful ROLLBACK
      // cannot change an already observed sent/accepted/failure into unknown.
      if (observation.status === "observed" && observation.value)
        return observation.value;
      if (performance.now() >= deadline) break;
      const left = deadline - performance.now();
      if (left > 0) await sleep(Math.min(100, left));
    }
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
    // This scope bounds only this kick's local database work. The external work
    // signal below never becomes an ownership signal or cancels finalization.
    await withDatabaseDeadline(
      performance.now() + this.host.remaining(run),
      () => this.kickWithinBudget(run, step),
    );
  }
  private async kickWithinBudget(run: RunRow, step: StepRow): Promise<void> {
    const input = step.input as { platform_user_id: string; reason: string };
    if (
      step.state === "executing" &&
      step.intent?.dispatchState !== "awaiting_admission"
    ) {
      await this.host.pause(
        run,
        "A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.",
        "unrecorded-kick-response",
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
            dispatchState: "awaiting_admission",
          }),
        ],
      );
    });
    if (denied) {
      await this.host.completeStep(run, step, denied);
      return;
    }
    const remaining = Math.max(
      0,
      Math.floor(
        Math.min(
          this.host.remaining(run),
          currentDatabaseDeadline()! - performance.now(),
        ),
      ),
    );
    // Admit only a first POST that can receive its existing timeout window.
    // Policy/account checks retain precedence. Allocate real time for local
    // finalization without changing the total run clock or the POST timeout.
    if (remaining < KICK_POST_TIMEOUT_MS + KICK_SETTLEMENT_BUDGET_MS) {
      await this.host.finish(run, "failed", "wall_clock");
      return;
    }
    const hardDeadline = AbortSignal.timeout(remaining);
    const workBudgetMs = remaining - KICK_SETTLEMENT_BUDGET_MS;
    const deadline = AbortSignal.timeout(workBudgetMs);
    const observation = this.ctx.testLifecycleObserver
      ? {
          groupId: run.group_id,
          runId: run.id,
          toolUseId: step.tool_use_id!,
          stepId: `${run.id}:${step.ordinal}`,
          attemptId: randomUUID(),
          signalSource: "kick-work-budget" as const,
        }
      : undefined;
    const observeBudgetAbort = (
      source: "activity-budget" | "kick-work-budget",
    ) => {
      if (!observation) return;
      try {
        const before = performance.now();
        const signalObservedAtMonoNs = process.hrtime.bigint().toString();
        const after = performance.now();
        this.ctx.testLifecycleObserver?.record({
          ...observation,
          kind:
            source === "activity-budget"
              ? "kick-budget-signal-aborted"
              : "kick-work-budget-signal-aborted",
          signalObservedAtMonoNs,
          signalObservedWindowMs: [before, after],
          budgetMs: remaining,
          workBudgetMs,
          settlementBudgetMs: KICK_SETTLEMENT_BUDGET_MS,
          signalSource: source,
          source,
        });
      } catch {
        /* A test observer cannot change cancellation handling. */
      }
    };
    const budgetAborted = () => observeBudgetAbort("activity-budget");
    const workBudgetAborted = () => observeBudgetAbort("kick-work-budget");
    if (observation) {
      hardDeadline.addEventListener("abort", budgetAborted, { once: true });
      deadline.addEventListener("abort", workBudgetAborted, { once: true });
    }
    const assertDispatchAllowed = () => {
      currentOperationSignal()?.throwIfAborted();
      if (
        Math.min(
          this.host.remaining(run),
          currentDatabaseDeadline()! - performance.now(),
        ) <
        KICK_POST_TIMEOUT_MS + KICK_SETTLEMENT_BUDGET_MS
      )
        throw new KickBudgetExpiredBeforeDispatch(
          "Remaining activity budget cannot admit the kick POST and its finalization allocation",
        );
    };
    const correlation = {
      groupId: run.group_id,
      runId: run.id,
      toolUseId: step.tool_use_id!,
      targetPlatformUserId: input.platform_user_id,
    };
    let confirmed = false;
    let successSaved = false;
    try {
      const kick = () =>
        this.messaging.kick(
          {
            groupId: run.group_id,
            accountId: accountId!,
            targetPlatformUserId: input.platform_user_id,
          },
          {
            signal: deadline,
            hardBudgetSignal: hardDeadline,
            workDatabaseDeadline:
              currentDatabaseDeadline()! - KICK_SETTLEMENT_BUDGET_MS,
            observation,
            assertDispatchAllowed,
            afterConfirmation: async () => {
              confirmed = true;
              await this.host.completeStep(run, step, {
                value: { kicked: true },
              });
              successSaved = true;
            },
            beforeDispatch: async () => {
              assertDispatchAllowed();
              deadline.throwIfAborted();
              // This autocommit runs only inside the admitted kick callback.
              // Its acknowledged commit precedes HTTP dispatch; a crash or SQL
              // failure here cannot turn a dispatched intent into replayable work.
              const persisted = await this.ctx.db.query(
                "UPDATE agent_steps SET intent=jsonb_set(intent,'{dispatchState}','\"dispatching\"'::jsonb) WHERE run_id=$1 AND ordinal=$2 AND state='executing' AND intent->>'dispatchState'='awaiting_admission'",
                [run.id, step.ordinal],
              );
              if (persisted.rowCount !== 1)
                throw new Error("Kick dispatch intent was not persisted");
              assertDispatchAllowed();
            },
          },
        );
      if (this.ctx.testExecutionObserver)
        await this.ctx.testExecutionObserver.kick(correlation, kick);
      else await kick();
      confirmed = true;
      if (!successSaved)
        await this.host.completeStep(run, step, { value: { kicked: true } });
      // Keep ordinary post-step cancellation/limit precedence, and any needed
      // terminal COMMIT, inside this kick's original database deadline.
      await this.host.settleAfterKick(run);
    } catch (error) {
      // The remote proof precedes optional projection work. A subsequent local
      // failure cannot turn it into an unknown effect or authorize replay.
      if (confirmed || error instanceof KickRejectionPersistenceError)
        throw error;
      currentOperationSignal()?.throwIfAborted();
      if (error instanceof KickBudgetExpiredBeforeDispatch) {
        // This process knows fetch never started. Retain any committed intent:
        // if this terminal commit fails or the process dies, recovery must not
        // infer this in-memory proof and replay a saved dispatching intent.
        await this.host.finish(run, "failed", "wall_clock");
        return;
      }
      if (error instanceof LockCapacityUnavailableError) {
        // Admission failed before the gateway callback ran. The durable
        // awaiting_admission intent is already safe to resume, even if this
        // process dies before the optional ready cleanup below.
        await this.ctx.testExecutionObserver?.ready(correlation, "before");
        await this.ctx.db.query(
          "UPDATE agent_steps SET state='ready',intent=null WHERE run_id=$1 AND ordinal=$2 AND state='executing' AND intent->>'dispatchState'='awaiting_admission'",
          [run.id, step.ordinal],
        );
        await this.ctx.testExecutionObserver?.ready(correlation, "after");
        await delay(Math.min(50, this.host.remaining(run)), undefined, {
          signal: currentOperationSignal(),
        });
        return;
      }
      const code =
        error instanceof RemoteError || error instanceof AppError
          ? error.code
          : "UNKNOWN";
      const unknown =
        (error instanceof RemoteError && error.status >= 500) ||
        [
          "NETWORK_TIMEOUT",
          "UNKNOWN",
          "KICK_UNKNOWN",
          "HTTP_503",
          "SERVICE_UNAVAILABLE",
        ].includes(code);
      const definiteRejection =
        !unknown &&
        [
          "ACCOUNT_SUSPENDED",
          "SESSION_EXPIRED",
          "GROUP_WRITE_FORBIDDEN",
          "OWNER_LEFT",
          "NO_PERMISSION",
          "GROUP_UNREACHABLE",
          "NO_AVAILABLE_ACCOUNT",
          "SEND_TIMEOUT",
        ].includes(code);
      if (definiteRejection) {
        // A received rejection remains definite even if its local state repair
        // consumed the rest of the work allocation. Save the original mapping.
        const mapped = [
          "OWNER_LEFT",
          "NO_PERMISSION",
          "GROUP_UNREACHABLE",
        ].includes(code)
          ? code
          : "SEND_FAILED";
        await this.host.completeStep(run, step, toolError(mapped, code));
        await this.host.settleAfterKick(run);
        return;
      }
      if (deadline.aborted || hardDeadline.aborted) {
        // The work allocation ends before the total limit, not the uncertain effect. Keep
        // its intent as executing so a later process can never replay this kick.
        await this.ctx.db.transaction(async (tx) => {
          await tx.query(
            "UPDATE agent_steps SET result_summary=$3 WHERE run_id=$1 AND ordinal=$2",
            [
              run.id,
              step.ordinal,
              hardDeadline.aborted
                ? "The original activity limit expired while the kick outcome remained unknown; this intent is not replayed."
                : "Kick work stopped to preserve finalization time within the activity limit; the outcome remains unknown and this intent is not replayed.",
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
          hardDeadline.aborted
            ? "The original activity limit expired during a kick. Its external result remains unknown and the saved intent will not be replayed."
            : "Kick work stopped before the activity limit to reserve finalization time. Its external result remains unknown and the saved intent will not be replayed.",
          hardDeadline.aborted
            ? "kick-budget-exhausted"
            : "kick-work-budget-exhausted",
        );
        await this.host.finish(run, "failed", "wall_clock");
        return;
      }
      if (unknown) {
        await this.host.pause(
          run,
          "The dispatched kick has no provable outcome; automatic replay is paused.",
          "kick-outcome-unknown",
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
    } finally {
      if (observation) {
        hardDeadline.removeEventListener("abort", budgetAborted);
        deadline.removeEventListener("abort", workBudgetAborted);
      }
    }
  }
}
