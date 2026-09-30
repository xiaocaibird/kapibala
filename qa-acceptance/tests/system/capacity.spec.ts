import { requireServiceAccountId } from '../../contracts/public-api.js';
import { test, expect } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import { eventually, type AgentRun } from '../../harness/platform-client.js';
import type { QaEnvironment } from '../../harness/environment.js';
import {
  auditRequests,
  captureKickEvidence,
  disconnectAccount,
  finishKickRun,
  kickRequests,
  prepareKickAtAudit,
  targetIsPresent,
  type PreparedKick,
} from '../../harness/capacity-probe.js';

// These public boundary regressions intentionally do not claim admission exhaustion.
// The required capacity cases remain BLOCKED in cases/architecture-capacity.json.
function assertAudit(qa: QaEnvironment, kick: PreparedKick): void {
  const audits = auditRequests(qa, kick.group);
  expect(audits).toHaveLength(1);
  expect(audits[0]!.body).toEqual({
    text: JSON.stringify({ action: 'kick', platform_user_id: kick.target, reason: kick.reason }),
    groupId: kick.group.id,
  });
}
function assertFinalStep(
  qa: QaEnvironment,
  kick: PreparedKick,
  run: AgentRun,
  errorCode: string | null,
): void {
  expect(run.id).toBe(kick.runId);
  expect(run.status).toBe('finished');
  expect(run.endReason).toBe('final');
  const steps = run.steps.filter((step) => step.toolUseId === kick.toolUseId);
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({ name: 'kick_user', isError: errorCode !== null, errorCode });
  expect(steps[0]!.auditVerdict).toBe('pass');
  assertAudit(qa, kick);
  const turns = qa.agent
    .snapshot()
    .turns.filter((request) => (request.body as { runId?: string }).runId === kick.runId);
  expect(turns).toHaveLength(2);
}

function assertNoKick(qa: QaEnvironment, kick: PreparedKick): void {
  expect(kickRequests(qa, kick.group)).toHaveLength(0);
  expect(targetIsPresent(qa, kick)).toBe(true);
  expect(
    qa.gateway
      .snapshot()
      .effects.filter(
        (effect) => effect.kind === 'kick' && effect.groupId === kick.group.gatewayGroupId,
      ),
  ).toHaveLength(0);
}

async function assertDenied(qa: QaEnvironment, kick: PreparedKick, code: string): Promise<void> {
  assertNoKick(qa, kick);
  assertAudit(qa, kick);
  qa.agent.barriers.release(kick.auditBarrier);
  const run = await finishKickRun(qa, kick);
  assertFinalStep(qa, kick, run, code);
  assertNoKick(qa, kick);
  expect((await qa.api.group(kick.group.id)).activeAgentRunId).toBeNull();
  await captureKickEvidence(qa, 'public-kick-boundary-final', [kick]);
}

test('[CAP-REG-001] independent groups preserve one audit and one kick per run during overlapping requests', async ({
  qa,
}) => {
  await qa.api.login();
  const groups = [(await qa.api.createGroup()).group, (await qa.api.createGroup()).group];
  const kicks: PreparedKick[] = [];
  const gateNames = ['qa-kick-overlap-a', 'qa-kick-overlap-b'];
  try {
    for (let index = 0; index < groups.length; index++) {
      const kick = await prepareKickAtAudit(qa, groups[index]!, `overlap-${index}`);
      kicks.push(kick);
      assertNoKick(qa, kick);
      assertAudit(qa, kick);
      qa.gateway.enqueue(`/groups/${kick.group.gatewayGroupId}/kick`, {
        barrier: { phase: 'request', name: gateNames[index]! },
      });
    }
    await captureKickEvidence(qa, 'parallel-before-audit-release', kicks);
    for (const kick of kicks) qa.agent.barriers.release(kick.auditBarrier);
    let hits;
    try {
      // Fixture deadline, not a product latency target. Unproven overlap is BLOCKED
      // only if public evidence has not already established a product violation.
      hits = await Promise.all(gateNames.map((name) => qa.gateway.barriers.waitFor(name, 2_500)));
    } catch (error) {
      // Release before REST evidence collection so a slow diagnostic read cannot
      // extend the test's gateway stall and create an artificial send timeout.
      for (const name of gateNames) qa.gateway.barriers.release(name);
      await captureKickEvidence(qa, 'parallel-overlap-unestablished', kicks);
      for (const kick of kicks) {
        const run = await qa.api.agentRun(kick.runId);
        const steps = run.steps.filter((step) => step.toolUseId === kick.toolUseId);
        expect(
          steps.some((step) => step.isError),
          '合法 kick 不得被错误终结',
        ).toBe(false);
        if (run.status !== 'running') {
          assertFinalStep(qa, kick, run, null);
          expect(kickRequests(qa, kick.group)).toHaveLength(1);
          expect(targetIsPresent(qa, kick)).toBe(false);
        }
      }
      throw new BlockedError(
        `Could not establish two overlapping public kick requests: ${String(error)}`,
      );
    } finally {
      for (const name of gateNames) qa.gateway.barriers.release(name);
    }
    await qa.evidence('parallel-overlap', {
      hits,
      releasedAt: new Date().toISOString(),
      note: 'Two different groups use the same external target identity; this is neither local-capacity refusal nor same-entity lock contention.',
    });
    const runs = await Promise.all(kicks.map((kick) => finishKickRun(qa, kick)));
    for (let index = 0; index < kicks.length; index++) {
      const kick = kicks[index]!;
      assertFinalStep(qa, kick, runs[index]!, null);
      const calls = kickRequests(qa, kick.group);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.responseStatus).toBe(200);
      expect(targetIsPresent(qa, kick)).toBe(false);
      expect(
        kick.group.members
          .filter((member) => member.role === 'creator' || member.role === 'admin')
          .map((member) => member.accountId),
      ).toContain((calls[0]!.body as { byAccountId: string }).byAccountId);
      expect(
        qa.gateway
          .snapshot()
          .effects.filter(
            (effect) =>
              effect.kind === 'kick' &&
              effect.groupId === kick.group.gatewayGroupId &&
              effect.platformUserId === kick.target,
          ),
      ).toHaveLength(1);
      expect(
        await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${kick.group.id}/agent-runs`)),
      ).toHaveLength(1);
    }
    await captureKickEvidence(qa, 'parallel-kicks-final', kicks);
  } finally {
    for (const kick of kicks) qa.agent.barriers.release(kick.auditBarrier);
    for (const name of gateNames) qa.gateway.barriers.release(name);
  }
});

test('[CAP-REG-002] disabling kick policy while audit is pending prevents dispatch after audit passes', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const kick = await prepareKickAtAudit(qa, group, 'policy');
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: false }));
    expect((await qa.api.group(group.id)).autoKickEnabled).toBe(false);
    await captureKickEvidence(qa, 'policy-changed-before-audit-response', [kick]);
    await assertDenied(qa, kick, 'POLICY_DENIED');
  } finally {
    qa.agent.barriers.release(kick.auditBarrier);
  }
});

test('[CAP-REG-003] offline actors are rechecked after a pending audit instead of dispatching a stale choice', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const kick = await prepareKickAtAudit(qa, group, 'offline');
  try {
    for (const member of group.members)
      await disconnectAccount(qa, requireServiceAccountId(member));
    expect((await qa.api.group(group.id)).status).toBe('active');
    await captureKickEvidence(qa, 'actors-offline-before-audit-response', [kick]);
    await assertDenied(qa, kick, 'NO_AVAILABLE_ACCOUNT');
  } finally {
    qa.agent.barriers.release(kick.auditBarrier);
  }
});

test('[CAP-REG-004] an online removed administrator and an online ordinary member cannot substitute for an eligible actor', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup(2);
  const creator = group.members.find((member) => member.role === 'creator');
  const administrator = group.members.find((member) => member.role === 'admin');
  const ordinary = group.members.find((member) => member.role === 'member');
  expect(creator).toBeDefined();
  expect(administrator).toBeDefined();
  expect(ordinary).toBeDefined();
  const kick = await prepareKickAtAudit(qa, group, 'membership');
  try {
    await disconnectAccount(qa, requireServiceAccountId(creator!));
    qa.gateway.setMembership(group.gatewayGroupId, administrator!.platformUserId, false);
    const current = await eventually(
      () => qa.api.group(group.id),
      (value) => !value.members.some((member) => member.accountId === administrator!.accountId),
    );
    expect(current.status).toBe('active');
    const accounts = await qa.api.accounts();
    expect(accounts.find((account) => account.id === administrator!.accountId)!.status).toBe(
      'online',
    );
    expect(accounts.find((account) => account.id === ordinary!.accountId)!.status).toBe('online');
    expect(current.members.find((member) => member.accountId === ordinary!.accountId)!.role).toBe(
      'member',
    );
    await captureKickEvidence(qa, 'membership-changed-before-audit-response', [kick]);
    await assertDenied(qa, kick, 'NO_AVAILABLE_ACCOUNT');
  } finally {
    qa.agent.barriers.release(kick.auditBarrier);
  }
});
