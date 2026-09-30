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
export interface PlatformEvent {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}
export interface Job {
  id?: string;
  status: "running" | "finished" | "failed";
  errors: { step: string; code: string }[];
  recoveryNote?: string | null;
}
