import { test, expect } from '../fixtures.js';
import { assertContract, assertGroupMemberIdentities } from '../../contracts/public-api.js';
import type { AgentRun, Group } from '../../harness/platform-client.js';

test('[API-001] 原始主要读取接口必需字段和类型符合独立契约', async ({ qa }) => {
  assertContract('health', await qa.api.require(qa.api.get('/api/health')));
  const login = await qa.api.post('/api/auth/login', { username: 'admin', password: 'admin' });
  expect(login.status).toBe(200);
  assertContract('login', login.body);
  await qa.api.login();
  assertContract('accounts', await qa.api.accounts());
  const { group, jobId } = await qa.api.createGroup();
  assertContract('group', group);
  const accounts = await qa.api.accounts();
  assertGroupMemberIdentities(group, accounts);
  const groups = await qa.api.require(qa.api.get<Group[]>('/api/groups'));
  assertContract('groups', groups);
  for (const value of groups) assertGroupMemberIdentities(value, accounts);
  assertContract('job', await qa.api.waitJob(jobId));
  await qa.api.send(group.id, group.creatorAccountId, 'contract-message');
  assertContract('messages', await qa.api.messages(group.id));
  const sequence = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: '契约序列',
      steps: [{ index: 1, accountRole: 'admin', text: 'contract-sequence', delaySeconds: 1 }],
    }),
  );
  const { runId } = await qa.api.require(
    qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: sequence.id,
      vars: {},
      stepVars: {},
    }),
    201,
  );
  assertContract('sequenceRun', await qa.api.sequenceRun(runId));
  // Obtain the ordinary tool-use DTO as well as the final step; an unrelated
  // protocol-error-only run cannot stand in for this contract sample.
  qa.agent.enqueueTurns(
    {
      body: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'contract-read',
            name: 'get_recent_messages',
            input: { limit: 1 },
          },
        ],
      },
    },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'contract-finished' }] } },
  );
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'contract-external',
    text: 'contract-trigger',
  });
  const runs = await qa.api.waitFor<AgentRun[]>(
    `/api/groups/${group.id}/agent-runs`,
    (r) => r.length > 0 && r[0]!.status !== 'running',
  );
  assertContract('agentRuns', runs);
  const agentRun = await qa.api.agentRun(runs[0]!.id);
  assertContract('agentRun', agentRun);
  expect(agentRun).toMatchObject({
    status: 'finished',
    endReason: 'final',
    summary: 'contract-finished',
  });
  expect(agentRun.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'tool_use',
        toolUseId: 'contract-read',
        name: 'get_recent_messages',
        input: { limit: 1 },
        isError: false,
      }),
      expect.objectContaining({ kind: 'final' }),
    ]),
  );
  const unauth = await qa.api.get('/api/accounts', { token: null, cookie: null });
  expect(unauth.status).toBe(401);
  assertContract('error', unauth.body);
});
