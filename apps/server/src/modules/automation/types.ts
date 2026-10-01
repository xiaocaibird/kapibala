import type { AgentRun } from "../../../../../packages/contracts/src/index.js";
import type { ConversationMessage } from "./protocol.js";

export interface RunRow {
  id: string;
  group_id: string;
  status: AgentRun["status"];
  end_reason: string | null;
  summary: string | null;
  history: ConversationMessage[];
  step_count: number;
  protocol_errors: number;
  active_ms: string;
  activity_updated_at: Date;
  cancel_requested: boolean;
  inflight_turn: boolean;
  recovery_note: string | null;
}
export interface StepRow {
  run_id: string;
  ordinal: number;
  kind: "tool_use" | "final" | "protocol_error";
  tool_use_id: string | null;
  name: string | null;
  input: unknown;
  result_summary: string;
  is_error: boolean;
  error_code: string | null;
  audit_verdict: string | null;
  raw_response: string;
  state: string;
  result: Record<string, unknown> | null;
  audit_attempts: number;
  intent: {
    accountId?: string;
    targetPlatformUserId?: string;
    dispatchState?: "awaiting_admission" | "dispatching";
  } | null;
}
export interface GroupRow {
  id: string;
  status: string;
  agent_enabled: boolean;
  auto_kick_enabled: boolean;
}
export interface RecentRow {
  msg_id: string | null;
  sender_platform_user_id: string | null;
  is_own: boolean;
  text: string;
  sent_at: Date;
}
