import WebSocket from 'ws';
import { test, expect } from '../fixtures.js';
import { eventually, type AgentRun, type SequenceRun } from '../../harness/platform-client.js';

test('[REC-001] SSE reconnect recovers all retained events once including out-of-order delivery', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.configure({ sseUnavailable: true });
  qa.gateway.disconnectStreams();
  for (let index = 0; index < 10; index++)
    qa.gateway.emitMessage(
      {
        groupId: group.gatewayGroupId,
        msgId: `offline-${index}`,
        senderPlatformUserId: 'external',
        text: `offline ${index}`,
      },
      { storeOnly: true },
    );
  qa.gateway.configure({ sseUnavailable: false, eventDuplicates: 2 });
  await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.filter((message) => message.msgId?.startsWith('offline-')).length === 10,
  );
  const older = qa.gateway.emitMessage(
    {
      groupId: group.gatewayGroupId,
      msgId: 'delayed-event',
      senderPlatformUserId: 'external',
      text: 'delayed',
    },
    { storeOnly: true },
  );
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    msgId: 'next-event',
    senderPlatformUserId: 'external',
    text: 'next',
  });
  qa.gateway.deliver(older.eventId, { delayMs: 800, repeat: 2 });
  const messages = await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.length === 12,
  );
  expect(new Set(messages.items.map((message) => message.msgId)).size).toBe(12);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path === '/events').length,
  ).toBeGreaterThanOrEqual(2);
});

test('[REC-002] hard process restart recovers events produced while stopped', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  await qa.kill();
  for (let index = 0; index < 5; index++)
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: `stopped-${index}`,
      senderPlatformUserId: 'external',
      text: `during downtime ${index}`,
    });
  await qa.start();
  await qa.api.login();
  const messages = await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.length === 5,
  );
  expect(messages.items.map((message) => message.msgId).sort()).toEqual(
    Array.from({ length: 5 }, (_, index) => `stopped-${index}`).sort(),
  );
  await qa.restart();
  await qa.api.login();
  expect((await qa.api.messages(group.id)).items).toHaveLength(5);
});

test('[REC-003] database write outage loses no event and produces inconsistency notice', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const frames: { type: string; payload?: unknown }[] = [];
  const ws = new WebSocket(new URL('/ws', qa.api.baseUrl).toString().replace(/^http/, 'ws'));
  ws.on('message', (raw) => frames.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'auth', accessToken: qa.api.token }));
  await eventually(
    async () => frames,
    (value) => value.some((frame) => frame.type === 'auth'),
  );
  try {
    await qa.interruptDatabase();
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'database-outage',
      senderPlatformUserId: 'external',
      text: 'must survive failed persistence',
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await qa.restoreDatabase();
    const message = await eventually(
      () => qa.api.messages(group.id),
      (value) => value.items.some((item) => item.msgId === 'database-outage'),
    );
    expect(message.items.filter((item) => item.msgId === 'database-outage')).toHaveLength(1);
    await eventually(
      async () => frames,
      (value) => value.some((frame) => frame.type === 'inconsistency'),
    );
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'after-db-recovery',
      senderPlatformUserId: 'external',
      text: 'still consuming',
    });
    await eventually(
      () => qa.api.messages(group.id),
      (value) => value.items.length === 2,
    );
    await qa.evidence('database-recovery-websocket', frames);
  } finally {
    await qa.restoreDatabase();
    ws.close();
  }
});

test('[REC-004] crash after send effect before response never duplicates gateway delivery', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    effect: 'apply',
    effectDelayMs: 0,
    omitEvent: true,
    barrier: { phase: 'after-effect', name: 'send-landed' },
  });
  const pending = qa.api
    .send(group.id, accounts[0]!.id, 'crash after effect')
    .catch((error) => ({ error: String(error) }));
  await qa.gateway.barriers.waitFor('send-landed');
  const landed = qa.gateway
    .snapshot()
    .messages.filter((message) => message.text === 'crash after effect');
  expect(landed).toHaveLength(1);
  await qa.kill();
  qa.gateway.barriers.release('send-landed');
  await pending;
  await qa.start();
  await qa.api.login();
  const result = await eventually(
    () => qa.api.messages(group.id),
    (value) =>
      value.items.some(
        (message) =>
          message.clientMsgId === landed[0]!.clientMsgId && message.deliveryStatus === 'sent',
      ),
  );
  expect(
    result.items.filter((message) => message.clientMsgId === landed[0]!.clientMsgId),
  ).toHaveLength(1);
  expect(
    qa.gateway
      .snapshot()
      .messages.filter((message) => message.clientMsgId === landed[0]!.clientMsgId),
  ).toHaveLength(1);
  await qa.evidence('effect-before-crash', { landed, result });
});

test('[REC-005] sequence restart reschedules only earliest overdue step and spaces subsequent sends', async ({
  qa,
}) => {
  test.setTimeout(45_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'restart schedule',
      steps: [1, 2, 3].map((index) => ({
        index,
        accountRole: 'admin',
        text: `restart-step-${index}`,
        delaySeconds: 2,
      })),
    }),
  );
  const { runId } = await qa.api.require(
    qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: id,
      vars: {},
      stepVars: {},
    }),
    201,
  );
  await qa.kill();
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const restarting = Date.now();
  await qa.start();
  await qa.api.login();
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${runId}`,
    (value) => value.status !== 'running',
    { timeoutMs: 20_000 },
  );
  expect(run.status).toBe('finished');
  const messages = qa.gateway
    .snapshot()
    .messages.filter((message) => message.text.startsWith('restart-step-'));
  expect(messages.map((message) => message.text)).toEqual([
    'restart-step-1',
    'restart-step-2',
    'restart-step-3',
  ]);
  expect(Date.parse(messages[0]!.sentAt) - restarting).toBeGreaterThanOrEqual(2_000);
  for (let index = 1; index < messages.length; index++)
    expect(
      Date.parse(messages[index]!.sentAt) - Date.parse(messages[index - 1]!.sentAt),
    ).toBeGreaterThanOrEqual(2_000);
});

test('[REC-006] agent restarts with same run id and reconciles already-sent tool effect', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.agent.enqueueTurns(
    {
      body: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'recover-send',
            name: 'send_message',
            input: { text: 'agent exactly once', idempotency_key: 'recover-key' },
          },
        ],
      },
    },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'recovered' }] } },
  );
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    effect: 'apply',
    effectDelayMs: 0,
    omitEvent: true,
    barrier: { phase: 'after-effect', name: 'agent-send-landed' },
  });
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'outside',
    text: 'trigger recover',
  });
  await qa.gateway.barriers.waitFor('agent-send-landed');
  const runId = (await qa.api.group(group.id)).activeAgentRunId!;
  expect(runId).toEqual(expect.any(String));
  await qa.kill();
  qa.gateway.barriers.release('agent-send-landed');
  await qa.start();
  await qa.api.login();
  const run = await qa.api.waitFor<AgentRun>(
    `/api/agent-runs/${runId}`,
    (value) => value.status !== 'running',
    { timeoutMs: 30_000 },
  );
  expect(run.status).toBe('finished');
  expect(run.endReason).toBe('final');
  expect(run.steps.find((step) => step.name === 'send_message')?.isError).toBe(false);
  expect(
    qa.agent.snapshot().turns.every((turn) => (turn.body as { runId: string }).runId === runId),
  ).toBe(true);
  expect(
    qa.gateway.snapshot().messages.filter((message) => message.text === 'agent exactly once'),
  ).toHaveLength(1);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
});

test('[REC-007] agent restart after kick effect uses membership reconciliation without repeating kick', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.setMembership(group.gatewayGroupId, 'recover-kick-target', true);
  await qa.api.require(
    qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true, autoKickEnabled: true }),
  );
  qa.agent.enqueueTurns(
    {
      body: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'recover-kick',
            name: 'kick_user',
            input: { platform_user_id: 'recover-kick-target', reason: 'recovery' },
          },
        ],
      },
    },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'recovered' }] } },
  );
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
    effect: 'apply',
    omitEvent: true,
    barrier: { phase: 'after-effect', name: 'kick-landed' },
  });
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'outside',
    text: 'trigger kick',
  });
  await qa.gateway.barriers.waitFor('kick-landed');
  const runId = (await qa.api.group(group.id)).activeAgentRunId!;
  expect(
    qa.gateway
      .snapshot()
      .groups[0]!.members.some((member) => member.platformUserId === 'recover-kick-target'),
  ).toBe(false);
  await qa.kill();
  qa.gateway.barriers.release('kick-landed');
  await qa.start();
  await qa.api.login();
  const run = await qa.api.waitFor<AgentRun>(
    `/api/agent-runs/${runId}`,
    (value) => value.status !== 'running',
    { timeoutMs: 30_000 },
  );
  expect(run.status).toBe('finished');
  expect(run.steps.find((step) => step.name === 'kick_user')?.isError).toBe(false);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/kick')),
  ).toHaveLength(1);
});

test('[REC-008] repeated migration preserves data and schema version', async ({ qa }) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  await qa.api.send(group.id, accounts[0]!.id, 'before migration');
  await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.some((message) => message.deliveryStatus === 'sent'),
  );
  const beforeHealth = await qa.api.get('/api/health');
  const beforeMessages = await qa.api.messages(group.id);
  await qa.kill();
  await qa.migrate();
  await qa.migrate();
  await qa.start();
  await qa.api.login();
  expect((await qa.api.get('/api/health')).body).toEqual(beforeHealth.body);
  expect((await qa.api.messages(group.id)).items).toEqual(beforeMessages.items);
  expect((await qa.api.group(group.id)).members).toEqual(group.members);
});
