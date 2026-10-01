// Independent Gateway only; no SUT, database, controller, or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GatewaySimulator } from '../../harness/gateway.js';
import { waitForValue } from '../../harness/http-server.js';

test('creator terminal membership loss does not fabricate group write prohibition', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner'] }).start();
  t.after(() => gateway.close());
  const connected = await fetch(gateway.url + '/accounts/owner/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(connected.status, 200);
  const response = await fetch(gateway.url + '/groups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creatorAccountId: 'owner' }),
  });
  assert.equal(response.status, 200);
  gateway.emitStatus('owner', 'suspended');
  const snapshot = gateway.snapshot();
  assert.equal(snapshot.groups[0]!.writable, true);
  assert.deepEqual(snapshot.groups[0]!.members, []);
  assert.deepEqual(
    snapshot.events.map((event) => event.type),
    ['account_status', 'member_left'],
  );
  assert.equal(
    snapshot.events.some((event) => event.data.code === 'GROUP_WRITE_FORBIDDEN'),
    false,
  );
});

test('real forbidden send preserves client identity and produces no landed message', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner'] }).start();
  t.after(() => gateway.close());
  const post = async (path: string, body: unknown) =>
    fetch(gateway.url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await post('/accounts/owner/connect', {})).status, 200);
  const created = await post('/groups', { creatorAccountId: 'owner' });
  const { groupId } = (await created.json()) as { groupId: string };
  const path = `/groups/${groupId}/send`;
  gateway.enqueue(path, { status: 403, code: 'GROUP_WRITE_FORBIDDEN', effect: 'none' });
  const clientMsgId = randomUUID();
  const response = await post(path, { accountId: 'owner', clientMsgId, text: 'write check' });
  assert.equal(response.status, 403);
  assert.equal(((await response.json()) as { code: string }).code, 'GROUP_WRITE_FORBIDDEN');
  const snapshot = gateway.snapshot();
  const request = snapshot.requests.find((entry) => entry.path === path)!;
  assert.equal((request.body as { clientMsgId: string }).clientMsgId, clientMsgId);
  assert.equal(request.responseStatus, 403);
  assert.ok(request.completedAt);
  assert.equal(snapshot.groups[0]!.writable, false);
  assert.equal(snapshot.accounts[0]!.status, 'available');
  assert.equal(snapshot.accounts[0]!.connected, true);
  assert.equal(snapshot.messages.length, 0);
  assert.equal(
    snapshot.effects.some((effect) => effect.kind === 'send'),
    false,
  );
});

test('accepted send records a genuine failure while SSE is down and replays it without another send', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner'] }).start();
  t.after(() => gateway.close());
  const post = (path: string, body: unknown) =>
    fetch(gateway.url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await post('/accounts/owner/connect', {})).status, 200);
  const created = await post('/groups', { creatorAccountId: 'owner' });
  const { groupId } = (await created.json()) as { groupId: string };
  const before = gateway.snapshot().events.at(-1)?.eventId ?? 0;
  gateway.configure({ sseUnavailable: true });
  gateway.disconnectStreams();
  const unavailable = await fetch(`${gateway.url}/events?since=${before}`);
  assert.equal(unavailable.status, 503);
  await unavailable.text();
  const path = `/groups/${groupId}/send`;
  const clientMsgId = randomUUID();
  gateway.enqueue(path, { failureCode: 'GROUP_WRITE_FORBIDDEN' });
  const response = await post(path, { accountId: 'owner', clientMsgId, text: 'accepted failure' });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
  const event = await waitForValue(
    () =>
      gateway
        .snapshot()
        .events.find(
          (event) => event.type === 'message_failed' && event.data.clientMsgId === clientMsgId,
        ),
    1000,
    'real accepted failure',
  );
  const held = gateway.snapshot();
  assert.equal(held.connectedStreams, 0);
  assert.equal(event.data.code, 'GROUP_WRITE_FORBIDDEN');
  assert.equal(held.groups[0]!.writable, false);
  assert.equal(held.messages.length, 0);
  assert.equal(
    held.effects.some((effect) => effect.kind === 'send'),
    false,
  );
  assert.equal(held.requests.filter((request) => request.path === path).length, 1);
  gateway.configure({ sseUnavailable: false });
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 2000);
  try {
    const resumed = await fetch(`${gateway.url}/events?since=${before}`, { signal: abort.signal });
    assert.equal(resumed.status, 200);
    const reader = resumed.body!.getReader();
    try {
      let wire = '';
      const decoder = new TextDecoder();
      while (!wire.includes(`"clientMsgId":"${clientMsgId}"`)) {
        const { done, value } = await reader.read();
        assert.equal(done, false);
        wire += decoder.decode(value, { stream: true });
      }
      assert.match(wire, /event: message_failed/);
      assert.ok(wire.includes(`id: ${event.eventId}\n`));
      assert.ok(wire.includes('GROUP_WRITE_FORBIDDEN'));
    } finally {
      await reader.cancel();
    }
  } finally {
    clearTimeout(timeout);
    abort.abort();
  }
  const final = gateway.snapshot();
  assert.equal(final.requests.filter((request) => request.path === path).length, 1);
  assert.equal(final.events.filter((item) => item.data.clientMsgId === clientMsgId).length, 1);
  assert.equal(final.messages.length, 0);
  assert.equal(
    final.effects.some((effect) => effect.kind === 'kick'),
    false,
  );
});
