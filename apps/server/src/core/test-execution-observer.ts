/** Explicitly injected by the separate engineering test entry only. Production
 * main neither imports a controller nor creates a listener. These boundaries
 * observe real admission and may hold the proven-no-effect ready transition. */
export interface TestKickCorrelation {
  groupId: string;
  runId: string;
  toolUseId: string;
  targetPlatformUserId: string;
}
export interface TestExecutionObserver {
  kick<T>(
    correlation: TestKickCorrelation,
    operation: () => Promise<T>,
  ): Promise<T>;
  ready(
    correlation: TestKickCorrelation,
    phase: "before" | "after",
  ): Promise<void>;
}
