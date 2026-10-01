import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { ReceiptSocket } from '../../harness/receipt-socket.js';
import { observe } from '../../harness/observation.js';

test('outage recovery uses the actually received cursor and records peer closure and alert reference', async (t) => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const authRequests: Record<string, unknown>[] = [];
  server.on('connection', (socket) =>
    socket.once('message', (raw) => {
      const auth = JSON.parse(raw.toString()) as Record<string, unknown>;
      authRequests.push(auth);
      socket.send(JSON.stringify({ type: 'auth', success: true }));
      if (authRequests.length === 1) {
        socket.send(JSON.stringify({ seq: 41, type: 'message', payload: { msgId: 'anchor' } }));
      } else {
        socket.send(
          JSON.stringify({
            seq: 42,
            type: 'inconsistency',
            payload: { kind: 'event-write', ref: 'gateway-event-9', message: 'write failed' },
          }),
        );
        socket.send(JSON.stringify({ seq: 43, type: 'message', payload: { msgId: 'recovered' } }));
      }
    }),
  );
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const original = new ReceiptSocket(baseUrl);
  t.after(() => original.close());
  await original.authenticate('SELFTEST');
  const observed = await observe({
    read: async () => original.lastReceivedSeq,
    invariant: () => original.assertHealthy(),
    complete: (seq) => seq === 41,
    durationMs: 1000,
  });
  assert.equal(observed.complete, true);
  for (const socket of server.clients) socket.close(1011, 'simulated database failure');
  const closed = await observe({
    read: async () => original.closed,
    invariant: () => original.assertValidFrames(),
    complete: (value) => value !== undefined,
    durationMs: 1000,
  });
  assert.equal(closed.complete, true);
  assert.equal(original.closed!.code, 1011);
  assert.equal(original.lastReceivedSeq, 41);
  const recovered = new ReceiptSocket(baseUrl);
  t.after(() => recovered.close());
  await recovered.authenticate('SELFTEST', original.lastReceivedSeq);
  const replay = await observe({
    read: async () => recovered.lastReceivedSeq,
    invariant: () => recovered.assertHealthy(),
    complete: (seq) => seq === 43,
    durationMs: 1000,
  });
  assert.equal(replay.complete, true);
  assert.equal(authRequests[0]!.sinceSeq, undefined);
  assert.equal(authRequests[1]!.sinceSeq, 41);
  assert.deepEqual(
    recovered.frames.find((frame) => frame.type === 'inconsistency')!.inconsistency,
    { kind: 'event-write', ref: 'gateway-event-9', message: 'write failed' },
  );
  assert.deepEqual(
    recovered.frames.filter((frame) => frame.seq !== undefined).map((frame) => frame.seq),
    [42, 43],
  );
});

test('a malformed received frame remains a failure even when transport closure is tolerated for recovery', async (t) => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  server.on('connection', (socket) =>
    socket.once('message', () => socket.send(JSON.stringify({ type: 'auth', success: true }))),
  );
  const client = new ReceiptSocket(`http://127.0.0.1:${address.port}`);
  t.after(() => client.close());
  await client.authenticate('SELFTEST');
  for (const socket of server.clients)
    socket.send(JSON.stringify({ type: 'message', payload: { msgId: 'no-seq' } }));
  const closed = await observe({
    read: async () => client.closed,
    invariant: () => {},
    complete: (value) => value !== undefined,
    durationMs: 1000,
  });
  assert.equal(closed.complete, true);
  assert.throws(() => client.assertValidFrames(), /required seq/);
  assert.equal(client.lastReceivedSeq, 0);
});
