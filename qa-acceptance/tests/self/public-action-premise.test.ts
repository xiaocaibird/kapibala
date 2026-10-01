import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireAvailablePublicAction,
  type PublicActionPremise,
} from '../ui/public-action-premise.js';
import { BlockedError } from '../../harness/security.js';

test('visible disabled confirmation records the unavailable premise and blocks before an action', async () => {
  const samples: PublicActionPremise[] = [];
  let reachedAction = false;
  await assert.rejects(async () => {
    await requireAvailablePublicAction(
      { count: async () => 1, isVisible: async () => true, isEnabled: async () => false },
      '合法独立确认缺失',
      (value) => samples.push(value),
    );
    reachedAction = true;
  }, BlockedError);
  assert.equal(reachedAction, false);
  assert.deepEqual(samples, [{ count: 1, visible: true, enabled: false }]);
});
test('ambiguous or absent error-region controls block without strict-locator probes', async () => {
  for (const count of [0, 2]) {
    const samples: PublicActionPremise[] = [];
    const impossible = async () => {
      throw new Error('should never inspect ambiguous locator');
    };
    await assert.rejects(
      requireAvailablePublicAction(
        { count: async () => count, isVisible: impossible, isEnabled: impossible },
        '入口未唯一绑定',
        (sample) => samples.push(sample),
      ),
      BlockedError,
    );
    assert.deepEqual(samples, [{ count, visible: null, enabled: null }]);
  }
});
test('admitted public action does not swallow later business failure or unexpected inspection errors', async () => {
  const original = new Error('real business assertion failure');
  await assert.rejects(
    async () => {
      await requireAvailablePublicAction(
        { count: async () => 1, isVisible: async () => true, isEnabled: async () => true },
        '入口',
        () => {},
      );
      throw original;
    },
    (error) => error === original,
  );
  await assert.rejects(
    requireAvailablePublicAction(
      {
        count: async () => {
          throw original;
        },
        isVisible: async () => true,
        isEnabled: async () => true,
      },
      '入口',
      () => {},
    ),
    (error) => error === original,
  );
});
