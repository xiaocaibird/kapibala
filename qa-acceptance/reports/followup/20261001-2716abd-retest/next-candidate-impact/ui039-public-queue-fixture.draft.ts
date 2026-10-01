/** Preparation only, NOT RUN. Existing public protocols only; no SUT imports/SQL.
 * Supersedes the proposed need for a new pre-first-dispatch hook when this real
 * public workload actually supplies the required zero-step terminal states.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { QaEnvironment } from '../../../../harness/environment.js';
import type { AgentRun, Group } from '../../../../harness/platform-client.js';
import type { AgentRequest, AgentResponsePlan } from '../../../../harness/agent.js';
import { observe } from '../../../../harness/observation.js';
import { BlockedError } from '../../../../harness/security.js';

type Role = 'failed' | 'cancelled';
type BoundRun = { group: Group; runId: string };
type Read = { beforeMono: number; afterMono: number; value: AgentRun };
type Targets<T> = { failed: T; cancelled: T };
export const timing = { modelMs: 14_000, auditMs: 4_000, effectMs: 10_000, responseMs: 10_000,
  requiredModelTimeoutMs: '15000', diagnosticMs: 70_000 } as const;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const requestRunId = (request: AgentRequest) => String(object(request.body).runId ?? '');
function requestGroupId(request: AgentRequest): string | undefined {
  const messages = object(request.body).messages;
  if (!Array.isArray(messages)) return undefined;
  const content = object(messages[0]).content;
  if (!Array.isArray(content)) return undefined;
  try { return String(object(JSON.parse(String(object(content[0]).text))).groupId ?? ''); }
  catch { return undefined; }
}

export function firstHolderPlans(): AgentResponsePlan[] {
  return Array.from({ length: 4 }, () => ({ responseDelayMs: timing.modelMs,
    body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'holder-read',
      name: 'get_recent_messages', input: { limit: 10 } }] } }));
}
export function boundHolderPlans(runIds: string[], nonce: string): AgentResponsePlan[] {
  assert.equal(new Set(runIds).size, 4, 'Four distinct observed holder runs are required');
  assert.equal(runIds.length, 4);
  // TakePlan searches by actual runId. Different second/third arrival order cannot
  // accidentally consume another holder's plan or a target's scripted response.
  return runIds.flatMap((runId, index) => [
    { runId, responseDelayMs: timing.modelMs,
      body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'holder-send',
        name: 'send_message', input: { text: `holder-effect:${nonce}:${runId}`, idempotency_key: `h${index + 1}` } }] } },
    { runId, responseDelayMs: timing.modelMs,
      body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'holder-finish',
        name: 'finish', input: { summary: `holder-finished:${nonce}:${runId}` } }] } },
  ]);
}
export function fourInitialHolderRequests(holderRuns: BoundRun[], requests: AgentRequest[]): boolean {
  if (holderRuns.length !== 4 || new Set(holderRuns.map(r => r.runId)).size !== 4) return false;
  return holderRuns.every(holder => {
    const matching = requests.filter(r => requestRunId(r) === holder.runId);
    return matching.length === 1 && requestGroupId(matching[0]!) === holder.group.id
      && matching[0]!.completedAt === undefined && matching[0]!.responseStatus === undefined;
  });
}

export function classifyZeroStepTarget(role: Role, run: AgentRun, actualModelCalls: number,
  actualAuditCalls: number, actualSendOrKickCalls: number, actualOwnMessages: number) {
  // Known protocol/effect violations must survive a neighbouring missed premise.
  if (run.status === 'cancelled') assert.equal(run.endReason, 'cancelled');
  if (run.status === 'failed') assert.ok(['wall_clock', 'budget_exhausted', 'protocol_errors'].includes(run.endReason ?? ''));
  if (actualModelCalls === 0) {
    assert.equal(actualAuditCalls, 0, 'No actual target model dispatch can justify an audit');
    assert.equal(actualSendOrKickCalls, 0, 'No actual target model dispatch can justify a tool side effect');
    assert.equal(actualOwnMessages, 0, 'No actual target model dispatch can justify an own message');
  }
  const ready = run.status === role && run.endReason === (role === 'failed' ? 'wall_clock' : 'cancelled')
    && run.steps.length === 0 && actualModelCalls === 0;
  return { ready, role, actualStatus: run.status, actualEndReason: run.endReason,
    actualSteps: run.steps.length, actualModelCalls,
    reason: ready ? 'Real public terminal, empty steps and complete external ledger has zero target model calls'
      : 'Actual workload did not establish this requested zero-step terminal; this is not a status-copy PASS' };
}

/** The returned targets are separate UI prerequisites, not a whole-case PASS.
 * Call the existing public page assertions independently for every ready target;
 * preserve a proved UI FAIL; collect missing target states as BLOCKED afterwards.
 */
export async function preparePublicQueueZeroSteps(qa: QaEnvironment) {
  if (qa.config.sut.env.AGENT_TURN_TIMEOUT_MS !== timing.requiredModelTimeoutMs)
    throw new BlockedError('UI039 dedicated frozen target must explicitly set AGENT_TURN_TIMEOUT_MS=15000; do not reuse the 12000 target');
  await qa.api.login();
  const groups: Group[] = [];
  const snapshots: unknown[] = [];
  const nonce = randomUUID();
  let bound: { holders: BoundRun[]; targets: Targets<BoundRun> } | undefined;
  const targetEverDispatched = { failed: false, cancelled: false };
  const blocked: string[] = [];
  const readRun = async (runId: string): Promise<Read> => {
    const beforeMono = performance.now();
    const value = await qa.api.agentRun(runId);
    return { beforeMono, afterMono: performance.now(), value };
  };
  const createObservedRun = async (group: Group): Promise<BoundRun> => {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({ groupId: group.gatewayGroupId, senderPlatformUserId: `queue-probe-${nonce}`,
      text: `public-queue-fixture:${nonce}:${group.id}` });
    const seen = await observe({
      read: () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      invariant: items => assert.ok(items.length <= 1, 'Independent new group has at most one triggered run'),
      complete: items => items.length === 1, durationMs: 10_000,
    });
    if (!seen.complete) throw new BlockedError('Public run creation not observed within diagnostic budget');
    const actual = seen.last[0]!;
    assert.equal(actual.groupId, group.id);
    return { group, runId: actual.id };
  };
  try {
    // All six groups already exist, active and disabled, before any model delay
    // starts. Group construction time must not consume the 14s proof window.
    for (let i = 0; i < 6; i++) {
      const { group } = await qa.api.createGroup();
      assert.equal(group.status, 'active');
      assert.equal(group.agentEnabled, false);
      groups.push(group);
    }
    qa.agent.enqueueTurns(...firstHolderPlans());
    const holders: BoundRun[] = [];
    for (const group of groups.slice(0, 4)) holders.push(await createObservedRun(group));
    const firstProof = await observe({
      read: async () => ({ at: new Date().toISOString(), observedMono: performance.now(),
        runs: await Promise.all(holders.map(r => readRun(r.runId))), agent: qa.agent.snapshot() }),
      invariant: sample => {
        assert.equal(new Set(sample.runs.map(r => r.value.id)).size, 4);
        snapshots.push({ phase: 'four-holder-initial-requests', ...sample });
      }, complete: sample => sample.runs.every(r => r.value.status === 'running' && r.value.steps.length === 0)
        && fourInitialHolderRequests(holders, sample.agent.turns), durationMs: 8_000,
    });
    if (!firstProof.complete) throw new BlockedError('Four distinct actually pending first model requests not simultaneously proved; do not infer slots from the private implementation');
    await qa.evidence('ui039-public-queue-first-proof', { nonce, holders, firstProof });
    qa.agent.enqueueTurns(...boundHolderPlans(holders.map(h => h.runId), nonce));
    // Audit has groupId/text, no runId. Four identical delayed passes are safe to
    // enqueue globally; their actual groupId/text are checked from raw requests.
    qa.agent.enqueueAudits(...Array.from({ length: 4 }, () => ({ responseDelayMs: timing.auditMs,
      body: { verdict: 'pass', reason: 'public queue fixture holder only' } })));
    for (const holder of holders) qa.gateway.enqueue(`/groups/${holder.group.gatewayGroupId}/send`, {
      method: 'POST', effectDelayMs: timing.effectMs, responseDelayMs: timing.responseMs,
    });
    const failed = await createObservedRun(groups[4]!);
    const cancelled = await createObservedRun(groups[5]!);
    bound = { holders, targets: { failed, cancelled } };
    const sample = async () => {
      const reads = await Promise.all([failed, cancelled, ...holders].map(r => readRun(r.runId)));
      const agent = qa.agent.snapshot(), gateway = qa.gateway.snapshot();
      const mapped = { failed: reads[0]!, cancelled: reads[1]! };
      const targets = Object.fromEntries((['failed', 'cancelled'] as const).map(role => {
        const target = bound!.targets[role];
        const modelCalls = agent.turns.filter(r => requestRunId(r) === target.runId);
        targetEverDispatched[role] ||= modelCalls.length > 0;
        const audits = agent.audits.filter(r => object(r.body).groupId === target.group.id);
        const mutations = gateway.requests.filter(r => r.method === 'POST'
          && r.path.startsWith(`/groups/${target.group.gatewayGroupId}/`) && /\/(send|kick)$/.test(r.path));
        const own = gateway.messages.filter(m => m.groupId === target.group.gatewayGroupId && m.accountId !== null);
        const actual = mapped[role].value;
        assert.equal(actual.id, target.runId);
        assert.equal(actual.groupId, target.group.id);
        return [role, { read: mapped[role], modelRequestIds: modelCalls.map(r => r.id),
          classification: classifyZeroStepTarget(role, actual, modelCalls.length, audits.length, mutations.length, own.length) }];
      })) as Targets<{ read: Read; modelRequestIds: number[]; classification: ReturnType<typeof classifyZeroStepTarget> }>;
      const entry = { at: new Date().toISOString(), observedMono: performance.now(), targets,
        holderReads: reads.slice(2), holderModelCalls: holders.map(h => ({ runId: h.runId,
          requests: agent.turns.filter(r => requestRunId(r) === h.runId).map(r => ({ id: r.id, at: r.at, completedAt: r.completedAt, responseStatus: r.responseStatus })) })) };
      snapshots.push(entry);
      return entry;
    };
    const queueProof = await sample();
    await qa.evidence('ui039-public-queue-before-disable', queueProof);
    const waitingBeforeDisable = Object.fromEntries((['failed', 'cancelled'] as const).map(role =>
      [role, queueProof.targets[role].read.value.status === 'running'
        && queueProof.targets[role].read.value.steps.length === 0
        && queueProof.targets[role].modelRequestIds.length === 0])) as Targets<boolean>;
    const initialWaiting = waitingBeforeDisable.failed && waitingBeforeDisable.cancelled;
    // This is the actual public operation. No cancellation status is written by QA.
    await qa.api.require(qa.api.patch(`/api/groups/${cancelled.group.id}`, { agentEnabled: false }));
    const observed = await observe({ read: sample, invariant: () => {},
      complete: s => (['failed', 'cancelled'] as const).every(role => s.targets[role].read.value.status !== 'running'),
      durationMs: timing.diagnosticMs, intervalMs: 100 });
    const final = observed.last;
    const readyStates = { failed: false, cancelled: false };
    for (const role of ['failed', 'cancelled'] as const) {
      readyStates[role] = waitingBeforeDisable[role] && !targetEverDispatched[role]
        && final.targets[role].classification.ready;
      // The other target remaining running cannot suppress this target's real
      // ready state or its subsequent independent visible-copy assertion.
      if (!readyStates[role]) blocked.push(`${role}: ${waitingBeforeDisable[role]
        ? final.targets[role].classification.reason : 'Initial public running/steps=[]/zero-dispatch premise was not established'}`);
      if (final.targets[role].read.value.status !== 'running')
        assert.equal((await qa.api.group(bound.targets[role].group.id)).activeAgentRunId, null);
    }
    const agent = qa.agent.snapshot();
    for (const audit of agent.audits) {
      const holder = holders.find(h => h.group.id === object(audit.body).groupId);
      if (holder) assert.equal(object(audit.body).text, `holder-effect:${nonce}:${holder.runId}`);
    }
    await qa.evidence('ui039-public-queue-final', { nonce, timing, bound, initialWaiting, waitingBeforeDisable, readyStates,
      targetEverDispatched, blocked, observed, agent, gateway: qa.gateway.snapshot(),
      boundary: 'Public waiting state plus retained complete external request ledger; no public queue position/slot field is invented. 51s estimate is not an assertion.' });
    return { ...bound, final, readyStates, blocked, snapshots, initialWaiting, waitingBeforeDisable, targetEverDispatched };
  } finally {
    await qa.evidence('ui039-public-queue-samples', { nonce, bound, snapshots, blocked,
      gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot() });
    // No custom locks/controllers exist. Caller still owns the ordinary QaEnvironment
    // and must let its normal fixture close pending simulator tasks/SUT/DB/browser.
    // Do not release by killing foreign holders or mutate terminal rows.
  }
}
