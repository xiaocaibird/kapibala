export type AccountStatus =
  | "idle"
  | "online"
  | "rate_limited"
  | "disconnected"
  | "suspended"
  | "session_expired";
export type GroupStatus = "active" | "unreachable" | "left";
export type DeliveryStatus =
  "queued" | "accepted" | "sent" | "failed" | "unknown" | "cancelled";
export interface Account {
  id: string;
  status: AccountStatus;
  platformUserId: string | null;
  rateLimitedUntil: string | null;
}
export interface Member {
  accountId: string | null;
  platformUserId: string;
  role: "creator" | "admin" | "member";
}
export const GROUP_NAME_MAX_LENGTH = 80;
export const GROUP_DESCRIPTION_MAX_LENGTH = 500;
export interface Group {
  id: string;
  name: string | null;
  description: string | null;
  createdAt: string;
  gatewayGroupId: string;
  status: GroupStatus;
  creatorAccountId: string;
  agentEnabled: boolean;
  autoKickEnabled: boolean;
  members: Member[];
  activeSequenceRunId: string | null;
  activeAgentRunId: string | null;
}
export type GroupDirectoryOrder = "asc" | "desc";
export interface GroupDirectoryItem extends Pick<
  Group,
  | "id"
  | "name"
  | "description"
  | "createdAt"
  | "gatewayGroupId"
  | "status"
  | "agentEnabled"
  | "activeSequenceRunId"
  | "activeAgentRunId"
> {
  memberCount: number;
}
export interface GroupDirectoryPage {
  items: GroupDirectoryItem[];
  nextCursor: string | null;
}
export interface Message {
  id: string;
  msgId: string | null;
  clientMsgId: string | null;
  senderPlatformUserId: string | null;
  isOwn: boolean;
  text: string;
  sentAt: string;
  deliveryStatus: DeliveryStatus | null;
  failCode: string | null;
}
export interface SequenceStep {
  index: number;
  accountRole: "admin" | "member";
  text: string;
  delaySeconds: number;
}
export interface Sequence {
  id: string;
  name: string;
  steps: SequenceStep[];
}
export interface RunStep {
  ordinal?: number;
  kind: "tool_use" | "final" | "protocol_error";
  toolUseId: string | null;
  name: string | null;
  input: unknown;
  resultSummary: string;
  isError: boolean;
  errorCode: string | null;
  auditVerdict: string | null;
  rawResponse: string;
}
export interface AgentRun {
  id: string;
  groupId: string;
  status: "running" | "finished" | "failed" | "blocked" | "cancelled";
  endReason: string | null;
  summary: string | null;
  steps?: RunStep[];
  recoveryNote?: string | null;
}
export interface SequenceRunStep {
  index: number;
  status: "pending" | "accepted" | "sent" | "skipped" | "failed";
  scheduledAt: string | null;
  sentAt: string | null;
  clientMsgId: string | null;
  resolvedVars: Record<string, string>;
  varSources: Record<string, string>;
}
export interface SequenceRun {
  id?: string;
  status: "running" | "finished" | "failed" | "stopped";
  currentStepIndex: number;
  steps: SequenceRunStep[];
}
/** Persisted/wire history stays open for legacy event names and payloads. New
 * producers must use PlatformEventArguments; do not cast history to that type. */
export interface PlatformEvent {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}
export interface PlatformEventPayloads {
  account_status_changed: {
    accountId: string;
    from: AccountStatus;
    to: AccountStatus;
  };
  account_terminal: { accountId: string; status: AccountStatus };
  account_changed: { accountId: string; changedFields: string[] };
  group_changed: {
    groupId: string;
    status?: GroupStatus;
    changedFields: string[];
    directoryChangedFields?: string[];
  };
  message: {
    groupId: string;
    id: string;
    msgId: string | null;
    clientMsgId?: string | null;
    isOwn: boolean;
    source: string;
    changeKind: "created" | "delivery";
    attentionIdentity?: "pending" | "confirmed";
    attentionCreatedSeq?: number;
  };
  job_changed: {
    jobId: string;
    groupId: string | null;
    status: string;
    changedFields: string[];
  };
  agent_run: {
    runId: string;
    groupId: string;
    status: AgentRun["status"];
    endReason: string | null;
    summary: string | null;
    recoveryNote: string | null;
    directoryChangedFields: string[];
  };
  agent_step_changed: {
    runId: string;
    groupId: string;
    ordinal: number;
    changedFields: string[];
  };
  sequence_run: {
    runId: string;
    groupId: string;
    status: SequenceRun["status"];
    currentStepIndex: number;
    directoryChangedFields: string[];
  };
  sequence_step_changed: {
    runId: string;
    groupId: string;
    stepIndex: number;
    changedFields: string[];
  };
  sequence_definition_changed: { sequenceId: string; changedFields: string[] };
  inconsistency:
    | {
        kind:
          | "gateway_event"
          | "account_result_unknown"
          | "agent_recovery_unknown"
          | "job_result_unknown"
          | "duplicate_remote_delivery"
          | "send_result_unknown";
        ref: string | null;
        message: string;
      }
    | {
        kind: "membership_refresh_failed";
        groupId: string;
        platformUserId: string | null;
        operation: "leave" | "kick";
        operationConfirmed: true;
        message: string;
      };
}
export type PlatformEventArguments = {
  [K in keyof PlatformEventPayloads]: [
    type: K,
    payload: PlatformEventPayloads[K],
  ];
}[keyof PlatformEventPayloads];
export type KnownPlatformEvent = {
  [K in keyof PlatformEventPayloads]: {
    seq: number;
    type: K;
    payload: PlatformEventPayloads[K];
  };
}[keyof PlatformEventPayloads];
export interface Job {
  id?: string;
  status: "running" | "finished" | "failed";
  errors: { step: string; code: string }[];
  recoveryNote?: string | null;
}
