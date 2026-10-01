import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { AppContext } from "../../core/context.js";
import {
  currentOperationSignal,
  emit,
  LockCapacityUnavailableError,
  type Queryable,
} from "../../core/db.js";
import { AppError, RemoteError } from "../../core/errors.js";
import type { MessagingService, SendInput } from "../../core/messaging.js";
import type { Message } from "../../../../../packages/contracts/src/index.js";
import {
  type AccountRow,
  type GroupRow,
  type MessageRow,
  isTerminal,
  messageDto,
} from "./models.js";
import { changeAccount, markGroupUnreachable } from "./state.js";
import { resolveMessageAttention } from "./message-attention.js";

const landedSchema = z.object({
  msgId: z.string().min(1),
  sentAt: z.iso.datetime(),
});

function isConfirmedAbsentPendingRetry(row: MessageRow): boolean {
  // Old workers reserved their optional retry only after a safe negative query.
  // pending means that retry has not started, or a clear 503 returned it here.
  // A lost response instead leaves sending/uncertain and must not use this proof.
  return (
    row.delivery_status === "unknown" &&
    row.dispatch_state === "pending" &&
    row.timeout_at === null &&
    Number(row.metadata.timeoutRetries) === 1
  );
}

export async function recordSent(
  tx: Queryable,
  clientMsgId: string,
  msgId: string,
  sentAt: string,
  messageSentObservedAt?: Date,
): Promise<void> {
  const row = (
    await tx.query<MessageRow>(
      "SELECT * FROM messages WHERE client_msg_id=$1 FOR UPDATE",
      [clientMsgId],
    )
  ).rows[0];
  if (!row) return;
  // A query or echo may confirm delivery first. Only the explicit event supplies
  // the B1 scheduling clock, including when delivery is already marked sent.
  if (
    messageSentObservedAt &&
    (row.delivery_status !== "sent" || row.msg_id === msgId)
  )
    await tx.query(
      "UPDATE messages SET message_sent_observed_at=COALESCE(message_sent_observed_at,$2) WHERE id=$1",
      [row.id, messageSentObservedAt],
    );
  if (row.delivery_status === "sent") {
    if (row.msg_id !== msgId)
      await emit(tx, "inconsistency", {
        kind: "duplicate_remote_delivery",
        ref: clientMsgId,
        message: "同一出站标识对应不同远端消息，需要人工核验。",
      });
    return;
  }
  // An echo can arrive before its acknowledgement. Keep the original outbox identity.
  await tx.query(
    "DELETE FROM messages WHERE group_id=$1 AND msg_id=$2 AND id<>$3",
    [row.group_id, msgId, row.id],
  );
  await tx.query(
    "UPDATE messages SET msg_id=$2,sent_at=$3,delivery_status='sent',fail_code=null,dispatch_state='done',timeout_at=null,updated_at=now() WHERE id=$1",
    [row.id, msgId, sentAt],
  );
  await emit(tx, "message", {
    changeKind: "delivery",
    source:
      typeof row.metadata.source === "string" ? row.metadata.source : "manual",
    groupId: row.group_id,
    msgId,
    clientMsgId,
    id: row.id,
    isOwn: true,
  });
  await resolveMessageAttention(tx, row);
}

export class Messages implements MessagingService {
  constructor(private readonly ctx: AppContext) {}
  async enqueueSend(input: SendInput, tx?: Queryable): Promise<Message> {
    if (!tx)
      return this.ctx.db.transaction((connection) =>
        this.enqueueSend(input, connection),
      );
    const group = (
      await tx.query<GroupRow>("SELECT * FROM groups WHERE id=$1 FOR SHARE", [
        input.groupId,
      ])
    ).rows[0];
    if (!group) throw new AppError(404, "GROUP_NOT_FOUND", "群不存在");
    if (group.status !== "active")
      throw new AppError(409, "GROUP_UNREACHABLE", "群不可写");
    const account = (
      await tx.query<AccountRow>(
        "SELECT * FROM accounts WHERE id=$1 FOR SHARE",
        [input.accountId],
      )
    ).rows[0];
    if (!account || !["online", "rate_limited"].includes(account.status))
      throw new AppError(409, "ACCOUNT_UNAVAILABLE", "账号当前不可用");
    if (
      !(
        await tx.query(
          "SELECT 1 FROM members WHERE group_id=$1 AND account_id=$2",
          [input.groupId, input.accountId],
        )
      ).rowCount
    )
      throw new AppError(409, "ACCOUNT_NOT_IN_GROUP", "账号不在群内");
    if (input.clientMsgId) {
      // Correlation is optional; a reused key is rejected, never treated as a retry.
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `client-message:${input.clientMsgId}`,
      ]);
      if (
        (
          await tx.query("SELECT 1 FROM messages WHERE client_msg_id=$1", [
            input.clientMsgId,
          ])
        ).rowCount
      )
        throw new AppError(409, "CLIENT_MSG_ID_CONFLICT", "发送标识已经使用");
    }
    const row = (
      await tx.query<MessageRow>(
        "INSERT INTO messages(id,group_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,delivery_status,metadata) VALUES($1,$2,$3,$4,$5,true,$6,'queued',$7) RETURNING *",
        [
          randomUUID(),
          input.groupId,
          input.clientMsgId ?? randomUUID(),
          input.accountId,
          account.platform_user_id,
          input.text,
          JSON.stringify({
            source: input.source ?? "manual",
            sourceRef: input.sourceRef ?? null,
          }),
        ],
      )
    ).rows[0]!;
    await emit(tx, "message", {
      changeKind: "created",
      source:
        typeof row.metadata.source === "string"
          ? row.metadata.source
          : "manual",
      groupId: row.group_id,
      msgId: null,
      clientMsgId: row.client_msg_id,
      id: row.id,
      isOwn: true,
    });
    return messageDto(row);
  }
  async getMessage(clientMsgId: string): Promise<Message | null> {
    const row = (
      await this.ctx.db.query<MessageRow>(
        "SELECT * FROM messages WHERE client_msg_id=$1",
        [clientMsgId],
      )
    ).rows[0];
    return row ? messageDto(row) : null;
  }
  async accountWork(accountId: string): Promise<void> {
    await this.ctx.db.withLock(`send-account:${accountId}`, async () => {
      await this.recoverAccount(accountId);
      const candidates = (
        await this.ctx.db.query<MessageRow>(
          // Events are inserted at transaction completion. Their sequence preserves
          // commit order even when an older transaction enqueues a message later.
          "SELECT m.* FROM messages m LEFT JOIN LATERAL (SELECT seq FROM events WHERE type='message' AND payload->>'id'=m.id ORDER BY seq LIMIT 1) queued ON true WHERE m.account_id=$1 AND m.delivery_status IN ('queued','unknown','accepted') ORDER BY COALESCE(queued.seq,(m.metadata->>'queueOrder')::bigint) NULLS FIRST,m.created_at,m.id",
          [accountId],
        )
      ).rows;
      for (const row of candidates) {
        if (
          typeof row.metadata.nextAttemptAt === "number" &&
          row.metadata.nextAttemptAt > Date.now()
        )
          break;
        if (row.delivery_status === "unknown") {
          await this.confirm(row);
          // Unknown delivery blocks subsequent sends for this account, preserving order.
          if (
            (await this.getMessage(row.client_msg_id!))?.deliveryStatus ===
            "unknown"
          )
            break;
        } else if (row.delivery_status === "accepted") {
          await this.confirm(row);
        } else {
          if (!(await this.dispatch(row))) break;
        }
      }
    });
  }
  private async persistRemoteResult<T>(
    apply: (tx: Queryable) => Promise<T>,
  ): Promise<T> {
    // Only local SQL is retried here. The remote request has already completed.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.ctx.db.transaction(apply);
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          ["40P01", "40001"].includes(String(error.code));
        if (!retryable || attempt >= 3) throw error;
        this.ctx.log.warn(
          { err: error, attempt },
          "Retrying local persistence of a received gateway result",
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 25));
      }
    }
  }
  private async dispatch(row: MessageRow): Promise<boolean> {
    const canDispatch = await this.ctx.db.transaction(async (tx) => {
      const group = (
        await tx.query<GroupRow>("SELECT * FROM groups WHERE id=$1 FOR SHARE", [
          row.group_id,
        ])
      ).rows[0];
      const account = (
        await tx.query<AccountRow>(
          "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
          [row.account_id],
        )
      ).rows[0];
      const current = (
        await tx.query<MessageRow>(
          "SELECT * FROM messages WHERE id=$1 FOR UPDATE",
          [row.id],
        )
      ).rows[0];
      if (
        !current ||
        !["queued", "unknown"].includes(current.delivery_status ?? "") ||
        current.dispatch_state !== "pending"
      )
        return false;
      if (!account || isTerminal(account.status)) {
        await this.fail(tx, row, "ACCOUNT_TERMINAL", "cancelled");
        return false;
      }
      if (account.status === "rate_limited") return false;
      if (account.status !== "online") {
        await this.fail(tx, row, "ACCOUNT_OFFLINE");
        return false;
      }
      if (group?.status !== "active") {
        await this.fail(tx, row, "GROUP_UNREACHABLE", "cancelled");
        return false;
      }
      await tx.query(
        "UPDATE messages SET dispatch_state='sending',attempts=attempts+1,updated_at=now() WHERE id=$1",
        [row.id],
      );
      return true;
    });
    if (!canDispatch) return false;
    const group = (
      await this.ctx.db.query<GroupRow>("SELECT * FROM groups WHERE id=$1", [
        row.group_id,
      ])
    ).rows[0]!;
    try {
      z.object({ accepted: z.literal(true) }).parse(
        await this.ctx.gateway.request(
          `/groups/${encodeURIComponent(group.gateway_group_id)}/send`,
          {
            accountId: row.account_id,
            clientMsgId: row.client_msg_id,
            text: row.text,
          },
        ),
      );
      await this.persistRemoteResult(async (tx) => {
        const updated = await tx.query(
          "UPDATE messages SET delivery_status='accepted',dispatch_state='waiting_event',timeout_at=null,updated_at=now() WHERE id=$1 AND delivery_status IN ('queued','unknown') RETURNING id",
          [row.id],
        );
        if (updated.rowCount)
          await emit(tx, "message", {
            changeKind: "delivery",
            source:
              typeof row.metadata.source === "string"
                ? row.metadata.source
                : "manual",
            groupId: row.group_id,
            msgId: null,
            id: row.id,
            clientMsgId: row.client_msg_id,
            isOwn: true,
          });
      });
      return true;
    } catch (error) {
      const knownTimeout =
        error instanceof RemoteError && error.code === "NETWORK_TIMEOUT";
      // The gateway's convergence window starts when its 504 is received, not
      // after local row-lock waits or a retry of result persistence completes.
      const receivedTimeoutAt = knownTimeout ? new Date() : null;
      if (
        receivedTimeoutAt &&
        error instanceof RemoteError &&
        error.status === 504
      )
        await this.ctx.testMessageObserver?.boundary({
          phase: "timeout-observed-before-local-save",
          attemptId: randomUUID(),
          groupId: row.group_id,
          clientMsgId: row.client_msg_id!,
          observedAt: receivedTimeoutAt.toISOString(),
        });
      await this.persistRemoteResult(async (tx) => {
        await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
          row.group_id,
        ]);
        await tx.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
          row.account_id,
        ]);
        const current = (
          await tx.query<MessageRow>(
            "SELECT * FROM messages WHERE id=$1 FOR UPDATE",
            [row.id],
          )
        ).rows[0]!;
        if (current.delivery_status === "sent") return;
        if (error instanceof RemoteError && error.code === "RATE_LIMITED") {
          const nested = error.body.error as
            Record<string, unknown> | undefined;
          const seconds = Number(
            error.body.retryAfterSeconds ?? nested?.retryAfterSeconds ?? 1,
          );
          await tx.query(
            "UPDATE messages SET delivery_status='queued',dispatch_state='pending',updated_at=now() WHERE id=$1 AND delivery_status NOT IN ('failed','cancelled')",
            [row.id],
          );
          await changeAccount(
            tx,
            row.account_id!,
            "rate_limited",
            undefined,
            new Date(Date.now() + Math.max(0, seconds) * 1000),
          );
        } else if (
          error instanceof RemoteError &&
          [
            "ACCOUNT_SUSPENDED",
            "SESSION_EXPIRED",
            "GROUP_WRITE_FORBIDDEN",
            "SENDER_NOT_IN_GROUP",
            "ACCOUNT_OFFLINE",
          ].includes(error.code)
        ) {
          await this.fail(tx, row, error.code);
          if (
            error.code === "ACCOUNT_SUSPENDED" ||
            error.code === "SESSION_EXPIRED"
          )
            await changeAccount(
              tx,
              row.account_id!,
              error.code === "ACCOUNT_SUSPENDED"
                ? "suspended"
                : "session_expired",
            );
          if (error.code === "GROUP_WRITE_FORBIDDEN")
            await markGroupUnreachable(tx, row.group_id);
        } else if (error instanceof RemoteError && error.status === 503) {
          await tx.query(
            "UPDATE messages SET dispatch_state='pending',metadata=metadata || $2::jsonb,updated_at=now() WHERE id=$1",
            [row.id, JSON.stringify({ nextAttemptAt: Date.now() + 500 })],
          );
        } else {
          await tx.query(
            "UPDATE messages SET delivery_status='unknown',dispatch_state='uncertain',timeout_at=$2,metadata=metadata || $3::jsonb,updated_at=now() WHERE id=$1 AND delivery_status NOT IN ('failed','cancelled')",
            [
              row.id,
              receivedTimeoutAt,
              JSON.stringify({
                recoveryNote: knownTimeout
                  ? null
                  : "远端调用已开始但缺少可证明的结果；仅查询确认，不自动重发。",
              }),
            ],
          );
          await emit(tx, "message", {
            changeKind: "delivery",
            source:
              typeof row.metadata.source === "string"
                ? row.metadata.source
                : "manual",
            groupId: row.group_id,
            id: row.id,
            clientMsgId: row.client_msg_id,
            msgId: null,
            isOwn: true,
          });
          if (!knownTimeout)
            await emit(tx, "inconsistency", {
              kind: "send_result_unknown",
              ref: row.client_msg_id,
              message: "远端结果待确认，已暂停此账号后续发送。",
            });
        }
      });
      return false;
    }
  }
  private async confirm(row: MessageRow): Promise<void> {
    const group = (
      await this.ctx.db.query<GroupRow>("SELECT * FROM groups WHERE id=$1", [
        row.group_id,
      ])
    ).rows[0]!;
    // A late 404 may describe an observation made before the gateway settled.
    // Only a query initiated after the known 504 window can prove absence.
    const queryStartedAt = Date.now();
    const timeoutAt = row.timeout_at?.getTime();
    const legacyPendingRetry = isConfirmedAbsentPendingRetry(row);
    try {
      const result = landedSchema.parse(
        await this.ctx.gateway.request(
          `/groups/${encodeURIComponent(group.gateway_group_id)}/messages/by-client-id/${encodeURIComponent(row.client_msg_id!)}`,
          undefined,
          2000,
        ),
      );
      await this.ctx.db.transaction((tx) =>
        recordSent(tx, row.client_msg_id!, result.msgId, result.sentAt),
      );
    } catch (error) {
      if (
        !(error instanceof RemoteError) ||
        error.status !== 404 ||
        row.delivery_status !== "unknown" ||
        (!legacyPendingRetry &&
          (row.dispatch_state !== "uncertain" ||
            timeoutAt === undefined ||
            queryStartedAt - timeoutAt < 2100))
      )
        return;
      await this.ctx.db.transaction(async (tx) => {
        const current = (
          await tx.query<MessageRow>(
            "SELECT * FROM messages WHERE id=$1 FOR UPDATE",
            [row.id],
          )
        ).rows[0]!;
        if (
          current.delivery_status !== "unknown" ||
          current.dispatch_state !== row.dispatch_state ||
          current.attempts !== row.attempts ||
          current.timeout_at?.getTime() !== timeoutAt ||
          (legacyPendingRetry && !isConfirmedAbsentPendingRetry(current))
        )
          return;
        // A2 permits one retry but does not require it. Once absence is proven,
        // finish without adding a second remote call and convergence window.
        await this.fail(tx, current, "NETWORK_TIMEOUT");
      });
    }
  }
  async fail(
    tx: Queryable,
    row: MessageRow,
    code: string,
    status: "failed" | "cancelled" = "failed",
  ): Promise<void> {
    await tx.query(
      "UPDATE messages SET delivery_status=$2,fail_code=$3,dispatch_state='done',updated_at=now() WHERE id=$1 AND delivery_status<>'sent'",
      [row.id, status, code],
    );
    await emit(tx, "message", {
      changeKind: "delivery",
      source:
        typeof row.metadata.source === "string"
          ? row.metadata.source
          : "manual",
      groupId: row.group_id,
      id: row.id,
      msgId: row.msg_id,
      clientMsgId: row.client_msg_id,
      isOwn: true,
    });
    await resolveMessageAttention(tx, row);
  }
  async recover(): Promise<void> {
    const accounts = (
      await this.ctx.db.query<{ account_id: string }>(
        "SELECT DISTINCT account_id FROM messages WHERE dispatch_state='sending' AND account_id IS NOT NULL",
      )
    ).rows;
    for (const account of accounts)
      await this.ctx.db.withLock(
        `send-account:${account.account_id}`,
        async () => {
          await this.recoverAccount(account.account_id);
        },
      );
  }
  private async recoverAccount(accountId: string): Promise<void> {
    // The caller owns the account lock. This also repairs an interrupted operation after
    // a database connection loss without requiring the whole application to restart.
    await this.ctx.db.transaction(async (tx) => {
      const uncertain = await tx.query<MessageRow>(
        "UPDATE messages SET delivery_status='unknown',dispatch_state='uncertain',timeout_at=null,metadata=metadata || '{\"recoveryNote\":\"发送意图已持久化，但进程未记录远端响应；不自动重发。\"}'::jsonb WHERE account_id=$1 AND dispatch_state='sending' AND delivery_status IN ('queued','unknown') RETURNING *",
        [accountId],
      );
      for (const row of uncertain.rows)
        await emit(tx, "inconsistency", {
          kind: "send_result_unknown",
          ref: row.client_msg_id,
          message:
            typeof row.metadata.recoveryNote === "string"
              ? row.metadata.recoveryNote
              : "发送意图已持久化，但进程未记录远端响应；不自动重发。",
        });
    });
  }
  async kick(
    input: { groupId: string; accountId: string; targetPlatformUserId: string },
    options?: {
      signal?: AbortSignal;
      beforeDispatch?: () => Promise<void>;
    },
  ): Promise<{ kicked: true }> {
    options?.signal?.throwIfAborted();
    const result = await this.ctx.db.tryWithLock(
      `kick:${input.groupId}:${input.targetPlatformUserId}`,
      async (_connection, lockSignal) => {
        const signal = options?.signal
          ? AbortSignal.any([options.signal, lockSignal])
          : lockSignal;
        signal.throwIfAborted();
        const group = (
          await this.ctx.db.query<GroupRow>(
            "SELECT * FROM groups WHERE id=$1",
            [input.groupId],
          )
        ).rows[0];
        if (!group || group.status !== "active")
          throw new AppError(409, "GROUP_UNREACHABLE", "群不可写");
        const member = (
          await this.ctx.db.query<{ role: string; status: string }>(
            "SELECT m.role,a.status FROM members m JOIN accounts a ON a.id=m.account_id WHERE m.group_id=$1 AND m.account_id=$2",
            [input.groupId, input.accountId],
          )
        ).rows[0];
        if (!member || member.status !== "online")
          throw new AppError(409, "NO_AVAILABLE_ACCOUNT", "没有可执行的账号");
        if (!["creator", "admin"].includes(member.role))
          throw new AppError(403, "NO_PERMISSION", "账号没有移除成员权限");
        await options?.beforeDispatch?.();
        signal.throwIfAborted();
        try {
          z.object({ kicked: z.literal(true) }).parse(
            await this.ctx.gateway.request(
              `/groups/${encodeURIComponent(group.gateway_group_id)}/kick`,
              {
                byAccountId: input.accountId,
                targetPlatformUserId: input.targetPlatformUserId,
              },
              15000,
              signal,
            ),
          );
        } catch (error) {
          if (
            error instanceof RemoteError &&
            [
              "ACCOUNT_SUSPENDED",
              "SESSION_EXPIRED",
              "GROUP_WRITE_FORBIDDEN",
            ].includes(error.code)
          ) {
            await this.ctx.db.transaction(async (tx) => {
              if (error.code === "GROUP_WRITE_FORBIDDEN")
                await markGroupUnreachable(tx, input.groupId);
              else
                await changeAccount(
                  tx,
                  input.accountId,
                  error.code === "ACCOUNT_SUSPENDED"
                    ? "suspended"
                    : "session_expired",
                );
            });
          }
          if (
            !(error instanceof RemoteError) ||
            error.code !== "NETWORK_TIMEOUT"
          )
            throw error;
          await delay(2100, undefined, { signal });
          const members = z
            .array(z.object({ platformUserId: z.string() }))
            .parse(
              await this.ctx.gateway.request(
                `/groups/${encodeURIComponent(group.gateway_group_id)}/members`,
                undefined,
                15000,
                signal,
              ),
            );
          if (
            members.some(
              (item) => item.platformUserId === input.targetPlatformUserId,
            )
          )
            throw new RemoteError(504, "NETWORK_TIMEOUT", {
              recoveryNote:
                "当前成员仍存在；移除与重新加入无法区分，不自动重试。",
            });
        }
        await this.ctx.db.transaction(async (tx) => {
          // The kick's confirmed effect is historical evidence. A later rejoin can
          // already be visible, so project only a fresh snapshot under the group lock.
          await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
            input.groupId,
          ]);
          let members: { platformUserId: string }[];
          try {
            members = z
              .array(z.object({ platformUserId: z.string() }))
              .parse(
                await this.ctx.gateway.request(
                  `/groups/${encodeURIComponent(group.gateway_group_id)}/members`,
                  undefined,
                  15000,
                  signal,
                ),
              );
          } catch (error) {
            currentOperationSignal()?.throwIfAborted();
            this.ctx.log.warn(
              { err: error, groupId: input.groupId },
              "已确认移除操作，当前成员列表刷新失败",
            );
            // The gateway guarantees member_left and retains its history. Existing
            // event retry/replay will refresh the projection without repeating kick.
            await emit(tx, "inconsistency", {
              kind: "membership_refresh_failed",
              groupId: input.groupId,
              platformUserId: input.targetPlatformUserId,
              operation: "kick",
              operationConfirmed: true,
              message:
                "移除操作已成功，当前成员列表暂无法刷新；保留本地状态，等待网关成员事件重试或重放。",
            });
            return;
          }
          if (
            !members.some(
              (member) => member.platformUserId === input.targetPlatformUserId,
            )
          ) {
            const removed = await tx.query(
              "DELETE FROM members WHERE group_id=$1 AND platform_user_id=$2",
              [input.groupId, input.targetPlatformUserId],
            );
            if (removed.rowCount)
              await emit(tx, "group_changed", {
                groupId: input.groupId,
                changedFields: ["members"],
                directoryChangedFields: ["memberCount"],
              });
          }
        });
        return { kicked: true as const };
      },
    );
    if (result.status === "capacity_unavailable")
      throw new LockCapacityUnavailableError();
    if (result.status === "lock_busy")
      throw new AppError(409, "SEND_TIMEOUT", "该成员正在被处理");
    return result.value;
  }
}
