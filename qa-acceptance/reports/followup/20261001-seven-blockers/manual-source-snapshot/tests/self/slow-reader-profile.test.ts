import test from 'node:test';
import assert from 'node:assert/strict';
import { injectBoundedReceiptWorkload } from '../../harness/receipt-socket.js';
import {
  slowReaderProfile,
  validateSlowReaderProfile,
  slowReaderTimeoutMs,
} from '../../config/slow-reader-profile.js';

test('bounded injection finishes a partial final batch without waiting for consumer receipts', async () => {
  let now = 0;
  const injected: number[] = [];
  const samples: number[] = [];
  const result = await injectBoundedReceiptWorkload({
    maxMessages: 5,
    batchSize: 3,
    batchIntervalMs: 2,
    durationMs: 10,
    inject: (i) => injected.push(i),
    invariant: () => samples.push(injected.length),
    now: () => now,
    wait: async (ms) => {
      now += ms;
    },
  });
  assert.deepEqual(injected, [0, 1, 2, 3, 4]);
  assert.equal(result.stop, 'message-limit');
  assert.equal(result.elapsedMs, 2);
  assert.deepEqual(samples, [0, 3, 3, 5, 5]);
});

test('time budget stops new injection but retains every emitted identity for later drain', async () => {
  let now = 0;
  const emitted = new Set<number>();
  const result = await injectBoundedReceiptWorkload({
    maxMessages: 10,
    batchSize: 3,
    batchIntervalMs: 5,
    durationMs: 6,
    inject: (i) => {
      emitted.add(i);
      now += 1;
    },
    invariant: () => {},
    now: () => now,
    wait: async (ms) => {
      now += ms;
    },
  });
  assert.deepEqual([...emitted], [0, 1, 2]);
  assert.equal(result.injected, emitted.size);
  assert.equal(result.stop, 'time-limit');
  assert.equal(result.elapsedMs, 6);
});

test('a violation at the exhausted budget boundary still fails immediately', async () => {
  let now = 0;
  let count = 0;
  await assert.rejects(
    injectBoundedReceiptWorkload({
      maxMessages: 2,
      batchSize: 1,
      batchIntervalMs: 5,
      durationMs: 5,
      inject: () => {
        count++;
      },
      invariant: () => {
        if (now === 5) throw new Error('observed duplicate');
      },
      now: () => now,
      wait: async (ms) => {
        now += ms;
      },
    }),
    /observed duplicate/,
  );
  assert.equal(count, 1);
});

test('authored profile bounds payload, receipts, traversal and every observation phase consistently', () => {
  assert.doesNotThrow(() => validateSlowReaderProfile(slowReaderProfile));
  assert.equal(
    slowReaderProfile.peerClosePolicy,
    null,
    'Do not invent an engineering close signature',
  );
  for (const override of [
    { receipts: { ...slowReaderProfile.receipts, maxFrames: slowReaderProfile.maxMessages } },
    {
      receipts: {
        ...slowReaderProfile.receipts,
        maxFramePayloadBytes: slowReaderProfile.receipts.maxPayloadBytes + 1,
      },
    },
    { maxInjectedTextBytes: 100 },
    { historyMaxPages: 1 },
    { healthyDrainMs: Infinity },
    { peerClosePolicy: { contractReference: '', code: 1013, reason: 'unverified' } },
    { peerClosePolicy: { contractReference: 'SELF_TEST_ONLY', code: 1006, reason: 'unknown' } },
  ])
    assert.throws(() => validateSlowReaderProfile({ ...slowReaderProfile, ...override }));
  assert.equal(slowReaderTimeoutMs, 272000);
});
