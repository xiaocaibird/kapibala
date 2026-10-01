import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun } from '../../harness/platform-client.js';
import { capacityControlFor } from '../../harness/capacity-control.js';
import { BlockedError, redact } from '../../harness/security.js';
import { withOwnedDriver } from '../tests/media-provider.js';
import { C2_CAPABILITIES as P, type ProviderDriver } from '../contracts/media-provider.js';
import { classifyError, type RoundResult } from './result.js';
import { observeBackend } from './backend-boundaries.js';

export async function managedProviderRecovery(input: { providerDriver?: ProviderDriver; providerEnvironment?: () => Promise<QaEnvironment>; outputDir: string }): Promise<RoundResult> {
  const caseId = 'SR-BE-POL-007', evidence = [resolve(input.outputDir, 'backend-provider-recovery.json')];
  if (!input.providerDriver || !input.providerEnvironment) return { caseId, status: 'BLOCKED', variants: [{ id: 'real-c2-safe-restart', status: 'BLOCKED', evidence: [], reason: 'Shared actual C2 driver and owned backend environment are unbound.' }] };
  const driver = input.providerDriver; let observed: unknown;
  try {
    await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend], 'provider-managed-recovery', async d => {
      const fixture = await d.backendGroup({ autoKickEnabled: true, executor: 'admin' });
      const qa = await input.providerEnvironment!(), group = await qa.api.group(fixture.groupId);
      const capacity = capacityControlFor(qa); await capacity.verify(['admission-hold', 'before-ready-window']);
      const gate = await d.holdNextUpstream('audit'); let complete = false, primary: unknown;
      try {
        await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'kick_user', input: { platform_user_id: fixture.target, reason: 'neutral managed protection after recovery' } } });
        await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'proposal approved independently of current managed identity' } });
        await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'Finished protected proposal' } });
        const runId = await d.triggerBackend(group.id); const auditRequest = await gate.reached();
        const current = await qa.api.agentRun(runId), toolId = current.steps.find(s => s.name === 'kick_user')?.toolUseId;
        if (!toolId) throw new BlockedError('Actual public original C2 kick step absent while audit is held');
        const lease = await capacity.hold({ groupId: group.id, runId, toolUseId: toolId }, { beforeReady: true });
        await gate.release(); const held = await lease.waitFor(s => s.events.some(e => e.kind === 'before-ready-held'));
        const boundary = held.events.find(e => e.kind === 'before-ready-held'); assert.equal(boundary?.callbackEntered, false); assert.equal(boundary.remoteRequestCount, 0);
        const actor = group.members.find(m => m.accountId && m.role === 'member') ?? group.members.find(m => m.accountId && m.role === 'admin');
        if (!actor?.accountId) throw new BlockedError('No non-owner public service account for identity transition');
        await qa.api.require(qa.api.post('/api/accounts/' + actor.accountId + '/transition', { expectedFrom: 'online', to: 'disconnected' }));
        qa.gateway.enqueue('/accounts/' + actor.accountId + '/connect', { body: { platformUserId: fixture.target } });
        await qa.api.require(qa.api.post('/api/accounts/' + actor.accountId + '/connect'));
        const accounts = await qa.api.accounts(); assert.equal(accounts.find(a => a.id === actor.accountId)?.platformUserId, fixture.target);
        const before = await d.backendFacts(group.id); assert.equal(before.kicks.length, 0); assert.equal(before.audits.length, 1);
        const latest = await lease.snapshot(); assert.equal(latest.state, 'held');
        assert.ok(!latest.events.some(e => e.kind === 'ready-persisted' && e.attemptId === boundary.attemptId));
        const oldPid = qa.capacityControlTarget().pid; await qa.kill();
        if (Date.parse(latest.expiresAt) <= Date.now()) throw new BlockedError('Before-ready lease expired before actual process stop');
        await lease.release(); await qa.start(); await qa.api.login(); const newPid = qa.capacityControlTarget().pid; assert.notEqual(newPid, oldPid);
        const run = await observeBackend(() => qa.api.agentRun(runId), r => r.status !== 'running', 30_000, 'same original C2 run recovery');
        const originalStep = run.steps.find(s => s.toolUseId === toolId); assert.ok(originalStep); assert.equal(originalStep.isError, true); assert.equal(originalStep.errorCode, 'POLICY_DENIED');
        const runs = await qa.api.require(qa.api.get<AgentRun[]>('/api/groups/' + group.id + '/agent-runs')); assert.equal(runs.length, 1); assert.equal(runs[0]?.id, runId);
        const facts = await d.backendFacts(group.id); assert.equal(facts.kicks.length, 0); assert.equal(facts.audits.length, 1); assert.equal(facts.effects.filter(e => e.kind === 'kick').length, 0);
        observed = { auditRequest, held, latest, accounts, oldPid, newPid, run, runs, facts, calls: await d.calls(), realPaidProvider: false };
        await d.evidence('backend-provider-recovery', observed);
        await writeFile(evidence[0]!,redact(observed)+'\n'); complete = true;
      } catch (error) { primary = error; throw error; } finally {
        const errors: string[] = [];
        for (const close of [() => !complete ? qa.kill() : Promise.resolve(), () => gate.release(), () => capacity.close()]) try { await close(); } catch (error) { errors.push(String(error)); }
        if (errors.length) { await d.evidence('backend-provider-recovery-cleanup', { primary: String(primary), errors }); if (!primary) throw new BlockedError('Owned C2 recovery cleanup incomplete: ' + errors.join('; ')); }
      }
    });
    return { caseId, status: 'PASS', variants: [{ id: 'real-c2-safe-restart', status: 'PASS', evidence }] };
  } catch (error) {
    await driver.evidence('backend-provider-recovery', { error: String(error), observed });
    await writeFile(evidence[0]!,redact({error:String(error),observed})+'\n');
    const status = classifyError(error); return { caseId, status, variants: [{ id: 'real-c2-safe-restart', status, evidence, reason: String(error) }] };
  }
}
