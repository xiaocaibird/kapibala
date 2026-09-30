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
  private started = 0;

  constructor(
    readonly name: string,
    readonly enabled: boolean,
  ) {}

  start(): void {
    this.running = true;
    this.ticks++;
    this.lastStartedAt = new Date().toISOString();
    this.started = performance.now();
  }
  finish(succeeded: boolean): void {
    this.running = false;
    this.lastCompletedAt = new Date().toISOString();
    this.lastDurationMs = performance.now() - this.started;
    if (succeeded) {
      this.successfulTicks++;
      this.consecutiveFailures = 0;
      this.lastSucceededAt = this.lastCompletedAt;
    } else {
      this.consecutiveFailures++;
      this.lastFailedAt = this.lastCompletedAt;
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
    };
  }
}
