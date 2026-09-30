import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.js";
import { currentOperationSignal, emit, type Queryable } from "../../core/db.js";
import { AppError } from "../../core/errors.js";
import type { MessagingService } from "../../core/messaging.js";
import type { AgentRun } from "../../../../../packages/contracts/src/index.js";
import {
  parseTurn,
  resultContent,
  summary,
  toolError,
  tools,
  truncateUtf8,
  validateTool,
  type ConversationMessage,
  type ToolOutcome,
  type ToolUse,
} from "./protocol.js";
import type { GroupRow, RecentRow, RunRow, StepRow } from "./types.js";
import { AgentTools } from "./tool-execution.js";
import { ActivityClock } from "./activity-clock.js";

function runPublic(run: RunRow): AgentRun {
  return {
    id: run.id,
    groupId: run.group_id,
    status: run.status,
    endReason: run.end_reason,
    summary: run.summary,
    recoveryNote: run.recovery_note,
  };
}
async function notify(tx: Queryable, run: RunRow): Promise<void> {
  await emit(tx, "agent_run", {
    runId: run.id,
    groupId: run.group_id,
    status: run.status,
    endReason: run.end_reason,
    summary: run.summary,
    recoveryNote: run.recovery_note,
  });
}

export class AgentModule {
  private readonly running = new Map<string, Promise<void>>();
  private readonly deadlines = new Map<string, number>();
  private readonly activityClock: ActivityClock;
  private closing = false;
  private readonly turnTimeoutMs: number;
  private readonly toolRunner: AgentTools;
  constructor(
    private readonly ctx: AppContext,
    messaging: MessagingService,
  ) {
    this.activityClock = new ActivityClock(ctx);
    this.toolRunner = new AgentTools(ctx, messaging, {
      completeStep: (run, step, outcome, endReason) =>
        this.completeStep(run, step, outcome, endReason),
      finishAfterStep: (run, text) => this.finishAfterStep(run, text),
      remaining: (run) => this.remaining(run),
      finish: (run, status, reason) => this.finish(run, status, reason),
      pause: (run, reason) => this.pause(run, reason),
      readRun: (id) => this.readRun(id),
    });
    const configured = Number(process.env.AGENT_TURN_TIMEOUT_MS ?? 12000);
    this.turnTimeoutMs = Number.isFinite(configured)
      ? Math.min(15000, Math.max(10000, configured))
      : 12000;
  }
  async register(app: FastifyInstance): Promise<void> {
    app.get<{ Params: { id: string } }>(
      "/api/agent-runs/:id",
      async (request) => {
        const run = await this.readRun(request.params.id);
        if (!run)
          throw new AppError(404, "AGENT_RUN_NOT_FOUND", "Agent run not found");
        const steps = (
          await this.ctx.db.query<StepRow>(
            "SELECT * FROM agent_steps WHERE run_id=$1 ORDER BY ordinal",
            [run.id],
          )
        ).rows;
        return {
          ...runPublic(run),
          steps: steps.map((step) => ({
            ordinal: step.ordinal,
            kind: step.kind,
            toolUseId: step.tool_use_id,
            name: step.name,
            input: step.input,
            resultSummary: step.result_summary,
            isError: step.is_error,
            errorCode: step.error_code,
            auditVerdict: step.audit_verdict,
            rawResponse: step.raw_response,
          })),
        };
      },
    );
    app.get<{ Params: { id: string } }>(
      "/api/groups/:id/agent-runs",
      async (request) => {
        const rows = (
          await this.ctx.db.query<RunRow>(
            "SELECT * FROM agent_runs WHERE group_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
            [request.params.id],
          )
        ).rows;
        return rows.map(runPublic);
      },
    );
  }
  async tick(): Promise<void> {
    if (this.closing) return;
    await this.activityClock.start();
    await this.scan();
    const groups = (
      await this.ctx.db.query<{ group_id: string }>(
        "SELECT DISTINCT group_id FROM agent_pending WHERE run_id IS NULL AND eligible",
      )
    ).rows;
    for (const group of groups) await this.startNext(group.group_id);
    const pausedCancellations = (
      await this.ctx.db.query<RunRow>(
        `SELECT r.* FROM agent_runs r JOIN groups g ON g.id=r.group_id WHERE r.status='running' AND r.recovery_note IS NOT NULL AND (r.cancel_requested OR NOT g.agent_enabled OR g.status<>'active')`,
      )
    ).rows;
    for (const run of pausedCancellations)
      await this.ctx.db.withLock(`agent:${run.id}`, async () => {
        // Cancellation ends orchestration without declaring the uncertain external
        // effect failed or clearing its recovery evidence.
        await this.finish(run, "cancelled", "cancelled");
      });
    const runs = (
      await this.ctx.db.query<{ id: string }>(
        "SELECT id FROM agent_runs WHERE status='running' AND recovery_note IS NULL",
      )
    ).rows;
    for (const run of runs) {
      if (this.running.has(run.id)) continue;
      // Leave pool capacity for heartbeats, API transactions, gateway workers and
      // other runs' final commits instead of consuming every connection with locks.
      if (this.running.size >= 4) break;
      const task = this.ctx.db
        .withLock(`agent:${run.id}`, async () => this.run(run.id))
        .then(() => undefined)
        .catch((error) => {
          this.ctx.log.error(
            { err: error, runId: run.id },
            "Agent execution paused after an infrastructure failure",
          );
        })
        .finally(() => {
          this.running.delete(run.id);
        });
      this.running.set(run.id, task);
    }
  }
  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled(this.running.values());
    await this.activityClock.close();
  }
  async recover(): Promise<void> {
    await this.activityClock.start();
  }
  private async scan(): Promise<void> {
    await this.ctx.db.query(
      `INSERT INTO agent_pending(message_id,group_id,eligible) SELECT m.id,m.group_id,(g.agent_enabled AND g.status='active' AND (m.metadata->>'agentEligible') IS DISTINCT FROM 'false') FROM messages m JOIN groups g ON g.id=m.group_id WHERE NOT m.is_own ON CONFLICT(message_id) DO NOTHING`,
    );
  }
  private async startNext(groupId: string): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      const group = (
        await tx.query<GroupRow>(
          "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
          [groupId],
        )
      ).rows[0];
      if (!group || !group.agent_enabled || group.status !== "active") {
        await tx.query(
          "UPDATE agent_pending SET eligible=false WHERE group_id=$1 AND run_id IS NULL",
          [groupId],
        );
        return;
      }
      if (
        (
          await tx.query(
            "SELECT id FROM agent_runs WHERE group_id=$1 AND status='running'",
            [groupId],
          )
        ).rowCount
      )
        return;
      const messages = (
        await tx.query<RecentRow & { id: string }>(
          `SELECT m.id,m.msg_id,m.sender_platform_user_id,m.text,m.sent_at,m.is_own FROM agent_pending p JOIN messages m ON m.id=p.message_id WHERE p.group_id=$1 AND p.run_id IS NULL AND p.eligible ORDER BY m.sent_at,m.id FOR UPDATE OF p`,
          [groupId],
        )
      ).rows;
      if (!messages.length) return;
      const ownIds = (
        await tx.query<{ platform_user_id: string }>(
          "SELECT platform_user_id FROM accounts WHERE platform_user_id IS NOT NULL ORDER BY id",
        )
      ).rows.map((a) => a.platform_user_id);
      const context = {
        groupId,
        triggerMessages: messages.map((m) => ({
          msgId: m.msg_id,
          senderPlatformUserId: m.sender_platform_user_id,
          text: m.text,
          sentAt: m.sent_at.toISOString(),
        })),
        policy: { autoKickEnabled: group.auto_kick_enabled },
        ownPlatformUserIds: ownIds,
      };
      const history: ConversationMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: JSON.stringify(context) }],
        },
      ];
      const id = randomUUID();
      const run = (
        await tx.query<RunRow>(
          "INSERT INTO agent_runs(id,group_id,history) VALUES($1,$2,$3) RETURNING *",
          [id, groupId, JSON.stringify(history)],
        )
      ).rows[0]!;
      await tx.query(
        "UPDATE agent_pending SET run_id=$1 WHERE message_id=ANY($2::text[])",
        [id, messages.map((m) => m.id)],
      );
      await notify(tx, run);
    });
  }
  private async readRun(
    id: string,
    tx: Queryable = this.ctx.db,
  ): Promise<RunRow | undefined> {
    return (
      await tx.query<RunRow>("SELECT * FROM agent_runs WHERE id=$1", [id])
    ).rows[0];
  }
  private async pause(run: RunRow, reason: string): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE agent_runs SET recovery_note=$2,updated_at=now() WHERE id=$1",
        [run.id, reason],
      );
      if (run.recovery_note !== reason)
        await notify(tx, { ...run, recovery_note: reason });
      await emit(tx, "inconsistency", {
        kind: "agent_recovery_unknown",
        ref: run.id,
        message: reason,
      });
    });
  }
  private async finish(
    run: RunRow,
    status: AgentRun["status"],
    reason: string,
    finalSummary: string | null = null,
  ): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
        run.group_id,
      ]);
      const updated = (
        await tx.query<RunRow>(
          "UPDATE agent_runs SET status=$2,end_reason=$3,summary=$4,inflight_turn=false,updated_at=now() WHERE id=$1 AND status='running' RETURNING *",
          [run.id, status, reason, finalSummary],
        )
      ).rows[0];
      if (updated) await notify(tx, updated);
    });
    // Messages that arrived during the previous run are handed off without waiting for another turn.
    await this.scan();
    await this.startNext(run.group_id);
  }
  private async run(id: string): Promise<void> {
    let run = await this.readRun(id);
    if (!run || run.status !== "running" || run.recovery_note) return;
    // Older persisted runs can contain the former two-commit audit-block window.
    // Its exhausted audit evidence must stop recovery before any further turn.
    if (
      (
        await this.ctx.db.query(
          "SELECT 1 FROM agent_steps WHERE run_id=$1 AND state='complete' AND audit_attempts>=3 AND audit_verdict IS NULL AND is_error AND error_code='AUDIT_REJECTED' LIMIT 1",
          [id],
        )
      ).rowCount
    ) {
      await this.finish(run, "blocked", "audit_blocked");
      return;
    }
    if (run.inflight_turn) {
      await this.pause(
        run,
        "An Agent turn was sent before interruption; the protocol cannot safely replay an unrecorded response.",
      );
      return;
    }
    // The shared clock already accounts for both queued and executing runs.
    // Include its not-yet-sampled fraction in this execution's local deadline.
    this.deadlines.set(id, Date.now() + this.remaining(run));
    try {
      while (!this.closing) {
        run = await this.readRun(id);
        if (!run || run.status !== "running" || run.recovery_note) return;
        const finalStep = (
          await this.ctx.db.query<StepRow>(
            `SELECT * FROM agent_steps WHERE run_id=$1 AND state='complete' AND is_error=false AND (kind='final' OR (kind='tool_use' AND name='finish')) ORDER BY ordinal DESC LIMIT 1`,
            [id],
          )
        ).rows[0];
        // Final history and public run status are separate commits. Only a successful,
        // valid completion can finish recovery; an invalid finish is a tool error and
        // must still reach cancellation, budget checks, and the next remote turn.
        if (
          finalStep &&
          (finalStep.kind === "final" ||
            validateTool({
              type: "tool_use",
              id: finalStep.tool_use_id ?? "",
              name: "finish",
              input: finalStep.input,
            }) === null)
        ) {
          const text =
            finalStep.kind === "final"
              ? String(finalStep.result?.summary ?? "")
              : String((finalStep.input as { summary: string }).summary);
          await this.finishAfterStep(run, text);
          return;
        }
        const pending = (
          await this.ctx.db.query<StepRow>(
            "SELECT * FROM agent_steps WHERE run_id=$1 AND state<>'complete' ORDER BY ordinal LIMIT 1",
            [id],
          )
        ).rows[0];
        // A prepared tool is the current step. Cancellation is observed after it is completed.
        if (pending) {
          if (this.remaining(run) <= 0) {
            await this.finish(run, "failed", "wall_clock");
            return;
          }
          await this.toolRunner.executeStep(run, pending);
          continue;
        }
        const group = (
          await this.ctx.db.query<GroupRow>(
            "SELECT * FROM groups WHERE id=$1",
            [run.group_id],
          )
        ).rows[0];
        if (
          run.cancel_requested ||
          !group?.agent_enabled ||
          group.status !== "active"
        ) {
          await this.finish(run, "cancelled", "cancelled");
          return;
        }
        if (this.remaining(run) <= 0) {
          await this.finish(run, "failed", "wall_clock");
          return;
        }
        if (run.protocol_errors >= 3) {
          await this.finish(run, "failed", "protocol_errors");
          return;
        }
        if (run.step_count >= 12) {
          await this.finish(run, "failed", "budget_exhausted");
          return;
        }
        await this.turn(run, Math.min(this.turnTimeoutMs, this.remaining(run)));
      }
    } finally {
      this.deadlines.delete(id);
    }
  }
  private remaining(run: RunRow): number {
    return Math.max(
      0,
      (this.deadlines.get(run.id) ??
        run.activity_updated_at.getTime() + 60000 - Number(run.active_ms)) -
        Date.now(),
    );
  }
  private async turn(run: RunRow, timeoutMs: number): Promise<void> {
    await this.ctx.db.query(
      "UPDATE agent_runs SET inflight_turn=true WHERE id=$1",
      [run.id],
    );
    let raw = "";
    let code: "BAD_JSON" | "TURN_TIMEOUT" | null = null;
    const operation = currentOperationSignal();
    const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
    try {
      const response = await fetch(`${this.ctx.agent.baseUrl}/agent/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: run.id, tools, messages: run.history }),
        signal: operation ? AbortSignal.any([timeout, operation]) : timeout,
      });
      raw = await response.text();
      if (!response.ok) code = "BAD_JSON";
    } catch (error) {
      operation?.throwIfAborted();
      code =
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
          ? "TURN_TIMEOUT"
          : "BAD_JSON";
      raw = error instanceof Error ? error.message : String(error);
    }
    operation?.throwIfAborted();
    const response = code ? null : parseTurn(raw);
    if (!response) {
      await this.protocolError(run, code ?? "BAD_JSON", raw);
      return;
    }
    if (response.stop_reason === "end_turn") {
      const text = response.content[0].text;
      await this.ctx.db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO agent_steps(run_id,ordinal,kind,result_summary,raw_response,state,result) VALUES($1,$2,'final',$3,$4,'complete',$5)`,
          [
            run.id,
            run.step_count + 1,
            summary(text),
            truncateUtf8(raw, 2048),
            JSON.stringify({ summary: text }),
          ],
        );
        const history: ConversationMessage[] = [
          ...run.history,
          { role: "assistant", content: response.content },
        ];
        await tx.query(
          "UPDATE agent_runs SET history=$2,step_count=step_count+1,protocol_errors=0,inflight_turn=false WHERE id=$1",
          [run.id, JSON.stringify(history)],
        );
        await emit(tx, "agent_step_changed", {
          runId: run.id,
          groupId: run.group_id,
          ordinal: run.step_count + 1,
          changedFields: ["created"],
        });
      });
      await this.finishAfterStep(run, text);
      return;
    }
    const tool: ToolUse = response.content[0];
    if (
      (
        await this.ctx.db.query(
          "SELECT 1 FROM agent_steps WHERE run_id=$1 AND tool_use_id=$2",
          [run.id, tool.id],
        )
      ).rowCount
    ) {
      await this.protocolError(run, "DUPLICATE_TOOL_USE_ID", raw);
      return;
    }
    const validationCode = validateTool(tool);
    const history: ConversationMessage[] = [
      ...run.history,
      { role: "assistant", content: [tool] },
    ];
    await this.ctx.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,raw_response) VALUES($1,$2,'tool_use',$3,$4,$5,$6)`,
        [
          run.id,
          run.step_count + 1,
          tool.id,
          tool.name,
          JSON.stringify(tool.input ?? null),
          truncateUtf8(raw, 2048),
        ],
      );
      await tx.query(
        "UPDATE agent_runs SET history=$2,step_count=step_count+1,protocol_errors=$3,inflight_turn=false WHERE id=$1",
        [
          run.id,
          JSON.stringify(history),
          validationCode ? run.protocol_errors + 1 : 0,
        ],
      );
      await emit(tx, "agent_step_changed", {
        runId: run.id,
        groupId: run.group_id,
        ordinal: run.step_count + 1,
        changedFields: ["created"],
      });
    });
    if (validationCode) {
      const updatedRun = (await this.readRun(run.id))!;
      const step = (
        await this.ctx.db.query<StepRow>(
          "SELECT * FROM agent_steps WHERE run_id=$1 AND ordinal=$2",
          [run.id, run.step_count + 1],
        )
      ).rows[0]!;
      await this.completeStep(
        updatedRun,
        step,
        toolError(
          validationCode,
          validationCode === "UNKNOWN_TOOL"
            ? "The tool is not supported."
            : "Tool input does not match its required schema.",
        ),
      );
    }
  }
  private async protocolError(
    run: RunRow,
    code: string,
    raw: string,
  ): Promise<void> {
    const history: ConversationMessage[] = [
      ...run.history,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `PROTOCOL_ERROR ${code}: Return one valid tool_use or end_turn block with a new tool id.`,
          },
        ],
      },
    ];
    await this.ctx.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO agent_steps(run_id,ordinal,kind,result_summary,is_error,error_code,raw_response,state,result) VALUES($1,$2,'protocol_error',$3,true,$4,$5,'complete',$6)`,
        [
          run.id,
          run.step_count + 1,
          code,
          code,
          truncateUtf8(raw, 2048),
          JSON.stringify({ code }),
        ],
      );
      await tx.query(
        "UPDATE agent_runs SET history=$2,step_count=step_count+1,protocol_errors=protocol_errors+1,inflight_turn=false WHERE id=$1",
        [run.id, JSON.stringify(history)],
      );
      await emit(tx, "agent_step_changed", {
        runId: run.id,
        groupId: run.group_id,
        ordinal: run.step_count + 1,
        changedFields: ["created"],
      });
    });
  }
  private async completeStep(
    run: RunRow,
    step: StepRow,
    outcome: ToolOutcome,
    endReason?: "audit_blocked",
  ): Promise<void> {
    const content = resultContent(outcome.value);
    const history: ConversationMessage[] = [
      ...run.history,
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: step.tool_use_id!,
            content,
            ...(outcome.errorCode ? { is_error: true } : {}),
          },
        ],
      },
    ];
    await this.ctx.db.transaction(async (tx) => {
      if (endReason)
        await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
          run.group_id,
        ]);
      await tx.query(
        "UPDATE agent_steps SET state='complete',result=$3,result_summary=$4,is_error=$5,error_code=$6 WHERE run_id=$1 AND ordinal=$2",
        [
          run.id,
          step.ordinal,
          JSON.stringify(outcome.value),
          summary(outcome.value),
          Boolean(outcome.errorCode),
          outcome.errorCode ?? null,
        ],
      );
      await tx.query(
        "UPDATE agent_runs SET history=$2,updated_at=now() WHERE id=$1",
        [run.id, JSON.stringify(history)],
      );
      await emit(tx, "agent_step_changed", {
        runId: run.id,
        groupId: run.group_id,
        ordinal: step.ordinal,
        changedFields: ["resultSummary", "isError", "errorCode"],
      });
      if (endReason) {
        // The complete tool result and terminal conclusion are one durable fact.
        const blocked = (
          await tx.query<RunRow>(
            "UPDATE agent_runs SET status='blocked',end_reason=$2,inflight_turn=false WHERE id=$1 AND status='running' RETURNING *",
            [run.id, endReason],
          )
        ).rows[0];
        if (blocked) await notify(tx, blocked);
      }
    });
    if (endReason) {
      await this.scan();
      await this.startNext(run.group_id);
    }
  }
  private async finishAfterStep(run: RunRow, text: string): Promise<void> {
    const fresh = (await this.readRun(run.id))!;
    const group = (
      await this.ctx.db.query<GroupRow>("SELECT * FROM groups WHERE id=$1", [
        run.group_id,
      ])
    ).rows[0];
    if (
      fresh.cancel_requested ||
      !group?.agent_enabled ||
      group.status !== "active"
    )
      await this.finish(fresh, "cancelled", "cancelled");
    else if (this.remaining(fresh) <= 0)
      await this.finish(fresh, "failed", "wall_clock");
    else await this.finish(fresh, "finished", "final", text);
  }
}
