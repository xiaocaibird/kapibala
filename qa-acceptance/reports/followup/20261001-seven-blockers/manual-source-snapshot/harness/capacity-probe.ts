import type { AgentRequest } from './agent.js';
import type { QaEnvironment } from './environment.js';
import { eventually, type AgentRun, type Group } from './platform-client.js';

/** Public operations only. An audit/gateway barrier is NOT admission-refusal evidence. */
export interface PreparedKick {
  group: Group;
  runId: string;
  toolUseId: string;
  target: string;
  reason: string;
  auditBarrier: string;
}

export function kickRequests(qa: QaEnvironment, group: Group) {
  return qa.gateway
    .snapshot()
    .requests.filter(
      (request) =>
        request.method === 'POST' && request.path === `/groups/${group.gatewayGroupId}/kick`,
    );
}
export function auditRequests(qa: QaEnvironment, group: Group): AgentRequest[] {
  return qa.agent
    .snapshot()
    .audits.filter((request) => (request.body as { groupId?: string }).groupId === group.id);
}
export function targetIsPresent(qa: QaEnvironment, kick: PreparedKick): boolean {
  const group = qa.gateway
    .snapshot()
    .groups.find((value) => value.groupId === kick.group.gatewayGroupId);
  if (!group) throw new Error('QA gateway group is missing');
  return group.members.some((member) => member.platformUserId === kick.target);
}

export async function prepareKickAtAudit(
  qa: QaEnvironment,
  group: Group,
  label: string,
): Promise<PreparedKick> {
  const toolUseId = `qa-kick-${label}`;
  const target = 'qa-shared-external-target';
  const reason = `QA boundary ${label}`;
  const auditBarrier = `qa-audit-${label}`;
  qa.gateway.setMembership(group.gatewayGroupId, target, true);
  await qa.api.require(
    qa.api.patch(`/api/groups/${group.id}`, {
      agentEnabled: true,
      autoKickEnabled: true,
    }),
  );
  qa.agent.enqueueTurns({
    body: {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'kick_user',
          input: { platform_user_id: target, reason },
        },
      ],
    },
  });
  qa.agent.enqueueAudits({
    body: { verdict: 'pass', reason: 'QA pass' },
    barrier: { phase: 'before-response', name: auditBarrier },
  });
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'qa-trigger-user',
    text: `start ${label}`,
  });
  await qa.agent.barriers.waitFor(auditBarrier);
  const runs = await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`));
  if (runs.length !== 1 || !runs[0]?.id) throw new Error('Fresh group must expose exactly one run');
  const runId = runs[0].id;
  // Scope the next response to this run; a concurrent group's first turn cannot consume it.
  qa.agent.enqueueTurns({
    runId,
    body: { stop_reason: 'end_turn', content: [{ type: 'text', text: `finished ${label}` }] },
  });
  return { group, runId, toolUseId, target, reason, auditBarrier };
}

export const finishKickRun = (qa: QaEnvironment, kick: PreparedKick) =>
  qa.api.waitFor<AgentRun>(`/api/agent-runs/${kick.runId}`, (run) => run.status !== 'running');

export async function disconnectAccount(qa: QaEnvironment, accountId: string): Promise<void> {
  await qa.api.require(
    qa.api.post(`/api/accounts/${accountId}/transition`, {
      expectedFrom: 'online',
      to: 'disconnected',
    }),
    200,
  );
  await eventually(
    () => qa.api.accounts(),
    (accounts) =>
      accounts.some((account) => account.id === accountId && account.status === 'disconnected'),
  );
}

export async function captureKickEvidence(
  qa: QaEnvironment,
  name: string,
  kicks: PreparedKick[],
): Promise<void> {
  await qa.evidence(name, {
    at: new Date().toISOString(),
    coverageBoundary:
      'This snapshot records public facts only; proof of capacity refusal requires separately associated controller events. No entity-lock contention is established here.',
    kicks,
    runs: await Promise.all(kicks.map((kick) => qa.api.agentRun(kick.runId))),
    gateway: qa.gateway.snapshot(),
    agent: qa.agent.snapshot(),
  });
}
