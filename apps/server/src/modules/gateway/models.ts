import type { QueryResultRow } from 'pg';
import type { Account, AccountStatus, DeliveryStatus, GroupStatus, Message } from '../../../../../packages/contracts/src/index.js';

export interface AccountRow extends QueryResultRow { id: string; status: AccountStatus; platform_user_id: string | null; rate_limited_until: Date | null; }
export interface GroupRow extends QueryResultRow { id: string; gateway_group_id: string; status: GroupStatus; creator_account_id: string; agent_enabled: boolean; auto_kick_enabled: boolean; }
export interface MessageRow extends QueryResultRow {
  id: string; group_id: string; msg_id: string | null; client_msg_id: string | null; account_id: string | null;
  sender_platform_user_id: string | null; is_own: boolean; text: string; sent_at: Date;
  delivery_status: DeliveryStatus | null; fail_code: string | null; dispatch_state: string; attempts: number;
  timeout_at: Date | null; metadata: Record<string, unknown>; created_at: Date;
}
export interface JobError { step: string; code: string; }
export interface JobRow extends QueryResultRow { id: string; kind: 'create' | 'leave'; status: 'running' | 'finished' | 'failed'; group_id: string | null; state: JobState; errors: JobError[]; }
export interface JobState {
  phase: string; creatorAccountId?: string; memberAccountIds?: string[]; localGroupId?: string;
  inviteLink?: string; readyAt?: number; index?: number; joinStartedAt?: number; inviteRetries?: number;
  promoteAttempts?: number; leavingIds?: string[]; nextAt?: number; recoveryNote?: string;
}
export function accountDto(row: AccountRow): Account { return { id: row.id, status: row.status, platformUserId: row.platform_user_id, rateLimitedUntil: row.rate_limited_until?.toISOString() ?? null }; }
export function messageDto(row: MessageRow): Message { return { id: row.id, msgId: row.msg_id, clientMsgId: row.client_msg_id, senderPlatformUserId: row.sender_platform_user_id, isOwn: row.is_own, text: row.text, sentAt: row.sent_at.toISOString(), deliveryStatus: row.delivery_status, failCode: row.fail_code }; }
export const transitions: Readonly<Record<AccountStatus, readonly AccountStatus[]>> = {
  idle: ['online', 'suspended', 'session_expired'], online: ['idle', 'rate_limited', 'disconnected', 'suspended', 'session_expired'],
  rate_limited: ['online', 'disconnected', 'suspended', 'session_expired'], disconnected: ['idle', 'online', 'suspended', 'session_expired'], suspended: [], session_expired: [],
};
export function isTerminal(status: AccountStatus): boolean { return status === 'suspended' || status === 'session_expired'; }
