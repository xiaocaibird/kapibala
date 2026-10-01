import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaEnvironment } from '../../harness/environment.js';
import { BlockedError, redact } from '../../harness/security.js';
import { runtimeObservationFor, type RuntimeEvent } from '../../harness/runtime-observation.js';
import { assertNoDispatchAfterStop, observationInterval } from '../../harness/lifecycle-observation.js';
import { assertSingleEpochActivityBudget } from '../../tests/support/agent-activity-budget.js';
import { withOwnedDriver } from '../tests/media-provider.js';
import { C2_CAPABILITIES as P, type ProviderDriver } from '../contracts/media-provider.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';

export interface ProviderBackendContext {
  providerDriver?: ProviderDriver;
  providerEnvironment?: () => Promise<QaEnvironment>;
  outputDir: string;
}

/** Covers either legitimate budget reason without relabelling real events to
 * fit the original wall-clock-only oracle. Every time value is from the same
 * actual app clock; public completion time is never the decision timestamp. */
export function assertProviderBudgetLifecycle(activity: readonly RuntimeEvent[], lifecycle: readonly RuntimeEvent[],
  online: [number, number], expectedReason: 'budget_exhausted' | 'wall_clock') {
  const created = lifecycle.filter(event => event.kind === 'agent-run-created');
  if (created.length !== 1) throw new BlockedError('Missing unique actual run-creation lifecycle');
  const start = observationInterval(created[0]!.creationWindowMs);
  for (const event of lifecycle.filter(event => ['agent-termination-decided', 'agent-turn-dispatched'].includes(event.kind))) {
    const end = observationInterval(event.kind === 'agent-termination-decided' ? event.decisionWindowMs : event.monotonicMs);
    if (event.clockDomain !== created[0]!.clockDomain) throw new BlockedError('Actual budget observation crosses process clocks');
    assert.ok(end[0] - start[1] <= 60_000, '真实决定或新turn派发已超过原始60000ms上限');
  }
  assertSingleEpochActivityBudget(activity, online, expectedReason);
  assertNoDispatchAfterStop(lifecycle);
  if (lifecycle[0]?.kind !== 'lifecycle-observation-attached' || lifecycle[0].droppedThroughSourceSeq !== 0)
    throw new BlockedError('Lifecycle history is incomplete; cannot infer actual decision');
  const terminal = lifecycle.filter(event => event.kind === 'agent-terminal-committed');
  const decision = lifecycle.filter(event => event.kind === 'agent-termination-decided');
  if (terminal.length !== 1 || decision.length !== 1 || !terminal[0]!.attemptId || terminal[0]!.attemptId !== decision[0]!.attemptId)
    throw new BlockedError('Stop decision and terminal COMMIT lack one actual shared attempt');
  const t = terminal[0]!, d = decision[0]!, c = created[0]!;
  if (!(d.seq < t.seq && [t, d].every(event => event.clockDomain === c.clockDomain && event.applicationPid === c.applicationPid && event.runId === c.runId && event.groupId === c.groupId)))
    throw new BlockedError('Budget decision/COMMIT is not ordered in the original run/process');
  assert.equal(d.status, 'failed'); assert.equal(t.status, d.status);
  assert.equal(d.reason, expectedReason); assert.equal(t.reason, d.reason);
  const end = observationInterval(d.decisionWindowMs), elapsed: [number, number] = [Math.max(0, end[0] - start[1]), end[1] - start[0]];
  if (elapsed[1] > 60_000) throw new BlockedError('Actual decision interval crosses 60000ms; no timing tolerance is introduced');
  const actual = activity.filter(event => ['activity-checkpoint', 'activity-terminal'].includes(event.kind));
  const last = actual.findLast(event => event.kind === 'activity-terminal');
  if (!last || !actual.every(event => event.clockDomain === c.clockDomain && event.applicationPid === c.applicationPid && event.runId === c.runId && event.groupId === c.groupId && event.includesUnsavedTail && event.epochIds?.length === 1 && event.epochIds[0] === last.epochIds?.[0] && ['active', 'terminal'].includes(String(event.activityState))))
    throw new BlockedError('Missing continuous same-run single-epoch activity provenance');
  return { created: c, decision: d, terminal: t, actualDecisionElapsedMs: elapsed,
    activeElapsedMs: last.activeElapsedMs, epochIds: last.epochIds, continuous: true,
    decisionAttemptId: d.attemptId, committedAttemptId: t.attemptId };
}

export async function runProviderBudgetCase(input: ProviderBackendContext, profile: 'c2-budgets' | 'original-eight-second' = 'c2-budgets'): Promise<RoundResult> {
  const caseId = profile === 'original-eight-second' ? 'SR-C2-019' : 'SR-C2-010', variants: VariantResult[] = [];
  for (const delayResponseMs of profile === 'original-eight-second' ? [8000] : [0, 7000]) {
    const id = delayResponseMs ? 'real-wall-clock-budget' : 'real-twelve-turn-budget';
    const path = resolve(input.outputDir, caseId + '-' + id + '.json');
    let observed: unknown;
    try {
      if (!input.providerEnvironment) throw new BlockedError('Owned C2 backend environment getter is not bound');
      await withOwnedDriver(input.providerDriver, [P.protocol, P.upstream, P.backend], 'provider-budget-' + id, async d => {
        const group = await d.backendGroup({ autoKickEnabled: true, executor: 'admin' });
        const qa = await input.providerEnvironment!(), control = runtimeObservationFor(qa);
        await control.verify(['activity-witness', 'agent-lifecycle-witness']);
        const first = await d.holdNextUpstream('turn'); let primary: unknown;
        try {
          for (let i = 0; i < 14; i++) await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'get_recent_messages', input: { limit: i + 1 } }, delayResponseMs });
          const startedMono = performance.now(), runId = await d.triggerBackend(group.groupId), held = await first.reached();
          const activity = await control.arm('observe-activity', { kind: 'activity', groupId: group.groupId, runId, toolUseId: 'all-run-steps' });
          const lifecycle = await control.arm('observe-agent-lifecycle', { kind: 'tool-wait', groupId: group.groupId, runId, toolUseId: 'all-run-steps' });
          await first.release();
          let run: Awaited<ReturnType<ProviderDriver['backendRun']>> | undefined, runFailure: unknown;
          try { run = await d.backendRun(runId, 75_000); } catch (error) { runFailure = error; }
          const [activitySnapshot, lifecycleSnapshot, facts, calls] = await Promise.all([activity.snapshot(), lifecycle.snapshot(), d.backendFacts(group.groupId), d.calls()]);
          const online: [number, number] = [0, performance.now() - startedMono];
          observed = { delayResponseMs, held, runId, run, runFailure: runFailure ? String(runFailure) : null, facts, calls, activitySnapshot, lifecycleSnapshot, online, paidProvider: false };
          await writeFile(path, redact(observed) + '\n'); await d.evidence('provider-budget-raw-' + id, observed);
          // A missing public terminal must not hide a proved activity overrun.
          for (const event of activitySnapshot.events) if (event.includesUnsavedTail && event.activeElapsedMs)
            assert.ok(event.activeElapsedMs[0] <= 60_000, '活动预算已证明超过原始60秒上限');
          if (runFailure) throw runFailure;
          assert.ok(run); assert.notEqual(run.status, 'running');
          assert.ok(run.steps.filter(step => step.name === 'get_recent_messages' && !step.isError).length > 1, 'Actual repeated legal read-only tools must complete');
          const actualTurns = facts.turns.filter(turn => turn.runId === runId);
          assert.ok(actualTurns.length <= 12, 'Original maximum is twelve actual backend/Agent round trips');
          const expected = delayResponseMs ? 'wall_clock' : 'budget_exhausted';
          if (run.endReason !== expected) throw new BlockedError('A legal early finish does not prove the selected budget-exhaustion boundary');
          const timing = assertProviderBudgetLifecycle(activitySnapshot.events, lifecycleSnapshot.events, online, expected);
          observed = { ...observed as Record<string, unknown>, timing };
          await writeFile(path, redact(observed) + '\n');
        } catch (error) { primary = error; throw error; } finally {
          const errors: string[] = [];
          for (const close of [() => first.release(), () => control.close()]) try { await close(); } catch (error) { errors.push(String(error)); }
          if (errors.length) { await d.evidence('provider-budget-cleanup-errors', { primary: String(primary), errors }); if (!primary) throw new BlockedError(errors.join('; ')); }
        }
      });
      variants.push({ id, status: 'PASS', evidence: [path] });
    } catch (error) {
      const status = classifyError(error), reason = String(error);
      await writeFile(path, redact({ status, reason, observed }) + '\n');
      variants.push({ id, status, reason, evidence: [path] });
    }
  }
  return { caseId, status: combineVariants(variants), variants };
}
