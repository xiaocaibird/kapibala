import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import {
  ReceiptSocket,
  assertReceiptSubset,
  assertCompleteReceipts,
  finalizeReceipts,
} from '../../harness/receipt-socket.js';
import { observe } from '../../harness/observation.js';

test('receipt cursor records complete received frames; real reader pauses and resumes', async (t) => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected address');
  server.on('connection', (ws) =>
    ws.on('message', () => {
      ws.send(JSON.stringify({ type: 'auth', success: true }));
      ws.send(
        JSON.stringify({
          seq: 9,
          type: 'message',
          payload: { msgId: 'before-pause', text: 'private sample' },
        }),
      );
    }),
  );
  const client = new ReceiptSocket(`http://127.0.0.1:${address.port}`);
  t.after(() => client.close());
  await client.authenticate('QA_SELFTEST_ONLY');
  assert.equal(
    (
      await observe({
        read: async () => client.lastReceivedSeq,
        invariant: () => client.assertHealthy(),
        complete: (v) => v === 9,
        durationMs: 1000,
      })
    ).complete,
    true,
  );
  assert.equal(client.pause(), 9);
  assert.equal(client.paused, true);
  for (const ws of server.clients) {
    ws.send(JSON.stringify({ type: 'control', success: true }));
    ws.send(
      JSON.stringify({
        seq: 10,
        type: 'message',
        payload: { msgId: 'after-pause', text: 'later' },
      }),
    );
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(client.lastReceivedSeq, 9);
  client.resume();
  assert.equal(
    (
      await observe({
        read: async () => client.lastReceivedSeq,
        invariant: () => client.assertHealthy(),
        complete: (v) => v === 10,
        durationMs: 1000,
      })
    ).complete,
    true,
  );
  assert.deepEqual(
    client.frames.filter((f) => f.seq).map((f) => f.msgId),
    ['before-pause', 'after-pause'],
  );
  assert.ok(!JSON.stringify(client.frames).includes('private sample'));
});

test('receipt client rejects non-loopback destinations before opening a connection', () => {
  for (const url of [
    'https://example.com',
    'http://localhost:1234',
    'http://127.0.0.1',
    'http://user:secret@127.0.0.1:1234',
  ])
    assert.throws(() => new ReceiptSocket(url), /explicit QA loopback/);
});

test('receipt invariants accept identity-only frames and immediately reject received violations', () => {
  const expected = new Set(['one', 'two', 'three']);
  const one = { type: 'message', seq: 1, msgId: 'one' };
  const two = { type: 'message', seq: 2, msgId: 'two' };
  assert.deepEqual(assertReceiptSubset([one], expected), [one]);
  assert.throws(() => assertReceiptSubset([one, { ...two, msgId: 'one' }], expected), /duplicate/);
  assert.throws(() => assertReceiptSubset([two, one], expected), /strictly increasing/);
  assert.throws(
    () => assertReceiptSubset([{ type: 'message', msgId: 'one' }], expected),
    /required seq/,
  );
  assert.throws(() => assertReceiptSubset([{ ...one, msgId: 'foreign' }], expected), /unexpected/);
  // A max cursor of 2 and replay of 3 must not hide missing earlier identity 1.
  assert.throws(
    () => assertCompleteReceipts([two, { type: 'message', seq: 3, msgId: 'three' }], expected),
    /missing/,
  );
  assert.doesNotThrow(() =>
    assertCompleteReceipts([one, two, { type: 'message', seq: 3, msgId: 'three' }], expected),
  );
});

test('receipt finalization closes every owner even when evidence and another close fail', async () => {
  const calls: string[] = [];
  const evidence = async () => {
    calls.push('evidence');
    throw new Error('evidence-failed');
  };
  const clients = [
    {
      close: async () => {
        calls.push('first');
        throw new Error('close-failed');
      },
    },
    {
      close: async () => {
        calls.push('second');
      },
    },
  ];
  const secondary = await finalizeReceipts(evidence, clients, true);
  assert.equal(secondary.length, 2, 'Secondary failures remain available for evidence recording');
  assert.deepEqual(calls, ['evidence', 'first', 'second']);
  calls.length = 0;
  await assert.rejects(
    finalizeReceipts(evidence, clients, false),
    (error: unknown) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.deepEqual(calls, ['evidence', 'first', 'second']);
});

test('locally rejected malformed frames cannot masquerade as peer slow-reader closure', async (t) => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  server.on('connection', (ws) =>
    ws.on('message', () => ws.send(JSON.stringify({ type: 'auth', success: true }))),
  );
  const client = new ReceiptSocket(`http://127.0.0.1:${address.port}`);
  t.after(() => client.close());
  await client.authenticate('QA_SELFTEST_ONLY');
  for (const ws of server.clients)
    ws.send(JSON.stringify({ type: 'message', payload: { msgId: 'missing-seq' } }));
  const closed = await observe({
    read: async () => client.closed,
    invariant: () => {},
    complete: Boolean,
    durationMs: 1000,
  });
  assert.equal(closed.complete, true);
  assert.throws(() => client.assertNoErrors(), /required seq/);
  assert.equal(client.lastReceivedSeq, 0);
});
