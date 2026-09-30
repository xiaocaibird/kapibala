import { test, expect } from '../fixtures.js';
import { eventually, type AccountStatus, type ApiError } from '../../harness/platform-client.js';

const states: AccountStatus[] = [
  'idle',
  'online',
  'rate_limited',
  'disconnected',
  'suspended',
  'session_expired',
];
const allowed: Record<AccountStatus, AccountStatus[]> = {
  idle: ['online', 'suspended', 'session_expired'],
  online: ['idle', 'rate_limited', 'disconnected', 'suspended', 'session_expired'],
  rate_limited: ['online', 'disconnected', 'suspended', 'session_expired'],
  disconnected: ['idle', 'online', 'suspended', 'session_expired'],
  suspended: [],
  session_expired: [],
};
const transitionCases: [string, AccountStatus, AccountStatus][] = [
  ['STATE-11', 'idle', 'idle'],
  ['STATE-12', 'idle', 'online'],
  ['STATE-13', 'idle', 'rate_limited'],
  ['STATE-14', 'idle', 'disconnected'],
  ['STATE-15', 'idle', 'suspended'],
  ['STATE-16', 'idle', 'session_expired'],
  ['STATE-21', 'online', 'idle'],
  ['STATE-22', 'online', 'online'],
  ['STATE-23', 'online', 'rate_limited'],
  ['STATE-24', 'online', 'disconnected'],
  ['STATE-25', 'online', 'suspended'],
  ['STATE-26', 'online', 'session_expired'],
  ['STATE-31', 'rate_limited', 'idle'],
  ['STATE-32', 'rate_limited', 'online'],
  ['STATE-33', 'rate_limited', 'rate_limited'],
  ['STATE-34', 'rate_limited', 'disconnected'],
  ['STATE-35', 'rate_limited', 'suspended'],
  ['STATE-36', 'rate_limited', 'session_expired'],
  ['STATE-41', 'disconnected', 'idle'],
  ['STATE-42', 'disconnected', 'online'],
  ['STATE-43', 'disconnected', 'rate_limited'],
  ['STATE-44', 'disconnected', 'disconnected'],
  ['STATE-45', 'disconnected', 'suspended'],
  ['STATE-46', 'disconnected', 'session_expired'],
  ['STATE-51', 'suspended', 'idle'],
  ['STATE-52', 'suspended', 'online'],
  ['STATE-53', 'suspended', 'rate_limited'],
  ['STATE-54', 'suspended', 'disconnected'],
  ['STATE-55', 'suspended', 'suspended'],
  ['STATE-56', 'suspended', 'session_expired'],
  ['STATE-61', 'session_expired', 'idle'],
  ['STATE-62', 'session_expired', 'online'],
  ['STATE-63', 'session_expired', 'rate_limited'],
  ['STATE-64', 'session_expired', 'disconnected'],
  ['STATE-65', 'session_expired', 'suspended'],
  ['STATE-66', 'session_expired', 'session_expired'],
];
for (const [id, from, to] of transitionCases) {
  test(`[${id}] state transition ${from} to ${to}`, async ({ qa }) => {
    await qa.api.login();
    const account = (await qa.api.accounts())[0]!;
    if (from !== 'idle') {
      await qa.api.require(qa.api.post(`/api/accounts/${account.id}/connect`));
      if (from !== 'online')
        await qa.api.require(
          qa.api.post(`/api/accounts/${account.id}/transition`, {
            expectedFrom: 'online',
            to: from,
          }),
        );
    }
    const response = await qa.api.post<{ status: AccountStatus } & ApiError>(
      `/api/accounts/${account.id}/transition`,
      { expectedFrom: from, to },
    );
    if (allowed[from].includes(to)) {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe(to);
      if (to === 'idle' || to === 'disconnected')
        expect(
          qa.gateway
            .snapshot()
            .requests.some((request) => request.path === `/accounts/${account.id}/disconnect`),
        ).toBe(true);
    } else {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ILLEGAL_TRANSITION');
    }
    expect((await qa.api.accounts()).find((value) => value.id === account.id)!.status).toBe(
      allowed[from].includes(to) ? to : from,
    );
  });
}

test('[STATE-041] validation precedence and stale expectedFrom are explicit', async ({ qa }) => {
  await qa.api.login();
  const account = (await qa.api.accounts())[0]!;
  const validation = await qa.api.post<ApiError>(`/api/accounts/${account.id}/transition`, {
    to: 'online',
  });
  expect(validation.status).toBe(400);
  expect(validation.body.error.code).toBe('VALIDATION_ERROR');
  const missing = await qa.api.post<ApiError>('/api/accounts/qa-nonexistent/transition', {
    expectedFrom: 'online',
    to: 'disconnected',
  });
  expect(missing.status).toBe(404);
  expect(missing.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  const illegal = await qa.api.post<ApiError>(`/api/accounts/${account.id}/transition`, {
    expectedFrom: 'suspended',
    to: 'online',
  });
  expect(illegal.status).toBe(409);
  expect(illegal.body.error.code).toBe('ILLEGAL_TRANSITION');
  const stale = await qa.api.post<ApiError>(`/api/accounts/${account.id}/transition`, {
    expectedFrom: 'online',
    to: 'disconnected',
  });
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe('CAS_CONFLICT');
});

test('[STATE-042] concurrent compare-and-swap has one winner', async ({ qa }) => {
  await qa.api.login();
  const account = (await qa.api.connectAll())[0]!;
  const results = await Promise.all(
    ['idle', 'disconnected'].map((to) =>
      qa.api.post<{ status: AccountStatus } & ApiError>(`/api/accounts/${account.id}/transition`, {
        expectedFrom: 'online',
        to,
      }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(results.find((result) => result.status === 409)!.body.error.code).toBe('CAS_CONFLICT');
  expect((await qa.api.accounts()).find((value) => value.id === account.id)!.status).toBe(
    results.find((result) => result.status === 200)!.body.status,
  );
});

test('[STATE-043] reconnect retains stable gateway identity', async ({ qa }) => {
  await qa.api.login();
  const account = (await qa.api.connectAll())[0]!;
  await qa.api.require(
    qa.api.post(`/api/accounts/${account.id}/transition`, {
      expectedFrom: 'online',
      to: 'disconnected',
    }),
  );
  const reconnect = await qa.api.require(
    qa.api.post<{ status: string; platformUserId: string }>(`/api/accounts/${account.id}/connect`),
  );
  expect(reconnect.status).toBe('online');
  expect(reconnect.platformUserId).toBe(account.platformUserId);
});

for (const [id, terminal] of [
  ['STATE-044', 'suspended'],
  ['STATE-045', 'session_expired'],
] as const) {
  test(`[${id}] repeated ${terminal} events preserve processing and cannot reconnect`, async ({
    qa,
  }) => {
    await qa.api.login();
    const { group, accounts } = await qa.api.createGroup();
    qa.gateway.emitStatus(accounts[1]!.id, terminal);
    qa.gateway.emitStatus(accounts[1]!.id, terminal);
    await eventually(
      () => qa.api.accounts(),
      (list) => list.find((item) => item.id === accounts[1]!.id)?.status === terminal,
    );
    expect(
      (await qa.api.post(`/api/accounts/${accounts[1]!.id}/connect`)).status,
    ).toBeGreaterThanOrEqual(400);
    const updated = await qa.api.group(group.id);
    expect(updated.members.some((member) => member.accountId === accounts[1]!.id)).toBe(false);
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: `after-${terminal}`,
      senderPlatformUserId: 'external-1',
      text: 'processing continues',
    });
    await eventually(
      () => qa.api.messages(group.id),
      (value) => value.items.some((item) => item.msgId === `after-${terminal}`),
    );
  });
}
