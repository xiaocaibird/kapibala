import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Page, Request } from '@playwright/test';
import {
  DirectoryLedger,
  observeDirectory,
  directoryPremise,
  directoryGroupIds,
} from '../ui/directory-observer.js';

function prepared() {
  const ledger = new DirectoryLedger();
  const socket = ledger.open(0);
  ledger.receive(socket, JSON.stringify({ type: 'auth', success: true }), 1);
  ledger.receive(socket, JSON.stringify({ type: 'scope_ready', startSeq: 7 }), 2);
  ledger.reads.push({
    at: 3,
    url: 'http://127.0.0.1:1234/api/group-directory',
    status: 200,
    body: { items: [] },
    endedAt: 4,
  });
  return { ledger, socket };
}

test('real marker event is necessary: auth, scope_ready, or a higher seq do not prove replay', () => {
  const { ledger, socket } = prepared();
  assert.equal(ledger.replayObserved(), false);
  assert.equal(ledger.settled(10_000), false);
  ledger.receive(socket, JSON.stringify({ type: 'group_changed', seq: 8 }), 10);
  assert.equal(ledger.replayObserved(), false);
  assert.equal(ledger.settled(10_000), false);
});

test('strictly increasing gaps are legitimate; quiet period starts at the last related event', () => {
  const { ledger, socket } = prepared();
  ledger.receive(socket, JSON.stringify({ type: 'group_changed', seq: 7 }), 10);
  ledger.receive(socket, JSON.stringify({ type: 'group_changed', seq: 9 }), 20);
  assert.equal(ledger.replayObserved(), true);
  assert.equal(ledger.settled(5019), false);
  assert.equal(ledger.settled(5020), true);
  assert.deepEqual(ledger.sockets[0]!.sequences, [7, 9]);
});

test('regression and duplicate seq are recorded in callbacks and FAIL on the assertion path', () => {
  for (const next of [7, 8]) {
    const { ledger, socket } = prepared();
    ledger.receive(socket, '{"type":"message","seq":8}', 10);
    assert.doesNotThrow(() =>
      ledger.receive(socket, JSON.stringify({ type: 'message', seq: next }), 20),
    );
    assert.equal(ledger.protocolErrors.length, 1);
    assert.equal(ledger.replayObserved(), false);
    assert.throws(
      () => ledger.settled(10_000),
      (error) =>
        error instanceof Error &&
        /明确协议违约/.test(error.message) &&
        !/BLOCKED/.test(error.message),
    );
  }
  const ledger = new DirectoryLedger();
  const old = ledger.open(0);
  ledger.receive(old, '{"type":"auth","success":true}', 1);
  ledger.receive(old, '{"type":"message","seq":9}', 2);
  ledger.close(old, 3);
  const fresh = ledger.open(4);
  ledger.receive(fresh, '{"type":"auth","success":true}', 5);
  ledger.receive(fresh, '{"type":"scope_ready","startSeq":7}', 6);
  ledger.receive(fresh, '{"type":"message","seq":7}', 7);
  assert.doesNotThrow(() => ledger.assertProtocol());
  assert.equal(ledger.replayObserved(), true); // Sequence order is per connection epoch.
});

test('public directory links preserve ordered group identities and reject missing/foreign links', () => {
  const base = 'http://127.0.0.1:1234/#/groups';
  assert.deepEqual(directoryGroupIds(['/#/groups/group-a', '#/groups/group-b'], base), [
    'group-a',
    'group-b',
  ]);
  assert.deepEqual(directoryGroupIds(['/#/groups/a', '/#/groups/a'], base), ['a', 'a']); // Caller asserts uniqueness.
  for (const href of [null, '', '/#/accounts', 'https://example.com/#/groups/a'])
    assert.throws(() => directoryGroupIds([href], base));
});

test('captured replay may precede marker; malformed/negative/fractional marker cannot unlock', () => {
  const ledger = new DirectoryLedger();
  const socket = ledger.open(0);
  for (const raw of [
    'null',
    '[]',
    '{',
    '{"type":"scope_ready","startSeq":-1}',
    '{"type":"scope_ready","startSeq":1.5}',
  ])
    ledger.receive(socket, raw, 1);
  ledger.receive(socket, '{"type":"auth","success":true}', 2);
  ledger.receive(socket, '{"type":"group_changed","seq":42}', 3);
  assert.equal(ledger.replayObserved(), false);
  ledger.receive(socket, '{"type":"scope_ready","startSeq":42}', 4);
  assert.equal(ledger.replayObserved(), true);
});

test('watermark zero is valid but failed auth, pending/bodyless/failed HTTP never establish setup', () => {
  const ledger = new DirectoryLedger();
  const socket = ledger.open(0);
  ledger.receive(socket, '{"type":"auth","success":false}', 1);
  ledger.receive(socket, '{"type":"scope_ready","startSeq":0}', 2);
  assert.equal(ledger.replayObserved(), false);
  ledger.receive(socket, '{"type":"auth","success":true}', 3);
  assert.equal(ledger.replayObserved(), true);
  assert.equal(ledger.settled(10_000), false);
  const read = {
    at: 4,
    url: 'http://127.0.0.1:1/api/group-directory',
  } as (typeof ledger.reads)[number];
  ledger.reads.push(read);
  assert.equal(ledger.settled(10_000), false);
  Object.assign(read, { endedAt: 5, status: 200 });
  assert.equal(ledger.settled(10_000), false);
  read.body = { items: [] };
  assert.equal(ledger.settled(10_000), true);
  read.error = 'body retrieval failed';
  assert.equal(ledger.settled(10_000), false);
  delete read.error;
  read.status = 503;
  assert.equal(ledger.settled(10_000), false);
});

test('message receipt is observable but relevant events, changed scope and new connection reset setup', () => {
  const { ledger, socket } = prepared();
  ledger.receive(socket, '{"type":"group_changed","seq":7}', 10);
  const version = ledger.boundaryVersion;
  ledger.receive(socket, '{"type":"message","seq":8,"payload":{"msgId":"incoming-1"}}', 5010);
  assert.equal(ledger.boundaryVersion, version);
  assert.equal(ledger.frames.at(-1)!.msgId, 'incoming-1');
  assert.equal(ledger.settled(5010), true);
  ledger.receive(socket, '{"type":"group_changed","seq":9}', 5011);
  assert.equal(ledger.settled(5012), false);
  ledger.receive(socket, '{"type":"scope_ready","startSeq":10}', 5013);
  assert.equal(ledger.replayObserved(), false);
  ledger.receive(socket, '{"type":"group_changed","seq":10}', 5014);
  ledger.open(5015);
  assert.equal(ledger.replayObserved(), false); // More than one active socket is ambiguous.
  ledger.close(socket, 5016);
  assert.equal(ledger.replayObserved(), false); // New epoch has no authentication/marker.
});

class FakeSocket extends EventEmitter {
  url() {
    return 'ws://127.0.0.1:1/ws';
  }
}
const request = (url: string, method = 'GET') =>
  ({
    url: () => url,
    method: () => method,
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  }) as unknown as Request;
const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

test('passive Playwright adapter waits for actual response body; abort remains failure and disposes listeners', async () => {
  const fake = new EventEmitter();
  const observer = observeDirectory(fake as unknown as Page);
  const socket = new FakeSocket();
  fake.emit('websocket', socket);
  socket.emit('framereceived', {
    payload: Buffer.from('{"type":"auth","success":true,"accessToken":"never-copy-me"}'),
  });
  socket.emit('framereceived', { payload: '{"type":"scope_ready","startSeq":0}' });
  const version = observer.ledger.boundaryVersion;
  observer.unchanged(version);
  fake.emit('request', request('http://127.0.0.1:1/api/groups'));
  fake.emit('request', request('http://127.0.0.1:1/api/group-directory', 'POST'));
  assert.equal(observer.ledger.reads.length, 0);
  const req = request('http://127.0.0.1:1/api/group-directory?pageSize=20');
  fake.emit('request', req);
  let release!: (body: unknown) => void;
  const body = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  fake.emit('response', { request: () => req, status: () => 200, json: () => body });
  assert.equal(observer.ledger.reads[0]!.endedAt, undefined);
  assert.equal(observer.ledger.reads[0]!.body, undefined);
  release({ items: [{ id: 'real-response-item' }], nextCursor: null });
  await drain();
  assert.deepEqual(observer.ledger.reads[0]!.body, {
    items: [{ id: 'real-response-item' }],
    nextCursor: null,
  });
  assert.equal(typeof observer.ledger.reads[0]!.endedAt, 'number');
  const aborted = request('http://127.0.0.1:1/api/group-directory?cursor=one');
  fake.emit('request', aborted);
  fake.emit('requestfailed', aborted);
  assert.equal(observer.ledger.reads[1]!.error, 'net::ERR_ABORTED');
  assert.equal(observer.ledger.settled(performance.now() + 10_000), false);
  socket.emit('close');
  assert.throws(() => observer.unchanged(version), /BLOCKED/);
  assert.equal(JSON.stringify(observer.ledger).includes('never-copy-me'), false);
  observer.dispose();
  for (const event of ['websocket', 'request', 'response', 'requestfailed'])
    assert.equal(fake.listenerCount(event), 0);
  assert.equal(socket.listenerCount('framereceived'), 0);
  assert.equal(socket.listenerCount('close'), 0);
});

test('body decode error does not become an unhandled rejection or success; finite premise times out BLOCKED', async () => {
  const fake = new EventEmitter();
  const observer = observeDirectory(fake as unknown as Page);
  const req = request('http://127.0.0.1:1/api/group-directory');
  fake.emit('request', req);
  fake.emit('response', {
    request: () => req,
    status: () => 200,
    json: async () => {
      throw new Error('body unavailable');
    },
  });
  await drain();
  assert.match(observer.ledger.reads[0]!.error!, /body unavailable/);
  assert.equal(observer.ledger.reads[0]!.body, undefined);
  assert.equal(typeof observer.ledger.reads[0]!.endedAt, 'number');
  await assert.rejects(
    directoryPremise(() => false, 'not received', 0),
    /\[BLOCKED\].*not received/,
  );
  observer.dispose();
});
