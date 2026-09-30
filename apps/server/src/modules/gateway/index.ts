import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../core/context.js';
import { emit } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import type { MessagingService, PlatformModule } from '../../core/messaging.js';
import type { Group, Message } from '../../../../../packages/contracts/src/index.js';
import { Accounts, accountStatusSchema } from './accounts.js';
import { GatewayEvents } from './events.js';
import { Jobs } from './jobs.js';
import { Messages } from './messages.js';
import { type GroupRow, type MessageRow, messageDto } from './models.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', '请求参数不符合约定', { issues: result.error.issues });
  return result.data;
}
const idParams = z.object({ id: z.string().min(1) });
const groupInput = z.object({ creatorAccountId: z.string().min(1), memberAccountIds: z.array(z.string().min(1)).min(1) }).refine(value => !value.memberAccountIds.includes(value.creatorAccountId) && new Set(value.memberAccountIds).size === value.memberAccountIds.length, '成员不得重复或包含创建者');

export function createGatewayModule(ctx: AppContext): PlatformModule & MessagingService {
  const accounts = new Accounts(ctx);
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  const jobs = new Jobs(ctx);
  const running = new Map<string, Promise<void>>();
  let closed = false;
  function launch(key: string, work: () => Promise<void>): void {
    if (closed || running.has(key)) return;
    const task = work().catch((error: unknown) => ctx.log.error({ err: error, task: key }, '后台任务本轮失败，持久状态保留以便恢复')).finally(() => running.delete(key));
    running.set(key, task);
  }
  async function getGroup(id: string): Promise<Group> {
    const row = (await ctx.db.query<GroupRow>('SELECT * FROM groups WHERE id=$1', [id])).rows[0];
    if (!row) throw new AppError(404, 'GROUP_NOT_FOUND', '群不存在');
    const members = (await ctx.db.query<{ account_id: string | null; platform_user_id: string; role: 'creator' | 'admin' | 'member' }>('SELECT * FROM members WHERE group_id=$1 ORDER BY role,account_id,platform_user_id', [id])).rows;
    const agentRun = (await ctx.db.query<{ id: string }>("SELECT id FROM agent_runs WHERE group_id=$1 AND status='running'", [id])).rows[0];
    const sequenceRun = (await ctx.db.query<{ id: string }>("SELECT id FROM sequence_runs WHERE group_id=$1 AND status='running'", [id])).rows[0];
    return { id: row.id, gatewayGroupId: row.gateway_group_id, status: row.status, creatorAccountId: row.creator_account_id, agentEnabled: row.agent_enabled, autoKickEnabled: row.auto_kick_enabled, members: members.map(member => ({ accountId: member.account_id, platformUserId: member.platform_user_id, role: member.role })), activeAgentRunId: agentRun?.id ?? null, activeSequenceRunId: sequenceRun?.id ?? null };
  }
  async function register(app: FastifyInstance): Promise<void> {
    app.get('/api/accounts', () => accounts.list());
    app.post('/api/accounts/:id/connect', request => accounts.connect(parse(idParams, request.params).id));
    app.post('/api/accounts/:id/transition', request => {
      const { to, expectedFrom } = parse(z.object({ to: accountStatusSchema, expectedFrom: accountStatusSchema }), request.body);
      return accounts.transition(parse(idParams, request.params).id, to, expectedFrom);
    });
    app.post('/api/groups', async (request, reply) => {
      const input = parse(groupInput, request.body);
      return reply.code(202).send(await jobs.createGroup(input.creatorAccountId, input.memberAccountIds));
    });
    app.get('/api/groups', async () => {
      const rows = (await ctx.db.query<{ id: string }>('SELECT id FROM groups ORDER BY created_at DESC,id')).rows;
      return Promise.all(rows.map(row => getGroup(row.id)));
    });
    app.get('/api/groups/:id', request => getGroup(parse(idParams, request.params).id));
    app.patch('/api/groups/:id', async request => {
      const { id } = parse(idParams, request.params);
      const input = parse(z.object({ agentEnabled: z.boolean().optional(), autoKickEnabled: z.boolean().optional() }).refine(value => value.agentEnabled !== undefined || value.autoKickEnabled !== undefined), request.body);
      await ctx.db.transaction(async tx => {
        const updated = await tx.query('UPDATE groups SET agent_enabled=COALESCE($2,agent_enabled),auto_kick_enabled=COALESCE($3,auto_kick_enabled) WHERE id=$1 RETURNING id', [id, input.agentEnabled ?? null, input.autoKickEnabled ?? null]);
        if (!updated.rowCount) throw new AppError(404, 'GROUP_NOT_FOUND', '群不存在');
        if (input.agentEnabled === false) await tx.query("UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1 AND status='running'", [id]);
        await emit(tx, 'group_changed', { groupId: id });
      });
      return getGroup(id);
    });
    app.post('/api/groups/:id/send', async (request, reply) => {
      const body = parse(z.object({ accountId: z.string().min(1), text: z.string().min(1).max(100000) }), request.body);
      const message = await messages.enqueueSend({ groupId: parse(idParams, request.params).id, ...body });
      return reply.code(202).send({ clientMsgId: message.clientMsgId });
    });
    app.post('/api/groups/:id/leave-all', async (request, reply) => reply.code(202).send(await jobs.leaveAll(parse(idParams, request.params).id)));
    app.get('/api/jobs/:id', request => jobs.get(parse(idParams, request.params).id));
    app.get('/api/groups/:id/messages', async request => {
      const { id } = parse(idParams, request.params);
      const { before, limit } = parse(z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), request.query);
      let snapshotId: string;
      let offset = 0;
      let items: Message[];
      if (before) {
        try {
          const cursor = parse(z.object({ snapshotId: z.string().uuid(), offset: z.number().int().nonnegative() }), JSON.parse(Buffer.from(before, 'base64url').toString('utf8')));
          snapshotId = cursor.snapshotId; offset = cursor.offset;
        } catch { throw new AppError(400, 'VALIDATION_ERROR', '消息游标无效'); }
        const snapshot = (await ctx.db.query<{ items: Message[] }>('SELECT items FROM timeline_snapshots WHERE id=$1 AND group_id=$2', [snapshotId, id])).rows[0];
        if (!snapshot) throw new AppError(400, 'VALIDATION_ERROR', '消息快照不存在，请刷新时间线');
        items = snapshot.items;
      } else {
        if (!(await ctx.db.query('SELECT 1 FROM groups WHERE id=$1', [id])).rowCount) throw new AppError(404, 'GROUP_NOT_FOUND', '群不存在');
        snapshotId = randomUUID();
        // Freeze both membership and ordering. New/changed rows belong to the realtime view or a fresh snapshot.
        items = (await ctx.db.query<MessageRow>('SELECT * FROM messages WHERE group_id=$1 ORDER BY sent_at DESC,id DESC', [id])).rows.map(messageDto);
        await ctx.db.query('INSERT INTO timeline_snapshots(id,group_id,items) VALUES($1,$2,$3)', [snapshotId, id, JSON.stringify(items)]);
      }
      const next = offset + limit;
      return { items: items.slice(offset, next), nextCursor: next < items.length ? Buffer.from(JSON.stringify({ snapshotId, offset: next })).toString('base64url') : null, snapshotId };
    });
  }
  return {
    register,
    enqueueSend: (input, tx) => messages.enqueueSend(input, tx),
    getMessage: clientMsgId => messages.getMessage(clientMsgId),
    kick: input => messages.kick(input),
    recover: async () => { await messages.recover(); events.start(); },
    tick: async () => {
      events.start();
      launch('rate-limits', () => accounts.releaseRateLimits());
      launch('event-retries', () => events.retryFailed());
      const [accountRows, jobRows] = await Promise.all([
        ctx.db.query<{ account_id: string }>("SELECT DISTINCT account_id FROM messages WHERE account_id IS NOT NULL AND delivery_status IN ('queued','accepted','unknown')"),
        ctx.db.query<{ id: string }>("SELECT id FROM jobs WHERE status='running' ORDER BY created_at"),
      ]);
      for (const row of accountRows.rows) launch(`account:${row.account_id}`, () => messages.accountWork(row.account_id));
      for (const row of jobRows.rows) launch(`job:${row.id}`, () => jobs.advance(row.id));
    },
    close: async () => { closed = true; await events.close(); await Promise.allSettled(running.values()); },
  };
}
