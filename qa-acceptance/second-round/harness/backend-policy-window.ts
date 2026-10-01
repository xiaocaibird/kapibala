import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { resolve } from 'node:path';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun, Group } from '../../harness/platform-client.js';
import { BlockedError } from '../../harness/security.js';
import { runtimeObservationFor } from '../../harness/runtime-observation.js';
import { assertSingleEpochActivityBudget } from '../../tests/support/agent-activity-budget.js';
import { assertKnownLocalPolicyRefusal, record } from './backend-oracles.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function observe<T>(read: () => Promise<T>, predicate: (v: T) => boolean, budget: number, label: string): Promise<T> {
  const until = performance.now() + budget;
  do { const v = await read(); if (predicate(v)) return v; await sleep(25); } while (performance.now() < until);
  throw new BlockedError(`Actual ${label} not observed within finite observation budget`);
}
/** Uses the published 7a3ea584 fault seam. Never imports SUT code or seeds activity time/steps/results. */
export async function runManagedPolicyBudgetCase(context: { qa: QaEnvironment; observationMs?: number }): Promise<RoundResult> {
  const { qa } = context, variants: VariantResult[] = [], caseId = 'SR-BE-POL-008';
  for (const cancel of [false, true]) {
    const id = cancel ? 'cancel-requested' : 'no-cancel', name = `${caseId}-${id}`;
    try {
      const value = await managedWindow(qa, cancel, name, context.observationMs ?? 30_000);
      await qa.evidence(name, value);
      variants.push({ id, status: 'PASS', evidence: [resolve(qa.outputDir, `${name}.json`)] });
    } catch (error) {
      await qa.evidence(name, { status: classifyError(error), error: String(error), gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot() });
      variants.push({ id, status: classifyError(error), reason: String(error), evidence: [resolve(qa.outputDir, `${name}.json`)] });
      if (!cancel) variants.push({ id: 'cancel-requested', status: 'BLOCKED', evidence: [], reason: 'Prior window did not finish cleanly; no second variant reuses ambiguous live process/fixture state.' });
      break;
    }
  }
  return { caseId, status: combineVariants(variants), variants };
}
async function managedWindow(qa: QaEnvironment, cancel: boolean, prefix: string, ms: number) {
  await qa.api.login();
  const { cluster, database } = qa.ownedStorage();
  if (!cluster.ownsDatabase(database)) throw new BlockedError('Database ownership is not held by this case');
  const observer = new Client({ connectionString: cluster.url(database), application_name: `qa-policy-observer-${randomUUID()}`, query_timeout: 8000 });
  const gate = new Client({ connectionString: cluster.url(database), application_name: `qa-policy-gate-${randomUUID()}`, query_timeout: 8000 });
  const schema = `qa_managed_${randomUUID().replaceAll('-', '')}`, triggerName = `qa_dispatch_${randomUUID().replaceAll('-', '')}`;
  const control = runtimeObservationFor(qa); let installed = false, gateHeld = false, complete = false, changedAccount: { id: string; platformUserId: string | null } | undefined;
  const evidence: Record<string, unknown> = { caseId: 'SR-BE-POL-008', variant: cancel ? 'cancel-requested' : 'no-cancel', engineeringFaultSource: 'docs/second-round-managed-rejection-20261002.md@7a3ea584', database, syntheticBudget: false, freshPublicRun: true };
  let barrier = '';
  try {
    await observer.connect(); await gate.connect();
    await control.verify(['agent-lifecycle-witness', 'activity-witness']);
    const { group, accounts } = await qa.api.createGroup(); const target = `policy-window-${randomUUID()}`, toolId = randomUUID();
    changedAccount = { id: accounts.at(-1)!.id, platformUserId: accounts.at(-1)!.platformUserId };
    qa.gateway.setMembership(group.gatewayGroupId, target, true);
    await observe(() => qa.api.group(group.id), (g) => g.members.some((m) => m.platformUserId === target && !m.accountId), ms, 'initial external target projection');
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true, agentEnabled: true }));
    barrier = `audit-${randomUUID()}`;
    qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'independent accepted proposal' }, barrier: { phase: 'before-response', name: barrier } });
    qa.agent.enqueueTurns({ body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: toolId, name: 'kick_user', input: { platform_user_id: target, reason: 'independent late managed protection' } }] } });
    const startAudit = qa.agent.snapshot().audits.length, startEffects = qa.gateway.snapshot().effects.length;
    const onlineLower = performance.now();
    qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'outside-policy-window', text: `start-${randomUUID()}` });
    const runs = await observe(() => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)), (v) => v.length === 1, ms, 'fresh run');
    const runId = runs[0]!.id;
    evidence.groupId = group.id; evidence.runId = runId; evidence.toolUseId = toolId;
    const lease = await control.arm('observe-agent-lifecycle', { kind: 'tool-wait', groupId: group.id, runId, toolUseId: 'all-run-steps' });
    const activityLease = await control.arm('observe-activity', { kind: 'activity', groupId: group.id, runId, toolUseId: 'all-run-steps' });
    const auditHit = await qa.agent.barriers.waitFor(barrier, ms); evidence.auditHit = auditHit;
    // SQL identifiers are generated only from UUID hex; the trigger predicate is restricted to this tool and transition.
    await observer.query(`CREATE SCHEMA "${schema}"`); installed = true;
    await observer.query(`CREATE TABLE "${schema}".gate (id integer PRIMARY KEY)`);
    await observer.query(`INSERT INTO "${schema}".gate VALUES (1)`);
    await observer.query(`CREATE FUNCTION "${schema}".hold_dispatch() RETURNS trigger LANGUAGE plpgsql AS $qa$
      BEGIN
        IF NEW.name='kick_user' AND NEW.tool_use_id=TG_ARGV[0]
          AND OLD.intent->>'dispatchState'='awaiting_admission' AND NEW.intent->>'dispatchState'='dispatching' THEN
          PERFORM id FROM "${schema}".gate WHERE id=1 FOR UPDATE;
        END IF;
        RETURN NEW;
      END $qa$`);
    await observer.query(`CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON public.agent_steps FOR EACH ROW EXECUTE FUNCTION "${schema}".hold_dispatch('${toolId}')`);
    await gate.query('BEGIN'); gateHeld = true;
    await gate.query(`SELECT id FROM "${schema}".gate WHERE id=1 FOR UPDATE`);
    const gatePid = Number((await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    evidence.gateAcquired = { gatePid, at: new Date().toISOString() };
    qa.agent.barriers.release(barrier);
    const waiting = await observe(async () => {
      const steps = await observer.query('SELECT run_id,ordinal,tool_use_id,name,state,audit_verdict,intent FROM public.agent_steps WHERE run_id=$1 AND tool_use_id=$2', [runId, toolId]);
      const waiters = await observer.query("SELECT pid,query,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))", [gatePid]);
      return { steps: steps.rows, waiters: waiters.rows, capturedAt: new Date().toISOString() };
    }, (v) => v.steps.length === 1 && v.steps[0].state === 'executing' && v.steps[0].audit_verdict === 'pass' &&
      record(v.steps[0].intent).dispatchState === 'awaiting_admission' && v.waiters.some((w) => /update\s+(?:public\.)?agent_steps\s+set\s+intent/i.test(w.query)), ms, 'actual dispatch-intent SQL blocker');
    evidence.waiting = waiting;
    const beforeSignal = await lease.snapshot();
    assert.ok(!beforeSignal.events.some((e) => e.kind === 'kick-work-budget-signal-aborted' || e.kind === 'kick-budget-signal-aborted'), 'gate must be acquired before work cutoff');
    const beforeIdentity = (await observer.query('SELECT id,platform_user_id FROM accounts WHERE id=$1', [changedAccount.id])).rows;
    assert.equal(beforeIdentity.length, 1);
    await observer.query('BEGIN');
    try {
      const changed = await observer.query('UPDATE accounts SET platform_user_id=$1 WHERE id=$2 RETURNING id,platform_user_id', [target, changedAccount.id]);
      assert.equal(changed.rowCount, 1); await observer.query('COMMIT');
    } catch (e) { await observer.query('ROLLBACK'); throw e; }
    const afterIdentity = (await observer.query('SELECT id,platform_user_id FROM accounts WHERE id=$1', [changedAccount.id])).rows;
    assert.equal(afterIdentity[0].platform_user_id, target);
    assert.equal((await qa.api.accounts()).find((a) => a.id === changedAccount!.id)!.platformUserId, target);
    evidence.identity = { before: beforeIdentity, after: afterIdentity, commitReturnedAt: new Date().toISOString(), role: 'explicitly reviewed fault seam; not a public account transition claim' };
    if (cancel) {
      const patch = await qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false });
      assert.ok(patch.status >= 200 && patch.status < 300);
      const saved = (await observer.query('SELECT id,cancel_requested FROM agent_runs WHERE id=$1', [runId])).rows;
      assert.equal(saved[0].cancel_requested, true); evidence.cancel = { patchStatus: patch.status, persisted: saved };
    }
    const signalled = await lease.waitFor('kick-work-budget-signal-aborted', 65_000);
    const workSignals = signalled.events.filter((e) => e.kind === 'kick-work-budget-signal-aborted' && e.toolUseId === toolId);
    assert.equal(workSignals.length, 1); assert.ok(!signalled.events.some((e) => e.kind === 'kick-budget-signal-aborted'));
    evidence.workSignal = signalled;
    // Causal order: an actual work signal was received before this database unlock command is sent.
    const releaseStartedAt = new Date().toISOString(), releaseStartMonoMs = performance.now();
    await gate.query('ROLLBACK'); gateHeld = false;
    evidence.gateReleased = { releaseStartedAt, releaseReturnedAt: new Date().toISOString(), parentMonoWindowMs: [releaseStartMonoMs, performance.now()], parentClockDomain: `qa-process:${process.pid}` };
    const terminal = await lease.waitFor('agent-terminal-committed', 10_000);
    const run = await qa.api.agentRun(runId);
    const saved = await observer.query('SELECT id,status,end_reason,recovery_note,history,cancel_requested FROM agent_runs WHERE id=$1', [runId]);
    const steps = await observer.query('SELECT run_id,ordinal,tool_use_id,state,is_error,error_code,result,audit_verdict FROM agent_steps WHERE run_id=$1 AND tool_use_id=$2', [runId, toolId]);
    assert.equal(steps.rows.length, 1); assert.equal(steps.rows[0].state, 'complete'); assert.equal(steps.rows[0].is_error, true); assert.equal(steps.rows[0].error_code, 'POLICY_DENIED');
    assert.equal(saved.rows[0].recovery_note, null);
    assert.equal(run.status, cancel ? 'cancelled' : 'failed'); assert.equal(run.endReason, cancel ? 'cancelled' : 'wall_clock');
    const publicStep = run.steps.find((s) => s.toolUseId === toolId); assert.equal(publicStep?.errorCode, 'POLICY_DENIED');
    const history: unknown[] = saved.rows[0].history;
    const toolResults = history.flatMap((m) => Array.isArray(record(m).content) ? record(m).content as unknown[] : [])
      .map(record).filter((b) => b.type === 'tool_result' && b.tool_use_id === toolId);
    assert.equal(toolResults.length, 1, 'one committed tool result in original run history');
    assert.ok(!terminal.events.some((e) => e.kind === 'kick-post-dispatch' || e.kind === 'kick-budget-signal-aborted'));
    const commits = terminal.events.filter((e) => e.kind === 'agent-step-save-transaction' && e.toolUseId === toolId && e.phase === 'commit' && e.edge === 'returned');
    if (commits.length !== 1) throw new BlockedError('POLICY_DENIED lacks one actual original step transaction COMMIT returned observation');
    const activity = await activityLease.waitFor('activity-terminal', 5000);
    assertSingleEpochActivityBudget(activity.events, [0, performance.now() - onlineLower], String(run.endReason));
    evidence.actualActivity = activity;
    const terminalCommit = terminal.events.find((e) => e.kind === 'agent-terminal-committed'); assert.ok(terminalCommit);
    const kicks = qa.gateway.snapshot().requests.filter((r) => r.method === 'POST' && r.path === `/groups/${group.gatewayGroupId}/kick`);
    const effects = qa.gateway.snapshot().effects.slice(startEffects).filter((e) => e.kind === 'kick' && e.groupId === group.gatewayGroupId && e.platformUserId === target);
    const witness = { runId, toolUseId: toolId, targetId: target, publicManagedBeforeRelease: true,
      auditPassCount: qa.agent.snapshot().audits.length - startAudit, requestCount: kicks.length, effectCount: effects.length,
      sameRunAndStep: publicStep?.toolUseId === toolId && steps.rows[0].run_id === runId,
      lockAcquiredBeforeDeadline: true, lockReleasedAfterDeadline: true,
      actualLockEvidence: `${prefix}.json#waiting`, actualDeadlineEvidence: `${prefix}.json#workSignal`,
      finalErrorCode: publicStep?.errorCode ?? null, recoveryPaused: saved.rows[0].recovery_note !== null, dispatched: terminal.events.some((e) => e.kind === 'kick-post-dispatch') };
    assertKnownLocalPolicyRefusal(witness);
    evidence.witness = witness; evidence.terminal = terminal; evidence.publicRun = run; evidence.saved = saved.rows; evidence.steps = steps.rows;
    evidence.postResult = { gatewayRequests: kicks, gatewayEffects: effects, toolResultCount: toolResults.length };
    complete = true;
    return evidence;
  } finally {
    const failures: string[] = [];
    // On an incomplete window, stop the owned executor before releasing a lock that could allow an effect.
    if (!complete) try { await qa.kill(); } catch (e) { failures.push(`owned executor stop: ${String(e)}`); }
    if (gateHeld) try { await gate.query('ROLLBACK'); } catch (e) { failures.push(`gate rollback: ${String(e)}`); }
    if (barrier) qa.agent.barriers.release(barrier);
    try { await control.close(); } catch (e) { failures.push(`lease cleanup: ${String(e)}`); }
    if (installed) {
      try { await observer.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON public.agent_steps`); await observer.query(`DROP SCHEMA "${schema}" CASCADE`); } catch (e) { failures.push(`owned SQL fault cleanup: ${String(e)}`); }
    }
    if (complete && changedAccount) try { await observer.query('UPDATE accounts SET platform_user_id=$1 WHERE id=$2', [changedAccount.platformUserId, changedAccount.id]); } catch (e) { failures.push(`owned identity restoration: ${String(e)}`); }
    await Promise.allSettled([gate.end(), observer.end()]);
    await qa.evidence(`${prefix}-cleanup`, { failures, complete, schema, triggerName, database });
    if (complete && failures.length) throw new BlockedError(`Owned fixture cleanup incomplete: ${failures.join('; ')}`);
  }
}
