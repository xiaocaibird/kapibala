import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOriginalTurnTimeout } from '../../harness/backend-provider-regressions.js';
import { BlockedError } from '../../../harness/security.js';

test('turn timeout uses a conservative interval instead of public timestamps as an exact duration', () => {
  assert.deepEqual(assertOriginalTurnTimeout([0, 100], [12000, 12100]), [11900, 12100]);
  assert.throws(() => assertOriginalTurnTimeout([0, 100], [15050, 15100]), BlockedError);
  assert.throws(() => assertOriginalTurnTimeout([0, 100], [10000, 10100]), BlockedError);
});
test('proved early/late turn timeout remains FAIL with no extra tolerance', () => {
  assert.throws(() => assertOriginalTurnTimeout([0, 100], [15101, 15200]), assert.AssertionError);
  assert.throws(() => assertOriginalTurnTimeout([0, 100], [9800, 9900]), assert.AssertionError);
});
