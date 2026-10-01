/** Installed only by the explicit engineering entry. Events describe real
 * call/return/commit boundaries; no observer may supply a business result. */
export interface LifecycleFact {
  kind: string;
  groupId: string;
  runId?: string;
  toolUseId?: string;
  stepId?: string;
  attemptId: string;
  clientMsgId?: string;
  [key: string]: unknown;
}
export interface TestLifecycleObserver {
  record(fact: LifecycleFact): void;
}
