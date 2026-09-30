import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { AppContext } from '../../core/context.js';
import { emit, type Queryable } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import type { MessagingService } from '../../core/messaging.js';
import type { SequenceStep } from '../../../../../packages/contracts/src/index.js';

const definitionSchema = z.object({ name: z.string().trim().min(1).max(200), steps: z.array(z.object({ index: z.number().int().positive(), accountRole: z.enum(['admin', 'member']), text: z.string().min(1).max(20000), delaySeconds: z.number().min(0).max(604800) }).strict()).min(1).max(200) }).strict();
const variableSchema = z.record(z.string().regex(/^[A-Za-z0-9_]+$/), z.string().max(20000));
const startSchema = z.object({ sequenceId: z.string().min(1), vars: variableSchema.default({}), stepVars: z.record(z.string().regex(/^[1-9][0-9]*$/), variableSchema).default({}) }).strict();
export interface ResolvedStep { index: number; text: string; resolvedVars: Record<string,string>; varSources: Record<string,string>; }
interface SequenceRow { id: string; name: string; steps: SequenceStep[]; }
interface RunRow { id: string; group_id: string; status: string; current_step_index: number; }
interface StepRow { run_id: string; index: number; status: string; scheduled_at: Date | null; sent_at: Date | null; client_msg_id: string | null; account_role: 'admin' | 'member'; text: string; delay_seconds: number; resolved_vars: Record<string,string>; var_sources: Record<string,string>; }

export function resolveSteps(steps: SequenceStep[], vars: Record<string,string>, stepVars: Record<string,Record<string,string>>): ResolvedStep[] {
  const values: Record<string,string> = Object.create(null) as Record<string,string>;
  const sources: Record<string,string> = Object.create(null) as Record<string,string>;
  for (const [key, value] of Object.entries(vars)) if (value !== '') { values[key] = value; sources[key] = 'default'; }
  return steps.map(step => {
    for (const [key, value] of Object.entries(stepVars[String(step.index)] ?? {})) if (value !== '') { values[key] = value; sources[key] = `step:${step.index}`; }
    const used: Record<string,string> = {}; const usedSources: Record<string,string> = {};
    const text = step.text.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
      if (!Object.hasOwn(values, key)) throw new AppError(422, 'UNRESOLVED_PLACEHOLDER', `Step ${step.index} requires ${key}`, { stepIndex: step.index, key });
      Object.defineProperty(used, key, { value: values[key]!, enumerable: true, configurable: true });
      Object.defineProperty(usedSources, key, { value: sources[key]!, enumerable: true, configurable: true });
      return values[key]!;
    });
    if (text.length > 20000) throw new AppError(400, 'VALIDATION_ERROR', `Resolved step ${step.index} exceeds 20000 characters`);
    return { index: step.index, text, resolvedVars: used, varSources: usedSources };
  });
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body); if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', result.error.issues.map(i => i.message).join('; ')); return result.data;
}
async function notify(tx: Queryable, run: RunRow): Promise<void> { await emit(tx, 'sequence_run', { runId: run.id, groupId: run.group_id, status: run.status, currentStepIndex: run.current_step_index }); }

export class SequenceModule {
  private scheduler: PoolClient | null = null;
  private closed = false;
  constructor(private readonly ctx: AppContext, private readonly messaging: MessagingService) {}
  async register(app: FastifyInstance): Promise<void> {
    app.get('/api/sequences', async () => (await this.ctx.db.query<SequenceRow>('SELECT id,name,steps FROM sequences ORDER BY created_at,id')).rows);
    app.post('/api/sequences', async request => {
      const data = parse(definitionSchema, request.body);
      if (data.steps.some((step, i) => step.index !== i + 1)) throw new AppError(400, 'VALIDATION_ERROR', 'Step indexes must be consecutive and start at 1');
      const id = randomUUID(); await this.ctx.db.query('INSERT INTO sequences(id,name,steps) VALUES($1,$2,$3)', [id, data.name, JSON.stringify(data.steps)]); return { id };
    });
    app.post('/api/sequences/preview', async request => {
      const input = parse(startSchema, request.body); const sequence = await this.definition(input.sequenceId);
      return { steps: resolveSteps(sequence.steps, input.vars, input.stepVars) };
    });
    app.post<{ Params: { id: string } }>('/api/groups/:id/sequence-runs', async (request, reply) => {
      const input = parse(startSchema, request.body); const sequence = await this.definition(input.sequenceId);
      const resolved = resolveSteps(sequence.steps, input.vars, input.stepVars);
      const runId = await this.ctx.db.transaction(async tx => {
        const group = (await tx.query<{ status: string }>('SELECT status FROM groups WHERE id=$1 FOR UPDATE', [request.params.id])).rows[0];
        if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
        if (group.status !== 'active') throw new AppError(409, 'GROUP_UNREACHABLE', 'Group is not active');
        if ((await tx.query('SELECT id FROM sequence_runs WHERE group_id=$1 AND status=\'running\'', [request.params.id])).rowCount) throw new AppError(409, 'SEQUENCE_ALREADY_RUNNING', 'A sequence is already running');
        const id = randomUUID();
        await tx.query('INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES($1,$2,$3)', [id, request.params.id, sequence.id]);
        for (const [i, step] of sequence.steps.entries()) {
          const value = resolved[i]!;
          await tx.query(`INSERT INTO sequence_steps(run_id,index,account_role,text,delay_seconds,resolved_vars,var_sources,scheduled_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $2=1 THEN now()+$5*interval '1 second' ELSE NULL END)`, [id, step.index, step.accountRole, value.text, step.delaySeconds, JSON.stringify(value.resolvedVars), JSON.stringify(value.varSources)]);
        }
        await notify(tx, { id, group_id: request.params.id, status: 'running', current_step_index: 1 }); return id;
      });
      return reply.code(201).send({ runId });
    });
    app.get<{ Params: { id: string } }>('/api/sequence-runs/:id', async request => {
      const run = (await this.ctx.db.query<RunRow>('SELECT * FROM sequence_runs WHERE id=$1', [request.params.id])).rows[0];
      if (!run) throw new AppError(404, 'SEQUENCE_RUN_NOT_FOUND', 'Sequence run not found');
      const steps = (await this.ctx.db.query<StepRow>('SELECT * FROM sequence_steps WHERE run_id=$1 ORDER BY index', [run.id])).rows;
      return { id: run.id, status: run.status, currentStepIndex: run.current_step_index, steps: steps.map(step => ({ index: step.index, status: step.status, scheduledAt: step.scheduled_at?.toISOString() ?? null, sentAt: step.sent_at?.toISOString() ?? null, clientMsgId: step.client_msg_id, resolvedVars: step.resolved_vars, varSources: step.var_sources })) };
    });
  }
  private async definition(id: string): Promise<SequenceRow> { const row = (await this.ctx.db.query<SequenceRow>('SELECT id,name,steps FROM sequences WHERE id=$1', [id])).rows[0]; if (!row) throw new AppError(404, 'SEQUENCE_NOT_FOUND', 'Sequence not found'); return row; }
  async recover(): Promise<void> { await this.ensureScheduler(); }
  async close(): Promise<void> {
    this.closed = true;
    if (this.scheduler) { const connection = this.scheduler; this.scheduler = null; try { await connection.query("SELECT pg_advisory_unlock(hashtextextended(current_schema()||':automation:sequence-scheduler',0))"); } finally { connection.release(); } }
  }
  private async ensureScheduler(): Promise<boolean> {
    if (this.closed) return false;
    if (this.scheduler) return true;
    const connection = await this.ctx.db.pool.connect();
    let acquired: boolean | undefined;
    try { acquired = (await connection.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended(current_schema()||':automation:sequence-scheduler',0)) AS locked")).rows[0]?.locked; }
    catch (error) { connection.release(true); throw error; }
    if (!acquired) { connection.release(); return false; }
    // A session-wide scheduler lock distinguishes takeover after downtime from an
    // additional healthy instance. Joining instances never rebase a live schedule.
    this.scheduler = connection;
    connection.once('error', error => { this.ctx.log.error({ err: error }, 'Sequence scheduler connection lost'); if (this.scheduler === connection) { this.scheduler = null; connection.release(true); } });
    try { await this.rebaseExpired(); return true; }
    catch (error) { if (this.scheduler === connection) { this.scheduler = null; connection.release(true); } throw error; }
  }
  private async rebaseExpired(): Promise<void> {
    const runs = (await this.ctx.db.query<RunRow>('SELECT * FROM sequence_runs WHERE status=\'running\'')).rows;
    for (const run of runs) await this.ctx.db.withLock(`sequence:${run.id}`, async () => {
      // Only the earliest unresolved step has a schedule; accepted sends retain their identity.
      await this.ctx.db.query(`UPDATE sequence_steps SET scheduled_at=now()+delay_seconds*interval '1 second' WHERE run_id=$1 AND index=$2 AND status='pending' AND client_msg_id IS NULL AND scheduled_at<now()`, [run.id, run.current_step_index]);
    });
  }
  async tick(): Promise<void> {
    if (!await this.ensureScheduler()) return;
    const runs = (await this.ctx.db.query<RunRow>('SELECT * FROM sequence_runs WHERE status=\'running\'')).rows;
    await Promise.all(runs.map(run => this.ctx.db.withLock(`sequence:${run.id}`, async () => this.advance(run.id))));
  }
  private async advance(id: string): Promise<void> {
    await this.ctx.db.transaction(async tx => {
      const initial = (await tx.query<RunRow>('SELECT * FROM sequence_runs WHERE id=$1', [id])).rows[0]; if (!initial) return;
      // Match gateway lock order: group -> run -> messages/steps.
      const group = (await tx.query<{ status: string }>('SELECT status FROM groups WHERE id=$1 FOR UPDATE', [initial.group_id])).rows[0];
      const run = (await tx.query<RunRow>('SELECT * FROM sequence_runs WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!run || run.status !== 'running') return;
      if (group?.status !== 'active') { run.status = 'stopped'; await tx.query('UPDATE sequence_runs SET status=$2 WHERE id=$1', [id, run.status]); await notify(tx, run); return; }
      // Terminal account transitions lock account -> messages -> steps. Lock accounts before
      // the step so cancellation and enqueue cannot deadlock or overwrite one another.
      await tx.query('SELECT id FROM accounts WHERE id IN (SELECT account_id FROM members WHERE group_id=$1) ORDER BY id FOR SHARE', [run.group_id]);
      const step = (await tx.query<StepRow>('SELECT * FROM sequence_steps WHERE run_id=$1 AND index=$2 FOR UPDATE', [id, run.current_step_index])).rows[0]; if (!step) return;
      if (step.client_msg_id && (step.status === 'pending' || step.status === 'accepted')) {
        const message = (await tx.query<{ delivery_status: string; fail_code: string | null; updated_at: Date }>('SELECT delivery_status,fail_code,updated_at FROM messages WHERE client_msg_id=$1', [step.client_msg_id])).rows[0];
        if (message?.delivery_status === 'sent') { step.status = 'sent'; step.sent_at = message.updated_at; }
        else if (message?.delivery_status === 'cancelled' && message.fail_code === 'ACCOUNT_TERMINAL') { step.status = 'skipped'; step.sent_at = new Date(); }
        else if (message?.delivery_status === 'failed' || message?.delivery_status === 'cancelled') { step.status = 'failed'; step.sent_at = new Date(); }
        else if (message?.delivery_status === 'accepted') step.status = 'accepted';
        await tx.query('UPDATE sequence_steps SET status=$3,sent_at=$4 WHERE run_id=$1 AND index=$2', [id, step.index, step.status, step.sent_at]);
      }
      if (['sent', 'skipped', 'failed'].includes(step.status)) { await this.progress(tx, run, step); return; }
      if (step.client_msg_id || !step.scheduled_at || step.scheduled_at.getTime() > Date.now()) return;
      const account = (await tx.query<{ id: string; status: string; rate_limited_until: Date | null }>(`SELECT a.id,a.status,a.rate_limited_until FROM members m JOIN accounts a ON a.id=m.account_id WHERE m.group_id=$1 AND a.status IN ('online','rate_limited') AND (CASE WHEN $2='admin' THEN m.role IN ('creator','admin') ELSE m.role='member' END) ORDER BY CASE WHEN a.status='online' THEN 0 ELSE 1 END,CASE WHEN m.role='admin' THEN 0 ELSE 1 END,a.id LIMIT 1`, [run.group_id, step.account_role])).rows[0];
      if (!account) { step.status = 'skipped'; step.sent_at = new Date(); await tx.query('UPDATE sequence_steps SET status=\'skipped\',sent_at=$3 WHERE run_id=$1 AND index=$2', [id, step.index, step.sent_at]); await this.progress(tx, run, step); return; }
      if (account.status === 'rate_limited') return;
      try {
        const message = await this.messaging.enqueueSend({ groupId: run.group_id, accountId: account.id, text: step.text, source: 'sequence', sourceRef: `${id}:${step.index}` }, tx);
        await tx.query('UPDATE sequence_steps SET client_msg_id=$3 WHERE run_id=$1 AND index=$2', [id, step.index, message.clientMsgId]);
      } catch (error) { if (error instanceof AppError && ['ACCOUNT_UNAVAILABLE', 'ACCOUNT_NOT_IN_GROUP'].includes(error.code)) return; throw error; }
    });
  }
  private async progress(tx: Queryable, run: RunRow, step: StepRow): Promise<void> {
    if (step.status === 'failed') run.status = 'failed';
    else {
      const next = (await tx.query<{ index: number }>(`UPDATE sequence_steps SET scheduled_at=$3::timestamptz+delay_seconds*interval '1 second' WHERE run_id=$1 AND index=$2 RETURNING index`, [run.id, step.index + 1, step.sent_at ?? new Date()])).rows[0];
      if (next) run.current_step_index = next.index; else run.status = 'finished';
    }
    await tx.query('UPDATE sequence_runs SET status=$2,current_step_index=$3,updated_at=now() WHERE id=$1', [run.id, run.status, run.current_step_index]); await notify(tx, run);
  }
}
