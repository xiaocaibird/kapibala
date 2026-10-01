import { test, expect } from '../fixtures.js';
import { PlatformClient, type ApiError } from '../../harness/platform-client.js';

test('[AUTH-001] health, login and UTC account contract', async ({ qa }) => {
  const health = await qa.api.get<{ ok: boolean; schemaVersion: unknown }>('/api/health', {
    token: null,
    cookie: null,
  });
  expect(health.status).toBe(200);
  expect(health.body.ok).toBe(true);
  expect(health.body.schemaVersion).toBeDefined();
  await qa.api.login();
  const accounts = await qa.api.accounts();
  expect(accounts.length).toBeGreaterThanOrEqual(1);
  for (const account of accounts) {
    expect(account.status).toBe('idle');
    expect(account.platformUserId).toBeNull();
    expect(account.rateLimitedUntil).toBeNull();
  }
  await qa.evidence('health-login-account-baseline', { health: health.body, accounts });
});

test('[AUTH-002] protected reads reject missing and invalid credentials', async ({ qa }) => {
  for (const token of [null, 'invalid-access-token']) {
    const response = await qa.api.get<ApiError>('/api/accounts', { token, cookie: null });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toEqual(expect.any(String));
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(response.body.error.requestId.length).toBeGreaterThan(0);
  }
  const badLogin = await qa.api.post<ApiError>('/api/auth/login', {
    username: 'admin',
    password: 'wrong',
  });
  expect(badLogin.status).toBe(401);
  expect(badLogin.body.error.code).toBe('UNAUTHORIZED');
});

test('[AUTH-003] viewer cannot execute any original business write endpoint', async ({ qa }) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const viewer = await qa.api.as('viewer');
  expect((await viewer.get('/api/accounts')).status).toBe(200);
  const operations: [string, string, unknown][] = [
    ['POST', `/api/accounts/${accounts[0]!.id}/connect`, {}],
    [
      'POST',
      `/api/accounts/${accounts[0]!.id}/transition`,
      { to: 'disconnected', expectedFrom: 'online' },
    ],
    [
      'POST',
      '/api/groups',
      { creatorAccountId: accounts[0]!.id, memberAccountIds: [accounts[1]!.id] },
    ],
    ['PATCH', `/api/groups/${group.id}`, { agentEnabled: true }],
    ['POST', `/api/groups/${group.id}/send`, { accountId: accounts[0]!.id, text: 'forbidden' }],
    ['POST', `/api/groups/${group.id}/leave-all`, {}],
    [
      'POST',
      '/api/sequences',
      {
        name: 'forbidden',
        steps: [{ index: 1, accountRole: 'admin', text: 'x', delaySeconds: 1 }],
      },
    ],
    [
      'POST',
      `/api/groups/${group.id}/sequence-runs`,
      { sequenceId: 'not-existing', vars: {}, stepVars: {} },
    ],
  ];
  for (const [method, path, body] of operations) {
    const result = await viewer.request<ApiError>(method, path, body);
    expect(result.status, `${method} ${path}`).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN');
  }
  expect(await qa.api.group(group.id)).toEqual(group);
  await qa.evidence(
    'viewer-write-denials',
    operations.map(([method, path]) => ({ method, path })),
  );
});

test('[AUTH-004] refresh token is cookie-only, HttpOnly and rotates', async ({ qa }) => {
  const login = await qa.api.post<{ accessToken: string; refreshToken?: unknown }>(
    '/api/auth/login',
    { username: 'admin', password: 'admin' },
  );
  expect(login.status).toBe(200);
  expect(login.body.accessToken).toEqual(expect.any(String));
  expect(login.body.refreshToken).toBeUndefined();
  const cookies = login.headers.getSetCookie();
  expect(cookies.length).toBeGreaterThan(0);
  // Identify the credential by behavior; a separate HttpOnly analytics/session cookie is insufficient evidence.
  const refreshCookieNames: string[] = [];
  for (const candidate of cookies) {
    const name = candidate.slice(0, candidate.indexOf('='));
    const independent = await qa.api.post<{ accessToken: string }>(
      '/api/auth/login',
      { username: 'admin', password: 'admin' },
      { token: null, cookie: null },
    );
    const sameCookie = independent.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${name}=`));
    if (!sameCookie) continue;
    const trial = await qa.api.post('/api/auth/refresh', undefined, {
      token: null,
      cookie: sameCookie.split(';', 1)[0],
    });
    if (trial.status >= 200 && trial.status < 300) {
      refreshCookieNames.push(name);
      expect(sameCookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
      const secret = sameCookie.split(';', 1)[0]!.slice(name.length + 1);
      expect(JSON.stringify(independent.body)).not.toContain(secret);
    }
  }
  expect(refreshCookieNames.length).toBeGreaterThan(0);
  const freshLogin = await qa.api.post<{ accessToken: string }>(
    '/api/auth/login',
    { username: 'admin', password: 'admin' },
    { token: null, cookie: null },
  );
  const cookie = freshLogin.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
  const refresh = await qa.api.post<{ accessToken: string; refreshToken?: unknown }>(
    '/api/auth/refresh',
    undefined,
    { token: null, cookie },
  );
  expect(refresh.status).toBe(200);
  expect(refresh.body.refreshToken).toBeUndefined();
  expect(refresh.headers.getSetCookie().some((value) => /;\s*HttpOnly(?:;|$)/i.test(value))).toBe(
    true,
  );
  expect(
    refresh.headers
      .getSetCookie()
      .map((value) => value.split(';', 1)[0])
      .join('; '),
  ).not.toBe(cookie);
  expect(
    (await qa.api.get('/api/accounts', { token: refresh.body.accessToken, cookie: null })).status,
  ).toBe(200);
});

test('[AUTH-005] refresh replay revokes both new credentials immediately', async ({ qa }) => {
  await qa.api.login();
  const oldCookie = qa.api.cookie!;
  const fresh = await qa.api.post<{ accessToken: string }>('/api/auth/refresh', undefined, {
    token: null,
    cookie: oldCookie,
  });
  expect(fresh.status).toBe(200);
  const newCookie = fresh.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
  const replay = await qa.api.post<ApiError>('/api/auth/refresh', undefined, {
    token: null,
    cookie: oldCookie,
  });
  expect(replay.status).toBe(401);
  expect(replay.body.error.code).toBe('UNAUTHORIZED');
  expect(
    (await qa.api.get('/api/accounts', { token: fresh.body.accessToken, cookie: null })).status,
  ).toBe(401);
  expect(
    (await qa.api.post('/api/auth/refresh', undefined, { token: null, cookie: newCookie })).status,
  ).toBe(401);
});

test('[AUTH-006] logout invalidates the existing access token immediately', async ({ qa }) => {
  await qa.api.login();
  const token = qa.api.token!;
  const result = await qa.api.post('/api/auth/logout');
  expect([200, 204]).toContain(result.status);
  const rejected = await qa.api.get<ApiError>('/api/accounts', { token, cookie: null });
  expect(rejected.status).toBe(401);
  expect(rejected.body.error.code).toBe('UNAUTHORIZED');
});

test('[AUTH-007] access token expires at fifteen minutes (real clock)', async ({ qa }) => {
  test.setTimeout(950_000);
  await qa.api.login();
  const client = new PlatformClient(qa.api.baseUrl, { token: qa.api.token });
  expect((await client.get('/api/accounts')).status).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 899_000));
  expect((await client.get('/api/accounts')).status).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  const expired = await client.get<ApiError>('/api/accounts');
  expect(expired.status).toBe(401);
  expect(expired.body.error.code).toBe('UNAUTHORIZED');
});
