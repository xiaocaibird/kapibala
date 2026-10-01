// QA-only clients and simulators. No product, PostgreSQL or target configuration.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PlatformClient } from '../../harness/platform-client.js';
import { GatewaySimulator } from '../../harness/gateway.js';
import { BlockedError } from '../../harness/security.js';

async function fakeJobs(t: TestContext, responses: unknown[], status = 200) {
  let calls = 0;
  const server = createServer((_request, response) => {
    const value = responses[Math.min(calls++, responses.length - 1)];
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  t.after(async () => {
    const closed = once(server, 'close');
    server.closeAllConnections();
    server.close();
    await closed;
  });
  return { client: new PlatformClient(`http://127.0.0.1:${address.port}`), calls: () => calls };
}

test('failed jobs with explicit ongoing processing are not mistaken for settled work', async (t) => {
  const errors = [{ step: 'leave:admin', code: 'INTERNAL_ERROR' }];
  const { client, calls } = await fakeJobs(t, [
    { status: 'running', errors: [], processing: true },
    { status: 'failed', errors, processing: true },
    { status: 'failed', errors, processing: false },
  ]);
  const result = await client.waitJob('job', { timeoutMs: 500, intervalMs: 1 });
  assert.equal(calls(), 3);
  assert.equal(result.status, 'failed');
  assert.equal(result.processing, false);
  assert.deepEqual(result.errors, errors);
});

test('optional processing does not become a required original-contract response field', async (t) => {
  for (const status of ['finished', 'failed']) {
    const value = {
      status,
      errors: status === 'failed' ? [{ step: 'promote', code: 'NO_PERMISSION' }] : [],
    };
    const { client, calls } = await fakeJobs(t, [value]);
    assert.deepEqual(await client.waitJob('job', { timeoutMs: 50 }), value);
    assert.equal(calls(), 1);
  }
});

test('finite job observation exhaustion is BLOCKED while public status and HTTP violations fail immediately', async (t) => {
  const active = await fakeJobs(t, [
    {
      status: 'failed',
      errors: [{ step: 'leave:admin', code: 'INTERNAL_ERROR' }],
      processing: true,
    },
  ]);
  await assert.rejects(
    active.client.waitJob('job', { timeoutMs: 10, intervalMs: 1 }),
    BlockedError,
  );
  const wrong = await fakeJobs(t, [
    { status: 'running', errors: [{ step: 'leave:admin', code: 'INTERNAL_ERROR' }] },
    { status: 'finished', errors: [] },
  ]);
  await assert.rejects(wrong.client.waitJob('job', { timeoutMs: 50 }), /requires failed status/);
  assert.equal(wrong.calls(), 1);
  const unavailable = await fakeJobs(t, [{ error: { code: 'INTERNAL_ERROR' } }], 500);
  await assert.rejects(unavailable.client.waitJob('job', { timeoutMs: 50 }), /Expected HTTP/);
  assert.equal(unavailable.calls(), 1);
});

test('already-member fixture establishes historical announcement without delivering it to the product', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner', 'member'] }).start();
  t.after(() => gateway.close());
  const post = async (path: string, body: unknown) => {
    const response = await fetch(gateway.url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  await post('/accounts/owner/connect', {});
  await post('/accounts/member/connect', {});
  const created = await post('/groups', { creatorAccountId: 'owner' });
  const path = `/groups/${created.body.groupId}`;
  gateway.configure({ sseUnavailable: true });
  gateway.disconnectStreams();
  assert.equal(gateway.snapshot().connectedStreams, 0);
  assert.equal((await fetch(gateway.url + '/events?since=0')).status, 503);
  // Reproduce the old invalid premise: membership existed but was not announced.
  gateway.setMembership(String(created.body.groupId), 'platform-member', true, { storeOnly: true });
  assert.equal(
    (await post(path + '/promote', { byAccountId: 'owner', accountId: 'member' })).body.code,
    'NOT_MEMBER_YET',
  );
  // Actual publication, with zero consumers, establishes the documented historical fact.
  const event = gateway.snapshot().events[0]!;
  gateway.deliver(event.eventId);
  const before = gateway.snapshot().events.length;
  const joined = await post(path + '/join', {
    accountId: 'member',
    inviteLink: 'unused-for-existing-member',
  });
  assert.equal(joined.status, 409);
  assert.equal(joined.body.code, 'ALREADY_MEMBER');
  assert.equal(gateway.snapshot().events.length, before);
  assert.equal(
    (await post(path + '/promote', { byAccountId: 'owner', accountId: 'member' })).status,
    200,
  );
  assert.equal(gateway.snapshot().connectedStreams, 0);
  assert.equal(gateway.snapshot().events[0]!.eventId, event.eventId);
  gateway.configure({ sseUnavailable: false });
});
