/** Independent QA driver boundary, not a new SUT API. All observations must
 * retain actual raw evidence, final-candidate contract references and owned
 * resource bindings. An adapter may translate fields; it must not decide PASS,
 * invent times/results, import business modules, or seed completed outcomes.
 * No implementation is connected by this file. Missing capabilities BLOCK. */
export class PreparationBlocked extends Error {
  constructor(message: string) { super(`[BLOCKED] ${message}`); this.name = 'PreparationBlocked'; }
}
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Evidence = { reference: string; raw: Json };
export interface Ownership {
  sessionId: string;
  sutRevision: string;
  contractReference: string;
  /** Adapter review must map each assertion to the final public contract.
   * The frozen C1/C2 documents are a design source, not permission to assume
   * that a later candidate silently retains these exact values/codes. */
  reviewedSourceContracts: readonly ('c1-media-files' | 'c2-gemini-agent')[];
  resourceRoot: string;
  applicationPids: number[];
  endpoints: string[];
  evidence: Evidence;
}
export interface DriverBase {
  /** Final SHA, URLs, PID/start/PGID, DB and dirs must be verified before open.
   * Preparation callers never call open; future executor checks authorization.
   * All operations/leases must have bounded diagnostic lifetimes, reject with
   * PreparationBlocked when an actual observation window cannot be proven,
   * and settle after owned shutdown. No unresolved background Promises may be
   * abandoned during cleanup. These limits are QA guards, not product SLAs. */
  capabilities: readonly string[];
  contractReference: string;
  open(options?: Record<string, Json>): Promise<Ownership>;
  evidence(name: string, value: unknown): Promise<void>;
  cleanup(): Promise<{ failures: string[]; evidence: Evidence }>;
}
export interface Barrier {
  /** Actual observed process/request/file-operation association; arm alone is
   * not reached. TTL is bounded, cleanup is limited to this owned lease. */
  id: string;
  reached(): Promise<Evidence>;
  /** Optional only for a real reference/cleanup race: evidence that the other
   * independently submitted operation actually reached this same file and is
   * contending before release. Starting its Promise is not such evidence. */
  competingReached?(operation: 'reference' | 'cleanup'): Promise<Evidence>;
  release(): Promise<void>;
}
export interface MessageRef { groupId: string; msgId: string }
export interface MediaMessage extends MessageRef {
  text: string;
  mediaUrl?: string;
  localFilePath?: string | null;
  raw: Json;
}
export interface SourceRequest {
  id: string;
  url: string;
  method: string;
  responseStatus?: number;
  responseBytes?: number;
  evidence: Evidence;
}
export type MediaFault = 'none' | '404' | '503-once' | '408-once' | '429-once' |
  'disconnect-once' | 'redirect-foreign' | 'declared-oversize' | 'stream-oversize';
export interface MediaDriver extends DriverBase {
  retentionContract: { reference: string; zeroDaysSupported: boolean } | null;
  /** Independently captured attempted HTTP egress, including denied routes
   * and redirect targets. A source-server request list is insufficient. */
  egress(): Promise<{ attempts: { id: string; url: string }[]; evidence: Evidence }>;
  mediaDirectory(): Promise<{ path: string; effectiveRetentionDays: number; evidence: Evidence }>;
  source(input: { id: string; bytes: Uint8Array; fault?: MediaFault }): Promise<{ url: string; evidence: Evidence }>;
  setSourceFault(url: string, fault: MediaFault): Promise<void>;
  createGroup(): Promise<string>;
  emit(input: MessageRef & { text: string; mediaUrl?: string; isOwn?: boolean }): Promise<Evidence>;
  read(ref: MessageRef): Promise<MediaMessage>;
  timeline(groupId: string, cursor?: string): Promise<{ messages: MediaMessage[]; nextCursor: string | null; snapshotCursor: string; evidence: Evidence }>;
  sourceRequests(): Promise<SourceRequest[]>;
  /** Observe actual bounded background work and completed/failed attempt or
   * absence of eligible work. Do not sleep and label it a completed cycle. */
  cycle(kind: 'download' | 'cleanup'): Promise<Evidence>;
  /** Explicit engineering dependency: owned time/age fixture with documented
   * completed-file age basis, real before/after evidence. No ready/deleted state
   * injection and no hidden active-run/status edits. Default30 needs this or
   * real elapsed30days; retention=0 alone does not prove default30. */
  age(ref: MessageRef, days: number): Promise<{ actualAgeDays: [number, number]; basis: 'completed-file'; evidence: Evidence }>;
  hold(phase: 'partial-written' | 'complete-before-path-commit' | 'path-cleared-before-unlink' | 'unlinked-before-completion' | 'failed-before-retry' |
    'reference-before-cleanup' | 'cleanup-before-reference', ref: MessageRef): Promise<Barrier>;
  restart(mode: 'SIGTERM' | 'SIGKILL'): Promise<{ beforePid: number; afterPid: number; directoryPreserved: boolean; databasePreserved: boolean; evidence: Evidence }>;
  startReference(ref: MessageRef, via: 'trigger' | 'get_recent_messages' | 'pending-download' | 'legacy-running-group'): Promise<{ runId: string; evidence: Evidence }>;
  run(runId: string): Promise<{ id: string; status: string; steps: { name: string | null }[]; evidence: Evidence }>;
  agentRequests(): Promise<{ requests: Json[]; evidence: Evidence }>;
  finishReference(runId: string): Promise<Evidence>;
  failUnlink(ref: MessageRef): Promise<{ restore(): Promise<void>; failure(): Promise<Evidence> }>;
  /** Both are new owned processes. Directory mismatch rejection is a startup
   * outcome, not a fabricated public error code. Never touch another checkout. */
  secondInstance(directory: 'same-physical' | 'new-owned-directory'): Promise<{ started: boolean; pid?: number; actualMediaRealPath?: string; evidence: Evidence }>;
  /** Versioned, reviewed pre-C1 dump + files, not current schema row edits. */
  legacyFixture(): Promise<{ messages: { ref: MessageRef; text: string; expectedBytes: Uint8Array | null; sourceExpired: boolean }[]; activeRunId: string; evidence: Evidence }>;
  migrate(): Promise<{ actualSchemaVersion: number; appliedMigrations: string[]; evidence: Evidence }>;
  startWithoutMigration(): Promise<{ started: boolean; evidence: Evidence }>;
  finalSchemaContract: { expectedVersion: number; reference: string } | null;
  /** No product SLA is inferred from a diagnostic budget. Its exhaustion must
   * return PreparationBlocked with current public state, not fabricate FAIL. */
  awaitMessage(ref: MessageRef, state: 'path-published' | 'path-null', diagnosticBudgetMs: number): Promise<MediaMessage>;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  input_schema: { type: string; properties: Record<string, Json>; required: string[]; [key: string]: Json };
}
export type Message = { role: 'user' | 'assistant'; content: Json[] };
export interface TurnRequest { runId: string; tools: ToolDeclaration[]; messages: Message[] }
export interface HttpFact { status: number; body: unknown; rawBody: string; evidence: Evidence }
export type Proposal =
  | { kind: 'tool'; name: string; input: Record<string, Json> }
  | { kind: 'text'; text: string }
  | { kind: 'audit'; verdict: 'pass' | 'fail'; reason: string };
export type ProviderFault = 'http-401' | 'http-429' | 'network-error' | 'timeout' |
  'bad-json' | 'multiple-candidates' | 'native-function-call' | 'truncated' | 'safety-blocked';
export interface ProviderCall {
  id: string;
  purpose: 'turn' | 'audit';
  /** Decoding needs a reviewed raw-wire profile. This is original history
   * obtained from the real received request, never copied from expected input. */
  messages?: Message[];
  auditText?: string;
  model: string;
  actualUsage: Record<string, number> | null;
  rawWire: Json;
  evidence: Evidence;
}
export interface UsageRecord {
  serviceCallId: string;
  requestId: string;
  attemptId: string;
  runId: string | null;
  stage: string;
  errorCode: string | null;
  observedAt: string;
  purpose: 'turn' | 'audit';
  model: string;
  elapsedMs: number;
  outcome: string;
  /** Unknown stays null. Field names below are QA normalization only. */
  usage: Record<string, number> | null;
  raw: Json;
}
export interface UsageContract {
  reference: string;
  rawAllowedFields: string[];
  maximumRecords: number;
  maximumBytes: number;
  maximumAgeDays: number;
  enabled: boolean;
  entry: 'main' | 'factory';
  configurationEvidence: Evidence;
}
export interface BackendRun {
  id: string;
  status: string;
  endReason: string | null;
  steps: { name: string | null; auditVerdict: string | null; isError: boolean; errorCode: string | null }[];
  raw: Json;
}
export interface BackendFacts {
  /** Independent gateway/agent ledgers, counts derived in QA tests. */
  sends: { id: string; clientMsgId: string; text: string }[];
  kicks: { id: string; target: string }[];
  audits: { id: string; text: string; verdict: string | null }[];
  turns: { id: string; runId: string }[];
  effects: { id: string; kind: 'send' | 'kick'; identity: string }[];
  publicMessages: { clientMsgId: string; deliveryStatus: string }[];
  evidence: Evidence;
}
export interface ActivityProof {
  runId: string;
  complete: boolean;
  continuous: boolean;
  epochIds: string[];
  /** Bounds on actual activity, never creation-to-terminal wall clock. An
   * incomplete proof may retain only a sound observed activity lower bound. */
  activeElapsedMs: [number, number] | null;
  /** Actual stop decision in accumulated activity coordinates, not COMMIT. */
  actualDecisionElapsedMs: [number, number] | null;
  decisionAttemptId: string | null;
  committedAttemptId: string | null;
  evidence: Evidence;
}
export interface RealProviderPermission {
  explicitlyAuthorized: true;
  authorizationReference: string;
  credentialReference: string;
  model: string;
  maximumPaidCalls: number;
  maximumOutputTokens: number;
  maximumSpend: { currency: string; amount: number };
  expiresAt: string;
}
export interface ProviderDriver extends DriverBase {
  /** An upstream transport seam must be explicitly delivered. No monkeypatch
   * of product internals and no silent Google access if the seam is absent. */
  enqueue(input: { purpose: 'turn' | 'audit'; proposal?: Proposal; fault?: ProviderFault; actualUsage?: Record<string, number> | null; delayResponseMs?: number }): Promise<void>;
  holdNextUpstream(purpose: 'turn' | 'audit'): Promise<Barrier>;
  exchange(path: '/agent/turn' | '/agent/audit', body: unknown): Promise<HttpFact>;
  calls(): Promise<ProviderCall[]>;
  restart(mode: 'SIGTERM' | 'SIGKILL', options?: { usageEnabled: boolean }): Promise<{ started: boolean; beforePid: number; afterPid?: number; evidence: Evidence }>;
  lockState(): Promise<{ exists: boolean; actualOwnerAlive: boolean; ownedDirectoryVerified: boolean; evidence: Evidence }>;
  reclaimOwnedStaleLock(): Promise<Evidence>;
  installPrivateStateFault(kind: 'corrupt' | 'symlink' | 'wide-permissions' | 'foreign-owner'): Promise<{ restore(): Promise<void>; evidence: Evidence }>;
  competingSessionOwner(): Promise<{ started: boolean; evidence: Evidence }>;
  sessionFiles(): Promise<{ root: string; records: string[]; evidence: Evidence }>;
  logs(): Promise<string[]>;
  usageContract: UsageContract | null;
  usage(): Promise<{ records: UsageRecord[]; actualBytes: number; evidence: Evidence }>;
  /** Observe actual enqueue/write settlement, not just wait a fixed duration;
   * best-effort drops are reported, never invented as token usage. */
  settleUsage(): Promise<{ dropped: number; queued: number; activeBatch: number; evidence: Evidence }>;
  holdUsageWrites(): Promise<Barrier>;
  usageQueue(): Promise<{ queued: number; activeBatch: number; dropped: number; diagnosticCodes: string[]; evidence: Evidence }>;
  usageWriteFault(): Promise<{ restore(): Promise<void>; observed(): Promise<Evidence> }>;
  /** Explicit final-contract dependency; these drive real writer config,
   * lifetime and shutdown, not editing usage rows or returning fake counts. */
  usageFiles(): Promise<{ root: string; files: string[]; evidence: Evidence }>;
  advanceUsageRetention(): Promise<{ oldestEligibleRecordId: string; evidence: Evidence }>;
  shutdownUsageWriter(): Promise<{ rejectedAfterClose: boolean; evidence: Evidence }>;
  diagnostics(): Promise<{ failureObserved: boolean; recovered: boolean; raw: Json; evidence: Evidence }>;
  /** Must drive normal public backend routes and original Agent protocol.
   * Supplying a plan selects model proposals, never sets run/step outcomes. */
  backendGroup(policy: { autoKickEnabled: boolean; executor: 'admin' | 'member' | 'none'; managedTarget?: boolean }): Promise<{ groupId: string; target: string; evidence: Evidence }>;
  triggerBackend(groupId: string): Promise<string>;
  backendRun(runId: string, diagnosticBudgetMs: number): Promise<BackendRun>;
  backendFacts(groupId: string): Promise<BackendFacts>;
  activity(runId: string): Promise<ActivityProof>;
  deploymentBinding(): Promise<{ changedBackendSettings: string[]; selectedAgent: 'independent' | 'mock'; upstreamCalls: number; evidence: Evidence }>;
  realPermission?: RealProviderPermission;
  realGenerationCount?(): Promise<number>;
  /** Called before opening any provider-capable process. Must verify actual
   * independent spend/call/token limits and stop gates against the referenced
   * authorization. A returned declaration without installed guards blocks. */
  verifyRealCostGuard?(permission: RealProviderPermission): Promise<Evidence>;
}

export const C1_CAPABILITIES = {
  basic: 'media-public-download-and-owned-files',
  sourceFaults: 'media-controlled-http-source',
  egress: 'independent-owned-http-egress-ledger',
  age: 'media-completed-age-fixture',
  cleanup: 'media-real-cleanup-cycle',
  references: 'media-real-running-reference',
  barriers: 'media-real-operation-barriers',
  restart: 'owned-process-restart-preserving-db-media',
  unlink: 'media-real-unlink-failure',
  multi: 'media-owned-second-instance',
  migration: 'media-versioned-pre-c1-fixture',
} as const;
export const C2_CAPABILITIES = {
  protocol: 'independent-agent-public-http',
  upstream: 'reviewed-offline-provider-wire-adapter',
  history: 'real-upstream-history-decoder',
  restart: 'owned-agent-session-restart',
  pending: 'real-upstream-request-barrier-and-owned-lock',
  storage: 'owned-session-files-and-negative-fixtures',
  backend: 'normal-backend-with-independent-agent',
  activity: 'complete-real-backend-activity-witness',
  usage: 'reviewed-final-usage-projection',
  usageFault: 'real-usage-write-failure',
  usageQueue: 'real-usage-write-barrier-and-queue-observation',
  real: 'explicitly-authorized-real-provider',
} as const;
