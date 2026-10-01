import type { TransactionBoundaryFact } from "./test-transaction-observer.js";
export type ActivityPauseCause =
  | "unrecorded-model-response"
  | "unrecorded-kick-response"
  | "kick-budget-exhausted"
  | "kick-work-budget-exhausted"
  | "kick-outcome-unknown";
export interface ActivityTransitionEvidence {
  phase: "creation" | "pause" | "terminal";
  transactionBoundaries: TransactionBoundaryFact[];
  pauseCause?: ActivityPauseCause;
}
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
  runCreated(
    row: ActivitySample,
    at: ActivityWindow,
    evidence?: ActivityTransitionEvidence,
  ): void;
  runPaused(
    runId: string,
    at: ActivityWindow,
    evidence?: ActivityTransitionEvidence,
  ): void;
  runTerminal(
    runId: string,
    at: ActivityWindow,
    evidence?: ActivityTransitionEvidence,
  ): void;
  safeBoundary(row: ActivitySample, stepId: string): Promise<void>;
}
