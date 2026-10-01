import { test, expect } from '../fixtures.js';
import { eventually, type ApiError, type SequenceRun } from '../../harness/platform-client.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';
const step = (index: number, text: string, accountRole = 'admin', delaySeconds = 0.2) => ({
  index,
  text,
  accountRole,
  delaySeconds,
});

test('[SEQ-001] variables inherit latest nonempty override with original source', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const sequence = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'variable inheritance',
      steps: [
        step(1, '{event}/{where}'),
        step(2, '{event}/{where}'),
        step(3, '{event}/{where}'),
        step(4, '{event}/{where}'),
      ],
    }),
  );
  const start = await qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
    sequenceId: sequence.id,
    vars: { event: 'A', where: 'room-1' },
    stepVars: { '2': { event: 'B' }, '3': { event: '', where: 'room-3' }, '4': { event: 'C' } },
  });
  expect(start.status).toBe(201);
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${start.body.runId}`,
    (value) => value.status !== 'running',
  );
  expect(run.status).toBe('finished');
  expect(run.steps.map((value) => value.resolvedVars)).toEqual([
    { event: 'A', where: 'room-1' },
    { event: 'B', where: 'room-1' },
    { event: 'B', where: 'room-3' },
    { event: 'C', where: 'room-3' },
  ]);
  expect(run.steps.map((value) => value.varSources)).toEqual([
    { event: 'default', where: 'default' },
    { event: 'step:2', where: 'default' },
    { event: 'step:2', where: 'step:3' },
    { event: 'step:4', where: 'step:3' },
  ]);
  expect(qa.gateway.snapshot().messages.map((message) => message.text)).toEqual([
    'A/room-1',
    'B/room-1',
    'B/room-3',
    'C/room-3',
  ]);
});

test('[SEQ-002] all-step preflight rejects step three and leaves no running record or send', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'full preflight',
      steps: [step(1, '{valid}'), step(2, 'plain'), step(3, '{missing}')],
    }),
  );
  const rejected = await qa.api.post<ApiError>(`/api/groups/${group.id}/sequence-runs`, {
    sequenceId: id,
    vars: { valid: 'known', missing: '' },
    stepVars: { '3': { missing: '' } },
  });
  expect(rejected.status).toBe(422);
  expect(rejected.body.error).toMatchObject({
    code: 'UNRESOLVED_PLACEHOLDER',
    stepIndex: 3,
    key: 'missing',
  });
  expect(rejected.body.error.requestId).toEqual(expect.any(String));
  expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
  const valid = await qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
    sequenceId: id,
    vars: { valid: 'known', missing: 'fixed' },
    stepVars: {},
  });
  expect(valid.status).toBe(201);
  expect(
    (
      await qa.api.waitFor<SequenceRun>(
        `/api/sequence-runs/${valid.body.runId}`,
        (run) => run.status !== 'running',
      )
    ).status,
  ).toBe('finished');
});

test('[SEQ-003] simultaneous starts admit exactly one sequence run', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'concurrent start',
      steps: [step(1, 'once', 'admin', 5)],
    }),
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      qa.api.post<{ runId: string } & ApiError>(`/api/groups/${group.id}/sequence-runs`, {
        sequenceId: id,
        vars: {},
        stepVars: {},
      }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  expect(results.find((result) => result.status === 409)!.body.error.code).toBe(
    'SEQUENCE_ALREADY_RUNNING',
  );
  const winner = results.find((result) => result.status === 201)!;
  expect((await qa.api.group(group.id)).activeSequenceRunId).toBe(winner.body.runId);
  await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${winner.body.runId}`,
    (run) => run.status !== 'running',
  );
  expect(qa.gateway.snapshot().messages).toHaveLength(1);
});

test('[SEQ-004] admin preferred and member selected lexicographically', async ({ qa }) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup(3);
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'role selection',
      steps: [step(1, 'admin role'), step(2, 'member role', 'member')],
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
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${runId}`,
    (value) => value.status !== 'running',
  );
  expect(run.status).toBe('finished');
  expect(qa.gateway.snapshot().messages.map((message) => message.accountId)).toEqual([
    accounts[1]!.id,
    accounts
      .slice(2)
      .map((account) => account.id)
      .sort()[0],
  ]);
});

test('[SEQ-005] next delay begins at actual sent event, not acceptance', async ({ qa }) => {
  test.setTimeout(60_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const sendPath = `/groups/${group.gatewayGroupId}/send`;
  // Keep real acceptance and landing, but create neither confirmation nor echo
  // until release below. A retained storeOnly event could replay on reconnect.
  qa.gateway.enqueue(sendPath, { omitEvent: true });
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'actual sent clock',
      steps: [step(1, 'first', 'admin', 1), step(2, 'second', 'admin', 1)],
    }),
  );
  const creationLower = Date.now();
  const { runId } = await qa.api.require(
    qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: id,
      vars: {},
      stepVars: {},
    }),
    201,
  );
  const creationUpper = Date.now() + 1;
  const read = async () => ({
    run: await qa.api.require(qa.api.get<SequenceRun>(`/api/sequence-runs/${runId}`)),
    gateway: qa.gateway.snapshot(),
  });
  const beforeConfirmation = (value: Awaited<ReturnType<typeof read>>) => {
    expect(value.run.status).toBe('running');
    expect(value.run.steps[0]!.status).not.toBe('sent');
    const sends = value.gateway.requests.filter((request) => request.path === sendPath);
    expect(sends.length).toBeLessThanOrEqual(1);
    if (sends[0])
      expect(
        Date.parse(sends[0].at) + 1 - creationLower,
        'first step sent before startup delay',
      ).toBeGreaterThanOrEqual(1_000);
    expect(value.gateway.events.filter((event) => event.type === 'message_sent')).toEqual([]);
  };
  const landed = await observe({
    read,
    invariant: beforeConfirmation,
    complete: ({ gateway }) =>
      gateway.messages.length === 1 &&
      gateway.requests.some(
        (request) => request.path === sendPath && request.responseStatus === 202,
      ),
    durationMs: 15_000,
  });
  if (!landed.complete)
    throw new BlockedError('SEQ-005未在取证预算内建立首步202及真实落地，不能判定事件排期');
  const first = landed.last.gateway.messages[0]!;
  // Longer than the configured step delay: using remote sentAt or acceptance
  // would advance here, before the first message_sent is even available.
  const held = await observe({
    read,
    invariant: beforeConfirmation,
    complete: () => false,
    durationMs: 1_500,
  });
  await qa.evidence('sequence-held-confirmation', { first, held });
  const receiptLower = Date.now();
  const confirmation = qa.gateway.emit('message_sent', {
    clientMsgId: first.clientMsgId,
    msgId: first.msgId,
    sentAt: first.sentAt,
  });
  const afterConfirmation = ({ run, gateway }: Awaited<ReturnType<typeof read>>) => {
    expect(['running', 'finished']).toContain(run.status);
    const sends = gateway.requests.filter((request) => request.path === sendPath);
    expect(sends.length).toBeLessThanOrEqual(2);
    if (sends[1])
      expect(
        Date.parse(sends[1].at) + 1 - receiptLower,
        'second step sent before receive delay',
      ).toBeGreaterThanOrEqual(1_000);
  };
  const received = await observe({
    read,
    invariant: afterConfirmation,
    complete: ({ run }) => run.steps[0]!.status === 'sent',
    durationMs: 15_000,
    intervalMs: 25,
  });
  if (!received.complete)
    throw new BlockedError('SEQ-005未观察到确认后的公开sent，无法建立首次接收时间上界');
  // Public sent proves the confirmation has been processed by this point.
  // It is an upper bound, never the exact receive time or a product deadline.
  const receiptUpper = Date.now() + 1;
  qa.gateway.emit('message', {
    groupId: first.groupId,
    msgId: first.msgId,
    senderPlatformUserId: first.senderPlatformUserId,
    text: first.text,
    sentAt: first.sentAt,
  });
  const completed = await observe({
    read,
    invariant: afterConfirmation,
    complete: ({ run }) => run.status === 'finished',
    durationMs: 15_000,
  });
  const requests = completed.last.gateway.requests.filter((request) => request.path === sendPath);
  await qa.evidence('sequence-confirmation-time-bounds', {
    creation: [creationLower, creationUpper],
    confirmation,
    receipt: [receiptLower, receiptUpper],
    first,
    completed,
    timestampResolutionMs: 1,
    scope: '本例仅验证受控正常递送；不证明接收落盘窗口、跨进程物理首次时刻或重启复用',
  });
  if (!completed.complete)
    throw new BlockedError('SEQ-005取证预算内未完成；15秒仅为观察预算，不是新增业务时限');
  expect(requests).toHaveLength(2);
  expect(completed.last.gateway.messages.map((message) => message.text)).toEqual([
    'first',
    'second',
  ]);
  let overlaps = false;
  for (const [index, startLower, startUpper] of [
    [0, creationLower, creationUpper],
    [1, receiptLower, receiptUpper],
  ] as const) {
    const requestLower = Date.parse(requests[index]!.at);
    const requestUpper = requestLower + 1;
    expect(
      requestUpper - startLower,
      `step ${index + 1} demonstrably sent before its delay`,
    ).toBeGreaterThanOrEqual(1_000);
    if (requestLower - startUpper < 1_000) overlaps = true;
  }
  expect(
    completed.last.run.steps.every(
      (value) => value.status === 'sent' && value.sentAt && value.scheduledAt,
    ),
  ).toBe(true);
  if (overlaps)
    throw new BlockedError(
      'SEQ-005接收/启动与请求毫秒区间跨1000ms边界；不把测量不确定性当隐式容差',
    );
});

test('[SEQ-006] unavailable member step is skipped with timestamp and progress continues', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup(1);
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'skip missing role',
      steps: [step(1, 'no ordinary member', 'member'), step(2, 'admin continues')],
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
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${runId}`,
    (value) => value.status !== 'running',
  );
  expect(run.status).toBe('finished');
  expect(run.steps[0]!.status).toBe('skipped');
  expect(run.steps[0]!.sentAt).toMatch(/Z$/);
  expect(run.steps[1]!.status).toBe('sent');
  expect(qa.gateway.snapshot().messages.map((message) => message.text)).toEqual([
    'admin continues',
  ]);
});

test('[SEQ-007] rate-limited role waits rather than skips and preserves later delays', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 429,
    code: 'RATE_LIMITED',
    body: { retryAfterSeconds: 2 },
    effect: 'none',
  });
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'limited sequence',
      steps: [step(1, 'wait for admin'), step(2, 'then member', 'member', 1)],
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
  await eventually(
    () => qa.api.accounts(),
    (list) => list.find((account) => account.id === accounts[1]!.id)?.status === 'rate_limited',
  );
  expect((await qa.api.sequenceRun(runId)).steps[0]!.status).not.toBe('skipped');
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${runId}`,
    (value) => value.status !== 'running',
  );
  expect(run.steps.map((value) => value.status)).toEqual(['sent', 'sent']);
  const messages = qa.gateway.snapshot().messages;
  expect(messages.map((message) => message.text)).toEqual(['wait for admin', 'then member']);
  expect(Date.parse(messages[1]!.sentAt) - Date.parse(messages[0]!.sentAt)).toBeGreaterThanOrEqual(
    1_000,
  );
});

test('[SEQ-008] group write prohibition stops sequence while account remains online', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 403,
    code: 'GROUP_WRITE_FORBIDDEN',
    effect: 'none',
  });
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'unreachable stops',
      steps: [step(1, 'denied'), step(2, 'must not send')],
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
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${runId}`,
    (value) => value.status !== 'running',
  );
  expect(run.status).toBe('stopped');
  const updated = await qa.api.group(group.id);
  expect(updated.status).toBe('unreachable');
  expect(updated.activeSequenceRunId).toBeNull();
  expect((await qa.api.accounts()).find((account) => account.id === accounts[1]!.id)!.status).toBe(
    'online',
  );
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
});

test('[SEQ-009] placeholder grammar includes letters digits underscore and leaves other braces literal', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'placeholder grammar',
      steps: [step(1, '{A_1}/{0}/{bad-key}/{}')],
    }),
  );
  const { runId } = await qa.api.require(
    qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: id,
      vars: { A_1: 'alpha', '0': 'zero' },
      stepVars: {},
    }),
    201,
  );
  expect(
    (
      await qa.api.waitFor<SequenceRun>(
        `/api/sequence-runs/${runId}`,
        (value) => value.status !== 'running',
      )
    ).status,
  ).toBe('finished');
  expect(qa.gateway.snapshot().messages[0]!.text).toBe('alpha/zero/{bad-key}/{}');
});

test('[SEQ-010] terminal account skips its queued sequence step and advances progress', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 429,
    code: 'RATE_LIMITED',
    body: { retryAfterSeconds: 60 },
    effect: 'none',
  });
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: 'terminal skip',
      steps: [step(1, 'queued-admin'), step(2, 'member-continues', 'member')],
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
  await eventually(
    () => qa.api.accounts(),
    (values) => values.find((account) => account.id === accounts[1]!.id)?.status === 'rate_limited',
  );
  qa.gateway.emitStatus(accounts[1]!.id, 'suspended');
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${runId}`,
    (value) => value.status !== 'running',
  );
  expect(run.status).toBe('finished');
  expect(run.steps.map((value) => value.status)).toEqual(['skipped', 'sent']);
  expect(run.steps[0]!.sentAt).toMatch(/Z$/);
  expect(qa.gateway.snapshot().messages.map((message) => message.text)).toEqual([
    'member-continues',
  ]);
  const message = (await qa.api.messages(group.id)).items.find(
    (message) => message.clientMsgId === run.steps[0]!.clientMsgId,
  )!;
  expect(message.deliveryStatus).toBe('cancelled');
  expect(message.failCode).toBe('ACCOUNT_TERMINAL');
});
