import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun } from '../../harness/platform-client.js';
import { BlockedError } from '../../harness/security.js';
import { record } from './backend-oracles.js';
async function poll<T>(read: () => Promise<T>, done: (v: T) => boolean, timeout = 15_000): Promise<T> {
  const end = performance.now() + timeout;
  do { const value = await read(); if (done(value)) return value; await new Promise((r) => setTimeout(r, 25)); } while (performance.now() < end);
  throw new BlockedError('Actual public/transaction observation did not reach the required boundary');
}
/** Fault-only SQL: real event INSERT raises, so the original transaction must roll back all its own writes. */
export async function profileCancellationRollback(qa: QaEnvironment) {
  const { cluster, database } = qa.ownedStorage();
  if (!cluster.ownsDatabase(database)) throw new BlockedError('Missing owned database');
  const client = new Client({ connectionString: cluster.url(database), query_timeout: 5000 });
  const fn = `qa_event_fault_${randomUUID().replaceAll('-', '')}`, trigger = `qa_event_trigger_${randomUUID().replaceAll('-', '')}`, witnessSequence = `qa_event_witness_${randomUUID().replaceAll('-', '')}`;
  let installed = false, functionInstalled = false, sequenceInstalled = false, barrier = '', completed = false;
  let primary: unknown;
  try {
    await client.connect();
    const columns = await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('events','agent_runs')");
    if (!columns.rows.some((r) => r.table_name === 'events' && r.column_name === 'payload') || !columns.rows.some((r) => r.table_name === 'agent_runs' && r.column_name === 'cancel_requested'))
      throw new BlockedError('Frozen schema does not expose the reviewed fault-only events/cancellation columns');
    const { group } = await qa.api.createGroup();
    // Positive request shape control before injecting the failure.
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: 'qa rollback baseline', agentEnabled: false }));
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: 'qa rollback baseline', expected: { name: 'qa rollback baseline' }, agentEnabled: true }));
    const toolId = randomUUID(), text = `rollback-step-${randomUUID()}`; barrier = `rollback-audit-${randomUUID()}`;
    qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'current step' }, barrier: { phase: 'before-response', name: barrier } });
    qa.agent.enqueueTurns({ body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: toolId, name: 'send_message', input: { text, idempotency_key: randomUUID() } }] } });
    qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'qa-external-rollback', text: 'transaction boundary trigger' });
    const hit = await qa.agent.barriers.waitFor(barrier);
    const runs = await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)); assert.equal(runs.length, 1);
    const runId = runs[0]!.id, before = record(await qa.api.group(group.id));
    const beforeLedger = (await client.query('SELECT id,cancel_requested,status FROM agent_runs WHERE id=$1', [runId])).rows;
    assert.equal(beforeLedger[0].cancel_requested, false);
    const beforeEvents = (await client.query("SELECT seq,type,payload FROM events WHERE type='group_changed' AND payload->>'groupId'=$1 ORDER BY seq", [group.id])).rows;
    assert.ok(/^[0-9a-f-]{36}$/i.test(group.id));
    await client.query(`CREATE SEQUENCE public."${witnessSequence}"`); sequenceInstalled = true;
    const untouchedWitness = (await client.query(`SELECT last_value,is_called FROM public."${witnessSequence}"`)).rows;
    assert.equal(untouchedWitness[0].is_called, false);
    await client.query(`CREATE FUNCTION public."${fn}"() RETURNS trigger LANGUAGE plpgsql AS $qa$
      BEGIN IF NEW.type='group_changed' AND NEW.payload->>'groupId'='${group.id}' THEN
        PERFORM nextval('public."${witnessSequence}"');
        RAISE EXCEPTION 'independent owned QA group event transaction fault' USING ERRCODE='P0001';
      END IF; RETURN NEW; END $qa$`); functionInstalled = true;
    await client.query(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public."${fn}"()`); installed = true;
    const rejected = await qa.api.patch(`/api/groups/${group.id}`, { name: 'must roll back', expected: { name: 'qa rollback baseline' }, agentEnabled: false });
    assert.equal(rejected.status, 500, 'the actual event write must fail');
    const actualFaultWitness = (await client.query(`SELECT last_value,is_called FROM public."${witnessSequence}"`)).rows;
    assert.equal(actualFaultWitness[0].is_called, true, 'a random HTTP 500 is not proof that the intended trigger ran');
    assert.equal(String(actualFaultWitness[0].last_value), '1', 'one actual trigger invocation; sequence witness survives transaction rollback');
    const after = record(await qa.api.group(group.id));
    assert.equal(after.name, before.name); assert.equal(after.agentEnabled, true);
    const afterLedger = (await client.query('SELECT id,cancel_requested,status FROM agent_runs WHERE id=$1', [runId])).rows;
    assert.equal(afterLedger[0].cancel_requested, false); assert.equal(afterLedger[0].status, 'running');
    const afterEvents = (await client.query("SELECT seq,type,payload FROM events WHERE type='group_changed' AND payload->>'groupId'=$1 ORDER BY seq", [group.id])).rows;
    assert.deepEqual(afterEvents, beforeEvents, 'event failure cannot leave an event or partial domain commit');
    await client.query(`DROP TRIGGER "${trigger}" ON public.events`); installed = false;
    await client.query(`DROP FUNCTION public."${fn}"()`); functionInstalled = false;
    await client.query(`DROP SEQUENCE public."${witnessSequence}"`); sequenceInstalled = false;
    const accepted = await qa.api.patch(`/api/groups/${group.id}`, { name: 'recovered request', expected: { name: 'qa rollback baseline' }, agentEnabled: false });
    assert.ok(accepted.status >= 200 && accepted.status < 300);
    qa.agent.barriers.release(barrier);
    const run = await poll(() => qa.api.agentRun(runId), (r) => r.status !== 'running');
    assert.equal(run.status, 'cancelled'); assert.equal(run.endReason, 'cancelled');
    const current = run.steps.find((s) => s.toolUseId === toolId); assert.equal(current?.isError, false);
    const finalGroup = record(await qa.api.group(group.id)); assert.equal(finalGroup.name, 'recovered request'); assert.equal(finalGroup.agentEnabled, false);
    const sends = qa.gateway.snapshot().requests.filter((r) => r.method === 'POST' && r.path === `/groups/${group.gatewayGroupId}/send`); assert.equal(sends.length, 1);
    completed = true;
    return { database, schemaColumns: columns.rows, hit, runId, untouchedWitness, actualFaultWitness, before, beforeLedger, beforeEvents, rejected, after, afterLedger, afterEvents, accepted, run, finalGroup, sends,
      boundary: 'real owned PG trigger exception at original event INSERT; no replacement of product method, transaction, result or budget' };
  } catch (error) { primary = error; throw error; }
  finally {
    const failures: string[] = [];
    if (!completed) try { await qa.kill(); } catch (e) { failures.push(`owned executor stop: ${String(e)}`); }
    if (barrier) qa.agent.barriers.release(barrier);
    if (installed) try { await client.query(`DROP TRIGGER IF EXISTS "${trigger}" ON public.events`); } catch (e) { failures.push(`trigger removal: ${String(e)}`); }
    if (functionInstalled) try { await client.query(`DROP FUNCTION IF EXISTS public."${fn}"()`); } catch (e) { failures.push(`function removal: ${String(e)}`); }
    if (sequenceInstalled) try { await client.query(`DROP SEQUENCE IF EXISTS public."${witnessSequence}"`); } catch (e) { failures.push(`witness sequence removal: ${String(e)}`); }
    try { await client.end(); } catch (e) { failures.push(`observer close: ${String(e)}`); }
    await qa.evidence('SR-BE-GRD-007-fault-cleanup', { completed, database, trigger, functionName: fn, witnessSequence, failures });
    if (!primary && failures.length) throw new BlockedError(`Owned transaction fault cleanup incomplete: ${failures.join('; ')}`);
  }
}
