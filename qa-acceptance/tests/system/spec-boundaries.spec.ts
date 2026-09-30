import { Ajv } from 'ajv';
import WebSocket from 'ws';
import { test, expect } from '../fixtures.js';
import type { AgentResponsePlan } from '../../harness/agent.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { BlockedError } from '../../harness/security.js';
import {
  eventually,
  type AccountStatus,
  type AgentRun,
  type ApiError,
  type Group,
  type SequenceRun,
} from '../../harness/platform-client.js';

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
type Turn = {
  runId: string;
  tools: { name: string; input_schema: Record<string, unknown> }[];
  messages: { role: string; content: Block[] }[];
};
type ReadResult = {
  messages: { msgId: string; text: string; sentAt: string; isOwn: boolean }[];
  truncated: boolean;
};
const tool = (id: string, name: string, input: unknown): AgentResponsePlan => ({
  body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
});
const finish = (text = 'done'): AgentResponsePlan => ({
  body: { stop_reason: 'end_turn', content: [{ type: 'text', text }] },
});
const turns = (qa: QaEnvironment, runId: string): Turn[] =>
  qa.agent
    .snapshot()
    .turns.map((entry) => entry.body as Turn)
    .filter((turn) => turn.runId === runId);
function result(qa: QaEnvironment, runId: string, toolUseId: string): Block {
  const matches = turns(qa, runId).flatMap((turn) =>
    turn.messages.flatMap((message) =>
      message.content.filter(
        (block) => block.type === 'tool_result' && block.tool_use_id === toolUseId,
      ),
    ),
  );
  expect(
    matches.length,
    `tool_result ${toolUseId} must be present in public Agent history`,
  ).toBeGreaterThan(0);
  // A result is legitimately repeated in subsequent complete-history requests.
  for (const block of matches) expect(block).toEqual(matches[0]);
  return matches[0]!;
}
const finished = (qa: QaEnvironment, runId: string) =>
  qa.api.waitFor<AgentRun>(`/api/agent-runs/${runId}`, (run) => run.status !== 'running');

/** Bind every remaining response to the observed run, so an unused sentinel cannot leak into another scenario. */
async function startRun(
  qa: QaEnvironment,
  group: Group,
  label: string,
  first: AgentResponsePlan,
  rest: AgentResponsePlan[],
): Promise<string> {
  const barrier = `spec-${label}-first-turn`;
  qa.agent.enqueueTurns({ ...first, barrier: { phase: 'before-response', name: barrier } });
  try {
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: `spec-trigger-${label}`,
      senderPlatformUserId: 'outside-spec',
      text: `trigger ${label}`,
    });
    const hit = await qa.agent.barriers.waitFor(barrier);
    const runId = (hit.context as { body: Turn }).body.runId;
    expect(runId).toEqual(expect.any(String));
    qa.agent.enqueueTurns(...rest.map((plan) => ({ ...plan, runId })));
    return runId;
  } finally {
    qa.agent.barriers.release(barrier);
  }
}

async function transition(
  qa: QaEnvironment,
  accountId: string,
  from: AccountStatus,
  to: AccountStatus,
) {
  const response = await qa.api.post<{ status: AccountStatus }>(
    `/api/accounts/${accountId}/transition`,
    {
      expectedFrom: from,
      to,
    },
  );
  expect(response.status).toBe(200);
  expect(response.body.status).toBe(to);
  expect((await qa.api.accounts()).find((account) => account.id === accountId)?.status).toBe(to);
}
async function startSequence(
  qa: QaEnvironment,
  group: Group,
  name: string,
  role: 'admin' | 'member',
) {
  const sequence = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name,
      steps: [{ index: 1, accountRole: role, text: name, delaySeconds: 0.2 }],
    }),
  );
  return qa.api.require(
    qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
      sequenceId: sequence.id,
      vars: {},
      stepVars: {},
    }),
    201,
  );
}
const sequenceDone = (qa: QaEnvironment, runId: string) =>
  qa.api.waitFor<SequenceRun>(`/api/sequence-runs/${runId}`, (run) => run.status !== 'running');

test('[BLK-SPEC-001] selection filters online candidates while an already queued 429 keeps its actor and order', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup(3);
  const creator = group.members.find((member) => member.role === 'creator')!;
  const admin = group.members.find((member) => member.role === 'admin')!;
  const members = group.members
    .filter((member) => member.role === 'member')
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
  expect(members).toHaveLength(2);

  await test.step('before selection, an online creator remains eligible beside a limited admin', async () => {
    await transition(qa, admin.accountId, 'online', 'rate_limited');
    const { runId } = await startSequence(qa, group, 'spec-online-creator', 'admin');
    const run = await sequenceDone(qa, runId);
    expect(run.status).toBe('finished');
    expect(run.steps.map((step) => step.status)).toEqual(['sent']);
    expect(
      qa.gateway.snapshot().messages.filter((message) => message.text === 'spec-online-creator'),
    ).toMatchObject([{ accountId: creator.accountId }]);
    await transition(qa, admin.accountId, 'rate_limited', 'online');
  });

  await test.step('member lexical order is applied to the online candidate set', async () => {
    await transition(qa, members[0]!.accountId, 'online', 'rate_limited');
    const { runId } = await startSequence(qa, group, 'spec-online-member', 'member');
    const run = await sequenceDone(qa, runId);
    expect(run.status).toBe('finished');
    expect(run.steps.map((step) => step.status)).toEqual(['sent']);
    expect(
      qa.gateway.snapshot().messages.filter((message) => message.text === 'spec-online-member'),
    ).toMatchObject([{ accountId: members[1]!.accountId }]);
    await transition(qa, members[0]!.accountId, 'rate_limited', 'online');
  });

  await test.step('after selection, a 429 retains the queued message and FIFO instead of switching to the creator', async () => {
    const path = `/groups/${group.gatewayGroupId}/send`;
    const before = qa.gateway.snapshot().requests.filter((request) => request.path === path).length;
    qa.gateway.enqueue(path, {
      status: 429,
      code: 'RATE_LIMITED',
      body: { retryAfterSeconds: 3 },
      effect: 'none',
    });
    const { runId } = await startSequence(qa, group, 'spec-queued-before-429', 'admin');
    await eventually(
      () => qa.api.accounts(),
      (accounts) =>
        accounts.find((account) => account.id === admin.accountId)?.status === 'rate_limited',
    );
    const queued = await qa.api.sequenceRun(runId);
    expect(queued.status).toBe('running');
    expect(queued.steps[0]!.status).not.toBe('skipped');
    const firstCall = qa.gateway.snapshot().requests.filter((request) => request.path === path)[
      before
    ]!;
    expect(firstCall.responseStatus).toBe(429);
    expect(firstCall.body).toMatchObject({
      accountId: admin.accountId,
      text: 'spec-queued-before-429',
    });
    const following = await qa.api.send(group.id, admin.accountId, 'spec-later-same-account');
    const page = await qa.api.messages(group.id);
    expect(
      page.items.find((message) => message.clientMsgId === following.clientMsgId)?.deliveryStatus,
    ).toBe('queued');
    expect(qa.gateway.snapshot().requests.filter((request) => request.path === path)).toHaveLength(
      before + 1,
    );
    const run = await sequenceDone(qa, runId);
    expect(run.status).toBe('finished');
    expect(run.steps[0]!.status).toBe('sent');
    await eventually(
      () => qa.api.messages(group.id),
      (value) =>
        value.items.some(
          (message) =>
            message.clientMsgId === following.clientMsgId && message.deliveryStatus === 'sent',
        ),
    );
    const calls = qa.gateway
      .snapshot()
      .requests.filter((request) => request.path === path)
      .slice(before);
    expect(calls).toHaveLength(3);
    expect(calls[1]!.body).toMatchObject(firstCall.body as Record<string, unknown>);
    expect(
      qa.gateway
        .snapshot()
        .messages.filter(
          (message) =>
            message.text.startsWith('spec-queued') || message.text === 'spec-later-same-account',
        )
        .map((message) => ({ accountId: message.accountId, text: message.text })),
    ).toEqual([
      { accountId: admin.accountId, text: 'spec-queued-before-429' },
      { accountId: admin.accountId, text: 'spec-later-same-account' },
    ]);
    await qa.evidence('spec001-selection-and-queued-retry', { group, run, calls });
  });
});

test('[BLK-SPEC-003] manual states follow CAS and committed events with explicit disconnect effects', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const accountId = accounts[1]!.id;
  type Frame = {
    type: string;
    success?: boolean;
    payload?: { accountId?: string; from?: string; to?: string };
  };
  const frames: Frame[] = [];
  const observations: { frame: Frame; state: Promise<AccountStatus | undefined> }[] = [];
  const ws = new WebSocket(new URL('/ws', qa.api.baseUrl).toString().replace(/^http/, 'ws'));
  ws.on('message', (raw) => {
    const frame = JSON.parse(raw.toString()) as Frame;
    frames.push(frame);
    if (frame.type === 'account_status_changed' && frame.payload?.accountId === accountId)
      observations.push({
        frame,
        state: qa.api
          .accounts()
          .then((list) => list.find((account) => account.id === accountId)?.status),
      });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'auth', accessToken: qa.api.token }));
    await eventually(
      async () => frames,
      (values) => values.some((frame) => frame.type === 'auth' && frame.success),
    );
    const moves: [AccountStatus, AccountStatus][] = [
      ['online', 'rate_limited'],
      ['rate_limited', 'online'],
      ['online', 'disconnected'],
      ['disconnected', 'online'],
      ['online', 'idle'],
      ['idle', 'online'],
    ];
    for (const [from, to] of moves) {
      const before = observations.length;
      const disconnects = qa.gateway
        .snapshot()
        .requests.filter((request) => request.path === `/accounts/${accountId}/disconnect`).length;
      await transition(qa, accountId, from, to);
      await eventually(
        async () => observations.slice(before),
        (values) =>
          values.some(({ frame }) => frame.payload?.from === from && frame.payload?.to === to),
      );
      const matching = observations
        .slice(before)
        .filter(({ frame }) => frame.payload?.from === from && frame.payload?.to === to);
      for (const observation of matching) expect(await observation.state).toBe(to);
      if (to === 'idle' || to === 'disconnected') {
        expect(
          qa.gateway
            .snapshot()
            .requests.filter((request) => request.path === `/accounts/${accountId}/disconnect`)
            .length,
        ).toBeGreaterThan(disconnects);
        expect(
          qa.gateway.snapshot().accounts.find((account) => account.id === accountId)?.connected,
        ).toBe(false);
        const denied = await qa.api.post<ApiError>(`/api/groups/${group.id}/send`, {
          accountId,
          text: 'must remain local',
        });
        expect(denied.status).toBe(409);
        expect(denied.body.error.code).toBe('ACCOUNT_UNAVAILABLE');
      }
    }
    const count = observations.length;
    const stale = await qa.api.post<ApiError>(`/api/accounts/${accountId}/transition`, {
      expectedFrom: 'idle',
      to: 'online',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CAS_CONFLICT');
    const same = await qa.api.post<ApiError>(`/api/accounts/${accountId}/transition`, {
      expectedFrom: 'online',
      to: 'online',
    });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect((await qa.api.accounts()).find((account) => account.id === accountId)?.status).toBe(
      'online',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(observations.slice(count)).toEqual([]);
    expect(
      qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
    ).toEqual([]);
    await qa.evidence('spec003-manual-state-commits', {
      frames,
      observations: await Promise.all(
        observations.map(async ({ frame, state }) => ({ frame, stateAtReceipt: await state })),
      ),
      account: (await qa.api.accounts()).find((account) => account.id === accountId),
      note: '不为手动 online 添加 connect 要求；不为无 retryAfterSeconds 的手动 rate_limited 添加自动恢复期限。',
    });
  } finally {
    ws.close();
  }
});

test('[BLK-SPEC-004] mixed protocol errors accumulate while a legal business error resets the streak', async ({
  qa,
}) => {
  await qa.api.login();
  const first = (await qa.api.createGroup()).group;
  const mixedId = await startRun(qa, first, 'mixed-protocol', { rawBody: 'not-json' }, [
    tool('unknown-mixed', 'not_a_tool', {}),
    tool('invalid-mixed', 'send_message', { text: 42 }),
    finish('must not request a fourth turn'),
  ]);
  const mixed = await finished(qa, mixedId);
  expect(mixed.status).toBe('failed');
  expect(mixed.endReason).toBe('protocol_errors');
  expect(mixed.steps.map((step) => step.errorCode)).toEqual([
    'BAD_JSON',
    'UNKNOWN_TOOL',
    'INVALID_INPUT',
  ]);
  expect(mixed.steps.map((step) => step.kind)).toEqual(['protocol_error', 'tool_use', 'tool_use']);
  expect(turns(qa, mixedId)).toHaveLength(3);
  const unknown = result(qa, mixedId, 'unknown-mixed');
  expect(unknown.is_error).toBe(true);
  expect(JSON.parse(unknown.content!).code).toBe('UNKNOWN_TOOL');
  expect(mixed.steps[2]).toMatchObject({ toolUseId: 'invalid-mixed', isError: true });
  expect(qa.agent.snapshot().audits).toHaveLength(0);

  const second = (await qa.api.createGroup()).group;
  for (const member of second.members)
    await transition(qa, member.accountId, 'online', 'disconnected');
  const resetId = await startRun(qa, second, 'business-resets', { rawBody: 'not-json' }, [
    tool('unknown-before-reset', 'not_a_tool', {}),
    tool('valid-business-error', 'send_message', {
      text: 'no online account',
      idempotency_key: 'no-actor',
    }),
    { rawBody: 'not-json' },
    tool('invalid-after-reset', 'get_recent_messages', { limit: 'wrong-type' }),
    finish('a legal tool response cleared the previous two protocol errors'),
  ]);
  const reset = await finished(qa, resetId);
  expect(reset.status).toBe('finished');
  expect(reset.endReason).toBe('final');
  expect(reset.steps).toHaveLength(6);
  expect(reset.steps.slice(0, 5).map((step) => step.errorCode)).toEqual([
    'BAD_JSON',
    'UNKNOWN_TOOL',
    'NO_AVAILABLE_ACCOUNT',
    'BAD_JSON',
    'INVALID_INPUT',
  ]);
  expect(turns(qa, resetId)).toHaveLength(6);
  const business = result(qa, resetId, 'valid-business-error');
  expect(business.is_error).toBe(true);
  expect(JSON.parse(business.content!).code).toBe('NO_AVAILABLE_ACCOUNT');
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toEqual([]);
  await qa.evidence('spec004-protocol-counter', {
    mixed,
    reset,
    mixedTurns: turns(qa, mixedId),
    resetTurns: turns(qa, resetId),
  });
});

test('[BLK-SPEC-005] cancellation overlapping inconclusive audit ends stably without side effects or a new turn', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const barrier = 'spec-cancel-third-audit';
  qa.agent.enqueueAudits(
    { status: 500, rawBody: 'first unknown' },
    { rawBody: 'second invalid JSON' },
    { body: { verdict: 'unknown' }, barrier: { phase: 'before-response', name: barrier } },
  );
  try {
    const runId = await startRun(
      qa,
      group,
      'cancel-audit',
      tool('overlap-audit', 'send_message', {
        text: 'never execute without audit pass',
        idempotency_key: 'spec-overlap',
      }),
      [finish('must not continue after either terminating condition')],
    );
    let hit;
    try {
      hit = await qa.agent.barriers.waitFor(barrier, 45_000);
    } catch (error) {
      const stalled = await qa.api.agentRun(runId);
      await qa.evidence('spec005-overlap-not-established', {
        run: stalled,
        audits: qa.agent.snapshot().audits,
        error: String(error),
      });
      expect(['running/null', 'blocked/audit_blocked', 'failed/wall_clock']).toContain(
        `${stalled.status}/${stalled.endReason ?? null}`,
      );
      expect(turns(qa, runId)).toHaveLength(1);
      expect(
        qa.gateway
          .snapshot()
          .requests.filter(
            (request) => request.path.endsWith('/send') || request.path.endsWith('/kick'),
          ),
      ).toEqual([]);
      throw new BlockedError(
        '未在45秒夹具观察窗内建立第三审计响应与关闭开关的重叠；该窗口不是产品审计重试SLA',
      );
    }
    const beforeCancellation = await qa.api.agentRun(runId);
    const firstTurnAt = Date.parse(
      qa.agent.snapshot().turns.find((entry) => (entry.body as Turn).runId === runId)!.at,
    );
    if (beforeCancellation.status !== 'running' || Date.now() - firstTurnAt >= 50_000) {
      await qa.evidence('spec005-overlap-window-lost', { hit, beforeCancellation, firstTurnAt });
      expect(['running/null', 'blocked/audit_blocked', 'failed/wall_clock']).toContain(
        `${beforeCancellation.status}/${beforeCancellation.endReason ?? null}`,
      );
      expect(turns(qa, runId)).toHaveLength(1);
      expect(
        qa.gateway
          .snapshot()
          .requests.filter(
            (request) => request.path.endsWith('/send') || request.path.endsWith('/kick'),
          ),
      ).toEqual([]);
      throw new BlockedError('审计响应前运行已终止或过近60秒预算，不能证明仅审计与取消的受控重叠');
    }
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
    const cancellationObserved = await qa.api.group(group.id);
    expect(cancellationObserved.agentEnabled).toBe(false);
    qa.agent.barriers.release(barrier);
    const run = await finished(qa, runId);
    expect(['blocked/audit_blocked', 'cancelled/cancelled']).toContain(
      `${run.status}/${run.endReason}`,
    );
    expect(run.steps).toHaveLength(1);
    expect(qa.agent.snapshot().audits).toHaveLength(3);
    expect(turns(qa, runId)).toHaveLength(1);
    expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
    expect(
      qa.gateway
        .snapshot()
        .requests.filter(
          (request) => request.path.endsWith('/send') || request.path.endsWith('/kick'),
        ),
    ).toEqual([]);
    const samples: { observedAt: string; run: AgentRun }[] = [];
    for (let index = 0; index < 4; index++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const current = await qa.api.agentRun(runId);
      samples.push({ observedAt: new Date().toISOString(), run: current });
      expect(current).toEqual(run);
      expect(turns(qa, runId)).toHaveLength(1);
      expect(qa.agent.snapshot().audits).toHaveLength(3);
      expect(
        qa.gateway
          .snapshot()
          .requests.filter(
            (request) => request.path.endsWith('/send') || request.path.endsWith('/kick'),
          ),
      ).toEqual([]);
    }
    await qa.evidence('spec005-controlled-overlap', {
      hit,
      cancellationObserved,
      run,
      audits: qa.agent.snapshot().audits,
      samples,
      boundary:
        '第三次审计响应被屏障挂起时关闭 agent；允许实际已生效条件对应的两个终态。不证明同时发生、60秒预算重叠或永久稳定。',
    });
  } finally {
    qa.agent.barriers.release(barrier);
  }
});

test('[BLK-SPEC-006] versioned profile rules and explicit tool limits have independent boundary oracles', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  type Profile = Group & { name: string | null; description: string | null };
  const readProfile = () => qa.api.require(qa.api.get<Profile>(`/api/groups/${group.id}`));
  await test.step('D024 retained profile: trim, UTF-16 lengths, omission and clearing', async () => {
    await qa.api.require(
      qa.api.patch(`/api/groups/${group.id}`, {
        name: ` ${'名'.repeat(80)} `,
        description: ` ${'介'.repeat(500)} `,
      }),
    );
    expect(await readProfile()).toMatchObject({
      name: '名'.repeat(80),
      description: '介'.repeat(500),
    });
    const invalid: Record<string, unknown>[] = [
      { name: '名'.repeat(81) },
      { name: '' },
      { name: '   ' },
      { name: null },
      { description: '介'.repeat(501) },
      { description: null },
    ];
    for (const body of invalid) {
      const before = await readProfile();
      const response = await qa.api.patch<ApiError>(`/api/groups/${group.id}`, body);
      expect(response.status).toBe(400);
      expect(await readProfile()).toMatchObject({
        name: before.name,
        description: before.description,
      });
    }
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '😀'.repeat(40) }));
    expect(await readProfile()).toMatchObject({
      name: '😀'.repeat(40),
      description: '介'.repeat(500),
    });
    expect((await qa.api.patch(`/api/groups/${group.id}`, { name: '😀'.repeat(41) })).status).toBe(
      400,
    );
    await qa.api.require(
      qa.api.patch(`/api/groups/${group.id}`, { description: '😀'.repeat(250) }),
    );
    expect(
      (await qa.api.patch(`/api/groups/${group.id}`, { description: '😀'.repeat(251) })).status,
    ).toBe(400);
    await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { description: '   ' }));
    expect(await readProfile()).toMatchObject({ name: '😀'.repeat(40), description: null });
    await qa.evidence('spec006-profile-policy', {
      profile: await readProfile(),
      source: 'D024 / docs/group-directory-profile-proposal.md:68',
      policyKind: 'versioned-retained-profile',
    });
  });

  await test.step('limit 100000 clamps to fifty independently of the advertised schema', async () => {
    const countGroup = (await qa.api.createGroup()).group;
    for (let index = 0; index < 51; index++)
      qa.gateway.emitMessage({
        groupId: countGroup.gatewayGroupId,
        msgId: `c${index}`,
        senderPlatformUserId: 'x',
        text: `${index}`,
        sentAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    await eventually(
      () => qa.api.messages(countGroup.id),
      (page) => page.items.length === 50 && page.nextCursor !== null,
    );
    const runId = await startRun(
      qa,
      countGroup,
      'count-clamp',
      tool('count-clamp', 'get_recent_messages', { limit: 100000 }),
      [finish()],
    );
    const run = await finished(qa, runId);
    expect(run.status).toBe('finished');
    expect(run.steps[0]!.isError).toBe(false);
    const block = result(qa, runId, 'count-clamp');
    expect(block.is_error ?? false).toBe(false);
    const value = JSON.parse(block.content!) as ReadResult;
    expect(value.messages).toHaveLength(50);
    expect(value.messages.map((message) => message.msgId)).toEqual([
      ...Array.from({ length: 49 }, (_, index) => `c${index + 2}`),
      'spec-trigger-count-clamp',
    ]);
    const schema = turns(qa, runId)[0]!.tools.find(
      (item) => item.name === 'get_recent_messages',
    )!.input_schema;
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(
      validate({ limit: 100000 }),
      'SUT advertised schema must permit the original explicit clamp example',
    ).toBe(true);
    await qa.evidence('spec006-limit-clamp', { schema, run, result: value });
  });

  await test.step('zero, negative and fractional limits obey the versioned advertised input schema', async () => {
    const inputGroup = (await qa.api.createGroup()).group;
    for (const [label, limit] of [
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
    ] as const) {
      const toolUseId = `schema-${label}`;
      const runId = await startRun(
        qa,
        inputGroup,
        toolUseId,
        tool(toolUseId, 'get_recent_messages', { limit }),
        [finish()],
      );
      const run = await finished(qa, runId);
      expect(run.status).toBe('finished');
      const schema = turns(qa, runId)[0]!.tools.find(
        (item) => item.name === 'get_recent_messages',
      )!.input_schema;
      const schemaAccepts = new Ajv({ strict: false }).compile(schema)({ limit });
      const block = result(qa, runId, toolUseId);
      const content = JSON.parse(block.content!) as ReadResult & { code?: string };
      if (!schemaAccepts) {
        expect(block.is_error).toBe(true);
        expect(content.code).toBe('INVALID_INPUT');
        expect(run.steps[0]).toMatchObject({
          kind: 'tool_use',
          errorCode: 'INVALID_INPUT',
          isError: true,
        });
      } else {
        // This checks the advertised contract's own consistency, not a QA-invented
        // rounding/default/minimum policy. The exact returned selection is recorded only.
        expect(block.is_error ?? false).toBe(false);
        expect(Array.isArray(content.messages)).toBe(true);
        expect(content.messages.length).toBeLessThanOrEqual(50);
        expect(typeof content.truncated).toBe('boolean');
      }
      expect(Buffer.byteLength(block.content!, 'utf8')).toBeLessThanOrEqual(8192);
      await qa.evidence(`spec006-public-schema-${label}`, {
        input: { limit },
        schema,
        schemaAccepts,
        actual: content,
        judgment:
          '公开schema自洽检查；不固定0/-1/1.5的长期归一化业务规则。50上限与100000截50仍由原文独立裁判。',
      });
      await qa.api.require(qa.api.patch(`/api/groups/${inputGroup.id}`, { agentEnabled: false }));
    }
  });

  await test.step('ASCII/CJK text boundaries and byte caps, with Unicode tool behavior recorded separately', async () => {
    const sizeGroup = (await qa.api.createGroup()).group;
    const sourceText: Record<string, string> = {
      exact: 'A'.repeat(500),
      over: '文'.repeat(501),
      emoji: '😀'.repeat(501),
    };
    for (const [msgId, text] of Object.entries(sourceText))
      qa.gateway.emitMessage({
        groupId: sizeGroup.gatewayGroupId,
        msgId,
        senderPlatformUserId: 'x',
        text,
        sentAt: new Date(
          Date.UTC(2026, 0, 1, 0, 0, Object.keys(sourceText).indexOf(msgId)),
        ).toISOString(),
      });
    await eventually(
      () => qa.api.messages(sizeGroup.id),
      (page) => page.items.length === 3,
    );
    const runId = await startRun(
      qa,
      sizeGroup,
      'text-boundaries',
      tool('text-boundaries', 'get_recent_messages', { limit: 10 }),
      [finish()],
    );
    const run = await finished(qa, runId);
    expect(run.status).toBe('finished');
    const content = result(qa, runId, 'text-boundaries').content!;
    const value = JSON.parse(content) as ReadResult;
    expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(8192);
    expect(value.truncated).toBe(true);
    expect(value.messages.find((message) => message.msgId === 'exact')?.text).toBe(
      sourceText.exact,
    );
    const shortened = value.messages.find((message) => message.msgId === 'over')!.text;
    expect(shortened.length).toBeLessThanOrEqual(500);
    expect(shortened.length).toBeGreaterThan(0);
    expect(sourceText.over!.startsWith(shortened)).toBe(true);
    for (const step of run.steps)
      expect(Array.from(step.resultSummary).length).toBeLessThanOrEqual(200);
    const emoji = value.messages.find((message) => message.msgId === 'emoji')?.text;
    await qa.evidence('spec006-unicode-compatibility-observation', {
      source: {
        utf16Units: sourceText.emoji!.length,
        codePoints: Array.from(sourceText.emoji!).length,
      },
      actual:
        emoji === undefined
          ? null
          : {
              utf16Units: emoji.length,
              codePoints: Array.from(emoji).length,
              utf8Bytes: Buffer.byteLength(emoji, 'utf8'),
            },
      verdict: 'OBSERVATION_ONLY',
      limitation:
        '工具的“字”未指定 Unicode 计量；不以 emoji 截断长度生成严格通过或失败。D024 资料 UTF-16 规则另行严格验证。',
    });

    const bulkGroup = (await qa.api.createGroup()).group;
    for (let index = 0; index < 30; index++)
      qa.gateway.emitMessage({
        groupId: bulkGroup.gatewayGroupId,
        msgId: `bulk-${index}`,
        senderPlatformUserId: 'x',
        text: '文'.repeat(400),
        sentAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    await eventually(
      () => qa.api.messages(bulkGroup.id),
      (page) => page.items.length === 30,
    );
    const raw = '坏响应'.repeat(1000);
    const bulkId = await startRun(qa, bulkGroup, 'byte-caps', { rawBody: raw }, [
      tool('byte-caps', 'get_recent_messages', { limit: 50 }),
      finish(),
    ]);
    const bulk = await finished(qa, bulkId);
    expect(bulk.status).toBe('finished');
    expect(bulk.steps[0]).toMatchObject({ kind: 'protocol_error', errorCode: 'BAD_JSON' });
    const retained = bulk.steps[0]!.rawResponse!;
    expect(typeof retained).toBe('string');
    expect(retained.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(retained, 'utf8')).toBeLessThanOrEqual(2048);
    expect(raw.startsWith(retained)).toBe(true);
    const bulkContent = result(qa, bulkId, 'byte-caps').content!;
    const bulkValue = JSON.parse(bulkContent) as ReadResult;
    expect(Buffer.byteLength(bulkContent, 'utf8')).toBeLessThanOrEqual(8192);
    expect(bulkValue.truncated).toBe(true);
    expect(bulkValue.messages.length).toBeGreaterThan(0);
    expect(bulkValue.messages.length).toBeLessThanOrEqual(31);
    for (const step of bulk.steps)
      expect(Array.from(step.resultSummary).length).toBeLessThanOrEqual(200);
    await qa.evidence('spec006-byte-caps', {
      run: bulk,
      result: bulkValue,
      contentBytes: Buffer.byteLength(bulkContent, 'utf8'),
      rawResponseBytes: Buffer.byteLength(retained, 'utf8'),
    });
  });
});
