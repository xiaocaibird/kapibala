import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { QaEnvironment } from '../../harness/environment.js';
import { BlockedError } from '../../harness/security.js';
import { runtimeObservationFor, assertNoRecoveryPause, type MeasuredRuntimeSnapshot, type RuntimeEvent } from '../../harness/runtime-observation.js';
import { captureOwnedApplicationIdentity, observeOwnedApplicationKill } from '../../harness/application-exit-observation.js';
import { prepareCrossEpochKill, collectCrossEpochEvidence, assertCrossEpochBudget, assertCrossEpochLiveLower } from '../../harness/cross-epoch-evidence.js';
import { assertNoDispatchAfterStop } from '../../harness/lifecycle-observation.js';
import type { ProviderDriver } from '../contracts/media-provider.js';
import { observeBackend } from './backend-boundaries.js';

/** Reuses the independent first-round interval oracle, never its historical
 * verdict. Every process/HTTP/DB/activity input below is produced in this run. */
export async function providerCrossEpochActivity(d: ProviderDriver, qa: QaEnvironment, save: (value: unknown) => Promise<void>) {
  const parentClockDomain = `qa-parent:${process.pid}:${randomUUID()}`;
  const first = runtimeObservationFor(qa); let next: ReturnType<typeof runtimeObservationFor> | undefined;
  const record = (name: string, value: unknown) => qa.evidence(`provider-cross-epoch-${name}-${randomUUID()}`, value);
  let primary: unknown, complete = false;
  try {
    await first.verify(['activity-witness', 'activity-safe-boundary', 'agent-lifecycle-witness']);
    const fixture = await d.backendGroup({ autoKickEnabled: false, executor: 'admin' }), groupId = fixture.groupId;
    for (let i = 0; i < 16; i++) await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'get_recent_messages', input: { limit: i + 1 } }, delayResponseMs: 7000 });
    const createBefore = performance.now(), runId = await d.triggerBackend(groupId), createAfter = performance.now();
    const storage = qa.ownedStorage(); assert.ok(storage.cluster.ownsDatabase(storage.database));
    const ledger = async (label: string) => {
      const db = new Client({ connectionString: storage.cluster.url(storage.database), connectionTimeoutMillis: 2000, query_timeout: 5000 });
      const before = performance.now();
      try {
        await db.connect(); await db.query('BEGIN READ ONLY');
        const run = (await db.query('SELECT id,group_id,status,end_reason,active_ms::text,step_count,inflight_turn,history FROM agent_runs WHERE id=$1 AND group_id=$2', [runId, groupId])).rows;
        const steps = (await db.query('SELECT ordinal,kind,tool_use_id,name,state,result FROM agent_steps WHERE run_id=$1 ORDER BY ordinal', [runId])).rows;
        await db.query('ROLLBACK');
        const facts = { parentClockDomain, windowMs: [before, performance.now()], database: storage.database, run, steps, role: 'Read-only persistence diagnostic, never an activity timing oracle' };
        await record('ledger-' + label, facts);
        if (run.length !== 1) throw new BlockedError('Cross-epoch persistence has no unique original run');
        return facts;
      } finally { await db.end(); }
    };
    const correlation = { kind: 'activity' as const, groupId, runId, toolUseId: 'all-run-steps' };
    const old = await first.arm('observe-activity', correlation);
    // Same first-round fixture timing; elapsed sleep is never evidence that a
    // remote turn finished. The later actual safe barrier/ledger proves that.
    await new Promise(ok => setTimeout(ok, 17000));
    const checkpoint = await old.waitFor('activity-checkpoint');
    assert.equal((await qa.api.agentRun(runId)).status, 'running');
    const safe = await first.arm('hold-safe-activity-boundary', correlation), safeBoundary = await safe.waitFor('activity-safe-held', 15000);
    const beforeFacts = await d.backendFacts(groupId), upstream = await d.upstreamFacts();
    const actualIds = new Set(beforeFacts.turns.filter(turn => turn.runId === runId).map(turn => turn.id));
    const runRequests = upstream.records.filter(entry => actualIds.has(entry.call.id));
    if (!actualIds.size || runRequests.length !== actualIds.size || runRequests.some(entry => !entry.responseFinishedAt || entry.responseStatus !== 200))
      throw new BlockedError('Real provider ledger does not prove all original run requests completed before safe kill');
    const beforeKill: [MeasuredRuntimeSnapshot, MeasuredRuntimeSnapshot] = [await safe.snapshotMeasured(parentClockDomain), await safe.snapshotMeasured(parentClockDomain)];
    prepareCrossEpochKill(beforeKill);
    const beforeLedger = await ledger('held-before-kill');
    if (!Array.isArray(beforeLedger.run[0].history)) throw new BlockedError('Durable original Agent history missing');
    const committed = new Set((beforeLedger.run[0].history as {content?:{type?:string;tool_use_id?:string}[]}[]).flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'tool_result').map(part => part.tool_use_id));
    if (beforeLedger.run[0].inflight_turn !== false || !beforeLedger.steps.length || beforeLedger.steps.some(step => step.name !== 'get_recent_messages' || step.state !== 'complete' || step.result == null || !committed.has(step.tool_use_id)))
      throw new BlockedError('Original read-only results and continuation have not actually committed; no safe crash premise');
    const identity = await captureOwnedApplicationIdentity({ target: first.target, snapshot: beforeKill[1].snapshot, parentClockDomain, record });
    await save({ runId, groupId, checkpoint, safeBoundary, beforeFacts, upstream, beforeKill, beforeLedger, identity });
    const exited = await observeOwnedApplicationKill({ identity, record, kill: async () => {
      if (beforeKill[1].snapshot.state !== 'held' || Date.parse(beforeKill[1].snapshot.expiresAt) <= Date.now()) throw new BlockedError('Safe lease expired before actual application kill');
      await qa.kill();
    } });
    if (Date.now() >= Date.parse(beforeKill[1].snapshot.expiresAt)) throw new BlockedError('Observed actual application exit crossed safe lease expiry');
    try { await record('retained-after-exit', await safe.snapshotMeasured(parentClockDomain)); }
    catch (error) { await record('retained-unavailable', { error: String(error) }); }
    const afterExitLedger = await ledger('after-exit');
    const acknowledged = beforeKill[1].snapshot.events.at(-1)?.lastSuccessfulSample?.persistedActiveMs;
    const ledgerCoversAcknowledgedSample = typeof acknowledged === 'number' && Number.isFinite(Number(afterExitLedger.run[0].active_ms)) && Number(afterExitLedger.run[0].active_ms) >= acknowledged;
    // Intentionally observe five seconds of proven absence. This only selects
    // a fixture interval; the oracle measures real exit/start bounds itself.
    await new Promise(ok => setTimeout(ok, 5000));
    const beforeRestartLedger = await ledger('before-restart'), ledgerUnchanged = beforeRestartLedger.run[0].active_ms === afterExitLedger.run[0].active_ms;
    const startBefore = performance.now(); await qa.start(); const startAfter = performance.now(); await qa.api.login();
    next = runtimeObservationFor(qa); await next.verify(['activity-witness', 'agent-lifecycle-witness']);
    assert.notEqual(next.target.pid, first.target.pid);
    const current = await next.arm('observe-activity', correlation), lifecycle = await next.arm('observe-agent-lifecycle', { ...correlation, kind: 'tool-wait', toolUseId: 'all-run-steps' });
    const resumed = await current.waitFor('activity-checkpoint'); assertNoRecoveryPause(resumed.events);
    const resumedMeasured = await current.snapshotMeasured(parentClockDomain);
    const resumedIdentity = await captureOwnedApplicationIdentity({ target: next.target, snapshot: resumedMeasured.snapshot, parentClockDomain, record });
    const samples: {before:number;after:number;status:string}[] = [];
    const result = await observeBackend(async () => {
      await new Promise(ok => setTimeout(ok, 100));
      const before = performance.now(), run = await qa.api.agentRun(runId), after = performance.now();
      assert.equal(run.id, runId); samples.push({ before, after, status: run.status });
      if (run.status !== 'running') { assert.equal(run.status, 'failed'); assert.equal(run.endReason, 'wall_clock'); }
      const measured = await current.snapshotMeasured(parentClockDomain), life = await lifecycle.snapshot();
      await record('recovery-measured', { measured, lifecycle: life, run });
      assertNoRecoveryPause(measured.snapshot.events); assertNoDispatchAfterStop(life.events);
      for (const event of measured.snapshot.events) if (event.includesUnsavedTail && event.activeElapsedMs) assert.ok(event.activeElapsedMs[0] <= 60000, 'Real active lower bound exceeds original 60s');
      try { assertCrossEpochLiveLower({ beforeKill, exited, current: measured, lifecycle: life }); }
      catch (error) { if (!(error instanceof BlockedError)) throw error; await record('live-lower-incomplete', { error: String(error) }); }
      assert.equal(qa.gateway.snapshot().requests.filter(request => request.path.endsWith('/send') || request.path.endsWith('/kick')).length, 0);
      return { run, measured, lifecycle: life };
    }, value => value.run.status !== 'running', 85000, 'original C2 run recovery and actual activity terminal');
    assert.equal((await qa.api.group(groupId)).activeAgentRunId, null);
    await current.waitFor('activity-terminal'); const afterRecovery = await current.snapshotMeasured(parentClockDomain);
    let recoveredLifecycle: RuntimeEvent[];
    try { recoveredLifecycle = (await lifecycle.waitFor('agent-terminal-committed', 5000)).events; }
    catch (error) { if (!(error instanceof BlockedError)) throw error; recoveredLifecycle = lifecycle.latest?.events ?? []; await record('commit-incomplete', { error: String(error), recoveredLifecycle }); }
    assertNoDispatchAfterStop(recoveredLifecycle);
    if (afterRecovery.snapshot.clockObservation?.applicationPid !== resumedIdentity.applicationPid || afterRecovery.snapshot.snapshotProvenance?.applicationStarted !== resumedIdentity.applicationStarted)
      throw new BlockedError('Recovered application identity changed before final activity witness');
    const finalLedger = await ledger('terminal'), facts = await d.backendFacts(groupId);
    assert.equal(facts.sends.length, 0); assert.equal(facts.kicks.length, 0); assert.equal(facts.effects.length, 0);
    const raw = { parentClockDomain, runId, groupId, beforeKill, afterRecovery, exited, startupWindowMs: [startBefore, startAfter] as [number,number], recoveredLifecycle,
      checkpoint, safeBoundary, resumed, resumedIdentity, beforeLedger, afterExitLedger, beforeRestartLedger, finalLedger, ledgerCoversAcknowledgedSample, ledgerUnchanged,
      create: [createBefore, createAfter], samples, result, facts, upstream, calls: await d.calls(), claim: 'Actual current C2 run; independently bounded crash tail and startup uncertainty; original 60s maximum unchanged.' };
    await save(raw); const aggregate = collectCrossEpochEvidence(raw); await record('budget-aggregate', aggregate); await save({ ...raw, aggregate });
    assertCrossEpochBudget(aggregate);
    if (!ledgerCoversAcknowledgedSample || !ledgerUnchanged) throw new BlockedError('Actual persistence does not independently confirm acknowledged sample or frozen downtime; cannot backfill clock truth');
    complete = true;
  } catch (error) { primary = error; throw error; }
  finally {
    const errors: string[] = [];
    for (const close of [() => !complete ? qa.kill() : Promise.resolve(), () => next?.close(), () => first.close()]) try { await close(); } catch (error) { errors.push(String(error)); }
    if (errors.length) { await record('cleanup-errors', { primary: String(primary), errors }); if (!primary) throw new BlockedError(errors.join('; ')); }
  }
}
