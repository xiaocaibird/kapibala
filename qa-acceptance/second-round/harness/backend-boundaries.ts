import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun, Group } from '../../harness/platform-client.js';
import { BlockedError } from '../../harness/security.js';
import { capacityControlFor } from '../../harness/capacity-control.js';
import { runtimeObservationFor } from '../../harness/runtime-observation.js';
import { assertSingleEpochActivityBudget, assertSingleEpochLifecycleBudget } from '../../tests/support/agent-activity-budget.js';
import { assertDiagnostics, record } from './backend-oracles.js';

export async function observeBackend<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 30_000, description = 'required causal boundary'): Promise<T> {
  const until = performance.now() + ms;
  do { const v = await read(); if (done(v)) return v; await new Promise(r => setTimeout(r, 40)); } while (performance.now() < until);
  throw new BlockedError('Actual ' + description + ' not observed within finite diagnostic budget');
}
const calls = (qa: QaEnvironment, g: Group, path: string) => qa.gateway.snapshot().requests.filter(r => r.method === 'POST' && r.path === '/groups/' + g.gatewayGroupId + '/' + path);
async function cleanupObserved(qa: QaEnvironment, primary: unknown, actions: (() => Promise<unknown> | unknown)[]) {
  const errors: string[] = [];
  for (const action of actions) try { await action(); } catch (error) { errors.push(String(error)); }
  if (errors.length) {
    try { await qa.evidence('backend-cleanup-' + randomUUID(), { primary: String(primary), errors }); } catch (error) { errors.push(String(error)); }
    if (!primary) throw new BlockedError('Owned backend boundary cleanup incomplete: ' + errors.join('; '));
  }
}
const turns = (qa: QaEnvironment, id: string) => qa.agent.snapshot().turns.filter(t => record(t.body).runId === id);
export async function startBackendRun(qa: QaEnvironment, group: Group) {
  await qa.api.require(qa.api.patch('/api/groups/' + group.id, { agentEnabled: true }));
  const before = await qa.api.require(qa.api.get<AgentRun[]>('/api/groups/' + group.id + '/agent-runs'));
  qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'qa-boundary-outsider', text: randomUUID() });
  const current = await observeBackend(() => qa.api.require(qa.api.get<AgentRun[]>('/api/groups/' + group.id + '/agent-runs')), rows => rows.some(r => !before.some(v => v.id === r.id)));
  const newRuns = current.filter(r => !before.some(v => v.id === r.id)); assert.equal(newRuns.length, 1);
  return newRuns[0]!.id;
}
export async function finishBackendRun(qa: QaEnvironment, id: string, ms = 30_000) {
  return observeBackend(() => qa.api.agentRun(id), r => r.status !== 'running', ms, 'original run terminal');
}
export function backendTool(id: string, name: string, input: unknown) {
  return { body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } };
}
async function preparedKick(qa: QaEnvironment) {
  const { group } = await qa.api.createGroup(), target = 'qa-external-' + randomUUID(), toolId = randomUUID(), barrier = 'qa-audit-' + randomUUID();
  qa.gateway.setMembership(group.gatewayGroupId, target, true);
  await observeBackend(() => qa.api.group(group.id), g => g.members.some(m => m.platformUserId === target && !m.accountId));
  await qa.api.require(qa.api.patch('/api/groups/' + group.id, { autoKickEnabled: true }));
  const auditStart = qa.agent.snapshot().audits.length;
  qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'independent boundary test' }, barrier: { phase: 'before-response', name: barrier } });
  qa.agent.enqueueTurns(backendTool(toolId, 'kick_user', { platform_user_id: target, reason: 'independent boundary test' }));
  const startedMono = performance.now(), runId = await startBackendRun(qa, group);
  const hit = await qa.agent.barriers.waitFor(barrier);
  return { group, target, toolId, barrier, runId, hit, auditStart, startedMono };
}

/** Covers the other two independent current-step waits and simultaneous profile fields. */
export async function cancelAtKickWait(qa: QaEnvironment, wait: 'capacity' | 'remote-response') {
  const control = capacityControlFor(qa); let k: Awaited<ReturnType<typeof preparedKick>> | undefined;
  const remoteBarrier = 'qa-response-' + randomUUID(); let complete = false, primary: unknown;
  try {
    if (wait === 'capacity') await control.verify(['admission-hold']);
    k = await preparedKick(qa);
    const lease = wait === 'capacity' ? await control.hold({ groupId: k.group.id, runId: k.runId, toolUseId: k.toolId }) : undefined;
    if (wait === 'remote-response') qa.gateway.enqueue('/groups/' + k.group.gatewayGroupId + '/kick', { barrier: { phase: 'before-response', name: remoteBarrier } });
    qa.agent.barriers.release(k.barrier);
    const actualWait = lease ? await lease.waitFor(s => s.events.some(e => e.kind === 'admission-refused'), { timeoutMs: 20_000 }) : await qa.gateway.barriers.waitFor(remoteBarrier);
    if (lease) assert.equal(calls(qa, k.group, 'kick').length, 0); else assert.equal(calls(qa, k.group, 'kick').length, 1);
    const before = record(await qa.api.group(k.group.id)), name = 'cancel-' + randomUUID();
    await qa.api.require(qa.api.patch('/api/groups/' + k.group.id, { name, expected: { name: before.name }, agentEnabled: false }));
    const disabled = record(await qa.api.group(k.group.id)); assert.equal(disabled.agentEnabled, false); assert.equal(disabled.name, name);
    if (lease) await lease.release(); else qa.gateway.barriers.release(remoteBarrier);
    const run = await finishBackendRun(qa, k.runId);
    assert.equal(run.status, 'cancelled'); assert.equal(run.endReason, 'cancelled');
    assert.equal(run.steps.find(s => s.toolUseId === k!.toolId)?.isError, false);
    assert.equal(calls(qa, k.group, 'kick').length, 1, 'one already-current legitimate step may complete');
    assert.equal(qa.agent.snapshot().audits.length - k.auditStart, 1); assert.equal(turns(qa, k.runId).length, 1);
    assert.equal((await qa.api.group(k.group.id)).activeAgentRunId, null);
    // Two actual subsequent scheduler reads, not an invented completion SLA.
    for (let i = 0; i < 2; i++) { await qa.api.group(k.group.id); assert.equal(calls(qa, k.group, 'kick').length, 1); assert.equal(turns(qa, k.runId).length, 1); }
    complete = true; return { wait, actualWait, before, disabled, run, kickRequests: calls(qa, k.group, 'kick') };
  } catch (error) { primary = error; throw error; } finally {
    await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => { if (k) qa.agent.barriers.release(k.barrier); qa.gateway.barriers.release(remoteBarrier); }, () => control.close()]);
  }
}

export async function deferredPermissionChange(qa: QaEnvironment) {
  const control = capacityControlFor(qa); let k: Awaited<ReturnType<typeof preparedKick>> | undefined; let complete = false, primary: unknown;
  try {
    await control.verify(['admission-hold']); k = await preparedKick(qa);
    const lease = await control.hold({ groupId: k.group.id, runId: k.runId, toolUseId: k.toolId });
    qa.agent.barriers.release(k.barrier);
    const refusal = await lease.waitFor(s => s.events.some(e => e.kind === 'admission-refused'));
    const actors = k.group.members.filter(m => m.accountId && m.role !== 'member'); assert.ok(actors.length);
    for (const actor of actors) await qa.api.require(qa.api.post('/api/accounts/' + actor.accountId + '/transition', { expectedFrom: 'online', to: 'disconnected' }));
    const accounts = await qa.api.accounts(); assert.ok(actors.every(a => accounts.find(v => v.id === a.accountId)?.status === 'disconnected'));
    await lease.release(); const run = await finishBackendRun(qa, k.runId), step = run.steps.find(s => s.toolUseId === k!.toolId);
    assert.equal(step?.errorCode, 'NO_AVAILABLE_ACCOUNT'); assert.equal(step?.isError, true); assert.equal(calls(qa, k.group, 'kick').length, 0);
    assert.equal(qa.agent.snapshot().audits.length - k.auditStart, 1); complete = true;
    return { refusal, actors, accounts, run, kicks: calls(qa, k.group, 'kick') };
  } catch (error) { primary = error; throw error; } finally { await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => { if (k) qa.agent.barriers.release(k.barrier); }, () => control.close()]); }
}

/** Independent PG lock only holds a real row; HTTP PATCH performs both mutations. */
export async function concurrentProfileCas(qa: QaEnvironment) {
  const { cluster, database } = qa.ownedStorage(); if (!cluster.ownsDatabase(database)) throw new BlockedError('Unowned database');
  const gate = new Client({ connectionString: cluster.url(database), query_timeout: 5000 });
  const observer = new Client({ connectionString: cluster.url(database), query_timeout: 5000 });
  const barrier = 'qa-cas-audit-' + randomUUID(); let held = false, complete = false, primary: unknown;
  const pending: Promise<unknown>[] = [];
  try {
    await gate.connect(); await observer.connect();
    const { group } = await qa.api.createGroup(), toolId = randomUUID(), initial = 'initial-' + randomUUID();
    await qa.api.require(qa.api.patch('/api/groups/' + group.id, { name: initial }));
    qa.agent.enqueueTurns(backendTool(toolId, 'send_message', { text: 'CAS current step', idempotency_key: randomUUID() }));
    qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'CAS current step' }, barrier: { phase: 'before-response', name: barrier } });
    const runId = await startBackendRun(qa, group); await qa.agent.barriers.waitFor(barrier);
    await gate.query('BEGIN'); held = true;
    await gate.query('SELECT id FROM groups WHERE id=$1 FOR UPDATE', [group.id]);
    const gatePid = Number((await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    const winnerName = 'winner-' + randomUUID(), loserName = 'loser-' + randomUUID();
    const first = qa.api.patch('/api/groups/' + group.id, { name: winnerName, expected: { name: initial } }); pending.push(first); void first.catch(() => undefined);
    const firstWait = await observeBackend(async () => (await observer.query("SELECT pid,query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query ILIKE '%groups%'", [gatePid])).rows, rows => rows.length === 1, 5000, 'first real group row-lock waiter');
    const second = qa.api.patch('/api/groups/' + group.id, { name: loserName, expected: { name: initial }, agentEnabled: false }); pending.push(second); void second.catch(() => undefined);
    const bothWaiting = await observeBackend(async () => (await observer.query("SELECT pid,query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%groups%' AND ( $1=ANY(pg_blocking_pids(pid)) OR $2=ANY(pg_blocking_pids(pid)) )", [gatePid, firstWait[0].pid])).rows, rows => new Set(rows.map(r => r.pid)).size >= 2, 5000, 'two distinct server SQL lock waiters');
    await gate.query('ROLLBACK'); held = false;
    const a = await first, b = await second; assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const profileWon = a.status === 200, rejected = profileWon ? b : a; assert.equal(record(record(rejected.body).error).code, 'GROUP_PROFILE_CONFLICT');
    const saved = record(await qa.api.group(group.id)); assert.equal(saved.name, profileWon ? winnerName : loserName); assert.equal(saved.agentEnabled, profileWon);
    qa.agent.barriers.release(barrier); const run = await finishBackendRun(qa, runId);
    assert.equal(run.status, profileWon ? 'finished' : 'cancelled', 'only the successful CAS may determine cancellation'); assert.equal(calls(qa, group, 'send').length, 1);
    complete = true; return { gatePid, firstWait, bothWaiting, a, b, saved, run, order: 'first SQL waiter established before second request; two real concurrent waiters before row unlock' };
  } catch (error) { primary = error; throw error; } finally {
    await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => held ? gate.query('ROLLBACK') : undefined, () => qa.agent.barriers.release(barrier), () => Promise.allSettled(pending), () => gate.end(), () => observer.end()]);
  }
}

export async function noDispatchBudget(qa: QaEnvironment) {
  const capacity = capacityControlFor(qa), runtime = runtimeObservationFor(qa); let k: Awaited<ReturnType<typeof preparedKick>> | undefined; let complete = false, primary: unknown;
  try {
    await capacity.verify(['admission-hold']); await runtime.verify(['activity-witness', 'agent-lifecycle-witness']); k = await preparedKick(qa);
    const correlation = { groupId: k.group.id, runId: k.runId, toolUseId: 'all-run-steps' as const };
    const activity = await runtime.arm('observe-activity', { kind: 'activity', ...correlation });
    const lifecycle = await runtime.arm('observe-agent-lifecycle', { kind: 'tool-wait', ...correlation });
    const lease = await capacity.hold({ groupId: k.group.id, runId: k.runId, toolUseId: k.toolId }); qa.agent.barriers.release(k.barrier);
    const refusal = await lease.waitFor(v => v.events.some(e => e.kind === 'admission-refused'));
    const terminal = await lifecycle.waitFor('agent-terminal-committed', 65_000), actual = await activity.waitFor('activity-terminal', 5000), run = await qa.api.agentRun(k.runId);
    assert.equal(run.status, 'failed'); assert.equal(run.endReason, 'wall_clock'); assert.equal(calls(qa, k.group, 'kick').length, 0);
    assert.equal(qa.agent.snapshot().audits.length - k.auditStart, 1); assert.equal((await qa.api.group(k.group.id)).activeAgentRunId, null);
    assertSingleEpochActivityBudget(actual.events, [0, performance.now() - k.startedMono], run.endReason!);
    const decisions = assertSingleEpochLifecycleBudget(actual.events, terminal.events);
    await lease.release(); assert.equal(calls(qa, k.group, 'kick').length, 0); assert.equal(turns(qa, k.runId).length, 1);
    complete = true; return { refusal, terminal, actual, run, decisions, syntheticBudget: false };
  } catch (error) { primary = error; throw error; } finally { await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => { if (k) qa.agent.barriers.release(k.barrier); }, () => capacity.close(), () => runtime.close()]); }
}

/** Effect has happened; gateway confirmation is unavailable to the product.
 * Private effect ledger is evidence for QA only and never feeds product recovery. */
export async function dispatchedUnknownKick(qa: QaEnvironment, effect: boolean, restart: boolean) {
  const runtime = runtimeObservationFor(qa); let k: Awaited<ReturnType<typeof preparedKick>> | undefined;
  const responseBarrier = 'qa-unknown-kick-' + randomUUID(); let complete = false, primary: unknown;
  try {
    await runtime.verify(['activity-witness', 'agent-lifecycle-witness']); k = await preparedKick(qa);
    const activity = await runtime.arm('observe-activity', { kind: 'activity', groupId: k.group.id, runId: k.runId, toolUseId: 'all-run-steps' });
    const lifecycle = await runtime.arm('observe-agent-lifecycle', { kind: 'tool-wait', groupId: k.group.id, runId: k.runId, toolUseId: 'all-run-steps' });
    qa.gateway.enqueue('/groups/' + k.group.gatewayGroupId + '/kick', { status: 504, code: 'NETWORK_TIMEOUT', effect: effect ? 'apply' : 'none', omitEvent: true, barrier: { phase: 'before-response', name: responseBarrier } });
    qa.agent.barriers.release(k.barrier); const dispatched = await qa.gateway.barriers.waitFor(responseBarrier);
    assert.equal(calls(qa, k.group, 'kick').length, 1);
    const actualEffects = () => qa.gateway.snapshot().effects.filter(e => e.kind === 'kick' && e.groupId === k!.group.gatewayGroupId && e.platformUserId === k!.target);
    assert.equal(actualEffects().length, effect ? 1 : 0);
    qa.gateway.configure({ unavailable: true }); qa.gateway.barriers.release(responseBarrier);
    const terminal = await lifecycle.waitFor('agent-terminal-committed', 65_000);
    const run = await qa.api.agentRun(k.runId), raw = record(run);
    const diagnostics = assertDiagnostics(await qa.api.require(qa.api.get('/api/diagnostics/background')));
    const actual = await activity.waitFor('activity-terminal', 5000);
    // Assert proven overruns before allowing missing terminal detail to block.
    assertSingleEpochActivityBudget(actual.events, [0, performance.now() - k.startedMono], String(run.endReason));
    assert.equal(calls(qa, k.group, 'kick').length, 1); assert.equal(actualEffects().length, effect ? 1 : 0);
    assert.equal(qa.agent.snapshot().audits.length - k.auditStart, 1);
    const confirmation = qa.gateway.snapshot().requests.filter(r => r.method === 'GET' && r.path === '/groups/' + k!.group.gatewayGroupId + '/members');
    assert.ok(confirmation.some(r => r.responseStatus === 503), 'actual failed authoritative membership read is required');
    assert.ok(run.steps.some(s => s.toolUseId === k!.toolId), 'original step must remain observable');
    const { cluster, database } = qa.ownedStorage(); assert.ok(cluster.ownsDatabase(database));
    const db = new Client({ connectionString: cluster.url(database), query_timeout: 5000 }); await db.connect();
    let persisted;
    try { persisted = (await db.query('SELECT id,status,end_reason,recovery_note,history FROM agent_runs WHERE id=$1', [k.runId])).rows; }
    finally { await db.end(); }
    let afterRestart: unknown;
    if (restart) {
      const before = qa.capacityControlTarget(); await qa.restart(); await qa.api.login();
      const after = qa.capacityControlTarget(); assert.notEqual(before.pid, after.pid);
      afterRestart = { beforePid: before.pid, afterPid: after.pid, run: await qa.api.agentRun(k.runId) };
      assert.equal(calls(qa, k.group, 'kick').length, 1); assert.equal(actualEffects().length, effect ? 1 : 0);
    }
    // Returning authoritative facts does not license replay of an ended run.
    qa.gateway.configure({ unavailable: false });
    const observedTicks = assertDiagnostics(await qa.api.require(qa.api.get('/api/diagnostics/background')));
    const baseline = observedTicks.find(m => m.name === 'automation');
    if (!baseline) throw new BlockedError('Automation module diagnostic required to establish actual recovery progress');
    await observeBackend(async () => assertDiagnostics(await qa.api.require(qa.api.get('/api/diagnostics/background'))), rows => rows.some(m => m.name === baseline.name && m.ticks > baseline.ticks), 10_000, 'subsequent actual Agent tick after authority restoration');
    assert.equal(calls(qa, k.group, 'kick').length, 1); assert.equal(actualEffects().length, effect ? 1 : 0);
    const after = await qa.api.agentRun(k.runId); assert.equal(after.id, k.runId);
    complete = true; return { effect, restart, dispatched, terminal, activity: actual, run, rawRecoveryNote: raw.recoveryNote, persisted, diagnostics, confirmation, afterRestart, after, effects: actualEffects(), kicks: calls(qa, k.group, 'kick'), completionBoundary: 'Safety observations do not imply successful completion of an unconfirmed external effect.' };
  } catch (error) { primary = error; throw error; } finally {
    await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => { qa.gateway.configure({ unavailable: false }); if (k) qa.agent.barriers.release(k.barrier); qa.gateway.barriers.release(responseBarrier); }, () => runtime.close()]);
  }
}

/** Crash only at a reviewed durable read-only continuation after the first send. */
export async function sentKeyCrashRecovery(qa: QaEnvironment, compete: boolean) {
  const runtime = runtimeObservationFor(qa); const auditBarrier = 'qa-crash-audit-' + randomUUID(); let complete = false, primary: unknown;
  try {
    await runtime.verify(['activity-safe-boundary']);
    const { group } = await qa.api.createGroup(), key = randomUUID(), text = 'crash-key-' + randomUUID(), first = randomUUID(), readId = randomUUID(), retry = randomUUID();
    const auditsBefore = qa.agent.snapshot().audits.length;
    qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'first send audit' }, barrier: { phase: 'before-response', name: auditBarrier } });
    qa.agent.enqueueTurns(backendTool(first, 'send_message', { text, idempotency_key: key }), backendTool(readId, 'get_recent_messages', { limit: 10 }), backendTool(retry, 'send_message', { text, idempotency_key: key }));
    const runId = await startBackendRun(qa, group); await qa.agent.barriers.waitFor(auditBarrier);
    const lease = await runtime.arm('hold-safe-activity-boundary', { kind: 'activity', groupId: group.id, runId, toolUseId: readId });
    qa.agent.barriers.release(auditBarrier);
    const boundary = await lease.waitFor('activity-safe-held', 30_000), held = boundary.events.find(e => e.kind === 'activity-safe-held');
    assert.ok(held?.continuationDurable); assert.equal(held.remoteInFlightCount, 0);
    const messages = await qa.api.messages(group.id), sent = messages.items.find(m => m.text === text); assert.equal(sent?.deliveryStatus, 'sent');
    assert.equal(calls(qa, group, 'send').length, 1); assert.equal(qa.agent.snapshot().audits.length - auditsBefore, 1);
    const oldPid = qa.capacityControlTarget().pid; await qa.kill(); await lease.release();
    const second = compete ? await qa.startSecondInstance() : undefined; if (second) await second.login();
    await qa.start(); await qa.api.login(); const newPid = qa.capacityControlTarget().pid; assert.notEqual(newPid, oldPid);
    const run = await finishBackendRun(qa, runId);
    assert.equal(run.status, 'finished'); assert.equal(run.steps.find(s => s.toolUseId === retry)?.isError, false);
    const ledger = await qa.api.require(qa.api.get<AgentRun[]>('/api/groups/' + group.id + '/agent-runs')); assert.equal(ledger.length, 1); assert.equal(ledger[0]?.id, runId);
    const blocks = turns(qa, runId).flatMap(t => (record(t.body).messages as unknown[]).flatMap(m => record(m).content as unknown[])).map(record).filter(b => b.type === 'tool_result' && (b.tool_use_id === first || b.tool_use_id === retry));
    const firstResult = blocks.find(b => b.tool_use_id === first), retryResult = blocks.find(b => b.tool_use_id === retry); assert.ok(firstResult && retryResult);
    const firstMsg = record(JSON.parse(String(firstResult.content))), retryMsg = record(JSON.parse(String(retryResult.content))); assert.equal(firstMsg.clientMsgId, retryMsg.clientMsgId);
    assert.equal(calls(qa, group, 'send').length, 1); assert.equal(qa.agent.snapshot().audits.length - auditsBefore, 1);
    assert.equal(qa.gateway.snapshot().messages.filter(m => m.groupId === group.gatewayGroupId && m.text === text).length, 1);
    complete = true; return { compete, boundary, oldPid, newPid, secondOrigin: second?.baseUrl, sent, run, ledger, firstMsg, retryMsg, sends: calls(qa, group, 'send') };
  } catch (error) { primary = error; throw error; } finally { await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => qa.stopSecondInstance(), () => qa.agent.barriers.release(auditBarrier), () => runtime.close()]); }
}

export async function reuseAtMessageState(qa: QaEnvironment, state: 'queued' | 'accepted' | 'unknown') {
  const { group } = await qa.api.createGroup(), first = randomUUID(), retry = randomUUID(), key = randomUUID(), text = 'state-key-' + randomUUID();
  const retryBarrier = 'qa-key-retry-' + randomUUID(), responseBarrier = 'qa-key-response-' + randomUUID();
  const auditStart = qa.agent.snapshot().audits.length; let complete = false, primary: unknown;
  try {
    if (state === 'queued') qa.gateway.enqueue('/groups/' + group.gatewayGroupId + '/send', { status: 429, code: 'RATE_LIMITED', body: { retryAfterSeconds: 60 }, effect: 'none' });
    else if (state === 'accepted') qa.gateway.enqueue('/groups/' + group.gatewayGroupId + '/send', { status: 202, effect: 'none', omitEvent: true });
    else qa.gateway.enqueue('/groups/' + group.gatewayGroupId + '/send', { status: 504, code: 'NETWORK_TIMEOUT', effect: 'apply', omitEvent: true, barrier: { phase: 'before-response', name: responseBarrier } });
    qa.agent.enqueueTurns(backendTool(first, 'send_message', { text, idempotency_key: key }), { ...backendTool(retry, 'send_message', { text, idempotency_key: key }), barrier: { phase: 'before-response', name: retryBarrier } });
    const runId = await startBackendRun(qa, group);
    if (state === 'unknown') {
      await qa.gateway.barriers.waitFor(responseBarrier);
      await observeBackend(async () => qa.gateway.snapshot(), s => s.messages.some(m => m.groupId === group.gatewayGroupId && m.text === text));
      qa.gateway.configure({ unavailable: true }); qa.gateway.barriers.release(responseBarrier);
    }
    const hit = await qa.agent.barriers.waitFor(retryBarrier, 20_000);
    const snapshot = await observeBackend(() => qa.api.messages(group.id), v => v.items.some(m => m.text === text && m.deliveryStatus === state), 5000, 'public original ' + state + ' message before reuse');
    const original = snapshot.items.find(m => m.text === text)!; assert.ok(original.clientMsgId);
    const beforeRequests = calls(qa, group, 'send'); assert.equal(beforeRequests.length, 1);
    qa.agent.barriers.release(retryBarrier); const run = await finishBackendRun(qa, runId);
    assert.equal(qa.agent.snapshot().audits.length - auditStart, 1, 'same-key reuse cannot repeat audit');
    assert.equal(calls(qa, group, 'send').length, 1, 'same-key reuse cannot dispatch another send');
    const messages = (await qa.api.messages(group.id)).items.filter(m => m.text === text); assert.equal(messages.length, 1); assert.equal(messages[0]?.clientMsgId, original.clientMsgId);
    const returned = turns(qa, runId).flatMap(t => (record(t.body).messages as unknown[]).flatMap(m => record(m).content as unknown[])).map(record).find(b => b.type === 'tool_result' && b.tool_use_id === retry);
    assert.ok(returned); const content = record(JSON.parse(String(returned.content)));
    assert.equal(content.clientMsgId, original.clientMsgId, 'reuse result preserves original message identity'); assert.equal(content.deliveryStatus, state, 'reuse exposes actual current delivery state');
    assert.equal(qa.gateway.snapshot().messages.filter(m => m.groupId === group.gatewayGroupId && m.text === text).length, state === 'unknown' ? 1 : 0);
    complete = true; return { state, hit, original, run, returned, content, messages, beforeRequests, afterRequests: calls(qa, group, 'send'), timingBoundary: 'No strict five-second assertion or synthetic time advance in this regression' };
  } catch (error) { primary = error; throw error; } finally { await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => { qa.gateway.configure({ unavailable: false }); qa.gateway.barriers.release(responseBarrier); qa.agent.barriers.release(retryBarrier); }]); }
}

/** Delivered capability explicitly permits independent module leases in one app. */
export async function independentModuleRecovery(qa: QaEnvironment) {
  const control = runtimeObservationFor(qa); let complete = false, primary: unknown;
  try {
    await control.verify(['module-tick', 'module-tick-independent']);
    const markerA = 'qa-runtime-gateway-' + randomUUID(), markerB = 'qa-runtime-automation-' + randomUUID();
    const a = await control.arm('module-fail-then-hold', { kind: 'module', module: 'gateway', attemptLabel: randomUUID() }, { ttlMs: 20_000, faultMarker: markerA });
    const b = await control.arm('module-fail-then-hold', { kind: 'module', module: 'automation', attemptLabel: randomUUID() }, { ttlMs: 20_000, faultMarker: markerB });
    assert.notEqual(a.id, b.id);
    const [heldA, heldB] = await Promise.all([a.waitFor('module-before-next-held', 15_000), b.waitFor('module-before-next-held', 15_000)]);
    const read = async () => assertDiagnostics(await qa.api.require(qa.api.get('/api/diagnostics/background')), [markerA, markerB, qa.api.token!, qa.api.cookie!]);
    const both = await read(), gateway = both.find(m => m.name === 'gateway'), automation = both.find(m => m.name === 'automation');
    assert.ok(gateway?.lastFailure && automation?.lastFailure); assert.equal(gateway.status, 'failed'); assert.equal(automation.status, 'failed');
    assert.equal(gateway.lastFailure.recoveredAt, null); assert.equal(automation.lastFailure.recoveredAt, null);
    assert.equal(gateway.lastFailure.correlation.module, 'gateway'); assert.equal(automation.lastFailure.correlation.module, 'automation');
    assert.notEqual(gateway.lastFailure.correlation.tickId, automation.lastFailure.correlation.tickId);
    await a.advance(); await a.waitFor('module-running-held', 5000);
    const during = await read(); assert.equal(during.find(m => m.name === 'gateway')?.status, 'running'); assert.deepEqual(during.find(m => m.name === 'automation')?.lastFailure, automation.lastFailure);
    await a.advance(); const recoveredA = await a.waitFor('module-succeeded', 5000), stillHeldB = await b.snapshot();
    assert.equal(stillHeldB.state, 'held'); assert.ok(!stillHeldB.events.some(e => e.kind === 'module-running-held' || e.kind === 'module-succeeded'));
    const partial = await read(), aNow = partial.find(m => m.name === 'gateway')!, bNow = partial.find(m => m.name === 'automation')!;
    assert.equal(aNow.status, 'idle'); assert.equal(aNow.lastFailure?.correlation.tickId, gateway.lastFailure.correlation.tickId); assert.equal(aNow.lastFailure?.recoveredAt, aNow.lastSucceededAt);
    assert.equal(bNow.status, 'failed'); assert.deepEqual(bNow.lastFailure, automation.lastFailure);
    const oldPid = qa.capacityControlTarget().pid; await qa.kill();
    if (Date.now() >= Math.min(Date.parse(recoveredA.expiresAt), Date.parse(stillHeldB.expiresAt))) throw new BlockedError('Independent module lease expired before owned restart boundary');
    await control.close(); await qa.start(); await qa.api.login(); const newPid = qa.capacityControlTarget().pid;
    assert.notEqual(newPid, oldPid); const after = await read(); for (const module of after) assert.equal(module.lastFailure, null);
    complete = true; return { markerA, markerB, heldA, heldB, both, during, recoveredA, stillHeldB, partial, oldPid, newPid, after, boundary: 'Only module A advanced; module B independently stayed held/failed in same API instance. No public diagnostic field was seeded.' };
  } catch (error) { primary = error; throw error; }
  finally { await cleanupObserved(qa, primary, [() => !complete ? qa.kill() : undefined, () => control.close()]); }
}
