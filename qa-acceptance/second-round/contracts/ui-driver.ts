/** Future adapter boundary: every operation must use actual public UI/network
 * evidence. No implementation state, simulated business results or pass flags. */
export type ResponseKind = 'send' | 'sequence-save' | 'precheck' | 'run-read' | 'identity-read' | 'group-save' | 'group-create';
export interface ResponseGate {
  requestId: string;
  received: Promise<void>;
  release(outcome: 'success' | 'failure' | 'unknown'): Promise<void>;
}
export interface UiLocation {
  kind: 'group' | 'run-list' | 'run' | 'fallback';
  url: string;
  groupId?: string;
  selectedGroupId?: string;
  title: string;
  activeNavigation: string;
}
export interface UiDriver {
  login(role: 'admin' | 'viewer', sessionLabel: string): Promise<void>;
  openGroup(id: string): Promise<void>;
  editDraft(value: string): Promise<void>;
  draft(): Promise<string>;
  holdNextResponse(kind: ResponseKind): Promise<ResponseGate>;
  clickSend(): Promise<void>;
  settleResponse(requestId: string): Promise<void>;
  actualSendRequestCount(): Promise<number>;
  newSequence(): Promise<void>;
  editSequence(value: Record<string, string>): Promise<void>;
  requestFormClose(action: string): Promise<void>;
  cancelDiscard(): Promise<void>;
  formState(): Promise<{ open: boolean; discardPromptVisible: boolean; saving: boolean }>;
  sequenceFields(): Promise<Record<string, string>>;
  confirmDiscard(): Promise<void>;
  saveSequence(): Promise<void>;
  setPrecheckContext(value: Record<string, string>): Promise<void>;
  startPrecheck(): Promise<void>;
  canConfirmPrecheck(): Promise<boolean>;
  openRunFromGroup(groupId: string, runId: string): Promise<void>;
  openRunFromList(groupId: string, runId: string): Promise<void>;
  returnToSource(): Promise<void>;
  location(): Promise<UiLocation>;
  evidence(label: string, facts: unknown): Promise<void>;
}
export interface UiProfile {
  groupA: string;
  groupB: string;
  runId: string;
  sequenceFields: Record<string, string>;
  /** Supplied from observed controls; mandatory manual case checks completeness. */
  closeActions: readonly string[];
  precheckInitial: Record<string, string>;
  precheckChanged: Record<string, string>;
}
