import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import {
  ReceiptSocket,
  defaultReceiptLimits,
  finalizeReceipts,
  matchesPeerClosePolicy,
  assertReceiptSubset,
  type ReceiptLimits,
} from '../../harness/receipt-socket.js';
import { BlockedError } from '../../harness/security.js';
import { observe } from '../../harness/observation.js';

async function peer(t: TestContext, limits?: ReceiptLimits) {
  // QA-tool-only peer. Never connect to an application, database or external service.
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  let socket: WebSocket | undefined;
  const auth = JSON.stringify({ type: 'auth', success: true });
  server.on('connection', (incoming) => {
    socket = incoming;
    incoming.once('message', () => incoming.send(auth));
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const client = new ReceiptSocket(`http://127.0.0.1:${address.port}`, limits);
  t.after(async () => {
    await client.close();
    for (const connected of server.clients) connected.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await client.authenticate('NOT_A_REAL_TOKEN');
  assert(socket);
  return { client, socket, auth };
}

async function until(complete: () => boolean) {
  assert.equal(
    (
      await observe({
        read: async () => complete(),
        invariant: () => {},
        complete: Boolean,
        durationMs: 1500,
        intervalMs: 5,
      })
    ).complete,
    true,
  );
}

test('real receipt metadata counts UTF-8 application bytes and records pause/resume without credentials', async (t) => {
  const { client, socket, auth } = await peer(t);
  const peerTcp = (socket as unknown as { _socket: Socket })._socket;
  assert.deepEqual(
    client.connection,
    {
      localAddress: peerTcp.remoteAddress,
      localPort: peerTcp.remotePort,
      remoteAddress: peerTcp.localAddress,
      remotePort: peerTcp.localPort,
    },
    'Observed QA and real peer TCP endpoints must be reciprocal',
  );
  assert.deepEqual(client.transport[0]!.detail, { connection: client.connection });
  const content = JSON.stringify({
    type: 'message',
    seq: 11,
    payload: { msgId: 'one', text: '中文😀' },
  });
  const before = performance.now();
  socket.send(content);
  await until(() => client.lastReceivedSeq === 11);
  const frame = client.frames.at(-1)!;
  assert.equal(frame.payloadBytes, Buffer.byteLength(content));
  assert.notEqual(
    frame.payloadBytes,
    content.length,
    'UTF-16 character count must not stand in for network payload bytes',
  );
  assert.ok(
    frame.receivedMonotonicMs! >= before && frame.receivedMonotonicMs! <= performance.now(),
  );
  assert.ok(Number.isFinite(Date.parse(frame.receivedAt!)));
  assert.equal(client.totals.payloadBytes, Buffer.byteLength(auth) + Buffer.byteLength(content));
  assert.equal(client.totals.largestPayloadBytes, Buffer.byteLength(content));
  const firstBytes = client.totals.payloadBytes;
  assert.equal(client.pause(), 11);
  const pausedCount = client.frames.length;
  const later = JSON.stringify({ type: 'message', seq: 12, payload: { msgId: 'two' } });
  socket.send(later);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(client.totals.payloadBytes, firstBytes);
  client.assertPausedWindow(11, pausedCount);
  client.resume();
  await until(() => client.lastReceivedSeq === 12);
  assert.equal(client.totals.payloadBytes, firstBytes + Buffer.byteLength(later));
  assert.throws(() => client.assertPausedWindow(11, pausedCount), BlockedError);
  assert.deepEqual(
    client.transport.map((entry) => entry.kind),
    ['open', 'auth-sent', 'pause', 'resume'],
  );
  assert.equal(client.transport.find((entry) => entry.kind === 'pause')!.lastReceivedSeq, 11);
  assert.ok(
    client.transport.every(
      (entry, index, list) => index === 0 || entry.monotonicMs >= list[index - 1]!.monotonicMs,
    ),
  );
  const serialized = JSON.stringify(client.snapshot());
  assert.ok(!serialized.includes('NOT_A_REAL_TOKEN'));
  assert.ok(!serialized.includes('中文😀'), 'Message content remains hashed');
});

test('a real paused reader preserves and accepts automatic buffered-frame drain when the peer transport closes', async (t) => {
  const http = createServer();
  const server = new WebSocketServer({ noServer: true });
  let peerSocket: WebSocket | undefined;
  let peerTcp: Socket | undefined;
  http.on('upgrade', (request, socket, head) => {
    assert(socket instanceof Socket);
    peerTcp = socket;
    server.handleUpgrade(request, socket, head, (ws) => {
      peerSocket = ws;
      ws.once('message', () => ws.send(JSON.stringify({ type: 'auth', success: true })));
    });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  assert(address && typeof address !== 'string');
  const client = new ReceiptSocket(`http://127.0.0.1:${address.port}`);
  t.after(async () => {
    await client.close();
    peerSocket?.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  await client.authenticate('SELF_TEST_ONLY');
  assert(peerSocket && peerTcp);
  const checkpoint = client.pause();
  const initialFrames = client.frames.length;
  await new Promise<void>((resolve, reject) =>
    peerSocket!.send(
      JSON.stringify({ type: 'message', seq: 19, payload: { msgId: 'drained-on-close' } }),
      (error) => (error ? reject(error) : resolve()),
    ),
  );
  // Only this QA-owned transport is reset. Let loopback bytes buffer while the
  // application reader stays paused, then exercise ws's real socketOnClose path.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  assert.equal(client.lastReceivedSeq, checkpoint);
  peerTcp.resetAndDestroy();
  await until(() => !!client.closed);
  assert.equal(
    client.lastReceivedSeq,
    19,
    'Automatic drain must advance the actual receipt cursor',
  );
  assert.equal(client.frames.at(-1)!.readyStateAtReceipt, 'closing');
  assert.equal(client.frames.at(-1)!.readerPaused, true);
  assert.equal(client.closed!.source, 'transport-ended');
  assert.doesNotThrow(() => client.assertPausedWindow(checkpoint, initialFrames));
  assert.equal(client.transport.filter((event) => event.kind === 'resume').length, 0);
  assert.equal(matchesPeerClosePolicy(client, null), false);
});

test('peer close is observable but only an explicit published signature can identify its policy', async (t) => {
  const { client, socket } = await peer(t);
  const checkpoint = client.pause();
  const initialFrames = client.frames.length;
  socket.send(JSON.stringify({ type: 'message', seq: 7, payload: { msgId: 'before-close' } }));
  socket.close(1013, 'self-test slow-reader fixture');
  await new Promise<void>((resolve) => setImmediate(resolve));
  client.assertPausedWindow(checkpoint, initialFrames);
  client.resume();
  await until(() => !!client.closed);
  assert.equal(client.lastReceivedSeq, 7);
  assert.equal(client.closed!.source, 'peer-close-frame');
  assert.equal(client.closed!.reason, 'self-test slow-reader fixture');
  assert.ok(!client.transport.some((entry) => entry.kind === 'local-terminate'));
  assert.equal(matchesPeerClosePolicy(client, null), false);
  const policy = {
    contractReference: 'SELF_TEST_ONLY',
    code: 1013,
    reason: 'self-test slow-reader fixture',
  };
  assert.equal(matchesPeerClosePolicy(client, policy), true);
  assert.equal(matchesPeerClosePolicy(client, { ...policy, reason: 'unrelated close' }), false);
  assert.equal(matchesPeerClosePolicy(client, { ...policy, contractReference: '' }), false);
  await client.close();
  assert.equal(
    client.closed!.source,
    'peer-close-frame',
    'Cleanup must not rewrite a previously observed peer close',
  );
});

test('abrupt peer disconnect and QA cleanup have distinct provenance and never match a policy', async (t) => {
  const abrupt = await peer(t);
  abrupt.socket.terminate();
  await until(() => !!abrupt.client.closed);
  assert.equal(abrupt.client.closed!.code, 1006);
  assert.equal(abrupt.client.closed!.source, 'transport-ended');
  assert.equal(
    matchesPeerClosePolicy(abrupt.client, {
      contractReference: 'SELF_TEST_ONLY',
      code: 1006,
      reason: 'unknown',
    }),
    false,
  );
  const owned = await peer(t);
  await owned.client.close();
  assert.equal(owned.client.closed!.source, 'local-termination');
  assert.equal(owned.client.closed!.localTermination, 'cleanup');
  assert.deepEqual(
    owned.client.transport.slice(-2).map((event) => event.kind),
    ['local-terminate', 'close'],
  );
});

test('QA frame-count exhaustion stays BLOCKED and cannot masquerade as peer closure', async (t) => {
  const { client, socket } = await peer(t, { ...defaultReceiptLimits, maxFrames: 1 });
  socket.send(JSON.stringify({ type: 'message', seq: 1, payload: { msgId: 'overflow' } }));
  await until(() => !!client.closed);
  assert.throws(() => client.assertNoErrors(), BlockedError);
  assert.equal(client.closed!.source, 'local-termination');
  assert.equal(client.closed!.localTermination, 'qa-resource-limit');
  assert.equal(client.frames.length, 1);
  assert.equal(
    client.totals.messages,
    2,
    'Observed payload totals still include the rejected complete message',
  );
});

test('observed malformed protocol wins over coincident QA ledger exhaustion', async (t) => {
  const { client, socket } = await peer(t, { ...defaultReceiptLimits, maxFrames: 1 });
  socket.send(JSON.stringify({ type: 'message', payload: { msgId: 'missing-seq' } }));
  await until(() => !!client.closed);
  assert.throws(
    () => client.assertNoErrors(),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof BlockedError) &&
      /required seq/.test(error.message),
  );
  assert.equal(client.closed!.localTermination, 'protocol-rejection');
});

test('invalid UTF-8 rejected by the real WS receiver is a protocol failure, not an unknown disconnect', async (t) => {
  const { client, socket } = await peer(t);
  socket.send(Buffer.from([0xff]), { binary: false });
  await until(() => !!client.closed);
  assert.throws(
    () => client.assertValidFrames(),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof BlockedError) &&
      /WS_ERR_INVALID_UTF8/.test(error.message),
  );
  assert.equal(client.closed!.localTermination, 'protocol-rejection');
});

test('the single parsed over-budget frame remains available to reject a duplicate before BLOCKED', async (t) => {
  const { client, socket } = await peer(t, { ...defaultReceiptLimits, maxFrames: 2 });
  socket.send(JSON.stringify({ type: 'message', seq: 1, payload: { msgId: 'same' } }));
  await until(() => client.lastReceivedSeq === 1);
  socket.send(JSON.stringify({ type: 'message', seq: 2, payload: { msgId: 'same' } }));
  await until(() => !!client.closed);
  assert.throws(() => assertReceiptSubset(client.observedFrames, new Set(['same'])), /duplicate/);
  assert.throws(() => client.assertNoErrors(), BlockedError);
  assert.equal(client.frames.length, 2);
  assert.equal(client.observedFrames.length, 3);
});

test('total application-byte and receiver single-message limits are explicit QA blocks', async (t) => {
  const total = await peer(t, { maxFrames: 10, maxPayloadBytes: 256, maxFramePayloadBytes: 256 });
  for (let seq = 1; seq <= 2; seq++)
    total.socket.send(
      JSON.stringify({ type: 'message', seq, payload: { msgId: `${seq}`, text: 'x'.repeat(130) } }),
    );
  await until(() => !!total.client.closed);
  assert.throws(() => total.client.assertValidFrames(), BlockedError);
  assert.ok(total.client.totals.payloadBytes > 256);
  assert.equal(total.client.closed!.localTermination, 'qa-resource-limit');
  const single = await peer(t, { maxFrames: 10, maxPayloadBytes: 512, maxFramePayloadBytes: 128 });
  single.socket.send(
    JSON.stringify({ type: 'message', seq: 1, payload: { msgId: 'large', text: 'x'.repeat(300) } }),
  );
  await until(() => !!single.client.closed);
  assert.throws(() => single.client.assertNoErrors(), BlockedError);
  assert.equal(single.client.protocolErrors.length, 0);
  assert.ok(single.client.transport.some((event) => event.kind === 'error'));
  assert.equal(single.client.closed!.source, 'local-termination');
});

test('post-cleanup observation runs after all owners even if pre-evidence and one cleanup fail', async () => {
  const calls: string[] = [];
  const errors = await finalizeReceipts(
    async () => {
      calls.push('before');
      throw new Error('evidence failed');
    },
    [
      {
        close: async () => {
          calls.push('owner1');
          throw new Error('cleanup failed');
        },
      },
      {
        close: async () => {
          calls.push('owner2');
        },
      },
    ],
    true,
    async () => {
      calls.push('after');
    },
  );
  assert.deepEqual(calls, ['before', 'owner1', 'owner2', 'after']);
  assert.equal(errors.length, 2);
});
