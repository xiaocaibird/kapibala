/** Explicit engineering observer only. Hooks report an actual product boundary
 * and can hold continuation; they do not provide business results or clocks. */
export interface MessageObservation {
  phase:
    | "timeout-observed-before-local-save"
    | "receipt-before-commit"
    | "receipt-committed-before-business";
  attemptId: string;
  groupId?: string;
  clientMsgId: string;
  msgId?: string;
  eventId?: string;
  observedAt: string;
  receiptObservedAt?: string | null;
}
export interface TestMessageObserver {
  boundary(observation: MessageObservation): Promise<void>;
}
