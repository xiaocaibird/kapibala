/** Engineering entry only. All timestamps are process-local performance.now()
 * brackets captured around actual product operations, never controller input. */
export interface ActivityWindow {
  before: number;
  after: number;
}
export interface ActivitySample {
  runId: string;
  groupId: string;
  persistedActiveMs: number;
}
export interface TestActivityObserver {
  clockAcquired(
    epochId: string,
    rows: ActivitySample[],
    at: ActivityWindow,
  ): void;
  clockSampled(
    epochId: string,
    rows: ActivitySample[],
    at: ActivityWindow,
  ): void;
  clockLost(epochId: string): void;
  runCreated(row: ActivitySample, at: ActivityWindow): void;
  runPaused(runId: string, at: ActivityWindow): void;
  runTerminal(runId: string, at: ActivityWindow): void;
  safeBoundary(row: ActivitySample, stepId: string): Promise<void>;
}
