import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { Database, type Queryable } from '../../apps/server/src/core/db.js';
import { AppError } from '../../apps/server/src/core/errors.js';
import { RemoteClient } from '../../apps/server/src/core/remote.js';
import type { MessagingService, SendInput } from '../../apps/server/src/core/messaging.js';
import { createAutomationModule } from '../../apps/server/src/modules/automation/index.js';
import { parseTurn, tools, validateTool, resultContent } from '../../apps/server/src/modules/automation/protocol.js';
import { resolveSteps } from '../../apps/server/src/modules/automation/sequences.js';
import type { Message } from '../../packages/contracts/src/index.js';

interface TurnBody { runId: string; tools: unknown[]; messages: { role: string; content: { type: string; name?: string; text?: string; content?: string; is_error?: boolean }[] }[]; }
type AgentReply = (body: TurnBody) => unknown;
let db: Database; let admin: Database; let api: FastifyInstance; let remote: FastifyInstance;
let module: ReturnType<typeof createAutomationModule>; let second: ReturnType<typeof createAutomationModule>;
let agentReply: AgentReply; let auditReply: () => unknown; let auditCalls = 0; let enqueueCalls = 0; let kickCalls = 0;
const schema = `automation_${randomUUID().replaceAll('-', '')}`;
const groupId = 'g-automation';
const delay = async (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
function use(id: string, name: string, input: unknown): unknown { return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] }; }
function end(text = 'done'): unknown { return { stop_reason: 'end_turn', content: [{ type: 'text', text }] }; }
async function waitFor(predicate: () => Promise<boolean>, timeout = 5000): Promise<void> {
  const until = Date.now() + timeout;
  do { await Promise.all([module.tick(), second.tick()]); if (await predicate()) return; await delay(20); } while (Date.now() < until);
  throw new Error('Timed out waiting for automation state');
}
async function inbound(text = 'hello'): Promise<string> {
  const id = randomUUID(); await db.query('INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text) VALUES($1,$2,$1,\'external\',false,$3)', [id, groupId, text]); return id;
}
async function latestRun(): Promise<{ id: string; status: string; end_reason: string; history: TurnBody['messages'] }> { return (await db.query<{ id: string; status: string; end_reason: string; history: TurnBody['messages'] }>('SELECT * FROM agent_runs ORDER BY created_at DESC,id DESC LIMIT 1')).rows[0]!; }
async function reset(): Promise<void> {
  await module.close!(); await second.close!();
  await db.query('TRUNCATE agent_send_keys,agent_steps,agent_pending,agent_runs,sequence_steps,sequence_runs,sequences,messages,events CASCADE');
  await db.query('UPDATE groups SET agent_enabled=true,auto_kick_enabled=false,status=\'active\'');
  await db.query('UPDATE accounts SET status=\'online\',rate_limited_until=NULL');
  auditCalls = 0; enqueueCalls = 0; kickCalls = 0; agentReply = () => end(); auditReply = () => ({ verdict: 'pass', reason: 'allowed' });
  const context = { db, agent: new RemoteClient(remote.listeningOrigin), gateway: new RemoteClient(remote.listeningOrigin), log: api.log };
  module = createAutomationModule(context, messaging); second = createAutomationModule(context, messaging);
}
const messaging: MessagingService = {
  async enqueueSend(input: SendInput, tx?: Queryable): Promise<Message> {
    enqueueCalls++; const id = randomUUID(); const client = input.clientMsgId ?? randomUUID();
    await (tx ?? db).query(`INSERT INTO messages(id,group_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,delivery_status,metadata) VALUES($1,$2,$3,$4,$4,true,$5,'accepted',$6)`, [id, input.groupId, client, input.accountId, input.text, JSON.stringify({ source: input.source, sourceRef: input.sourceRef })]);
    return { id, msgId: null, clientMsgId: client, senderPlatformUserId: input.accountId, isOwn: true, text: input.text, sentAt: new Date().toISOString(), deliveryStatus: 'accepted', failCode: null };
  },
  async getMessage(clientMsgId: string): Promise<Message | null> {
    const row = (await db.query<{ id: string; text: string; delivery_status: Message['deliveryStatus']; fail_code: string | null }>('SELECT * FROM messages WHERE client_msg_id=$1', [clientMsgId])).rows[0];
    return row ? { id: row.id, msgId: null, clientMsgId, senderPlatformUserId: 'account-1', isOwn: true, text: row.text, sentAt: new Date().toISOString(), deliveryStatus: row.delivery_status, failCode: row.fail_code } : null;
  },
  async kick(): Promise<{ kicked: true }> { kickCalls++; return { kicked: true }; },
};
before(async () => {
  const base = process.env.DATABASE_URL ?? 'postgres://kapibala:kapibala@localhost:55432/kapibala';
  admin = new Database(base); await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(base); url.searchParams.set('options', `-csearch_path=${schema}`); db = new Database(url.toString());
  await db.query(await readFile(new URL('../../db/migrations/001_core.sql', import.meta.url), 'utf8'));
  await db.query(await readFile(new URL('../../db/migrations/002_automation.sql', import.meta.url), 'utf8'));
  await db.query('UPDATE accounts SET status=\'online\',platform_user_id=id');
  await db.query(`INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled) VALUES($1,'remote-group','account-1',true)`, [groupId]);
  await db.query(`INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,'account-1','account-1','creator'),($1,'account-2','account-2','admin'),($1,'account-3','account-3','member')`, [groupId]);
  remote = Fastify();
  remote.post('/agent/turn', async request => agentReply(request.body as TurnBody));
  remote.post('/agent/audit', async () => { auditCalls++; return auditReply(); });
  await remote.listen({ host: '127.0.0.1', port: 0 });
  api = Fastify(); api.setErrorHandler((error, _request, reply) => { if (error instanceof AppError) return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...error.details } }); return reply.code(500).send({ error: { code: 'INTERNAL', message: String(error) } }); });
  const context = { db, agent: new RemoteClient(remote.listeningOrigin), gateway: new RemoteClient(remote.listeningOrigin), log: api.log };
  module = createAutomationModule(context, messaging); second = createAutomationModule(context, messaging); await module.register(api);
});
after(async () => { await module?.close?.(); await second?.close?.(); await api?.close(); await remote?.close(); await db?.close(); await admin?.query(`DROP SCHEMA ${schema} CASCADE`); await admin?.close(); });

test('tool definitions have all required arguments; invalid protocols are rejected', () => {
  assert.equal(tools.length, 4);
  for (const tool of tools) assert.deepEqual([...tool.input_schema.required ?? []].sort(), Object.keys(tool.input_schema.properties ?? {}).sort());
  assert.equal(parseTurn('```json\n{}\n```'), null);
  assert.equal(parseTurn(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }] })), null);
  assert.equal(validateTool({ type: 'tool_use', id: 't', name: 'send_message', input: { text: 'hello' } }), 'INVALID_INPUT');
  assert.ok(Buffer.byteLength(resultContent({ text: '中'.repeat(10000) })) <= 8192);
});
test('sequence variables persist overrides and report the first unresolved step', () => {
  const steps = [1, 2, 3].map(index => ({ index, accountRole: 'admin' as const, text: '{x} {y}', delaySeconds: 0 }));
  const resolved = resolveSteps(steps, { x: 'default', y: 'first' }, { '2': { x: 'override', y: '' } });
  assert.equal(resolved[2]?.text, 'override first'); assert.deepEqual(resolved[2]?.varSources, { x: 'step:2', y: 'default' });
  assert.throws(() => resolveSteps(steps, { x: '' }, {}), (error: unknown) => error instanceof AppError && error.code === 'UNRESOLVED_PLACEHOLDER' && error.details.stepIndex === 1 && error.details.key === 'x');
});
test('PostgreSQL serializes concurrent sequence starts and failed preflight creates no run', async () => {
  await reset();
  const created = await api.inject({ method: 'POST', url: '/api/sequences', payload: { name: 'announcements', steps: [1, 2, 3].map(index => ({ index, accountRole: 'admin', text: index === 3 ? '{missing}' : 'hello', delaySeconds: 0 })) } });
  const sequenceId = created.json<{ id: string }>().id;
  const invalid = await api.inject({ method: 'POST', url: `/api/groups/${groupId}/sequence-runs`, payload: { sequenceId } });
  assert.equal(invalid.statusCode, 422); assert.equal(invalid.json<{ error: { stepIndex: number } }>().error.stepIndex, 3);
  assert.equal((await db.query('SELECT id FROM sequence_runs')).rowCount, 0); assert.equal(enqueueCalls, 0);
  const calls = await Promise.all([1, 2].map(() => api.inject({ method: 'POST', url: `/api/groups/${groupId}/sequence-runs`, payload: { sequenceId, vars: { missing: 'resolved' } } })));
  assert.deepEqual(calls.map(r => r.statusCode).sort(), [201, 409]);
  assert.equal((await db.query('SELECT id FROM sequence_runs WHERE status=\'running\'')).rowCount, 1);
});
test('multiple workers create one agent run and same send key is audited and enqueued once', async () => {
  await reset();
  agentReply = body => {
    const turns = body.messages.filter(m => m.role === 'assistant').length;
    return turns < 2 ? use(`tool-${turns}`, 'send_message', { text: 'hello', idempotency_key: 'same' }) : end('complete');
  };
  await inbound();
  await waitFor(async () => (await latestRun())?.status === 'finished');
  assert.equal((await db.query('SELECT id FROM agent_runs')).rowCount, 1); assert.equal(auditCalls, 1); assert.equal(enqueueCalls, 1);
  const run = await latestRun(); const result = await api.inject(`/api/agent-runs/${run.id}`);
  assert.equal(result.json<{ steps: unknown[] }>().steps.length, 3);
  assert.equal(run.history.filter(m => m.role === 'user').length, 3);
});
test('bad JSON, unknown tool, duplicate tool id are recorded without corrupting history', async () => {
  await reset(); let call = 0;
  agentReply = () => { call++; if (call === 1) return '```json\n{}\n```'; if (call === 2 || call === 3) return use('duplicate', 'not_a_tool', {}); return end(); };
  await inbound(); await waitFor(async () => (await latestRun())?.status === 'failed');
  assert.equal((await latestRun()).end_reason, 'protocol_errors');
  const steps = (await db.query<{ kind: string; error_code: string; raw_response: string }>('SELECT * FROM agent_steps ORDER BY ordinal')).rows;
  assert.deepEqual(steps.map(s => s.error_code), ['BAD_JSON', 'UNKNOWN_TOOL', 'DUPLICATE_TOOL_USE_ID']);
  assert.deepEqual(steps.map(s => s.kind), ['protocol_error', 'tool_use', 'protocol_error']);
  assert.ok(steps.every(s => s.raw_response.length > 0));
});
test('inconclusive audit blocks without side effects; rejection does not reserve a send key', async () => {
  await reset(); agentReply = () => use('s1', 'send_message', { text: 'test', idempotency_key: 'key' }); auditReply = () => ({ verdict: 'uncertain' });
  await inbound(); await waitFor(async () => (await latestRun())?.status === 'blocked');
  assert.equal(auditCalls, 3); assert.equal(enqueueCalls, 0); assert.equal((await latestRun()).end_reason, 'audit_blocked');
  await reset(); let turn = 0;
  auditReply = () => ({ verdict: auditCalls === 1 ? 'fail' : 'pass', reason: 'policy' });
  agentReply = () => ++turn <= 2 ? use(`s${turn}`, 'send_message', { text: 'test', idempotency_key: 'key' }) : end();
  await inbound(); await waitFor(async () => (await latestRun())?.status === 'finished');
  assert.equal(auditCalls, 2); assert.equal(enqueueCalls, 1);
});
test('messages arriving during a run become one next trigger and own messages never trigger', async () => {
  await reset(); let release: (() => void) | undefined; let first = true;
  agentReply = async () => { if (first) { first = false; await new Promise<void>(resolve => { release = resolve; }); } return end(); };
  await inbound('first'); await waitFor(async () => Boolean(release));
  await inbound('second'); await inbound('third');
  await db.query('INSERT INTO messages(id,group_id,msg_id,is_own,text) VALUES($1,$2,$1,true,\'own\')', [randomUUID(), groupId]);
  await module.tick(); release!();
  await waitFor(async () => (await db.query('SELECT id FROM agent_runs WHERE status=\'finished\'')).rowCount === 2);
  const rows = (await db.query<{ history: TurnBody['messages'] }>('SELECT history FROM agent_runs ORDER BY created_at')).rows;
  const context = JSON.parse(rows[1]!.history[0]!.content[0]!.text!) as { triggerMessages: { text: string }[] };
  assert.deepEqual(context.triggerMessages.map(m => m.text), ['second', 'third']);
  assert.equal((await db.query('SELECT * FROM agent_pending')).rowCount, 3);
});
test('interrupted remote turn is visibly paused and never replayed', async () => {
  await reset(); let calls = 0; agentReply = () => { calls++; return end(); };
  const runId = randomUUID(); await db.query('INSERT INTO agent_runs(id,group_id,inflight_turn) VALUES($1,$2,true)', [runId, groupId]);
  await waitFor(async () => Boolean((await db.query<{ recovery_note: string }>('SELECT recovery_note FROM agent_runs WHERE id=$1', [runId])).rows[0]?.recovery_note));
  assert.equal(calls, 0); assert.equal((await latestRun()).status, 'running');
  assert.equal((await db.query('SELECT * FROM events WHERE type=\'inconsistency\'')).rowCount, 1);
});
test('sequence rate limit defers, sent event schedules next step, and restart only reschedules earliest step', async () => {
  await reset(); await db.query('UPDATE groups SET agent_enabled=false');
  await db.query('UPDATE accounts SET status=\'rate_limited\',rate_limited_until=now()+interval \'1 hour\' WHERE id IN (\'account-1\',\'account-2\')');
  const definition = await api.inject({ method: 'POST', url: '/api/sequences', payload: { name: 'timed', steps: [1, 2].map(index => ({ index, accountRole: 'admin', text: 'test', delaySeconds: index === 1 ? 0 : 10 })) } });
  const start = await api.inject({ method: 'POST', url: `/api/groups/${groupId}/sequence-runs`, payload: { sequenceId: definition.json<{ id: string }>().id } });
  const runId = start.json<{ runId: string }>().runId;
  await module.tick(); assert.equal(enqueueCalls, 0);
  await db.query('UPDATE accounts SET status=\'online\',rate_limited_until=NULL'); await module.tick(); assert.equal(enqueueCalls, 1);
  await db.query('UPDATE messages SET delivery_status=\'sent\',updated_at=now() WHERE is_own'); await module.tick();
  const steps = (await db.query<{ index: number; status: string; scheduled_at: Date; sent_at: Date }>('SELECT * FROM sequence_steps WHERE run_id=$1 ORDER BY index', [runId])).rows;
  assert.equal(steps[0]!.status, 'sent'); assert.equal(steps[1]!.scheduled_at.getTime() - steps[0]!.sent_at.getTime(), 10000);
  await db.query('UPDATE sequence_steps SET scheduled_at=now()-interval \'1 hour\' WHERE run_id=$1 AND index=2', [runId]);
  const expired = (await db.query<{ scheduled_at: Date }>('SELECT scheduled_at FROM sequence_steps WHERE run_id=$1 AND index=2', [runId])).rows[0]!.scheduled_at.getTime();
  await second.recover!();
  assert.equal((await db.query<{ scheduled_at: Date }>('SELECT scheduled_at FROM sequence_steps WHERE run_id=$1 AND index=2', [runId])).rows[0]!.scheduled_at.getTime(), expired, 'a joining instance must not rebase the active scheduler');
  await module.close!();
  const before = Date.now(); await second.recover!();
  const scheduled = (await db.query<{ scheduled_at: Date }>('SELECT scheduled_at FROM sequence_steps WHERE run_id=$1 AND index=2', [runId])).rows[0]!.scheduled_at.getTime();
  assert.ok(scheduled >= before + 9900); assert.equal(enqueueCalls, 1);
});

test('persisted final and prepared send recover without replaying prior external work', async () => {
  await reset(); let calls = 0; agentReply = () => { calls++; return end(); };
  const finalId = randomUUID();
  await db.query('INSERT INTO agent_runs(id,group_id,step_count) VALUES($1,$2,1)', [finalId, groupId]);
  await db.query(`INSERT INTO agent_steps(run_id,ordinal,kind,state,result) VALUES($1,1,'final','complete',$2)`, [finalId, JSON.stringify({ summary: 'saved final' })]);
  await waitFor(async () => (await latestRun())?.status === 'finished');
  assert.equal(calls, 0);
  assert.equal((await api.inject(`/api/agent-runs/${finalId}`)).json<{ summary: string }>().summary, 'saved final');
  await reset();
  const runId = randomUUID(); const tool = { type: 'tool_use', id: 'saved-send', name: 'send_message', input: { text: 'already enqueued', idempotency_key: 'saved-key' } };
  await db.query('INSERT INTO agent_runs(id,group_id,step_count,history) VALUES($1,$2,1,$3)', [runId, groupId, JSON.stringify([{ role: 'user', content: [{ type: 'text', text: '{}' }] }, { role: 'assistant', content: [tool] }])]);
  const message = await messaging.enqueueSend({ groupId, accountId: 'account-2', text: 'already enqueued' });
  await db.query('INSERT INTO agent_send_keys(run_id,idempotency_key,client_msg_id) VALUES($1,\'saved-key\',$2)', [runId, message.clientMsgId]);
  await db.query(`INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','saved-send','send_message',$2,'executing','pass')`, [runId, JSON.stringify(tool.input)]);
  await waitFor(async () => (await latestRun())?.status === 'finished');
  assert.equal(enqueueCalls, 1); assert.equal(auditCalls, 0);
  const history = (await latestRun()).history; assert.equal(history[2]!.content[0]!.type, 'tool_result');
});
test('kick policy and persisted uncertain kick cannot produce a second side effect', async () => {
  await reset(); let calls = 0;
  agentReply = () => ++calls === 1 ? use('kick-policy', 'kick_user', { platform_user_id: 'external', reason: 'policy test' }) : end();
  await inbound(); await waitFor(async () => (await latestRun())?.status === 'finished');
  assert.equal(kickCalls, 0); assert.equal(auditCalls, 0);
  assert.equal((await db.query<{ error_code: string }>('SELECT error_code FROM agent_steps WHERE ordinal=1')).rows[0]!.error_code, 'POLICY_DENIED');
  await reset();
  const id = randomUUID(); await db.query('INSERT INTO agent_runs(id,group_id,step_count) VALUES($1,$2,1)', [id, groupId]);
  await db.query(`INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input,state,audit_verdict) VALUES($1,1,'tool_use','kick-saved','kick_user',$2,'executing','pass')`, [id, JSON.stringify({ platform_user_id: 'external', reason: 'saved' })]);
  await waitFor(async () => Boolean((await db.query<{ recovery_note: string }>('SELECT recovery_note FROM agent_runs WHERE id=$1', [id])).rows[0]?.recovery_note));
  assert.equal(kickCalls, 0); assert.equal((await latestRun()).status, 'running');
});
test('repeated reads stop within twelve steps and result bytes remain bounded', async () => {
  await reset(); let turns = 0;
  agentReply = () => use(`read-${++turns}`, 'get_recent_messages', { limit: 100000 });
  for (let i = 0; i < 55; i++) await inbound('文'.repeat(2000));
  await waitFor(async () => (await latestRun())?.status === 'failed');
  const run = await latestRun(); assert.equal(run.end_reason, 'budget_exhausted'); assert.equal(turns, 12);
  const results = run.history.flatMap(m => m.content).filter(c => c.type === 'tool_result');
  for (const result of results) {
    assert.ok(Buffer.byteLength(result.content!) <= 8192);
    const content = JSON.parse(result.content!) as { messages: unknown[]; truncated: boolean };
    assert.ok(content.messages.length <= 50); assert.equal(content.truncated, true);
  }
});
test('disabling Agent during its current step cancels after that step, without another turn', async () => {
  await reset(); let release: (() => void) | undefined; let turns = 0;
  agentReply = async () => { turns++; await new Promise<void>(resolve => { release = resolve; }); return use('current-step', 'get_recent_messages', { limit: 10 }); };
  await inbound(); await waitFor(async () => Boolean(release));
  await db.query('UPDATE groups SET agent_enabled=false WHERE id=$1', [groupId]);
  await db.query('UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1', [groupId]); release!();
  await waitFor(async () => (await latestRun())?.status === 'cancelled');
  assert.equal(turns, 1); assert.equal((await latestRun()).end_reason, 'cancelled');
  assert.equal((await db.query<{ state: string }>('SELECT state FROM agent_steps')).rows[0]!.state, 'complete');
});

test('activity budget interrupts a late turn and discards the eventual response', async () => {
  await reset(); let turns = 0;
  agentReply = async () => { turns++; await delay(200); return end('too late'); };
  const id = randomUUID(); await db.query('INSERT INTO agent_runs(id,group_id,active_ms) VALUES($1,$2,59930)', [id, groupId]);
  await waitFor(async () => (await latestRun())?.status === 'failed');
  assert.equal((await latestRun()).end_reason, 'wall_clock'); assert.equal(turns, 1);
  await delay(220);
  const steps = (await db.query<{ kind: string; error_code: string }>('SELECT kind,error_code FROM agent_steps WHERE run_id=$1', [id])).rows;
  assert.deepEqual(steps.map(step => step.error_code), ['TURN_TIMEOUT']);
  assert.equal((await latestRun()).status, 'failed');
});
test('activity budget expires during audit without authorizing the prepared tool', async () => {
  await reset(); auditReply = async () => { await delay(200); return { verdict: 'pass', reason: 'late' }; };
  const id = randomUUID(); const input = { text: 'must not send', idempotency_key: 'late-audit' };
  await db.query('INSERT INTO agent_runs(id,group_id,active_ms,step_count) VALUES($1,$2,59930,1)', [id, groupId]);
  await db.query(`INSERT INTO agent_steps(run_id,ordinal,kind,tool_use_id,name,input) VALUES($1,1,'tool_use','late-audit','send_message',$2)`, [id, JSON.stringify(input)]);
  await waitFor(async () => (await latestRun())?.status === 'failed');
  assert.equal((await latestRun()).end_reason, 'wall_clock'); assert.equal(auditCalls, 1); assert.equal(enqueueCalls, 0);
  await delay(220); assert.equal(enqueueCalls, 0);
});
