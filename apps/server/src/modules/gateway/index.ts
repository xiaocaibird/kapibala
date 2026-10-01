import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.js";
import { emit } from "../../core/db.js";
import { AppError } from "../../core/errors.js";
import type {
  KickOptions,
  MessagingService,
  PlatformModule,
} from "../../core/messaging.js";
import type {
  Group,
  Message,
} from "../../../../../packages/contracts/src/index.js";
import { Accounts, accountStatusSchema } from "./accounts.js";
import { GatewayEvents } from "./events.js";
import { Jobs } from "./jobs.js";
import {
  groupDescriptionSchema,
  groupNameSchema,
  groupPatchSchema,
  groupProfileFields,
} from "./group-profile.js";
import { registerGroupDirectory } from "./group-directory.js";
import { Messages } from "./messages.js";
import { type GroupRow, type MessageRow, messageDto } from "./models.js";
import { MediaFiles, withCurrentFiles } from "../media-files/index.js";
import { requestGroupAgentCancellation } from "../automation/lifecycle.js";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(400, "VALIDATION_ERROR", "请求参数不符合约定", {
      issues: result.error.issues,
    });
  return result.data;
}
const idParams = z.object({ id: z.string().min(1) });
const groupInput = z
  .object({
    name: groupNameSchema.optional(),
    description: groupDescriptionSchema.optional(),
    creatorAccountId: z.string().min(1),
    memberAccountIds: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (value) =>
      !value.memberAccountIds.includes(value.creatorAccountId) &&
      new Set(value.memberAccountIds).size === value.memberAccountIds.length,
    "成员不得重复或包含创建者",
  );

export function createGatewayModule(
  ctx: AppContext,
): PlatformModule & MessagingService & { readonly name: string } {
  const accounts = new Accounts(ctx);
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  const jobs = new Jobs(ctx);
  const media = new MediaFiles(ctx);
  const running = new Map<string, Promise<void>>();
  let closed = false;
  function launch(key: string, work: () => Promise<void>): void {
    if (closed || running.has(key)) return;
    const task = work()
      .catch((error: unknown) =>
        ctx.log.error(
          { err: error, task: key },
          "后台任务本轮失败，持久状态保留以便恢复",
        ),
      )
      .finally(() => running.delete(key));
    running.set(key, task);
  }
  async function getGroup(id: string): Promise<Group> {
    const row = (
      await ctx.db.query<GroupRow>("SELECT * FROM groups WHERE id=$1", [id])
    ).rows[0];
    if (!row) throw new AppError(404, "GROUP_NOT_FOUND", "群不存在");
    const members = (
      await ctx.db.query<{
        account_id: string | null;
        platform_user_id: string;
        role: "creator" | "admin" | "member";
      }>(
        "SELECT * FROM members WHERE group_id=$1 ORDER BY role,account_id,platform_user_id",
        [id],
      )
    ).rows;
    const agentRun = (
      await ctx.db.query<{ id: string }>(
        "SELECT id FROM agent_runs WHERE group_id=$1 AND status='running'",
        [id],
      )
    ).rows[0];
    const sequenceRun = (
      await ctx.db.query<{ id: string }>(
        "SELECT id FROM sequence_runs WHERE group_id=$1 AND status='running'",
        [id],
      )
    ).rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at.toISOString(),
      gatewayGroupId: row.gateway_group_id,
      status: row.status,
      creatorAccountId: row.creator_account_id,
      agentEnabled: row.agent_enabled,
      autoKickEnabled: row.auto_kick_enabled,
      members: members.map((member) => ({
        accountId: member.account_id,
        platformUserId: member.platform_user_id,
        role: member.role,
      })),
      activeAgentRunId: agentRun?.id ?? null,
      activeSequenceRunId: sequenceRun?.id ?? null,
    };
  }
  async function register(app: FastifyInstance): Promise<void> {
    registerGroupDirectory(app, ctx);
    app.get("/api/accounts", () => accounts.list());
    app.post("/api/accounts/:id/connect", (request) =>
      accounts.connect(parse(idParams, request.params).id, request.id),
    );
    app.post("/api/accounts/:id/transition", (request) => {
      const { to, expectedFrom } = parse(
        z.object({
          to: accountStatusSchema,
          expectedFrom: accountStatusSchema,
        }),
        request.body,
      );
      return accounts.transition(
        parse(idParams, request.params).id,
        to,
        expectedFrom,
        request.id,
      );
    });
    app.post("/api/groups", async (request, reply) => {
      const input = parse(groupInput, request.body);
      return reply
        .code(202)
        .send(
          await jobs.createGroup(
            input.creatorAccountId,
            input.memberAccountIds,
            input.name,
            input.description,
          ),
        );
    });
    app.get("/api/groups", async () => {
      const rows = (
        await ctx.db.query<{ id: string }>(
          "SELECT id FROM groups ORDER BY created_at DESC,id",
        )
      ).rows;
      return Promise.all(rows.map((row) => getGroup(row.id)));
    });
    app.get("/api/groups/:id", (request) =>
      getGroup(parse(idParams, request.params).id),
    );
    app.patch("/api/groups/:id", async (request) => {
      const { id } = parse(idParams, request.params);
      const input = parse(groupPatchSchema, request.body);
      await ctx.db.transaction(async (tx) => {
        const before = (
          await tx.query<GroupRow>(
            "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!before) throw new AppError(404, "GROUP_NOT_FOUND", "群不存在");
        const changedFields = (
          Object.entries({
            name: before.name,
            description: before.description,
            agentEnabled: before.agent_enabled,
            autoKickEnabled: before.auto_kick_enabled,
          }) as [keyof typeof input, unknown][]
        )
          .filter(
            ([key, value]) => input[key] !== undefined && input[key] !== value,
          )
          .map(([key]) => key);
        // Compare only the submitted profile fields. The conditional write must
        // succeed before settings, Agent cancellation or change events take effect.
        const updated = await tx.query(
          "UPDATE groups SET name=COALESCE($2,name),description=CASE WHEN $3::boolean THEN $4::text ELSE description END,agent_enabled=COALESCE($5,agent_enabled),auto_kick_enabled=COALESCE($6,auto_kick_enabled) WHERE id=$1 AND (NOT $7::boolean OR name IS NOT DISTINCT FROM $8::text) AND (NOT $9::boolean OR description IS NOT DISTINCT FROM $10::text) RETURNING id",
          [
            id,
            input.name ?? null,
            input.description !== undefined,
            input.description ?? null,
            input.agentEnabled ?? null,
            input.autoKickEnabled ?? null,
            input.expected?.name !== undefined,
            input.expected?.name ?? null,
            input.expected?.description !== undefined,
            input.expected?.description ?? null,
          ],
        );
        if (!updated.rowCount)
          throw new AppError(
            409,
            "GROUP_PROFILE_CONFLICT",
            "群资料已被其他人修改，请比较最新内容后重新确认。",
            {
              current: { name: before.name, description: before.description },
              conflictingFields: groupProfileFields.filter(
                (field) =>
                  input.expected?.[field] !== undefined &&
                  input.expected[field] !== before[field],
              ),
            },
          );
        if (input.agentEnabled === false)
          await requestGroupAgentCancellation(tx, id);
        if (changedFields.length)
          await emit(tx, "group_changed", { groupId: id, changedFields });
      });
      return getGroup(id);
    });
    app.post("/api/groups/:id/send", async (request, reply) => {
      const body = parse(
        z.object({
          accountId: z.string().min(1),
          text: z.string().min(1).max(100000),
          clientMsgId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{1,128}$/)
            .optional(),
        }),
        request.body,
      );
      const message = await messages.enqueueSend({
        groupId: parse(idParams, request.params).id,
        ...body,
      });
      return reply.code(202).send({ clientMsgId: message.clientMsgId });
    });
    app.post("/api/groups/:id/leave-all", async (request, reply) =>
      reply
        .code(202)
        .send(await jobs.leaveAll(parse(idParams, request.params).id)),
    );
    app.get("/api/jobs/:id", (request) =>
      jobs.get(parse(idParams, request.params).id),
    );
    app.get("/api/groups/:id/messages", async (request) => {
      const { id } = parse(idParams, request.params);
      const { before, limit } = parse(
        z.object({
          before: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        request.query,
      );
      let snapshotId: string;
      let offset = 0;
      let items: Message[];
      let total: number;
      if (before) {
        try {
          const cursor = parse(
            z.object({
              snapshotId: z.string().uuid(),
              offset: z.number().int().nonnegative(),
            }),
            JSON.parse(Buffer.from(before, "base64url").toString("utf8")),
          );
          snapshotId = cursor.snapshotId;
          offset = cursor.offset;
        } catch {
          throw new AppError(400, "VALIDATION_ERROR", "消息游标无效");
        }
        const snapshot = (
          await ctx.db.query<{ items: Message[]; total: number }>(
            // Slice in PostgreSQL: old cursors and frozen ordering stay intact,
            // while continuation pages no longer transfer the complete snapshot.
            // PostgreSQL still reads the JSONB value; this is not incremental storage.
            "SELECT jsonb_array_length(items) AS total, COALESCE((SELECT jsonb_agg(items->position ORDER BY position) FROM generate_series(LEAST($3::numeric, jsonb_array_length(items))::int, LEAST(jsonb_array_length(items), $3::numeric+$4::int)::int-1) AS position), '[]'::jsonb) AS items FROM timeline_snapshots WHERE id=$1 AND group_id=$2",
            [snapshotId, id, offset, limit],
          )
        ).rows[0];
        if (!snapshot)
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "消息快照不存在，请刷新时间线",
          );
        items = snapshot.items;
        total = snapshot.total;
      } else {
        if (
          !(await ctx.db.query("SELECT 1 FROM groups WHERE id=$1", [id]))
            .rowCount
        )
          throw new AppError(404, "GROUP_NOT_FOUND", "群不存在");
        snapshotId = randomUUID();
        // Freeze both membership and ordering. New/changed rows belong to the realtime view or a fresh snapshot.
        items = (
          await ctx.db.query<MessageRow>(
            "SELECT * FROM messages WHERE group_id=$1 ORDER BY sent_at DESC,id DESC",
            [id],
          )
        ).rows.map(messageDto);
        await ctx.db.query(
          "INSERT INTO timeline_snapshots(id,group_id,items) VALUES($1,$2,$3)",
          [
            snapshotId,
            id,
            JSON.stringify(
              items.map(({ localFilePath: _path, ...item }) => item),
            ),
          ],
        );
        total = items.length;
        items = items.slice(0, limit);
      }
      const next = offset + limit;
      return {
        items: await withCurrentFiles(ctx.db, id, items),
        nextCursor:
          next < total
            ? Buffer.from(
                JSON.stringify({ snapshotId, offset: next }),
              ).toString("base64url")
            : null,
        snapshotId,
      };
    });
  }
  return {
    name: "gateway",
    register,
    enqueueSend: (input, tx) => messages.enqueueSend(input, tx),
    getMessage: (clientMsgId, reader) =>
      messages.getMessage(clientMsgId, reader),
    kick: (input, options?: KickOptions) => messages.kick(input, options),
    recover: async () => {
      await media.recover();
      await messages.recover();
      events.start();
    },
    tick: async () => {
      events.start();
      launch("rate-limits", () => accounts.releaseRateLimits());
      launch("event-retries", () => events.retryFailed());
      launch("media-files", () => media.tick());
      const [accountRows, jobRows] = await Promise.all([
        ctx.db.query<{ account_id: string }>(
          "SELECT DISTINCT account_id FROM messages WHERE account_id IS NOT NULL AND delivery_status IN ('queued','accepted','unknown')",
        ),
        ctx.db.query<{ id: string }>(
          "SELECT id FROM jobs WHERE status='running' ORDER BY created_at",
        ),
      ]);
      for (const row of accountRows.rows)
        launch(`account:${row.account_id}`, () =>
          messages.accountWork(row.account_id),
        );
      for (const row of jobRows.rows)
        launch(`job:${row.id}`, () => jobs.advance(row.id));
    },
    close: async () => {
      closed = true;
      media.close();
      await events.close();
      await Promise.allSettled(running.values());
    },
  };
}
