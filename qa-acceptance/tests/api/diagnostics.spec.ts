import { test, expect } from '../fixtures.js';
import { eventually } from '../../harness/platform-client.js';

// Versioned public interface documented under approved D045. Internal module
// names, tick cadence and numeric capacity limits are not acceptance oracles.
test('[DIAG-001] background diagnostics are admin-only and exclude tested secret and business data', async ({
  qa,
}) => {
  const path = '/api/diagnostics/background';
  for (const token of [null, 'invalid-diagnostic-token']) {
    const response = await qa.api.get(path, { token, cookie: null });
    expect(response.status).toBe(401);
  }
  await qa.api.login();
  const viewer = await qa.api.as('viewer');
  expect((await viewer.get(path)).status).toBe(403);

  const { group, accounts } = await qa.api.createGroup();
  const marker = `qa-diagnostics-private-message-${group.id}`;
  const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, marker);
  await eventually(
    () => qa.api.messages(group.id),
    (messages) =>
      messages.items.some((m) => m.clientMsgId === clientMsgId && m.deliveryStatus === 'sent'),
  );
  const response = await qa.api.get<Record<string, unknown>>(path);
  expect(response.status).toBe(200);
  expect(response.body).not.toBeNull();
  expect(typeof response.body).toBe('object');
  expect(Object.keys(response.body).length).toBeGreaterThan(0);
  const raw = JSON.stringify(response.body);
  for (const secret of [
    qa.api.token,
    qa.api.cookie,
    viewer.token,
    viewer.cookie,
    marker,
    group.id,
    group.gatewayGroupId,
  ]) {
    if (secret)
      expect(
        raw.includes(secret),
        'Diagnostic payload leaked a tested secret or business identifier',
      ).toBe(false);
  }
  const forbiddenKeys = new Set([
    'password',
    'passwd',
    'accesstoken',
    'refreshtoken',
    'cookie',
    'authorization',
    'connectionstring',
    'databaseurl',
    'stack',
    'stacktrace',
    'errormessage',
    'rawresponse',
  ]);
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      expect(
        /postgres(?:ql)?:\/\/|Bearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\n\s+at\s+.+:\d+:\d+/i.test(
          value,
        ),
        'Diagnostic payload exposed a connection, credential or stack',
      ).toBe(false);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        if (item !== null && item !== undefined && item !== '')
          expect(
            forbiddenKeys.has(key.replaceAll(/[_-]/g, '').toLowerCase()),
            'Diagnostic payload exposed a forbidden populated field',
          ).toBe(false);
        visit(item);
      }
  };
  visit(response.body);
  await qa.evidence('background-diagnostic-access', {
    anonymous: 401,
    invalidToken: 401,
    viewer: 403,
    admin: response.status,
    payload: response.body,
    boundary:
      'Permission and sampled disclosure contract only; counters do not prove task completion, capacity admission or cluster health. Error-injection and lifecycle transitions need separate integration evidence.',
  });
});
