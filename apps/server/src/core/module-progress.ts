import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { RemoteError } from "./errors.js";

export type BackgroundFailureReason =
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_CONTENTION"
  | "DATABASE_QUERY_CANCELLED"
  | "REMOTE_UNAVAILABLE"
  | "REMOTE_REJECTED"
  | "INVALID_RESPONSE"
  | "UNEXPECTED_FAILURE";

/** Only classify known machine signals; never publish an error body/code verbatim. */
function failureReason(error: unknown): BackgroundFailureReason {
  if (error instanceof ZodError) return "INVALID_RESPONSE";
  if (error instanceof RemoteError)
    return error.status >= 500 ? "REMOTE_UNAVAILABLE" : "REMOTE_REJECTED";
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "57014") return "DATABASE_QUERY_CANCELLED";
  if (typeof code === "string" && ["40001", "40P01", "55P03"].includes(code))
    return "DATABASE_CONTENTION";
  if (
    typeof code === "string" &&
    /^(08[0-9A-Z]{3}|57P0[123]|53300)$/.test(code)
  )
    return "DATABASE_UNAVAILABLE";
  return "UNEXPECTED_FAILURE";
}

const nextSteps: Record<BackgroundFailureReason, string> = {
  DATABASE_UNAVAILABLE:
    "检查数据库连接与可用性，并用模块和 tickId 核对日志；不要直接重发结果未知的操作。",
  DATABASE_CONTENTION:
    "检查数据库等待与同模块进度，并用 tickId 核对日志；不要直接重发结果未知的操作。",
  DATABASE_QUERY_CANCELLED:
    "检查数据库查询时限与取消来源，并用 tickId 核对日志；不要直接重发结果未知的操作。",
  REMOTE_UNAVAILABLE:
    "检查外部服务可用性及已有操作记录；结果未知时不要直接重发。",
  REMOTE_REJECTED:
    "用模块和 tickId 核对受限日志中的外部拒绝原因与当前权限；不要直接重发。",
  INVALID_RESPONSE:
    "用模块和 tickId 核对受限日志及响应契约；不要把解析失败当作远端未执行。",
  UNEXPECTED_FAILURE:
    "用模块和 tickId 核对受限日志及已有业务状态；尚不能据此判断业务是否完成。",
};

/** Process-local scheduler progress, not end-to-end business readiness. */
export class ModuleProgress {
  recovery: "not_started" | "running" | "succeeded" | "failed" = "not_started";
  running = false;
  ticks = 0;
  successfulTicks = 0;
  consecutiveFailures = 0;
  lastStartedAt: string | null = null;
  lastCompletedAt: string | null = null;
  lastSucceededAt: string | null = null;
  lastFailedAt: string | null = null;
  lastDurationMs: number | null = null;
  tickId: string | null = null;
  lastFailure: {
    reason: BackgroundFailureReason;
    occurredAt: string;
    correlation: { module: string; tickId: string | null };
    recoveredAt: string | null;
    nextStep: string;
  } | null = null;
  private started = 0;

  constructor(
    readonly name: string,
    readonly enabled: boolean,
  ) {}

  start(): void {
    this.tickId = randomUUID();
    this.running = true;
    this.ticks++;
    this.lastStartedAt = new Date().toISOString();
    this.started = performance.now();
  }
  finish(succeeded: boolean, error?: unknown): void {
    this.running = false;
    this.lastCompletedAt = new Date().toISOString();
    this.lastDurationMs = performance.now() - this.started;
    if (succeeded) {
      this.successfulTicks++;
      this.consecutiveFailures = 0;
      this.lastSucceededAt = this.lastCompletedAt;
      if (this.lastFailure && !this.lastFailure.recoveredAt)
        this.lastFailure.recoveredAt = this.lastCompletedAt;
    } else {
      this.consecutiveFailures++;
      this.lastFailedAt = this.lastCompletedAt;
      const reason = failureReason(error);
      this.lastFailure = {
        reason,
        occurredAt: this.lastCompletedAt,
        correlation: { module: this.name, tickId: this.tickId },
        recoveredAt: null,
        nextStep: nextSteps[reason],
      };
    }
  }
  snapshot() {
    return {
      name: this.name,
      status: !this.enabled
        ? "disabled"
        : this.running
          ? "running"
          : this.consecutiveFailures
            ? "failed"
            : this.ticks
              ? "idle"
              : "not_started",
      recovery: this.recovery,
      ticks: this.ticks,
      successfulTicks: this.successfulTicks,
      consecutiveFailures: this.consecutiveFailures,
      lastStartedAt: this.lastStartedAt,
      lastCompletedAt: this.lastCompletedAt,
      lastSucceededAt: this.lastSucceededAt,
      lastFailedAt: this.lastFailedAt,
      lastDurationMs: this.lastDurationMs,
      runningForMs: this.running ? performance.now() - this.started : null,
      tickId: this.tickId,
      lastFailure: this.lastFailure
        ? {
            ...this.lastFailure,
            correlation: { ...this.lastFailure.correlation },
          }
        : null,
      nextStep: this.lastFailure?.recoveredAt
        ? "后续调度轮次已成功，保留最近失败供核对；这不代表此前业务或未知远端操作已完成。"
        : (this.lastFailure?.nextStep ??
          "当前没有本进程记录的失败；调度状态不代表业务完成或全部依赖健康。"),
    };
  }
}
