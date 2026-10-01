// Independent client/self-oracle tests only. These never import or start the product.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import {
  MESSAGE_PROTOCOL, messageModes, MessageObservation, MessageLease,
  validateMessageSnapshot, readMessageConfig, ownedMessageDatabaseIdentity,
  assertDeadline, assertReceiptSchedule, verifyReceiptClock,
  type MessageMode, type MessageSnapshot, type MessageCorrelation,
} from '../../harness/message-observation.js';
import { BlockedError } from '../../harness/security.js';
import type { CapacityControlTarget } from '../../harness/capacity-control.js';

const target: CapacityControlTarget = {
  apiUrl: 'http://127.0.0.1:39999', revision: 'a'.repeat(40), pid: 12345,
  ownerToken: '11111111-1111-1111-1111-111111111111',
};
const databaseIdentity = 'b'.repeat(64);
const binding = { apiUrl: target.apiUrl, revision: target.revision, pid: target.pid, observedOwnerToken: target.ownerToken };
const correlationFor = (mode: MessageMode): MessageCorrelation => mode === 'timeout-observed-before-local-save'
  ? { clientMsgId: 'client' } : { clientMsgId: 'client', msgId: 'remote', eventId: '701' };
const modeBoundaries = {
  'timeout-observed-before-local-save': '504-recognized-local-result-save-not-started',
  'receipt-before-commit': 'receipt-insert-not-issued',
  'receipt-committed-before-business': 'receipt-autocommit-confirmed-business-not-started',
};
function snapshot(mode: MessageMode, id = 'lease', state: MessageSnapshot['state'] = 'held'): MessageSnapshot {
  const now = new Date().toISOString();
  return {
    protocol: MESSAGE_PROTOCOL, leaseId: id, state, expiresAt: new Date(Date.now() + 30_000).toISOString(),
    binding: { ...binding }, correlation: correlationFor(mode),
    events: state === 'armed' ? [] : [{
      seq: 1, at: now, kind: 'window-held', phase: mode, attemptId: 'actual-attempt', observedAt: now,
      receiptObservedAt: mode === 'receipt-committed-before-business' ? now : null,
      instancePid: target.pid, databaseIdentity, localBoundary: modeBoundaries[mode],
      receiptPresentAtProbe: mode === 'receipt-committed-before-business',
      coverage: { scope: 'bound-instance', allDatabaseWritersProven: false }, ...correlationFor(mode),
    }],
  };
}
const check = (value: unknown, mode: MessageMode) =>
  validateMessageSnapshot(value, target, 'lease', mode, correlationFor(mode), databaseIdentity);
function leaseFor(mode: MessageMode, current: () => MessageSnapshot) {
  return new MessageLease('lease', target, mode, correlationFor(mode), databaseIdentity, async () => structuredClone(current()));
}

async function fakeControl(handler: (request: IncomingMessage, body: unknown, response: ServerResponse) => void | Promise<void>) {
  const server = createServer(async (request, response) => {
    try {
      let body = '';
      for await (const chunk of request) body += String(chunk);
      await handler(request, body ? JSON.parse(body) : undefined, response);
    } catch (error) { response.writeHead(500).end(JSON.stringify({ error: String(error) })); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => { const closed = once(server, 'close'); server.closeAllConnections(); server.close(); await closed; },
  };
}
const json = (response: ServerResponse, value: unknown, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
};

test('message client requires a confirmed contract and exact loopback URL', () => {
  assert.throws(() => readMessageConfig({}), BlockedError);
  for (const url of ['http://localhost:1234', 'https://127.0.0.1:1234', 'http://example.org', 'http://127.0.0.1:1234/path'])
    assert.throws(() => readMessageConfig({ adapters: { messageObservation: { url, contractReference: 'fixed handoff' } } }), BlockedError);
  assert.throws(() => readMessageConfig({ adapters: { messageObservation: { url: 'http://127.0.0.1:1234', contractReference: 'REQUIRED' } } }), BlockedError);
  assert.deepEqual(readMessageConfig({ adapters: { messageObservation: { url: 'http://127.0.0.1:1234', contractReference: 'fixed handoff' } } }),
    { url: 'http://127.0.0.1:1234', contractReference: 'fixed handoff' });
});

test('snapshot binds independent instance/database/message identity and exact real phase', () => {
  for (const mode of messageModes) {
    const good = snapshot(mode);
    assert.equal(check(good, mode), good);
    const invalid = [
      { ...good, binding: { ...binding, pid: target.pid + 1 } },
      { ...good, binding: { ...binding, revision: 'c'.repeat(40) } },
      { ...good, binding: { ...binding, observedOwnerToken: 'foreign' } },
      { ...good, correlation: { ...good.correlation, clientMsgId: 'other' } },
      { ...good, events: [] },
      ...[
        { instancePid: target.pid + 1 }, { databaseIdentity: 'd'.repeat(64) },
        { phase: 'some-other-stage' }, { localBoundary: 'SQL-issued-outcome-unknown' },
        { attemptId: 'lease' }, { clientMsgId: 'other' }, { seq: 0 },
        { observedAt: 'invalid' }, { coverage: { scope: 'global', allDatabaseWritersProven: true } },
      ].map((patch) => ({ ...good, events: [{ ...good.events[0], ...patch }] })),
    ];
    for (const value of invalid) assert.throws(() => check(value, mode), BlockedError);
  }
});

test('receipt proof distinguishes INSERT not issued, confirmed commit, and an unavailable old receipt', () => {
  const before = snapshot('receipt-before-commit');
  assert.throws(() => check({ ...before, events: [{ ...before.events[0], receiptPresentAtProbe: true }] }, 'receipt-before-commit'), BlockedError);
  const committed = snapshot('receipt-committed-before-business');
  for (const patch of [{ receiptPresentAtProbe: false }, { receiptObservedAt: null }])
    assert.throws(() => check({ ...committed, events: [{ ...committed.events[0], ...patch }] }, 'receipt-committed-before-business'), BlockedError);
  const timeout = snapshot('timeout-observed-before-local-save');
  assert.throws(() => check({ ...timeout, events: [{ ...timeout.events[0], msgId: 'injected' }] }, 'timeout-observed-before-local-save'), BlockedError);
  const unavailable = { ...before, state: 'released', events: [{ ...before.events[0], kind: 'window-unavailable', receiptPresentAtProbe: true }] };
  assert.equal(check(unavailable, 'receipt-before-commit').state, 'released');
});

test('lease rejects history mutation, lease extension and released/held state rollback', () => {
  const mode = 'receipt-committed-before-business';
  const good = snapshot(mode);
  const lease = leaseFor(mode, () => good);
  lease.accept(good);
  for (const value of [
    { ...good, events: [] },
    { ...good, expiresAt: new Date(Date.parse(good.expiresAt) + 1).toISOString() },
    { ...good, state: 'armed' },
    { ...good, events: [{ ...good.events[0], attemptId: 'changed' }] },
  ]) assert.throws(() => lease.accept(value), BlockedError);
  lease.accept({ ...good, state: 'released' });
  assert.throws(() => lease.accept(good), BlockedError);
});

test('unavailable, expired and unreached windows are BLOCKED and armed advance is forbidden', async () => {
  const mode = 'receipt-before-commit';
  const held = snapshot(mode);
  for (const value of [
    { ...held, expiresAt: new Date(Date.now() - 1).toISOString() },
    { ...held, state: 'released' as const },
    { ...held, state: 'released' as const, events: [{ ...held.events[0]!, kind: 'window-unavailable' as const, receiptPresentAtProbe: true }] },
    snapshot(mode, 'lease', 'armed'),
  ]) await assert.rejects(leaseFor(mode, () => value).waitHeld(1), BlockedError);
  const armed = snapshot(mode, 'lease', 'armed');
  const lease = leaseFor(mode, () => armed);
  lease.accept(armed);
  await assert.rejects(lease.advance(), BlockedError);
});

test('fake protocol lifecycle sends strict correlation, bodyless advance/delete and never the owner token', async () => {
  for (const mode of messageModes) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    let current: MessageSnapshot | undefined;
    const evidence: string[] = [];
    const fake = await fakeControl((request, body, response) => {
      calls.push({ method: request.method!, path: request.url!, body });
      assert(!request.url!.includes(target.ownerToken));
      assert(!JSON.stringify(body ?? '').includes(target.ownerToken));
      if (request.url!.includes('/capabilities?')) return json(response, { protocol: MESSAGE_PROTOCOL, binding, capabilities: messageModes });
      const match = /^\/qa\/message\/v1\/leases\/([a-f0-9-]+)(\/advance)?$/.exec(request.url!);
      assert(match);
      if (request.method === 'PUT') {
        assert.deepEqual(body, { protocol: MESSAGE_PROTOCOL, target: { apiUrl: target.apiUrl, revision: target.revision, pid: target.pid }, mode, correlation: correlationFor(mode), ttlMs: 90_000 });
        current = snapshot(mode, match[1], 'armed');
        return json(response, current);
      }
      assert.equal(body, undefined);
      assert.equal(request.headers['content-type'], undefined);
      assert.equal(match[1], current!.leaseId);
      if (request.method === 'GET' && current!.state === 'armed')
        current = { ...snapshot(mode, current!.leaseId), expiresAt: current!.expiresAt };
      if (request.method === 'POST') { assert.equal(match[2], '/advance'); assert.equal(current!.state, 'held'); current!.state = 'released'; }
      if (request.method === 'DELETE') current!.state = 'released';
      json(response, current);
    });
    try {
      const control = new MessageObservation({ url: fake.url, contractReference: 'SELFTEST' }, target, databaseIdentity,
        async (_name, value) => { evidence.push(JSON.stringify(value)); });
      await assert.rejects(control.arm(mode, correlationFor(mode)), BlockedError);
      await control.verify(mode);
      await assert.rejects(control.arm(mode, { clientMsgId: '' }), BlockedError);
      await assert.rejects(control.arm(mode, correlationFor(mode), 1), BlockedError);
      const lease = await control.arm(mode, correlationFor(mode));
      await lease.waitHeld();
      await lease.advance();
      await control.close();
      assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
      assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
      assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
      assert(evidence.every((value) => !value.includes(target.ownerToken)));
    } finally { await fake.close(); }
  }
});

test('wrong ownership or missing capabilities prevent mutating calls', async () => {
  for (const caps of [
    { protocol: MESSAGE_PROTOCOL, binding: { ...binding, observedOwnerToken: 'foreign' }, capabilities: messageModes },
    { protocol: MESSAGE_PROTOCOL, binding, capabilities: [] },
  ]) {
    const calls: string[] = [];
    const fake = await fakeControl((request, _body, response) => { calls.push(request.method!); json(response, caps); });
    try {
      const control = new MessageObservation({ url: fake.url, contractReference: 'SELFTEST' }, target, databaseIdentity);
      await assert.rejects(control.verify('receipt-before-commit'), BlockedError);
      await assert.rejects(control.arm('receipt-before-commit', correlationFor('receipt-before-commit')), BlockedError);
      await control.close();
      assert.deepEqual(calls, ['GET']);
    } finally { await fake.close(); }
  }
});

test('unknown create response still releases only its known local lease UUID', async () => {
  let current: MessageSnapshot | undefined;
  const deletes: string[] = [];
  const fake = await fakeControl((request, _body, response) => {
    if (request.url!.includes('/capabilities?')) return json(response, { protocol: MESSAGE_PROTOCOL, binding, capabilities: messageModes });
    const id = request.url!.split('/').at(-1)!;
    if (request.method === 'PUT') {
      current = snapshot('receipt-before-commit', id, 'armed');
      return json(response, { error: 'response unavailable after creation' }, 503);
    }
    assert.equal(request.method, 'DELETE');
    deletes.push(id);
    json(response, { ...current, state: 'released' });
  });
  try {
    const control = new MessageObservation({ url: fake.url, contractReference: 'SELFTEST' }, target, databaseIdentity);
    await control.verify('receipt-before-commit');
    await assert.rejects(control.arm('receipt-before-commit', correlationFor('receipt-before-commit')), BlockedError);
    await control.close();
    assert.deepEqual(deletes, [current!.leaseId]);
  } finally { await fake.close(); }
});

test('independent timing distinguishes proven violation, overlap and fully contained completion without tolerance', () => {
  assert.doesNotThrow(() => assertDeadline([100, 200], [300, 400], [4900, 5000], 5000));
  assert.throws(() => assertDeadline([100, 200], [5201, 5300], undefined, 5000), assert.AssertionError);
  assert.throws(() => assertDeadline([100, 200], [5100, 5200], [5190, 5290], 5000), BlockedError);
  assert.throws(() => assertDeadline([100, 200], undefined, undefined, 5000), BlockedError);
  assert.doesNotThrow(() => assertReceiptSchedule([100, 200], new Date(5120).toISOString(), 5000));
  assert.throws(() => assertReceiptSchedule([100, 200], new Date(5300).toISOString(), 5000), assert.AssertionError);
  assert.throws(() => assertReceiptSchedule([100, 200], new Date(5200).toISOString(), 5000), BlockedError);
  const event = snapshot('receipt-before-commit').events[0]!;
  event.observedAt = new Date(150).toISOString();
  assert.doesNotThrow(() => verifyReceiptClock(event, [100, 200]));
  assert.throws(() => verifyReceiptClock(event, [300, 400]), BlockedError);
});

test('database fingerprint refuses unowned resources before obtaining any connection string', async () => {
  await assert.rejects(ownedMessageDatabaseIdentity({ ownedStorage: () => ({ database: 'foreign', cluster: {
    ownsDatabase: () => false, url: () => { assert.fail('must never connect'); },
  } }) }), BlockedError);
});
