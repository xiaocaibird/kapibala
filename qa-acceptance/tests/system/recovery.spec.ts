import { test, expect } from '../fixtures.js';
import { eventually, type AgentRun, type SequenceRun } from '../../harness/platform-client.js';
import { ReceiptSocket, finalizeReceipts } from '../../harness/receipt-socket.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';

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
  const sockets: ReceiptSocket[] = [];
  const connections: {
    openedAt: string;
    sinceSeq?: number;
    purpose: string;
    previousPeerClose?: unknown;
    localCloseRequestedAt?: string;
  }[] = [];
  let active: ReceiptSocket;
  let primaryFailed = false;
  const evidence = () => ({
    connections,
    sockets: sockets.map((socket) => ({
      frames: socket.frames,
      closed: socket.closed,
      errors: socket.errors,
      protocolErrors: socket.protocolErrors,
      lastReceivedSeq: socket.lastReceivedSeq,
    })),
  });
  const connect = async (purpose: string, previous?: ReceiptSocket) => {
    for (const socket of sockets) socket.assertValidFrames();
    // Only complete frames actually received by QA contribute to this cursor.
    const sinceSeq = previous
      ? Math.max(...sockets.map((socket) => socket.lastReceivedSeq))
      : undefined;
    const record = {
      openedAt: new Date().toISOString(),
      sinceSeq,
      purpose,
      previousPeerClose: previous?.closed,
      localCloseRequestedAt: undefined as string | undefined,
    };
    if (previous && !previous.closed) {
      record.localCloseRequestedAt = new Date().toISOString();
      await previous.close();
      // Closing can drain another complete frame. Never skip it or invent a cursor.
      record.sinceSeq = Math.max(...sockets.map((socket) => socket.lastReceivedSeq));
    }
    connections.push(record);
    active = new ReceiptSocket(qa.api.baseUrl);
    sockets.push(active);
    try {
      await active.authenticate(qa.api.token!, record.sinceSeq);
    } catch (error) {
      active.assertValidFrames();
      throw new BlockedError(`WS recovery connection/auth not established: ${String(error)}`);
    }
  };
  const checkFrames = () => {
    sockets.forEach((socket, index) => {
      socket.assertValidFrames();
      const cursor = connections[index]!.sinceSeq;
      if (cursor !== undefined)
        for (const frame of socket.frames)
          if (frame.seq !== undefined) expect(frame.seq).toBeGreaterThan(cursor);
      for (const frame of socket.frames.filter((value) => value.type === 'inconsistency')) {
        expect(frame.seq).toEqual(expect.any(Number));
        expect(frame.inconsistency?.kind).toEqual(expect.any(String));
        expect(frame.inconsistency?.ref).toBeDefined();
        expect(frame.inconsistency?.message).toEqual(expect.any(String));
      }
    });
  };
  try {
    await connect('initial authenticated observation');
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'before-db-outage-anchor',
      senderPlatformUserId: 'external',
      text: 'establish actual received seq',
    });
    const anchor = await observe({
      read: async () => active.frames,
      invariant: () => {
        active.assertHealthy();
        checkFrames();
      },
      complete: (frames) =>
        frames.some(
          (frame) => frame.type === 'message' && frame.msgId === 'before-db-outage-anchor',
        ),
      durationMs: 5_000,
    });
    if (!anchor.complete)
      throw new BlockedError('No real pre-outage WS cursor; do not substitute a guessed seq');
    await qa.evidence('database-recovery-ws-before-outage', evidence());
    await qa.interruptDatabase();
    const failedEvent = qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'database-outage',
      senderPlatformUserId: 'external',
      text: 'must survive failed persistence',
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await qa.restoreDatabase();
    await qa.evidence('database-recovery-ws-before-reconnect', evidence());
    await connect(
      'explicit recovery observation; actual peer close is recorded separately',
      active!,
    );
    const message = await eventually(
      () => qa.api.messages(group.id),
      (value) => value.items.some((item) => item.msgId === 'database-outage'),
    );
    expect(message.items.filter((item) => item.msgId === 'database-outage')).toHaveLength(1);
    // Continue the independent consumption check even if no alert has yet arrived.
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'after-db-recovery',
      senderPlatformUserId: 'external',
      text: 'still consuming',
    });
    const recovered = await eventually(
      () => qa.api.messages(group.id),
      (value) =>
        ['before-db-outage-anchor', 'database-outage', 'after-db-recovery'].every((id) =>
          value.items.some((item) => item.msgId === id),
        ),
    );
    for (const id of ['before-db-outage-anchor', 'database-outage', 'after-db-recovery'])
      expect(recovered.items.filter((item) => item.msgId === id)).toHaveLength(1);
    const identifiers = [
      String(failedEvent.eventId),
      'database-outage',
      group.id,
      group.gatewayGroupId,
    ];
    const notice = await observe({
      read: async () => {
        if (active.closed)
          await connect(
            'peer closed after database recovery; retry from last received seq',
            active,
          );
        return sockets.flatMap((socket) => socket.frames);
      },
      invariant: checkFrames,
      complete: (frames) =>
        frames.some(
          (frame) =>
            frame.type === 'inconsistency' &&
            identifiers.includes(String(frame.inconsistency?.ref)),
        ),
      durationMs: 15_000,
    });
    await qa.evidence('database-recovery-message-and-alert-observation', {
      failedEvent,
      recovered,
      notice,
      ws: evidence(),
    });
    if (!notice.complete)
      throw new BlockedError(
        'Recovered messages are present once, but no related inconsistency notice was proven on resumed WS; finite 15s is not a product SLA',
      );
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    const cleanup = await finalizeReceipts(
      () => qa.evidence('database-recovery-websocket', evidence()),
      [...sockets, { close: () => qa.restoreDatabase() }],
      primaryFailed,
    );
    if (cleanup.length) await qa.evidence('database-recovery-cleanup-errors', cleanup.map(String));
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
