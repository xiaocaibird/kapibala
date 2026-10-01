import assert from 'node:assert/strict';
import test from 'node:test';
import { observeBackend } from '../../harness/backend-boundaries.js';
import { BlockedError } from '../../../harness/security.js';

test('real observation does not swallow and retry the first assertion failure', async () => {
  let calls = 0;
  const original = new assert.AssertionError({ message: 'observed real violation' });
  await assert.rejects(observeBackend(async () => { calls++; throw original; }, () => false), error => error === original);
  assert.equal(calls, 1);
});
test('missing causal observation is blocked and cannot be returned as a successful empty result', async () => {
  await assert.rejects(observeBackend(async () => ({ hit: false }), v => v.hit, 1, 'real lock'), BlockedError);
});
test('causal poll returns the observed payload and stops at the first witnessed boundary', async () => {
  let calls = 0;
  const value = await observeBackend(async () => ({ tick: ++calls, witness: calls === 2 ? 'actual-lock' : null }), v => v.witness !== null, 1000);
  assert.equal(calls, 2); assert.deepEqual(value, { tick: 2, witness: 'actual-lock' });
});
