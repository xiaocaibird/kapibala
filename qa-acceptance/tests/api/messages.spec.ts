import { test, expect } from '../fixtures.js';
import { eventually, type Message, type ApiError } from '../../harness/platform-client.js';
import { BlockedError } from '../../harness/security.js';

async function deadlineEvidence(
  qa: { evidence: (name: string, value: unknown) => Promise<void> },
  name: string,
  start: [number, number],
  end: [number, number],
  limit: number,
): Promise<void> {
  const bounds = {
    lowerMs: end[0] - start[1],
    upperMs: end[1] - start[0],
    limitMs: limit,
    start,
    end,
  };
  await qa.evidence(name, bounds);
  expect(
    bounds.lowerMs,
    'Observed lower bound exceeds the contractual deadline',
  ).toBeLessThanOrEqual(limit);
  if (bounds.upperMs > limit)
    throw new BlockedError(
      `Timing interval ${bounds.lowerMs}..${bounds.upperMs}ms crosses ${limit}ms; exact lifecycle timestamps are required`,
    );
}
const byClient = (items: Message[], id: string) => items.find((item) => item.clientMsgId === id);

test('[MSG-001] accepted is observable until message_sent and own echo stays one row', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.configure({ sendDelayMs: 1_500, eventDuplicates: 2 });
  const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, 'accepted then sent');
  const accepted = await eventually(
    () => qa.api.messages(group.id),
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'accepted',
    { timeoutMs: 1_300 },
  );
  expect(byClient(accepted.items, clientMsgId)!.isOwn).toBe(true);
  const final = await eventually(
    () => qa.api.messages(group.id),
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'sent',
  );
  const rows = final.items.filter((item) => item.clientMsgId === clientMsgId);
  expect(rows).toHaveLength(1);
  const landed = qa.gateway
    .snapshot()
    .messages.filter((message) => message.clientMsgId === clientMsgId);
  expect(landed).toHaveLength(1);
  expect(rows[0]!.msgId).toBe(landed[0]!.msgId);
  expect(rows[0]!.sentAt).toBe(landed[0]!.sentAt);
  await qa.evidence('acceptance-and-delivery', { accepted, final, landed });
});

test('[MSG-002] rate limiting blocks all account sends until deadline and preserves FIFO', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const sender = accounts[0]!;
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 429,
    code: 'RATE_LIMITED',
    body: { retryAfterSeconds: 2 },
    effect: 'none',
  });
  const first = await qa.api.send(group.id, sender.id, 'fifo-1');
  const limited = await eventually(
    () => qa.api.accounts(),
    (list) => list.find((account) => account.id === sender.id)?.status === 'rate_limited',
  );
  const until = limited.find((account) => account.id === sender.id)!.rateLimitedUntil;
  expect(until).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  const second = await qa.api.send(group.id, sender.id, 'fifo-2');
  const third = await qa.api.send(group.id, sender.id, 'fifo-3');
  const queued = await qa.api.messages(group.id);
  for (const id of [first.clientMsgId, second.clientMsgId, third.clientMsgId])
    expect(byClient(queued.items, id)?.deliveryStatus).toBe('queued');
  await eventually(
    () => qa.api.messages(group.id),
    (value) =>
      [first, second, third].every(
        (message) => byClient(value.items, message.clientMsgId)?.deliveryStatus === 'sent',
      ),
  );
  const sends = qa.gateway
    .snapshot()
    .requests.filter(
      (request) =>
        request.path.endsWith('/send') &&
        (request.body as { accountId: string }).accountId === sender.id,
    );
  expect(sends).toHaveLength(4);
  for (const request of sends.slice(1))
    expect(Date.parse(request.at) - Date.parse(sends[0]!.completedAt!)).toBeGreaterThanOrEqual(
      2_000,
    );
  expect(
    qa.gateway
      .snapshot()
      .messages.filter((message) => message.accountId === sender.id)
      .map((message) => message.text),
  ).toEqual(['fifo-1', 'fifo-2', 'fifo-3']);
  expect((await qa.api.accounts()).find((account) => account.id === sender.id)!.status).toBe(
    'online',
  );
});

test('[MSG-003] terminal marking cancels queued sends and removes member atomically', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const sender = accounts[1]!;
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 429,
    code: 'RATE_LIMITED',
    body: { retryAfterSeconds: 60 },
    effect: 'none',
  });
  const first = await qa.api.send(group.id, sender.id, 'cancel-1');
  await eventually(
    () => qa.api.accounts(),
    (list) => list.find((account) => account.id === sender.id)?.status === 'rate_limited',
  );
  const second = await qa.api.send(group.id, sender.id, 'cancel-2');
  await qa.api.require(
    qa.api.post(`/api/accounts/${sender.id}/transition`, {
      expectedFrom: 'rate_limited',
      to: 'suspended',
    }),
  );
  const [state, updated, messages] = await Promise.all([
    qa.api.accounts(),
    qa.api.group(group.id),
    qa.api.messages(group.id),
  ]);
  expect(state.find((account) => account.id === sender.id)!.status).toBe('suspended');
  expect(updated.members.some((member) => member.accountId === sender.id)).toBe(false);
  for (const id of [first.clientMsgId, second.clientMsgId]) {
    expect(byClient(messages.items, id)?.deliveryStatus).toBe('cancelled');
    expect(byClient(messages.items, id)?.failCode).toBe('ACCOUNT_TERMINAL');
  }
  expect(qa.gateway.snapshot().messages).toHaveLength(0);
});

test('[MSG-004] 504 that lands within two seconds is reconciled without resending', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 1_500,
  });
  const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, 'unknown landed');
  await eventually(
    () => qa.api.messages(group.id),
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'unknown',
    { timeoutMs: 1_200 },
  );
  const startUpper = Date.now();
  let lastPending = startUpper;
  await eventually(
    async () => {
      const beforeRead = Date.now();
      const value = await qa.api.messages(group.id);
      if (byClient(value.items, clientMsgId)?.deliveryStatus !== 'sent') lastPending = beforeRead;
      return value;
    },
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'sent',
    { timeoutMs: 6_000 },
  );
  const observedAt = Date.now();
  const sentRequest = qa.gateway
    .snapshot()
    .requests.find((request) => request.path.endsWith('/send'))!;
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
  expect(
    qa.gateway.snapshot().messages.filter((message) => message.clientMsgId === clientMsgId),
  ).toHaveLength(1);
  await deadlineEvidence(
    qa,
    'landed-504-deadline',
    [Date.parse(sentRequest.completedAt!), startUpper],
    [lastPending, observedAt],
    5_000,
  );
});

test('[MSG-005] absent 504 is retried only once after the two-second uncertainty window', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(
    `/groups/${group.gatewayGroupId}/send`,
    { status: 504, code: 'NETWORK_TIMEOUT', effect: 'none' },
    { status: 504, code: 'NETWORK_TIMEOUT', effect: 'none' },
  );
  const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, 'never landed');
  await eventually(
    () => qa.api.messages(group.id),
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'unknown',
  );
  const startUpper = Date.now();
  let lastPending = startUpper;
  const terminal = await eventually(
    async () => {
      const beforeRead = Date.now();
      const value = await qa.api.messages(group.id);
      if (byClient(value.items, clientMsgId)?.deliveryStatus !== 'failed') lastPending = beforeRead;
      return value;
    },
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'failed',
    { timeoutMs: 6_000 },
  );
  const observedAt = Date.now();
  expect(byClient(terminal.items, clientMsgId)!.failCode).toBe('NETWORK_TIMEOUT');
  const sends = qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send'));
  expect(sends).toHaveLength(2);
  expect((sends[0]!.body as { clientMsgId: string }).clientMsgId).toBe(clientMsgId);
  expect((sends[1]!.body as { clientMsgId: string }).clientMsgId).toBe(clientMsgId);
  expect(Date.parse(sends[1]!.at) - Date.parse(sends[0]!.completedAt!)).toBeGreaterThanOrEqual(
    2_000,
  );
  expect(qa.gateway.snapshot().messages).toHaveLength(0);
  await deadlineEvidence(
    qa,
    'absent-504-deadline',
    [Date.parse(sends[0]!.completedAt!), startUpper],
    [lastPending, observedAt],
    5_000,
  );
});

test('[MSG-006] unavailable confirmation preserves unknown until recovery', async ({ qa }) => {
  test.setTimeout(40_000);
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    effectDelayMs: 1_500,
    omitEvent: true,
    barrier: { phase: 'before-response', name: 'unknown-response' },
  });
  const pending = qa.api.send(group.id, accounts[0]!.id, 'query unavailable');
  await qa.gateway.barriers.waitFor('unknown-response');
  qa.gateway.configure({ unavailable: true });
  qa.gateway.barriers.release('unknown-response');
  const { clientMsgId } = await pending;
  await eventually(
    () => qa.api.messages(group.id),
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'unknown',
  );
  await new Promise((resolve) => setTimeout(resolve, 5_100));
  expect(byClient((await qa.api.messages(group.id)).items, clientMsgId)?.deliveryStatus).toBe(
    'unknown',
  );
  const restored = Date.now();
  qa.gateway.configure({ unavailable: false });
  let lastPending = restored;
  await eventually(
    async () => {
      const beforeRead = Date.now();
      const value = await qa.api.messages(group.id);
      if (byClient(value.items, clientMsgId)?.deliveryStatus !== 'sent') lastPending = beforeRead;
      return value;
    },
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'sent',
    { timeoutMs: 3_000 },
  );
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(1);
  await deadlineEvidence(
    qa,
    'query-recovery-deadline',
    [restored, restored],
    [lastPending, Date.now()],
    2_000,
  );
});

for (const [id, code, status, terminal] of [
  ['MSG-007', 'ACCOUNT_SUSPENDED', 403, 'suspended'],
  ['MSG-008', 'SESSION_EXPIRED', 401, 'session_expired'],
] as const) {
  test(`[${id}] synchronous ${code} applies terminal consequences without relying on events`, async ({
    qa,
  }) => {
    await qa.api.login();
    const { group, accounts } = await qa.api.createGroup();
    const sender = accounts[1]!;
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
      status,
      code,
      effect: 'none',
      omitEvent: true,
    });
    const { clientMsgId } = await qa.api.send(group.id, sender.id, code);
    await eventually(
      () => qa.api.accounts(),
      (list) => list.find((account) => account.id === sender.id)?.status === terminal,
    );
    expect(
      (await qa.api.group(group.id)).members.some((member) => member.accountId === sender.id),
    ).toBe(false);
    const message = byClient((await qa.api.messages(group.id)).items, clientMsgId)!;
    expect(['failed', 'cancelled']).toContain(message.deliveryStatus);
    expect(message.failCode).toBeTruthy();
  });
}
for (const [id, code, status] of [
  ['MSG-009', 'SENDER_NOT_IN_GROUP', 403],
  ['MSG-010', 'ACCOUNT_OFFLINE', 409],
] as const) {
  test(`[${id}] ${code} only fails that message`, async ({ qa }) => {
    await qa.api.login();
    const { group, accounts } = await qa.api.createGroup();
    const sender = accounts[0]!;
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, { status, code, effect: 'none' });
    const { clientMsgId } = await qa.api.send(group.id, sender.id, code);
    const messages = await eventually(
      () => qa.api.messages(group.id),
      (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'failed',
    );
    expect(byClient(messages.items, clientMsgId)!.failCode).toBe(code);
    expect((await qa.api.accounts()).find((account) => account.id === sender.id)!.status).toBe(
      'online',
    );
    expect((await qa.api.group(group.id)).status).toBe('active');
  });
}

test('[MSG-011] incoming duplicate and out-of-order historical messages are merged and sorted', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const sameTime = '2026-01-01T00:00:00.000Z';
  const data = {
    groupId: group.gatewayGroupId,
    msgId: 'stable-a',
    senderPlatformUserId: 'outside',
    text: 'A',
    sentAt: sameTime,
  };
  qa.gateway.emit('message', data, { repeat: 3 });
  qa.gateway.emitMessage({ ...data, msgId: 'stable-b', text: 'B' });
  qa.gateway.emitMessage({
    ...data,
    msgId: 'old-offline',
    text: 'backfill',
    sentAt: '2020-01-01T00:00:00.000Z',
  });
  qa.gateway.emitMessage({
    ...data,
    msgId: 'newest',
    text: 'new',
    sentAt: '2026-02-01T00:00:00.000Z',
  });
  const result = await eventually(
    () => qa.api.messages(group.id),
    (value) => value.items.length === 4,
  );
  expect(new Set(result.items.map((message) => message.msgId)).size).toBe(4);
  expect(result.items[0]!.msgId).toBe('newest');
  expect(result.items.at(-1)!.msgId).toBe('old-offline');
  expect(result.items.every((message) => !message.isOwn)).toBe(true);
  const dates = result.items.map((message) => Date.parse(message.sentAt));
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
});

test('[MSG-012] snapshot cursor traversal has no omission or duplicates under concurrent writes', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const baseline = Array.from({ length: 83 }, (_, index) => `baseline-${index}`);
  for (const [index, msgId] of baseline.entries())
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId,
      senderPlatformUserId: 'outside',
      text: msgId,
      sentAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(index / 3)).toISOString(),
    });
  await eventually(
    async () => {
      const firstPage = await qa.api.messages(group.id);
      const items = [...firstPage.items];
      let next = firstPage.nextCursor;
      let pages = 0;
      while (next && pages++ < 10) {
        const page = await qa.api.messages(group.id, next);
        items.push(...page.items);
        next = page.nextCursor;
      }
      return items;
    },
    (items) => items.length === baseline.length,
  );
  const first = await qa.api.messages(group.id, undefined, 13);
  const seen = [...first.items];
  let cursor = first.nextCursor;
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    msgId: 'concurrent-new',
    senderPlatformUserId: 'outside',
    text: 'new',
    sentAt: '2027-01-01T00:00:00.000Z',
  });
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    msgId: 'concurrent-old',
    senderPlatformUserId: 'outside',
    text: 'old',
    sentAt: '2010-01-01T00:00:00.000Z',
  });
  const cursors = new Set<string>();
  while (cursor) {
    expect(cursors.has(cursor)).toBe(false);
    cursors.add(cursor);
    const page = await qa.api.messages(group.id, cursor, 13);
    seen.push(...page.items);
    cursor = page.nextCursor;
    expect(cursors.size).toBeLessThan(20);
  }
  expect(seen.map((message) => message.msgId).sort()).toEqual([...baseline].sort());
  expect(new Set(seen.map((message) => message.msgId)).size).toBe(baseline.length);
  expect(
    (await qa.api.messages(group.id)).items.some((message) => message.msgId === 'concurrent-new'),
  ).toBe(true);
});

test('[MSG-013] manual send validates unavailable account and nonmember before enqueue', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup(1);
  const all = await qa.api.accounts();
  const outsider = all.find((account) => !accounts.some((member) => member.id === account.id));
  if (!outsider)
    throw new BlockedError('Nonmember scenario requires at least three seed service accounts');
  const notMember = await qa.api.post<ApiError>(`/api/groups/${group.id}/send`, {
    accountId: outsider.id,
    text: 'not member',
  });
  expect(notMember.status).toBe(409);
  expect(notMember.body.error.code).toBe('ACCOUNT_NOT_IN_GROUP');
  await qa.api.require(
    qa.api.post(`/api/accounts/${accounts[1]!.id}/transition`, {
      expectedFrom: 'online',
      to: 'disconnected',
    }),
  );
  const unavailable = await qa.api.post<ApiError>(`/api/groups/${group.id}/send`, {
    accountId: accounts[1]!.id,
    text: 'unavailable',
  });
  expect(unavailable.status).toBe(409);
  expect(unavailable.body.error.code).toBe('ACCOUNT_UNAVAILABLE');
  expect(
    qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  ).toHaveLength(0);
});

test('[MSG-014] leaving rate_limited manually prevents stale timer resurrection', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const sender = accounts[1]!;
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    status: 429,
    code: 'RATE_LIMITED',
    body: { retryAfterSeconds: 2 },
    effect: 'none',
  });
  await qa.api.send(group.id, sender.id, 'keep queued');
  await eventually(
    () => qa.api.accounts(),
    (list) => list.find((account) => account.id === sender.id)?.status === 'rate_limited',
  );
  await qa.api.require(
    qa.api.post(`/api/accounts/${sender.id}/transition`, {
      expectedFrom: 'rate_limited',
      to: 'disconnected',
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 2_200));
  expect((await qa.api.accounts()).find((account) => account.id === sender.id)!.status).toBe(
    'disconnected',
  );
  expect(
    qa.gateway
      .snapshot()
      .requests.filter(
        (request) => request.path.endsWith('/disconnect') && request.path.includes(sender.id),
      ),
  ).toHaveLength(1);
});

for (const [id, code, target] of [
  ['MSG-015', 'ACCOUNT_SUSPENDED', 'account'],
  ['MSG-016', 'GROUP_WRITE_FORBIDDEN', 'group'],
] as const)
  test(`[${id}] asynchronous message_failed applies ${code} consequences`, async ({ qa }) => {
    await qa.api.login();
    const { group, accounts } = await qa.api.createGroup();
    qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
      failureCode: code,
      effectDelayMs: 1_000,
    });
    const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, 'accepted then rejected');
    await eventually(
      () => qa.api.messages(group.id),
      (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'accepted',
    );
    const result = await eventually(
      () => qa.api.messages(group.id),
      (value) =>
        ['failed', 'cancelled'].includes(byClient(value.items, clientMsgId)?.deliveryStatus ?? ''),
    );
    expect(byClient(result.items, clientMsgId)!.failCode).toBeTruthy();
    expect(qa.gateway.snapshot().messages).toHaveLength(0);
    if (target === 'account') {
      expect(
        (await qa.api.accounts()).find((account) => account.id === accounts[0]!.id)!.status,
      ).toBe('suspended');
      expect(
        (await qa.api.group(group.id)).members.some(
          (member) => member.accountId === accounts[0]!.id,
        ),
      ).toBe(false);
    } else {
      expect((await qa.api.group(group.id)).status).toBe('unreachable');
      expect(
        (await qa.api.accounts()).find((account) => account.id === accounts[0]!.id)!.status,
      ).toBe('online');
    }
  });

test('[MSG-017] message echo arriving before confirmation still merges one own row', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  qa.gateway.configure({ sendEventOrder: 'message-first', eventDuplicates: 3 });
  const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, 'message-first');
  const messages = await eventually(
    () => qa.api.messages(group.id),
    (value) => byClient(value.items, clientMsgId)?.deliveryStatus === 'sent',
  );
  expect(messages.items).toHaveLength(1);
  expect(messages.items[0]!.isOwn).toBe(true);
  expect(qa.gateway.snapshot().messages).toHaveLength(1);
});

test('[MSG-018] terminal event removes account and cancels its queue across every group', async ({
  qa,
}) => {
  await qa.api.login();
  const first = await qa.api.createGroup();
  const second = await qa.api.createGroup();
  const sender = first.accounts[1]!;
  qa.gateway.enqueue(`/groups/${first.group.gatewayGroupId}/send`, {
    status: 429,
    code: 'RATE_LIMITED',
    body: { retryAfterSeconds: 60 },
    effect: 'none',
  });
  const firstMessage = await qa.api.send(first.group.id, sender.id, 'first group queue');
  await eventually(
    () => qa.api.accounts(),
    (values) => values.find((account) => account.id === sender.id)?.status === 'rate_limited',
  );
  const secondMessage = await qa.api.send(second.group.id, sender.id, 'second group queue');
  qa.gateway.emitStatus(sender.id, 'session_expired');
  await eventually(
    () => qa.api.accounts(),
    (values) => values.find((account) => account.id === sender.id)?.status === 'session_expired',
  );
  for (const [group, message] of [
    [first.group, firstMessage],
    [second.group, secondMessage],
  ] as const) {
    expect(
      (await qa.api.group(group.id)).members.some((member) => member.accountId === sender.id),
    ).toBe(false);
    const row = byClient((await qa.api.messages(group.id)).items, message.clientMsgId)!;
    expect(row.deliveryStatus).toBe('cancelled');
    expect(row.failCode).toBe('ACCOUNT_TERMINAL');
  }
  expect(qa.gateway.snapshot().messages).toHaveLength(0);
});
