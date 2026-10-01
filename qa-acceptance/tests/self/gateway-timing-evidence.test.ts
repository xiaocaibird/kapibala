import assert from 'node:assert/strict';
import test from 'node:test';
import { GatewaySimulator } from '../../harness/gateway.js';
import { waitForValue } from '../../harness/http-server.js';

// Simulator-only tests. No application, PostgreSQL, product config or browser.
async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test('query evidence preserves a pre-landing 404 snapshot even when the reply follows a real send', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner'] }).start();
  t.after(() => gateway.close());
  await post(`${gateway.url}/accounts/owner/connect`, {});
  const created = await post(`${gateway.url}/groups`, { creatorAccountId: 'owner' });
  const id = String(created.body.groupId);
  const path = `/groups/${id}/messages/by-client-id/timing-selftest`;
  gateway.enqueue(path, { barrier: { phase: 'before-response', name: 'stale-negative' } });
  const beforeRequest = performance.now();
  const pending = fetch(`${gateway.url}${path}`);
  await gateway.barriers.waitFor('stale-negative');
  const before = gateway.snapshot().requests.find((request) => request.path === path)!;
  assert.equal(before.preparedResponseStatus, 404);
  assert.ok(before.responsePreparedAt);
  assert.equal(before.completedAt, undefined);
  assert.equal(before.clockDomain, `qa-process-performance:${process.pid}`);
  assert.ok(before.receivedMonoMs! >= beforeRequest);
  assert.ok(before.responsePreparedMonoMs! >= before.receivedMonoMs!);
  assert.ok(before.responsePreparedMonoMs! <= performance.now());
  assert.equal(before.responseFinishedMonoMs, undefined);
  gateway.enqueue(`/groups/${id}/send`, { effectDelayMs: 0, omitEvent: true });
  assert.equal(
    (
      await post(`${gateway.url}/groups/${id}/send`, {
        accountId: 'owner',
        clientMsgId: 'timing-selftest',
        text: 'one real effect',
      })
    ).status,
    202,
  );
  await waitForValue(() => gateway.snapshot().messages[0], 2_000, 'one real effect');
  gateway.barriers.release('stale-negative');
  assert.equal((await pending).status, 404);
  await waitForValue(
    () =>
      gateway.snapshot().requests.find((request) => request.id === before.id)?.responseFinishedAt,
    2_000,
    'HTTP response finish',
  );
  const completed = gateway.snapshot().requests.find((request) => request.id === before.id)!;
  assert.equal(completed.preparedResponseStatus, 404);
  assert.equal(completed.responseStatus, 404);
  assert.ok(Date.parse(completed.completedAt!) >= Date.parse(before.responsePreparedAt!));
  assert.notEqual(completed.responseClosedBeforeFinish, true);
  assert.ok(completed.responseFinishedMonoMs! >= before.responsePreparedMonoMs!);
  assert.ok(completed.responseFinishedMonoMs! <= performance.now());
  assert.equal((await fetch(`${gateway.url}${path}`)).status, 200);
  assert.equal(gateway.snapshot().messages.length, 1);
});

test('a caller-cancelled query is not recorded as a finished response after its barrier releases', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner'] }).start();
  t.after(() => gateway.close());
  await post(`${gateway.url}/accounts/owner/connect`, {});
  const created = await post(`${gateway.url}/groups`, { creatorAccountId: 'owner' });
  const path = `/groups/${String(created.body.groupId)}/messages/by-client-id/absent`;
  gateway.enqueue(path, { barrier: { phase: 'before-response', name: 'cancelled-query' } });
  const controller = new AbortController();
  const beforeRequest = performance.now();
  const pending = fetch(`${gateway.url}${path}`, { signal: controller.signal });
  const rejected = assert.rejects(pending, /abort/i);
  await gateway.barriers.waitFor('cancelled-query');
  const id = gateway.snapshot().requests.find((request) => request.path === path)!.id;
  const beforeAbort = performance.now();
  controller.abort();
  await rejected;
  await waitForValue(
    () =>
      gateway.snapshot().requests.find((request) => request.id === id)
        ?.responseClosedBeforeFinish === true
        ? true
        : undefined,
    2_000,
    'caller disconnected',
  );
  gateway.barriers.release('cancelled-query');
  await waitForValue(
    () => gateway.snapshot().requests.find((request) => request.id === id)?.completedAt,
    2_000,
    'attempted late reply',
  );
  const evidence = gateway.snapshot().requests.find((request) => request.id === id)!;
  assert.equal(evidence.responseClosedBeforeFinish, true);
  assert.equal(evidence.responseFinishedAt, undefined);
  assert.equal(evidence.responseStatus, 404);
  assert.equal(evidence.clockDomain, `qa-process-performance:${process.pid}`);
  assert.ok(evidence.receivedMonoMs! >= beforeRequest);
  assert.ok(evidence.receivedMonoMs! <= beforeAbort);
  assert.ok(evidence.responseClosedMonoMs! >= beforeAbort);
  assert.ok(evidence.responseClosedMonoMs! <= performance.now());
  assert.equal(evidence.responseFinishedMonoMs, undefined);
});

test('event observation timestamp stays in the QA ledger and is not added to SSE data', async (t) => {
  const gateway = await new GatewaySimulator({ accountIds: ['owner'] }).start();
  t.after(() => gateway.close());
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${gateway.url}/events?since=0`, { signal: controller.signal });
  const event = gateway.emit('message_sent', {
    clientMsgId: 'c1',
    msgId: 'm1',
    sentAt: '2026-01-01T00:00:00.000Z',
  });
  assert.ok(event.recordedAt);
  const reader = response.body!.getReader();
  let wire = '';
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    while (!wire.includes('event: message_sent')) {
      const result = await reader.read();
      assert.equal(result.done, false);
      wire += new TextDecoder().decode(result.value);
    }
    const payload = JSON.parse(
      wire
        .split('\n')
        .find((line) => line.startsWith('data: '))!
        .slice(6),
    );
    assert.equal(payload.clientMsgId, 'c1');
    assert.equal(payload.recordedAt, undefined);
    assert.equal(gateway.snapshot().events[0]!.recordedAt, event.recordedAt);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
});
