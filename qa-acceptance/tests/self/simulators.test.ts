import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { AgentSimulator } from '../../harness/agent.js';
import { GatewaySimulator, type GatewayEvent } from '../../harness/gateway.js';
import { BarrierController } from '../../harness/barrier.js';
import { waitForValue } from '../../harness/http-server.js';

// Only loopback simulators created by this file are contacted. No SUT/config/DB is imported.
async function post(
  url: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function gateway(t: TestContext): Promise<GatewaySimulator> {
  const instance = await new GatewaySimulator({
    accountIds: ['owner', 'admin', 'member'],
    config: { kickResponseDelayMs: 0 },
  }).start();
  t.after(() => instance.close());
  return instance;
}

async function group(gateway: GatewaySimulator): Promise<string> {
  for (const id of ['owner', 'admin', 'member'])
    await post(`${gateway.url}/accounts/${id}/connect`, {});
  return String((await post(`${gateway.url}/groups`, { creatorAccountId: 'owner' })).body.groupId);
}

async function add(gateway: GatewaySimulator, groupId: string, id: string): Promise<void> {
  const invitation = await post(`${gateway.url}/groups/${groupId}/invite`, {});
  const response = await post(`${gateway.url}/groups/${groupId}/join`, {
    accountId: id,
    inviteLink: invitation.body.inviteLink,
  });
  assert.equal(response.status, 202);
  await waitForValue(
    () =>
      gateway
        .snapshot()
        .groups.find((item) => item.groupId === groupId)
        ?.members.find((item) => item.platformUserId === `platform-${id}`),
    2_000,
    'joined member',
  );
}

async function stream(
  url: string,
): Promise<{ read: (count: number) => Promise<GatewayEvent[]>; close: () => void }> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = response.body?.getReader();
  assert.ok(reader);
  let pending = '';
  return {
    read: async (count) => {
      const frames: GatewayEvent[] = [];
      const timer = setTimeout(() => controller.abort(), 2_000);
      try {
        while (frames.length < count) {
          let boundary = pending.indexOf('\n\n');
          while (boundary >= 0) {
            const frame = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const data = frame.split('\n').find((line) => line.startsWith('data: '));
            if (data) {
              const payload = JSON.parse(data.slice(6)) as GatewayEvent['data'];
              frames.push({
                eventId: Number(payload.eventId),
                type: payload.type as GatewayEvent['type'],
                data: payload,
              });
            }
            if (frames.length >= count) return frames;
            boundary = pending.indexOf('\n\n');
          }
          const chunk = await reader.read();
          assert.equal(chunk.done, false, 'SSE closed before requested frames');
          pending += new TextDecoder().decode(chunk.value);
        }
        return frames;
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => controller.abort(),
  };
}

test('barriers are observable, released explicitly, and preserve their hit evidence', async () => {
  const barriers = new BarrierController();
  let passed = false;
  const work = barriers.hit('effect', { clientMsgId: 'c1' }).then(() => {
    passed = true;
  });
  const hit = await barriers.waitFor('effect');
  assert.equal(passed, false);
  assert.deepEqual(hit.context, { clientMsgId: 'c1' });
  barriers.release('effect');
  await work;
  assert.equal(passed, true);
  assert.equal(barriers.snapshot()[0]?.hits, 1);
  await assert.rejects(barriers.waitFor('never', 5), /not reached/);
});

test('Gateway connect identity is stable; disconnected and terminal accounts enforce errors', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  await post(`${g.url}/accounts/member/disconnect`, {});
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/send`, {
        accountId: 'member',
        clientMsgId: 'offline',
        text: 'x',
      })
    ).body.code,
    'ACCOUNT_OFFLINE',
  );
  const first = await post(`${g.url}/accounts/member/connect`, {});
  await post(`${g.url}/accounts/member/disconnect`, {});
  const second = await post(`${g.url}/accounts/member/connect`, {});
  assert.equal(first.body.platformUserId, second.body.platformUserId);
  g.emitStatus('member', 'session_expired');
  assert.deepEqual(await post(`${g.url}/accounts/member/connect`, {}), {
    status: 401,
    body: { code: 'SESSION_EXPIRED' },
  });
  assert.throws(() => g.emitStatus('member', 'suspended'), /cannot change/);
});

test('creator exists without join event; join receipt precedes membership and promote eligibility', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  assert.deepEqual(g.snapshot().groups[0]?.members, [
    { platformUserId: 'platform-owner', role: 'creator' },
  ]);
  assert.equal(g.snapshot().events.length, 0);
  g.configure({ joinDelayMs: 80 });
  const invite = await post(`${g.url}/groups/${id}/invite`, {});
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/join`, {
        accountId: 'admin',
        inviteLink: invite.body.inviteLink,
      })
    ).status,
    202,
  );
  assert.equal(
    (await post(`${g.url}/groups/${id}/promote`, { byAccountId: 'owner', accountId: 'admin' })).body
      .code,
    'NOT_MEMBER_YET',
  );
  await waitForValue(
    () => g.snapshot().events.find((event) => event.type === 'member_joined'),
    1_000,
    'member_joined',
  );
  assert.equal(
    (await post(`${g.url}/groups/${id}/promote`, { byAccountId: 'owner', accountId: 'admin' }))
      .status,
    200,
  );
  assert.equal(
    g.snapshot().groups[0]?.members.find((item) => item.platformUserId === 'platform-admin')?.role,
    'admin',
  );
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/join`, {
        accountId: 'admin',
        inviteLink: invite.body.inviteLink,
      })
    ).body.code,
    'ALREADY_MEMBER',
  );
  assert.equal(g.snapshot().events.filter((event) => event.type === 'member_joined').length, 1);
});

test('join can stay accepted forever without becoming a member', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  const invite = await post(`${g.url}/groups/${id}/invite`, {});
  g.enqueue(`/groups/${id}/join`, { omitEvent: true });
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/join`, {
        accountId: 'admin',
        inviteLink: invite.body.inviteLink,
      })
    ).status,
    202,
  );
  assert.equal(g.snapshot().groups[0]?.members.length, 1);
  assert.equal(g.snapshot().events.length, 0);
});

test('actual membership alone does not permit promote before member_joined is published', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  const invite = await post(`${g.url}/groups/${id}/invite`, {});
  g.enqueue(`/groups/${id}/join`, {
    barrier: { phase: 'after-effect', name: 'joined-before-event' },
  });
  const pending = post(`${g.url}/groups/${id}/join`, {
    accountId: 'admin',
    inviteLink: invite.body.inviteLink,
  });
  await g.barriers.waitFor('joined-before-event');
  assert.ok(
    g.snapshot().groups[0]?.members.some((member) => member.platformUserId === 'platform-admin'),
  );
  assert.equal(
    (await post(`${g.url}/groups/${id}/promote`, { byAccountId: 'owner', accountId: 'admin' })).body
      .code,
    'NOT_MEMBER_YET',
  );
  g.barriers.release('joined-before-event');
  await pending;
  assert.equal(
    (await post(`${g.url}/groups/${id}/promote`, { byAccountId: 'owner', accountId: 'admin' }))
      .status,
    200,
  );
});

test('invitation readiness and expiry are independent and replacement links can succeed', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  g.configure({ inviteReadyAfterMs: 200 });
  const first = await post(`${g.url}/groups/${id}/invite`, {});
  assert.equal(first.body.readyAfterMs, 200);
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/join`, {
        accountId: 'admin',
        inviteLink: first.body.inviteLink,
      })
    ).body.code,
    'INVITE_NOT_READY',
  );
  g.expireInvite(String(first.body.inviteLink));
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/join`, {
        accountId: 'admin',
        inviteLink: first.body.inviteLink,
      })
    ).body.code,
    'INVITE_EXPIRED',
  );
  g.configure({ inviteReadyAfterMs: 0 });
  await add(g, id, 'admin');
});

test('after-effect barrier exposes changed members before event and response', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  g.setMembership(id, 'external-user', true);
  const before = g.snapshot().events.length;
  g.enqueue(`/groups/${id}/kick`, { barrier: { phase: 'after-effect', name: 'kicked' } });
  let returned = false;
  const pending = post(`${g.url}/groups/${id}/kick`, {
    byAccountId: 'owner',
    targetPlatformUserId: 'external-user',
  }).then((value) => {
    returned = true;
    return value;
  });
  await g.barriers.waitFor('kicked');
  assert.equal(returned, false);
  assert.equal(
    g.snapshot().groups[0]?.members.some((item) => item.platformUserId === 'external-user'),
    false,
  );
  assert.equal(g.snapshot().events.length, before);
  g.barriers.release('kicked');
  assert.equal((await pending).status, 200);
  assert.equal(g.snapshot().events.at(-1)?.type, 'member_left');
});

test('request and before-response barriers bracket create side effects', async (t) => {
  const g = await gateway(t);
  await post(`${g.url}/accounts/owner/connect`, {});
  g.enqueue(
    '/groups',
    { barrier: { phase: 'request', name: 'create-request' } },
    { barrier: { phase: 'before-response', name: 'create-response' } },
  );
  const first = post(`${g.url}/groups`, { creatorAccountId: 'owner' });
  await g.barriers.waitFor('create-request');
  assert.equal(g.snapshot().groups.length, 0);
  g.barriers.release('create-request');
  await first;
  const second = post(`${g.url}/groups`, { creatorAccountId: 'owner' });
  await g.barriers.waitFor('create-response');
  assert.equal(g.snapshot().groups.length, 2);
  g.barriers.release('create-response');
  await second;
});

test('Gateway deliberately sends duplicates for identical clientMsgId and query returns first landing', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await post(`${g.url}/groups/${id}/send`, {
          accountId: 'owner',
          clientMsgId: 'same',
          text: 'hi',
        })
      ).status,
      202,
    );
  await waitForValue(
    () => (g.snapshot().messages.length === 2 ? true : undefined),
    1_000,
    'two sends',
  );
  const messages = g.snapshot().messages;
  assert.notEqual(messages[0]?.msgId, messages[1]?.msgId);
  const lookup = await fetch(`${g.url}/groups/${id}/messages/by-client-id/same`);
  assert.deepEqual(await lookup.json(), { msgId: messages[0]?.msgId, sentAt: messages[0]?.sentAt });
  assert.equal(g.snapshot().effects.filter((effect) => effect.kind === 'send').length, 2);
});

test('message and message_sent may precede delayed send 202 response', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  g.configure({ sendEventOrder: 'message-first' });
  g.enqueue(`/groups/${id}/send`, { responseDelayMs: 180, effectDelayMs: 10 });
  let returned = false;
  const pending = post(`${g.url}/groups/${id}/send`, {
    accountId: 'owner',
    clientMsgId: 'early',
    text: 'hi',
  }).then((value) => {
    returned = true;
    return value;
  });
  await waitForValue(
    () => (g.snapshot().events.length === 2 ? true : undefined),
    1_000,
    'early event',
  );
  assert.equal(returned, false);
  assert.deepEqual(
    g.snapshot().events.map((event) => event.type),
    ['message', 'message_sent'],
  );
  assert.equal((await pending).status, 202);
});

test('504 separately models later landing, definitive non-landing and query unavailability', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  const path = `/groups/${id}/send`;
  g.enqueue(
    path,
    { status: 504, code: 'NETWORK_TIMEOUT', effect: 'apply', effectDelayMs: 80 },
    { status: 504, code: 'NETWORK_TIMEOUT', effect: 'none' },
  );
  assert.equal(
    (await post(`${g.url}${path}`, { accountId: 'owner', clientMsgId: 'late', text: 'hi' })).status,
    504,
  );
  assert.equal((await fetch(`${g.url}/groups/${id}/messages/by-client-id/late`)).status, 404);
  await waitForValue(
    () => g.snapshot().messages.find((message) => message.clientMsgId === 'late'),
    1_000,
    'late landing',
  );
  const query = `/groups/${id}/messages/by-client-id/late`;
  g.enqueue(query, { method: 'GET', status: 503, code: 'SERVICE_UNAVAILABLE' });
  assert.equal((await fetch(`${g.url}${query}`)).status, 503);
  assert.equal((await fetch(`${g.url}${query}`)).status, 200);
  await post(`${g.url}${path}`, { accountId: 'owner', clientMsgId: 'never', text: 'hi' });
  assert.equal(
    g.snapshot().messages.some((message) => message.clientMsgId === 'never'),
    false,
  );
});

test('RATE_LIMITED prohibits send, resets its deadline on violations, and allows disconnect', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  const path = `/groups/${id}/send`;
  g.enqueue(path, { status: 429, code: 'RATE_LIMITED', body: { retryAfterSeconds: 1 } });
  assert.equal(
    (await post(`${g.url}${path}`, { accountId: 'owner', clientMsgId: 'one', text: 'x' })).status,
    429,
  );
  const until =
    g.snapshot().accounts.find((account) => account.id === 'owner')?.rateLimitedUntil ?? '';
  assert.equal(
    (await post(`${g.url}${path}`, { accountId: 'owner', clientMsgId: 'two', text: 'x' })).body
      .retryAfterSeconds,
    1,
  );
  const next =
    g.snapshot().accounts.find((account) => account.id === 'owner')?.rateLimitedUntil ?? '';
  assert.ok(Date.parse(next) >= Date.parse(until));
  assert.equal(g.snapshot().messages.length, 0);
  assert.equal((await post(`${g.url}/accounts/owner/disconnect`, {})).status, 200);
});

test('terminal error without account_status still prohibits future connect and removes membership', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  g.enqueue(`/groups/${id}/send`, { status: 403, code: 'ACCOUNT_SUSPENDED' });
  await post(`${g.url}/groups/${id}/send`, {
    accountId: 'owner',
    clientMsgId: 'terminal',
    text: 'x',
  });
  assert.equal(g.snapshot().groups[0]?.members.length, 0);
  assert.equal(
    g.snapshot().events.some((event) => event.type === 'account_status'),
    false,
  );
  assert.equal(g.snapshot().events.at(-1)?.type, 'member_left');
  assert.equal((await post(`${g.url}/accounts/owner/connect`, {})).body.code, 'ACCOUNT_SUSPENDED');
});

test('asynchronous message_failed has no landed message and marks group write restriction', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  g.enqueue(`/groups/${id}/send`, { failureCode: 'GROUP_WRITE_FORBIDDEN' });
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/send`, {
        accountId: 'owner',
        clientMsgId: 'failed',
        text: 'x',
      })
    ).status,
    202,
  );
  const event = await waitForValue(
    () => g.snapshot().events.find((item) => item.type === 'message_failed'),
    1_000,
    'message_failed',
  );
  assert.equal(event.data.code, 'GROUP_WRITE_FORBIDDEN');
  assert.equal(g.snapshot().messages.length, 0);
  assert.equal(g.snapshot().groups[0]?.writable, false);
});

test('kick timeout converges in members; leave failure preserves member; owner leaving denies later kick', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  await add(g, id, 'admin');
  await post(`${g.url}/groups/${id}/promote`, { byAccountId: 'owner', accountId: 'admin' });
  g.setMembership(id, 'external', true);
  g.enqueue(`/groups/${id}/kick`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 30,
  });
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/kick`, {
        byAccountId: 'admin',
        targetPlatformUserId: 'external',
      })
    ).status,
    504,
  );
  await waitForValue(
    () =>
      !g.snapshot().groups[0]?.members.some((member) => member.platformUserId === 'external')
        ? true
        : undefined,
    1_000,
    'kick convergence',
  );
  g.enqueue(`/groups/${id}/leave`, { status: 500, code: 'LEAVE_FAILED' });
  assert.equal((await post(`${g.url}/groups/${id}/leave`, { accountId: 'admin' })).status, 500);
  assert.ok(
    g.snapshot().groups[0]?.members.some((member) => member.platformUserId === 'platform-admin'),
  );
  await post(`${g.url}/groups/${id}/leave`, { accountId: 'owner' });
  assert.equal(
    (
      await post(`${g.url}/groups/${id}/kick`, {
        byAccountId: 'admin',
        targetPlatformUserId: 'other',
      })
    ).body.code,
    'OWNER_LEFT',
  );
});

test('SSE history exists before connect and since is exclusive, with duplicate and out-of-order delivery', async (t) => {
  const g = await gateway(t);
  const first = g.emitMessage({
    groupId: 'external-group',
    senderPlatformUserId: 'human',
    text: 'old',
    sentAt: '2020-01-01T00:00:00.000Z',
  });
  const second = g.emitMessage({
    groupId: 'external-group',
    senderPlatformUserId: 'human',
    text: 'new',
  });
  const historical = await stream(`${g.url}/events?since=${first.eventId}`);
  t.after(() => historical.close());
  assert.deepEqual(
    (await historical.read(1)).map((event) => event.eventId),
    [second.eventId],
  );
  const live = await stream(`${g.url}/events`);
  t.after(() => live.close());
  const earlier = g.emit(
    'member_joined',
    { groupId: 'external-group', platformUserId: 'x' },
    { storeOnly: true },
  );
  const later = g.emit(
    'member_left',
    { groupId: 'external-group', platformUserId: 'x' },
    { storeOnly: true },
  );
  g.deliver(later.eventId, { repeat: 2 });
  g.deliver(earlier.eventId, { delayMs: 20 });
  assert.deepEqual(
    (await live.read(3)).map((event) => event.eventId),
    [later.eventId, later.eventId, earlier.eventId],
  );
  assert.equal(g.snapshot().events.length, 4);
});

test('disconnection retains all history; global unavailable also applies to by-client-id and SSE', async (t) => {
  const g = await gateway(t);
  const id = await group(g);
  const connection = await stream(`${g.url}/events`);
  t.after(() => connection.close());
  g.disconnectStreams();
  const saved = g.emitMessage({ groupId: id, senderPlatformUserId: 'human', text: 'offline' });
  g.configure({ unavailable: true });
  assert.equal((await fetch(`${g.url}/events?since=0`)).status, 503);
  assert.equal((await fetch(`${g.url}/groups/${id}/messages/by-client-id/missing`)).status, 503);
  g.configure({ unavailable: false });
  const recovered = await stream(`${g.url}/events?since=0`);
  t.after(() => recovered.close());
  assert.equal((await recovered.read(1))[0]?.eventId, saved.eventId);
});

test('media bytes and expiration are independent of message history', async (t) => {
  const g = await gateway(t);
  const valid = g.addMedia('ok', Buffer.from([0, 1, 2, 255]));
  assert.deepEqual(
    new Uint8Array(await (await fetch(valid)).arrayBuffer()),
    new Uint8Array([0, 1, 2, 255]),
  );
  const expired = g.addMedia('gone', 'x', { expiresAfterMs: -1 });
  assert.equal((await fetch(expired)).status, 404);
});

const tools = [
  {
    name: 'get_recent_messages',
    description: 'read',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
      required: ['limit'],
    },
  },
  {
    name: 'send_message',
    description: 'send',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' }, idempotency_key: { type: 'string' } },
      required: ['text', 'idempotency_key'],
    },
  },
  {
    name: 'kick_user',
    description: 'kick',
    input_schema: {
      type: 'object',
      properties: { platform_user_id: { type: 'string' }, reason: { type: 'string' } },
      required: ['platform_user_id', 'reason'],
    },
  },
  {
    name: 'finish',
    description: 'finish',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];
function turn(runId = 'run-1'): unknown {
  return {
    runId,
    tools,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '{"groupId":"g","triggerMessages":[],"policy":{"autoKickEnabled":false},"ownPlatformUserIds":[]}',
          },
        ],
      },
    ],
  };
}

test('Agent rejects invalid four-tool schema without consuming a scripted response', async (t) => {
  const agent = await new AgentSimulator().start();
  t.after(() => agent.close());
  agent.enqueueTurns({ rawBody: 'not-json' });
  const invalid = structuredClone(tools);
  invalid[1].input_schema.required = ['text'];
  assert.equal(
    (await post(`${agent.url}/agent/turn`, { runId: 'run-1', tools: invalid, messages: [] })).body
      .code,
    'TOOLS_INVALID',
  );
  const extra = structuredClone(tools);
  Object.assign(extra[0].input_schema.properties, { unexpected: { type: 'string' } });
  extra[0].input_schema.required.push('unexpected');
  assert.equal(
    (await post(`${agent.url}/agent/turn`, { runId: 'run-1', tools: extra, messages: [] })).body
      .code,
    'TOOLS_INVALID',
  );
  const response = await fetch(`${agent.url}/agent/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(turn()),
  });
  assert.equal(await response.text(), 'not-json');
  assert.equal(agent.snapshot().turns.length, 3);
});

test('Agent preserves raw malformed responses and run history without turn deduplication', async (t) => {
  const agent = await new AgentSimulator().start();
  t.after(() => agent.close());
  agent.enqueueTurns(
    { rawBody: '```json\n{}\n```' },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } },
  );
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(turn('persistent-run')),
  };
  assert.equal(await (await fetch(`${agent.url}/agent/turn`, request)).text(), '```json\n{}\n```');
  assert.equal(
    ((await (await fetch(`${agent.url}/agent/turn`, request)).json()) as { stop_reason: string })
      .stop_reason,
    'end_turn',
  );
  const state = agent.snapshot();
  assert.equal(state.turns.length, 2);
  assert.equal(state.turns[0]?.rawResponse, '```json\n{}\n```');
  assert.deepEqual(state.sessions, [{ runId: 'persistent-run', requestIds: [1, 2] }]);
  assert.deepEqual(state.turns[0]?.body, turn('persistent-run'));
});

test('Agent audit supports unknown verdict, failures and an observable response barrier', async (t) => {
  const agent = await new AgentSimulator().start();
  t.after(() => agent.close());
  agent.enqueueAudits(
    { status: 500, rawBody: 'broken' },
    { body: { verdict: 'maybe' } },
    {
      body: { verdict: 'pass', reason: 'allowed' },
      barrier: { phase: 'before-response', name: 'audit-pass' },
    },
  );
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'x', groupId: 'g' }),
  };
  assert.equal((await fetch(`${agent.url}/agent/audit`, request)).status, 500);
  assert.equal(
    (await post(`${agent.url}/agent/audit`, { text: 'x', groupId: 'g' })).body.verdict,
    'maybe',
  );
  let returned = false;
  const pending = fetch(`${agent.url}/agent/audit`, request).then((value) => {
    returned = true;
    return value;
  });
  await agent.barriers.waitFor('audit-pass');
  assert.equal(returned, false);
  assert.equal(agent.snapshot().audits.length, 3);
  agent.barriers.release('audit-pass');
  assert.equal((await pending).status, 200);
});

test('management uses a distinct port and snapshots cannot mutate external facts', async (t) => {
  const g = await gateway(t);
  await group(g);
  assert.notEqual(g.url, g.controlUrl);
  const snapshot = g.snapshot();
  snapshot.accounts[0].connected = false;
  snapshot.groups.length = 0;
  assert.equal(g.snapshot().accounts[0].connected, true);
  assert.equal(g.snapshot().groups.length, 1);
  const management = await fetch(`${g.controlUrl}/snapshot`);
  assert.equal(management.status, 200);
  assert.equal((await fetch(`${g.url}/snapshot`)).status, 404);
});
