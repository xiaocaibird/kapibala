import test from 'node:test';
import assert from 'node:assert/strict';
import { observe } from '../../harness/observation.js';

test('observation stops on first invariant failure even if a later sample would pass', async () => {
  let reads = 0;
  await assert.rejects(
    observe({
      read: async () => ++reads,
      invariant: (value) => {
        assert.notEqual(value, 2, 'first violation');
      },
      complete: (value) => value === 3,
      durationMs: 100,
      intervalMs: 0,
    }),
    /first violation/,
  );
  assert.equal(reads, 2);
});

test('observation budget exhaustion returns incomplete, not pass or product failure', async () => {
  const result = await observe({
    read: async () => 'unknown',
    invariant: () => {},
    complete: () => false,
    durationMs: 0,
  });
  assert.equal(result.complete, false);
  assert.equal(result.samples, 1);
  assert.equal(result.last, 'unknown');
});

test('complete observations still check the invariant before accepting the terminal sample', async () => {
  await assert.rejects(
    observe({
      read: async () => 'terminal',
      invariant: () => {
        throw new Error('false terminal');
      },
      complete: () => true,
      durationMs: 0,
    }),
    /false terminal/,
  );
  const result = await observe({
    read: async () => 'valid',
    invariant: () => {},
    complete: () => true,
    durationMs: 0,
  });
  assert.equal(result.complete, true);
});
