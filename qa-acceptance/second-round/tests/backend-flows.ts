import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaEnvironment } from '../../harness/environment.js';
import type { AgentRun, Group } from '../../harness/platform-client.js';
import type { AgentResponsePlan } from '../../harness/agent.js';
import { BlockedError } from '../../harness/security.js';
import { runtimeObservationFor } from '../../harness/runtime-observation.js';
import { assertDiagnostics, assertNoDisclosure, record, type DiagnosticModule } from '../harness/backend-oracles.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from '../harness/result.js';
import { runManagedPolicyBudgetCase } from '../harness/backend-policy-window.js';
import { profileCancellationRollback } from '../harness/backend-transaction-fault.js';
import { capacityControlFor } from '../../harness/capacity-control.js';
import { observeBackendEvents } from '../harness/backend-events.js';
import { cancelAtKickWait, concurrentProfileCas, deferredPermissionChange, noDispatchBudget, dispatchedUnknownKick, assertUnknownKickCompletion, reviewUnknownNextSteps, sentKeyCrashRecovery, reuseAtMessageState, independentModuleRecovery } from '../harness/backend-boundaries.js';
import { managedProviderRecovery } from '../harness/backend-provider-recovery.js';
import type { ProviderDriver } from '../contracts/media-provider.js';
import { SecondRoundEnvironment } from '../harness/environment.js';

export type BackendStatus = 'PASS' | 'FAIL' | 'BLOCKED';
export interface BackendSubcheck { id: string; status: BackendStatus; evidence: string; reason?: string }
export interface BackendCaseResult extends RoundResult { partial: boolean; subchecks: BackendSubcheck[]; uncoveredVariants: string[] }
export interface BackendContext {
  qa: QaEnvironment; outputDir: string; sutDirectory?: string; deliveryEvidence?: unknown;
  providerDriver?: ProviderDriver; providerEnvironment?: () => Promise<QaEnvironment>;
  /** Finite observation only. Never substitutes for a contractual SLA or actual fault-window witness. */
  observationMs?: number;
}
export const BACKEND_EXECUTABLE_IDS = [
  'SR-BE-DIA-001', 'SR-BE-DIA-002', 'SR-BE-DIA-003', 'SR-BE-DIA-004', 'SR-BE-DIA-005',
  'SR-BE-GRD-001', 'SR-BE-GRD-002', 'SR-BE-GRD-003', 'SR-BE-GRD-004', 'SR-BE-GRD-005', 'SR-BE-GRD-006', 'SR-BE-GRD-007', 'SR-BE-GRD-008',
  'SR-BE-POL-001', 'SR-BE-POL-002', 'SR-BE-POL-003', 'SR-BE-POL-004', 'SR-BE-POL-005', 'SR-BE-POL-006', 'SR-BE-POL-007', 'SR-BE-POL-008',
] as const;
const tool = (id: string, name: string, input: unknown): AgentResponsePlan => ({ body: {
  stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }],
} });
const diagPath = '/api/diagnostics/background';
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function poll<T>(read: () => Promise<T>, complete: (value: T) => boolean, ms: number, why: string): Promise<T> {
  const until = performance.now() + ms;
  do { const value = await read(); if (complete(value)) return value; await delay(50); } while (performance.now() < until);
  throw new BlockedError(`未在有限观察期取得${why}；不能把未命中窗口算通过`);
}
async function trigger(qa: QaEnvironment, group: Group, ms: number): Promise<string> {
  const before = await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`));
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: 'qa-round2-outside', text: `round2 ${randomUUID()}` });
  const runs = await poll(() => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
    (runs) => runs.some((run) => !before.some((old) => old.id === run.id)), ms, '新的真实Agent run');
  const candidates = runs.filter((run) => !before.some((old) => old.id === run.id));
  assert.equal(candidates.length, 1, 'one inbound message must create one new run');
  return candidates[0]!.id;
}
async function finished(qa: QaEnvironment, id: string, ms: number): Promise<AgentRun> {
  return poll(() => qa.api.agentRun(id), (run) => run.status !== 'running', ms, '真实run终态');
}
function requests(qa: QaEnvironment, group: Group, operation: string) {
  return qa.gateway.snapshot().requests.filter((r) => r.method === 'POST' && r.path === `/groups/${group.gatewayGroupId}/${operation}`);
}
function remoteMembers(qa: QaEnvironment, group: Group) {
  const value = qa.gateway.snapshot().groups.find((candidate) => candidate.groupId === group.gatewayGroupId);
  assert.ok(value, 'actual remote group must exist');
  return value.members;
}
function results(qa: QaEnvironment, runId: string, toolId: string): Record<string, unknown>[] {
  return qa.agent.snapshot().turns.filter((r) => record(r.body).runId === runId).flatMap((r) => {
    const messages = record(r.body).messages;
    assert.ok(Array.isArray(messages));
    return messages.flatMap((m: unknown) => {
      const content = record(m).content; assert.ok(Array.isArray(content));
      return content.map(record).filter((b) => b.type === 'tool_result' && b.tool_use_id === toolId);
    });
  });
}
async function setExternal(qa: QaEnvironment, group: Group, target: string, ms: number): Promise<void> {
  qa.gateway.setMembership(group.gatewayGroupId, target, true);
  await poll(() => qa.api.group(group.id), (g) => g.members.some((m) => m.platformUserId === target && !m.accountId), ms, '外部成员事件实际进入公开投影');
}
function step(run: AgentRun, id: string) {
  const found = run.steps.find((s) => s.toolUseId === id);
  assert.ok(found, `missing original tool step ${id}`);
  return found;
}
function checkError(run: AgentRun, id: string, code: string) {
  const s = step(run, id); assert.equal(s.isError, true); assert.equal(s.errorCode, code);
}
/** Independent variant resources prevent a queued send, account terminal,
 * pending model plan or killed process from determining the next verdict. */
async function isolatedBackendVariant<T>(parent: QaEnvironment, label: string, run: (qa: QaEnvironment) => Promise<T>) {
  if (!(parent instanceof SecondRoundEnvironment)) throw new BlockedError('Independent backend variants require the owned second-round environment factory');
  const name = label + '-' + randomUUID();
  const qa = new SecondRoundEnvironment(parent.config, parent.ownedStorage().cluster,
    resolve(parent.outputDir, name), resolve(parent.runtimeDirectory, name));
  let primary: unknown;
  try {
    await qa.initialize(); await qa.api.login(); await qa.ownership('c1-media-files');
    const facts = await run(qa);
    await qa.evidence('variant-observation', { label, facts });
    return { variantEvidence: resolve(qa.outputDir, 'variant-observation.json'), facts };
  } catch (error) {
    primary = error;
    await qa.evidence('variant-failure', { label, reason: String(error), gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot() });
    throw error;
  } finally {
    try { await qa.close(); } catch (error) {
      await parent.evidence('variant-cleanup-failure-' + name, { primary: String(primary), cleanup: String(error), outputDir: qa.outputDir });
      if (!primary) throw error;
    }
  }
}
export async function runBackendCase(caseId: string, context: BackendContext): Promise<BackendCaseResult> {
  if (caseId === 'SR-BE-POL-008' || caseId === 'SR-BE-POL-007') {
    const result = caseId === 'SR-BE-POL-007' ? await managedProviderRecovery(context) : await runManagedPolicyBudgetCase(context);
    return { ...result, partial: result.status !== 'PASS' && result.variants.some((v) => v.status === 'PASS'), subchecks: result.variants.map((v) => ({ id: v.id, status: v.status as BackendStatus, evidence: v.evidence[0] ?? '', reason: v.reason })), uncoveredVariants: result.uncoveredVariants ?? [] };
  }
  const { qa } = context, ms = context.observationMs ?? 30_000;
  const subchecks: BackendSubcheck[] = [], uncoveredVariants: string[] = [];
  const check = async (id: string, fn: () => Promise<unknown>): Promise<boolean> => {
    const name = `${caseId}-${id}`;
    try {
      const facts = await fn();
      await qa.evidence(name, { type: 'independent-product-observation', caseId, variant: id, observedAt: new Date().toISOString(), facts });
      subchecks.push({ id, status: 'PASS', evidence: resolve(qa.outputDir, `${name}.json`) });
      return true;
    } catch (error) {
      const status = classifyError(error);
      const reason = error instanceof Error ? error.message : String(error);
      await qa.evidence(name, { caseId, variant: id, status, reason, observedAt: new Date().toISOString(), gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot() });
      subchecks.push({ id, status, evidence: resolve(qa.outputDir, `${name}.json`), reason });
      return false;
    }
  };
  const missing = (id: string, reason: string) => {
    uncoveredVariants.push(id);
    subchecks.push({ id, status: 'BLOCKED', evidence: '', reason });
  };
  await qa.api.login();
  if (caseId === 'SR-BE-DIA-003') {
    await check('permissions-rotation-logout-and-disclosure', async () => {
      const { group, accounts } = await qa.api.createGroup();
      const sentinel = `PRIVATE-ROUND2-${randomUUID()}`;
      const sent = await qa.api.send(group.id, accounts[0]!.id, sentinel);
      await poll(() => qa.api.messages(group.id), (m) => m.items.some((v) => v.clientMsgId === sent.clientMsgId && v.deliveryStatus === 'sent'), ms, '秘密哨兵消息真实落地');
      const viewer = await qa.api.as('viewer');
      const statuses = [];
      for (const token of [null, 'invalid-diagnostics-credential']) {
        const r = await qa.api.get(diagPath, { token, cookie: null }); assert.equal(r.status, 401); statuses.push(r.status);
        assertNoDisclosure(r.body, [sentinel]);
      }
      const denied = await viewer.get(diagPath); assert.equal(denied.status, 403); statuses.push(denied.status);
      const r = await qa.api.get(diagPath); assert.equal(r.status, 200);
      const modules = assertDiagnostics(r.body, [sentinel, qa.api.token!, qa.api.cookie!, viewer.token!, viewer.cookie!, group.id, group.gatewayGroupId]);
      const refresh = await qa.api.post<{ accessToken: string }>('/api/auth/refresh', undefined, { token: null });
      assert.equal(refresh.status, 200); assert.ok(typeof refresh.body.accessToken === 'string');
      qa.api.cookie = refresh.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
      assert.ok(qa.api.cookie, 'refresh must provide the new rotating session cookie');
      const afterRotation = await qa.api.get(diagPath, { token: refresh.body.accessToken, cookie: null }); assert.equal(afterRotation.status, 200);
      assertDiagnostics(afterRotation.body, [sentinel, refresh.body.accessToken]);
      await qa.api.require(qa.api.post('/api/auth/logout', undefined, { token: refresh.body.accessToken }));
      const afterLogout = await qa.api.get(diagPath, { token: refresh.body.accessToken, cookie: null }); assert.equal(afterLogout.status, 401);
      await qa.api.login();
      return { statuses, admin: 200, afterRotation: 200, afterLogout: 401, modules, testedDisclosure: 'synthetic message/token/cookie only; no actual credentials read' };
    });
  } else if (caseId === 'SR-BE-DIA-001' || caseId === 'SR-BE-DIA-002' || caseId === 'SR-BE-DIA-005') {
    await check('controlled-real-tick-failure-and-recovery', async () => {
      const control = runtimeObservationFor(qa);
      await control.verify(['module-tick']);
      const profile = control.config.diagnostics;
      if (!profile) throw new BlockedError('最终目标缺公开diagnostic profile绑定');
      const episodes: unknown[] = [];
      try {
        const cycles = caseId === 'SR-BE-DIA-002' ? 2 : 1;
        for (let i = 0; i < cycles; i++) {
          const marker = `qa-runtime-private-error-${randomUUID()}`, attemptLabel = randomUUID();
          const lease = await control.arm('module-fail-then-hold',
            { kind: 'module', module: profile.module, attemptLabel }, { faultMarker: marker });
          const failure = await lease.waitFor('module-before-next-held', ms);
          assert.ok(failure.events.some((e) => e.kind === 'module-failed' && e.faultMarker === marker), 'actual injected failure missing');
          const before = assertDiagnostics(await qa.api.require(qa.api.get(diagPath)), [marker, qa.api.token!, qa.api.cookie!]);
          const failed: DiagnosticModule = before.find((m) => m.name === profile.module)!; assert.ok(failed?.lastFailure);
          assert.equal(failed.lastFailure.recoveredAt, null); assert.equal(failed.status, profile.states.failed);
          assert.equal(failed.lastFailure.correlation.module, profile.module);
          const log = await readFile(resolve(qa.outputDir, 'server.log'), 'utf8');
          const tick = failed.lastFailure.correlation.tickId;
          if (!log.includes(tick)) throw new BlockedError('公开failure tickId缺真实服务日志关联；不靠随机ID形状声称真实轮次关联');
          await lease.advance(); await lease.waitFor('module-running-held', ms);
          const running: DiagnosticModule = assertDiagnostics(await qa.api.require(qa.api.get(diagPath)), [marker]).find((m) => m.name === profile.module)!;
          assert.equal(running.status, profile.states.running); assert.equal(running.lastFailure!.recoveredAt, null);
          await lease.advance(); const success = await lease.waitFor('module-succeeded', ms);
          const recovered: DiagnosticModule = assertDiagnostics(await qa.api.require(qa.api.get(diagPath)), [marker]).find((m) => m.name === profile.module)!;
          assert.equal(recovered.lastFailure!.correlation.tickId, tick);
          assert.equal(recovered.lastFailure!.recoveredAt, recovered.lastSucceededAt);
          assert.equal(recovered.lastFailure!.nextStep, failed.lastFailure.nextStep);
          assert.equal(recovered.status, profile.states.healthy);
          await lease.release();
          const later: DiagnosticModule[] = await poll<DiagnosticModule[]>(async () => assertDiagnostics(await qa.api.require(qa.api.get(diagPath))),
            (mods) => mods.some((m) => m.name === profile.module && m.ticks > recovered.ticks && m.lastSucceededAt !== recovered.lastSucceededAt), ms, '下一真实成功tick');
          const laterModule: DiagnosticModule = later.find((m) => m.name === profile.module)!;
          assert.deepEqual(laterModule.lastFailure, recovered.lastFailure, 'subsequent success cannot move original recoveredAt');
          episodes.push({ failure, before, running, success, recovered, later: laterModule, logCorrelation: { tickId: tick, rawLog: resolve(qa.outputDir, 'server.log') } });
        }
        if (caseId === 'SR-BE-DIA-002') {
          const first = record(record(episodes[0]).recovered), second = record(record(episodes[1]).recovered);
          assert.notEqual(record(record(first.lastFailure).correlation).tickId, record(record(second.lastFailure).correlation).tickId);
        }
        return { episodes, boundary: '真实module tick fault/hold/success；module-only correlation为冻结公开约定，不虚构entity；tick成功不等于旧业务恢复' };
      } finally { await control.close(); }
    });
    if (caseId === 'SR-BE-DIA-005') {
      await check('new-process-history-is-not-old-process-health', async () => {
        const before = assertDiagnostics(await qa.api.require(qa.api.get(diagPath)));
        const old = qa.capacityControlTarget(); await qa.restart(); const current = qa.capacityControlTarget();
        assert.notEqual(current.pid, old.pid);
        await qa.api.login(); const after = assertDiagnostics(await qa.api.require(qa.api.get(diagPath)));
        for (const m of after) assert.equal(m.lastFailure, null, 'old process failure history must not be fabricated in the new process');
        return { before, after, oldPid: old.pid, newPid: current.pid, noFailureMeans: 'no recorded failure in this process; not comprehensive dependency health' };
      });
      await check('two-independent-modules-one-still-failing', () => independentModuleRecovery(qa));
    }
  } else if (caseId === 'SR-BE-POL-001') {
    for (const variant of ['creator', 'admin', 'member', 'offline-member']) await check(variant, async () => {
      const { group } = await qa.api.createGroup();
      const role = variant === 'offline-member' ? 'member' : variant;
      const target = group.members.find((m) => m.role === role && m.accountId);
      if (!target?.accountId) throw new BlockedError(`No publicly confirmed managed ${role} fixture`);
      if (variant === 'offline-member') {
        await qa.api.require(qa.api.post(`/api/accounts/${target.accountId}/transition`, { to: 'disconnected', expectedFrom: 'online' }));
        assert.equal((await qa.api.accounts()).find((a) => a.id === target.accountId)!.status, 'disconnected');
      }
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
      const auditStart = qa.agent.snapshot().audits.length, toolId = randomUUID();
      qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'independent fixture approval' } });
      qa.agent.enqueueTurns(tool(toolId, 'kick_user', { platform_user_id: target.platformUserId, reason: 'managed target boundary' }));
      const run = await finished(qa, await trigger(qa, group, ms), ms);
      checkError(run, toolId, 'POLICY_DENIED');
      assert.equal(qa.agent.snapshot().audits.length - auditStart, 1);
      assert.equal(requests(qa, group, 'kick').length, 0);
      assert.ok(remoteMembers(qa, group).some((m) => m.platformUserId === target.platformUserId));
      assert.ok((await qa.api.group(group.id)).members.some((m) => m.platformUserId === target.platformUserId && m.accountId));
      return { target, run, auditCount: 1, kickRequestCount: 0, remoteMembers: remoteMembers(qa, group) };
    });
    await check('external-positive-control', () => externalKick(qa, ms));
  } else if (caseId === 'SR-BE-POL-002' || caseId === 'SR-BE-POL-003') {
    await check(caseId === 'SR-BE-POL-003' ? 'identity-changes-during-real-capacity-refusal' : 'identity-changes-during-actual-audit-wait', async () => {
      const capacity = caseId === 'SR-BE-POL-003' ? capacityControlFor(qa) : undefined;
      if (capacity) await capacity.verify(['admission-hold']);
      const { group, accounts } = await qa.api.createGroup();
      const target = `qa-new-platform-${randomUUID()}`, actor = accounts.at(-1)!;
      await setExternal(qa, group, target, ms);
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
      const barrier = `audit-${randomUUID()}`, toolId = randomUUID(), auditStart = qa.agent.snapshot().audits.length;
      qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'allowed audit' }, barrier: { phase: 'before-response', name: barrier } });
      qa.agent.enqueueTurns(tool(toolId, 'kick_user', { platform_user_id: target, reason: 'latest managed identity' }));
      const runId = await trigger(qa, group, ms);
      try {
        const hit = await qa.agent.barriers.waitFor(barrier, ms);
        const lease = capacity ? await capacity.hold({ groupId: group.id, runId, toolUseId: toolId }) : undefined;
        if (lease) qa.agent.barriers.release(barrier);
        const actualRefusal = lease ? await lease.waitFor((v) => v.events.some((e) => e.kind === 'admission-refused'), { timeoutMs: ms }) : null;
        assert.equal(requests(qa, group, 'kick').length, 0);
        await qa.api.require(qa.api.post(`/api/accounts/${actor.id}/transition`, { to: 'disconnected', expectedFrom: 'online' }));
        qa.gateway.enqueue(`/accounts/${actor.id}/connect`, { body: { platformUserId: target } });
        await qa.api.require(qa.api.post(`/api/accounts/${actor.id}/connect`));
        const publicAccounts = await qa.api.accounts();
        assert.equal(publicAccounts.find((a) => a.id === actor.id)!.platformUserId, target);
        const identityConfirmedAt = new Date().toISOString();
        if (lease) await lease.release();
        qa.agent.barriers.release(barrier);
        const run = await finished(qa, runId, ms);
        checkError(run, toolId, 'POLICY_DENIED');
        assert.equal(qa.agent.snapshot().audits.length - auditStart, 1);
        assert.equal(requests(qa, group, 'kick').length, 0);
        assert.ok(remoteMembers(qa, group).some((m) => m.platformUserId === target));
        return { hit, actualRefusal, identityConfirmedAt, publicAccounts, run, actualConnectResponses: qa.gateway.snapshot().requests.filter((r) => r.path === `/accounts/${actor.id}/connect`), kickCount: 0,
          fixtureBoundary: 'Gateway public connect response changes account identity; no product DB writes and no assumption that old member projection has already changed.' };
      } finally { qa.agent.barriers.release(barrier); if (capacity) await capacity.close(); }
    });
  } else if (caseId === 'SR-BE-POL-004') {
    await check('external-positive-control', () => externalKick(qa, ms));
    await check('external-switch-off', async () => {
      const { group } = await qa.api.createGroup(); const target = `external-${randomUUID()}`, toolId = randomUUID();
      await setExternal(qa, group, target, ms);
      qa.agent.enqueueTurns(tool(toolId, 'kick_user', { platform_user_id: target, reason: 'switch off' }));
      const run = await finished(qa, await trigger(qa, group, ms), ms);
      checkError(run, toolId, 'POLICY_DENIED'); assert.equal(requests(qa, group, 'kick').length, 0);
      return { run, target, kickCount: 0 };
    });
    await check('external-audit-fail', () => auditVariant(qa, 'kick_user', 'fail', ms));
    await check('no-qualified-executor', async () => {
      const { group } = await qa.api.createGroup(), target = `external-${randomUUID()}`, toolId = randomUUID();
      await setExternal(qa, group, target, ms);
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
      for (const member of group.members.filter((m) => m.role !== 'member' && m.accountId))
        await qa.api.require(qa.api.post(`/api/accounts/${member.accountId}/transition`, { expectedFrom: 'online', to: 'disconnected' }));
      const accounts = await qa.api.accounts();
      assert.ok(!group.members.filter((m) => m.role !== 'member').some((m) => accounts.some((a) => a.id === m.accountId && a.status === 'online')));
      qa.agent.enqueueTurns(tool(toolId, 'kick_user', { platform_user_id: target, reason: 'no qualified online actor' }));
      const run = await finished(qa, await trigger(qa, group, ms), ms); checkError(run, toolId, 'NO_AVAILABLE_ACCOUNT');
      assert.equal(requests(qa, group, 'kick').length, 0);
      return { accounts, group, target, run, kickCount: 0 };
    });
    await check('pre-dispatch-budget-insufficient', () => noDispatchBudget(qa));
  } else if (caseId === 'SR-BE-POL-006') {
    for (const failure of [false, true]) await check(failure ? 'leave-partial-failure' : 'leave-success-owner-last', async () => {
      const { group, accounts } = await qa.api.createGroup(); const outside = `keep-external-${randomUUID()}`;
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
      await setExternal(qa, group, outside, ms);
      if (failure) qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/leave`, { status: 500, code: 'INTERNAL_ERROR', effect: 'none' });
      const { jobId } = await qa.api.require(qa.api.post<{ jobId: string }>(`/api/groups/${group.id}/leave-all`), 202);
      const job = await qa.api.waitJob(jobId, { timeoutMs: ms });
      assert.equal(job.status, failure ? 'failed' : 'finished');
      const local = await qa.api.group(group.id), remote = remoteMembers(qa, group), leaves = requests(qa, group, 'leave');
      const expected = accounts.filter((a) => !failure || a.id !== group.creatorAccountId).map((a) => a.id).sort();
      assert.deepEqual(leaves.map((r) => record(r.body).accountId).sort(), expected);
      if (failure) {
        assert.ok(job.errors.length > 0);
        const failed = leaves.find((r) => r.responseStatus === 500); assert.ok(failed);
        const id = record(failed.body).accountId, account = accounts.find((a) => a.id === id)!;
        assert.ok(local.members.some((m) => m.accountId === id));
        assert.ok(remote.some((m) => m.platformUserId === account.platformUserId));
        assert.ok(local.members.some((m) => m.accountId === group.creatorAccountId));
      } else {
        assert.deepEqual(job.errors, []); assert.equal(record(leaves.at(-1)!.body).accountId, group.creatorAccountId); assert.equal(local.status, 'left');
        assert.equal(remote.filter((m) => accounts.some((a) => a.platformUserId === m.platformUserId)).length, 0);
      }
      const serviceIds = new Set(accounts.map((a) => a.platformUserId));
      assert.deepEqual(local.members.filter((m) => serviceIds.has(m.platformUserId)).map((m) => m.platformUserId).sort(), remote.filter((m) => serviceIds.has(m.platformUserId)).map((m) => m.platformUserId).sort());
      assert.ok(remote.some((m) => m.platformUserId === outside));
      return { job, local, remote, leaves, externalPreserved: outside };
    });
  } else if (caseId === 'SR-BE-GRD-001' || caseId === 'SR-BE-GRD-002') {
    const name = caseId.endsWith('001') ? 'send_message' : 'kick_user';
    let priorClean = await check('audit-pass-positive-control', () => name === 'kick_user' ? externalKick(qa, ms) : auditVariant(qa, name, 'pass', ms));
    for (const variant of ['fail', 'invalid-verdict', 'invalid-json', 'http-500', 'timeout'] as const) {
      if (!priorClean) { missing(variant, 'Prior variant left unexpected audit consumption or run state; this branch is not executed against a polluted script queue.'); continue; }
      priorClean = await check(variant, () => auditVariant(qa, name, variant, ms));
    }
  } else if (caseId === 'SR-BE-GRD-004') {
    await check('rejected-key-remains-available-then-reuses', async () => {
      const { group } = await qa.api.createGroup(); const key = randomUUID(), text = `one-effect-${randomUUID()}`;
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      const startAudits = qa.agent.snapshot().audits.length;
      qa.agent.enqueueAudits({ body: { verdict: 'fail', reason: 'first rejected' } }, { body: { verdict: 'pass', reason: 'then allowed' } });
      qa.agent.enqueueTurns(...ids.map((id) => tool(id, 'send_message', { text, idempotency_key: key })));
      const run = await finished(qa, await trigger(qa, group, ms), ms);
      checkError(run, ids[0]!, 'AUDIT_REJECTED');
      assert.equal(step(run, ids[1]!).isError, false); assert.equal(step(run, ids[2]!).isError, false);
      assert.equal(qa.agent.snapshot().audits.length - startAudits, 2);
      assert.equal(requests(qa, group, 'send').length, 1);
      const second = results(qa, run.id, ids[1]!)[0]!, third = results(qa, run.id, ids[2]!)[0]!;
      assert.equal(record(JSON.parse(String(second.content))).clientMsgId, record(JSON.parse(String(third.content))).clientMsgId);
      assert.equal(qa.gateway.snapshot().messages.filter((m) => m.groupId === group.gatewayGroupId && m.text === text).length, 1);
      return { run, second, third, auditCount: 2, sendCount: 1 };
    });
  } else if (caseId === 'SR-BE-GRD-003') {
    await check('sent-reuse-and-another-run-independent', () => isolatedBackendVariant(qa, 'sent-reuse', async qa => {
      const { group } = await qa.api.createGroup(); const key = randomUUID(), text = `same-key-${randomUUID()}`;
      const ids = [randomUUID(), randomUUID()], barrier = `reuse-${randomUUID()}`, beforeAudits = qa.agent.snapshot().audits.length;
      qa.agent.enqueueTurns(tool(ids[0]!, 'send_message', { text, idempotency_key: key }),
        { ...tool(ids[1]!, 'send_message', { text, idempotency_key: key }), barrier: { phase: 'before-response', name: barrier } });
      const id = await trigger(qa, group, ms);
      try {
        await qa.agent.barriers.waitFor(barrier, ms);
        const sent = await poll(() => qa.api.messages(group.id), (m) => m.items.some((v) => v.text === text && v.deliveryStatus === 'sent'), ms, '同key重试前原消息真实sent');
        qa.agent.barriers.release(barrier); const run = await finished(qa, id, ms);
        assert.equal(qa.agent.snapshot().audits.length - beforeAudits, 1); assert.equal(requests(qa, group, 'send').length, 1);
        const firstResult = record(JSON.parse(String(results(qa, id, ids[0]!)[0]!.content)));
        const retryResult = record(JSON.parse(String(results(qa, id, ids[1]!)[0]!.content)));
        assert.equal(firstResult.clientMsgId, retryResult.clientMsgId); assert.equal(retryResult.deliveryStatus, 'sent');
        const independentId = randomUUID(); qa.agent.enqueueTurns(tool(independentId, 'send_message', { text, idempotency_key: key }));
        const another = await finished(qa, await trigger(qa, group, ms), ms);
        assert.notEqual(another.id, id); assert.equal(qa.agent.snapshot().audits.length - beforeAudits, 2); assert.equal(requests(qa, group, 'send').length, 2);
        assert.notEqual(record(JSON.parse(String(results(qa, another.id, independentId)[0]!.content))).clientMsgId, firstResult.clientMsgId);
        return { sent, run, firstResult, retryResult, another, auditCount: 2, sendCount: 2 };
      } finally { qa.agent.barriers.release(barrier); }
    }));
    for (const state of ['queued', 'accepted', 'unknown', 'failed'] as const)
      await check('same-key-at-' + state, () => isolatedBackendVariant(qa, 'same-key-at-' + state, child => reuseAtMessageState(child, state)));
  } else if (caseId === 'SR-BE-GRD-006') {
    await check('current-audited-send-finishes-then-cancel', async () => {
      const { group } = await qa.api.createGroup(); const toolId = randomUUID(), barrier = `current-step-${randomUUID()}`, text = `current-${randomUUID()}`;
      const beforeTurns = qa.agent.snapshot().turns.length;
      qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'current step allowed' }, barrier: { phase: 'before-response', name: barrier } });
      qa.agent.enqueueTurns(tool(toolId, 'send_message', { text, idempotency_key: randomUUID() }));
      const id = await trigger(qa, group, ms);
      try {
        const hit = await qa.agent.barriers.waitFor(barrier, ms);
        const before = await qa.api.group(group.id);
        await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
        const disabled = await qa.api.group(group.id); assert.equal(disabled.agentEnabled, false);
        qa.agent.barriers.release(barrier);
        const run = await finished(qa, id, ms);
        assert.equal(run.status, 'cancelled'); assert.equal(run.endReason, 'cancelled');
        assert.equal(step(run, toolId).isError, false); assert.equal(requests(qa, group, 'send').length, 1);
        assert.equal(qa.agent.snapshot().turns.length - beforeTurns, 1);
        const after = await qa.api.group(group.id); assert.equal(after.activeAgentRunId, null);
        return { hit, before, disabled, run, after, sendCount: 1, turnCount: 1 };
      } finally { qa.agent.barriers.release(barrier); }
    });
    for (const wait of ['capacity', 'remote-response'] as const) await check('current-step-cancel-' + wait + '-and-profile', () => cancelAtKickWait(qa, wait));
  } else if (caseId === 'SR-BE-GRD-005') {
    for (const compete of [false, true]) {
      const label = compete ? 'same-key-crash-dual-instance' : 'same-key-crash-single-instance';
      await check(label, () => isolatedBackendVariant(qa, label, child => sentKeyCrashRecovery(child, compete)));
    }
  } else if (caseId === 'SR-BE-POL-005' || caseId === 'SR-BE-DIA-004') {
    for (const effect of [false, true]) {
      const label = effect ? 'dispatched-effect-unknown-restart' : 'dispatched-no-effect-unknown-restart';
      let observed: Awaited<ReturnType<typeof dispatchedUnknownKick>> | undefined;
      await check(label, async () => {
        const evidence = await isolatedBackendVariant(qa, label, child => dispatchedUnknownKick(child, effect, true, caseId === 'SR-BE-POL-005'));
        observed = evidence.facts; return evidence;
      });
      await check(label + '-original-budget-and-completion', async () => {
        if (!observed) throw new BlockedError('Required original-run observation unavailable; no completion inferred from absent requests');
        assertUnknownKickCompletion(observed);
        return { run: observed.run, after: observed.after, activity: observed.activity, settlement: observed.settlement };
      });
      if (caseId === 'SR-BE-DIA-004') await check(label + '-next-step-semantic-review', async () => {
        if (!observed) throw new BlockedError('Actual unknown and diagnostic text not captured; semantic review cannot use a hypothetical message');
        return { reviews: reviewUnknownNextSteps(observed.diagnostics), recoveryNote: observed.rawRecoveryNote, completionAssumed: false };
      });
    }
    if (caseId === 'SR-BE-POL-005') missing('second-instance-unknown-competition', 'Real second instance and automation progress are collected for both effects; no same-run ownership attempt/refusal observation is delivered, so no-HTTP and successful ticks cannot establish lock competition.');
  } else if (caseId === 'SR-BE-GRD-007') {
    await check('actual-event-insert-fault-atomic-rollback-and-next-success', () => profileCancellationRollback(qa));
  } else if (caseId === 'SR-BE-GRD-008') {
    await check('stale-mixed-profile-cancel-transaction-has-no-effect', async () => {
      const { group } = await qa.api.createGroup(), toolId = randomUUID(), barrier = `cas-${randomUUID()}`;
      const oldName = 'original name', winner = 'concurrent winner', text = `cas-current-${randomUUID()}`;
      await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: oldName }));
      qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'current step' }, barrier: { phase: 'before-response', name: barrier } });
      qa.agent.enqueueTurns(tool(toolId, 'send_message', { text, idempotency_key: randomUUID() }));
      const runId = await trigger(qa, group, ms);
      try {
        const hit = await qa.agent.barriers.waitFor(barrier, ms);
        await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: winner, expected: { name: oldName } }));
        const denied = await qa.api.patch(`/api/groups/${group.id}`, { name: 'must not save', expected: { name: oldName }, agentEnabled: false });
        assert.equal(denied.status, 409); assert.equal(record(record(denied.body).error).code, 'GROUP_PROFILE_CONFLICT');
        const protectedGroup = record(await qa.api.group(group.id)); assert.equal(protectedGroup.name, winner); assert.equal(protectedGroup.agentEnabled, true);
        assert.equal((await qa.api.agentRun(runId)).status, 'running');
        qa.agent.barriers.release(barrier); const run = await finished(qa, runId, ms);
        assert.equal(run.status, 'finished', 'failed CAS must not leave a hidden cancellation request');
        assert.equal(step(run, toolId).isError, false); assert.equal(requests(qa, group, 'send').length, 1);
        return { hit, denied, protectedGroup, run, sendCount: 1 };
      } finally { qa.agent.barriers.release(barrier); }
    });
    await check('simultaneous-CAS-with-real-lock-barrier', () => concurrentProfileCas(qa));
    await check('stale-worker-permission-change', () => deferredPermissionChange(qa));
  } else missing('driver-unbound', 'This ID has no actual independent operation driver in backend-flows; use the assigned delivery/DB/C2/fixture owner.');
  // A missing subvariant is never silently skipped or converted to success.
  const variants: VariantResult[] = subchecks.map((s) => ({ id: s.id, status: s.status, reason: s.reason, evidence: s.evidence ? [s.evidence] : [] }));
  const status = combineVariants(variants, uncoveredVariants);
  return { caseId, status, variants, partial: status !== 'PASS' && subchecks.some((s) => s.status === 'PASS'), subchecks, uncoveredVariants };
}
async function externalKick(qa: QaEnvironment, ms: number) {
  const { group } = await qa.api.createGroup(); const target = `external-${randomUUID()}`, toolId = randomUUID(), reason = 'qualified external target';
  await setExternal(qa, group, target, ms);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  const auditStart = qa.agent.snapshot().audits.length;
  qa.agent.enqueueAudits({ body: { verdict: 'pass', reason: 'permitted' } });
  qa.agent.enqueueTurns(tool(toolId, 'kick_user', { platform_user_id: target, reason }));
  const run = await finished(qa, await trigger(qa, group, ms), ms);
  assert.equal(step(run, toolId).isError, false); assert.equal(requests(qa, group, 'kick').length, 1);
  assert.equal(qa.agent.snapshot().audits.length - auditStart, 1);
  assert.deepEqual(qa.agent.snapshot().audits.at(-1)!.body, { text: JSON.stringify({ action: 'kick', platform_user_id: target, reason }), groupId: group.id });
  assert.ok(!remoteMembers(qa, group).some((m) => m.platformUserId === target));
  const qualifiedIds = group.members.filter((m) => m.role !== 'member').map((m) => m.accountId);
  assert.ok(qualifiedIds.includes(String(record(requests(qa, group, 'kick')[0]!.body).byAccountId)));
  return { run, auditCount: 1, kickCount: 1, remoteMembers: remoteMembers(qa, group) };
}
async function auditVariant(qa: QaEnvironment, name: 'send_message' | 'kick_user', variant: 'pass' | 'fail' | 'invalid-verdict' | 'invalid-json' | 'http-500' | 'timeout', ms: number) {
  const { group } = await qa.api.createGroup(); const toolId = randomUUID(), text = `audit-${randomUUID()}`, target = `external-${randomUUID()}`;
  if (name === 'kick_user') { await setExternal(qa, group, target, ms); await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true })); }
  const plans: Record<typeof variant, AgentResponsePlan> = {
    pass: { body: { verdict: 'pass', reason: 'positive control' } }, fail: { body: { verdict: 'fail', reason: 'deliberately rejected' } },
    'invalid-verdict': { body: { verdict: 'unknown' } }, 'invalid-json': { rawBody: 'invalid json' },
    'http-500': { status: 500, body: { code: 'UPSTREAM_FAILED' } }, timeout: { neverRespond: true },
  };
  const count = variant === 'pass' || variant === 'fail' ? 1 : 3, auditStart = qa.agent.snapshot().audits.length;
  qa.agent.enqueueAudits(...Array.from({ length: count }, () => plans[variant]));
  qa.agent.enqueueTurns(tool(toolId, name, name === 'send_message' ? { text, idempotency_key: randomUUID() } : { platform_user_id: target, reason: text }));
  const stream = await observeBackendEvents(qa);
  try {
  const run = await finished(qa, await trigger(qa, group, ms), ms);
  const audits = qa.agent.snapshot().audits.slice(auditStart);
  assert.equal(audits.length, count);
  if (variant === 'pass') { assert.equal(step(run, toolId).isError, false); assert.equal(requests(qa, group, 'send').length, 1); }
  else {
    assert.equal(requests(qa, group, 'send').length, 0); assert.equal(requests(qa, group, 'kick').length, 0);
    if (variant === 'fail') checkError(run, toolId, 'AUDIT_REJECTED');
    else {
      assert.equal(run.status, 'blocked'); assert.equal(run.endReason, 'audit_blocked');
      const notification = await stream.waitFor((e) => e.type === 'agent_run' && e.payload?.runId === run.id && e.payload?.groupId === group.id && e.payload?.status === 'blocked');
      assert.equal(notification.payload?.endReason, 'audit_blocked');
    }
    if (name === 'kick_user') assert.ok(remoteMembers(qa, group).some((m) => m.platformUserId === target));
    else assert.equal(qa.gateway.snapshot().messages.filter((m) => m.groupId === group.gatewayGroupId && m.text === text).length, 0);
  }
  return { variant, run, audits, notifications: stream.events, sendCount: requests(qa, group, 'send').length, kickCount: requests(qa, group, 'kick').length };
  } finally { stream.close(); }
}
