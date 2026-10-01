import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BlockedError, redact } from '../../harness/security.js';
import { runtimeObservationFor } from '../../harness/runtime-observation.js';
import { toolWaitWindow, assertToolWaitBudget, assertToolWaitCompletion } from '../../harness/lifecycle-observation.js';
import { withOwnedDriver } from '../tests/media-provider.js';
import { C2_CAPABILITIES as P, type ProviderDriver, type Barrier } from '../contracts/media-provider.js';
import { classifyError, combineVariants, type VariantResult, type RoundResult } from './result.js';
import { observeBackend } from './backend-boundaries.js';
import { record } from './backend-oracles.js';
import { runProviderBudgetCase, type ProviderBackendContext } from './backend-provider-budgets.js';

export function assertOriginalTurnTimeout(start: [number, number], end: [number, number]) {
  assert.ok([...start, ...end].every(Number.isFinite));
  assert.ok(start[0] <= start[1] && end[0] <= end[1]);
  const elapsed: [number, number] = [Math.max(0, end[0] - start[1]), end[1] - start[0]];
  assert.ok(elapsed[0] <= 15_000, 'Observed turn timeout lower bound exceeds original 15s maximum');
  assert.ok(elapsed[1] >= 10_000, 'Observed turn timeout is wholly earlier than original 10s minimum');
  if (elapsed[0] < 10_000 || elapsed[1] > 15_000) throw new BlockedError('Turn timeout interval crosses original 10–15s boundary; no tolerance or exact point inferred');
  return elapsed;
}

function providerResults(calls: Awaited<ReturnType<ProviderDriver['calls']>>, runId: string, toolId: string) {
  return calls.filter(call => call.purpose === 'turn').flatMap(call => {
    const wire = record(call.rawWire), contents = wire.contents as unknown[];
    const part = record((record(contents[0]).parts as unknown[])[0]);
    const payload = record(JSON.parse(String(part.text)));
    if (payload.runId !== runId) return [];
    return (payload.messages as unknown[]).flatMap(message => (record(message).content as unknown[]).map(record)
      .filter(block => block.type === 'tool_result' && block.tool_use_id === toolId));
  });
}

export async function runProviderRegressionCase(input: ProviderBackendContext): Promise<RoundResult> {
  const caseId = 'SR-C2-019', variants: VariantResult[] = [];
  const check = async (id: string, body: (d: ProviderDriver, save: (value: unknown) => Promise<void>) => Promise<void>) => {
    const path = resolve(input.outputDir, caseId + '-' + id + '.json'); let observed: unknown;
    const save = async (value: unknown) => { observed = value; await writeFile(path, redact(value) + '\n'); };
    try {
      if (!input.providerEnvironment) throw new BlockedError('Owned C2/backend getter is unbound');
      await withOwnedDriver(input.providerDriver, [P.protocol, P.upstream, P.backend], 'provider-regression-' + id, d => body(d, save));
      variants.push({ id, status: 'PASS', evidence: [path] });
    } catch (error) {
      const status = classifyError(error), reason = String(error);
      await writeFile(path, redact({ status, reason, observed }) + '\n'); variants.push({ id, status, reason, evidence: [path] });
    }
  };
  await check('original-turn-timeout-and-late-result', async (d, save) => {
    const fixture = await d.backendGroup({ autoKickEnabled: false, executor: 'admin' }), qa = await input.providerEnvironment!();
    const gate = await d.holdNextUpstream('turn'); let primary: unknown;
    try {
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'send_message', input: { text: 'late must never send', idempotency_key: randomUUID() } }, delayResponseMs: 16_000 });
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'finish after timeout' } });
      const earliest = Date.now(), runId = await d.triggerBackend(fixture.groupId), held = await gate.reached();
      const initial = await d.usageObservation(), attempts = initial.snapshot.transport.events.filter(event => event.kind === 'attempt');
      if (initial.snapshot.transport.truncatedEvents || attempts.length !== 1)
        throw new BlockedError('First delayed call lacks one isolated actual transport attempt; no index-based correlation');
      const transportId = attempts[0]!.requestId;
      const firstCalls = await d.calls(); assert.equal(firstCalls.length, 1);
      const receivedAt = Date.parse(String(record(firstCalls[0]!.evidence.raw).receivedAt)); assert.ok(Number.isFinite(receivedAt));
      await gate.release();
      let precedingRead = Date.now(), observedLower = precedingRead, observedUpper = precedingRead;
      const run = await observeBackend(async () => {
        const lower = precedingRead, value = await qa.api.agentRun(runId), upper = Date.now();
        precedingRead = upper;
        if (value.steps.some(step => step.errorCode === 'TURN_TIMEOUT')) { observedLower = lower; observedUpper = upper; }
        return value;
      }, value => value.steps.some(step => step.errorCode === 'TURN_TIMEOUT'), 20_000, 'actual original backend TURN_TIMEOUT');
      const beforeLate = await d.backendFacts(fixture.groupId);
      assert.equal(beforeLate.sends.length, 0); assert.equal(beforeLate.audits.length, 0);
      // Observe the exact first transport response, not a fixed sleep or a
      // later unrelated turn. Cancellation alone cannot prove late-response discard.
      let lateFailure: unknown;
      let late: Awaited<ReturnType<ProviderDriver['usageObservation']>> | undefined;
      try { late = await observeBackend(() => d.usageObservation(), value => value.snapshot.transport.events.some(event => event.requestId === transportId && event.kind === 'response-end'), 20_000, 'first actual delayed provider response end'); }
      catch (error) { lateFailure = error; late = await d.usageObservation(); }
      const after = await observeBackend(() => qa.api.agentRun(runId), value => value.status !== 'running', 30_000, 'original timed-out run terminal'), facts = await d.backendFacts(fixture.groupId), calls = await d.calls();
      await save({ runId, held, initial, firstCalls, transportId, timeout: run, timeoutStart: [earliest, receivedAt], timeoutEnd: [observedLower, observedUpper], late, after, beforeLate, facts, calls, lateFailure: lateFailure ? String(lateFailure) : null });
      assert.equal(facts.sends.length, 0); assert.equal(facts.audits.length, 0); assert.equal(facts.effects.length, 0);
      const timeout = run.steps.find(step => step.errorCode === 'TURN_TIMEOUT'); assert.equal(timeout?.kind, 'protocol_error');
      assertOriginalTurnTimeout([earliest, receivedAt], [observedLower, observedUpper]);
      if (lateFailure) throw lateFailure;
      assert.ok(late!.snapshot.transport.events.some(event => event.requestId === transportId && event.kind === 'response-end' && Date.parse(event.at) > observedUpper), 'Must prove the original response actually ended after backend timeout');
    } catch (error) { primary = error; throw error; } finally {
      try { await gate.release(); } catch (error) { if (!primary) throw error; }
    }
  });

  await check('original-five-second-wait-and-confirmed-key-reuse', async (d, save) => {
    const fixture = await d.backendGroup({ autoKickEnabled: false, executor: 'admin' }), qa = await input.providerEnvironment!();
    const group = await qa.api.group(fixture.groupId), control = runtimeObservationFor(qa);
    await control.verify(['tool-wait-witness']);
    const auditGate = await d.holdNextUpstream('audit'), responseGate = 'qa-c2-unknown-' + randomUUID();
    let retryGate: Barrier | undefined, primary: unknown, complete = false;
    try {
      const key = randomUUID(), text = 'C2 unknown original ' + randomUUID();
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'send_message', input: { text, idempotency_key: key } } });
      await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'neutral QA send' } });
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'send_message', input: { text, idempotency_key: key } } });
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'finish after original key' } });
      const runId = await d.triggerBackend(group.id), auditHeld = await auditGate.reached();
      const firstRun = await qa.api.agentRun(runId), firstId = firstRun.steps.find(step => step.name === 'send_message')?.toolUseId;
      if (!firstId) throw new BlockedError('Real original send step not visible at audit boundary');
      const lease = await control.arm('observe-tool-wait', { kind: 'tool-wait', groupId: group.id, runId, toolUseId: 'all-run-steps' });
      retryGate = await d.holdNextUpstream('turn');
      qa.gateway.enqueue('/groups/' + group.gatewayGroupId + '/send', { status: 504, code: 'NETWORK_TIMEOUT', effect: 'apply', effectDelayMs: 1500, omitEvent: true, barrier: { phase: 'before-response', name: responseGate } });
      await auditGate.release(); const dispatched = await qa.gateway.barriers.waitFor(responseGate);
      qa.gateway.configure({ unavailable: true }); qa.gateway.barriers.release(responseGate);
      const retryHeld = await retryGate.reached(), before = await qa.api.agentRun(runId);
      assert.equal(before.steps.find(step => step.toolUseId === firstId)?.errorCode, 'SEND_TIMEOUT');
      const initialFacts = await d.backendFacts(group.id); assert.equal(initialFacts.sends.length, 1); assert.equal(initialFacts.audits.length, 1);
      const clientMsgId = initialFacts.sends[0]!.clientMsgId;
      qa.gateway.configure({ unavailable: false });
      const confirmed = await observeBackend(() => qa.api.messages(group.id), page => page.items.some(message => message.clientMsgId === clientMsgId && message.deliveryStatus === 'sent'), 2000, 'original message authoritative confirmation');
      await retryGate.release(); const run = await d.backendRun(runId, 30_000), rawRun = await qa.api.agentRun(runId);
      const facts = await d.backendFacts(group.id), calls = await d.calls(), snapshot = await lease.snapshot();
      const retryId = rawRun.steps.find(step => step.name === 'send_message' && step.toolUseId !== firstId)?.toolUseId;
      if (!retryId) throw new BlockedError('Same-run second send step was not witnessed');
      const returned = providerResults(calls, runId, retryId); assert.ok(returned.length);
      const result = record(JSON.parse(String(returned[0]!.content)));
      await save({ runId, firstId, retryId, key, auditHeld, dispatched, retryHeld, before, confirmed, run, rawRun, initialFacts, facts, calls, snapshot, result });
      assert.equal(run.status, 'finished'); assert.equal(facts.sends.length, 1); assert.equal(facts.audits.length, 1);
      assert.equal(facts.effects.filter(effect => effect.kind === 'send' && effect.identity === clientMsgId).length, 1);
      assert.equal(result.clientMsgId, clientMsgId); assert.equal(result.deliveryStatus, 'sent');
      const window = toolWaitWindow(snapshot.events, firstId, key);
      assertToolWaitBudget(window, 'SEND_TIMEOUT'); assertToolWaitCompletion(window);
      complete = true;
    } catch (error) { primary = error; throw error; } finally {
      const errors: string[] = [];
      for (const close of [() => !complete ? qa.kill() : Promise.resolve(), () => { qa.gateway.configure({ unavailable: false }); qa.gateway.barriers.release(responseGate); }, () => auditGate.release(), () => retryGate?.release(), () => control.close()])
        try { await close(); } catch (error) { errors.push(String(error)); }
      if (errors.length) { await d.evidence('provider-original-wait-cleanup', { primary: String(primary), errors }); if (!primary) throw new BlockedError(errors.join('; ')); }
    }
  });
  const originalSlow = await runProviderBudgetCase(input, 'original-eight-second');
  variants.push(...originalSlow.variants.map(variant => ({ ...variant, id: 'original-AGENT-025-eight-second-' + variant.id })));
  const uncoveredVariants = ['INT-ACT-001-complete-cross-epoch-tail-and-original-recovery'];
  for (const id of uncoveredVariants) variants.push({ id, status: 'BLOCKED', evidence: [],
    reason: 'Existing crash takeover observations explicitly lack a sound complete pre-crash tail bound; no fabricated epoch sum or provider replay guarantee.' });
  return { caseId, status: combineVariants(variants, uncoveredVariants), variants, uncoveredVariants };
}
