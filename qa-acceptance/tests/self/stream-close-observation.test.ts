import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  attributeStreamClose,
  reviewStreamCloseLog,
  type StreamLogPolicy,
} from '../../harness/stream-close-observation.js';
import type { ReceiptSocket } from '../../harness/receipt-socket.js';

const policy: StreamLogPolicy = {
  contractReference: 'SELF_TEST_ONLY',
  limits: { maxBufferedBytes: 1048576, sendTimeoutMs: 5000, closeGraceMs: 1000 },
  maxLogBytes: 65536,
  observationMs: 100,
};
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 1) + seconds * 1000).toISOString();
function fixture() {
  const client: ReturnType<ReceiptSocket['snapshot']> = {
    connection: {
      localAddress: '127.0.0.1',
      localPort: 54321,
      remoteAddress: '127.0.0.1',
      remotePort: 32123,
    },
    frames: [],
    overBudgetFrame: undefined,
    totals: { messages: 1, payloadBytes: 32, largestPayloadBytes: 32 },
    limits: { maxFrames: 10, maxPayloadBytes: 1024, maxFramePayloadBytes: 1024 },
    errors: [],
    protocolErrors: [],
    resourceErrors: [],
    lastReceivedSeq: 7,
    paused: false,
    closureCause: 'not inferred',
    closed: { code: 1006, reason: '', at: at(9.1), monotonicMs: 400, source: 'transport-ended' },
    transport: [
      { kind: 'open', at: at(1), monotonicMs: 100 },
      { kind: 'auth-sent', at: at(1.1), monotonicMs: 110, detail: {} },
      { kind: 'pause', at: at(2), monotonicMs: 200 },
      { kind: 'resume', at: at(9), monotonicMs: 300 },
      { kind: 'close', at: at(9.1), monotonicMs: 400 },
    ].map((e) => ({ ...e, lastReceivedSeq: 7, receivedFrames: 1, payloadBytes: 32 })) as ReturnType<
      ReceiptSocket['snapshot']
    >['transport'],
  };
  const base = {
    component: 'realtime-transport',
    connectionId: 'self-only-connection',
    pid: 23456,
    peerAddress: '127.0.0.1',
    peerPort: 54321,
    localAddress: '127.0.0.1',
    localPort: 32123,
    limits: policy.limits,
  };
  const entries: Record<string, unknown>[] = [
    { ...base, kind: 'configured', at: at(0.9), monotonicMs: 10000, readyState: 1 },
    {
      ...base,
      component: 'realtime-auth',
      at: at(1.1),
      monotonicMs: 10100,
      requestedSinceSeq: null,
      replayAfterSeq: 7,
    },
    {
      ...base,
      kind: 'close-requested',
      at: at(7),
      monotonicMs: 15000,
      readyState: 1,
      trigger: 'send-timeout',
      code: 1013,
      reason: 'Slow consumer; reconnect to resume',
      currentSendWaitMs: 4999.77875,
      currentFrameBytes: 283,
      pendingWaiters: 1,
    },
    {
      ...base,
      kind: 'terminate-requested',
      at: at(8),
      monotonicMs: 16000,
      readyState: 2,
      trigger: 'send-timeout',
      code: 1013,
      reason: 'Slow consumer; reconnect to resume',
    },
    {
      ...base,
      kind: 'closed',
      at: at(8.1),
      monotonicMs: 16100,
      readyState: 3,
      trigger: 'send-timeout',
      code: 1006,
      reason: '',
    },
  ];
  return { client, entries };
}
const encode = (entries: Record<string, unknown>[]) =>
  entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

test('exact endpoint and lifecycle chain explains 1006 without relabeling the transport or demanding a physical 5000ms SLA', () => {
  const { client, entries } = fixture();
  const result = attributeStreamClose(encode(entries), client, policy);
  assert.equal(result.verified, true);
  assert.deepEqual(result.identity, { connectionId: 'self-only-connection', pid: 23456 });
  assert.equal(result.entries.length, 5);
  assert.equal(client.closed?.code, 1006);
  assert.equal(client.closed?.source, 'transport-ended');
  assert.ok(Number(entries[2]!.currentSendWaitMs) < policy.limits.sendTimeoutMs);
});

test('actual matching peer close can be correlated without requiring an unused terminate fallback', () => {
  const { client, entries } = fixture();
  entries.splice(3, 1);
  Object.assign(entries.at(-1)!, { code: 1013, reason: 'Slow consumer; reconnect to resume' });
  Object.assign(client.closed!, {
    code: 1013,
    reason: 'Slow consumer; reconnect to resume',
    source: 'peer-close-frame',
  });
  assert.equal(attributeStreamClose(encode(entries), client, policy).verified, true);
});

test('buffer watermark cause requires an actual exceeding value, not just configured limits', () => {
  const { client, entries } = fixture();
  for (const e of entries.slice(2)) e.trigger = 'buffer-high-water';
  entries[2]!.bufferedBytes = policy.limits.maxBufferedBytes + 1;
  assert.equal(attributeStreamClose(encode(entries), client, policy).verified, true);
  entries[2]!.bufferedBytes = policy.limits.maxBufferedBytes;
  assert.equal(attributeStreamClose(encode(entries), client, policy).verified, false);
});

test('missing, wrong, reused, reordered and mismatched connection evidence cannot PASS', () => {
  const mutations: ((f: ReturnType<typeof fixture>) => void)[] = [
    (f) => {
      f.client.connection = null;
    },
    (f) => {
      f.entries.splice(2);
    }, // A configured threshold alone proves nothing.
    (f) => {
      f.entries.splice(3, 1);
    }, // A bare 1006 cannot explain its cause.
    (f) => {
      f.entries.splice(1, 1);
    },
    (f) => {
      f.entries.push({ ...f.entries[0], connectionId: 'reused-port' });
    },
    (f) => {
      f.entries[2]!.peerPort = 54322;
    },
    (f) => {
      f.entries[2]!.pid = 23457;
    },
    (f) => {
      f.entries[2]!.connectionId = 'other-connection';
    },
    (f) => {
      f.entries[2]!.limits = { ...policy.limits, sendTimeoutMs: 1 };
    },
    (f) => {
      f.entries[2]!.monotonicMs = 9999;
    },
    (f) => {
      f.entries[2]!.at = at(10);
    }, // only after resume, outside slow window
    (f) => {
      f.entries[2]!.at = at(1);
    },
    (f) => {
      f.entries[2]!.currentSendWaitMs = 0;
    },
    (f) => {
      f.entries[2]!.pendingWaiters = 0;
    },
    (f) => {
      f.entries[1]!.requestedSinceSeq = 7;
    },
    (f) => {
      delete f.entries[1]!.replayAfterSeq;
    },
    (f) => {
      f.entries[4]!.code = 4401;
    },
    (f) => {
      f.entries[4]!.trigger = 'application';
    },
    (f) => {
      [f.entries[2], f.entries[3]] = [f.entries[3]!, f.entries[2]!];
    },
    (f) => {
      f.entries.splice(3, 0, { ...f.entries[2] });
    },
    (f) => {
      f.client.transport[2]!.at = 'not a date';
    },
    (f) => {
      f.client.transport.push({
        ...f.client.transport[2]!,
        kind: 'local-terminate',
        detail: { reason: 'cleanup' },
      });
    },
    (f) => {
      f.client.closed!.source = 'local-termination';
    },
    (f) => {
      f.client.resourceErrors.push('QA buffer limit');
    },
    (f) => {
      f.client.protocolErrors.push('duplicate/malformed frame');
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const f = fixture();
    mutate(f);
    assert.equal(
      attributeStreamClose(encode(f.entries), f.client, policy).verified,
      false,
      `mutation ${index}`,
    );
  }
});

test('application errors and other documented 1013 reasons are not slow-reader policy hits', () => {
  for (const trigger of ['application', 'send-error', 'pending-overflow']) {
    const { client, entries } = fixture();
    for (const entry of entries.slice(2)) entry.trigger = trigger;
    assert.equal(attributeStreamClose(encode(entries), client, policy).verified, false, trigger);
  }
});

test('unrelated connections and IPv4-mapped spelling are distinguished using the complete tuple', () => {
  const { client, entries } = fixture();
  const other = entries.map((e) => ({ ...e, connectionId: 'healthy', peerPort: 54322 }));
  for (const e of entries) e.peerAddress = '::ffff:127.0.0.1';
  const result = attributeStreamClose(
    'ordinary console line\n' + encode([...other, ...entries]),
    client,
    policy,
  );
  assert.equal(result.verified, true);
  assert.deepEqual(
    result.entries.map((e) => e.line),
    [7, 8, 9, 10, 11],
  );
});

test('bounded read retains exact prefix bytes/hash, never treats a truncated tail or absent file as a completed close', async (t) => {
  const runtime = resolve('.runtime');
  await mkdir(runtime, { recursive: true });
  const dir = await mkdtemp(resolve(runtime, 'stream-log-self-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = resolve(dir, 'server.log');
  const { client, entries } = fixture();
  const whole = encode(entries);
  await writeFile(path, whole.slice(0, -1));
  const incomplete = await reviewStreamCloseLog(path, client, policy);
  assert.equal(incomplete.verified, false);
  assert.ok(incomplete.source!.incompleteTailBytes > 0);
  await appendFile(path, '\n');
  const complete = await reviewStreamCloseLog(path, client, policy);
  assert.equal(complete.verified, true);
  assert.deepEqual(complete.source, {
    path,
    scope: 'captured-prefix',
    bytes: Buffer.byteLength(whole),
    sha256: createHash('sha256').update(whole).digest('hex'),
    incompleteTailBytes: 0,
  });
  assert.equal(
    (await reviewStreamCloseLog(path, client, { ...policy, maxLogBytes: 1 })).verified,
    false,
  );
  assert.equal(
    (await reviewStreamCloseLog(resolve(dir, 'missing.log'), client, policy)).verified,
    false,
  );
  assert.equal(await (await import('node:fs/promises')).readFile(path, 'utf8'), whole);
});
