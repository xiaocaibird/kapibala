import { test, expect } from '../fixtures.js';
import { eventually, type AgentRun, type Group } from '../../harness/platform-client.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { BlockedError } from '../../harness/security.js';
import { observe } from '../../harness/observation.js';
import {
  runtimeObservationFor,
  type RuntimeLease,
  type RuntimeObservation,
} from '../../harness/runtime-observation.js';
import {
  assertSingleEpochActivityBudget,
  optionalActivityObservation,
} from '../support/agent-activity-budget.js';

type Block = {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
};
type TurnRequest = {
  runId: string;
  tools: {
    name: string;
    description: string;
    input_schema: { required: string[]; type: string };
  }[];
  messages: { role: string; content: Block[] }[];
};
const tool = (id: string, name: string, input: unknown) => ({
  body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
});
const finish = (text = 'done') => ({
  body: { stop_reason: 'end_turn', content: [{ type: 'text', text }] },
});
const requests = (qa: QaEnvironment) =>
  qa.agent.snapshot().turns.map((request) => request.body as TurnRequest);
const results = (qa: QaEnvironment) =>
  requests(qa).flatMap((request) =>
    request.messages.flatMap((message) =>
      message.content.filter((block) => block.type === 'tool_result'),
    ),
  );
async function trigger(
  qa: QaEnvironment,
  group: Group,
  text = 'external question',
): Promise<string> {
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'outside-user',
    text,
  });
  const runs = await eventually(
    () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
    (value) => value.length > 0,
  );
  return runs[0]!.id;
}
const finished = (qa: QaEnvironment, id: string, timeoutMs = 20_000) =>
  qa.api.waitFor<AgentRun>(`/api/agent-runs/${id}`, (run) => run.status !== 'running', {
    timeoutMs,
  });
async function observeRun(
  qa: QaEnvironment,
  id: string,
  predicate: (run: AgentRun) => boolean,
  initialLower: number,
  timeoutMs: number,
): Promise<{ run: AgentRun; lower: number; upper: number }> {
  let lower = initialLower;
  const run = await eventually(
    async () => {
      const beforeRead = Date.now();
      const value = await qa.api.agentRun(id);
      if (!predicate(value)) lower = beforeRead;
      return value;
    },
    predicate,
    { timeoutMs },
  );
  return { run, lower, upper: Date.now() };
}
async function timingInterval(
  qa: QaEnvironment,
  name: string,
  start: [number, number],
  end: [number, number],
  minimum: number,
  maximum: number,
): Promise<void> {
  const bounds = {
    lowerMs: end[0] - start[1],
    upperMs: end[1] - start[0],
    minimum,
    maximum,
    start,
    end,
  };
  await qa.evidence(name, bounds);
  expect(bounds.lowerMs, 'Measured interval is entirely beyond deadline').toBeLessThanOrEqual(
    maximum,
  );
  expect(
    bounds.upperMs,
    'Measured interval is entirely before minimum duration',
  ).toBeGreaterThanOrEqual(minimum);
  if (bounds.lowerMs < minimum || bounds.upperMs > maximum)
    throw new BlockedError(
      `Timing interval ${bounds.lowerMs}..${bounds.upperMs}ms crosses required ${minimum}..${maximum}ms; lifecycle timestamp evidence is needed`,
    );
}

test('[AGENT-001] four schema-complete tools and correct trigger context keep one run identity', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    tool('t1', 'get_recent_messages', { limit: 10 }),
    finish('finished summary'),
  );
  const id = await trigger(qa, group);
  const run = await finished(qa, id);
  expect(run.status).toBe('finished');
  expect(run.endReason).toBe('final');
  expect(run.summary).toBe('finished summary');
  const calls = requests(qa);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.runId === id)).toBe(true);
  expect(calls[0]!.tools.map((value) => value.name).sort()).toEqual([
    'finish',
    'get_recent_messages',
    'kick_user',
    'send_message',
  ]);
  const required: Record<string, string[]> = {
    finish: ['summary'],
    get_recent_messages: ['limit'],
    kick_user: ['platform_user_id', 'reason'],
    send_message: ['text', 'idempotency_key'],
  };
  for (const value of calls[0]!.tools) {
    expect(value.input_schema.type).toBe('object');
    expect(value.input_schema.required.sort()).toEqual(required[value.name]!.sort());
  }
  const context = JSON.parse(calls[0]!.messages[0]!.content[0]!.text!);
  expect(context.groupId).toBe(group.id);
  expect(context.policy).toEqual({ autoKickEnabled: false });
  expect(context.ownPlatformUserIds).toEqual(
    expect.arrayContaining(accounts.map((account) => account.platformUserId)),
  );
  const allOwnIds = (await qa.api.accounts()).map((account) => account.platformUserId);
  expect(context.ownPlatformUserIds.every((id: string) => allOwnIds.includes(id))).toBe(true);
  expect(context.triggerMessages).toHaveLength(1);
  expect(context.triggerMessages[0].text).toBe('external question');
  expect(results(qa).some((value) => value.tool_use_id === 't1' && !value.is_error)).toBe(true);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
});

test('[AGENT-002] duplicate inbound and own echo never duplicate triggers', async ({ qa }) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.agent.enqueueTurns(finish());
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage(
    {
      groupId: group.gatewayGroupId,
      msgId: 'duplicate-trigger',
      senderPlatformUserId: 'external',
      text: 'once',
    },
    { repeat: 3 },
  );
  const runs = await eventually(
    () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
    (value) => value.length === 1,
  );
  await finished(qa, runs[0]!.id);
  await qa.api.send(group.id, accounts[0]!.id, 'own echo');
  await eventually(
    () => qa.api.messages(group.id),
    (value) =>
      value.items.some(
        (message) => message.text === 'own echo' && message.deliveryStatus === 'sent',
      ),
  );
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  expect(
    await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  ).toHaveLength(1);
  expect(requests(qa)).toHaveLength(1);
});

test('[AGENT-003] multi-instance active run excludes competitors and batches all pending messages', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    { ...finish('first'), barrier: { phase: 'before-response', name: 'first-run' } },
    finish('second'),
  );
  await qa.startSecondInstance();
  const first = await trigger(qa, group);
  await qa.agent.barriers.waitFor('first-run');
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    msgId: 'pending-later',
    senderPlatformUserId: 'outside',
    text: 'later',
    sentAt: '2026-01-01T00:00:00.002Z',
  });
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    msgId: 'pending-earlier',
    senderPlatformUserId: 'outside',
    text: 'earlier',
    sentAt: '2026-01-01T00:00:00.001Z',
  });
  await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.some((message) => message.msgId === 'pending-earlier'),
  );
  expect(
    (await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`))).filter(
      (run) => run.status === 'running',
    ),
  ).toHaveLength(1);
  qa.agent.barriers.release('first-run');
  await finished(qa, first);
  const runs = await eventually(
    () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
    (value) => value.length === 2 && value.every((run) => run.status !== 'running'),
  );
  expect(runs.every((run) => run.status === 'finished')).toBe(true);
  expect(requests(qa)).toHaveLength(2);
  const context = JSON.parse(requests(qa)[1]!.messages[0]!.content[0]!.text!);
  expect(context.triggerMessages.map((message: { msgId: string }) => message.msgId)).toEqual([
    'pending-earlier',
    'pending-later',
  ]);
  expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
  await qa.stopSecondInstance();
});

const invalidTurns = [
  { id: 'AGENT-004', name: 'non-JSON', plan: { rawBody: '<html>invalid</html>' } },
  {
    id: 'AGENT-005',
    name: 'fenced JSON',
    plan: {
      rawBody: '```json\n{"stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}\n```',
    },
  },
  {
    id: 'AGENT-006',
    name: 'multiple blocks',
    plan: {
      body: {
        stop_reason: 'end_turn',
        content: [
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
        ],
      },
    },
  },
  {
    id: 'AGENT-007',
    name: 'stop reason mismatch',
    plan: {
      body: {
        stop_reason: 'end_turn',
        content: [{ type: 'tool_use', id: 'x', name: 'finish', input: { summary: 'x' } }],
      },
    },
  },
  { id: 'AGENT-008', name: 'non-2xx', plan: { status: 503, rawBody: 'unavailable' } },
  {
    id: 'AGENT-034',
    name: 'missing stop reason',
    plan: { body: { content: [{ type: 'text', text: 'done' }] } },
  },
  {
    id: 'AGENT-035',
    name: 'zero content blocks',
    plan: { body: { stop_reason: 'end_turn', content: [] } },
  },
  {
    id: 'AGENT-036',
    name: 'text surrounding JSON',
    plan: {
      rawBody:
        'Here is the answer: {"stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}',
    },
  },
];
for (const scenario of invalidTurns)
  test(`[${scenario.id}] ${scenario.name} produces BAD_JSON history without assistant block`, async ({
    qa,
  }) => {
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    qa.agent.enqueueTurns(scenario.plan, finish());
    const id = await trigger(qa, group);
    const run = await finished(qa, id);
    expect(run.status).toBe('finished');
    expect(run.steps[0]).toMatchObject({
      kind: 'protocol_error',
      name: null,
      input: null,
      toolUseId: null,
      isError: true,
      errorCode: 'BAD_JSON',
    });
    expect(typeof run.steps[0]!.rawResponse).toBe('string');
    const history = requests(qa)[1]!.messages;
    expect(
      history.some(
        (message) =>
          message.role === 'user' &&
          message.content.some(
            (block) => block.type === 'text' && block.text?.startsWith('PROTOCOL_ERROR BAD_JSON:'),
          ),
      ),
    ).toBe(true);
    expect(history.filter((message) => message.role === 'assistant')).toHaveLength(0);
  });

for (const [id, name, input, code] of [
  ['AGENT-009', 'unlisted_tool', {}, 'UNKNOWN_TOOL'],
  ['AGENT-010', 'send_message', { text: 42 }, 'INVALID_INPUT'],
] as const)
  test(`[${id}] ${code} appends assistant tool use and error result`, async ({ qa }) => {
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    qa.agent.enqueueTurns(tool('bad-tool', name, input), finish());
    const run = await finished(qa, await trigger(qa, group));
    expect(run.steps[0]).toMatchObject({
      kind: 'tool_use',
      name,
      toolUseId: 'bad-tool',
      isError: true,
      errorCode: code,
    });
    const history = requests(qa)[1]!.messages;
    expect(
      history.some(
        (message) =>
          message.role === 'assistant' && message.content.some((block) => block.id === 'bad-tool'),
      ),
    ).toBe(true);
    const result = results(qa).find((block) => block.tool_use_id === 'bad-tool')!;
    expect(result.is_error).toBe(true);
    expect(JSON.parse(result.content!).code).toBe(code);
    expect(qa.agent.snapshot().audits).toHaveLength(0);
  });

test('[AGENT-011] duplicate tool_use id is protocol error and has no repeated effect', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    tool('same-id', 'get_recent_messages', { limit: 10 }),
    tool('same-id', 'send_message', { text: 'must not send', idempotency_key: 'x' }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.steps[1]).toMatchObject({
    kind: 'protocol_error',
    errorCode: 'DUPLICATE_TOOL_USE_ID',
    toolUseId: null,
    name: null,
    input: null,
  });
  expect(
    requests(qa)[2]!
      .messages.flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_use' && block.id === 'same-id'),
  ).toHaveLength(1);
  expect(qa.agent.snapshot().audits).toHaveLength(0);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
});

test('[AGENT-012] three consecutive protocol errors fail and a legal response resets the count', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const bad = { rawBody: 'not JSON' };
  qa.agent.enqueueTurns(
    bad,
    bad,
    tool('valid-reset', 'get_recent_messages', { limit: 1 }),
    bad,
    bad,
    bad,
    finish('must not reach'),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('failed');
  expect(run.endReason).toBe('protocol_errors');
  expect(run.steps).toHaveLength(6);
  expect(requests(qa)).toHaveLength(6);
});

test('[AGENT-013] repeated read loop cannot exceed twelve turns', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    ...Array.from({ length: 14 }, (_, index) =>
      tool(`loop-${index}`, 'get_recent_messages', { limit: 10 }),
    ),
  );
  const run = await finished(qa, await trigger(qa, group));
  // The upper bound alone also passes three unrelated BAD_JSON errors. Prove
  // that a legal first read completed and the model actually repeated it;
  // handling of the repeated call remains the product's declared choice.
  expect(run.steps[0]).toMatchObject({
    kind: 'tool_use',
    toolUseId: 'loop-0',
    name: 'get_recent_messages',
    input: { limit: 10 },
    isError: false,
  });
  expect(results(qa).some((value) => value.tool_use_id === 'loop-0' && !value.is_error)).toBe(true);
  const turns = qa.agent
    .snapshot()
    .turns.filter((request) => (request.body as TurnRequest).runId === run.id);
  expect(turns.length, '必须实际返回至少两次相同入参的合法读工具响应').toBeGreaterThanOrEqual(2);
  for (const [index, response] of turns.slice(0, 2).entries()) {
    expect(response.responseStatus).toBe(200);
    expect(JSON.parse(response.rawResponse!)).toEqual(
      tool(`loop-${index}`, 'get_recent_messages', { limit: 10 }).body,
    );
  }
  expect(run.steps.length).toBeLessThanOrEqual(12);
  expect(requests(qa).length).toBeLessThanOrEqual(12);
  expect(run.status).not.toBe('running');
  if (run.steps.length === 12) {
    expect(run.status).toBe('failed');
    expect(run.endReason).toBe('budget_exhausted');
  }
});

test('[AGENT-014] audit rejection blocks side effect and rejected key remains reusable', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueAudits(
    { body: { verdict: 'fail', reason: 'rejected' } },
    { body: { verdict: 'pass', reason: 'permitted' } },
  );
  qa.agent.enqueueTurns(
    tool('send-1', 'send_message', { text: 'audited text', idempotency_key: 'reused' }),
    tool('send-2', 'send_message', { text: 'audited text', idempotency_key: 'reused' }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(run.steps[0]).toMatchObject({
    isError: true,
    errorCode: 'AUDIT_REJECTED',
    auditVerdict: 'fail',
  });
  expect(run.steps[1]!.auditVerdict).toBe('pass');
  expect(qa.agent.snapshot().audits).toHaveLength(2);
  await eventually(
    async () => qa.gateway.snapshot().messages.filter((message) => message.text === 'audited text'),
    (value) => value.length === 1,
  );
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
  expect(qa.agent.snapshot().audits.map((request) => request.body)).toEqual([
    { text: 'audited text', groupId: group.id },
    { text: 'audited text', groupId: group.id },
  ]);
});

test('[AGENT-015] three inconclusive audit attempts block run without execution', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueAudits(
    { status: 500, rawBody: 'error' },
    { rawBody: 'not json' },
    { body: { verdict: 'unknown' } },
  );
  qa.agent.enqueueTurns(
    tool('audit-block', 'send_message', { text: 'never execute', idempotency_key: 'blocked' }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('blocked');
  expect(run.endReason).toBe('audit_blocked');
  expect(run.steps).toHaveLength(1);
  expect(qa.agent.snapshot().audits).toHaveLength(3);
  expect(requests(qa)).toHaveLength(1);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
});

test('[AGENT-016] idempotency retry returns current sent state without another audit or send', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 1_500,
  });
  qa.agent.enqueueTurns(
    tool('send-first', 'send_message', {
      text: 'one logical message',
      idempotency_key: 'same-key',
    }),
    {
      ...tool('send-again', 'send_message', {
        text: 'one logical message',
        idempotency_key: 'same-key',
      }),
      responseDelayMs: 1_600,
    },
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(qa.agent.snapshot().audits).toHaveLength(1);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
  const result = results(qa).find((block) => block.tool_use_id === 'send-again')!;
  expect(result.is_error ?? false).toBe(false);
  expect(JSON.parse(result.content!).deliveryStatus).toBe('sent');
  expect(
    qa.gateway.snapshot().messages.filter((message) => message.text === 'one logical message'),
  ).toHaveLength(1);
});

test('[AGENT-017] kick denied by policy never calls external kick', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.setMembership(group.gatewayGroupId, 'target-user', true);
  qa.agent.enqueueTurns(
    tool('kick-denied', 'kick_user', { platform_user_id: 'target-user', reason: 'policy check' }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'POLICY_DENIED' });
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/kick')),
  ).toHaveLength(0);
  expect(
    qa.gateway
      .snapshot()
      .groups[0]!.members.some((member) => member.platformUserId === 'target-user'),
  ).toBe(true);
});

test('[AGENT-018] permitted kick audits exact action and uses owner or promoted member', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.setMembership(group.gatewayGroupId, 'target-user', true);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  qa.agent.enqueueTurns(
    tool('kick', 'kick_user', { platform_user_id: 'target-user', reason: 'test reason' }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(run.steps[0]!.isError).toBe(false);
  expect(qa.agent.snapshot().audits[0]!.body).toEqual({
    text: JSON.stringify({
      action: 'kick',
      platform_user_id: 'target-user',
      reason: 'test reason',
    }),
    groupId: group.id,
  });
  const kick = qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/kick'))!;
  expect(
    group.members.filter((member) => member.role !== 'member').map((member) => member.accountId),
  ).toContain((kick.body as { byAccountId: string }).byAccountId);
  expect(
    qa.gateway
      .snapshot()
      .groups[0]!.members.some((member) => member.platformUserId === 'target-user'),
  ).toBe(false);
});

for (const [id, code, status] of [
  ['AGENT-019', 'OWNER_LEFT', 409],
  ['AGENT-020', 'NO_PERMISSION', 403],
] as const)
  test(`[${id}] ${code} is returned as tool error without changing group or accounts`, async ({
    qa,
  }) => {
    await qa.api.login();
    const { group } = await qa.api.createGroup();
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
    const accounts = await qa.api.accounts();
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, { status, code, effect: 'none' });
    qa.agent.enqueueTurns(
      tool('kick-error', 'kick_user', { platform_user_id: 'target-user', reason: 'test' }),
      finish(),
    );
    const run = await finished(qa, await trigger(qa, group));
    expect(run.steps[0]).toMatchObject({ isError: true, errorCode: code });
    expect((await qa.api.group(group.id)).status).toBe('active');
    expect(await qa.api.accounts()).toEqual(accounts);
  });

test('[AGENT-021] recent messages include new arrivals and obey text, count, byte and summary limits', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  for (let index = 0; index < 55; index++)
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: `long-${index}`,
      senderPlatformUserId: 'outside',
      text: '汉'.repeat(600),
      sentAt: new Date(Date.UTC(2026, 0, 1) + index).toISOString(),
    });
  await eventually(
    async () => {
      const page = await qa.api.messages(group.id);
      const older = page.nextCursor
        ? await qa.api.messages(group.id, page.nextCursor)
        : { items: [] };
      return page.items.length + older.items.length;
    },
    (count) => count === 55,
  );
  qa.agent.enqueueTurns(
    {
      ...tool('recent', 'get_recent_messages', { limit: 100000 }),
      barrier: { phase: 'before-response', name: 'read-fresh' },
    },
    finish(),
  );
  const id = await trigger(qa, group, 'trigger included');
  await qa.agent.barriers.waitFor('read-fresh');
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    msgId: 'during-run',
    senderPlatformUserId: 'outside',
    text: 'new while running',
  });
  await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.some((message) => message.msgId === 'during-run'),
  );
  qa.agent.barriers.release('read-fresh');
  const run = await finished(qa, id);
  const content = results(qa).find((block) => block.tool_use_id === 'recent')!.content!;
  const value = JSON.parse(content);
  expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(8192);
  expect(value.truncated).toBe(true);
  expect(value.messages.length).toBeLessThanOrEqual(50);
  expect(
    value.messages.some((message: { text: string }) => message.text === 'trigger included'),
  ).toBe(true);
  expect(value.messages.some((message: { msgId: string }) => message.msgId === 'during-run')).toBe(
    true,
  );
  for (const message of value.messages) {
    expect(Array.from(message.text).length).toBeLessThanOrEqual(500);
    expect(typeof message.isOwn).toBe('boolean');
  }
  const times = value.messages.map((message: { sentAt: string }) => message.sentAt);
  expect(times).toEqual([...times].sort());
  expect(run.steps.every((value) => Array.from(value.resultSummary).length <= 200)).toBe(true);
});

test('[AGENT-022] disabling agent lets current step complete then cancels', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    {
      ...tool('current', 'get_recent_messages', { limit: 1 }),
      barrier: { phase: 'before-response', name: 'current-step' },
    },
    finish('must not execute'),
  );
  const id = await trigger(qa, group);
  await qa.agent.barriers.waitFor('current-step');
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
  qa.agent.barriers.release('current-step');
  const run = await finished(qa, id);
  expect(run.status).toBe('cancelled');
  expect(run.endReason).toBe('cancelled');
  expect(requests(qa)).toHaveLength(1);
  expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
});

test('[AGENT-023] finish tool stores summary and does not ask another turn', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    tool('finish-tool', 'finish', { summary: 'stored summary' }),
    finish('must not request'),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(run.endReason).toBe('final');
  expect(run.summary).toBe('stored summary');
  expect(run.steps[0]).toMatchObject({ name: 'finish', isError: false });
  expect(requests(qa)).toHaveLength(1);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
});

test('[AGENT-024] turn timeout records error and late response never sends a message', async ({
  qa,
}) => {
  test.setTimeout(45_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    {
      ...tool('too-late', 'send_message', { text: 'late must not send', idempotency_key: 'late' }),
      responseDelayMs: 16_000,
    },
    finish(),
  );
  const earliestTurnStart = Date.now();
  const id = await trigger(qa, group);
  const observed = await observeRun(
    qa,
    id,
    (run) => run.steps.some((step) => step.errorCode === 'TURN_TIMEOUT'),
    earliestTurnStart,
    20_000,
  );
  expect(observed.run.steps[0]).toMatchObject({
    kind: 'protocol_error',
    errorCode: 'TURN_TIMEOUT',
  });
  const firstRequestAt = Date.parse(qa.agent.snapshot().turns[0]!.at);
  await finished(qa, id);
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, firstRequestAt + 16_500 - Date.now())),
  );
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
  expect(qa.agent.snapshot().audits).toHaveLength(0);
  await timingInterval(
    qa,
    'turn-timeout-window',
    [earliestTurnStart, firstRequestAt],
    [observed.lower, observed.upper],
    10_000,
    15_000,
  );
});

test('[AGENT-025] run reaches sixty-second active wall-clock budget including slow turns', async ({
  qa,
}) => {
  test.setTimeout(100_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    ...Array.from({ length: 12 }, (_, index) => ({
      ...tool(`slow-${index}`, 'get_recent_messages', { limit: (index % 2) + 1 }),
      responseDelayMs: 8_000,
    })),
  );
  const missing: string[] = [];
  const gatewayBefore = qa.gateway.snapshot();
  let control: RuntimeObservation | undefined;
  let lease: RuntimeLease | undefined;
  let failed = false;
  try {
    const verified = await optionalActivityObservation(
      'verify before trigger',
      async () => {
        control = runtimeObservationFor(qa);
        await control.verify(['activity-witness']);
        return control;
      },
      missing,
    );
    const creationLower = Date.now();
    const creationLowerMono = performance.now();
    const id = await trigger(qa, group);
    const creationUpperMono = performance.now();
    const creationUpper = Date.now();
    // The public trigger supplies the real runId. The reviewed engineering
    // observer retains creation since module boot; a late subscription alone
    // is NOT a complete witness and must never fabricate a creation event.
    if (verified)
      lease = await optionalActivityObservation(
        'arm real run after creation',
        () =>
          verified.arm('observe-activity', {
            kind: 'activity',
            groupId: group.id,
            runId: id,
            toolUseId: 'all-run-steps',
          }),
        missing,
      );
    let lastRunningLower = creationLower;
    let lastRunningLowerMono = creationLowerMono;
    const observed = await observe({
      read: async () => {
        const before = Date.now(),
          beforeMono = performance.now();
        const run = await qa.api.agentRun(id);
        if (run.status === 'running') {
          lastRunningLower = before;
          lastRunningLowerMono = beforeMono;
        }
        return { run, after: Date.now(), afterMono: performance.now() };
      },
      invariant: ({ run }) => {
        expect(run.id).toBe(id);
        expect(run.groupId).toBe(group.id);
        expect(run.steps.length).toBeLessThanOrEqual(12);
      },
      complete: ({ run }) => run.status !== 'running',
      durationMs: Math.max(0, 65_000 - (performance.now() - creationLowerMono)),
    });
    const { run } = observed.last;
    // Check public facts even if no controller/configuration or complete time
    // witness is available. An independent violation must remain FAIL.
    const assertExternalFacts = () => {
      expect(qa.agent.snapshot().audits).toHaveLength(0);
      expect(
        qa.gateway.snapshot().requests.filter((request) => /\/(send|kick)$/.test(request.path)),
      ).toHaveLength(0);
      expect(
        qa.gateway
          .snapshot()
          .effects.filter((effect) => effect.kind === 'send' || effect.kind === 'kick'),
      ).toHaveLength(0);
      expect(qa.gateway.snapshot().effects).toEqual(gatewayBefore.effects);
      expect(
        qa.gateway
          .snapshot()
          .requests.filter((request) => request.method !== 'GET')
          .map((request) => request.id),
      ).toEqual(
        gatewayBefore.requests
          .filter((request) => request.method !== 'GET')
          .map((request) => request.id),
      );
      for (const request of qa.agent.snapshot().turns)
        expect(
          Date.parse(request.at) - creationUpper,
          'A new turn after the latest possible budget deadline is forbidden',
        ).toBeLessThanOrEqual(60_000);
    };
    assertExternalFacts();
    if (observed.complete) {
      expect(run.status).toBe('failed');
      expect(run.endReason).toBe('wall_clock');
      expect(run.steps.length).toBeLessThan(12);
      expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
    }
    const witnessReadBeforeMono = performance.now();
    const witness =
      lease &&
      (await optionalActivityObservation(
        'final activity snapshot',
        () => (observed.complete ? lease!.waitFor('activity-terminal', 5000) : lease!.snapshot()),
        missing,
      ));
    const witnessReadAfterMono = performance.now();
    assertExternalFacts();
    const online: [number, number] = [
      Math.max(0, lastRunningLowerMono - creationUpperMono),
      (observed.complete ? observed.last.afterMono : witnessReadAfterMono) - creationLowerMono,
    ];
    await qa.evidence('wall-clock-window', {
      start: [creationLower, creationUpper],
      end: [lastRunningLower, observed.last.after],
      monotonicStart: [creationLowerMono, creationUpperMono],
      monotonicEnd: [lastRunningLowerMono, observed.last.afterMono],
      independentOnlineMs: online,
      witnessReadMonotonic: [witnessReadBeforeMono, witnessReadAfterMono],
      publicTerminalObserved: observed.complete,
      runId: id,
      groupId: group.id,
      status: run.status,
      endReason: run.endReason,
      observationMode: 'module-start-retention; subscribed after actual runId creation',
      witness: witness ?? lease?.latest ?? null,
      gatewayMutationBaseline: gatewayBefore.effects,
      gatewayMutationRequestBaseline: gatewayBefore.requests
        .filter((request) => request.method !== 'GET')
        .map((request) => request.id),
      missing,
      diagnosticBudgetMs: 65_000,
    });
    assertSingleEpochActivityBudget(
      (witness ?? lease?.latest)?.events ?? [],
      online,
      run.endReason ?? '',
    );
    if (!observed.complete)
      throw new BlockedError('65秒诊断窗口内未观察到公开终态；未另设产品终态SLA');
    if (missing.length) throw new BlockedError(missing.join('; '));
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await control?.close();
    } catch (error) {
      try {
        await qa.evidence('activity-observation-cleanup-failure', { error: String(error) });
      } catch {
        /* Preserve the original failure if evidence storage also fails. */
      }
      if (!failed) throw error;
    }
  }
});

test('[AGENT-026] no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  for (const account of accounts)
    await qa.api.require(
      qa.api.post(`/api/accounts/${account.id}/transition`, {
        expectedFrom: 'online',
        to: 'disconnected',
      }),
    );
  qa.agent.enqueueTurns(
    tool('no-account', 'send_message', { text: 'cannot send', idempotency_key: 'no-account' }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(run.steps[0]).toMatchObject({
    kind: 'tool_use',
    isError: true,
    errorCode: 'NO_AVAILABLE_ACCOUNT',
  });
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
});

test('[AGENT-027] raw protocol response truncates to two KiB and remains inspectable', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns({ rawBody: 'invalid'.repeat(1000) }, finish());
  const run = await finished(qa, await trigger(qa, group));
  expect(run.steps[0]!.kind).toBe('protocol_error');
  expect(Buffer.byteLength(run.steps[0]!.rawResponse ?? '', 'utf8')).toBeLessThanOrEqual(2048);
  expect(run.steps[0]!.rawResponse).toBeTruthy();
  expect('invalid'.repeat(1000).startsWith(run.steps[0]!.rawResponse!)).toBe(true);
});

test('[AGENT-028] unknown send times out in five seconds and same key still cannot resend', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 1_500,
    omitEvent: true,
    barrier: { phase: 'before-response', name: 'query-down' },
  });
  qa.agent.enqueueTurns(
    tool('send-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
    {
      ...tool('same-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
      barrier: { phase: 'before-response', name: 'retry-same-key' },
    },
    finish(),
  );
  const id = await trigger(qa, group);
  await qa.gateway.barriers.waitFor('query-down');
  qa.gateway.configure({ unavailable: true });
  const sendRequestAt = Date.parse(
    qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!.at,
  );
  qa.gateway.barriers.release('query-down');
  await qa.agent.barriers.waitFor('retry-same-key', 8_000);
  const timeoutObservedAt = Date.parse(qa.agent.snapshot().turns[1]!.at);
  const toolResponseAt = Date.parse(qa.agent.snapshot().turns[0]!.completedAt!);
  const timeoutResult = results(qa).find((block) => block.tool_use_id === 'send-timeout')!;
  expect(timeoutResult.is_error).toBe(true);
  expect(JSON.parse(timeoutResult.content!).code).toBe('SEND_TIMEOUT');
  qa.gateway.configure({ unavailable: false });
  await eventually(
    () => qa.api.messages(group.id),
    (value) =>
      value.items.some(
        (message) => message.text === 'timeout key' && message.deliveryStatus === 'sent',
      ),
    { timeoutMs: 2_000 },
  );
  qa.agent.barriers.release('retry-same-key');
  expect((await finished(qa, id)).status).toBe('finished');
  expect(qa.agent.snapshot().audits).toHaveLength(1);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
  await qa.evidence('send-timeout-window', {
    startBounds: [toolResponseAt, sendRequestAt],
    latestCompletionObservation: timeoutObservedAt,
    requiredMaximumMs: 5_000,
  });
  if (timeoutObservedAt - toolResponseAt > 5_000)
    throw new BlockedError(
      'SEND_TIMEOUT was observed but public endpoints cannot locate tool-result creation precisely enough to certify the five-second limit; no tolerance was applied',
    );
});

test('[AGENT-029] kick timeout reconciles membership and never executes twice', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.setMembership(group.gatewayGroupId, 'kick-timeout-target', true);
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 1_500,
    omitEvent: true,
  });
  qa.agent.enqueueTurns(
    tool('kick-timeout', 'kick_user', {
      platform_user_id: 'kick-timeout-target',
      reason: 'reconcile',
    }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(run.steps[0]!.isError).toBe(false);
  expect(
    qa.gateway
      .snapshot()
      .groups[0]!.members.some((member) => member.platformUserId === 'kick-timeout-target'),
  ).toBe(false);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/kick')),
  ).toHaveLength(1);
});

test('[AGENT-030] account becoming terminal during send returns SEND_FAILED and run continues', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    barrier: { phase: 'request', name: 'send-before-effect' },
    effectDelayMs: 1_000,
  });
  qa.agent.enqueueTurns(
    tool('terminal-send', 'send_message', {
      text: 'terminal in flight',
      idempotency_key: 'terminal',
    }),
    finish('continued'),
  );
  const id = await trigger(qa, group);
  const hit = await qa.gateway.barriers.waitFor('send-before-effect');
  const request = qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!;
  const sender = (request.body as { accountId: string }).accountId;
  qa.gateway.emitStatus(sender, 'suspended');
  await eventually(
    () => qa.api.accounts(),
    (values) => values.find((account) => account.id === sender)?.status === 'suspended',
  );
  qa.gateway.barriers.release('send-before-effect');
  const run = await finished(qa, id);
  expect(run.status).toBe('finished');
  expect(run.summary).toBe('continued');
  expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'SEND_FAILED' });
  expect(
    qa.gateway.snapshot().messages.filter((message) => message.text === 'terminal in flight'),
  ).toHaveLength(0);
  await qa.evidence('terminal-during-send-barrier', hit);
});

test('[AGENT-031] group write error cancels current run after its step and stops future triggers', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 403,
    code: 'GROUP_WRITE_FORBIDDEN',
    effect: 'none',
  });
  qa.agent.enqueueTurns(
    tool('unreachable-send', 'send_message', {
      text: 'blocked group',
      idempotency_key: 'unreachable',
    }),
    finish('must not request'),
  );
  const id = await trigger(qa, group);
  const run = await finished(qa, id);
  expect(run.status).toBe('cancelled');
  expect(run.endReason).toBe('cancelled');
  expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'GROUP_UNREACHABLE' });
  expect((await qa.api.group(group.id)).status).toBe('unreachable');
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'external',
    text: 'must not trigger',
  });
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  expect(
    await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  ).toHaveLength(1);
  expect(requests(qa)).toHaveLength(1);
});

test('[AGENT-032] twelve distinct turns exhaust budget without a thirteenth request', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueTurns(
    ...Array.from({ length: 13 }, (_, index) =>
      tool(`budget-${index}`, 'get_recent_messages', { limit: index + 1 }),
    ),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('failed');
  expect(run.endReason).toBe('budget_exhausted');
  expect(run.steps).toHaveLength(12);
  expect(requests(qa)).toHaveLength(12);
});

test('[AGENT-033] audit retries resolve before informing agent and do not consume turn budget', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  qa.agent.enqueueAudits(
    { status: 500 },
    { body: {} },
    { body: { verdict: 'pass', reason: 'third attempt' } },
  );
  qa.agent.enqueueTurns(
    tool('audit-retry', 'send_message', {
      text: 'after valid verdict',
      idempotency_key: 'audit-retry',
    }),
    finish(),
  );
  const run = await finished(qa, await trigger(qa, group));
  expect(run.status).toBe('finished');
  expect(run.steps).toHaveLength(2);
  expect(run.steps[0]!.isError).toBe(false);
  expect(qa.agent.snapshot().audits).toHaveLength(3);
  expect(requests(qa)).toHaveLength(2);
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
});
