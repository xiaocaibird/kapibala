import { test, expect } from '../fixtures.js';
import {
  eventually,
  type Account,
  type AgentRun,
  type SequenceRun,
  type ApiError,
  type Group,
} from '../../harness/platform-client.js';
import { assertContract, assertGroupMemberIdentities } from '../../contracts/public-api.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';
const requireSeeds = (accounts: Account[], count = 2): void => {
  if (accounts.length < count)
    throw new BlockedError(`This scenario requires ${count} isolated service account seeds`);
};

test('[GROUP-001] creation validates members and online status before external effects', async ({
  qa,
}) => {
  await qa.api.login();
  const accounts = await qa.api.accounts();
  requireSeeds(accounts);
  const invalid = [
    { creatorAccountId: accounts[0]!.id, memberAccountIds: [] },
    { creatorAccountId: accounts[0]!.id, memberAccountIds: [accounts[0]!.id] },
  ];
  for (const body of invalid) {
    const result = await qa.api.post<ApiError>('/api/groups', body);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  }
  const offline = await qa.api.post<ApiError>('/api/groups', {
    creatorAccountId: accounts[0]!.id,
    memberAccountIds: [accounts[1]!.id],
  });
  expect(offline.status).toBe(422);
  expect(offline.body.error.code).toBe('ACCOUNT_NOT_ONLINE');
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path === '/groups'),
  ).toHaveLength(0);
});

test('[GROUP-002] asynchronous creation materializes creator and event-confirmed roles', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts, jobId } = await qa.api.createGroup();
  expect(group.status).toBe('active');
  assertGroupMemberIdentities(group, await qa.api.accounts());
  expect(group.agentEnabled).toBe(false);
  expect(group.autoKickEnabled).toBe(false);
  expect(group.activeAgentRunId).toBeNull();
  expect(group.activeSequenceRunId).toBeNull();
  expect(group.members.find((member) => member.accountId === accounts[0]!.id)?.role).toBe(
    'creator',
  );
  expect(group.members.find((member) => member.accountId === accounts[1]!.id)?.role).toBe('admin');
  expect(group.members.find((member) => member.accountId === accounts[2]!.id)?.role).toBe('member');
  const ledger = qa.gateway.snapshot();
  expect(
    ledger.events.some(
      (event) =>
        event.type === 'member_joined' && event.data.platformUserId === accounts[0]!.platformUserId,
    ),
  ).toBe(false);
  expect(
    ledger.requests.filter((request) => request.path === `/groups/${group.gatewayGroupId}/promote`)
      .length,
  ).toBeLessThanOrEqual(2);
  expect((await qa.api.waitJob(jobId)).errors).toEqual([]);
  await qa.evidence('created-group-and-ledger', { group, ledger });
});

test('[GROUP-003] accepted join without member_joined fails after ten seconds', async ({ qa }) => {
  test.setTimeout(40_000);
  await qa.api.login();
  const accounts = await qa.api.connectAll();
  requireSeeds(accounts);
  qa.gateway.configure({ joinNeverCompletes: true });
  const start = performance.now();
  const { jobId } = await qa.api.require(
    qa.api.post<{ jobId: string }>('/api/groups', {
      creatorAccountId: accounts[0]!.id,
      memberAccountIds: [accounts[1]!.id],
    }),
    202,
  );
  const job = await qa.api.waitJob(jobId);
  expect(job.status).toBe('failed');
  expect(performance.now() - start).toBeGreaterThanOrEqual(10_000);
  expect(job.errors).toContainEqual({ step: `join:${accounts[1]!.id}`, code: 'JOIN_TIMEOUT' });
  const groups = await qa.api.require(qa.api.get<Group[]>('/api/groups'));
  expect(
    groups.flatMap((group) => group.members).some((member) => member.accountId === accounts[1]!.id),
  ).toBe(false);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/promote')),
  ).toHaveLength(0);
});

test('[GROUP-004] invite readiness is respected without retry resetting the wait', async ({
  qa,
}) => {
  await qa.api.login();
  qa.gateway.configure({ inviteReadyAfterMs: 1_500 });
  const { group } = await qa.api.createGroup();
  const requests = qa.gateway.snapshot().requests;
  const invite = requests.find(
    (request) => request.path === `/groups/${group.gatewayGroupId}/invite`,
  )!;
  const successfulJoins = requests.filter(
    (request) => request.path.endsWith('/join') && request.responseStatus === 202,
  );
  expect(successfulJoins.length).toBeGreaterThan(0);
  for (const join of successfulJoins)
    expect(Date.parse(join.at) - Date.parse(invite.at)).toBeGreaterThanOrEqual(1_500);
});

test('[GROUP-005] expired invitation is refreshed once and joining succeeds', async ({ qa }) => {
  await qa.api.login();
  const accounts = await qa.api.connectAll();
  requireSeeds(accounts);
  qa.gateway.enqueue('/groups', { barrier: { phase: 'before-response', name: 'group-created' } });
  const pending = qa.api.post<{ jobId: string }>('/api/groups', {
    creatorAccountId: accounts[0]!.id,
    memberAccountIds: [accounts[1]!.id],
  });
  await qa.gateway.barriers.waitFor('group-created');
  const gatewayGroup = qa.gateway.snapshot().groups[0]!;
  qa.gateway.enqueue(`/groups/${gatewayGroup.groupId}/join`, {
    status: 410,
    code: 'INVITE_EXPIRED',
    effect: 'none',
  });
  qa.gateway.barriers.release('group-created');
  const response = await pending;
  expect(response.status).toBe(202);
  expect((await qa.api.waitJob(response.body.jobId)).status).toBe('finished');
  expect(
    qa.gateway
      .snapshot()
      .requests.filter((request) => request.path === `/groups/${gatewayGroup.groupId}/invite`),
  ).toHaveLength(2);
  expect((await qa.api.accounts()).every((account) => account.status === 'online')).toBe(true);
});

test('[GROUP-006] leave-all removes service accounts with creator strictly last', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const { jobId } = await qa.api.require(
    qa.api.post<{ jobId: string }>(`/api/groups/${group.id}/leave-all`),
    202,
  );
  expect((await qa.api.waitJob(jobId)).status).toBe('finished');
  const leaves = qa.gateway
    .snapshot()
    .requests.filter((request) => request.path === `/groups/${group.gatewayGroupId}/leave`);
  expect(leaves.map((request) => (request.body as { accountId: string }).accountId).sort()).toEqual(
    accounts.map((account) => account.id).sort(),
  );
  expect((leaves.at(-1)!.body as { accountId: string }).accountId).toBe(group.creatorAccountId);
  const updated = await qa.api.group(group.id);
  expect(updated.status).toBe('left');
  // This fixture has no external users; D042 therefore still yields an empty list.
  expect(updated.members).toEqual([]);
  const serviceIds = accounts.map((account) => account.platformUserId);
  expect(
    qa.gateway
      .snapshot()
      .groups[0]!.members.filter((member) => serviceIds.includes(member.platformUserId)),
  ).toEqual([]);
});

test('[GROUP-007] failed noncreator leave preserves owner and continues remaining accounts', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/leave`, {
    status: 500,
    code: 'INTERNAL_ERROR',
    effect: 'none',
  });
  const { jobId } = await qa.api.require(
    qa.api.post<{ jobId: string }>(`/api/groups/${group.id}/leave-all`),
    202,
  );
  const job = await qa.api.waitJob(jobId);
  expect(job.status).toBe('failed');
  expect(job.errors.length).toBeGreaterThan(0);
  const leaves = qa.gateway
    .snapshot()
    .requests.filter((request) => request.path.endsWith('/leave'));
  expect(leaves).toHaveLength(accounts.length - 1);
  expect(
    leaves.some(
      (request) => (request.body as { accountId: string }).accountId === group.creatorAccountId,
    ),
  ).toBe(false);
  const failedId = (
    leaves.find((request) => request.responseStatus === 500)!.body as { accountId: string }
  ).accountId;
  expect(job.errors.some((error) => error.step === `leave:${failedId}`)).toBe(true);
  const local = await qa.api.group(group.id);
  const remote = qa.gateway.snapshot().groups[0]!;
  expect(local.members.some((member) => member.accountId === failedId)).toBe(true);
  expect(local.members.map((member) => member.platformUserId).sort()).toEqual(
    remote.members
      .filter((member) =>
        accounts.some((account) => account.platformUserId === member.platformUserId),
      )
      .map((member) => member.platformUserId)
      .sort(),
  );
});

test('[GROUP-008] member rows wait for actual joined event before promotion', async ({ qa }) => {
  await qa.api.login();
  const accounts = await qa.api.connectAll();
  requireSeeds(accounts);
  qa.gateway.configure({ joinDelayMs: 1_500 });
  const { jobId } = await qa.api.require(
    qa.api.post<{ jobId: string }>('/api/groups', {
      creatorAccountId: accounts[0]!.id,
      memberAccountIds: [accounts[1]!.id],
    }),
    202,
  );
  await qa.gateway.waitForRequest((request) => request.path.endsWith('/join'));
  const pending = await eventually(
    () => qa.api.require(qa.api.get<Group[]>('/api/groups')),
    (groups) => groups.length === 1,
  );
  expect(pending[0]!.members.map((member) => member.accountId)).toEqual([accounts[0]!.id]);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/promote')),
  ).toHaveLength(0);
  expect((await qa.api.waitJob(jobId)).status).toBe('finished');
});

test('[GROUP-009] ALREADY_MEMBER confirms existing membership without waiting for another event', async ({
  qa,
}) => {
  await qa.api.login();
  const accounts = await qa.api.connectAll();
  requireSeeds(accounts);
  qa.gateway.enqueue('/groups', {
    barrier: { phase: 'before-response', name: 'preexisting-group' },
  });
  const pending = qa.api.post<{ jobId: string }>('/api/groups', {
    creatorAccountId: accounts[0]!.id,
    memberAccountIds: [accounts[1]!.id],
  });
  await qa.gateway.barriers.waitFor('preexisting-group');
  const remote = qa.gateway.snapshot().groups[0]!;
  qa.gateway.setMembership(remote.groupId, accounts[1]!.platformUserId!, true, { storeOnly: true });
  qa.gateway.barriers.release('preexisting-group');
  const response = await pending;
  expect(response.status).toBe(202);
  expect((await qa.api.waitJob(response.body.jobId)).status).toBe('finished');
  const joins = qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/join'));
  expect(joins).toHaveLength(1);
  expect(joins[0]!.responseStatus).toBe(409);
  const groups = await qa.api.require(qa.api.get<Group[]>('/api/groups'));
  expect(groups[0]!.members.find((member) => member.accountId === accounts[1]!.id)?.role).toBe(
    'admin',
  );
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/promote')).length,
  ).toBeLessThanOrEqual(2);
});

test('[GROUP-010] leave-all preserves public external members and keeps left groups inactive', async ({
  qa,
}) => {
  test.setTimeout(90_000);
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const allAccounts = await qa.api.accounts();
  const externalIds = ['external-stays-1', 'external-stays-2'];
  for (const id of externalIds) qa.gateway.setMembership(group.gatewayGroupId, id, true);
  await eventually(
    () => qa.api.group(group.id),
    (value) =>
      externalIds.every((id) => value.members.some((member) => member.platformUserId === id)),
  );
  const sequence = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'left-does-not-resume',
      steps: [
        { index: 1, text: 'must-not-send-after-left', accountRole: 'admin', delaySeconds: 3600 },
      ],
    }),
  );
  const start = await qa.api.require(
    qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: sequence.id,
      vars: {},
      stepVars: {},
    }),
    201,
  );
  qa.agent.enqueueTurns(
    {
      body: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'left-current',
            name: 'get_recent_messages',
            input: { limit: 1 },
          },
        ],
      },
      barrier: { phase: 'before-response', name: 'left-current-turn' },
    },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'must-not-request' }] } },
  );
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: externalIds[0]!,
    text: 'before-leave-trigger',
  });
  try {
    await qa.agent.barriers.waitFor('left-current-turn');
    const heldAt = performance.now();
    const before = await qa.api.require(
      qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`),
    );
    expect(before).toHaveLength(1);
    expect(before[0]!.status).toBe('running');
    const { jobId } = await qa.api.require(
      qa.api.post<{ jobId: string }>(`/api/groups/${group.id}/leave-all`),
      202,
    );
    expect((await qa.api.waitJob(jobId)).status).toBe('finished');
    qa.agent.barriers.release('left-current-turn');
    const heldMs = performance.now() - heldAt;
    if (heldMs >= 9_000) {
      await qa.evidence('left-current-turn-prerequisite', { heldMs });
      throw new BlockedError(
        'Current turn barrier approached the minimum 10s timeout; cannot distinguish leave cancellation from turn timeout in this run',
      );
    }

    const read = async () => ({
      group: await qa.api.group(group.id),
      directory: await qa.api.require(qa.api.get<Group[]>('/api/groups')),
      sequence: await qa.api.require(qa.api.get<SequenceRun>(`/api/sequence-runs/${start.runId}`)),
      runs: await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
      gateway: qa.gateway.snapshot(),
      agent: qa.agent.snapshot(),
    });
    const invariant = (value: Awaited<ReturnType<typeof read>>) => {
      const directoryGroup = value.directory.find((entry) => entry.id === group.id);
      expect(directoryGroup).toBeDefined();
      for (const exposed of [value.group, directoryGroup!]) {
        assertContract('group', exposed);
        assertGroupMemberIdentities(exposed, allAccounts);
        expect(exposed.status).toBe('left');
        expect(exposed.members.map((member) => member.platformUserId).sort()).toEqual(externalIds);
        expect(
          exposed.members.filter((member) =>
            accounts.some(
              (account) =>
                account.id === member.accountId || account.platformUserId === member.platformUserId,
            ),
          ),
        ).toEqual([]);
      }
      const remote = value.gateway.groups.find((entry) => entry.groupId === group.gatewayGroupId)!;
      expect(remote.members.map((member) => member.platformUserId).sort()).toEqual(externalIds);
      expect(
        value.gateway.requests.filter(
          (request) =>
            request.path === `/groups/${group.gatewayGroupId}/kick` ||
            request.path === `/groups/${group.gatewayGroupId}/send`,
        ),
      ).toHaveLength(0);
      expect(
        value.gateway.messages.filter(
          (message) => message.groupId === group.gatewayGroupId && message.accountId !== null,
        ),
      ).toHaveLength(0);
      const leaves = value.gateway.requests.filter(
        (request) => request.path === `/groups/${group.gatewayGroupId}/leave`,
      );
      expect(
        leaves.map((request) => (request.body as { accountId: string }).accountId).sort(),
      ).toEqual(accounts.map((account) => account.id).sort());
      expect((leaves.at(-1)!.body as { accountId: string }).accountId).toBe(group.creatorAccountId);
      expect(value.agent.turns).toHaveLength(1);
      expect(value.runs.map((run) => run.id)).toEqual([before[0]!.id]);
      expect(
        value.sequence.steps.some((step) => step.status === 'sent' || step.status === 'accepted'),
      ).toBe(false);
    };
    const stopped = await observe({
      read,
      invariant,
      complete: (value) =>
        value.group.activeSequenceRunId === null &&
        value.group.activeAgentRunId === null &&
        value.sequence.status !== 'running' &&
        value.runs.every((run) => run.status !== 'running'),
      durationMs: 15_000,
    });
    await qa.evidence('left-members-and-automation-terminal', stopped);
    if (!stopped.complete)
      throw new BlockedError(
        'D042 terminal observation incomplete within the QA sampling budget; no product stop SLA is invented',
      );

    for (const phase of ['before-restart', 'after-restart']) {
      if (phase === 'after-restart') {
        await qa.restart();
        await qa.api.login();
      }
      for (const [path, body] of [
        [
          `/api/groups/${group.id}/send`,
          { accountId: accounts[0]!.id, text: 'left-manual-send-forbidden' },
        ],
        [
          `/api/groups/${group.id}/sequence-runs`,
          { sequenceId: sequence.id, vars: {}, stepVars: {} },
        ],
      ] as const) {
        const rejected = await qa.api.post<ApiError>(path, body);
        expect(rejected.status).toBeGreaterThanOrEqual(400);
        expect(rejected.status).toBeLessThan(500);
        assertContract('error', rejected.body);
      }
      qa.gateway.emitMessage({
        groupId: group.gatewayGroupId,
        senderPlatformUserId: externalIds[1]!,
        text: `after-left-${phase}`,
      });
      const quiet = await observe({
        read,
        invariant: (value) => {
          invariant(value);
          expect(value.group.activeAgentRunId).toBeNull();
          expect(value.group.activeSequenceRunId).toBeNull();
          expect(value.sequence.status).not.toBe('running');
          expect(value.runs.every((run) => run.status !== 'running')).toBe(true);
        },
        complete: () => false,
        durationMs: 1_500,
      });
      await qa.evidence(`left-remains-inactive-${phase}`, quiet);
    }
  } finally {
    qa.agent.barriers.release('left-current-turn');
  }
});
