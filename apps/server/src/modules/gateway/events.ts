import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../../core/context.js";
import { emit, type Queryable } from "../../core/db.js";
import { RemoteError } from "../../core/errors.js";
import {
  type AccountRow,
  type GroupRow,
  type MessageRow,
  isTerminal,
} from "./models.js";
import { changeAccount, markGroupUnreachable } from "./state.js";
import { Messages, recordSent } from "./messages.js";
import { recordConfirmationReceipt } from "./confirmation-receipts.js";
import { reconcileLeftMembers } from "./left-membership.js";
import { registerMedia } from "../media-files/index.js";

const gatewayEventSchema = z.discriminatedUnion("type", [
  z.object({
    eventId: z.union([
      z.number().int().nonnegative(),
      z.string().regex(/^\d+$/),
    ]),
    type: z.literal("message"),
    groupId: z.string(),
    msgId: z.string(),
    senderPlatformUserId: z.string(),
    text: z.string(),
    sentAt: z.iso.datetime(),
    mediaUrl: z.string().optional(),
  }),
  z.object({
    eventId: z.union([
      z.number().int().nonnegative(),
      z.string().regex(/^\d+$/),
    ]),
    type: z.literal("message_sent"),
    clientMsgId: z.string(),
    msgId: z.string(),
    sentAt: z.iso.datetime(),
  }),
  z.object({
    eventId: z.union([
      z.number().int().nonnegative(),
      z.string().regex(/^\d+$/),
    ]),
    type: z.literal("message_failed"),
    clientMsgId: z.string(),
    code: z.enum(["GROUP_WRITE_FORBIDDEN", "ACCOUNT_SUSPENDED"]),
  }),
  z.object({
    eventId: z.union([
      z.number().int().nonnegative(),
      z.string().regex(/^\d+$/),
    ]),
    type: z.enum(["member_joined", "member_left"]),
    groupId: z.string(),
    platformUserId: z.string(),
  }),
  z.object({
    eventId: z.union([
      z.number().int().nonnegative(),
      z.string().regex(/^\d+$/),
    ]),
    type: z.literal("account_status"),
    accountId: z.string(),
    status: z.enum(["suspended", "session_expired"]),
  }),
]);
type GatewayEvent = z.infer<typeof gatewayEventSchema>;
const memberListSchema = z.array(z.object({ platformUserId: z.string() }));
export class GatewayEvents {
  private controller: AbortController | undefined;
  private stream: Promise<void> | undefined;
  private readonly retry = new Map<string, GatewayEvent>();
  private readonly issues = new Map<string, string>();
  private readonly messageSentObservedAt = new Map<string, Date>();
  constructor(
    private readonly ctx: AppContext,
    private readonly messages: Messages,
  ) {}
  start(): void {
    if (this.stream) return;
    this.controller = new AbortController();
    this.stream = this.listen(this.controller.signal).finally(() => {
      this.stream = undefined;
    });
  }
  async close(): Promise<void> {
    this.controller?.abort();
    await this.stream;
  }
  async retryFailed(): Promise<void> {
    for (const event of [...this.retry.values()].slice(0, 20)) {
      // A failed retry joins the tail, so persistent failures cannot starve later events.
      this.retry.delete(String(event.eventId));
      await this.process(event);
    }
    for (const [ref, message] of this.issues) {
      try {
        await this.ctx.db.transaction((tx) =>
          emit(tx, "inconsistency", { kind: "gateway_event", ref, message }),
        );
        this.issues.delete(ref);
      } catch {
        break;
      }
    }
  }
  private async listen(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        // Event ids describe creation order, not arrival order. Replaying all history avoids a lossy high-water mark.
        const response = await fetch(
          `${this.ctx.gateway.baseUrl}/events?since=0`,
          { signal },
        );
        if (!response.ok || !response.body)
          throw new Error(`事件流 HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!signal.aborted) {
            const next = await reader.read();
            if (next.done) break;
            // Normalize after joining: CR and LF can arrive in different chunks.
            buffer = (
              buffer + decoder.decode(next.value, { stream: true })
            ).replace(/\r\n/g, "\n");
            let end: number;
            while ((end = buffer.indexOf("\n\n")) !== -1) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
              if (!data) continue;
              try {
                await this.process(gatewayEventSchema.parse(JSON.parse(data)));
              } catch (error) {
                this.ctx.log.error({ err: error }, "网关事件格式错误");
                this.issues.set(
                  `invalid:${Date.now()}`,
                  "网关事件不符合约定，详情见服务日志。",
                );
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        if (!signal.aborted)
          this.ctx.log.warn({ err: error }, "网关事件流断开，将从历史重放恢复");
      }
      if (!signal.aborted)
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  async process(event: GatewayEvent): Promise<void> {
    const ref = String(event.eventId);
    // A local persistence retry retains when this process first received the
    // message, even if a duplicate acknowledgement has another eventId. Include
    // msgId so a conflicting remote delivery cannot supply the valid one's clock.
    const observationKey =
      event.type === "message_sent"
        ? JSON.stringify([event.clientMsgId, event.msgId])
        : undefined;
    const observedAt = observationKey
      ? (this.messageSentObservedAt.get(observationKey) ?? new Date())
      : undefined;
    if (observationKey && observedAt)
      this.messageSentObservedAt.set(observationKey, observedAt);
    try {
      if (
        (
          await this.ctx.db.query(
            "SELECT 1 FROM gateway_events WHERE event_id=$1",
            [ref],
          )
        ).rowCount
      ) {
        this.retry.delete(ref);
        if (observationKey) this.messageSentObservedAt.delete(observationKey);
        return;
      }
      const echoClientId =
        event.type === "message" ? await this.findEcho(event) : null;
      // Save the receipt independently before any dedup/business transaction.
      // Replay after a failed transaction or process death reuses this clock.
      const observationAttemptId = this.ctx.testMessageObserver
        ? randomUUID()
        : undefined;
      if (event.type === "message_sent")
        await this.ctx.testMessageObserver?.boundary({
          phase: "receipt-before-commit",
          attemptId: observationAttemptId!,
          clientMsgId: event.clientMsgId,
          msgId: event.msgId,
          eventId: ref,
          observedAt: observedAt!.toISOString(),
        });
      const reliableObservedAt =
        event.type === "message_sent"
          ? await recordConfirmationReceipt(
              this.ctx.db,
              event.clientMsgId,
              event.msgId,
              ref,
              observedAt!,
            )
          : undefined;
      if (event.type === "message_sent")
        await this.ctx.testMessageObserver?.boundary({
          phase: "receipt-committed-before-business",
          attemptId: observationAttemptId!,
          clientMsgId: event.clientMsgId,
          msgId: event.msgId,
          eventId: ref,
          observedAt: observedAt!.toISOString(),
          receiptObservedAt: reliableObservedAt?.toISOString() ?? null,
        });
      await this.ctx.db.transaction(async (tx) => {
        // Membership reads current remote facts under the group lock. Defer a
        // busy transaction through the existing retry path instead of holding
        // later SSE frames; rollback also removes its dedup ledger entry.
        if (event.type === "member_joined" || event.type === "member_left")
          await tx.query("SET LOCAL lock_timeout = '50ms'");
        const inserted = await tx.query(
          "INSERT INTO gateway_events(event_id,type,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id",
          [ref, event.type, JSON.stringify(event)],
        );
        if (!inserted.rowCount) return;
        switch (event.type) {
          case "account_status":
            await changeAccount(tx, event.accountId, event.status);
            break;
          case "message_sent":
            await recordSent(
              tx,
              event.clientMsgId,
              event.msgId,
              event.sentAt,
              reliableObservedAt,
            );
            break;
          case "message_failed": {
            const row = (
              await tx.query<MessageRow>(
                "SELECT * FROM messages WHERE client_msg_id=$1",
                [event.clientMsgId],
              )
            ).rows[0];
            if (!row) break;
            await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
              row.group_id,
            ]);
            await tx.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
              row.account_id,
            ]);
            await this.messages.fail(tx, row, event.code);
            if (event.code === "ACCOUNT_SUSPENDED")
              await changeAccount(tx, row.account_id!, "suspended");
            else await markGroupUnreachable(tx, row.group_id);
            break;
          }
          case "message": {
            const group = (
              await tx.query<GroupRow>(
                "SELECT * FROM groups WHERE gateway_group_id=$1",
                [event.groupId],
              )
            ).rows[0];
            if (!group)
              throw new Error(
                `群 ${event.groupId} 尚未落库，等待建群响应持久化`,
              );
            if (event.mediaUrl !== undefined)
              await registerMedia(tx, group.id, event.msgId, event.mediaUrl);
            if (echoClientId) {
              await recordSent(tx, echoClientId, event.msgId, event.sentAt);
              break;
            }
            const own = Boolean(
              (
                await tx.query(
                  "SELECT 1 FROM accounts WHERE platform_user_id=$1",
                  [event.senderPlatformUserId],
                )
              ).rowCount,
            );
            // Different text rules out an echo; matching text does not prove one.
            // Hold candidate rows until insertion commits so a concurrent terminal
            // transition cannot resolve before this dependent candidate is visible.
            const pendingClientIds = own
              ? (
                  await tx.query<{ client_msg_id: string }>(
                    "SELECT client_msg_id FROM messages WHERE group_id=$1 AND sender_platform_user_id=$2 AND text=$3 AND client_msg_id IS NOT NULL AND msg_id IS NULL AND delivery_status IN ('queued','accepted','unknown') ORDER BY id FOR SHARE",
                    [group.id, event.senderPlatformUserId, event.text],
                  )
                ).rows.map((row) => row.client_msg_id)
              : [];
            const identityPending = pendingClientIds.length > 0;
            const insertedMessage = await tx.query<{ id: string }>(
              "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(group_id,msg_id) DO NOTHING RETURNING id",
              [
                randomUUID(),
                group.id,
                event.msgId,
                event.senderPlatformUserId,
                own,
                event.text,
                event.sentAt,
                JSON.stringify({
                  agentEligible:
                    !own && group.agent_enabled && group.status === "active",
                  ...(identityPending
                    ? { attentionPendingClientMsgIds: pendingClientIds }
                    : {}),
                  ...(event.mediaUrl ? { mediaUrl: event.mediaUrl } : {}),
                }),
              ],
            );
            if (insertedMessage.rows[0])
              await emit(tx, "message", {
                groupId: group.id,
                changeKind: "created",
                attentionIdentity: identityPending ? "pending" : "confirmed",
                source: "gateway",
                msgId: event.msgId,
                id: insertedMessage.rows[0].id,
                isOwn: own,
              });
            break;
          }
          case "member_joined":
          case "member_left": {
            const group = (
              await tx.query<GroupRow>(
                "SELECT * FROM groups WHERE gateway_group_id=$1 FOR UPDATE",
                [event.groupId],
              )
            ).rows[0];
            if (!group) throw new Error(`群 ${event.groupId} 尚未落库`);
            // Fetch after taking the group lock: a delayed response must not overwrite
            // membership already reconciled by another event worker or a local removal.
            const gatewayMembers = memberListSchema.parse(
              await this.ctx.gateway.request(
                `/groups/${encodeURIComponent(event.groupId)}/members`,
                undefined,
                2000,
              ),
            );
            if (group.status === "left") {
              const membership = await reconcileLeftMembers(
                tx,
                group.id,
                gatewayMembers,
              );
              if (membership.changed)
                await emit(tx, "group_changed", {
                  groupId: group.id,
                  changedFields: ["members"],
                  directoryChangedFields: membership.countChanged
                    ? ["memberCount"]
                    : [],
                });
              break;
            }
            const beforeMembers = (
              await tx.query(
                "SELECT platform_user_id,account_id,role FROM members WHERE group_id=$1 ORDER BY platform_user_id",
                [group.id],
              )
            ).rows;
            const present = gatewayMembers.some(
              (member) => member.platformUserId === event.platformUserId,
            );
            if (!present)
              await tx.query(
                "DELETE FROM members WHERE group_id=$1 AND platform_user_id=$2",
                [group.id, event.platformUserId],
              );
            else if (event.type === "member_joined")
              await this.upsertMember(tx, group, event.platformUserId);
            const afterMembers = (
              await tx.query(
                "SELECT platform_user_id,account_id,role FROM members WHERE group_id=$1 ORDER BY platform_user_id",
                [group.id],
              )
            ).rows;
            if (JSON.stringify(beforeMembers) !== JSON.stringify(afterMembers))
              await emit(tx, "group_changed", {
                groupId: group.id,
                changedFields: ["members"],
                directoryChangedFields:
                  beforeMembers.length !== afterMembers.length
                    ? ["memberCount"]
                    : [],
              });
            break;
          }
        }
      });
      this.retry.delete(ref);
      if (observationKey) this.messageSentObservedAt.delete(observationKey);
    } catch (error) {
      this.retry.set(ref, event);
      if (!this.issues.has(ref))
        this.ctx.log.error(
          { err: error, eventId: ref, eventType: event.type },
          "网关事件暂未持久化，将重试并在重启时重放",
        );
      this.issues.set(
        ref,
        "网关事件处理失败，事件保留在网关历史中并等待重试。",
      );
    }
  }
  private async upsertMember(
    tx: Queryable,
    group: GroupRow,
    platformUserId: string,
  ): Promise<void> {
    const account = (
      await tx.query<AccountRow>(
        "SELECT * FROM accounts WHERE platform_user_id=$1 FOR SHARE",
        [platformUserId],
      )
    ).rows[0];
    if (group.status === "left" || (account && isTerminal(account.status)))
      return;
    await tx.query(
      "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(group_id,platform_user_id) DO UPDATE SET account_id=EXCLUDED.account_id",
      [
        group.id,
        account?.id ?? null,
        platformUserId,
        account?.id === group.creator_account_id ? "creator" : "member",
      ],
    );
  }
  private async findEcho(
    event: Extract<GatewayEvent, { type: "message" }>,
  ): Promise<string | null> {
    const rows = (
      await this.ctx.db.query<MessageRow>(
        "SELECT m.* FROM messages m JOIN groups g ON g.id=m.group_id WHERE g.gateway_group_id=$1 AND m.is_own=true AND m.sender_platform_user_id=$2 AND (m.msg_id=$3 OR (m.msg_id IS NULL AND m.text=$4)) ORDER BY m.created_at",
        [event.groupId, event.senderPlatformUserId, event.msgId, event.text],
      )
    ).rows;
    for (const row of rows) {
      if (row.msg_id === event.msgId && row.client_msg_id)
        return row.client_msg_id;
      if (!row.client_msg_id) continue;
      try {
        const landed = z
          .object({ msgId: z.string() })
          .parse(
            await this.ctx.gateway.request(
              `/groups/${encodeURIComponent(event.groupId)}/messages/by-client-id/${encodeURIComponent(row.client_msg_id)}`,
              undefined,
              2000,
            ),
          );
        if (landed.msgId === event.msgId) return row.client_msg_id;
      } catch (error) {
        if (!(error instanceof RemoteError && error.status === 404))
          throw error;
      }
    }
    return null;
  }
}
